import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import appsScriptHandler from '../api/apps-script.js';
import geminiHandler from '../api/gemini.js';
import { GET_ACTIONS, POST_ACTIONS, handleAppsScriptRequest } from './apps-script.js';
import { DEFAULT_GEMINI_MODEL, GEMINI_ENDPOINT, buildGeminiEndpoint, handleGeminiRequest } from './gemini.js';
import { createApiMiddleware } from './vite-api-plugin.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const forbidden = [
  'script.google.com' + '/macros',
  'VITE_' + 'GEMINI',
  '?' + 'key=',
  'AKfycbw' + 'Txa-MqVkrK65FPqNfR8ZglL17sZQ5QTExgQ0jtc',
];

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

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function startUpstream(onRequest) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const body = await readBody(req);
    const url = new URL(req.url, 'http://127.0.0.1');
    const recorded = {
      method: req.method,
      pathname: url.pathname,
      token: url.searchParams.get('token'),
      action: url.searchParams.get('action'),
      params: Object.fromEntries(url.searchParams.entries()),
      body,
      contentType: req.headers['content-type'] || '',
    };
    requests.push(recorded);
    onRequest(req, res, recorded, url);
  });
  const port = await listen(server);
  return {
    requests,
    origin: `http://127.0.0.1:${port}`,
    close: () => closeServer(server),
  };
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function envOf(upstream, token = 'rahasia-uji') {
  return {
    APPS_SCRIPT_URL: `${upstream.origin}/exec`,
    APPS_SCRIPT_TOKEN: token,
  };
}

describe('perantara rahasia', { concurrency: 1 }, () => {
  test('repo tidak memuat URL lama, query kunci Gemini, atau nama variabel bundle', () => {
    const skip = new Set(['node_modules', 'dist', '.git']);
    const files = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir)) {
        if (skip.has(entry)) continue;
        const full = path.join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) walk(full);
        else if (stat.isFile() && stat.size < 2_000_000) files.push(full);
      }
    };
    walk(root);

    const hits = [];
    for (const file of files) {
      let text;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      for (const needle of forbidden) {
        if (text.includes(needle)) hits.push(`${path.relative(root, file)} :: ${needle}`);
      }
    }
    assert.deepEqual(hits, []);
  });

  test('.env diabaikan git, .env.example tetap ikut', () => {
    const ignored = execFileSync('git', ['check-ignore', '.env', '.env.local', '.env.production'], {
      cwd: root,
      encoding: 'utf8',
    }).trim().split('\n');
    assert.deepEqual(ignored, ['.env', '.env.local', '.env.production']);

    let exampleIgnored = true;
    try {
      execFileSync('git', ['check-ignore', '.env.example'], { cwd: root, stdio: 'pipe' });
    } catch (err) {
      exampleIgnored = err.status === 0;
    }
    assert.equal(exampleIgnored, false);
  });

  test('GET data dan run_update hanya meneruskan aksi yang diizinkan beserta token', async () => {
    const upstream = await startUpstream((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'success', data: [{ Link_Postingan: 'ok' }] }));
    });
    const token = 'token/dengan+spasi=';
    const env = envOf(upstream, token);

    try {
      const dataResponse = await handleAppsScriptRequest(
        new Request('http://dashboard.local/api/apps-script?drop=1'),
        { env },
      );
      assert.equal(dataResponse.status, 200);
      const dataBody = await dataResponse.json();
      assert.equal(dataBody.status, 'success');
      assert.equal(upstream.requests[0].method, 'GET');
      assert.equal(upstream.requests[0].pathname, '/exec');
      assert.equal(upstream.requests[0].token, token);
      assert.equal(upstream.requests[0].action, null);
      assert.equal(upstream.requests[0].params.drop, undefined);

      const updateResponse = await handleAppsScriptRequest(
        new Request('http://dashboard.local/api/apps-script?action=run_update&drop=1'),
        { env },
      );
      assert.equal(updateResponse.status, 200);
      assert.equal(upstream.requests[1].action, 'run_update');
      assert.equal(upstream.requests[1].token, token);
      assert.equal(upstream.requests[1].params.drop, undefined);
      assert.deepEqual([...GET_ACTIONS], ['run_update']);

      const rejected = await handleAppsScriptRequest(
        new Request('http://dashboard.local/api/apps-script?action=hapus_semua'),
        { env },
      );
      assert.equal(rejected.status, 400);
      const rejectedBody = await rejected.json();
      assert.equal(rejectedBody.status, 'error');
      assert.equal(upstream.requests.length, 2);
      assert.equal(JSON.stringify(rejectedBody).includes(token), false);
    } finally {
      await upstream.close();
    }
  });

  test('POST meneruskan whitelist, menimpa token klien, dan mengikuti 302 tanpa mengubah POST menjadi GET', async () => {
    const token = 'token-server';
    const upstream = await startUpstream((_req, res, recorded) => {
      if (recorded.pathname === '/exec') {
        res.statusCode = 302;
        res.setHeader('Location', '/exec-final');
        res.end();
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        status: 'success',
        token,
        echo: recorded.body,
      }));
    });

    try {
      for (const action of POST_ACTIONS) {
        const response = await handleAppsScriptRequest(new Request('http://dashboard.local/api/apps-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            token: 'token-palsu',
            extra: 'jangan-terusan',
            data: { id: action, catatan: 'aman' },
          }),
        }), { env: envOf(upstream, token) });

        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.status, 'success');
        assert.equal(JSON.stringify(body).includes(token), false);
        assert.equal(body.token, '[redacted]');
      }

      const posts = upstream.requests.filter((item) => item.pathname === '/exec-final');
      assert.equal(posts.length, POST_ACTIONS.size);
      for (const posted of posts) {
        assert.equal(posted.method, 'POST');
        assert.equal(posted.token, token);
        assert.equal(posted.contentType, 'text/plain;charset=utf-8');
        const parsed = JSON.parse(posted.body);
        assert.equal(parsed.token, token);
        assert.equal(parsed.extra, undefined);
        assert.equal(POST_ACTIONS.has(parsed.action), true);
        assert.deepEqual(parsed.data, { id: parsed.action, catatan: 'aman' });
      }

      const blocked = await handleAppsScriptRequest(new Request('http://dashboard.local/api/apps-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'drop_table', data: { id: 1 } }),
      }), { env: envOf(upstream, token) });
      assert.equal(blocked.status, 400);
      assert.equal(upstream.requests.filter((item) => item.pathname === '/exec-final').length, POST_ACTIONS.size);

      const invalid = await handleAppsScriptRequest(new Request('http://dashboard.local/api/apps-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      }), { env: envOf(upstream, token) });
      assert.equal(invalid.status, 400);

      const wrongMethod = await handleAppsScriptRequest(new Request('http://dashboard.local/api/apps-script', {
        method: 'DELETE',
      }), { env: envOf(upstream, token) });
      assert.equal(wrongMethod.status, 405);
    } finally {
      await upstream.close();
    }
  });

  test('kesalahan upstream tidak membocorkan token atau URL', async () => {
    const token = 'token-rahasia-sekali';
    const env = {
      APPS_SCRIPT_URL: 'http://127.0.0.1:9/exec',
      APPS_SCRIPT_TOKEN: token,
    };
    const response = await handleAppsScriptRequest(new Request('http://dashboard.local/api/apps-script'), {
      env,
      requestImpl: async () => {
        throw new Error(`connect ${token} http://127.0.0.1:9/exec`);
      },
    });
    assert.equal(response.status, 502);
    const body = await response.json();
    const raw = JSON.stringify(body);
    assert.equal(raw.includes(token), false);
    assert.equal(raw.includes('127.0.0.1'), false);

    const missing = await handleAppsScriptRequest(new Request('http://dashboard.local/api/apps-script'), {
      env: {},
      requestImpl: async () => {
        throw new Error('seharusnya tidak terpanggil');
      },
    });
    assert.equal(missing.status, 500);
    assert.equal((await missing.json()).message, 'Konfigurasi server Apps Script belum lengkap.');
  });

  test('Gemini memakai kunci dari server, model yang sama, dan tidak menaruh kunci di URL', async () => {
    const apiKey = 'kunci-gemini-uji';
    let calls = 0;
    const response = await handleGeminiRequest(new Request('http://dashboard.local/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Analisa video ini',
        temperature: 0.7,
        maxOutputTokens: 600,
        contents: [{ parts: [{ text: 'jangan dipakai' }] }],
      }),
    }), {
      env: { GEMINI_API_KEY: apiKey, GEMINI_MODEL: '' },
      fetchImpl: async (url, options) => {
        calls += 1;
        const target = new URL(url);
        assert.equal(target.href, GEMINI_ENDPOINT);
        assert.equal(target.search, '');
        assert.equal(target.searchParams.has('key'), false);
        assert.equal(options.headers['x-goog-api-key'], apiKey);
        const sent = JSON.parse(options.body);
        assert.deepEqual(sent, {
          contents: [{ parts: [{ text: 'Analisa video ini' }] }],
          generationConfig: {
            maxOutputTokens: 600,
            thinkingConfig: { thinkingLevel: 'MINIMAL' },
          },
        });
        return jsonResponse({
          candidates: [{ content: { parts: [{ text: `hasil ${apiKey}` }] } }],
        });
      },
    });

    assert.equal(calls, 1);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.text, 'hasil [redacted]');
    assert.equal(JSON.stringify(body).includes(apiKey), false);
    assert.equal(DEFAULT_GEMINI_MODEL, 'gemini-3.5-flash-lite');
    assert.equal(GEMINI_ENDPOINT, buildGeminiEndpoint(DEFAULT_GEMINI_MODEL));
    assert.equal(GEMINI_ENDPOINT.endsWith('models/gemini-3.5-flash-lite:generateContent'), true);
    assert.equal(new URL(GEMINI_ENDPOINT).search, '');
  });

  test('Gemini menolak metode lain, prompt kosong, dan kunci yang belum diisi tanpa memanggil upstream', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return jsonResponse({ candidates: [] });
    };
    const env = { GEMINI_API_KEY: 'kunci' };

    const missing = await handleGeminiRequest(new Request('http://dashboard.local/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'halo' }),
    }), { env: {}, fetchImpl });
    assert.equal(missing.status, 503);
    assert.equal((await missing.json()).error, 'missing_api_key');

    const wrongMethod = await handleGeminiRequest(new Request('http://dashboard.local/api/gemini'), {
      env,
      fetchImpl,
    });
    assert.equal(wrongMethod.status, 405);

    const empty = await handleGeminiRequest(new Request('http://dashboard.local/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '   ' }),
    }), { env, fetchImpl });
    assert.equal(empty.status, 400);

    const upstreamError = await handleGeminiRequest(new Request('http://dashboard.local/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'halo', maxOutputTokens: 99999, temperature: 9 }),
    }), {
      env,
      fetchImpl: async (_url, options) => {
        calls += 1;
        const sent = JSON.parse(options.body);
        assert.equal(sent.generationConfig.maxOutputTokens, 2048);
        assert.equal(sent.generationConfig.temperature, undefined);
        assert.equal(sent.generationConfig.thinkingConfig.thinkingLevel, 'MINIMAL');
        return jsonResponse({
          error: {
            status: 'PERMISSION_DENIED',
            message: `gagal ${env.GEMINI_API_KEY} dan ${encodeURIComponent(env.GEMINI_API_KEY)}`,
          },
        }, 403);
      },
    });
    assert.equal(upstreamError.status, 502);
    const errorBody = await upstreamError.json();
    assert.equal(errorBody.error, 'gemini_error');
    assert.equal(errorBody.message, 'Gemini menolak permintaan.');
    assert.equal(errorBody.detail, 'HTTP 403 PERMISSION_DENIED: gagal [redacted] dan [redacted]');
    assert.equal(JSON.stringify(errorBody).includes(env.GEMINI_API_KEY), false);
    assert.equal(JSON.stringify(errorBody).includes(encodeURIComponent(env.GEMINI_API_KEY)), false);
    assert.equal(calls, 1);
  });

  test('GEMINI_MODEL membangun endpoint dan mematikan thinking pada gemini-2.5-flash', async () => {
    const apiKey = 'kunci-model-uji';
    let seenUrl = '';
    const response = await handleGeminiRequest(new Request('http://dashboard.local/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'ringkas', temperature: -1, maxOutputTokens: 100 }),
    }), {
      env: { GEMINI_API_KEY: apiKey, GEMINI_MODEL: '  gemini-2.5-flash  ' },
      fetchImpl: async (url, options) => {
        seenUrl = String(url);
        const target = new URL(url);
        assert.equal(target.search, '');
        assert.equal(options.headers['x-goog-api-key'], apiKey);
        const sent = JSON.parse(options.body);
        assert.equal(sent.generationConfig.temperature, 0);
        assert.equal(sent.generationConfig.maxOutputTokens, 100);
        assert.deepEqual(sent.generationConfig.thinkingConfig, { thinkingBudget: 0 });
        return jsonResponse({
          candidates: [{
            finishReason: 'STOP',
            content: {
              parts: [
                { text: `pikir ${apiKey}`, thought: true },
                { text: 'jawaban siap' },
              ],
            },
          }],
        });
      },
    });

    assert.equal(seenUrl, buildGeminiEndpoint('gemini-2.5-flash'));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.text, 'jawaban siap');
    assert.equal(JSON.stringify(body).includes(apiKey), false);
    assert.equal(JSON.stringify(body).includes('pikir'), false);
  });

  test('nama GEMINI_MODEL yang tidak aman ditolak tanpa memanggil Google', async () => {
    let calls = 0;
    const apiKey = 'kunci-rahasia-model';
    const invalid = `../${apiKey}?x=1`;
    const response = await handleGeminiRequest(new Request('http://dashboard.local/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'halo' }),
    }), {
      env: { GEMINI_API_KEY: apiKey, GEMINI_MODEL: invalid },
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({});
      },
    });

    assert.equal(calls, 0);
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.error, 'invalid_model');
    const raw = JSON.stringify(body);
    assert.equal(raw.includes(apiKey), false);
    assert.equal(raw.includes(invalid), false);
    assert.equal(raw.includes('..'), false);
  });

  test('respons tanpa teks menjelaskan MAX_TOKENS dan SAFETY', async () => {
    const env = { GEMINI_API_KEY: 'kunci' };
    const prompt = () => new Request('http://dashboard.local/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'analisa' }),
    });

    const truncated = await handleGeminiRequest(prompt(), {
      env,
      fetchImpl: async () => jsonResponse({
        candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '   ' }] } }],
      }),
    });
    assert.equal(truncated.status, 502);
    const truncatedBody = await truncated.json();
    assert.equal(truncatedBody.message, 'Jawaban Gemini kosong karena batas token keluaran habis.');
    assert.equal(truncatedBody.detail, 'finishReason MAX_TOKENS');

    const blocked = await handleGeminiRequest(prompt(), {
      env,
      fetchImpl: async () => jsonResponse({
        promptFeedback: { blockReason: 'SAFETY' },
        candidates: [],
      }),
    });
    assert.equal(blocked.status, 502);
    const blockedBody = await blocked.json();
    assert.equal(blockedBody.message, 'Gemini menolak jawaban karena kebijakan keamanan.');
    assert.equal(blockedBody.detail, 'blockReason SAFETY');

    const safety = await handleGeminiRequest(prompt(), {
      env,
      fetchImpl: async () => jsonResponse({
        candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: 'disembunyikan', thought: true }] } }],
      }),
    });
    const safetyBody = await safety.json();
    assert.equal(safety.status, 502);
    assert.equal(safetyBody.message, 'Gemini menolak jawaban karena kebijakan keamanan.');
    assert.equal(safetyBody.detail, 'finishReason SAFETY');
    assert.equal(JSON.stringify(safetyBody).includes('disembunyikan'), false);
  });

  test('middleware Node melayani /api dan membiarkan jalur lain lewat', async () => {
    const token = 'token-middleware';
    const upstream = await startUpstream((_req, res, recorded) => {
      if (recorded.pathname === '/exec') {
        res.statusCode = 302;
        res.setHeader('Location', '/done');
        res.end();
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'success', report: { updated: 3 }, token }));
    });

    const previous = {
      APPS_SCRIPT_URL: process.env.APPS_SCRIPT_URL,
      APPS_SCRIPT_TOKEN: process.env.APPS_SCRIPT_TOKEN,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    };
    process.env.APPS_SCRIPT_URL = `${upstream.origin}/exec`;
    process.env.APPS_SCRIPT_TOKEN = token;
    delete process.env.GEMINI_API_KEY;

    const middleware = createApiMiddleware();
    const server = http.createServer((req, res) => {
      Promise.resolve(middleware(req, res, () => {
        res.statusCode = 404;
        res.end('bukan-api');
      })).catch(() => {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end();
        }
      });
    });

    try {
      const port = await listen(server);
      const base = `http://127.0.0.1:${port}`;

      const data = await fetch(`${base}/api/apps-script`);
      assert.equal(data.status, 200);
      const dataBody = await data.json();
      assert.equal(dataBody.status, 'success');
      assert.equal(dataBody.report.updated, 3);
      assert.equal(JSON.stringify(dataBody).includes(token), false);

      const saved = await fetch(`${base}/api/apps-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_violation', data: { id: 7, status: 'Banding' } }),
      });
      assert.equal(saved.status, 200);
      const finalPosts = upstream.requests.filter((item) => item.pathname === '/done' && item.method === 'POST');
      assert.equal(finalPosts.length, 1);
      assert.equal(JSON.parse(finalPosts[0].body).action, 'update_violation');

      const ai = await fetch(`${base}/api/gemini`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'ringkas' }),
      });
      assert.equal(ai.status, 503);

      const other = await fetch(`${base}/index.html`);
      assert.equal(other.status, 404);
      assert.equal(await other.text(), 'bukan-api');
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await closeServer(server);
      await upstream.close();
    }
  });

  test('entrypoint Vercel menolak saat env kosong dan Gemini menolak GET', async () => {
    const previous = {
      APPS_SCRIPT_URL: process.env.APPS_SCRIPT_URL,
      APPS_SCRIPT_TOKEN: process.env.APPS_SCRIPT_TOKEN,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    };
    delete process.env.APPS_SCRIPT_URL;
    delete process.env.APPS_SCRIPT_TOKEN;
    delete process.env.GEMINI_API_KEY;
    try {
      assert.equal(typeof appsScriptHandler.fetch, 'function');
      assert.equal(typeof geminiHandler.fetch, 'function');
      const sheet = await appsScriptHandler.fetch(new Request('http://dashboard.local/api/apps-script'));
      assert.equal(sheet.status, 500);
      const ai = await geminiHandler.fetch(new Request('http://dashboard.local/api/gemini'));
      assert.equal(ai.status, 405);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test('Vite dev melayani /api dengan env server', { timeout: 60_000 }, async () => {
    const token = 'token-vite';
    let origin = '';
    const upstream = await startUpstream((_req, res, recorded) => {
      if (recorded.pathname === '/exec') {
        res.statusCode = 302;
        res.setHeader('Location', `${origin}/done`);
        res.end();
        return;
      }
      const parsed = recorded.body ? JSON.parse(recorded.body) : null;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        status: 'success',
        data: [{ ok: true }],
        report: parsed ? { action: parsed.action } : { ran: true },
      }));
    });

    origin = upstream.origin;

    const port = await new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.listen(0, '127.0.0.1', () => {
        const value = probe.address().port;
        probe.close(() => resolve(value));
      });
      probe.on('error', reject);
    });

    const childEnv = { ...process.env, APPS_SCRIPT_URL: `${upstream.origin}/exec`, APPS_SCRIPT_TOKEN: token };
    delete childEnv.GEMINI_API_KEY;
    const child = spawn(process.execPath, [
      path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
      '--port', String(port),
      '--host', '127.0.0.1',
      '--strictPort',
    ], {
      cwd: root,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });

    const stop = () => new Promise((resolve) => {
      if (child.exitCode != null || child.signalCode) {
        resolve();
        return;
      }
      const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill('SIGTERM');
    });

    try {
      const ready = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Vite tidak siap.\n${output}`)), 40_000);
        const check = () => {
          if (output.includes(`127.0.0.1:${port}`) || output.includes(`localhost:${port}`)) {
            clearTimeout(timer);
            resolve();
          }
        };
        child.stdout.on('data', check);
        child.stderr.on('data', check);
        check();
      });
      assert.equal(ready, undefined);

      const base = `http://127.0.0.1:${port}`;
      const data = await fetch(`${base}/api/apps-script`);
      assert.equal(data.status, 200);
      assert.equal((await data.json()).status, 'success');
      assert.equal(upstream.requests.some((item) => item.pathname === '/done' && item.method === 'GET' && item.token === token), true);

      const update = await fetch(`${base}/api/apps-script?action=run_update`);
      assert.equal(update.status, 200);
      assert.equal((await update.json()).report.ran, true);

      const save = await fetch(`${base}/api/apps-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_winning_web', data: { produk: 'Kawat', isWinning: true } }),
      });
      assert.equal(save.status, 200);
      assert.equal((await save.json()).report.action, 'save_winning_web');

      const blocked = await fetch(`${base}/api/apps-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_secret', data: {} }),
      });
      assert.equal(blocked.status, 400);

      const ai = await fetch(`${base}/api/gemini`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'buat ringkasan' }),
      });
      assert.equal(ai.status, 503);
      assert.equal((await ai.json()).error, 'missing_api_key');

      const directVideo = 'https://www.tiktok.com/@/video/7106667752018955566';
      const resolved = await fetch(`${base}/api/tiktok-resolve?url=${encodeURIComponent(directVideo)}`);
      assert.equal(resolved.status, 200);
      assert.equal((await resolved.json()).videoId, '7106667752018955566');

      const blockedLink = await fetch(`${base}/api/tiktok-resolve?url=${encodeURIComponent('http://127.0.0.1/secret')}`);
      assert.equal(blockedLink.status, 400);
    } finally {
      await stop();
      await upstream.close();
    }
  });
});
