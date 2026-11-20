import { createHmac, timingSafeEqual } from 'node:crypto';
import { isItemId } from './onedrive-plan.js';
import { mintOneDriveDownloadUrl } from './onedrive.js';
import { MEDIA_MAX_WINDOW_MS } from './jadwal-repliz.js';

const REPLIZ_ORIGIN = 'https://api.repliz.com';
export const MEDIA_PATH = '/api/repliz-media';

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

export function isConfiguredSecret(value) {
  return typeof value === 'string' && value.trim().length >= 16;
}

function loopback(host) {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function safeHost(host) {
  const name = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (loopback(name)) return true;
  if (!name.includes('.') || name.length > 253) return false;
  if (!/^[a-z0-9.-]+$/.test(name)) return false;
  if (name.startsWith('.') || name.endsWith('.') || name.includes('..')) return false;
  return name.split('.').every((label) => label && label.length <= 63 && !label.startsWith('-') && !label.endsWith('-'));
}

export function parsePublicOrigin(value, { allowHttpLoopback = false } = {}) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  const withScheme = raw.includes('://') ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return '';
  }
  if (url.username || url.password) return '';
  const host = url.hostname.toLowerCase();
  if (!safeHost(host)) return '';
  if (url.protocol === 'https:') return url.origin;
  if (allowHttpLoopback && url.protocol === 'http:' && loopback(host)) return url.origin;
  return '';
}

function hostnameOf(value) {
  const origin = parsePublicOrigin(value, { allowHttpLoopback: true });
  if (!origin) return '';
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function requestOriginIfAllowed(requestUrl, env) {
  let url;
  try {
    url = new URL(requestUrl);
  } catch {
    return '';
  }
  if (url.username || url.password) return '';
  const host = url.hostname.toLowerCase();
  if (loopback(host) && (url.protocol === 'http:' || url.protocol === 'https:')) return url.origin;
  if (url.protocol !== 'https:' || !safeHost(host)) return '';
  const allowed = new Set([hostnameOf(env.VERCEL_PROJECT_PRODUCTION_URL), hostnameOf(env.VERCEL_URL)].filter(Boolean));
  if (!allowed.has(host)) return '';
  return url.origin;
}

export function resolvePublicOrigin(env = {}, requestUrl = '') {
  const fromPublic = parsePublicOrigin(env.PUBLIC_APP_URL, { allowHttpLoopback: true });
  if (fromPublic) return fromPublic;
  const fromProject = parsePublicOrigin(env.VERCEL_PROJECT_PRODUCTION_URL);
  if (fromProject) return fromProject;
  return requestOriginIfAllowed(requestUrl, env);
}

export function canonicalExp(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d{10,12}$/.test(raw)) return '';
  const number = Number(raw);
  if (!Number.isSafeInteger(number) || number <= 0) return '';
  return String(number);
}

export function mediaSignature(secret, id, exp) {
  return createHmac('sha256', secret).update(`${id}.${exp}`).digest('hex');
}

export function signaturesMatch(left, right) {
  const a = Buffer.from(String(left || '').toLowerCase(), 'utf8');
  const b = Buffer.from(String(right || '').toLowerCase(), 'utf8');
  if (a.length === 0 || b.length === 0) return false;
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function signMediaUrl({ origin, itemId, exp, secret }) {
  const base = parsePublicOrigin(origin, { allowHttpLoopback: true });
  const id = typeof itemId === 'string' ? itemId.trim() : '';
  const stamp = canonicalExp(exp);
  if (!base || !isItemId(id) || !stamp || !isConfiguredSecret(secret)) return '';
  const url = new URL(MEDIA_PATH, base);
  url.searchParams.set('id', id);
  url.searchParams.set('exp', stamp);
  url.searchParams.set('sig', mediaSignature(secret.trim(), id, stamp));
  return url.toString();
}

function redirect(location) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex',
    },
  });
}

function secretOf(env) {
  return typeof env.MEDIA_URL_SECRET === 'string' ? env.MEDIA_URL_SECRET.trim() : '';
}

export async function handleReplizMediaRequest(request, deps = {}) {
  const env = deps.env || process.env;
  const mint = deps.mintImpl || mintOneDriveDownloadUrl;
  try {
    const method = request.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      throw new HttpError(405, 'Metode tidak diizinkan.', 'method_not_allowed');
    }
    const url = new URL(request.url);
    const id = (url.searchParams.get('id') || '').trim();
    const exp = canonicalExp(url.searchParams.get('exp'));
    const sig = (url.searchParams.get('sig') || '').trim().toLowerCase();
    if (!isItemId(id) || !exp || !/^[a-f0-9]{64}$/.test(sig)) {
      throw new HttpError(400, 'Tautan media tidak lengkap.', 'invalid_media_url');
    }
    const secret = secretOf(env);
    if (!isConfiguredSecret(secret)) {
      throw new HttpError(503, 'MEDIA_URL_SECRET belum dikonfigurasi di server. URL media tidak ditandatangani.', 'missing_media_secret');
    }
    const expected = mediaSignature(secret, id, exp);
    if (!signaturesMatch(expected, sig)) {
      throw new HttpError(403, 'Tanda tangan tautan media tidak valid.', 'bad_signature');
    }
    const expMs = Number(exp) * 1000;
    const now = typeof deps.now === 'number' ? deps.now : Date.now();
    if (expMs <= now) {
      throw new HttpError(410, 'Tautan media sudah kedaluwarsa.', 'expired');
    }
    if (expMs > now + MEDIA_MAX_WINDOW_MS + 120_000) {
      throw new HttpError(403, 'Masa berlaku tautan media terlalu panjang.', 'exp_too_long');
    }
    const minted = await mint({ env, requestImpl: deps.requestImpl, itemId: id });
    if (!minted?.ok || typeof minted.url !== 'string' || !minted.url.startsWith('https://')) {
      const status = Number(minted?.status) || 502;
      throw new HttpError(status, minted?.message || 'Gagal menyiapkan file OneDrive.', 'onedrive_error');
    }
    return redirect(minted.url);
  } catch (err) {
    if (err instanceof HttpError) {
      return json({ error: err.code, message: err.message }, err.status);
    }
    return json({ error: 'media_error', message: 'Gagal membuka file media.' }, 502);
  }
}

export { REPLIZ_ORIGIN };
