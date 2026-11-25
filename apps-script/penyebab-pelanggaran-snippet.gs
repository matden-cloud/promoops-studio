/**
 * Tambahan Apps Script: field penyebab pada pelanggaran.
 *
 * Kode Apps Script dashboard ini tidak ada di repo. Jangan buat tab baru
 * dan jangan menjalankan skrip ini untuk mengubah sheet dari luar.
 *
 * Yang perlu ditambahkan manual di spreadsheet:
 *   Kolom header persis: Penyebab
 *   Letak: tab yang sama dengan baris pelanggaran yang sudah ada
 *   (kolom yang sekarang terpakai antara lain tanggal, akun, produk, jenis,
 *   status, linkVideo, screenshots, catatan).
 *
 * Dashboard sudah mengirim data.penyebab (string, boleh kosong) pada
 * POST save_violation dan update_violation. doGet harus mengembalikan
 * penyebab pada setiap objek di violations. Kalau kolom atau field belum
 * ada, dashboard menampilkan penyebab kosong dan tetap bisa disimpan.
 *
 * Cara menempel
 * 1. Buka proyek Apps Script dashboard (bukan deployment-nya).
 * 2. Tambahkan fungsi di bawah ini. Jangan mengganti seluruh doGet / doPost.
 * 3. Saat menulis baris pelanggaran, panggil writeViolationPenyebab_.
 *    Saat membaca baris, pakai readViolationPenyebab_ dan taruh di objek:
 *    item.penyebab = readViolationPenyebab_(sheet, rowNumber, headerMap);
 * 4. headerMap adalah objek nama header -> nomor kolom (1-based),
 *    misalnya headerMap['Penyebab'] = 9. Sesuaikan dengan cara skrip
 *    yang sudah ada memetakan header.
 * 5. Deploy ulang sebagai VERSI BARU pada deployment yang sama
 *    (Deploy → Manage deployments → pensil → Version: New version → Deploy).
 *    Jangan buat deployment Web App baru.
 */

function readViolationPenyebab_(sheet, rowNumber, headerMap) {
  var col = headerMap && headerMap.Penyebab;
  if (col == null) return '';
  var value = sheet.getRange(rowNumber, col).getDisplayValue();
  var text = String(value || '').replace(/^\s+|\s+$/g, '');
  if (!text || text === '-') return '';
  return text.slice(0, 500);
}

function writeViolationPenyebab_(sheet, rowNumber, headerMap, data) {
  var col = headerMap && headerMap.Penyebab;
  if (col == null) return;
  var text = data && data.penyebab != null ? String(data.penyebab) : '';
  text = text.replace(/^\s+|\s+$/g, '').slice(0, 500);
  sheet.getRange(rowNumber, col).setValue(text);
}
