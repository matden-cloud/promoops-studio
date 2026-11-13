import { handleAppsScriptRequest } from './apps-script.js';
import { handleGeminiRequest } from './gemini.js';

const ROUTES = new Map([
  ['/api/apps-script', handleAppsScriptRequest],
  ['/api/gemini', handleGeminiRequest],
]);

const SKIP_HEADERS = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive']);

function pathnameOf(url = '/') {
  const path = url.split('?')[0] || '/';
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
  return path;
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function nodeToWebRequest(req) {
  const host = req.headers.host || '127.0.0.1';
  const url = new URL(req.url || '/', `http://${host}`);
  const method = (req.method || 'GET').toUpperCase();
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (SKIP_HEADERS.has(key.toLowerCase()) || value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }

  const init = { method, headers };
  if (method !== 'GET' && method !== 'HEAD') {
    const body = await readRequestBody(req);
    if (body.length > 0) init.body = body;
  }
  return new Request(url, init);
}

export async function writeWebResponse(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}

export function createApiMiddleware() {
  return async function promoOpsApi(req, res, next) {
    const handler = ROUTES.get(pathnameOf(req.url));
    if (!handler) {
      next();
      return;
    }

    try {
      const request = await nodeToWebRequest(req);
      const response = await handler(request);
      await writeWebResponse(res, response);
    } catch {
      if (res.headersSent) {
        res.end();
        return;
      }
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ status: 'error', message: 'Kesalahan server lokal.' }));
    }
  };
}

export function promoOpsApiPlugin() {
  const middleware = createApiMiddleware();
  const attach = (server) => {
    server.middlewares.use((req, res, next) => {
      Promise.resolve(middleware(req, res, next)).catch(next);
    });
  };

  return {
    name: 'promoops-api',
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
