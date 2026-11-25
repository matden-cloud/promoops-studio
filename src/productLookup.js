import {
  VIEW_BUCKETS,
  bucketIdForView,
  buildRekapProduk,
  currentYearMonth,
  formatIdNumber,
  formatUploadDate,
  parseViewCount,
  rowYearMonth,
} from './rekapProduk.js';
import { formatYearMonth } from './starHistory.js';
import {
  foldProductText,
  pipelineMonth,
  resolvePublishList,
  selectRows,
  shortAccountName,
} from './pipelineFilter.js';

export { foldProductText, shortAccountName };

export const PROMPT_CHAR_LIMIT = 48_000;

const STOP_WORDS = new Set([
  'berapa', 'apa', 'yang', 'dan', 'atau', 'di', 'ke', 'dari', 'untuk', 'pada', 'dengan', 'adalah',
  'ini', 'itu', 'ya', 'tidak', 'ada', 'upload', 'uploads', 'editan', 'edit', 'diedit', 'view',
  'views', 'tayangan', 'tayang', 'produk', 'data', 'cari', 'carikan', 'tampilkan', 'lihat',
  'jumlah', 'total', 'rata', 'video', 'videos', 'klip', 'mentahan', 'mentah', 'sudah', 'belum',
  'dipakai', 'pakai', 'rekomendasi', 'rekomendasikan', 'fokus', 'minggu', 'depan', 'berdasarkan',
  'stok', 'asset', 'winning', 'bagus', 'bulan', 'tahun', 'laporan', 'analisa', 'analisis',
  'buatkan', 'buat', 'draft', 'poin', 'slide', 'ppt', 'pdf', 'power', 'kekuatan', 'produksi',
  'publish', 'antar', 'serta', 'bottleneck', 'mana', 'harus', 'difokuskan', 'tolong', 'dong',
  'nya', 'kah', 'pun', 'juga', 'kalau', 'jika', 'semua', 'per', 'bandingkan', 'banding',
  'tertinggi', 'terbanyak', 'paling', 'file', 'akun', 'toko', 'tim', 'orang', 'nama', 'gimana',
  'bagaimana', 'kenapa', 'mengapa', 'kapan', 'dimana', 'mana', 'web', 'layar', 'saat', 'sekarang',
  'ringkasan', 'eksekutif', 'evaluasi', 'materi', 'siap', 'pakai',
]);

const MONTH_INDEX = new Map([
  ['januari', 1], ['jan', 1], ['january', 1],
  ['februari', 2], ['feb', 2], ['february', 2],
  ['maret', 3], ['mar', 3], ['march', 3],
  ['april', 4], ['apr', 4],
  ['mei', 5], ['may', 5],
  ['juni', 6], ['jun', 6], ['june', 6],
  ['juli', 7], ['jul', 7], ['july', 7],
  ['agustus', 8], ['agu', 8], ['agt', 8], ['august', 8], ['aug', 8],
  ['september', 9], ['sep', 9], ['sept', 9],
  ['oktober', 10], ['okt', 10], ['october', 10], ['oct', 10],
  ['november', 11], ['nov', 11],
  ['desember', 12], ['des', 12], ['december', 12], ['dec', 12],
]);

function unique(tokens) {
  const seen = new Set();
  const out = [];
  for (const token of tokens) {
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

export function questionProductTokens(question) {
  return unique(foldProductText(question).split(' ').filter((token) => {
    if (token.length < 3) return false;
    if (STOP_WORDS.has(token)) return false;
    if (MONTH_INDEX.has(token)) return false;
    if (/^\d+$/.test(token)) return false;
    return true;
  }));
}

export function monthNamedInQuestion(question, now = new Date(), preferredYear) {
  const source = String(question || '');
  const iso = source.match(/\b(20\d{2})-(\d{2})\b/);
  if (iso) {
    const month = Number(iso[2]);
    if (month >= 1 && month <= 12) return `${iso[1]}-${iso[2]}`;
  }
  const folded = foldProductText(source);
  const tokens = folded.split(' ').filter(Boolean);
  let month = 0;
  for (const token of tokens) {
    const value = MONTH_INDEX.get(token);
    if (value) month = value;
  }
  const years = [...source.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]));
  if (!month) {
    if (/\bbulan ini\b/.test(folded)) return currentYearMonth(now);
    return '';
  }
  const year = years.length
    ? years[years.length - 1]
    : (Number(preferredYear) || (now instanceof Date ? now.getFullYear() : new Date().getFullYear()));
  return `${year}-${String(month).padStart(2, '0')}`;
}

function dice(left, right) {
  const a = String(left || '').replace(/\s+/g, '');
  const b = String(right || '').replace(/\s+/g, '');
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bags = (text) => {
    const map = new Map();
    for (let index = 0; index < text.length - 1; index += 1) {
      const gram = text.slice(index, index + 2);
      map.set(gram, (map.get(gram) || 0) + 1);
    }
    return map;
  };
  const leftBags = bags(a);
  const rightBags = bags(b);
  let leftSize = 0;
  let rightSize = 0;
  let shared = 0;
  for (const count of leftBags.values()) leftSize += count;
  for (const [gram, count] of rightBags) {
    rightSize += count;
    shared += Math.min(count, leftBags.get(gram) || 0);
  }
  return (2 * shared) / (leftSize + rightSize || 1);
}

function productTokenList(name) {
  return unique(foldProductText(name).split(' ').filter((token) => token.length >= 2));
}

function scoreAgainst(questionFolded, queryTokens, name) {
  const productTokens = productTokenList(name);
  const productSet = new Set(productTokens);
  const overlapTokens = queryTokens.filter((token) => productSet.has(token));
  const overlap = overlapTokens.length;
  const queryCover = queryTokens.length ? overlap / queryTokens.length : 0;
  const productCover = productTokens.length ? overlap / productTokens.length : 0;
  const foldedName = foldProductText(name);
  const nameContained = foldedName.length >= 3 && ` ${questionFolded} `.includes(` ${foldedName} `);
  let score = queryCover * 100 + productCover * 20;
  if (nameContained) score += 50;
  if (queryTokens.length >= 2 && queryCover === 1) score += 30;
  if (!overlap && !nameContained) score = dice(queryTokens.join(''), foldedName) * 40;
  return {
    name,
    score,
    overlap,
    queryCover,
    productCover,
    nameContained,
    qCount: queryTokens.length,
    token: overlapTokens[0] || queryTokens[0] || '',
  };
}

function isConfident(row) {
  if (!row || row.qCount === 0) return false;
  if (row.nameContained && row.overlap >= 1) return true;
  if (row.queryCover === 1 && row.overlap >= 2) return true;
  if (row.queryCover === 1 && row.qCount === 1 && row.token.length >= 4 && row.productCover >= 0.5) return true;
  return false;
}

export function collectProductNames({
  rawAssets = [],
  klipVideos = [],
  publishVideos = [],
  aggregatedProducts = [],
  viewRows = [],
} = {}) {
  const map = new Map();
  const add = (value) => {
    const name = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!name || name === 'Tanpa Produk') return;
    const key = foldProductText(name);
    if (!key) return;
    const current = map.get(key);
    if (!current) {
      map.set(key, { name, count: 1 });
      return;
    }
    current.count += 1;
    if (name.length < current.name.length) current.name = name;
  };
  for (const row of rawAssets) add(row?.produk);
  for (const row of klipVideos) add(row?.produk);
  for (const row of publishVideos) add(row?.produk);
  for (const row of aggregatedProducts) add(row?.produk || row?.name);
  for (const row of viewRows) add(row?.Induk_Barang);
  return [...map.values()];
}

export function matchProducts(question, catalog, { limit = 3 } = {}) {
  const queryTokens = questionProductTokens(question);
  const questionFolded = foldProductText(question);
  const names = [];
  const seen = new Set();
  for (const item of catalog || []) {
    const name = String(item?.name || item || '').replace(/\s+/g, ' ').trim();
    const key = foldProductText(name);
    if (!name || !key || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  const ranked = names
    .map((name) => scoreAgainst(questionFolded, queryTokens, name))
    .sort((a, b) => b.score - a.score || a.name.length - b.name.length || a.name.localeCompare(b.name, 'id'));
  const confident = ranked.filter(isConfident);
  const matches = confident.slice(0, limit);
  const miss = queryTokens.length > 0 && matches.length === 0;
  let closest = [];
  if (miss) {
    closest = ranked.filter((row) => row.score > 0).slice(0, limit);
  }
  return {
    queryTokens,
    matches,
    miss,
    closest,
    extra: Math.max(0, confident.length - matches.length),
  };
}

export function isFypStatus(status) {
  const text = String(status || '').toLowerCase();
  return (text.includes('fyp') || text.includes('viral')) && !text.includes('belum');
}

function blankView() {
  return {
    videos: 0,
    rated: 0,
    missingViews: 0,
    viewSum: 0,
    max: null,
    fyp: 0,
    buckets: { under1k: 0, from1k: 0, from5k: 0, from10k: 0 },
  };
}

function addView(target, row) {
  target.videos += 1;
  if (isFypStatus(row?.Video_FYP || row?.status)) target.fyp += 1;
  const views = parseViewCount(row?.View ?? row?.view);
  if (views == null) {
    target.missingViews += 1;
    return;
  }
  target.rated += 1;
  target.viewSum += views;
  if (target.max == null || views > target.max) target.max = views;
  const bucket = bucketIdForView(views);
  if (bucket) target.buckets[bucket] += 1;
}

function averageOf(viewSum, rated) {
  return rated > 0 ? Math.round(viewSum / rated) : null;
}

function applyRekapView(target, rows, month) {
  if (!month) return;
  const report = buildRekapProduk(rows, month);
  target.videos = report.totals.upload;
  target.rated = report.totals.rated;
  target.missingViews = report.totals.missingViews;
  target.viewSum = report.totals.viewSum;
  target.buckets = {
    under1k: report.totals.under1k,
    from1k: report.totals.from1k,
    from5k: report.totals.from5k,
    from10k: report.totals.from10k,
  };
}

function accountKey(row, accounts) {
  const id = String(row?.akun || row?.Id_Akun || '').trim();
  if (/^AKN_/i.test(id)) return id.toUpperCase();
  const label = String(row?.Nama_Akun || row?.akunLabel || row?.uploader || '').trim();
  const found = (accounts || []).find((account) => (
    String(account?.nama || '').toLowerCase() === label.toLowerCase()
    || String(account?.label || '').toLowerCase() === label.toLowerCase()
    || String(account?.id || '').toUpperCase() === label.toUpperCase()
  ));
  if (found?.id) return String(found.id).toUpperCase();
  return `n:${foldProductText(shortAccountName(label || id, accounts)) || 'tanpa'}`;
}

function sameProduct(row, name, field) {
  return foldProductText(row?.[field] || row?.produk || row?.Induk_Barang) === foldProductText(name);
}

function monthLabel(month) {
  if (!month) return 'Semua bulan';
  return formatYearMonth(month) || month;
}

export function buildProductDetail(name, sources, context = {}) {
  const filters = context.filters || {};
  const accounts = context.accounts || filters.accounts || [];
  const lookup = context.accountLookup || {};
  const now = context.now instanceof Date ? context.now : new Date();
  const screenMonth = activeScreenMonth(filters.month);
  const preferredYear = screenMonth ? Number(screenMonth.slice(0, 4)) : now.getFullYear();
  const questionMonth = monthNamedInQuestion(context.question || '', now, preferredYear);
  const scopeMonth = questionMonth || screenMonth;
  const scopeSource = questionMonth ? 'pertanyaan' : (screenMonth ? 'filter' : 'semua');
  const baseFilters = {
    month: 'Semua',
    date: filters.date || '',
    produk: 'Semua',
    tim: filters.tim || 'Semua',
    query: '',
    accounts,
  };
  const publishList = resolvePublishList(sources.publishVideos, sources.viewRows);
  const rawNamed = (sources.rawAssets || []).filter((row) => sameProduct(row, name, 'produk'));
  const klipNamed = (sources.klipVideos || []).filter((row) => sameProduct(row, name, 'produk'));
  const publishNamed = publishList.filter((row) => sameProduct(row, name, 'produk'));
  const viewNamed = (sources.viewRows || []).filter((row) => sameProduct(row, name, 'Induk_Barang'));
  const rawAll = selectRows(rawNamed, 'raw', baseFilters, lookup);
  const klipAll = selectRows(klipNamed, 'klip', baseFilters, lookup);
  const publishAll = selectRows(publishNamed, 'publish', baseFilters, lookup);
  const viewAll = selectRows(viewNamed, 'view', baseFilters, lookup);
  const scopedFilters = { ...baseFilters, month: scopeMonth || 'Semua' };
  const raw = selectRows(rawNamed, 'raw', scopedFilters, lookup);
  const klip = selectRows(klipNamed, 'klip', scopedFilters, lookup);
  const publish = selectRows(publishNamed, 'publish', scopedFilters, lookup);
  const views = selectRows(viewNamed, 'view', scopedFilters, lookup);

  const belum = raw.filter((row) => row.status === 'Belum Dipakai').length;
  const view = blankView();
  for (const row of views) addView(view, row);
  if (scopeMonth) applyRekapView(view, views, scopeMonth);
  const undated = viewAll.filter((row) => !rowYearMonth(row));
  if (!scopeMonth && undated.length) {
    const dated = viewAll.filter((row) => rowYearMonth(row));
    const rebuilt = blankView();
    const months = [...new Set(dated.map((row) => rowYearMonth(row)).filter(Boolean))];
    for (const month of months) {
      const part = buildRekapProduk(dated, month).totals;
      rebuilt.videos += part.upload;
      rebuilt.rated += part.rated;
      rebuilt.missingViews += part.missingViews;
      rebuilt.viewSum += part.viewSum;
      rebuilt.buckets.under1k += part.under1k;
      rebuilt.buckets.from1k += part.from1k;
      rebuilt.buckets.from5k += part.from5k;
      rebuilt.buckets.from10k += part.from10k;
    }
    for (const row of undated) addView(rebuilt, row);
    rebuilt.fyp = viewAll.filter((row) => isFypStatus(row.Video_FYP)).length;
    rebuilt.max = view.max;
    Object.assign(view, rebuilt);
  }

  const monthMap = new Map();
  const ensureMonth = (month) => {
    const key = month || '';
    if (!monthMap.has(key)) {
      monthMap.set(key, {
        month: key,
        label: key ? (formatYearMonth(key) || key) : 'Tanpa tanggal',
        inScope: scopeMonth ? key === scopeMonth : true,
        mentahan: 0,
        belum: 0,
        dipakai: 0,
        klip: 0,
        upload: 0,
        viewSum: 0,
        rated: 0,
        average: null,
      });
    }
    return monthMap.get(key);
  };
  for (const row of rawAll) {
    const bucket = ensureMonth(pipelineMonth(row));
    bucket.mentahan += 1;
    if (row.status === 'Belum Dipakai') bucket.belum += 1;
    else bucket.dipakai += 1;
  }
  for (const row of klipAll) ensureMonth(pipelineMonth(row)).klip += 1;
  for (const row of publishAll) ensureMonth(pipelineMonth(row)).upload += 1;
  const viewMonths = [...new Set(viewAll.map((row) => rowYearMonth(row)))];
  for (const month of viewMonths) {
    const part = month
      ? buildRekapProduk(viewAll, month).totals
      : null;
    const bucket = ensureMonth(month);
    if (part) {
      bucket.viewSum = part.viewSum;
      bucket.rated = part.rated;
      bucket.average = part.average;
    } else {
      const loose = blankView();
      for (const row of viewAll.filter((item) => !rowYearMonth(item))) addView(loose, row);
      bucket.viewSum = loose.viewSum;
      bucket.rated = loose.rated;
      bucket.average = averageOf(loose.viewSum, loose.rated);
    }
  }
  const months = [...monthMap.values()].sort((a, b) => {
    if (!a.month) return 1;
    if (!b.month) return -1;
    return b.month.localeCompare(a.month);
  });

  const akunMap = new Map();
  const ensureAkun = (row) => {
    const key = accountKey(row, accounts);
    if (!akunMap.has(key)) {
      const rawName = row?.Nama_Akun || row?.akunLabel || row?.akun || row?.Id_Akun || row?.uploader || '';
      akunMap.set(key, {
        nama: shortAccountName(/^AKN_/i.test(key) ? key : rawName, accounts),
        upload: 0,
        viewSum: 0,
        rated: 0,
        videos: 0,
        fyp: 0,
        average: null,
      });
    }
    return akunMap.get(key);
  };
  for (const row of publish) ensureAkun(row).upload += 1;
  for (const row of views) {
    const entry = ensureAkun(row);
    entry.videos += 1;
    if (isFypStatus(row.Video_FYP)) entry.fyp += 1;
    const count = parseViewCount(row.View);
    if (count == null) continue;
    entry.viewSum += count;
    entry.rated += 1;
  }
  const accountsBreakdown = [...akunMap.values()]
    .map((entry) => ({ ...entry, average: averageOf(entry.viewSum, entry.rated) }))
    .sort((a, b) => b.viewSum - a.viewSum || b.upload - a.upload || a.nama.localeCompare(b.nama, 'id'))
    .slice(0, 12);

  const topVideos = views
    .map((row) => ({ row, view: parseViewCount(row.View) }))
    .filter((item) => item.view != null)
    .sort((a, b) => b.view - a.view)
    .slice(0, 5)
    .map(({ row, view: count }) => ({
      date: formatUploadDate(row),
      akun: shortAccountName(row.Nama_Akun || row.Id_Akun, accounts),
      view: count,
      file: String(row.Nama_File || row.Induk_Barang || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      fyp: isFypStatus(row.Video_FYP),
    }));

  const notes = [];
  if (questionMonth && screenMonth && questionMonth !== screenMonth) {
    notes.push(`Pertanyaan menyebut ${monthLabel(questionMonth)}. Angka utama memakai bulan itu. Filter bulan di layar: ${monthLabel(screenMonth)}.`);
  } else if (questionMonth && !screenMonth) {
    notes.push(`Pertanyaan menyebut ${monthLabel(questionMonth)}. Angka utama memakai bulan itu, bukan seluruh data.`);
  } else if (screenMonth) {
    notes.push(`Angka utama mengikuti filter bulan ${monthLabel(screenMonth)}.`);
  }
  if (scopeMonth) {
    const outsideRaw = rawAll.length - raw.length;
    const outsideKlip = klipAll.length - klip.length;
    const outsideUpload = publishAll.length - publish.length;
    const outsideViews = viewAll.reduce((sum, row) => sum + (parseViewCount(row.View) || 0), 0) - view.viewSum;
    if (outsideRaw || outsideKlip || outsideUpload || outsideViews) {
      notes.push(`Filter bulan menyembunyikan data bulan lain: mentahan ${outsideRaw}, klip ${outsideKlip}, upload ${outsideUpload}, total view ${Math.max(0, outsideViews)}.`);
    }
  }
  if (filters.date) notes.push(`Filter tanggal ${filters.date} ikut membatasi angka.`);
  if (filters.tim && filters.tim !== 'Semua') {
    notes.push(`Filter tim/akun layar: ${shortAccountName(filters.tim, accounts)}.`);
  }
  const dropdown = String(filters.produk || '').trim();
  if (dropdown && dropdown !== 'Semua' && foldProductText(dropdown) !== foldProductText(name)) {
    notes.push(`Dropdown produk di layar: ${dropdown}. Angka ini tetap untuk ${name} karena pertanyaan menyebutnya.`);
  }
  if (filters.onlyWinning) {
    notes.push('Filter bintang sedang nyala. Tabel ringkas mengikuti layar; angka detail produk ini tidak dipotong bintang.');
  }
  if (String(filters.query || '').trim()) {
    notes.push(`Pencarian layar "${String(filters.query).trim()}" menyaring tabel ringkas. Angka detail tidak dipotong kotak cari.`);
  }
  if (scopeMonth && undated.length) {
    notes.push(`${undated.length} video view tanpa tanggal tidak masuk hitungan bulan.`);
  }

  return {
    name,
    scopeMonth,
    scopeSource,
    scopeLabel: monthLabel(scopeMonth),
    screenMonth,
    notes,
    headline: {
      mentahan: raw.length,
      belum,
      dipakai: raw.length - belum,
      klip: klip.length,
      upload: publish.length,
      viewSum: view.viewSum,
      average: averageOf(view.viewSum, view.rated),
      max: view.max,
      videos: view.videos,
      rated: view.rated,
      missingViews: view.missingViews,
      fyp: view.fyp,
      buckets: view.buckets,
    },
    months,
    accounts: accountsBreakdown,
    topVideos,
  };
}

function activeScreenMonth(value) {
  const month = String(value || '').trim();
  return /^\d{4}-\d{2}$/.test(month) ? month : '';
}

function fmt(value) {
  if (value == null) return '—';
  return formatIdNumber(value);
}

export function detailToMarkdown(detail) {
  const headline = detail.headline;
  const lines = [
    `**${detail.name}**`,
    '',
    `Cakupan: **${detail.scopeLabel}**.`,
    ...detail.notes.map((note) => `> ${note}`),
    '',
    `- Mentahan: **${fmt(headline.mentahan)}** (belum dipakai **${fmt(headline.belum)}**, sudah dipakai **${fmt(headline.dipakai)}**)`,
    `- Edit / klip: **${fmt(headline.klip)}**`,
    `- Upload: **${fmt(headline.upload)}**`,
    `- View: total **${fmt(headline.viewSum)}**, rata-rata **${fmt(headline.average)}**, tertinggi **${fmt(headline.max)}**, video **${fmt(headline.videos)}**, ber-view **${fmt(headline.rated)}**, FYP **${fmt(headline.fyp)}**`,
    '',
    '**Kelompok view**',
    ...VIEW_BUCKETS.map((bucket) => `- ${bucket.label}: **${fmt(headline.buckets[bucket.id] || 0)}**`),
    '',
    '**Per bulan**',
    '',
    '| Bulan | Mentahan | Klip | Upload | Total view | Rata view |',
    '| --- | --- | --- | --- | --- | --- |',
    ...detail.months.map((month) => `| ${month.label}${month.inScope ? '' : ' (di luar)'} | ${month.mentahan} | ${month.klip} | ${month.upload} | ${month.viewSum} | ${month.average == null ? '-' : month.average} |`),
    '',
    '**Per akun**',
    ...(detail.accounts.length
      ? detail.accounts.map((account) => `- ${account.nama}: upload **${fmt(account.upload)}**, view **${fmt(account.viewSum)}**, rata-rata **${fmt(account.average)}**, video **${fmt(account.videos)}**, FYP **${fmt(account.fyp)}**`)
      : ['- Tidak ada rincian akun pada cakupan ini.']),
    '',
    '**Video view tertinggi**',
    ...(detail.topVideos.length
      ? detail.topVideos.map((video, index) => `- ${index + 1}. ${video.date || 'tanpa tanggal'} · ${video.akun} · **${fmt(video.view)}** view${video.fyp ? ' · FYP' : ''}`)
      : ['- Belum ada angka view pada cakupan ini.']),
  ];
  return lines.join('\n');
}

function tableLine(row) {
  const name = String(row.name || '').replace(/\|/g, '/');
  const average = row.avgView == null ? '-' : row.avgView;
  return `${name} | ${row.raw} | ${row.edit} | ${row.upload} | ${row.viewSum} | ${average}`;
}

export function fitProductTable(rows, budget) {
  const header = 'Produk | Mentahan | Edit | Upload | Total view | Rata view';
  const ordered = [...(rows || [])].sort((a, b) => (
    (b.upload || 0) - (a.upload || 0)
    || (b.viewSum || 0) - (a.viewSum || 0)
    || String(a.name).localeCompare(String(b.name), 'id')
  ));
  const pinned = ordered.filter((row) => row.pinned);
  const rest = ordered.filter((row) => !row.pinned);
  const chosen = [...pinned];
  let size = header.length + 1 + pinned.reduce((sum, row) => sum + tableLine(row).length + 1, 0);
  for (const row of rest) {
    const line = tableLine(row);
    if (size + line.length + 1 > budget) break;
    chosen.push(row);
    size += line.length + 1;
  }
  const shown = new Set(chosen.map((row) => foldProductText(row.name)));
  const omitted = ordered.filter((row) => !shown.has(foldProductText(row.name))).length;
  const text = [header, ...chosen.map(tableLine)].join('\n');
  const note = omitted > 0 ? `${omitted} produk lain tidak dimuat karena batas panjang prompt.` : '';
  return { text, omitted, note, shown: chosen.length };
}

function viewMetrics(rows) {
  const stats = blankView();
  for (const row of rows) addView(stats, row);
  return stats;
}

function buildTableRows(input, filters, accounts, lookup) {
  const publishList = resolvePublishList(input.publishVideos, input.viewRows);
  const screenFilters = { ...filters, accounts };
  const views = selectRows(input.viewRows || [], 'view', { ...screenFilters, produk: 'Semua' }, lookup);
  const byName = new Map();
  const ensure = (name, pinned = false) => {
    const clean = String(name || '').replace(/\s+/g, ' ').trim();
    const key = foldProductText(clean);
    if (!clean || !key || clean === 'Tanpa Produk') return null;
    let row = byName.get(key);
    if (!row) {
      row = { name: clean, raw: 0, edit: 0, upload: 0, viewSum: 0, rated: 0, avgView: null, pinned };
      byName.set(key, row);
    } else if (pinned) row.pinned = true;
    return row;
  };

  const screen = input.aggregatedProducts;
  if (Array.isArray(screen) && screen.length) {
    for (const item of screen) {
      const row = ensure(item.produk || item.name);
      if (!row) continue;
      row.raw = item.mentahan || item.raw || 0;
      row.edit = item.videoFinal || item.edit || 0;
      row.upload = item.upload || 0;
    }
  } else {
    for (const item of selectRows(input.rawAssets || [], 'raw', screenFilters, lookup)) {
      const row = ensure(item.produk);
      if (row) row.raw += 1;
    }
    for (const item of selectRows(input.klipVideos || [], 'klip', screenFilters, lookup)) {
      const row = ensure(item.produk);
      if (row) row.edit += 1;
    }
    for (const item of selectRows(publishList, 'publish', screenFilters, lookup)) {
      const row = ensure(item.produk);
      if (row) row.upload += 1;
    }
  }

  if (!filters.onlyWinning) {
    for (const item of views) ensure(item.Induk_Barang || item.produk);
  }
  const viewGroups = new Map();
  for (const item of views) {
    const key = foldProductText(item.Induk_Barang || item.produk);
    if (!key || !byName.has(key)) continue;
    if (!viewGroups.has(key)) viewGroups.set(key, []);
    viewGroups.get(key).push(item);
  }
  for (const [key, group] of viewGroups) {
    const row = byName.get(key);
    const stats = viewMetrics(group);
    row.viewSum = stats.viewSum;
    row.rated = stats.rated;
    row.avgView = averageOf(stats.viewSum, stats.rated);
  }
  return [...byName.values()];
}

function executiveFallback(totals, tableRows, monthly) {
  const top = [...tableRows].sort((a, b) => b.upload - a.upload)[0];
  const lines = [
    '**Ringkasan data di layar**',
    '',
    `- Mentahan: **${fmt(totals.mentahan)}** (belum dipakai **${fmt(totals.belum)}**, sudah dipakai **${fmt(totals.dipakai)}**)`,
    `- Edit / klip: **${fmt(totals.klip)}**`,
    `- Upload: **${fmt(totals.upload)}**`,
  ];
  if (top) {
    lines.push(`- Produk teratas menurut upload: **${top.name}** (mentahan ${fmt(top.raw)}, edit ${fmt(top.edit)}, upload ${fmt(top.upload)}, total view ${fmt(top.viewSum)}, rata-rata ${fmt(top.avgView)}).`);
  }
  if (monthly?.length) {
    lines.push('', '**Power bulanan**');
    for (const month of monthly.slice(0, 6)) {
      lines.push(`- ${month.label || month.month}: mentahan ${fmt(month.mentahan)}, produksi ${fmt(month.produksi)}, publish ${fmt(month.publish)}`);
    }
  }
  lines.push('', 'Angka ini dihitung dari data web.');
  return lines.join('\n');
}

export function buildDashboardAiPack(input = {}) {
  const filters = input.filters || {};
  const accounts = input.accounts || filters.accounts || [];
  const lookup = input.accountLookup || {};
  const now = input.now instanceof Date ? input.now : new Date();
  const question = String(input.question || '').trim();
  const catalog = collectProductNames({
    rawAssets: input.rawAssets,
    klipVideos: input.klipVideos,
    publishVideos: input.publishVideos,
    aggregatedProducts: input.aggregatedProducts,
    viewRows: input.viewRows,
  });
  const found = matchProducts(question, catalog, { limit: 3 });
  const details = found.matches.map((match) => buildProductDetail(match.name, input, {
    question,
    filters: { ...filters, accounts },
    accounts,
    accountLookup: lookup,
    now,
  }));
  const pinned = new Set(found.matches.map((match) => foldProductText(match.name)));
  const tableRows = buildTableRows(input, { ...filters, accounts }, accounts, lookup).map((row) => ({
    ...row,
    pinned: pinned.has(foldProductText(row.name)) || row.pinned,
  }));
  const totals = input.totals || {
    mentahan: tableRows.reduce((sum, row) => sum + row.raw, 0),
    belum: 0,
    dipakai: 0,
    klip: tableRows.reduce((sum, row) => sum + row.edit, 0),
    upload: tableRows.reduce((sum, row) => sum + row.upload, 0),
  };
  const monthly = input.monthly || [];
  const screenMonth = activeScreenMonth(filters.month);
  const instructions = [
    'Anda asisten data PromoOps Studio.',
    'Jawab hanya dari data di bawah. Jangan mengarang angka, nama produk, atau penyebab.',
    'Tampilkan angkanya secara eksplisit.',
    'Gunakan bahasa Indonesia.',
    'Format jawaban markdown sederhana: tebal dengan ** **, poin dengan -, dan tabel | jika membandingkan.',
    'Jika ada blok detail produk, jadikan angka "Dalam cakupan" sebagai jawaban utama dan sebutkan catatan filter bila ada.',
    'Jika pertanyaan mencari produk tetapi tidak ada yang cocok, katakan nama itu tidak ada di data, lalu sarankan nama terdekat yang diberikan. Jangan mengisi angkanya.',
    'Target upload hanya dari rencana akun di data. Jangan memakai target tetap 15 video per hari.',
  ].join('\n');
  const planRows = Array.isArray(input.uploadPlan?.rows) ? input.uploadPlan.rows : [];
  const planQuotas = planRows.map((row) => `${row.name || row.nama}: ${row.perDay}/hari`).join(', ');
  const planCaption = input.uploadPlan?.caption
    || (input.uploadPlan ? `Target: ${input.uploadPlan.total ?? 0}/hari (${input.uploadPlan.count ?? planRows.length} akun)` : '');
  const context = [
    `Filter layar: bulan ${screenMonth ? monthLabel(screenMonth) : 'Semua bulan'}, tanggal ${filters.date || 'semua hari'}, produk ${filters.produk && filters.produk !== 'Semua' ? filters.produk : 'semua'}, tim/akun ${filters.tim && filters.tim !== 'Semua' ? filters.tim : 'semua'}.`,
    `Total sesuai layar: mentahan ${totals.mentahan} (belum dipakai ${totals.belum}, sudah dipakai ${totals.dipakai}), klip ${totals.klip}, upload ${totals.upload}.`,
    planCaption ? `Target upload: ${planCaption}. Kuota per akun: ${planQuotas || 'tidak ada akun aktif'}.` : '',
    monthly.length
      ? `Power bulanan: ${monthly.map((month) => `${month.label || month.month} mentahan ${month.mentahan}, produksi ${month.produksi}, publish ${month.publish}`).join(' | ')}.`
      : '',
    input.violations != null ? `Pelanggaran tercatat: ${input.violations}.` : '',
  ].filter(Boolean).join('\n');
  const detailText = details.length
    ? details.map((detail) => `DALAM CAKUPAN\n${detailToMarkdown(detail)}`).join('\n\n')
    : '';
  const missText = found.miss
    ? [
      'TIDAK ADA PRODUK YANG COCOK DENGAN PERTANYAAN.',
      'Katakan bahwa nama itu tidak ada di data.',
      `Nama terdekat: ${found.closest.map((item) => item.name).join(', ') || '(tidak ada nama yang mirip)'}.`,
    ].join('\n')
    : '';
  const fixed = [instructions, `Pertanyaan: "${question}"`, context, missText, detailText].filter(Boolean).join('\n\n');
  const tableBudget = Math.max(1200, PROMPT_CHAR_LIMIT - fixed.length - 400);
  const table = fitProductTable(tableRows, tableBudget);
  const tableSection = [
    'Tabel semua produk pada filter layar (nama, mentahan, edit, upload, total view, rata-rata view), diurutkan dari upload terbesar.',
    table.note,
    table.text,
  ].filter(Boolean).join('\n');
  let prompt = `${fixed}\n\n${tableSection}`;
  if (prompt.length > PROMPT_CHAR_LIMIT) {
    prompt = prompt.slice(0, PROMPT_CHAR_LIMIT);
  }
  const fallback = found.matches.length
    ? details.map(detailToMarkdown).join('\n\n')
    : (found.miss
      ? [
        '**Nama produk tidak ditemukan di data.**',
        '',
        'Pertanyaan tidak cocok dengan nama produk yang ada. Angka tidak bisa diisi.',
        '',
        'Nama terdekat:',
        ...(found.closest.length ? found.closest.map((item) => `- ${item.name}`) : ['- Tidak ada nama yang mirip.']),
      ].join('\n')
      : executiveFallback(totals, tableRows, monthly));
  return {
    prompt,
    fallback,
    matches: found.matches,
    miss: found.miss,
    closest: found.closest,
    details,
    tableRows,
    omittedProducts: table.omitted,
  };
}
