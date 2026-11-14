import { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, Video, Eye, RefreshCw, ExternalLink, Edit3, Sparkles, 
  LayoutDashboard, BarChart2,
  Filter, Zap, Flame, Rocket, ChevronLeft, ChevronRight, PlayCircle, 
  X, AlertTriangle, CheckCircle2, ServerCrash, BrainCircuit,
  ShieldAlert, Star, Plus, Image as ImageIcon, FolderOpen, Send, Printer, Trash2, Check, Calendar, Activity, ChevronUp, ChevronDown,
  Play, Smartphone
} from 'lucide-react';
import { originalUrlForFypRow, originalUrlForPublish } from '../server/klip-match.js';
import { buildTikTokEmbedUrl, canPlayTikTokUrl, inspectTikTokUrl } from '../server/tiktok-url.js';
import SearchBox from './SearchBox.jsx';
import { useDebouncedQuery } from './useDebouncedQuery.js';
import {
  fileListSearchFields,
  filterBySearch,
  fypRowSearchFields,
  klipSearchFields,
  matchesSearchQuery,
  publishSearchFields,
  rawAssetSearchFields,
} from './search.js';

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

const normalizePersonName = (nameStr) => {
  if (!nameStr) return '';
  const s = String(nameStr).trim();
  if (!s || /^AKN_/i.test(s)) return s.toUpperCase();
  return s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

const normalizeDateToIso = (dateVal) => {
  if (!dateVal) return '';
  const s = String(dateVal).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const slashMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
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

const formatShortMonthTitle = (ym) => {
  if (!ym || ym === 'Tanpa Tanggal') return 'Tanpa Tanggal';
  const [yr, mo] = ym.split('-');
  const d = new Date(parseInt(yr, 10), parseInt(mo, 10) - 1, 1);
  if (isNaN(d.getTime())) return ym;
  return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
};

const getFypFileKey = (row) => {
  const identity = String(row?.Id_Klip || row?.Link_Postingan || '').trim();
  return identity ? `FYP__${identity}` : '';
};

const getFypFileObj = (row) => ({
  fileKey: getFypFileKey(row),
  kategori: 'Laporan FYP',
  produk: row?.Induk_Barang || '',
  name: row?.Nama_File || row?.Induk_Barang || '',
  url: row?.Link_Postingan || ''
});

const getFypRowKey = (row) => {
  const fileKey = getFypFileKey(row);
  if (fileKey) return fileKey;
  return [
    'fyp-unkeyed',
    row?.Induk_Barang || '',
    row?.Nama_Akun || row?.Id_Akun || '',
    row?.Tanggal_Upload || '',
    row?.View || '',
    row?.Video_FYP || ''
  ].join('__');
};

const APPS_SCRIPT_ENDPOINT = '/api/apps-script';

function createClientId(suffix) {
  const stamp = Date.now();
  return suffix === undefined ? stamp : `${stamp}_${suffix}`;
}

async function requestGemini(prompt, generationConfig) {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      temperature: generationConfig.temperature,
      maxOutputTokens: generationConfig.maxOutputTokens,
    }),
  });
  try {
    return { response, result: await response.json() };
  } catch {
    return { response, result: null };
  }
}

function geminiFailureMessage(result) {
  const message = typeof result?.message === 'string' ? result.message.trim() : '';
  const detail = typeof result?.detail === 'string' ? result.detail.trim() : '';
  if (message && detail && message !== detail) return `${message}\n${detail}`;
  return message || detail;
}

const TIKTOK_RESOLVE_ENDPOINT = '/api/tiktok-resolve';

function safeHttpUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    if (url.username || url.password) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function fileLinkHp(row) {
  return safeHttpUrl(row?.linkHp || row?.Link_HP || row?.link_hp || '');
}

function FileLinkActions({ file, onPlay }) {
  const pageUrl = safeHttpUrl(file?.url);
  const linkHp = safeHttpUrl(file?.linkHp);
  const tiktok = inspectTikTokUrl(pageUrl).ok;
  const playable = canPlayTikTokUrl(pageUrl);
  if (!pageUrl && !linkHp) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
      {playable && (
        <button
          type="button"
          onClick={() => onPlay(file.name, pageUrl, {
            showCartNote: file?.kategori === 'Video Terupload (Publish)',
            klipId: file?.klipId || '',
          })}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
        >
          <Play className="w-3.5 h-3.5" fill="currentColor" /> Play
        </button>
      )}
      {pageUrl && !tiktok && (
        <a
          href={pageUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
        >
          OneDrive <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
      {pageUrl && tiktok && (
        <a
          href={pageUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-800 text-xs font-bold rounded-lg border border-gray-300 shadow-sm transition-colors"
        >
          Buka di TikTok <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
      {linkHp && (
        <a
          href={linkHp}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
        >
          <Smartphone className="w-3.5 h-3.5" /> Buka di HP
        </a>
      )}
    </div>
  );
}

function TikTokPlayerModal({ player, onClose }) {
  if (!player) return null;
  const fallback = safeHttpUrl(player.pageUrl);
  const originalUrl = player.showCartNote ? safeHttpUrl(player.originalUrl) : '';

  return (
    <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4 print:hidden">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-y-auto flex flex-col max-h-[92vh]">
        <div className="px-5 py-4 bg-gray-900 text-white flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="font-bold text-base leading-tight">Putar di Dashboard</h3>
            <p className="text-xs text-gray-300 mt-1 break-words">{player.title || 'Video TikTok'}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-300 hover:text-white bg-gray-800 p-2 rounded-full shrink-0" aria-label="Tutup pemutar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-black min-h-[240px] overflow-hidden flex items-center justify-center">
          {player.status === 'loading' && (
            <p className="text-sm font-semibold text-white px-6 text-center">Membaca tautan TikTok...</p>
          )}
          {player.status === 'error' && (
            <div className="px-6 py-8 text-center">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
              <p className="text-sm font-semibold text-white leading-relaxed">{player.message}</p>
            </div>
          )}
          {player.status === 'ready' && player.embedUrl && (
            <iframe
              src={player.embedUrl}
              title={player.title ? `Pemutar TikTok: ${player.title}` : 'Pemutar TikTok'}
              className={`w-full aspect-[9/16] bg-black ${player.showCartNote ? 'max-h-[min(70vh,calc(92vh-22rem))]' : 'max-h-[70vh]'}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          )}
        </div>

        {player.showCartNote && (
          <p className="px-5 pt-3 text-xs text-gray-500 leading-relaxed">
            Video berkeranjang kuning hanya bisa diputar di aplikasi TikTok HP. Kalau layar hitam, pakai tombol di bawah.
          </p>
        )}

        <div className="px-5 py-4 bg-white border-t border-gray-200 flex flex-col gap-2 shrink-0">
          {fallback && (
            <a
              href={fallback}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white hover:bg-gray-50 text-gray-800 text-sm font-bold rounded-xl border border-gray-300"
            >
              Buka di TikTok <ExternalLink className="w-4 h-4" />
            </a>
          )}
          {originalUrl && (
            <a
              href={originalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl"
            >
              Putar file asli (OneDrive) <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button type="button" onClick={onClose} className="px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold rounded-xl">
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [activeMenu, setActiveMenu] = useState('pipeline'); 

  // --- STATE DATA ASLI DARI GOOGLE SHEETS ---
  const [data, setData] = useState([]);
  const [rawAssets, setRawAssets] = useState([]);
  const [klipVideos, setKlipVideos] = useState([]);
  const [publishVideos, setPublishVideos] = useState([]);
  const [masterAccounts, setMasterAccounts] = useState([
    { id: 'AKN_001', nama: 'Jual Kawat', label: 'AKN_001 - Jual Kawat', pemegang: 'Deni' },
    { id: 'AKN_002', nama: 'Produk Andalan Kita', label: 'AKN_002 - Produk Andalan Kita', pemegang: 'Rizal' },
    { id: 'AKN_003', nama: 'Grosir Hitam', label: 'AKN_003 - Grosir Hitam', pemegang: 'Isan' },
    { id: 'AKN_004', nama: 'Melifarida Toserba', label: 'AKN_004 - Melifarida Toserba', pemegang: '' },
    { id: 'AKN_005', nama: 'Pasar Digitals', label: 'AKN_005 - Pasar Digitals', pemegang: 'Rizal' },
    { id: 'AKN_006', nama: 'Hasil Seleksi', label: 'AKN_006 - Hasil Seleksi', pemegang: '' },
  ]);
  const [productGroups, setProductGroups] = useState({});
  const [loading, setLoading] = useState(true);
  const [, setError] = useState(null);
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

  // --- STATE KONTROL PANEL KOTAK BULANAN (PER 3 BULAN & HIDE/SHOW) ---
  const [isPowerPanelOpen, setIsPowerPanelOpen] = useState(true);
  const [monthViewLimit, setMonthViewLimit] = useState(3); // 3, 6, atau 999 (Semua)
  const [monthPageIndex, setMonthPageIndex] = useState(0);

  // --- STATE PENYIMPANAN BINTANG PER PRODUK & PER FILE ---
  const [winningWebMap, setWinningWebMap] = useState({});
  const [savingProductKey, setSavingProductKey] = useState(null);
  const [winningFilesMap, setWinningFilesMap] = useState({});
  const [savingFileKey, setSavingFileKey] = useState(null);
  const [onlyWinningInModal, setOnlyWinningInModal] = useState(false);

  // --- STATE DRILL-DOWN MODAL DAFTAR FILE ASLI ---
  const [drillDownModal, setDrillDownModal] = useState(null);
  const [tiktokPlayer, setTiktokPlayer] = useState(null);

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

  // STATE FILTER & PAGINATION ANALITIK FYP
  const [filterBulan, setFilterBulan] = useState('Semua');
  const [filterAkun, setFilterAkun] = useState('Semua');
  const [filterFyp, setFilterFyp] = useState('Semua');
  const [onlyWinningFyp, setOnlyWinningFyp] = useState(false);
  const [fypCatatanDraft, setFypCatatanDraft] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [fypQuery, debouncedFypQuery, setFypQuery] = useDebouncedQuery();
  const [pipelineQuery, debouncedPipelineQuery, setPipelineQuery] = useDebouncedQuery();
  const [fileListQuery, debouncedFileListQuery, setFileListQuery] = useDebouncedQuery();
  const itemsPerPage = 20;

  // --- FUNGSI TARIK SELURUH DATA DARI GOOGLE SHEETS ---
  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch(APPS_SCRIPT_ENDPOINT);
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
        if (Array.isArray(result.masterAccounts) && result.masterAccounts.length > 0) {
          setMasterAccounts(result.masterAccounts);
        }
        if (result.productGroups) setProductGroups(result.productGroups);

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
    } catch {
      setError("Terjadi kesalahan jaringan.");
    }
    setLoading(false);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const filterSignature = `${filterBulan}|${filterAkun}|${filterFyp}|${onlyWinningFyp ? '1' : '0'}|${encodeURIComponent(debouncedFypQuery)}`;
  const [pageFilter, setPageFilter] = useState(filterSignature);
  if (pageFilter !== filterSignature) {
    setPageFilter(filterSignature);
    setCurrentPage(1);
  }

  const accountLookup = useMemo(() => {
    const map = {};
    masterAccounts.forEach(acc => {
      map[acc.id.toUpperCase()] = acc.label;
    });
    return map;
  }, [masterAccounts]);

  const getWinningKey = (produkName) => `${rekapBulan}__${produkName}`;

  const getProductWinningInfo = (produkName) => {
    const specificKey = `${rekapBulan}__${produkName}`;
    if (winningWebMap[specificKey]) return winningWebMap[specificKey];
    if (winningWebMap[`Semua__${produkName}`]) return winningWebMap[`Semua__${produkName}`];
    if (winningWebMap[`GLOBAL__${produkName}`]) return winningWebMap[`GLOBAL__${produkName}`];
    return { isWinning: false, catatan: '' };
  };

  const saveProductWinningToSheet = async (item, newIsWinning, newCatatan) => {
    const key = getWinningKey(item.produk);
    setSavingProductKey(item.produk);

    setWinningWebMap(prev => ({
      ...prev,
      [key]: { isWinning: newIsWinning, catatan: newCatatan },
      [`GLOBAL__${item.produk}`]: { isWinning: newIsWinning, catatan: newCatatan }
    }));

    try {
      await fetch(APPS_SCRIPT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  const saveFileWinningToSheet = async (fileObj, newIsWinning, newCatatan) => {
    const fKey = fileObj.fileKey;
    setSavingFileKey(fKey);

    setWinningFilesMap(prev => ({
      ...prev,
      [fKey]: { isWinning: newIsWinning, catatan: newCatatan }
    }));

    try {
      await fetch(APPS_SCRIPT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  // --- DAFTAR PILIHAN FILTER DINAMIS ---
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

  const { personOptions, accountOptions } = useMemo(() => {
    const peopleMap = {};
    const addPerson = (val) => {
      if (!val) return;
      const clean = normalizePersonName(val);
      if (!clean || /^AKN_/i.test(clean) || clean === 'Tim Riset' || clean === 'Editor' || clean === 'Publisher') return;
      peopleMap[clean.toLowerCase()] = clean;
    };

    rawAssets.forEach(r => addPerson(r.creator));
    klipVideos.forEach(k => addPerson(k.editor));
    publishVideos.forEach(p => addPerson(p.uploader));
    masterAccounts.forEach(a => addPerson(a.pemegang));

    return {
      personOptions: Object.values(peopleMap).sort(),
      accountOptions: masterAccounts
    };
  }, [rawAssets, klipVideos, publishVideos, masterAccounts]);

  // =========================================================================
  // KOTAK POWER & ESTIMASI KEKUATAN SELURUH BULAN (MENTAHAN, PRODUKSI, PUBLISH)
  // =========================================================================
  const monthlyPowerCards = useMemo(() => {
    const map = {};
    const ensureMonth = (ym) => {
      if (!ym || ym === 'Tanpa Tanggal') return null;
      if (!map[ym]) {
        const [yr, mo] = ym.split('-');
        const daysInMonth = new Date(parseInt(yr, 10), parseInt(mo, 10), 0).getDate() || 30;
        map[ym] = {
          month: ym,
          title: formatShortMonthTitle(ym),
          daysInMonth,
          mentahan: 0,
          mentahanBelumDipakai: 0,
          produksi: 0,
          publish: 0,
          activeDatesSet: new Set(),
          rawDatesSet: new Set(),
          klipDatesSet: new Set(),
          pubDatesSet: new Set(),
          rawFiles: [],
          klipFiles: [],
          uploadFiles: []
        };
      }
      return map[ym];
    };

    rawAssets.forEach((r, idx) => {
      const mProduk = rekapProduk === 'Semua' || r.produk === rekapProduk;
      const mTim = rekapTim === 'Semua' || normalizePersonName(r.creator).toLowerCase() === rekapTim.toLowerCase();
      if (!mProduk || !mTim) return;
      if (!matchesSearchQuery(debouncedPipelineQuery, rawAssetSearchFields(r))) return;

      const m = ensureMonth(r.month);
      if (!m) return;
      m.mentahan += 1;
      if (r.status === 'Belum Dipakai') m.mentahanBelumDipakai += 1;
      if (r.date) {
        m.activeDatesSet.add(r.date);
        m.rawDatesSet.add(r.date);
      }
      m.rawFiles.push({
        fileKey: `RAW__${r.id || r.fileName || idx}`,
        kategori: 'Mentahan (Raw_Asset)',
        produk: r.produk,
        name: `${r.fileName} (${r.produk})`,
        status: r.status || 'Mentahan',
        owner: `${normalizePersonName(r.creator) || 'Riset'} • ${r.date || ''}`,
        url: r.url || 'https://onedrive.live.com/',
        linkHp: fileLinkHp(r)
      });
    });

    klipVideos.forEach((k, idx) => {
      const mProduk = rekapProduk === 'Semua' || k.produk === rekapProduk;
      const mTim = rekapTim === 'Semua' || 
        normalizePersonName(k.editor).toLowerCase() === rekapTim.toLowerCase() || 
        (k.akunTarget || '').toUpperCase() === rekapTim.toUpperCase();
      if (!mProduk || !mTim) return;
      if (!matchesSearchQuery(debouncedPipelineQuery, klipSearchFields(k, accountLookup[(k.akunTarget || '').toUpperCase()]))) return;

      const m = ensureMonth(k.month);
      if (!m) return;
      m.produksi += 1;
      if (k.date) {
        m.activeDatesSet.add(k.date);
        m.klipDatesSet.add(k.date);
      }
      m.klipFiles.push({
        fileKey: `KLIP__${k.id || k.fileName || idx}`,
        kategori: 'Video Final (Klip_Vidio)',
        produk: k.produk,
        name: `${k.fileName} (${k.produk})`,
        status: `Selesai Edit (${k.date || '-'})`,
        owner: `Editor: ${normalizePersonName(k.editor) || '-'}`,
        url: k.url || 'https://onedrive.live.com/',
        linkHp: fileLinkHp(k)
      });
    });

    const sourcePub = publishVideos.length > 0 ? publishVideos : data.map((u, idx) => ({
      id: idx + 1,
      fileName: u.Induk_Barang || 'Video TikTok',
      url: u.Link_Postingan,
      date: u._isoDate,
      month: u._month,
      akun: u.Id_Akun || '',
      uploader: normalizePersonName(u.Nama_Akun || u.Id_Akun || 'Publisher'),
      produk: String(u.Induk_Barang || 'Tanpa Produk').trim(),
      status: u.Video_FYP || 'Sukses',
      klipId: u.Id_Klip || ''
    }));

    sourcePub.forEach((p, idx) => {
      const mProduk = rekapProduk === 'Semua' || p.produk === rekapProduk;
      const mTim = rekapTim === 'Semua' || 
        normalizePersonName(p.uploader).toLowerCase() === rekapTim.toLowerCase() || 
        (p.akun || '').toUpperCase() === rekapTim.toUpperCase();
      if (!mProduk || !mTim) return;
      if (!matchesSearchQuery(debouncedPipelineQuery, publishSearchFields(p, accountLookup[(p.akun || '').toUpperCase()] || p.akunLabel))) return;

      const m = ensureMonth(p.month);
      if (!m) return;
      m.publish += 1;
      if (p.date) {
        m.activeDatesSet.add(p.date);
        m.pubDatesSet.add(p.date);
      }
      const fullAkunLabel = accountLookup[(p.akun || '').toUpperCase()] || p.akunLabel || p.akun || '-';
      m.uploadFiles.push({
        fileKey: `PUBLISH__${p.id || p.url || idx}`,
        kategori: 'Video Terupload (Publish)',
        produk: p.produk,
        name: `${p.fileName} (${p.produk})`,
        status: `${p.status || 'Sukses'} (${p.date || '-'})`,
        owner: `${normalizePersonName(p.uploader) || 'Publisher'} (${fullAkunLabel})`,
        url: p.url || 'https://www.tiktok.com/',
        linkHp: fileLinkHp(p),
        klipId: p.klipId || ''
      });
    });

    const sortedMonths = Object.values(map).sort((a, b) => b.month.localeCompare(a.month));
    const latestMonthKey = sortedMonths[0]?.month || '';

    return sortedMonths.map(item => {
      const allDates = Array.from(item.activeDatesSet).sort();
      const maxDayNum = allDates.length > 0 ? parseInt(allDates[allDates.length - 1].split('-')[2], 10) : item.daysInMonth;
      const activeSpanDays = Math.max(maxDayNum, 1);
      const workDaysRaw = Math.max(item.rawDatesSet.size, 1);
      const workDaysKlip = Math.max(item.klipDatesSet.size, 1);
      const workDaysPub = Math.max(item.pubDatesSet.size, 1);

      const powerRawPerHari = (item.mentahan / workDaysRaw).toFixed(1);
      const powerKlipPerHari = (item.produksi / workDaysKlip).toFixed(1);
      const powerPubPerHari = (item.publish / workDaysPub).toFixed(1);

      // Hanya tampilkan Estimasi (~) untuk bulan terbaru yang sedang berjalan
      const isCurrentMonth = item.month === latestMonthKey && maxDayNum < item.daysInMonth - 2;
      const estRawBulanan = isCurrentMonth ? Math.round((item.mentahan / activeSpanDays) * item.daysInMonth) : item.mentahan;
      const estKlipBulanan = isCurrentMonth ? Math.round((item.produksi / activeSpanDays) * item.daysInMonth) : item.produksi;
      const estPubBulanan = isCurrentMonth ? Math.round((item.publish / activeSpanDays) * item.daysInMonth) : item.publish;

      const targetBerjalan = workDaysPub * 15;
      const powerPercentage = item.publish > 0 ? Math.round((item.publish / targetBerjalan) * 100) : 0;

      return {
        ...item,
        activeDaysCount: allDates.length,
        rawActiveDays: item.rawDatesSet.size,
        klipActiveDays: item.klipDatesSet.size,
        pubActiveDays: item.pubDatesSet.size,
        powerRawPerHari,
        powerKlipPerHari,
        powerPubPerHari,
        estRawBulanan,
        estKlipBulanan,
        estPubBulanan,
        isCurrentMonth,
        powerPercentage
      };
    });
  }, [rawAssets, klipVideos, publishVideos, data, rekapProduk, rekapTim, accountLookup, debouncedPipelineQuery]);

  // Potong kartu bulan sesuai pilihan tampilan (Per 3 Bulan, Per 6 Bulan, atau Semua)
  const totalMonthPages = Math.max(1, Math.ceil(monthlyPowerCards.length / monthViewLimit));
  const safeMonthPage = Math.min(monthPageIndex, totalMonthPages - 1);
  const visibleMonthlyCards = useMemo(() => {
    if (monthViewLimit >= 999) return monthlyPowerCards;
    const start = safeMonthPage * monthViewLimit;
    return monthlyPowerCards.slice(start, start + monthViewLimit);
  }, [monthlyPowerCards, monthViewLimit, safeMonthPage]);

  // --- FILTERING ITEM MENTAHAN, VIDEO FINAL & UPLOAD ---
  const filteredRawList = useMemo(() => {
    return rawAssets.filter(r => {
      const mBulan = rekapBulan === 'Semua' || r.month === rekapBulan;
      const mTanggal = !rekapTanggal || r.date === rekapTanggal;
      const mProduk = rekapProduk === 'Semua' || r.produk === rekapProduk;
      const mTim = rekapTim === 'Semua' || normalizePersonName(r.creator).toLowerCase() === rekapTim.toLowerCase();
      return mBulan && mTanggal && mProduk && mTim;
    });
  }, [rawAssets, rekapBulan, rekapTanggal, rekapProduk, rekapTim]);

  const filteredKlipList = useMemo(() => {
    return klipVideos.filter(k => {
      const mBulan = rekapBulan === 'Semua' || k.month === rekapBulan;
      const mTanggal = !rekapTanggal || k.date === rekapTanggal;
      const mProduk = rekapProduk === 'Semua' || k.produk === rekapProduk;
      const mTim = rekapTim === 'Semua' || 
        normalizePersonName(k.editor).toLowerCase() === rekapTim.toLowerCase() || 
        (k.akunTarget || '').toUpperCase() === rekapTim.toUpperCase();
      return mBulan && mTanggal && mProduk && mTim;
    });
  }, [klipVideos, rekapBulan, rekapTanggal, rekapProduk, rekapTim]);

  const filteredUploadList = useMemo(() => {
    const sourceList = publishVideos.length > 0 ? publishVideos : data.map((u, idx) => ({
      id: idx + 1,
      fileName: u.Induk_Barang || 'Video TikTok',
      url: u.Link_Postingan,
      date: u._isoDate,
      month: u._month,
      akun: u.Id_Akun || '',
      uploader: normalizePersonName(u.Nama_Akun || u.Id_Akun || 'Publisher'),
      produk: String(u.Induk_Barang || 'Tanpa Produk').trim(),
      status: u.Video_FYP || 'Sukses',
      klipId: u.Id_Klip || ''
    }));

    return sourceList.filter(p => {
      const mBulan = rekapBulan === 'Semua' || p.month === rekapBulan;
      const mTanggal = !rekapTanggal || p.date === rekapTanggal;
      const mProduk = rekapProduk === 'Semua' || p.produk === rekapProduk;
      const mTim = rekapTim === 'Semua' || 
        normalizePersonName(p.uploader).toLowerCase() === rekapTim.toLowerCase() || 
        (p.akun || '').toUpperCase() === rekapTim.toUpperCase();
      return mBulan && mTanggal && mProduk && mTim;
    });
  }, [publishVideos, data, rekapBulan, rekapTanggal, rekapProduk, rekapTim]);

  const visibleRawList = useMemo(
    () => filterBySearch(filteredRawList, debouncedPipelineQuery, rawAssetSearchFields),
    [filteredRawList, debouncedPipelineQuery]
  );
  const visibleKlipList = useMemo(
    () => filterBySearch(filteredKlipList, debouncedPipelineQuery, (k) => (
      klipSearchFields(k, accountLookup[(k.akunTarget || '').toUpperCase()])
    )),
    [filteredKlipList, debouncedPipelineQuery, accountLookup]
  );
  const visibleUploadList = useMemo(
    () => filterBySearch(filteredUploadList, debouncedPipelineQuery, (p) => (
      publishSearchFields(p, accountLookup[(p.akun || '').toUpperCase()] || p.akunLabel)
    )),
    [filteredUploadList, debouncedPipelineQuery, accountLookup]
  );

  // --- AGREGASI TABEL KIRI: REKAP PER PRODUK ---
  const aggregatedProducts = useMemo(() => {
    const map = {};
    const ensureProd = (prodName) => {
      const key = prodName || 'Tanpa Produk';
      if (!map[key]) {
        const winInfo = getProductWinningInfo(key);
        map[key] = {
          produk: key,
          groupLabel: productGroups[key] || '',
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

    visibleRawList.forEach((r, idx) => {
      const entry = ensureProd(r.produk);
      entry.mentahan += 1;
      if (r.status === 'Belum Dipakai') entry.belumDipakai += 1;
      else entry.dipakai += 1;
      const cleanCreator = normalizePersonName(r.creator);
      if (cleanCreator) entry.creators.add(cleanCreator);

      const fileKey = `RAW__${r.id || r.fileName || idx}`;
      if (winningFilesMap[fileKey]?.isWinning) entry.starredFilesCount += 1;

      entry.rawFiles.push({
        fileKey,
        kategori: 'Mentahan (Raw_Asset)',
        produk: r.produk,
        name: r.fileName || r.id,
        status: r.status || 'Mentahan',
        owner: `${cleanCreator || 'Riset'} • ${r.date || 'Tanpa Tanggal'}`,
        url: r.url || 'https://onedrive.live.com/',
        linkHp: fileLinkHp(r)
      });
    });

    visibleKlipList.forEach((k, idx) => {
      const entry = ensureProd(k.produk);
      entry.videoFinal += 1;
      const cleanEditor = normalizePersonName(k.editor);
      if (cleanEditor) entry.creators.add(cleanEditor);

      const fileKey = `KLIP__${k.id || k.fileName || idx}`;
      if (winningFilesMap[fileKey]?.isWinning) entry.starredFilesCount += 1;

      entry.klipFiles.push({
        fileKey,
        kategori: 'Video Final (Klip_Vidio)',
        produk: k.produk,
        name: k.fileName || k.id,
        status: `Selesai Edit (${k.date || '-'})`,
        owner: `Editor: ${cleanEditor || '-'} • ${accountLookup[(k.akunTarget || '').toUpperCase()] || k.akunTarget || ''}`,
        url: k.url || 'https://onedrive.live.com/',
        linkHp: fileLinkHp(k)
      });
    });

    visibleUploadList.forEach((p, idx) => {
      const entry = ensureProd(p.produk);
      entry.upload += 1;
      const cleanUploader = normalizePersonName(p.uploader);
      if (cleanUploader) entry.creators.add(cleanUploader);

      const fileKey = `PUBLISH__${p.id || p.url || idx}`;
      if (winningFilesMap[fileKey]?.isWinning) entry.starredFilesCount += 1;

      const fullAkunLabel = accountLookup[(p.akun || '').toUpperCase()] || p.akunLabel || p.akun || '-';

      entry.uploadFiles.push({
        fileKey,
        kategori: 'Video Terupload (Publish)',
        produk: p.produk,
        name: `${p.fileName} (${p.produk})`,
        status: `${p.status || 'Sukses'} (${p.date || '-'})`,
        owner: `${cleanUploader || 'Publisher'} • ${fullAkunLabel}`,
        url: p.url || 'https://www.tiktok.com/',
        linkHp: fileLinkHp(p),
        klipId: p.klipId || ''
      });
    });

    return Object.values(map)
      .filter(item => !onlyWinning || item.isWinning || item.starredFilesCount > 0)
      .sort((a, b) => b[sortBy] - a[sortBy]);
  }, [visibleRawList, visibleKlipList, visibleUploadList, winningWebMap, winningFilesMap, productGroups, accountLookup, rekapBulan, onlyWinning, sortBy]);

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

    visibleRawList.forEach((r, idx) => {
      const d = ensureDate(r.date);
      if (!d) return;
      d.mentahan += 1;
      d.rawFiles.push({
        fileKey: `RAW__${r.id || r.fileName || idx}`,
        kategori: 'Mentahan (Raw_Asset)',
        produk: r.produk,
        name: `${r.fileName} (${r.produk})`,
        status: r.status || 'Mentahan',
        owner: normalizePersonName(r.creator) || 'Riset',
        url: r.url || 'https://onedrive.live.com/',
        linkHp: fileLinkHp(r)
      });
    });

    visibleKlipList.forEach((k, idx) => {
      const d = ensureDate(k.date);
      if (!d) return;
      d.diedit += 1;
      d.klipFiles.push({
        fileKey: `KLIP__${k.id || k.fileName || idx}`,
        kategori: 'Video Final (Klip_Vidio)',
        produk: k.produk,
        name: `${k.fileName} (${k.produk})`,
        status: 'Selesai Edit',
        owner: `Editor: ${normalizePersonName(k.editor) || '-'}`,
        url: k.url || 'https://onedrive.live.com/',
        linkHp: fileLinkHp(k)
      });
    });

    visibleUploadList.forEach((p, idx) => {
      const d = ensureDate(p.date);
      if (!d) return;
      d.upload += 1;
      const fullAkunLabel = accountLookup[(p.akun || '').toUpperCase()] || p.akunLabel || p.akun || '-';
      d.uploadFiles.push({
        fileKey: `PUBLISH__${p.id || p.url || idx}`,
        kategori: 'Video Terupload (Publish)',
        produk: p.produk,
        name: `${p.fileName} (${p.produk})`,
        status: p.status || 'Sukses',
        owner: `${normalizePersonName(p.uploader) || 'Publisher'} (${fullAkunLabel})`,
        url: p.url || 'https://www.tiktok.com/',
        linkHp: fileLinkHp(p),
        klipId: p.klipId || ''
      });
    });

    return Object.values(map).sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  }, [visibleRawList, visibleKlipList, visibleUploadList, accountLookup]);

  const totalMentahanRekap = visibleRawList.length;
  const totalBelumDipakaiRekap = visibleRawList.filter(r => r.status === 'Belum Dipakai').length;
  const totalDipakaiRekap = totalMentahanRekap - totalBelumDipakaiRekap;
  const totalFinalRekap = visibleKlipList.length;
  const totalUploadRekap = visibleUploadList.length;
  const pipelineTotal = filteredRawList.length + filteredKlipList.length + filteredUploadList.length;
  const pipelineShown = totalMentahanRekap + totalFinalRekap + totalUploadRekap;

  const openRealFilesModal = (title, kategori, filesArray) => {
    if (!filesArray || filesArray.length === 0) return;
    setOnlyWinningInModal(false);
    setFileListQuery('');
    setDrillDownModal({
      title: `${kategori} — ${title}`,
      subtitle: `Klik bintang ⭐ pada baris file di bawah untuk menandai file video bagus (tersimpan ke Data_Winning_Files)`,
      items: filesArray
    });
  };

  const openTikTokPlayer = (title, pageUrl, options = {}) => {
    const safe = safeHttpUrl(pageUrl);
    const showCartNote = !!options.showCartNote;
    const originalUrl = showCartNote
      ? (options.fypRow
        ? originalUrlForFypRow(options.fypRow, publishVideos, klipVideos)
        : originalUrlForPublish({ klipId: options.klipId }, klipVideos))
      : '';
    const playerBase = {
      title: title || 'Video TikTok',
      pageUrl: safe,
      showCartNote,
      originalUrl,
    };
    const inspected = inspectTikTokUrl(safe);
    if (!inspected.ok) {
      setTiktokPlayer({
        ...playerBase,
        status: 'error',
        message: 'Tautan ini bukan tautan TikTok yang bisa diputar.',
      });
      return;
    }
    if (inspected.videoId) {
      setTiktokPlayer({
        ...playerBase,
        status: 'ready',
        videoId: inspected.videoId,
        embedUrl: buildTikTokEmbedUrl(inspected.videoId),
      });
      return;
    }

    const requestId = createClientId('tt');
    setTiktokPlayer({
      ...playerBase,
      status: 'loading',
      requestId,
    });

    const load = async () => {
      try {
        const response = await fetch(`${TIKTOK_RESOLVE_ENDPOINT}?url=${encodeURIComponent(safe)}`);
        let result = null;
        try {
          result = await response.json();
        } catch {
          result = null;
        }
        setTiktokPlayer((prev) => {
          if (!prev || prev.requestId !== requestId) return prev;
          if (!response.ok || !result?.videoId || !result?.embedUrl) {
            const message = typeof result?.message === 'string' ? result.message.trim() : '';
            return {
              ...prev,
              status: 'error',
              message: message || 'Gagal membaca tautan TikTok. Buka video langsung di TikTok.',
            };
          }
          return {
            ...prev,
            status: 'ready',
            videoId: result.videoId,
            embedUrl: result.embedUrl,
          };
        });
      } catch {
        setTiktokPlayer((prev) => {
          if (!prev || prev.requestId !== requestId) return prev;
          return {
            ...prev,
            status: 'error',
            message: 'Gagal menghubungi server untuk membaca tautan TikTok.',
          };
        });
      }
    };
    load();
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
        id: createClientId(i),
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
        id: createClientId(i),
        label: `SS Tambahan ${existingSS.length + i + 1}`,
        url: compressedBase64
      });
    }

    const updatedItem = { ...targetItem, screenshots: [...existingSS, ...addedSS] };
    setViolations(prev => prev.map(v => v.id === rowId ? updatedItem : v));
    e.target.value = '';

    try {
      await fetch(APPS_SCRIPT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      await fetch(APPS_SCRIPT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        await fetch(APPS_SCRIPT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update_violation', data: updatedEntry })
        });
      } catch {
        alert("Perubahan tampil di layar, namun gagal tersimpan ke Google Sheets.");
      }
      return;
    }

    const today = new Date().toLocaleDateString('id-ID');
    const newEntry = {
      id: createClientId(),
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
      await fetch(APPS_SCRIPT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_violation', data: newEntry })
      });
    } catch {
      alert("Gagal menyimpan ke Google Sheets, periksa koneksi internet Anda.");
    }
  };

  // --- FUNGSI ASISTEN AI PEMBACA DATA WEB & GENERATOR MATERI PPT/PDF ---
  const askAiAboutDashboard = async (customPrompt = null) => {
    const queryText = customPrompt || aiQuestion;
    if (!queryText.trim()) return;

    setIsAiThinking(true);
    setAiResponse('');

    const monthlyPowerSummary = monthlyPowerCards.map(m => 
      `${m.title}: Mentahan=${m.mentahan} (${m.powerRawPerHari}/hr, Est:${m.estRawBulanan}), Produksi=${m.produksi} (${m.powerKlipPerHari}/hr, Est:${m.estKlipBulanan}), Publish=${m.publish} (${m.powerPubPerHari}/hr, Power:${m.powerPercentage}%)`
    ).join(' | ');
    const topProdsText = aggregatedProducts.slice(0, 8).map(p => `${p.produk} (Raw:${p.mentahan}, Edit:${p.videoFinal}, Upload:${p.upload}, Bagus:${p.isWinning ? 'Ya' : 'Tidak'}, FileBerbintang:${p.starredFilesCount})`).join('; ');

    const dashboardContext = `
      Konteks Data Asli Web PromoOps Studio Saat Ini:
      - Filter Aktif: Bulan ${rekapBulan}, Tanggal ${rekapTanggal || 'Semua Hari'}, Produk ${rekapProduk}, Tim/Akun ${rekapTim}.
      - Rekap Power Kekuatan Seluruh Bulan: ${monthlyPowerSummary}.
      - Total Mentahan Terfilter: ${totalMentahanRekap} file (${totalBelumDipakaiRekap} belum dipakai, ${totalDipakaiRekap} sudah dipakai).
      - Total Video Final Terfilter: ${totalFinalRekap} klip.
      - Total Upload Terfilter: ${totalUploadRekap} video tayang (Target harian: 15 video/hari).
      - 8 Produk Teratas: ${topProdsText}.
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
      const { response, result } = await requestGemini(fullPrompt, { temperature: 0.7, maxOutputTokens: 2048 });
      if (response.status === 503) {
        setTimeout(() => {
          setAiResponse(
            `**RINGKASAN EKSEKUTIF & POWER BULANAN PROMOOPS STUDIO**\n\n` +
            `**1. Power Kekuatan per Bulan (Mentahan, Produksi, Publish)**\n` +
            monthlyPowerCards.map(m => `* **${m.title}:** Mentahan **${m.mentahan}** (${m.powerRawPerHari}/hr) • Produksi **${m.produksi}** (${m.powerKlipPerHari}/hr) • Publish **${m.publish}** (${m.powerPubPerHari}/hr — Power Target **${m.powerPercentage}%**)`).join('\n') +
            `\n\n**2. Peringkat Produk Terbanyak**\n` +
            `* Produk tertinggi dipimpin oleh **${aggregatedProducts[0]?.produk || '-'}** (${aggregatedProducts[0]?.mentahan || 0} mentahan, ${aggregatedProducts[0]?.videoFinal || 0} edit, ${aggregatedProducts[0]?.upload || 0} upload).\n` +
            `* Produk yang ditandai Bagus (⭐): **${aggregatedProducts.filter(p => p.isWinning || p.starredFilesCount > 0).map(p => `${p.produk} (${p.starredFilesCount} file berbintang)`).join(', ') || 'Belum ada'}**.`
          );
          setIsAiThinking(false);
        }, 600);
        return;
      }

      if (result?.text) {
        setAiResponse(result.text);
      } else {
        setAiResponse(
          `**RINGKASAN EKSEKUTIF LAPORAN PROMOOPS STUDIO (${rekapBulan})**\n\n` +
          `* **Total Mentahan:** ${totalMentahanRekap} file (${totalBelumDipakaiRekap} siap pakai).\n` +
          `* **Total Produksi (Video Final):** ${totalFinalRekap} video selesai diedit.\n` +
          `* **Total Upload (Sheet Publish):** ${totalUploadRekap} video tayang.`
        );
      }
    } catch {
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
      const { result } = await requestGemini(prompt, { temperature: 0.7, maxOutputTokens: 2048 });
      if (result?.text) {
        setAnalysisResult(result.text);
      } else {
        setAnalysisResult(geminiFailureMessage(result) || "Gagal mendapatkan analisa dari bot AI.");
      }
    } catch {
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
      const response = await fetch(`${APPS_SCRIPT_ENDPOINT}?action=run_update`);
      const result = await response.json();
      if (result.status === "success") {
        setBotReport(result.report); 
        fetchData(); 
      } else {
        alert("Gagal menjalankan bot: " + result.message);
      }
    } catch {
      alert("Koneksi terputus. Pastikan Apps Script berjalan dengan baik.");
    }
    setIsBotRunning(false);
  };

  // --- FILTERING DATA ANALITIK FYP ---
  const listBulan = ['Semua', ...new Set(data.map(item => getBulanFormat(item.Tanggal_Upload)).filter(b => b !== 'Tanpa Tanggal' && b !== 'Format Tidak Dikenal'))];
  const listAkun = ['Semua', ...new Set(data.map(item => item.Nama_Akun || item.Id_Akun).filter(Boolean))];

  const matchesFypBaseFilters = (item) => {
    const matchBulan = filterBulan === 'Semua' || getBulanFormat(item.Tanggal_Upload) === filterBulan;
    const matchAkun = filterAkun === 'Semua' || (item.Nama_Akun || item.Id_Akun) === filterAkun;
    const matchFyp = matchFypFilter(item.Video_FYP, filterFyp);
    return matchBulan && matchAkun && matchFyp;
  };

  const fypBaseData = data.filter(matchesFypBaseFilters);
  const isFypRowStarred = (item) => {
    const fileKey = getFypFileKey(item);
    return !!fileKey && !!winningFilesMap[fileKey]?.isWinning;
  };
  const starredFypCount = fypBaseData.filter(isFypRowStarred).length;
  const fypScoped = onlyWinningFyp ? fypBaseData.filter(isFypRowStarred) : fypBaseData;
  const filteredData = filterBySearch(fypScoped, debouncedFypQuery, (item) => fypRowSearchFields(item, [
    accountLookup[String(item.Nama_Akun || item.Id_Akun || '').toUpperCase()],
    getBulanFormat(item.Tanggal_Upload),
    winningFilesMap[getFypFileKey(item)]?.catatan,
  ]));

  const statTotalVideo = filteredData.length;
  const statTotalView = filteredData.reduce((sum, item) => sum + (parseInt(String(item.View).replace(/[^0-9]/g, '')) || 0), 0);
  const statFyp = filteredData.filter(v => {
    const s = (v.Video_FYP || "").toLowerCase();
    return (s.includes('fyp') || s.includes('viral')) && !s.includes('belum');
  }).length;

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  if (pageFilter === filterSignature && totalPages > 0 && currentPage > totalPages) {
    setCurrentPage(totalPages);
  }
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentData = filteredData.slice(startIndex, endIndex);
  const modalItems = drillDownModal?.items || [];
  const modalAfterStar = modalItems.filter((file) => !onlyWinningInModal || winningFilesMap[file.fileKey]?.isWinning);
  const modalVisible = filterBySearch(modalAfterStar, debouncedFileListQuery, fileListSearchFields);

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

            <div className="overflow-y-auto flex-1 bg-gray-50/40">
              <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 py-3 md:px-6">
                <SearchBox
                  id="search-daftar-file"
                  value={fileListQuery}
                  onChange={setFileListQuery}
                  shown={modalVisible.length}
                  total={modalAfterStar.length}
                />
              </div>
              <div className="divide-y divide-gray-100 p-4 md:px-6">
              {modalVisible.length === 0 ? (
                <p className="py-12 text-center text-sm font-semibold text-gray-400">
                  {modalAfterStar.length === 0
                    ? 'Tidak ada file yang cocok dengan filter.'
                    : 'Tidak ada file yang cocok dengan pencarian.'}
                </p>
              ) : modalVisible.map((file, idx) => {
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

                      <FileLinkActions file={file} onPlay={openTikTokPlayer} />
                    </div>
                  );
                })}
              </div>
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

      <TikTokPlayerModal player={tiktokPlayer} onClose={() => setTiktokPlayer(null)} />

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
                  onClick={() => askAiAboutDashboard("Buatkan draft poin-poin slide PPT laporan bulanan beserta analisa power produksi & publish setiap bulan")}
                  className="text-xs bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold px-3 py-2 rounded-xl shadow-sm transition-colors"
                >
                  📊 Buat Poin Slide PPT Laporan Bulan Ini
                </button>
                <button 
                  onClick={() => askAiAboutDashboard("Bandingkan power kekuatan mentahan, produksi editor, dan publish antar bulan serta bottleneck-nya")}
                  className="text-xs bg-white hover:bg-blue-50 text-blue-800 border border-blue-200 font-bold px-3 py-2 rounded-xl shadow-sm transition-colors"
                >
                  ⚡ Evaluasi Power Bulanan & Bottleneck
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
                Folder aktif: <span className="font-semibold text-gray-700">Project Baru/Mentahan Video</span> & <span className="font-semibold text-gray-700">Video Final</span>. Klik kotak bulan atau angka untuk melihat rincian file.
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

          <div className="mb-6 print:hidden">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <SearchBox
                id="search-pipeline"
                value={pipelineQuery}
                onChange={setPipelineQuery}
                shown={pipelineShown}
                total={pipelineTotal}
              />
            </div>
          </div>

          {/* 1. FILTER TERPADU DINAMIS */}
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
              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Tim / Akun Toko</label>
              <select value={rekapTim} onChange={(e) => setRekapTim(e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg block w-full p-2.5 font-semibold">
                <option value="Semua">👥 Semua Tim & Akun Toko</option>
                <optgroup label="👤 Anggota Tim (Kreator / Editor / Uploader)">
                  {personOptions.map(person => (
                    <option key={person} value={person}>👤 {person}</option>
                  ))}
                </optgroup>
                <optgroup label="📱 Akun Toko (MASTER_AKUN)">
                  {accountOptions.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      📱 {acc.label}{acc.pemegang ? ` (${acc.pemegang})` : ''}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* 2. KOTAK POWER BULANAN (PER 3 BULAN + BISA DI-HIDE AGAR HEMAT LAYAR)      */}
          {/* ========================================================================= */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 mb-6 overflow-hidden">
            {/* Bar Atas Panel: Judul + Pilihan 3/6/Semua Bulan + Geser Halaman + Tombol Hide */}
            <div className="px-5 py-3.5 bg-gray-50/70 flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-gray-100">
              <div 
                onClick={() => setIsPowerPanelOpen(!isPowerPanelOpen)}
                className="flex items-center gap-2.5 cursor-pointer select-none"
              >
                <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900 text-sm md:text-base">
                      Power & Estimasi Kekuatan per Bulan
                    </h3>
                    <span className="text-[11px] font-bold bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">
                      {monthlyPowerCards.length} Bulan
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Kecepatan rata-rata harian (<span className="font-semibold text-gray-700">file/hari aktif</span>) & kapasitas bulanan. Klik kartu untuk memfilter bulan.
                  </p>
                </div>
              </div>

              {/* Kontrol Tampilan Per 3 Bulan & Hide/Show */}
              <div className="flex flex-wrap items-center gap-2 print:hidden">
                {rekapBulan !== 'Semua' && (
                  <button
                    onClick={() => setRekapBulan('Semua')}
                    className="text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1.5 rounded-lg transition-colors"
                  >
                    Reset Filter ({rekapBulan})
                  </button>
                )}

                {isPowerPanelOpen && (
                  <>
                    {/* Pemilih Jumlah Kotak Bulan: 3 Bulan, 6 Bulan, Semua */}
                    <div className="flex items-center bg-white border border-gray-200 rounded-lg p-0.5 text-xs font-bold shadow-sm">
                      <button
                        onClick={() => { setMonthViewLimit(3); setMonthPageIndex(0); }}
                        className={`px-2.5 py-1 rounded-md transition-colors ${monthViewLimit === 3 ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                      >
                        Per 3 Bulan
                      </button>
                      <button
                        onClick={() => { setMonthViewLimit(6); setMonthPageIndex(0); }}
                        className={`px-2.5 py-1 rounded-md transition-colors ${monthViewLimit === 6 ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                      >
                        6 Bulan
                      </button>
                      <button
                        onClick={() => { setMonthViewLimit(999); setMonthPageIndex(0); }}
                        className={`px-2.5 py-1 rounded-md transition-colors ${monthViewLimit >= 999 ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                      >
                        Semua ({monthlyPowerCards.length})
                      </button>
                    </div>

                    {/* Tombol Geser Kiri/Kanan jika mode Per 3 Bulan / 6 Bulan */}
                    {monthViewLimit < 999 && totalMonthPages > 1 && (
                      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-1.5 py-1 text-xs font-bold shadow-sm">
                        <button
                          onClick={() => setMonthPageIndex(p => Math.max(0, p - 1))}
                          disabled={safeMonthPage === 0}
                          title="Bulan Lebih Baru"
                          className="p-0.5 hover:bg-gray-100 rounded disabled:opacity-30"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-[11px] text-gray-600 px-1">
                          {safeMonthPage + 1}/{totalMonthPages}
                        </span>
                        <button
                          onClick={() => setMonthPageIndex(p => Math.min(totalMonthPages - 1, p + 1))}
                          disabled={safeMonthPage >= totalMonthPages - 1}
                          title="3 Bulan Sebelumnya"
                          className="p-0.5 hover:bg-gray-100 rounded disabled:opacity-30"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Tombol Sembunyikan / Tampilkan */}
                <button
                  onClick={() => setIsPowerPanelOpen(!isPowerPanelOpen)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-lg text-xs font-bold shadow-sm transition-colors"
                >
                  {isPowerPanelOpen ? (
                    <><ChevronUp className="w-4 h-4" /> Sembunyikan</>
                  ) : (
                    <><ChevronDown className="w-4 h-4" /> Tampilkan Power Bulanan</>
                  )}
                </button>
              </div>
            </div>

            {/* Isi Grid Kotak Bulan (Hanya tampil jika tidak di-hide) */}
            {isPowerPanelOpen && (
              <div className="p-4 md:p-5">
                {loading && monthlyPowerCards.length === 0 ? (
                  <div className="py-6 text-center text-gray-400 text-sm font-semibold">
                    Menghitung kekuatan Mentahan, Produksi, dan Publish...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {visibleMonthlyCards.map((m) => {
                      const isSelected = rekapBulan === m.month;
                      const barWidth = Math.min(m.powerPercentage, 100);
                      return (
                        <div
                          key={m.month}
                          onClick={() => setRekapBulan(isSelected ? 'Semua' : m.month)}
                          className={`rounded-xl p-3.5 border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-50/40 border-emerald-500 ring-2 ring-emerald-200 shadow-sm'
                              : 'bg-gray-50/60 hover:bg-white border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2.5">
                            <div className="flex items-center gap-1.5">
                              <Calendar className={`w-4 h-4 ${isSelected ? 'text-emerald-600' : 'text-gray-500'}`} />
                              <span className="font-black text-gray-900 text-sm">{m.title}</span>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              m.powerPercentage >= 100
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : m.powerPercentage >= 75
                                ? 'bg-blue-100 text-blue-800 border-blue-300'
                                : 'bg-amber-100 text-amber-800 border-amber-300'
                            }`}>
                              ⚡ Power Publish: {m.powerPercentage}%
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2 text-center mb-2.5">
                            {/* Mentahan */}
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                openRealFilesModal(m.title, 'Mentahan (Raw_Asset)', m.rawFiles);
                              }}
                              className="bg-white p-2 rounded-lg border border-blue-100 hover:border-blue-400 transition-colors"
                              title="Klik untuk membuka file Mentahan bulan ini"
                            >
                              <p className="text-[10px] font-bold text-blue-600 uppercase">1. Mentahan</p>
                              <p className="text-lg font-black text-gray-900 underline decoration-dotted decoration-blue-400">{m.mentahan}</p>
                              <p className="text-[10px] font-bold text-blue-700">⚡ {m.powerRawPerHari}/hr</p>
                              <p className="text-[10px] text-gray-400">
                                {m.isCurrentMonth ? `Est: ~${m.estRawBulanan}` : `${m.rawActiveDays} hr aktif`}
                              </p>
                            </div>

                            {/* Produksi */}
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                openRealFilesModal(m.title, 'Produksi (Klip_Vidio)', m.klipFiles);
                              }}
                              className="bg-white p-2 rounded-lg border border-amber-100 hover:border-amber-400 transition-colors"
                              title="Klik untuk membuka file Video Final bulan ini"
                            >
                              <p className="text-[10px] font-bold text-amber-600 uppercase">2. Produksi</p>
                              <p className="text-lg font-black text-gray-900 underline decoration-dotted decoration-amber-400">{m.produksi}</p>
                              <p className="text-[10px] font-bold text-amber-700">⚡ {m.powerKlipPerHari}/hr</p>
                              <p className="text-[10px] text-gray-400">
                                {m.isCurrentMonth ? `Est: ~${m.estKlipBulanan}` : `${m.klipActiveDays} hr edit`}
                              </p>
                            </div>

                            {/* Publish */}
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                openRealFilesModal(m.title, 'Publish (Tayang)', m.uploadFiles);
                              }}
                              className="bg-white p-2 rounded-lg border border-emerald-100 hover:border-emerald-400 transition-colors"
                              title="Klik untuk membuka video Publish bulan ini"
                            >
                              <p className="text-[10px] font-bold text-emerald-600 uppercase">3. Publish</p>
                              <p className="text-lg font-black text-gray-900 underline decoration-dotted decoration-emerald-400">{m.publish}</p>
                              <p className="text-[10px] font-bold text-emerald-700">⚡ {m.powerPubPerHari}/hr</p>
                              <p className="text-[10px] text-gray-400">
                                {m.isCurrentMonth ? `Est: ~${m.estPubBulanan}` : `${m.pubActiveDays} hr tayang`}
                              </p>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] font-semibold text-gray-500">
                              <span>Sisa Mentahan: <strong className="text-gray-800">{m.mentahanBelumDipakai} raw</strong></span>
                              <span>Target 15/hr</span>
                            </div>
                            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  m.powerPercentage >= 100 ? 'bg-emerald-500' : m.powerPercentage >= 75 ? 'bg-blue-500' : 'bg-amber-500'
                                }`}
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. TIGA KARTU TOTAL SESUAI FILTER AKTIF */}
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
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl font-bold text-xs">Mentahan</div>
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

          {/* 4. DUA TABEL UTAMA */}
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
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="font-bold text-gray-900">{item.produk}</p>
                                  {item.groupLabel && (
                                    <span className="text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-200 px-1.5 py-0.5 rounded">
                                      {item.groupLabel}
                                    </span>
                                  )}
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
                                  {Array.from(item.creators).slice(0, 4).join(', ') || 'Tim'} • Sisa {item.belumDipakai} raw
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

          <div className="mb-6 print:hidden">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <SearchBox
                id="search-fyp"
                value={fypQuery}
                onChange={setFypQuery}
                shown={filteredData.length}
                total={fypScoped.length}
              />
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
              {listAkun.map(a => <option key={a} value={a}>{a === 'Semua' ? '👤 Semua Akun' : (accountLookup[String(a).toUpperCase()] || a)}</option>)}
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
            <label className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-bold cursor-pointer w-full sm:w-max select-none transition-colors ${onlyWinningFyp ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-amber-50'}`}>
              <input
                type="checkbox"
                checked={onlyWinningFyp}
                onChange={(e) => setOnlyWinningFyp(e.target.checked)}
                className="accent-amber-500 w-4 h-4"
              />
              <Star className={`w-4 h-4 ${onlyWinningFyp ? 'fill-amber-500 text-amber-500' : 'text-amber-400'}`} />
              Hanya ⭐
            </label>
            <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-2 rounded-lg whitespace-nowrap">
              ⭐ {starredFypCount} video ditandai
            </span>
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
                    currentData.map((row) => {
                      const badgeStyle = getFypBadgeStyle(row.Video_FYP);
                      const isFyp = badgeStyle.icon !== null;
                      const rawAkun = row.Nama_Akun || row.Id_Akun || '';
                      const fileKey = getFypFileKey(row);
                      const fileObj = getFypFileObj(row);
                      const fileWinInfo = (fileKey && winningFilesMap[fileKey]) || { isWinning: false, catatan: '' };
                      const savedCatatan = fileWinInfo.catatan || '';
                      const catatanValue = fileKey && Object.prototype.hasOwnProperty.call(fypCatatanDraft, fileKey)
                        ? fypCatatanDraft[fileKey]
                        : savedCatatan;

                      return (
                        <tr key={getFypRowKey(row)} className={`transition-colors ${fileWinInfo.isWinning ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-gray-50'}`}>
                          <td className="px-6 py-4">
                            <div className="flex items-start gap-2">
                              <button
                                type="button"
                                disabled={!fileKey}
                                title={fileKey ? 'Tandai video ini sebagai Bagus / Winning' : 'Tidak bisa ditandai: Id klip dan link postingan kosong'}
                                aria-pressed={!!fileWinInfo.isWinning}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  if (!fileKey) return;
                                  saveFileWinningToSheet(fileObj, !fileWinInfo.isWinning, catatanValue);
                                }}
                                className={`mt-0.5 focus:outline-none shrink-0 ${fileKey ? '' : 'cursor-not-allowed opacity-40'}`}
                              >
                                <Star className={`w-5 h-5 transition-transform active:scale-125 ${fileWinInfo.isWinning ? 'fill-amber-400 text-amber-400' : 'text-gray-300 hover:text-amber-300'}`} />
                              </button>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-bold text-gray-900 truncate max-w-[200px]">{row.Induk_Barang}</p>
                                  {fileKey && savingFileKey === fileKey && (
                                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                      <Check className="w-3 h-3" /> Tersimpan
                                    </span>
                                  )}
                                </div>
                                {row.Link_Postingan ? (
                                  <div className="flex flex-wrap items-center gap-2 mt-1">
                                    {canPlayTikTokUrl(row.Link_Postingan) && (
                                      <button
                                        type="button"
                                        onClick={() => openTikTokPlayer(row.Induk_Barang || 'Video TikTok', row.Link_Postingan, {
                                          showCartNote: true,
                                          fypRow: row,
                                        })}
                                        className="inline-flex items-center gap-1 text-xs font-bold text-white bg-gray-900 hover:bg-black px-2 py-1 rounded-md"
                                      >
                                        <Play className="w-3 h-3" fill="currentColor" /> Play
                                      </button>
                                    )}
                                    <a href={row.Link_Postingan} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline font-semibold flex items-center gap-1 w-max">
                                      Buka di TikTok <ExternalLink className="w-3 h-3"/>
                                    </a>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span className="block px-2.5 py-1 rounded-md text-xs font-bold bg-white text-gray-700 border border-gray-300 w-max mb-1 shadow-sm">
                              {accountLookup[String(rawAkun).toUpperCase()] || rawAkun}
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
                                <input
                                  type="text"
                                  value={catatanValue}
                                  disabled={!fileKey}
                                  placeholder={fileKey ? 'Isi catatan evaluasi tim...' : 'Catatan tidak tersedia tanpa Id klip / link'}
                                  onChange={(e) => {
                                    if (!fileKey) return;
                                    const next = e.target.value;
                                    setFypCatatanDraft((prev) => ({ ...prev, [fileKey]: next }));
                                  }}
                                  onBlur={(e) => {
                                    if (!fileKey) return;
                                    if (e.target.value !== (winningFilesMap[fileKey]?.catatan || '')) {
                                      saveFileWinningToSheet(fileObj, !!winningFilesMap[fileKey]?.isWinning, e.target.value);
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') e.currentTarget.blur();
                                  }}
                                  className="bg-white border border-gray-300 text-gray-700 text-xs font-medium rounded-md block w-full pl-8 p-1.5 shadow-sm disabled:bg-gray-50 disabled:text-gray-400"
                                />
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
                <option value="">Pilih Akun Toko Terdampak...</option>
                {accountOptions.map(acc => (
                  <option key={acc.id} value={`${acc.label}${acc.pemegang ? ` (${acc.pemegang})` : ''}`}>
                    {acc.label}{acc.pemegang ? ` (${acc.pemegang})` : ''}
                  </option>
                ))}
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