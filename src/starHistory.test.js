import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  applyStarChange,
  buildStarIndex,
  compareMonthOptions,
  compareStarMonths,
  displayedStarFromIndex,
  formatStarBadge,
  monthFromTimestamp,
  resolveStarState,
  starMonthForSelection,
  toYearMonth,
  winningMonthsForFile,
} from './starHistory.js';

const FILE = 'FYP__klip-1';

function star(rows, bulan, isWinning, extra = {}) {
  return applyStarChange(rows, {
    fileKey: FILE,
    bulan,
    isWinning,
    fileName: 'Video Gagang',
    kategori: 'Laporan FYP',
    produk: 'Gagang',
    ...extra,
  });
}

describe('riwayat bintang menumpuk per bulan laporan', () => {
  test('bintang Oktober lalu November lalu Desember tetap aktif di ketiga bulan', () => {
    let rows = [];
    rows = star(rows, '2026-10', true);
    rows = star(rows, '2026-11', true);
    rows = star(rows, '2026-12', true);

    assert.deepEqual(winningMonthsForFile(rows, FILE), ['2026-10', '2026-11', '2026-12']);
    assert.equal(formatStarBadge(winningMonthsForFile(rows, FILE)), '⭐ Okt · ⭐ Nov · ⭐ Des');
    assert.equal(rows.filter((row) => row.fileKey === FILE).length, 3);

    const index = buildStarIndex(rows);
    assert.equal(displayedStarFromIndex('history', index, FILE, '2026-10', {}).isWinning, true);
    assert.equal(displayedStarFromIndex('history', index, FILE, '2026-11', {}).isWinning, true);
    assert.equal(displayedStarFromIndex('history', index, FILE, '2026-12', {}).isWinning, true);
  });

  test('bintang bulan baru tidak menimpa atau menghapus bulan sebelumnya', () => {
    let rows = [];
    rows = star(rows, '2026-10', true, { catatan: 'hook oktober' });
    rows = star(rows, '2026-11', true, { catatan: 'hook november' });

    const october = rows.find((row) => row.bulan === '2026-10');
    const november = rows.find((row) => row.bulan === '2026-11');
    assert.equal(october.isWinning, true);
    assert.equal(october.catatan, 'hook oktober');
    assert.equal(november.isWinning, true);
    assert.equal(november.catatan, 'hook november');
  });

  test('cabut bintang hanya mematikan bulan yang sedang dipilih', () => {
    let rows = [];
    rows = star(rows, '2026-10', true, { catatan: 'tetap' });
    rows = star(rows, '2026-11', true);
    rows = star(rows, '2026-12', true);
    rows = star(rows, '2026-11', false);

    assert.equal(formatStarBadge(winningMonthsForFile(rows, FILE)), '⭐ Okt · ⭐ Des');
    assert.equal(displayedStarFromIndex('history', buildStarIndex(rows), FILE, '2026-10', {}).isWinning, true);
    assert.equal(displayedStarFromIndex('history', buildStarIndex(rows), FILE, '2026-11', {}).isWinning, false);
    assert.equal(displayedStarFromIndex('history', buildStarIndex(rows), FILE, '2026-12', {}).isWinning, true);
    assert.equal(displayedStarFromIndex('history', buildStarIndex(rows), FILE, '2026-10', {}).catatan, 'tetap');
    assert.equal(rows.filter((row) => row.fileKey === FILE).length, 3);
  });

  test('bintang ulang di bulan yang sama memperbarui satu baris, bukan menduplikasi', () => {
    let rows = [];
    rows = star(rows, '2026-10', true, { catatan: 'lama' });
    rows = star(rows, '2026-11', true);
    rows = star(rows, '2026-10', true, { catatan: 'baru' });

    const october = rows.filter((row) => row.bulan === '2026-10' && row.fileKey === FILE);
    assert.equal(october.length, 1);
    assert.equal(october[0].catatan, 'baru');
    assert.equal(displayedStarFromIndex('history', buildStarIndex(rows), FILE, '2026-11', {}).isWinning, true);
  });

  test('catatan satu bulan tidak mengubah catatan bulan lain', () => {
    let rows = [];
    rows = star(rows, '2026-10', true, { catatan: 'okt' });
    rows = star(rows, '2026-12', true, { catatan: 'des' });
    rows = star(rows, '2026-12', true, { catatan: 'des-baru' });

    const index = buildStarIndex(rows);
    assert.equal(displayedStarFromIndex('history', index, FILE, '2026-10', {}).catatan, 'okt');
    assert.equal(displayedStarFromIndex('history', index, FILE, '2026-12', {}).catatan, 'des-baru');
  });

  test('perubahan file lain tidak menghapus riwayat file ini', () => {
    let rows = star([], '2026-10', true);
    rows = applyStarChange(rows, {
      fileKey: 'RAW__lain',
      bulan: '2026-10',
      isWinning: true,
      fileName: 'Mentahan lain',
      kategori: 'Mentahan (Raw_Asset)',
    });
    rows = applyStarChange(rows, {
      fileKey: 'RAW__lain',
      bulan: '2026-10',
      isWinning: false,
      fileName: 'Mentahan lain',
      kategori: 'Mentahan (Raw_Asset)',
    });

    assert.equal(displayedStarFromIndex('history', buildStarIndex(rows), FILE, '2026-10', {}).isWinning, true);
  });

  test('bulan tidak valid tidak menghapus riwayat yang sudah ada', () => {
    const rows = star([], '2026-10', true);
    const next = applyStarChange(rows, { fileKey: FILE, bulan: 'Semua', isWinning: false });
    assert.equal(displayedStarFromIndex('history', buildStarIndex(next), FILE, '2026-10', {}).isWinning, true);
    assert.equal(next.length, 1);
  });
});

describe('bulan laporan, bukan tanggal klik', () => {
  test('filter Oktober menang atas bulan file yang lain', () => {
    assert.equal(starMonthForSelection('Oktober 2026', '2026-11'), '2026-10');
    assert.equal(starMonthForSelection('2026-11', '2026-10'), '2026-11');
    assert.equal(toYearMonth('November 2026'), '2026-11');
  });

  test('filter Semua memakai bulan file, bukan bulan lain', () => {
    assert.equal(starMonthForSelection('Semua', '2026-10'), '2026-10');
    assert.equal(starMonthForSelection('', '2026-12-03'), '2026-12');
    assert.equal(starMonthForSelection('Semua', ''), '');
  });
});

describe('migrasi dan fallback Apps Script lama', () => {
  test('tanpa starHistory tetap mode lama: bintang tampil di bulan mana pun', () => {
    const state = resolveStarState({
      winningFiles: [{ fileKey: FILE, isWinning: true, updatedAt: '2026-10-02', catatan: 'lama' }],
    });
    assert.equal(state.mode, 'legacy');
    assert.deepEqual(state.rows, []);

    const legacyMap = { [FILE]: { isWinning: true, catatan: 'lama' } };
    const shown = displayedStarFromIndex('legacy', buildStarIndex([]), FILE, '2026-11', legacyMap);
    assert.equal(shown.isWinning, true);
    assert.equal(shown.catatan, 'lama');
    assert.deepEqual(shown.months, []);
    assert.equal(formatStarBadge(shown.months), '');
  });

  test('riwayat kosong mengisi bulan dari Terakhir_Diupdate bila Status Ya', () => {
    const state = resolveStarState({
      starHistory: [],
      winningFiles: [
        {
          fileKey: 'RAW__a',
          isWinning: true,
          updatedAt: '20/10/2026 08:00',
          fileName: 'Mentahan A',
          kategori: 'Mentahan (Raw_Asset)',
          catatan: 'pindah',
        },
        {
          fileKey: 'RAW__b',
          isWinning: false,
          updatedAt: '2026-10-01',
        },
        {
          fileKey: 'KLIP__c',
          isWinning: 'Ya',
          updatedAt: 'Tue Nov 03 2026 10:15:00 GMT+0700',
          fileName: 'Klip C',
        },
      ],
    });

    assert.equal(state.mode, 'history');
    assert.equal(displayedStarFromIndex('history', buildStarIndex(state.rows), 'RAW__a', '2026-10', {}).isWinning, true);
    assert.equal(displayedStarFromIndex('history', buildStarIndex(state.rows), 'RAW__a', '2026-11', {}).isWinning, false);
    assert.equal(displayedStarFromIndex('history', buildStarIndex(state.rows), 'RAW__a', '2026-10', {}).catatan, 'pindah');
    assert.equal(displayedStarFromIndex('history', buildStarIndex(state.rows), 'RAW__b', '2026-10', {}).isWinning, false);
    assert.equal(displayedStarFromIndex('history', buildStarIndex(state.rows), 'KLIP__c', '2026-11', {}).isWinning, true);
  });

  test('snapshot Data_Winning_Files tidak menimpa bulan yang sudah ada di riwayat', () => {
    const state = resolveStarState({
      starHistory: [
        { bulan: '2026-10', fileKey: FILE, isWinning: true, fileName: 'Video Gagang', kategori: 'Laporan FYP' },
        { bulan: '2026-11', fileKey: FILE, isWinning: true, fileName: 'Video Gagang', kategori: 'Laporan FYP' },
        { bulan: '2026-10', fileKey: 'FYP__cabut', isWinning: false, kategori: 'Laporan FYP' },
      ],
      winningFiles: [
        { fileKey: FILE, isWinning: true, updatedAt: '2026-12-01', fileName: 'Video Gagang' },
        { fileKey: 'FYP__cabut', isWinning: true, updatedAt: '2026-10-20' },
        { fileKey: 'PUBLISH__baru', isWinning: true, updatedAt: '05/09/2026', fileName: 'Upload lama', kategori: 'Video Terupload (Publish)' },
      ],
    });

    assert.deepEqual(winningMonthsForFile(state.rows, FILE), ['2026-10', '2026-11']);
    assert.equal(displayedStarFromIndex('history', buildStarIndex(state.rows), 'FYP__cabut', '2026-10', {}).isWinning, false);
    assert.equal(displayedStarFromIndex('history', buildStarIndex(state.rows), 'PUBLISH__baru', '2026-09', {}).isWinning, true);
    assert.equal(formatStarBadge(winningMonthsForFile(state.rows, FILE)), '⭐ Okt · ⭐ Nov');
  });

  test('bulan dari Terakhir_Diupdate mengenali tanggal sheet', () => {
    assert.equal(monthFromTimestamp('2026-10-20T17:00:00.000Z'), '2026-10');
    assert.equal(monthFromTimestamp('15/11/2026'), '2026-11');
    assert.equal(monthFromTimestamp('11/15/2026'), '2026-11');
    assert.equal(monthFromTimestamp(''), '');
    assert.equal(monthFromTimestamp('2026-13-01'), '');
  });
});

describe('perbandingan antarbulan', () => {
  test('kedua bulan, baru, dan hilang memakai bulan dasar versus bulan pembanding', () => {
    let rows = [];
    rows = applyStarChange(rows, { fileKey: 'FYP__tetap', bulan: '2026-10', isWinning: true, fileName: 'Tetap', kategori: 'Laporan FYP' });
    rows = applyStarChange(rows, { fileKey: 'FYP__tetap', bulan: '2026-11', isWinning: true, fileName: 'Tetap', kategori: 'Laporan FYP' });
    rows = applyStarChange(rows, { fileKey: 'FYP__tetap', bulan: '2026-12', isWinning: true, fileName: 'Tetap', kategori: 'Laporan FYP' });
    rows = applyStarChange(rows, { fileKey: 'FYP__baru', bulan: '2026-11', isWinning: true, fileName: 'Baru Nov', kategori: 'Laporan FYP' });
    rows = applyStarChange(rows, { fileKey: 'FYP__hilang', bulan: '2026-10', isWinning: true, fileName: 'Hilang', kategori: 'Laporan FYP' });
    rows = applyStarChange(rows, { fileKey: 'RAW__pipeline', bulan: '2026-10', isWinning: true, fileName: 'Raw', kategori: 'Mentahan (Raw_Asset)' });
    rows = applyStarChange(rows, { fileKey: 'RAW__pipeline', bulan: '2026-11', isWinning: true, fileName: 'Raw', kategori: 'Mentahan (Raw_Asset)' });

    const compared = compareStarMonths(rows, '2026-11', '2026-10', 'fyp');
    assert.equal(compared.ready, true);
    assert.deepEqual(compared.both.map((row) => row.fileKey), ['FYP__tetap']);
    assert.deepEqual(compared.added.map((row) => row.fileKey), ['FYP__baru']);
    assert.deepEqual(compared.dropped.map((row) => row.fileKey), ['FYP__hilang']);

    const pipeline = compareStarMonths(rows, 'November 2026', 'Oktober 2026', 'pipeline');
    assert.deepEqual(pipeline.both.map((row) => row.fileKey), ['RAW__pipeline']);
    assert.deepEqual(pipeline.added, []);
    assert.deepEqual(pipeline.dropped, []);
  });

  test('cabut bintang di bulan dasar memindahkan file dari kedua bulan ke hilang', () => {
    let rows = [];
    rows = star(rows, '2026-10', true);
    rows = star(rows, '2026-11', true);
    rows = star(rows, '2026-11', false);

    const compared = compareStarMonths(rows, '2026-11', '2026-10', 'fyp');
    assert.deepEqual(compared.both, []);
    assert.deepEqual(compared.added, []);
    assert.deepEqual(compared.dropped.map((row) => row.fileKey), [FILE]);
    assert.equal(formatStarBadge(winningMonthsForFile(rows, FILE)), '⭐ Okt');
  });

  test('perbandingan belum siap bila bulan pembanding kosong atau sama', () => {
    const rows = star([], '2026-10', true);
    assert.equal(compareStarMonths(rows, '2026-10', '', 'fyp').ready, false);
    assert.equal(compareStarMonths(rows, '2026-10', '2026-10', 'fyp').ready, false);
    assert.deepEqual(compareMonthOptions('2026-10', rows, ['November 2026', 'Semua', '2026-10']), ['2026-11']);
  });

  test('badge menyertakan tahun bila riwayat melewati tahun', () => {
    let rows = [];
    rows = star(rows, '2025-12', true);
    rows = star(rows, '2026-01', true);
    assert.equal(formatStarBadge(winningMonthsForFile(rows, FILE)), '⭐ Des 25 · ⭐ Jan 26');
  });
});
