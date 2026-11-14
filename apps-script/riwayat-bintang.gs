/**
 * Riwayat bintang per bulan laporan.
 *
 * Tab baru: Riwayat_Bintang
 * Kolom: Bulan, File_Key, Kategori, Nama_Produk, Nama_File, Link_File,
 *        Status_Winning, Catatan_File, Waktu
 * Kunci unik: Bulan + File_Key
 *
 * Bulan diisi dari filter bulan laporan di dashboard (YYYY-MM), bukan dari
 * tanggal klik. Menambah bintang di bulan baru hanya meng-upsert baris bulan
 * itu. Baris bulan lain untuk File_Key yang sama tidak ditimpa dan tidak dihapus.
 * Cabut bintang hanya menulis Status_Winning "Tidak" pada bulan yang sedang
 * dipilih.
 *
 * Data_Winning_Files tetap ditulis seperti sekarang (satu baris per File_Key).
 * Fungsi di file ini tidak mengganti penulisan itu.
 *
 * Cara menempel (proyek Apps Script "Coba", file boleh baru atau digabung):
 * 1. Buka proyek Apps Script yang URL /exec-nya dipakai APPS_SCRIPT_URL.
 *    Jangan membuat deployment baru.
 * 2. Tambahkan file ini (nama file: Riwayat_Bintang) lewat tanda + lalu Script,
 *    atau tempel seluruh fungsi di bawah ke file skrip yang sudah ada.
 *    Jangan menghapus doGet / doPost yang sedang berjalan.
 * 3. Di doGet, tepat sebelum return ContentService.createTextOutput, sisipkan:
 *
 *    migrateWinningFilesToRiwayat_();
 *    var starHistory = readRiwayatBintang_();
 *
 *    Lalu di objek JSON yang sudah ada (yang memuat winningFiles), tambahkan
 *    satu field. Contoh potongan yang sekarang kira-kira seperti ini:
 *
 *      winningWeb: listWinning,
 *      winningFiles: listWinningFiles
 *
 *    menjadi:
 *
 *      winningWeb: listWinning,
 *      winningFiles: listWinningFiles,
 *      starHistory: starHistory
 *
 * 4. Di doPost, cari cabang action "save_winning_file".
 *    SETELAH baris yang menulis Data_Winning_Files (biarkan penulisan itu),
 *    tambahkan:
 *
 *      upsertRiwayatBintang_(data);
 *
 *    Jika nama variabel body-nya bukan data, sesuaikan. Objek itu harus
 *    membawa bulan (YYYY-MM) yang dikirim dashboard. Jangan mengisi Bulan
 *    dari new Date() atau dari tanggal hari ini.
 *    Dashboard mengirim POST JSON:
 *      { action: "save_winning_file", data: { fileKey, kategori, produk,
 *        fileName, url, isWinning, catatan, bulan } }
 *    Cabut bintang memakai action yang sama dengan isWinning false dan bulan
 *    laporan yang sedang dipilih. Jangan menghapus baris Riwayat_Bintang
 *    bulan lain.
 * 5. Deploy ulang sebagai VERSI BARU pada deployment yang sama:
 *    Deploy → Manage deployments → ikon pensil pada deployment Web App
 *    → Version: New version → Deploy.
 *    Jangan memilih New deployment. URL /exec harus tetap sama.
 * 6. Muat ulang dashboard. Sebelum langkah ini, dashboard tetap memakai
 *    perilaku bintang yang lama dan tidak error.
 *
 * Migrasi sekali jalan juga bisa dijalankan dari editor:
 * pilih fungsi migrasiRiwayatBintang lalu Run.
 * Status_Winning "Ya" di Data_Winning_Files disalin ke bulan pada
 * Terakhir_Diupdate. Baris Riwayat_Bintang yang sudah ada tidak ditimpa.
 * Migrasi yang sama ikut berjalan di doGet dan aman diulang.
 */

var RIWAYAT_BINTANG_HEADERS_ = [
  'Bulan',
  'File_Key',
  'Kategori',
  'Nama_Produk',
  'Nama_File',
  'Link_File',
  'Status_Winning',
  'Catatan_File',
  'Waktu'
];

var RIWAYAT_BINTANG_MONTHS_ = [
  'januari', 'februari', 'maret', 'april', 'mei', 'juni',
  'juli', 'agustus', 'september', 'oktober', 'november', 'desember'
];

function riwayatBintangTimezone_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return (ss && ss.getSpreadsheetTimeZone()) || 'Asia/Jakarta';
}

function riwayatBintangNow_() {
  return Utilities.formatDate(new Date(), riwayatBintangTimezone_(), 'yyyy-MM-dd HH:mm:ss');
}

function normalizeBulanRiwayat_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, riwayatBintangTimezone_(), 'yyyy-MM');
  }
  var raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw || raw === 'Semua') return '';
  var iso = raw.match(/^(\d{4})-(\d{2})/);
  if (iso) {
    var monthNum = parseInt(iso[2], 10);
    if (monthNum >= 1 && monthNum <= 12) return iso[1] + '-' + iso[2];
  }
  var named = raw.match(/^([A-Za-zÀ-ÿ]+)\s+(\d{4})$/);
  if (named) {
    var idx = RIWAYAT_BINTANG_MONTHS_.indexOf(named[1].toLowerCase());
    if (idx >= 0) {
      var mm = ('0' + (idx + 1)).slice(-2);
      return named[2] + '-' + mm;
    }
  }
  return '';
}

function bulanFromUpdatedAt_(value) {
  var fromBulan = normalizeBulanRiwayat_(value);
  if (fromBulan) return fromBulan;
  var raw = String(value || '').trim();
  var dmy = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (!dmy) return '';
  var p1 = parseInt(dmy[1], 10);
  var p2 = parseInt(dmy[2], 10);
  var monthNum = p1 > 12 ? p2 : (p2 > 12 ? p1 : p2);
  if (monthNum < 1 || monthNum > 12) return '';
  return dmy[3] + '-' + ('0' + monthNum).slice(-2);
}

function isWinningRiwayat_(data) {
  if (!data) return false;
  if (data.isWinning === true || data.isWinning === 1) return true;
  var status = data.Status_Winning != null ? data.Status_Winning : data.isWinning;
  var text = String(status || '').trim().toLowerCase();
  return text === 'ya' || text === 'true' || text === '1';
}

function ensureRiwayatBintangSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Riwayat_Bintang');
  if (!sheet) {
    sheet = ss.insertSheet('Riwayat_Bintang');
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, RIWAYAT_BINTANG_HEADERS_.length).setValues([RIWAYAT_BINTANG_HEADERS_]);
    sheet.setFrozenRows(1);
  }
  sheet.getRange('A:B').setNumberFormat('@');
  return sheet;
}

function upsertRiwayatBintang_(data) {
  if (!data) return;
  var bulan = normalizeBulanRiwayat_(data.bulan || data.Bulan || '');
  var fileKey = String(data.fileKey || data.File_Key || '').trim();
  if (!bulan || !fileKey) return;

  var sheet = ensureRiwayatBintangSheet_();
  var values = sheet.getDataRange().getValues();
  var found = 0;
  var i;
  for (i = 1; i < values.length; i += 1) {
    if (normalizeBulanRiwayat_(values[i][0]) === bulan && String(values[i][1] || '').trim() === fileKey) {
      found = i + 1;
      break;
    }
  }

  var catatan = data.catatan != null ? data.catatan : (data.Catatan_File || '');
  var row = [
    bulan,
    fileKey,
    String(data.kategori || data.Kategori || ''),
    String(data.produk || data.Nama_Produk || ''),
    String(data.fileName || data.Nama_File || ''),
    String(data.url || data.Link_File || ''),
    isWinningRiwayat_(data) ? 'Ya' : 'Tidak',
    String(catatan),
    riwayatBintangNow_()
  ];

  if (found) {
    sheet.getRange(found, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}

function readRiwayatBintang_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Riwayat_Bintang');
  var list = [];
  if (!sheet || sheet.getLastRow() < 2) return list;

  var values = sheet.getDataRange().getValues();
  var tz = riwayatBintangTimezone_();
  var i;
  for (i = 1; i < values.length; i += 1) {
    var bulan = normalizeBulanRiwayat_(values[i][0]);
    var fileKey = String(values[i][1] || '').trim();
    if (!bulan || !fileKey) continue;
    var waktu = values[i][8];
    if (Object.prototype.toString.call(waktu) === '[object Date]' && !isNaN(waktu.getTime())) {
      waktu = Utilities.formatDate(waktu, tz, 'yyyy-MM-dd HH:mm:ss');
    } else {
      waktu = String(waktu || '');
    }
    list.push({
      bulan: bulan,
      fileKey: fileKey,
      kategori: String(values[i][2] || ''),
      produk: String(values[i][3] || ''),
      fileName: String(values[i][4] || ''),
      url: String(values[i][5] || ''),
      isWinning: String(values[i][6] || '').toLowerCase() === 'ya',
      catatan: String(values[i][7] || ''),
      waktu: waktu
    });
  }
  return list;
}

function headerIndex_(headerRow, name, fallback) {
  var i;
  for (i = 0; i < headerRow.length; i += 1) {
    if (String(headerRow[i] || '').trim() === name) return i;
  }
  return fallback;
}

function migrateWinningFilesToRiwayat_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var source = ss.getSheetByName('Data_Winning_Files');
  var added = 0;
  var skipped = 0;
  if (!source || source.getLastRow() < 2) {
    return { added: 0, skipped: 0 };
  }

  var values = source.getDataRange().getValues();
  var header = values[0];
  var cKey = headerIndex_(header, 'File_Key', 0);
  var cKat = headerIndex_(header, 'Kategori', 1);
  var cProd = headerIndex_(header, 'Nama_Produk', 2);
  var cName = headerIndex_(header, 'Nama_File', 3);
  var cLink = headerIndex_(header, 'Link_File', 4);
  var cStatus = headerIndex_(header, 'Status_Winning', 5);
  var cNote = headerIndex_(header, 'Catatan_File', 6);
  var cTime = headerIndex_(header, 'Terakhir_Diupdate', 7);

  var sheet = ensureRiwayatBintangSheet_();
  var existing = sheet.getDataRange().getValues();
  var seen = {};
  var i;
  for (i = 1; i < existing.length; i += 1) {
    var bulanAda = normalizeBulanRiwayat_(existing[i][0]);
    var keyAda = String(existing[i][1] || '').trim();
    if (bulanAda && keyAda) seen[bulanAda + '\n' + keyAda] = true;
  }

  var tz = riwayatBintangTimezone_();
  var r;
  for (r = 1; r < values.length; r += 1) {
    var status = String(values[r][cStatus] || '').trim().toLowerCase();
    if (status !== 'ya') {
      skipped += 1;
      continue;
    }
    var fileKey = String(values[r][cKey] || '').trim();
    var bulan = bulanFromUpdatedAt_(values[r][cTime]);
    if (!fileKey || !bulan) {
      skipped += 1;
      continue;
    }
    var id = bulan + '\n' + fileKey;
    if (seen[id]) {
      skipped += 1;
      continue;
    }
    var waktu = values[r][cTime];
    if (Object.prototype.toString.call(waktu) === '[object Date]' && !isNaN(waktu.getTime())) {
      waktu = Utilities.formatDate(waktu, tz, 'yyyy-MM-dd HH:mm:ss');
    } else {
      waktu = String(waktu || '');
    }
    sheet.appendRow([
      bulan,
      fileKey,
      String(values[r][cKat] || ''),
      String(values[r][cProd] || ''),
      String(values[r][cName] || ''),
      String(values[r][cLink] || ''),
      'Ya',
      String(values[r][cNote] || ''),
      waktu
    ]);
    seen[id] = true;
    added += 1;
  }
  return { added: added, skipped: skipped };
}

function migrasiRiwayatBintang() {
  var result = migrateWinningFilesToRiwayat_();
  Logger.log(JSON.stringify(result));
  return result;
}
