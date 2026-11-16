import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SYNC_DETAIL_LIMIT } from '../server/onedrive-plan.js';
import {
  SYNC_CHANGELOG_KEY,
  appendSyncDetails,
  changelogForRun,
  createSyncLog,
  readSyncChangelog,
  statsForRequest,
  writeSyncChangelog,
} from './syncChangelog.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
}

describe('daftar sinkron di klien', () => {
  test('proses baru mengganti daftar, lanjutan menumpuk batch', () => {
    const started = createSyncLog({
      targetId: 'final',
      targetLabel: 'Video Final',
      startedAt: '2026-11-16T02:00:00.000Z',
    });
    const afterFirst = appendSyncDetails(started, {
      baru: 1,
      diperbarui: 1,
      daftarBaru: [{ nama: 'a.mp4', path: 'OneDrive/A' }],
      daftarDiubah: [{
        namaLama: 'lama.mp4',
        pathLama: 'OneDrive/Lama',
        namaBaru: 'baru.mp4',
        pathBaru: 'OneDrive/Baru',
      }],
    });
    const continued = changelogForRun(afterFirst, {
      continued: true,
      targetId: 'final',
      targetLabel: 'Video Final',
      startedAt: '2026-11-16T03:00:00.000Z',
    });
    const afterSecond = appendSyncDetails(continued, {
      baru: 2,
      diperbarui: 1,
      daftarBaru: [{ nama: 'b.mp4', path: 'OneDrive/B' }],
      daftarDiubah: [],
    });
    assert.equal(afterSecond.startedAt, '2026-11-16T02:00:00.000Z');
    assert.equal(afterSecond.targetLabel, 'Video Final');
    assert.deepEqual(afterSecond.daftarBaru.map((item) => item.nama), ['a.mp4', 'b.mp4']);
    assert.equal(afterSecond.daftarDiubah.length, 1);
    assert.equal(afterSecond.totalBaru, 2);
    assert.equal(afterSecond.totalDiubah, 1);

    const replaced = changelogForRun(afterSecond, {
      continued: false,
      targetId: 'mentahan',
      targetLabel: 'Mentahan',
      startedAt: '2026-11-16T04:00:00.000Z',
    });
    assert.equal(replaced.targetId, 'mentahan');
    assert.deepEqual(replaced.daftarBaru, []);
    assert.equal(replaced.totalBaru, 0);
  });

  test('daftar berhenti di 500 dan total tetap dihitung', () => {
    let log = createSyncLog({ targetId: 'final', targetLabel: 'Video Final', startedAt: '2026-11-16T02:00:00.000Z' });
    const batch = [];
    for (let index = 0; index < 40; index += 1) batch.push({ nama: `f-${index}.mp4`, path: 'OneDrive/A' });
    for (let round = 0; round < 13; round += 1) {
      log = appendSyncDetails(log, {
        baru: (round + 1) * 40,
        diperbarui: 0,
        daftarBaru: batch.map((item, index) => ({ ...item, nama: `f-${round}-${index}.mp4` })),
      });
    }
    assert.equal(log.daftarBaru.length, SYNC_DETAIL_LIMIT);
    assert.equal(log.totalBaru, 520);
    assert.equal(log.daftarBaru[0].nama, 'f-0-0.mp4');
    assert.equal(log.daftarBaru[SYNC_DETAIL_LIMIT - 1].nama, 'f-12-19.mp4');
  });

  test('permintaan berikutnya tidak mengirim daftar, localStorage bertahan sampai dihapus', () => {
    const log = appendSyncDetails(
      createSyncLog({ targetId: 'mentahan', targetLabel: 'Mentahan', startedAt: '2026-11-16T02:00:00.000Z' }),
      {
        baru: 1,
        diperbarui: 0,
        dilewati: 2,
        kembar: ['Sama.mp4', 12],
        daftarBaru: [{ nama: 'baru.mp4', path: 'OneDrive/Mentahan' }],
      },
    );
    const payload = statsForRequest({
      baru: 3,
      diperbarui: 1,
      dilewati: 4,
      kembar: ['Sama.mp4'],
      daftarBaru: [{ nama: 'baru.mp4', path: 'OneDrive/Mentahan' }],
      daftarDiubah: [{ namaLama: 'a', pathLama: 'b', namaBaru: 'c', pathBaru: 'd' }],
    });
    assert.equal(Object.hasOwn(payload, 'daftarBaru'), false);
    assert.equal(Object.hasOwn(payload, 'daftarDiubah'), false);
    assert.deepEqual(payload.kembar, ['Sama.mp4']);

    const storage = memoryStorage();
    writeSyncChangelog(storage, log);
    const stored = readSyncChangelog(storage);
    assert.equal(stored.targetLabel, 'Mentahan');
    assert.equal(stored.daftarBaru[0].path, 'OneDrive/Mentahan');
    assert.equal(storage.getItem(SYNC_CHANGELOG_KEY).includes('baru.mp4'), true);
    writeSyncChangelog(storage, null);
    assert.equal(readSyncChangelog(storage), null);
  });

  test('localStorage rusak dibaca sebagai kosong', () => {
    const storage = memoryStorage();
    storage.setItem(SYNC_CHANGELOG_KEY, '{');
    assert.equal(readSyncChangelog(storage), null);
    storage.setItem(SYNC_CHANGELOG_KEY, JSON.stringify({ daftarBaru: [{ nama: 'x', path: 'y' }] }));
    assert.equal(readSyncChangelog(storage), null);
  });
});
