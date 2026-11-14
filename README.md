# PromoOps Studio

Dashboard operasional promo: rekap pipeline video, pelanggaran, dan asistensi AI. Aplikasi memakai React, Vite, dan Tailwind, lalu di-host di Vercel.

URL Web App Apps Script dan kunci Gemini tidak lagi ditulis di kode atau di JavaScript yang dikirim ke browser. Dashboard memanggil endpoint relatif `/api/apps-script` dan `/api/gemini`. Fungsi server di Vercel meneruskan permintaan itu.

## Menjalankan secara lokal

1. Pasang dependensi: `npm install`
2. Salin `.env.example` menjadi `.env`, lalu isi ketiga variabel wajib. `GEMINI_MODEL` boleh dikosongkan. File `.env` tidak boleh di-commit.
3. Jalankan `npm run dev`. Vite ikut melayani `/api/apps-script`, `/api/gemini`, dan `/api/tiktok-resolve` dengan nilai dari `.env`.
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

Perantara Apps Script hanya meneruskan aksi yang dipakai dashboard:

- GET tanpa `action`: ambil data dashboard
- GET `action=run_update`: jalankan pembaruan (memakai kuota RapidAPI)
- POST `save_winning_web`, `save_winning_file`, `save_violation`, `update_violation`

Aksi lain ditolak. `run_update` dapat berjalan sampai 60 detik (`maxDuration` di `vercel.json`). Naikkan batas itu bila paket Vercel mengizinkan dan bot membutuhkan waktu lebih lama.

`GET /api/tiktok-resolve?url=` mengubah tautan TikTok menjadi ID video untuk pemutar di dalam dashboard. Tautan yang sudah memuat `/video/<id>` dibaca tanpa meminta ulang ke TikTok. Tautan pendek `vt.tiktok.com` dan `vm.tiktok.com` diikuti pengalihan HTTPS-nya (batas waktu dan cache memori singkat). Host yang diizinkan hanya `tiktok.com`, `www.tiktok.com`, `m.tiktok.com`, `vt.tiktok.com`, dan `vm.tiktok.com`. Port selain 443, kredensial di URL, dan pengalihan ke host lain ditolak.

Tombol **Buka di HP** di modal Rekap Pipeline memakai `linkHp` pada `rawAssets` dan `klipVideos`. Kalau field itu belum ada, tombolnya tidak ditampilkan dan tombol OneDrive tetap ada. Cara menambah field di Apps Script ada di `apps-script/linkHp-snippet.gs` (tempel, lalu deploy versi baru pada deployment yang sama supaya URL `/exec` tidak berubah).

Bintang file per bulan laporan memakai `starHistory` dari `doGet`. Kalau field itu belum ada, dashboard tetap menandai bintang seperti sebelumnya (satu status per file di `Data_Winning_Files`). Cara menambah tab `Riwayat_Bintang` ada di `apps-script/riwayat-bintang.gs`: tempel, lalu **Deploy → Manage deployments → pensil → Version: New version → Deploy**. Jangan buat deployment Web App baru.

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
