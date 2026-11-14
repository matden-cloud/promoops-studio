import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  dateSearchLabels,
  fileListSearchFields,
  filterBySearch,
  fypRowSearchFields,
  klipSearchFields,
  matchesSearchQuery,
  publishSearchFields,
  rawAssetSearchFields,
} from './search.js';

const raw = {
  fileName: 'VID_Kawat_01.mp4',
  produk: 'Kawat Harmonika',
  creator: 'Deni',
  date: '2026-03-12',
  month: '2026-03',
  status: 'Belum Dipakai',
  url: 'https://onedrive.live.com/kawat',
  linkHp: 'https://vt.tiktok.com/ZSabcd/',
};

const klip = {
  fileName: 'KLIP_Pisau_Final.mp4',
  produk: 'Pisau Mesin',
  editor: 'Rizal',
  akunTarget: 'AKN_002',
  date: '2026-04-02',
  month: '2026-04',
  url: 'https://onedrive.live.com/pisau',
};

const publish = {
  fileName: 'UPLOAD_Grosir.mp4',
  produk: 'Grosir Hitam',
  uploader: 'Isan',
  akun: 'AKN_003',
  date: '2026-05-09',
  month: '2026-05',
  status: 'Mega FYP',
  url: 'https://www.tiktok.com/@toko/video/123',
};

const fyp = {
  Nama_File: 'FYP_Kawat.mp4',
  Induk_Barang: 'Kawat Harmonika',
  Nama_Akun: 'Jual Kawat',
  Id_Akun: 'AKN_001',
  Tanggal_Upload: '2026-03-12',
  _isoDate: '2026-03-12',
  _month: '2026-03',
  Video_FYP: 'Super Viral',
  Link_Postingan: 'https://www.tiktok.com/@jual/video/999',
  View: '15000',
  Id_Klip: 'KLIP-9',
};

describe('matchesSearchQuery', () => {
  test('query kosong atau spasi menampilkan semua baris', () => {
    assert.equal(matchesSearchQuery('', ['apa saja']), true);
    assert.equal(matchesSearchQuery('   ', ['apa saja']), true);
    assert.equal(matchesSearchQuery(null, []), true);
  });

  test('tidak peka huruf besar/kecil', () => {
    assert.equal(matchesSearchQuery('KAWAT', rawAssetSearchFields(raw)), true);
    assert.equal(matchesSearchQuery('deni', rawAssetSearchFields(raw)), true);
    assert.equal(matchesSearchQuery('SuPeR vIrAl', fypRowSearchFields(fyp)), true);
  });

  test('mencocokkan nama file, produk, akun, uploader, tanggal, status, dan link', () => {
    const rawFields = rawAssetSearchFields(raw);
    assert.equal(matchesSearchQuery('vid_kawat_01', rawFields), true);
    assert.equal(matchesSearchQuery('harmonika', rawFields), true);
    assert.equal(matchesSearchQuery('deni', rawFields), true);
    assert.equal(matchesSearchQuery('2026-03-12', rawFields), true);
    assert.equal(matchesSearchQuery('12/03/2026', rawFields), true);
    assert.equal(matchesSearchQuery('maret 2026', rawFields), true);
    assert.equal(matchesSearchQuery('belum dipakai', rawFields), true);
    assert.equal(matchesSearchQuery('onedrive.live.com/kawat', rawFields), true);
    assert.equal(matchesSearchQuery('zsabcd', rawFields), true);

    const klipFields = klipSearchFields(klip, 'AKN_002 - Produk Andalan Kita');
    assert.equal(matchesSearchQuery('klip_pisau', klipFields), true);
    assert.equal(matchesSearchQuery('rizal', klipFields), true);
    assert.equal(matchesSearchQuery('produk andalan', klipFields), true);
    assert.equal(matchesSearchQuery('selesai edit', klipFields), true);
    assert.equal(matchesSearchQuery('april 2026', klipFields), true);

    const publishFields = publishSearchFields(publish, 'AKN_003 - Grosir Hitam');
    assert.equal(matchesSearchQuery('isan', publishFields), true);
    assert.equal(matchesSearchQuery('akn_003', publishFields), true);
    assert.equal(matchesSearchQuery('mega fyp', publishFields), true);
    assert.equal(matchesSearchQuery('tiktok.com/@toko', publishFields), true);
    assert.equal(matchesSearchQuery('09/05/2026', publishFields), true);

    const fypFields = fypRowSearchFields(fyp, ['AKN_001 - Jual Kawat', 'Maret 2026']);
    assert.equal(matchesSearchQuery('fyp_kawat', fypFields), true);
    assert.equal(matchesSearchQuery('jual kawat', fypFields), true);
    assert.equal(matchesSearchQuery('super viral', fypFields), true);
    assert.equal(matchesSearchQuery('tiktok.com/@jual', fypFields), true);
    assert.equal(matchesSearchQuery(Number(fyp.View).toLocaleString('id-ID'), fypFields), true);

    const fileFields = fileListSearchFields({
      name: 'VID_Kawat_01.mp4 (Kawat Harmonika)',
      produk: 'Kawat Harmonika',
      owner: 'Deni • AKN_001 - Jual Kawat',
      status: 'Belum Dipakai',
      url: 'https://onedrive.live.com/kawat',
      linkHp: 'https://vt.tiktok.com/ZSabcd/',
      date: '2026-03-12',
    });
    assert.equal(matchesSearchQuery('jual kawat', fileFields), true);
    assert.equal(matchesSearchQuery('12 maret 2026', fileFields), true);
  });

  test('kata di kolom berbeda ikut ketemu, urutan kata tidak harus sama', () => {
    assert.equal(matchesSearchQuery('deni harmonika', rawAssetSearchFields(raw)), true);
    assert.equal(matchesSearchQuery('harmonika deni', rawAssetSearchFields(raw)), true);
  });

  test('baris yang tidak memuat kata ditolak, dan field kosong tidak melempar error', () => {
    assert.equal(matchesSearchQuery('pisau', rawAssetSearchFields(raw)), false);
    assert.equal(matchesSearchQuery('kawat', rawAssetSearchFields(null)), false);
    assert.equal(matchesSearchQuery('kawat', klipSearchFields(undefined, '')), false);
    assert.equal(matchesSearchQuery('x', publishSearchFields(null)), false);
    assert.equal(matchesSearchQuery('x', fypRowSearchFields(null)), false);
    assert.equal(matchesSearchQuery('x', fileListSearchFields(null)), false);
    assert.equal(matchesSearchQuery('kawat', []), false);
  });

  test('label tanggal iso, garis miring, dan nama bulan', () => {
    assert.deepEqual(dateSearchLabels('2026-03-12'), [
      '2026-03-12',
      '12/03/2026',
      'Maret 2026',
      '12 Maret 2026',
    ]);
    assert.deepEqual(dateSearchLabels('2026-03'), [
      '2026-03',
      '03/2026',
      'Maret 2026',
    ]);
    assert.ok(dateSearchLabels('').length === 0);
    assert.ok(dateSearchLabels(null).length === 0);
  });
});

describe('filterBySearch', () => {
  const rows = [
    { id: 1, produk: 'Kawat Harmonika', creator: 'Deni', starred: true },
    { id: 2, produk: 'Pisau Mesin', creator: 'Rizal', starred: true },
    { id: 3, produk: 'Kawat Harmonika', creator: 'Isan', starred: false },
  ];
  const fieldsOf = (row) => [row.produk, row.creator];

  test('query kosong tidak mempersempit dan tidak menyalin array', () => {
    assert.equal(filterBySearch(rows, '', fieldsOf), rows);
    assert.equal(filterBySearch(rows, '   ', fieldsOf), rows);
  });

  test('search hanya mempersempit hasil filter yang sudah ada', () => {
    const hanyaBintang = rows.filter((row) => row.starred);
    const narrowed = filterBySearch(hanyaBintang, 'kawat', fieldsOf);

    assert.deepEqual(narrowed.map((row) => row.id), [1]);
    assert.equal(hanyaBintang.length, 2);
    assert.ok(narrowed.every((row) => hanyaBintang.includes(row)));
    assert.deepEqual(rows.map((row) => row.id), [1, 2, 3]);
  });

  test('input non-array ditolak tanpa melempar error', () => {
    assert.deepEqual(filterBySearch(null, 'kawat', fieldsOf), []);
    assert.deepEqual(filterBySearch(rows, 'kawat', null), []);
  });
});
