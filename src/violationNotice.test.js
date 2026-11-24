import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  appendNoticeShot,
  applyNoticeFields,
  imageFileFromClipboard,
  matchAccount,
  noticeErrorMessage,
  sheetTanggal,
} from './violationNotice.js';

const ACCOUNTS = [
  { id: 'AKN_001', nama: 'Jual Kawat', label: 'AKN_001 - Jual Kawat', pemegang: 'Deni' },
  { id: 'AKN_002', nama: 'Produk Andalan Kita', label: 'AKN_002 - Produk Andalan Kita', pemegang: 'Rizal' },
  { id: 'AKN_005', nama: 'Pasar Digitals', label: 'AKN_005 - Pasar Digitals', pemegang: 'Rizal' },
];

const TYPES = [
  'Produk Berbahaya / Tajam',
  'Klaim Berlebihan / Misleading',
  'Audio / Musik Hak Cipta',
  'Produk Tidak Sesuai Keranjang Kuning',
];

const BASE = {
  akun: '',
  produk: 'Pisau lama',
  jenis: '',
  status: 'Belum Banding',
  catatan: '',
  tanggal: '',
  linkVideo: 'https://www.tiktok.com/sudah-diisi',
  screenshots: [{ id: 'lama', label: 'SS Banding', url: 'data:image/jpeg;base64,lama' }],
};

describe('isian screenshot pelanggaran', () => {
  test('mengisi akun, jenis, tanggal, dan catatan tanpa mengubah tautan video', () => {
    const applied = applyNoticeFields(BASE, {
      akun: '@Jual Kawat',
      produk: '',
      jenis: 'klaim berlebihan',
      tanggal: '2026-11-20',
      catatan: 'Klaim sembuh total https://vt.tiktok.com/abc',
      status: 'Ditolak',
      linkVideo: 'https://www.tiktok.com/jangan-diisi',
    }, { accounts: ACCOUNTS, types: TYPES });

    assert.equal(applied.form.akun, 'AKN_001 - Jual Kawat (Deni)');
    assert.equal(applied.form.produk, 'Pisau lama');
    assert.equal(applied.form.jenis, 'Klaim Berlebihan / Misleading');
    assert.equal(applied.customJenis, false);
    assert.equal(applied.form.tanggal, '2026-11-20');
    assert.equal(applied.form.catatan, 'Klaim sembuh total');
    assert.equal(applied.form.status, 'Belum Banding');
    assert.equal(applied.form.linkVideo, 'https://www.tiktok.com/sudah-diisi');
    assert.deepEqual(applied.labels, ['akun', 'jenis pelanggaran', 'tanggal', 'catatan']);
    assert.equal(applied.filled.status, undefined);
    assert.equal(applied.filled.produk, undefined);
  });

  test('akun pemegang yang sama dan jenis yang ambigu tetap mentah', () => {
    const akun = matchAccount('Rizal', ACCOUNTS);
    assert.equal(akun.unmatched, true);
    assert.equal(akun.value, 'Rizal');

    const applied = applyNoticeFields(BASE, {
      akun: 'Toko Baru',
      jenis: 'produk',
      status: 'Banding Diterima',
      tanggal: '2026-02-31',
    }, { accounts: ACCOUNTS, types: TYPES });

    assert.equal(applied.form.akun, 'Toko Baru');
    assert.equal(applied.form.jenis, 'produk');
    assert.equal(applied.customJenis, true);
    assert.equal(applied.form.status, 'Banding Diterima');
    assert.equal(applied.form.tanggal, '');
    assert.equal(applied.filled.tanggal, undefined);
  });

  test('tanggal sheet memakai urutan hari/bulan/tahun', () => {
    assert.equal(sheetTanggal('2026-11-20'), '20/11/2026');
    assert.equal(sheetTanggal('2026-02-31'), '');
    assert.equal(sheetTanggal(''), '');
  });

  test('screenshot bukti ditambahkan sekali dan pesan gagal berbahasa Indonesia', () => {
    const once = appendNoticeShot(BASE, 'data:image/jpeg;base64,baru', 'ss-1');
    assert.equal(once.screenshots.length, 2);
    assert.equal(once.screenshots[1].label, 'SS Teguran');
    assert.equal(appendNoticeShot(once, 'data:image/jpeg;base64,baru', 'ss-2'), once);
    assert.match(noticeErrorMessage({ error: 'missing_api_key' }), /Kunci Gemini belum siap/);
    assert.match(noticeErrorMessage({ error: 'gemini_error', detail: 'HTTP 500' }), /Formulir tetap bisa diisi manual/);
    assert.equal(noticeErrorMessage({ error: 'gemini_error' }).includes('HTTP'), false);
  });

  test('tempel teks biasa tidak dianggap gambar', () => {
    const file = { name: 'ss.png' };
    const image = imageFileFromClipboard({
      clipboardData: {
        items: [
          { kind: 'string', type: 'text/plain', getAsFile: () => file },
          { kind: 'file', type: 'image/png', getAsFile: () => file },
        ],
      },
    });
    assert.equal(image, file);
    assert.equal(imageFileFromClipboard({
      clipboardData: { items: [{ kind: 'string', type: 'text/plain' }] },
    }), null);
  });
});
