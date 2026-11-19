import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  bucketIdForView,
  buildRekapProduk,
  currentYearMonth,
  filterRekapVideos,
  formatIdNumber,
  formatUploadDate,
  parseViewCount,
  rekapMonthChoices,
  rowYearMonth,
  sortRekapRows,
} from './rekapProduk.js';

function row(produk, tanggal, view, extra = {}) {
  return { Induk_Barang: produk, Tanggal_Upload: tanggal, View: view, ...extra };
}

describe('kelompok view', () => {
  test('batas 1.000, 5.000, dan 10.000 mengikuti aturan inklusif di batas bawah', () => {
    assert.equal(bucketIdForView(0), 'under1k');
    assert.equal(bucketIdForView(999), 'under1k');
    assert.equal(bucketIdForView(1000), 'from1k');
    assert.equal(bucketIdForView(4999), 'from1k');
    assert.equal(bucketIdForView(5000), 'from5k');
    assert.equal(bucketIdForView(9999), 'from5k');
    assert.equal(bucketIdForView(10000), 'from10k');
    assert.equal(bucketIdForView(16407), 'from10k');
  });

  test('angka view kosong tidak masuk kelompok', () => {
    assert.equal(parseViewCount(''), null);
    assert.equal(parseViewCount(null), null);
    assert.equal(parseViewCount('   '), null);
    assert.equal(parseViewCount('n/a'), null);
    assert.equal(bucketIdForView(''), null);
    assert.equal(parseViewCount(0), 0);
    assert.equal(parseViewCount('16.407'), 16407);
    assert.equal(parseViewCount('5.680'), 5680);
  });
});

describe('agregasi rekap produk per bulan', () => {
  const rows = [
    row('Gantungan Bor', '24/10/2026', 16407, { Link_Postingan: 'https://www.tiktok.com/v/1' }),
    row('Gantungan Bor', '02/10/2026', '', { Link_Postingan: 'https://www.tiktok.com/v/2' }),
    row('Gantungan Bor', '2026-10-09', 999),
    row('Pisau', '01-10-2026', 1000),
    row('Pisau', '15/10/2026', 5000),
    row('Pisau', '20/10/2026', 10000),
    row('Bor Mini', '03/11/2026', 800),
    row('', '04/10/2026', 100),
    row('Tanpa Tanggal', '', 4000),
    { Induk_Barang: 'Hanya Bulan', _month: '2026-10', View: 2500 },
  ];

  test('tanggal dd/MM/yyyy dan ISO masuk bulan yang sama', () => {
    assert.equal(rowYearMonth(row('A', '24/10/2026', 1)), '2026-10');
    assert.equal(rowYearMonth(row('A', '2026-10-24', 1)), '2026-10');
    assert.equal(formatUploadDate(row('A', '24/10/2026', 1)), '24/10/2026');
    assert.equal(formatUploadDate(row('A', '2026-10-09', 1)), '09/10/2026');
    assert.equal(rowYearMonth(row('A', '31/02/2026', 1)), '');
    assert.equal(rowYearMonth(row('A', '10/24/2026', 1)), '');
  });

  test('upload menghitung video tanpa view, rata-rata dan kelompok tidak', () => {
    const report = buildRekapProduk(rows, '2026-10');
    const bor = report.products.find((item) => item.produk === 'Gantungan Bor');
    assert.equal(bor.upload, 3);
    assert.equal(bor.missingViews, 1);
    assert.equal(bor.rated, 2);
    assert.equal(bor.viewSum, 17406);
    assert.equal(bor.average, 8703);
    assert.equal(bor.under1k, 1);
    assert.equal(bor.from1k, 0);
    assert.equal(bor.from5k, 0);
    assert.equal(bor.from10k, 1);

    const pisau = report.products.find((item) => item.produk === 'Pisau');
    assert.equal(pisau.upload, 3);
    assert.equal(pisau.from1k, 1);
    assert.equal(pisau.from5k, 1);
    assert.equal(pisau.from10k, 1);
    assert.equal(pisau.average, 5333);

    assert.equal(report.totals.produkCount, 3);
    assert.equal(report.totals.upload, 7);
    assert.equal(report.totals.missingViews, 1);
    assert.equal(report.totals.rated, 6);
    assert.equal(report.products.some((item) => item.produk === 'Bor Mini'), false);
    assert.equal(report.products.some((item) => item.produk === 'Tanpa Tanggal'), false);
  });

  test('video bulan lain, tanpa tanggal, dan tanpa nama produk tidak ikut', () => {
    const report = buildRekapProduk(rows, '2026-11');
    assert.equal(report.totals.upload, 1);
    assert.equal(report.totals.produkCount, 1);
    assert.equal(report.products[0].produk, 'Bor Mini');
    assert.equal(report.products[0].under1k, 1);
    assert.equal(buildRekapProduk(rows, '2026-12').totals.upload, 0);
    assert.equal(buildRekapProduk(rows, '2026-12').totals.average, null);
  });

  test('pembulatan rata-rata ke bilangan terdekat', () => {
    const report = buildRekapProduk([
      row('A', '01/10/2026', 1000),
      row('A', '02/10/2026', 1001),
    ], '2026-10');
    assert.equal(report.products[0].average, 1001);
    assert.equal(formatIdNumber(5680), '5.680');
    assert.equal(formatIdNumber(1881141), '1.881.141');
    assert.equal(formatIdNumber(null), '—');
  });
});

describe('urut dan saring daftar video', () => {
  const rows = [
    row('Pisau', '01/10/2026', 100),
    row('Pisau', '02/10/2026', 100),
    row('Bor', '03/10/2026', 9000),
    row('Bor', '04/10/2026', ''),
    row('Gagang', '05/10/2026', 12000),
  ];

  test('urutan awal upload menurun, seri diurutkan nama', () => {
    const sorted = sortRekapRows(buildRekapProduk(rows, '2026-10').products, 'upload', 'desc');
    assert.deepEqual(sorted.map((item) => item.produk), ['Bor', 'Pisau', 'Gagang']);
    const ascending = sortRekapRows(sorted, 'upload', 'asc');
    assert.deepEqual(ascending.map((item) => item.produk), ['Gagang', 'Bor', 'Pisau']);
  });

  test('rata-rata kosong selalu di bawah', () => {
    const products = buildRekapProduk([
      row('Kosong', '01/10/2026', ''),
      row('Kecil', '02/10/2026', 10),
      row('Besar', '03/10/2026', 8000),
    ], '2026-10').products;
    assert.deepEqual(sortRekapRows(products, 'average', 'desc').map((item) => item.produk), ['Besar', 'Kecil', 'Kosong']);
    assert.deepEqual(sortRekapRows(products, 'average', 'asc').map((item) => item.produk), ['Kecil', 'Besar', 'Kosong']);
  });

  test('sel upload, kelompok, dan baris total menyaring video yang sesuai', () => {
    const uploadBor = filterRekapVideos(rows, { month: '2026-10', produk: 'Bor', bucket: 'upload' });
    assert.equal(uploadBor.length, 2);
    const above = filterRekapVideos(rows, { month: '2026-10', produk: 'Gagang', bucket: 'from10k' });
    assert.equal(above.length, 1);
    assert.equal(above[0].Induk_Barang, 'Gagang');
    const allUnder = filterRekapVideos(rows, { month: '2026-10', produk: '', bucket: 'under1k' });
    assert.equal(allUnder.length, 2);
    assert.deepEqual(allUnder.map((item) => item.Induk_Barang), ['Pisau', 'Pisau']);
    const missingNotInBucket = filterRekapVideos(rows, { month: '2026-10', produk: 'Bor', bucket: 'from5k' });
    assert.equal(missingNotInBucket.length, 1);
    assert.equal(missingNotInBucket[0].View, 9000);
  });
});

describe('pilihan bulan', () => {
  test('bulan berjalan tetap ada meski belum punya data', () => {
    const now = new Date(2026, 10, 19);
    assert.equal(currentYearMonth(now), '2026-11');
    const choices = rekapMonthChoices([
      row('A', '24/10/2026', 10),
      row('B', '01/09/2026', 10),
      row('C', '', 10),
    ], now);
    assert.deepEqual(choices, ['2026-11', '2026-10', '2026-09']);
  });
});
