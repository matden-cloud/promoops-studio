import assert from 'node:assert/strict';
import dns from 'node:dns';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { Readable } from 'node:stream';
import { describe, mock, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { POST_ACTIONS, handleAppsScriptRequest } from './apps-script.js';
import { handleOneDriveLoginRequest, handleOneDriveStreamRequest, handleOneDriveSyncRequest, mintOneDriveDownloadUrl } from './onedrive.js';
import {
  FILE_ASSET_COLUMNS,
  ONEDRIVE_AUTHORITY,
  ONEDRIVE_SCOPE,
  ONEDRIVE_TARGETS,
  classifyFile,
  isAllowedChildrenUrl,
  isAllowedGraphRead,
  isAllowedPlaybackUrl,
  isMicrosoftApiHost,
  normalizeStats,
  oneDrivePathFolder,
  planDriveItem,
  pushSyncDetail,
  rootGraphUrl,
  safeVerificationUri,
  SYNC_DETAIL_LIMIT,
  itemMetaGraphUrl,
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
    assert.equal(isMicrosoftApiHost('login.microsoftonline.com'), true);
    assert.equal(isMicrosoftApiHost('graph.microsoft.com'), true);
    assert.equal(isMicrosoftApiHost('south.graph.microsoft.com'), true);
    assert.equal(isMicrosoftApiHost('login.microsoftonline.com.'), true);
    assert.equal(isMicrosoftApiHost('login.microsoftonline.com.evil.test'), false);
    assert.equal(isMicrosoftApiHost('notlogin.microsoftonline.com'), false);
    assert.equal(isMicrosoftApiHost('script.google.com'), false);
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

  test('daftar detail dibatasi dan tidak dibawa dari stats permintaan', () => {
    const list = [];
    for (let index = 0; index < SYNC_DETAIL_LIMIT + 5; index += 1) {
      pushSyncDetail(list, { nama: `file-${index}.mp4`, path: 'OneDrive/A' });
    }
    assert.equal(list.length, SYNC_DETAIL_LIMIT);
    assert.equal(list[0].nama, 'file-0.mp4');
    assert.equal(list[SYNC_DETAIL_LIMIT - 1].nama, `file-${SYNC_DETAIL_LIMIT - 1}.mp4`);

    const stats = normalizeStats({
      baru: 9,
      diperbarui: 4,
      dilewati: 1,
      kembar: ['sama.mp4'],
      daftarBaru: [{ nama: 'racun.mp4', path: 'OneDrive/racun' }],
      daftarDiubah: [{ namaLama: 'a', pathLama: 'b', namaBaru: 'c', pathBaru: 'd' }],
    });
    assert.equal(stats.baru, 9);
    assert.equal(stats.diperbarui, 4);
    assert.deepEqual(stats.daftarBaru, []);
    assert.deepEqual(stats.daftarDiubah, []);
    assert.deepEqual(stats.kembar, ['sama.mp4']);
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
    assert.deepEqual(body.stats.daftarBaru, [
      { nama: 'iklan.mp4', path: `OneDrive/${FINAL}` },
      { nama: 'catatan.pdf', path: `OneDrive/${FINAL}` },
      { nama: 'Iklan.mp4', path: `OneDrive/${FINAL}` },
    ]);
    assert.deepEqual(body.stats.daftarDiubah, [{
      namaLama: 'lama.mp4',
      pathLama: `OneDrive/${FINAL}`,
      namaBaru: 'nama-baru.mp4',
      pathBaru: `OneDrive/${FINAL}`,
    }]);
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
    assert.deepEqual(body.stats.daftarBaru, []);
    assert.deepEqual(body.stats.daftarDiubah, []);
    assert.equal(world.upserts.length, 0);
    assert.equal(world.creates.length, 0);
    assert.equal(world.rows[0].Status_File, 'Sudah Dipakai');
    assert.equal(world.rows[0].Catatan, 'tetap');
    assert.equal(world.rows.length, 1);
  });

  test('pindah folder memakai path lama dari byId dan tidak menambah kolom tulis', async () => {
    const { world, requestImpl } = makeWorld({
      rows: [{
        Id_File: 'FILE!pindah',
        Nama_File: 'sama.mp4',
        Path_Folder: 'OneDrive/lama',
        Status_File: 'Sudah Dipakai',
        Catatan: 'tetap',
      }],
      files: [driveItem({
        id: 'FILE!pindah',
        name: 'sama.mp4',
        parentReference: { path: `/drive/root:/${FINAL}/Sub` },
      })],
    });
    const response = await handleOneDriveSyncRequest(syncRequest('final'), { env: env(), requestImpl });
    const body = await response.json();
    assert.equal(body.stats.baru, 0);
    assert.equal(body.stats.diperbarui, 1);
    assert.deepEqual(body.stats.daftarBaru, []);
    assert.deepEqual(body.stats.daftarDiubah, [{
      namaLama: 'sama.mp4',
      pathLama: 'OneDrive/lama',
      namaBaru: 'sama.mp4',
      pathBaru: `OneDrive/${FINAL}/Sub`,
    }]);
    assert.equal(world.rows[0].Path_Folder, `OneDrive/${FINAL}/Sub`);
    assert.equal(world.rows[0].Status_File, 'Sudah Dipakai');
    assert.equal(world.rows[0].Catatan, 'tetap');
    assert.deepEqual(Object.keys(world.upserts[0].updates[0]).sort(), ['idFile', 'linkFolder', 'namaFile', 'pathFolder']);
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
    const namaBaru = [];
    for (let guard = 0; guard < 8 && !done; guard += 1) {
      const outgoing = stats
        ? {
          ...stats,
          daftarBaru: [{ nama: 'racun.mp4', path: 'OneDrive/racun' }],
          daftarDiubah: [{ namaLama: 'racun', pathLama: 'a', namaBaru: 'b', pathBaru: 'c' }],
        }
        : null;
      const response = await handleOneDriveSyncRequest(
        syncRequest('final', { cursor, stats: outgoing }),
        { env: env(), requestImpl, maxItems: 1 },
      );
      const body = await response.json();
      assert.equal(body.status, 'success', JSON.stringify(body));
      assert.equal(body.stats.daftarBaru.some((item) => item.nama === 'racun.mp4'), false);
      assert.equal(body.stats.daftarDiubah.some((item) => item.namaLama === 'racun'), false);
      assert.ok(body.stats.daftarBaru.length <= 1);
      namaBaru.push(...body.stats.daftarBaru.map((item) => item.nama));
      done = body.done;
      cursor = body.cursor;
      stats = body.stats;
      assertNoSecrets(JSON.stringify(body));
    }
    assert.equal(done, true);
    assert.equal(stats.baru, 2);
    assert.deepEqual(namaBaru, ['satu.mp4', 'dua.mp3']);
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

  test('302 echo dibaca dengan GET, bukan POST kedua', async () => {
    const calls = [];
    const requestImpl = async (url, options = {}) => {
      const target = new URL(url);
      calls.push({ method: options.method || 'GET', href: target.href, body: options.body || '' });
      if (target.pathname === '/exec') {
        return {
          status: 302,
          headers: { location: 'https://script.googleusercontent.com/macros/echo?user_content_key=sekali' },
          body: '<html>redirect</html>',
        };
      }
      if ((options.method || 'GET') !== 'GET') {
        return { status: 405, headers: { allow: 'GET, HEAD' }, body: 'Sorry, unable to open the file at this time.' };
      }
      return {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'success',
          refreshToken: REFRESH_LAMA,
          deviceCode: '',
          deviceExpires: '',
          pollInterval: '',
        }),
      };
    };

    const response = await handleOneDriveLoginRequest(
      new Request('http://dashboard.local/api/onedrive-login'),
      { env: env(), requestImpl },
    );
    const body = await response.json();
    assert.equal(body.connected, true, JSON.stringify(body));
    const posts = calls.filter((item) => item.method === 'POST');
    assert.equal(posts.length, 1);
    assert.equal(new URL(posts[0].href).pathname, '/exec');
    assert.equal(JSON.parse(posts[0].body).action, 'get_onedrive_token');
    const echoes = calls.filter((item) => item.href.includes('googleusercontent.com'));
    assert.equal(echoes.length, 1);
    assert.equal(echoes[0].method, 'GET');
    assert.equal(echoes[0].href, 'https://script.googleusercontent.com/macros/echo?user_content_key=sekali');
    assert.equal(echoes[0].body, '');
    assertNoSecrets(JSON.stringify(body));
  });

  test('pesan membedakan balasan bukan JSON dari aksi yang belum ada', async () => {
    async function loginAgainst(echo) {
      const requestImpl = async (url, options = {}) => {
        const target = new URL(url);
        if (target.pathname === '/exec') {
          return {
            status: 302,
            headers: { location: 'https://script.googleusercontent.com/macros/echo?user_content_key=sekali' },
            body: '',
          };
        }
        return echo(options.method || 'GET');
      };
      const response = await handleOneDriveLoginRequest(
        new Request('http://dashboard.local/api/onedrive-login'),
        { env: env(), requestImpl },
      );
      return response.json();
    }

    const html = await loginAgainst(() => ({
      status: 405,
      headers: { 'content-type': 'text/html' },
      body: 'Sorry, unable to open the file at this time.',
    }));
    assert.match(html.message, /bukan JSON/);
    assert.equal(html.message.includes('belum punya aksi'), false);

    const missing = await loginAgainst(() => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'success' }),
    }));
    assert.match(missing.message, /belum punya aksi OneDrive/);
    assert.equal(missing.message.includes('bukan JSON'), false);
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

  test('koneksi yang putus diulang, balasan 4xx tidak', async () => {
    const { requestImpl: base } = makeWorld({ refreshToken: '' });
    const attempts = [];
    let hits = 0;
    const requestImpl = async (url, options) => {
      if (new URL(url).hostname === 'login.microsoftonline.com') {
        hits += 1;
        attempts.push(options.microsoftAttempt);
        if (hits < 3) {
          const error = new Error('socket hang up');
          error.code = 'ECONNRESET';
          throw error;
        }
      }
      return base(url, options);
    };
    const started = await handleOneDriveLoginRequest(new Request('http://dashboard.local/api/onedrive-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    }), { env: env(), requestImpl, now: () => 1_700_000_000_000 });
    const startBody = await started.json();
    assert.equal(started.status, 200, JSON.stringify(startBody));
    assert.equal(startBody.userCode, 'ABCD-EFGH');
    assert.deepEqual(attempts, [0, 1, 2]);

    let deniedHits = 0;
    const { requestImpl: deniedBase } = makeWorld({ loginMode: 'invalid_client' });
    const deniedImpl = async (url, options) => {
      if (new URL(url).hostname === 'login.microsoftonline.com') deniedHits += 1;
      return deniedBase(url, options);
    };
    const denied = await handleOneDriveLoginRequest(new Request('http://dashboard.local/api/onedrive-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    }), { env: env(), requestImpl: deniedImpl });
    const deniedBody = await denied.json();
    assert.equal(denied.status, 502);
    assert.equal(deniedHits, 1);
    assert.match(deniedBody.message, /Allow public client flows/);
    assert.equal(deniedBody.message.includes('ECONNRESET'), false);
  });

  test('pesan koneksi memuat kode dan menyensor rahasia', async () => {
    const { world, requestImpl: base } = makeWorld({ refreshToken: '' });
    world.keys.device_code = DEVICE_CODE;
    world.keys.device_expires = String(Date.now() + 60_000);
    const logs = [];
    const original = console.error;
    console.error = (...args) => {
      logs.push(args.map((item) => String(item)).join(' '));
    };
    let hits = 0;
    try {
      const requestImpl = async (url, options) => {
        if (new URL(url).hostname === 'login.microsoftonline.com') {
          hits += 1;
          const error = new Error(`putus ${DEVICE_CODE} Bearer ${ACCESS}`);
          error.code = 'ECONNRESET';
          throw error;
        }
        return base(url, options);
      };
      const response = await handleOneDriveLoginRequest(new Request('http://dashboard.local/api/onedrive-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'poll' }),
      }), { env: env(), requestImpl, now: () => Date.now() });
      const body = await response.json();
      assert.equal(response.status, 502);
      assert.equal(hits, 3);
      assert.match(body.message, /Gagal menghubungi Microsoft/);
      assert.match(body.message, /ECONNRESET/);
      const shown = `${JSON.stringify(body)}\n${logs.join('\n')}`;
      assert.equal(shown.includes(DEVICE_CODE), false);
      assert.equal(shown.includes(ACCESS), false);
      assert.equal(shown.includes(APPS_TOKEN), false);
      assert.match(logs.join('\n'), /login\.microsoftonline\.com percobaan 3\/3 ECONNRESET/);
    } finally {
      console.error = original;
    }
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

describe('putar file OneDrive', () => {
  const DOWNLOAD = 'https://public.sn.files.1drv.com/y4m/iklan.mp4?tempauth=pendek';

  function streamEnv() {
    return env();
  }

  function scriptAndGraph(graph) {
    const saves = [];
    const requestImpl = async (url, options = {}) => {
      const target = new URL(url);
      if (target.hostname === 'login.microsoftonline.com') {
        return {
          status: 200,
          headers: {},
          body: JSON.stringify({
            access_token: ACCESS,
            refresh_token: REFRESH_BARU,
            expires_in: 3600,
          }),
        };
      }
      if (target.pathname === '/exec') {
        const payload = JSON.parse(options.body);
        assert.equal(payload.token, APPS_TOKEN);
        if (payload.action === 'get_onedrive_token') {
          return {
            status: 200,
            headers: {},
            body: JSON.stringify({ status: 'success', refreshToken: REFRESH_LAMA }),
          };
        }
        if (payload.action === 'save_onedrive_token') {
          saves.push(payload.data.refreshToken);
          return { status: 200, headers: {}, body: JSON.stringify({ status: 'success' }) };
        }
        return { status: 200, headers: {}, body: JSON.stringify({ status: 'error', message: payload.action }) };
      }
      return graph(target, options, saves);
    };
    return { requestImpl, saves };
  }

  test('id tidak valid ditolak sebelum menghubungi OneDrive', async () => {
    let called = false;
    const response = await handleOneDriveStreamRequest(
      new Request('http://dashboard.local/api/onedrive-stream?id=a/b'),
      { env: streamEnv(), requestImpl: async () => { called = true; return { status: 500, body: '' }; } },
    );
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.match(body.message, /tidak valid/);
    assert.equal(called, false);
  });

  test('downloadUrl diizinkan dialihkan dan token tidak ikut', async () => {
    const { requestImpl, saves } = scriptAndGraph((target, options) => {
      assert.equal(target.hostname, 'graph.microsoft.com');
      assert.equal(target.pathname, '/v1.0/me/drive/items/FILE!abc');
      assert.equal(target.searchParams.get('$select').includes('downloadUrl'), true);
      assert.equal(options.headers.Authorization, `Bearer ${ACCESS}`);
      return {
        status: 200,
        headers: {},
        body: JSON.stringify({
          id: 'FILE!abc',
          '@microsoft.graph.downloadUrl': DOWNLOAD,
        }),
      };
    });
    const response = await handleOneDriveStreamRequest(
      new Request('http://dashboard.local/api/onedrive-stream?id=FILE!abc'),
      { env: streamEnv(), requestImpl },
    );
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), DOWNLOAD);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const text = await response.text();
    assert.equal(text, '');
    assertNoSecrets(`${text} ${response.headers.get('location')}`);
    assert.equal(saves.includes(REFRESH_BARU), true);
    assert.equal(itemMetaGraphUrl('FILE!abc').includes('/items/FILE!abc'), true);
  });

  test('tautan unduh asing dan yang memuat token ditolak', async () => {
    for (const bad of [
      'https://evil.example/file.mp4',
      `https://public.sn.files.1drv.com/y4m/x.mp4?token=${ACCESS}`,
    ]) {
      const { requestImpl } = scriptAndGraph(() => ({
        status: 200,
        headers: {},
        body: JSON.stringify({ '@microsoft.graph.downloadUrl': bad }),
      }));
      const response = await handleOneDriveStreamRequest(
        new Request('http://dashboard.local/api/onedrive-stream?id=FILE!abc'),
        { env: streamEnv(), requestImpl },
      );
      const body = await response.json();
      assert.equal(response.status, 502, JSON.stringify(body));
      assert.equal(response.headers.get('location'), null);
      assertNoSecrets(JSON.stringify(body));
    }
    assert.equal(isAllowedPlaybackUrl(DOWNLOAD), true);
    assert.equal(isAllowedPlaybackUrl('https://files.1drv.com.evil.test/a.mp4'), false);
    assert.equal(isAllowedPlaybackUrl('http://public.sn.files.1drv.com/a.mp4'), false);
  });

  test('tanpa downloadUrl mengikuti lokasi /content yang aman', async () => {
    const { requestImpl } = scriptAndGraph((target, options) => {
      if (target.pathname.endsWith('/content')) {
        assert.equal(options.headers.Authorization, `Bearer ${ACCESS}`);
        return {
          status: 302,
          headers: { location: DOWNLOAD },
          body: '',
        };
      }
      return { status: 200, headers: {}, body: JSON.stringify({ id: 'FILE!abc' }) };
    });
    const response = await handleOneDriveStreamRequest(
      new Request('http://dashboard.local/api/onedrive-stream?id=FILE!abc'),
      { env: streamEnv(), requestImpl },
    );
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), DOWNLOAD);
    assertNoSecrets(response.headers.get('location'));
  });

  test('tanpa refresh token minta hubungkan ulang', async () => {
    const requestImpl = async (url, options = {}) => {
      const target = new URL(url);
      if (target.pathname === '/exec') {
        const payload = JSON.parse(options.body);
        if (payload.action === 'get_onedrive_token') {
          return { status: 200, headers: {}, body: JSON.stringify({ status: 'success', refreshToken: '' }) };
        }
      }
      return { status: 500, headers: {}, body: '' };
    };
    const response = await handleOneDriveStreamRequest(
      new Request('http://dashboard.local/api/onedrive-stream?id=FILE!abc'),
      { env: streamEnv(), requestImpl },
    );
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.needsLogin, true);
    assertNoSecrets(JSON.stringify(body));
  });

  test('proxy mengembalikan byte file tanpa menaruh URL unduh', async () => {
    const { requestImpl } = scriptAndGraph(() => ({
      status: 200,
      headers: {},
      body: JSON.stringify({ '@microsoft.graph.downloadUrl': DOWNLOAD }),
    }));
    const payload = Buffer.from('mentahan-audio');
    let seen = '';
    const response = await handleOneDriveStreamRequest(
      new Request('http://dashboard.local/api/onedrive-stream?id=FILE!abc&proxy=1'),
      {
        env: streamEnv(),
        requestImpl,
        fetchImpl: async (url) => {
          seen = url;
          return new Response(payload, {
            status: 200,
            headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(payload.length) },
          });
        },
      },
    );
    assert.equal(seen, DOWNLOAD);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('location'), null);
    assert.equal(response.headers.get('content-type'), 'video/mp4');
    assert.equal([...response.headers.values()].join('\n').includes(DOWNLOAD), false);
    assert.equal(Buffer.from(await response.arrayBuffer()).toString(), 'mentahan-audio');
    assertNoSecrets(seen);
  });

  test('proxy menolak file Mentahan yang terlalu besar', async () => {
    const { requestImpl } = scriptAndGraph(() => ({
      status: 200,
      headers: {},
      body: JSON.stringify({ '@microsoft.graph.downloadUrl': DOWNLOAD }),
    }));
    const response = await handleOneDriveStreamRequest(
      new Request('http://dashboard.local/api/onedrive-stream?id=FILE!abc&proxy=1'),
      {
        env: streamEnv(),
        requestImpl,
        fetchImpl: async () => new Response('besar', {
          status: 200,
          headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(20 * 1024 * 1024) },
        }),
      },
    );
    const body = await response.json();
    assert.equal(response.status, 413);
    assert.match(body.message, /terlalu besar/);
    assert.equal(JSON.stringify(body).includes(DOWNLOAD), false);
    assertNoSecrets(JSON.stringify(body));
  });

  test('timeout tidak diulang dan kodenya ikut di pesan', async () => {
    let graphHits = 0;
    const { requestImpl } = scriptAndGraph(() => {
      graphHits += 1;
      const error = new Error('timeout');
      error.code = 'ETIMEDOUT';
      throw error;
    });
    const response = await handleOneDriveStreamRequest(
      new Request('http://dashboard.local/api/onedrive-stream?id=FILE!abc'),
      { env: streamEnv(), requestImpl },
    );
    const body = await response.json();
    assert.equal(response.status, 504);
    assert.match(body.message, /terlalu lama/);
    assert.match(body.message, /ETIMEDOUT/);
    assert.equal(graphHits, 1);
    assertNoSecrets(JSON.stringify(body));
  });
});

describe('transport Microsoft', () => {
  test('tanpa requestImpl, fetch dicoba dulu lalu IPv4', async () => {
    const fetches = [];
    const tlsCalls = [];
    mock.method(globalThis, 'fetch', async (url, init) => {
      fetches.push({
        url: String(url),
        method: init?.method,
        redirect: init?.redirect,
      });
      const error = new TypeError('fetch failed');
      error.cause = Object.assign(new Error('connect ECONNRESET 20.1.2.3:443'), { code: 'ECONNRESET' });
      throw error;
    });
    mock.method(dns, 'lookup', (hostname, options, callback) => {
      assert.equal(options.family, 4);
      assert.equal(options.all, true);
      callback(null, [
        { address: '20.1.2.3', family: 4 },
        { address: '20.1.2.4', family: 4 },
      ]);
    });
    mock.method(http, 'request', (target, options, callback) => {
      const req = new EventEmitter();
      req.setTimeout = () => req;
      req.write = () => req;
      req.end = () => {
        const res = new Readable({ read() {} });
        res.statusCode = 200;
        res.headers = { 'content-type': 'application/json' };
        callback(res);
        res.push(Buffer.from(JSON.stringify({
          status: 'success',
          refreshToken: REFRESH_LAMA,
        })));
        res.push(null);
      };
      assert.equal(options.family, undefined);
      assert.equal(new URL(target).protocol, 'http:');
      return req;
    });
    mock.method(https, 'request', (target, options, callback) => {
      const url = new URL(target);
      tlsCalls.push({ host: url.hostname, family: options.family, autoSelectFamily: options.autoSelectFamily, servername: options.servername, lookup: options.lookup });
      const req = new EventEmitter();
      req.setTimeout = () => req;
      req.write = () => req;
      req.end = () => {
        const token = url.hostname === 'login.microsoftonline.com';
        const res = new Readable({ read() {} });
        res.statusCode = 200;
        res.headers = { 'content-type': 'application/json' };
        callback(res);
        res.push(Buffer.from(JSON.stringify(token
          ? { access_token: ACCESS, refresh_token: REFRESH_BARU, expires_in: 3600 }
          : { id: 'FILE!abc', '@microsoft.graph.downloadUrl': 'https://public.sn.files.1drv.com/y4m/iklan.mp4' })));
        res.push(null);
      };
      return req;
    });

    try {
      const result = await mintOneDriveDownloadUrl({
        env: env(),
        requestImpl: undefined,
        itemId: 'FILE!abc',
      });
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.equal(result.url, 'https://public.sn.files.1drv.com/y4m/iklan.mp4');
      assert.equal(fetches.length, 2);
      assert.equal(fetches.every((item) => item.redirect === 'manual'), true);
      assert.equal(fetches.some((item) => item.url.includes('login.microsoftonline.com') && item.method === 'POST'), true);
      assert.equal(fetches.some((item) => item.url.includes('graph.microsoft.com') && item.method === 'GET'), true);
      assert.equal(tlsCalls.length, 2);
      assert.equal(tlsCalls.every((item) => item.family === 4 && item.autoSelectFamily === false), true);
      assert.equal(tlsCalls[0].servername, 'login.microsoftonline.com');
      assert.equal(tlsCalls[1].servername, 'graph.microsoft.com');
      const picked = await new Promise((resolve, reject) => {
        tlsCalls[0].lookup('login.microsoftonline.com', {}, (err, address, family) => {
          if (err) reject(err);
          else resolve({ address, family });
        });
      });
      assert.deepEqual(picked, { address: '20.1.2.4', family: 4 });
      assert.equal(JSON.stringify(result).includes(ACCESS), false);
      assert.equal(JSON.stringify(result).includes(REFRESH_LAMA), false);
    } finally {
      mock.restoreAll();
    }
  });
});

