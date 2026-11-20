import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import accountsHandler from '../api/repliz-accounts.js';
import { handleReplizAssetsRequest } from './repliz-assets.js';
import { mediaSignature } from './repliz-media.js';
import { handleReplizAccountsRequest, handleReplizScheduleRequest } from './repliz.js';

const ACCESS = 'access-key-test-123456';
const SECRET = 'secret-key-test-abcdef';
const MEDIA = 'media-secret-value-32chars-ok';
const FILE_ID = 'DRIVE!video-final-1';
const ACCOUNT = 'acct12345678';
const SCHEDULE = '69c7532ff0c3b7c83ab9e681';

function env(extra = {}) {
  return {
    REPLIZ_ACCESS_KEY: ACCESS,
    REPLIZ_SECRET_KEY: SECRET,
    MEDIA_URL_SECRET: MEDIA,
    PUBLIC_APP_URL: 'https://promo.example.com',
    ...extra,
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function recordFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({
      url: String(url),
      method: options.method || 'GET',
      authorization: options.headers?.Authorization || '',
      body: options.body || '',
    });
    return handler(calls.at(-1));
  };
  return { calls, fetchImpl };
}

function createBody(extra = {}) {
  return {
    accountId: ACCOUNT,
    fileId: FILE_ID,
    scheduleAt: '2026-11-21T19:00:00+07:00',
    caption: 'Caption uji keramik.',
    additionalInfo: { isDraft: false, isCommentDisabled: true, isAiGenerated: false },
    ...extra,
  };
}

describe('endpoint Repliz', () => {
  test('tanpa env, daftar akun tetap ramah dan tidak membocorkan rahasia', async () => {
    let called = 0;
    const response = await handleReplizAccountsRequest(new Request('http://dashboard.local/api/repliz-accounts'), {
      env: { REPLIZ_SECRET_KEY: SECRET },
      fetchImpl: async () => {
        called += 1;
        return jsonResponse({});
      },
    });
    assert.equal(called, 0);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.configured, false);
    assert.deepEqual(body.missing, ['REPLIZ_ACCESS_KEY', 'MEDIA_URL_SECRET']);
    const raw = JSON.stringify(body);
    assert.equal(raw.includes(SECRET), false);
    assert.match(body.message, /REPLIZ_ACCESS_KEY/);
    assert.match(body.message, /MEDIA_URL_SECRET/);
  });

  test('GET akun memakai Basic Auth dan hanya menampilkan TikTok terhubung', async () => {
    const { calls, fetchImpl } = recordFetch(() => jsonResponse({
      docs: [
        { _id: ACCOUNT, name: 'Akun Utama', username: 'utama', type: 'tiktok', isConnected: true },
        { _id: 'facebook1234', name: 'Halaman', username: 'halaman', type: 'facebook', isConnected: true },
        { _id: 'tiktokoff123', name: 'Putus', username: 'putus', type: 'tiktok', isConnected: false },
      ],
    }));
    const response = await handleReplizAccountsRequest(new Request('http://dashboard.local/api/repliz-accounts'), {
      env: env(),
      fetchImpl,
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.configured, true);
    assert.deepEqual(body.accounts, [{
      id: ACCOUNT,
      name: 'Akun Utama',
      username: 'utama',
      platform: 'tiktok',
      connected: true,
    }]);
    const upstream = new URL(calls[0].url);
    assert.equal(upstream.origin + upstream.pathname, 'https://api.repliz.com/public/account');
    assert.equal(upstream.searchParams.get('page'), '1');
    assert.equal(upstream.searchParams.get('limit'), '100');
    assert.equal(calls[0].authorization, `Basic ${Buffer.from(`${ACCESS}:${SECRET}`).toString('base64')}`);
    assert.equal(JSON.stringify(body).includes(SECRET), false);
    assert.equal(JSON.stringify(body).includes(ACCESS), false);
  });

  test('GET jadwal meneruskan halaman dan status', async () => {
    const { calls, fetchImpl } = recordFetch(() => jsonResponse({
      docs: [{
        _id: SCHEDULE,
        description: 'Caption',
        status: 'error',
        errorMessage: `gagal ${SECRET}`,
        scheduleAt: '2026-11-20T12:00:00.000Z',
        accountId: ACCOUNT,
        account: { name: 'Akun Utama', username: 'utama' },
        medias: [{ type: 'video', url: `https://promo.example.com/api/repliz-media?id=${encodeURIComponent(FILE_ID)}&exp=1&sig=abc` }],
      }],
      page: 2,
      limit: 10,
      totalPages: 3,
      totalDocs: 21,
    }));
    const response = await handleReplizScheduleRequest(
      new Request('http://dashboard.local/api/repliz-schedule?page=2&limit=10&status=error'),
      { env: env(), fetchImpl },
    );
    const body = await response.json();
    const upstream = new URL(calls[0].url);
    assert.equal(upstream.pathname, '/public/schedule');
    assert.equal(upstream.searchParams.get('page'), '2');
    assert.equal(upstream.searchParams.get('limit'), '10');
    assert.equal(upstream.searchParams.get('status'), 'error');
    assert.equal(body.schedules[0].status, 'error');
    assert.equal(body.schedules[0].fileId, FILE_ID);
    assert.equal(body.schedules[0].errorMessage.includes(SECRET), false);
    assert.match(body.schedules[0].errorMessage, /\[redacted\]/);
    assert.equal(JSON.stringify(body).includes('sig='), false);
  });

  test('POST membuat jadwal video dengan URL bertanda tangan, bukan downloadUrl Graph', async () => {
    const { calls, fetchImpl } = recordFetch(() => jsonResponse({ _id: SCHEDULE, status: 'pending' }, 201));
    const now = Date.parse('2026-11-20T00:00:00.000Z');
    const response = await handleReplizScheduleRequest(new Request('http://dashboard.local/api/repliz-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createBody()),
    }), { env: env(), fetchImpl, now });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.scheduleId, SCHEDULE);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].url, 'https://api.repliz.com/public/schedule');
    const sent = JSON.parse(calls[0].body);
    assert.equal(sent.type, 'video');
    assert.equal(sent.description, 'Caption uji keramik.');
    assert.equal(sent.accountId, ACCOUNT);
    assert.equal(sent.scheduleAt, '2026-11-21T19:00:00+07:00');
    assert.deepEqual(sent.additionalInfo, { isDraft: false, isCommentDisabled: true, isAiGenerated: false });
    assert.equal(sent.medias.length, 1);
    assert.equal(sent.medias[0].type, 'video');
    const media = new URL(sent.medias[0].url);
    assert.equal(media.origin, 'https://promo.example.com');
    assert.equal(media.pathname, '/api/repliz-media');
    assert.equal(media.searchParams.get('id'), FILE_ID);
    const exp = media.searchParams.get('exp');
    assert.equal(media.searchParams.get('sig'), mediaSignature(MEDIA, FILE_ID, exp));
    assert.equal(sent.medias[0].url.includes('graph.microsoft.com'), false);
    assert.equal(sent.medias[0].url.includes('downloadUrl'), false);
    assert.equal(sent.medias[0].url.includes(MEDIA), false);
    assert.equal(JSON.stringify(body).includes(MEDIA), false);
  });

  test('input tidak valid ditolak sebelum memanggil Repliz', async () => {
    let called = 0;
    const fetchImpl = async () => {
      called += 1;
      return jsonResponse({});
    };
    const longCaption = await handleReplizScheduleRequest(new Request('http://dashboard.local/api/repliz-schedule', {
      method: 'POST',
      body: JSON.stringify(createBody({ caption: 'a'.repeat(2201) })),
    }), { env: env(), fetchImpl });
    assert.equal(longCaption.status, 400);
    const badZone = await handleReplizScheduleRequest(new Request('http://dashboard.local/api/repliz-schedule', {
      method: 'POST',
      body: JSON.stringify(createBody({ scheduleAt: '2026-11-21T12:00:00.000Z' })),
    }), { env: env(), fetchImpl });
    assert.equal(badZone.status, 400);
    assert.equal(called, 0);
  });

  test('pesan error Repliz menyensor kunci', async () => {
    const { fetchImpl } = recordFetch(() => jsonResponse({
      message: `unauthorized ${ACCESS} ${SECRET} Basic ${Buffer.from(`${ACCESS}:${SECRET}`).toString('base64')}`,
    }, 401));
    const response = await handleReplizAccountsRequest(new Request('http://dashboard.local/api/repliz-accounts'), {
      env: env(),
      fetchImpl,
    });
    assert.equal(response.status, 502);
    const raw = JSON.stringify(await response.json());
    assert.equal(raw.includes(ACCESS), false);
    assert.equal(raw.includes(SECRET), false);
    assert.match(raw, /\[redacted\]/);
  });

  test('coba lagi hanya untuk status error dan membatalkan hanya yang menunggu', async () => {
    const retry = recordFetch((call) => {
      if (call.method === 'GET') return jsonResponse({ _id: SCHEDULE, status: 'error' });
      return new Response(null, { status: 204 });
    });
    const retried = await handleReplizScheduleRequest(
      new Request(`http://dashboard.local/api/repliz-schedule?scheduleId=${SCHEDULE}`, { method: 'PUT' }),
      { env: env(), fetchImpl: retry.fetchImpl },
    );
    assert.equal(retried.status, 200);
    assert.equal(retry.calls[1].method, 'PUT');
    assert.equal(retry.calls[1].url, `https://api.repliz.com/public/schedule/${SCHEDULE}/retry`);

    const blocked = recordFetch((call) => {
      if (call.method === 'GET') return jsonResponse({ _id: SCHEDULE, status: 'pending' });
      return new Response(null, { status: 204 });
    });
    const refused = await handleReplizScheduleRequest(
      new Request(`http://dashboard.local/api/repliz-schedule?scheduleId=${SCHEDULE}`, { method: 'PUT' }),
      { env: env(), fetchImpl: blocked.fetchImpl },
    );
    assert.equal(refused.status, 409);
    assert.equal(blocked.calls.length, 1);

    const cancel = recordFetch((call) => {
      if (call.method === 'GET') return jsonResponse({ _id: SCHEDULE, status: 'pending' });
      return jsonResponse({ deleted: 1 });
    });
    const removed = await handleReplizScheduleRequest(
      new Request(`http://dashboard.local/api/repliz-schedule?scheduleId=${SCHEDULE}`, { method: 'DELETE' }),
      { env: env(), fetchImpl: cancel.fetchImpl },
    );
    assert.equal(removed.status, 200);
    assert.equal(cancel.calls[1].method, 'DELETE');
    assert.equal(cancel.calls[1].url, `https://api.repliz.com/public/schedule/mass?scheduleIds[]=${SCHEDULE}`);

    let called = 0;
    const kept = await handleReplizScheduleRequest(new Request('http://dashboard.local/api/repliz-schedule', {
      method: 'POST',
      body: JSON.stringify({ action: 'cancel', scheduleId: SCHEDULE }),
    }), {
      env: {},
      fetchImpl: async () => {
        called += 1;
        return jsonResponse({ _id: SCHEDULE, status: 'success' });
      },
    });
    assert.equal(kept.status, 503);
    assert.equal(called, 0);
    const keptBody = await kept.json();
    assert.ok(keptBody.missing.includes('REPLIZ_ACCESS_KEY'));
    assert.ok(keptBody.missing.includes('REPLIZ_SECRET_KEY'));
    assert.ok(keptBody.missing.includes('MEDIA_URL_SECRET'));
  });

  test('pembungkus API akun menolak metode selain GET', async () => {
    const response = await accountsHandler.fetch(new Request('http://dashboard.local/api/repliz-accounts', { method: 'POST' }));
    assert.equal(response.status, 405);
  });

  test('FILE_ASSET dibaca tanpa menulis dan tanpa mengembalikan token', async () => {
    const token = 'token-rahasia-apps-script';
    const calls = [];
    const response = await handleReplizAssetsRequest(new Request('http://dashboard.local/api/repliz-assets'), {
      env: { APPS_SCRIPT_URL: 'https://script.example.test/exec', APPS_SCRIPT_TOKEN: token },
      requestImpl: async (url, options) => {
        calls.push({ url: String(url), body: options.body });
        return {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            status: 'success',
            token,
            rows: [
              { idFile: FILE_ID, namaFile: 'perata.mp4', pathFolder: 'OneDrive/Video Final' },
              { idFile: '', namaFile: 'kosong.mp4', pathFolder: 'Video Final' },
            ],
          }),
        };
      },
    });
    const body = await response.json();
    assert.equal(body.configured, true);
    assert.deepEqual(body.rows, [{ id: FILE_ID, name: 'perata.mp4', path: 'OneDrive/Video Final' }]);
    assert.equal(JSON.stringify(body).includes(token), false);
    const sent = JSON.parse(calls[0].body);
    assert.equal(sent.action, 'get_file_assets');
    assert.equal(sent.action.includes('upsert'), false);
  });
});
