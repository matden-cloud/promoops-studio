import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { encodeWavPcm16 } from './voice-audio.js';
import { FISH_ORIGIN, handleFishRequest } from './fish.js';
import { FISH_ENDED_MESSAGE, FISH_FREE_ENDS_AT, FISH_FREE_MODEL } from './voice-free.js';

const API_KEY = 'kunci-fish-rahasia-uji';
const CUTOFF = Date.parse(FISH_FREE_ENDS_AT);
const BEFORE = CUTOFF - 1000;

function wav(seconds) {
  const rate = 16000;
  const samples = new Float32Array(Math.round(seconds * rate));
  for (let index = 0; index < samples.length; index += 1) samples[index] = 0.2;
  return Buffer.from(encodeWavPcm16(samples, rate)).toString('base64');
}

function request(method, body, search = '') {
  const init = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return new Request(`http://dashboard.local/api/fish${search}`, init);
}

describe('Fish Audio gratis', () => {
  test('sebelum batas memanggil model s2.1-pro-free saja', async () => {
    let header = '';
    let sent = null;
    const response = await handleFishRequest(request('POST', {
      action: 'speak',
      voiceId: 'abcdef0123456789',
      text: 'Halo dari klon.',
      model: 's2.1-pro',
    }), {
      now: () => BEFORE,
      env: { FISH_API_KEY: API_KEY },
      fetchImpl: async (url, options) => {
        header = options.headers.model;
        assert.equal(options.headers.Authorization, `Bearer ${API_KEY}`);
        assert.equal(url.includes(API_KEY), false);
        assert.equal(new URL(url).origin, FISH_ORIGIN);
        sent = JSON.parse(options.body);
        return new Response(Buffer.from('RIFFaudio'), { status: 200, headers: { 'Content-Type': 'audio/wav' } });
      },
    });
    assert.equal(response.status, 200);
    assert.equal(header, FISH_FREE_MODEL);
    assert.equal(sent.reference_id, 'abcdef0123456789');
    assert.equal(sent.format, 'wav');
    assert.equal(sent.model, undefined);
    const body = await response.json();
    assert.equal(typeof body.audioWav, 'string');
    assert.equal(JSON.stringify(body).includes(API_KEY), false);
  });

  test('buat profil mengirim train_mode fast dan WAV, tanpa model berbayar', async () => {
    let form;
    const response = await handleFishRequest(request('POST', {
      action: 'create',
      displayName: 'Pengisi',
      sourceWav: wav(12),
    }), {
      now: () => BEFORE,
      env: { FISH_API_KEY: API_KEY },
      fetchImpl: async (url, options) => {
        assert.equal(url, `${FISH_ORIGIN}/model`);
        assert.equal(options.headers.model, FISH_FREE_MODEL);
        form = options.body;
        return new Response(JSON.stringify({ _id: 'abcdef0123456789', title: 'Pengisi', state: 'trained', type: 'tts' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    assert.equal(form.get('type'), 'tts');
    assert.equal(form.get('train_mode'), 'fast');
    assert.equal(form.get('visibility'), 'private');
    assert.equal(form.get('title'), 'Pengisi');
    assert.ok(form.get('voices'));
    assert.equal((await response.json()).voice.engine, 'fish');
  });

  test('tepat 1 Des 2026 00.00 WIB dan sesudahnya menolak tanpa memanggil Fish', async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return new Response('{}', { status: 200 }); };
    const env = { FISH_API_KEY: API_KEY };
    for (const now of [() => CUTOFF, () => Date.parse('2026-11-30T17:00:00.000Z'), () => CUTOFF + 60_000]) {
      const response = await handleFishRequest(request('POST', {
        action: 'speak',
        voiceId: 'abcdef0123456789',
        text: 'Jangan ditagih',
      }), { now, env, fetchImpl });
      const body = await response.json();
      assert.equal(response.status, 410);
      assert.equal(body.message, FISH_ENDED_MESSAGE);
      assert.equal(body.fish.expired, true);
    }
    const listed = await handleFishRequest(request('GET'), { now: () => CUTOFF, env, fetchImpl });
    assert.equal(listed.status, 410);
    assert.equal(calls, 0);
  });

  test('satu detik sebelum batas masih diizinkan, kunci di error disensor', async () => {
    const ok = await handleFishRequest(request('GET'), {
      now: () => Date.parse('2026-11-30T16:59:59.000Z'),
      env: { FISH_API_KEY: API_KEY },
      fetchImpl: async (url) => {
        assert.equal(new URL(url).searchParams.get('self'), 'true');
        return new Response(JSON.stringify({ total: 1, items: [{ _id: 'abcdef0123456789', title: 'Ada', state: 'trained', type: 'tts' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    });
    assert.equal((await ok.json()).voices[0].status, 'ready');

    const failed = await handleFishRequest(request('POST', {
      action: 'speak',
      voiceId: 'abcdef0123456789',
      text: 'Halo',
    }), {
      now: () => BEFORE,
      env: { FISH_API_KEY: API_KEY },
      fetchImpl: async () => new Response(JSON.stringify({ message: `tolak ${API_KEY}` }), { status: 400, headers: { 'Content-Type': 'application/json' } }),
    });
    const body = await failed.json();
    assert.equal(JSON.stringify(body).includes(API_KEY), false);
    assert.match(body.detail, /\[redacted\]/);
  });

  test('tanpa kunci tidak memanggil Fish', async () => {
    let calls = 0;
    const response = await handleFishRequest(request('GET'), {
      now: () => BEFORE,
      env: {},
      fetchImpl: async () => { calls += 1; return new Response('{}'); },
    });
    const body = await response.json();
    assert.equal(body.configured, false);
    assert.match(body.message, /FISH_API_KEY/);
    assert.equal(calls, 0);
  });
});
