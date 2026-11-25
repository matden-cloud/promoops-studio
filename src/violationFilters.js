import { violationDateToIso, violationSanksi } from './violationDisplay.js';

export const VIOLATION_FILTER_KEY = 'promoops.pelanggaran.filters';
export const TANPA_SANKSI = '__tanpa_sanksi__';

export const EMPTY_VIOLATION_FILTERS = Object.freeze({
  bulan: 'Semua',
  akun: 'Semua',
  status: 'Semua',
  sanksi: 'Semua',
});

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const STATUS_ORDER = ['Belum Banding', 'Menunggu Banding', 'Banding Diterima', 'Banding Ditolak'];

const SANKSI_ORDER = [
  'Peringatan',
  'Video dibatasi / tidak masuk FYP',
  'Fitur dibatasi',
  'Poin pelanggaran',
  'Akun ditangguhkan',
];

function cleanLabel(value, fallback) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

export function violationMonthKey(value) {
  const iso = violationDateToIso(value);
  return iso ? iso.slice(0, 7) : '';
}

export function violationMonthLabel(key) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(key || ''));
  if (!match) return '';
  const month = Number(match[2]);
  if (month < 1 || month > 12) return '';
  return `${MONTHS_ID[month - 1]} ${match[1]}`;
}

export function currentViolationMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
  }).format(now);
  const match = /^(\d{4})-(\d{2})/.exec(parts);
  return match ? `${match[1]}-${match[2]}` : '';
}

export function violationAkunLabel(row) {
  return cleanLabel(row?.akun, 'Tanpa akun');
}

export function violationStatusLabel(row) {
  return cleanLabel(row?.status, 'Belum Banding');
}

export function violationSanksiKey(row) {
  return violationSanksi(row) || TANPA_SANKSI;
}

export function violationSanksiLabel(key) {
  return key === TANPA_SANKSI ? 'Tanpa sanksi' : cleanLabel(key, 'Tanpa sanksi');
}

function filterValue(value) {
  const text = String(value ?? '').trim();
  if (!text || text.length > 200) return 'Semua';
  return text;
}

export function normalizeViolationFilters(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    bulan: filterValue(source.bulan),
    akun: filterValue(source.akun),
    status: filterValue(source.status),
    sanksi: filterValue(source.sanksi),
  };
}

export function readViolationFilters(storage) {
  try {
    return normalizeViolationFilters(JSON.parse(storage?.getItem(VIOLATION_FILTER_KEY) || 'null'));
  } catch {
    return { ...EMPTY_VIOLATION_FILTERS };
  }
}

export function writeViolationFilters(storage, filters) {
  try {
    storage?.setItem(VIOLATION_FILTER_KEY, JSON.stringify(normalizeViolationFilters(filters)));
  } catch {
    // localStorage penuh atau diblokir: filter tetap berlaku di tab ini.
  }
}

function matches(row, filters, skip) {
  if (skip !== 'bulan' && filters.bulan !== 'Semua' && violationMonthKey(row?.tanggal) !== filters.bulan) return false;
  if (skip !== 'akun' && filters.akun !== 'Semua' && violationAkunLabel(row) !== filters.akun) return false;
  if (skip !== 'status' && filters.status !== 'Semua' && violationStatusLabel(row) !== filters.status) return false;
  if (skip !== 'sanksi' && filters.sanksi !== 'Semua' && violationSanksiKey(row) !== filters.sanksi) return false;
  return true;
}

function countsOf(rows, keyOf) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function withSelection(options, selected, labelOf) {
  if (selected === 'Semua' || options.some((option) => option.value === selected)) return options;
  return [...options, { value: selected, count: 0, label: `${labelOf(selected)} (0)` }];
}

function option(value, count, name) {
  return { value, count, label: `${name} (${count})` };
}

function orderedCounts(counts, preferred) {
  const rest = [...counts.keys()].filter((key) => !preferred.includes(key));
  rest.sort((left, right) => left.localeCompare(right, 'id'));
  return [...preferred.filter((key) => counts.has(key)), ...rest];
}

export function violationFiltersActive(filters) {
  const active = normalizeViolationFilters(filters);
  return active.bulan !== 'Semua' || active.akun !== 'Semua' || active.status !== 'Semua' || active.sanksi !== 'Semua';
}

export function buildViolationFilterView(rows, filters, now = new Date()) {
  const list = Array.isArray(rows) ? rows : [];
  const active = normalizeViolationFilters(filters);
  const monthRows = list.filter((row) => matches(row, active, 'bulan'));
  const akunRows = list.filter((row) => matches(row, active, 'akun'));
  const statusRows = list.filter((row) => matches(row, active, 'status'));
  const sanksiRows = list.filter((row) => matches(row, active, 'sanksi'));
  const filtered = list.filter((row) => matches(row, active, ''));

  const monthCounts = countsOf(monthRows, (row) => violationMonthKey(row?.tanggal));
  const monthOptions = [...monthCounts.keys()]
    .sort((left, right) => right.localeCompare(left))
    .map((key) => option(key, monthCounts.get(key), violationMonthLabel(key)));

  const akunCounts = countsOf(akunRows, violationAkunLabel);
  const akunOptions = [...akunCounts.keys()]
    .sort((left, right) => left.localeCompare(right, 'id'))
    .map((key) => option(key, akunCounts.get(key), key));

  const statusCounts = countsOf(statusRows, violationStatusLabel);
  const statusOptions = orderedCounts(statusCounts, STATUS_ORDER)
    .map((key) => option(key, statusCounts.get(key), key));

  const sanksiCounts = countsOf(sanksiRows, violationSanksiKey);
  const sanksiKeys = orderedCounts(
    new Map([...sanksiCounts].filter(([key]) => key !== TANPA_SANKSI)),
    SANKSI_ORDER,
  );
  if (sanksiCounts.has(TANPA_SANKSI)) sanksiKeys.push(TANPA_SANKSI);
  const sanksiOptions = sanksiKeys.map((key) => option(key, sanksiCounts.get(key), violationSanksiLabel(key)));

  const accountChips = [...akunCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'id'))
    .map(([value, count]) => ({ value, count, label: `${value} (${count})` }));

  const monthName = active.bulan === 'Semua' ? '' : violationMonthLabel(active.bulan);
  const headlineCount = filtered.length;
  let headline = `Semua bulan: ${headlineCount} pelanggaran`;
  if (active.bulan !== 'Semua' && active.bulan === currentViolationMonth(now)) {
    headline = `Bulan ini: ${headlineCount} pelanggaran`;
  } else if (monthName) {
    headline = `${monthName}: ${headlineCount} pelanggaran`;
  }

  return {
    filters: active,
    rows: filtered,
    total: list.length,
    headline,
    rangeLabel: `Menampilkan ${filtered.length} dari ${list.length}`,
    active: violationFiltersActive(active),
    months: [
      option('Semua', monthRows.length, 'Semua bulan'),
      ...withSelection(monthOptions, active.bulan, violationMonthLabel),
    ],
    accounts: [
      option('Semua', akunRows.length, 'Semua akun'),
      ...withSelection(akunOptions, active.akun, (value) => value),
    ],
    statuses: [
      option('Semua', statusRows.length, 'Semua status'),
      ...withSelection(statusOptions, active.status, (value) => value),
    ],
    sanctions: [
      option('Semua', sanksiRows.length, 'Semua sanksi'),
      ...withSelection(sanksiOptions, active.sanksi, violationSanksiLabel),
    ],
    accountChips,
  };
}
