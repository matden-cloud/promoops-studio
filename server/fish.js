import { describeWavUpload } from './voice-audio.js';
import { FISH_ENDED_MESSAGE, FISH_FREE_MODEL, fishFreeStatus, redactSecrets } from './voice-free.js';

export const FISH_ORIGIN = 'https://api.fish.audio';

const MAX_JSON_CHARS = 4_200_000;
const MAX_REFERENCE_BYTES = 1_500_000;
const MAX_SCRIPT_CHARS = 2000;
const MAX_NAME_CHARS = 60;
const FISH_ID = /^[A-Za-z0-9]{8,64}$/;
const MISSING_KEY_MESSAGE = 'Fish Audio belum dikonfigurasi. Isi FISH_API_KEY.';

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

function assertFreeModel(headers) {
  if (headers.model !== FISH_FREE_MODEL) {
    throw new HttpError(500, 'Model Fish yang bukan gratis ditolak.', 'paid_model_blocked');
  }
}

async function fishCall(fetchImpl, url, apiKey, init) {
  const headers = { ...(init.headers || {}), Authorization: `Bearer ${apiKey}`, model: FISH_FREE_MODEL };
  assertFreeModel(headers);
  if (JSON.stringify(init.body || '').includes('"s2.1-pro"') || JSON.stringify(headers).includes('s2.1-pro"')) {
    throw new HttpError(500, 'Model Fish yang bukan gratis ditolak.', 'paid_model_blocked');
  }
  let upstream;
  try {
    upstream = await fetchImpl(url, { ...init, headers });
  } catch {
    throw new HttpError(502, 'Gagal menghubungi Fish Audio.', 'fish_error');
  }
  return upstream;
}

function publicModel(item) {
  const id = text(item?._id || item?.id);
  if (!FISH_ID.test(id)) return null;
  const state = text(item?.state) || 'trained';
  const status = state === 'trained' ? 'ready' : (state === 'failed' ? 'failed' : 'wait');
  return {
    id,
    name: text(item?.title).slice(0, MAX_NAME_CHARS) || 'Profil Fish',
    engine: 'fish',
    kind: 'clone',
    status,
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
  if (!bytes.length || bytes.length > MAX_REFERENCE_BYTES) {
    throw new HttpError(413, 'Audio referensi terlalu besar.', 'audio_too_large');
  }
  try {
    describeWavUpload(bytes, 'fish');
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : 'WAV tidak valid.', 'invalid_audio');
  }
  return bytes;
}

async function listModels(fetchImpl, apiKey) {
  const url = new URL('/model', FISH_ORIGIN);
  url.searchParams.set('self', 'true');
  url.searchParams.set('page_size', '50');
  url.searchParams.set('page_number', '1');
  const upstream = await fishCall(fetchImpl, url.toString(), apiKey, { method: 'GET' });
  let result;
  try {
    result = await upstream.json();
  } catch {
    result = null;
  }
  if (Number(upstream.status) === 429) throw new HttpError(429, 'Kuota Fish Audio sedang penuh. Coba lagi nanti.', 'quota');
  if (!upstream.ok) {
    const message = text(result?.message) || text(result?.error);
    throw new HttpError(502, 'Fish Audio menolak permintaan.', 'fish_error', trimDetail(message, apiKey));
  }
  const rows = Array.isArray(result?.items) ? result.items : [];
  return rows.map(publicModel).filter(Boolean);
}

async function createModel(payload, fetchImpl, apiKey) {
  const title = text(payload.displayName);
  if (!title) throw new HttpError(400, 'Nama profil suara kosong.', 'invalid_name');
  if (title.length > MAX_NAME_CHARS) throw new HttpError(400, 'Nama profil suara terlalu panjang.', 'invalid_name');
  const wav = decodeWav(payload.sourceWav);
  const form = new FormData();
  form.set('type', 'tts');
  form.set('title', title);
  form.set('visibility', 'private');
  form.set('train_mode', 'fast');
  form.set('voices', new Blob([wav], { type: 'audio/wav' }), 'referensi.wav');
  const upstream = await fishCall(fetchImpl, `${FISH_ORIGIN}/model`, apiKey, { method: 'POST', body: form });
  let result;
  try {
    result = await upstream.json();
  } catch {
    result = null;
  }
  if (!upstream.ok) {
    throw new HttpError(502, 'Fish Audio menolak profil suara.', 'fish_error', trimDetail(text(result?.message), apiKey));
  }
  const voice = publicModel(result);
  if (!voice) throw new HttpError(502, 'Fish Audio tidak mengembalikan profil suara.', 'fish_error');
  return json({ voice });
}

async function speak(payload, fetchImpl, apiKey) {
  const referenceId = text(payload.voiceId);
  if (!FISH_ID.test(referenceId)) throw new HttpError(400, 'Profil Fish tidak valid.', 'invalid_voice');
  const script = typeof payload.text === 'string' ? payload.text.trim() : '';
  if (!script) throw new HttpError(400, 'Naskah kosong.', 'empty_script');
  if (script.length > MAX_SCRIPT_CHARS) throw new HttpError(413, 'Naskah terlalu panjang.', 'script_too_long');
  const upstream = await fishCall(fetchImpl, `${FISH_ORIGIN}/v1/tts`, apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: script, reference_id: referenceId, format: 'wav' }),
  });
  if (Number(upstream.status) === 429) throw new HttpError(429, 'Kuota Fish Audio sedang penuh. Coba lagi nanti.', 'quota');
  if (!upstream.ok) {
    let message;
    try {
      message = text((await upstream.json())?.message);
    } catch {
      message = '';
    }
    throw new HttpError(502, 'Fish Audio menolak permintaan.', 'fish_error', trimDetail(message, apiKey));
  }
  const bytes = Buffer.from(await upstream.arrayBuffer());
  if (!bytes.length) throw new HttpError(502, 'Fish Audio tidak mengembalikan audio.', 'fish_error');
  return json({ audioWav: bytes.toString('base64'), mimeType: 'audio/wav' });
}

async function removeModel(request, fetchImpl, apiKey) {
  const id = text(new URL(request.url).searchParams.get('id'));
  if (!FISH_ID.test(id)) throw new HttpError(400, 'Profil Fish tidak valid.', 'invalid_voice');
  const upstream = await fishCall(fetchImpl, `${FISH_ORIGIN}/model/${encodeURIComponent(id)}`, apiKey, { method: 'DELETE' });
  if (!upstream.ok && upstream.status !== 404) {
    throw new HttpError(502, 'Fish Audio menolak penghapusan.', 'fish_error');
  }
  return json({ ok: true, id });
}

async function routeFish(request, deps) {
  const now = typeof deps.now === 'function' ? deps.now() : Date.now();
  const status = fishFreeStatus(now);
  if (status.expired) {
    throw new HttpError(410, FISH_ENDED_MESSAGE, 'free_ended');
  }
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  const method = request.method.toUpperCase();
  if (!isConfigured(env.FISH_API_KEY)) {
    if (method === 'GET') return json({ configured: false, engine: 'fish', voices: [], fish: status, message: MISSING_KEY_MESSAGE });
    throw new HttpError(503, MISSING_KEY_MESSAGE, 'missing_api_key');
  }
  const apiKey = env.FISH_API_KEY.trim();
  if (method === 'GET') {
    const voices = await listModels(fetchImpl, apiKey);
    return json({ configured: true, engine: 'fish', voices, fish: status });
  }
  if (method === 'DELETE') return removeModel(request, fetchImpl, apiKey);
  if (method !== 'POST') throw new HttpError(405, 'Metode tidak diizinkan.', 'method_not_allowed');
  const payload = await readJson(request);
  const action = text(payload.action);
  if (action === 'create') return createModel(payload, fetchImpl, apiKey);
  if (action === 'speak') return speak(payload, fetchImpl, apiKey);
  throw new HttpError(400, 'Aksi suara tidak dikenal.', 'invalid_action');
}

export async function handleFishRequest(request, deps = {}) {
  try {
    return await routeFish(request, deps);
  } catch (err) {
    const apiKey = deps.env?.FISH_API_KEY || process.env.FISH_API_KEY;
    if (err instanceof HttpError) {
      const body = {
        error: err.code,
        message: redactSecrets(err.message, apiKey),
        configured: err.code !== 'missing_api_key',
        fish: fishFreeStatus(typeof deps.now === 'function' ? deps.now() : Date.now()),
      };
      if (typeof err.detail === 'string' && err.detail) body.detail = err.detail;
      return json(body, err.status);
    }
    return json({ error: 'fish_error', message: 'Gagal menghubungi Fish Audio.' }, 502);
  }
}
