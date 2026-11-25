import { buildRekapProduk, currentYearMonth, formatIdNumber, formatUploadDate, parseViewCount } from './rekapProduk.js';
import { formatYearMonth } from './starHistory.js';
import { isFypStatus } from './productLookup.js';
import {
  foldProductText,
  isYearMonth,
  pipelineMonth,
  resolvePublishList,
  selectRows,
  shortAccountName,
} from './pipelineFilter.js';

export const DAILY_UPLOAD_TARGET = 15;

function splitTarget(total, count) {
  if (!count) return [];
  const base = Math.floor(total / count);
  let remainder = total - base * count;
  return Array.from({ length: count }, () => {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    return base + extra;
  });
}

export function uploadPlan({
  month,
  accounts = [],
  now = new Date(),
  dailyTarget = DAILY_UPLOAD_TARGET,
} = {}) {
  const ym = isYearMonth(month) ? month : currentYearMonth(now);
  const year = Number(ym.slice(0, 4));
  const monthNumber = Number(ym.slice(5, 7));
  const daysInMonth = new Date(year, monthNumber, 0).getDate() || 30;
  const isCurrent = ym === currentYearMonth(now);
  const elapsedDays = isCurrent ? Math.min(Math.max(now.getDate(), 1), daysInMonth) : daysInMonth;
  const teamTarget = dailyTarget * elapsedDays;
  const fullMonthTarget = dailyTarget * daysInMonth;
  const list = (accounts || []).filter((account) => account && (account.id || account.nama));
  const parts = splitTarget(teamTarget, list.length);
  const perAccount = list.map((account, index) => ({
    id: String(account.id || ''),
    nama: shortAccountName(account.nama || account.label || account.id, [account]),
    target: parts[index] || 0,
  }));
  return {
    month: ym,
    dailyTarget,
    daysInMonth,
    elapsedDays,
    teamTarget,
    fullMonthTarget,
    perAccount,
    isCurrent,
  };
}

export function reportFileBase(month) {
  const label = formatYearMonth(month) || 'Bulan-Ini';
  return `Laporan-Video-${label.replace(/\s+/g, '-')}`;
}

export function shortFypLabel(status) {
  const text = String(status || '').toLowerCase();
  if (!text.trim()) return '—';
  if (text.includes('belum')) return 'Belum FYP';
  if (text.includes('berkelanjutan')) return 'FYP berkelanjutan';
  if (text.includes('super viral')) return 'Super viral';
  if (text.includes('mega fyp')) return 'Mega FYP';
  if (text.includes('fyp') || text.includes('viral')) return 'FYP';
  return String(status).replace(/\s+/g, ' ').trim().slice(0, 24);
}

function accountKey(row, accounts) {
  const id = String(row?.akun || row?.Id_Akun || '').trim();
  if (/^AKN_/i.test(id)) return id.toUpperCase();
  const label = String(row?.Nama_Akun || row?.akunLabel || row?.uploader || '').trim();
  const found = (accounts || []).find((account) => (
    String(account?.id || '').toUpperCase() === label.toUpperCase()
    || String(account?.nama || '').toLowerCase() === label.toLowerCase()
    || String(account?.label || '').toLowerCase() === label.toLowerCase()
  ));
  if (found?.id) return String(found.id).toUpperCase();
  return `n:${foldProductText(shortAccountName(label || id, accounts)) || 'tanpa'}`;
}

export function computeMonthlySeries(input = {}) {
  const filters = {
    ...(input.filters || {}),
    month: 'Semua',
    date: '',
    accounts: input.accounts || input.filters?.accounts || [],
  };
  const lookup = input.accountLookup || {};
  const publish = resolvePublishList(input.publishVideos, input.viewRows);
  const map = new Map();
  const bump = (month, key) => {
    if (!isYearMonth(month)) return;
    if (!map.has(month)) {
      map.set(month, {
        month,
        label: formatYearMonth(month) || month,
        mentahan: 0,
        produksi: 0,
        publish: 0,
      });
    }
    map.get(month)[key] += 1;
  };
  for (const row of selectRows(input.rawAssets || [], 'raw', filters, lookup)) bump(pipelineMonth(row), 'mentahan');
  for (const row of selectRows(input.klipVideos || [], 'klip', filters, lookup)) bump(pipelineMonth(row), 'produksi');
  for (const row of selectRows(publish, 'publish', filters, lookup)) bump(pipelineMonth(row), 'publish');
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function productRows(raw, klip, pubs, views) {
  const map = new Map();
  const ensure = (name) => {
    const clean = String(name || '').replace(/\s+/g, ' ').trim();
    const key = foldProductText(clean);
    if (!clean || !key || clean === 'Tanpa Produk') return null;
    let item = map.get(key);
    if (!item) {
      item = { name: clean, raw: 0, edit: 0, upload: 0, viewSum: 0, rated: 0, avgView: null };
      map.set(key, item);
    }
    return item;
  };
  for (const row of raw) {
    const item = ensure(row.produk);
    if (item) item.raw += 1;
  }
  for (const row of klip) {
    const item = ensure(row.produk);
    if (item) item.edit += 1;
  }
  for (const row of pubs) {
    const item = ensure(row.produk);
    if (item) item.upload += 1;
  }
  for (const row of views) {
    const item = ensure(row.Induk_Barang || row.produk);
    if (!item) continue;
    const view = parseViewCount(row.View);
    if (view == null) continue;
    item.viewSum += view;
    item.rated += 1;
  }
  return [...map.values()]
    .map((item) => ({ ...item, avgView: item.rated ? Math.round(item.viewSum / item.rated) : null }))
    .sort((a, b) => b.upload - a.upload || b.viewSum - a.viewSum || a.name.localeCompare(b.name, 'id'));
}

function topVideos(views, limit, accounts) {
  return (views || [])
    .map((row) => ({ row, view: parseViewCount(row.View) }))
    .filter((item) => item.view != null)
    .sort((a, b) => b.view - a.view)
    .slice(0, limit)
    .map(({ row, view }) => ({
      date: formatUploadDate(row),
      akun: shortAccountName(row.Nama_Akun || row.Id_Akun || row.akun, accounts),
      produk: String(row.Induk_Barang || row.produk || '').replace(/\s+/g, ' ').trim(),
      view,
      file: String(row.Nama_File || '').replace(/\s+/g, ' ').trim(),
      fyp: shortFypLabel(row.Video_FYP),
    }));
}

function generatedLabel(now) {
  try {
    return now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

export function buildMonthlyReport(input = {}) {
  const now = input.now instanceof Date && !Number.isNaN(input.now.getTime()) ? input.now : new Date();
  const month = isYearMonth(input.month) ? input.month : currentYearMonth(now);
  const accounts = input.accounts || [];
  const filters = {
    ...(input.filters || {}),
    month,
    accounts,
  };
  const lookup = input.accountLookup || {};
  const publishList = resolvePublishList(input.publishVideos, input.viewRows);
  const raw = selectRows(input.rawAssets || [], 'raw', filters, lookup);
  const klip = selectRows(input.klipVideos || [], 'klip', filters, lookup);
  const pubs = selectRows(publishList, 'publish', filters, lookup);
  const views = selectRows(input.viewRows || [], 'view', filters, lookup);
  const belumDipakai = raw.filter((row) => row.status === 'Belum Dipakai').length;
  const plan = uploadPlan({
    month,
    accounts,
    now,
    dailyTarget: input.dailyTarget || DAILY_UPLOAD_TARGET,
  });
  const uploadCounts = new Map();
  for (const row of pubs) {
    const key = accountKey(row, accounts);
    uploadCounts.set(key, (uploadCounts.get(key) || 0) + 1);
  }
  let accountRows = plan.perAccount.map((account) => ({
    id: account.id,
    nama: account.nama,
    upload: uploadCounts.get(String(account.id || '').toUpperCase()) || 0,
    target: account.target,
  }));
  const tim = String(filters.tim || '').trim();
  if (/^AKN_/i.test(tim)) {
    accountRows = accountRows.filter((row) => row.id.toUpperCase() === tim.toUpperCase());
  } else if (tim && tim !== 'Semua') {
    const active = accountRows.filter((row) => row.upload > 0);
    if (active.length) accountRows = active;
  } else {
    const matched = accountRows.reduce((sum, row) => sum + row.upload, 0);
    const other = pubs.length - matched;
    if (other > 0) accountRows.push({ id: '', nama: 'Akun lain', upload: other, target: 0 });
  }
  accountRows = accountRows
    .map((row) => ({
      ...row,
      gap: row.upload - row.target,
      ratio: row.target ? Math.round((row.upload / row.target) * 100) : null,
    }))
    .sort((a, b) => b.upload - a.upload || a.nama.localeCompare(b.nama, 'id'));

  const viewReport = buildRekapProduk(views, month);
  let maxView = null;
  for (const row of views) {
    const view = parseViewCount(row.View);
    if (view == null) continue;
    if (maxView == null || view > maxView) maxView = view;
  }
  const target = tim && tim !== 'Semua' && accountRows.length
    ? accountRows.reduce((sum, row) => sum + row.target, 0)
    : plan.teamTarget;
  const products = productRows(raw, klip, pubs, views);
  const productLimit = input.productLimit || 12;
  const passedSeries = Array.isArray(input.monthlySeries) ? input.monthlySeries : null;
  const series = (passedSeries && passedSeries.length ? passedSeries : computeMonthlySeries({ ...input, accounts }))
    .map((item) => ({
      month: item.month,
      label: item.label || formatYearMonth(item.month) || item.month,
      mentahan: item.mentahan || 0,
      produksi: item.produksi || 0,
      publish: item.publish || 0,
    }))
    .filter((item) => isYearMonth(item.month))
    .sort((a, b) => a.month.localeCompare(b.month));
  const ratio = target ? Math.round((pubs.length / target) * 100) : null;
  const produk = String(filters.produk || '').trim();
  const report = {
    month,
    monthLabel: formatYearMonth(month) || month,
    fileBase: reportFileBase(month),
    timLabel: input.timLabel || (tim && tim !== 'Semua' ? shortAccountName(tim, accounts) : 'Semua tim & akun'),
    produkLabel: produk && produk !== 'Semua' ? produk : 'Semua produk',
    dateLabel: String(filters.date || '').trim(),
    query: String(filters.query || '').trim(),
    generatedLabel: generatedLabel(now),
    plan,
    series,
    products: products.slice(0, productLimit),
    productTotal: products.length,
    videos: topVideos(views, input.videoLimit || 8, accounts),
    accounts: accountRows,
    kpi: {
      mentahan: raw.length,
      belumDipakai,
      sudahDipakai: raw.length - belumDipakai,
      klip: klip.length,
      upload: pubs.length,
      target,
      dailyTarget: plan.dailyTarget,
      elapsedDays: plan.elapsedDays,
      daysInMonth: plan.daysInMonth,
      ratio,
      gap: pubs.length - target,
      viewSum: viewReport.totals.viewSum,
      avgView: viewReport.totals.average,
      rated: viewReport.totals.rated,
      maxView,
      fyp: views.filter((row) => isFypStatus(row.Video_FYP)).length,
    },
  };
  return report;
}

export function localInsightBullets(report) {
  const kpi = report?.kpi || {};
  const bullets = [];
  bullets.push(`Upload ${formatIdNumber(kpi.upload || 0)} dari target rencana ${formatIdNumber(kpi.target || 0)} (${kpi.dailyTarget || DAILY_UPLOAD_TARGET} video/hari × ${kpi.elapsedDays || 0} hari${kpi.ratio != null ? `, ${kpi.ratio}%` : ''}).`);
  bullets.push(`Mentahan ${formatIdNumber(kpi.mentahan || 0)} file: ${formatIdNumber(kpi.belumDipakai || 0)} belum dipakai dan ${formatIdNumber(kpi.sudahDipakai || 0)} sudah dipakai. Klip selesai ${formatIdNumber(kpi.klip || 0)}.`);
  const top = report?.products?.[0];
  bullets.push(top
    ? `Produk upload terbanyak: ${top.name} (${formatIdNumber(top.upload)} upload, total view ${formatIdNumber(top.viewSum)}, rata-rata ${formatIdNumber(top.avgView)}).`
    : 'Belum ada produk dengan upload pada cakupan ini.');
  const accounts = report?.accounts || [];
  if (accounts.length) {
    const above = accounts.filter((account) => account.target > 0 && account.upload >= account.target);
    const below = accounts.filter((account) => account.target > 0 && account.upload < account.target);
    bullets.push(`Akun mencapai target: ${above.length ? above.map((account) => account.nama).join(', ') : 'belum ada'}. Di bawah target: ${below.length ? below.map((account) => `${account.nama} (${formatIdNumber(account.upload)}/${formatIdNumber(account.target)})`).join(', ') : 'tidak ada'}.`);
  }
  if ((kpi.viewSum || 0) > 0) {
    bullets.push(`Total view bulan ini ${formatIdNumber(kpi.viewSum)} dari ${formatIdNumber(kpi.rated)} video ber-view. Tertinggi ${formatIdNumber(kpi.maxView)}.`);
  } else {
    bullets.push('Data view untuk bulan ini belum masuk. Angka view tidak diperkirakan.');
  }
  return bullets;
}

export function buildInsightPrompt(report) {
  const kpi = report.kpi;
  const products = (report.products || []).slice(0, 5).map((item) => (
    `${item.name}: upload ${item.upload}, mentahan ${item.raw}, edit ${item.edit}, view ${item.viewSum}, rata-rata ${item.avgView ?? '-'}`
  )).join('\n');
  const accounts = (report.accounts || []).map((item) => (
    `${item.nama}: upload ${item.upload}, target ${item.target}`
  )).join('\n');
  const videos = (report.videos || []).slice(0, 3).map((item) => (
    `${item.date} ${item.produk} ${item.akun} ${item.view} view`
  )).join('\n');
  return [
    'Susun 5 butir insight bahasa Indonesia untuk slide laporan video PromoOps.',
    'Hanya dari angka di bawah. Jangan mengarang penyebab, nama, atau angka baru.',
    'Setiap butir satu kalimat dan diawali tanda minus.',
    'Sebutkan upload dibanding target, produk teratas, dan akun yang di bawah target bila ada.',
    `Bulan: ${report.monthLabel}. Tim/akun: ${report.timLabel}. Produk: ${report.produkLabel}.`,
    `Mentahan ${kpi.mentahan}, belum dipakai ${kpi.belumDipakai}, sudah dipakai ${kpi.sudahDipakai}, klip ${kpi.klip}.`,
    `Upload ${kpi.upload}, target ${kpi.target} (${kpi.dailyTarget}/hari × ${kpi.elapsedDays} hari).`,
    `View total ${kpi.viewSum}, rata-rata ${kpi.avgView ?? '-'}, tertinggi ${kpi.maxView ?? '-'}, FYP ${kpi.fyp}.`,
    products ? `Produk:\n${products}` : 'Produk: tidak ada.',
    accounts ? `Akun:\n${accounts}` : 'Akun: tidak ada.',
    videos ? `Video view tertinggi:\n${videos}` : 'Video view: belum ada.',
  ].join('\n');
}

export function bulletsFromText(text) {
  const lines = String(text || '')
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/\*/g, '').trim())
    .filter(Boolean);
  if (lines.length >= 2) return lines.slice(0, 8);
  return String(text || '')
    .replace(/\*\*/g, '')
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 20)
    .slice(0, 6);
}
