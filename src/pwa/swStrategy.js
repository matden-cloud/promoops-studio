export const SHELL_CACHE_PREFIX = 'video-shell-';

export const SENSITIVE_API_PATHS = Object.freeze([
  '/api/repliz-media',
  '/api/onedrive-login',
  '/api/onedrive-sync',
  '/api/onedrive-stream',
  '/api/gemini',
  '/api/voice',
  '/api/apps-script',
  '/api/repliz-assets',
  '/api/repliz-plan',
  '/api/repliz-schedule',
  '/api/repliz-accounts',
  '/api/tiktok-resolve',
]);

const STATIC_DESTINATIONS = new Set(['style', 'script', 'image', 'font', 'manifest']);
const STATIC_EXTENSIONS = /\.(?:js|mjs|css|png|svg|webp|ico|woff2?|webmanifest)$/i;

export function isApiPath(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function headerValue(request, name) {
  const headers = request?.headers;
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  const value = headers[name] ?? headers[name.toLowerCase()];
  return value == null ? '' : String(value);
}

// Passthrough means the service worker does not call respondWith.
// /api, uploads, Range media, and redirect:"manual" stay on the browser
// network stack so signed URLs and OneDrive login are never cached.
export function decideRequest(request, scopeOrigin) {
  const method = String(request?.method || 'GET').toUpperCase();
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return { action: 'passthrough', reason: 'bad-url' };
  }

  if (method !== 'GET') return { action: 'passthrough', reason: 'method' };

  const origin = scopeOrigin || url.origin;
  if (url.origin !== origin) return { action: 'passthrough', reason: 'cross-origin' };

  if (isApiPath(url.pathname)) return { action: 'passthrough', reason: 'api' };
  if (url.pathname === '/sw.js') return { action: 'passthrough', reason: 'service-worker' };
  if (request.cache === 'only-if-cached') return { action: 'passthrough', reason: 'only-if-cached' };

  const destination = request.destination || '';
  if (destination === 'video' || destination === 'audio' || headerValue(request, 'range')) {
    return { action: 'passthrough', reason: 'media' };
  }

  if (request.mode === 'navigate' || destination === 'document') {
    return { action: 'network-first-shell', reason: 'navigation' };
  }

  if (STATIC_DESTINATIONS.has(destination) || STATIC_EXTENSIONS.test(url.pathname)) {
    return { action: 'cache-first-static', reason: 'static' };
  }

  return { action: 'passthrough', reason: 'unknown' };
}

export function filterPrecacheUrls(urls) {
  const seen = new Set();
  const kept = [];
  for (const raw of urls || []) {
    if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) continue;
    const path = raw.split('?')[0];
    if (path === '/sw.js' || path.endsWith('.map') || isApiPath(path)) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    kept.push(raw);
  }
  kept.sort();
  return kept;
}
