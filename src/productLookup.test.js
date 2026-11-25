import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildRekapProduk } from './rekapProduk.js';
import {
  PROMPT_CHAR_LIMIT,
  buildDashboardAiPack,
  buildProductDetail,
  foldProductText,
  matchProducts,
  monthNamedInQuestion,
  questionProductTokens,
} from './productLookup.js';

const accounts = [
  { id: 'AKN_001', nama: 'Jual Kawat', label: 'AKN_001 - Jual Kawat', pemegang: 'Deni' },
  { id: 'AKN_002', nama: 'Produk Andalan Kita', label: 'AKN_002 - Produk Andalan Kita', pemegang: 'Rizal' },
];

function sources() {
  return {
    accounts,
    rawAssets: [
      { produk: 'Alat Peráta Keramik', month: '2026-11', date: '2026-11-02', status: 'Belum Dipakai', creator: 'Deni' },
      { produk: 'Alat Peráta Keramik', month: '2026-11', date: '2026-11-03', status: 'Dipakai', creator: 'Deni' },
      { produk: 'Alat Peráta Keramik', month: '2026-10', date: '2026-10-03', status: 'Dipakai', creator: 'Deni' },
      { produk: 'Dempul Keramik', month: '2026-11', date: '2026-11-04', status: 'Belum Dipakai', creator: 'Rizal' },
      { produk: 'Gantungan Bor', month: '2026-11', date: '2026-11-04', status: 'Dipakai', creator: 'Rizal' },
    ],
    klipVideos: [
      { produk: 'Alat Peráta Keramik', month: '2026-11', date: '2026-11-05', editor: 'Rizal', akunTarget: 'AKN_002' },
      { produk: 'Alat Peráta Keramik', month: '2026-10', date: '2026-10-09', editor: 'Rizal', akunTarget: 'AKN_002' },
    ],
    publishVideos: [
      { produk: 'Alat Peráta Keramik', month: '2026-11', date: '2026-11-06', akun: 'AKN_002', uploader: 'Rizal' },
      { produk: 'Alat Peráta Keramik', month: '2026-11', date: '2026-11-07', akun: 'AKN_001', uploader: 'Deni' },
      { produk: 'Gantungan Bor', month: '2026-11', date: '2026-11-08', akun: 'AKN_001', uploader: 'Deni' },
    ],
    viewRows: [
      { Induk_Barang: 'Alat Peráta Keramik', _isoDate: '2026-11-06', View: 1200, Video_FYP: 'FYP', Id_Akun: 'AKN_002', Nama_Akun: 'Produk Andalan Kita', Nama_File: 'a.mp4' },
      { Induk_Barang: 'Alat Peráta Keramik', _isoDate: '2026-11-07', View: 800, Video_FYP: 'Belum FYP', Id_Akun: 'AKN_001', Nama_Akun: 'Jual Kawat', Nama_File: 'b.mp4' },
      { Induk_Barang: 'Alat Peráta Keramik', _isoDate: '2026-10-02', View: 50000, Video_FYP: 'FYP Berkelanjutan', Id_Akun: 'AKN_002', Nama_Akun: 'Produk Andalan Kita', Nama_File: 'old.mp4' },
      { Induk_Barang: 'Dempul Keramik', _isoDate: '2026-11-02', View: 300, Video_FYP: 'Belum FYP', Id_Akun: 'AKN_001', Nama_Akun: 'Jual Kawat', Nama_File: 'dempul.mp4' },
    ],
  };
}

describe('pencocokan nama produk', () => {
  test('perata keramik cocok dengan variasi aksen dan kata tambahan', () => {
    const found = matchProducts('perata keramik berapa upload, editan, view', [
      { name: 'Alat Peráta Keramik' },
      { name: 'Dempul Keramik' },
      { name: 'Gantungan Bor' },
    ]);
    assert.deepEqual(found.matches.map((item) => item.name), ['Alat Peráta Keramik']);
    assert.equal(found.miss, false);
    assert.deepEqual(questionProductTokens('perata keramik berapa upload, editan, view'), ['perata', 'keramik']);
  });

  test('pertanyaan umum bukan kegagalan cari produk', () => {
    const found = matchProducts('Rekomendasi Fokus Produk', [{ name: 'Alat Perata Keramik' }]);
    assert.equal(found.matches.length, 0);
    assert.equal(found.miss, false);
  });

  test('nama yang tidak ada menyarankan nama terdekat', () => {
    const found = matchProducts('gantungan besi berapa view', [
      { name: 'Gantungan Bor' },
      { name: 'Kawat Las' },
      { name: 'Dempul Keramik' },
    ]);
    assert.equal(found.miss, true);
    assert.equal(found.closest[0].name, 'Gantungan Bor');
  });

  test('bulan yang disebut pertanyaan jadi YYYY-MM', () => {
    const now = new Date(2026, 10, 25);
    assert.equal(monthNamedInQuestion('berapa upload bulan oktober', now, 2026), '2026-10');
    assert.equal(monthNamedInQuestion('laporan 2025-11', now, 2026), '2025-11');
    assert.equal(monthNamedInQuestion('bulan ini', now, 2026), '2026-11');
  });
});

describe('blok detail dan prompt', () => {
  const now = new Date(2026, 10, 25);

  test('filter bulan menyembunyikan bulan lain dan kelompok view mengikuti rekap', () => {
    const data = sources();
    const detail = buildProductDetail('Alat Peráta Keramik', data, {
      question: 'perata keramik berapa upload, editan, view',
      now,
      filters: { month: '2026-11', date: '', produk: 'Semua', tim: 'Semua' },
      accounts,
    });
    assert.equal(detail.headline.mentahan, 2);
    assert.equal(detail.headline.belum, 1);
    assert.equal(detail.headline.dipakai, 1);
    assert.equal(detail.headline.klip, 1);
    assert.equal(detail.headline.upload, 2);
    assert.equal(detail.headline.viewSum, 2000);
    assert.equal(detail.headline.average, 1000);
    assert.equal(detail.headline.max, 1200);
    assert.equal(detail.headline.fyp, 1);
    const rebuilt = buildRekapProduk(data.viewRows.filter((row) => row.Induk_Barang === 'Alat Peráta Keramik'), '2026-11');
    assert.equal(detail.headline.buckets.under1k, rebuilt.totals.under1k);
    assert.equal(detail.headline.buckets.from1k, rebuilt.totals.from1k);
    assert.equal(detail.headline.buckets.from10k, rebuilt.totals.from10k);
    assert.ok(detail.notes.some((note) => note.includes('menyembunyikan')));
    assert.equal(detail.accounts[0].nama, 'Produk Andalan Kita');
    assert.equal(detail.topVideos[0].view, 1200);
    assert.equal(detail.topVideos[0].date, '06/11/2026');
    assert.ok(detail.months.some((month) => month.month === '2026-10' && month.inScope === false));
  });

  test('bulan di pertanyaan mengalahkan filter layar', () => {
    const detail = buildProductDetail('Alat Peráta Keramik', sources(), {
      question: 'perata keramik bulan oktober berapa view',
      now,
      filters: { month: '2026-11', produk: 'Semua', tim: 'Semua' },
      accounts,
    });
    assert.equal(detail.scopeMonth, '2026-10');
    assert.equal(detail.headline.mentahan, 1);
    assert.equal(detail.headline.klip, 1);
    assert.equal(detail.headline.upload, 0);
    assert.equal(detail.headline.viewSum, 50000);
    assert.equal(detail.headline.buckets.from10k, 1);
    assert.ok(detail.notes.some((note) => note.includes('Oktober') && note.includes('November')));
  });

  test('prompt memuat semua produk, aturan bahasa, dan tetap di bawah batas server', () => {
    const many = Array.from({ length: 800 }, (_, index) => ({
      produk: `Produk ${String(index).padStart(4, '0')} ${'nama-panjang '.repeat(6).trim()}`,
      mentahan: 1,
      videoFinal: 1,
      upload: 800 - index,
    }));
    const pack = buildDashboardAiPack({
      question: 'perata keramik berapa upload, editan, view',
      now,
      filters: { month: 'Semua', produk: 'Semua', tim: 'Semua' },
      accounts,
      aggregatedProducts: [
        ...many,
        { produk: 'Alat Perata Keramik', mentahan: 4, videoFinal: 3, upload: 2 },
      ],
      rawAssets: sources().rawAssets,
      klipVideos: sources().klipVideos,
      publishVideos: sources().publishVideos,
      viewRows: sources().viewRows,
      totals: { mentahan: 9, belum: 2, dipakai: 7, klip: 4, upload: 8 },
    });
    assert.equal(foldProductText(pack.matches[0].name), 'alat perata keramik');
    assert.match(pack.prompt, /Jawab hanya dari data/);
    assert.match(pack.prompt, /bahasa Indonesia/);
    assert.match(pack.prompt, /Alat Perata Keramik/);
    assert.match(pack.prompt, /Total view/);
    assert.ok(pack.omittedProducts > 0);
    assert.match(pack.prompt, /tidak dimuat/);
    assert.ok(pack.prompt.length <= PROMPT_CHAR_LIMIT);
    assert.ok(pack.prompt.length <= 50_000);
    assert.match(pack.fallback, /Upload/);
    assert.match(pack.fallback, /Edit/);
    assert.match(pack.fallback, /View/);
  });

  test('produk yang tidak cocok meminta model menyebut nama terdekat', () => {
    const pack = buildDashboardAiPack({
      question: 'berapa view gantungan besi',
      now,
      filters: { month: 'Semua' },
      accounts,
      ...sources(),
    });
    assert.equal(pack.miss, true);
    assert.match(pack.prompt, /TIDAK ADA PRODUK YANG COCOK/);
    assert.match(pack.prompt, /Gantungan Bor/);
    assert.match(pack.fallback, /tidak ditemukan/);
  });
});
