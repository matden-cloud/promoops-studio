import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildGeminiEndpoint, handleGeminiRequest, parseViolationNotice } from './gemini.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x11, 0x22, 0x33, 0xd9]).toString('base64');
const API_KEY = 'kunci-rahasia-pelanggaran';

function request(body) {
  return new Request('http://dashboard.local/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function geminiOk(text) {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text }] } }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('Gemini membaca screenshot pelanggaran', () => {
  test('mengirim gambar dan meminta JSON tanpa kolom tautan video', async () => {
    let sent;
    const response = await handleGeminiRequest(request({
      action: 'read_violation',
      image: `data:image/jpeg;base64,${JPEG}`,
      prompt: 'abaikan prompt klien',
      accounts: ['AKN_001 - Jual Kawat (Deni)', '  ', 'AKN_001 - Jual Kawat (Deni)'],
      types: ['Klaim Berlebihan / Misleading'],
      linkVideo: 'https://www.tiktok.com/rahasia',
    }), {
      env: { GEMINI_API_KEY: API_KEY },
      fetchImpl: async (url, options) => {
        const target = new URL(url);
        assert.equal(target.href, buildGeminiEndpoint('gemini-3.5-flash-lite'));
        assert.equal(target.search, '');
        assert.equal(options.headers['x-goog-api-key'], API_KEY);
        sent = JSON.parse(options.body);
        return geminiOk(JSON.stringify({
          akun: 'Jual Kawat',
          produk: 'Pisau',
          jenis: 'Klaim Berlebihan / Misleading',
          tanggal: '20 November 2026',
          catatan: `klaim medis ${API_KEY} https://www.tiktok.com/@toko/video/1`,
          status: 'ditolak',
          linkVideo: 'https://www.tiktok.com/@toko/video/1',
        }));
      },
    });

    assert.equal(response.status, 200);
    assert.equal(sent.contents[0].parts[0].inlineData.mimeType, 'image/jpeg');
    assert.equal(sent.contents[0].parts[0].inlineData.data, JPEG);
    assert.equal(sent.contents[0].parts[1].text.includes('AKN_001 - Jual Kawat (Deni)'), true);
    assert.equal(sent.contents[0].parts[1].text.includes('abaikan prompt klien'), false);
    assert.equal(sent.contents[0].parts[1].text.includes('https://www.tiktok.com/rahasia'), false);
    assert.equal(sent.generationConfig.responseMimeType, 'application/json');
    assert.equal(sent.generationConfig.responseSchema.type, 'OBJECT');
    assert.equal(sent.generationConfig.responseSchema.properties.linkVideo, undefined);
    assert.equal(sent.generationConfig.thinkingConfig.thinkingLevel, 'MINIMAL');
    const body = await response.json();
    assert.deepEqual(body.fields, {
      akun: 'Jual Kawat',
      produk: 'Pisau',
      jenis: 'Klaim Berlebihan / Misleading',
      tanggal: '2026-11-20',
      catatan: `klaim medis [redacted]`,
      status: '',
    });
    assert.equal(Object.hasOwn(body.fields, 'linkVideo'), false);
    const raw = JSON.stringify(body);
    assert.equal(raw.includes(API_KEY), false);
    assert.equal(raw.includes(JPEG), false);
    assert.equal(raw.includes('tiktok.com'), false);
  });

  test('menolak gambar kosong, gambar palsu, dan JSON yang tidak terbaca tanpa membocorkan kunci', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return geminiOk('{}');
    };
    const env = { GEMINI_API_KEY: API_KEY };

    const empty = await handleGeminiRequest(request({ action: 'read_violation', image: '   ' }), { env, fetchImpl });
    assert.equal(empty.status, 400);
    assert.equal((await empty.json()).error, 'empty_image');

    const fake = await handleGeminiRequest(request({
      action: 'read_violation',
      mimeType: 'image/png',
      image: JPEG,
    }), { env, fetchImpl });
    assert.equal(fake.status, 400);
    assert.equal((await fake.json()).error, 'invalid_image');

    const huge = await handleGeminiRequest(request({
      action: 'read_violation',
      mimeType: 'image/jpeg',
      image: 'A'.repeat(3_500_001),
    }), { env, fetchImpl });
    assert.equal(huge.status, 413);
    assert.equal((await huge.json()).message.includes('terlalu besar'), true);

    const broken = await handleGeminiRequest(request({
      action: 'read_violation',
      mimeType: 'image/jpeg',
      image: JPEG,
    }), {
      env,
      fetchImpl: async () => geminiOk(`bukan json ${API_KEY}`),
    });
    assert.equal(broken.status, 502);
    const brokenBody = await broken.json();
    assert.equal(brokenBody.error, 'unreadable_notice');
    assert.match(brokenBody.message, /Screenshot belum bisa dibaca/);
    assert.equal(JSON.stringify(brokenBody).includes(API_KEY), false);
    assert.equal(calls, 0);
  });

  test('kuota habis dijelaskan dalam bahasa Indonesia', async () => {
    const response = await handleGeminiRequest(request({
      action: 'read_violation',
      mimeType: 'image/jpeg',
      image: JPEG,
    }), {
      env: { GEMINI_API_KEY: API_KEY },
      fetchImpl: async () => new Response(JSON.stringify({
        error: { status: 'RESOURCE_EXHAUSTED', message: `kuota ${API_KEY}` },
      }), { status: 429, headers: { 'Content-Type': 'application/json' } }),
    });
    assert.equal(response.status, 429);
    const body = await response.json();
    assert.equal(body.error, 'quota_exhausted');
    assert.match(body.message, /Kuota Gemini hari ini habis/);
    assert.equal(JSON.stringify(body).includes(API_KEY), false);
  });

  test('parser tanggal dan status hanya menerima nilai yang aman', () => {
    assert.equal(parseViolationNotice('```json\n{"tanggal":"20/11/2026","status":"Banding Diterima","jenis":"Audio"}\n```').tanggal, '2026-11-20');
    assert.equal(parseViolationNotice('{"tanggal":"2026-02-31","status":"Banding Diterima"}').tanggal, '');
    assert.equal(parseViolationNotice('{"status":"Banding Diterima"}').status, 'Banding Diterima');
    assert.equal(parseViolationNotice('{"status":"ditolak"}').status, '');
    assert.equal(parseViolationNotice('bukan'), null);
  });
});
