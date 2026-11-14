import assert from 'node:assert/strict';
import http from 'node:http';
import { describe, test } from 'node:test';
import tiktokHandler from '../api/tiktok-resolve.js';
import { handleTikTokResolveRequest, resolveTikTokTarget, TIKTOK_CACHE_TTL_MS } from './tiktok.js';
import {
  ALLOWED_TIKTOK_HOSTS,
  buildTikTokEmbedUrl,
  canPlayTikTokUrl,
  inspectTikTokUrl,
} from './tiktok-url.js';
import { createApiMiddleware } from './vite-api-plugin.js';

const VIDEO_ID = '7637126793828437269';
const CANONICAL = `https://www.tiktok.com/@/video/${VIDEO_ID}`;
const SHORT = 'https://vt.tiktok.com/ZSxFKGMS6/';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    server.on('error', reject);
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function redirect(location, status = 302) {
  return { status, headers: { location }, body: '' };
}

describe('tautan TikTok', () => {
  test('ID video dibaca dari /video/<id> tanpa menghubungi jaringan', async () => {
    let calls = 0;
    const requestImpl = async () => {
      calls += 1;
      throw new Error('seharusnya tidak terpanggil');
    };
    const samples = [
      CANONICAL,
      `https://www.tiktok.com/@nama/video/${VIDEO_ID}?is_from_webapp=1&sender_device=pc`,
      `https://tiktok.com/@nama/video/${VIDEO_ID}/`,
      `https://m.tiktok.com/@nama/video/${VIDEO_ID}`,
      `https://www.tiktok.com/player/v1/${VIDEO_ID}`,
      `https://www.tiktok.com/embed/v2/${VIDEO_ID}`,
      `https://www.tiktok.com/share?share_item_id=${VIDEO_ID}`,
    ];

    for (const sample of samples) {
      const resolved = await resolveTikTokTarget(sample, { requestImpl, cache: new Map() });
      assert.equal(resolved.videoId, VIDEO_ID);
      assert.equal(resolved.source, 'parsed');
      assert.equal(resolved.pageUrl, CANONICAL);
      assert.equal(resolved.embedUrl.includes('/player/v1/'), true);
      assert.equal(resolved.embedUrl.includes('/embed/v2/'), false);
    }
    assert.equal(calls, 0);
    assert.equal(buildTikTokEmbedUrl(VIDEO_ID).startsWith(`https://www.tiktok.com/player/v1/${VIDEO_ID}?`), true);
    assert.equal(buildTikTokEmbedUrl('12'), '');
    assert.equal(buildTikTokEmbedUrl('not-an-id'), '');
  });

  test('link pendek diizinkan tetapi belum punya ID, homepage tidak bisa diputar', () => {
    const short = inspectTikTokUrl(SHORT);
    assert.equal(short.ok, true);
    assert.equal(short.videoId, '');
    assert.equal(short.host, 'vt.tiktok.com');
    assert.equal(canPlayTikTokUrl(SHORT), true);
    assert.equal(canPlayTikTokUrl('https://VM.TIKTOK.COM/ZSabcd/'), true);
    assert.equal(canPlayTikTokUrl('https://www.tiktok.com/'), false);
    assert.equal(canPlayTikTokUrl('https://www.tiktok.com/t/ZSxFKGMS6/'), true);
    assert.equal(canPlayTikTokUrl(CANONICAL), true);
    assert.equal(ALLOWED_TIKTOK_HOSTS.has('www.tiktok.com'), true);
    assert.equal(ALLOWED_TIKTOK_HOSTS.has('login.tiktok.com'), false);
  });

  test('host, skema, port, dan kredensial di luar daftar ditolak tanpa permintaan jaringan', async () => {
    const blocked = [
      'http://169.254.169.254/latest/meta-data',
      'https://127.0.0.1/video/7106667752018955566',
      'http://vt.tiktok.com/ZSxFKGMS6/',
      'https://vt.tiktok.com:8443/ZSxFKGMS6/',
      'https://user:pass@vt.tiktok.com/ZSxFKGMS6/',
      'https://vt.tiktok.com.evil.example/video/7106667752018955566',
      'https://evil.example/video/7106667752018955566',
      'https://login.tiktok.com/video/7106667752018955566',
      'https://vt.tiktok.com\\@evil.example/video/7106667752018955566',
      'javascript:alert(1)',
      'file:///etc/passwd',
      '',
      'bukan-url',
    ];

    for (const sample of blocked) {
      let calls = 0;
      const response = await handleTikTokResolveRequest(
        new Request(`http://dashboard.local/api/tiktok-resolve?url=${encodeURIComponent(sample)}`),
        {
          cache: new Map(),
          requestImpl: async () => {
            calls += 1;
            throw new Error(`bocor ${sample}`);
          },
        },
      );
      assert.equal(response.status, 400, sample);
      const body = await response.json();
      assert.equal(body.status, 'error');
      assert.equal(body.videoId, undefined);
      const raw = JSON.stringify(body);
      assert.equal(raw.includes('169.254.169.254'), false);
      assert.equal(raw.includes('evil.example'), false);
      assert.equal(raw.includes('127.0.0.1'), false);
      assert.equal(raw.includes('passwd'), false);
      assert.equal(calls, 0, sample);
    }
  });

  test('pengalihan 302 hanya diikuti ke host TikTok lalu ID diambil dari /video/<id>', async () => {
    const calls = [];
    const requestImpl = async (url) => {
      calls.push(String(url));
      if (calls.length === 1) {
        return redirect('https://www.tiktok.com/t/ZSxFKGMS6/');
      }
      return redirect(`${CANONICAL}?_r=1&utm_source=short_fallback`);
    };

    const resolved = await resolveTikTokTarget(SHORT, { requestImpl, cache: new Map() });
    assert.equal(resolved.videoId, VIDEO_ID);
    assert.equal(resolved.source, 'resolved');
    assert.equal(resolved.embedUrl.includes(`/player/v1/${VIDEO_ID}`), true);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].startsWith('https://vt.tiktok.com/'), true);
    assert.equal(calls[1].startsWith('https://www.tiktok.com/t/'), true);
  });

  test('pengalihan ke alamat internal atau subdomain lain tidak diikuti dan ID-nya tidak dipakai', async () => {
    const attacks = [
      'http://169.254.169.254/latest/meta-data',
      'https://evil.example/video/7106667752018955566',
      'https://login.tiktok.com/video/7106667752018955566',
      'https://user:pass@www.tiktok.com/video/7106667752018955566',
    ];

    for (const location of attacks) {
      const calls = [];
      const response = await handleTikTokResolveRequest(
        new Request(`http://dashboard.local/api/tiktok-resolve?url=${encodeURIComponent(SHORT)}`),
        {
          cache: new Map(),
          requestImpl: async (url) => {
            calls.push(String(url));
            return redirect(location);
          },
        },
      );
      assert.equal(response.status, 502, location);
      assert.equal(calls.length, 1, location);
      const raw = JSON.stringify(await response.json());
      assert.equal(raw.includes('169.254.169.254'), false);
      assert.equal(raw.includes('evil.example'), false);
      assert.equal(raw.includes('login.tiktok.com'), false);
      assert.equal(raw.includes('7106667752018955566'), false);
      assert.equal(raw.includes(VIDEO_ID), false);
    }
  });

  test('halaman 200 yang memuat /video/<id> diterima, lalu cache menahan permintaan berikut', async () => {
    const cache = new Map();
    let calls = 0;
    const requestImpl = async () => {
      calls += 1;
      return {
        status: 200,
        headers: {},
        body: `<a href="https://www.tiktok.com/@akun/video/${VIDEO_ID}">lihat</a>`,
      };
    };
    const deps = { requestImpl, cache, now: 1_000 };

    const first = await resolveTikTokTarget('https://vm.tiktok.com/ZSabcd/', deps);
    assert.equal(first.videoId, VIDEO_ID);
    assert.equal(first.source, 'resolved');

    const second = await resolveTikTokTarget('https://vm.tiktok.com/ZSabcd/', deps);
    assert.equal(second.videoId, VIDEO_ID);
    assert.equal(second.source, 'cache');
    assert.equal(calls, 1);

    const expired = await resolveTikTokTarget('https://vm.tiktok.com/ZSabcd/', {
      ...deps,
      now: 1_000 + TIKTOK_CACHE_TTL_MS,
    });
    assert.equal(expired.source, 'resolved');
    assert.equal(calls, 2);
  });

  test('waktu habis, badan tanpa ID, dan metode selain GET ditolak tanpa membocorkan penyebab internal', async () => {
    const timeout = await handleTikTokResolveRequest(
      new Request(`http://dashboard.local/api/tiktok-resolve?url=${encodeURIComponent(SHORT)}`),
      {
        cache: new Map(),
        requestImpl: async () => {
          const error = new Error('connect 10.0.0.8:443 ETIMEDOUT');
          error.code = 'TIMEOUT';
          throw error;
        },
      },
    );
    assert.equal(timeout.status, 502);
    const timeoutBody = await timeout.json();
    assert.equal(timeoutBody.message, 'Waktu membaca tautan TikTok habis.');
    assert.equal(JSON.stringify(timeoutBody).includes('10.0.0.8'), false);

    const empty = await handleTikTokResolveRequest(
      new Request(`http://dashboard.local/api/tiktok-resolve?url=${encodeURIComponent(SHORT)}`),
      {
        cache: new Map(),
        requestImpl: async () => ({ status: 200, headers: {}, body: '<html>bukan video</html>' }),
      },
    );
    assert.equal(empty.status, 502);
    assert.equal((await empty.json()).message, 'Tautan TikTok tidak berisi ID video.');

    const posted = await handleTikTokResolveRequest(new Request('http://dashboard.local/api/tiktok-resolve', {
      method: 'POST',
      body: JSON.stringify({ url: SHORT }),
    }), { cache: new Map(), requestImpl: async () => { throw new Error('jangan'); } });
    assert.equal(posted.status, 405);
  });

  test('entrypoint Vercel dan middleware dev melayani resolve serta menolak host lain', async () => {
    assert.equal(typeof tiktokHandler.fetch, 'function');
    const direct = await tiktokHandler.fetch(new Request(
      `http://dashboard.local/api/tiktok-resolve?url=${encodeURIComponent(CANONICAL)}`,
    ));
    assert.equal(direct.status, 200);
    assert.equal(direct.headers.get('cache-control'), 'private, max-age=3600');
    assert.equal((await direct.json()).videoId, VIDEO_ID);

    const middleware = createApiMiddleware();
    const server = http.createServer((req, res) => {
      Promise.resolve(middleware(req, res, () => {
        res.statusCode = 404;
        res.end('bukan-api');
      })).catch(() => {
        if (!res.headersSent) res.statusCode = 500;
        res.end();
      });
    });

    try {
      const port = await listen(server);
      const base = `http://127.0.0.1:${port}`;
      const ok = await fetch(`${base}/api/tiktok-resolve?url=${encodeURIComponent(CANONICAL)}`);
      assert.equal(ok.status, 200);
      assert.equal((await ok.json()).videoId, VIDEO_ID);

      const blocked = await fetch(`${base}/api/tiktok-resolve?url=${encodeURIComponent('https://evil.example/video/1')}`);
      assert.equal(blocked.status, 400);
      assert.equal(JSON.stringify(await blocked.json()).includes('evil.example'), false);

      const other = await fetch(`${base}/index.html`);
      assert.equal(other.status, 404);
    } finally {
      await closeServer(server);
    }
  });
});
