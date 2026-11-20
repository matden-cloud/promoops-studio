import { buildGeminiEndpoint, generationConfigFor, resolveGeminiModel } from './gemini.js';
import {
  CAPTION_LIMIT,
  PLAN_LIMIT,
  createPlanRow,
  isHeldName,
  jakartaYmd,
  normalizeIsoDate,
  userRequestsHeld,
} from './jadwal-repliz.js';

const MAX_MESSAGE = 4_000;
const MAX_CANDIDATES = 120;
const PLAN_OUTPUT_TOKENS = 8192;
const ACCOUNT_ID = /^[A-Za-z0-9_-]{8,80}$/;

export const QUOTA_MESSAGE = 'Kuota harian Gemini gratis sudah habis. Kuota biasanya pulih sekitar pukul 15.00 WIB. Form manual dan Isi cepat tetap bisa dipakai tanpa AI.';

const SYSTEM = [
  'Kamu asisten jadwal upload TikTok untuk PromoOps.',
  'Tugasmu hanya menyusun rencana. Jangan mengklaim sudah mengirim, menjadwalkan, atau memanggil Repliz.',
  'Jangan membuat URL media atau meminta kredensial.',
  'Balas hanya JSON dengan bentuk {"reply":"...","items":[{"fileId":"...","accountId":"...","date":"YYYY-MM-DD","time":"HH:mm","caption":"...","isDraft":false,"isCommentDisabled":false,"isAiGenerated":false}]}.',
  `Maksimal ${PLAN_LIMIT} item. Caption bahasa Indonesia, paling lama ${CAPTION_LIMIT} karakter, tanpa tagar berlebihan.`,
  'Pilih fileId dan accountId hanya dari daftar yang diberikan. Satu file satu baris. Jam dalam WIB.',
  'Video bertanda held=true tidak boleh masuk kecuali pengguna secara eksplisit meminta produk itu.',
  'reply singkat dalam bahasa Indonesia dan ingatkan bahwa rencana belum dikirim.',
].join(' ');

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

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function redact(value, secret) {
  if (!secret || typeof value !== 'string' || !value.includes(secret)) return value;
  return value.split(secret).join('[redacted]');
}

export function sanitizePlannerInput(payload) {
  const message = text(payload?.message).slice(0, MAX_MESSAGE);
  const candidates = [];
  for (const item of Array.isArray(payload?.candidates) ? payload.candidates : []) {
    if (candidates.length >= MAX_CANDIDATES) break;
    const fileId = text(item?.fileId);
    const fileName = text(item?.fileName).slice(0, 180);
    if (!fileId || fileId.length > 500 || !fileName) continue;
    const product = text(item?.product).slice(0, 120);
    candidates.push({
      fileId,
      fileName,
      product,
      held: Boolean(item?.held) || isHeldName(product) || isHeldName(fileName),
      uploaded: Boolean(item?.uploaded),
      date: normalizeIsoDate(item?.date),
    });
  }
  const accounts = [];
  for (const item of Array.isArray(payload?.accounts) ? payload.accounts : []) {
    if (accounts.length >= 50) break;
    const id = text(item?.id);
    if (!ACCOUNT_ID.test(id)) continue;
    accounts.push({
      id,
      name: text(item?.name).slice(0, 80) || 'Akun TikTok',
      username: text(item?.username).slice(0, 80),
    });
  }
  const history = [];
  for (const item of Array.isArray(payload?.history) ? payload.history : []) {
    if (history.length >= 8) break;
    const role = item?.role === 'assistant' ? 'assistant' : 'user';
    const line = text(item?.text).slice(0, 2_000);
    if (line) history.push({ role, text: line });
  }
  return { message, candidates, accounts, history };
}

export function buildPlannerPrompt(input, now = new Date()) {
  const allowHeld = userRequestsHeld(input.message);
  const visible = input.candidates.filter((item) => !item.uploaded && (allowHeld || !item.held));
  const lines = visible.map((item) => [
    item.fileId,
    item.fileName,
    item.product || '-',
    item.held ? 'held' : 'siap',
    item.date || '-',
  ].join(' | '));
  const accounts = input.accounts.map((item) => `${item.id} | ${item.name}${item.username ? ` | @${item.username}` : ''}`);
  const history = input.history.map((item) => `${item.role}: ${item.text}`).join('\n');
  const today = jakartaYmd(now);
  const prompt = [
    `Sekarang WIB tanggal ${today}.`,
    'Daftar video belum diupload (fileId | nama | produk | status | tanggal file):',
    lines.join('\n') || '(kosong)',
    'Akun Repliz:',
    accounts.join('\n') || '(belum ada akun)',
    history ? `Percakapan sebelumnya:\n${history}` : '',
    `Permintaan pengguna: ${input.message}`,
  ].filter(Boolean).join('\n');
  return { prompt, allowHeld, visible };
}

export function parsePlannerJson(raw) {
  const textValue = text(raw);
  const fenced = textValue.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1].trim() : textValue;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(body.slice(start, end + 1));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value;
  } catch {
    return null;
  }
}

export function normalizePlanItems(value, { candidates, accounts, allowHeld }) {
  const source = Array.isArray(value?.items) ? value.items : (Array.isArray(value?.plan) ? value.plan : []);
  const byId = new Map(candidates.map((item) => [item.fileId, item]));
  const accountIds = new Set(accounts.map((item) => item.id));
  const used = new Set();
  const plan = [];
  for (const item of source) {
    if (plan.length >= PLAN_LIMIT) break;
    const fileId = text(item?.fileId || item?.id);
    const candidate = byId.get(fileId);
    if (!candidate || candidate.uploaded || used.has(fileId)) continue;
    if (candidate.held && !allowHeld) continue;
    let accountId = text(item?.accountId);
    if (!ACCOUNT_ID.test(accountId) || (accountIds.size && !accountIds.has(accountId))) accountId = '';
    const row = createPlanRow({
      localId: `ai-${fileId}-${plan.length}`,
      fileId,
      fileName: candidate.fileName,
      product: candidate.product,
      held: candidate.held,
      accountId,
      date: item?.date,
      time: item?.time || item?.jam,
      caption: text(item?.caption || item?.description).slice(0, CAPTION_LIMIT),
      isDraft: item?.isDraft === true,
      isCommentDisabled: item?.isCommentDisabled === true,
      isAiGenerated: item?.isAiGenerated === true,
    });
    if (!row.date || !row.time) continue;
    used.add(fileId);
    plan.push(row);
  }
  const reply = text(value?.reply).slice(0, 4_000);
  return { reply, plan };
}

function extractText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .filter((part) => part && part.thought !== true && typeof part.text === 'string')
    .map((part) => part.text)
    .join('')
    .trim();
}

export function isGeminiQuota(status, payload) {
  if (status === 429) return true;
  const googleStatus = text(payload?.error?.status).toUpperCase();
  if (googleStatus === 'RESOURCE_EXHAUSTED') return true;
  const message = text(payload?.error?.message).toUpperCase();
  return message.includes('RESOURCE_EXHAUSTED');
}

async function routePlan(request, deps) {
  if (request.method.toUpperCase() !== 'POST') {
    throw new HttpError(405, 'Metode tidak diizinkan.', 'method_not_allowed');
  }
  const env = deps.env || process.env;
  const apiKey = text(env.GEMINI_API_KEY);
  if (!apiKey) throw new HttpError(503, 'Kunci Gemini belum dikonfigurasi di server.', 'missing_api_key');
  const resolved = resolveGeminiModel(env);
  if (resolved.error) throw new HttpError(500, resolved.error, 'invalid_model');

  let payload;
  try {
    payload = await request.json();
  } catch {
    throw new HttpError(400, 'Body JSON tidak valid.', 'invalid_json');
  }
  const input = sanitizePlannerInput(payload);
  if (!input.message) throw new HttpError(400, 'Perintah jadwal kosong.', 'empty_message');
  const now = deps.now instanceof Date ? deps.now : new Date();
  const built = buildPlannerPrompt(input, now);
  const generationConfig = generationConfigFor(resolved.model, 0.4, PLAN_OUTPUT_TOKENS);
  const fetchImpl = deps.fetchImpl || fetch;
  const endpoint = deps.endpoint || buildGeminiEndpoint(resolved.model);

  let upstream;
  try {
    upstream = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: built.prompt }] }],
        generationConfig,
      }),
      signal: AbortSignal.timeout(55_000),
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
  if (isGeminiQuota(upstream.status, result)) {
    throw new HttpError(429, QUOTA_MESSAGE, 'quota_exhausted');
  }
  if (!upstream.ok) {
    throw new HttpError(502, 'Gemini menolak permintaan rencana.', 'gemini_error');
  }
  const answer = redact(extractText(result), apiKey);
  const parsed = parsePlannerJson(answer);
  if (!parsed) {
    throw new HttpError(502, 'Gemini tidak mengembalikan rencana JSON. Coba lagi, atau pakai form manual dan Isi cepat.', 'invalid_plan');
  }
  const plan = normalizePlanItems(parsed, {
    candidates: built.visible,
    accounts: input.accounts,
    allowHeld: built.allowHeld,
  });
  const reply = redact(plan.reply, apiKey) || (
    plan.plan.length
      ? `Saya susun ${plan.plan.length} video di tabel konfirmasi. Belum ada yang dikirim ke Repliz.`
      : 'Tidak ada video yang cocok untuk permintaan itu. Form manual dan Isi cepat tetap bisa dipakai.'
  );
  return json({ reply, plan: plan.plan });
}

export async function handleReplizPlanRequest(request, deps = {}) {
  try {
    return await routePlan(request, deps);
  } catch (err) {
    if (err instanceof HttpError) {
      return json({ error: err.code, message: err.message }, err.status);
    }
    return json({ error: 'gemini_error', message: 'Gagal menyusun rencana jadwal.' }, 502);
  }
}
