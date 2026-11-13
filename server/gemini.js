export const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const MAX_PROMPT_CHARS = 50_000;
const MAX_OUTPUT_TOKENS = 800;

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
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

function extractText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('');
  return text.trim() ? text : null;
}

async function routeGemini(request, deps) {
  if (request.method.toUpperCase() !== 'POST') {
    throw new HttpError(405, 'Metode tidak diizinkan.', 'method_not_allowed');
  }

  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  const endpoint = deps.endpoint || GEMINI_ENDPOINT;
  const apiKey = env.GEMINI_API_KEY;

  if (!isConfigured(apiKey)) {
    throw new HttpError(503, 'Kunci Gemini belum dikonfigurasi di server.', 'missing_api_key');
  }

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
  const maxOutputTokens = clampInteger(payload.maxOutputTokens, 1, MAX_OUTPUT_TOKENS, 800);

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
        generationConfig: { temperature, maxOutputTokens },
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
    throw new HttpError(502, 'Gemini menolak permintaan.', 'gemini_error');
  }

  const text = extractText(result);
  if (text && text.includes(apiKey)) {
    return json({ text: text.split(apiKey).join('[redacted]') });
  }
  return json({ text });
}

export async function handleGeminiRequest(request, deps = {}) {
  try {
    return await routeGemini(request, deps);
  } catch (err) {
    if (err instanceof HttpError) {
      return json({ error: err.code, message: err.message }, err.status);
    }
    return json({ error: 'gemini_error', message: 'Gagal menghubungi Gemini.' }, 502);
  }
}
