export const NOTICE_FIELD_ORDER = ['akun', 'produk', 'jenis', 'tanggal', 'catatan', 'status'];

export const NOTICE_FIELD_LABELS = {
  akun: 'akun',
  produk: 'produk',
  jenis: 'jenis pelanggaran',
  tanggal: 'tanggal',
  catatan: 'catatan',
  status: 'status banding',
};

const STATUSES = new Set(['Belum Banding', 'Menunggu Banding', 'Banding Diterima', 'Banding Ditolak']);

export function accountOptionValue(account) {
  const label = account?.label ?? '';
  return `${label}${account?.pemegang ? ` (${account.pemegang})` : ''}`;
}

function cleanField(value, max) {
  return String(value ?? '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b(?:[a-z0-9]+\.)?tiktok\.com\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function norm(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[_./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchAccount(raw, accounts) {
  const text = cleanField(raw, 120);
  if (!text) return null;
  const needle = norm(text);
  const list = Array.isArray(accounts) ? accounts : [];
  for (const account of list) {
    const value = accountOptionValue(account);
    if (value === text || norm(value) === needle) return { value, unmatched: false };
  }
  const candidates = [];
  for (const account of list) {
    const value = accountOptionValue(account);
    const bits = [account?.label, account?.nama, account?.id, account?.pemegang]
      .map(norm)
      .filter((bit) => bit.length >= 3);
    const hit = bits.some((bit) => bit === needle || (needle.length >= 4 && (bit.includes(needle) || needle.includes(bit))));
    if (hit && !candidates.includes(value)) candidates.push(value);
  }
  if (candidates.length === 1) return { value: candidates[0], unmatched: false };
  return { value: text, unmatched: true };
}

function normJenis(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/gi, ' ').trim();
}

export function matchJenis(raw, types) {
  const text = cleanField(raw, 160);
  if (!text) return null;
  const needle = normJenis(text);
  const list = (Array.isArray(types) ? types : []).map((type) => String(type || '').trim()).filter(Boolean);
  const exact = list.find((type) => normJenis(type) === needle);
  if (exact) return { value: exact, custom: false };
  const partials = list.filter((type) => {
    const known = normJenis(type);
    if (needle.length < 4 || known.length < 4) return false;
    return known.includes(needle) || needle.includes(known);
  });
  if (partials.length === 1) return { value: partials[0], custom: false };
  return { value: text, custom: true };
}

function isoTanggal(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cleanField(value, 10));
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return match[0];
}

export function sheetTanggal(iso) {
  const valid = isoTanggal(iso);
  if (!valid) return '';
  const [, year, month, day] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valid);
  return `${Number(day)}/${Number(month)}/${year}`;
}

export function applyNoticeFields(form, fields, { accounts = [], types = [] } = {}) {
  const current = form && typeof form === 'object' ? form : {};
  const next = { ...current, linkVideo: current.linkVideo || '' };
  const filled = {};
  let customJenis = null;
  const source = fields && typeof fields === 'object' ? fields : {};

  const akun = matchAccount(source.akun, accounts);
  if (akun) {
    next.akun = akun.value;
    filled.akun = true;
  }
  const produk = cleanField(source.produk, 160);
  if (produk) {
    next.produk = produk;
    filled.produk = true;
  }
  const jenis = matchJenis(source.jenis, types);
  if (jenis) {
    next.jenis = jenis.value;
    filled.jenis = true;
    customJenis = jenis.custom;
  }
  const tanggal = isoTanggal(source.tanggal);
  if (tanggal) {
    next.tanggal = tanggal;
    filled.tanggal = true;
  }
  const catatan = cleanField(source.catatan, 500);
  if (catatan) {
    next.catatan = catatan;
    filled.catatan = true;
  }
  if (STATUSES.has(source.status)) {
    next.status = source.status;
    filled.status = true;
  }
  next.linkVideo = current.linkVideo || '';
  return {
    form: next,
    filled,
    customJenis,
    labels: NOTICE_FIELD_ORDER.filter((key) => filled[key]).map((key) => NOTICE_FIELD_LABELS[key]),
  };
}

export function appendNoticeShot(form, image, id) {
  if (!image) return form;
  const current = form && typeof form === 'object' ? form : {};
  const shots = Array.isArray(current.screenshots) ? current.screenshots : [];
  if (shots.some((shot) => shot && shot.url === image)) return form;
  return {
    ...current,
    screenshots: [...shots, { id: id || `notice_${shots.length + 1}`, label: 'SS Teguran', url: image }],
  };
}

export function imageFileFromClipboard(event) {
  const items = event?.clipboardData?.items;
  if (!items) return null;
  for (const item of items) {
    if (!item || item.kind !== 'file' || typeof item.type !== 'string' || !item.type.startsWith('image/')) continue;
    const file = typeof item.getAsFile === 'function' ? item.getAsFile() : null;
    if (file) return file;
  }
  return null;
}

export function noticeErrorMessage(result) {
  const code = result?.error;
  if (code === 'missing_api_key') return 'Kunci Gemini belum siap. Isi formulir secara manual dulu.';
  if (code === 'quota_exhausted') return 'Kuota Gemini hari ini habis. Isi formulir secara manual dulu.';
  if (code === 'image_too_large') return 'Gambar terlalu besar. Coba unggah ulang dengan ukuran lebih kecil.';
  if (code === 'invalid_image' || code === 'empty_image') {
    return 'File ini bukan gambar yang bisa dibaca. Unggah JPG, PNG, WEBP, atau GIF.';
  }
  return 'Screenshot belum bisa dibaca. Coba unggah ulang atau tempel gambar yang lebih jelas. Formulir tetap bisa diisi manual.';
}
