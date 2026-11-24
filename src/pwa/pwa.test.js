import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import vm from 'node:vm';
import { renderServiceWorker } from '../../server/renderServiceWorker.js';
import { listShellAssets, shellVersion } from '../../server/shellAssets.js';
import {
  BACKGROUND_COLOR,
  ICON_COLOR,
  ICON_RGB,
  PWA_DESCRIPTION,
  PWA_DISPLAY,
  PWA_NAME,
  PWA_SCOPE,
  PWA_SHORT_NAME,
  PWA_START_URL,
  THEME_COLOR,
} from './constants.js';
import { PWA_ICONS, pointInPolygon, renderFaviconSvg, renderIconImage, renderIconPng } from './iconPng.js';
import {
  isIosDevice,
  isStandaloneDisplay,
  resolveInstallSurface,
  shouldOfferUpdate,
} from './installState.js';
import {
  attachUpdateWatcher,
  reloadOnLaterControllerChange,
  requestPwaUpdate,
  shouldRegisterServiceWorker,
} from './register.js';
import { decideRequest, filterPrecacheUrls, isApiPath, SENSITIVE_API_PATHS } from './swStrategy.js';

const ORIGIN = 'https://promoops-studio.vercel.app';
const VERSION = 'abc123def456';

function fakeRequest(url, {
  method = 'GET',
  mode = 'cors',
  destination = '',
  headers = {},
  cache,
} = {}) {
  const bag = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    url,
    method,
    mode,
    destination,
    cache,
    headers: { get: (name) => bag.get(String(name).toLowerCase()) || '' },
  };
}

function loadWorker(source, extras = {}) {
  const listeners = {};
  const self = {
    location: { origin: extras.origin || ORIGIN },
    registration: extras.registration || { active: { scriptURL: '/sw.js' } },
    skipWaiting() { self.skipped = true; },
    clients: { claim: async () => { self.claimed = true; } },
    addEventListener(type, fn) { listeners[type] = fn; },
    skipped: false,
    claimed: false,
  };
  vm.runInContext(source, vm.createContext({
    self,
    caches: extras.caches || { open: async () => { throw new Error('cache tidak dipakai'); }, keys: async () => [], delete: async () => false },
    fetch: extras.fetch || (async () => { throw new Error('fetch tidak dipakai'); }),
    Response,
    URL,
  }), { filename: 'sw.js' });
  return { self, listeners };
}

function dispatchFetch(listeners, request) {
  let responded = false;
  let promise;
  listeners.fetch({
    request,
    respondWith(value) {
      responded = true;
      promise = value;
    },
  });
  return { responded, promise };
}

async function runWorkerEvent(listeners, type, event = {}) {
  let job;
  listeners[type]({
    ...event,
    waitUntil(value) { job = value; },
  });
  if (job) await job;
}

describe('keputusan service worker', () => {
  for (const pathname of SENSITIVE_API_PATHS) {
    test(`${pathname} tidak pernah masuk cache`, () => {
      for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
        const decision = decideRequest(fakeRequest(`${ORIGIN}${pathname}?id=1&sig=abc`, {
          method,
          destination: pathname.endsWith('media') || pathname.endsWith('stream') ? 'video' : '',
          headers: { range: 'bytes=0-1023' },
        }), ORIGIN);
        assert.equal(decision.action, 'passthrough');
        assert.equal(isApiPath(pathname), true);
      }
    });
  }

  test('unggahan, lintas-asal, dan data lain tidak di-cache', () => {
    assert.equal(decideRequest(fakeRequest(`${ORIGIN}/api/voice`, { method: 'POST' }), ORIGIN).reason, 'method');
    assert.equal(decideRequest(fakeRequest('https://login.microsoftonline.com/common/oauth2/deviceauth'), ORIGIN).reason, 'cross-origin');
    assert.equal(decideRequest(fakeRequest('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans'), ORIGIN).reason, 'cross-origin');
    assert.equal(decideRequest(fakeRequest(`${ORIGIN}/data/sheets.json`), ORIGIN).reason, 'unknown');
    assert.equal(decideRequest(fakeRequest(`${ORIGIN}/sw.js`), ORIGIN).reason, 'service-worker');
    assert.equal(decideRequest(fakeRequest(`${ORIGIN}/icons/icon-512.png`, { headers: { range: 'bytes=0-1' } }), ORIGIN).reason, 'media');
  });

  test('halaman jaringan-dulu dan aset statis cache-dulu', () => {
    assert.equal(decideRequest(fakeRequest(`${ORIGIN}/`, { mode: 'navigate', destination: 'document' }), ORIGIN).action, 'network-first-shell');
    assert.equal(decideRequest(fakeRequest(`${ORIGIN}/assets/index-abc.js`, { destination: 'script' }), ORIGIN).action, 'cache-first-static');
    assert.equal(decideRequest(fakeRequest(`${ORIGIN}/assets/app.css`), ORIGIN).action, 'cache-first-static');
  });

  test('daftar precache menolak api, sw, dan peta sumber', () => {
    assert.deepEqual(filterPrecacheUrls([
      '/index.html',
      '/api/repliz-media?sig=secret',
      '/api/gemini',
      '/sw.js',
      '/assets/app.js.map',
      'https://evil.test/app.js',
      '/index.html',
      '/',
    ]), ['/', '/index.html']);
  });
});

describe('service worker yang dihasilkan', () => {
  const source = renderServiceWorker({
    urls: ['/index.html', '/assets/app.js', '/api/gemini', '/api/repliz-media?sig=secret', '/sw.js', '/'],
    version: VERSION,
  });

  test('sumber tidak menyimpan url api', () => {
    const precache = source.match(/const PRECACHE_URLS = (\[[^\]]*\]);/);
    assert.ok(precache);
    assert.deepEqual(JSON.parse(precache[1]), ['/', '/assets/app.js', '/index.html']);
    assert.equal(source.includes('sig=secret'), false);
  });

  test('api media, login, gemini, dan unggahan tidak direspons worker', () => {
    const fetched = [];
    const { listeners } = loadWorker(source, {
      fetch: async (request) => {
        fetched.push(request.url);
        throw new Error('tidak boleh fetch');
      },
    });
    const cases = [
      fakeRequest(`${ORIGIN}/api/repliz-media?id=FILE&exp=1&sig=abc`, { destination: 'video', headers: { range: 'bytes=0-99' } }),
      fakeRequest(`${ORIGIN}/api/onedrive-login`),
      fakeRequest(`${ORIGIN}/api/onedrive-login`, { method: 'POST' }),
      fakeRequest(`${ORIGIN}/api/onedrive-stream?id=FILE!abc`, { destination: 'video', headers: { range: 'bytes=0-1' } }),
      fakeRequest(`${ORIGIN}/api/gemini`, { method: 'POST' }),
      fakeRequest(`${ORIGIN}/api/voice`, { method: 'POST' }),
      fakeRequest(`${ORIGIN}/api/apps-script`),
      fakeRequest('https://login.microsoftonline.com/common/oauth2/v2.0/devicecode'),
    ];
    for (const request of cases) {
      const result = dispatchFetch(listeners, request);
      assert.equal(result.responded, false, request.url);
    }
    assert.deepEqual(fetched, []);
  });

  test('navigasi menyimpan shell html, bukan json atau gagal', async () => {
    const puts = [];
    const cache = {
      async match(key) { return key === '/index.html' ? { url: '/index.html', offline: true } : undefined; },
      async put(key) { puts.push(key); },
    };
    const responses = [];
    const { listeners } = loadWorker(source, {
      caches: { open: async () => cache },
      fetch: async () => responses.shift(),
    });
    const html = {
      status: 200,
      type: 'basic',
      headers: { get: () => 'text/html; charset=utf-8' },
      clone() { return this; },
    };
    responses.push(html);
    const ok = dispatchFetch(listeners, fakeRequest(`${ORIGIN}/?sumber=pwa`, { mode: 'navigate', destination: 'document' }));
    assert.equal(ok.responded, true);
    assert.equal(await ok.promise, html);
    assert.deepEqual(puts, ['/index.html']);

    responses.push({ status: 200, type: 'basic', headers: { get: () => 'application/json' }, clone() { return this; } });
    await dispatchFetch(listeners, fakeRequest(`${ORIGIN}/`, { mode: 'navigate' })).promise;
    responses.push({ status: 500, type: 'basic', headers: { get: () => 'text/html' }, clone() { return this; } });
    await dispatchFetch(listeners, fakeRequest(`${ORIGIN}/`, { mode: 'navigate' })).promise;
    assert.deepEqual(puts, ['/index.html']);
  });

  test('offline memakai shell cache, aset statis tidak mengambil jaringan bila ada cache', async () => {
    const cache = {
      async match(key) {
        if (key === '/index.html') return { body: 'shell' };
        if (typeof key === 'object' && String(key.url).endsWith('.js')) return { body: 'cached-js' };
        return undefined;
      },
      async put() { throw new Error('tidak boleh menulis'); },
    };
    let fetched = 0;
    const { listeners } = loadWorker(source, {
      caches: { open: async () => cache },
      fetch: async () => { fetched += 1; throw new Error('offline'); },
    });
    const page = dispatchFetch(listeners, fakeRequest(`${ORIGIN}/`, { mode: 'navigate', destination: 'document' }));
    assert.deepEqual(await page.promise, { body: 'shell' });
    const asset = dispatchFetch(listeners, fakeRequest(`${ORIGIN}/assets/app.js`, { destination: 'script' }));
    assert.deepEqual(await asset.promise, { body: 'cached-js' });
    assert.equal(fetched, 1);
  });

  test('pemasangan pertama langsung aktif dan tidak menyimpan api', async () => {
    const added = [];
    const deleted = [];
    const caches = {
      open: async () => ({ addAll: async (urls) => added.push(...urls) }),
      keys: async () => [`video-shell-lama`, `video-shell-${VERSION}`, 'bukan-shell'],
      delete: async (key) => { deleted.push(key); return true; },
    };
    const { listeners, self } = loadWorker(source, { caches, registration: { active: null } });
    await runWorkerEvent(listeners, 'install');
    assert.equal(self.skipped, true);
    assert.deepEqual(added, ['/', '/assets/app.js', '/index.html']);
    self.registration = { active: self };
    self.skipped = false;
    await runWorkerEvent(listeners, 'install');
    assert.equal(self.skipped, false);
    await runWorkerEvent(listeners, 'activate');
    assert.deepEqual(deleted, ['video-shell-lama']);
    assert.equal(self.claimed, true);
    listeners.message({ data: { type: 'SKIP_WAITING' } });
    assert.equal(self.skipped, true);
  });
});

describe('aset shell', () => {
  test('folder api di dist tidak masuk daftar atau versi', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'video-shell-'));
    try {
      mkdirSync(path.join(dir, 'api'), { recursive: true });
      mkdirSync(path.join(dir, 'assets'), { recursive: true });
      writeFileSync(path.join(dir, 'index.html'), '<html>Video</html>');
      writeFileSync(path.join(dir, 'assets', 'app.js'), 'console.log(1)');
      writeFileSync(path.join(dir, 'sw.js'), 'lama');
      writeFileSync(path.join(dir, 'api', 'gemini.js'), 'rahasia');
      const first = listShellAssets(dir);
      assert.deepEqual(first.urls.sort(), ['/', '/assets/app.js', '/index.html']);
      const version = shellVersion(first.files, first.urls);
      writeFileSync(path.join(dir, 'index.html'), '<html>Video baru</html>');
      const next = listShellAssets(dir);
      assert.notEqual(shellVersion(next.files, next.urls), version);
      assert.equal(/^[a-z0-9]{12}$/.test(version), true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('prompt pemasangan', () => {
  test('sembunyi saat sudah terpasang', () => {
    assert.equal(isStandaloneDisplay({ displayMode: 'standalone' }), true);
    assert.equal(isStandaloneDisplay({ iosStandalone: true }), true);
    assert.equal(resolveInstallSurface({ standalone: true, ios: true, hasPrompt: true }), 'hidden');
  });

  test('android memakai tombol, iphone memakai petunjuk, tutup menyembunyikan', () => {
    assert.equal(resolveInstallSurface({ hasPrompt: true }), 'android');
    assert.equal(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1'), true);
    assert.equal(isIosDevice('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0.0.0 Mobile Safari/537.36'), false);
    assert.equal(resolveInstallSurface({ ios: true }), 'ios');
    assert.equal(resolveInstallSurface({ ios: true, dismissed: true }), 'hidden');
    assert.equal(resolveInstallSurface({ preview: 'android', standalone: true }), 'android');
    assert.equal(resolveInstallSurface({ preview: 'ios' }), 'ios');
    assert.equal(resolveInstallSurface({ preview: 'ios', dismissed: true }), 'hidden');
    assert.equal(resolveInstallSurface({ preview: 'ios', dismissed: true, hasPrompt: true }), 'android');
    assert.equal(shouldOfferUpdate({ preview: 'pembaruan' }), true);
    assert.equal(shouldOfferUpdate({ updateReady: true }), true);
    assert.equal(shouldOfferUpdate({}), false);
    assert.equal(shouldRegisterServiceWorker(true), true);
    assert.equal(shouldRegisterServiceWorker(undefined), false);
  });

  test('pembaruan muncul hanya jika halaman sudah dikontrol worker', () => {
    class FakeWorker extends EventTarget {
      constructor(state) {
        super();
        this.state = state;
      }

      setState(state) {
        this.state = state;
        this.dispatchEvent(new Event('statechange'));
      }
    }
    const registration = new EventTarget();
    registration.waiting = new FakeWorker('installed');
    registration.installing = null;
    let updates = 0;
    attachUpdateWatcher(registration, { isControlled: () => false, onUpdate: () => { updates += 1; } });
    assert.equal(updates, 0);

    const next = new EventTarget();
    next.waiting = null;
    next.installing = null;
    attachUpdateWatcher(next, { isControlled: () => true, onUpdate: () => { updates += 1; } });
    const worker = new FakeWorker('installing');
    next.installing = worker;
    next.dispatchEvent(new Event('updatefound'));
    assert.equal(updates, 0);
    worker.setState('installed');
    assert.equal(updates, 1);
  });

  test('kontrol pertama tidak memuat ulang', () => {
    const serviceWorker = new EventTarget();
    serviceWorker.controller = null;
    let reloads = 0;
    reloadOnLaterControllerChange(serviceWorker, () => { reloads += 1; });
    serviceWorker.controller = { scriptURL: '/sw.js' };
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    assert.equal(reloads, 0);
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    assert.equal(reloads, 1);
  });

  test('muat ulang mengaktifkan worker yang menunggu', async () => {
    let posted = null;
    let reloads = 0;
    const serviceWorker = new EventTarget();
    serviceWorker.getRegistration = async () => ({
      waiting: { postMessage(data) { posted = data; } },
    });
    await requestPwaUpdate({
      navigator: { serviceWorker },
      location: { reload() { reloads += 1; } },
    });
    assert.deepEqual(posted, { type: 'SKIP_WAITING' });
    assert.equal(reloads, 0);
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    assert.equal(reloads, 1);
  });
});

describe('manifest, ikon, dan meta', () => {
  test('manifest Video standalone dengan ikon V', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    assert.match(html, /rel="manifest"\s+href="\/manifest\.webmanifest"/);
    assert.match(html, /rel="apple-touch-icon"\s+href="\/icons\/apple-touch-icon\.png"/);
    assert.match(html, /name="theme-color"\s+content="#f3f5f4"/);
    assert.match(html, /name="apple-mobile-web-app-capable"\s+content="yes"/);
    assert.match(html, /name="mobile-web-app-capable"\s+content="yes"/);
    assert.match(html, /name="apple-mobile-web-app-title"\s+content="Video"/);
    const manifest = JSON.parse(readFileSync(new URL('../../public/manifest.webmanifest', import.meta.url), 'utf8'));
    assert.equal(manifest.name, PWA_NAME);
    assert.equal(manifest.short_name, PWA_SHORT_NAME);
    assert.equal(manifest.description, PWA_DESCRIPTION);
    assert.equal(manifest.start_url, PWA_START_URL);
    assert.equal(manifest.scope, PWA_SCOPE);
    assert.equal(manifest.display, PWA_DISPLAY);
    assert.equal(manifest.theme_color, THEME_COLOR);
    assert.equal(manifest.background_color, BACKGROUND_COLOR);
    assert.equal(manifest.lang, 'id');
    const icons = new Map(manifest.icons.map((icon) => [`${icon.sizes}:${icon.purpose}`, icon]));
    assert.equal(icons.get('192x192:any').src, '/icons/icon-192.png');
    assert.equal(icons.get('512x512:any').src, '/icons/icon-512.png');
    assert.equal(icons.get('192x192:maskable').src, '/icons/icon-maskable-192.png');
    assert.equal(icons.get('512x512:maskable').src, '/icons/icon-maskable-512.png');
    const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
    const swHeader = vercel.headers.find((item) => item.source === '/sw.js');
    assert.equal(swHeader.headers.some((header) => header.key === 'Cache-Control' && header.value === 'no-cache'), true);
  });

  test('ikon V emerald penuh, maskable aman di tepi, dan tersimpan', () => {
    const sample = renderIconImage(48, 0.2, 2);
    assert.deepEqual([sample[0], sample[1], sample[2], sample[3]], [...ICON_RGB]);
    let white = 0;
    for (let i = 0; i < sample.length; i += 4) {
      if (sample[i] > 240 && sample[i + 1] > 240 && sample[i + 2] > 240) white += 1;
    }
    const pixels = sample.length / 4;
    assert.equal(white > pixels * 0.05 && white < pixels * 0.45, true);
    const mask = renderIconImage(32, 0.28, 1);
    assert.deepEqual([mask[0], mask[1], mask[2], mask[3]], [...ICON_RGB]);
    const polygon = [
      [10, 10],
      [18, 10],
      [24, 28],
      [30, 10],
      [38, 10],
      [27, 40],
      [21, 40],
    ];
    assert.equal(pointInPolygon(14, 12, polygon), true);
    assert.equal(pointInPolygon(24, 14, polygon), false);

    for (const icon of PWA_ICONS) {
      const file = readFileSync(new URL(`../../public/icons/${icon.file}`, import.meta.url));
      const png = renderIconPng(icon.size, icon.paddingRatio);
      assert.equal(createHash('sha256').update(file).digest('hex'), createHash('sha256').update(png).digest('hex'), icon.file);
      assert.equal(file.subarray(12, 16).toString('ascii'), 'IHDR');
      assert.equal(file.readUInt32BE(16), icon.size);
      assert.equal(file.readUInt32BE(20), icon.size);
    }
    const favicon = readFileSync(new URL('../../public/favicon.svg', import.meta.url), 'utf8');
    assert.equal(favicon, renderFaviconSvg());
    assert.match(favicon, new RegExp(ICON_COLOR));
  });
});
