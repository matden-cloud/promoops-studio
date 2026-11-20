import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildGeminiEndpoint } from './gemini.js';
import {
  QUOTA_MESSAGE,
  buildPlannerPrompt,
  handleReplizPlanRequest,
  parsePlannerJson,
} from './repliz-plan.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = 'gemini-key-rahasia-uji';
const HELD = 'DRIVE!gantungan-1';
const OPEN = 'DRIVE!keramik-1';
const ACCOUNT = 'acct12345678';

function payload(message) {
  return {
    message,
    candidates: [
      { fileId: OPEN, fileName: 'perata keramik.mp4', product: 'Perata Keramik', held: false, uploaded: false, date: '2026-11-18' },
      { fileId: HELD, fileName: 'gntungan bor 10 nov.mp4', product: 'Gantungan Bor Multifungsi', held: false, uploaded: false },
      { fileId: 'DRIVE!sudah-1', fileName: 'sudah tayang.mp4', product: 'Perata Keramik', uploaded: true },
    ],
    accounts: [{ id: ACCOUNT, name: 'Akun Utama', username: 'utama' }],
  };
}

function geminiText(text, status = 200, extra = {}) {
  return new Response(JSON.stringify({
    ...extra,
    candidates: [{
      finishReason: 'STOP',
      content: { parts: [{ text }] },
    }],
  }), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('perencana Gemini', () => {
  test('JSON berpagar menjadi rencana dan tidak memanggil Repliz', async () => {
    const calls = [];
    const answer = '```json\n{"reply":"Rencana siap. Belum dikirim.","items":[{"fileId":"DRIVE!keramik-1","accountId":"acct12345678","date":"21/11/2026","time":"19.00","caption":"Perata keramik, cek keranjang.","isDraft":false,"isCommentDisabled":false,"isAiGenerated":true},{"fileId":"DRIVE!gantungan-1","accountId":"acct12345678","date":"2026-11-22","time":"19:00","caption":"jangan masuk"}]}\n```';
    const response = await handleReplizPlanRequest(new Request('http://dashboard.local/api/repliz-plan', {
      method: 'POST',
      body: JSON.stringify(payload('Jadwalkan 1 video per hari jam 19.00')),
    }), {
      env: { GEMINI_API_KEY: KEY, GEMINI_MODEL: 'gemini-3.5-flash-lite' },
      now: new Date('2026-11-20T02:00:00.000Z'),
      fetchImpl: async (url, options) => {
        calls.push({ url: String(url), body: options.body, header: options.headers['x-goog-api-key'] });
        return geminiText(answer);
      },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, buildGeminiEndpoint('gemini-3.5-flash-lite'));
    assert.equal(calls[0].header, KEY);
    const sent = JSON.parse(calls[0].body);
    assert.ok(sent.generationConfig.maxOutputTokens >= 4096);
    assert.equal(sent.contents[0].parts[0].text.includes(HELD), false);
    assert.equal(sent.contents[0].parts[0].text.includes(OPEN), true);
    assert.equal(body.plan.length, 1);
    assert.equal(body.plan[0].fileId, OPEN);
    assert.equal(body.plan[0].date, '2026-11-21');
    assert.equal(body.plan[0].time, '19:00');
    assert.equal(body.plan[0].isAiGenerated, true);
    assert.equal(body.reply.includes('Belum dikirim'), true);
    assert.equal(JSON.stringify(body).includes(KEY), false);
    assert.equal(calls[0].url.includes('api.repliz.com'), false);
  });

  test('permintaan eksplisit boleh memasukkan video yang ditahan', () => {
    const hidden = buildPlannerPrompt({
      message: 'jadwalkan 5 video',
      candidates: payload('x').candidates.map((item) => ({ ...item, held: item.fileId === HELD || item.product.includes('Gantungan') })),
      accounts: [],
      history: [],
    }, new Date('2026-11-20T02:00:00.000Z'));
    assert.equal(hidden.allowHeld, false);
    assert.equal(hidden.visible.some((item) => item.fileId === HELD), false);

    const shown = buildPlannerPrompt({
      message: 'jadwalkan gantungan bor yang belum diupload',
      candidates: [{ fileId: HELD, fileName: 'gntungan bor.mp4', product: 'Gantungan Bor', held: true, uploaded: false }],
      accounts: [],
      history: [],
    }, new Date('2026-11-20T02:00:00.000Z'));
    assert.equal(shown.allowHeld, true);
    assert.equal(shown.visible[0].fileId, HELD);
  });

  test('kuota 429 dan RESOURCE_EXHAUSTED dibedakan', async () => {
    const quota = await handleReplizPlanRequest(new Request('http://dashboard.local/api/repliz-plan', {
      method: 'POST',
      body: JSON.stringify(payload('jadwalkan 3 video')),
    }), {
      env: { GEMINI_API_KEY: KEY },
      fetchImpl: async () => new Response(JSON.stringify({
        error: { status: 'RESOURCE_EXHAUSTED', message: `Quota exceeded for ${KEY}` },
      }), { status: 429 }),
    });
    assert.equal(quota.status, 429);
    const quotaBody = await quota.json();
    assert.equal(quotaBody.error, 'quota_exhausted');
    assert.equal(quotaBody.message, QUOTA_MESSAGE);
    assert.match(quotaBody.message, /15\.00 WIB/);
    assert.equal(JSON.stringify(quotaBody).includes(KEY), false);

    const exhausted = await handleReplizPlanRequest(new Request('http://dashboard.local/api/repliz-plan', {
      method: 'POST',
      body: JSON.stringify(payload('jadwalkan 3 video')),
    }), {
      env: { GEMINI_API_KEY: KEY },
      fetchImpl: async () => new Response(JSON.stringify({
        error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Resource has been exhausted' },
      }), { status: 503 }),
    });
    assert.equal(exhausted.status, 429);
    assert.equal((await exhausted.json()).message, QUOTA_MESSAGE);
  });

  test('parser JSON dan modul perencana tidak mengenal endpoint buat jadwal', () => {
    const parsed = parsePlannerJson('catatan {"reply":"ok","items":[]} selesai');
    assert.equal(parsed.reply, 'ok');
    assert.deepEqual(parsed.items, []);
    const source = readFileSync(path.join(root, 'server/repliz-plan.js'), 'utf8');
    assert.equal(source.includes('api.repliz.com'), false);
    assert.equal(source.includes('handleReplizScheduleRequest'), false);

    const panel = readFileSync(path.join(root, 'src/JadwalReplizPanel.jsx'), 'utf8');
    const chat = panel.slice(panel.indexOf('async function sendChat'), panel.indexOf('async function confirmSend'));
    assert.equal(chat.includes('/api/repliz-schedule'), false);
    assert.equal(chat.includes('SCHEDULE_ENDPOINT'), false);
    assert.equal(chat.includes('PLAN_ENDPOINT'), true);
    assert.equal(panel.slice(panel.indexOf('async function confirmSend')).includes('SCHEDULE_ENDPOINT'), true);
  });

  test('kunci Gemini kosong tidak memanggil upstream', async () => {
    let called = 0;
    const response = await handleReplizPlanRequest(new Request('http://dashboard.local/api/repliz-plan', {
      method: 'POST',
      body: JSON.stringify(payload('halo')),
    }), {
      env: {},
      fetchImpl: async () => {
        called += 1;
        return geminiText('{}');
      },
    });
    assert.equal(called, 0);
    assert.equal(response.status, 503);
  });
});
