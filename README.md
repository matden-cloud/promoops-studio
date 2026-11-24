# PromoOps Studio

Dashboard operasional promo: rekap pipeline video, pelanggaran, dan asistensi AI. Aplikasi memakai React, Vite, dan Tailwind, lalu di-host di Vercel.

URL Web App Apps Script dan kunci Gemini tidak lagi ditulis di kode atau di JavaScript yang dikirim ke browser. Dashboard memanggil endpoint relatif `/api/apps-script` dan `/api/gemini`. Fungsi server di Vercel meneruskan permintaan itu.

## Menjalankan secara lokal

1. Pasang dependensi: `npm install`
2. Salin `.env.example` menjadi `.env`, lalu isi ketiga variabel wajib. `GEMINI_MODEL` boleh dikosongkan. File `.env` tidak boleh di-commit.
3. Jalankan `npm run dev`. Vite ikut melayani `/api/apps-script`, `/api/gemini`, `/api/voice`, dan `/api/tiktok-resolve` dengan nilai dari `.env`.
4. `npm run build` membuat bundle produksi. `npm run preview` juga melayani endpoint itu. `npm test` menjalankan uji perantara dengan server tiruan.

Fungsi `/api` membaca variabel lingkungan proses Node. Jangan memberi awalan yang membuat Vite menyisipkan nilainya ke bundle browser.

## Variabel yang wajib diisi di Vercel

Isi di **Project Settings → Environment Variables** untuk environment Production (dan Preview, bila preview dipakai). Nilai ini dipakai saat fungsi server berjalan, bukan disisipkan ke JavaScript browser. Setelah mengubah variabel, deploy ulang.

| Variabel | Isi |
| --- | --- |
| `APPS_SCRIPT_URL` | URL deployment Web App Apps Script yang **baru**, yang berakhiran `/exec` |
| `APPS_SCRIPT_TOKEN` | Token rahasia yang sama dengan Script Property `APPS_SCRIPT_TOKEN` di Apps Script |
| `GEMINI_API_KEY` | Kunci Gemini yang baru |
| `GEMINI_MODEL` | Opsional. Nama model Gemini. Kosong berarti `gemini-3.5-flash-lite`. Hanya huruf, angka, titik, dan minus |
| `ONEDRIVE_CLIENT_ID` | Application (client) ID aplikasi Microsoft publik untuk sinkron OneDrive. Bukan client secret. Login memakai `https://login.microsoftonline.com/common` |
| `REPLIZ_ACCESS_KEY` | Access key API Repliz. Hanya dibaca server |
| `REPLIZ_SECRET_KEY` | Secret key API Repliz. Hanya dibaca server |
| `MEDIA_URL_SECRET` | Rahasia HMAC untuk URL media OneDrive yang diambil Repliz. Minimal 16 karakter. Tanpa ini jadwal tidak dikirim |
| `PUBLIC_APP_URL` | Opsional. Origin publik aplikasi, misalnya `https://promo.example.com`. Kosong memakai `VERCEL_PROJECT_PRODUCTION_URL` |

Perantara Apps Script hanya meneruskan aksi yang dipakai dashboard:

- GET tanpa `action`: ambil data dashboard
- GET `action=run_update`: jalankan pembaruan (memakai kuota RapidAPI)
- POST `save_winning_web`, `save_winning_file`, `save_violation`, `update_violation`

Aksi lain ditolak. `run_update` dapat berjalan sampai 60 detik (`maxDuration` di `vercel.json`). Naikkan batas itu bila paket Vercel mengizinkan dan bot membutuhkan waktu lebih lama.

`GET /api/tiktok-resolve?url=` mengubah tautan TikTok menjadi ID video untuk pemutar di dalam dashboard. Tautan yang sudah memuat `/video/<id>` dibaca tanpa meminta ulang ke TikTok. Tautan pendek `vt.tiktok.com` dan `vm.tiktok.com` diikuti pengalihan HTTPS-nya (batas waktu dan cache memori singkat). Host yang diizinkan hanya `tiktok.com`, `www.tiktok.com`, `m.tiktok.com`, `vt.tiktok.com`, dan `vm.tiktok.com`. Port selain 443, kredensial di URL, dan pengalihan ke host lain ditolak.

Tombol **Buka di HP** di modal Rekap Pipeline memakai `linkHp` pada `rawAssets` dan `klipVideos`. Kalau field itu belum ada, tombolnya tidak ditampilkan dan tombol OneDrive tetap ada. Cara menambah field di Apps Script ada di `apps-script/linkHp-snippet.gs` (tempel, lalu deploy versi baru pada deployment yang sama supaya URL `/exec` tidak berubah).

Bintang file per bulan laporan memakai `starHistory` dari `doGet`. Kalau field itu belum ada, dashboard tetap menandai bintang seperti sebelumnya (satu status per file di `Data_Winning_Files`). Cara menambah tab `Riwayat_Bintang` ada di `apps-script/riwayat-bintang.gs`: tempel, lalu **Deploy → Manage deployments → pensil → Version: New version → Deploy**. Jangan buat deployment Web App baru.

Tombol **Sinkron Video Final** dan **Sinkron Mentahan** di tab **Sinkron Bot** memanggil `/api/onedrive-sync`. Masuk sekali lewat `/api/onedrive-login` (kode perangkat Microsoft). Refresh token disimpan di tab tersembunyi `_Token_OneDrive`, bukan di browser. Cara menempel aksi Apps Script ada di `apps-script/onedrive-sync.gs`. Selain `ONEDRIVE_CLIENT_ID`, tidak ada variabel baru: pemanggilan sheet tetap memakai `APPS_SCRIPT_URL` dan `APPS_SCRIPT_TOKEN`. Setelah sinkron, tab yang sama menampilkan nama dan path file baru serta nama/path lama menuju nama/path baru. Daftar itu tetap ada setelah halaman dimuat ulang sampai tombol **Tutup** diklik. Sinkron tetap berjalan bila pengguna pindah ke tab lain; tombol Sinkron Bot berputar selama proses itu.

`GET /api/onedrive-stream?id=<Id_File>` memutar file OneDrive di dalam dashboard. Id diperiksa, token diambil dengan cara yang sama seperti sinkron (`get_onedrive_token` / `save_onedrive_token`), lalu browser diarahkan ke tautan unduh singkat dari Microsoft. Token tidak dikirim ke browser.

Tab **Jadwal Repliz** menyusun rencana upload TikTok dari Video Final, lalu mengirimnya ke Repliz hanya setelah tombol **Konfirmasi & kirim ke Repliz**. Chat Gemini (`/api/repliz-plan`) hanya mengisi tabel konfirmasi dan tidak membuat jadwal. URL yang dikirim ke Repliz adalah tautan bertanda tangan `/api/repliz-media`, bukan `downloadUrl` Microsoft yang singkat. Video produk Gantungan Bor ditahan dan tidak masuk ke rencana otomatis. Jika `REPLIZ_ACCESS_KEY`, `REPLIZ_SECRET_KEY`, atau `MEDIA_URL_SECRET` belum diisi, tab tetap terbuka dengan pesan konfigurasi.

Tab **Pelanggaran** mengirim `penyebab` bersama data yang sudah ada (`save_violation` / `update_violation`). Kalau Apps Script belum menulis field itu, isian tetap tampil sampai halaman dimuat ulang, lalu kosong. Cara menambah kolom `Penyebab` ada di `apps-script/penyebab-pelanggaran-snippet.gs`. Jangan buat tab baru. Tombol **Analisis Video** memakai file OneDrive bila tautan TikTok-nya sama dengan postingan di rekap. Tautan TikTok tidak diunduh. Kalau OneDrive belum terhubung atau file tidak ketemu, unggah MP4 (di bawah 2,5 MB lewat server, sampai 80 MB langsung ke Gemini tanpa kunci di browser).

Tab **Editor Voice** hanya memakai mesin gratis. Replikasi suara Gemini dimatikan. Gemini tetap untuk suara bawaan dan desain suara lewat `/api/voice`. Fish Audio (`FISH_API_KEY`, model `s2.1-pro-free`) lewat `/api/voice?engine=fish` dan berhenti pada 1 Desember 2026 pukul 00.00 WIB. Inworld (`INWORLD_API_KEY`, model `inworld-tts-2-flash`) lewat `/api/voice?engine=inworld`; penghitung 65 menit ada di browser. Audio hasil tetap di IndexedDB. Kunci kosong menampilkan nama variabelnya dan tidak mematikan mesin lain. Ponsel membuka tab dari sheet **Lainnya**. Desktop menambah item nav **Editor Voice**. Kuota Gemini habis (HTTP 429) tetap dijelaskan sebagai batas harian.

Model default adalah `gemini-3.5-flash-lite`, pengganti resmi `gemini-2.5-flash`. Google menandai `gemini-2.5-flash` deprecated: mulai 1 Desember 2026 permintaan ke model itu dialihkan ke `gemini-3.5-flash-lite`, dan akses model 2.5 dibatasi ke proyek yang sudah pernah memakainya. Nama lain bisa diisi lewat `GEMINI_MODEL`. Untuk `gemini-2.5-flash`, server mematikan thinking (`thinkingBudget` 0) supaya token keluaran tidak habis sebelum jawaban terbentuk. Model Gemini 3 memakai `thinkingLevel` rendah (`MINIMAL` pada Flash-Lite, `LOW` pada Flash lain) dan tidak menerima `temperature`. Batas `maxOutputTokens` adalah 2048. Jika Google menolak, respons memuat `detail` berisi status HTTP, `error.status`, dan `error.message` dari Google; kunci API disensor. Kunci dikirim dari server lewat header, tidak lewat query string.

## Langkah manual pemilik setelah merge

Jangan menganggap merge saja sudah menutup URL lama. Kerjakan langkah berikut.

1. Buat token acak yang panjang (puluhan karakter, huruf dan angka). Simpan sebagai environment variable `APPS_SCRIPT_TOKEN` di Vercel.
2. Di proyek Apps Script, buka **Project Settings → Script properties**. Tambahkan properti bernama `APPS_SCRIPT_TOKEN` dengan nilai token yang sama.
3. Sisipkan pengecekan token di bawah ini ke skrip yang sudah ada. Tanpa pengecekan ini, siapa pun yang masih mengetahui URL Web App dapat membaca dan menulis data.
4. Deploy sebagai **Web App baru** (**Deploy → New deployment**), bukan hanya versi baru pada deployment lama. Akses tetap **Anyone**, karena server Vercel memanggilnya tanpa login Google. Salin URL yang berakhiran `/exec` ke `APPS_SCRIPT_URL`.
5. Hapus atau arsipkan deployment lama (**Deploy → Manage deployments**) supaya alamat lama tidak berlaku lagi. Deployment baru tidak mematikan alamat lama secara otomatis.
6. Cabut kunci Gemini yang lama (kunci yang pernah ikut terbundle ke browser), buat kunci baru, lalu isi `GEMINI_API_KEY` di Vercel.
7. Pastikan ketiga variabel terisi, lalu redeploy proyek Vercel.

## Pengecekan token di Apps Script

Tempel helper ini di proyek Apps Script, lalu panggil `appsScriptTokenOk_(e)` di baris pertama `doGet` dan `doPost` yang sudah ada. Jangan mengganti seluruh isi kedua fungsi itu: logika spreadsheet yang sudah berjalan tetap di bawah pengecekan.

Token dikirim sebagai parameter query `token` (GET dan POST) dan, untuk POST, juga sebagai field `token` pada JSON. Abaikan field `token` saat memproses `action` dan `data`.

```javascript
function appsScriptTokenOk_(e) {
  var expected = PropertiesService.getScriptProperties().getProperty('APPS_SCRIPT_TOKEN') || '';
  if (!expected) return false;

  var fromQuery = (e && e.parameter && e.parameter.token) ? String(e.parameter.token) : '';
  var fromBody = '';
  try {
    if (e && e.postData && e.postData.contents) {
      var parsed = JSON.parse(e.postData.contents);
      if (parsed && parsed.token) fromBody = String(parsed.token);
    }
  } catch (err) {
    fromBody = '';
  }

  return (fromQuery || fromBody) === expected;
}

function appsScriptUnauthorized_() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'error', message: 'Unauthorized' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  if (!appsScriptTokenOk_(e)) return appsScriptUnauthorized_();
  // ...lanjutkan doGet yang sudah ada (data dashboard, atau action run_update)...
}

function doPost(e) {
  if (!appsScriptTokenOk_(e)) return appsScriptUnauthorized_();
  var body = JSON.parse(e.postData.contents);
  var action = body.action;
  var data = body.data;
  // ...lanjutkan doPost yang sudah ada. Jangan memakai body.token sebagai data...
}
```

Body POST yang diteruskan memakai `Content-Type: text/plain` berisi JSON `{ action, data, token }`, sama seperti pemanggilan dashboard sebelum perantara ini ada.
