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

function generationConfigFor(model, temperature, maxOutputTokens) {
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
      return json(body, err.status);
    }
    return json({ error: 'gemini_error', message: 'Gagal menghubungi Gemini.' }, 502);
  }
}
