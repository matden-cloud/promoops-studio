import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { encodeWavPcm16 } from './voice-audio.js';
import {
  FLASH_LITE_TTS_MODEL,
  FLASH_TTS_MODEL,
  VOICE_API_ORIGIN,
  handleVoiceRequest,
  voiceLimits,
} from './voice.js';

const API_KEY = 'kunci-gemini-rahasia-uji';

function tone(seconds, sampleRate = 16000) {
  const length = Math.round(seconds * sampleRate);
  const samples = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    samples[index] = Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 0.4;
  }
  return Buffer.from(encodeWavPcm16(samples, sampleRate)).toString('base64');
}

function request(method, body, search = '') {
  const init = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return new Request(`http://dashboard.local/api/voice${search}`, init);
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function assertKeyHidden(url, options, key = API_KEY) {
  const target = new URL(url);
  assert.equal(target.origin, VOICE_API_ORIGIN);
  assert.equal(target.searchParams.has('key'), false);
  assert.equal(url.includes(key), false);
  assert.equal(options.headers['x-goog-api-key'], key);
  assert.equal(JSON.stringify(options.headers).includes(`?${'key'}=`), false);
}

describe('rute Editor Voice', () => {
  test('daftar hanya suara replicated dan tidak membocorkan kunci', async () => {
    const calls = [];
    const response = await handleVoiceRequest(request('GET'), {
      env: { GEMINI_API_KEY: API_KEY },
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        assertKeyHidden(url, options);
        const target = new URL(url);
        assert.equal(target.pathname, '/v1beta/voices');
        assert.equal(target.searchParams.get('type'), 'replicated');
        assert.equal(options.method, 'GET');
        if (!target.searchParams.get('page_token')) {
          return jsonResponse({
            voices: [
              { id: 'voice_baru1234', type: 'replicated', display_name: 'Pengisi suara', model: FLASH_TTS_MODEL },
              { id: 'Kore', type: 'prebuilt', display_name: 'Kore' },
              { id: 'voice_drop', type: 'prompted', display_name: 'Desain' },
            ],
            next_page_token: 'halaman-2',
          });
        }
        assert.equal(target.searchParams.get('page_token'), 'halaman-2');
        return jsonResponse({
          voices: [{ id: 'voice_lama5678', type: 'replicated', display_name: '', expire_time: '2027-01-01T00:00:00Z' }],
        });
      },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.configured, true);
    assert.deepEqual(body.voices.map((voice) => voice.id), ['voice_baru1234', 'voice_lama5678']);
    assert.equal(body.voices[0].name, 'Pengisi suara');
    assert.equal(body.voices[0].status, 'ready');
    assert.equal(body.voices[1].name, 'Profil suara');
    assert.equal(calls.length, 2);
    assert.equal(JSON.stringify(body).includes(API_KEY), false);
  });

  test('buat profil memakai store true, WAV, dan Voices API', async () => {
    let sent;
    const response = await handleVoiceRequest(request('POST', {
      action: 'create',
      displayName: '  Profil uji  ',
      sourceWav: tone(12),
      consentWav: tone(4),
    }), {
      env: { GEMINI_API_KEY: API_KEY },
      fetchImpl: async (url, options) => {
        assertKeyHidden(url, options);
        assert.equal(url, `${VOICE_API_ORIGIN}/v1beta/voices`);
        assert.equal(options.method, 'POST');
        sent = JSON.parse(options.body);
        return jsonResponse({
          id: 'voice_profil99',
          type: 'replicated',
          display_name: 'Profil uji',
          model: FLASH_TTS_MODEL,
        });
      },
    });

    assert.equal(sent.store, true);
    assert.equal(sent.voice.model, FLASH_TTS_MODEL);
    assert.equal(sent.voice.type, 'replicated');
    assert.equal(sent.voice.display_name, 'Profil uji');
    assert.equal(sent.voice.replicated.source_audio.mime_type, 'audio/wav');
    assert.equal(sent.voice.replicated.consent_audio.mime_type, 'audio/wav');
    assert.equal(typeof sent.voice.replicated.source_audio.data, 'string');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.voice.id, 'voice_profil99');
    assert.equal(body.voice.status, 'ready');
    assert.equal(JSON.stringify(body).includes(API_KEY), false);
  });

  test('referensi yang terlalu pendek ditolak tanpa memanggil Gemini', async () => {
    let calls = 0;
    const response = await handleVoiceRequest(request('POST', {
      action: 'create',
      displayName: 'Pendek',
      sourceWav: tone(3),
      consentWav: tone(3),
    }), {
      env: { GEMINI_API_KEY: API_KEY },
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({});
      },
    });
    assert.equal(calls, 0);
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(body.message, /10–30/);
  });

  test('hapus profil memanggil DELETE voices dan id tidak valid ditolak', async () => {
    let method = '';
    let urlSeen = '';
    const response = await handleVoiceRequest(request('DELETE', undefined, '?id=voice_hapus123'), {
      env: { GEMINI_API_KEY: API_KEY },
      fetchImpl: async (url, options) => {
        method = options.method;
        urlSeen = url;
        assertKeyHidden(url, options);
        return new Response('', { status: 200 });
      },
    });
    assert.equal(response.status, 200);
    assert.equal(method, 'DELETE');
    assert.equal(urlSeen, `${VOICE_API_ORIGIN}/v1beta/voices/voice_hapus123`);
    assert.equal((await response.json()).ok, true);

    let calls = 0;
    const bad = await handleVoiceRequest(request('DELETE', undefined, '?id=Kore'), {
      env: { GEMINI_API_KEY: API_KEY },
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({});
      },
    });
    assert.equal(calls, 0);
    assert.equal(bad.status, 400);
  });

  test('TTS memakai interactions, speech_config, dan model yang dipilih', async () => {
    const seen = [];
    const fetchImpl = async (url, options) => {
      seen.push(JSON.parse(options.body));
      assertKeyHidden(url, options);
      assert.equal(url, `${VOICE_API_ORIGIN}/v1beta/interactions`);
      assert.equal(options.method, 'POST');
      return jsonResponse({
        status: 'completed',
        steps: [
          { type: 'model_output', content: [{ type: 'text', text: 'bukan audio' }] },
          { type: 'model_output', content: [{ type: 'audio', mime_type: 'audio/wav', data: 'UklGRg==' }] },
        ],
      });
    };
    const env = { GEMINI_API_KEY: API_KEY };

    const withStyle = await handleVoiceRequest(request('POST', {
      action: 'speak',
      voiceId: 'voice_profil99',
      text: 'Halo, stok terbatas.',
      style: 'santai, semangat',
      model: FLASH_LITE_TTS_MODEL,
    }), { env, fetchImpl });
    assert.equal(withStyle.status, 200);
    assert.equal((await withStyle.json()).audioWav, 'UklGRg==');
    assert.deepEqual(seen[0], {
      model: FLASH_LITE_TTS_MODEL,
      input: [{
        type: 'user_input',
        content: [{
          type: 'text',
          text: 'Halo, stok terbatas.',
          annotations: [{ type: 'speech_metadata', style: 'santai, semangat' }],
        }],
      }],
      response_format: { type: 'audio', mime_type: 'audio/wav' },
      generation_config: { speech_config: [{ voice: 'voice_profil99' }] },
    });

    const plain = await handleVoiceRequest(request('POST', {
      action: 'speak',
      voiceId: 'voice_profil99',
      text: 'Tanpa gaya',
      style: '   ',
      model: FLASH_TTS_MODEL,
    }), { env, fetchImpl });
    assert.equal(plain.status, 200);
    assert.equal(seen[1].model, FLASH_TTS_MODEL);
    assert.equal(seen[1].input[0].content[0].annotations, undefined);
    assert.equal(seen[1].generation_config.speech_config[0].voice, 'voice_profil99');
  });

  test('429 dan pesan upstream yang memuat kunci disensor', async () => {
    const quota = await handleVoiceRequest(request('POST', {
      action: 'speak',
      voiceId: 'voice_profil99',
      text: 'Coba kuota',
      model: FLASH_TTS_MODEL,
    }), {
      env: { GEMINI_API_KEY: API_KEY },
      fetchImpl: async () => jsonResponse({
        error: { status: 'RESOURCE_EXHAUSTED', message: `limit ${API_KEY}` },
      }, 429),
    });
    const quotaBody = await quota.json();
    assert.equal(quota.status, 429);
    assert.equal(quotaBody.error, 'quota');
    assert.equal(quotaBody.message, voiceLimits.quotaMessage);
    assert.equal(JSON.stringify(quotaBody).includes(API_KEY), false);

    const failed = await handleVoiceRequest(request('POST', {
      action: 'speak',
      voiceId: 'voice_profil99',
      text: 'Coba gagal',
      model: FLASH_TTS_MODEL,
    }), {
      env: { GEMINI_API_KEY: API_KEY },
      fetchImpl: async () => jsonResponse({
        error: { status: 'INVALID_ARGUMENT', message: `tolak ${API_KEY} sekarang` },
      }, 400),
    });
    const failedBody = await failed.json();
    assert.equal(failed.status, 502);
    assert.equal(failedBody.message, 'Gemini menolak permintaan.');
    assert.match(failedBody.detail, /\[redacted\]/);
    assert.equal(JSON.stringify(failedBody).includes(API_KEY), false);
  });

  test('kunci kosong, aksi asing, dan body besar tidak memanggil Gemini', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return jsonResponse({});
    };

    const missingGet = await handleVoiceRequest(request('GET'), { env: {}, fetchImpl });
    assert.equal(missingGet.status, 200);
    const missingBody = await missingGet.json();
    assert.equal(missingBody.configured, false);
    assert.deepEqual(missingBody.voices, []);
    assert.match(missingBody.message, /belum dikonfigurasi/);

    const missingPost = await handleVoiceRequest(request('POST', {
      action: 'speak',
      voiceId: 'voice_profil99',
      text: 'Halo',
    }), { env: { GEMINI_API_KEY: '   ' }, fetchImpl });
    assert.equal(missingPost.status, 503);
    assert.equal((await missingPost.json()).error, 'missing_api_key');

    const wrong = await handleVoiceRequest(request('PUT', { action: 'speak' }), {
      env: { GEMINI_API_KEY: API_KEY },
      fetchImpl,
    });
    assert.equal(wrong.status, 405);

    const alien = await handleVoiceRequest(request('POST', { action: 'drop-table' }), {
      env: { GEMINI_API_KEY: API_KEY },
      fetchImpl,
    });
    assert.equal(alien.status, 400);

    const huge = await handleVoiceRequest(request('POST', {
      action: 'create',
      displayName: 'Besar',
      sourceWav: 'A'.repeat(3_100_000),
      consentWav: tone(3),
    }), { env: { GEMINI_API_KEY: API_KEY }, fetchImpl });
    assert.equal(huge.status, 413);
    assert.equal(calls, 0);
  });
});
