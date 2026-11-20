import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  CAPTION_LIMIT,
  REPLIZ_ACCOUNT_MAP_KEY,
  SEND_GAP_MS,
  appendPlanRows,
  buildQuickRows,
  buildVideoCandidates,
  candidateAccountId,
  candidatesForAccount,
  candidatesForPlanner,
  filterCandidates,
  formatPlanDate,
  formatScheduleWib,
  isHeldName,
  isScheduleAt,
  mediaExpiryUnix,
  planRowIssues,
  productChoiceLabel,
  productChoices,
  resolveAccountLinks,
  scheduleStatusView,
  summarizeAccountLinks,
  summarizeReplizStatus,
  summarizeVideoStock,
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
        { fileId: FILE_B, fileName: 'gntungan bor 10 nov andalan slsi 2.mp4', produk: 'Gantungan Bor Multifungsi', date: '2026-11-10' },
        { fileId: 'DRIVE!bordir-1', produk: 'Bordir' },
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
      klipVideos: [
        { fileId: FILE_A, fileName: 'prata kramik 16 nov andalan slsi 2.mp4', produk: 'Perata Keramik' },
        { fileId: FILE_B, fileName: 'gntungan bor 10 nov andalan slsi 2.mp4', produk: 'Gantungan Bor' },
        { fileId: 'DRIVE!bordir-1', fileName: 'gantungan bordir motif.mp4', produk: 'Bordir' },
      ],
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
    const withEmptyAssets = buildVideoCandidates({
      fileAssets: [],
      klipVideos: [{ fileId: FILE_A, fileName: 'perata.mp4', produk: 'Perata Keramik' }],
    });
    assert.equal(withEmptyAssets.length, 1);
    assert.equal(withEmptyAssets[0].fileId, FILE_A);
    assert.deepEqual(buildVideoCandidates({ fileAssets: assets(), klipVideos: [] }), []);
    assert.deepEqual(buildVideoCandidates({}), []);
  });

  test('perencana mengutamakan video yang tidak ditahan', () => {
    const candidates = buildVideoCandidates({
      fileAssets: assets(),
      klipVideos: [
        { fileId: FILE_A, fileName: 'prata kramik 16 nov andalan slsi 2.mp4', produk: 'Perata Keramik', date: '2026-11-16' },
        { fileId: FILE_B, fileName: 'gntungan bor 10 nov andalan slsi 2.mp4', produk: 'Gantungan Bor', date: '2026-11-10' },
        { fileId: 'DRIVE!bordir-1', fileName: 'gantungan bordir motif.mp4', produk: 'Bordir' },
      ],
    });
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

describe('sumber Klip_Vidio, stok, dan status Repliz', () => {
  test('sumber dari Klip_Vidio walau FILE_ASSET ada', () => {
    const candidates = buildVideoCandidates({
      fileAssets: assets(),
      klipVideos: [
        { fileId: FILE_A, fileName: 'perata dari klip.mp4', produk: 'Perata Keramik' },
      ],
    });
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].fileId, FILE_A);
    assert.equal(candidates[0].fileName, 'perata dari klip.mp4');
    assert.equal(candidates.some((item) => item.fileId === FILE_B), false);
    assert.equal(candidates.some((item) => item.fileId === 'DRIVE!bordir-1'), false);
  });

  test('nama file boleh dilookup dari FILE_ASSET bila klip tidak punya nama', () => {
    const [item] = buildVideoCandidates({
      fileAssets: assets(),
      klipVideos: [{ fileId: 'DRIVE!bordir-1', produk: 'Bordir' }],
    });
    assert.equal(item.fileName, 'gantungan bordir motif.mp4');
    assert.equal(item.product, 'Bordir');
  });

  test('produk berasal dari klip.produk', () => {
    const [item] = buildVideoCandidates({
      fileAssets: [
        { Id_File: FILE_A, Nama_File: 'prata.mp4', produk: 'Dari Asset', Induk_Barang: 'Dari Induk' },
      ],
      klipVideos: [{
        fileId: FILE_A,
        fileName: 'prata.mp4',
        produk: 'Perata Keramik',
        Induk_Barang: 'Bukan Produk Klip',
      }],
    });
    assert.equal(item.product, 'Perata Keramik');
  });

  test('pencocokan upload via publishVideos.klipId dan Data_View.Id_Klip', () => {
    const candidates = buildVideoCandidates({
      klipVideos: [
        { fileId: FILE_A, fileName: 'perata sudah.mp4', produk: 'Perata Keramik' },
        { Id_Klip_Vidio: 'DRIVE!pisau-1', fileName: 'pisau sudah.mp4', produk: 'Pisau' },
        { fileId: 'DRIVE!mentah-1', fileName: 'masih baru.mp4', produk: 'Pisau' },
      ],
      dataViews: [{ Id_Klip: FILE_A }],
      publishVideos: [{ klipId: 'DRIVE!pisau-1' }],
    });
    assert.equal(candidates.find((item) => item.fileId === FILE_A).uploaded, true);
    assert.equal(candidates.find((item) => item.fileId === 'DRIVE!pisau-1').uploaded, true);
    assert.equal(candidates.find((item) => item.fileId === 'DRIVE!mentah-1').uploaded, false);
    const stock = summarizeVideoStock(candidates);
    assert.deepEqual(stock, { total: 3, uploaded: 2, belum: 1 });
  });

  test('hitungan total, belum, dan ditahan per produk', () => {
    const candidates = buildVideoCandidates({
      klipVideos: [
        { fileId: 'DRIVE!a1', fileName: 'perata satu.mp4', produk: 'Perata Keramik' },
        { fileId: 'DRIVE!a2', fileName: 'perata dua.mp4', produk: 'Perata Keramik' },
        { fileId: 'DRIVE!a3', fileName: 'perata tiga.mp4', produk: 'Perata Keramik' },
        { fileId: 'DRIVE!b1', fileName: 'gantungan bor satu.mp4', produk: 'Gantungan Bor' },
        { fileId: 'DRIVE!b2', fileName: 'gantungan bor dua.mp4', produk: 'Gantungan Bor' },
        { fileName: 'tanpa identitas perata.mp4', produk: 'Perata Keramik' },
        { fileId: 'DRIVE!c1', fileName: 'tanpa nama produk.mp4', produk: '' },
      ],
      publishVideos: [{ klipId: 'DRIVE!a1' }],
    });
    const choices = productChoices(candidates);
    const keramik = choices.find((item) => item.name === 'Perata Keramik');
    const bor = choices.find((item) => item.name === 'Gantungan Bor');
    const kosong = choices.find((item) => item.name === 'Tanpa produk');
    assert.equal(keramik.total, 4);
    assert.equal(keramik.belum, 3);
    assert.equal(keramik.ditahan, 0);
    assert.equal(keramik.held, false);
    assert.equal(bor.total, 2);
    assert.equal(bor.belum, 2);
    assert.equal(bor.ditahan, 2);
    assert.equal(bor.held, true);
    assert.equal(kosong.total, 1);
    assert.equal(kosong.belum, 1);
    assert.equal(productChoiceLabel(keramik), 'Perata Keramik (3 belum / 4 total)');
    assert.equal(productChoiceLabel(bor), 'Gantungan Bor (Ditahan)');
    assert.equal(
      productChoiceLabel({ name: 'Spons', held: false, belum: 0, total: 2 }),
      'Spons (0 belum / 2 total) · habis',
    );
    assert.deepEqual(summarizeVideoStock(candidates), { total: 7, uploaded: 1, belum: 6 });
  });

  test('klip tanpa file id tercatat, schedulable false, dan tidak masuk isi cepat atau Gemini', () => {
    const candidates = buildVideoCandidates({
      fileAssets: assets(),
      klipVideos: [
        { fileName: 'klip tanpa id.mp4', produk: 'Pisau', fileId: 'bukan/id-valid' },
        { fileId: '', Vidio_Final_Id: 'salah?id', fileName: 'masih kosong.mp4', produk: 'Pisau' },
        { fileId: 'DRIVE!pisau-ok', fileName: 'pisau siap.mp4', produk: 'Pisau', date: '2026-11-18' },
      ],
    });
    assert.equal(candidates.length, 3);
    assert.equal(candidates[0].schedulable, false);
    assert.equal(candidates[0].fileId, '');
    assert.equal(candidates[0].note, 'ID file belum ada');
    assert.equal(candidates[1].schedulable, false);
    assert.equal(candidates[1].note, 'ID file belum ada');
    assert.equal(summarizeVideoStock(candidates).total, 3);
    const planner = candidatesForPlanner(candidates);
    assert.deepEqual(planner.map((item) => item.fileId), ['DRIVE!pisau-ok']);
    const quick = buildQuickRows({
      candidates,
      product: 'Pisau',
      count: 3,
      startDate: '2026-11-21',
      time: '19:00',
      accountId: 'acct12345678',
    });
    assert.equal(quick.rows.length, 1);
    assert.equal(quick.rows[0].fileId, 'DRIVE!pisau-ok');
  });

  test('id jadwal memakai Id_Klip_Vidio lalu fallback Vidio_Final_Id', () => {
    const candidates = buildVideoCandidates({
      klipVideos: [
        { fileId: 'ada/garis-miring', Vidio_Final_Id: 'DRIVE!final-1', fileName: 'final satu.mp4', produk: 'Pisau' },
        { Id_Klip_Vidio: 'DRIVE!klip-2', Vidio_Final_Id: 'DRIVE!final-2', fileName: 'final dua.mp4', produk: 'Pisau' },
      ],
    });
    assert.equal(candidates[0].fileId, 'DRIVE!final-1');
    assert.equal(candidates[0].schedulable, true);
    assert.equal(candidates[0].note, '');
    assert.equal(candidates[1].fileId, 'DRIVE!klip-2');
  });

  test('ringkasan status Repliz memakai totalDocs', () => {
    const summary = summarizeReplizStatus({
      pending: { schedules: [{}], totalDocs: 12, limit: 1 },
      process: { schedules: [{}, {}], totalDocs: 3, limit: 1 },
      success: { schedules: [], totalDocs: 40 },
      error: { totalDocs: 2 },
    });
    assert.deepEqual(summary, { pending: 12, process: 3, success: 40, error: 2 });
    assert.equal(summarizeReplizStatus({ pending: { schedules: [{}, {}, {}] } }).pending, 0);
  });
});

const MASTERS = [
  { id: 'AKN_001', nama: 'Jual Kawat', label: 'AKN_001 - Jual Kawat', username: 'jualkawat' },
  { id: 'AKN_002', nama: 'Produk Andalan Kita', label: 'AKN_002 - Produk Andalan Kita' },
  { id: 'AKN_003', nama: 'Grosir Hitam', label: 'AKN_003 - Grosir Hitam' },
  { id: 'AKN_004', nama: 'Melifarida Toserba', label: 'AKN_004 - Melifarida Toserba' },
  { id: 'AKN_006', nama: 'Hasil Seleksi', label: 'AKN_006 - Hasil Seleksi' },
];

function accountClips() {
  return buildVideoCandidates({
    klipVideos: [
      { fileId: 'DRIVE!akn6-a', fileName: 'perata a.mp4', produk: 'Perata Keramik', Id_Akun: 'AKN_006', akunTarget: 'AKN_004', Sumber: 'Klip_Vidio' },
      { fileId: 'DRIVE!akn6-b', fileName: 'perata b.mp4', produk: 'Perata Keramik', Id_Akun: 'AKN_006', Sumber: 'Klip_Vidio' },
      { fileId: 'DRIVE!akn4', fileName: 'grease.mp4', produk: 'Suntikan Grease', akunTarget: 'AKN_004', Sumber: 'Publish' },
      { fileId: 'DRIVE!bare', fileName: 'tanpa akun.mp4', produk: 'Perata Keramik', Sumber: 'Klip_Vidio' },
    ],
  });
}

describe('filter video per akun Repliz', () => {
  test('meneruskan Id_Akun, akunTarget, dan Sumber', () => {
    const clips = accountClips();
    const first = clips.find((item) => item.fileId === 'DRIVE!akn6-a');
    assert.equal(first.Id_Akun, 'AKN_006');
    assert.equal(first.akunTarget, 'AKN_004');
    assert.equal(first.Sumber, 'Klip_Vidio');
    assert.equal(candidateAccountId(first), 'AKN_006');
    const targetOnly = clips.find((item) => item.fileId === 'DRIVE!akn4');
    assert.equal(targetOnly.Id_Akun, '');
    assert.equal(targetOnly.akunTarget, 'AKN_004');
    assert.equal(targetOnly.Sumber, 'Publish');
    assert.equal(candidateAccountId(targetOnly), 'AKN_004');
    const bare = clips.find((item) => item.fileId === 'DRIVE!bare');
    assert.equal(bare.Id_Akun, '');
    assert.equal(bare.akunTarget, '');
    assert.equal(bare.Sumber, 'Klip_Vidio');
    assert.equal(candidateAccountId(bare), '');
  });

  test('filter dan hitungan hanya untuk akun yang dipilih', () => {
    const clips = accountClips();
    const scoped = filterCandidates(clips, { uploaded: 'semua', includeHeld: true, accountId: 'AKN_006' });
    assert.deepEqual(scoped.map((item) => item.fileId), ['DRIVE!akn6-a', 'DRIVE!akn6-b']);
    const stock = summarizeVideoStock(candidatesForAccount(clips, 'akn_006'));
    assert.deepEqual(stock, { total: 2, uploaded: 0, belum: 2 });
    const choices = productChoices(candidatesForAccount(clips, 'AKN_006'));
    assert.equal(choices.length, 1);
    assert.equal(choices[0].name, 'Perata Keramik');
    assert.equal(productChoiceLabel(choices[0]), 'Perata Keramik (2 belum / 2 total)');
    const quick = buildQuickRows({
      candidates: clips,
      product: 'Perata Keramik',
      count: 5,
      startDate: '2026-11-21',
      time: '19:00',
      accountId: 'repliz-hasil',
      idAkun: 'AKN_006',
    });
    assert.equal(quick.rows.length, 2);
    assert.deepEqual(quick.rows.map((row) => row.fileId), ['DRIVE!akn6-a', 'DRIVE!akn6-b']);
    assert.ok(quick.rows.every((row) => row.accountId === 'repliz-hasil'));
    assert.equal(buildQuickRows({
      candidates: clips,
      product: 'Perata Keramik',
      count: 2,
      startDate: '2026-11-21',
      time: '19:00',
      accountId: 'repliz-lain',
      idAkun: 'AKN_004',
    }).rows.length, 0);
  });

  test('klip tanpa akun hanya tampil di Semua akun', () => {
    const clips = accountClips();
    const semua = filterCandidates(clips, { uploaded: 'semua', includeHeld: true, accountId: 'Semua akun' });
    assert.equal(semua.length, 4);
    assert.equal(candidatesForAccount(clips, '').some((item) => item.fileId === 'DRIVE!bare'), true);
    assert.equal(candidatesForAccount(clips, 'Semua').some((item) => item.fileId === 'DRIVE!bare'), true);
    const scoped = filterCandidates(clips, { uploaded: 'semua', includeHeld: true, accountId: 'AKN_006' });
    assert.equal(scoped.some((item) => !candidateAccountId(item)), false);
    assert.equal(candidatesForAccount(clips, '__none__').length, 0);
  });

  test('memetakan username dan nama yang yakin, tidak nama yang ragu', () => {
    assert.equal(REPLIZ_ACCOUNT_MAP_KEY, 'promoops.replizAccountMap');
    const repliz = [
      { id: 'r-hasil', name: 'Hasil Seleksi', username: 'meliycyko14' },
      { id: 'r-meli', name: 'MeliFarida Toserba', username: 'pasar.digital79' },
      { id: 'r-grosir', name: 'Grosir Import Indonesia', username: 'grosirimportindonesia' },
      { id: 'r-toko', name: 'Toko Andalan', username: '' },
      { id: 'r-user', name: 'Nama Lain Sekali', username: '@jualkawat' },
    ];
    const links = resolveAccountLinks(repliz, MASTERS, {});
    const byId = Object.fromEntries(links.map((link) => [link.replizId, link]));
    assert.equal(byId['r-hasil'].mode, 'auto-name');
    assert.equal(byId['r-hasil'].masterId, 'AKN_006');
    assert.equal(byId['r-meli'].mode, 'auto-name');
    assert.equal(byId['r-meli'].masterId, 'AKN_004');
    assert.equal(byId['r-user'].mode, 'auto-username');
    assert.equal(byId['r-user'].masterId, 'AKN_001');
    assert.equal(byId['r-grosir'].mode, 'unlinked');
    assert.equal(byId['r-grosir'].masterId, '');
    assert.equal(byId['r-toko'].mode, 'unlinked');
    assert.equal(byId['r-toko'].masterId, '');
    const summary = summarizeAccountLinks(links);
    assert.deepEqual(summary, { auto: 3, manual: 0, unlinked: 2 });
    const manual = resolveAccountLinks(repliz, MASTERS, { 'r-grosir': 'AKN_003', 'r-hasil': 'AKN_001' });
    const mapped = Object.fromEntries(manual.map((link) => [link.replizId, link]));
    assert.equal(mapped['r-grosir'].mode, 'manual');
    assert.equal(mapped['r-grosir'].masterId, 'AKN_003');
    assert.equal(mapped['r-hasil'].mode, 'manual');
    assert.equal(mapped['r-hasil'].masterId, 'AKN_001');
    assert.equal(resolveAccountLinks(repliz, MASTERS, { 'r-toko': 'AKN_999' })[3].mode, 'unlinked');
  });
});
