import http from 'node:http';
import https from 'node:https';

const POST_ACTIONS = new Set([
  'save_winning_web',
  'save_winning_file',
  'save_violation',
  'update_violation',
]);

const GET_ACTIONS = new Set(['run_update']);

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

export { GET_ACTIONS, POST_ACTIONS };

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

function redact(text, secret) {
  if (!secret || !text.includes(secret)) return text;
  return text.split(secret).join('[redacted]');
}

function headerValue(headers, name) {
  if (!headers) return '';
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
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

    req.on('error', reject);
    if (body != null && method !== 'GET' && method !== 'HEAD') req.write(body);
    req.end();
  });
}

// Web App Apps Script membalas 302 sebelum skrip benar-benar berjalan.
// Fetch bawaan mengubah POST menjadi GET pada 301/302, jadi doPost tidak terpanggil.
export async function fetchAppsScript(url, options, requestImpl = defaultRequest) {
  let currentUrl = url;
  let method = options.method || 'GET';
  let body = options.body;
  const headers = options.headers;
  const initial = new URL(url);
  const token = initial.searchParams.get('token');
  const action = initial.searchParams.get('action');

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await requestImpl(currentUrl, {
      method,
      headers: method === 'GET' || method === 'HEAD' ? undefined : headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : body,
    });

    if (!REDIRECT_STATUSES.has(response.status)) return response;

    const location = headerValue(response.headers, 'location');
    if (!location || hop === MAX_REDIRECTS) {
      throw new HttpError(502, 'Gagal menghubungi Apps Script.');
    }

    const next = new URL(location, currentUrl);
    if (token) next.searchParams.set('token', token);
    if (action) next.searchParams.set('action', action);
    currentUrl = next.toString();
    if (response.status === 303) {
      method = 'GET';
      body = undefined;
    }
  }

  throw new HttpError(502, 'Gagal menghubungi Apps Script.');
}

function toClientResponse(upstream, token) {
  const raw = Buffer.isBuffer(upstream.body) ? upstream.body.toString('utf8') : String(upstream.body ?? '');
  const text = redact(raw, token);
  const trimmed = text.trim();
  const looksJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  const upstreamType = headerValue(upstream.headers, 'content-type');
  const contentType = looksJson
    ? 'application/json; charset=utf-8'
    : (upstreamType || 'text/plain; charset=utf-8');

  return new Response(text, {
    status: upstream.status,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    },
  });
}

async function routeAppsScript(request, deps) {
  const env = deps.env || process.env;
  const requestImpl = deps.requestImpl || defaultRequest;
  const appsScriptUrl = env.APPS_SCRIPT_URL;
  const token = env.APPS_SCRIPT_TOKEN;

  if (!isConfigured(appsScriptUrl) || !isHttpUrl(appsScriptUrl) || !isConfigured(token)) {
    throw new HttpError(500, 'Konfigurasi server Apps Script belum lengkap.');
  }

  const method = request.method.toUpperCase();
  const incoming = new URL(request.url);

  if (method === 'GET') {
    const action = incoming.searchParams.get('action');
    if (action && !GET_ACTIONS.has(action)) {
      throw new HttpError(400, 'Aksi tidak diizinkan.');
    }

    const target = new URL(appsScriptUrl);
    if (action) target.searchParams.set('action', action);
    target.searchParams.set('token', token);

    const upstream = await fetchAppsScript(target.toString(), { method: 'GET' }, requestImpl);
    return toClientResponse(upstream, token);
  }

  if (method === 'POST') {
    let payload;
    try {
      payload = await request.json();
    } catch {
      throw new HttpError(400, 'Body JSON tidak valid.');
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new HttpError(400, 'Body JSON tidak valid.');
    }

    const action = payload.action;
    if (typeof action !== 'string' || !POST_ACTIONS.has(action)) {
      throw new HttpError(400, 'Aksi tidak diizinkan.');
    }

    const forwardBody = {
      action,
      data: payload.data,
      token,
    };
    const target = new URL(appsScriptUrl);
    target.searchParams.set('token', token);

    const upstream = await fetchAppsScript(target.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(forwardBody),
    }, requestImpl);

    return toClientResponse(upstream, token);
  }

  throw new HttpError(405, 'Metode tidak diizinkan.');
}

export async function handleAppsScriptRequest(request, deps = {}) {
  try {
    return await routeAppsScript(request, deps);
  } catch (err) {
    if (err instanceof HttpError) {
      return json({ status: 'error', message: err.message }, err.status);
    }
    return json({ status: 'error', message: 'Gagal menghubungi Apps Script.' }, 502);
  }
}
