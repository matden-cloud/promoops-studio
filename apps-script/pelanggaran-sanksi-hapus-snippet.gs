/**
 * Tambahan Apps Script: penyebab (kolom J), sanksi (kolom K), dan hapus baris.
 *
 * Jangan menjalankan file ini terhadap sheet produksi dari luar.
 * Tempel potongan di bawah ke proyek Apps Script yang sudah jalan, lalu
 * Deploy → Manage deployments → pensil → Version: New version → Deploy.
 * Jangan buat deployment Web App baru.
 *
 * Tab: Data_Pelanggaran
 * Header baris 1, persis:
 *   A ID
 *   B Tanggal
 *   C Akun
 *   D Produk
 *   E Jenis_Pelanggaran
 *   F Status
 *   G Link_Video
 *   H Catatan
 *   I Screenshot_Base64
 *   J Penyebab
 *   K Sanksi
 *
 * Dashboard mengirim POST JSON:
 *   { action, data, token }
 * dengan Content-Type text/plain. Field teks ada di data, huruf kecil:
 *   data.penyebab  data.sanksi  data.catatan  data.screenshots
 * Jangan membaca data.Penyebab. Huruf besar itu hanya nama kolom sheet.
 *
 * doGet, pada setiap objek violations:
 *   penyebab: String(objP.Penyebab || '').trim(),
 *   sanksi: String(objP.Sanksi || '').trim(),
 */

function violationScreenshotsJson_(data) {
  var shots = data && data.screenshots;
  if (typeof shots === 'string') return shots;
  try {
    return JSON.stringify(shots || []);
  } catch (err) {
    return '[]';
  }
}

function violationRowValues_(data) {
  var item = data || {};
  return [
    item.id != null ? item.id : '',
    item.tanggal || '',
    item.akun || '',
    item.produk || '',
    item.jenis || '',
    item.status || 'Belum Banding',
    item.linkVideo || '',
    item.catatan || '-',
    violationScreenshotsJson_(item),
    item.penyebab || '',
    item.sanksi || ''
  ];
}

/**
 * save_violation — satu appendRow, 11 kolom. Penyebab adalah nilai ke-10
 * (kolom J). Sanksi adalah nilai ke-11 (kolom K).
 *
 *   sheet.appendRow(violationRowValues_(body.data));
 */
function saveViolationRow_(sheet, data) {
  sheet.appendRow(violationRowValues_(data));
}

/**
 * update_violation — kolom 1-9 lewat setValues, lalu kolom 10 dan 11.
 * getRange 4 argumen adalah (baris, kolom, jumlahBaris, jumlahKolom),
 * bukan baris akhir / kolom akhir.
 *
 *   var rowValues = violationRowValues_(body.data);
 *   sheet.getRange(rowNum, 1, 1, 9).setValues([rowValues.slice(0, 9)]);
 *   sheet.getRange(rowNum, 10).setValue(body.data.penyebab || '');
 *   sheet.getRange(rowNum, 11).setValue(body.data.sanksi || '');
 */
function updateViolationRow_(sheet, rowNum, data) {
  var rowValues = violationRowValues_(data);
  sheet.getRange(rowNum, 1, 1, 9).setValues([rowValues.slice(0, 9)]);
  var item = data || {};
  sheet.getRange(rowNum, 10).setValue(item.penyebab || '');
  sheet.getRange(rowNum, 11).setValue(item.sanksi || '');
}

/**
 * delete_violation — cari ID di kolom A, lalu deleteRow.
 * Balasan JSON: { status: 'success' } atau { status: 'error', message }.
 *
 *   if (action === 'delete_violation') return deleteViolationById_(sheet, data);
 */
function deleteViolationById_(sheet, data) {
  var wanted = String(data && data.id != null ? data.id : '').replace(/^\s+|\s+$/g, '');
  if (!wanted) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: 'ID pelanggaran kosong.' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i += 1) {
    var current = String(values[i][0] != null ? values[i][0] : '').replace(/^\s+|\s+$/g, '');
    if (current && current === wanted) {
      sheet.deleteRow(i + 1);
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'success' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'error', message: 'Data pelanggaran tidak ditemukan.' }))
    .setMimeType(ContentService.MimeType.JSON);
}
