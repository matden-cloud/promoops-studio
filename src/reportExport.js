import { formatIdNumber } from './rekapProduk.js';

const INK = '111827';
const MUTED = '6B7280';
const EMERALD = '047857';
const EMERALD_DARK = '064E3B';
const PAPER = 'F8FAF9';
const WHITE = 'FFFFFF';
const LINE = 'D1FAE5';
const SLIDE_W = 13.333;
const SLIDE_H = 7.5;

function clip(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function num(value) {
  if (value == null || value === '') return '-';
  return formatIdNumber(value);
}

function plainLines(markdown) {
  return String(markdown || '')
    .replace(/\r\n/g, '\n')
    .replace(/\*\*/g, '')
    .split('\n')
    .map((line) => line.replace(/^\s*>\s?/, '').trimEnd());
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function pptxLibrary() {
  const mod = await import('pptxgenjs');
  return mod.default || mod;
}

async function pdfLibrary() {
  const pdfMod = await import('jspdf');
  const tableMod = await import('jspdf-autotable');
  return {
    jsPDF: pdfMod.jsPDF,
    autoTable: tableMod.default || tableMod,
  };
}

function coverMeta(report) {
  const bits = [`Tim / akun: ${report.timLabel || 'Semua tim & akun'}`, `Produk: ${report.produkLabel || 'Semua produk'}`];
  if (report.dateLabel) bits.push(`Tanggal: ${report.dateLabel}`);
  if (report.query) bits.push(`Pencarian: ${report.query}`);
  return bits.join('   ·   ');
}

function addContentChrome(slide, pptx, title, subtitle) {
  slide.background = { color: PAPER };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: SLIDE_W, h: 0.12, fill: { color: EMERALD },
  });
  slide.addText(title, {
    x: 0.48, y: 0.28, w: 10.4, h: 0.4,
    fontFace: 'Arial', fontSize: 22, bold: true, color: INK, margin: 0,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.48, y: 0.7, w: 12.3, h: 0.3,
      fontFace: 'Arial', fontSize: 12, color: MUTED, margin: 0,
    });
  }
  slide.addText('PromoOps Studio', {
    x: 9.4, y: 7.12, w: 3.4, h: 0.24,
    fontFace: 'Arial', fontSize: 10, color: '9CA3AF', align: 'right', margin: 0,
  });
}

function headerCell(text) {
  return {
    text,
    options: { fill: { color: EMERALD_DARK }, color: WHITE, bold: true, align: 'center' },
  };
}

function bodyCell(text, align = 'center') {
  return { text: String(text), options: { align, color: INK } };
}

function buildPptx(pptx, report, insights) {
  pptx.defineLayout({ name: 'LAYOUT_16x9', width: SLIDE_W, height: SLIDE_H });
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'PromoOps Studio';
  pptx.title = `Laporan Video ${report.monthLabel || ''}`.trim();
  pptx.theme = { headFontFace: 'Arial', bodyFontFace: 'Arial' };

  const cover = pptx.addSlide();
  cover.background = { color: EMERALD_DARK };
  cover.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 0.22, h: SLIDE_H, fill: { color: '34D399' },
  });
  cover.addText('LAPORAN VIDEO', {
    x: 0.75, y: 1.7, w: 11, h: 0.32,
    fontFace: 'Arial', fontSize: 13, bold: true, color: 'A7F3D0', margin: 0, charSpacing: 1.5,
  });
  cover.addText(report.monthLabel || 'Bulan ini', {
    x: 0.75, y: 2.15, w: 11.5, h: 0.9,
    fontFace: 'Arial', fontSize: 40, bold: true, color: WHITE, margin: 0,
  });
  cover.addText(coverMeta(report), {
    x: 0.75, y: 3.25, w: 11, h: 0.7,
    fontFace: 'Arial', fontSize: 16, color: 'D1FAE5', margin: 0,
  });
  cover.addText(report.generatedLabel ? `Disusun ${report.generatedLabel}` : 'PromoOps Studio', {
    x: 0.75, y: 6.5, w: 8, h: 0.3,
    fontFace: 'Arial', fontSize: 12, color: 'A7F3D0', margin: 0,
  });

  const kpiSlide = pptx.addSlide();
  addContentChrome(kpiSlide, pptx, 'Ringkasan bulan ini', 'Angka mengikuti bulan, produk, tim, tanggal, dan pencarian yang sedang dipilih.');
  const cards = [
    ['Mentahan', num(report.kpi.mentahan)],
    ['Belum dipakai', num(report.kpi.belumDipakai)],
    ['Sudah dipakai', num(report.kpi.sudahDipakai)],
    ['Klip', num(report.kpi.klip)],
    ['Upload', num(report.kpi.upload)],
    ['Target', num(report.kpi.target)],
  ];
  cards.forEach((card, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = 0.48 + column * 4.2;
    const y = 1.25 + row * 1.85;
    kpiSlide.addShape(pptx.ShapeType.roundRect, {
      x, y, w: 3.95, h: 1.65,
      fill: { color: WHITE },
      rectRadius: 0.1,
      shadow: { type: 'outer', color: '064E3B', opacity: 0.08, blur: 8, offset: 2 },
    });
    kpiSlide.addText(card[0], {
      x: x + 0.22, y: y + 0.22, w: 3.5, h: 0.32,
      fontFace: 'Arial', fontSize: 13, color: MUTED, margin: 0,
    });
    kpiSlide.addText(card[1], {
      x: x + 0.22, y: y + 0.62, w: 3.5, h: 0.7,
      fontFace: 'Arial', fontSize: 32, bold: true, color: EMERALD_DARK, margin: 0,
    });
  });
  const ratio = report.kpi.ratio == null ? '' : ` (${report.kpi.ratio}%)`;
  const viewLine = report.kpi.viewSum
    ? `View ${num(report.kpi.viewSum)}, rata-rata ${num(report.kpi.avgView)}.`
    : 'Data view bulan ini belum masuk.';
  kpiSlide.addText(`Upload ${num(report.kpi.upload)} dari target rencana ${num(report.kpi.target)}${ratio}. Rencana ${report.kpi.dailyTarget} video/hari × ${report.kpi.elapsedDays} hari. ${viewLine}`, {
    x: 0.48, y: 5.15, w: 12.3, h: 0.7,
    fontFace: 'Arial', fontSize: 14, color: INK, margin: 0,
  });

  const chartSlide = pptx.addSlide();
  addContentChrome(chartSlide, pptx, 'Power bulanan', 'Mentahan, produksi editor, dan publish. Grafik memakai semua bulan pada filter produk, tim, dan pencarian.');
  const series = report.series || [];
  if (series.length) {
    chartSlide.addChart(pptx.ChartType.bar, [
      { name: 'Mentahan', labels: series.map((item) => item.label), values: series.map((item) => item.mentahan) },
      { name: 'Produksi', labels: series.map((item) => item.label), values: series.map((item) => item.produksi) },
      { name: 'Publish', labels: series.map((item) => item.label), values: series.map((item) => item.publish) },
    ], {
      x: 0.4, y: 1.15, w: 12.5, h: 5.7,
      barDir: 'col',
      barGrouping: 'clustered',
      showLegend: true,
      legendPos: 'b',
      chartColors: ['059669', '0F766E', '111827'],
      showValue: false,
      showTitle: false,
      valAxisMinVal: 0,
      catAxisLabelColor: '374151',
      valAxisLabelColor: '374151',
      catAxisLabelFontSize: 11,
      valAxisLabelFontSize: 11,
      chartDataBorder: { pt: 0, color: WHITE },
    });
  } else {
    chartSlide.addText('Belum ada data bulanan pada filter ini.', {
      x: 0.5, y: 2.4, w: 12, h: 0.4, fontFace: 'Arial', fontSize: 16, color: MUTED,
    });
  }

  const productSlide = pptx.addSlide();
  addContentChrome(
    productSlide,
    pptx,
    'Produk menurut upload',
    report.productTotal > (report.products || []).length
      ? `${report.products.length} produk teratas dari ${report.productTotal}.`
      : 'Mentahan, edit, upload, total view, dan rata-rata view.',
  );
  const productRows = (report.products || []).length
    ? (report.products || []).map((item) => ([
      bodyCell(clip(item.name, 42), 'left'),
      bodyCell(num(item.raw)),
      bodyCell(num(item.edit)),
      bodyCell(num(item.upload)),
      bodyCell(num(item.viewSum)),
      bodyCell(num(item.avgView)),
    ]))
    : [[bodyCell('Belum ada produk pada cakupan ini.', 'left'), bodyCell('-'), bodyCell('-'), bodyCell('-'), bodyCell('-'), bodyCell('-')]];
  productSlide.addTable([
    ['Produk', 'Mentahan', 'Edit', 'Upload', 'Total view', 'Rata view'].map(headerCell),
    ...productRows,
  ], {
    x: 0.45, y: 1.2, w: 12.4,
    colW: [4.2, 1.5, 1.4, 1.5, 1.9, 1.9],
    border: [
      { pt: 0.5, color: LINE },
      { pt: 0.5, color: LINE },
      { pt: 0.5, color: LINE },
      { pt: 0.5, color: LINE },
    ],
    fontFace: 'Arial',
    fontSize: 12,
    color: INK,
    valign: 'middle',
    fill: { color: WHITE },
  });

  const videoSlide = pptx.addSlide();
  addContentChrome(videoSlide, pptx, 'Video view tertinggi', 'Sumber Data_View pada bulan laporan.');
  const videoRows = (report.videos || []).map((item) => ([
    bodyCell(item.date || '-', 'left'),
    bodyCell(clip(item.akun, 22), 'left'),
    bodyCell(clip(item.produk, 28), 'left'),
    bodyCell(num(item.view)),
    bodyCell(item.fyp || '-'),
  ]));
  if (!videoRows.length) {
    videoSlide.addText('Belum ada data view pada bulan ini.', {
      x: 0.55, y: 1.5, w: 10, h: 0.4,
      fontFace: 'Arial', fontSize: 16, color: MUTED, margin: 0,
    });
  }
  if (videoRows.length) videoSlide.addTable([
    ['Tanggal', 'Akun', 'Produk', 'View', 'Status'].map(headerCell),
    ...videoRows,
  ], {
    x: 0.45, y: 1.2, w: 12.4,
    colW: [1.8, 2.8, 3.6, 1.8, 2.4],
    border: [
      { pt: 0.5, color: LINE },
      { pt: 0.5, color: LINE },
      { pt: 0.5, color: LINE },
      { pt: 0.5, color: LINE },
    ],
    fontFace: 'Arial',
    fontSize: 12,
    valign: 'middle',
    fill: { color: WHITE },
  });

  const akunSlide = pptx.addSlide();
  addContentChrome(akunSlide, pptx, 'Upload akun dibanding target', `${report.plan?.caption || 'Target akun'}. Target periode = kuota harian × ${report.plan?.elapsedDays || 0} hari.`);
  const akunRows = (report.accounts || []).length
    ? report.accounts.map((item) => ([
      bodyCell(clip(item.nama, 28), 'left'),
      bodyCell(num(item.perDay)),
      bodyCell(num(item.upload)),
      bodyCell(num(item.target)),
      bodyCell(item.gap > 0 ? `+${num(item.gap)}` : num(item.gap)),
      bodyCell(item.ratio == null ? '-' : `${item.ratio}%`),
    ]))
    : [[bodyCell('Belum ada akun pada rencana.', 'left'), bodyCell('-'), bodyCell('-'), bodyCell('-'), bodyCell('-'), bodyCell('-')]];
  akunSlide.addTable([
    ['Akun', 'Kuota/hari', 'Upload', 'Target', 'Selisih', 'Persen'].map(headerCell),
    ...akunRows,
  ], {
    x: 0.45, y: 1.2, w: 12.4,
    colW: [3.6, 1.8, 1.7, 1.7, 1.8, 1.8],
    border: [
      { pt: 0.5, color: LINE },
      { pt: 0.5, color: LINE },
      { pt: 0.5, color: LINE },
      { pt: 0.5, color: LINE },
    ],
    fontFace: 'Arial',
    fontSize: 13,
    valign: 'middle',
    fill: { color: WHITE },
  });

  const insightSlide = pptx.addSlide();
  addContentChrome(insightSlide, pptx, 'Insight & Rekomendasi', 'Disusun dari angka laporan. Jika asisten tidak menjawab, teks ini ringkasan lokal.');
  const bullets = (insights || []).slice(0, 6);
  insightSlide.addText(bullets.length ? bullets.map((line) => ({
    text: line,
    options: { bullet: { code: '25A0' }, breakLine: true },
  })) : [{ text: 'Belum ada insight.', options: { bullet: false } }], {
    x: 0.55, y: 1.25, w: 12.2, h: 5.5,
    fontFace: 'Arial', fontSize: 16, color: INK, paraSpaceAfter: 12, valign: 'top',
  });
  return pptx;
}

function buildAnswerPptx(pptx, title, markdown) {
  pptx.defineLayout({ name: 'LAYOUT_16x9', width: SLIDE_W, height: SLIDE_H });
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = title;
  const lines = plainLines(markdown).filter((line) => line.trim());
  const chunks = [];
  for (let index = 0; index < lines.length; index += 12) chunks.push(lines.slice(index, index + 12));
  if (!chunks.length) chunks.push(['Belum ada jawaban.']);
  chunks.slice(0, 8).forEach((chunk, index) => {
    const slide = pptx.addSlide();
    addContentChrome(slide, pptx, index === 0 ? title : `${title} (${index + 1})`, 'Jawaban asisten, disalin dari percakapan.');
    slide.addText(chunk.map((line) => ({ text: line, options: { breakLine: true } })), {
      x: 0.55, y: 1.2, w: 12.2, h: 5.6,
      fontFace: 'Arial', fontSize: 16, color: INK, paraSpaceAfter: 8, valign: 'top',
    });
  });
  return pptx;
}

async function writePpt(pptx) {
  const outputType = typeof window === 'undefined' ? 'nodebuffer' : 'blob';
  return pptx.write({ outputType });
}

export async function renderMonthlyPpt(report, insights) {
  const PptxGenJS = await pptxLibrary();
  const pptx = buildPptx(new PptxGenJS(), report, insights);
  return writePpt(pptx);
}

export async function renderAnswerPpt(title, markdown) {
  const PptxGenJS = await pptxLibrary();
  const pptx = buildAnswerPptx(new PptxGenJS(), title || 'Jawaban Asisten AI', markdown);
  return writePpt(pptx);
}

export async function downloadMonthlyPpt(report, insights) {
  const file = await renderMonthlyPpt(report, insights);
  saveBlob(file instanceof Blob ? file : new Blob([file]), `${report.fileBase || 'Laporan-Video'}.pptx`);
}

export async function downloadAnswerPpt(title, markdown) {
  const file = await renderAnswerPpt(title, markdown);
  saveBlob(file instanceof Blob ? file : new Blob([file]), 'Jawaban-Asisten-AI.pptx');
}

function pdfColor(doc, rgb) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

function pdfHeader(doc, title) {
  doc.setFillColor(6, 78, 59);
  doc.rect(0, 0, 297, 16, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(title, 12, 10.5);
  doc.setTextColor(17, 24, 39);
}

function pdfFooter(doc) {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text('PromoOps Studio', 12, 204);
    doc.text(`${page} / ${pages}`, 285, 204, { align: 'right' });
  }
}

function drawBars(doc, series) {
  const x = 12;
  const y = 118;
  const w = 273;
  const h = 62;
  doc.setDrawColor(209, 250, 229);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y - 4, w, h + 16, 2, 2, 'FD');
  const max = Math.max(1, ...series.flatMap((item) => [item.mentahan || 0, item.produksi || 0, item.publish || 0]));
  const groupW = (w - 8) / Math.max(series.length, 1);
  const barW = Math.min(5.5, (groupW - 6) / 3);
  const colors = [[5, 150, 105], [15, 118, 110], [31, 41, 55]];
  series.forEach((item, index) => {
    const gx = x + 4 + index * groupW;
    [item.mentahan || 0, item.produksi || 0, item.publish || 0].forEach((value, colorIndex) => {
      const height = (value / max) * (h - 14);
      doc.setFillColor(...colors[colorIndex]);
      doc.rect(gx + colorIndex * (barW + 0.7), y + h - 12 - height, barW, Math.max(height, 0.4), 'F');
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    pdfColor(doc, [75, 85, 99]);
    const shortLabel = /^\d{4}-\d{2}$/.test(String(item.month || ''))
      ? `${['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][Number(String(item.month).slice(5, 7)) - 1]} ${String(item.month).slice(2, 4)}`
      : clip(item.label, 8);
    doc.text(shortLabel, gx, y + h + 1);
  });
  const legend = [['Mentahan', colors[0]], ['Produksi', colors[1]], ['Publish', colors[2]]];
  legend.forEach((item, index) => {
    const lx = x + 4 + index * 38;
    doc.setFillColor(...item[1]);
    doc.rect(lx, y + h + 6, 4, 3, 'F');
    doc.setFontSize(8);
    pdfColor(doc, [17, 24, 39]);
    doc.text(item[0], lx + 6, y + h + 8.5);
  });
}

function sectionTitle(doc, title, y) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  pdfColor(doc, [6, 78, 59]);
  doc.text(title, 12, y);
  return y + 4;
}

export async function renderMonthlyPdf(report, insights) {
  const { jsPDF, autoTable } = await pdfLibrary();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  pdfHeader(doc, `Laporan Video ${report.monthLabel || ''}`.trim());
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  pdfColor(doc, [55, 65, 81]);
  doc.text(coverMeta(report), 12, 24);
  if (report.generatedLabel) doc.text(`Disusun ${report.generatedLabel}`, 12, 30);

  const kpi = report.kpi || {};
  const cards = [
    ['Mentahan', num(kpi.mentahan)],
    ['Belum dipakai', num(kpi.belumDipakai)],
    ['Sudah dipakai', num(kpi.sudahDipakai)],
    ['Klip', num(kpi.klip)],
    ['Upload', num(kpi.upload)],
    ['Target', num(kpi.target)],
  ];
  cards.forEach((card, index) => {
    const x = 12 + (index % 6) * 46.5;
    doc.setFillColor(236, 253, 245);
    doc.roundedRect(x, 36, 44, 22, 2, 2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    pdfColor(doc, [4, 120, 87]);
    doc.text(card[0], x + 3, 44);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    pdfColor(doc, [6, 78, 59]);
    doc.text(card[1], x + 3, 53);
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  pdfColor(doc, [17, 24, 39]);
  const ratio = kpi.ratio == null ? '' : ` (${kpi.ratio}%)`;
  const viewLine = kpi.viewSum ? `View ${num(kpi.viewSum)}, rata-rata ${num(kpi.avgView)}.` : 'Data view bulan ini belum masuk.';
  doc.text(`Upload ${num(kpi.upload)} dari target ${num(kpi.target)}${ratio}. Rencana ${num(kpi.dailyTarget)} video/hari × ${kpi.elapsedDays || 0} hari. ${viewLine}`, 12, 66);
  sectionTitle(doc, 'Power bulanan', 76);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  pdfColor(doc, [107, 114, 128]);
  doc.text('Mentahan, produksi, dan publish pada semua bulan di filter produk, tim, dan pencarian.', 12, 81);
  if ((report.series || []).length) drawBars(doc, report.series.filter((item) => item.mentahan || item.produksi || item.publish).slice(-12));
  else doc.text('Belum ada data bulanan.', 12, 90);

  doc.addPage();
  pdfHeader(doc, 'Produk menurut upload');
  autoTable(doc, {
    startY: 22,
    head: [['Produk', 'Mentahan', 'Edit', 'Upload', 'Total view', 'Rata view']],
    body: (report.products || []).length
      ? report.products.map((item) => [item.name, num(item.raw), num(item.edit), num(item.upload), num(item.viewSum), num(item.avgView)])
      : [['Belum ada produk pada cakupan ini.', '-', '-', '-', '-', '-']],
    styles: { font: 'helvetica', fontSize: 9, textColor: [17, 24, 39], cellPadding: 2.2 },
    headStyles: { fillColor: [6, 78, 59], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 249] },
    margin: { left: 12, right: 12 },
  });

  let cursor = doc.lastAutoTable.finalY + 10;
  if (cursor > 150) {
    doc.addPage();
    pdfHeader(doc, 'Video dan akun');
    cursor = 22;
  } else {
    sectionTitle(doc, 'Video view tertinggi', cursor);
    cursor += 2;
  }
  autoTable(doc, {
    startY: cursor,
    head: [['Tanggal', 'Akun', 'Produk', 'View', 'Status']],
    body: (report.videos || []).length
      ? report.videos.map((item) => [item.date || '-', item.akun, item.produk, num(item.view), item.fyp || '-'])
      : [['Belum ada data view pada bulan ini.', '-', '-', '-', '-']],
    styles: { font: 'helvetica', fontSize: 9, textColor: [17, 24, 39], cellPadding: 2 },
    headStyles: { fillColor: [15, 118, 110], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [240, 253, 250] },
    margin: { left: 12, right: 12 },
  });

  cursor = doc.lastAutoTable.finalY + 10;
  if (cursor > 150) {
    doc.addPage();
    pdfHeader(doc, 'Upload akun dibanding target');
    cursor = 22;
  } else {
    sectionTitle(doc, 'Upload akun dibanding target', cursor);
    cursor += 2;
  }
  autoTable(doc, {
    startY: cursor,
    head: [['Akun', 'Kuota/hari', 'Upload', 'Target', 'Selisih', 'Persen']],
    body: (report.accounts || []).length
      ? report.accounts.map((item) => [item.nama, num(item.perDay), num(item.upload), num(item.target), item.gap > 0 ? `+${num(item.gap)}` : num(item.gap), item.ratio == null ? '-' : `${item.ratio}%`])
      : [['Belum ada akun.', '-', '-', '-', '-', '-']],
    styles: { font: 'helvetica', fontSize: 9, textColor: [17, 24, 39], cellPadding: 2.2 },
    headStyles: { fillColor: [6, 78, 59], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 249] },
    margin: { left: 12, right: 12 },
  });

  doc.addPage();
  pdfHeader(doc, 'Insight & Rekomendasi');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  pdfColor(doc, [17, 24, 39]);
  const lines = (insights || []).slice(0, 8);
  let y = 28;
  if (!lines.length) doc.text('Belum ada insight.', 14, y);
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(`-  ${line}`, 268);
    if (y + wrapped.length * 6 > 198) {
      doc.addPage();
      pdfHeader(doc, 'Insight & Rekomendasi');
      y = 28;
    }
    doc.text(wrapped, 14, y);
    y += wrapped.length * 6 + 3;
  }
  pdfFooter(doc);
  return typeof window === 'undefined' ? new Uint8Array(doc.output('arraybuffer')) : doc.output('blob');
}

export async function downloadMonthlyPdf(report, insights) {
  const file = await renderMonthlyPdf(report, insights);
  saveBlob(file instanceof Blob ? file : new Blob([file], { type: 'application/pdf' }), `${report.fileBase || 'Laporan-Video'}.pdf`);
}

export async function renderAnswerPdf(title, markdown) {
  const { jsPDF } = await pdfLibrary();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  pdfHeader(doc, title || 'Jawaban Asisten AI');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  pdfColor(doc, [17, 24, 39]);
  const lines = plainLines(markdown);
  let y = 26;
  const source = lines.length ? lines : ['Belum ada jawaban.'];
  for (const line of source) {
    const wrapped = doc.splitTextToSize(line || ' ', 270);
    if (y + wrapped.length * 6 > 198) {
      doc.addPage();
      pdfHeader(doc, title || 'Jawaban Asisten AI');
      y = 26;
    }
    doc.text(wrapped, 12, y);
    y += wrapped.length * 6 + 1.5;
  }
  pdfFooter(doc);
  return typeof window === 'undefined' ? new Uint8Array(doc.output('arraybuffer')) : doc.output('blob');
}

export async function downloadAnswerPdf(title, markdown) {
  const file = await renderAnswerPdf(title, markdown);
  saveBlob(file instanceof Blob ? file : new Blob([file], { type: 'application/pdf' }), 'Jawaban-Asisten-AI.pdf');
}
