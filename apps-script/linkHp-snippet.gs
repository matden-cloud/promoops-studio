/**
 * Tambahan Apps Script: field linkHp untuk rawAssets dan klipVideos.
 *
 * Kode Apps Script dashboard ini tidak ada di repo. Tempel file ini ke proyek
 * Apps Script yang sudah berjalan (yang URL /exec-nya diisi di APPS_SCRIPT_URL).
 *
 * Sumber data: tab sheet FILE_ASSET.
 * Header yang dipakai: Id_File dan Link_HP
 * (contoh header: Id_File, Id_Klip, Nama_File, Jenis_File, Versi, Storage,
 *  Link_File, Link_HP, Link_Folder, ...).
 * Pencocokan: Id_File == fileId pada objek rawAssets / klipVideos.
 * Contoh fileId: 5A278D0C5E50242F!sa41210e3b56340668705da817774f7aa
 * Contoh Link_HP: https://1drv.ms/v/c/...
 *
 * Cara menempel
 * 1. Buka proyek Apps Script dashboard (bukan deployment-nya).
 * 2. Tambahkan kedua fungsi di bawah ini di file skrip yang sama dengan doGet.
 *    Jangan mengganti doGet / doPost yang sudah ada.
 * 3. Cari tempat JSON dashboard disusun, tepat sebelum
 *    ContentService.createTextOutput(JSON.stringify(...)).
 * 4. Sisipkan dua baris ini (sesuaikan nama variabel array-nya):
 *
 *    payload.rawAssets = attachLinkHp_(payload.rawAssets);
 *    payload.klipVideos = attachLinkHp_(payload.klipVideos);
 *
 *    Kalau array-nya bernama lain, tetap panggil attachLinkHp_ pada array
 *    yang dikirim sebagai rawAssets dan klipVideos. Setiap objek harus punya
 *    fileId. Fungsi ini menambahkan linkHp (string kosong bila tidak ketemu).
 * 5. Deploy ulang sebagai VERSI BARU pada deployment yang sama
 *    (Deploy → Manage deployments → pensil → Version: New version → Deploy).
 *    Jangan buat deployment Web App baru: URL /exec akan berubah dan
 *    APPS_SCRIPT_URL di Vercel tidak lagi mengarah ke skrip ini.
 * 6. Dashboard sudah membaca linkHp, Link_HP, atau link_hp. Tombol
 *    "Buka di HP" baru muncul setelah data itu sampai. Sebelumnya tombol
 *    OneDrive tetap jalan dan tombol HP disembunyikan.
 */

function buildLinkHpByFileId_() {
  var map = {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('FILE_ASSET');
  if (!sheet) return map;

  var values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return map;

  var headers = values[0].map(function (cell) {
    return String(cell || '').trim();
  });
  var idCol = headers.indexOf('Id_File');
  var hpCol = headers.indexOf('Link_HP');
  if (idCol < 0 || hpCol < 0) return map;

  for (var i = 1; i < values.length; i += 1) {
    var fileId = String(values[i][idCol] || '').trim();
    var linkHp = String(values[i][hpCol] || '').trim();
    if (!fileId || !linkHp || map[fileId]) continue;
    map[fileId] = linkHp;
  }
  return map;
}

function attachLinkHp_(rows) {
  var list = Array.isArray(rows) ? rows : [];
  var map = buildLinkHpByFileId_();
  return list.map(function (row) {
    var copy = row && typeof row === 'object' ? row : {};
    var fileId = String(copy.fileId || copy.Id_File || '').trim();
    copy.linkHp = fileId && map[fileId] ? map[fileId] : (copy.linkHp || '');
    return copy;
  });
}
