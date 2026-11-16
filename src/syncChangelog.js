import { SYNC_DETAIL_LIMIT } from '../server/onedrive-plan.js';

export const SYNC_CHANGELOG_KEY = 'promoops.sinkronBot.changelog';

function text(value) {
  if (value == null) return '';
  return String(value);
}

function count(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.floor(number);
}

function takeBaru(item) {
  if (!item || typeof item !== 'object') return null;
  return { nama: text(item.nama), path: text(item.path) };
}

function takeDiubah(item) {
  if (!item || typeof item !== 'object') return null;
  return {
    namaLama: text(item.namaLama),
    pathLama: text(item.pathLama),
    namaBaru: text(item.namaBaru),
    pathBaru: text(item.pathBaru),
  };
}

function takeList(value, mapItem) {
  if (!Array.isArray(value)) return [];
  const list = [];
  for (const item of value) {
    if (list.length >= SYNC_DETAIL_LIMIT) break;
    const next = mapItem(item);
    if (next) list.push(next);
  }
  return list;
}

export function createSyncLog({ targetId, targetLabel, startedAt }) {
  return {
    targetId: text(targetId),
    targetLabel: text(targetLabel),
    startedAt: text(startedAt),
    daftarBaru: [],
    daftarDiubah: [],
    totalBaru: 0,
    totalDiubah: 0,
  };
}

export function changelogForRun(current, { continued, targetId, targetLabel, startedAt }) {
  if (continued && current && current.targetId === targetId) return current;
  return createSyncLog({ targetId, targetLabel, startedAt });
}

export function appendSyncDetails(log, stats) {
  const daftarBaru = log.daftarBaru.slice();
  const daftarDiubah = log.daftarDiubah.slice();
  for (const item of Array.isArray(stats?.daftarBaru) ? stats.daftarBaru : []) {
    if (daftarBaru.length >= SYNC_DETAIL_LIMIT) break;
    const next = takeBaru(item);
    if (next) daftarBaru.push(next);
  }
  for (const item of Array.isArray(stats?.daftarDiubah) ? stats.daftarDiubah : []) {
    if (daftarDiubah.length >= SYNC_DETAIL_LIMIT) break;
    const next = takeDiubah(item);
    if (next) daftarDiubah.push(next);
  }
  return {
    ...log,
    daftarBaru,
    daftarDiubah,
    totalBaru: stats && Object.hasOwn(stats, 'baru') ? count(stats.baru) : log.totalBaru,
    totalDiubah: stats && Object.hasOwn(stats, 'diperbarui') ? count(stats.diperbarui) : log.totalDiubah,
  };
}

export function statsForRequest(stats) {
  if (!stats || typeof stats !== 'object') return null;
  return {
    baru: count(stats.baru),
    diperbarui: count(stats.diperbarui),
    dilewati: count(stats.dilewati),
    kembar: Array.isArray(stats.kembar) ? stats.kembar.filter((name) => typeof name === 'string') : [],
  };
}

function sanitizeLog(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (typeof value.targetId !== 'string' || typeof value.startedAt !== 'string' || !value.startedAt) return null;
  return {
    targetId: value.targetId,
    targetLabel: text(value.targetLabel),
    startedAt: value.startedAt,
    daftarBaru: takeList(value.daftarBaru, takeBaru),
    daftarDiubah: takeList(value.daftarDiubah, takeDiubah),
    totalBaru: count(value.totalBaru),
    totalDiubah: count(value.totalDiubah),
  };
}

export function readSyncChangelog(storage) {
  try {
    const raw = storage.getItem(SYNC_CHANGELOG_KEY);
    if (!raw) return null;
    return sanitizeLog(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeSyncChangelog(storage, log) {
  try {
    if (!log) storage.removeItem(SYNC_CHANGELOG_KEY);
    else storage.setItem(SYNC_CHANGELOG_KEY, JSON.stringify(sanitizeLog(log) || log));
  } catch {
    // localStorage penuh atau diblokir: daftar tetap tampil di memori tab ini.
  }
}
