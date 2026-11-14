import https from 'node:https';
import {
  buildTikTokEmbedUrl,
  buildTikTokPageUrl,
  inspectTikTokUrl,
  videoIdInText,
} from './tiktok-url.js';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 8000;
const OVERALL_TIMEOUT_MS = 12000;
const MAX_BODY_BYTES = 32 * 1024;
export const TIKTOK_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 400;

const sharedCache = new Map();

class TikTokError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(body, status = 200, cacheControl = 'no-store') {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': cacheControl },
  });
}

function headerValue(headers, name) {
  if (!headers) return '';
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function nowOf(deps) {
  if (typeof deps.now === 'function') return deps.now();
  if (typeof deps.now === 'number') return deps.now;
  return Date.now();
}

function cacheGet(cache, key, now) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= now) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, hit);
  return hit.value;
}

function cacheSet(cache, key, value, now) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { value, expiresAt: now + TIKTOK_CACHE_TTL_MS });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

function resultOf(videoId, source) {
  const embedUrl = buildTikTokEmbedUrl(videoId);
  const pageUrl = buildTikTokPageUrl(videoId);
  if (!embedUrl || !pageUrl) {
    throw new TikTokError(502, 'ID video TikTok tidak valid.');
  }
  return { videoId, embedUrl, pageUrl, source };
}

function defaultRequest(url, { timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(value);
    };

    let target;
    try {
      target = new URL(url);
    } catch (err) {
      finish(err);
      return;
    }

    const req = https.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 443,
      path: `${target.pathname}${target.search}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
      },
    }, (res) => {
      const chunks = [];
      let size = 0;
      const done = () => finish(null, {
        status: res.statusCode || 0,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      res.on('data', (chunk) => {
        if (size >= MAX_BODY_BYTES) return;
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const room = MAX_BODY_BYTES - size;
        chunks.push(buf.length > room ? buf.subarray(0, room) : buf);
        size += buf.length;
        if (size >= MAX_BODY_BYTES) {
          res.destroy();
          done();
        }
      });
      res.on('end', done);
      res.on('error', done);
    });

    req.setTimeout(timeoutMs, () => {
      const error = new Error('timeout');
      error.code = 'TIMEOUT';
      req.destroy(error);
    });
    req.on('error', (err) => finish(err));
    req.end();
  });
}

function rejectTarget(inspected) {
  if (inspected.reason === 'host') {
    throw new TikTokError(400, 'Hanya tautan TikTok yang diizinkan.');
  }
  throw new TikTokError(400, 'Tautan TikTok tidak valid.');
}

function nextHop(location, current) {
  let next;
  try {
    next = new URL(location, current).toString();
  } catch {
    throw new TikTokError(502, 'Pengalihan tautan TikTok ditolak.');
  }
  const inspected = inspectTikTokUrl(next);
  if (!inspected.ok) {
    throw new TikTokError(502, 'Pengalihan tautan TikTok ditolak.');
  }
  return inspected;
}

export async function resolveTikTokTarget(input, deps = {}) {
  const inspected = inspectTikTokUrl(input);
  if (!inspected.ok) rejectTarget(inspected);
  if (inspected.videoId) return resultOf(inspected.videoId, 'parsed');

  const cache = deps.cache || sharedCache;
  const now = nowOf(deps);
  const cached = cacheGet(cache, inspected.href, now);
  if (cached) return { ...cached, source: 'cache' };

  const requestImpl = deps.requestImpl || defaultRequest;
  const started = now;
  let current = inspected.href;
  const seen = new Set([current]);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const elapsed = nowOf(deps) - started;
    const timeoutMs = Math.min(REQUEST_TIMEOUT_MS, OVERALL_TIMEOUT_MS - elapsed);
    if (timeoutMs < 500) {
      throw new TikTokError(502, 'Waktu membaca tautan TikTok habis.');
    }

    let response;
    try {
      response = await requestImpl(current, { timeoutMs });
    } catch (err) {
      if (err instanceof TikTokError) throw err;
      if (err && err.code === 'TIMEOUT') {
        throw new TikTokError(502, 'Waktu membaca tautan TikTok habis.');
      }
      throw new TikTokError(502, 'Gagal membaca tautan TikTok.');
    }

    const location = headerValue(response.headers, 'location');
    if (REDIRECT_STATUSES.has(response.status)) {
      if (!location || hop === MAX_REDIRECTS) {
        throw new TikTokError(502, 'Tautan TikTok tidak mengarah ke video.');
      }
      const next = nextHop(location, current);
      if (next.videoId) {
        const value = resultOf(next.videoId, 'resolved');
        cacheSet(cache, inspected.href, value, nowOf(deps));
        return value;
      }
      if (seen.has(next.href)) {
        throw new TikTokError(502, 'Tautan TikTok tidak mengarah ke video.');
      }
      seen.add(next.href);
      current = next.href;
      continue;
    }

    const fromBody = videoIdInText(typeof response.body === 'string' ? response.body : '');
    if (fromBody) {
      const value = resultOf(fromBody, 'resolved');
      cacheSet(cache, inspected.href, value, nowOf(deps));
      return value;
    }
    throw new TikTokError(502, 'Tautan TikTok tidak berisi ID video.');
  }

  throw new TikTokError(502, 'Tautan TikTok tidak mengarah ke video.');
}

export async function handleTikTokResolveRequest(request, deps = {}) {
  try {
    const method = request.method.toUpperCase();
    if (method !== 'GET') {
      throw new TikTokError(405, 'Metode tidak diizinkan.');
    }
    const incoming = new URL(request.url);
    const target = incoming.searchParams.get('url') || '';
    const resolved = await resolveTikTokTarget(target, deps);
    return json(
      { status: 'success', ...resolved },
      200,
      'private, max-age=3600',
    );
  } catch (err) {
    if (err instanceof TikTokError) {
      return json({ status: 'error', message: err.message }, err.status);
    }
    return json({ status: 'error', message: 'Gagal membaca tautan TikTok.' }, 502);
  }
}
