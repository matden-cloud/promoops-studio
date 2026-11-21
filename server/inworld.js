import { describeWavUpload } from './voice-audio.js';
import { INWORLD_TTS_MODEL, redactSecrets } from './voice-free.js';

export const INWORLD_ORIGIN = 'https://api.inworld.ai';

const MAX_JSON_CHARS = 4_200_000;
const MAX_REFERENCE_BYTES = 1_500_000;
const MAX_SCRIPT_CHARS = 2000;
const MAX_NAME_CHARS = 60;
const VOICE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,160}$/;
const MISSING_KEY_MESSAGE = 'Inworld belum dikonfigurasi. Isi INWORLD_API_KEY.';

class HttpError extends Error {
  constructor(status, message, code, detail) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isConfigured(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function trimDetail(value, apiKey) {
  const redacted = redactSecrets(value, apiKey).replace(/\s+/g, ' ').trim();
  if (!redacted) return '';
  return redacted.length > 500 ? `${redacted.slice(0, 500)}…` : redacted;
}

function authHeaders(apiKey) {
  return { Authorization: `Basic ${apiKey}`, 'Content-Type': 'application/json' };
}

function assertNoKeyInUrl(url, apiKey) {
  if (apiKey && url.includes(apiKey)) throw new HttpError(500, 'Konfigurasi permintaan Inworld tidak aman.', 'inworld_error');
}

async function inworldJson(fetchImpl, url, apiKey, init) {
  assertNoKeyInUrl(url, apiKey);
  const bodyText = typeof init.body === 'string' ? init.body : '';
  if (bodyText.includes('inworld-tts-2"') || bodyText.includes('inworld-tts-1')) {
    throw new HttpError(500, 'Model Inworld yang bukan yang termurah ditolak.', 'paid_model_blocked');
  }
  let upstream;
  try {
    upstream = await fetchImpl(url, { ...init, headers: authHeaders(apiKey) });
  } catch {
    throw new HttpError(502, 'Gagal menghubungi Inworld.', 'inworld_error');
  }
  let result;
  try {
    result = await upstream.json();
  } catch {
    result = null;
  }
  if (Number(upstream.status) === 429) {
    throw new HttpError(429, 'Kuota Inworld sedang penuh. Coba lagi nanti.', 'quota', trimDetail(text(result?.message), apiKey));
  }
  if (!upstream.ok) {
    throw new HttpError(502, 'Inworld menolak permintaan.', 'inworld_error', trimDetail(text(result?.message), apiKey));
  }
  return result || {};
}

function publicVoice(voice) {
  const id = text(voice?.voiceId || voice?.voice_id);
  const source = text(voice?.source).toUpperCase();
  if (!VOICE_ID.test(id) || (source && source !== 'IVC')) return null;
  return {
    id,
    name: text(voice?.displayName || voice?.display_name).slice(0, MAX_NAME_CHARS) || 'Profil Inworld',
    engine: 'inworld',
    kind: 'clone',
    status: 'ready',
  };
}

async function readJson(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_JSON_CHARS) {
    throw new HttpError(413, 'Unggahan terlalu besar. Potong audio lebih pendek.', 'body_too_large');
  }
  let raw;
  try {
    raw = await request.text();
  } catch {
    throw new HttpError(400, 'Body JSON tidak valid.', 'invalid_json');
  }
  if (raw.length > MAX_JSON_CHARS) throw new HttpError(413, 'Unggahan terlalu besar. Potong audio lebih pendek.', 'body_too_large');
  if (!raw.trim()) return {};
  try {
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('shape');
    return payload;
  } catch {
    throw new HttpError(400, 'Body JSON tidak valid.', 'invalid_json');
  }
}

function decodeWav(value) {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, 'Audio referensi kosong.', 'invalid_audio');
  const cleaned = value.trim().replace(/\s/g, '');
  if (cleaned.length > MAX_REFERENCE_BYTES * 2 || !/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned) || cleaned.length % 4 !== 0) {
    throw new HttpError(400, 'Audio referensi bukan WAV yang valid.', 'invalid_audio');
  }
  const bytes = Buffer.from(cleaned, 'base64');
  if (!bytes.length || bytes.length > MAX_REFERENCE_BYTES) throw new HttpError(413, 'Audio referensi terlalu besar.', 'audio_too_large');
  try {
    describeWavUpload(bytes, 'inworld');
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : 'WAV tidak valid.', 'invalid_audio');
  }
  return cleaned;
}

async function listVoices(fetchImpl, apiKey) {
  const url = new URL('/voices/v1/voices', INWORLD_ORIGIN);
  url.searchParams.set('filter', 'source = "IVC"');
  url.searchParams.set('pageSize', '50');
  const result = await inworldJson(fetchImpl, url.toString(), apiKey, { method: 'GET' });
  const rows = Array.isArray(result.voices) ? result.voices : [];
  return rows.map(publicVoice).filter(Boolean);
}

async function cloneVoice(payload, fetchImpl, apiKey) {
  const displayName = text(payload.displayName);
  if (!displayName) throw new HttpError(400, 'Nama profil suara kosong.', 'invalid_name');
  if (displayName.length > MAX_NAME_CHARS) throw new HttpError(400, 'Nama profil suara terlalu panjang.', 'invalid_name');
  const audioData = decodeWav(payload.sourceWav);
  const result = await inworldJson(fetchImpl, `${INWORLD_ORIGIN}/voices/v1/voices:clone`, apiKey, {
    method: 'POST',
    body: JSON.stringify({
      displayName,
      languageCode: 'id-ID',
      voiceSamples: [{ audioData }],
    }),
  });
  const voice = publicVoice(result.voice || result);
  if (!voice && text(result.voiceId)) {
    return json({ voice: { id: text(result.voiceId), name: displayName, engine: 'inworld', kind: 'clone', status: 'ready' } });
  }
  if (!voice) throw new HttpError(502, 'Inworld tidak mengembalikan profil suara.', 'inworld_error');
  return json({ voice });
}

async function speak(payload, fetchImpl, apiKey) {
  const voiceId = text(payload.voiceId);
  if (!VOICE_ID.test(voiceId)) throw new HttpError(400, 'Profil Inworld tidak valid.', 'invalid_voice');
  const script = typeof payload.text === 'string' ? payload.text.trim() : '';
  if (!script) throw new HttpError(400, 'Naskah kosong.', 'empty_script');
  if (script.length > MAX_SCRIPT_CHARS) throw new HttpError(413, 'Naskah terlalu panjang.', 'script_too_long');
  const result = await inworldJson(fetchImpl, `${INWORLD_ORIGIN}/tts/v1/voice`, apiKey, {
    method: 'POST',
    body: JSON.stringify({
      text: script,
      voiceId,
      modelId: INWORLD_TTS_MODEL,
      audioConfig: { audioEncoding: 'WAV', sampleRateHertz: 24000 },
    }),
  });
  const audio = text(result.audioContent);
  if (!audio) throw new HttpError(502, 'Inworld tidak mengembalikan audio.', 'inworld_error');
  if (text(result.usage?.modelId) && result.usage.modelId !== INWORLD_TTS_MODEL) {
    throw new HttpError(502, 'Inworld memakai model yang bukan yang termurah.', 'paid_model_blocked');
  }
  return json({ audioWav: audio, mimeType: 'audio/wav' });
}

async function removeVoice(request, fetchImpl, apiKey) {
  const id = text(new URL(request.url).searchParams.get('id'));
  if (!VOICE_ID.test(id)) throw new HttpError(400, 'Profil Inworld tidak valid.', 'invalid_voice');
  await inworldJson(fetchImpl, `${INWORLD_ORIGIN}/voices/v1/voices/${encodeURIComponent(id)}`, apiKey, { method: 'DELETE' });
  return json({ ok: true, id });
}

async function routeInworld(request, deps) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  const method = request.method.toUpperCase();
  if (!isConfigured(env.INWORLD_API_KEY)) {
    if (method === 'GET') return json({ configured: false, engine: 'inworld', voices: [], message: MISSING_KEY_MESSAGE });
    throw new HttpError(503, MISSING_KEY_MESSAGE, 'missing_api_key');
  }
  const apiKey = env.INWORLD_API_KEY.trim();
  if (method === 'GET') {
    const voices = await listVoices(fetchImpl, apiKey);
    return json({ configured: true, engine: 'inworld', voices, model: INWORLD_TTS_MODEL });
  }
  if (method === 'DELETE') return removeVoice(request, fetchImpl, apiKey);
  if (method !== 'POST') throw new HttpError(405, 'Metode tidak diizinkan.', 'method_not_allowed');
  const payload = await readJson(request);
  const action = text(payload.action);
  if (action === 'create') return cloneVoice(payload, fetchImpl, apiKey);
  if (action === 'speak') return speak(payload, fetchImpl, apiKey);
  throw new HttpError(400, 'Aksi suara tidak dikenal.', 'invalid_action');
}

export async function handleInworldRequest(request, deps = {}) {
  try {
    return await routeInworld(request, deps);
  } catch (err) {
    const apiKey = deps.env?.INWORLD_API_KEY || process.env.INWORLD_API_KEY;
    if (err instanceof HttpError) {
      const body = { error: err.code, message: redactSecrets(err.message, apiKey), configured: err.code !== 'missing_api_key' };
      if (typeof err.detail === 'string' && err.detail) body.detail = err.detail;
      return json(body, err.status);
    }
    return json({ error: 'inworld_error', message: 'Gagal menghubungi Inworld.' }, 502);
  }
}
