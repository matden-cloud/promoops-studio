import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  CAPTION_LIMIT,
  SEND_GAP_MS,
  appendPlanRows,
  buildQuickRows,
  buildVideoCandidates,
  candidatesForPlanner,
  filterCandidates,
  formatPlanDate,
  formatScheduleWib,
  isHeldName,
  isScheduleAt,
  mediaExpiryUnix,
  planRowIssues,
  scheduleStatusView,
  toScheduleAt,
} from './jadwal-repliz.js';

const FILE_A = 'DRIVE!keramik-1';
const FILE_B = 'DRIVE!gantungan-1';
const FILE_C = 'DRIVE!mentahan-1';
const FILE_D = 'DRIVE!foto-1';

function assets() {
  return [
    {
      Cloud_File_ID: FILE_A,
      Id_File: 'row-keramik',
      Nama_File: 'prata kramik 16 nov andalan slsi 2.mp4',
      Path_Folder: 'OneDrive/Baru/PROJECT TIKTOK/Project Baru/Video Final',
      Tanggal_File: '2026-11-16',
    },
    {
      idFile: FILE_B,
      namaFile: 'gntungan bor 10 nov andalan slsi 2.mp4',
      pathFolder: 'OneDrive/Baru/PROJECT TIKTOK/Project Baru/Video Final/batch',
    },
    {
      Id_File: FILE_C,
      Nama_File: 'mentahan kramik.mp4',
      Path_Folder: 'OneDrive/Baru/PROJECT TIKTOK/Project Baru/Mentahan Video',
    },
    {
      Id_File: FILE_D,
      Nama_File: 'cover keramik.jpg',
      Path_Folder: 'OneDrive/Baru/PROJECT TIKTOK/Project Baru/Video Final',
    },
    {
      Cloud_File_ID: 'DRIVE!bordir-1',
      Nama_File: 'gantungan bordir motif.mp4',
      Path_Folder: 'Video Final',
    },
  ];
}

describe('kandidat Video Final dan aturan hold', () => {
  test('hanya video di folder Video Final, diperkaya produk dari klip', () => {
    const candidates = buildVideoCandidates({
      fileAssets: assets(),
      klipVideos: [
        { fileId: FILE_A, fileName: 'nama lain.mp4', produk: 'Perata Keramik', date: '2026-11-16' },
        { fileName: 'gntungan bor 10 nov andalan slsi 2.mp4', produk: 'Gantungan Bor Multifungsi', date: '2026-11-10' },
      ],
    });
    const ids = candidates.map((item) => item.fileId);
    assert.deepEqual(ids, [FILE_A, FILE_B, 'DRIVE!bordir-1']);
    const keramik = candidates.find((item) => item.fileId === FILE_A);
    assert.equal(keramik.product, 'Perata Keramik');
    assert.equal(keramik.uploaded, false);
    assert.equal(keramik.held, false);
    assert.equal(keramik.date, '2026-11-16');
    const bor = candidates.find((item) => item.fileId === FILE_B);
    assert.equal(bor.product, 'Gantungan Bor Multifungsi');
    assert.equal(bor.held, true);
    assert.equal(isHeldName('gantungan bordir'), false);
    assert.equal(candidates.find((item) => item.fileId === 'DRIVE!bordir-1').held, false);
  });

  test('sudah diupload bila cocok dengan Data_View atau Publish', () => {
    const candidates = buildVideoCandidates({
      fileAssets: assets(),
      dataViews: [{ Id_Klip: FILE_A, Nama_File: 'prata kramik 16 nov andalan slsi 2.mp4', Induk_Barang: 'Perata Keramik' }],
      publishVideos: [{ klipId: 'DRIVE!bordir-1', fileName: 'gantungan bordir motif.mp4', produk: 'Bordir' }],
    });
    const open = filterCandidates(candidates, { uploaded: 'belum', includeHeld: false });
    assert.deepEqual(open.map((item) => item.fileId), []);
    const withHeld = filterCandidates(candidates, { uploaded: 'belum', includeHeld: true });
    assert.deepEqual(withHeld.map((item) => item.fileId), [FILE_B]);
    assert.equal(candidates.find((item) => item.fileId === FILE_A).uploaded, true);
    assert.equal(candidates.find((item) => item.fileId === 'DRIVE!bordir-1').uploaded, true);
  });

  test('tanpa FILE_ASSET, kandidat jatuh ke Klip_Vidio; daftar kosong tidak mengarang', () => {
    const fromKlip = buildVideoCandidates({
      fileAssets: null,
      klipVideos: [{ fileId: FILE_A, fileName: 'perata.mp4', produk: 'Perata Keramik' }],
    });
    assert.equal(fromKlip.length, 1);
    assert.equal(fromKlip[0].product, 'Perata Keramik');
    assert.deepEqual(buildVideoCandidates({ fileAssets: [], klipVideos: [{ fileId: FILE_A, fileName: 'perata.mp4' }] }), []);
  });

  test('perencana mengutamakan video yang tidak ditahan', () => {
    const candidates = buildVideoCandidates({ fileAssets: assets(), klipVideos: [] });
    const planner = candidatesForPlanner(candidates);
    assert.equal(planner[0].held, false);
    assert.equal(planner.at(-1).held, true);
    assert.equal(planner.some((item) => item.uploaded), false);
  });
});

describe('isi cepat, status, dan waktu WIB', () => {
  test('isi cepat melewati produk Gantungan Bor dan menyusun satu video per hari', () => {
    const candidates = buildVideoCandidates({
      fileAssets: [
        { Id_File: 'DRIVE!k1', Nama_File: 'keramik baru.mp4', Path_Folder: 'Video Final', Tanggal_File: '2026-11-18' },
        { Id_File: 'DRIVE!k2', Nama_File: 'keramik lama.mp4', Path_Folder: 'Video Final', Tanggal_File: '2026-11-02' },
        { Id_File: FILE_B, Nama_File: 'gntungan bor 10 nov.mp4', Path_Folder: 'Video Final' },
      ],
      klipVideos: [
        { fileId: 'DRIVE!k1', produk: 'Perata Keramik' },
        { fileId: 'DRIVE!k2', produk: 'Perata Keramik' },
        { fileId: FILE_B, produk: 'Gantungan Bor' },
      ],
    });
    const held = buildQuickRows({
      candidates,
      product: 'Gantungan Bor',
      count: 4,
      startDate: '2026-11-21',
      time: '19.00',
      accountId: 'acct12345678',
    });
    assert.equal(held.held, true);
    assert.equal(held.rows.length, 0);
    assert.match(held.message, /ditahan/i);

    const filled = buildQuickRows({
      candidates,
      product: 'Perata Keramik',
      count: 2,
      startDate: '30/11/2026',
      time: '19:00 WIB',
      accountId: 'acct12345678',
    });
    assert.equal(filled.rows.length, 2);
    assert.equal(filled.rows[0].fileId, 'DRIVE!k1');
    assert.equal(filled.rows[0].date, '2026-11-30');
    assert.equal(filled.rows[1].date, '2026-12-01');
    assert.equal(filled.rows[0].time, '19:00');
    assert.equal(filled.rows.every((row) => row.held), false);
    assert.equal(toScheduleAt(filled.rows[0].date, filled.rows[0].time), '2026-11-30T19:00:00+07:00');
  });

  test('status Repliz dan format WIB', () => {
    assert.equal(scheduleStatusView('pending').label, 'Menunggu');
    assert.equal(scheduleStatusView('process').label, 'Diproses');
    assert.equal(scheduleStatusView('success').label, 'Berhasil');
    assert.equal(scheduleStatusView('error').label, 'Gagal');
    assert.equal(scheduleStatusView('error').tone, 'gagal');

    const when = '2026-11-20T12:00:00.000Z';
    assert.equal(
      formatScheduleWib(when, new Date('2026-11-20T02:00:00.000Z')),
      'Hari ini, Jum, 20 Nov 2026 · 19.00 WIB',
    );
    assert.equal(
      formatScheduleWib(when, new Date('2026-11-19T12:00:00.000Z')),
      'Besok, Jum, 20 Nov 2026 · 19.00 WIB',
    );
    assert.equal(
      formatScheduleWib(when, new Date('2026-11-21T12:00:00.000Z')),
      'Kemarin, Jum, 20 Nov 2026 · 19.00 WIB',
    );
    assert.equal(formatPlanDate('2026-11-20'), 'Jum, 20 Nov 2026');
  });

  test('ISO +07:00, batas caption, dan masa berlaku media', () => {
    assert.equal(isScheduleAt('2026-11-20T19:00:00+07:00'), true);
    assert.equal(isScheduleAt('2026-11-20T19:00:00Z'), false);
    assert.equal(isScheduleAt('2026-02-31T19:00:00+07:00'), false);
    const now = Date.parse('2026-11-20T00:00:00.000Z');
    const expiry = mediaExpiryUnix('2026-11-21T19:00:00+07:00', now);
    assert.equal(expiry.exp, Math.floor((Date.parse('2026-11-21T19:00:00+07:00') + (72 * 60 * 60 * 1000)) / 1000));
    const far = mediaExpiryUnix('2027-02-01T19:00:00+07:00', now);
    assert.match(far.error, /45 hari/);
    const issues = planRowIssues({
      fileId: '',
      accountId: '',
      date: 'bukan-tanggal',
      time: '99:00',
      caption: 'x'.repeat(CAPTION_LIMIT + 1),
    });
    assert.equal(issues.length, 4);
    assert.equal(SEND_GAP_MS >= 250 && SEND_GAP_MS <= 800, true);
    const merged = appendPlanRows(
      [{ fileId: 'DRIVE!k1', sendState: 'draft' }],
      [{ fileId: 'DRIVE!k1' }, { fileId: 'DRIVE!k2' }],
    );
    assert.equal(merged.skipped, 1);
    assert.equal(merged.rows.length, 2);
  });
});
