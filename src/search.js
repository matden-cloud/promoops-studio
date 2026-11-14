const ID_MONTHS = [
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

function isoDatesIn(text) {
  return text.match(/\d{4}-\d{2}(?:-\d{2})?/g) || [];
}

export function normalizeSearchText(value) {
  if (value == null) return '';
  return String(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function dateSearchLabels(value) {
  const raw = value == null ? '' : String(value).trim();
  if (!raw) return [];

  const labels = [raw];
  let year;
  let month;
  let day;
  const isoDay = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const isoMonth = raw.match(/^(\d{4})-(\d{2})$/);
  const slash = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);

  if (isoDay) {
    year = isoDay[1];
    month = isoDay[2];
    day = isoDay[3];
  } else if (isoMonth) {
    year = isoMonth[1];
    month = isoMonth[2];
  } else if (slash) {
    day = slash[1].padStart(2, '0');
    month = slash[2].padStart(2, '0');
    year = slash[3];
    labels.push(`${year}-${month}-${day}`);
  }

  if (year && month) {
    const monthName = ID_MONTHS[Number(month) - 1];
    if (monthName) {
      labels.push(day ? `${day}/${month}/${year}` : `${month}/${year}`);
      labels.push(`${monthName} ${year}`);
      if (day) labels.push(`${Number(day)} ${monthName} ${year}`);
    }
  }

  return labels;
}

function fieldHaystacks(value) {
  const text = normalizeSearchText(value);
  if (!text) return [];

  const stacks = [text];
  const seen = new Set(stacks);
  const dates = isoDatesIn(text);
  for (const iso of dates) {
    for (const label of dateSearchLabels(iso)) {
      const normalized = normalizeSearchText(label);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        stacks.push(normalized);
      }
    }
  }
  return stacks;
}

export function matchesSearchQuery(query, fields) {
  const needle = normalizeSearchText(query);
  if (!needle) return true;

  const tokens = needle.split(' ');
  const sources = Array.isArray(fields) ? fields : [fields];
  const haystacks = sources.flatMap(fieldHaystacks);
  if (haystacks.length === 0) return false;

  return tokens.every((token) => haystacks.some((field) => field.includes(token)));
}

export function filterBySearch(items, query, getFields) {
  if (!Array.isArray(items) || typeof getFields !== 'function') return [];
  if (!normalizeSearchText(query)) return items;
  return items.filter((item) => matchesSearchQuery(query, getFields(item)));
}

function linkFields(row) {
  return [row.url, row.link, row.linkHp, row.Link_HP, row.link_hp, row.Link_Postingan];
}

export function rawAssetSearchFields(row) {
  if (!row || typeof row !== 'object') return [];
  return [
    row.fileName,
    row.produk,
    row.creator,
    row.status || 'Mentahan',
    row.date,
    row.month,
    ...linkFields(row),
  ];
}

export function klipSearchFields(row, accountLabel) {
  if (!row || typeof row !== 'object') return [];
  return [
    row.fileName,
    row.produk,
    row.editor,
    row.akunTarget,
    accountLabel,
    row.status,
    row.date ? `Selesai Edit (${row.date})` : 'Selesai Edit',
    row.date,
    row.month,
    ...linkFields(row),
  ];
}

export function publishSearchFields(row, accountLabel) {
  if (!row || typeof row !== 'object') return [];
  return [
    row.fileName,
    row.produk,
    row.uploader,
    row.akun,
    row.akunLabel,
    accountLabel,
    row.status || 'Sukses',
    row.date,
    row.month,
    ...linkFields(row),
  ];
}

export function fypRowSearchFields(row, extras = []) {
  if (!row || typeof row !== 'object') return [];
  const viewDigits = String(row.View ?? '').replace(/[^0-9]/g, '');
  const viewLabel = viewDigits ? Number(viewDigits).toLocaleString('id-ID') : '';
  const extraList = Array.isArray(extras) ? extras : [extras];
  return [
    row.Nama_File,
    row.Induk_Barang,
    row.Nama_Akun,
    row.Id_Akun,
    row.Tanggal_Upload,
    row._isoDate,
    row._month,
    row.Video_FYP || 'Belum FYP',
    row.Link_Postingan,
    row.View,
    viewLabel,
    row.Id_Klip,
    ...extraList,
  ];
}

export function fileListSearchFields(file) {
  if (!file || typeof file !== 'object') return [];
  return [file.name, file.produk, file.owner, file.status, file.url, file.linkHp, file.date];
}
