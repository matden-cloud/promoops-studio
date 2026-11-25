import { shortViolationAkun } from './violationFilters.js';

export const UPLOAD_TARGET_STORAGE_KEY = 'rekapUploadTargets';
export const DEFAULT_VIDEOS_PER_DAY = 3;
export const MAX_VIDEOS_PER_DAY = 999;

const INACTIVE_STATUS = new Set([
  '0',
  'false',
  'no',
  'tidak',
  'nonaktif',
  'non-aktif',
  'tidak aktif',
  'inactive',
  'arsip',
  'off',
  'mati',
]);

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function storageOf(storage) {
  if (storage) return storage;
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

export function normalizePerDay(value) {
  if (typeof value === 'string' && value.trim() === '') return 0;
  const number = typeof value === 'number' ? value : Number(text(value));
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.min(MAX_VIDEOS_PER_DAY, Math.floor(number));
}

export function parseUploadTargets(raw) {
  let parsed = raw;
  if (typeof raw === 'string') {
    if (!raw.trim()) return {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const targets = {};
  for (const [key, value] of Object.entries(parsed)) {
    const id = text(key);
    const perDay = normalizePerDay(value);
    if (!id || perDay == null) continue;
    targets[id] = perDay;
  }
  return targets;
}

export function loadUploadTargets(storage) {
  const store = storageOf(storage);
  if (!store) return {};
  try {
    return parseUploadTargets(store.getItem(UPLOAD_TARGET_STORAGE_KEY));
  } catch {
    return {};
  }
}

export function saveUploadTargets(targets, storage) {
  const store = storageOf(storage);
  if (!store) return;
  try {
    store.setItem(UPLOAD_TARGET_STORAGE_KEY, JSON.stringify(parseUploadTargets(targets)));
  } catch {
    // localStorage penuh atau diblokir: target tetap berlaku di tab ini.
  }
}

export function isActiveMasterAccount(account) {
  if (!account || typeof account !== 'object') return false;
  const raw = account.status ?? account.Status ?? account.aktif ?? account.Aktif ?? account.statusAkun ?? account.Status_Akun ?? account.StatusAkun;
  if (raw == null || text(raw) === '') return true;
  const value = text(raw).toLowerCase();
  if (INACTIVE_STATUS.has(value)) return false;
  if (value.includes('nonaktif') || value.includes('tidak aktif') || value.includes('inactive')) return false;
  return true;
}

export function accountShortName(account) {
  const nama = text(account?.nama || account?.name);
  const fromNama = shortViolationAkun(nama);
  if (fromNama && !/^AKN[_-]?\d+$/i.test(fromNama)) return fromNama;
  const label = text(account?.label);
  const pemegang = text(account?.pemegang);
  const holder = pemegang && label && !label.includes(`(${pemegang})`) ? ` (${pemegang})` : '';
  const composed = label ? `${label}${holder}` : nama;
  return shortViolationAkun(composed) || fromNama || text(account?.id) || 'Akun';
}

export function activeUploadAccounts(accounts) {
  return (Array.isArray(accounts) ? accounts : []).filter((account) => (
    isActiveMasterAccount(account) && text(account?.id)
  ));
}

export function summarizeUploadTarget(accounts, targets) {
  const stored = parseUploadTargets(targets);
  const rows = activeUploadAccounts(accounts).map((account) => {
    const id = text(account.id);
    return {
      id,
      name: accountShortName(account),
      perDay: Object.prototype.hasOwnProperty.call(stored, id) ? stored[id] : DEFAULT_VIDEOS_PER_DAY,
    };
  });
  const total = rows.reduce((sum, row) => sum + row.perDay, 0);
  const count = rows.length;
  return {
    rows,
    total,
    count,
    caption: `Target: ${total}/hari (${count} akun)`,
    shortCaption: `Target ${total}/hr`,
    statHint: `target ${total}/hari`,
  };
}
