const KLIP_RAW_KEYS = ['Raw_Asset_Id', 'rawAssetId', 'Id_Raw', 'idRaw', 'rawId'];

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function rawFileIdentity(row) {
  return {
    idFile: text(row?.Id_File || row?.idFile || row?.fileId),
    rawAssetId: text(row?.Raw_Asset_Id || row?.rawAssetId || row?.idRaw || row?.Id_Raw || row?.rawId || row?.id),
    namaFile: text(row?.Nama_File || row?.fileName || row?.namaFile),
  };
}

export function explicitManualStatus(row) {
  const flag = row?.statusManual;
  if (flag === true || flag === 'true' || flag === 1 || flag === '1') return true;
  if (flag === false || flag === 'false' || flag === 0 || flag === '0') return false;
  const source = text(row?.statusSource || row?.status_source).toLowerCase();
  if (source === 'manual' || source === 'status_file') return true;
  if (source === 'klip' || source === 'klip_vidio_raw') return false;
  return null;
}

export function collectKlipRawUsage(klipVideos) {
  const ids = new Set();
  let detectable = false;
  for (const klip of klipVideos || []) {
    if (!klip || typeof klip !== 'object') continue;
    for (const key of KLIP_RAW_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(klip, key)) continue;
      detectable = true;
      const value = text(klip[key]);
      if (value) ids.add(value);
    }
  }
  return { ids, detectable };
}

export function rawFileMeta(row, idx, usage) {
  const identity = rawFileIdentity(row);
  const manual = explicitManualStatus(row);
  const linkedByKlip = Boolean(identity.rawAssetId && usage?.ids?.has(identity.rawAssetId));
  return {
    fileKey: `RAW__${text(row?.id) || text(row?.fileName) || idx}`,
    idFile: identity.idFile,
    rawAssetId: identity.rawAssetId,
    namaFile: identity.namaFile,
    statusManual: row?.statusManual,
    statusSource: row?.statusSource || row?.status_source || '',
    inKlip: linkedByKlip || manual === false,
  };
}

export function isMentahanFile(file) {
  return String(file?.kategori || '').includes('Mentahan') || String(file?.fileKey || '').startsWith('RAW__');
}

export function fileStatusPayload(file, status) {
  return {
    Id_File: text(file?.idFile),
    Raw_Asset_Id: text(file?.rawAssetId),
    Nama_File: text(file?.namaFile),
    status,
  };
}

export function rawRowMatchesFile(row, file) {
  const identity = rawFileIdentity(row);
  const idFile = text(file?.idFile);
  const rawAssetId = text(file?.rawAssetId);
  const namaFile = text(file?.namaFile);
  if (idFile && identity.idFile && idFile === identity.idFile) return true;
  if (rawAssetId && identity.rawAssetId && rawAssetId === identity.rawAssetId) return true;
  if (!idFile && !rawAssetId && namaFile && identity.namaFile === namaFile) return true;
  return false;
}

function listedStatusPatch(file, status) {
  const inKlip = file?.inKlip === true;
  return {
    status,
    statusManual: inKlip ? false : status === 'Sudah Dipakai',
    statusSource: inKlip ? 'klip' : 'manual',
  };
}

export function withRawStatus(rows, file, status) {
  const patch = listedStatusPatch(file, status);
  return (Array.isArray(rows) ? rows : []).map((row) => (
    rawRowMatchesFile(row, file) ? { ...row, ...patch } : row
  ));
}

export function withListedFileStatus(items, file, status) {
  const patch = listedStatusPatch(file, status);
  return (Array.isArray(items) ? items : []).map((item) => (
    item?.fileKey === file?.fileKey || rawRowMatchesFile(item, file) ? { ...item, ...patch } : item
  ));
}

const REVERT_HINT = 'Kembali ke Belum Dipakai hanya bertahan untuk file yang tidak tercantum di Klip_Vidio_RAW.';
const KLIP_HINT = 'Status mengikuti Klip_Vidio_RAW. Tombol Belum Dipakai tidak mengubah file yang sudah masuk klip.';

export function mentahanStatusAction(file, usage) {
  const status = text(file?.status);
  const lower = status.toLowerCase();
  const belum = lower.includes('belum');
  const dipakai = !belum && lower.includes('pakai');
  const manual = explicitManualStatus(file);
  const detectable = Boolean(usage?.detectable) || manual !== null || file?.inKlip === true;
  const inKlip = file?.inKlip === true || manual === false;

  if (dipakai && inKlip) {
    return { canMarkUsed: false, canRevert: false, hint: KLIP_HINT, locked: true };
  }
  if (!dipakai) {
    return { canMarkUsed: true, canRevert: false, hint: REVERT_HINT, locked: false };
  }
  const canRevert = manual === true || (detectable && !inKlip) || !detectable;
  return { canMarkUsed: false, canRevert, hint: REVERT_HINT, locked: !canRevert };
}
