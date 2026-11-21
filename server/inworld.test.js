import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { encodeWavPcm16 } from './voice-audio.js';
import { INWORLD_ORIGIN, handleInworldRequest } from './inworld.js';
import { INWORLD_TTS_MODEL } from './voice-free.js';

const API_KEY = 'kunci-inworld-rahasia-uji';

function wav(seconds) {
  const rate = 16000;
  const samples = new Float32Array(Math.round(seconds * rate));
  for (let index = 0; index < samples.length; index += 1) samples[index] = 0.15;
  return Buffer.from(encodeWavPcm16(samples, rate)).toString('base64');
}

function request(method, body, search = '') {
  const init = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return new Request(`http://dashboard.local/api/inworld${search}`, init);
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('Inworld suara gratis', () => {
  test('klon instan mengirim sampel dan hanya menampilkan sumber IVC', async () => {
    const urls = [];
    const response = await handleInworldRequest(request('GET'), {
      env: { INWORLD_API_KEY: API_KEY },
      fetchImpl: async (url, options) => {
        urls.push(url);
        assert.equal(options.headers.Authorization, `Basic ${API_KEY}`);
        assert.equal(url.includes(API_KEY), false);
        assert.match(new URL(url).searchParams.get('filter'), /IVC/);
        return jsonResponse({
          voices: [
            { voiceId: 'ws__klon1234', displayName: 'Klon', source: 'IVC' },
            { voiceId: 'Ashley', displayName: 'Ashley', source: 'SYSTEM' },
          ],
        });
      },
    });
    const body = await response.json();
    assert.deepEqual(body.voices.map((voice) => voice.id), ['ws__klon1234']);
    assert.equal(body.voices[0].engine, 'inworld');
    assert.equal(urls[0].startsWith(`${INWORLD_ORIGIN}/voices/v1/voices`), true);
  });

  test('buat profil memakai voices:clone dan TTS memakai model termurah', async () => {
    const sent = [];
    const fetchImpl = async (url, options) => {
      sent.push({ url, body: JSON.parse(options.body), auth: options.headers.Authorization });
      if (url.endsWith(':clone')) {
        return jsonResponse({ voiceId: 'ws__klon1234', displayName: 'Klon', source: 'IVC' });
      }
      return jsonResponse({
        audioContent: Buffer.from(encodeWavPcm16(new Float32Array(1600), 16000)).toString('base64'),
        usage: { modelId: INWORLD_TTS_MODEL, processedCharactersCount: 4 },
      });
    };
    const env = { INWORLD_API_KEY: API_KEY };
    const created = await handleInworldRequest(request('POST', {
      action: 'create',
      displayName: 'Klon',
      sourceWav: wav(4),
    }), { env, fetchImpl });
    assert.equal(created.status, 200);
    assert.equal(sent[0].url, `${INWORLD_ORIGIN}/voices/v1/voices:clone`);
    assert.equal(sent[0].body.voiceSamples[0].audioData.length > 20, true);
    assert.equal(sent[0].body.languageCode, 'id-ID');

    const spoken = await handleInworldRequest(request('POST', {
      action: 'speak',
      voiceId: 'ws__klon1234',
      text: 'Halo.',
      model: 'inworld-tts-2',
    }), { env, fetchImpl });
    assert.equal(spoken.status, 200);
    assert.equal(sent[1].url, `${INWORLD_ORIGIN}/tts/v1/voice`);
    assert.equal(sent[1].body.modelId, INWORLD_TTS_MODEL);
    assert.equal(sent[1].body.voiceId, 'ws__klon1234');
    assert.equal(sent[1].body.audioConfig.audioEncoding, 'WAV');
    assert.equal(JSON.stringify(sent[1].body).includes('inworld-tts-2"'), false);
  });

  test('error upstream menyensor kunci dan kunci kosong tidak memanggil Inworld', async () => {
    const failed = await handleInworldRequest(request('POST', {
      action: 'speak',
      voiceId: 'ws__klon1234',
      text: 'Halo',
    }), {
      env: { INWORLD_API_KEY: API_KEY },
      fetchImpl: async () => jsonResponse({ message: `gagal ${API_KEY}` }, 500),
    });
    const body = await failed.json();
    assert.equal(JSON.stringify(body).includes(API_KEY), false);
    assert.match(body.detail, /\[redacted\]/);

    let calls = 0;
    const missing = await handleInworldRequest(request('GET'), {
      env: {},
      fetchImpl: async () => { calls += 1; return jsonResponse({}); },
    });
    const missingBody = await missing.json();
    assert.equal(missingBody.configured, false);
    assert.match(missingBody.message, /INWORLD_API_KEY/);
    assert.equal(calls, 0);
  });
});
