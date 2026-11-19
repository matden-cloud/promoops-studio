export const VIEW_BUCKETS = [
  { id: 'under1k', label: '<1rb', hint: 'di bawah 1.000' },
  { id: 'from1k', label: '1rb–5rb', hint: '1.000 sampai di bawah 5.000' },
  { id: 'from5k', label: '5rb–10rb', hint: '5.000 sampai di bawah 10.000' },
  { id: 'from10k', label: '>10rb', hint: '10.000 ke atas' },
];

const BUCKET_IDS = new Set(VIEW_BUCKETS.map((bucket) => bucket.id));

function blankCounts() {
  return {
    upload: 0,
    viewSum: 0,
    rated: 0,
    missingViews: 0,
    under1k: 0,
    from1k: 0,
    from5k: 0,
    from10k: 0,
  };
}

function validIso(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return '';
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return '';
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseCalendarDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return validIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (dmy) return validIso(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  return '';
}

export function uploadIsoDate(row) {
  if (!row || typeof row !== 'object') return '';
  return parseCalendarDate(row._isoDate) || parseCalendarDate(row.Tanggal_Upload) || '';
}

export function rowYearMonth(row) {
  const iso = uploadIsoDate(row);
  if (iso) return iso.slice(0, 7);
  const preset = String(row?._month ?? '').trim();
  return /^\d{4}-\d{2}$/.test(preset) ? preset : '';
}

export function formatUploadDate(row) {
  const iso = uploadIsoDate(row);
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

export function currentYearMonth(now = new Date()) {
  const date = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function parseViewCount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const number = Number(digits);
  return Number.isFinite(number) ? number : null;
}

export function bucketIdForView(value) {
  const views = typeof value === 'number' ? value : parseViewCount(value);
  if (views == null) return null;
  if (views < 1000) return 'under1k';
  if (views < 5000) return 'from1k';
  if (views < 10000) return 'from5k';
  return 'from10k';
}

export function formatIdNumber(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Math.round(Number(value)).toLocaleString('id-ID');
}

export function rekapMonthChoices(rows, now = new Date()) {
  const months = new Set();
  for (const row of rows || []) {
    const ym = rowYearMonth(row);
    if (ym) months.add(ym);
  }
  months.add(currentYearMonth(now));
  return [...months].sort().reverse();
}

function productName(row) {
  return String(row?.Induk_Barang ?? '').replace(/\s+/g, ' ').trim();
}

function addVideo(target, row) {
  target.upload += 1;
  const views = parseViewCount(row?.View);
  if (views == null) {
    target.missingViews += 1;
    return;
  }
  target.rated += 1;
  target.viewSum += views;
  const bucket = bucketIdForView(views);
  if (bucket) target[bucket] += 1;
}

function withAverage(target, produk) {
  return {
    produk,
    upload: target.upload,
    viewSum: target.viewSum,
    rated: target.rated,
    missingViews: target.missingViews,
    under1k: target.under1k,
    from1k: target.from1k,
    from5k: target.from5k,
    from10k: target.from10k,
    average: target.rated > 0 ? Math.round(target.viewSum / target.rated) : null,
  };
}

export function buildRekapProduk(rows, month) {
  const ym = String(month || '').trim();
  const byProduct = new Map();
  const totals = blankCounts();
  for (const row of rows || []) {
    if (!row || typeof row !== 'object') continue;
    if (rowYearMonth(row) !== ym) continue;
    const produk = productName(row);
    if (!produk) continue;
    let entry = byProduct.get(produk);
    if (!entry) {
      entry = blankCounts();
      byProduct.set(produk, entry);
    }
    addVideo(entry, row);
    addVideo(totals, row);
  }
  const products = [...byProduct.entries()].map(([produk, counts]) => withAverage(counts, produk));
  return {
    month: ym,
    products,
    totals: { ...withAverage(totals, ''), produkCount: products.length },
  };
}

function compareNullable(a, b, direction) {
  const aNull = a == null;
  const bNull = b == null;
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  return direction === 'asc' ? a - b : b - a;
}

export function sortRekapRows(products, key = 'upload', dir = 'desc') {
  const direction = dir === 'asc' ? 'asc' : 'desc';
  const sortKey = key === 'produk' || key === 'average' || BUCKET_IDS.has(key) || key === 'upload' ? key : 'upload';
  return [...(products || [])].sort((a, b) => {
    const byName = a.produk.localeCompare(b.produk, 'id');
    let cmp;
    if (sortKey === 'produk') {
      cmp = direction === 'desc' ? -byName : byName;
    } else if (sortKey === 'average') {
      cmp = compareNullable(a.average, b.average, direction);
    } else {
      const av = a[sortKey] || 0;
      const bv = b[sortKey] || 0;
      cmp = direction === 'asc' ? av - bv : bv - av;
    }
    return cmp || byName;
  });
}

export function filterRekapVideos(rows, { month, produk, bucket } = {}) {
  const ym = String(month || '').trim();
  const name = String(produk || '').replace(/\s+/g, ' ').trim();
  const bucketId = bucket && bucket !== 'upload' ? bucket : '';
  return (rows || []).filter((row) => {
    if (!row || typeof row !== 'object') return false;
    if (rowYearMonth(row) !== ym) return false;
    const rowName = productName(row);
    if (!rowName) return false;
    if (name && rowName !== name) return false;
    if (!bucketId) return true;
    return bucketIdForView(row.View) === bucketId;
  });
}
