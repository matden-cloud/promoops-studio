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

export function mentahanStatusAction(file) {
  const lower = text(file?.status).toLowerCase();
  const dipakai = !lower.includes('belum') && lower.includes('pakai');
  const manual = explicitManualStatus(file);
  const fromKlip = Boolean(file?.inKlip) || manual === false;

  if (!dipakai) {
    return {
      label: 'Belum Dipakai',
      tone: 'belum',
      button: 'Tandai Sudah Dipakai',
      nextStatus: 'Sudah Dipakai',
      fromKlip: false,
    };
  }
  if (fromKlip) {
    return {
      label: 'Sudah Dipakai',
      tone: 'dipakai',
      button: '',
      nextStatus: '',
      fromKlip: true,
    };
  }
  if (manual === true) {
    return {
      label: 'Sudah Dipakai',
      tone: 'dipakai',
      button: 'Tandai Belum Dipakai',
      nextStatus: 'Belum Dipakai',
      fromKlip: false,
    };
  }
  return {
    label: 'Sudah Dipakai',
    tone: 'dipakai',
    button: '',
    nextStatus: '',
    fromKlip: false,
  };
}

export function rawStatusSaveError(message) {
  const value = text(message);
  if (/a(?:ction|ksi)\s+tidak\s+dikenal/i.test(value)) {
    return 'Apps Script belum di-deploy versi baru';
  }
  return value || 'Gagal menyimpan status.';
}
