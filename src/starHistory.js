const ID_MONTHS_LONG = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const ID_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const EN_MONTHS = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function cleanText(value) {
  return String(value ?? '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function monthNumberOk(month) {
  return month >= 1 && month <= 12;
}

function yearMonth(year, month) {
  if (!monthNumberOk(month)) return '';
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function toYearMonth(value) {
  const raw = cleanText(value);
  if (!raw || raw === 'Semua' || raw === 'Tanpa Tanggal' || raw === 'Format Tidak Dikenal') return '';

  const iso = raw.match(/^(\d{4})-(\d{2})(?:-\d{2}(?:[T\s].*)?)?$/);
  if (iso) return yearMonth(iso[1], Number(iso[2]));

  const named = raw.match(/^([A-Za-zÀ-ÿ]+),?\s+(\d{4})$/);
  if (named) {
    const idx = ID_MONTHS_LONG.findIndex((name) => name.toLowerCase() === named[1].toLowerCase());
    if (idx >= 0) return yearMonth(named[2], idx + 1);
  }

  return '';
}

export function formatYearMonth(value) {
  const ym = toYearMonth(value);
  if (!ym) return '';
  const name = ID_MONTHS_LONG[Number(ym.slice(5, 7)) - 1];
  return name ? `${name} ${ym.slice(0, 4)}` : ym;
}

export function monthFromTimestamp(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return yearMonth(value.getFullYear(), value.getMonth() + 1);
  }

  const raw = cleanText(value);
  if (!raw) return '';

  const iso = raw.match(/^(\d{4})-(\d{2})/);
  if (iso && monthNumberOk(Number(iso[2]))) return `${iso[1]}-${iso[2]}`;

  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) {
    const p1 = Number(dmy[1]);
    const p2 = Number(dmy[2]);
    const month = p1 > 12 ? p2 : (p2 > 12 ? p1 : p2);
    return yearMonth(dmy[3], month);
  }

  const english = raw.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b[\s,]+(?:\d{1,2}[\s,]+)?(\d{4})/i);
  if (english) {
    const month = EN_MONTHS[english[1].slice(0, 3).toLowerCase()];
    if (month) return yearMonth(english[2], month);
  }

  return toYearMonth(raw);
}

/**
 * Bulan bintang = bulan laporan yang sedang dipilih di filter dashboard.
 * Bukan tanggal klik. Filter "Semua" memakai bulan data file itu sendiri.
 */
export function starMonthForSelection(selectedFilter, fileMonth) {
  return toYearMonth(selectedFilter) || toYearMonth(fileMonth) || '';
}

function isWinningValue(value) {
  if (value === true || value === 1) return true;
  const text = cleanText(value).toLowerCase();
  return text === 'ya' || text === 'true' || text === '1';
}

export function normalizeStarRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const bulan = toYearMonth(raw.bulan || raw.Bulan);
  const fileKey = cleanText(raw.fileKey || raw.File_Key);
  if (!bulan || !fileKey) return null;
  return {
    bulan,
    fileKey,
    kategori: cleanText(raw.kategori || raw.Kategori),
    produk: cleanText(raw.produk || raw.Nama_Produk),
    fileName: cleanText(raw.fileName || raw.Nama_File),
    url: String(raw.url || raw.Link_File || '').trim(),
    isWinning: isWinningValue(raw.isWinning ?? raw.Status_Winning),
    catatan: String(raw.catatan ?? raw.Catatan_File ?? ''),
    waktu: String(raw.waktu || raw.Waktu || raw.updatedAt || ''),
  };
}

export function synthesizeHistoryFromWinningFiles(winningFiles) {
  if (!Array.isArray(winningFiles)) return [];
  const rows = [];
  for (const file of winningFiles) {
    if (!file || typeof file !== 'object') continue;
    if (!isWinningValue(file.isWinning ?? file.Status_Winning)) continue;
    const fileKey = cleanText(file.fileKey || file.File_Key);
    const bulan = monthFromTimestamp(file.updatedAt || file.Terakhir_Diupdate || file.waktu);
    if (!fileKey || !bulan) continue;
    rows.push({
      bulan,
      fileKey,
      kategori: cleanText(file.kategori || file.Kategori),
      produk: cleanText(file.produk || file.Nama_Produk),
      fileName: cleanText(file.fileName || file.Nama_File),
      url: String(file.url || file.Link_File || '').trim(),
      isWinning: true,
      catatan: String(file.catatan ?? file.Catatan_File ?? ''),
      waktu: String(file.updatedAt || file.Terakhir_Diupdate || ''),
    });
  }
  return rows;
}

function dedupeRows(rows) {
  const map = new Map();
  for (const row of rows) {
    map.set(`${row.bulan}\n${row.fileKey}`, row);
  }
  return [...map.values()];
}

/**
 * starHistory bukan array = Apps Script lama, perilaku bintang sekarang.
 * starHistory array = mode riwayat. File yang belum punya baris riwayat
 * diisi dari Data_Winning_Files (Status Ya -> bulan Terakhir_Diupdate).
 * File yang sudah punya riwayat, termasuk status Tidak, tidak ditimpa snapshot itu.
 */
export function resolveStarState(payload) {
  const history = payload?.starHistory;
  if (!Array.isArray(history)) {
    return { mode: 'legacy', rows: [] };
  }

  const historyRows = dedupeRows(history.map(normalizeStarRow).filter(Boolean));
  const covered = new Set(historyRows.map((row) => row.fileKey));
  const migrated = synthesizeHistoryFromWinningFiles(payload?.winningFiles)
    .filter((row) => !covered.has(row.fileKey));
  return { mode: 'history', rows: historyRows.concat(migrated) };
}

function pickText(change, key, previous) {
  if (change && change[key] != null && cleanText(change[key]) !== '') return cleanText(change[key]);
  return previous?.[key] || '';
}

/**
 * Upsert satu pasangan Bulan + File_Key.
 * Bulan lain untuk file yang sama, dan file lain, tidak diubah atau dihapus.
 */
export function applyStarChange(rows, change) {
  const list = Array.isArray(rows) ? rows.map((row) => ({ ...row })) : [];
  const bulan = toYearMonth(change?.bulan);
  const fileKey = cleanText(change?.fileKey);
  if (!bulan || !fileKey) return list;

  const idx = list.findIndex((row) => row.bulan === bulan && row.fileKey === fileKey);
  const previous = idx >= 0 ? list[idx] : {};
  const entry = {
    bulan,
    fileKey,
    kategori: pickText(change, 'kategori', previous),
    produk: pickText(change, 'produk', previous),
    fileName: pickText(change, 'fileName', previous),
    url: change?.url != null && String(change.url).trim() !== '' ? String(change.url).trim() : (previous.url || ''),
    isWinning: !!change?.isWinning,
    catatan: Object.prototype.hasOwnProperty.call(change || {}, 'catatan')
      ? String(change.catatan ?? '')
      : (previous.catatan || ''),
    waktu: previous.waktu || '',
  };

  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  return list;
}

export function buildStarIndex(rows) {
  const index = new Map();
  for (const row of rows || []) {
    if (!row?.fileKey || !row?.bulan) continue;
    let byMonth = index.get(row.fileKey);
    if (!byMonth) {
      byMonth = new Map();
      index.set(row.fileKey, byMonth);
    }
    byMonth.set(row.bulan, row);
  }
  return index;
}

export function displayedStarFromIndex(mode, index, fileKey, bulan, legacyMap) {
  const key = cleanText(fileKey);
  if (mode !== 'history') {
    const info = (legacyMap && legacyMap[key]) || {};
    return { isWinning: !!info.isWinning, catatan: info.catatan || '', months: [] };
  }

  const byMonth = index?.get(key);
  const months = [];
  if (byMonth) {
    for (const [ym, row] of byMonth) {
      if (row?.isWinning) months.push(ym);
    }
    months.sort();
  }

  const ym = toYearMonth(bulan);
  const record = ym && byMonth ? byMonth.get(ym) : null;
  return {
    isWinning: !!record?.isWinning,
    catatan: record?.catatan || '',
    months,
  };
}

export function winningMonthsForFile(rows, fileKey) {
  return displayedStarFromIndex('history', buildStarIndex(rows), fileKey, '', {}).months;
}

export function formatStarBadge(months) {
  const list = [...new Set((months || []).map((value) => toYearMonth(value)).filter(Boolean))].sort();
  if (list.length === 0) return '';
  const years = new Set(list.map((ym) => ym.slice(0, 4)));
  const showYear = years.size > 1;
  return list.map((ym) => {
    const short = ID_MONTHS_SHORT[Number(ym.slice(5, 7)) - 1] || ym;
    return showYear ? `⭐ ${short} ${ym.slice(2, 4)}` : `⭐ ${short}`;
  }).join(' · ');
}

export function isFypStarRow(row) {
  const kategori = cleanText(row?.kategori).toLowerCase();
  if (kategori.includes('fyp')) return true;
  return cleanText(row?.fileKey).startsWith('FYP__');
}

function starredMap(rows, bulan) {
  const map = new Map();
  for (const row of rows) {
    if (row.bulan === bulan && row.isWinning && row.fileKey) map.set(row.fileKey, row);
  }
  return map;
}

function byFileLabel(a, b) {
  return starFileLabel(a).localeCompare(starFileLabel(b), 'id');
}

export function starFileLabel(row) {
  const name = cleanText(row?.fileName || row?.fileKey);
  const produk = cleanText(row?.produk);
  if (produk && name && !name.toLowerCase().includes(produk.toLowerCase())) return `${name} (${produk})`;
  return name || cleanText(row?.fileKey);
}

export function compareStarMonths(rows, baseMonth, otherMonth, scope) {
  const base = toYearMonth(baseMonth);
  const other = toYearMonth(otherMonth);
  if (!base || !other || base === other) {
    return { both: [], added: [], dropped: [], ready: false };
  }

  const list = (Array.isArray(rows) ? rows : []).filter((row) => {
    if (scope === 'fyp') return isFypStarRow(row);
    if (scope === 'pipeline') return !isFypStarRow(row);
    return true;
  });
  const inBase = starredMap(list, base);
  const inOther = starredMap(list, other);
  const both = [];
  const added = [];
  const dropped = [];

  for (const [key, row] of inBase) {
    if (inOther.has(key)) both.push(row);
    else added.push(row);
  }
  for (const [key, row] of inOther) {
    if (!inBase.has(key)) dropped.push(row);
  }

  both.sort(byFileLabel);
  added.sort(byFileLabel);
  dropped.sort(byFileLabel);
  return { both, added, dropped, ready: true };
}

export function compareMonthOptions(baseMonth, rows, extraValues) {
  const base = toYearMonth(baseMonth);
  const months = new Set();
  for (const row of rows || []) {
    const ym = toYearMonth(row?.bulan);
    if (ym) months.add(ym);
  }
  for (const value of extraValues || []) {
    const ym = toYearMonth(value);
    if (ym) months.add(ym);
  }
  if (base) months.delete(base);
  return [...months].sort().reverse();
}
