import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, Video, Eye, RefreshCw, ExternalLink, Edit3, Sparkles, 
  LayoutDashboard, BarChart2,
  Filter, Zap, Flame, Rocket, ChevronLeft, ChevronRight, PlayCircle, 
  X, AlertTriangle, CheckCircle2, ServerCrash, BrainCircuit,
  ShieldAlert, Star, Plus, Image as ImageIcon, FolderOpen, Send, Printer, Trash2
} from 'lucide-react';

// --- DATA SIMULASI UNTUK REKAP PIPELINE ---
const INITIAL_PRODUCT_STATS = [
  { id: 1, produk: 'Nozzle Lem Silikon', bulan: '2026-11', tanggal: '2026-11-12', tim: 'Deni Rohmat', mentahan: 16, belumDipakai: 6, dipakai: 10, videoFinal: 12, upload: 10, isWinning: true },
  { id: 2, produk: 'Perata Keramik', bulan: '2026-11', tanggal: '2026-11-12', tim: 'Rahmat Pajari', mentahan: 14, belumDipakai: 4, dipakai: 10, videoFinal: 15, upload: 12, isWinning: true },
  { id: 3, produk: 'Alat Lepas Busi Rusak Mobil', bulan: '2026-11', tanggal: '2026-11-11', tim: 'Deni Rohmat', mentahan: 11, belumDipakai: 3, dipakai: 8, videoFinal: 10, upload: 11, isWinning: false },
  { id: 4, produk: 'Saringan Talang Air Stainless', bulan: '2026-11', tanggal: '2026-11-11', tim: 'Ikhsan Harun', mentahan: 10, belumDipakai: 2, dipakai: 8, videoFinal: 8, upload: 8, isWinning: false },
  { id: 5, produk: 'Kunci Pemutar Dongkrak Mobil', bulan: '2026-11', tanggal: '2026-11-10', tim: 'Deni Rohmat', mentahan: 12, belumDipakai: 5, dipakai: 7, videoFinal: 9, upload: 9, isWinning: true },
  { id: 6, produk: 'Spons Amplas Pembersih Kaca', bulan: '2026-11', tanggal: '2026-11-10', tim: 'Mochamad Rizal', mentahan: 12, belumDipakai: 4, dipakai: 8, videoFinal: 11, upload: 10, isWinning: false },
  { id: 7, produk: 'Mangkok Baut Magnetik', bulan: '2026-10', tanggal: '2026-10-28', tim: 'Rahmat Pajari', mentahan: 25, belumDipakai: 5, dipakai: 20, videoFinal: 22, upload: 20, isWinning: true },
  { id: 8, produk: 'Mata Bor Hole Diamond 3 Tahap', bulan: '2026-10', tanggal: '2026-10-25', tim: 'Mochamad Rizal', mentahan: 18, belumDipakai: 2, dipakai: 16, videoFinal: 21, upload: 21, isWinning: true },
];

const INITIAL_DAILY_STATS = [
  { tanggal: '2026-11-12', labelTanggal: '12/11/2026', bulan: '2026-11', tim: 'Semua', mentahan: 18, diedit: 12, upload: 5, target: 15 },
  { tanggal: '2026-11-11', labelTanggal: '11/11/2026', bulan: '2026-11', tim: 'Semua', mentahan: 24, diedit: 16, upload: 15, target: 15 },
  { tanggal: '2026-11-10', labelTanggal: '10/11/2026', bulan: '2026-11', tim: 'Semua', mentahan: 28, diedit: 18, upload: 18, target: 15 },
  { tanggal: '2026-11-09', labelTanggal: '09/11/2026', bulan: '2026-11', tim: 'Semua', mentahan: 20, diedit: 15, upload: 17, target: 15 },
  { tanggal: '2026-11-08', labelTanggal: '08/11/2026', bulan: '2026-11', tim: 'Semua', mentahan: 22, diedit: 14, upload: 14, target: 15 },
  { tanggal: '2026-11-07', labelTanggal: '07/11/2026', bulan: '2026-11', tim: 'Semua', mentahan: 30, diedit: 19, upload: 18, target: 15 },
];

const INITIAL_VIOLATIONS = [
  { 
    id: 1, 
    tanggal: '11/11/2026', 
    akun: 'Akun 1 - Deni Rohmat', 
    produk: 'Pisau Mesin Kawat', 
    jenis: 'Produk Berbahaya / Tajam', 
    status: 'Banding Diterima', 
    linkVideo: 'https://www.tiktok.com/@tiktok/video/7123456789',
    screenshots: [],
    catatan: 'Hindari memperlihatkan mata pisau berputar terlalu dekat ke kamera.' 
  },
  { 
    id: 2, 
    tanggal: '08/11/2026', 
    akun: 'Akun 3 - Mochamad Rizal', 
    produk: 'Quick Drying Sealant', 
    jenis: 'Klaim Berlebihan / Misleading', 
    status: 'Menunggu Banding', 
    linkVideo: 'https://www.tiktok.com/@tiktok/video/7987654321',
    screenshots: [],
    catatan: 'Ganti teks klaim instan 1 detik di hook awal.' 
  }
];

const DEFAULT_VIOLATION_TYPES = [
  "Produk Berbahaya / Tajam",
  "Konten Tidak Orisinal / Reupload",
  "Klaim Berlebihan / Misleading",
  "Audio / Musik Hak Cipta",
  "Mengarahkan Transaksi di Luar TikTok",
  "Kualitas Video Buram / Statis",
  "Produk Tidak Sesuai Keranjang Kuning"
];

const EMPTY_VIOLATION_FORM = {
  akun: '', 
  produk: '', 
  jenis: '', 
  status: 'Belum Banding',
  catatan: '', 
  linkVideo: '', 
  screenshots: [] // Array berisi { id, label, url }
};

export default function App() {
  const [activeMenu, setActiveMenu] = useState('pipeline'); 

  // --- STATE HALAMAN ANALITIK FYP ---
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isBotRunning, setIsBotRunning] = useState(false);
  const [botReport, setBotReport] = useState(null); 

  // --- STATE ANALISA GEMINI PER VIDEO ---
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);

  // --- STATE HALAMAN REKAP PIPELINE ---
  const [productStats, setProductStats] = useState(INITIAL_PRODUCT_STATS);
  const [dailyStats] = useState(INITIAL_DAILY_STATS);
  const [rekapBulan, setRekapBulan] = useState('2026-11');
  const [rekapTanggal, setRekapTanggal] = useState('');
  const [rekapProduk, setRekapProduk] = useState('Semua');
  const [rekapTim, setRekapTim] = useState('Semua');
  const [sortBy, setSortBy] = useState('mentahan');
  const [onlyWinning, setOnlyWinning] = useState(false);

  // --- STATE DRILL-DOWN MODAL DAFTAR FILE ---
  const [drillDownModal, setDrillDownModal] = useState(null);

  // --- STATE ASISTEN AI PEMBACA WEB & PEMBUAT LAPORAN PPT/PDF ---
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);

  // --- STATE HALAMAN PELANGGARAN (MULTI-SS & CUSTOM JENIS PELANGGARAN) ---
  const [violations, setViolations] = useState(INITIAL_VIOLATIONS);
  const [newViolation, setNewViolation] = useState(EMPTY_VIOLATION_FORM);
  const [editingViolationId, setEditingViolationId] = useState(null);
  const [violationTypes, setViolationTypes] = useState(DEFAULT_VIOLATION_TYPES);
  const [isCustomJenis, setIsCustomJenis] = useState(false);
  const [ssLabelInput, setSsLabelInput] = useState('SS Teguran');
  const [previewGallery, setPreviewGallery] = useState(null); // { produk, images: [], activeIndex: 0 }

  // ⚠️ API KEY & URL
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  const API_URL = "https://script.google.com/macros/s/AKfycbwTxa-MqVkrK65FPqNfR8ZglL17sZQ5QTExgQ0jtc_U--MXMoo4PrHnpOlpfmZQaS1n0g/exec";

  // STATE FILTER & PAGINATION ANALITIK FYP
  const [filterBulan, setFilterBulan] = useState('Semua');
  const [filterAkun, setFilterAkun] = useState('Semua');
  const [filterFyp, setFilterFyp] = useState('Semua');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // --- FUNGSI WARNA BADGE STATUS BANDING ---
  const getViolationStatusStyle = (status) => {
    const s = (status || '').toLowerCase();
    if (s.includes('diterima')) return 'bg-emerald-50 text-emerald-700 border-emerald-300';
    if (s.includes('ditolak')) return 'bg-red-50 text-red-700 border-red-300';
    if (s.includes('menunggu')) return 'bg-amber-50 text-amber-700 border-amber-300';
    return 'bg-gray-100 text-gray-700 border-gray-300';
  };

  // --- FUNGSI NORMALISASI ARRAY SCREENSHOT ---
  const getViolationScreenshots = (v) => {
    if (Array.isArray(v.screenshots)) return v.screenshots;
    const list = [];
    if (v.screenshot) list.push({ id: 'ss_1', label: 'SS Teguran', url: v.screenshot });
    if (v.screenshotBanding) list.push({ id: 'ss_2', label: 'SS Banding', url: v.screenshotBanding });
    return list;
  };

  // --- FUNGSI KOMPRESI GAMBAR OTOMATIS AGAR MUAT BANYAK DI GOOGLE SHEETS ---
  const compressImage = (file, maxWidth = 650, quality = 0.6) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const scale = maxWidth / img.width;
          canvas.width = scale < 1 ? maxWidth : img.width;
          canvas.height = scale < 1 ? img.height * scale : img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
      };
    });
  };

  // --- FUNGSI UPLOAD BANYAK SCREENSHOT SEKALIGUS KE FORM ---
  const handleMultipleScreenshots = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    const newImages = [];
    for (let i = 0; i < files.length; i++) {
      const compressedBase64 = await compressImage(files[i]);
      newImages.push({
        id: `${Date.now()}_${i}`,
        label: files.length > 1 ? `${ssLabelInput} ${i + 1}` : ssLabelInput,
        url: compressedBase64
      });
    }

    setNewViolation(prev => ({
      ...prev,
      screenshots: [...(prev.screenshots || []), ...newImages]
    }));
    e.target.value = '';
  };

  // --- FUNGSI HAPUS 1 SCREENSHOT DARI FORM ---
  const handleRemoveFormScreenshot = (ssId) => {
    setNewViolation(prev => ({
      ...prev,
      screenshots: (prev.screenshots || []).filter(item => item.id !== ssId)
    }));
  };

  // --- FUNGSI TAMBAH BANYAK SS LANGSUNG DARI BARIS TABEL ---
  const handleQuickAddScreenshotsToRow = async (e, rowId) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    const targetItem = violations.find(v => v.id === rowId);
    if (!targetItem) return;

    const existingSS = getViolationScreenshots(targetItem);
    const addedSS = [];
    for (let i = 0; i < files.length; i++) {
      const compressedBase64 = await compressImage(files[i]);
      addedSS.push({
        id: `${Date.now()}_${i}`,
        label: `SS Tambahan ${existingSS.length + i + 1}`,
        url: compressedBase64
      });
    }

    const updatedItem = {
      ...targetItem,
      screenshots: [...existingSS, ...addedSS]
    };

    setViolations(prev => prev.map(v => v.id === rowId ? updatedItem : v));
    e.target.value = '';

    try {
      await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'update_violation',
          data: updatedItem
        })
      });
    } catch (err) {
      console.error("Gagal menambah SS ke Google Sheets", err);
    }
  };

  // --- FUNGSI TOGGLE BINTANG "WINNING MENTAHAN" ---
  const toggleWinningProduct = (id) => {
    setProductStats(prev => prev.map(item => 
      item.id === id ? { ...item, isWinning: !item.isWinning } : item
    ));
  };

  // --- FUNGSI MEMBUKA DAFTAR FILE SAAT ANGKA DIKLIK ---
  const openFileDrillDown = (labelProdukAtauTanggal, kategori, jumlah, tim) => {
    if (!jumlah || jumlah <= 0) return;
    const cleanName = labelProdukAtauTanggal.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    const generatedFiles = Array.from({ length: jumlah }, (_, i) => {
      const num = String(i + 1).padStart(3, '0');
      if (kategori === 'Mentahan (Raw Asset)') {
        return {
          id: i + 1,
          name: `raw_${cleanName}_${num}_hd.mp4`,
          status: i < Math.floor(jumlah * 0.65) ? 'Sudah Dipakai' : 'Belum Dipakai',
          owner: tim || 'Deni Rohmat',
          source: 'OneDrive Folder',
          url: `https://onedrive.live.com/?id=raw_${cleanName}_${num}`
        };
      } else if (kategori === 'Video Final (Production)') {
        return {
          id: i + 1,
          name: `final_${cleanName}_edit_${num}.mp4`,
          status: 'Selesai Edit',
          owner: 'Rahmat Pajari (Editor)',
          source: 'OneDrive Campaign',
          url: `https://onedrive.live.com/?id=final_${cleanName}_${num}`
        };
      } else {
        return {
          id: i + 1,
          name: `publish_${cleanName}_post_${num}.mp4`,
          status: 'Tayang di TikTok',
          owner: tim !== 'Semua' ? tim : `Publisher Akun ${(i % 5) + 1}`,
          source: 'TikTok Affiliate',
          url: `https://www.tiktok.com/`
        };
      }
    });

    setDrillDownModal({
      title: `${kategori} — ${labelProdukAtauTanggal}`,
      subtitle: `Menampilkan total ${jumlah} file yang tercatat pada sistem`,
      category: kategori,
      count: jumlah,
      items: generatedFiles
    });
  };

  // --- FUNGSI KLIK TOMBOL EDIT PADA BARIS PELANGGARAN ---
  const handleStartEditViolation = (item) => {
    setEditingViolationId(item.id);
    if (item.jenis && !violationTypes.includes(item.jenis)) {
      setViolationTypes(prev => [...prev, item.jenis]);
    }
    setIsCustomJenis(false);
    setNewViolation({
      akun: item.akun || '',
      produk: item.produk || '',
      jenis: item.jenis || '',
      status: item.status || 'Belum Banding',
      catatan: item.catatan === '-' ? '' : (item.catatan || ''),
      linkVideo: item.linkVideo || '',
      screenshots: getViolationScreenshots(item)
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEditViolation = () => {
    setEditingViolationId(null);
    setIsCustomJenis(false);
    setNewViolation(EMPTY_VIOLATION_FORM);
  };

  // --- FUNGSI UBAH STATUS LANGSUNG DARI TABEL ---
  const handleQuickStatusChange = async (id, newStatus) => {
    const targetItem = violations.find(v => v.id === id);
    if (!targetItem) return;

    const updatedItem = { ...targetItem, status: newStatus, screenshots: getViolationScreenshots(targetItem) };
    setViolations(prev => prev.map(v => v.id === id ? updatedItem : v));

    try {
      await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'update_violation',
          data: updatedItem
        })
      });
    } catch (err) {
      console.error("Gagal mengupdate status ke Sheets", err);
    }
  };

  // --- FUNGSI SIMPAN BARU ATAU SIMPAN PERUBAHAN EDIT PELANGGARAN ---
  const handleAddViolation = async (e) => {
    e.preventDefault();
    if (!newViolation.akun || !newViolation.produk || !newViolation.jenis) return;

    // Jika user mengetik jenis pelanggaran baru, otomatis simpan ke daftar dropdown
    const cleanJenis = newViolation.jenis.trim();
    if (!violationTypes.includes(cleanJenis)) {
      setViolationTypes(prev => [...prev, cleanJenis]);
    }
    setIsCustomJenis(false);

    // MODE EDIT DATA YANG SUDAH ADA
    if (editingViolationId !== null) {
      const existingItem = violations.find(v => v.id === editingViolationId);
      const updatedEntry = {
        id: editingViolationId,
        tanggal: existingItem?.tanggal || new Date().toLocaleDateString('id-ID'),
        akun: newViolation.akun,
        produk: newViolation.produk,
        jenis: cleanJenis,
        status: newViolation.status || 'Belum Banding',
        linkVideo: newViolation.linkVideo || '',
        screenshots: newViolation.screenshots || [],
        catatan: newViolation.catatan || '-'
      };

      setViolations(prev => prev.map(v => v.id === editingViolationId ? updatedEntry : v));
      setEditingViolationId(null);
      setNewViolation(EMPTY_VIOLATION_FORM);

      try {
        await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'update_violation',
            data: updatedEntry
          })
        });
      } catch (err) {
        alert("Perubahan tampil di layar, namun gagal tersimpan ke Google Sheets.");
      }
      return;
    }

    // MODE TAMBAH DATA BARU
    const today = new Date().toLocaleDateString('id-ID');
    const newEntry = {
      id: Date.now(),
      tanggal: today,
      akun: newViolation.akun,
      produk: newViolation.produk,
      jenis: cleanJenis,
      status: newViolation.status || 'Belum Banding',
      linkVideo: newViolation.linkVideo || '',
      screenshots: newViolation.screenshots || [],
      catatan: newViolation.catatan || '-'
    };

    setViolations([newEntry, ...violations]);
    setNewViolation(EMPTY_VIOLATION_FORM);

    try {
      await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'save_violation',
          data: newEntry
        })
      });
    } catch (err) {
      alert("Gagal menyimpan ke Google Sheets, periksa koneksi internet Anda.");
    }
  };

  // --- FUNGSI ASISTEN AI PEMBACA DATA WEB & GENERATOR MATERI PPT/PDF ---
  const askAiAboutDashboard = async (customPrompt = null) => {
    const queryText = customPrompt || aiQuestion;
    if (!queryText.trim()) return;

    setIsAiThinking(true);
    setAiResponse('');

    const dashboardContext = `
      Konteks Data Web PromoOps Studio Saat Ini:
      - Filter Aktif: Bulan ${rekapBulan}, Tanggal ${rekapTanggal || 'Semua Hari'}, Produk ${rekapProduk}, Tim ${rekapTim}.
      - Total Mentahan (Raw): ${totalMentahanRekap} file (${totalBelumDipakaiRekap} belum dipakai, ${totalDipakaiRekap} sudah dipakai).
      - Total Video Final (Selesai Edit): ${totalFinalRekap} klip.
      - Total Upload (Publisher 5 Akun): ${totalUploadRekap} video tayang (Target harian: 15 video/hari).
      - Daftar Produk Teratas: ${filteredProducts.map(p => `${p.produk} (Raw:${p.mentahan}, Edit:${p.videoFinal}, Upload:${p.upload}, Bagus:${p.isWinning ? 'Ya' : 'Tidak'})`).join('; ')}.
      - Rekap Harian: ${filteredDaily.map(d => `${d.labelTanggal} (Raw:${d.mentahan}, Edit:${d.diedit}, Upload:${d.upload}/${d.target})`).join('; ')}.
      - Total Pelanggaran Tercatat: ${violations.length} kasus (${violations.map(v => `${v.produk} [${v.status}] - ${v.jenis}`).join(', ')}).
    `;

    const fullPrompt = `
      Anda adalah Asisten Eksekutif Divisi Video PromoOps Studio.
      Berikut adalah data langsung yang sedang tampil di layar web pengguna:
      ${dashboardContext}

      Pertanyaan / Instruksi Pengguna: "${queryText}"

      Berikan jawaban yang terstruktur, tajam, dan siap pakai untuk laporan manajemen atau slide PPT. Gunakan bahasa Indonesia yang profesional.
    `;

    try {
      if (!GEMINI_API_KEY || GEMINI_API_KEY === "ISI_DENGAN_API_KEY_GEMINI_ANDA") {
        setTimeout(() => {
          setAiResponse(
            `**RINGKASAN EKSEKUTIF LAPORAN PROMOOPS STUDIO (${rekapBulan})**\n\n` +
            `**1. Kekuatan Produksi & Stok Mentahan (Hulu ke Hilir)**\n` +
            `* **Total Aset Mentahan:** Tercatat **${totalMentahanRekap} file** di OneDrive (${totalBelumDipakaiRekap} file masih siap diedit & ${totalDipakaiRekap} file telah diproduksi).\n` +
            `* **Kinerja Editor (Video Final):** Menghasilkan **${totalFinalRekap} klip selesai**, menjaga rasio konversi produksi tetap sehat.\n` +
            `* **Distribusi Publisher (5 Akun):** Berhasil menayangkan **${totalUploadRekap} video** dengan patokan target 15 video/hari.\n\n` +
            `**2. Produk Prioritas & Mentahan Terbaik (Winning Asset)**\n` +
            `* Produk dengan kontribusi tertinggi saat ini dipimpin oleh **${filteredProducts[0]?.produk || '-'}** (${filteredProducts[0]?.mentahan || 0} mentahan, ${filteredProducts[0]?.videoFinal || 0} edit, ${filteredProducts[0]?.upload || 0} upload).\n` +
            `* Produk yang ditandai sebagai Mentahan Bagus (⭐) bulan ini: **${filteredProducts.filter(p => p.isWinning).map(p => p.produk).join(', ') || 'Belum ada'}**.\n\n` +
            `**3. Evaluasi Harian & Mitigasi Pelanggaran**\n` +
            `* Terdapat **${violations.length} catatan pelanggaran** yang sedang dipantau (${violations.map(v => `${v.produk}: ${v.status}`).join(', ')}).`
          );
          setIsAiThinking(false);
        }, 800);
        return;
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 800 }
        })
      });

      const result = await response.json();
      if (result.candidates && result.candidates.length > 0) {
        setAiResponse(result.candidates[0].content.parts[0].text);
      } else {
        setAiResponse(
          `**RINGKASAN EKSEKUTIF LAPORAN PROMOOPS STUDIO (${rekapBulan})**\n\n` +
          `* **Total Mentahan:** ${totalMentahanRekap} file (${totalBelumDipakaiRekap} siap pakai).\n` +
          `* **Total Produksi (Video Final):** ${totalFinalRekap} video selesai diedit.\n` +
          `* **Total Upload (5 Akun):** ${totalUploadRekap} video tayang.\n` +
          `* **Produk Terbanyak:** ${filteredProducts[0]?.produk || '-'} (${filteredProducts[0]?.mentahan || 0} raw, ${filteredProducts[0]?.upload || 0} upload).\n` +
          `* **Winning Asset Bulan Ini:** ${filteredProducts.filter(p => p.isWinning).map(p => p.produk).join(', ') || '-'}.\n` +
          `* **Catatan Pelanggaran:** ${violations.length} kasus aktif yang telah dievaluasi.`
        );
      }
    } catch (err) {
      setAiResponse("Gagal menghubungi server AI, namun Anda tetap dapat mencetak halaman ini ke PDF menggunakan tombol Cetak Laporan.");
    }
    setIsAiThinking(false);
  };

  // --- FUNGSI MEMANGGIL GEMINI API PER BARIS FYP ---
  const analyzeWithGemini = async (row) => {
    setSelectedVideo(row);
    setIsAnalyzing(true);
    setAnalysisResult(null);

    const viewCount = (parseInt(String(row.View).replace(/[^0-9]/g, '')) || 0).toLocaleString('id-ID');
    const prompt = `
      Anda adalah pakar Algoritma TikTok dan Strategi Konten E-Commerce.
      Tugas Anda adalah memberikan analisa mendalam, padat, dan tidak bertele-tele mengenai mengapa video promosi ini berhasil.
      
      Data Video:
      - Nama Barang/Produk: ${row.Induk_Barang}
      - Jumlah Tayangan (Views): ${viewCount}
      - Status Keberhasilan: ${row.Video_FYP}
      
      Berikan analisa Anda ke dalam 3 aspek berikut:
      1. Anatomi Hook (3 Detik Pertama)
      2. Nilai Retensi & Emosi
      3. Sinyal Algoritma
    `;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 600 }
        })
      });

      const result = await response.json();
      if (result.candidates && result.candidates.length > 0) {
        setAnalysisResult(result.candidates[0].content.parts[0].text);
      } else {
        setAnalysisResult("Gagal mendapatkan analisa dari bot AI.");
      }
    } catch (err) {
      setAnalysisResult("Terjadi kesalahan koneksi saat menghubungi server AI.");
    }
    setIsAnalyzing(false);
  };

  // Helper Functions 
  const getBulanFormat = (dateStr) => {
    if (!dateStr) return 'Tanpa Tanggal';
    try {
      const d = new Date(dateStr);
      if (isNaN(d)) return 'Format Tidak Dikenal';
      return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    } catch {
      return 'Format Tidak Dikenal';
    }
  };

  const matchFypFilter = (status, filterValue) => {
    if (filterValue === 'Semua') return true;
    const s = (status || "").toLowerCase();
    const isAnyFyp = (s.includes('fyp') || s.includes('viral')) && !s.includes('belum');
    if (filterValue === 'Semua FYP') return isAnyFyp;
    if (filterValue === 'Belum FYP') return !isAnyFyp;
    if (filterValue === 'Super Viral') return s.includes('super viral');
    if (filterValue === 'Mega FYP') return s.includes('mega fyp');
    if (filterValue === 'Berkelanjutan') return s.includes('berkelanjutan');
    if (filterValue === 'FYP Awal') return isAnyFyp && !s.includes('super viral') && !s.includes('mega fyp') && !s.includes('berkelanjutan');
    return true;
  };

  const getFypBadgeStyle = (status) => {
    if (!status) return { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200', icon: null };
    const s = status.toLowerCase();
    if (s.includes('super viral')) return { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300', icon: <Rocket className="w-4 h-4" /> };
    if (s.includes('mega fyp')) return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', icon: <Flame className="w-4 h-4" /> };
    if (s.includes('berkelanjutan')) return { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300', icon: <TrendingUp className="w-4 h-4" /> };
    if (s.includes('fyp') && !s.includes('belum')) return { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300', icon: <Zap className="w-4 h-4" /> };
    return { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200', icon: null };
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch(API_URL);
      const result = await response.json();
      if (result.status === "success") {
        const validData = result.data.filter(item => 
          item.Link_Postingan && item.Link_Postingan.includes("tiktok.com") && item.Induk_Barang && item.Induk_Barang.trim() !== ""
        );
        setData(validData.reverse());

        if (result.violations && result.violations.length > 0) {
          setViolations(result.violations);
          // Kumpulkan juga jenis pelanggaran baru yang pernah disimpan di Google Sheets
          const customTypesFromSheet = result.violations.map(v => v.jenis).filter(Boolean);
          setViolationTypes(prev => [...new Set([...prev, ...customTypesFromSheet])]);
        }
      }
    } catch (err) {
      setError("Terjadi kesalahan jaringan.");
    }
    setLoading(false);
  };

  const runBotScraper = async () => {
    setIsBotRunning(true);
    try {
      const response = await fetch(`${API_URL}?action=run_update`);
      const result = await response.json();
      if (result.status === "success") {
        setBotReport(result.report); 
        fetchData(); 
      } else {
        alert("Gagal menjalankan bot: " + result.message);
      }
    } catch (err) {
      alert("Koneksi terputus. Pastikan Apps Script berjalan dengan baik.");
    }
    setIsBotRunning(false);
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [filterBulan, filterAkun, filterFyp]);

  // --- FILTERING DATA ANALITIK FYP ---
  const listBulan = ['Semua', ...new Set(data.map(item => getBulanFormat(item.Tanggal_Upload)).filter(b => b !== 'Tanpa Tanggal' && b !== 'Format Tidak Dikenal'))];
  const listAkun = ['Semua', ...new Set(data.map(item => item.Nama_Akun || item.Id_Akun).filter(Boolean))];

  const filteredData = data.filter(item => {
    const matchBulan = filterBulan === 'Semua' || getBulanFormat(item.Tanggal_Upload) === filterBulan;
    const matchAkun = filterAkun === 'Semua' || (item.Nama_Akun || item.Id_Akun) === filterAkun;
    const matchFyp = matchFypFilter(item.Video_FYP, filterFyp);
    return matchBulan && matchAkun && matchFyp;
  });

  const statTotalVideo = filteredData.length;
  const statTotalView = filteredData.reduce((sum, item) => sum + (parseInt(String(item.View).replace(/[^0-9]/g, '')) || 0), 0);
  const statFyp = filteredData.filter(v => {
    const s = (v.Video_FYP || "").toLowerCase();
    return (s.includes('fyp') || s.includes('viral')) && !s.includes('belum');
  }).length;

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentData = filteredData.slice(startIndex, endIndex);

  // --- FILTERING & SORTING DATA REKAP PIPELINE ---
  const filteredProducts = productStats
    .filter(item => {
      const mBulan = rekapBulan === 'Semua' || item.bulan === rekapBulan;
      const mTanggal = !rekapTanggal || item.tanggal === rekapTanggal;
      const mProduk = rekapProduk === 'Semua' || item.produk === rekapProduk;
      const mTim = rekapTim === 'Semua' || item.tim === rekapTim;
      const mWin = !onlyWinning || item.isWinning;
      return mBulan && mTanggal && mProduk && mTim && mWin;
    })
    .sort((a, b) => b[sortBy] - a[sortBy]);

  const filteredDaily = dailyStats.filter(item => {
    const mBulan = rekapBulan === 'Semua' || item.bulan === rekapBulan;
    const mTanggal = !rekapTanggal || item.tanggal === rekapTanggal;
    return mBulan && mTanggal;
  });

  const totalMentahanRekap = filteredProducts.reduce((acc, cur) => acc + cur.mentahan, 0);
  const totalBelumDipakaiRekap = filteredProducts.reduce((acc, cur) => acc + cur.belumDipakai, 0);
  const totalDipakaiRekap = filteredProducts.reduce((acc, cur) => acc + cur.dipakai, 0);
  const totalFinalRekap = filteredProducts.reduce((acc, cur) => acc + cur.videoFinal, 0);
  const totalUploadRekap = filteredProducts.reduce((acc, cur) => acc + cur.upload, 0);

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 pb-12 relative print:bg-white print:pb-0">
      
      {/* ========================================================================= */}
      {/* MODAL 1: POP-UP DRILL-DOWN DAFTAR FILE SAAT ANGKA (16, 12, 10) DIKLIK     */}
      {/* ========================================================================= */}
      {drillDownModal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-gray-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <FolderOpen className="w-6 h-6 text-emerald-400" />
                <div>
                  <h3 className="font-bold text-base md:text-lg leading-tight">{drillDownModal.title}</h3>
                  <p className="text-xs text-gray-300 mt-0.5">{drillDownModal.subtitle}</p>
                </div>
              </div>
              <button onClick={() => setDrillDownModal(null)} className="text-gray-400 hover:text-white bg-gray-800 p-2 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 md:p-6 overflow-y-auto divide-y divide-gray-100 flex-1 bg-gray-50/40">
              {drillDownModal.items.map((file) => (
                <div key={file.id} className="py-3 px-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-white rounded-lg transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                      {file.id}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-sm break-all">{file.name}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500 font-medium">{file.owner}</span>
                        <span className="text-gray-300">•</span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                          file.status === 'Belum Dipakai' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          {file.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <a 
                    href={file.url} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors shrink-0"
                  >
                    Buka File <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ))}
            </div>

            <div className="px-6 py-3 bg-white border-t border-gray-200 flex justify-end shrink-0">
              <button onClick={() => setDrillDownModal(null)} className="px-5 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold rounded-xl">
                Tutup Daftar File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ASISTEN AI PEMBACA WEB & GENERATOR LAPORAN PPT/PDF               */}
      {/* ========================================================================= */}
      {isAiAssistantOpen && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-gradient-to-r from-emerald-700 to-teal-700 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <BrainCircuit className="w-6 h-6 text-emerald-200" />
                <div>
                  <h3 className="font-bold text-base md:text-lg">Asisten AI Laporan & Analisa Web</h3>
                  <p className="text-xs text-emerald-100">AI membaca angka yang tampil di web Anda untuk membuat materi PPT / evaluasi</p>
                </div>
              </div>
              <button onClick={() => setIsAiAssistantOpen(false)} className="text-emerald-100 hover:text-white bg-white/10 p-2 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4 bg-gray-50">
              <div className="flex flex-wrap gap-2">
                <button 
                  onClick={() => askAiAboutDashboard("Buatkan draft poin-poin slide PPT laporan bulanan dari data web saat ini")}
                  className="text-xs bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold px-3 py-2 rounded-xl shadow-sm transition-colors"
                >
                  📊 Buat Poin Slide PPT Laporan Bulan Ini
                </button>
                <button 
                  onClick={() => askAiAboutDashboard("Analisa kekuatan tim dan bottleneck antara jumlah mentahan, video final editor, dan upload publisher")}
                  className="text-xs bg-white hover:bg-blue-50 text-blue-800 border border-blue-200 font-bold px-3 py-2 rounded-xl shadow-sm transition-colors"
                >
                  ⚡ Evaluasi Kekuatan Tim & Bottleneck
                </button>
                <button 
                  onClick={() => askAiAboutDashboard("Rekomendasikan produk mana yang harus difokuskan minggu depan berdasarkan stok mentahan dan winning asset")}
                  className="text-xs bg-white hover:bg-purple-50 text-purple-800 border border-purple-200 font-bold px-3 py-2 rounded-xl shadow-sm transition-colors"
                >
                  ⭐ Rekomendasi Fokus Produk
                </button>
              </div>

              <div className="bg-white p-4 rounded-xl border border-gray-200 min-h-[220px] text-sm">
                {isAiThinking ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Sparkles className="w-8 h-8 text-emerald-600 animate-spin mb-3" />
                    <p className="font-bold text-gray-800">Sedang membaca data tabel & menyusun laporan...</p>
                  </div>
                ) : aiResponse ? (
                  <div className="space-y-2 leading-relaxed text-gray-700">
                    {aiResponse.split('\n').map((line, i) => (
                      <p key={i} className={line.startsWith('**') ? 'font-bold text-gray-900 mt-2' : ''}>
                        {line.replace(/\*\*/g, '')}
                      </p>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-400 text-center py-12">
                    Klik salah satu tombol cepat di atas atau ketik pertanyaan Anda di bawah untuk meminta AI merangkum isi web ini.
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-white border-t border-gray-200 flex gap-2 shrink-0">
              <input 
                type="text" 
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && askAiAboutDashboard()}
                placeholder="Tanya AI soal data di layar ini (misal: Ringkas laporan untuk atasan)..."
                className="flex-1 bg-gray-50 border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:border-emerald-500"
              />
              <button 
                onClick={() => askAiAboutDashboard()}
                disabled={isAiThinking}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                <Send className="w-4 h-4" /> Kirim
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: GALERI PREVIEW MULTI-SCREENSHOT PELANGGARAN                      */}
      {/* ========================================================================= */}
      {previewGallery && (
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 print:hidden" onClick={() => setPreviewGallery(null)}>
          <div className="bg-white p-4 rounded-2xl max-w-2xl w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center pb-3 mb-3 border-b">
              <div>
                <h4 className="font-bold text-sm text-gray-900">
                  Bukti Screenshot — {previewGallery.produk} ({previewGallery.activeIndex + 1} dari {previewGallery.images.length})
                </h4>
                <p className="text-xs text-red-600 font-semibold">
                  {previewGallery.images[previewGallery.activeIndex]?.label}
                </p>
              </div>
              <button onClick={() => setPreviewGallery(null)} className="p-1.5 hover:bg-gray-100 rounded-full"><X className="w-5 h-5" /></button>
            </div>

            <div className="relative bg-gray-900 rounded-xl overflow-hidden flex items-center justify-center min-h-[300px] max-h-[65vh]">
              <img 
                src={previewGallery.images[previewGallery.activeIndex]?.url} 
                alt="Bukti Pelanggaran" 
                className="w-full h-auto max-h-[65vh] object-contain" 
              />
              {previewGallery.images.length > 1 && (
                <>
                  <button 
                    onClick={() => setPreviewGallery(prev => ({ ...prev, activeIndex: (prev.activeIndex - 1 + prev.images.length) % prev.images.length }))}
                    className="absolute left-3 bg-white/90 hover:bg-white text-gray-900 p-2 rounded-full shadow-lg"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => setPreviewGallery(prev => ({ ...prev, activeIndex: (prev.activeIndex + 1) % prev.images.length }))}
                    className="absolute right-3 bg-white/90 hover:bg-white text-gray-900 p-2 rounded-full shadow-lg"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {/* Thumbnail Pilihan Gambar di Bawah */}
            {previewGallery.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pt-3 mt-2">
                {previewGallery.images.map((img, idx) => (
                  <button
                    key={img.id || idx}
                    onClick={() => setPreviewGallery(prev => ({ ...prev, activeIndex: idx }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border shrink-0 transition-all ${
                      previewGallery.activeIndex === idx ? 'bg-red-600 text-white border-red-600' : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    #{idx + 1} {img.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* POP-UP MODAL LAPORAN RAPIDAPI BOT */}
      {botReport && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className={`px-6 py-4 flex items-center gap-3 ${botReport.apiHabis ? 'bg-red-50' : botReport.terpotongWaktu ? 'bg-amber-50' : 'bg-emerald-50'}`}>
              {botReport.apiHabis ? <ServerCrash className="w-6 h-6 text-red-600" /> : botReport.terpotongWaktu ? <AlertTriangle className="w-6 h-6 text-amber-600" /> : <CheckCircle2 className="w-6 h-6 text-emerald-600" />}
              <h3 className="font-bold text-lg text-gray-900">{botReport.apiHabis ? 'Kuota API Rapid Habis!' : botReport.terpotongWaktu ? 'Pengecekan Dijeda (Time Limit)' : 'Pengecekan Selesai'}</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-600 text-sm mb-6 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100">"{botReport.pesan}"</p>
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-gray-100 pb-3"><span className="text-gray-500 text-sm font-semibold">Video Dianalisa:</span><span className="font-bold text-gray-900">{botReport.videoTerdeteksi} baris</span></div>
                <div className="flex justify-between items-center border-b border-gray-100 pb-3"><span className="text-gray-500 text-sm font-semibold">Penggunaan Kuota:</span><span className={`font-bold px-3 py-1 rounded-md text-sm ${botReport.apiHabis ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'}`}>{botReport.apiTerpakai} request</span></div>
              </div>
              <button onClick={() => setBotReport(null)} className="w-full mt-6 bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 rounded-xl transition-colors shadow-md">Tutup Laporan</button>
            </div>
          </div>
        </div>
      )}

      {/* POP-UP MODAL ANALISA GEMINI PER VIDEO */}
      {(selectedVideo || isAnalyzing) && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
            <div className="px-4 md:px-6 py-4 bg-purple-50 border-b border-purple-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 text-purple-700 rounded-lg flex items-center justify-center"><BrainCircuit className="w-6 h-6" /></div>
                <div>
                  <h3 className="font-bold text-base md:text-lg text-purple-900 leading-tight">Analisa Strategi FYP</h3>
                  <p className="text-xs text-purple-600 font-semibold truncate max-w-[200px] md:max-w-xs">{selectedVideo?.Induk_Barang || "Memproses..."}</p>
                </div>
              </div>
              <button onClick={() => { setSelectedVideo(null); setAnalysisResult(null); }} className="text-gray-400 hover:text-gray-700 bg-white p-2 rounded-full shadow-sm"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="p-4 md:p-6 overflow-y-auto bg-gray-50/50 flex-1">
              {isAnalyzing ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Sparkles className="w-10 h-10 text-purple-500 animate-pulse mb-4" />
                  <h4 className="font-bold text-gray-900 text-lg">Gemini Sedang Menganalisa...</h4>
                </div>
              ) : (
                <div className="prose prose-sm prose-purple max-w-none">
                  {analysisResult?.split('\n').map((line, i) => {
                    if (line.trim() === '') return <br key={i} />;
                    if (line.startsWith('**') && line.endsWith('**')) return <h4 key={i} className="font-bold text-gray-900 mt-4 mb-2">{line.replace(/\*\*/g, '')}</h4>;
                    if (line.startsWith('* ')) return <li key={i} className="text-gray-700 ml-4 mb-1">{line.replace('* ', '')}</li>;
                    return <p key={i} className="text-gray-700 leading-relaxed mb-3">{line.replace(/\*\*/g, '')}</p>;
                  })}
                </div>
              )}
            </div>
            
            <div className="px-4 md:px-6 py-4 bg-white border-t border-gray-100 shrink-0">
              <button onClick={() => { setSelectedVideo(null); setAnalysisResult(null); }} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition-colors shadow-sm">
                Selesai Membaca
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER NAVIGASI RESPONSIF */}
      <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex flex-col lg:flex-row items-center justify-between gap-4 sticky top-0 z-30 shadow-sm print:hidden">
        <div className="flex items-center gap-3 w-full lg:w-auto justify-center lg:justify-start">
          <div className="w-10 h-10 bg-emerald-700 text-white rounded-lg flex items-center justify-center font-bold text-lg shrink-0">RP</div>
          <div>
            <h1 className="font-bold text-gray-900 text-sm">PromoOps & Riset</h1>
            <p className="text-xs text-gray-500">OneDrive • Produksi • Publisher</p>
          </div>
        </div>
        
        <div className="flex flex-wrap justify-center bg-gray-50 p-1 rounded-lg border border-gray-200 shadow-inner w-full lg:w-auto gap-1">
          <button onClick={() => setActiveMenu('pipeline')} className={`px-3 md:px-4 py-2 text-xs md:text-sm font-semibold rounded-md flex items-center gap-2 transition-all ${activeMenu === 'pipeline' ? 'bg-white text-emerald-700 shadow-sm border border-emerald-200' : 'text-gray-500 hover:text-gray-700'}`}>
            <LayoutDashboard className="w-4 h-4" /> Rekap & Pipeline
          </button>
          <button onClick={() => setActiveMenu('analitik')} className={`px-3 md:px-4 py-2 text-xs md:text-sm font-semibold rounded-md flex items-center gap-2 transition-all ${activeMenu === 'analitik' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
            <BarChart2 className="w-4 h-4" /> Laporan FYP
          </button>
          <button onClick={() => setActiveMenu('pelanggaran')} className={`px-3 md:px-4 py-2 text-xs md:text-sm font-semibold rounded-md flex items-center gap-2 transition-all ${activeMenu === 'pelanggaran' ? 'bg-red-50 text-red-700 shadow-sm border border-red-200' : 'text-gray-500 hover:text-red-600'}`}>
            <ShieldAlert className="w-4 h-4" /> Pelanggaran ({violations.length})
          </button>
        </div>

        <div className="flex items-center justify-center gap-2 w-full lg:w-auto">
          <button 
            onClick={() => { setIsAiAssistantOpen(true); if (!aiResponse) askAiAboutDashboard("Buatkan ringkasan laporan eksekutif dari data web saat ini"); }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg text-xs md:text-sm font-bold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Sparkles className="w-4 h-4" /> Tanya AI (Analisa Web)
          </button>
          <button 
            onClick={() => window.print()}
            className="bg-gray-900 hover:bg-gray-800 text-white px-3.5 py-2 rounded-lg text-xs md:text-sm font-bold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Printer className="w-4 h-4" /> Cetak PDF / Laporan
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* HALAMAN 1: REKAP MENTAHAN, PRODUKSI & UPLOAD                              */}
      {/* ========================================================================= */}
      {activeMenu === 'pipeline' && (
        <div className="p-4 md:p-8 max-w-[1400px] mx-auto animate-in fade-in duration-300">
          
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Rekap Mentahan, Produksi & Upload</h2>
              <p className="text-gray-500 mt-1">Klik pada angka jumlah file untuk membuka rincian video. Gunakan tombol Cetak PDF atau Tanya AI untuk menyusun laporan.</p>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <button 
                onClick={() => setOnlyWinning(!onlyWinning)}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs md:text-sm flex items-center gap-2 border transition-all ${onlyWinning ? 'bg-amber-100 text-amber-800 border-amber-300 shadow-sm' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                <Star className={`w-4 h-4 ${onlyWinning ? 'fill-amber-500 text-amber-500' : 'text-gray-400'}`} />
                {onlyWinning ? 'Menampilkan Mentahan Bagus ⭐' : 'Filter Mentahan Bagus'}
              </button>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 print:hidden">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Bulan</label>
              <select value={rekapBulan} onChange={(e) => setRekapBulan(e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg block w-full p-2.5 font-semibold">
                <option value="2026-11">📅 November 2026</option>
                <option value="2026-10">📅 Oktober 2026</option>
                <option value="Semua">Semua Bulan</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Tanggal / Hari</label>
              <div className="flex gap-1">
                <input 
                  type="date" 
                  value={rekapTanggal}
                  onChange={(e) => setRekapTanggal(e.target.value)}
                  className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg block w-full p-2 font-semibold"
                />
                {rekapTanggal && (
                  <button onClick={() => setRekapTanggal('')} className="px-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-bold">Reset</button>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Filter Produk</label>
              <select value={rekapProduk} onChange={(e) => setRekapProduk(e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg block w-full p-2.5 font-semibold">
                <option value="Semua">📦 Semua Produk</option>
                {[...new Set(productStats.map(p => p.produk))].map(prod => (
                  <option key={prod} value={prod}>{prod}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Tim / Akun</label>
              <select value={rekapTim} onChange={(e) => setRekapTim(e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg block w-full p-2.5 font-semibold">
                <option value="Semua">👥 Semua Tim & Publisher</option>
                <option value="Rahmat Pajari">Rahmat Pajari</option>
                <option value="Deni Rohmat">Deni Rohmat</option>
                <option value="Ikhsan Harun">Ikhsan Harun</option>
                <option value="Mochamad Rizal">Mochamad Rizal</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div 
              onClick={() => openFileDrillDown(rekapProduk === 'Semua' ? `Semua Produk (${rekapBulan})` : rekapProduk, 'Mentahan (Raw Asset)', totalMentahanRekap, rekapTim)}
              className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex justify-between items-center cursor-pointer hover:border-blue-400 hover:shadow-md transition-all group"
            >
              <div>
                <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">1. Total Mentahan (Raw)</p>
                <h3 className="text-3xl font-black text-gray-900 mt-1 group-hover:text-blue-600 transition-colors">{totalMentahanRekap} <span className="text-sm font-semibold text-gray-400">file (Klik buka)</span></h3>
                <p className="text-xs text-gray-500 mt-1">{totalBelumDipakaiRekap} belum dipakai • {totalDipakaiRekap} dipakai</p>
              </div>
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl font-bold text-xs">OneDrive</div>
            </div>

            <div 
              onClick={() => openFileDrillDown(rekapProduk === 'Semua' ? `Semua Produk (${rekapBulan})` : rekapProduk, 'Video Final (Production)', totalFinalRekap, 'Rahmat Pajari')}
              className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex justify-between items-center cursor-pointer hover:border-amber-400 hover:shadow-md transition-all group"
            >
              <div>
                <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">2. Video Final (Production)</p>
                <h3 className="text-3xl font-black text-gray-900 mt-1 group-hover:text-amber-600 transition-colors">{totalFinalRekap} <span className="text-sm font-semibold text-gray-400">klip selesai (Klik)</span></h3>
                <p className="text-xs text-gray-500 mt-1">Berdasarkan tanggal selesai edit</p>
              </div>
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl font-bold text-xs">Editor</div>
            </div>

            <div 
              onClick={() => openFileDrillDown(rekapProduk === 'Semua' ? `Semua Produk (${rekapBulan})` : rekapProduk, 'Video Terupload (Publisher)', totalUploadRekap, rekapTim)}
              className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex justify-between items-center cursor-pointer hover:border-emerald-400 hover:shadow-md transition-all group"
            >
              <div>
                <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">3. Total Upload (Publisher)</p>
                <h3 className="text-3xl font-black text-gray-900 mt-1 group-hover:text-emerald-600 transition-colors">{totalUploadRekap} <span className="text-sm font-semibold text-gray-400">tayang (Klik)</span></h3>
                <p className="text-xs text-emerald-600 font-semibold mt-1">Target: 5 Akun × 3 Video (15/hari)</p>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl font-bold text-xs">5 Akun</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between sm:items-center gap-2 bg-gray-50">
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">Peringkat per Produk</h3>
                  <p className="text-xs text-gray-500">Klik angka untuk melihat & membuka daftar file videonya</p>
                </div>
                <div className="flex items-center gap-1 text-xs print:hidden">
                  <span className="text-gray-500 font-semibold mr-1">Urutkan:</span>
                  <button onClick={() => setSortBy('mentahan')} className={`px-2 py-1 rounded font-bold ${sortBy === 'mentahan' ? 'bg-blue-600 text-white' : 'bg-white border text-gray-600'}`}>Mentahan</button>
                  <button onClick={() => setSortBy('videoFinal')} className={`px-2 py-1 rounded font-bold ${sortBy === 'videoFinal' ? 'bg-amber-600 text-white' : 'bg-white border text-gray-600'}`}>Edit</button>
                  <button onClick={() => setSortBy('upload')} className={`px-2 py-1 rounded font-bold ${sortBy === 'upload' ? 'bg-emerald-600 text-white' : 'bg-white border text-gray-600'}`}>Upload</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-600 bg-gray-50/50 text-xs uppercase">
                      <th className="py-3 px-4 font-bold">Nama Produk</th>
                      <th className="py-3 px-3 font-bold text-center text-blue-700">Mentahan</th>
                      <th className="py-3 px-3 font-bold text-center text-amber-700">Video Final</th>
                      <th className="py-3 px-3 font-bold text-center text-emerald-700">Upload</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredProducts.length === 0 ? (
                      <tr><td colSpan="4" className="py-8 text-center text-gray-400 font-semibold">Tidak ada data produk sesuai filter.</td></tr>
                    ) : (
                      filteredProducts.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => toggleWinningProduct(item.id)}
                                title="Tandai Bagus Bulan Ini"
                                className="focus:outline-none"
                              >
                                <Star className={`w-4 h-4 transition-colors ${item.isWinning ? 'fill-amber-400 text-amber-400' : 'text-gray-300 hover:text-amber-300'}`} />
                              </button>
                              <div>
                                <p className="font-bold text-gray-900">{item.produk}</p>
                                <span className="text-[11px] text-gray-400 font-medium">{item.tim} • Sisa {item.belumDipakai} raw</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center bg-blue-50/30">
                            <button 
                              onClick={() => openFileDrillDown(item.produk, 'Mentahan (Raw Asset)', item.mentahan, item.tim)}
                              className="font-black text-blue-600 hover:bg-blue-100 px-2.5 py-1 rounded-lg underline decoration-dotted underline-offset-4 transition-colors"
                            >
                              {item.mentahan}
                            </button>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button 
                              onClick={() => openFileDrillDown(item.produk, 'Video Final (Production)', item.videoFinal, 'Rahmat Pajari')}
                              className="font-black text-amber-600 hover:bg-amber-100 px-2.5 py-1 rounded-lg underline decoration-dotted underline-offset-4 transition-colors"
                            >
                              {item.videoFinal}
                            </button>
                          </td>
                          <td className="py-3 px-3 text-center bg-emerald-50/30">
                            <button 
                              onClick={() => openFileDrillDown(item.produk, 'Video Terupload (Publisher)', item.upload, item.tim)}
                              className="font-black text-emerald-600 hover:bg-emerald-100 px-2.5 py-1 rounded-lg underline decoration-dotted underline-offset-4 transition-colors"
                            >
                              {item.upload}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">Tracking Harian (Per Tanggal)</h3>
                  <p className="text-xs text-gray-500">Klik angka harian untuk membuka daftar file pada tanggal tersebut</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-600 bg-gray-50/50 text-xs uppercase">
                      <th className="py-3 px-4 font-bold">Tanggal</th>
                      <th className="py-3 px-3 font-bold text-center">Mentahan</th>
                      <th className="py-3 px-3 font-bold text-center">Diedit</th>
                      <th className="py-3 px-3 font-bold text-center">Upload</th>
                      <th className="py-3 px-4 font-bold text-right">Status Target</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredDaily.map((day, idx) => {
                      const isTargetMet = day.upload >= day.target;
                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="py-3 px-4 font-bold text-gray-900">{day.labelTanggal}</td>
                          <td className="py-3 px-3 text-center">
                            <button 
                              onClick={() => openFileDrillDown(`Tanggal ${day.labelTanggal}`, 'Mentahan (Raw Asset)', day.mentahan, 'Tim Riset')}
                              className="font-semibold text-blue-600 hover:bg-blue-50 px-2 py-0.5 rounded underline decoration-dotted"
                            >
                              {day.mentahan}
                            </button>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button 
                              onClick={() => openFileDrillDown(`Tanggal ${day.labelTanggal}`, 'Video Final (Production)', day.diedit, 'Rahmat Pajari')}
                              className="font-semibold text-amber-600 hover:bg-amber-50 px-2 py-0.5 rounded underline decoration-dotted"
                            >
                              {day.diedit}
                            </button>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button 
                              onClick={() => openFileDrillDown(`Tanggal ${day.labelTanggal}`, 'Video Terupload (Publisher)', day.upload, '5 Akun Publisher')}
                              className={`font-black px-2 py-0.5 rounded underline decoration-dotted ${isTargetMet ? 'text-emerald-600 hover:bg-emerald-50' : 'text-amber-600 hover:bg-amber-50'}`}
                            >
                              {day.upload}
                            </button>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {day.upload > day.target ? (
                              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-xs font-bold">
                                Melampaui ({day.upload}/{day.target})
                              </span>
                            ) : isTargetMet ? (
                              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-xs font-bold">
                                Tercapai ({day.upload}/{day.target})
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-xs font-bold">
                                Kurang {day.target - day.upload} ({day.upload}/{day.target})
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* HALAMAN 2: LAPORAN ANALITIK FYP                                           */}
      {/* ========================================================================= */}
      {activeMenu === 'analitik' && (
        <div className="p-4 md:p-8 max-w-[1400px] mx-auto animate-in fade-in duration-300">
          
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
            <div className="w-full text-center md:text-left">
              <h2 className="text-2xl font-bold text-gray-900">Performa FYP & Evaluasi</h2>
              <p className="text-gray-500 mt-1">Saring data, pantau view, dan eksekusi bot scraper.</p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto print:hidden">
              <button onClick={fetchData} disabled={loading || isBotRunning} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-5 py-2.5 rounded-xl font-semibold shadow-sm transition-colors disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Sinkron Data
              </button>
              
              <button onClick={runBotScraper} disabled={isBotRunning || loading} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm transition-colors disabled:opacity-50">
                {isBotRunning ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Menjalankan Bot...</>
                ) : (
                  <><PlayCircle className="w-4 h-4" /> Jalankan Bot Scraper</>
                )}
              </button>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-col sm:flex-row flex-wrap gap-3 md:gap-4 items-center print:hidden">
            <div className="flex items-center justify-center sm:justify-start gap-2 text-sm font-bold text-gray-700 w-full sm:w-auto mb-2 sm:mb-0">
              <Filter className="w-5 h-5 text-emerald-600" /> Filter Data:
            </div>
            <select value={filterBulan} onChange={(e) => setFilterBulan(e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg block p-2.5 font-semibold w-full sm:w-max">
              {listBulan.map(b => <option key={b} value={b}>{b === 'Semua' ? '📅 Semua Bulan' : b}</option>)}
            </select>
            <select value={filterAkun} onChange={(e) => setFilterAkun(e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg block p-2.5 font-semibold w-full sm:w-max">
              {listAkun.map(a => <option key={a} value={a}>{a === 'Semua' ? '👤 Semua Akun' : a}</option>)}
            </select>
            <select value={filterFyp} onChange={(e) => setFilterFyp(e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg block p-2.5 font-semibold w-full sm:w-max">
              <option value="Semua">🔥 Semua Status</option>
              <option value="Semua FYP">✨ Seluruh FYP (All Tiers)</option>
              <option value="FYP Awal">⭐ FYP Awal (10k+)</option>
              <option value="Berkelanjutan">📈 Berkelanjutan (50k+)</option>
              <option value="Mega FYP">🔥 Mega FYP (100k+)</option>
              <option value="Super Viral">🚀 Super Viral (1M+)</option>
              <option value="Belum FYP">📉 Belum FYP</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8">
            <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-5">
              <div className="p-4 bg-blue-50 text-blue-600 rounded-xl"><Video className="w-7 h-7" /></div>
              <div>
                <p className="text-xs md:text-sm font-bold text-gray-500 uppercase tracking-wider">Video Terfilter</p>
                <h3 className="text-2xl md:text-3xl font-black text-gray-900 mt-1">{statTotalVideo} <span className="text-sm font-semibold text-gray-400 normal-case">klip</span></h3>
              </div>
            </div>
            <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-5">
              <div className="p-4 bg-purple-50 text-purple-600 rounded-xl"><Eye className="w-7 h-7" /></div>
              <div>
                <p className="text-xs md:text-sm font-bold text-gray-500 uppercase tracking-wider">Akumulasi View</p>
                <h3 className="text-2xl md:text-3xl font-black text-gray-900 mt-1">{statTotalView.toLocaleString('id-ID')} <span className="text-sm font-semibold text-gray-400 normal-case">tayangan</span></h3>
              </div>
            </div>
            <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-5">
              <div className="p-4 bg-orange-50 text-orange-600 rounded-xl"><TrendingUp className="w-7 h-7" /></div>
              <div>
                <p className="text-xs md:text-sm font-bold text-gray-500 uppercase tracking-wider">Tembus Algoritma</p>
                <h3 className="text-2xl md:text-3xl font-black text-gray-900 mt-1">{statFyp} <span className="text-sm font-semibold text-gray-400 normal-case">video</span></h3>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-6 relative">
            
            {isBotRunning && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center text-center p-4">
                <RefreshCw className="w-10 h-10 text-emerald-600 animate-spin mb-3" />
                <h3 className="font-bold text-gray-900 text-lg">Bot Sedang Bekerja...</h3>
                <p className="text-sm text-gray-500 font-medium mt-1">Mengecek RapidAPI dan mengupdate Google Sheets. Jangan tutup halaman ini.</p>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 text-sm border-b border-gray-200">
                    <th className="px-6 py-4 font-bold">Barang / Kampanye</th>
                    <th className="px-4 py-4 font-bold">Akun & Tanggal</th>
                    <th className="px-4 py-4 font-bold text-right">View</th>
                    <th className="px-4 py-4 font-bold">Status FYP</th>
                    <th className="px-6 py-4 font-bold text-center">Evaluasi & Analisa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {loading && data.length === 0 ? (
                    <tr><td colSpan="5" className="px-6 py-12 text-center text-gray-400 font-semibold">Menarik data dari Google Sheets...</td></tr>
                  ) : filteredData.length === 0 ? (
                    <tr><td colSpan="5" className="px-6 py-12 text-center text-gray-400 font-semibold">Tidak ada video yang cocok dengan filter.</td></tr>
                  ) : (
                    currentData.map((row, index) => {
                      const badgeStyle = getFypBadgeStyle(row.Video_FYP);
                      const isFyp = badgeStyle.icon !== null;

                      return (
                        <tr key={index} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-bold text-gray-900 truncate max-w-[200px]">{row.Induk_Barang}</p>
                            <a href={row.Link_Postingan} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline font-semibold flex items-center gap-1 mt-1 w-max">
                              Buka Video <ExternalLink className="w-3 h-3"/>
                            </a>
                          </td>
                          <td className="px-4 py-4">
                            <span className="block px-2.5 py-1 rounded-md text-xs font-bold bg-white text-gray-700 border border-gray-300 w-max mb-1 shadow-sm">
                              {row.Nama_Akun || row.Id_Akun}
                            </span>
                            <span className="text-xs text-gray-500 font-medium">{getBulanFormat(row.Tanggal_Upload)}</span>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <span className="font-black text-gray-800 text-base">{(parseInt(String(row.View).replace(/[^0-9]/g, '')) || 0).toLocaleString('id-ID')}</span>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex items-center gap-1.5 font-bold px-3 py-1.5 rounded-lg border whitespace-nowrap shadow-sm ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}>
                              {isFyp && badgeStyle.icon}
                              {row.Video_FYP || "Belum FYP"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-2 min-w-[200px]">
                              <button 
                                onClick={() => analyzeWithGemini(row)}
                                className="flex items-center justify-center gap-1.5 w-full bg-purple-50 text-purple-700 hover:bg-purple-100 px-3 py-1.5 rounded-md text-xs font-bold border border-purple-200 transition-colors shadow-sm"
                              >
                                <Sparkles className="w-3.5 h-3.5" /> Analisa FYP via Bot
                              </button>
                              <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                                  <Edit3 className="h-3.5 w-3.5 text-gray-400" />
                                </div>
                                <input type="text" placeholder="Isi catatan evaluasi tim..." className="bg-white border border-gray-300 text-gray-700 text-xs font-medium rounded-md block w-full pl-8 p-1.5 shadow-sm" />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {!loading && filteredData.length > 0 && (
              <div className="px-4 md:px-6 py-4 border-t border-gray-200 bg-gray-50 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left print:hidden">
                <p className="text-sm text-gray-500 font-medium">
                  Menampilkan <span className="font-bold text-gray-900">{startIndex + 1}</span> hingga <span className="font-bold text-gray-900">{Math.min(endIndex, filteredData.length)}</span> dari <span className="font-bold text-gray-900">{filteredData.length}</span> data
                </p>
                <div className="flex items-center justify-center gap-2 w-full md:w-auto">
                  <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="flex items-center justify-center gap-1 px-3 py-1.5 text-sm font-bold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 shadow-sm transition-colors w-full sm:w-auto">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-semibold text-gray-600 px-2 whitespace-nowrap">Hal {currentPage} dari {totalPages}</span>
                  <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="flex items-center justify-center gap-1 px-3 py-1.5 text-sm font-bold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50 shadow-sm transition-colors w-full sm:w-auto">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* HALAMAN 3: EVALUASI PELANGGARAN (MULTI-SS TANPA BATAS & TAMBAH JENIS)     */}
      {/* ========================================================================= */}
      {activeMenu === 'pelanggaran' && (
        <div className="p-4 md:p-8 max-w-[1400px] mx-auto animate-in fade-in duration-300">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-red-700 flex items-center gap-2">
              <ShieldAlert className="w-6 h-6" /> Evaluasi Video Pelanggaran
            </h2>
            <p className="text-gray-500 mt-1">Catat teguran algoritma TikTok, tambah jenis pelanggaran baru kapan saja, dan upload banyak bukti screenshot sekaligus.</p>
          </div>

          {/* FORM TAMBAH / EDIT PELANGGARAN */}
          <form onSubmit={handleAddViolation} className={`bg-white p-5 rounded-2xl shadow-sm border mb-6 print:hidden transition-colors ${editingViolationId !== null ? 'border-amber-400 ring-2 ring-amber-100' : 'border-red-200'}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                {editingViolationId !== null ? (
                  <><Edit3 className="w-4 h-4 text-amber-600" /> Mode Edit Data Pelanggaran</>
                ) : (
                  <><Plus className="w-4 h-4 text-red-600" /> Catat Pelanggaran Baru</>
                )}
              </h3>
              {editingViolationId !== null && (
                <span className="text-xs font-bold bg-amber-50 text-amber-800 px-2.5 py-1 rounded-md border border-amber-200">
                  Sedang Mengedit: {newViolation.produk}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <select 
                value={newViolation.akun} 
                onChange={(e) => setNewViolation({...newViolation, akun: e.target.value})}
                className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg p-2.5 font-semibold"
                required
              >
                <option value="">Pilih Akun Terdampak...</option>
                <option value="Akun 1 - Deni Rohmat">Akun 1 - Deni Rohmat</option>
                <option value="Akun 2 - Ikhsan Harun">Akun 2 - Ikhsan Harun</option>
                <option value="Akun 3 - Mochamad Rizal">Akun 3 - Mochamad Rizal</option>
                <option value="Akun 4 - Publisher 4">Akun 4 - Publisher 4</option>
                <option value="Akun 5 - Publisher 5">Akun 5 - Publisher 5</option>
              </select>

              <input 
                type="text" 
                placeholder="Nama Produk (mis: Pisau Mesin)..."
                value={newViolation.produk}
                onChange={(e) => setNewViolation({...newViolation, produk: e.target.value})}
                className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg p-2.5 font-semibold"
                required
              />

              {/* DROPDOWN JENIS PELANGGARAN + FITUR KETIK JENIS BARU */}
              {!isCustomJenis ? (
                <select 
                  value={newViolation.jenis}
                  onChange={(e) => {
                    if (e.target.value === '__TAMBAH_BARU__') {
                      setIsCustomJenis(true);
                      setNewViolation({...newViolation, jenis: ''});
                    } else {
                      setNewViolation({...newViolation, jenis: e.target.value});
                    }
                  }}
                  className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg p-2.5 font-semibold"
                  required
                >
                  <option value="">Jenis Pelanggaran...</option>
                  {violationTypes.map((type, idx) => (
                    <option key={idx} value={type}>{type}</option>
                  ))}
                  <option value="__TAMBAH_BARU__" className="font-bold text-red-600 bg-red-50">
                    + Ketik Jenis Pelanggaran Baru...
                  </option>
                </select>
              ) : (
                <div className="flex gap-1">
                  <input 
                    type="text"
                    placeholder="Ketik jenis pelanggaran baru..."
                    value={newViolation.jenis}
                    onChange={(e) => setNewViolation({...newViolation, jenis: e.target.value})}
                    className="bg-white border-2 border-red-400 text-gray-800 text-sm rounded-lg p-2 font-semibold w-full"
                    autoFocus
                    required
                  />
                  <button 
                    type="button"
                    onClick={() => setIsCustomJenis(false)}
                    className="px-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-bold shrink-0"
                  >
                    Batal
                  </button>
                </div>
              )}

              {/* PILIHAN STATUS BANDING */}
              <select 
                value={newViolation.status}
                onChange={(e) => setNewViolation({...newViolation, status: e.target.value})}
                className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg p-2.5 font-semibold"
              >
                <option value="Belum Banding">⏳ Status: Belum Banding</option>
                <option value="Menunggu Banding">🕒 Status: Menunggu Banding</option>
                <option value="Banding Diterima">✅ Status: Banding Diterima</option>
                <option value="Banding Ditolak">❌ Status: Banding Ditolak</option>
              </select>

              <input 
                type="url" 
                placeholder="Link Video TikTok (https://tiktok.com/...)..."
                value={newViolation.linkVideo}
                onChange={(e) => setNewViolation({...newViolation, linkVideo: e.target.value})}
                className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg p-2.5 font-semibold"
              />

              {/* MULTI-UPLOAD SCREENSHOT DENGAN PILIHAN LABEL */}
              <div className="flex gap-1.5 sm:col-span-2">
                <select
                  value={ssLabelInput}
                  onChange={(e) => setSsLabelInput(e.target.value)}
                  className="bg-gray-50 border border-gray-200 text-gray-700 text-xs rounded-lg px-2.5 font-bold shrink-0"
                >
                  <option value="SS Teguran">Label: SS Teguran</option>
                  <option value="SS Hasil Banding">Label: SS Banding</option>
                  <option value="SS Poin Penalti">Label: SS Penalti</option>
                  <option value="SS Bukti Lainnya">Label: SS Lainnya</option>
                </select>

                <label className="flex-1 bg-gray-50 border border-dashed border-gray-300 hover:border-red-400 text-gray-700 text-sm rounded-lg p-2.5 font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors">
                  <ImageIcon className="w-4 h-4 text-red-600 shrink-0" />
                  <span className="truncate text-xs">
                    + Pilih Banyak SS Sekaligus ({(newViolation.screenshots || []).length} foto)
                  </span>
                  <input type="file" accept="image/*" multiple onChange={handleMultipleScreenshots} className="hidden" />
                </label>
              </div>

              <input 
                type="text" 
                placeholder="Catatan perbaikan untuk tim..."
                value={newViolation.catatan}
                onChange={(e) => setNewViolation({...newViolation, catatan: e.target.value})}
                className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg p-2.5 font-semibold"
              />
            </div>

            {/* DAFTAR PREVIEW SCREENSHOT YANG SUDAH DIPILIH DI FORM */}
            {newViolation.screenshots && newViolation.screenshots.length > 0 && (
              <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-gray-200">
                <p className="text-xs font-bold text-gray-600 mb-2">
                  Daftar Bukti Screenshot Terlampir ({newViolation.screenshots.length} gambar):
                </p>
                <div className="flex flex-wrap gap-2">
                  {newViolation.screenshots.map((ss, idx) => (
                    <div key={ss.id || idx} className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-gray-200 shadow-sm">
                      <img src={ss.url} alt={ss.label} className="w-8 h-8 object-cover rounded border" />
                      <span className="text-xs font-bold text-gray-700">{ss.label}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveFormScreenshot(ss.id)}
                        className="text-gray-400 hover:text-red-600 p-0.5"
                        title="Hapus SS ini"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <button type="submit" className={`${editingViolationId !== null ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'} text-white font-bold text-xs md:text-sm px-5 py-2.5 rounded-xl transition-colors shadow-sm`}>
                {editingViolationId !== null ? 'Simpan Perubahan Edit' : 'Simpan Data Pelanggaran'}
              </button>
              {editingViolationId !== null && (
                <button 
                  type="button" 
                  onClick={handleCancelEditViolation}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs md:text-sm px-4 py-2.5 rounded-xl transition-colors"
                >
                  Batal Edit
                </button>
              )}
            </div>
          </form>

          {/* TABEL DAFTAR PELANGGARAN */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm min-w-[950px]">
                <thead>
                  <tr className="bg-red-50/60 text-red-900 border-b border-red-100 text-xs uppercase">
                    <th className="py-3.5 px-4 font-bold">Tanggal & Akun</th>
                    <th className="py-3.5 px-4 font-bold">Produk & Link Video</th>
                    <th className="py-3.5 px-4 font-bold">Jenis Pelanggaran</th>
                    <th className="py-3.5 px-4 font-bold text-center">Galeri Bukti SS (Multi)</th>
                    <th className="py-3.5 px-4 font-bold">Status Banding</th>
                    <th className="py-3.5 px-4 font-bold">Evaluasi / Tindakan</th>
                    <th className="py-3.5 px-4 font-bold text-center print:hidden">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {violations.map((v) => {
                    const rowScreenshots = getViolationScreenshots(v);
                    return (
                      <tr key={v.id} className={`hover:bg-gray-50 transition-colors ${editingViolationId === v.id ? 'bg-amber-50/40' : ''}`}>
                        <td className="py-3.5 px-4">
                          <p className="font-bold text-gray-900">{v.akun}</p>
                          <span className="text-xs text-gray-500">{v.tanggal}</span>
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-bold text-gray-800">{v.produk}</p>
                          {v.linkVideo ? (
                            <a href={v.linkVideo} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline font-semibold flex items-center gap-1 mt-0.5 w-max">
                              Buka Video <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-xs text-gray-400 italic">Tanpa link</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-md text-xs font-bold">
                            {v.jenis}
                          </span>
                        </td>

                        {/* KOLOM MULTI-SCREENSHOT GALERI */}
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-[220px] mx-auto">
                            {rowScreenshots.map((ss, idx) => (
                              <button
                                key={ss.id || idx}
                                onClick={() => setPreviewGallery({ produk: v.produk, images: rowScreenshots, activeIndex: idx })}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 hover:bg-red-50 text-gray-800 hover:text-red-700 rounded-md text-[11px] font-bold border border-gray-300 transition-colors"
                              >
                                <ImageIcon className="w-3 h-3 text-red-600 shrink-0" />
                                <span className="truncate max-w-[95px]">{ss.label || `SS #${idx + 1}`}</span>
                              </button>
                            ))}

                            <label className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-md text-[11px] font-bold border border-dashed border-emerald-300 cursor-pointer print:hidden">
                              <Plus className="w-3 h-3 text-emerald-600" /> Tambah SS
                              <input type="file" accept="image/*" multiple onChange={(e) => handleQuickAddScreenshotsToRow(e, v.id)} className="hidden" />
                            </label>
                          </div>
                        </td>

                        {/* KOLOM DROPDOWN STATUS BANDING */}
                        <td className="py-3.5 px-4">
                          <select
                            value={v.status || 'Belum Banding'}
                            onChange={(e) => handleQuickStatusChange(v.id, e.target.value)}
                            className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border cursor-pointer focus:outline-none ${getViolationStatusStyle(v.status)}`}
                          >
                            <option value="Belum Banding">Belum Banding</option>
                            <option value="Menunggu Banding">Menunggu Banding</option>
                            <option value="Banding Diterima">Banding Diterima</option>
                            <option value="Banding Ditolak">Banding Ditolak</option>
                          </select>
                        </td>

                        <td className="py-3.5 px-4 text-gray-600 text-xs leading-relaxed max-w-xs">{v.catatan}</td>

                        {/* KOLOM TOMBOL EDIT BARIS */}
                        <td className="py-3.5 px-4 text-center print:hidden">
                          <button
                            onClick={() => handleStartEditViolation(v)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition-colors shadow-sm"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}