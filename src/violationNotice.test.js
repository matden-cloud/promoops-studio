import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  appendNoticeShot,
  applyNoticeFields,
  buildViolationWrite,
  imageFileFromClipboard,
  matchAccount,
  noticeErrorMessage,
  sheetTanggal,
  withViolationFields,
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
      penyebab: 'Klaim sembuh total https://vt.tiktok.com/abc',
      catatan: 'Blur bagian tajam, lalu unggah ulang. https://vt.tiktok.com/abc',
      sanksi: 'Akun ditangguhkan https://vt.tiktok.com/abc',
      status: 'Ditolak',
      linkVideo: 'https://www.tiktok.com/jangan-diisi',
    }, { accounts: ACCOUNTS, types: TYPES });

    assert.equal(applied.form.akun, 'AKN_001 - Jual Kawat (Deni)');
    assert.equal(applied.form.produk, 'Pisau lama');
    assert.equal(applied.form.jenis, 'Klaim Berlebihan / Misleading');
    assert.equal(applied.customJenis, false);
    assert.equal(applied.form.tanggal, '2026-11-20');
    assert.equal(applied.form.penyebab, 'Klaim sembuh total');
    assert.equal(applied.form.catatan, 'Blur bagian tajam, lalu unggah ulang.');
    assert.equal(applied.form.sanksi, 'Akun ditangguhkan');
    assert.equal(applied.form.status, 'Belum Banding');
    assert.equal(applied.form.linkVideo, 'https://www.tiktok.com/sudah-diisi');
    assert.deepEqual(applied.labels, ['akun', 'jenis pelanggaran', 'tanggal', 'penyebab', 'evaluasi / tindakan', 'sanksi']);
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

  test('evaluasi yang sudah diketik tidak ditimpa, sanksi dan strip tetap masuk', () => {
    const kept = applyNoticeFields({ ...BASE, catatan: 'Sudah ditulis tim' }, {
      catatan: 'Usulan baru yang jangan menimpa',
      sanksi: 'Peringatan',
    }, { accounts: ACCOUNTS, types: TYPES });
    assert.equal(kept.form.catatan, 'Sudah ditulis tim');
    assert.equal(kept.filled.catatan, undefined);
    assert.equal(kept.form.sanksi, 'Peringatan');
    assert.deepEqual(kept.labels, ['sanksi']);

    const blank = applyNoticeFields({ ...BASE, catatan: '-' }, {
      catatan: 'Turunkan klaim, lalu unggah ulang videonya.',
    }, { accounts: ACCOUNTS, types: TYPES });
    assert.equal(blank.form.catatan, 'Turunkan klaim, lalu unggah ulang videonya.');
    assert.equal(blank.filled.catatan, true);
  });

  test('simpan pelanggaran selalu mengirim penyebab dan sanksi', () => {
    const data = buildViolationWrite({
      akun: 'AKN_001 - Jual Kawat (Deni)',
      produk: 'Pisau',
      jenis: ' Produk Berbahaya / Tajam ',
      status: '',
      tanggal: '2026-11-20',
      linkVideo: 'https://www.tiktok.com/v/1',
      penyebab: '  Pisau mengarah ke kamera  ',
      sanksi: ' Video dibatasi / tidak masuk FYP ',
      catatan: '',
      screenshots: [{ id: 'ss', url: 'data:image/jpeg;base64,abc' }],
    }, { id: 77, tanggalFallback: '1/1/2020' });

    assert.equal(data.id, 77);
    assert.equal(data.tanggal, '20/11/2026');
    assert.equal(data.jenis, 'Produk Berbahaya / Tajam');
    assert.equal(data.status, 'Belum Banding');
    assert.equal(data.penyebab, 'Pisau mengarah ke kamera');
    assert.equal(data.sanksi, 'Video dibatasi / tidak masuk FYP');
    assert.equal(data.catatan, '-');
    assert.equal(data.screenshots.length, 1);
    assert.equal(Object.hasOwn(data, 'penyebab'), true);
    assert.equal(Object.hasOwn(data, 'sanksi'), true);

    const patched = withViolationFields({
      id: 9,
      akun: 'Toko',
      penyebab: '',
      Penyebab: 'dari kolom sheet',
      sanksi: '',
      Sanksi: 'Poin pelanggaran',
      status: 'Belum Banding',
      screenshots: [{ id: 'lama' }],
    }, { status: 'Menunggu Banding' });
    assert.equal(patched.status, 'Menunggu Banding');
    assert.equal(patched.penyebab, 'dari kolom sheet');
    assert.equal(patched.sanksi, 'Poin pelanggaran');
    assert.equal(patched.screenshots.length, 1);
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
