import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SYNC_CHANGELOG_KEY } from './syncChangelog.js';
import { createSyncRun } from './syncRun.js';

const TARGETS = [
  { id: 'final', label: 'Video Final' },
  { id: 'mentahan', label: 'Mentahan' },
];

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
}

function batchResponse(step, done) {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        status: 'success',
        done,
        label: 'Video Final',
        cursor: done ? null : { step },
        stats: {
          baru: step,
          diperbarui: 0,
          dilewati: 0,
          kembar: [],
          daftarBaru: [{ nama: `file-${step}.mp4`, path: 'OneDrive/Video Final' }],
          daftarDiubah: [],
        },
      };
    },
  };
}

describe('sinkron tetap jalan tanpa tampilan', () => {
  test('batch lanjut selesai meski tab dianggap tertutup, dan sinkron kedua ditolak', async () => {
    const storage = memoryStorage();
    let viewMounted = true;
    let step = 0;
    const calls = [];
    let synced = 0;
    const run = createSyncRun({
      targets: TARGETS,
      now: () => '2026-11-16T03:00:00.000Z',
      readLog: () => null,
      writeLog: (log) => {
        if (!log) storage.removeItem(SYNC_CHANGELOG_KEY);
        else storage.setItem(SYNC_CHANGELOG_KEY, JSON.stringify(log));
      },
      request: async () => {
        step += 1;
        calls.push({ step, viewMounted });
        if (step === 1) viewMounted = false;
        return batchResponse(step, step >= 3);
      },
    });
    const seen = [];
    run.subscribe((state) => seen.push(state.running));

    const first = run.start('final', { onSynced: () => { synced += 1; } });
    const second = await run.start('mentahan');
    assert.equal(second, false);
    assert.equal(await first, true);
    assert.equal(viewMounted, false);
    assert.deepEqual(calls.map((item) => item.step), [1, 2, 3]);
    assert.equal(synced, 1);
    assert.equal(run.snapshot().running, null);
    assert.equal(run.snapshot().changelog.daftarBaru.length, 3);
    assert.equal(run.snapshot().changelog.totalBaru, 3);
    assert.equal(run.snapshot().report.done, true);
    const stored = JSON.parse(storage.getItem(SYNC_CHANGELOG_KEY));
    assert.deepEqual(stored.daftarBaru.map((item) => item.nama), ['file-1.mp4', 'file-2.mp4', 'file-3.mp4']);
    assert.equal(seen.includes('final'), true);
    assert.equal(seen.includes('mentahan'), false);
  });

  test('tutup ditolak selagi berjalan dan menghapus daftar setelah selesai', async () => {
    const storage = memoryStorage();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const run = createSyncRun({
      targets: TARGETS,
      now: () => '2026-11-16T03:00:00.000Z',
      readLog: () => null,
      writeLog: (log) => {
        if (!log) storage.removeItem(SYNC_CHANGELOG_KEY);
        else storage.setItem(SYNC_CHANGELOG_KEY, JSON.stringify(log));
      },
      request: async () => {
        await gate;
        return batchResponse(1, true);
      },
    });
    const pending = run.start('final');
    assert.equal(run.snapshot().running, 'final');
    assert.equal(run.dismiss(), false);
    assert.equal(storage.getItem(SYNC_CHANGELOG_KEY).includes('Video Final'), true);
    release();
    assert.equal(await pending, true);
    assert.equal(run.dismiss(), true);
    assert.equal(run.snapshot().changelog, null);
    assert.equal(storage.getItem(SYNC_CHANGELOG_KEY), null);
  });
});
