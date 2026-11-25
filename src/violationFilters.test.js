import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  EMPTY_VIOLATION_FILTERS,
  TANPA_SANKSI,
  buildViolationFilterView,
  currentViolationMonth,
  readViolationFilters,
  violationMonthKey,
  violationMonthLabel,
  writeViolationFilters,
} from './violationFilters.js';

const NOW = new Date('2026-11-25T02:00:00+07:00');

const ROWS = [
  { tanggal: '20/11/2026', akun: 'AKN_002 - Produk Andalan Kita', status: 'Belum Banding', sanksi: 'Peringatan' },
  { tanggal: '2/11/2026', akun: 'AKN_002 - Produk Andalan Kita', status: 'Menunggu Banding', sanksi: 'Peringatan' },
  { tanggal: '2026-11-02', akun: 'AKN_001 - Jual Kawat (Deni)', status: 'Belum Banding', sanksi: 'Video dibatasi / tidak masuk FYP' },
  { tanggal: '15/10/2026', akun: 'AKN_002 - Produk Andalan Kita', status: 'Belum Banding', sanksi: '' },
  { tanggal: '2026-11-30T17:00:00.000Z', akun: 'AKN_001 - Jual Kawat (Deni)', status: 'Banding Diterima', sanksi: 'Peringatan' },
];

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value);
    },
  };
}

describe('filter bulan dan hitungan pelanggaran', () => {
  test('bulan dibaca dari dd/mm/yyyy, ISO, dan stempel WIB', () => {
    assert.equal(violationMonthKey('5/6/2026'), '2026-06');
    assert.equal(violationMonthKey('22/11/2026'), '2026-11');
    assert.equal(violationMonthKey('2026-11-22'), '2026-11');
    assert.equal(violationMonthKey('2026-11-11T17:00:00.000Z'), '2026-11');
    assert.equal(violationMonthKey('2026-11-30T17:00:00.000Z'), '2026-12');
    assert.equal(violationMonthKey('2026-02-31'), '');
    assert.equal(violationMonthKey('-'), '');
    assert.equal(violationMonthLabel('2026-11'), 'November 2026');
    assert.equal(currentViolationMonth(NOW), '2026-11');
  });

  test('bulan terbaru di atas dan hitungan facet mengikuti filter lain', () => {
    const open = buildViolationFilterView(ROWS, EMPTY_VIOLATION_FILTERS, NOW);
    assert.deepEqual(open.months.map((item) => item.label), [
      'Semua bulan (5)',
      'Desember 2026 (1)',
      'November 2026 (3)',
      'Oktober 2026 (1)',
    ]);
    assert.equal(open.headline, 'Semua bulan: 5 pelanggaran');
    assert.equal(open.rangeLabel, 'Menampilkan 5 dari 5');
    assert.deepEqual(open.accountChips.map((item) => item.label), [
      'AKN_002 - Produk Andalan Kita (3)',
      'AKN_001 - Jual Kawat (Deni) (2)',
    ]);

    const november = buildViolationFilterView(ROWS, { ...EMPTY_VIOLATION_FILTERS, bulan: '2026-11' }, NOW);
    assert.equal(november.headline, 'Bulan ini: 3 pelanggaran');
    assert.equal(november.rangeLabel, 'Menampilkan 3 dari 5');
    assert.deepEqual(november.accounts.map((item) => item.label), [
      'Semua akun (3)',
      'AKN_001 - Jual Kawat (Deni) (1)',
      'AKN_002 - Produk Andalan Kita (2)',
    ]);
    assert.deepEqual(november.months.map((item) => item.label), open.months.map((item) => item.label));
    assert.deepEqual(november.statuses.map((item) => item.label), [
      'Semua status (3)',
      'Belum Banding (2)',
      'Menunggu Banding (1)',
    ]);

    const narrowed = buildViolationFilterView(ROWS, {
      bulan: '2026-11',
      akun: 'Semua',
      status: 'Belum Banding',
      sanksi: 'Semua',
    }, NOW);
    assert.equal(narrowed.rows.length, 2);
    assert.deepEqual(narrowed.accounts.map((item) => item.label), [
      'Semua akun (2)',
      'AKN_001 - Jual Kawat (Deni) (1)',
      'AKN_002 - Produk Andalan Kita (1)',
    ]);
    assert.deepEqual(narrowed.sanctions.map((item) => item.label), [
      'Semua sanksi (2)',
      'Peringatan (1)',
      'Video dibatasi / tidak masuk FYP (1)',
    ]);
    assert.deepEqual(narrowed.months.map((item) => item.value), ['Semua', '2026-11', '2026-10']);

    const october = buildViolationFilterView(ROWS, { ...EMPTY_VIOLATION_FILTERS, bulan: '2026-10' }, NOW);
    assert.equal(october.headline, 'Oktober 2026: 1 pelanggaran');
    assert.equal(october.sanctions.find((item) => item.value === TANPA_SANKSI)?.label, 'Tanpa sanksi (1)');
  });

  test('filter terakhir tersimpan dan JSON rusak diabaikan', () => {
    const storage = memoryStorage();
    writeViolationFilters(storage, { bulan: '2026-11', akun: 'AKN_002 - Produk Andalan Kita', status: 'Semua', sanksi: 'Peringatan' });
    assert.deepEqual(readViolationFilters(storage), {
      bulan: '2026-11',
      akun: 'AKN_002 - Produk Andalan Kita',
      status: 'Semua',
      sanksi: 'Peringatan',
    });
    storage.setItem('promoops.pelanggaran.filters', '{');
    assert.deepEqual(readViolationFilters(storage), EMPTY_VIOLATION_FILTERS);
    storage.setItem('promoops.pelanggaran.filters', JSON.stringify({ bulan: '   ' }));
    assert.equal(readViolationFilters(storage).bulan, 'Semua');
  });
});
