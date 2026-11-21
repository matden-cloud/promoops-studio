// Logika murni jadwal Repliz. Tidak mengimpor modul Node supaya aman dipakai di UI.

import { isItemId } from './onedrive-plan.js';

export const CAPTION_LIMIT = 2200;
export const SEND_GAP_MS = 400;
export const PLAN_LIMIT = 15;
export const MEDIA_BUFFER_MS = 72 * 60 * 60 * 1000;
export const MEDIA_MAX_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;

const VIDEO_EXT = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v']);
const WEEKDAYS = { Sun: 'Min', Mon: 'Sen', Tue: 'Sel', Wed: 'Rab', Thu: 'Kam', Fri: 'Jum', Sat: 'Sab' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const STATUS_VIEWS = {
  pending: { key: 'pending', label: 'Menunggu', tone: 'menunggu' },
  process: { key: 'process', label: 'Diproses', tone: 'diproses' },
  processing: { key: 'process', label: 'Diproses', tone: 'diproses' },
  success: { key: 'success', label: 'Berhasil', tone: 'berhasil' },
  error: { key: 'error', label: 'Gagal', tone: 'gagal' },
  failed: { key: 'error', label: 'Gagal', tone: 'gagal' },
};

export const SCHEDULE_STATUS_FILTERS = Object.freeze([
  { id: '', label: 'Semua' },
  { id: 'pending', label: 'Menunggu' },
  { id: 'process', label: 'Diproses' },
  { id: 'success', label: 'Berhasil' },
  { id: 'error', label: 'Gagal' },
]);

export const REPLIZ_STATUS_COUNTS = Object.freeze([
  { id: 'pending', label: 'Menunggu', hint: 'antrean upload' },
  { id: 'process', label: 'Diproses', hint: '' },
  { id: 'success', label: 'Berhasil', hint: 'sudah terupload' },
  { id: 'error', label: 'Gagal', hint: '' },
]);

export const UNLINKED_PRODUCT_HINT = 'Id_Campaign belum terhubung ke nama produk di sheet Campaign.';
export const MISSING_FILE_ID_NOTE = 'ID file belum ada';

export function scheduleStatusView(status) {
  const key = String(status || '').trim().toLowerCase();
  return STATUS_VIEWS[key] || { key: 'unknown', label: key ? String(status) : 'Tidak diketahui', tone: 'unknown' };
}

function text(value) {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

export function normName(value) {
  return text(value)
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const REPLIZ_ACCOUNT_MAP_KEY = 'promoops.replizAccountMap';

// Handle yang normalisasinya tidak sama persis dengan nama MASTER_AKUN.
// @pasar.digital79 → pasardigital, sedangkan "Pasar Digitals" → pasardigitals.
// @grosirimportindonesia dan @jualkawatpembersihpipa juga tidak sama dengan
// "Grosir Hitam" dan "Jual Kawat". Keduanya memakai Id_Akun yang masih kosong.
// AKN_002, AKN_004, AKN_005, dan AKN_006 sudah terpakai akun lain.
export const KNOWN_HANDLE_OVERRIDES = Object.freeze([
  { handle: 'pasar.digital79', id: 'AKN_005', nama: 'Pasar Digitals' },
  { handle: 'grosirimportindonesia', id: 'AKN_003', nama: 'Grosir Hitam' },
  { handle: 'jualkawatpembersihpipa', id: 'AKN_001', nama: 'Jual Kawat' },
]);

export function normalizeAccountName(value) {
  return text(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeAccountHandle(value) {
  return text(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/@/g, '')
    .replace(/[.\s_]+/g, '')
    .replace(/\d+$/g, '');
}

export function isAllAccountsScope(accountId) {
  const value = text(accountId);
  if (!value) return true;
  const key = normalizeAccountName(value);
  return key === 'semua' || key === 'semua akun' || key === 'all';
}

export function candidateAccountId(item) {
  return text(item?.Id_Akun || item?.akunTarget);
}

export function candidatesForAccount(candidates, accountId = '') {
  const list = (Array.isArray(candidates) ? candidates : []).filter(Boolean);
  if (isAllAccountsScope(accountId)) return list;
  const wanted = text(accountId).toUpperCase();
  return list.filter((item) => candidateAccountId(item).toUpperCase() === wanted);
}

function masterLabelName(account) {
  return text(account?.label).replace(/^AKN_\d+\s*[-–:]\s*/i, '').trim();
}

function masterDisplayName(account) {
  const nama = text(account?.nama || account?.name);
  if (nama) return nama;
  return masterLabelName(account);
}

function replizUsername(account) {
  return text(account?.username).replace(/^@/, '');
}

function masterHandleKeys(account) {
  const keys = new Set();
  const add = (value) => {
    const key = normalizeAccountHandle(value);
    if (key) keys.add(key);
  };
  add(account?.username);
  add(account?.Username);
  add(account?.userName);
  add(account?.handle);
  add(account?.Handle);
  add(account?.nama);
  add(account?.name);
  add(masterLabelName(account));
  return keys;
}

function onlyMaster(masters, predicate) {
  const hits = masters.filter(predicate);
  return hits.length === 1 ? hits[0] : null;
}

function masterFromKnownHandle(masters, handleKey) {
  const rule = KNOWN_HANDLE_OVERRIDES.find((item) => normalizeAccountHandle(item.handle) === handleKey);
  if (!rule) return null;
  const byId = onlyMaster(masters, (item) => text(item.id).toUpperCase() === text(rule.id).toUpperCase());
  if (byId) return byId;
  const namaKey = normalizeAccountHandle(rule.nama);
  if (!namaKey) return null;
  return onlyMaster(masters, (item) => masterHandleKeys(item).has(namaKey));
}

function linked(base, master, mode) {
  return { ...base, masterId: text(master.id), master, mode };
}

function isManualSource(value) {
  const source = text(value?.source || value?.mode).toLowerCase();
  return value?.manual === true || source === 'manual';
}

function isAutoSource(value) {
  const source = text(value?.source || value?.mode).toLowerCase();
  return value?.manual === false || source === 'auto' || source.startsWith('auto-');
}

function manualMasterId(value) {
  if (typeof value === 'string' || typeof value === 'number') return text(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const master = text(value.masterId ?? value.id ?? value.Id_Akun);
  if (!master || (isAutoSource(value) && !isManualSource(value))) return '';
  return master;
}

export function manualAccountMap(stored) {
  const manual = {};
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return manual;
  for (const [key, value] of Object.entries(stored)) {
    const id = text(key);
    const master = manualMasterId(value);
    if (id && master) manual[id] = master;
  }
  return manual;
}

function autoAccountLink(account, masters) {
  const replizId = text(account.id);
  const name = text(account.name || account.nama);
  const username = replizUsername(account);
  const base = { replizId, name, username, masterId: '', master: null, mode: 'unlinked' };
  const handleKey = normalizeAccountHandle(username);
  if (handleKey) {
    const known = masterFromKnownHandle(masters, handleKey);
    if (known) return linked(base, known, 'auto-username');
    const byHandle = masters.filter((item) => masterHandleKeys(item).has(handleKey));
    if (byHandle.length === 1) return linked(base, byHandle[0], 'auto-username');
    if (byHandle.length > 1) return base;
  }
  const nameKey = normalizeAccountName(name);
  if (!nameKey) return base;
  const byName = masters.filter((item) => normalizeAccountName(masterDisplayName(item)) === nameKey);
  if (byName.length !== 1) return base;
  return linked(base, byName[0], 'auto-name');
}

function cancelDuplicateAutos(links) {
  const counts = new Map();
  for (const link of links) {
    if (!link.masterId) continue;
    const id = link.masterId.toUpperCase();
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return links.map((link) => {
    if (!link.masterId || link.mode === 'manual') return link;
    if ((counts.get(link.masterId.toUpperCase()) || 0) < 2) return link;
    return { ...link, masterId: '', master: null, mode: 'ambiguous' };
  });
}

export function resolveAccountLinks(replizAccounts, masterAccounts, manualMap = {}) {
  const masters = (Array.isArray(masterAccounts) ? masterAccounts : []).filter((item) => item && text(item.id));
  const manual = manualAccountMap(manualMap);
  const resolved = (Array.isArray(replizAccounts) ? replizAccounts : []).filter(Boolean).map((account) => {
    const auto = autoAccountLink(account, masters);
    const manualId = text(manual[auto.replizId]);
    if (!manualId) return auto;
    const master = masters.find((item) => text(item.id).toUpperCase() === manualId.toUpperCase()) || null;
    return master ? linked(auto, master, 'manual') : { ...auto, masterId: '', master: null, mode: 'unlinked' };
  });
  return cancelDuplicateAutos(resolved);
}

export function summarizeAccountLinks(links) {
  const summary = { auto: 0, manual: 0, unlinked: 0 };
  for (const link of Array.isArray(links) ? links : []) {
    if (link?.mode === 'manual') summary.manual += 1;
    else if (link?.mode === 'auto-name' || link?.mode === 'auto-username') summary.auto += 1;
    else summary.unlinked += 1;
  }
  return summary;
}

export function isHeldName(value) {
  const spaced = ` ${normName(value)} `;
  return /(?:^|\s)(?:gantungan|gntungan)\s+bor(?:\s|$)/.test(spaced);
}

export function userRequestsHeld(message) {
  return isHeldName(message);
}

export function isVideoFileName(name) {
  const raw = text(name).toLowerCase();
  const ext = raw.includes('.') ? raw.split('.').pop() : '';
  return VIDEO_EXT.has(ext);
}

export function isVideoFinalPath(path) {
  const value = text(path).replaceAll('\\', '/').toLowerCase();
  return /(?:^|\/)video final(?:\/|$)/.test(value);
}

export function normalizeIsoDate(value) {
  const raw = text(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const dmy = raw.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  let year;
  let month;
  let day;
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (dmy) {
    day = Number(dmy[1]);
    month = Number(dmy[2]);
    year = Number(dmy[3]);
  } else {
    return '';
  }
  if (year < 2024 || year > 2100) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function normalizeTime(value) {
  const match = text(value).match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return '';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function toScheduleAt(date, time) {
  const iso = normalizeIsoDate(date);
  const clock = normalizeTime(time);
  if (!iso || !clock) return '';
  return `${iso}T${clock}:00+07:00`;
}

export function isScheduleAt(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$/.test(value)) return false;
  return toScheduleAt(value.slice(0, 10), value.slice(11, 16)) === value;
}

export function addCalendarDays(iso, days) {
  const base = normalizeIsoDate(iso);
  const shift = Number(days);
  if (!base || !Number.isInteger(shift)) return '';
  const [year, month, day] = base.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + shift));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function jakartaParts(instant) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return null;
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const bag = {};
  for (const part of fmt.formatToParts(date)) bag[part.type] = part.value;
  const weekday = WEEKDAYS[String(bag.weekday || '').replace('.', '').slice(0, 3)] || '';
  const monthIndex = Number(bag.month) - 1;
  if (!weekday || monthIndex < 0 || monthIndex > 11 || !bag.year || !bag.day) return null;
  return {
    ymd: `${bag.year}-${bag.month}-${bag.day}`,
    weekday,
    day: String(Number(bag.day)),
    month: MONTHS[monthIndex],
    year: bag.year,
    hour: bag.hour,
    minute: bag.minute,
  };
}

export function jakartaYmd(now = new Date()) {
  return jakartaParts(now)?.ymd || '';
}

export function jakartaTomorrow(now = new Date()) {
  return addCalendarDays(jakartaYmd(now), 1);
}

export function formatPlanDate(isoDate) {
  const iso = normalizeIsoDate(isoDate);
  if (!iso) return '';
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const parts = jakartaParts(date);
  if (!parts) return iso;
  return `${parts.weekday}, ${Number(day)} ${MONTHS[month - 1]} ${year}`;
}

export function formatScheduleWib(iso, now = new Date()) {
  const parts = jakartaParts(iso);
  const today = jakartaParts(now);
  if (!parts || !today) return '';
  const label = `${parts.weekday}, ${parts.day} ${parts.month} ${parts.year}`;
  let prefix = label;
  if (parts.ymd === today.ymd) prefix = `Hari ini, ${label}`;
  else if (parts.ymd === addCalendarDays(today.ymd, -1)) prefix = `Kemarin, ${label}`;
  else if (parts.ymd === addCalendarDays(today.ymd, 1)) prefix = `Besok, ${label}`;
  return `${prefix} · ${parts.hour}.${parts.minute} WIB`;
}

export function mediaExpiryUnix(scheduleAt, now = Date.now()) {
  const when = Date.parse(scheduleAt);
  if (!Number.isFinite(when)) return { error: 'Waktu jadwal tidak valid.' };
  const base = Math.max(when, now);
  const expMs = base + MEDIA_BUFFER_MS;
  if (expMs > now + MEDIA_MAX_WINDOW_MS) {
    return { error: 'Jadwal terlalu jauh. URL media hanya berlaku paling lama 45 hari.' };
  }
  return { exp: Math.floor(expMs / 1000) };
}

function looseName(name) {
  const key = normName(name);
  return key.length >= 8 ? key : '';
}

function pushId(set, value) {
  const id = text(value);
  if (id) set.add(id);
}

function collectUploaded(dataViews, publishVideos) {
  const ids = new Set();
  const names = new Set();
  const absorb = (row) => {
    if (!row || typeof row !== 'object') return;
    pushId(ids, row.Id_Klip);
    pushId(ids, row.fileId);
    pushId(ids, row.Id_File);
    pushId(ids, row.Cloud_File_ID);
    pushId(ids, row.cloudFileId);
    pushId(ids, row.klipId);
    const name = looseName(row.Nama_File ?? row.fileName ?? row.namaFile ?? '');
    if (name) names.add(name);
  };
  for (const row of Array.isArray(dataViews) ? dataViews : []) absorb(row);
  for (const row of Array.isArray(publishVideos) ? publishVideos : []) absorb(row);
  return { ids, names };
}

function assetName(row) {
  return text(row?.Nama_File || row?.namaFile || row?.name || row?.fileName);
}

function validItemId(value) {
  const id = text(value);
  return isItemId(id) ? id : '';
}

function firstValidId(...values) {
  for (const value of values) {
    const id = validItemId(value);
    if (id) return id;
  }
  return '';
}

function klipIdValues(klip) {
  return [klip?.fileId, klip?.Id_Klip_Vidio, klip?.Vidio_Final_Id, klip?.vidioFinalId]
    .map(text)
    .filter(Boolean);
}

function indexAssetNames(fileAssets) {
  const byId = new Map();
  for (const row of Array.isArray(fileAssets) ? fileAssets : []) {
    const name = assetName(row);
    if (!name) continue;
    const ids = [row?.Cloud_File_ID, row?.cloudFileId, row?.Id_File, row?.idFile, row?.id, row?.fileId]
      .map(text)
      .filter(Boolean);
    for (const id of ids) {
      if (!byId.has(id)) byId.set(id, name);
    }
  }
  return byId;
}

function lookupAssetName(byId, ids) {
  for (const id of ids) {
    if (id && byId.has(id)) return byId.get(id);
  }
  return '';
}

function productNameOf(item) {
  return text(item?.product) || 'Tanpa produk';
}

export function buildVideoCandidates({
  fileAssets = null,
  klipVideos = [],
  publishVideos = [],
  dataViews = [],
} = {}) {
  const namesById = indexAssetNames(fileAssets);
  const uploaded = collectUploaded(dataViews, publishVideos);
  const seen = new Set();
  const candidates = [];
  const clips = Array.isArray(klipVideos) ? klipVideos : [];
  clips.forEach((klip, index) => {
    if (!klip || typeof klip !== 'object') return;
    const fileId = firstValidId(klip.fileId, klip.Id_Klip_Vidio, klip.Vidio_Final_Id, klip.vidioFinalId);
    if (fileId && seen.has(fileId)) return;
    if (fileId) seen.add(fileId);
    const rawIds = klipIdValues(klip);
    const fileName = text(klip.fileName ?? klip.Nama_File) || lookupAssetName(namesById, [fileId, ...rawIds]);
    const product = text(klip.produk);
    const nameKey = looseName(fileName);
    const isUploaded = rawIds.some((id) => uploaded.ids.has(id))
      || (fileId && uploaded.ids.has(fileId))
      || (nameKey && uploaded.names.has(nameKey));
    const schedulable = Boolean(fileId);
    candidates.push({
      key: fileId || `missing:${index}`,
      fileId,
      fileName,
      path: '',
      product,
      held: isHeldName(product) || isHeldName(fileName),
      uploaded: Boolean(isUploaded),
      date: normalizeIsoDate(klip.date || klip.Tanggal_Selesai || ''),
      schedulable,
      note: schedulable ? '' : MISSING_FILE_ID_NOTE,
      Id_Akun: text(klip.Id_Akun || klip.idAkun),
      akunTarget: text(klip.akunTarget),
      Sumber: text(klip.Sumber || klip.sumber),
    });
  });
  return candidates;
}

export function summarizeVideoStock(candidates) {
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  const uploaded = list.filter((item) => item.uploaded).length;
  return {
    total: list.length,
    uploaded,
    belum: list.length - uploaded,
  };
}

export function summarizeReplizStatus(payloads = {}) {
  const read = (key) => {
    const value = Number(payloads?.[key]?.totalDocs);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  };
  return {
    pending: read('pending'),
    process: read('process'),
    success: read('success'),
    error: read('error'),
  };
}

export function sortForPlanning(candidates) {
  return [...(candidates || [])].sort((a, b) => {
    const byDate = String(b?.date || '').localeCompare(String(a?.date || ''));
    if (byDate) return byDate;
    return String(a?.fileName || '').localeCompare(String(b?.fileName || ''), 'id');
  });
}

export function candidatesForPlanner(candidates) {
  const usable = (candidates || []).filter((item) => item && item.schedulable !== false);
  const open = sortForPlanning(usable.filter((item) => !item.uploaded && !item.held));
  const held = sortForPlanning(usable.filter((item) => !item.uploaded && item.held));
  return [...open, ...held].slice(0, 120);
}

export function filterCandidates(candidates, {
  uploaded = 'belum',
  includeHeld = false,
  product = '',
  query = '',
  accountId = '',
} = {}) {
  const productKey = normName(product);
  const needle = normName(query);
  const limitAccount = !isAllAccountsScope(accountId);
  const wantedAccount = text(accountId).toUpperCase();
  return (candidates || []).filter((item) => {
    if (!item) return false;
    if (uploaded === 'belum' && item.uploaded) return false;
    if (uploaded === 'sudah' && !item.uploaded) return false;
    if (!includeHeld && item.held) return false;
    if (limitAccount && candidateAccountId(item).toUpperCase() !== wantedAccount) return false;
    if (productKey && productKey !== 'semua' && normName(productNameOf(item)) !== productKey) return false;
    if (needle && !normName(`${item.fileName} ${productNameOf(item)}`).includes(needle)) return false;
    return true;
  });
}

export function productChoices(candidates) {
  const map = new Map();
  for (const item of candidates || []) {
    if (!item) continue;
    const name = productNameOf(item);
    const current = map.get(name) || {
      name,
      total: 0,
      belum: 0,
      ditahan: 0,
      held: false,
      open: 0,
      count: 0,
    };
    current.total += 1;
    if (item.held) current.ditahan += 1;
    if (!item.uploaded) {
      current.belum += 1;
      current.count += 1;
      if (!item.held && item.schedulable !== false) current.open += 1;
    }
    current.held = isHeldName(name) || (current.total > 0 && current.ditahan === current.total);
    map.set(name, current);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'id'));
}

export function productChoiceLabel(choice) {
  const name = text(choice?.name) || 'Tanpa produk';
  if (choice?.held || isHeldName(name)) return `${name} (Ditahan)`;
  const belum = Number(choice?.belum) || 0;
  const total = Number(choice?.total) || 0;
  const base = `${name} (${belum} belum / ${total} total)`;
  return belum === 0 ? `${base} · habis` : base;
}

export function createPlanRow(fields = {}) {
  const caption = text(fields.caption).slice(0, CAPTION_LIMIT + 400);
  return {
    localId: text(fields.localId),
    fileId: text(fields.fileId),
    fileName: text(fields.fileName),
    product: text(fields.product),
    held: Boolean(fields.held) || isHeldName(fields.product) || isHeldName(fields.fileName),
    accountId: text(fields.accountId),
    date: normalizeIsoDate(fields.date),
    time: normalizeTime(fields.time),
    caption,
    isDraft: Boolean(fields.isDraft),
    isCommentDisabled: Boolean(fields.isCommentDisabled),
    isAiGenerated: Boolean(fields.isAiGenerated),
    sendState: fields.sendState || 'draft',
    error: text(fields.error),
  };
}

export function planRowIssues(row) {
  const issues = [];
  if (!row?.fileId) issues.push('Video belum dipilih.');
  if (!row?.accountId) issues.push('Akun Repliz belum dipilih.');
  if (!toScheduleAt(row?.date, row?.time)) issues.push('Tanggal atau jam WIB tidak valid.');
  if (String(row?.caption || '').length > CAPTION_LIMIT) issues.push('Caption melebihi 2.200 karakter.');
  return issues;
}

export function buildQuickRows({
  candidates,
  product,
  count,
  startDate,
  time,
  accountId,
  idAkun = '',
  existing = [],
} = {}) {
  const total = Number(count);
  const start = normalizeIsoDate(startDate);
  const clock = normalizeTime(time);
  if (!text(product)) return { rows: [], message: 'Pilih produk dulu.' };
  if (!start || !clock) return { rows: [], message: 'Tanggal mulai atau jam WIB tidak valid.' };
  if (!Number.isInteger(total) || total < 1 || total > PLAN_LIMIT) {
    return { rows: [], message: `Jumlah video harus 1 sampai ${PLAN_LIMIT}.` };
  }
  if (isHeldName(product)) {
    return {
      rows: [],
      held: true,
      message: 'Produk Gantungan Bor sedang ditahan (Hold) dan tidak diisi otomatis.',
    };
  }
  const taken = new Set((existing || []).filter((row) => row?.sendState !== 'sent').map((row) => row.fileId));
  const pool = sortForPlanning(filterCandidates(candidates, {
    uploaded: 'belum',
    includeHeld: false,
    product,
    accountId: idAkun,
  })).filter((item) => item.schedulable !== false && item.fileId && !taken.has(item.fileId));
  const rows = [];
  for (let index = 0; index < Math.min(total, pool.length); index += 1) {
    const item = pool[index];
    rows.push(createPlanRow({
      localId: `cepat-${item.fileId}-${index}`,
      fileId: item.fileId,
      fileName: item.fileName,
      product: item.product,
      held: false,
      accountId,
      date: addCalendarDays(start, index),
      time: clock,
    }));
  }
  if (!rows.length) {
    return { rows: [], message: 'Tidak ada video belum diupload untuk produk itu.' };
  }
  const shortfall = total - rows.length;
  const message = shortfall > 0
    ? `Hanya ${rows.length} video yang belum diupload. ${shortfall} hari tidak terisi.`
    : '';
  return { rows, message, held: false };
}

export function appendPlanRows(current, incoming) {
  const rows = [...(current || [])];
  const taken = new Set(rows.filter((row) => row.sendState !== 'sent').map((row) => row.fileId));
  let skipped = 0;
  for (const row of incoming || []) {
    if (!row?.fileId || taken.has(row.fileId)) {
      skipped += 1;
      continue;
    }
    taken.add(row.fileId);
    rows.push(row);
  }
  return { rows, skipped };
}

export function mergePlanRows(current, incoming) {
  const kept = (current || []).filter((row) => row.sendState === 'sent' || row.sendState === 'sending');
  const taken = new Set(kept.map((row) => row.fileId));
  const fresh = [];
  for (const row of incoming || []) {
    if (!row?.fileId || taken.has(row.fileId)) continue;
    taken.add(row.fileId);
    fresh.push(row);
  }
  return [...kept, ...fresh];
}

export function removePlanRow(current, localId) {
  return (current || []).filter((row) => row.localId !== localId || row.sendState === 'sending');
}

export function clearDraftPlan(current) {
  return (current || []).filter((row) => row.sendState === 'sending');
}
