import { fetchAppsScript } from './apps-script.js';
import { isItemId } from './onedrive-plan.js';

const ROW_LIMIT = 2000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function text(value) {
  return value == null ? '' : String(value).trim();
}

function redact(value, token) {
  const raw = typeof value === 'string' ? value : '';
  if (!token || token.length < 4 || !raw.includes(token)) return raw;
  return raw.split(token).join('[redacted]');
}

function asRows(payload) {
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export function normalizeAssetRows(rows) {
  const out = [];
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (out.length >= ROW_LIMIT) break;
    const id = text(row?.Cloud_File_ID || row?.cloudFileId || row?.idFile || row?.Id_File || row?.id);
    const name = text(row?.namaFile || row?.Nama_File || row?.name).slice(0, 300);
    const path = text(row?.pathFolder || row?.Path_Folder || row?.path).slice(0, 500);
    if (!isItemId(id) || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name, path });
  }
  return out;
}

export async function handleReplizAssetsRequest(request, deps = {}) {
  const env = deps.env || process.env;
  const token = text(env.APPS_SCRIPT_TOKEN);
  try {
    if (request.method.toUpperCase() !== 'GET') throw new HttpError(405, 'Metode tidak diizinkan.');
    const appsUrl = text(env.APPS_SCRIPT_URL);
    if (!appsUrl || !token) {
      return json({
        configured: false,
        rows: [],
        message: 'FILE_ASSET belum bisa dibaca dari server. Daftar video memakai Video Final yang sudah termuat di dashboard, bila ada.',
      });
    }

    const target = new URL(appsUrl);
    target.searchParams.set('token', token);
    let upstream;
    try {
      upstream = await fetchAppsScript(target.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'get_file_assets', data: {}, token }),
      }, deps.requestImpl);
    } catch {
      throw new HttpError(502, 'Gagal membaca FILE_ASSET.');
    }

    const raw = Buffer.isBuffer(upstream?.body) ? upstream.body.toString('utf8') : String(upstream?.body ?? '');
    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }
    if (!upstream || upstream.status >= 400 || !payload || payload.status === 'error' || !Array.isArray(payload.rows)) {
      return json({
        configured: false,
        rows: [],
        message: 'FILE_ASSET belum terbaca. Daftar video memakai Video Final yang sudah termuat di dashboard, bila ada.',
      });
    }
    return json({ configured: true, rows: normalizeAssetRows(asRows(payload)), message: '' });
  } catch (err) {
    const message = redact(err instanceof HttpError ? err.message : 'Gagal membaca FILE_ASSET.', token);
    const status = err instanceof HttpError ? err.status : 502;
    return json({ configured: false, rows: [], message }, status);
  }
}
