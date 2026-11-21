import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { FISH_ENDED_MESSAGE, FISH_FREE_ENDS_AT, FISH_FREE_MODEL } from './voice-free.js';
import { handleVoiceRoute } from './voice-route.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CUTOFF = Date.parse(FISH_FREE_ENDS_AT);

function request(engine, method = 'GET', body) {
  const url = new URL('http://dashboard.local/api/voice');
  if (engine) url.searchParams.set('engine', engine);
  const init = { method };
  if (body) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

describe('satu fungsi /api/voice', () => {
  test('folder api tetap 12 berkas atau kurang', () => {
    const files = readdirSync(path.join(root, 'api')).filter((name) => name.endsWith('.js'));
    assert.equal(files.includes('fish.js'), false);
    assert.equal(files.includes('inworld.js'), false);
    assert.equal(files.includes('voice.js'), true);
    assert.ok(files.length <= 12, files.join(','));
    assert.equal(files.length, 12);
  });

  test('engine=fish setelah batas WIB menjawab 410 dan tidak memanggil Fish', async () => {
    let calls = 0;
    const response = await handleVoiceRoute(request('fish', 'POST', {
      action: 'speak',
      voiceId: 'abcdef0123456789',
      text: 'Jangan ditagih',
    }), {
      now: () => CUTOFF,
      env: { FISH_API_KEY: 'kunci-fish' },
      fetchImpl: async () => {
        calls += 1;
        return new Response('{}', { status: 200 });
      },
    });
    const body = await response.json();
    assert.equal(response.status, 410);
    assert.equal(body.message, FISH_ENDED_MESSAGE);
    assert.equal(calls, 0);
  });

  test('engine=fish sebelum batas tetap mengirim header model gratis', async () => {
    let header = '';
    const response = await handleVoiceRoute(request('fish', 'POST', {
      action: 'speak',
      voiceId: 'abcdef0123456789',
      text: 'Halo',
      model: 's2.1-pro',
    }), {
      now: () => CUTOFF - 1000,
      env: { FISH_API_KEY: 'kunci-fish' },
      fetchImpl: async (_url, options) => {
        header = options.headers.model;
        return new Response(Buffer.from('RIFFaudio'), { status: 200 });
      },
    });
    assert.equal(response.status, 200);
    assert.equal(header, FISH_FREE_MODEL);
  });

  test('tanpa engine tetap Gemini dan engine=inworld tidak memakai kunci Gemini', async () => {
    let geminiCalls = 0;
    const gemini = await handleVoiceRoute(request('', 'GET'), {
      env: {},
      fetchImpl: async () => {
        geminiCalls += 1;
        return new Response('{}', { status: 200 });
      },
    });
    assert.equal(gemini.status, 200);
    assert.equal((await gemini.json()).configured, false);
    assert.equal(geminiCalls, 0);

    let inworldCalls = 0;
    const inworld = await handleVoiceRoute(request('inworld', 'GET'), {
      env: { GEMINI_API_KEY: 'kunci-gemini' },
      fetchImpl: async () => {
        inworldCalls += 1;
        return new Response('{}', { status: 200 });
      },
    });
    const body = await inworld.json();
    assert.equal(body.configured, false);
    assert.match(body.message, /INWORLD_API_KEY/);
    assert.equal(inworldCalls, 0);
  });
});
