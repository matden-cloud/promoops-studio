/**
 * Tambahan Apps Script: tandai Status_File mentahan (Sudah Dipakai / Belum Dipakai).
 *
 * Jangan buat tab atau kolom baru. Jangan menjalankan file ini terhadap sheet
 * produksi dari luar. Tempel ke proyek Apps Script yang sudah jalan, lalu
 * Deploy → Manage deployments → pensil → Version: New version → Deploy.
 * Jangan buat deployment Web App baru.
 *
 * Tab yang ditulis: FILE_ASSET
 * Kolom yang ditulis: Status_File (kolom O bila header tidak bergeser).
 * Pencocokan baris, berurutan: Id_File, Cloud_File_ID, lalu Nama_File
 * hanya bila Id tidak dikirim.
 *
 * Dashboard mengirim POST JSON (Content-Type text/plain):
 *   {
 *     action: "update_file_status",
 *     data: { Id_File, Raw_Asset_Id, Nama_File, status },
 *     token
 *   }
 * status hanya "Sudah Dipakai" atau "Belum Dipakai".
 *
 * doGet yang sudah ada menandai sebuah raw terpakai bila Raw_Asset_Id-nya
 * muncul di Klip_Vidio_RAW, ATAU FILE_ASSET.Status_File memuat "pakai" dan
 * tidak memuat "belum". Menulis "Belum Dipakai" tidak mengalahkan baris yang
 * sudah ada di Klip_Vidio_RAW. Tidak ada override doGet untuk kasus itu.
 *
 * Di doPost, setelah token dicek dan action serta data dibaca, sisipkan:
 *
 *   if (action === 'update_file_status') {
 *     return updateFileStatus_(data);
 *   }
 *
 * Agar tombol "Belum Dipakai" di dashboard hanya muncul untuk status manual,
 * saat menyusun tiap objek rawAssets di doGet pakai rawDipakaiDariStatus_:
 *
 *   var dipakai = rawDipakaiDariStatus_(rawId, klipRawIdMap, statusFile);
 *   raw.status = dipakai.status;
 *   raw.statusManual = dipakai.statusManual;
 *
 * statusManual true artinya terpakai hanya karena Status_File, bukan karena
 * Raw_Asset_Id ada di Klip_Vidio_RAW.
 */

function updateFileStatusJson_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function updateFileStatusCell_(value) {
  return String(value || '').replace(/^\s+|\s+$/g, '');
}

function updateFileStatus_(data) {
  var item = data || {};
  var status = updateFileStatusCell_(item.status);
  if (status !== 'Sudah Dipakai' && status !== 'Belum Dipakai') {
    return updateFileStatusJson_({ status: 'error', message: 'Status tidak dikenal.' });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('FILE_ASSET');
  if (!sheet) {
    return updateFileStatusJson_({ status: 'error', message: 'Tab FILE_ASSET tidak ditemukan.' });
  }

  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var headerIndex = {};
  var i;
  for (i = 0; i < headers.length; i += 1) {
    var name = updateFileStatusCell_(headers[i]);
    if (name && headerIndex[name] == null) headerIndex[name] = i;
  }

  var statusCol = headerIndex.Status_File;
  if (statusCol == null) statusCol = 14;
  var idCol = headerIndex.Id_File;
  var cloudCol = headerIndex.Cloud_File_ID;
  var nameCol = headerIndex.Nama_File;
  var wantedId = updateFileStatusCell_(item.Id_File || item.fileId || item.Raw_Asset_Id || item.rawAssetId);
  var wantedName = updateFileStatusCell_(item.Nama_File || item.fileName);
  if (!wantedId && !wantedName) {
    return updateFileStatusJson_({ status: 'error', message: 'File tidak dikenali.' });
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return updateFileStatusJson_({ status: 'error', message: 'File tidak ditemukan.' });
  }

  var values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  var found = -1;
  for (i = 0; i < values.length; i += 1) {
    var rowId = idCol != null ? updateFileStatusCell_(values[i][idCol]) : '';
    var rowCloud = cloudCol != null ? updateFileStatusCell_(values[i][cloudCol]) : '';
    var rowName = nameCol != null ? updateFileStatusCell_(values[i][nameCol]) : '';
    if (wantedId && (rowId === wantedId || rowCloud === wantedId)) {
      found = i;
      break;
    }
    if (!wantedId && wantedName && rowName === wantedName) {
      found = i;
      break;
    }
  }

  if (found < 0) {
    return updateFileStatusJson_({ status: 'error', message: 'File tidak ditemukan di FILE_ASSET.' });
  }

  sheet.getRange(found + 2, statusCol + 1).setValue(status);
  return updateFileStatusJson_({ status: 'success' });
}

/**
 * statusManual true hanya bila file terpakai lewat Status_File dan
 * Raw_Asset_Id-nya tidak ada di peta Klip_Vidio_RAW.
 */
function rawDipakaiDariStatus_(rawId, klipRawIdMap, statusFile) {
  var id = updateFileStatusCell_(rawId);
  var usedByKlip = !!(id && klipRawIdMap && klipRawIdMap[id]);
  var statusText = String(statusFile || '').toLowerCase();
  var usedByStatus = statusText.indexOf('pakai') !== -1 && statusText.indexOf('belum') === -1;
  var used = usedByKlip || usedByStatus;
  return {
    status: used ? 'Sudah Dipakai' : 'Belum Dipakai',
    statusManual: used && !usedByKlip
  };
}
