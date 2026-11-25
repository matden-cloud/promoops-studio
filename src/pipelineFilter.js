import {
  filterBySearch,
  klipSearchFields,
  matchesSearchQuery,
  publishSearchFields,
  rawAssetSearchFields,
} from './search.js';
import { rowYearMonth, uploadIsoDate } from './rekapProduk.js';

export function foldProductText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isYearMonth(value) {
  return /^\d{4}-\d{2}$/.test(String(value || '').trim());
}

export function activeMonth(filters) {
  const month = String(filters?.month || '').trim();
  if (!month || month === 'Semua' || month === 'Tanpa Tanggal') return '';
  return isYearMonth(month) ? month : '';
}

export function pipelineMonth(row) {
  const month = String(row?.month || '').trim();
  return isYearMonth(month) ? month : '';
}

export function shortAccountName(value, accounts = []) {
  const raw = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!raw || raw === '-') return 'Tanpa akun';
  const upper = raw.toUpperCase();
  const found = (accounts || []).find((account) => {
    if (!account || typeof account !== 'object') return false;
    if (String(account.id || '').toUpperCase() === upper) return true;
    if (String(account.label || '').toUpperCase() === upper) return true;
    return String(account.nama || '').toLowerCase() === raw.toLowerCase();
  });
  if (found?.nama) return String(found.nama).replace(/\s+/g, ' ').trim();
  return raw.replace(/^AKN_\d+\s*-\s*/i, '').trim() || raw;
}

function samePerson(left, right) {
  return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
}

function sameId(left, right) {
  return String(left || '').trim().toUpperCase() === String(right || '').trim().toUpperCase();
}

function timValue(filters) {
  const tim = String(filters?.tim || '').trim();
  return tim && tim !== 'Semua' ? tim : '';
}

function produkValue(filters) {
  const produk = String(filters?.produk || '').trim();
  return produk && produk !== 'Semua' ? produk : '';
}

function heldAccountIds(tim, accounts) {
  if (!tim || /^AKN_/i.test(tim)) return [];
  return (accounts || [])
    .filter((account) => samePerson(account?.pemegang, tim))
    .map((account) => String(account?.id || '').toUpperCase())
    .filter(Boolean);
}

export function rawPasses(row, filters) {
  if (!row || typeof row !== 'object') return false;
  const month = activeMonth(filters);
  if (month && pipelineMonth(row) !== month) return false;
  const date = String(filters?.date || '').trim();
  if (date && String(row.date || '') !== date) return false;
  const produk = produkValue(filters);
  if (produk && String(row.produk || '').trim() !== produk) return false;
  const tim = timValue(filters);
  if (tim && !samePerson(row.creator, tim) && !sameId(row.creator, tim)) return false;
  return true;
}

export function klipPasses(row, filters) {
  if (!row || typeof row !== 'object') return false;
  const month = activeMonth(filters);
  if (month && pipelineMonth(row) !== month) return false;
  const date = String(filters?.date || '').trim();
  if (date && String(row.date || '') !== date) return false;
  const produk = produkValue(filters);
  if (produk && String(row.produk || '').trim() !== produk) return false;
  const tim = timValue(filters);
  if (tim && !samePerson(row.editor, tim) && !sameId(row.akunTarget, tim)) return false;
  return true;
}

export function publishPasses(row, filters) {
  if (!row || typeof row !== 'object') return false;
  const month = activeMonth(filters);
  if (month && pipelineMonth(row) !== month) return false;
  const date = String(filters?.date || '').trim();
  if (date && String(row.date || '') !== date) return false;
  const produk = produkValue(filters);
  if (produk && String(row.produk || '').trim() !== produk) return false;
  const tim = timValue(filters);
  if (tim && !samePerson(row.uploader, tim) && !sameId(row.akun, tim)) return false;
  return true;
}

export function viewPasses(row, filters) {
  if (!row || typeof row !== 'object') return false;
  const month = activeMonth(filters);
  if (month && rowYearMonth(row) !== month) return false;
  const date = String(filters?.date || '').trim();
  if (date && uploadIsoDate(row) !== date) return false;
  const produk = produkValue(filters);
  const name = String(row.Induk_Barang || row.produk || '').trim();
  if (produk && name !== produk) return false;
  const tim = timValue(filters);
  if (tim) {
    const id = row.Id_Akun || row.akun || '';
    const akunName = row.Nama_Akun || row.uploader || '';
    const held = heldAccountIds(tim, filters?.accounts);
    const ok = sameId(id, tim)
      || samePerson(akunName, tim)
      || sameId(akunName, tim)
      || held.includes(String(id).toUpperCase());
    if (!ok) return false;
  }
  return true;
}

function kindPasses(kind) {
  if (kind === 'raw') return rawPasses;
  if (kind === 'klip') return klipPasses;
  if (kind === 'publish') return publishPasses;
  return viewPasses;
}

export function selectRows(rows, kind, filters = {}, accountLookup = {}) {
  const passes = kindPasses(kind);
  const list = (rows || []).filter((row) => passes(row, filters));
  const query = String(filters?.query || '').trim();
  if (!query) return list;
  if (kind === 'raw') return filterBySearch(list, query, rawAssetSearchFields);
  if (kind === 'klip') {
    return filterBySearch(list, query, (row) => (
      klipSearchFields(row, accountLookup[String(row.akunTarget || '').toUpperCase()])
    ));
  }
  if (kind === 'publish') {
    return filterBySearch(list, query, (row) => (
      publishSearchFields(row, accountLookup[String(row.akun || '').toUpperCase()] || row.akunLabel)
    ));
  }
  return list.filter((row) => matchesSearchQuery(query, [
    row.Induk_Barang,
    row.produk,
    row.Nama_File,
    row.Nama_Akun,
    row.Id_Akun,
    row.Video_FYP,
  ]));
}

export function resolvePublishList(publishVideos, viewRows) {
  if (Array.isArray(publishVideos) && publishVideos.length > 0) return publishVideos;
  return (viewRows || []).map((row, index) => ({
    id: row?.Id_Klip || index + 1,
    fileName: row?.Nama_File || row?.Induk_Barang || 'Video',
    url: row?.Link_Postingan || '',
    date: row?._isoDate || uploadIsoDate(row),
    month: row?._month || rowYearMonth(row),
    akun: row?.Id_Akun || '',
    akunLabel: row?.Nama_Akun || '',
    uploader: row?.Nama_Akun || row?.Id_Akun || '',
    produk: String(row?.Induk_Barang || row?.produk || '').trim(),
    status: row?.Video_FYP || 'Sukses',
    klipId: row?.Id_Klip || '',
  }));
}
