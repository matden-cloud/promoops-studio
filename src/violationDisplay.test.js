import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  formatViolationDate,
  violationDateToIso,
  violationJenisPills,
  violationPenyebab,
  violationSanksi,
  violationTextBlank,
  violationTextCanExpand,
} from './violationDisplay.js';

describe('tampilan tanggal dan jenis pelanggaran', () => {
  test('tanggal sheet, ISO, dan stempel zona jadi dd/mm/yyyy', () => {
    assert.equal(formatViolationDate('22/11/2026'), '22/11/2026');
    assert.equal(formatViolationDate('5/6/2026'), '05/06/2026');
    assert.equal(formatViolationDate('2026-11-22'), '22/11/2026');
    assert.equal(formatViolationDate('2026-11-11T17:00:00.000Z'), '12/11/2026');
    assert.equal(formatViolationDate('2026-11-11 00:00:00'), '11/11/2026');
    assert.equal(formatViolationDate('2026-02-31'), '');
    assert.equal(formatViolationDate(''), '');
    assert.equal(formatViolationDate('-'), '');
  });

  test('tanggal formulir memakai kalender yang sama dengan tampilan', () => {
    assert.equal(violationDateToIso('2026-11-11T17:00:00.000Z'), '2026-11-12');
    assert.equal(violationDateToIso('22/11/2026'), '2026-11-22');
    assert.equal(violationDateToIso('2026-11-11'), '2026-11-11');
    assert.equal(violationDateToIso('bukan tanggal'), '');
  });

  test('jenis panjang jadi satu pil, baris baru jadi beberapa pil', () => {
    assert.deepEqual(
      violationJenisPills('Produk Berbahaya / Tajam'),
      ['Produk Berbahaya / Tajam'],
    );
    assert.deepEqual(
      violationJenisPills('Pelanggaran Promosi\nProduk yang Tidak Konsisten'),
      ['Pelanggaran Promosi', 'Produk yang Tidak Konsisten'],
    );
    assert.deepEqual(violationJenisPills(['Audio / Musik Hak Cipta', 'Audio / Musik Hak Cipta']), ['Audio / Musik Hak Cipta']);
    assert.deepEqual(violationJenisPills(''), []);
  });

  test('teks panjang boleh dibuka, teks pendek tidak', () => {
    assert.equal(violationTextCanExpand(''), false);
    assert.equal(violationTextCanExpand('-'), false);
    assert.equal(violationTextCanExpand('Klaim medis singkat'), false);
    const long = 'Pelanggaran Promosi Produk yang Tidak Konsisten. Video Anda menampilkan klaim produk yang tidak sesuai dengan barang yang dijual.';
    assert.equal(long.length > 90, true);
    assert.equal(violationTextCanExpand(long), true);
  });

  test('penyebab kosong bila kolom belum ada', () => {
    assert.equal(violationPenyebab({}), '');
    assert.equal(violationPenyebab(null), '');
    assert.equal(violationPenyebab({ penyebab: '-' }), '');
    assert.equal(violationPenyebab({ penyebab: '', Penyebab: 'dari kolom' }), 'dari kolom');
    assert.equal(violationPenyebab({ Penyebab: '  Klaim medis  ' }), 'Klaim medis');
    assert.equal(violationPenyebab({ cause: 'produk tajam' }), 'produk tajam');
    assert.equal(violationSanksi({}), '');
    assert.equal(violationSanksi({ sanksi: '-' }), '');
    assert.equal(violationSanksi({ Sanksi: '  Peringatan  ' }), 'Peringatan');
    assert.equal(violationTextBlank(''), true);
    assert.equal(violationTextBlank('-'), true);
    assert.equal(violationTextBlank('Sudah ditulis tim'), false);
  });
});
