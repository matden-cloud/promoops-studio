import { readFileSync } from 'node:fs';
import { filterPrecacheUrls } from '../src/pwa/swStrategy.js';

const STRATEGY_PATH = new URL('../src/pwa/swStrategy.js', import.meta.url);

function stripExports(source) {
  return source.replace(/^export /gm, '').trim();
}

const HANDLERS = `
const SHELL_URL = '/index.html';

function shellCacheName() {
  return SHELL_CACHE_PREFIX + CACHE_VERSION;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(shellCacheName());
    await cache.addAll(PRECACHE_URLS);
    if (!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const expected = shellCacheName();
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => (
      key.startsWith(SHELL_CACHE_PREFIX) && key !== expected ? caches.delete(key) : undefined
    )));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function networkFirstShell(request) {
  const cache = await caches.open(shellCacheName());
  try {
    const response = await fetch(request);
    const type = response.headers.get('content-type') || '';
    if (response.status === 200 && response.type === 'basic' && type.includes('text/html')) {
      await cache.put(SHELL_URL, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(SHELL_URL) || await cache.match('/');
    if (cached) return cached;
    return new Response('Video sedang offline. Sambungkan internet untuk memuat data.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function cacheFirstStatic(request) {
  const cache = await caches.open(shellCacheName());
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.status === 200 && response.type === 'basic') {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const decision = decideRequest(event.request, self.location.origin);
  if (decision.action === 'passthrough') return;
  if (decision.action === 'network-first-shell') {
    event.respondWith(networkFirstShell(event.request));
    return;
  }
  if (decision.action === 'cache-first-static') {
    event.respondWith(cacheFirstStatic(event.request));
  }
});
`.trim();

export function renderServiceWorker({ urls, version }) {
  if (!/^[a-z0-9]{6,32}$/.test(version)) {
    throw new Error('Versi cache shell tidak valid.');
  }
  const precache = filterPrecacheUrls(urls);
  const strategy = stripExports(readFileSync(STRATEGY_PATH, 'utf8'));
  return `'use strict';
const PRECACHE_URLS = ${JSON.stringify(precache)};
const CACHE_VERSION = ${JSON.stringify(version)};
${strategy}
${HANDLERS}
`;
}
