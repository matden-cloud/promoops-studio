import http from 'node:http';
import https from 'node:https';
import { fetchAppsScript } from './apps-script.js';
import {
  ONEDRIVE_DEVICE_CODE_URL,
  ONEDRIVE_SCOPE,
  ONEDRIVE_TOKEN_URL,
  childrenGraphUrl,
  createLinkGraphUrl,
  indexAssets,
  isAllowedChildrenUrl,
  isAllowedCreateLink,
  isAllowedGraphRead,
  isAllowedItemContentUrl,
  isAllowedPlaybackUrl,
  isItemId,
  itemContentGraphUrl,
  itemMetaGraphUrl,
  normalizeStats,
  parseCursor,
  planDriveItem,
  pushSyncDetail,
  rootGraphUrl,
  safeHttpsUrl,
  safeVerificationUri,
  targetById,
} from './onedrive-plan.js';

const SYNC_BUDGET_MS = 45_000;
const SYNC_MAX_ITEMS = 80;
const GRAPH_TIMEOUT_MS = 25_000;

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
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

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function asText(body) {
  if (body == null) return '';
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(body)) return body.toString('utf8');
  if (body instanceof Uint8Array) return Buffer.from(body).toString('utf8');
  return String(body);
}

function parseJsonSafe(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    return {};
  }
}

function parseJsonObject(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  try {
    const value = JSON.parse(trimmed);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value;
  } catch {
    return null;
  }
}

function scrubString(text, secrets) {
  let out = String(text);
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 12 && out.includes(secret)) {
      out = out.split(secret).join('[redacted]');
    }
  }
  return out;
}

const DROPPED_KEYS = new Set([
  'accessToken',
  'refreshToken',
  'deviceCode',
  'access_token',
  'refresh_token',
  'device_code',
  'token',
  'client_secret',
]);

function scrubValue(value, secrets) {
  if (typeof value === 'string') return scrubString(value, secrets);
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, secrets));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (DROPPED_KEYS.has(key)) continue;
      out[key] = scrubValue(item, secrets);
    }
    return out;
  }
  return value;
}

function defaultRequest(url, { method = 'GET', headers, body } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === 'https:' ? https : http;
    const options = { method };
    if (headers) options.headers = headers;

    const req = lib.request(target, options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });

    req.setTimeout(GRAPH_TIMEOUT_MS, () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', reject);
    if (body != null && method !== 'GET' && method !== 'HEAD') req.write(body);
    req.end();
  });
}

function chunk(list, size) {
  const parts = [];
  for (let index = 0; index < list.length; index += size) {
    parts.push(list.slice(index, index + size));
  }
  return parts;
}

function remember(secrets, value) {
  if (typeof value === 'string' && value.length >= 12) secrets.push(value);
}

function requireClientId(env) {
  const clientId = typeof env.ONEDRIVE_CLIENT_ID === 'string' ? env.ONEDRIVE_CLIENT_ID.trim() : '';
  if (!/^[0-9a-fA-F-]{8,80}$/.test(clientId)) {
    throw new HttpError(500, 'Konfigurasi OneDrive belum lengkap. Isi ONEDRIVE_CLIENT_ID di Vercel.');
  }
  return clientId;
}

function requireAppsScript(env) {
  const url = env.APPS_SCRIPT_URL;
  const token = typeof env.APPS_SCRIPT_TOKEN === 'string' ? env.APPS_SCRIPT_TOKEN.trim() : '';
  if (!isConfigured(url) || !isHttpUrl(url) || !token) {
    throw new HttpError(500, 'Konfigurasi server Apps Script belum lengkap.');
  }
  return { url: url.trim(), token };
}

async function postAppsScript(env, requestImpl, action, data, secrets) {
  const apps = requireAppsScript(env);
  remember(secrets, apps.token);
  const target = new URL(apps.url);
  target.searchParams.set('token', apps.token);

  let upstream;
  try {
    upstream = await fetchAppsScript(target.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, data: data ?? {}, token: apps.token }),
    }, requestImpl);
  } catch {
    throw new HttpError(502, 'Gagal menghubungi Apps Script.');
  }

  const parsed = parseJsonObject(scrubString(asText(upstream.body), secrets));
  if (!parsed) {
    throw new HttpError(502, 'Balasan Apps Script tidak terbaca. Responsnya bukan JSON.');
  }
  if (upstream.status === 401 || parsed.message === 'Unauthorized') {
    throw new HttpError(502, 'Apps Script menolak token. Periksa APPS_SCRIPT_TOKEN.');
  }
  if (action === 'get_onedrive_token' && !Object.hasOwn(parsed, 'refreshToken') && parsed.status !== 'error') {
    throw new HttpError(502, 'Apps Script belum punya aksi OneDrive. Tempel snippet lalu deploy versi baru pada deployment yang sama.');
  }
  if (upstream.status < 200 || upstream.status >= 300 || parsed.status === 'error') {
    const message = typeof parsed.message === 'string' && parsed.message.trim()
      ? parsed.message.trim()
      : 'Gagal menyimpan data ke Google Sheets.';
    throw new HttpError(502, message);
  }
  remember(secrets, parsed.refreshToken);
  remember(secrets, parsed.deviceCode);
  return parsed;
}

function microsoftFailureMessage(parsed, fallback) {
  const code = String(parsed?.error || '');
  const description = String(parsed?.error_description || '');
  if (code === 'invalid_client' || description.includes('7000218') || /client_secret/i.test(description)) {
    return 'Microsoft menolak client publik. Nyalakan Allow public client flows, dan pastikan audience-nya akun organisasi mana pun serta akun Microsoft pribadi.';
  }
  const known = {
    authorization_declined: 'Masuk OneDrive dibatalkan.',
    access_denied: 'Izin OneDrive ditolak.',
    expired_token: 'Kode masuk kedaluwarsa. Mulai ulang hubungkan OneDrive.',
    bad_verification_code: 'Kode perangkat tidak berlaku. Mulai ulang hubungkan OneDrive.',
    invalid_grant: 'Kode masuk tidak berlaku lagi. Mulai ulang hubungkan OneDrive.',
    interaction_required: 'Sesi OneDrive berakhir. Hubungkan ulang dari dashboard.',
  };
  if (known[code]) return known[code];
  return code ? `${fallback} (${code})` : fallback;
}

async function microsoftToken(requestImpl, body) {
  let response;
  try {
    response = await requestImpl(ONEDRIVE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch {
    throw new HttpError(502, 'Gagal menghubungi Microsoft.');
  }
  const parsed = parseJsonSafe(asText(response.body));
  return { status: response.status || 0, parsed };
}

async function readJsonBody(request) {
  if (request.method.toUpperCase() === 'GET' || request.method.toUpperCase() === 'HEAD') return {};
  try {
    const payload = await request.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new HttpError(400, 'Body JSON tidak valid.');
    }
    return payload;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, 'Body JSON tidak valid.');
  }
}

async function graphCall(requestImpl, url, accessToken, options = {}) {
  const method = options.method || 'GET';
  const allowed = method === 'POST' ? isAllowedCreateLink(url) : isAllowedGraphRead(url);
  if (!allowed) throw new HttpError(502, 'Permintaan OneDrive ditolak.');

  let response;
  try {
    response = await requestImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body,
    });
  } catch (err) {
    if (err && err.message === 'timeout') {
      throw new HttpError(504, 'OneDrive terlalu lama membalas. Jalankan sinkron lagi; file yang sudah tersimpan tidak diulang.');
    }
    throw new HttpError(502, 'Gagal menghubungi OneDrive.');
  }
  return {
    status: response.status || 0,
    parsed: parseJsonSafe(asText(response.body)),
  };
}

function needsLoginError(message) {
  return new HttpError(401, message, { needsLogin: true });
}

async function refreshAccessToken({ env, requestImpl, refreshToken, secrets }) {
  const clientId = requireClientId(env);
  remember(secrets, refreshToken);
  const { status, parsed } = await microsoftToken(requestImpl, new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: ONEDRIVE_SCOPE,
  }));
  remember(secrets, parsed.access_token);
  remember(secrets, parsed.refresh_token);

  if (status !== 200 || !parsed.access_token) {
    const invalid = parsed.error === 'invalid_grant' || parsed.error === 'interaction_required';
    if (invalid) {
      throw needsLoginError('Sesi OneDrive berakhir. Hubungkan ulang dari dashboard.');
    }
    throw new HttpError(502, microsoftFailureMessage(parsed, 'Gagal memperbarui token OneDrive.'));
  }

  const nextRefresh = parsed.refresh_token || refreshToken;
  await postAppsScript(env, requestImpl, 'save_onedrive_token', { refreshToken: nextRefresh }, secrets);
  return { accessToken: parsed.access_token, refreshToken: nextRefresh };
}

async function graphCallWithRefresh(requestImpl, url, auth, options, refresh) {
  let result = await graphCall(requestImpl, url, auth.accessToken, options);
  if (result.status !== 401) return result;
  const next = await refresh();
  auth.accessToken = next.accessToken;
  auth.refreshToken = next.refreshToken;
  result = await graphCall(requestImpl, url, auth.accessToken, options);
  if (result.status === 401) {
    throw needsLoginError('Sesi OneDrive berakhir. Hubungkan ulang dari dashboard.');
  }
  return result;
}

function takeFolder(state, visited, queued) {
  while (state.queue.length) {
    const next = state.queue.shift();
    queued.delete(next.id);
    if (visited.has(next.id)) continue;
    visited.add(next.id);
    state.visited.push(next.id);
    if (state.visited.length > 5000) {
      throw new HttpError(400, 'Terlalu banyak folder untuk satu sinkron.');
    }
    return next;
  }
  return null;
}

async function runSyncBatch({ env, requestImpl, target, cursor, stats, now, budgetMs, maxItems, secrets }) {
  const tokenState = await postAppsScript(env, requestImpl, 'get_onedrive_token', {}, secrets);
  const refreshToken = String(tokenState.refreshToken || '').trim();
  if (!refreshToken) {
    throw needsLoginError('OneDrive belum terhubung. Masuk sekali dengan kode perangkat.');
  }

  const auth = await refreshAccessToken({ env, requestImpl, refreshToken, secrets });
  const assets = await postAppsScript(env, requestImpl, 'get_file_assets', {}, secrets);
  if (!Array.isArray(assets.rows)) {
    throw new HttpError(502, 'Data FILE_ASSET tidak lengkap.');
  }

  const { byId, seenNames } = indexAssets(assets.rows);
  const kembarSeen = new Set(stats.kembar);
  const updates = [];
  const inserts = [];

  const refresh = () => refreshAccessToken({
    env,
    requestImpl,
    refreshToken: auth.refreshToken,
    secrets,
  });

  let state = cursor;
  if (!state) {
    const rootUrl = rootGraphUrl(target.path);
    const root = await graphCallWithRefresh(requestImpl, rootUrl, auth, {}, refresh);
    if (root.status === 404) {
      throw new HttpError(404, `Folder OneDrive tidak ditemukan: ${target.path}`);
    }
    if (root.status === 403) {
      throw new HttpError(403, 'Tidak ada izin membaca folder OneDrive itu.');
    }
    if (root.status !== 200 || !root.parsed.id) {
      throw new HttpError(502, 'Gagal membaca folder OneDrive.');
    }
    if (!root.parsed.folder) {
      throw new HttpError(400, `Jalur itu bukan folder OneDrive: ${target.path}`);
    }
    const rootId = String(root.parsed.id);
    state = {
      target: target.id,
      queue: [],
      pageUrl: childrenGraphUrl(rootId),
      skip: 0,
      pageFolderLink: safeHttpsUrl(root.parsed.webUrl || ''),
      visited: [rootId],
    };
  }

  const visited = new Set(state.visited);
  const queued = new Set(state.queue.map((item) => item.id));
  const deadline = now() + budgetMs;
  let acted = 0;
  let done = false;
  let page = null;

  while (!done) {
    if (acted > 0 && (now() >= deadline || acted >= maxItems)) break;

    if (!state.pageUrl) {
      const nextFolder = takeFolder(state, visited, queued);
      if (!nextFolder) {
        done = true;
        break;
      }
      state.pageUrl = childrenGraphUrl(nextFolder.id);
      state.pageFolderLink = nextFolder.link || '';
      state.skip = 0;
      page = null;
      continue;
    }

    if (!page || page.url !== state.pageUrl) {
      const listed = await graphCallWithRefresh(requestImpl, state.pageUrl, auth, {}, refresh);
      if (listed.status === 403) throw new HttpError(403, 'Tidak ada izin membaca folder OneDrive itu.');
      if (listed.status === 404) throw new HttpError(404, 'Sebagian folder OneDrive tidak ditemukan.');
      if (listed.status !== 200 || !Array.isArray(listed.parsed.value)) {
        throw new HttpError(502, 'Gagal membaca isi folder OneDrive.');
      }
      const nextLink = listed.parsed['@odata.nextLink'] || null;
      if (nextLink && !isAllowedChildrenUrl(nextLink)) {
        throw new HttpError(502, 'Halaman berikutnya dari OneDrive tidak dikenali.');
      }
      page = {
        url: state.pageUrl,
        items: listed.parsed.value,
        nextLink: nextLink || null,
      };
    }

    if (state.skip >= page.items.length) {
      state.pageUrl = page.nextLink;
      state.skip = 0;
      page = null;
      acted += 1;
      continue;
    }

    const item = page.items[state.skip];
    state.skip += 1;
    acted += 1;
    const decision = planDriveItem(item, state.pageFolderLink, byId);

    if (decision.action === 'folder') {
      if (!visited.has(decision.id) && !queued.has(decision.id)) {
        state.queue.push({ id: decision.id, link: decision.link });
        queued.add(decision.id);
      }
      continue;
    }
    if (decision.action === 'ignore') continue;
    if (decision.action === 'skip') {
      stats.dilewati += 1;
      continue;
    }
    if (decision.action === 'update') {
      const previous = byId.get(decision.update.idFile) || { namaFile: '', pathFolder: '' };
      updates.push(decision.update);
      pushSyncDetail(stats.daftarDiubah, {
        namaLama: previous.namaFile,
        pathLama: previous.pathFolder,
        namaBaru: decision.update.namaFile,
        pathBaru: decision.update.pathFolder,
      });
      byId.set(decision.update.idFile, {
        namaFile: decision.update.namaFile,
        pathFolder: decision.update.pathFolder,
      });
      stats.diperbarui += 1;
      continue;
    }

    if (decision.action !== 'insert') continue;

    if (decision.share) {
      const linkUrl = createLinkGraphUrl(decision.row.Id_File);
      const linked = await graphCallWithRefresh(requestImpl, linkUrl, auth, {
        method: 'POST',
        body: JSON.stringify({ type: 'view' }),
      }, refresh);
      if (linked.status === 401) {
        throw needsLoginError('Sesi OneDrive berakhir. Hubungkan ulang dari dashboard.');
      }
      if (linked.status === 200 || linked.status === 201) {
        const shareUrl = safeHttpsUrl(linked.parsed?.link?.webUrl || '');
        if (shareUrl) decision.row.Link_HP = shareUrl;
      }
    }

    const namaKey = decision.nama.trim().toLowerCase();
    if (namaKey && seenNames.has(namaKey)) {
      if (!kembarSeen.has(decision.nama) && stats.kembar.length < 500) {
        kembarSeen.add(decision.nama);
        stats.kembar.push(decision.nama);
      }
    } else if (namaKey) {
      seenNames.add(namaKey);
    }

    inserts.push(decision.row);
    pushSyncDetail(stats.daftarBaru, {
      nama: decision.row.Nama_File,
      path: decision.row.Path_Folder,
    });
    byId.set(decision.row.Id_File, {
      namaFile: decision.row.Nama_File,
      pathFolder: decision.row.Path_Folder,
    });
    stats.baru += 1;
  }

  const updateChunks = chunk(updates, 100);
  const insertChunks = chunk(inserts, 100);
  const calls = Math.max(updateChunks.length, insertChunks.length);
  for (let index = 0; index < calls; index += 1) {
    await postAppsScript(env, requestImpl, 'upsert_file_assets', {
      updates: updateChunks[index] || [],
      inserts: insertChunks[index] || [],
    }, secrets);
  }

  return {
    status: 'success',
    done,
    target: target.id,
    label: target.label,
    folder: target.path,
    stats,
    cursor: done ? null : {
      target: target.id,
      queue: state.queue,
      pageUrl: state.pageUrl,
      skip: state.skip,
      pageFolderLink: state.pageFolderLink,
      visited: state.visited,
    },
  };
}

async function startLogin({ env, requestImpl, now, secrets }) {
  const clientId = requireClientId(env);
  let response;
  try {
    response = await requestImpl(ONEDRIVE_DEVICE_CODE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        scope: ONEDRIVE_SCOPE,
      }).toString(),
    });
  } catch {
    throw new HttpError(502, 'Gagal menghubungi Microsoft.');
  }

  const parsed = parseJsonSafe(asText(response.body));
  remember(secrets, parsed.device_code);
  if ((response.status || 0) !== 200 || !parsed.device_code || !parsed.user_code) {
    throw new HttpError(502, microsoftFailureMessage(parsed, 'Gagal memulai masuk OneDrive.'));
  }

  const expiresIn = Number(parsed.expires_in) > 0 ? Number(parsed.expires_in) : 900;
  const interval = Math.max(5, Number(parsed.interval) || 5);
  await postAppsScript(env, requestImpl, 'save_onedrive_token', {
    deviceCode: parsed.device_code,
    deviceExpires: String(now() + expiresIn * 1000),
    pollInterval: String(interval),
  }, secrets);

  return {
    status: 'success',
    userCode: String(parsed.user_code),
    verificationUri: safeVerificationUri(parsed.verification_uri || parsed.verification_url),
    interval,
    expiresIn,
    message: 'Masukkan kode ini di halaman Microsoft, lalu kembali ke dashboard.',
  };
}

async function pollLogin({ env, requestImpl, now, secrets }) {
  const clientId = requireClientId(env);
  const tokenState = await postAppsScript(env, requestImpl, 'get_onedrive_token', {}, secrets);
  const deviceCode = String(tokenState.deviceCode || '').trim();
  if (!deviceCode) {
    throw new HttpError(400, 'Tidak ada proses masuk yang menunggu. Klik Hubungkan OneDrive.');
  }
  remember(secrets, deviceCode);

  const expires = Number(tokenState.deviceExpires) || 0;
  if (expires && now() > expires) {
    await postAppsScript(env, requestImpl, 'save_onedrive_token', {
      deviceCode: '',
      deviceExpires: '',
      pollInterval: '',
    }, secrets);
    throw new HttpError(400, 'Kode masuk kedaluwarsa. Mulai ulang hubungkan OneDrive.');
  }

  const { status, parsed } = await microsoftToken(requestImpl, new URLSearchParams({
    client_id: clientId,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    device_code: deviceCode,
  }));
  remember(secrets, parsed.access_token);
  remember(secrets, parsed.refresh_token);

  if (parsed.error === 'authorization_pending' || parsed.error === 'slow_down') {
    const current = Math.max(5, Number(tokenState.pollInterval) || 5);
    const interval = parsed.error === 'slow_down' ? current + 5 : current;
    return { status: 'pending', interval };
  }

  if (status !== 200 || !parsed.refresh_token) {
    const consumed = status === 200 || new Set([
      'authorization_declined',
      'access_denied',
      'expired_token',
      'bad_verification_code',
      'invalid_grant',
    ]).has(parsed.error);
    if (consumed) {
      await postAppsScript(env, requestImpl, 'save_onedrive_token', {
        deviceCode: '',
        deviceExpires: '',
        pollInterval: '',
      }, secrets);
    }
    throw new HttpError(400, microsoftFailureMessage(parsed, 'Gagal masuk OneDrive.'));
  }

  await postAppsScript(env, requestImpl, 'save_onedrive_token', {
    refreshToken: parsed.refresh_token,
    deviceCode: '',
    deviceExpires: '',
    pollInterval: '',
  }, secrets);

  return { status: 'connected' };
}

function publicError(err, secrets) {
  const status = err instanceof HttpError ? err.status : 502;
  const message = err instanceof HttpError ? err.message : 'Gagal memproses permintaan OneDrive.';
  const body = { status: 'error', message: scrubString(message, secrets) };
  if (err instanceof HttpError && err.extra?.needsLogin) body.needsLogin = true;
  return json(scrubValue(body, secrets), status);
}

function redirect(location) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function playbackUrlOrNull(value, secrets) {
  if (!isAllowedPlaybackUrl(value)) return null;
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 12 && value.includes(secret)) return null;
  }
  return value;
}

function locationOf(response) {
  const headers = response?.headers || {};
  return headers.location || headers.Location || '';
}

async function graphContentLocation(requestImpl, url, accessToken) {
  if (!isAllowedItemContentUrl(url)) throw new HttpError(502, 'Permintaan OneDrive ditolak.');
  let response;
  try {
    response = await requestImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    if (err && err.message === 'timeout') {
      throw new HttpError(504, 'OneDrive terlalu lama membalas.');
    }
    throw new HttpError(502, 'Gagal menghubungi OneDrive.');
  }
  return {
    status: response.status || 0,
    location: typeof locationOf(response) === 'string' ? locationOf(response) : '',
  };
}

async function resolvePlaybackUrl({ requestImpl, itemId, auth, refresh, secrets }) {
  const meta = await graphCallWithRefresh(requestImpl, itemMetaGraphUrl(itemId), auth, {}, refresh);
  if (meta.status === 404) throw new HttpError(404, 'File OneDrive tidak ditemukan.');
  if (meta.status === 403) throw new HttpError(403, 'Tidak ada izin membaca file OneDrive itu.');
  if (meta.status !== 200) throw new HttpError(502, 'Gagal membaca file OneDrive.');
  const fromMeta = playbackUrlOrNull(meta.parsed?.['@microsoft.graph.downloadUrl'], secrets);
  if (fromMeta) return fromMeta;

  let content = await graphContentLocation(requestImpl, itemContentGraphUrl(itemId), auth.accessToken);
  if (content.status === 401) {
    const next = await refresh();
    auth.accessToken = next.accessToken;
    auth.refreshToken = next.refreshToken;
    content = await graphContentLocation(requestImpl, itemContentGraphUrl(itemId), auth.accessToken);
  }
  if (content.status === 401) {
    throw needsLoginError('Sesi OneDrive berakhir. Hubungkan ulang dari dashboard.');
  }
  const fromContent = playbackUrlOrNull(content.location, secrets);
  if (fromContent) return fromContent;
  throw new HttpError(502, 'File OneDrive tidak bisa diputar.');
}

export async function handleOneDriveStreamRequest(request, deps = {}) {
  const env = deps.env || process.env;
  const requestImpl = deps.requestImpl || defaultRequest;
  const secrets = [];

  try {
    if (request.method.toUpperCase() !== 'GET' && request.method.toUpperCase() !== 'HEAD') {
      throw new HttpError(405, 'Metode tidak diizinkan.');
    }
    const itemId = new URL(request.url).searchParams.get('id');
    if (!isItemId(typeof itemId === 'string' ? itemId.trim() : '')) {
      throw new HttpError(400, 'Id file OneDrive tidak valid.');
    }
    const id = itemId.trim();

    const tokenState = await postAppsScript(env, requestImpl, 'get_onedrive_token', {}, secrets);
    const refreshToken = String(tokenState.refreshToken || '').trim();
    if (!refreshToken) {
      throw needsLoginError('OneDrive belum terhubung. Masuk sekali dengan kode perangkat.');
    }
    const auth = await refreshAccessToken({ env, requestImpl, refreshToken, secrets });
    const refresh = () => refreshAccessToken({
      env,
      requestImpl,
      refreshToken: auth.refreshToken,
      secrets,
    });
    const playback = await resolvePlaybackUrl({ requestImpl, itemId: id, auth, refresh, secrets });
    return redirect(playback);
  } catch (err) {
    return publicError(err, secrets);
  }
}

export async function handleOneDriveLoginRequest(request, deps = {}) {
  const env = deps.env || process.env;
  const requestImpl = deps.requestImpl || defaultRequest;
  const now = deps.now || Date.now;
  const secrets = [];

  try {
    const method = request.method.toUpperCase();
    if (method === 'GET') {
      const tokenState = await postAppsScript(env, requestImpl, 'get_onedrive_token', {}, secrets);
      return json({
        status: 'success',
        connected: String(tokenState.refreshToken || '').trim() !== '',
      });
    }
    if (method !== 'POST') throw new HttpError(405, 'Metode tidak diizinkan.');

    const payload = await readJsonBody(request);
    if (payload.action === 'start') {
      return json(scrubValue(await startLogin({ env, requestImpl, now, secrets }), secrets));
    }
    if (payload.action === 'poll') {
      return json(scrubValue(await pollLogin({ env, requestImpl, now, secrets }), secrets));
    }
    throw new HttpError(400, 'Aksi masuk OneDrive tidak dikenal.');
  } catch (err) {
    return publicError(err, secrets);
  }
}

export async function handleOneDriveSyncRequest(request, deps = {}) {
  const env = deps.env || process.env;
  const requestImpl = deps.requestImpl || defaultRequest;
  const now = deps.now || Date.now;
  const budgetMs = Number.isFinite(deps.budgetMs) ? deps.budgetMs : SYNC_BUDGET_MS;
  const maxItems = Number.isFinite(deps.maxItems) ? deps.maxItems : SYNC_MAX_ITEMS;
  const secrets = [];

  try {
    const method = request.method.toUpperCase();
    if (method !== 'GET' && method !== 'POST') throw new HttpError(405, 'Metode tidak diizinkan.');

    const payload = await readJsonBody(request);
    const url = new URL(request.url);
    const target = targetById(typeof payload.target === 'string' ? payload.target : url.searchParams.get('target'));
    if (!target) {
      throw new HttpError(400, 'Folder sinkron tidak dikenal. Pilih Video Final atau Mentahan.');
    }

    const parsedCursor = method === 'POST' ? parseCursor(payload.cursor, target.id) : { cursor: null };
    if (parsedCursor.error) throw new HttpError(400, parsedCursor.error);

    const stats = normalizeStats(method === 'POST' ? payload.stats : null);
    const body = await runSyncBatch({
      env,
      requestImpl,
      target,
      cursor: parsedCursor.cursor,
      stats,
      now,
      budgetMs,
      maxItems,
      secrets,
    });
    return json(scrubValue(body, secrets));
  } catch (err) {
    return publicError(err, secrets);
  }
}
