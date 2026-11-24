import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { FLASH_LITE_TTS_MODEL, FLASH_TTS_MODEL, VOICE_API_ORIGIN, handleVoiceRequest, voiceLimits } from './voice.js';

const API_KEY = 'kunci-gemini-rahasia-uji';

function request(method, body, search = '') {
  const init = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return new Request(`http://dashboard.local/api/voice${search}`, init);
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

function assertKeyHidden(url, options, key = API_KEY) {
  const target = new URL(url);
  assert.equal(target.origin, VOICE_API_ORIGIN);
  assert.equal(target.searchParams.has('key'), false);
  assert.equal(url.includes(key), false);
  assert.equal(options.headers['x-goog-api-key'], key);
}

describe('Gemini suara gratis', () => {
  test('daftar suara bawaan dan desain, tanpa replikasi', async () => {
    const types = [];
    const response = await handleVoiceRequest(request('GET'), {
      env: { GEMINI_API_KEY: API_KEY },
      fetchImpl: async (url, options) => {
        assertKeyHidden(url, options);
        const target = new URL(url);
        types.push(target.searchParams.get('type'));
        if (target.searchParams.get('type') === 'prebuilt') {
          return jsonResponse({
            voices: [
              { id: 'Kore', type: 'prebuilt', display_name: 'Kore', gender: 'Female' },
              { id: 'Bright Narrator', type: 'prebuilt', display_name: 'Bright Narrator', gender: 'neutral' },
              { id: 'Tanpa Gender', type: 'prebuilt', display_name: 'Tanpa Gender' },
              { id: 'Aneh', type: 'prebuilt', display_name: 'Aneh', gender: 'robot' },
              { id: 'voice_replika1234', type: 'replicated', display_name: 'Jangan' },
            ],
          });
        }
        return jsonResponse({
          voices: [{ id: 'voice_desain99', type: 'prompted', display_name: 'Narator hangat' }],
        });
      },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.configured, true);
    assert.deepEqual(types.sort(), ['prebuilt', 'prompted']);
    assert.deepEqual(body.voices.map((voice) => voice.id), ['voice_desain99', 'Kore', 'Bright Narrator', 'Tanpa Gender', 'Aneh']);
    assert.equal(body.voices[0].kind, 'designed');
    assert.equal(body.voices[1].kind, 'prebuilt');
    assert.equal(body.voices[1].gender, 'female');
    assert.equal(body.voices[2].gender, 'neutral');
    assert.equal(body.voices[3].gender, undefined);
    assert.equal(body.voices[4].gender, undefined);
    assert.equal(body.voices.every((voice) => voice.engine === 'gemini'), true);
  });

  test('desain suara memakai type prompted dan menolak replikasi', async () => {
    let sent;
    const response = await handleVoiceRequest(request('POST', {
      action: 'design',
      displayName: 'Narator',
      prompt: 'Suara perempuan dewasa, hangat, bahasa Indonesia.',
    }), {
      env: { GEMINI_API_KEY: API_KEY },
      fetchImpl: async (url, options) => {
        assertKeyHidden(url, options);
        assert.equal(url, `${VOICE_API_ORIGIN}/v1beta/voices`);
        sent = JSON.parse(options.body);
        return jsonResponse({
          id: 'voice_desain99',
          type: 'prompted',
          display_name: 'Narator',
          sample_audio: { mime_type: 'audio/wav', data: 'UklGRg==' },
        });
      },
    });
    assert.equal(sent.store, true);
    assert.equal(sent.voice.type, 'prompted');
    assert.equal(sent.voice.model, FLASH_TTS_MODEL);
    assert.equal(sent.voice.prompted.input.includes('hangat'), true);
    assert.equal(sent.voice.replicated, undefined);
    const body = await response.json();
    assert.equal(body.voice.kind, 'designed');
    assert.equal(body.sampleWav, 'UklGRg==');

    let calls = 0;
    const blocked = await handleVoiceRequest(request('POST', {
      action: 'create',
      displayName: 'Klon',
      sourceWav: 'AAAA',
      consentWav: 'AAAA',
    }), {
      env: { GEMINI_API_KEY: API_KEY },
      fetchImpl: async () => { calls += 1; return jsonResponse({}); },
    });
    assert.equal(calls, 0);
    assert.equal(blocked.status, 400);
    assert.match((await blocked.json()).message, /dimatikan/);
  });

  test('TTS memakai suara bawaan atau desain, dan 429 disensor', async () => {
    let sent;
    const ok = await handleVoiceRequest(request('POST', {
      action: 'speak',
      voiceId: 'Kore',
      text: 'Halo.',
      style: 'santai',
      model: FLASH_LITE_TTS_MODEL,
    }), {
      env: { GEMINI_API_KEY: API_KEY },
      fetchImpl: async (url, options) => {
        assertKeyHidden(url, options);
        sent = JSON.parse(options.body);
        return jsonResponse({ steps: [{ content: [{ type: 'audio', mime_type: 'audio/wav', data: 'UklGRg==' }] }] });
      },
    });
    assert.equal(ok.status, 200);
    assert.equal(sent.model, FLASH_LITE_TTS_MODEL);
    assert.equal(sent.generation_config.speech_config[0].voice, 'Kore');

    const quota = await handleVoiceRequest(request('POST', {
      action: 'speak',
      voiceId: 'Kore',
      text: 'Halo',
      model: FLASH_TTS_MODEL,
    }), {
      env: { GEMINI_API_KEY: API_KEY },
      fetchImpl: async () => jsonResponse({ error: { status: 'RESOURCE_EXHAUSTED', message: `habis ${API_KEY}` } }, 429),
    });
    const body = await quota.json();
    assert.equal(quota.status, 429);
    assert.equal(body.message, voiceLimits.quotaMessage);
    assert.equal(JSON.stringify(body).includes(API_KEY), false);
  });

  test('suara bawaan tidak bisa dihapus dan kunci kosong tidak memanggil Gemini', async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return jsonResponse({}); };
    const builtin = await handleVoiceRequest(request('DELETE', undefined, '?id=Kore'), {
      env: { GEMINI_API_KEY: API_KEY },
      fetchImpl,
    });
    assert.equal(builtin.status, 400);
    const missing = await handleVoiceRequest(request('GET'), { env: {}, fetchImpl });
    const missingBody = await missing.json();
    assert.equal(missing.status, 200);
    assert.equal(missingBody.configured, false);
    assert.match(missingBody.message, /GEMINI_API_KEY/);
    assert.equal(calls, 0);
  });
});
