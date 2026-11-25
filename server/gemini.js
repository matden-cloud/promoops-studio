import {
  VIDEO_ANALYSIS_SCHEMA,
  analyzeViolationVideo,
  startViolationVideoUpload,
} from './violation-video.js';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

const MODEL_NAME = /^[A-Za-z0-9.-]+$/;
const MAX_MODEL_LENGTH = 80;
const MAX_PROMPT_CHARS = 50_000;
const MAX_OUTPUT_TOKENS = 2048;
const GEMINI_25_FLASH = /^gemini-2\.5-flash(?:-|$)/;

export function buildGeminiEndpoint(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

export const GEMINI_ENDPOINT = buildGeminiEndpoint(DEFAULT_GEMINI_MODEL);

class HttpError extends Error {
  constructor(status, message, code, detail, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.extra = extra && typeof extra === 'object' ? extra : null;
  }
}

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function isConfigured(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function clampNumber(value, min, max, fallback) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function clampInteger(value, min, max, fallback) {
  const number = clampNumber(value, min, max, fallback);
  return Math.round(number);
}

function textField(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function resolveGeminiModel(env = {}) {
  const raw = textField(env.GEMINI_MODEL);
  if (!raw) return { model: DEFAULT_GEMINI_MODEL };
  if (raw.length > MAX_MODEL_LENGTH || !MODEL_NAME.test(raw)) {
    return { error: 'Nama GEMINI_MODEL tidak valid. Hanya huruf, angka, titik, dan minus.' };
  }
  return { model: raw };
}

function redactSecrets(text, apiKey) {
  if (typeof text !== 'string' || text === '') return '';
  if (typeof apiKey !== 'string' || apiKey === '') return text;
  let out = text.split(apiKey).join('[redacted]');
  const encoded = encodeURIComponent(apiKey);
  if (encoded !== apiKey) out = out.split(encoded).join('[redacted]');
  return out;
}

function candidateOf(payload) {
  const candidate = payload?.candidates?.[0];
  return candidate && typeof candidate === 'object' ? candidate : null;
}

function extractText(payload) {
  const parts = candidateOf(payload)?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .filter((part) => part && part.thought !== true)
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('');
  return text.trim() ? text : null;
}

function emptyAnswerError(payload) {
  const reason = textField(candidateOf(payload)?.finishReason);
  const block = textField(payload?.promptFeedback?.blockReason);
  if (reason === 'MAX_TOKENS') {
    return new HttpError(
      502,
      'Jawaban Gemini kosong karena batas token keluaran habis.',
      'gemini_error',
      'finishReason MAX_TOKENS',
    );
  }
  if (reason === 'SAFETY' || block === 'SAFETY') {
    return new HttpError(
      502,
      'Gemini menolak jawaban karena kebijakan keamanan.',
      'gemini_error',
      reason === 'SAFETY' ? 'finishReason SAFETY' : `blockReason ${block}`,
    );
  }
  const detail = reason ? `finishReason ${reason}` : (block ? `blockReason ${block}` : 'tidak ada teks');
  return new HttpError(502, 'Gemini tidak mengembalikan teks.', 'gemini_error', detail);
}

function usesGemini3Thinking(model) {
  return /^gemini-[3-9]/.test(model);
}

export function generationConfigFor(model, temperature, maxOutputTokens) {
  const generationConfig = { maxOutputTokens };
  if (GEMINI_25_FLASH.test(model)) {
    generationConfig.temperature = temperature;
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
    return generationConfig;
  }
  if (usesGemini3Thinking(model)) {
    // Enum REST: MINIMAL tidak didukung gemini-3.8-flash dan mengembalikan error.
    const level = model.includes('flash-lite') ? 'MINIMAL' : 'LOW';
    generationConfig.thinkingConfig = { thinkingLevel: level };
    return generationConfig;
  }
  generationConfig.temperature = temperature;
  return generationConfig;
}

const MAX_IMAGE_CHARS = 3_500_000;
const NOTICE_OUTPUT_TOKENS = 1024;
const NOTICE_STATUSES = ['Belum Banding', 'Menunggu Banding', 'Banding Diterima', 'Banding Ditolak'];
const NOTICE_READ_ERROR = 'Screenshot belum bisa dibaca. Coba gambar yang lebih jelas, atau isi formulir secara manual.';
const ID_MONTHS = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6, juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
  january: 1, february: 2, march: 3, may: 5, june: 6, july: 7, august: 8, october: 10,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, agu: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12,
};

const VIOLATION_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    akun: { type: 'STRING', description: 'Nama akun toko atau username. String kosong jika tidak terlihat.' },
    produk: { type: 'STRING', description: 'Nama produk. String kosong jika tidak terlihat.' },
    jenis: { type: 'STRING', description: 'Jenis pelanggaran dalam bahasa Indonesia. String kosong jika tidak terlihat.' },
    tanggal: { type: 'STRING', description: 'Tanggal pelanggaran format YYYY-MM-DD. String kosong jika tidak terlihat.' },
    penyebab: { type: 'STRING', description: 'Penyebab pelanggaran yang tertulis di gambar, tanpa URL. String kosong jika tidak terlihat.' },
    catatan: { type: 'STRING', description: 'Usulan evaluasi atau tindakan perbaikan, 1-3 kalimat bahasa Indonesia, tanpa URL. Jangan menyalin penyebab. Usulkan langkah yang masuk akal dari isi teguran bila gambar tidak menuliskan tindakannya.' },
    sanksi: { type: 'STRING', description: 'Sanksi yang tertulis di gambar, misalnya Peringatan, Video dibatasi / tidak masuk FYP, Fitur dibatasi, Poin pelanggaran, atau Akun ditangguhkan. String kosong jika tidak terlihat. Jangan mengarang sanksi.' },
    status: { type: 'STRING', description: 'Hanya jika hasil banding terlihat: Belum Banding, Menunggu Banding, Banding Diterima, atau Banding Ditolak. Selain itu string kosong.' },
  },
  required: ['akun', 'produk', 'jenis', 'tanggal', 'penyebab', 'catatan', 'sanksi', 'status'],
};

function labelList(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    const text = textField(item).replace(/\s+/g, ' ').slice(0, 120);
    if (!text || out.includes(text)) continue;
    out.push(text);
    if (out.length >= 40) break;
  }
  return out;
}

export function buildViolationPrompt(accounts, types) {
  const accountLine = accounts.length ? accounts.join(' | ') : '(tidak ada daftar)';
  const typeLine = types.length ? types.join(' | ') : '(tidak ada daftar)';
  return [
    'Kamu membaca screenshot pemberitahuan pelanggaran dari TikTok atau TikTok Shop.',
    'Balas hanya JSON dengan kunci akun, produk, jenis, tanggal, penyebab, catatan, sanksi, dan status.',
    'Jangan mengarang. Isi string kosong jika teksnya tidak terlihat di gambar.',
    'Jangan sertakan URL, tautan video, atau kunci linkVideo.',
    'akun: nama toko atau username. Jika cocok dengan salah satu akun berikut, salin teksnya persis:',
    accountLine,
    'produk: nama produk yang disebut di pemberitahuan.',
    'jenis: jenis pelanggaran dalam bahasa Indonesia. Jika cocok dengan salah satu jenis berikut, salin teksnya persis:',
    typeLine,
    'tanggal: tanggal pelanggaran format YYYY-MM-DD.',
    'penyebab: penyebab pelanggaran yang tertulis di gambar, ringkas, bahasa Indonesia, tanpa URL.',
    'catatan: usulan evaluasi atau tindakan perbaikan (apa yang harus diperbaiki atau langkah berikutnya), 1-3 kalimat bahasa Indonesia, tanpa URL. Jangan menyalin penyebab. Tetap usulkan tindakan yang masuk akal dari isi teguran bila gambar tidak menuliskan langkahnya.',
    'sanksi: sanksi yang tertulis di gambar. Jika cocok, salin salah satu: Peringatan, Video dibatasi / tidak masuk FYP, Fitur dibatasi, Poin pelanggaran, Akun ditangguhkan. Jika tidak tertulis, string kosong. Jangan mengarang sanksi.',
    'status: hanya jika gambar menyebut hasil banding, salah satu dari Belum Banding, Menunggu Banding, Banding Diterima, Banding Ditolak. Jika tidak, string kosong.',
  ].join('\n');
}

function stripNoticeUrls(value) {
  return String(value || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b(?:[a-z0-9-]+\.)?tiktok\.com\/\S+/gi, ' ');
}

function noticeText(value, max) {
  const text = stripNoticeUrls(value).replace(/\s+/g, ' ').trim();
  return text.slice(0, max);
}

function calendarIso(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return '';
  if (year < 2016 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isoDateOrEmpty(value) {
  const text = noticeText(value, 40);
  if (!text) return '';
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return calendarIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const slash = text.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (slash) return calendarIso(Number(slash[3]), Number(slash[2]), Number(slash[1]));
  const named = text.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!named) return '';
  const month = ID_MONTHS[named[2].toLowerCase()];
  if (!month) return '';
  return calendarIso(Number(named[3]), month, Number(named[1]));
}

function noticeStatus(value) {
  const text = noticeText(value, 40).toLowerCase();
  if (!text) return '';
  return NOTICE_STATUSES.find((item) => item.toLowerCase() === text) || '';
}

function unwrapJson(text) {
  const trimmed = String(text || '').trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const body = fenced ? fenced[1].trim() : trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return body;
  return body.slice(start, end + 1);
}

export function parseViolationNotice(text) {
  let value;
  try {
    value = JSON.parse(unwrapJson(text));
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    akun: noticeText(value.akun, 120),
    produk: noticeText(value.produk, 160),
    jenis: noticeText(value.jenis, 160),
    tanggal: isoDateOrEmpty(value.tanggal),
    penyebab: noticeText(value.penyebab, 500),
    catatan: noticeText(value.catatan, 500),
    sanksi: noticeText(value.sanksi ?? value.Sanksi, 200),
    status: noticeStatus(value.status),
  };
}

function imagePayload(payload) {
  let mime = textField(payload?.mimeType).toLowerCase();
  const source = typeof payload?.image === 'string' ? payload.image.trim() : '';
  if (!source) return { error: 'empty_image', message: 'Screenshot belum dipilih.' };
  let data = source;
  const dataUrl = source.match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (dataUrl) {
    mime = dataUrl[1].toLowerCase();
    data = dataUrl[2];
  }
  if (mime === 'image/jpg') mime = 'image/jpeg';
  data = data.replace(/\s/g, '');
  if (data.length > MAX_IMAGE_CHARS) {
    return { error: 'image_too_large', message: 'Gambar terlalu besar. Coba unggah ulang dengan ukuran lebih kecil.' };
  }
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime)) {
    return { error: 'invalid_image', message: 'File ini bukan gambar yang bisa dibaca. Unggah JPG, PNG, WEBP, atau GIF.' };
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 !== 0) {
    return { error: 'invalid_image', message: 'File ini bukan gambar yang bisa dibaca. Unggah JPG, PNG, WEBP, atau GIF.' };
  }
  const bytes = Buffer.from(data, 'base64');
  if (bytes.toString('base64') !== data || bytes.length < 4 || !imageMagic(bytes, mime)) {
    return { error: 'invalid_image', message: 'File ini bukan gambar yang bisa dibaca. Unggah JPG, PNG, WEBP, atau GIF.' };
  }
  return { mime, data };
}

function imageMagic(bytes, mime) {
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (mime === 'image/gif') return bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38;
  return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}

function quotaError(upstream, result) {
  if (Number(upstream?.status) === 429) return true;
  const googleStatus = textField(result?.error?.status).toUpperCase();
  if (googleStatus === 'RESOURCE_EXHAUSTED') return true;
  return textField(result?.error?.message).toUpperCase().includes('RESOURCE_EXHAUSTED');
}

async function readViolationNotice(payload, { model, endpoint, apiKey, fetchImpl }) {
  const image = imagePayload(payload);
  if (image.error) throw new HttpError(image.error === 'image_too_large' ? 413 : 400, image.message, image.error);

  const prompt = buildViolationPrompt(labelList(payload?.accounts), labelList(payload?.types));
  const generationConfig = generationConfigFor(model, 0.2, NOTICE_OUTPUT_TOKENS);
  generationConfig.responseMimeType = 'application/json';
  generationConfig.responseSchema = VIOLATION_RESPONSE_SCHEMA;

  let upstream;
  try {
    upstream = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType: image.mime, data: image.data } },
            { text: prompt },
          ],
        }],
        generationConfig,
      }),
    });
  } catch {
    throw new HttpError(502, NOTICE_READ_ERROR, 'gemini_error');
  }

  let result;
  try {
    result = await upstream.json();
  } catch {
    result = null;
  }
  if (quotaError(upstream, result)) {
    throw new HttpError(429, 'Kuota Gemini hari ini habis. Isi formulir secara manual dulu.', 'quota_exhausted');
  }
  if (!upstream.ok) {
    throw new HttpError(502, NOTICE_READ_ERROR, 'gemini_error', upstreamDetail(upstream, result, apiKey));
  }

  const text = extractText(result);
  if (!text) throw emptyAnswerError(result);
  const fields = parseViolationNotice(redactSecrets(text, apiKey).slice(0, 20_000));
  if (!fields) throw new HttpError(502, NOTICE_READ_ERROR, 'unreadable_notice');
  return json({ fields });
}

function upstreamDetail(upstream, result, apiKey) {
  const httpStatus = Number(upstream?.status);
  const googleStatus = textField(result?.error?.status);
  const googleMessage = textField(result?.error?.message);
  const head = [
    Number.isInteger(httpStatus) && httpStatus > 0 ? `HTTP ${httpStatus}` : '',
    googleStatus,
  ].filter(Boolean).join(' ');
  const detail = googleMessage ? (head ? `${head}: ${googleMessage}` : googleMessage) : head;
  const redacted = redactSecrets(detail, apiKey);
  if (!redacted) return 'Gemini menolak permintaan tanpa pesan.';
  return redacted.length > 1000 ? `${redacted.slice(0, 1000)}…` : redacted;
}

async function runViolationVideoAction(payload, deps) {
  const action = textField(payload?.action);
  const generationConfig = generationConfigFor(deps.model, 0.2, 1536);
  generationConfig.responseMimeType = 'application/json';
  generationConfig.responseSchema = VIDEO_ANALYSIS_SCHEMA;
  const runner = action === 'start_violation_video_upload' ? startViolationVideoUpload : analyzeViolationVideo;
  const result = await runner(payload, {
    apiKey: deps.apiKey,
    fetchImpl: deps.fetchImpl,
    endpoint: deps.endpoint,
    env: deps.env,
    requestImpl: deps.requestImpl,
    sleep: deps.sleep,
    mintDownload: deps.mintDownload,
    generationConfig,
    extractText,
  });
  if (!result?.ok) {
    throw new HttpError(result?.status || 502, result?.message || 'Gagal menganalisis video.', result?.code || 'gemini_error', result?.detail, result?.extra);
  }
  const body = result.body && typeof result.body === 'object' ? { ...result.body } : {};
  if (typeof body.message === 'string') body.message = redactSecrets(body.message, deps.apiKey);
  return json(body, result.status || 200);
}

async function routeGemini(request, deps) {
  if (request.method.toUpperCase() !== 'POST') {
    throw new HttpError(405, 'Metode tidak diizinkan.', 'method_not_allowed');
  }

  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  const apiKey = env.GEMINI_API_KEY;

  if (!isConfigured(apiKey)) {
    throw new HttpError(503, 'Kunci Gemini belum dikonfigurasi di server.', 'missing_api_key');
  }

  const resolved = resolveGeminiModel(env);
  if (resolved.error) {
    throw new HttpError(500, resolved.error, 'invalid_model');
  }
  const model = resolved.model;
  const endpoint = deps.endpoint || buildGeminiEndpoint(model);

  let payload;
  try {
    payload = await request.json();
  } catch {
    throw new HttpError(400, 'Body JSON tidak valid.', 'invalid_json');
  }

  if (textField(payload?.action) === 'read_violation') {
    return readViolationNotice(payload, { model, endpoint, apiKey, fetchImpl });
  }

  if (textField(payload?.action) === 'start_violation_video_upload' || textField(payload?.action) === 'analyze_violation_video') {
    return runViolationVideoAction(payload, {
      model,
      endpoint,
      apiKey,
      fetchImpl,
      env,
      requestImpl: deps.requestImpl,
      sleep: deps.sleep,
      mintDownload: deps.mintDownload,
    });
  }

  const prompt = payload?.prompt;
  if (typeof prompt !== 'string' || prompt.trim() === '') {
    throw new HttpError(400, 'Prompt kosong.', 'empty_prompt');
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new HttpError(413, 'Prompt terlalu panjang.', 'prompt_too_long');
  }

  const temperature = clampNumber(payload.temperature, 0, 2, 0.7);
  const maxOutputTokens = clampInteger(payload.maxOutputTokens, 1, MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS);

  let upstream;
  try {
    upstream = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: generationConfigFor(model, temperature, maxOutputTokens),
      }),
    });
  } catch {
    throw new HttpError(502, 'Gagal menghubungi Gemini.', 'gemini_error');
  }

  let result;
  try {
    result = await upstream.json();
  } catch {
    result = null;
  }

  if (!upstream.ok) {
    throw new HttpError(502, 'Gemini menolak permintaan.', 'gemini_error', upstreamDetail(upstream, result, apiKey));
  }

  const text = extractText(result);
  if (!text) throw emptyAnswerError(result);
  return json({ text: redactSecrets(text, apiKey) });
}

export async function handleGeminiRequest(request, deps = {}) {
  try {
    return await routeGemini(request, deps);
  } catch (err) {
    if (err instanceof HttpError) {
      const body = { error: err.code, message: err.message };
      if (typeof err.detail === 'string' && err.detail !== '') body.detail = err.detail;
      if (err.extra?.needsUpload === true) body.needsUpload = true;
      if (err.extra?.needsLogin === true) body.needsLogin = true;
      return json(body, err.status);
    }
    return json({ error: 'gemini_error', message: 'Gagal menghubungi Gemini.' }, 502);
  }
}
