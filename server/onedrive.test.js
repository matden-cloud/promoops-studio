import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { POST_ACTIONS, handleAppsScriptRequest } from './apps-script.js';
import { handleOneDriveLoginRequest, handleOneDriveSyncRequest } from './onedrive.js';
import {
  FILE_ASSET_COLUMNS,
  ONEDRIVE_AUTHORITY,
  ONEDRIVE_SCOPE,
  ONEDRIVE_TARGETS,
  classifyFile,
  isAllowedChildrenUrl,
  isAllowedGraphRead,
  oneDrivePathFolder,
  planDriveItem,
  rootGraphUrl,
  safeVerificationUri,
} from './onedrive-plan.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_ID = '11111111-1111-1111-1111-111111111111';
const APPS_TOKEN = 'token-apps-script-rahasia';
const REFRESH_LAMA = 'refresh-lama-yang-disimpan-di-sheet';
const REFRESH_BARU = 'refresh-rotasi-yang-baru-dari-microsoft';
const DEVICE_CODE = 'device-code-rahasia-tidak-boleh-bocor';
const ACCESS = 'access-token-graph-yang-baru';
const FINAL = ONEDRIVE_TARGETS.final.path;
const MENTAHAN = ONEDRIVE_TARGETS.mentahan.path;

function respond(parsed, status = 200) {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(parsed),
  };
}

function driveItem(partial) {
  const item = {
    size: 2621440,
    webUrl: `https://onedrive.live.com/item/${partial.id}`,
    parentReference: { path: `/drive/root:/${FINAL}` },
    lastModifiedDateTime: '2024-05-01T08:30:00Z',
    ...partial,
  };
  if (!partial.folder) item.file = partial.file || {};
  return item;
}

function makeWorld(config = {}) {
  const world = {
    calls: 0,
    urls: [],
    auths: [],
    saves: [],
    upserts: [],
    creates: [],
    seenPaths: [],
    unhandled: [],
    polls: 0,
    rows: config.rows ? config.rows.map((row) => ({ ...row })) : [],
    keys: {
      refresh_token: config.refreshToken === undefined ? REFRESH_LAMA : config.refreshToken,
    },
    failLinks: config.failLinks || new Set(),
    loginMode: config.loginMode || 'ok',
  };

  const folders = config.folders || new Map([
    ['ROOT!final', {
      id: 'ROOT!final',
      webUrl: 'https://onedrive.live.com/folder/final',
      pages: [config.files || []],
    }],
  ]);
  const roots = config.roots || new Map([
    [FINAL, 'ROOT!final'],
    [MENTAHAN, 'ROOT!mentahan'],
  ]);
  if (!folders.has('ROOT!mentahan')) {
    folders.set('ROOT!mentahan', {
      id: 'ROOT!mentahan',
      webUrl: 'https://onedrive.live.com/folder/mentahan',
      pages: [[]],
    });
  }

  async function requestImpl(url, options = {}) {
    world.calls += 1;
    if (world.calls > 80) return respond({ error: 'loop' }, 500);
    const target = new URL(url);
    const bodyText = typeof options.body === 'string' ? options.body : '';
    world.urls.push(`${options.method || 'GET'} ${url}`);
    if (options.headers?.Authorization) world.auths.push(options.headers.Authorization);

    if (target.hostname === 'login.microsoftonline.com') {
      assert.equal(target.pathname.startsWith('/common/'), true);
      const params = new URLSearchParams(bodyText);
      assert.equal(params.get('client_secret'), null);
      assert.equal(params.get('client_id'), CLIENT_ID);
      if (target.pathname.endsWith('/devicecode')) {
        assert.equal(params.get('scope'), ONEDRIVE_SCOPE);
        if (world.loginMode === 'invalid_client') {
          return respond({ error: 'invalid_client', error_description: 'AADSTS7000218 client_secret' }, 401);
        }
        return respond({
          user_code: 'ABCD-EFGH',
          device_code: DEVICE_CODE,
          verification_uri: 'https://microsoft.com/devicelogin',
          expires_in: 900,
          interval: 5,
        });
      }
      if (params.get('grant_type') === 'refresh_token') {
        assert.equal(params.get('scope'), ONEDRIVE_SCOPE);
        assert.equal(params.get('refresh_token'), world.keys.refresh_token);
        return respond({
          access_token: ACCESS,
          refresh_token: REFRESH_BARU,
          expires_in: 3600,
        });
      }
      world.polls += 1;
      assert.equal(params.get('device_code'), DEVICE_CODE);
      if (world.loginMode === 'pending' && world.polls === 1) {
        return respond({ error: 'authorization_pending' }, 400);
      }
      return respond({
        access_token: 'access-dari-login-perangkat',
        refresh_token: 'refresh-dari-login-perangkat-panjang',
        expires_in: 3600,
      });
    }

    if (target.pathname === '/exec') {
      const payload = JSON.parse(bodyText);
      assert.equal(payload.token, APPS_TOKEN);
      return respond(handleScript(world, payload));
    }

    if (target.hostname !== 'graph.microsoft.com') {
      world.unhandled.push(url);
      return respond({ error: 'blocked' }, 500);
    }

    if (target.pathname.startsWith('/v1.0/me/drive/root:/') && !target.pathname.includes('/children')) {
      const folderPath = decodeURIComponent(target.pathname.slice('/v1.0/me/drive/root:/'.length));
      world.seenPaths.push(folderPath);
      const id = roots.get(folderPath);
      const folder = id && folders.get(id);
      if (!folder) return respond({ error: { code: 'itemNotFound' } }, 404);
      return respond({ id, webUrl: folder.webUrl, folder: {} });
    }

    const parts = target.pathname.split('/');
    if (parts[6] === 'children') {
      const folder = folders.get(parts[5]);
      if (!folder) return respond({ error: { code: 'itemNotFound' } }, 404);
      const index = Number(target.searchParams.get('$skiptoken') || 0);
      const page = folder.pages[index] || [];
      const parsed = { value: page };
      if (folder.pages[index + 1]) {
        parsed['@odata.nextLink'] = `https://graph.microsoft.com/v1.0/me/drive/items/${parts[5]}/children?$skiptoken=${index + 1}`;
      }
      return respond(parsed);
    }

    if (parts[6] === 'createLink') {
      world.creates.push({ id: parts[5], body: bodyText });
      if (world.failLinks.has(parts[5])) return respond({ error: { code: 'fail' } }, 500);
      return respond({ link: { webUrl: `https://1drv.ms/v/s!${parts[5]}` } });
    }

    world.unhandled.push(url);
    return respond({ error: 'unhandled' }, 500);
  }

  return { world, requestImpl };
}

function handleScript(world, payload) {
  const { action, data } = payload;
  if (action === 'get_onedrive_token') {
    return {
      status: 'success',
      refreshToken: world.keys.refresh_token || '',
      deviceCode: world.keys.device_code || '',
      deviceExpires: world.keys.device_expires || '',
      pollInterval: world.keys.poll_interval || '',
    };
  }
  if (action === 'save_onedrive_token') {
    world.saves.push({ ...data });
    if (data.refreshToken != null) world.keys.refresh_token = String(data.refreshToken);
    if (data.deviceCode != null) world.keys.device_code = String(data.deviceCode);
    if (data.deviceExpires != null) world.keys.device_expires = String(data.deviceExpires);
    if (data.pollInterval != null) world.keys.poll_interval = String(data.pollInterval);
    return { status: 'success' };
  }
  if (action === 'get_file_assets') {
    return {
      status: 'success',
      rows: world.rows.map((row) => ({
        idFile: row.Id_File,
        namaFile: row.Nama_File,
        pathFolder: row.Path_Folder,
      })),
    };
  }
  if (action === 'upsert_file_assets') {
    world.upserts.push(data);
    for (const update of data.updates || []) {
      for (const row of world.rows) {
        if (row.Id_File !== update.idFile) continue;
        row.Nama_File = update.namaFile;
        row.Path_Folder = update.pathFolder;
        row.Link_Folder = update.linkFolder;
      }
    }
    for (const insert of data.inserts || []) {
      if (world.rows.some((row) => row.Id_File === insert.Id_File)) continue;
      world.rows.push({ ...insert });
    }
    return { status: 'success', updated: (data.updates || []).length, inserted: (data.inserts || []).length };
  }
  return { status: 'error', message: `aksi asing ${action}` };
}

function env(extra = {}) {
  return {
    APPS_SCRIPT_URL: 'http://127.0.0.1/exec',
    APPS_SCRIPT_TOKEN: APPS_TOKEN,
    ONEDRIVE_CLIENT_ID: CLIENT_ID,
    ...extra,
  };
}

function syncRequest(target, extra = {}) {
  return new Request('http://dashboard.local/api/onedrive-sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, ...extra }),
  });
}

function assertNoSecrets(text) {
  for (const secret of [APPS_TOKEN, REFRESH_LAMA, REFRESH_BARU, DEVICE_CODE, ACCESS, 'access-dari-login-perangkat', 'refresh-dari-login-perangkat-panjang', CLIENT_ID]) {
    assert.equal(text.includes(secret), false, secret);
  }
}

describe('rencana file OneDrive', () => {
  test('authority common, scope tulis, dan jalur folder sesuai script', () => {
    assert.equal(ONEDRIVE_AUTHORITY, 'https://login.microsoftonline.com/common');
    assert.equal(ONEDRIVE_AUTHORITY.includes('consumers'), false);
    assert.equal(ONEDRIVE_SCOPE.includes('Files.ReadWrite.All'), true);
    assert.equal(ONEDRIVE_SCOPE.includes('offline_access'), true);
    assert.equal(rootGraphUrl(FINAL), `https://graph.microsoft.com/v1.0/me/drive/root:/${FINAL.replaceAll(' ', '%20')}`);
    assert.equal(ONEDRIVE_TARGETS.mentahan.path, MENTAHAN);
    assert.equal(FILE_ASSET_COLUMNS.length, 17);
  });

  test('jenis file mengikuti ekstensi script', () => {
    assert.equal(classifyFile('iklan.final.MP4').jenis, 'Video');
    assert.equal(classifyFile('a.mov').jenis, 'Video');
    assert.equal(classifyFile('a.avi').jenis, 'Video');
    assert.equal(classifyFile('a.mkv').jenis, 'Video');
    assert.equal(classifyFile('lagu.mp3').jenis, 'Audio');
    assert.equal(classifyFile('lagu.wav').jenis, 'Audio');
    assert.equal(classifyFile('foto.jpg').jenis, 'Gambar');
    assert.equal(classifyFile('foto.jpeg').jenis, 'Gambar');
    assert.equal(classifyFile('foto.png').jenis, 'Gambar');
    assert.equal(classifyFile('catatan.pdf').jenis, 'Dokumen');
    assert.equal(classifyFile('catatan.webp').jenis, 'Dokumen');
    assert.equal(classifyFile('tanpa-ekstensi').format, '');
  });

  test('path folder dan link verifikasi', () => {
    assert.equal(
      oneDrivePathFolder(`/drive/root:/${FINAL.replaceAll(' ', '%20')}`),
      `OneDrive/${FINAL}`,
    );
    assert.equal(safeVerificationUri('https://evil.example/devicelogin'), 'https://microsoft.com/devicelogin');
    assert.equal(safeVerificationUri('https://login.microsoft.com/device'), 'https://login.microsoft.com/device');
    assert.equal(isAllowedGraphRead('https://evil.example/v1.0/me/drive/items/A/children'), false);
    assert.equal(isAllowedGraphRead('https://graph.microsoft.com/v1.0/me/drive/items/A/content'), false);
    assert.equal(isAllowedChildrenUrl('http://127.0.0.1/v1.0/me/drive/items/A/children'), false);
    assert.equal(isAllowedChildrenUrl('https://graph.microsoft.com/v1.0/me/drive/items/ABC!1/children?$skiptoken=2'), true);
  });

  test('file lama hanya menghasilkan tiga kolom, file baru tujuh belas', () => {
    const byId = new Map([['ABC!1', { namaFile: 'lama.mp4', pathFolder: 'OneDrive/lama' }]]);
    const update = planDriveItem(driveItem({ id: 'ABC!1', name: 'baru.mp4' }), 'https://onedrive.live.com/folder/final', byId);
    assert.equal(update.action, 'update');
    assert.deepEqual(Object.keys(update.update).sort(), ['idFile', 'linkFolder', 'namaFile', 'pathFolder']);
    assert.equal(Object.hasOwn(update.update, 'Status_File'), false);

    const same = planDriveItem(
      driveItem({ id: 'ABC!1', name: 'lama.mp4', parentReference: { path: '/drive/root:/lama' } }),
      'https://onedrive.live.com/folder/final',
      byId,
    );
    assert.equal(same.action, 'skip');

    const insert = planDriveItem(driveItem({ id: 'ABC!2', name: 'baru.mp4' }), 'https://onedrive.live.com/folder/final', new Map());
    assert.equal(insert.action, 'insert');
    assert.deepEqual(Object.keys(insert.row), FILE_ASSET_COLUMNS);
    assert.equal(insert.row.Storage, 'OneDrive');
    assert.equal(insert.row.Status_File, '');
    assert.equal(insert.row.File_Utama, '');
    assert.equal(insert.row.Catatan, '');
    assert.equal(insert.row.Ukuran_MB, 2.5);
    assert.equal(insert.row.Tanggal_File, '2024-05-01');
    assert.equal(insert.share, true);
  });
});

describe('sinkron OneDrive', () => {
  test('file baru, createLink, dan file lama yang berganti nama', async () => {
    const { world, requestImpl } = makeWorld({
      rows: [{
        Id_File: 'FILE!lama',
        Nama_File: 'lama.mp4',
        Path_Folder: `OneDrive/${FINAL}`,
        Link_Folder: 'https://onedrive.live.com/folder/lama',
        Link_File: 'https://onedrive.live.com/item/FILE!lama',
        Status_File: 'Sudah Dipakai',
        File_Utama: 'Ya',
        Catatan: 'jangan dihapus',
      }],
      files: [
        driveItem({ id: 'FILE!lama', name: 'nama-baru.mp4' }),
        driveItem({ id: 'FILE!baru', name: 'iklan.mp4' }),
        driveItem({ id: 'FILE!pdf', name: 'catatan.pdf' }),
        driveItem({ id: 'FILE!sama', name: 'Iklan.mp4' }),
      ],
    });

    const response = await handleOneDriveSyncRequest(syncRequest('final'), { env: env(), requestImpl });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.status, 'success');
    assert.equal(body.done, true);
    assert.equal(body.stats.baru, 3);
    assert.equal(body.stats.diperbarui, 1);
    assert.equal(body.stats.dilewati, 0);
    assert.deepEqual(body.stats.kembar, ['Iklan.mp4']);
    assert.equal(world.rows.length, 4);
    assert.equal(world.rows[0].Nama_File, 'nama-baru.mp4');
    assert.equal(world.rows[0].Status_File, 'Sudah Dipakai');
    assert.equal(world.rows[0].File_Utama, 'Ya');
    assert.equal(world.rows[0].Catatan, 'jangan dihapus');
    assert.equal(world.rows[0].Link_File, 'https://onedrive.live.com/item/FILE!lama');
    assert.equal(world.rows[0].Link_Folder, 'https://onedrive.live.com/folder/final');

    const inserted = world.rows.find((row) => row.Id_File === 'FILE!baru');
    assert.equal(inserted.Jenis_File, 'Video');
    assert.equal(inserted.Link_HP, 'https://1drv.ms/v/s!FILE!baru');
    assert.equal(inserted.Link_File, 'https://onedrive.live.com/item/FILE!baru');
    assert.equal(inserted.Path_Folder, `OneDrive/${FINAL}`);
    assert.equal(inserted.Id_Klip, 'FILE!baru');
    assert.equal(inserted.Cloud_File_ID, 'FILE!baru');
    assert.equal(world.rows.find((row) => row.Id_File === 'FILE!pdf').Jenis_File, 'Dokumen');
    assert.equal(world.rows.find((row) => row.Id_File === 'FILE!pdf').Link_HP, 'https://onedrive.live.com/item/FILE!pdf');
    assert.deepEqual(world.creates.map((item) => item.id).sort(), ['FILE!baru', 'FILE!sama']);
    assert.equal(world.creates.every((item) => item.body === '{"type":"view"}'), true);
    assert.equal(world.creates.some((item) => item.id === 'FILE!pdf'), false);
    assert.equal(world.keys.refresh_token, REFRESH_BARU);
    assert.equal(world.saves.some((item) => item.refreshToken === REFRESH_BARU && item.accessToken == null), true);
    assert.equal(world.auths.every((header) => header === `Bearer ${ACCESS}`), true);
    assert.equal(world.urls.some((url) => url.includes('/consumers')), false);
    assert.equal(world.urls.some((url) => url.includes('/common/oauth2/v2.0/token')), true);
    assert.equal(world.unhandled.length, 0);
    for (const update of world.upserts.flatMap((item) => item.updates)) {
      assert.deepEqual(Object.keys(update).sort(), ['idFile', 'linkFolder', 'namaFile', 'pathFolder']);
    }
    assertNoSecrets(JSON.stringify(body));
  });

  test('file tidak berubah dilewati dan baris tidak ditulis ulang', async () => {
    const { world, requestImpl } = makeWorld({
      rows: [{
        Id_File: 'FILE!tetap',
        Nama_File: 'tetap.mp4',
        Path_Folder: `OneDrive/${FINAL}`,
        Status_File: 'Sudah Dipakai',
        Catatan: 'tetap',
      }],
      files: [driveItem({ id: 'FILE!tetap', name: 'tetap.mp4' })],
    });
    const response = await handleOneDriveSyncRequest(syncRequest('final'), { env: env(), requestImpl });
    const body = await response.json();
    assert.equal(body.done, true);
    assert.equal(body.stats.dilewati, 1);
    assert.equal(body.stats.baru, 0);
    assert.equal(body.stats.diperbarui, 0);
    assert.equal(world.upserts.length, 0);
    assert.equal(world.creates.length, 0);
    assert.equal(world.rows[0].Status_File, 'Sudah Dipakai');
    assert.equal(world.rows[0].Catatan, 'tetap');
    assert.equal(world.rows.length, 1);
  });

  test('subfolder, halaman berikutnya, dan createLink yang gagal', async () => {
    const folders = new Map([
      ['ROOT!final', {
        id: 'ROOT!final',
        webUrl: 'https://onedrive.live.com/folder/final',
        pages: [
          [driveItem({ id: 'FILE!1', name: 'satu.mp4' })],
          [{
            id: 'FOLDER!sub',
            name: 'Sub',
            folder: {},
            webUrl: 'https://onedrive.live.com/folder/sub',
          }],
        ],
      }],
      ['FOLDER!sub', {
        id: 'FOLDER!sub',
        webUrl: 'https://onedrive.live.com/folder/sub',
        pages: [[driveItem({
          id: 'FILE!dalam',
          name: 'dalam.png',
          parentReference: { path: `/drive/root:/${FINAL}/Sub` },
          webUrl: 'https://onedrive.live.com/item/FILE!dalam',
        })]],
      }],
    ]);
    const { world, requestImpl } = makeWorld({
      folders,
      failLinks: new Set(['FILE!dalam']),
    });
    const response = await handleOneDriveSyncRequest(syncRequest('final'), { env: env(), requestImpl });
    const body = await response.json();
    assert.equal(body.done, true, JSON.stringify(body));
    assert.equal(body.stats.baru, 2);
    const dalam = world.rows.find((row) => row.Id_File === 'FILE!dalam');
    assert.equal(dalam.Link_Folder, 'https://onedrive.live.com/folder/sub');
    assert.equal(dalam.Path_Folder, `OneDrive/${FINAL}/Sub`);
    assert.equal(dalam.Jenis_File, 'Gambar');
    assert.equal(dalam.Link_HP, 'https://onedrive.live.com/item/FILE!dalam');
    assert.equal(world.unhandled.length, 0, world.unhandled.join(' | '));
  });

  test('batch kecil bisa dilanjutkan tanpa menulis file dua kali', async () => {
    const { world, requestImpl } = makeWorld({
      files: [
        driveItem({ id: 'FILE!1', name: 'satu.mp4' }),
        driveItem({ id: 'FILE!2', name: 'dua.mp3' }),
      ],
    });
    let cursor = null;
    let stats = null;
    let done = false;
    for (let guard = 0; guard < 8 && !done; guard += 1) {
      const response = await handleOneDriveSyncRequest(
        syncRequest('final', { cursor, stats }),
        { env: env(), requestImpl, maxItems: 1 },
      );
      const body = await response.json();
      assert.equal(body.status, 'success', JSON.stringify(body));
      done = body.done;
      cursor = body.cursor;
      stats = body.stats;
      assertNoSecrets(JSON.stringify(body));
    }
    assert.equal(done, true);
    assert.equal(stats.baru, 2);
    assert.equal(world.rows.length, 2);
    assert.equal(world.creates.length, 2);
    assert.equal(world.rows.find((row) => row.Id_File === 'FILE!2').Jenis_File, 'Audio');
  });

  test('folder yang menunjuk balik tidak berputar tanpa henti', async () => {
    const folders = new Map([
      ['ROOT!final', {
        id: 'ROOT!final',
        webUrl: 'https://onedrive.live.com/folder/final',
        pages: [[{ id: 'FOLDER!b', name: 'B', folder: {}, webUrl: 'https://onedrive.live.com/folder/b' }]],
      }],
      ['FOLDER!b', {
        id: 'FOLDER!b',
        webUrl: 'https://onedrive.live.com/folder/b',
        pages: [[{ id: 'ROOT!final', name: 'A', folder: {}, webUrl: 'https://onedrive.live.com/folder/final' }]],
      }],
    ]);
    const { world, requestImpl } = makeWorld({ folders });
    const response = await handleOneDriveSyncRequest(syncRequest('final'), { env: env(), requestImpl, maxItems: 10 });
    const body = await response.json();
    assert.equal(body.done, true, JSON.stringify(body));
    assert.equal(world.rows.length, 0);
    assert.ok(world.calls < 40);
  });

  test('mentahan memakai jalurnya sendiri dan kursor asing ditolak', async () => {
    const { world, requestImpl } = makeWorld();
    const response = await handleOneDriveSyncRequest(
      new Request('http://dashboard.local/api/onedrive-sync?target=mentahan'),
      { env: env(), requestImpl },
    );
    const body = await response.json();
    assert.equal(body.done, true, JSON.stringify(body));
    assert.deepEqual(world.seenPaths, [MENTAHAN]);

    const blocked = await handleOneDriveSyncRequest(syncRequest('final', {
      cursor: { pageUrl: 'https://evil.example/v1.0/me/drive/items/ABC/children' },
    }), { env: env(), requestImpl });
    assert.equal(blocked.status, 400);
    const blockedBody = await blocked.json();
    assert.match(blockedBody.message, /Kursor/);
    assert.equal(world.urls.filter((url) => url.includes('evil.example')).length, 0);
  });

  test('tanpa refresh token minta login, tanpa client id menolak konfigurasi', async () => {
    const missing = makeWorld({ refreshToken: '' });
    const response = await handleOneDriveSyncRequest(syncRequest('final'), { env: env(), requestImpl: missing.requestImpl });
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.needsLogin, true);
    assert.match(body.message, /belum terhubung/);
    assert.equal(missing.world.urls.some((url) => url.includes('graph.microsoft.com')), false);

    const configured = makeWorld();
    const denied = await handleOneDriveSyncRequest(syncRequest('final'), {
      env: env({ ONEDRIVE_CLIENT_ID: '' }),
      requestImpl: configured.requestImpl,
    });
    const deniedBody = await denied.json();
    assert.equal(denied.status, 500);
    assert.match(deniedBody.message, /ONEDRIVE_CLIENT_ID/);
    assert.equal(configured.world.urls.some((url) => url.includes('login.microsoftonline.com')), false);
  });
});

describe('masuk OneDrive', () => {
  test('kode perangkat tampil, token tidak', async () => {
    const { world, requestImpl } = makeWorld({ refreshToken: '', loginMode: 'pending' });
    const deps = { env: env(), requestImpl, now: () => 1_700_000_000_000 };
    const started = await handleOneDriveLoginRequest(new Request('http://dashboard.local/api/onedrive-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', deviceCode: 'palsu', refreshToken: 'palsu' }),
    }), deps);
    const startBody = await started.json();
    assert.equal(started.status, 200, JSON.stringify(startBody));
    assert.equal(startBody.userCode, 'ABCD-EFGH');
    assert.equal(startBody.verificationUri, 'https://microsoft.com/devicelogin');
    assert.equal(world.keys.device_code, DEVICE_CODE);
    assertNoSecrets(JSON.stringify(startBody));

    const pending = await handleOneDriveLoginRequest(new Request('http://dashboard.local/api/onedrive-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'poll', deviceCode: 'kode-palsu-dari-browser' }),
    }), deps);
    const pendingBody = await pending.json();
    assert.equal(pendingBody.status, 'pending');
    assert.equal(world.keys.device_code, DEVICE_CODE);
    assertNoSecrets(JSON.stringify(pendingBody));

    const connected = await handleOneDriveLoginRequest(new Request('http://dashboard.local/api/onedrive-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'poll' }),
    }), deps);
    const connectedBody = await connected.json();
    assert.equal(connectedBody.status, 'connected');
    assert.equal(world.keys.refresh_token, 'refresh-dari-login-perangkat-panjang');
    assert.equal(world.keys.device_code, '');
    assertNoSecrets(JSON.stringify(connectedBody));

    const status = await handleOneDriveLoginRequest(new Request('http://dashboard.local/api/onedrive-login'), deps);
    const statusBody = await status.json();
    assert.equal(statusBody.connected, true);
    assertNoSecrets(JSON.stringify(statusBody));
  });

  test('client publik yang ditolak Microsoft dijelaskan', async () => {
    const { requestImpl } = makeWorld({ loginMode: 'invalid_client' });
    const response = await handleOneDriveLoginRequest(new Request('http://dashboard.local/api/onedrive-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    }), { env: env(), requestImpl });
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.match(body.message, /Allow public client flows/);
    assert.match(body.message, /akun Microsoft pribadi/);
  });
});

describe('batas aman', () => {
  test('proxy publik menolak aksi token dan sheet', async () => {
    for (const action of ['get_onedrive_token', 'save_onedrive_token', 'get_file_assets', 'upsert_file_assets']) {
      assert.equal(POST_ACTIONS.has(action), false);
      const response = await handleAppsScriptRequest(new Request('http://dashboard.local/api/apps-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, data: { refreshToken: REFRESH_LAMA } }),
      }), {
        env: { APPS_SCRIPT_URL: 'http://127.0.0.1:9/exec', APPS_SCRIPT_TOKEN: APPS_TOKEN },
      });
      assert.equal(response.status, 400);
      assert.equal((await response.text()).includes(REFRESH_LAMA), false);
    }
  });

  test('snippet Apps Script tidak mengosongkan FILE_ASSET', () => {
    const source = readFileSync(path.join(root, 'apps-script/onedrive-sync.gs'), 'utf8');
    assert.equal(/\.clear\s*\(/.test(source), false);
    assert.equal(/\bclearContents\s*\(/.test(source), false);
    assert.equal(/\bdeleteRow\s*\(/.test(source), false);
    assert.equal(/\bdeleteRows\s*\(/.test(source), false);
    assert.equal(source.includes('upsert_file_assets'), true);
    assert.equal(source.includes('_Token_OneDrive'), true);
    assert.equal(source.includes('hideSheet'), true);
    assert.equal(source.includes('Nama_File'), true);
    assert.equal(source.includes('New version'), true);
    assert.equal(source.includes(CLIENT_ID), false);
    assert.equal(source.includes('client_secret'), false);
  });
});
