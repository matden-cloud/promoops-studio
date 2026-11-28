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
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'PromoOps Studio';
  pptx.title = `Laporan Video ${report.monthLabel || ''}`.trim();
  pptx.theme = { headFontFace: 'Arial', bodyFontFace: 'Arial' };

  const num = (v) => formatIdNumber(Number(v) || 0);
  const extras = report.extras || {};

  // Helper kartu video (dipakai Slide 3 & Slide 5)
  const renderVideoCards = (slide, list, emptyText, isFyp = false) => {
    if (!list || list.length === 0) {
      slide.addText(emptyText, { x: 0.6, y: 2.0, w: 12, h: 0.6, fontSize: 14, color: MUTED });
      return;
    }
    const count = Math.min(3, list.length);
    const cardW = 3.75;
    const gap = 0.44;
    const startX = (SLIDE_W - (count * cardW + (count - 1) * gap)) / 2;
    for (let i = 0; i < count; i++) {
      const v = list[i];
      const x = startX + i * (cardW + gap);
      slide.addShape(pptx.ShapeType.roundRect, {
        x, y: 1.35, w: cardW, h: 5.7, fill: { color: WHITE }, line: { color: LINE, pt: 1 },
      });
      const topMeta = isFyp
        ? `${num(v.view)} view · ${v.akun}`
        : `${v.produk} · ${v.creator || '-'}`;
      slide.addText(topMeta, {
        x: x + 0.15, y: 1.45, w: cardW - 0.3, h: 0.28, fontSize: 10, bold: true, color: EMERALD,
      });
      slide.addText(String(v.fileName || 'Video').slice(0, 44), {
        x: x + 0.15, y: 1.73, w: cardW - 0.3, h: 0.38, fontSize: 9.5, bold: true, color: INK,
      });
      if (v.catatan || (isFyp && v.status)) {
        slide.addText(String(v.catatan || v.status).slice(0, 46), {
          x: x + 0.15, y: 2.08, w: cardW - 0.3, h: 0.25, fontSize: 8.5, color: MUTED,
        });
      }
      if (v.dataUri) {
        slide.addMedia({
          type: 'video',
          data: v.dataUri,
          x: x + 0.25,
          y: 2.38,
          w: cardW - 0.5,
          h: 4.5,
        });
      } else {
        slide.addText(
          v.url
            ? { text: 'Buka Video ↗', options: { hyperlink: { url: v.url }, color: EMERALD, underline: true } }
            : 'File tidak ditemukan di OneDrive / >20 MB.',
          { x: x + 0.25, y: 4.2, w: cardW - 0.5, h: 0.7, fontSize: 11, align: 'center', color: MUTED },
        );
      }
    }
  };

  // SLIDE 1: Ringkasan bulan ini
  const kpiSlide = pptx.addSlide();
  addContentChrome(kpiSlide, pptx, `Ringkasan bulan ini — ${report.monthLabel || ''}`, coverMeta(report));
  const kpi = report.kpi || {};
  const kpiCards = [
    ['Mentahan', num(kpi.mentahan)],
    ['Belum dipakai', num(kpi.belumDipakai)],
    ['Sudah dipakai', num(kpi.sudahDipakai)],
    ['Klip', num(kpi.klip)],
    ['Upload', num(kpi.upload)],
    ['Target', num(kpi.target)],
  ];
  for (let i = 0; i < kpiCards.length; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.6 + col * 4.12;
    const y = 1.45 + row * 1.95;
    kpiSlide.addShape(pptx.ShapeType.roundRect, {
      x, y, w: 3.88, h: 1.65, fill: { color: WHITE }, line: { color: LINE, pt: 1 },
    });
    kpiSlide.addText(kpiCards[i][0], { x: x + 0.22, y: y + 0.2, w: 3.4, h: 0.35, fontSize: 12, color: MUTED });
    kpiSlide.addText(kpiCards[i][1], { x: x + 0.22, y: y + 0.65, w: 3.4, h: 0.7, fontSize: 32, bold: true, color: EMERALD_DARK });
  }
  const ratio = kpi.target > 0 ? Math.round((kpi.upload / kpi.target) * 100) : 0;
  kpiSlide.addText(
    `Upload ${num(kpi.upload)} dari target rencana ${num(kpi.target)} (${ratio}%). View ${num(kpi.totalView)}, rata-rata ${num(kpi.avgView)}.`,
    { x: 0.6, y: 5.65, w: 12.1, h: 0.5, fontSize: 12, color: INK },
  );

  // SLIDE 2: Mentahan Paling Banyak
  const rawTopSlide = pptx.addSlide();
  addContentChrome(rawTopSlide, pptx, 'Mentahan Paling Banyak', `Daftar produk dengan jumlah mentahan terbanyak pada ${report.monthLabel || 'periode ini'}.`);
  const topRaw = extras.mentahanTerbanyak || [];
  if (topRaw.length) {
    const tRaw = [[headerCell('No'), headerCell('Produk'), headerCell('Total Mentahan'), headerCell('Belum Dipakai'), headerCell('Sudah Dipakai')]];
    for (let i = 0; i < topRaw.length; i++) {
      tRaw.push([
        bodyCell(String(i + 1), 'center'),
        bodyCell(topRaw[i].produk, 'left'),
        bodyCell(num(topRaw[i].total), 'center'),
        bodyCell(num(topRaw[i].belum), 'center'),
        bodyCell(num(topRaw[i].sudah), 'center'),
      ]);
    }
    rawTopSlide.addTable(tRaw, {
      x: 0.6, y: 1.45, w: 12.13, colW: [0.8, 5.53, 1.9, 1.95, 1.95],
      border: { type: 'solid', color: LINE, pt: 0.5 }, fontSize: 10.5, rowH: 0.48,
    });
  } else {
    rawTopSlide.addText('Belum ada data mentahan pada bulan ini.', { x: 0.6, y: 2.0, w: 12, h: 0.5, fontSize: 13, color: MUTED });
  }

  // SLIDE 3: Mentahan Paling Bagus (Ditandai Bintang & Bisa Diputar)
  const rawStarSlide = pptx.addSlide();
  addContentChrome(rawStarSlide, pptx, 'Mentahan Paling Bagus (Berbintang)', 'File mentahan yang ditandai bintang — klik putar langsung di PowerPoint.');
  renderVideoCards(rawStarSlide, extras.mentahanBagusVideos || [], 'Belum ada file mentahan yang ditandai bintang pada bulan ini.', false);

  // SLIDE 4: Jumlah Publish & Upload via Repliz (Gabungan 1 Slide)
  const pubSlide = pptx.addSlide();
  addContentChrome(pubSlide, pptx, 'Jumlah Publish & Upload via Repliz', 'Perbandingan total publish akun dengan status upload otomatis Repliz.');
  const rz = extras.repliz || { total: 0, success: 0, pending: 0, error: 0, rows: [] };
  const pubCards = [
    ['Total Publish', num(kpi.upload)],
    ['Target Publish', num(kpi.target)],
    ['Repliz Berhasil', num(rz.success)],
    ['Repliz Menunggu / Gagal', `${num(rz.pending)} / ${num(rz.error)}`],
  ];
  for (let c = 0; c < pubCards.length; c++) {
    const x = 0.6 + c * 3.08;
    pubSlide.addShape(pptx.ShapeType.roundRect, {
      x, y: 1.35, w: 2.88, h: 1.0, fill: { color: WHITE }, line: { color: LINE, pt: 1 },
    });
    pubSlide.addText(pubCards[c][0], { x: x + 0.16, y: 1.45, w: 2.55, h: 0.28, fontSize: 10.5, color: MUTED });
    pubSlide.addText(pubCards[c][1], { x: x + 0.16, y: 1.75, w: 2.55, h: 0.45, fontSize: 22, bold: true, color: EMERALD_DARK });
  }
  const akunRows = (report.accountTargets || []).slice(0, 6);
  pubSlide.addText('Publish per Akun vs Target', { x: 0.6, y: 2.55, w: 5.8, h: 0.3, fontSize: 12, bold: true, color: EMERALD_DARK });
  if (akunRows.length) {
    const tAkun = [[headerCell('Akun'), headerCell('Upload'), headerCell('Target'), headerCell('Persen')]];
    for (const a of akunRows) {
      tAkun.push([
        bodyCell(a.label || a.akun || '-', 'left'),
        bodyCell(num(a.upload), 'center'),
        bodyCell(num(a.target), 'center'),
        bodyCell(`${Math.round(Number(a.percent || a.persen) || 0)}%`, 'center'),
      ]);
    }
    pubSlide.addTable(tAkun, {
      x: 0.6, y: 2.9, w: 5.85, colW: [2.75, 1.0, 1.0, 1.1],
      border: { type: 'solid', color: LINE, pt: 0.5 }, fontSize: 9.5, rowH: 0.52,
    });
  }
  pubSlide.addText('Upload Terbaru via Repliz', { x: 6.7, y: 2.55, w: 6.0, h: 0.3, fontSize: 12, bold: true, color: EMERALD_DARK });
  if (rz.rows && rz.rows.length) {
    const tRz = [[headerCell('Jadwal'), headerCell('File / Caption'), headerCell('Status')]];
    for (const r of rz.rows.slice(0, 5)) {
      tRz.push([
        bodyCell(String(r.scheduleAt || '-').slice(5, 16).replace('T', ' '), 'left'),
        bodyCell(String(r.mediaFileName || r.description || '-').slice(0, 38), 'left'),
        bodyCell(String(r.status || '-').toUpperCase(), 'center'),
      ]);
    }
    pubSlide.addTable(tRz, {
      x: 6.7, y: 2.9, w: 6.03, colW: [1.55, 3.28, 1.2],
      border: { type: 'solid', color: LINE, pt: 0.5 }, fontSize: 9.5, rowH: 0.52,
    });
  } else {
    pubSlide.addText('Belum ada data jadwal Repliz.', { x: 6.7, y: 3.0, w: 6.0, h: 0.4, fontSize: 11, color: MUTED });
  }

  // SLIDE 5: Video FYP Berbintang (Bisa Diputar)
  const fypSlide = pptx.addSlide();
  addContentChrome(fypSlide, pptx, 'Video FYP Pilihan (Berbintang)', 'Video FYP berbintang / view tertinggi — klik putar langsung di PowerPoint.');
  renderVideoCards(fypSlide, extras.fypBagusVideos || [], 'Belum ada video FYP pada bulan ini.', true);

  // SLIDE 6: Evaluasi Pelanggaran
  const violSlide = pptx.addSlide();
  const vl = extras.violations || { total: 0, rows: [] };
  addContentChrome(violSlide, pptx, 'Evaluasi Pelanggaran', `Total tercatat: ${num(vl.total)} kasus pelanggaran.`);
  if (vl.rows && vl.rows.length) {
    const vTable = [[headerCell('Tanggal'), headerCell('Akun'), headerCell('Produk'), headerCell('Jenis'), headerCell('Penyebab & Sanksi'), headerCell('Status')]];
    for (const v of vl.rows) {
      const detail = [v.penyebab, v.sanksi].filter(Boolean).join(' · ') || v.catatan || '-';
      vTable.push([
        bodyCell(String(v.tanggal || '-'), 'left'),
        bodyCell(String(v.akun || '-'), 'left'),
        bodyCell(String(v.produk || '-'), 'left'),
        bodyCell(String(v.jenis || '-'), 'left'),
        bodyCell(String(detail).slice(0, 70), 'left'),
        bodyCell(String(v.status || '-'), 'center'),
      ]);
    }
    violSlide.addTable(vTable, {
      x: 0.6, y: 1.45, w: 12.13, colW: [1.4, 1.8, 2.0, 2.0, 3.33, 1.6],
      border: { type: 'solid', color: LINE, pt: 0.5 }, fontSize: 9.5, rowH: 0.65,
    });
  } else {
    violSlide.addText('Tidak ada catatan pelanggaran pada periode ini.', { x: 0.6, y: 2.0, w: 12, h: 0.5, fontSize: 14, color: EMERALD });
  }

  // SLIDE 7 (Terakhir): Power Pembuatan Video & Upload (Bulan ke Bulan + Rata-rata)
  const powerSlide = pptx.addSlide();
  addContentChrome(powerSlide, pptx, 'Power Pembuatan & Upload Video (Bulan ke Bulan)', 'Rata-rata kapasitas produksi & upload tim dari bulan aktif.');
  const pw = extras.power || { rows: [], avgMentahan: 0, avgProduksi: 0, avgPublish: 0, activeProdMonths: 0, activePubMonths: 0 };
  const pwCards = [
    ['Rata-rata Mentahan / Bln', num(pw.avgMentahan), `~${num(Math.round(pw.avgMentahan / 30))} / hari`],
    ['Rata-rata Pembuatan Video / Bln', num(pw.avgProduksi), `Dari ${pw.activeProdMonths} bln aktif (~${num(Math.round(pw.avgProduksi / 30))}/hr)`],
    ['Rata-rata Upload Video / Bln', num(pw.avgPublish), `Dari ${pw.activePubMonths} bln aktif (~${num(Math.round(pw.avgPublish / 30))}/hr)`],
  ];
  for (let c = 0; c < pwCards.length; c++) {
    const x = 0.6 + c * 4.12;
    powerSlide.addShape(pptx.ShapeType.roundRect, {
      x, y: 1.35, w: 3.88, h: 1.25, fill: { color: WHITE }, line: { color: LINE, pt: 1 },
    });
    powerSlide.addText(pwCards[c][0], { x: x + 0.18, y: 1.45, w: 3.5, h: 0.28, fontSize: 10.5, color: MUTED });
    powerSlide.addText(pwCards[c][1], { x: x + 0.18, y: 1.75, w: 3.5, h: 0.45, fontSize: 26, bold: true, color: EMERALD_DARK });
    powerSlide.addText(pwCards[c][2], { x: x + 0.18, y: 2.25, w: 3.5, h: 0.25, fontSize: 9.5, color: EMERALD });
  }

  if (pw.rows && pw.rows.length) {
    const tPw = [[headerCell('Bulan'), headerCell('Mentahan'), headerCell('Pembuatan Video (Edit)'), headerCell('Upload Video (Publish)')]];
    for (const m of pw.rows) {
      tPw.push([
        bodyCell(m.label, 'left'),
        bodyCell(num(m.mentahan), 'center'),
        bodyCell(num(m.produksi), 'center'),
        bodyCell(num(m.publish), 'center'),
      ]);
    }
    tPw.push([
      headerCell('RATA-RATA POWER / BULAN'),
      headerCell(num(pw.avgMentahan)),
      headerCell(num(pw.avgProduksi)),
      headerCell(num(pw.avgPublish)),
    ]);
    powerSlide.addTable(tPw, {
      x: 0.6, y: 2.8, w: 12.13, colW: [4.03, 2.7, 2.7, 2.7],
      border: { type: 'solid', color: LINE, pt: 0.5 }, fontSize: 10, rowH: 0.44,
    });
  } else {
    powerSlide.addText('Belum ada data bulanan yang tersedia.', { x: 0.6, y: 2.9, w: 12, h: 0.5, fontSize: 13, color: MUTED });
  }

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
