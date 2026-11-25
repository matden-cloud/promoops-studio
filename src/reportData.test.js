import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildInsightPrompt,
  buildMonthlyReport,
  bulletsFromText,
  computeMonthlySeries,
  localInsightBullets,
  reportFileBase,
  uploadPlan,
} from './reportData.js';

const now = new Date(2026, 10, 25);
const accounts = [
  { id: 'AKN_001', nama: 'Jual Kawat', pemegang: 'Deni' },
  { id: 'AKN_002', nama: 'Produk Andalan Kita', pemegang: 'Rizal' },
  { id: 'AKN_003', nama: 'Grosir Hitam', pemegang: 'Isan' },
  { id: 'AKN_004', nama: 'Melifarida Toserba', pemegang: '' },
  { id: 'AKN_005', nama: 'Pasar Digitals', pemegang: 'Rizal' },
  { id: 'AKN_006', nama: 'Hasil Seleksi', pemegang: '' },
];

function fixture() {
  return {
    now,
    accounts,
    rawAssets: [
      { produk: 'Alat Perata Keramik', month: '2026-11', date: '2026-11-02', status: 'Belum Dipakai', creator: 'Deni' },
      { produk: 'Alat Perata Keramik', month: '2026-11', date: '2026-11-03', status: 'Dipakai', creator: 'Deni' },
      { produk: 'Alat Perata Keramik', month: '2026-10', date: '2026-10-03', status: 'Dipakai', creator: 'Deni' },
      { produk: 'Bor Mini', month: '2026-11', date: '2026-11-04', status: 'Belum Dipakai', creator: 'Rizal' },
    ],
    klipVideos: [
      { produk: 'Alat Perata Keramik', month: '2026-11', date: '2026-11-05', editor: 'Rizal', akunTarget: 'AKN_002' },
    ],
    publishVideos: [
      { produk: 'Alat Perata Keramik', month: '2026-11', date: '2026-11-06', akun: 'AKN_002', uploader: 'Rizal' },
      { produk: 'Alat Perata Keramik', month: '2026-11', date: '2026-11-07', akun: 'AKN_001', uploader: 'Deni' },
      { produk: 'Bor Mini', month: '2026-11', date: '2026-11-08', akun: 'AKN_001', uploader: 'Deni' },
    ],
    viewRows: [
      { Induk_Barang: 'Alat Perata Keramik', _isoDate: '2026-11-06', View: 1200, Video_FYP: 'FYP', Id_Akun: 'AKN_002', Nama_Akun: 'Produk Andalan Kita', Nama_File: 'a.mp4' },
      { Induk_Barang: 'Alat Perata Keramik', _isoDate: '2026-11-07', View: 800, Video_FYP: 'Belum FYP', Id_Akun: 'AKN_001', Nama_Akun: 'Jual Kawat', Nama_File: 'b.mp4' },
      { Induk_Barang: 'Alat Perata Keramik', _isoDate: '2026-10-02', View: 50000, Video_FYP: 'FYP', Id_Akun: 'AKN_002', Nama_Akun: 'Produk Andalan Kita', Nama_File: 'old.mp4' },
    ],
  };
}

describe('rencana upload', () => {
  test('target November berjalan 15 video per hari sampai tanggal hari ini', () => {
    const plan = uploadPlan({ month: '2026-11', accounts, now });
    assert.equal(plan.elapsedDays, 25);
    assert.equal(plan.teamTarget, 375);
    assert.equal(plan.perAccount.reduce((sum, account) => sum + account.target, 0), 375);
    assert.deepEqual(plan.perAccount.map((account) => account.target), [63, 63, 63, 62, 62, 62]);
    assert.equal(plan.perAccount[1].nama, 'Produk Andalan Kita');
  });

  test('bulan yang sudah lewat memakai seluruh hari', () => {
    const plan = uploadPlan({ month: '2026-10', accounts, now });
    assert.equal(plan.elapsedDays, 31);
    assert.equal(plan.teamTarget, 465);
    assert.equal(plan.isCurrent, false);
  });
});

describe('data laporan bulanan', () => {
  test('nama berkas dan bulan bawaan', () => {
    assert.equal(reportFileBase('2026-11'), 'Laporan-Video-November-2026');
    const report = buildMonthlyReport({ ...fixture(), month: '' });
    assert.equal(report.month, '2026-11');
    assert.equal(report.fileBase, 'Laporan-Video-November-2026');
  });

  test('KPI, produk, video, dan akun mengikuti bulan serta filter tanggal', () => {
    const report = buildMonthlyReport({ ...fixture(), month: '2026-11' });
    assert.equal(report.kpi.mentahan, 3);
    assert.equal(report.kpi.belumDipakai, 2);
    assert.equal(report.kpi.sudahDipakai, 1);
    assert.equal(report.kpi.klip, 1);
    assert.equal(report.kpi.upload, 3);
    assert.equal(report.kpi.target, 375);
    assert.equal(report.kpi.viewSum, 2000);
    assert.equal(report.kpi.avgView, 1000);
    assert.equal(report.kpi.maxView, 1200);
    assert.equal(report.kpi.fyp, 1);
    assert.equal(report.products[0].name, 'Alat Perata Keramik');
    assert.equal(report.products[0].raw, 2);
    assert.equal(report.products[0].edit, 1);
    assert.equal(report.products[0].upload, 2);
    assert.equal(report.products[0].viewSum, 2000);
    assert.equal(report.products[0].avgView, 1000);
    assert.equal(report.videos[0].view, 1200);
    assert.equal(report.videos[0].akun, 'Produk Andalan Kita');
    assert.equal(report.videos[0].date, '06/11/2026');
    const jual = report.accounts.find((account) => account.nama === 'Jual Kawat');
    const andalan = report.accounts.find((account) => account.nama === 'Produk Andalan Kita');
    assert.equal(jual.upload, 2);
    assert.equal(andalan.upload, 1);
    assert.equal(report.accounts.reduce((sum, account) => sum + account.upload, 0), 3);

    const day = buildMonthlyReport({
      ...fixture(),
      month: '2026-11',
      filters: { date: '2026-11-02' },
    });
    assert.equal(day.kpi.mentahan, 1);
    assert.equal(day.kpi.upload, 0);
  });

  test('grafik bulanan tidak terpotong filter bulan KPI', () => {
    const input = { ...fixture(), month: '2026-11' };
    const report = buildMonthlyReport(input);
    const series = computeMonthlySeries(input);
    assert.deepEqual(report.series.map((item) => item.month), ['2026-10', '2026-11']);
    assert.equal(series.find((item) => item.month === '2026-11').publish, 3);
    assert.equal(series.find((item) => item.month === '2026-10').mentahan, 1);
    assert.equal(report.kpi.upload, 3);
  });

  test('insight lokal dan prompt hanya memakai angka laporan', () => {
    const report = buildMonthlyReport({ ...fixture(), month: '2026-11' });
    const bullets = localInsightBullets(report);
    assert.ok(bullets.some((line) => line.includes('375') && line.includes('15 video/hari')));
    assert.ok(bullets.some((line) => line.includes('Alat Perata Keramik')));
    const prompt = buildInsightPrompt(report);
    assert.match(prompt, /Jangan mengarang/);
    assert.match(prompt, /bahasa Indonesia/);
    assert.match(prompt, /Upload 3, target 375/);
    assert.deepEqual(bulletsFromText('- Upload **380**\n- teks *insight* lain'), ['Upload 380', 'teks insight lain']);
  });
});
