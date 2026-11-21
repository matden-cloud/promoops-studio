import { describeWavUpload } from './voice-audio.js';

export const VOICE_API_ORIGIN = 'https://generativelanguage.googleapis.com';
export const FLASH_TTS_MODEL = 'gemini-3.8-flash-tts';
export const FLASH_LITE_TTS_MODEL = 'gemini-3.8-flash-lite-tts';
export const TTS_MODELS = Object.freeze([FLASH_TTS_MODEL, FLASH_LITE_TTS_MODEL]);

const MAX_JSON_CHARS = 4_200_000;
const MAX_REFERENCE_BYTES = 1_500_000;
const MAX_CONSENT_BYTES = 1_250_000;
const MAX_SCRIPT_CHARS = 2000;
const MAX_STYLE_CHARS = 160;
const MAX_NAME_CHARS = 60;
const MAX_LIST_PAGES = 5;
const VOICE_ID = /^voice_[A-Za-z0-9_-]{4,80}$/;

const QUOTA_MESSAGE = 'Kuota harian Gemini sudah habis. Paket gratis punya batas harian. Coba lagi nanti.';
const MISSING_KEY_MESSAGE = 'Kunci Gemini belum dikonfigurasi di server.';

class HttpError extends Error {
  constructor(status, message, code, detail) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isConfigured(value) {
  return typeof value === 'string' && value.trim() !== '';
}

export function redactSecrets(value, apiKey) {
  if (typeof value !== 'string' || value === '') return '';
  if (typeof apiKey !== 'string' || apiKey === '') return value;
  let out = value.split(apiKey).join('[redacted]');
  const encoded = encodeURIComponent(apiKey);
  if (encoded && encoded !== apiKey) out = out.split(encoded).join('[redacted]');
  return out;
}

function trimDetail(value, apiKey) {
  const redacted = redactSecrets(value, apiKey).replace(/\s+/g, ' ').trim();
  if (!redacted) return '';
  return redacted.length > 500 ? `${redacted.slice(0, 500)}…` : redacted;
}

function upstreamDetail(upstream, result, apiKey) {
  const httpStatus = Number(upstream?.status);
  const googleStatus = text(result?.error?.status);
  const googleMessage = text(result?.error?.message);
  const head = [
    Number.isInteger(httpStatus) && httpStatus > 0 ? `HTTP ${httpStatus}` : '',
    googleStatus,
  ].filter(Boolean).join(' ');
  const detail = googleMessage ? (head ? `${head}: ${googleMessage}` : googleMessage) : head;
  return trimDetail(detail, apiKey);
}

function isQuota(upstream, result) {
  if (Number(upstream?.status) === 429) return true;
  const status = text(result?.error?.status).toUpperCase();
  const message = text(result?.error?.message).toLowerCase();
  return status === 'RESOURCE_EXHAUSTED' || message.includes('quota') || message.includes('rate limit');
}

async function readUpstreamJson(upstream) {
  try {
    return await upstream.json();
  } catch {
    return null;
  }
}

function googleHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
  };
}

function assertNoKeyInUrl(url, apiKey) {
  const target = new URL(url);
  if (target.searchParams.has('key') || target.searchParams.has('api_key')) {
    throw new HttpError(500, 'Konfigurasi permintaan Gemini tidak aman.', 'gemini_error');
  }
  if (apiKey && target.href.includes(apiKey)) {
    throw new HttpError(500, 'Konfigurasi permintaan Gemini tidak aman.', 'gemini_error');
  }
  return target;
}

function decodeBase64(value, label, maxBytes) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(400, `${label} kosong.`, 'invalid_audio');
  }
  const cleaned = value.trim().replace(/\s/g, '');
  if (cleaned.length > maxBytes * 2) {
    throw new HttpError(413, `${label} terlalu besar. Potong audio lebih pendek.`, 'audio_too_large');
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned) || cleaned.length % 4 !== 0) {
    throw new HttpError(400, `${label} bukan data WAV yang valid.`, 'invalid_audio');
  }
  const bytes = Buffer.from(cleaned, 'base64');
  if (bytes.length === 0 || bytes.length > maxBytes) {
    throw new HttpError(413, `${label} terlalu besar. Potong audio lebih pendek.`, 'audio_too_large');
  }
  return bytes;
}

function wavOrThrow(bytes, kind, label) {
  try {
    describeWavUpload(bytes, kind);
  } catch (err) {
    throw new HttpError(400, `${label}: ${err instanceof Error ? err.message : 'WAV tidak valid.'}`, 'invalid_audio');
  }
}

function normalizedType(value) {
  const raw = text(value).toLowerCase();
  if (raw === 'replicated' || raw === 'voice_type_replicated') return 'replicated';
  return raw;
}

function publicVoice(voice) {
  const id = text(voice?.id);
  const type = normalizedType(voice?.type);
  if (type !== 'replicated' || !VOICE_ID.test(id)) return null;
  const name = text(voice?.display_name).slice(0, MAX_NAME_CHARS) || 'Profil suara';
  return {
    id,
    name,
    status: 'ready',
    model: text(voice?.model),
    expireTime: text(voice?.expire_time),
  };
}

async function googleJson(fetchImpl, url, apiKey, init) {
  assertNoKeyInUrl(url, apiKey);
  let upstream;
  try {
    upstream = await fetchImpl(url, {
      ...init,
      headers: googleHeaders(apiKey),
    });
  } catch {
    throw new HttpError(502, 'Gagal menghubungi Gemini.', 'gemini_error');
  }
  const result = await readUpstreamJson(upstream);
  if (isQuota(upstream, result)) {
    throw new HttpError(429, QUOTA_MESSAGE, 'quota');
  }
  if (!upstream.ok) {
    const status = Number(upstream.status);
    if (status === 404) throw new HttpError(404, 'Profil suara tidak ditemukan.', 'not_found');
    throw new HttpError(502, 'Gemini menolak permintaan.', 'gemini_error', upstreamDetail(upstream, result, apiKey));
  }
  return result || {};
}

async function listReplicatedVoices(fetchImpl, apiKey) {
  const voices = [];
  let pageToken = '';
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const url = new URL('/v1beta/voices', VOICE_API_ORIGIN);
    url.searchParams.set('type', 'replicated');
    url.searchParams.set('page_size', '100');
    if (pageToken) url.searchParams.set('page_token', pageToken);
    const result = await googleJson(fetchImpl, url.toString(), apiKey, { method: 'GET' });
    const rows = Array.isArray(result.voices) ? result.voices : [];
    for (const row of rows) {
      const voice = publicVoice(row);
      if (voice) voices.push(voice);
    }
    pageToken = text(result.next_page_token);
    if (!pageToken) break;
  }
  return voices;
}

function extractAudio(result) {
  const steps = Array.isArray(result?.steps) ? result.steps : [];
  for (let stepIndex = steps.length - 1; stepIndex >= 0; stepIndex -= 1) {
    const content = steps[stepIndex]?.content;
    if (!Array.isArray(content)) continue;
    for (let blockIndex = content.length - 1; blockIndex >= 0; blockIndex -= 1) {
      const block = content[blockIndex];
      if (block?.type === 'audio' && typeof block.data === 'string' && block.data.trim() !== '') {
        return {
          audioWav: block.data.trim(),
          mimeType: text(block.mime_type) || 'audio/wav',
        };
      }
    }
  }
  return null;
}

function speechBody(model, voiceId, script, style) {
  const block = { type: 'text', text: script };
  if (style) block.annotations = [{ type: 'speech_metadata', style }];
  return {
    model,
    input: [{ type: 'user_input', content: [block] }],
    response_format: { type: 'audio', mime_type: 'audio/wav' },
    generation_config: {
      speech_config: [{ voice: voiceId }],
    },
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
  if (raw.length > MAX_JSON_CHARS) {
    throw new HttpError(413, 'Unggahan terlalu besar. Potong audio lebih pendek.', 'body_too_large');
  }
  if (!raw.trim()) return {};
  try {
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('shape');
    }
    return payload;
  } catch {
    throw new HttpError(400, 'Body JSON tidak valid.', 'invalid_json');
  }
}

function requireKey(env) {
  const apiKey = env.GEMINI_API_KEY;
  if (!isConfigured(apiKey)) {
    throw new HttpError(503, MISSING_KEY_MESSAGE, 'missing_api_key');
  }
  return apiKey.trim();
}

async function createVoice(payload, fetchImpl, apiKey) {
  const displayName = text(payload.displayName);
  if (!displayName) throw new HttpError(400, 'Nama profil suara kosong.', 'invalid_name');
  if (displayName.length > MAX_NAME_CHARS) {
    throw new HttpError(400, 'Nama profil suara terlalu panjang.', 'invalid_name');
  }
  const source = decodeBase64(payload.sourceWav, 'Audio referensi', MAX_REFERENCE_BYTES);
  const consent = decodeBase64(payload.consentWav, 'Rekaman izin', MAX_CONSENT_BYTES);
  wavOrThrow(source, 'reference', 'Audio referensi');
  wavOrThrow(consent, 'consent', 'Rekaman izin');

  const result = await googleJson(fetchImpl, `${VOICE_API_ORIGIN}/v1beta/voices`, apiKey, {
    method: 'POST',
    body: JSON.stringify({
      store: true,
      voice: {
        model: FLASH_TTS_MODEL,
        type: 'replicated',
        display_name: displayName,
        replicated: {
          source_audio: { mime_type: 'audio/wav', data: source.toString('base64') },
          consent_audio: { mime_type: 'audio/wav', data: consent.toString('base64') },
        },
      },
    }),
  });
  const voice = publicVoice(result) || publicVoice(result.voice);
  if (!voice) throw new HttpError(502, 'Gemini tidak mengembalikan profil suara.', 'gemini_error');
  return json({ voice });
}

async function speak(payload, fetchImpl, apiKey) {
  const voiceId = text(payload.voiceId);
  if (!VOICE_ID.test(voiceId)) throw new HttpError(400, 'Profil suara tidak valid.', 'invalid_voice');
  const model = text(payload.model) || FLASH_TTS_MODEL;
  if (!TTS_MODELS.includes(model)) throw new HttpError(400, 'Model suara tidak dikenal.', 'invalid_model');
  const script = typeof payload.text === 'string' ? payload.text.trim() : '';
  if (!script) throw new HttpError(400, 'Naskah kosong.', 'empty_script');
  if (script.length > MAX_SCRIPT_CHARS) throw new HttpError(413, 'Naskah terlalu panjang.', 'script_too_long');
  const style = text(payload.style);
  if (style.length > MAX_STYLE_CHARS) throw new HttpError(400, 'Gaya bicara terlalu panjang.', 'invalid_style');

  const result = await googleJson(fetchImpl, `${VOICE_API_ORIGIN}/v1beta/interactions`, apiKey, {
    method: 'POST',
    body: JSON.stringify(speechBody(model, voiceId, script, style)),
  });
  const audio = extractAudio(result);
  if (!audio) throw new HttpError(502, 'Gemini tidak mengembalikan audio.', 'gemini_error');
  return json(audio);
}

async function removeVoice(request, fetchImpl, apiKey) {
  const id = text(new URL(request.url).searchParams.get('id'));
  if (!VOICE_ID.test(id)) throw new HttpError(400, 'Profil suara tidak valid.', 'invalid_voice');
  await googleJson(fetchImpl, `${VOICE_API_ORIGIN}/v1beta/voices/${encodeURIComponent(id)}`, apiKey, {
    method: 'DELETE',
  });
  return json({ ok: true, id });
}

async function routeVoice(request, deps) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  const method = request.method.toUpperCase();

  if (method === 'GET') {
    if (!isConfigured(env.GEMINI_API_KEY)) {
      return json({ configured: false, voices: [], message: MISSING_KEY_MESSAGE });
    }
    const apiKey = env.GEMINI_API_KEY.trim();
    const voices = await listReplicatedVoices(fetchImpl, apiKey);
    return json({ configured: true, voices });
  }

  if (method !== 'POST' && method !== 'DELETE') {
    throw new HttpError(405, 'Metode tidak diizinkan.', 'method_not_allowed');
  }

  const apiKey = requireKey(env);
  if (method === 'DELETE') return removeVoice(request, fetchImpl, apiKey);

  const payload = await readJson(request);
  const action = text(payload.action);
  if (action === 'create') return createVoice(payload, fetchImpl, apiKey);
  if (action === 'speak') return speak(payload, fetchImpl, apiKey);
  throw new HttpError(400, 'Aksi suara tidak dikenal.', 'invalid_action');
}

export async function handleVoiceRequest(request, deps = {}) {
  try {
    return await routeVoice(request, deps);
  } catch (err) {
    if (err instanceof HttpError) {
      const body = { error: err.code, message: redactSecrets(err.message, deps.env?.GEMINI_API_KEY || process.env.GEMINI_API_KEY) };
      if (typeof err.detail === 'string' && err.detail !== '') body.detail = err.detail;
      return json(body, err.status);
    }
    return json({ error: 'gemini_error', message: 'Gagal menghubungi Gemini.' }, 502);
  }
}

export const voiceLimits = Object.freeze({
  maxJsonChars: MAX_JSON_CHARS,
  maxScriptChars: MAX_SCRIPT_CHARS,
  quotaMessage: QUOTA_MESSAGE,
  missingKeyMessage: MISSING_KEY_MESSAGE,
});
