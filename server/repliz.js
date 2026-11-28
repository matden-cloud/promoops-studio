import { isItemId } from './onedrive-plan.js';
import { mintOneDriveDownloadUrl } from './onedrive.js';
import {
  CAPTION_LIMIT,
  isScheduleAt,
  mediaExpiryUnix,
} from './jadwal-repliz.js';
import {
  MEDIA_PATH,
  REPLIZ_ORIGIN,
  isConfiguredSecret,
  resolvePublicOrigin,
  signMediaUrl,
} from './repliz-media.js';

const SCHEDULE_ID = /^[A-Za-z0-9_-]{8,80}$/;
const ACCOUNT_ID = /^[A-Za-z0-9_-]{8,80}$/;
const STATUSES = new Set(['pending', 'process', 'success', 'error']);

const CONFIG_MESSAGE = 'Repliz belum siap di server. Isi REPLIZ_ACCESS_KEY, REPLIZ_SECRET_KEY, dan MEDIA_URL_SECRET di Vercel, lalu deploy ulang. Penyusunan draf tetap bisa dilakukan.';

class HttpError extends Error {
  constructor(status, message, code, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
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

export function redactSecrets(value, secrets) {
  let out = typeof value === 'string' ? value : '';
  for (const secret of secrets) {
    if (typeof secret !== 'string' || secret.length < 4 || !out.includes(secret)) continue;
    out = out.split(secret).join('[redacted]');
    const encoded = encodeURIComponent(secret);
    if (encoded !== secret && out.includes(encoded)) out = out.split(encoded).join('[redacted]');
  }
  return out.length > 500 ? `${out.slice(0, 500)}…` : out;
}

export function replizConfig(env = {}) {
  const missing = [];
  if (!text(env.REPLIZ_ACCESS_KEY)) missing.push('REPLIZ_ACCESS_KEY');
  if (!text(env.REPLIZ_SECRET_KEY)) missing.push('REPLIZ_SECRET_KEY');
  if (!isConfiguredSecret(env.MEDIA_URL_SECRET)) missing.push('MEDIA_URL_SECRET');
  return {
    missing,
    configured: missing.length === 0,
    accessKey: text(env.REPLIZ_ACCESS_KEY),
    secretKey: text(env.REPLIZ_SECRET_KEY),
    mediaSecret: text(env.MEDIA_URL_SECRET),
  };
}

function basicAuth(accessKey, secretKey) {
  return `Basic ${Buffer.from(`${accessKey}:${secretKey}`, 'utf8').toString('base64')}`;
}

function secretsOf(config) {
  return [config.accessKey, config.secretKey, config.mediaSecret, basicAuth(config.accessKey, config.secretKey)];
}

function clampPage(value, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return fallback;
  return number;
}

function asList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.docs)) return payload.docs;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.accounts)) return payload.accounts;
  return [];
}

function mapAccount(row) {
  const id = text(row?._id || row?.id);
  if (!ACCOUNT_ID.test(id)) return null;
  const platform = text(row?.type || row?.platform).toLowerCase();
  return {
    id,
    name: text(row?.name || row?.username) || 'Akun TikTok',
    username: text(row?.username),
    platform,
    connected: row?.isConnected !== false,
  };
}

export function normalizeAccounts(payload) {
  const mapped = asList(payload).map(mapAccount).filter(Boolean);
  const tiktok = mapped.filter((item) => item.platform === 'tiktok');
  const pool = tiktok.length ? tiktok : mapped;
  const connected = pool.filter((item) => item.connected);
  return connected.length ? connected : pool;
}

function fileIdFromMedia(value) {
  try {
    const url = new URL(String(value || ''));
    if (!url.pathname.endsWith(MEDIA_PATH)) return '';
    const id = url.searchParams.get('id') || '';
    return isItemId(id) ? id : '';
  } catch {
    return '';
  }
}

function mapSchedule(row, secrets) {
  const id = text(row?._id || row?.id);
  if (!id) return null;
  const media = Array.isArray(row?.medias) ? row.medias[0] : null;
  const errorMessage = redactSecrets(text(row?.errorMessage || row?.error), secrets);
  return {
    id,
    description: text(row?.description).slice(0, CAPTION_LIMIT),
    status: text(row?.status).toLowerCase(),
    errorMessage,
    scheduleAt: text(row?.scheduleAt),
    accountId: text(row?.accountId || row?.account?._id || row?.account?.id),
    accountName: text(row?.account?.name || row?.account?.username),
    accountUsername: text(row?.account?.username),
    fileId: fileIdFromMedia(media?.url),
  };
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function callRepliz(fetchImpl, url, { method = 'GET', config, body }) {
  const headers = {
    Authorization: basicAuth(config.accessKey, config.secretKey),
    Accept: 'application/json',
  };
  const init = { method, headers, signal: AbortSignal.timeout(20_000) };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  try {
    return await fetchImpl(url, init);
  } catch {
    throw new HttpError(502, 'Gagal menghubungi Repliz.', 'repliz_error');
  }
}

function upstreamFailure(response, payload, secrets) {
  const detail = redactSecrets(text(payload?.message) || text(payload?.error?.message) || text(payload?.error), secrets);
  const status = response.status === 429 ? 429 : 502;
  const message = response.status === 429
    ? 'Repliz membatasi permintaan. Coba lagi sebentar lagi.'
    : 'Repliz menolak permintaan.';
  throw new HttpError(status, message, 'repliz_error', detail);
}

function requireRepliz(config) {
  if (!config.accessKey || !config.secretKey) {
    throw new HttpError(503, CONFIG_MESSAGE, 'missing_config', { missing: config.missing });
  }
}

function requireReady(config) {
  if (!config.configured) {
    throw new HttpError(503, CONFIG_MESSAGE, 'missing_config', { missing: config.missing });
  }
}

async function readSchedule(fetchImpl, config, scheduleId) {
  if (!SCHEDULE_ID.test(scheduleId)) {
    throw new HttpError(400, 'Id jadwal tidak valid.', 'invalid_schedule');
  }
  const response = await callRepliz(
    fetchImpl,
    `${REPLIZ_ORIGIN}/public/schedule/${encodeURIComponent(scheduleId)}`,
    { config },
  );
  const payload = await readJson(response);
  if (response.status === 404) throw new HttpError(404, 'Jadwal tidak ditemukan.', 'not_found');
  if (!response.ok) upstreamFailure(response, payload, secretsOf(config));
  const schedule = mapSchedule(payload, secretsOf(config));
  if (!schedule) throw new HttpError(502, 'Balasan jadwal Repliz tidak lengkap.', 'repliz_error');
  return schedule;
}

function boolField(value, name) {
  if (typeof value !== 'boolean') {
    throw new HttpError(400, `${name} harus true atau false.`, 'invalid_options');
  }
  return value;
}

function buildCreateBody(payload, config, request, now = Date.now()) {
  const accountId = text(payload?.accountId);
  const fileId = text(payload?.fileId);
  const scheduleAt = text(payload?.scheduleAt);
  const caption = typeof payload?.caption === 'string' ? payload.caption.trim() : '';
  const info = payload?.additionalInfo;
  if (!ACCOUNT_ID.test(accountId)) throw new HttpError(400, 'Akun Repliz tidak valid.', 'invalid_account');
  if (!isItemId(fileId)) throw new HttpError(400, 'Id file OneDrive tidak valid.', 'invalid_file');
  if (!isScheduleAt(scheduleAt)) throw new HttpError(400, 'Jadwal harus ISO 8601 dengan zona +07:00.', 'invalid_schedule_at');
  if (caption.length > CAPTION_LIMIT) throw new HttpError(400, 'Caption melebihi 2.200 karakter.', 'caption_too_long');
  if (!info || typeof info !== 'object' || Array.isArray(info)) {
    throw new HttpError(400, 'Opsi TikTok tidak lengkap.', 'invalid_options');
  }
  const expiry = mediaExpiryUnix(scheduleAt, now);
  if (expiry.error) throw new HttpError(400, expiry.error, 'schedule_too_far');
  const origin = resolvePublicOrigin(config.env, request.url);
  if (!origin) {
    throw new HttpError(500, 'Origin publik aplikasi belum bisa ditentukan. Isi PUBLIC_APP_URL.', 'missing_origin');
  }
  const signed = signMediaUrl({
    origin,
    itemId: fileId,
    exp: expiry.exp,
    secret: config.mediaSecret,
  });
  if (!signed || signed.includes('graph.microsoft.com') || signed.includes('downloadUrl')) {
    throw new HttpError(500, 'URL media bertanda tangan gagal dibuat.', 'sign_failed');
  }
  return {
    upstream: {
      type: 'video',
      description: caption,
      medias: [{ type: 'video', url: signed }],
      accountId,
      scheduleAt,
      additionalInfo: {
        isDraft: boolField(info.isDraft, 'isDraft'),
        isCommentDisabled: boolField(info.isCommentDisabled, 'isCommentDisabled'),
        isAiGenerated: boolField(info.isAiGenerated, 'isAiGenerated'),
      },
    },
    signed,
  };
}

async function uploadOneDriveToReplizStorage({ fileId, fileName, config, fetchImpl, mintImpl = mintOneDriveDownloadUrl }) {
  // 1. Ambil URL download sementara dari OneDrive saat tombol Jadwalkan diklik
  const minted = await mintImpl({ env: config.env, itemId: fileId });
  if (!minted?.ok || typeof minted.url !== 'string' || !minted.url.startsWith('https://')) {
    throw new HttpError(
      Number(minted?.status) || 502,
      minted?.message || 'Gagal menyiapkan link download OneDrive.',
      'onedrive_error',
    );
  }

  // 2. Unduh binary video dari OneDrive ke server
  let dlRes;
  try {
    dlRes = await fetchImpl(minted.url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(40_000),
    });
  } catch {
    throw new HttpError(502, 'Gagal mengunduh video dari OneDrive ke server.', 'onedrive_download_failed');
  }
  if (!dlRes.ok) {
    throw new HttpError(502, `Gagal mengunduh video dari OneDrive (HTTP ${dlRes.status}).`, 'onedrive_download_failed');
  }

  const fileBuffer = Buffer.from(await dlRes.arrayBuffer());
  if (!fileBuffer.length) {
    throw new HttpError(502, 'File video dari OneDrive kosong.', 'onedrive_empty');
  }

  const rawType = (dlRes.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const mimetype = rawType && rawType.startsWith('video/') ? rawType : 'video/mp4';
  const safeName = (text(fileName) || `${fileId.replace(/[^A-Za-z0-9_-]/g, '_')}.mp4`)
    .replace(/[^\w.\-() ]+/g, '_');
  const filename = /\.[a-z0-9]{2,5}$/i.test(safeName) ? safeName : `${safeName}.mp4`;

  // 3. Step 1 Repliz Storage: Init upload session
  const initRes = await callRepliz(fetchImpl, `${REPLIZ_ORIGIN}/public/storage/file/init`, {
    method: 'POST',
    config,
    body: { filename, size: fileBuffer.length, mimetype },
  });
  const initPayload = await readJson(initRes);
  if (initRes.status === 402) {
    throw new HttpError(402, 'Kuota Repliz Storage penuh. Hapus file lama di Storage Repliz terlebih dahulu.', 'storage_full');
  }
  if (!initRes.ok) upstreamFailure(initRes, initPayload, secretsOf(config));

  const initData = initPayload?.data || initPayload || {};
  const storageId = text([invalid URL] || initData._id);
  const uploadUrl = text(initData.upload);
  const publicUrl = text(initData.url);
  if (!storageId || !uploadUrl || !publicUrl) {
    throw new HttpError(502, 'Respons init Repliz Storage tidak lengkap.', 'repliz_storage_error');
  }

  // 4. Step 2 Repliz Storage: PUT binary langsung ke presigned URL (tanpa header Authorization)
  let putRes;
  try {
    putRes = await fetchImpl(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimetype },
      body: fileBuffer,
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw new HttpError(502, 'Gagal mengunggah video ke Repliz Storage.', 'repliz_storage_upload_failed');
  }
  if (!putRes.ok) {
    throw new HttpError(502, `Gagal mengunggah video ke Repliz Storage (HTTP ${putRes.status}).`, 'repliz_storage_upload_failed');
  }

  // 5. Step 3 Repliz Storage: Complete upload agar URL storage.repliz.com aktif
  const completeRes = await callRepliz(
    fetchImpl,
    `${REPLIZ_ORIGIN}/public/storage/file/${encodeURIComponent(storageId)}/complete`,
    { method: 'POST', config, body: {} },
  );
  const completePayload = await readJson(completeRes);
  if (!completeRes.ok) upstreamFailure(completeRes, completePayload, secretsOf(config));

  return publicUrl;
}

async function createSchedule(request, config, fetchImpl, now, mintImpl) {
  requireReady(config);
  let payload;
  try {
    payload = await request.json();
  } catch {
    throw new HttpError(400, 'Body JSON tidak valid.', 'invalid_json');
  }
  if (payload?.action) {
    if (payload.action === 'retry') return retrySchedule(config, fetchImpl, text(payload.scheduleId));
    if (payload.action === 'cancel') return cancelSchedule(config, fetchImpl, text(payload.scheduleId));
    throw new HttpError(400, 'Aksi jadwal tidak dikenal.', 'unknown_action');
  }

  // Validasi semua field dulu sebelum transfer video
  const built = buildCreateBody(payload, config, request, typeof now === 'number' ? now : [invalid URL]());

  // Salin video dari OneDrive ke Repliz Storage, lalu pakai URL storage.repliz.com
  const storageUrl = await uploadOneDriveToReplizStorage({
    fileId: text(payload?.fileId),
    fileName: text(payload?.fileName),
    config,
    fetchImpl,
    mintImpl,
  });

  const upstreamBody = {
    ...built.upstream,
    medias: [{ type: 'video', url: storageUrl }],
  };

  const response = await callRepliz(fetchImpl, `${REPLIZ_ORIGIN}/public/schedule`, {
    method: 'POST',
    config,
    body: upstreamBody,
  });
  const result = await readJson(response);
  if (!response.ok) upstreamFailure(response, result, secretsOf(config));
  const scheduleId = text(result?._id || result?.id || result?.data?._id || result?.data?.id);
  return json({ status: 'success', scheduleId, mediaUrl: storageUrl });
}

async function retrySchedule(config, fetchImpl, scheduleId) {
  requireRepliz(config);
  const current = await readSchedule(fetchImpl, config, scheduleId);
  if (current.status !== 'error') {
    throw new HttpError(409, 'Coba lagi hanya untuk jadwal yang gagal.', 'not_retryable');
  }
  const response = await callRepliz(
    fetchImpl,
    `${REPLIZ_ORIGIN}/public/schedule/${encodeURIComponent(scheduleId)}/retry`,
    { method: 'PUT', config },
  );
  const result = await readJson(response);
  if (!response.ok) upstreamFailure(response, result, secretsOf(config));
  return json({ status: 'success', scheduleId });
}

async function cancelSchedule(config, fetchImpl, scheduleId) {
  requireRepliz(config);
  const current = await readSchedule(fetchImpl, config, scheduleId);
  if (current.status !== 'pending') {
    throw new HttpError(409, 'Hanya jadwal berstatus Menunggu yang bisa dibatalkan.', 'not_cancelable');
  }
  const response = await callRepliz(
    fetchImpl,
    `${REPLIZ_ORIGIN}/public/schedule/mass?scheduleIds[]=${encodeURIComponent(scheduleId)}`,
    { method: 'DELETE', config },
  );
  const result = await readJson(response);
  if (!response.ok) upstreamFailure(response, result, secretsOf(config));
  return json({ status: 'success', scheduleId });
}

async function listSchedules(request, config, fetchImpl) {
  const url = new URL(request.url);
  const page = clampPage(url.searchParams.get('page'), 1);
  const limit = Math.min(100, clampPage(url.searchParams.get('limit'), 20));
  const status = text(url.searchParams.get('status')).toLowerCase();
  if (status && !STATUSES.has(status)) {
    throw new HttpError(400, 'Status jadwal tidak dikenal.', 'invalid_status');
  }
  if (!config.accessKey || !config.secretKey) {
    return json({
      configured: false,
      missing: config.missing,
      message: CONFIG_MESSAGE,
      schedules: [],
      page,
      limit,
      totalPages: 0,
      totalDocs: 0,
    });
  }
  const upstream = new URL(`${REPLIZ_ORIGIN}/public/schedule`);
  upstream.searchParams.set('page', String(page));
  upstream.searchParams.set('limit', String(limit));
  if (status) upstream.searchParams.set('status', status);
  const response = await callRepliz(fetchImpl, upstream.toString(), { config });
  const payload = await readJson(response);
  if (!response.ok) upstreamFailure(response, payload, secretsOf(config));
  const secrets = secretsOf(config);
  return json({
    configured: config.configured,
    missing: config.missing,
    message: config.configured ? '' : CONFIG_MESSAGE,
    schedules: asList(payload).map((row) => mapSchedule(row, secrets)).filter(Boolean),
    page: Number(payload?.page) || page,
    limit: Number(payload?.limit) || limit,
    totalPages: Number(payload?.totalPages) || 1,
    totalDocs: Number(payload?.totalDocs) || asList(payload).length,
  });
}

async function listAccounts(config, fetchImpl) {
  if (!config.accessKey || !config.secretKey) {
    return json({
      configured: false,
      missing: config.missing,
      message: CONFIG_MESSAGE,
      accounts: [],
    });
  }
  const response = await callRepliz(
    fetchImpl,
    `${REPLIZ_ORIGIN}/public/account?page=1&limit=100`,
    { config },
  );
  const payload = await readJson(response);
  if (!response.ok) upstreamFailure(response, payload, secretsOf(config));
  return json({
    configured: config.configured,
    missing: config.missing,
    message: config.configured ? '' : 'MEDIA_URL_SECRET belum dikonfigurasi. Draf bisa disusun, tetapi kirim ke Repliz belum bisa.',
    accounts: normalizeAccounts(payload),
  });
}

function fail(err, secrets) {
  if (err instanceof HttpError) {
    const body = {
      error: err.code || 'repliz_error',
      message: redactSecrets(err.message, secrets),
    };
    if (err.extra?.missing) body.missing = err.extra.missing;
    if (typeof err.extra === 'string' && err.extra) body.detail = redactSecrets(err.extra, secrets);
    return json(body, err.status);
  }
  return json({ error: 'repliz_error', message: 'Gagal memproses permintaan Repliz.' }, 502);
}

export async function handleReplizAccountsRequest(request, deps = {}) {
  const env = deps.env || process.env;
  const config = { ...replizConfig(env), env };
  try {
    if (request.method.toUpperCase() !== 'GET') throw new HttpError(405, 'Metode tidak diizinkan.', 'method_not_allowed');
    return await listAccounts(config, deps.fetchImpl || fetch);
  } catch (err) {
    return fail(err, secretsOf(config));
  }
}

export async function handleReplizScheduleRequest(request, deps = {}) {
  const env = deps.env || process.env;
  const config = { ...replizConfig(env), env };
  const fetchImpl = deps.fetchImpl || fetch;
  try {
    const method = request.method.toUpperCase();
    const url = new URL(request.url);
    if (method === 'GET') return await listSchedules(request, config, fetchImpl);
    if (method === 'POST') return await createSchedule(request, config, fetchImpl, [invalid URL], [invalid URL]Impl);
    if (method === 'PUT') return await retrySchedule(config, fetchImpl, text(url.searchParams.get('scheduleId')));
    if (method === 'DELETE') return await cancelSchedule(config, fetchImpl, text(url.searchParams.get('scheduleId')));
    throw new HttpError(405, 'Metode tidak diizinkan.', 'method_not_allowed');
  } catch (err) {
    return fail(err, secretsOf(config));
  }
}

export { buildCreateBody };
