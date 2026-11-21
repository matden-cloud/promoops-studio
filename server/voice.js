import { redactSecrets } from './voice-free.js';

export const VOICE_API_ORIGIN = 'https://generativelanguage.googleapis.com';
export const FLASH_TTS_MODEL = 'gemini-3.8-flash-tts';
export const FLASH_LITE_TTS_MODEL = 'gemini-3.8-flash-lite-tts';
export const TTS_MODELS = Object.freeze([FLASH_TTS_MODEL, FLASH_LITE_TTS_MODEL]);
export { redactSecrets };

const MAX_JSON_CHARS = 4_200_000;
const MAX_SCRIPT_CHARS = 2000;
const MAX_STYLE_CHARS = 160;
const MAX_NAME_CHARS = 60;
const MAX_PROMPT_CHARS = 500;
const MAX_LIST_PAGES = 2;
const DESIGNED_ID = /^voice_[A-Za-z0-9_-]{4,80}$/;
const PREBUILT_ID = /^[A-Za-z][A-Za-z0-9_ .'-]{0,40}$/;

const QUOTA_MESSAGE = 'Kuota harian Gemini sudah habis. Paket gratis punya batas harian. Coba lagi nanti.';
const MISSING_KEY_MESSAGE = 'Kunci Gemini belum dikonfigurasi di server. Isi GEMINI_API_KEY.';

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
  return { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
}

function assertNoKeyInUrl(url, apiKey) {
  const target = new URL(url);
  if (target.searchParams.has('key') || target.searchParams.has('api_key') || (apiKey && target.href.includes(apiKey))) {
    throw new HttpError(500, 'Konfigurasi permintaan Gemini tidak aman.', 'gemini_error');
  }
}

async function googleJson(fetchImpl, url, apiKey, init) {
  assertNoKeyInUrl(url, apiKey);
  let upstream;
  try {
    upstream = await fetchImpl(url, { ...init, headers: googleHeaders(apiKey) });
  } catch {
    throw new HttpError(502, 'Gagal menghubungi Gemini.', 'gemini_error');
  }
  const result = await readUpstreamJson(upstream);
  if (isQuota(upstream, result)) throw new HttpError(429, QUOTA_MESSAGE, 'quota');
  if (!upstream.ok) {
    if (Number(upstream.status) === 404) throw new HttpError(404, 'Profil suara tidak ditemukan.', 'not_found');
    throw new HttpError(502, 'Gemini menolak permintaan.', 'gemini_error', upstreamDetail(upstream, result, apiKey));
  }
  return result || {};
}

function publicVoice(voice, kind) {
  const id = text(voice?.id);
  const type = text(voice?.type).toLowerCase();
  if (kind === 'designed') {
    if (type && type !== 'prompted' && type !== 'voice_type_prompted') return null;
    if (!DESIGNED_ID.test(id)) return null;
  } else if (!PREBUILT_ID.test(id) || id.startsWith('voice_')) {
    return null;
  }
  return {
    id,
    name: text(voice?.display_name).slice(0, MAX_NAME_CHARS) || id,
    engine: 'gemini',
    kind,
    status: 'ready',
  };
}

async function listKind(fetchImpl, apiKey, type, kind, search) {
  const voices = [];
  let pageToken = '';
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const url = new URL('/v1beta/voices', VOICE_API_ORIGIN);
    url.searchParams.set('type', type);
    url.searchParams.set('page_size', '40');
    if (search) url.searchParams.set('search', search);
    if (pageToken) url.searchParams.set('page_token', pageToken);
    const result = await googleJson(fetchImpl, url.toString(), apiKey, { method: 'GET' });
    const rows = Array.isArray(result.voices) ? result.voices : [];
    for (const row of rows) {
      const voice = publicVoice(row, kind);
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
      if (block?.type === 'audio' && typeof block.data === 'string' && block.data.trim()) {
        return { audioWav: block.data.trim(), mimeType: text(block.mime_type) || 'audio/wav' };
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
    generation_config: { speech_config: [{ voice: voiceId }] },
  };
}

async function readJson(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_JSON_CHARS) {
    throw new HttpError(413, 'Unggahan terlalu besar.', 'body_too_large');
  }
  let raw;
  try {
    raw = await request.text();
  } catch {
    throw new HttpError(400, 'Body JSON tidak valid.', 'invalid_json');
  }
  if (raw.length > MAX_JSON_CHARS) throw new HttpError(413, 'Unggahan terlalu besar.', 'body_too_large');
  if (!raw.trim()) return {};
  try {
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('shape');
    return payload;
  } catch {
    throw new HttpError(400, 'Body JSON tidak valid.', 'invalid_json');
  }
}

function requireKey(env) {
  const apiKey = env.GEMINI_API_KEY;
  if (!isConfigured(apiKey)) throw new HttpError(503, MISSING_KEY_MESSAGE, 'missing_api_key');
  return apiKey.trim();
}

function assertSpeakable(voiceId) {
  if (DESIGNED_ID.test(voiceId) || PREBUILT_ID.test(voiceId)) return;
  throw new HttpError(400, 'Profil suara Gemini tidak valid.', 'invalid_voice');
}

async function designVoice(payload, fetchImpl, apiKey) {
  const displayName = text(payload.displayName);
  const prompt = text(payload.prompt);
  if (!displayName) throw new HttpError(400, 'Nama profil suara kosong.', 'invalid_name');
  if (displayName.length > MAX_NAME_CHARS) throw new HttpError(400, 'Nama profil suara terlalu panjang.', 'invalid_name');
  if (!prompt) throw new HttpError(400, 'Deskripsi suara kosong.', 'empty_prompt');
  if (prompt.length > MAX_PROMPT_CHARS) throw new HttpError(413, 'Deskripsi suara terlalu panjang.', 'prompt_too_long');
  if (payload.sourceWav || payload.consentWav || text(payload.type) === 'replicated') {
    throw new HttpError(400, 'Replikasi suara Gemini dimatikan. Pakai desain suara atau mesin gratis lain.', 'replication_disabled');
  }
  const result = await googleJson(fetchImpl, `${VOICE_API_ORIGIN}/v1beta/voices`, apiKey, {
    method: 'POST',
    body: JSON.stringify({
      store: true,
      voice: {
        model: FLASH_TTS_MODEL,
        type: 'prompted',
        display_name: displayName,
        prompted: { input: prompt },
      },
    }),
  });
  const voice = publicVoice(result, 'designed') || publicVoice(result.voice, 'designed');
  if (!voice) throw new HttpError(502, 'Gemini tidak mengembalikan profil suara.', 'gemini_error');
  const sample = result.sample_audio || result.voice?.sample_audio;
  const body = { voice };
  if (typeof sample?.data === 'string' && sample.data.trim()) {
    body.sampleWav = sample.data.trim();
    body.mimeType = text(sample.mime_type) || 'audio/wav';
  }
  return json(body);
}

async function speak(payload, fetchImpl, apiKey) {
  const voiceId = text(payload.voiceId);
  assertSpeakable(voiceId);
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
  if (!DESIGNED_ID.test(id)) throw new HttpError(400, 'Suara bawaan Gemini tidak bisa dihapus.', 'invalid_voice');
  await googleJson(fetchImpl, `${VOICE_API_ORIGIN}/v1beta/voices/${encodeURIComponent(id)}`, apiKey, { method: 'DELETE' });
  return json({ ok: true, id });
}

async function routeVoice(request, deps) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  const method = request.method.toUpperCase();

  if (method === 'GET') {
    if (!isConfigured(env.GEMINI_API_KEY)) {
      return json({ configured: false, engine: 'gemini', voices: [], message: MISSING_KEY_MESSAGE });
    }
    const apiKey = env.GEMINI_API_KEY.trim();
    const search = text(new URL(request.url).searchParams.get('q')).slice(0, 60);
    const [prebuilt, designed] = await Promise.all([
      listKind(fetchImpl, apiKey, 'prebuilt', 'prebuilt', search),
      listKind(fetchImpl, apiKey, 'prompted', 'designed', ''),
    ]);
    return json({ configured: true, engine: 'gemini', voices: [...designed, ...prebuilt] });
  }
  if (method !== 'POST' && method !== 'DELETE') throw new HttpError(405, 'Metode tidak diizinkan.', 'method_not_allowed');
  const apiKey = requireKey(env);
  if (method === 'DELETE') return removeVoice(request, fetchImpl, apiKey);
  const payload = await readJson(request);
  const action = text(payload.action);
  if (action === 'design') return designVoice(payload, fetchImpl, apiKey);
  if (action === 'create' || action === 'replicate') {
    throw new HttpError(400, 'Replikasi suara Gemini dimatikan. Pakai desain suara atau mesin gratis lain.', 'replication_disabled');
  }
  if (action === 'speak') return speak(payload, fetchImpl, apiKey);
  throw new HttpError(400, 'Aksi suara tidak dikenal.', 'invalid_action');
}

export async function handleVoiceRequest(request, deps = {}) {
  try {
    return await routeVoice(request, deps);
  } catch (err) {
    const apiKey = deps.env?.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (err instanceof HttpError) {
      const body = { error: err.code, message: redactSecrets(err.message, apiKey), configured: err.code !== 'missing_api_key' };
      if (typeof err.detail === 'string' && err.detail) body.detail = err.detail;
      return json(body, err.status);
    }
    return json({ error: 'gemini_error', message: 'Gagal menghubungi Gemini.' }, 502);
  }
}

export const voiceLimits = Object.freeze({
  quotaMessage: QUOTA_MESSAGE,
  missingKeyMessage: MISSING_KEY_MESSAGE,
});
