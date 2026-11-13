import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, Video, Eye, RefreshCw, ExternalLink, Edit3, Sparkles, 
  LayoutDashboard, BarChart2,
  Filter, Zap, Flame, Rocket, ChevronLeft, ChevronRight, PlayCircle, 
  X, AlertTriangle, CheckCircle2, ServerCrash, BrainCircuit,
  ShieldAlert, Star, Plus, Image as ImageIcon, FolderOpen, Send, Printer, Trash2, Check
} from 'lucide-react';

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
  screenshots: []
};

const normalizeDateToIso = (dateVal) => {
  if (!dateVal) return '';
  const s = String(dateVal).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const slashMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (slashMatch) {
    let p1 = parseInt(slashMatch[1], 10);
    let p2 = parseInt(slashMatch[2], 10);
    const yr = slashMatch[3];
    const day = p1 > 12 ? p1 : (p2 > 12 ? p2 : p1);
    const month = p1 > 12 ? p2 : (p2 > 12 ? p1 : p2);
    return `${yr}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
  }
  return '';
};

const formatIsoMonthLabel = (ym) => {
  if (!ym || ym === 'Semua') return '📅 Semua Bulan';
  if (ym === 'Tanpa Tanggal') return 'Tanpa Tanggal';
  const [yr, mo] = ym.split('-');
  const d = new Date(parseInt(yr, 10), parseInt(mo, 10) - 1, 1);
  if (isNaN(d.getTime())) return ym;
  return `📅 ${d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })} (${ym})`;
};

export default function App() {
  const [activeMenu, setActiveMenu] = useState('pipeline'); 

  // --- STATE DATA ASLI DARI GOOGLE SHEETS ---
  const [data, setData] = useState([]);               // Data_View (Laporan FYP)
  const [rawAssets, setRawAssets] = useState([]);     // Raw_Asset + FILE_ASSET (Kolom N)
  const [klipVideos, setKlipVideos] = useState([]);   // Klip_Vidio (Kolom G)
  const [publishVideos, setPublishVideos] = useState([]); // Publish (Kolom B)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isBotRunning, setIsBotRunning] = useState(false);
  const [botReport, setBotReport] = useState(null); 

  // --- STATE ANALISA GEMINI PER VIDEO ---
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);

  // --- STATE FILTER HALAMAN REKAP PIPELINE ---
  const [rekapBulan, setRekapBulan] = useState('Semua');
  const [rekapTanggal, setRekapTanggal] = useState('');
  const [rekapProduk, setRekapProduk] = useState('Semua');
  const [rekapTim, setRekapTim] = useState('Semua');
  const [sortBy, setSortBy] = useState('mentahan');
  const [onlyWinning, setOnlyWinning] = useState(false);

  // --- STATE PENYIMPANAN BINTANG PER PRODUK ("Data_Winning_Web") ---
  const [winningWebMap, setWinningWebMap] = useState({});
  const [savingProductKey, setSavingProductKey] = useState(null);

  // --- STATE PENYIMPANAN BINTANG PER FILE INDIVIDUAL ("Data_Winning_Files") ---
  const [winningFilesMap, setWinningFilesMap] = useState({});
  const [savingFileKey, setSavingFileKey] = useState(null);
  const [onlyWinningInModal, setOnlyWinningInModal] = useState(false);

  // --- STATE DRILL-DOWN MODAL DAFTAR FILE ASLI ---
  const [drillDownModal, setDrillDownModal] = useState(null);

  // --- STATE ASISTEN AI PEMBACA WEB & PEMBUAT LAPORAN PPT/PDF ---
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);

  // --- STATE HALAMAN PELANGGARAN ---
  const [violations, setViolations] = useState([]);
  const [newViolation, setNewViolation] = useState(EMPTY_VIOLATION_FORM);
  const [editingViolationId, setEditingViolationId] = useState(null);
  const [violationTypes, setViolationTypes] = useState(DEFAULT_VIOLATION_TYPES);
  const [isCustomJenis, setIsCustomJenis] = useState(false);
  const [ssLabelInput, setSsLabelInput] = useState('SS Teguran');
  const [previewGallery, setPreviewGallery] = useState(null);

  // ⚠️ API KEY & URL
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  const API_URL = "https://script.google.com/macros/s/AKfycbwTxa-MqVkrK65FPqNfR8ZglL17sZQ5QTExgQ0jtc_U--MXMoo4PrHnpOlpfmZQaS1n0g/exec";

  // STATE FILTER & PAGINATION ANALITIK FYP
  const [filterBulan, setFilterBulan] = useState('Semua');
  const [filterAkun, setFilterAkun] = useState('Semua');
  const [filterFyp, setFilterFyp] = useState('Semua');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // --- FUNGSI TARIK SELURUH DATA DARI GOOGLE SHEETS ---
  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch(API_URL);
      const result = await response.json();
      if (result.status === "success") {
        const validData = (result.data || []).filter(item => 
          item.Link_Postingan && String(item.Link_Postingan).includes("tiktok.com") && item.Induk_Barang && String(item.Induk_Barang).trim() !== ""
        ).map(item => {
          const iso = item._isoDate || normalizeDateToIso(item.Tanggal_Upload);
          return {
            ...item,
            _isoDate: iso,
            _month: iso ? iso.slice(0, 7) : 'Tanpa Tanggal'
          };
        });
        setData(validData.reverse());

        if (Array.isArray(result.rawAssets)) setRawAssets(result.rawAssets);
        if (Array.isArray(result.klipVideos)) setKlipVideos(result.klipVideos);
        if (Array.isArray(result.publishVideos)) setPublishVideos(result.publishVideos);

        if (result.violations && result.violations.length > 0) {
          setViolations(result.violations);
          const customTypesFromSheet = result.violations.map(v => v.jenis).filter(Boolean);
          setViolationTypes(prev => [...new Set([...prev, ...customTypesFromSheet])]);
        }

        if (Array.isArray(result.winningWeb)) {
          const mapW = {};
          result.winningWeb.forEach(w => {
            if (w.key) mapW[w.key] = { isWinning: !!w.isWinning, catatan: w.catatan || '' };
            if (w.produk && !mapW[`GLOBAL__${w.produk}`]) {
              mapW[`GLOBAL__${w.produk}`] = { isWinning: !!w.isWinning, catatan: w.catatan || '' };
            }
          });
          setWinningWebMap(mapW);
        }

        if (Array.isArray(result.winningFiles)) {
          const mapWF = {};
          result.winningFiles.forEach(wf => {
            if (wf.fileKey) {
              mapWF[wf.fileKey] = {
                isWinning: !!wf.isWinning,
                catatan: wf.catatan || ''
              };
            }
          });
          setWinningFilesMap(mapWF);
        }
      }
    } catch (err) {
      setError("Terjadi kesalahan jaringan.");
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [filterBulan, filterAkun, filterFyp]);

  const getWinningKey = (produkName) => `${rekapBulan}__${produkName}`;

  const getProductWinningInfo = (produkName) => {
    const specificKey = `${rekapBulan}__${produkName}`;
    if (winningWebMap[specificKey]) return winningWebMap[specificKey];
    if (winningWebMap[`Semua__${produkName}`]) return winningWebMap[`Semua__${produkName}`];
    if (winningWebMap[`GLOBAL__${produkName}`]) return winningWebMap[`GLOBAL__${produkName}`];
    return { isWinning: false, catatan: '' };
  };

  // --- SIMPAN BINTANG & CATATAN PER PRODUK KE "Data_Winning_Web" ---
  const saveProductWinningToSheet = async (item, newIsWinning, newCatatan) => {
    const key = getWinningKey(item.produk);
    setSavingProductKey(item.produk);

    setWinningWebMap(prev => ({
      ...prev,
      [key]: { isWinning: newIsWinning, catatan: newCatatan },
      [`GLOBAL__${item.produk}`]: { isWinning: newIsWinning, catatan: newCatatan }
    }));

    try {
      await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'save_winning_web',
          data: {
            key: key,
            bulan: rekapBulan,
            produk: item.produk,
            mentahan: item.mentahan,
            videoFinal: item.videoFinal,
            upload: item.upload,
            isWinning: newIsWinning,
            catatan: newCatatan
          }
        })
      });
    } catch (err) {
      console.error("Gagal menyimpan ke Data_Winning_Web", err);
    }
    setTimeout(() => setSavingProductKey(null), 700);
  };

  // --- SIMPAN BINTANG & CATATAN PER FILE INDIVIDUAL KE "Data_Winning_Files" ---
  const saveFileWinningToSheet = async (fileObj, newIsWinning, newCatatan) => {
    const fKey = fileObj.fileKey;
    setSavingFileKey(fKey);

    setWinningFilesMap(prev => ({
      ...prev,
      [fKey]: { isWinning: newIsWinning, catatan: newCatatan }
    }));

    try {
      await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'save_winning_file',
          data: {
            fileKey: fKey,
            kategori: fileObj.kategori || '',
            produk: fileObj.produk || '',
            fileName: fileObj.name || '',
            url: fileObj.url || '',
            isWinning: newIsWinning,
            catatan: newCatatan
          }
        })
      });
    } catch (err) {
      console.error("Gagal menyimpan ke Data_Winning_Files", err);
    }
    setTimeout(() => setSavingFileKey(null), 700);
  };

  // --- DAFTAR PILIHAN FILTER DINAMIS DARI SHEET ASLI ---
  const availableMonthsRekap = useMemo(() => {
    const months = new Set();
    rawAssets.forEach(r => { if (r.month && r.month !== 'Tanpa Tanggal') months.add(r.month); });
    klipVideos.forEach(k => { if (k.month && k.month !== 'Tanpa Tanggal') months.add(k.month); });
    publishVideos.forEach(p => { if (p.month && p.month !== 'Tanpa Tanggal') months.add(p.month); });
    return ['Semua', ...Array.from(months).sort().reverse()];
  }, [rawAssets, klipVideos, publishVideos]);

  const availableProductsRekap = useMemo(() => {
    const prods = new Set();
    rawAssets.forEach(r => { if (r.produk) prods.add(r.produk); });
    klipVideos.forEach(k => { if (k.produk) prods.add(k.produk); });
    publishVideos.forEach(p => { if (p.produk) prods.add(p.produk); });
    return ['Semua', ...Array.from(prods).sort()];
  }, [rawAssets, klipVideos, publishVideos]);

  const availableTeamsRekap = useMemo(() => {
    const teams = new Set();
    rawAssets.forEach(r => { if (r.creator) teams.add(r.creator); });
    klipVideos.forEach(k => { if (k.editor) teams.add(k.editor); });
    publishVideos.forEach(p => { 
      if (p.uploader) teams.add(p.uploader);
      if (p.akun) teams.add(p.akun);
    });
    return ['Semua', ...Array.from(teams).sort()];
  }, [rawAssets, klipVideos, publishVideos]);

  // --- FILTERING ITEM MENTAHAN, VIDEO FINAL & UPLOAD (DARI SHEET PUBLISH) ---
  const filteredRawList = useMemo(() => {
    return rawAssets.filter(r => {
      const mBulan = rekapBulan === 'Semua' || r.month === rekapBulan;
      const mTanggal = !rekapTanggal || r.date === rekapTanggal;
      const mProduk = rekapProduk === 'Semua' || r.produk === rekapProduk;
      const mTim = rekapTim === 'Semua' || (r.creator || '').toLowerCase() === rekapTim.toLowerCase();
      return mBulan && mTanggal && mProduk && mTim;
    });
  }, [rawAssets, rekapBulan, rekapTanggal, rekapProduk, rekapTim]);

  const filteredKlipList = useMemo(() => {
    return klipVideos.filter(k => {
      const mBulan = rekapBulan === 'Semua' || k.month === rekapBulan;
      const mTanggal = !rekapTanggal || k.date === rekapTanggal;
      const mProduk = rekapProduk === 'Semua' || k.produk === rekapProduk;
      const mTim = rekapTim === 'Semua' || (k.editor || '').toLowerCase() === rekapTim.toLowerCase() || (k.akunTarget || '').toLowerCase() === rekapTim.toLowerCase();
      return mBulan && mTanggal && mProduk && mTim;
    });
  }, [klipVideos, rekapBulan, rekapTanggal, rekapProduk, rekapTim]);

  const filteredUploadList = useMemo(() => {
    // Jika sheet Publish sudah terbaca, gunakan sheet Publish; jika belum, fallback ke Data_View
    const sourceList = publishVideos.length > 0 ? publishVideos : data.map((u, idx) => ({
      id: idx + 1,
      fileName: u.Induk_Barang || 'Video TikTok',
      url: u.Link_Postingan,
      date: u._isoDate,
      month: u._month,
      akun: u.Id_Akun || '',
      uploader: u.Nama_Akun || u.Id_Akun || 'Publisher',
      produk: String(u.Induk_Barang || 'Tanpa Produk').trim(),
      status: u.Video_FYP || 'Sukses'
    }));

    return sourceList.filter(p => {
      const mBulan = rekapBulan === 'Semua' || p.month === rekapBulan;
      const mTanggal = !rekapTanggal || p.date === rekapTanggal;
      const mProduk = rekapProduk === 'Semua' || p.produk === rekapProduk;
      const mTim = rekapTim === 'Semua' || 
        (p.uploader || '').toLowerCase() === rekapTim.toLowerCase() || 
        (p.akun || '').toLowerCase() === rekapTim.toLowerCase();
      return mBulan && mTanggal && mProduk && mTim;
    });
  }, [publishVideos, data, rekapBulan, rekapTanggal, rekapProduk, rekapTim]);

  // --- AGREGASI TABEL KIRI: REKAP PER PRODUK ---
  const aggregatedProducts = useMemo(() => {
    const map = {};
    const ensureProd = (prodName) => {
      const key = prodName || 'Tanpa Produk';
      if (!map[key]) {
        const winInfo = getProductWinningInfo(key);
        map[key] = {
          produk: key,
          mentahan: 0,
          belumDipakai: 0,
          dipakai: 0,
          videoFinal: 0,
          upload: 0,
          starredFilesCount: 0,
          creators: new Set(),
          rawFiles: [],
          klipFiles: [],
          uploadFiles: [],
          isWinning: winInfo.isWinning,
          catatan: winInfo.catatan
        };
      }
      return map[key];
    };

    filteredRawList.forEach((r, idx) => {
      const entry = ensureProd(r.produk);
      entry.mentahan += 1;
      if (r.status === 'Belum Dipakai') entry.belumDipakai += 1;
      else entry.dipakai += 1;
      if (r.creator) entry.creators.add(r.creator);

      const fileKey = `RAW__${r.id || r.fileName || idx}`;
      if (winningFilesMap[fileKey]?.isWinning) entry.starredFilesCount += 1;

      entry.rawFiles.push({
        fileKey,
        kategori: 'Mentahan (Raw_Asset)',
        produk: r.produk,
        name: r.fileName || r.id,
        status: r.status || 'Mentahan',
        owner: `${r.creator || 'Riset'} • ${r.date || 'Tanpa Tanggal'}`,
        url: r.url || 'https://onedrive.live.com/'
      });
    });

    filteredKlipList.forEach((k, idx) => {
      const entry = ensureProd(k.produk);
      entry.videoFinal += 1;
      if (k.editor) entry.creators.add(k.editor);

      const fileKey = `KLIP__${k.id || k.fileName || idx}`;
      if (winningFilesMap[fileKey]?.isWinning) entry.starredFilesCount += 1;

      entry.klipFiles.push({
        fileKey,
        kategori: 'Video Final (Klip_Vidio)',
        produk: k.produk,
        name: k.fileName || k.id,
        status: `Selesai Edit (${k.date || '-'})`,
        owner: `Editor: ${k.editor || '-'}`,
        url: k.url || 'https://onedrive.live.com/'
      });
    });

    filteredUploadList.forEach((p, idx) => {
      const entry = ensureProd(p.produk);
      entry.upload += 1;
      if (p.uploader) entry.creators.add(p.uploader);

      const fileKey = `PUBLISH__${p.id || p.url || idx}`;
      if (winningFilesMap[fileKey]?.isWinning) entry.starredFilesCount += 1;

      entry.uploadFiles.push({
        fileKey,
        kategori: 'Video Terupload (Publish)',
        produk: p.produk,
        name: `${p.fileName} (${p.produk})`,
        status: `${p.status || 'Sukses'} (${p.date || '-'})`,
        owner: `${p.uploader || 'Publisher'} (${p.akun || '-'})`,
        url: p.url || 'https://www.tiktok.com/'
      });
    });

    return Object.values(map)
      .filter(item => !onlyWinning || item.isWinning || item.starredFilesCount > 0)
      .sort((a, b) => b[sortBy] - a[sortBy]);
  }, [filteredRawList, filteredKlipList, filteredUploadList, winningWebMap, winningFilesMap, rekapBulan, onlyWinning, sortBy]);

  // --- AGREGASI TABEL KANAN: TRACKING HARIAN ---
  const aggregatedDaily = useMemo(() => {
    const map = {};
    const ensureDate = (isoDate) => {
      if (!isoDate) return null;
      if (!map[isoDate]) {
        const [yr, mo, da] = isoDate.split('-');
        map[isoDate] = {
          tanggal: isoDate,
          labelTanggal: da && mo && yr ? `${da}/${mo}/${yr}` : isoDate,
          mentahan: 0,
          diedit: 0,
          upload: 0,
          target: 15,
          rawFiles: [],
          klipFiles: [],
          uploadFiles: []
        };
      }
      return map[isoDate];
    };

    filteredRawList.forEach((r, idx) => {
      const d = ensureDate(r.date);
      if (!d) return;
      d.mentahan += 1;
      d.rawFiles.push({
        fileKey: `RAW__${r.id || r.fileName || idx}`,
        kategori: 'Mentahan (Raw_Asset)',
        produk: r.produk,
        name: `${r.fileName} (${r.produk})`,
        status: r.status || 'Mentahan',
        owner: r.creator || 'Riset',
        url: r.url || 'https://onedrive.live.com/'
      });
    });

    filteredKlipList.forEach((k, idx) => {
      const d = ensureDate(k.date);
      if (!d) return;
      d.diedit += 1;
      d.klipFiles.push({
        fileKey: `KLIP__${k.id || k.fileName || idx}`,
        kategori: 'Video Final (Klip_Vidio)',
        produk: k.produk,
        name: `${k.fileName} (${k.produk})`,
        status: 'Selesai Edit',
        owner: `Editor: ${k.editor || '-'}`,
        url: k.url || 'https://onedrive.live.com/'
      });
    });

    filteredUploadList.forEach((p, idx) => {
      const d = ensureDate(p.date);
      if (!d) return;
      d.upload += 1;
      d.uploadFiles.push({
        fileKey: `PUBLISH__${p.id || p.url || idx}`,
        kategori: 'Video Terupload (Publish)',
        produk: p.produk,
        name: `${p.fileName} (${p.produk})`,
        status: p.status || 'Sukses',
        owner: `${p.uploader || 'Publisher'} (${p.akun || '-'})`,
        url: p.url || 'https://www.tiktok.com/'
      });
    });

    return Object.values(map).sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  }, [filteredRawList, filteredKlipList, filteredUploadList]);

  const totalMentahanRekap = filteredRawList.length;
  const totalBelumDipakaiRekap = filteredRawList.filter(r => r.status === 'Belum Dipakai').length;
  const totalDipakaiRekap = totalMentahanRekap - totalBelumDipakaiRekap;
  const totalFinalRekap = filteredKlipList.length;
  const totalUploadRekap = filteredUploadList.length;

  const openRealFilesModal = (title, kategori, filesArray) => {
    if (!filesArray || filesArray.length === 0) return;
    setOnlyWinningInModal(false);
    setDrillDownModal({
      title: `${kategori} — ${title}`,
      subtitle: `Klik bintang ⭐ pada baris file di bawah untuk menandai file video bagus (tersimpan ke Data_Winning_Files)`,
      items: filesArray
    });
  };

  const getViolationStatusStyle = (status) => {
    const s = (status || '').toLowerCase();
    if (s.includes('diterima')) return 'bg-emerald-50 text-emerald-700 border-emerald-300';
    if (s.includes('ditolak')) return 'bg-red-50 text-red-700 border-red-300';
    if (s.includes('menunggu')) return 'bg-amber-50 text-amber-700 border-amber-300';
    return 'bg-gray-100 text-gray-700 border-gray-300';
  };

  const getViolationScreenshots = (v) => {
    if (Array.isArray(v.screenshots)) return v.screenshots;
    const list = [];
    if (v.screenshot) list.push({ id: 'ss_1', label: 'SS Teguran', url: v.screenshot });
    if (v.screenshotBanding) list.push({ id: 'ss_2', label: 'SS Banding', url: v.screenshotBanding });
    return list;
  };

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

  const handleRemoveFormScreenshot = (ssId) => {
    setNewViolation(prev => ({
      ...prev,
      screenshots: (prev.screenshots || []).filter(item => item.id !== ssId)
    }));
  };

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

    const updatedItem = { ...targetItem, screenshots: [...existingSS, ...addedSS] };
    setViolations(prev => prev.map(v => v.id === rowId ? updatedItem : v));
    e.target.value = '';

    try {
      await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'update_violation', data: updatedItem })
      });
    } catch (err) {
      console.error("Gagal menambah SS ke Google Sheets", err);
    }
  };

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

  const handleQuickStatusChange = async (id, newStatus) => {
    const targetItem = violations.find(v => v.id === id);
    if (!targetItem) return;
    const updatedItem = { ...targetItem, status: newStatus, screenshots: getViolationScreenshots(targetItem) };
    setViolations(prev => prev.map(v => v.id === id ? updatedItem : v));

    try {
      await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'update_violation', data: updatedItem })
      });
    } catch (err) {
      console.error("Gagal mengupdate status ke Sheets", err);
    }
  };

  const handleAddViolation = async (e) => {
    e.preventDefault();
    if (!newViolation.akun || !newViolation.produk || !newViolation.jenis) return;

    const cleanJenis = newViolation.jenis.trim();
    if (!violationTypes.includes(cleanJenis)) {
      setViolationTypes(prev => [...prev, cleanJenis]);
    }
    setIsCustomJenis(false);

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
          body: JSON.stringify({ action: 'update_violation', data: updatedEntry })
        });
      } catch (err) {
        alert("Perubahan tampil di layar, namun gagal tersimpan ke Google Sheets.");
      }
      return;
    }

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
        body: JSON.stringify({ action: 'save_violation', data: newEntry })
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

    const topProdsText = aggregatedProducts.slice(0, 8).map(p => `${p.produk} (Raw:${p.mentahan}, Edit:${p.videoFinal}, Upload:${p.upload}, Bagus:${p.isWinning ? 'Ya' : 'Tidak'}, FileBerbintang:${p.starredFilesCount})`).join('; ');
    const recentDaysText = aggregatedDaily.slice(0, 7).map(d => `${d.labelTanggal} (Raw:${d.mentahan}, Edit:${d.diedit}, Upload:${d.upload}/${d.target})`).join('; ');

    const dashboardContext = `
      Konteks Data Asli Web PromoOps Studio Saat Ini:
      - Filter Aktif: Bulan ${rekapBulan}, Tanggal ${rekapTanggal || 'Semua Hari'}, Produk ${rekapProduk}, Tim ${rekapTim}.
      - Total Mentahan (Raw_Asset + Kolom N FILE_ASSET): ${totalMentahanRekap} file (${totalBelumDipakaiRekap} belum dipakai, ${totalDipakaiRekap} sudah dipakai).
      - Total Video Final (Klip_Vidio Selesai Edit): ${totalFinalRekap} klip.
      - Total Upload (Sheet Publish): ${totalUploadRekap} video tayang (Target harian: 15 video/hari).
      - 8 Produk Teratas: ${topProdsText}.
      - 7 Hari Terakhir: ${recentDaysText}.
      - Total Pelanggaran Tercatat: ${violations.length} kasus.
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
            `**1. Kekuatan Produksi & Stok Mentahan (Data Real-Time Sheets)**\n` +
            `* **Total Aset Mentahan (Raw_Asset):** Tercatat **${totalMentahanRekap} file** di OneDrive (${totalBelumDipakaiRekap} belum dipakai & ${totalDipakaiRekap} sudah dipakai).\n` +
            `* **Kinerja Editor (Klip_Vidio):** Menghasilkan **${totalFinalRekap} klip selesai edit**.\n` +
            `* **Distribusi Publisher (Sheet Publish):** Berhasil menayangkan **${totalUploadRekap} video**.\n\n` +
            `**2. Peringkat Produk Terbanyak & Winning Web**\n` +
            `* Produk tertinggi dipimpin oleh **${aggregatedProducts[0]?.produk || '-'}** (${aggregatedProducts[0]?.mentahan || 0} mentahan, ${aggregatedProducts[0]?.videoFinal || 0} edit, ${aggregatedProducts[0]?.upload || 0} upload).\n` +
            `* Produk yang ditandai Bagus (⭐): **${aggregatedProducts.filter(p => p.isWinning || p.starredFilesCount > 0).map(p => `${p.produk} (${p.starredFilesCount} file berbintang)`).join(', ') || 'Belum ada'}**.\n\n` +
            `**3. Evaluasi Pelanggaran**\n` +
            `* Tercatat **${violations.length} kasus pelanggaran** yang sedang dikelola oleh tim.`
          );
          setIsAiThinking(false);
        }, 600);
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
          `* **Total Upload (Sheet Publish):** ${totalUploadRekap} video tayang.\n` +
          `* **Produk Terbanyak:** ${aggregatedProducts[0]?.produk || '-'} (${aggregatedProducts[0]?.mentahan || 0} raw, ${aggregatedProducts[0]?.videoFinal || 0} edit, ${aggregatedProducts[0]?.upload || 0} upload).`
        );
      }
    } catch (err) {
      setAiResponse("Gagal menghubungi server AI, namun Anda tetap dapat mencetak halaman ini ke PDF.");
    }
    setIsAiThinking(false);
  };

  const analyzeWithGemini = async (row) => {
    setSelectedVideo(row);
    setIsAnalyzing(true);
    setAnalysisResult(null);

    const viewCount = (parseInt(String(row.View).replace(/[^0-9]/g, '')) || 0).toLocaleString('id-ID');
    const prompt = `
      Anda adalah pakar Algoritma TikTok dan Strategi Konten E-Commerce.
      Berikan analisa singkat mengapa video promosi ini berhasil:
      - Nama Barang/Produk: ${row.Induk_Barang}
      - Jumlah Tayangan (Views): ${viewCount}
      - Status Keberhasilan: ${row.Video_FYP}
      Bahas: 1. Anatomi Hook, 2. Nilai Retensi, 3. Sinyal Algoritma.
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

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 pb-12 relative print:bg-white print:pb-0">
      
      {/* ========================================================================= */}
      {/* MODAL 1: POP-UP DRILL-DOWN DAFTAR FILE (BISA TANDAI BINTANG PER FILE)     */}
      {/* ========================================================================= */}
      {drillDownModal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 print:hidden">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-gray-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <FolderOpen className="w-6 h-6 text-emerald-400 shrink-0" />
                <div>
                  <h3 className="font-bold text-base md:text-lg leading-tight">{drillDownModal.title}</h3>
                  <p className="text-xs text-gray-300 mt-0.5">{drillDownModal.subtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setOnlyWinningInModal(!onlyWinningInModal)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-colors ${
                    onlyWinningInModal ? 'bg-amber-400 text-gray-900 border-amber-300' : 'bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700'
                  }`}
                >
                  <Star className={`w-3.5 h-3.5 ${onlyWinningInModal ? 'fill-gray-900 text-gray-900' : 'text-amber-400'}`} />
                  {onlyWinningInModal ? 'Semua File' : 'Hanya Berbintang'}
                </button>
                <button onClick={() => setDrillDownModal(null)} className="text-gray-400 hover:text-white bg-gray-800 p-2 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 md:p-6 overflow-y-auto divide-y divide-gray-100 flex-1 bg-gray-50/40">
              {drillDownModal.items
                .filter(file => !onlyWinningInModal || winningFilesMap[file.fileKey]?.isWinning)
                .map((file, idx) => {
                  const fileWinInfo = winningFilesMap[file.fileKey] || { isWinning: false, catatan: '' };
                  return (
                    <div key={file.fileKey || idx} className={`py-3.5 px-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg transition-colors ${fileWinInfo.isWinning ? 'bg-amber-50/50 hover:bg-amber-50/80' : 'hover:bg-white'}`}>
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <button
                          onClick={() => saveFileWinningToSheet(file, !fileWinInfo.isWinning, fileWinInfo.catatan)}
                          title="Tandai file video ini sebagai Bagus / Winning"
                          className="mt-1 focus:outline-none shrink-0"
                        >
                          <Star className={`w-5 h-5 transition-transform active:scale-125 ${fileWinInfo.isWinning ? 'fill-amber-400 text-amber-400' : 'text-gray-300 hover:text-amber-300'}`} />
                        </button>

                        <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                          {idx + 1}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-gray-900 text-sm break-all">{file.name}</p>
                            {savingFileKey === file.fileKey && (
                              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                <Check className="w-3 h-3" /> Tersimpan
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className="text-xs text-gray-500 font-medium">{file.owner}</span>
                            <span className="text-gray-300">•</span>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                              String(file.status).includes('Belum') ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}>
                              {file.status}
                            </span>
                          </div>

                          <input
                            type="text"
                            defaultValue={fileWinInfo.catatan || ''}
                            placeholder="Catatan file ini (Enter u/ simpan ke Data_Winning_Files)..."
                            onBlur={(e) => {
                              if (e.target.value !== (fileWinInfo.catatan || '')) {
                                saveFileWinningToSheet(file, fileWinInfo.isWinning, e.target.value);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.target.blur();
                            }}
                            className="mt-2 bg-white border border-gray-200 focus:border-amber-400 text-gray-700 text-xs rounded-md px-2.5 py-1 w-full max-w-md focus:outline-none"
                          />
                        </div>
                      </div>

                      {file.url && (
                        <a 
                          href={file.url} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors shrink-0"
                        >
                          Buka File <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  );
                })}
            </div>

            <div className="px-6 py-3 bg-white border-t border-gray-200 flex justify-between items-center shrink-0">
              <span className="text-xs text-gray-500 font-semibold">
                ⭐ {drillDownModal.items.filter(f => winningFilesMap[f.fileKey]?.isWinning).length} file ditandai bagus pada daftar ini
              </span>
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
                  <p className="text-xs text-emerald-100">AI membaca data asli Google Sheets di web Anda untuk membuat materi PPT / evaluasi</p>
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
                placeholder="Tanya AI soal data di layar ini..."
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
              <button onClick={() => setBotReport(null)} className="w-full mt-2 bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 rounded-xl transition-colors shadow-md">Tutup Laporan</button>
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
                  {analysisResult?.split('\n').map((line, i) => (
                    <p key={i} className="text-gray-700 leading-relaxed mb-2">{line.replace(/\*\*/g, '')}</p>
                  ))}
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
            onClick={fetchData}
            disabled={loading}
            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-lg text-xs md:text-sm font-bold flex items-center gap-1.5 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} /> Sinkron Sheets
          </button>
          <button 
            onClick={() => { setIsAiAssistantOpen(true); if (!aiResponse) askAiAboutDashboard("Buatkan ringkasan laporan eksekutif dari data web saat ini"); }}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg text-xs md:text-sm font-bold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Sparkles className="w-4 h-4" /> Tanya AI
          </button>
          <button 
            onClick={() => window.print()}
            className="bg-gray-900 hover:bg-gray-800 text-white px-3.5 py-2 rounded-lg text-xs md:text-sm font-bold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Printer className="w-4 h-4" /> Cetak PDF
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
              <p className="text-gray-500 mt-1">
                Nama produk diambil dari <span className="font-semibold text-gray-700">Id_Induk_Barang (Project)</span>, Tanggal Mentahan dari <span className="font-semibold text-gray-700">Kolom N (FILE_ASSET)</span>, & Upload dari sheet <span className="font-semibold text-gray-700">Publish</span>.
              </p>
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

          {/* 1. FILTER TERPADU DINAMIS DARI SHEET */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 print:hidden">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Bulan</label>
              <select value={rekapBulan} onChange={(e) => setRekapBulan(e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg block w-full p-2.5 font-semibold">
                {availableMonthsRekap.map(m => (
                  <option key={m} value={m}>{formatIsoMonthLabel(m)}</option>
                ))}
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
                {availableProductsRekap.map(prod => (
                  <option key={prod} value={prod}>{prod === 'Semua' ? '📦 Semua Produk' : prod}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Kreator / Editor / Uploader</label>
              <select value={rekapTim} onChange={(e) => setRekapTim(e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg block w-full p-2.5 font-semibold">
                {availableTeamsRekap.map(t => (
                  <option key={t} value={t}>{t === 'Semua' ? '👥 Semua Tim & Akun' : t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 2. TIGA KARTU TOTAL SESUAI FILTER */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div 
              onClick={() => openRealFilesModal(
                rekapProduk === 'Semua' ? `Semua Produk (${rekapBulan})` : rekapProduk,
                'Mentahan (Raw_Asset)',
                aggregatedProducts.flatMap(p => p.rawFiles)
              )}
              className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex justify-between items-center cursor-pointer hover:border-blue-400 hover:shadow-md transition-all group"
            >
              <div>
                <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">1. Total Mentahan (Raw_Asset)</p>
                <h3 className="text-3xl font-black text-gray-900 mt-1 group-hover:text-blue-600 transition-colors">
                  {loading ? '...' : totalMentahanRekap} <span className="text-sm font-semibold text-gray-400">file (Klik buka)</span>
                </h3>
                <p className="text-xs text-gray-500 mt-1">{totalBelumDipakaiRekap} belum dipakai • {totalDipakaiRekap} dipakai</p>
              </div>
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl font-bold text-xs">Kolom N</div>
            </div>

            <div 
              onClick={() => openRealFilesModal(
                rekapProduk === 'Semua' ? `Semua Produk (${rekapBulan})` : rekapProduk,
                'Video Final (Klip_Vidio)',
                aggregatedProducts.flatMap(p => p.klipFiles)
              )}
              className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex justify-between items-center cursor-pointer hover:border-amber-400 hover:shadow-md transition-all group"
            >
              <div>
                <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">2. Video Final (Klip_Vidio)</p>
                <h3 className="text-3xl font-black text-gray-900 mt-1 group-hover:text-amber-600 transition-colors">
                  {loading ? '...' : totalFinalRekap} <span className="text-sm font-semibold text-gray-400">klip selesai (Klik)</span>
                </h3>
                <p className="text-xs text-gray-500 mt-1">Berdasarkan Tanggal_Selesai di Klip_Vidio</p>
              </div>
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl font-bold text-xs">Editor</div>
            </div>

            <div 
              onClick={() => openRealFilesModal(
                rekapProduk === 'Semua' ? `Semua Produk (${rekapBulan})` : rekapProduk,
                'Video Terupload (Publish)',
                aggregatedProducts.flatMap(p => p.uploadFiles)
              )}
              className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex justify-between items-center cursor-pointer hover:border-emerald-400 hover:shadow-md transition-all group"
            >
              <div>
                <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">3. Total Upload (Sheet Publish)</p>
                <h3 className="text-3xl font-black text-gray-900 mt-1 group-hover:text-emerald-600 transition-colors">
                  {loading ? '...' : totalUploadRekap} <span className="text-sm font-semibold text-gray-400">tayang (Klik)</span>
                </h3>
                <p className="text-xs text-emerald-600 font-semibold mt-1">Target: 5 Akun × 3 Video (15/hari)</p>
              </div>
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl font-bold text-xs">Publish</div>
            </div>
          </div>

          {/* 3. DUA TABEL UTAMA */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* TABEL KIRI: PERINGKAT PER PRODUK */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between sm:items-center gap-2 bg-gray-50">
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">Peringkat per Produk ({aggregatedProducts.length} Produk)</h3>
                  <p className="text-xs text-gray-500">Klik ⭐ produk atau klik angka jumlah untuk menandai ⭐ per file video</p>
                </div>
                <div className="flex items-center gap-1 text-xs print:hidden">
                  <span className="text-gray-500 font-semibold mr-1">Urutkan:</span>
                  <button onClick={() => setSortBy('mentahan')} className={`px-2 py-1 rounded font-bold ${sortBy === 'mentahan' ? 'bg-blue-600 text-white' : 'bg-white border text-gray-600'}`}>Mentahan</button>
                  <button onClick={() => setSortBy('videoFinal')} className={`px-2 py-1 rounded font-bold ${sortBy === 'videoFinal' ? 'bg-amber-600 text-white' : 'bg-white border text-gray-600'}`}>Edit</button>
                  <button onClick={() => setSortBy('upload')} className={`px-2 py-1 rounded font-bold ${sortBy === 'upload' ? 'bg-emerald-600 text-white' : 'bg-white border text-gray-600'}`}>Upload</button>
                </div>
              </div>
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="sticky top-0 bg-gray-50 z-10">
                    <tr className="border-b border-gray-200 text-gray-600 text-xs uppercase">
                      <th className="py-3 px-4 font-bold">Nama Produk & Catatan Winning</th>
                      <th className="py-3 px-3 font-bold text-center text-blue-700">Mentahan</th>
                      <th className="py-3 px-3 font-bold text-center text-amber-700">Video Final</th>
                      <th className="py-3 px-3 font-bold text-center text-emerald-700">Upload</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loading && aggregatedProducts.length === 0 ? (
                      <tr><td colSpan="4" className="py-12 text-center text-gray-400 font-semibold">Menarik & menggabungkan data dari Google Sheets...</td></tr>
                    ) : aggregatedProducts.length === 0 ? (
                      <tr><td colSpan="4" className="py-8 text-center text-gray-400 font-semibold">Tidak ada data produk sesuai filter.</td></tr>
                    ) : (
                      aggregatedProducts.map((item) => (
                        <tr key={item.produk} className={`hover:bg-gray-50 ${item.isWinning || item.starredFilesCount > 0 ? 'bg-amber-50/20' : ''}`}>
                          <td className="py-3 px-4">
                            <div className="flex items-start gap-2.5">
                              <button 
                                onClick={() => saveProductWinningToSheet(item, !item.isWinning, item.catatan)}
                                title="Klik untuk tandai Produk Bagus & simpan ke Data_Winning_Web"
                                className="focus:outline-none mt-0.5"
                              >
                                <Star className={`w-4 h-4 transition-colors ${item.isWinning ? 'fill-amber-400 text-amber-400' : 'text-gray-300 hover:text-amber-300'}`} />
                              </button>
                              <div className="w-full">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-bold text-gray-900">{item.produk}</p>
                                  {item.starredFilesCount > 0 && (
                                    <span className="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded-full">
                                      ⭐ {item.starredFilesCount} file bagus
                                    </span>
                                  )}
                                  {savingProductKey === item.produk && (
                                    <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5 bg-emerald-50 px-1.5 py-0.5 rounded">
                                      <Check className="w-3 h-3" /> Tersimpan
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-gray-400 font-medium block mb-1.5">
                                  {Array.from(item.creators).slice(0, 3).join(', ') || 'Tim'} • Sisa {item.belumDipakai} raw
                                </span>
                                <input
                                  type="text"
                                  defaultValue={item.catatan || ''}
                                  placeholder="Tulis catatan winning (Enter u/ simpan)..."
                                  onBlur={(e) => {
                                    if (e.target.value !== (item.catatan || '')) {
                                      saveProductWinningToSheet(item, item.isWinning, e.target.value);
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') e.target.blur();
                                  }}
                                  className="bg-gray-50 focus:bg-white border border-gray-200 focus:border-amber-400 text-gray-700 text-[11px] rounded px-2 py-1 w-full max-w-[230px] focus:outline-none print:border-none print:bg-transparent print:p-0"
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center bg-blue-50/30">
                            <button 
                              onClick={() => openRealFilesModal(item.produk, 'Mentahan (Raw_Asset)', item.rawFiles)}
                              className="font-black text-blue-600 hover:bg-blue-100 px-2.5 py-1 rounded-lg underline decoration-dotted underline-offset-4 transition-colors"
                            >
                              {item.mentahan}
                            </button>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button 
                              onClick={() => openRealFilesModal(item.produk, 'Video Final (Klip_Vidio)', item.klipFiles)}
                              className="font-black text-amber-600 hover:bg-amber-100 px-2.5 py-1 rounded-lg underline decoration-dotted underline-offset-4 transition-colors"
                            >
                              {item.videoFinal}
                            </button>
                          </td>
                          <td className="py-3 px-3 text-center bg-emerald-50/30">
                            <button 
                              onClick={() => openRealFilesModal(item.produk, 'Video Terupload (Publish)', item.uploadFiles)}
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

            {/* TABEL KANAN: TRACKING HARIAN */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">Tracking Harian ({aggregatedDaily.length} Tanggal Aktif)</h3>
                  <p className="text-xs text-gray-500">Klik angka harian untuk membuka & memberi bintang pada file di tanggal tersebut</p>
                </div>
              </div>
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="sticky top-0 bg-gray-50 z-10">
                    <tr className="border-b border-gray-200 text-gray-600 text-xs uppercase">
                      <th className="py-3 px-4 font-bold">Tanggal</th>
                      <th className="py-3 px-3 font-bold text-center">Mentahan</th>
                      <th className="py-3 px-3 font-bold text-center">Diedit</th>
                      <th className="py-3 px-3 font-bold text-center">Upload</th>
                      <th className="py-3 px-4 font-bold text-right">Status Target</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loading && aggregatedDaily.length === 0 ? (
                      <tr><td colSpan="5" className="py-12 text-center text-gray-400 font-semibold">Menghitung riwayat harian dari Google Sheets...</td></tr>
                    ) : aggregatedDaily.length === 0 ? (
                      <tr><td colSpan="5" className="py-8 text-center text-gray-400 font-semibold">Tidak ada aktivitas pada filter tanggal/bulan ini.</td></tr>
                    ) : (
                      aggregatedDaily.map((day) => {
                        const isTargetMet = day.upload >= day.target;
                        return (
                          <tr key={day.tanggal} className="hover:bg-gray-50">
                            <td className="py-3 px-4 font-bold text-gray-900">{day.labelTanggal}</td>
                            <td className="py-3 px-3 text-center">
                              <button 
                                onClick={() => openRealFilesModal(`Tanggal ${day.labelTanggal}`, 'Mentahan (Raw_Asset)', day.rawFiles)}
                                className="font-semibold text-blue-600 hover:bg-blue-50 px-2 py-0.5 rounded underline decoration-dotted"
                              >
                                {day.mentahan}
                              </button>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <button 
                                onClick={() => openRealFilesModal(`Tanggal ${day.labelTanggal}`, 'Video Final (Klip_Vidio)', day.klipFiles)}
                                className="font-semibold text-amber-600 hover:bg-amber-50 px-2 py-0.5 rounded underline decoration-dotted"
                              >
                                {day.diedit}
                              </button>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <button 
                                onClick={() => openRealFilesModal(`Tanggal ${day.labelTanggal}`, 'Video Terupload (Publish)', day.uploadFiles)}
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
                      })
                    )}
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
      {/* HALAMAN 3: EVALUASI PELANGGARAN                                           */}
      {/* ========================================================================= */}
      {activeMenu === 'pelanggaran' && (
        <div className="p-4 md:p-8 max-w-[1400px] mx-auto animate-in fade-in duration-300">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-red-700 flex items-center gap-2">
              <ShieldAlert className="w-6 h-6" /> Evaluasi Video Pelanggaran
            </h2>
            <p className="text-gray-500 mt-1">Catat teguran algoritma TikTok, tambah jenis pelanggaran baru kapan saja, dan upload banyak bukti screenshot sekaligus.</p>
          </div>

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