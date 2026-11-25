import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  UPLOAD_TARGET_STORAGE_KEY,
  accountShortName,
  isActiveMasterAccount,
  loadUploadTargets,
  normalizePerDay,
  saveUploadTargets,
  summarizeUploadTarget,
} from './uploadTarget.js';

const ACCOUNTS = [
  { id: 'AKN_001', nama: 'Jual Kawat', label: 'AKN_001 - Jual Kawat', pemegang: 'Deni' },
  { id: 'AKN_002', nama: 'Produk Andalan Kita', label: 'AKN_002 - Produk Andalan Kita (Rizal)', pemegang: 'Rizal' },
  { id: 'AKN_003', label: 'AKN_003 – Grosir Hitam (Isan)', pemegang: 'Isan' },
  { id: 'AKN_004', nama: 'Melifarida Toserba', label: 'AKN_004 - Melifarida Toserba' },
  { id: 'AKN_005', nama: 'Pasar Digitals', label: 'AKN_005 - Pasar Digitals', pemegang: 'Rizal' },
  { id: 'AKN_006', nama: 'Hasil Seleksi', label: 'AKN_006 - Hasil Seleksi' },
  { id: 'AKN_007', nama: 'Toko Tutup', label: 'AKN_007 - Toko Tutup', status: 'Nonaktif' },
];

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    dump: data,
  };
}

describe('target upload per akun', () => {
  test('nama pendek membuang kode AKN dan nama pemegang', () => {
    assert.equal(accountShortName(ACCOUNTS[0]), 'Jual Kawat');
    assert.equal(accountShortName(ACCOUNTS[1]), 'Produk Andalan Kita');
    assert.equal(accountShortName(ACCOUNTS[2]), 'Grosir Hitam');
    assert.equal(accountShortName({ id: 'AKN_009', label: 'Akun 9 - Toko Baru (Meli)' }), 'Toko Baru');
  });

  test('akun nonaktif tidak masuk target, bawaan 3 per akun aktif', () => {
    assert.equal(isActiveMasterAccount(ACCOUNTS[0]), true);
    assert.equal(isActiveMasterAccount(ACCOUNTS[6]), false);
    assert.equal(isActiveMasterAccount({ id: 'AKN_008', aktif: 'tidak aktif' }), false);
    const plan = summarizeUploadTarget(ACCOUNTS, {});
    assert.equal(plan.count, 6);
    assert.equal(plan.total, 18);
    assert.equal(plan.caption, 'Target: 18/hari (6 akun)');
    assert.equal(plan.shortCaption, 'Target 18/hr');
    assert.equal(plan.statHint, 'target 18/hari');
    assert.deepEqual(plan.rows.map((row) => row.name), [
      'Jual Kawat',
      'Produk Andalan Kita',
      'Grosir Hitam',
      'Melifarida Toserba',
      'Pasar Digitals',
      'Hasil Seleksi',
    ]);
  });

  test('angka tersimpan menimpa bawaan dan 0 diizinkan', () => {
    const storage = memoryStorage();
    saveUploadTargets({ AKN_001: 0, AKN_002: '5', AKN_003: -1, AKN_004: 3.9 }, storage);
    const loaded = loadUploadTargets(storage);
    assert.deepEqual(loaded, { AKN_001: 0, AKN_002: 5, AKN_004: 3 });
    assert.equal(storage.dump[UPLOAD_TARGET_STORAGE_KEY].includes('AKN_003'), false);
    const plan = summarizeUploadTarget(ACCOUNTS, loaded);
    assert.equal(plan.rows[0].perDay, 0);
    assert.equal(plan.rows[1].perDay, 5);
    assert.equal(plan.rows[2].perDay, 3);
    assert.equal(plan.total, 0 + 5 + 3 + 3 + 3 + 3);
    assert.equal(plan.caption, 'Target: 17/hari (6 akun)');
  });

  test('input kosong menjadi 0, teks ditolak', () => {
    assert.equal(normalizePerDay(''), 0);
    assert.equal(normalizePerDay('2'), 2);
    assert.equal(normalizePerDay('abc'), null);
    assert.equal(normalizePerDay(1000), 999);
  });
});
