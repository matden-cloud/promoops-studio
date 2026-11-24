import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  handleReplizMediaRequest,
  mediaSignature,
  resolvePublicOrigin,
  signMediaUrl,
  signaturesMatch,
} from './repliz-media.js';

const SECRET = 'media-secret-value-32chars-ok';
const FILE_ID = 'DRIVE!video-final-1';
const DOWNLOAD = 'https://microsoftpersonalcontent.com/personal/abc/_download?temp=1';

function signedRequest(exp, { sig, method = 'GET' } = {}) {
  const url = signMediaUrl({
    origin: 'https://promo.example.com',
    itemId: FILE_ID,
    exp,
    secret: SECRET,
  });
  const parsed = new URL(url);
  if (sig != null) parsed.searchParams.set('sig', sig);
  return new Request(parsed, { method });
}

describe('URL media bertanda tangan', () => {
  test('GET dan HEAD yang sah mengalihkan ke unduhan baru tanpa cache', async () => {
    const now = Date.parse('2026-11-20T00:00:00.000Z');
    const exp = Math.floor((now + (72 * 60 * 60 * 1000)) / 1000);
    let mints = 0;
    const mintImpl = async ({ itemId }) => {
      mints += 1;
      assert.equal(itemId, FILE_ID);
      return { ok: true, url: DOWNLOAD };
    };
    const env = { MEDIA_URL_SECRET: SECRET };
    const get = await handleReplizMediaRequest(signedRequest(exp), { env, mintImpl, now });
    assert.equal(get.status, 302);
    assert.equal(get.headers.get('location'), DOWNLOAD);
    assert.equal(get.headers.get('cache-control'), 'no-store');
    const head = await handleReplizMediaRequest(signedRequest(exp, { method: 'HEAD' }), { env, mintImpl, now });
    assert.equal(head.status, 302);
    assert.equal(mints, 2);
  });

  test('tanda tangan salah, kedaluwarsa, dan rahasia kosong ditolak tanpa mint', async () => {
    const now = Date.parse('2026-11-20T00:00:00.000Z');
    const exp = Math.floor((now + (3 * 60 * 60 * 1000)) / 1000);
    let mints = 0;
    const mintImpl = async () => {
      mints += 1;
      return { ok: true, url: DOWNLOAD };
    };
    const tampered = await handleReplizMediaRequest(
      signedRequest(exp, { sig: 'a'.repeat(64) }),
      { env: { MEDIA_URL_SECRET: SECRET }, mintImpl, now },
    );
    assert.equal(tampered.status, 403);
    const expired = await handleReplizMediaRequest(signedRequest(Math.floor(now / 1000) - 10), {
      env: { MEDIA_URL_SECRET: SECRET },
      mintImpl,
      now,
    });
    assert.equal(expired.status, 410);
    const missing = await handleReplizMediaRequest(signedRequest(exp), { env: {}, mintImpl, now });
    assert.equal(missing.status, 503);
    const missingBody = await missing.json();
    assert.match(missingBody.message, /MEDIA_URL_SECRET/);
    assert.equal(JSON.stringify(missingBody).includes('http'), false);
    assert.equal(mints, 0);
    assert.equal(signaturesMatch(mediaSignature(SECRET, FILE_ID, String(exp)), `${'b'.repeat(20)}`), false);
    assert.equal(signaturesMatch('', mediaSignature(SECRET, FILE_ID, String(exp))), false);
  });

  test('origin publik hanya dari sumber yang sah', () => {
    assert.equal(resolvePublicOrigin({ PUBLIC_APP_URL: 'https://promo.example.com/jadwal' }, 'http://evil.test'), 'https://promo.example.com');
    assert.equal(resolvePublicOrigin({ PUBLIC_APP_URL: 'https://user:pass@promo.example.com' }), '');
    assert.equal(resolvePublicOrigin({ PUBLIC_APP_URL: 'http://promo.example.com' }), '');
    assert.equal(resolvePublicOrigin({ VERCEL_PROJECT_PRODUCTION_URL: 'promo.example.com' }, 'https://evil.test'), 'https://promo.example.com');
    assert.equal(resolvePublicOrigin({}, 'http://127.0.0.1:5173/api/repliz-media'), 'http://127.0.0.1:5173');
    assert.equal(resolvePublicOrigin({}, 'https://evil.test/api/repliz-media'), '');
    assert.equal(resolvePublicOrigin({ VERCEL_URL: 'preview.vercel.app' }, 'https://preview.vercel.app/api/repliz-media'), 'https://preview.vercel.app');
    const unsigned = signMediaUrl({ origin: 'https://promo.example.com', itemId: FILE_ID, exp: 1_800_000_000, secret: 'pendek' });
    assert.equal(unsigned, '');
  });

  test('masa berlaku yang terlalu panjang ditolak meski tanda tangannya benar', async () => {
    const now = Date.parse('2026-11-20T00:00:00.000Z');
    const exp = Math.floor((now + (80 * 24 * 60 * 60 * 1000)) / 1000);
    let mints = 0;
    const response = await handleReplizMediaRequest(signedRequest(exp), {
      env: { MEDIA_URL_SECRET: SECRET },
      now,
      mintImpl: async () => {
        mints += 1;
        return { ok: true, url: DOWNLOAD };
      },
    });
    assert.equal(response.status, 403);
    assert.equal(mints, 0);
  });

  test('kegagalan OneDrive meneruskan kode kesalahan', async () => {
    const now = Date.parse('2026-11-20T00:00:00.000Z');
    const exp = Math.floor((now + (3 * 60 * 60 * 1000)) / 1000);
    const response = await handleReplizMediaRequest(signedRequest(exp), {
      env: { MEDIA_URL_SECRET: SECRET },
      now,
      mintImpl: async () => ({
        ok: false,
        status: 502,
        message: 'Gagal menghubungi Microsoft. (ECONNRESET: connect ECONNRESET)',
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.error, 'onedrive_error');
    assert.match(body.message, /ECONNRESET/);
  });
});
