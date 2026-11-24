// Logika murni sinkron OneDrive → FILE_ASSET.
// Tidak mengimpor modul Node supaya aman dipakai dari kode server maupun UI.

export const ONEDRIVE_AUTHORITY = 'https://login.microsoftonline.com/common';
export const ONEDRIVE_DEVICE_CODE_URL = `${ONEDRIVE_AUTHORITY}/oauth2/v2.0/devicecode`;
export const ONEDRIVE_TOKEN_URL = `${ONEDRIVE_AUTHORITY}/oauth2/v2.0/token`;

// Setara dengan scope MSAL script Python (Files.ReadWrite.All + offline_access).
// Endpoint v2 butuh URI Microsoft Graph yang lengkap.
export const ONEDRIVE_SCOPE = 'https://graph.microsoft.com/Files.ReadWrite.All offline_access';

export const ONEDRIVE_TARGETS = {
  final: {
    id: 'final',
    button: 'Sinkron Video Final',
    label: 'Video Final',
    path: 'Baru/PROJECT TIKTOK/Project Baru/Video Final',
  },
  mentahan: {
    id: 'mentahan',
    button: 'Sinkron Mentahan',
    label: 'Mentahan',
    path: 'Baru/PROJECT TIKTOK/Project Baru/Mentahan Video',
  },
};

export const FILE_ASSET_COLUMNS = Object.freeze([
  'Id_File',
  'Id_Klip',
  'Nama_File',
  'Jenis_File',
  'Versi',
  'Storage',
  'Link_File',
  'Link_HP',
  'Link_Folder',
  'Path_Folder',
  'Cloud_File_ID',
  'Format_File',
  'Ukuran_MB',
  'Tanggal_File',
  'Status_File',
  'File_Utama',
  'Catatan',
]);

const VIDEO_EXT = new Set(['mp4', 'mov', 'avi', 'mkv']);
const AUDIO_EXT = new Set(['mp3', 'wav']);
const IMAGE_EXT = new Set(['jpg', 'png', 'jpeg']);
const SHARE_JENIS = new Set(['Video', 'Audio', 'Gambar']);

export function encodeDrivePath(folderPath) {
  return String(folderPath || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function rootGraphUrl(folderPath) {
  return `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeDrivePath(folderPath)}`;
}

export function childrenGraphUrl(itemId) {
  const params = new URLSearchParams({
    $select: 'id,name,size,webUrl,file,folder,parentReference,lastModifiedDateTime',
    $top: '40',
  });
  return `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(itemId)}/children?${params}`;
}

export function createLinkGraphUrl(itemId) {
  return `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(itemId)}/createLink`;
}

export function itemMetaGraphUrl(itemId) {
  const url = new URL(`https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(itemId)}`);
  url.searchParams.set('$select', 'id,@microsoft.graph.downloadUrl');
  return url.toString();
}

export function itemContentGraphUrl(itemId) {
  return `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(itemId)}/content`;
}

const PLAYBACK_HOSTS = [
  '1drv.com',
  'onedrive.live.com',
  'sharepoint.com',
  'sharepoint.de',
  'sharepoint.cn',
  'sharepoint.us',
  'microsoftpersonalcontent.com',
  'svc.ms',
];

export function isAllowedPlaybackUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  if (url.port && url.port !== '443') return false;
  const host = url.hostname.toLowerCase();
  return PLAYBACK_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export function isAllowedItemContentUrl(value) {
  const url = graphUrlParts(value);
  if (!url) return false;
  return /^\/v1\.0\/me\/drive\/items\/[^/]+\/content$/.test(url.pathname);
}

export function isItemId(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 500) return false;
  if (/[/\\?#]/.test(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return false;
  }
  return true;
}

export function safeHttpsUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:') return '';
    if (url.username || url.password) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function graphUrlParts(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'graph.microsoft.com') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '443') return null;
  return url;
}

function isChildrenPath(path) {
  return /^\/v1\.0\/me\/drive\/items\/[^/]+\/children$/.test(path)
    || /^\/v1\.0\/me\/drive\/items\([^/]+\)\/children$/.test(path)
    || /^\/v1\.0\/me\/drive\/root\/children$/.test(path)
    || /^\/v1\.0\/me\/drive\/root:\/.+?:\/children$/.test(path)
    || /^\/v1\.0\/drives\/[^/]+\/items\/[^/]+\/children$/.test(path)
    || /^\/v1\.0\/drives\/[^/]+\/items\([^/]+\)\/children$/.test(path);
}

export function isAllowedGraphRead(value) {
  const url = graphUrlParts(value);
  if (!url) return false;
  const path = url.pathname;
  if (path.includes('/content') || path.includes('/createUploadSession') || path.includes('/thumbnails')) {
    return false;
  }
  if (isChildrenPath(path)) return true;
  if (/^\/v1\.0\/me\/drive\/root:\/.+/.test(path)) return true;
  if (/^\/v1\.0\/me\/drive\/items\/[^/]+$/.test(path)) return true;
  return false;
}

export function isAllowedChildrenUrl(value) {
  const url = graphUrlParts(value);
  if (!url) return false;
  if (url.pathname.includes('/content')) return false;
  return isChildrenPath(url.pathname);
}

export function isAllowedCreateLink(value) {
  const url = graphUrlParts(value);
  if (!url) return false;
  return /^\/v1\.0\/me\/drive\/items\/[^/]+\/createLink$/.test(url.pathname);
}

export function oneDrivePathFolder(parentPath) {
  const raw = String(parentPath || '');
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  return decoded.replaceAll('/drive/root:', 'OneDrive');
}

export function classifyFile(name) {
  const nama = String(name || '');
  const format = nama.includes('.') ? nama.split('.').pop().toLowerCase() : '';
  let jenis = 'Dokumen';
  if (VIDEO_EXT.has(format)) jenis = 'Video';
  else if (AUDIO_EXT.has(format)) jenis = 'Audio';
  else if (IMAGE_EXT.has(format)) jenis = 'Gambar';
  return { format, jenis };
}

export function ukuranMb(size) {
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

export function indexAssets(rows) {
  const byId = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = String(row?.idFile ?? row?.Id_File ?? '').trim();
    if (!id) continue;
    const namaFile = row?.namaFile == null ? String(row?.Nama_File ?? '') : String(row.namaFile);
    const pathFolder = row?.pathFolder == null ? String(row?.Path_Folder ?? '') : String(row.pathFolder);
    byId.set(id, { namaFile, pathFolder });
  }
  const seenNames = new Set();
  for (const row of byId.values()) {
    const key = row.namaFile.trim().toLowerCase();
    if (key) seenNames.add(key);
  }
  return { byId, seenNames };
}

export function planDriveItem(item, folderLink, byId) {
  const id = String(item?.id || '').trim();
  if (!isItemId(id)) return { action: 'ignore' };
  if (item?.folder) {
    return {
      action: 'folder',
      id,
      link: safeHttpsUrl(item.webUrl || '') || safeHttpsUrl(folderLink || ''),
    };
  }
  if (!item?.file) return { action: 'ignore' };

  const nama = item.name == null ? '' : String(item.name);
  const pathFolder = oneDrivePathFolder(item.parentReference?.path || '');
  const linkFile = safeHttpsUrl(item.webUrl || '');
  const linkFolder = safeHttpsUrl(folderLink || '');
  const existing = byId.get(id);

  if (existing) {
    if (existing.namaFile !== nama || existing.pathFolder !== pathFolder) {
      return {
        action: 'update',
        update: {
          idFile: id,
          namaFile: nama,
          pathFolder,
          linkFolder,
        },
      };
    }
    return { action: 'skip' };
  }

  const { format, jenis } = classifyFile(nama);
  const row = {
    Id_File: id,
    Id_Klip: id,
    Nama_File: nama,
    Jenis_File: jenis,
    Versi: '',
    Storage: 'OneDrive',
    Link_File: linkFile,
    Link_HP: linkFile,
    Link_Folder: linkFolder,
    Path_Folder: pathFolder,
    Cloud_File_ID: id,
    Format_File: format,
    Ukuran_MB: ukuranMb(item.size),
    Tanggal_File: String(item.lastModifiedDateTime || '').slice(0, 10),
    Status_File: '',
    File_Utama: '',
    Catatan: '',
  };

  return {
    action: 'insert',
    row,
    jenis,
    nama,
    share: SHARE_JENIS.has(jenis),
  };
}

export const SYNC_DETAIL_LIMIT = 500;

export function emptyStats() {
  return {
    baru: 0,
    diperbarui: 0,
    dilewati: 0,
    kembar: [],
    daftarBaru: [],
    daftarDiubah: [],
  };
}

export function pushSyncDetail(list, entry) {
  if (!Array.isArray(list) || list.length >= SYNC_DETAIL_LIMIT) return false;
  list.push(entry);
  return true;
}

export function normalizeStats(value) {
  const stats = emptyStats();
  // Daftar file hanya milik batch ini. Jangan salin dari permintaan,
  // supaya klien yang menumpuk antar batch tidak menerima salinan dobel.
  // Total tetap di baru dan diperbarui, juga setelah daftar mencapai batas.
  if (!value || typeof value !== 'object' || Array.isArray(value)) return stats;
  stats.baru = clampCount(value.baru);
  stats.diperbarui = clampCount(value.diperbarui);
  stats.dilewati = clampCount(value.dilewati);
  if (!Array.isArray(value.kembar)) return stats;
  const seen = new Set();
  for (const name of value.kembar) {
    if (typeof name !== 'string') continue;
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 300 || seen.has(name)) continue;
    seen.add(name);
    stats.kembar.push(name);
    if (stats.kembar.length >= 500) break;
  }
  return stats;
}

function clampCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(Math.floor(number), 1_000_000);
}

export function targetById(value) {
  if (typeof value !== 'string') return null;
  return ONEDRIVE_TARGETS[value] || null;
}

const VERIFY_HOSTS = new Set(['microsoft.com', 'www.microsoft.com', 'login.microsoft.com']);

export function safeVerificationUri(value) {
  const fallback = 'https://microsoft.com/devicelogin';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return fallback;
    if (!VERIFY_HOSTS.has(url.hostname)) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

export function parseCursor(value, target) {
  if (value == null) return { cursor: null };
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'Kursor sinkron tidak valid.' };
  }
  if (value.target && value.target !== target) {
    return { error: 'Kursor tidak sesuai folder yang diminta.' };
  }

  const queue = [];
  if (value.queue != null && !Array.isArray(value.queue)) {
    return { error: 'Kursor sinkron tidak valid.' };
  }
  for (const item of value.queue || []) {
    if (!item || typeof item !== 'object' || !isItemId(item.id)) {
      return { error: 'Kursor sinkron tidak valid.' };
    }
    queue.push({ id: item.id, link: safeHttpsUrl(item.link || '') });
    if (queue.length > 5000) return { error: 'Antrean folder terlalu besar.' };
  }

  let pageUrl = null;
  if (value.pageUrl != null && value.pageUrl !== '') {
    if (typeof value.pageUrl !== 'string' || !isAllowedChildrenUrl(value.pageUrl)) {
      return { error: 'Kursor sinkron tidak valid.' };
    }
    pageUrl = value.pageUrl;
  }

  let skip = 0;
  if (value.skip != null) {
    skip = Number(value.skip);
    if (!Number.isInteger(skip) || skip < 0 || skip > 100000) {
      return { error: 'Kursor sinkron tidak valid.' };
    }
  }

  const visited = [];
  if (value.visited != null && !Array.isArray(value.visited)) {
    return { error: 'Kursor sinkron tidak valid.' };
  }
  for (const id of value.visited || []) {
    if (!isItemId(id)) return { error: 'Kursor sinkron tidak valid.' };
    visited.push(id);
    if (visited.length > 5000) return { error: 'Kursor sinkron tidak valid.' };
  }

  return {
    cursor: {
      target,
      queue,
      pageUrl,
      skip,
      pageFolderLink: safeHttpsUrl(typeof value.pageFolderLink === 'string' ? value.pageFolderLink : ''),
      visited,
    },
  };
}
