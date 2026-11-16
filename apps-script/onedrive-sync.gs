/**
 * Sinkron OneDrive → tab FILE_ASSET.
 *
 * Tab tersembunyi: _Token_OneDrive
 *   Kolom: Kunci | Nilai
 *   Kunci: refresh_token, device_code, device_expires, poll_interval
 *   Dibuat otomatis saat aksi token pertama kali jalan, lalu disembunyikan.
 *
 * Tab yang ditulis: FILE_ASSET
 *   Baris lama TIDAK dihapus dan tab TIDAK dikosongkan.
 *   File baru ditambahkan di bawah, kolom dicocokkan lewat nama header.
 *   File lama yang berganti nama / pindah folder hanya mengubah
 *   Nama_File, Path_Folder, dan Link_Folder.
 *   Status_File, File_Utama, Catatan, dan kolom lain (termasuk rumus)
 *   pada baris yang sudah ada tidak ditulis ulang.
 *
 * Aksi doPost (hanya dipanggil server Vercel, bersama token Apps Script):
 *   get_onedrive_token
 *   save_onedrive_token
 *   get_file_assets
 *   upsert_file_assets
 *
 * Jangan menambahkan aksi ini ke allowlist /api/apps-script di Vercel.
 * Token OneDrive tidak boleh sampai ke browser.
 *
 * Cara menempel
 * 1. Buka proyek Apps Script yang URL /exec-nya dipakai APPS_SCRIPT_URL.
 *    Jangan membuat deployment baru.
 * 2. Tambahkan file ini (nama file: OneDrive_Sync) lewat tanda + lalu Script.
 *    Jangan menghapus doGet / doPost yang sedang berjalan.
 * 3. Di doPost, SETELAH pengecekan token dan SETELAH action serta data
 *    dibaca, sisipkan cabang ini sebelum aksi lain:
 *
 *      if (action === 'get_onedrive_token' || action === 'save_onedrive_token' || action === 'get_file_assets' || action === 'upsert_file_assets') {
 *        return handleOneDriveSyncAction_(action, data);
 *      }
 *
 *    Jika variabel body-nya bukan data, sesuaikan.
 *    Dashboard / server mengirim POST JSON:
 *      { action: "upsert_file_assets", data: { updates: [...], inserts: [...] }, token }
 *      { action: "save_onedrive_token", data: { refreshToken, deviceCode, deviceExpires, pollInterval }, token }
 * 4. Deploy ulang sebagai VERSI BARU pada deployment yang sama:
 *    Deploy → Manage deployments → ikon pensil pada deployment Web App
 *    → Version: New version → Deploy.
 *    Jangan memilih New deployment. URL /exec harus tetap sama.
 * 5. Isi ONEDRIVE_CLIENT_ID di Vercel, lalu redeploy proyek Vercel
 *    supaya fungsi server membaca variabel itu.
 * 6. Muat ulang dashboard, klik Hubungkan OneDrive sekali,
 *    lalu pakai Sinkron Video Final atau Sinkron Mentahan.
 */

var ONEDRIVE_TOKEN_SHEET_ = '_Token_OneDrive';

var ONEDRIVE_TOKEN_FIELDS_ = {
  refreshToken: 'refresh_token',
  deviceCode: 'device_code',
  deviceExpires: 'device_expires',
  pollInterval: 'poll_interval'
};

var FILE_ASSET_INSERT_COLUMNS_ = [
  'Id_File',
  'Id_Klip',
  'Nama_File',
  'Jenis_File',
  'Versi',
  'Storage',
  'Link_File',
  'Link_HP',
  'Link_Folder',
  'Path_Folder',
  'Cloud_File_ID',
  'Format_File',
  'Ukuran_MB',
  'Tanggal_File',
  'Status_File',
  'File_Utama',
  'Catatan'
];

function oneDriveJson_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleOneDriveSyncAction_(action, data) {
  try {
    if (action === 'get_onedrive_token') return oneDriveJson_(getOneDriveToken_());
    if (action === 'save_onedrive_token') return oneDriveJson_(saveOneDriveToken_(data || {}));
    if (action === 'get_file_assets') return oneDriveJson_(getFileAssetsForSync_());
    if (action === 'upsert_file_assets') return oneDriveJson_(upsertFileAssets_(data || {}));
  } catch (err) {
    return oneDriveJson_({
      status: 'error',
      message: 'Gagal memproses sinkron OneDrive di Apps Script.'
    });
  }
  return oneDriveJson_({ status: 'error', message: 'Aksi OneDrive tidak dikenal.' });
}

function ensureOneDriveTokenSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ONEDRIVE_TOKEN_SHEET_);
  if (!sheet) {
    sheet = ss.insertSheet(ONEDRIVE_TOKEN_SHEET_);
    sheet.getRange(1, 1, 1, 2).setValues([['Kunci', 'Nilai']]);
    sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
  }
  sheet.getRange('A:B').setNumberFormat('@');
  try {
    if (ss.getSheets().length > 1 && !sheet.isSheetHidden()) sheet.hideSheet();
  } catch (err) {
    // Spreadsheet menolak menyembunyikan satu-satunya tab. Data tetap tersimpan.
  }
  return sheet;
}

function oneDriveTokenMap_(sheet) {
  var values = sheet.getDataRange().getValues();
  var map = {};
  var i;
  for (i = 0; i < values.length; i += 1) {
    var key = String(values[i][0] || '').trim();
    if (!key || key === 'Kunci') continue;
    map[key] = { row: i + 1, value: values[i][1] };
  }
  return map;
}

function writeOneDriveTokenKey_(sheet, map, key, value) {
  var text = value == null ? '' : String(value);
  if (map[key]) {
    var cell = sheet.getRange(map[key].row, 2);
    cell.setNumberFormat('@');
    cell.setValue(text);
    map[key].value = text;
    return;
  }
  var row = Math.max(sheet.getLastRow(), 1) + 1;
  sheet.getRange(row, 1, 1, 2).setNumberFormat('@');
  sheet.getRange(row, 1, 1, 2).setValues([[key, text]]);
  map[key] = { row: row, value: text };
}

function getOneDriveToken_() {
  var sheet = ensureOneDriveTokenSheet_();
  var map = oneDriveTokenMap_(sheet);
  var refresh = map.refresh_token ? String(map.refresh_token.value || '') : '';
  var device = map.device_code ? String(map.device_code.value || '') : '';
  var expires = map.device_expires ? String(map.device_expires.value || '') : '';
  var interval = map.poll_interval ? String(map.poll_interval.value || '') : '';
  return {
    status: 'success',
    refreshToken: refresh,
    deviceCode: device,
    deviceExpires: expires,
    pollInterval: interval
  };
}

function saveOneDriveToken_(data) {
  var sheet = ensureOneDriveTokenSheet_();
  var map = oneDriveTokenMap_(sheet);
  var field;
  for (field in ONEDRIVE_TOKEN_FIELDS_) {
    if (!Object.prototype.hasOwnProperty.call(ONEDRIVE_TOKEN_FIELDS_, field)) continue;
    if (!Object.prototype.hasOwnProperty.call(data, field)) continue;
    writeOneDriveTokenKey_(sheet, map, ONEDRIVE_TOKEN_FIELDS_[field], data[field]);
  }
  return { status: 'success' };
}

function fileAssetHeaderMap_(sheet) {
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var map = {};
  var i;
  for (i = 0; i < headers.length; i += 1) {
    var name = String(headers[i] || '').trim();
    if (name && map[name] == null) map[name] = i;
  }
  return map;
}

function requireFileAssetColumns_(headerMap) {
  var missing = [];
  var i;
  for (i = 0; i < FILE_ASSET_INSERT_COLUMNS_.length; i += 1) {
    if (headerMap[FILE_ASSET_INSERT_COLUMNS_[i]] == null) missing.push(FILE_ASSET_INSERT_COLUMNS_[i]);
  }
  return missing;
}

function getFileAssetsForSync_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('FILE_ASSET');
  if (!sheet) return { status: 'error', message: 'Tab FILE_ASSET tidak ditemukan.' };

  var headerMap = fileAssetHeaderMap_(sheet);
  if (headerMap.Id_File == null) {
    return { status: 'error', message: 'Kolom Id_File tidak ditemukan di FILE_ASSET.' };
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { status: 'success', rows: [] };

  var width = Math.max(sheet.getLastColumn(), headerMap.Id_File + 1);
  var values = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  var idCol = headerMap.Id_File;
  var nameCol = headerMap.Nama_File;
  var pathCol = headerMap.Path_Folder;
  var rows = [];
  var i;
  for (i = 0; i < values.length; i += 1) {
    var id = String(values[i][idCol] || '').trim();
    if (!id) continue;
    rows.push({
      idFile: id,
      namaFile: nameCol == null ? '' : String(values[i][nameCol] == null ? '' : values[i][nameCol]),
      pathFolder: pathCol == null ? '' : String(values[i][pathCol] == null ? '' : values[i][pathCol])
    });
  }
  return { status: 'success', rows: rows };
}

function groupContiguousCells_(sheet, columnNumber, cells) {
  if (!cells.length) return;
  cells.sort(function (a, b) { return a.row - b.row; });
  var start = 0;
  while (start < cells.length) {
    var end = start;
    while (end + 1 < cells.length && cells[end + 1].row === cells[end].row + 1) end += 1;
    var block = [];
    var i;
    for (i = start; i <= end; i += 1) block.push([cells[i].value]);
    sheet.getRange(cells[start].row, columnNumber, block.length, 1).setValues(block);
    start = end + 1;
  }
}

function upsertFileAssets_(data) {
  if (data && (data.clear || data.replace || data.truncate)) {
    return { status: 'error', message: 'Pengosongan tab ditolak.' };
  }

  var updates = data && Array.isArray(data.updates) ? data.updates : null;
  var inserts = data && Array.isArray(data.inserts) ? data.inserts : null;
  if (!updates || !inserts) {
    return { status: 'error', message: 'Data sinkron tidak valid.' };
  }
  if (updates.length > 200 || inserts.length > 200) {
    return { status: 'error', message: 'Batch sinkron terlalu besar.' };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('FILE_ASSET');
  if (!sheet) return { status: 'error', message: 'Tab FILE_ASSET tidak ditemukan.' };

  var headerMap = fileAssetHeaderMap_(sheet);
  var missing = requireFileAssetColumns_(headerMap);
  if (missing.length) {
    return { status: 'error', message: 'Kolom FILE_ASSET belum lengkap: ' + missing.join(', ') };
  }

  var lastRow = sheet.getLastRow();
  var idToRows = {};
  if (lastRow >= 2) {
    var idValues = sheet.getRange(2, headerMap.Id_File + 1, lastRow - 1, 1).getValues();
    var r;
    for (r = 0; r < idValues.length; r += 1) {
      var existingId = String(idValues[r][0] || '').trim();
      if (!existingId) continue;
      if (!idToRows[existingId]) idToRows[existingId] = [];
      idToRows[existingId].push(r + 2);
    }
  }

  var nameCells = [];
  var pathCells = [];
  var linkCells = [];
  var updated = 0;
  var u;
  for (u = 0; u < updates.length; u += 1) {
    var change = updates[u] || {};
    var idFile = String(change.idFile || '').trim();
    var rows = idFile && idToRows[idFile] ? idToRows[idFile] : [];
    if (!rows.length) continue;
    var n;
    for (n = 0; n < rows.length; n += 1) {
      nameCells.push({ row: rows[n], value: change.namaFile == null ? '' : String(change.namaFile) });
      pathCells.push({ row: rows[n], value: change.pathFolder == null ? '' : String(change.pathFolder) });
      linkCells.push({ row: rows[n], value: change.linkFolder == null ? '' : String(change.linkFolder) });
    }
    updated += 1;
  }

  groupContiguousCells_(sheet, headerMap.Nama_File + 1, nameCells);
  groupContiguousCells_(sheet, headerMap.Path_Folder + 1, pathCells);
  groupContiguousCells_(sheet, headerMap.Link_Folder + 1, linkCells);

  var pending = [];
  var seenInsert = {};
  var i;
  for (i = 0; i < inserts.length; i += 1) {
    var incoming = inserts[i] || {};
    var newId = String(incoming.Id_File || '').trim();
    if (!newId || idToRows[newId] || seenInsert[newId]) continue;
    seenInsert[newId] = true;
    pending.push(incoming);
  }

  if (pending.length) {
    var startRow = sheet.getLastRow() + 1;
    var c;
    for (c = 0; c < FILE_ASSET_INSERT_COLUMNS_.length; c += 1) {
      var columnName = FILE_ASSET_INSERT_COLUMNS_[c];
      var columnIndex = headerMap[columnName];
      var columnValues = [];
      var p;
      for (p = 0; p < pending.length; p += 1) {
        var cellValue = pending[p][columnName];
        columnValues.push([cellValue == null ? '' : cellValue]);
      }
      sheet.getRange(startRow, columnIndex + 1, columnValues.length, 1).setValues(columnValues);
    }
  }

  SpreadsheetApp.flush();
  return {
    status: 'success',
    updated: updated,
    inserted: pending.length
  };
}
