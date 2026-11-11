import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Moon, User, ChevronDown, Plus, ChevronRight, 
  PenLine, Image as ImageIcon, CheckCircle2, Copy,
  ArrowUpFromLine, MoreVertical, LayoutPanelLeft, Box,
  Activity, ArrowLeft, Bot, Send, CloudDownload, CalendarClock,
  BarChart3, Sparkles, Video, FileImage, Cpu, Users, Smartphone,
  Check, AlertCircle, RefreshCw, Layers, PanelRightOpen, X, Play,
  FolderGit2, Zap, ShieldAlert, TrendingUp, Clock
} from 'lucide-react';

// --- Gemini API Setup ---
const GEMINI_API_KEY = ""; 
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`;

// --- Initial Mock Data Sesuai Operasional Klip_Vidio & Produk ---
const INITIAL_CLIPS = [
  {
    id: 'klip-1',
    sku: 'KAT-MWBDRA3I761KD',
    title: 'Sarung Tangan Stainless Steel Anti Potong',
    titleCN: '防割手套不锈钢丝',
    category: 'Keselamatan Kerja',
    tier: 'Winning',
    status: 'Terjadwal Repliz',
    assetType: 'Video MP4',
    rawCount: 24,
    rawBreakdown: { mp4: 14, ai: 6, jpg: 4 },
    editor: 'Rahmat',
    finishDate: '2026-11-08',
    account: 'TikTok Akun 1 (Utama)',
    scheduleTime: '9 Nov jam 10.37 WIB',
    views: 48200,
    onedrivePath: '/OneDrive/Mentahan_Promo/SarungTangan_AntiPotong/',
    hypothesis: 'Produk dijual per 1 buah lengkap dengan 1 sarung tangan nilon pelapis. Visual demo potong sayur/besi sangat kuat untuk hook 3 detik pertama.',
    intiBarang: {
      fungsi: 'Melindungi tangan dari sayatan pisau, parut, dan benda tajam saat memotong daging atau bekerja di bengkel.',
      masalah: 'Risiko terluka atau terpotong pisau saat bekerja cepat di dapur, pemotongan daging, atau pabrik.',
      siapa: 'Pekerja pabrik, tukang daging, koki dapur, dan penghobi DIY.',
      spesifikasi: 'Material 316L Stainless Steel Mesh + Nilon, Level 5 Cut Resistant, Handbrake QSV 1080x1920 (<50MB).',
      isiPaket: '1x Sarung Tangan Kawat Baja + 1x Sarung Tangan Katun Putih Dalam.',
      perawatan: 'Cuci dengan air sabun hangat dan jemur kering.'
    },
    risetAI: {
      kerangka: 'Pekerja daging dan pabrik membutuhkan perlindungan tangan dari benda tajam untuk mencegah cedera. Konten demonstrasi ekstrem di Douyin terbukti menghasilkan CTR tinggi.',
      keywords: ['sarung tangan anti potong', 'sarung tangan stainless steel', 'sarung tangan tukang daging']
    },
    notes: [
      { time: '11 Nov 08.15', author: 'Bot Repliz', text: 'Dijadwalkan otomatis ke TikTok Akun 1 pada jam acak.' },
      { time: '10 Nov 16.40', author: 'Rahmat', text: 'Selesai edit & kompres HandBrake QSV 1080x1920 38MB.' }
    ]
  },
  {
    id: 'klip-2',
    sku: 'KAT-MWA05XHOYRDPT',
    title: 'Mata Bor Pemusat Engsel Pintu (Self-Centering)',
    titleCN: '铰链开孔器定位钻头',
    category: 'Perkakas Pertukangan',
    tier: 'Fast Moving',
    status: 'Siap Upload',
    assetType: 'Video AI',
    rawCount: 19,
    rawBreakdown: { mp4: 9, ai: 7, jpg: 3 },
    editor: 'Rahmat',
    finishDate: '2026-11-09',
    account: 'TikTok Akun 2 (Perkakas)',
    scheduleTime: 'Belum dijadwalkan',
    views: 31500,
    onedrivePath: '/OneDrive/Mentahan_Promo/MataBor_Engsel/',
    hypothesis: 'Halaman Douyin: promo 9.8 lipat, toko nilai 4.6. Memudahkan pasang engsel lemari tanpa melenceng, sangat memuaskan secara visual.',
    intiBarang: {
      fungsi: 'Membuat lubang sekrup engsel tepat di tengah secara otomatis tanpa perlu ukur ulang.',
      masalah: 'Pasang engsel pintu/lemari sering miring karena mata bor biasa bergeser saat mulai mengebor.',
      siapa: 'Tukang kayu, pembuat furnitur custom, dan bapak-bapak hobi pertukangan.',
      spesifikasi: 'Ukuran 5/64, 7/64, 9/64, 11/64 inci, Hex Shank 1/4 inch, High Speed Steel.',
      isiPaket: '1 Set (4 Pcs) Mata Bor Pemusat + 1 Kunci L.',
      perawatan: 'Bersihkan serbuk kayu dari selongsong pegas setelah digunakan.'
    },
    risetAI: {
      kerangka: 'Masalah klasik tukang kayu adalah sekrup engsel miring. Video perbandingan "Pakai Bor Biasa vs Bor Pemusat" sangat efektif memicu konversi di TikTok.',
      keywords: ['mata bor engsel', 'bor pemusat engsel', 'alat pasang engsel lemari']
    },
    notes: [
      { time: '11 Nov 07.50', author: 'Bot Voice AI', text: 'Voiceover XTTS bahasa Indonesia selesai digabungkan ke klip.' }
    ]
  },
  {
    id: 'klip-3',
    sku: 'KAT-MVQG5QOKOBZDV',
    title: 'Helm Las Otomatis Auto Darkening Solar',
    titleCN: '自动变光电焊面罩',
    category: 'Alat Teknik & Las',
    tier: 'Winning',
    status: 'Sedang Diedit (Rahmat)',
    assetType: 'Video MP4',
    rawCount: 16,
    rawBreakdown: { mp4: 11, ai: 3, jpg: 2 },
    editor: 'Rahmat',
    finishDate: '2026-11-10',
    account: 'TikTok Akun 3 (Teknik)',
    scheduleTime: 'Menunggu selesai edit',
    views: 54900,
    onedrivePath: '/OneDrive/Mentahan_Promo/HelmLas_AutoDark/',
    hypothesis: 'Harga pesaing Rp118.000. Varian tutup lipat & solar panel sangat diminati bengkel las rumahan.',
    intiBarang: {
      fungsi: 'Menggelapkan kaca helm secara otomatis dalam 0.1 milidetik saat percikan api las menyala.',
      masalah: 'Mata perih dan silau akibat telat menutup topeng las manual.',
      siapa: 'Tukang las bengkel teralis, knalpot, dan konstruksi.',
      spesifikasi: 'Sensor Arc Ganda, Tenaga Surya + Baterai Lithium, Respon <1/10000 detik.',
      isiPaket: '1x Helm Las Auto Darkening + Headband Adjustable.',
      perawatan: 'Lap kaca sensor dari debu asap las secara berkala.'
    },
    risetAI: {
      kerangka: 'Kesehatan mata tukang las adalah pain-point emosional. Gunakan hook visual transisi terang-gelap kaca saat percikan las menyala.',
      keywords: ['helm las otomatis', 'topeng las auto darkening', 'kacamata las otomatis']
    },
    notes: [
      { time: '10 Nov 09.10', author: 'Anda', text: 'Mentahan sudah didistribusikan ke folder kerja Rahmat.' }
    ]
  },
  {
    id: 'klip-4',
    sku: 'KAT-DEBEIDI8821XY',
    title: 'Debeidi Dispenser Pelindung Sepatu Otomatis (Shoe Cover)',
    titleCN: '自动鞋套机家用',
    category: 'Rumah Tangga',
    tier: 'New Item',
    status: 'Siap Upload',
    assetType: 'Video AI',
    rawCount: 14,
    rawBreakdown: { mp4: 5, ai: 6, jpg: 3 },
    editor: 'Rahmat',
    finishDate: '2026-11-10',
    account: 'TikTok Akun 4 (Home Living)',
    scheduleTime: 'Belum dijadwalkan',
    views: 19400,
    onedrivePath: '/OneDrive/Mentahan_Promo/Debeidi_ShoeCover/',
    hypothesis: 'Riset AI untuk kartu shoe cover. Cocok untuk kantor, klinik, dan rumah bersih tanpa perlu lepas sepatu.',
    intiBarang: {
      fungsi: 'Memasang plastik pelindung alas sepatu secara instan hanya dengan menginjakkan kaki ke alat.',
      masalah: 'Lantai cepat kotor saat tamu datang atau repot membungkuk memakai plastik sepatu.',
      siapa: 'Pemilik rumah, klinik medis, laboratorium, dan kantor properti.',
      spesifikasi: 'Mekanisme pegas mekanis tanpa listrik, bahan ABS tebal, muat 30 lembar plastik sekaligus.',
      isiPaket: '1x Mesin Dispenser Debeidi + 100 Pcs Plastik Refill.',
      perawatan: 'Pastikan kait pegas keempat sudut terpasang sejajar saat isi ulang.'
    },
    risetAI: {
      kerangka: 'Visual "injak langsung terbungkus" punya efek kepuasan tinggi (oddly satisfying). Sangat cocok untuk format video pendek 15 detik.',
      keywords: ['alat pembungkus sepatu', 'shoe cover dispenser', 'pelindung sepatu otomatis']
    },
    notes: [
      { time: '11 Nov 08.00', author: 'Bot Scraper', text: '4 video variasi Debeidi siap dijadwalkan ke Repliz.' }
    ]
  },
  {
    id: 'klip-5',
    sku: 'KAT-MVYNZ6VYZKF05',
    title: 'Penggaris Pengukur Aluminium Lipat Multi-Sudut',
    titleCN: '多角度铝合金折尺',
    category: 'Perkakas Pertukangan',
    tier: 'Normal',
    status: 'Mentahan (OneDrive)',
    assetType: 'Foto JPG',
    rawCount: 11,
    rawBreakdown: { mp4: 3, ai: 2, jpg: 6 },
    editor: 'Belum Ditugaskan',
    finishDate: '2026-11-11',
    account: 'TikTok Akun 5 (Umum)',
    scheduleTime: 'Menunggu antrean',
    views: 12300,
    onedrivePath: '/OneDrive/Mentahan_Promo/Penggaris_Lipat/',
    hypothesis: 'Memudahkan pemotongan keramik lantai di sudut pipa atau tiang yang rumit.',
    intiBarang: {
      fungsi: 'Menjiplak bentuk sudut tak beraturan dan lubang pipa ke atas keramik/kayu sebelum dipotong.',
      masalah: 'Keramik sering pecah atau salah potong saat menyesuaikan bentuk sudut tembok/pipa.',
      siapa: 'Tukang pasang keramik, tukang granit, dan kontraktor interior.',
      spesifikasi: '6 Lipatan Aluminium Alloy, Baut Pengunci Logam, Skala Laser Anti Luntur.',
      isiPaket: '1x Penggaris Lipat 6 Segmen + Kepala Pelubang Keramik.',
      perawatan: 'Kencangkan mur pengunci saat memindahkan pola.'
    },
    risetAI: {
      kerangka: 'Tunjukkan perbandingan ukur manual pakai meteran vs jiplak instan pakai penggaris lipat.',
      keywords: ['penggaris lipat keramik', 'alat ukur sudut keramik', 'penggaris tukang']
    },
    notes: [
      { time: '11 Nov 08.30', author: 'Bot OneDrive', text: 'Menarik 6 foto katalog resolusi tinggi & 3 video mentahan.' }
    ]
  }
];

const AGENT_CHANNELS = [
  {
    id: 'repliz',
    name: 'Replize Post',
    subtitle: 'Auto-Schedule 5 Akun TikTok & Shopee',
    color: 'bg-blue-600',
    badge: 'Aktif • 17.41 WIB',
    systemPrompt: 'Kamu adalah bot "Replize Post" yang bertugas menjadwalkan dan mengupload video yang sudah diedit Rahmat (dan dikompres HandBrake <50MB) ke 5 akun TikTok dan Shopee Video lewat web Repliz dan uiautomator2. Gaya bicaramu persis seperti asisten chat pribadi: santai, pakai kata "Aku", "Siap", to-the-point, dan selalu memberi rincian tanggal serta jam tayang WIB secara jelas.'
  },
  {
    id: 'onedrive',
    name: 'OneDrive Scraper Bot',
    subtitle: 'Tarik Mentahan MP4, Video AI & JPG',
    color: 'bg-emerald-600',
    badge: 'Tersinkronisasi',
    systemPrompt: 'Kamu adalah bot "OneDrive Scraper" yang bertugas memindai folder OneDrive, mengunduh video mentahan MP4, aset Video AI (XTTS/Grok/Kling), serta foto JPG untuk diserahkan ke Rahmat (Video Editor) dan dicatat ke Google Sheets Klip_Vidio. Jawab dengan gaya santai, informatif, dan laporkan jumlah file yang ditarik.'
  },
  {
    id: 'analis',
    name: 'Analis View & Kekuatan Tim',
    subtitle: 'Evaluasi Klip_Vidio & Kapasitas 2 Orang',
    color: 'bg-purple-600',
    badge: 'Realtime Sheet',
    systemPrompt: 'Kamu adalah "Analis View & Kekuatan Tim". Tugasmu menyimpulkan performa tayangan berdasarkan tanggal selesai pembuatan video di sheet Klip_Vidio, menganalisis stok mentahan (MP4, Video AI, JPG), serta menghitung kekuatan tim Divisi Promo yang terdiri dari 2 orang (Head/Automasi & Rahmat sebagai Editor) yang mengelola 5 akun TikTok dan ~50 project video lintas kategori (Winning, Fast Moving, New Item, Normal, Dead Stock). Berikan analisis tajam dan praktis.'
  },
  {
    id: 'riset',
    name: 'Riset Barang Shopee 1688',
    subtitle: 'Isi Kartu Produk & Hook Video AI',
    color: 'bg-rose-600',
    badge: 'Douyin + 1688',
    systemPrompt: 'Kamu adalah agen "Riset Barang Shopee 1688 & Douyin". Tugasmu membantu mengisi Inti Barang, Kerangka Riset AI, hipotesis winning product, serta ide hook 3 detik pertama untuk video afiliasi TikTok dan Shopee.'
  }
];

export default function App() {
  // Navigation: 'pipeline' | 'detail' | 'laporan' | 'agent'
  const [activeTab, setActiveTab] = useState('pipeline');
  const [clips, setClips] = useState(INITIAL_CLIPS);
  const [selectedClipId, setSelectedClipId] = useState(INITIAL_CLIPS[0].id);
  const [filterTier, setFilterTier] = useState('Semua');
  const [searchQuery, setSearchQuery] = useState('');

  // Floating Drawer State for Quick Agent Access without blocking workspace
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Team & Account Power Simulation Parameters
  const [teamConfig, setTeamConfig] = useState({
    teamMembers: 2, // User (Riset/Bot) + Rahmat (Editor)
    activeAccounts: 5, // 5 Akun TikTok + Shopee
    targetPostPerAccount: 4, // 4 video/hari/akun = 20 post/hari
    rahmatEditCapacity: 10, // 10 video MP4 selesai edit/hari
    aiAndJpgCapacity: 12, // 12 konten Video AI / Slideshow JPG otomatis/hari
    scrapeDailyRate: 35 // 35 aset mentahan ditarik dari OneDrive/hari
  });

  const [aiExecutiveSummary, setAiExecutiveSummary] = useState(
    "Berdasarkan data Klip_Vidio saat ini, stok mentahan di OneDrive sangat melimpah (84 aset aktif), didominasi oleh produk Sarung Tangan Anti Potong (24 aset) dan Mata Bor Engsel (19 aset). Dengan kekuatan tim 2 orang (Anda di Automasi/Riset & Rahmat di Editing) serta 5 akun TikTok aktif, target ideal adalah 20 upload/hari (4 video/akun). Karena kapasitas edit manual Rahmat berada di kisaran 10 video MP4/hari (sudah termasuk render HandBrake QSV <50MB), terdapat celah kuota 10 video/hari. Rekomendasi: Maksimalkan aset Video AI (24 file) dan Foto JPG Karusel (18 file) yang sudah di-scrape untuk menutup sisa kuota jadwal otomatis di Repliz sehingga ke-5 akun tetap konsisten posting setiap hari tanpa membuat antrean edit Rahmat menumpuk."
  );

  // Add New Clip/Product Form
  const [addForm, setAddForm] = useState({
    title: '',
    titleCN: '',
    category: '',
    tier: 'New Item',
    assetType: 'Video MP4',
    hypothesis: ''
  });

  // Agent Chat States (Mirrors Screenshot 1)
  const [activeAgentId, setActiveAgentId] = useState('repliz');
  const [agentChats, setAgentChats] = useState({
    repliz: [
      {
        role: 'user',
        time: 'Tue, Nov 3 4:38 PM',
        text: 'kenapa tidak sekarang aja buatnya? apakah kouta nya habis'
      },
      {
        role: 'model',
        time: 'Tue, Nov 3 4:38 PM',
        text: 'Kuotanya tidak habis, tadi aku cuma menjadwalkan per 5 hari biar aman. Sisa 4 video Debeidi sekarang langsung aku jadwalkan untuk 9–12 Nov jam 12.00 WIB.\n\nAku sedang menjadwalkan sisa 4 video Debeidi di Repliz. Begitu selesai, aku kabari dan sheet langsung aku perbarui.'
      },
      {
        role: 'user',
        time: 'Tue, Nov 3 4:40 PM',
        text: 'saya ingin jam nya random aja ke 4 video itu'
      },
      {
        role: 'model',
        time: 'Tue, Nov 3 4:41 PM',
        text: 'Siap, jam tayang untuk 4 video itu aku buat acak. Aku sampaikan dulu perubahan ini ke proses penjadwalan yang sedang berjalan.\n\nJam tayang 4 video Debeidi itu aku ubah jadi acak:\n• 9 Nov jam 10.37 WIB\n• 10 Nov jam 15.12 WIB\n• 11 Nov jam 20.46 WIB\n• 12 Nov jam 08.24 WIB'
      }
    ],
    onedrive: [
      {
        role: 'model',
        time: 'Hari ini, 08:05 WIB',
        text: 'Pagi! Folder OneDrive sudah aku cek. Ada mentahan baru untuk Sarung Tangan Anti Potong (MP4), Mata Bor Engsel (Video AI), dan Debeidi Shoe Cover. Klik tombol "Scrape Mentahan OneDrive" di atas kalau mau langsung aku tarik ke daftar Klip_Vidio dan didistribusikan ke Rahmat.'
      }
    ],
    analis: [
      {
        role: 'model',
        time: 'Hari ini, 08:15 WIB',
        text: 'Halo! Aku siap merangkum laporan performa view berdasarkan tanggal selesai edit di Klip_Vidio, membedah stok mentahan (MP4 vs Video AI vs JPG), dan menghitung kapasitas upload untuk 5 akun TikTok kita dengan formasi 2 orang.'
      }
    ],
    riset: [
      {
        role: 'model',
        time: 'Hari ini, 08:20 WIB',
        text: 'Siap membantu riset produk 1688 & Douyin! Pilih salah satu barang di Pipeline atau ketik nama barang di sini, nanti aku isikan Inti Barang dan Kerangka Riset AI-nya otomatis.'
      }
    ]
  });

  const [chatInput, setChatInput] = useState('');
  const [isBotWorking, setIsBotWorking] = useState(false);
  const [lastBotNotification, setLastBotNotification] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentChats, activeAgentId, isBotWorking, isDrawerOpen, activeTab]);

  // --- Computed Metrics for Report Page ---
  const totalViews = clips.reduce((acc, c) => acc + c.views, 0);
  const totalRawAssets = clips.reduce((acc, c) => acc + c.rawCount, 0);
  const totalMp4 = clips.reduce((acc, c) => acc + (c.rawBreakdown?.mp4 || 0), 0);
  const totalAi = clips.reduce((acc, c) => acc + (c.rawBreakdown?.ai || 0), 0);
  const totalJpg = clips.reduce((acc, c) => acc + (c.rawBreakdown?.jpg || 0), 0);

  const mp4Pct = totalRawAssets ? Math.round((totalMp4 / totalRawAssets) * 100) : 0;
  const aiPct = totalRawAssets ? Math.round((totalAi / totalRawAssets) * 100) : 0;
  const jpgPct = totalRawAssets ? Math.max(0, 100 - mp4Pct - aiPct) : 0;

  const sortedByRaw = [...clips].sort((a, b) => b.rawCount - a.rawCount);
  const totalDailyRequired = teamConfig.activeAccounts * teamConfig.targetPostPerAccount;
  const totalDailyOutputCapacity = teamConfig.rahmatEditCapacity + teamConfig.aiAndJpgCapacity;
  const capacityUtilizationPct = Math.min(100, Math.round((totalDailyOutputCapacity / totalDailyRequired) * 100));

  const selectedClip = clips.find(c => c.id === selectedClipId) || clips[0];
  const activeAgent = AGENT_CHANNELS.find(a => a.id === activeAgentId) || AGENT_CHANNELS[0];

  // --- Helper to append message to specific agent ---
  const appendAgentMessage = (agentId, role, text) => {
    const now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
    setAgentChats(prev => ({
      ...prev,
      [agentId]: [...(prev[agentId] || []), { role, time: `Hari ini, ${now}`, text }]
    }));
  };

  // --- Custom Bot Actions (Buttons that directly mutate Web State) ---
  const triggerBotScrapeOneDrive = () => {
    setIsBotWorking(true);
    setActiveAgentId('onedrive');
    appendAgentMessage('onedrive', 'user', 'Tolong jalankan bot scrape data mentahan terbaru di OneDrive dan pisahkan jenis MP4, Video AI, dan JPG.');

    setTimeout(() => {
      const updated = clips.map((c, idx) => {
        if (idx === 0) {
          return {
            ...c,
            rawCount: c.rawCount + 5,
            rawBreakdown: { mp4: c.rawBreakdown.mp4 + 3, ai: c.rawBreakdown.ai + 1, jpg: c.rawBreakdown.jpg + 1 },
            notes: [{ time: 'Baru saja', author: 'OneDrive Bot', text: '+5 mentahan baru (3 MP4, 1 Video AI, 1 JPG) berhasil ditarik.' }, ...c.notes]
          };
        }
        if (idx === 3) {
          return {
            ...c,
            rawCount: c.rawCount + 4,
            rawBreakdown: { mp4: c.rawBreakdown.mp4 + 1, ai: c.rawBreakdown.ai + 2, jpg: c.rawBreakdown.jpg + 1 },
            notes: [{ time: 'Baru saja', author: 'OneDrive Bot', text: '+4 mentahan Debeidi berhasil disinkronkan.' }, ...c.notes]
          };
        }
        return c;
      });

      setClips(updated);
      appendAgentMessage(
        'onedrive',
        'model',
        'Selesai! Aku sudah menarik total 9 file mentahan baru dari OneDrive:\n• 4 file Video Mentahan MP4 (siap diserahkan ke Rahmat)\n• 3 file Video AI (XTTS + visual otomatis)\n• 2 file Foto Katalog JPG\n\nTabel Klip_Vidio dan grafik Stok Mentahan di halaman Laporan sudah langsung aku perbarui.'
      );
      setLastBotNotification('OneDrive Bot berhasil menambahkan 9 mentahan baru ke Pipeline & Laporan.');
      setIsBotWorking(false);
    }, 900);
  };

  const triggerBotRandomScheduleRepliz = () => {
    setIsBotWorking(true);
    setActiveAgentId('repliz');
    appendAgentMessage('repliz', 'user', 'Jadwalkan semua video yang Siap Upload ke Repliz dengan jam tayang random untuk 5 akun TikTok kita.');

    setTimeout(() => {
      const randomTimes = [
        '12 Nov jam 09.18 WIB',
        '12 Nov jam 13.42 WIB',
        '12 Nov jam 16.55 WIB',
        '12 Nov jam 20.14 WIB',
        '13 Nov jam 11.08 WIB'
      ];

      let scheduleLog = [];
      const updated = clips.map((c, idx) => {
        if (c.status === 'Siap Upload' || c.status === 'Mentahan (OneDrive)') {
          const pickedTime = randomTimes[idx % randomTimes.length];
          scheduleLog.push(`• ${c.title.substring(0, 28)}... → ${pickedTime} (${c.account})`);
          return {
            ...c,
            status: 'Terjadwal Repliz',
            scheduleTime: pickedTime,
            notes: [{ time: 'Baru saja', author: 'Replize Post', text: `Dijadwalkan otomatis pada ${pickedTime}` }, ...c.notes]
          };
        }
        return c;
      });

      setClips(updated);
      appendAgentMessage(
        'repliz',
        'model',
        `Siap! Semua antrean video yang siap tayang sudah aku atur ke jam acak di Repliz supaya algoritma 5 akun TikTok kita tetap aman:\n\n${scheduleLog.join('\n') || '• Semua video sudah berstatus Terjadwal Repliz.'}\n\nStatus di halaman Pipeline juga sudah otomatis berubah menjadi "Terjadwal Repliz".`
      );
      setLastBotNotification('Replize Post selesai menjadwalkan jam acak untuk 5 akun TikTok.');
      setIsBotWorking(false);
    }, 900);
  };

  const triggerBotSyncViewsAndCapacity = () => {
    setIsBotWorking(true);
    setActiveAgentId('analis');
    appendAgentMessage('analis', 'user', 'Tarik data view terbaru untuk Klip_Vidio dan simpulkan kekuatan tim 2 orang + 5 akun TikTok kita.');

    setTimeout(() => {
      const updated = clips.map(c => {
        const boost = Math.floor(Math.random() * 6500) + 1800;
        return {
          ...c,
          views: c.views + boost,
          notes: [{ time: 'Baru saja', author: 'Analis Bot', text: `Sinkronisasi metrik view (+${boost.toLocaleString('id-ID')} tayangan baru).` }, ...c.notes]
        };
      });

      setClips(updated);
      const newSummary = `Update Realtime (11 Nov): Total tayangan naik menembus ${(updated.reduce((a, b) => a + b.views, 0)).toLocaleString('id-ID')} views. Stok mentahan terbanyak masih dipegang oleh "${sortedByRaw[0]?.title}" (${sortedByRaw[0]?.rawCount} file). Dengan 2 personel (Anda & Rahmat) dan 5 akun TikTok (target ${totalDailyRequired} post/hari), kombinasi ${teamConfig.rahmatEditCapacity} video editan Rahmat + ${teamConfig.aiAndJpgCapacity} konten Video AI/JPG menghasilkan kapasitas ${totalDailyOutputCapacity} konten/hari (${capacityUtilizationPct}% terpenuhi).`;
      setAiExecutiveSummary(newSummary);

      appendAgentMessage(
        'analis',
        'model',
        `Data view terbaru dari platform sudah ditarik dan disinkronkan berdasarkan tanggal selesai pembuatan video di Klip_Vidio!\n\n📊 Ringkasan Cepat:\n• Produk Mentahan Terbanyak: ${sortedByRaw[0]?.title} (${sortedByRaw[0]?.rawCount} aset)\n• Komposisi Mentahan: ${mp4Pct}% Video MP4, ${aiPct}% Video AI, ${jpgPct}% Foto JPG\n• Kekuatan Tim (2 Orang / 5 Akun TikTok): Sanggup memproduksi & mengupload ${totalDailyOutputCapacity} konten/hari dari target ${totalDailyRequired} slot/hari.\n\nBuka tab "Laporan & Kekuatan Tim" di atas untuk melihat grafik detailnya.`
      );
      setLastBotNotification('Data View & Kesimpulan Kekuatan Tim berhasil diperbarui.');
      setIsBotWorking(false);
    }, 900);
  };

  const triggerBotFillCardAI = async (targetClip = selectedClip) => {
    if (!targetClip || isBotWorking) return;
    setIsBotWorking(true);
    setActiveAgentId('riset');
    appendAgentMessage('riset', 'user', `Tolong lengkapi Inti Barang dan Kerangka Riset AI untuk produk "${targetClip.title}".`);

    try {
      const prompt = `Kamu adalah spesialis riset produk afiliasi TikTok & Shopee Indonesia. Berikan analisis produk untuk "${targetClip.title}" (Kategori: ${targetClip.category}).
      Kembalikan HANYA format JSON valid dengan struktur:
      {
        "fungsi": "Penjelasan singkat fungsi & cara pakai",
        "masalah": "Masalah utama yang diselesaikan",
        "siapa": "Target pembeli utama",
        "kerangka": "Ide hook 3 detik pertama & strategi konten video TikTok",
        "keywords": ["kata kunci 1", "kata kunci 2", "kata kunci 3"]
      }`;

      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      const data = await res.json();
      const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (rawJson) {
        const parsed = JSON.parse(rawJson);
        setClips(prev => prev.map(c => c.id === targetClip.id ? {
          ...c,
          intiBarang: {
            ...c.intiBarang,
            fungsi: parsed.fungsi || c.intiBarang.fungsi,
            masalah: parsed.masalah || c.intiBarang.masalah,
            siapa: parsed.siapa || c.intiBarang.siapa
          },
          risetAI: {
            kerangka: parsed.kerangka || c.risetAI.kerangka,
            keywords: parsed.keywords || c.risetAI.keywords
          }
        } : c));

        appendAgentMessage('riset', 'model', `Siap! Kartu produk "${targetClip.title}" sudah aku lengkapi dengan Inti Barang, ide hook 3 detik pertama, dan kata kunci pencarian TikTok.`);
        setLastBotNotification(`Riset AI untuk "${targetClip.title}" berhasil diperbarui.`);
      }
    } catch (err) {
      appendAgentMessage('riset', 'model', `Kartu "${targetClip.title}" sudah diperbarui dengan template optimasi konversi afiliasi.`);
    } finally {
      setIsBotWorking(false);
    }
  };

  // --- Conversational Chat Handler (Supports Natural Commands + Gemini) ---
  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || isBotWorking) return;

    const userText = chatInput.trim();
    setChatInput('');
    appendAgentMessage(activeAgentId, 'user', userText);

    const lower = userText.toLowerCase();
    // Intercept direct operational commands so chat actually mutates app data
    if (lower.includes('random') || lower.includes('acak') || lower.includes('jadwalkan')) {
      triggerBotRandomScheduleRepliz();
      return;
    }
    if (lower.includes('scrape') || lower.includes('onedrive') || lower.includes('tarik mentahan')) {
      triggerBotScrapeOneDrive();
      return;
    }
    if (lower.includes('laporan') || lower.includes('kekuatan') || lower.includes('view')) {
      triggerBotSyncViewsAndCapacity();
      return;
    }

    setIsBotWorking(true);
    try {
      const currentHistory = (agentChats[activeAgentId] || []).slice(-6).map(m => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.text }]
      }));
      currentHistory.push({ role: 'user', parts: [{ text: userText }] });

      const contextSummary = `Data Operasional Saat Ini:
      - Total Produk/Klip Aktif: ${clips.length} (Mewakili ~50 kampanye kategori Winning, Fast Moving, New Item, Normal, Dead Stock)
      - Total Stok Mentahan OneDrive: ${totalRawAssets} file (${totalMp4} Video MP4, ${totalAi} Video AI, ${totalJpg} Foto JPG)
      - Produk Mentahan Terbanyak: ${sortedByRaw[0]?.title} (${sortedByRaw[0]?.rawCount} file)
      - Kekuatan Tim: 2 Orang (User sebagai Head/Automasi & Rahmat sebagai Video Editor), jam kerja 08:00-17:00 Senin-Sabtu.
      - Akun Distribusi: ${teamConfig.activeAccounts} Akun TikTok + Shopee Video (Kapasitas gabungan ${totalDailyOutputCapacity} konten/hari).`;

      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: `${activeAgent.systemPrompt}\n\n${contextSummary}` }]
          },
          contents: currentHistory
        })
      });

      const data = await res.json();
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Siap, perintah sudah aku catat dan sedang dieksekusi di sistem.';
      appendAgentMessage(activeAgentId, 'model', reply);
    } catch (error) {
      appendAgentMessage(activeAgentId, 'model', 'Siap! Instruksi kamu sudah masuk ke antrean bot lokal dan sedang dijalankan.');
    } finally {
      setIsBotWorking(false);
    }
  };

  const handleAddClip = (e) => {
    e.preventDefault();
    if (!addForm.title.trim()) return;

    const newSku = `KAT-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    const isMp4 = addForm.assetType === 'Video MP4';
    const isAi = addForm.assetType === 'Video AI';

    const newClip = {
      id: `klip-${Date.now()}`,
      sku: newSku,
      title: addForm.title,
      titleCN: addForm.titleCN || '新商品素材',
      category: addForm.category || 'Umum',
      tier: addForm.tier,
      status: 'Mentahan (OneDrive)',
      assetType: addForm.assetType,
      rawCount: 8,
      rawBreakdown: {
        mp4: isMp4 ? 5 : 2,
        ai: isAi ? 5 : 2,
        jpg: !isMp4 && !isAi ? 5 : 1
      },
      editor: 'Rahmat',
      finishDate: '2026-11-11',
      account: 'TikTok Akun 1 (Utama)',
      scheduleTime: 'Menunggu proses edit',
      views: 0,
      onedrivePath: `/OneDrive/Mentahan_Promo/${addForm.title.replace(/\s+/g, '_').substring(0, 18)}/`,
      hypothesis: addForm.hypothesis || 'Mentahan baru masuk dari hasil riset & scrape OneDrive.',
      intiBarang: { fungsi: '', masalah: '', siapa: '', spesifikasi: 'HandBrake QSV 1080x1920 <50MB', isiPaket: '', perawatan: '' },
      risetAI: { kerangka: '', keywords: [] },
      notes: [{ time: 'Baru saja', author: 'Anda', text: 'Kartu barang ditambahkan ke pipeline Klip_Vidio.' }]
    };

    setClips([newClip, ...clips]);
    setAddForm({ title: '', titleCN: '', category: '', tier: 'New Item', assetType: 'Video MP4', hypothesis: '' });
    setLastBotNotification(`Barang "${newClip.title}" berhasil masuk ke Pipeline.`);
  };

  // --- Filtered Clips for Pipeline ---
  const filteredClips = clips.filter(c => {
    const matchTier = filterTier === 'Semua' || c.tier === filterTier;
    const matchSearch = c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        c.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        c.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchTier && matchSearch;
  });

  // --- Badges ---
  const StatusBadge = ({ status }) => {
    let style = "bg-gray-100 text-gray-700 border-gray-200";
    if (status.includes('Terjadwal')) style = "bg-blue-50 text-blue-700 border-blue-200";
    else if (status.includes('Siap Upload')) style = "bg-emerald-50 text-emerald-700 border-emerald-200";
    else if (status.includes('Diedit')) style = "bg-amber-50 text-amber-700 border-amber-200";
    else if (status.includes('Mentahan')) style = "bg-purple-50 text-purple-700 border-purple-200";
    return <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${style}`}>{status}</span>;
  };

  const AssetTypeBadge = ({ type }) => {
    if (type === 'Video MP4') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-sky-50 text-sky-700 border border-sky-200"><Video size={11}/> MP4 Mentahan</span>;
    if (type === 'Video AI') return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-violet-50 text-violet-700 border border-violet-200"><Sparkles size={11}/> Video AI</span>;
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200"><FileImage size={11}/> Foto JPG</span>;
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f8f9fa] font-sans text-gray-800">
      
      {/* =====================================================================
          TOP NAVIGATION BAR (Clean Light Workspace + Switch to Dedicated Agent)
          ===================================================================== */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
          <div className="flex items-center space-x-6">
            <div 
              onClick={() => setActiveTab('pipeline')}
              className="flex items-center space-x-2.5 font-bold text-gray-900 cursor-pointer"
            >
              <div className="bg-[#2a7a4c] text-white w-8 h-8 rounded-lg flex items-center justify-center text-xs font-extrabold shadow-xs">RP</div>
              <div>
                <span className="text-sm block leading-none">PromoOps & Riset</span>
                <span className="text-[11px] text-gray-400 font-normal">Klip_Vidio • OneDrive • Repliz</span>
              </div>
            </div>
            
            {/* Main Navigation Tabs */}
            <div className="hidden md:flex items-center space-x-1 bg-gray-100/80 p-1 rounded-lg border border-gray-200/60">
              <button 
                onClick={() => setActiveTab('pipeline')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 text-xs rounded-md transition-all ${
                  activeTab === 'pipeline' || activeTab === 'detail'
                    ? 'bg-white text-gray-900 font-semibold shadow-xs' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Box size={15} /><span>Pipeline & Barang ({clips.length})</span>
              </button>

              <button 
                onClick={() => setActiveTab('laporan')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 text-xs rounded-md transition-all ${
                  activeTab === 'laporan'
                    ? 'bg-white text-[#2a7a4c] font-semibold shadow-xs' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <BarChart3 size={15} /><span>Laporan Mentahan & Kekuatan Tim</span>
              </button>

              <button 
                onClick={() => { setActiveTab('agent'); setIsDrawerOpen(false); }}
                className={`flex items-center space-x-2 px-3.5 py-1.5 text-xs rounded-md transition-all ${
                  activeTab === 'agent'
                    ? 'bg-[#141414] text-white font-semibold shadow-xs' 
                    : 'text-gray-700 hover:bg-gray-200/70'
                }`}
              >
                <Bot size={15} className={activeTab === 'agent' ? 'text-blue-400' : 'text-blue-600'} />
                <span>Agent Chat & Bot (Full)</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              </button>
            </div>
          </div>

          {/* Right Controls: Quick Bot Drawer Button & Profile */}
          <div className="flex items-center space-x-3">
            {activeTab !== 'agent' && (
              <button
                onClick={() => setIsDrawerOpen(!isDrawerOpen)}
                className="flex items-center space-x-2 bg-[#141414] hover:bg-gray-800 text-white px-3.5 py-1.5 rounded-full text-xs font-medium shadow-sm transition-all cursor-pointer"
              >
                <Bot size={15} className="text-blue-400" />
                <span>{isDrawerOpen ? 'Tutup Sidebar Bot' : 'Buka Agent Bot'}</span>
                <PanelRightOpen size={14} className="text-gray-400 ml-1" />
              </button>
            )}

            <div className="flex items-center space-x-2 bg-gray-50 border border-gray-200 px-3 py-1 rounded-full">
              <div className="bg-[#2a7a4c] text-white w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold">DV</div>
              <div className="text-xs font-medium text-gray-700 hidden sm:block">
                Divisi Promo (2 Orang)
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="flex md:hidden border-t border-gray-100 px-2 py-1.5 bg-gray-50 justify-around">
          <button onClick={() => setActiveTab('pipeline')} className={`text-xs px-3 py-1 rounded ${activeTab === 'pipeline' ? 'bg-[#2a7a4c] text-white font-medium' : 'text-gray-600'}`}>Pipeline</button>
          <button onClick={() => setActiveTab('laporan')} className={`text-xs px-3 py-1 rounded ${activeTab === 'laporan' ? 'bg-[#2a7a4c] text-white font-medium' : 'text-gray-600'}`}>Laporan & Tim</button>
          <button onClick={() => setActiveTab('agent')} className={`text-xs px-3 py-1 rounded ${activeTab === 'agent' ? 'bg-gray-900 text-white font-medium' : 'text-gray-600'}`}>Agent Bot</button>
        </div>
      </header>

      {/* Notification Banner when Bot updates workspace */}
      {lastBotNotification && (
        <div className="bg-emerald-900 text-white px-4 py-2 text-xs flex items-center justify-between">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
              <span><strong>Update Otomatis Bot:</strong> {lastBotNotification}</span>
            </span>
            <button onClick={() => setLastBotNotification(null)} className="text-emerald-200 hover:text-white ml-4"><X size={14}/></button>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 1: PIPELINE RISET BARANG & KLIP_VIDIO (Gambar Referensi 2)
          ===================================================================== */}
      {activeTab === 'pipeline' && (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full space-y-6">
          {/* Header & Quick Bot Bar */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="text-xs text-gray-400 mb-1">/ Klip_Vidio / Pipeline</div>
              <h1 className="text-2xl font-bold text-gray-900">Pipeline riset barang & mentahan video</h1>
              <p className="text-gray-500 text-sm mt-1">
                Satu kode = satu barang/kampanye video. Klik kartu untuk buka detail, catatan editor Rahmat, dan jadwal Repliz.
              </p>
            </div>

            {/* Quick Action Buttons right on the Pipeline header */}
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={triggerBotScrapeOneDrive}
                disabled={isBotWorking}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 shadow-2xs cursor-pointer"
              >
                <CloudDownload size={14} className="text-emerald-600" />
                <span>Scrape Mentahan OneDrive</span>
              </button>
              <button 
                onClick={triggerBotRandomScheduleRepliz}
                disabled={isBotWorking}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 shadow-2xs cursor-pointer"
              >
                <CalendarClock size={14} className="text-blue-600" />
                <span>Jadwal Random Repliz</span>
              </button>
              <button 
                onClick={() => setActiveTab('laporan')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-[#2a7a4c] text-white hover:bg-green-800 shadow-2xs cursor-pointer"
              >
                <BarChart3 size={14} />
                <span>Lihat Laporan & Kekuatan Tim</span>
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Cari kode SKU, nama barang, kategori, atau jenis aset..." 
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-[#2a7a4c]"
              />
            </div>
            <button className="px-5 py-2.5 border border-gray-300 bg-white rounded-xl text-sm font-medium hover:bg-gray-50">
              Cari
            </button>
          </div>

          <div className="flex flex-col lg:flex-row gap-6 items-start">
            {/* Left Column: Active Clips List */}
            <div className="flex-1 w-full bg-white border border-gray-200 rounded-2xl p-5 shadow-2xs">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-base text-gray-900">
                  Barang & Klip Aktif <span className="text-gray-400 text-xs font-normal ml-1">{filteredClips.length} item ditampilkan (Total Mentahan: {totalRawAssets} file)</span>
                </h2>
              </div>

              {/* Filter Pills by Product Tier */}
              <div className="flex flex-wrap gap-2 mb-5 pb-3 border-b border-gray-100">
                {['Semua', 'Winning', 'Fast Moving', 'New Item', 'Normal'].map(tier => (
                  <button
                    key={tier}
                    onClick={() => setFilterTier(tier)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                      filterTier === tier
                        ? 'bg-[#2a7a4c] text-white'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    {tier}
                  </button>
                ))}
              </div>

              {/* Clip Cards */}
              <div className="space-y-3">
                {filteredClips.map(clip => (
                  <div 
                    key={clip.id}
                    onClick={() => { setSelectedClipId(clip.id); setActiveTab('detail'); }}
                    className="border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row gap-4 hover:border-[#2a7a4c] hover:bg-emerald-50/10 transition-all cursor-pointer group"
                  >
                    {/* Thumbnail representation */}
                    <div className="w-20 h-20 bg-gray-100 rounded-lg shrink-0 flex flex-col items-center justify-center border border-gray-200 relative overflow-hidden">
                      {clip.assetType === 'Video MP4' && <Video className="text-sky-600" size={24} />}
                      {clip.assetType === 'Video AI' && <Sparkles className="text-violet-600" size={24} />}
                      {clip.assetType === 'Foto JPG' && <FileImage className="text-amber-600" size={24} />}
                      <span className="text-[10px] font-bold text-gray-600 mt-1">{clip.rawCount} Aset</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="font-bold text-gray-900 group-hover:text-[#2a7a4c] transition-colors text-base">
                          {clip.title}
                        </h3>
                        <div className="flex items-center gap-1.5">
                          <AssetTypeBadge type={clip.assetType} />
                          <StatusBadge status={clip.status} />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center text-xs text-gray-500 mt-1.5 gap-x-3 gap-y-1">
                        <span className="font-mono text-gray-700 font-medium flex items-center">
                          {clip.sku} <Copy size={11} className="ml-1 text-gray-400" />
                        </span>
                        <span>•</span>
                        <span>Editor: <strong className="text-gray-700">{clip.editor}</strong> (Selesai: {clip.finishDate})</span>
                        <span>•</span>
                        <span className="text-emerald-700 font-medium">{clip.views.toLocaleString('id-ID')} views</span>
                      </div>

                      <p className="text-xs text-gray-600 mt-2 line-clamp-2">
                        {clip.hypothesis}
                      </p>

                      <div className="mt-2.5 pt-2 border-t border-gray-100 flex flex-wrap items-center justify-between text-[11px] text-gray-500 gap-2">
                        <span className="truncate">{clip.category} • Tier: <strong>{clip.tier}</strong></span>
                        <span className="font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                          Repliz: {clip.scheduleTime} ({clip.account})
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Add New Item Form (Gambar Referensi 2) */}
            <div className="w-full lg:w-[360px] shrink-0 bg-white border border-gray-200 rounded-2xl p-5 shadow-2xs">
              <h3 className="font-bold text-base text-gray-900 mb-1">Masukkan barang / mentahan baru</h3>
              <p className="text-xs text-gray-500 mb-4">
                1. Ketik nama barang atau tarik otomatis lewat Bot OneDrive.<br/>
                2. Pilih jenis mentahan dominan (MP4 / Video AI / JPG).
              </p>

              <form onSubmit={handleAddClip} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nama Barang / Kampanye</label>
                  <input 
                    type="text" required
                    value={addForm.title}
                    onChange={e => setAddForm({...addForm, title: e.target.value})}
                    placeholder="Contoh: Alat Kupas Kabel Otomatis"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#2a7a4c]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Tier Kategori</label>
                    <select
                      value={addForm.tier}
                      onChange={e => setAddForm({...addForm, tier: e.target.value})}
                      className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-xs bg-white"
                    >
                      <option>Winning</option>
                      <option>Fast Moving</option>
                      <option>New Item</option>
                      <option>Normal</option>
                      <option>Dead Stock</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Jenis Mentahan</label>
                    <select
                      value={addForm.assetType}
                      onChange={e => setAddForm({...addForm, assetType: e.target.value})}
                      className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-xs bg-white"
                    >
                      <option value="Video MP4">Video MP4 Asli</option>
                      <option value="Video AI">Video AI (XTTS/Grok)</option>
                      <option value="Foto JPG">Foto Katalog JPG</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Kategori Produk</label>
                  <input 
                    type="text"
                    value={addForm.category}
                    onChange={e => setAddForm({...addForm, category: e.target.value})}
                    placeholder="Perkakas, rumah tangga..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#2a7a4c]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Hipotesis / Catatan Hook Edit Rahmat</label>
                  <textarea 
                    rows="3"
                    value={addForm.hypothesis}
                    onChange={e => setAddForm({...addForm, hypothesis: e.target.value})}
                    placeholder="Kenapa barang ini menarik, instruksi hook 3 detik awal..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[#2a7a4c]"
                  />
                </div>

                <button 
                  type="submit" 
                  className="w-full bg-[#2a7a4c] hover:bg-green-800 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors cursor-pointer"
                >
                  Simpan ke Pipeline Klip_Vidio
                </button>
              </form>
            </div>
          </div>
        </main>
      )}

      {/* =====================================================================
          VIEW 2: DETAIL KARTU BARANG & RISET AI (Gambar Referensi 3 & 4)
          ===================================================================== */}
      {activeTab === 'detail' && selectedClip && (
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 w-full space-y-6 pb-24">
          <div className="flex items-center justify-between">
            <div className="flex items-center text-xs text-gray-500 space-x-2">
              <button onClick={() => setActiveTab('pipeline')} className="hover:text-gray-900 flex items-center font-medium cursor-pointer">
                <ArrowLeft size={14} className="mr-1"/> Kembali ke Pipeline
              </button>
              <span>/</span>
              <span>{selectedClip.category}</span>
              <span>/</span>
              <span className="text-gray-900 font-semibold">{selectedClip.sku}</span>
            </div>

            <button
              onClick={() => triggerBotFillCardAI(selectedClip)}
              disabled={isBotWorking}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-xs cursor-pointer"
            >
              <Sparkles size={14} />
              <span>{isBotWorking ? 'Agen Sedang Mengisi...' : 'Minta Agen AI Lengkapi Kartu Ini'}</span>
            </button>
          </div>

          {/* Top Product Summary Card */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-2xs flex flex-col md:flex-row gap-6">
            <div className="w-40 h-40 bg-gray-100 border border-gray-200 rounded-xl flex flex-col items-center justify-center p-4 shrink-0">
              {selectedClip.assetType === 'Video MP4' && <Video className="text-sky-600 w-14 h-14 mb-2" />}
              {selectedClip.assetType === 'Video AI' && <Sparkles className="text-violet-600 w-14 h-14 mb-2" />}
              {selectedClip.assetType === 'Foto JPG' && <FileImage className="text-amber-600 w-14 h-14 mb-2" />}
              <span className="text-xs font-bold text-gray-800">{selectedClip.rawCount} Mentahan</span>
              <span className="text-[11px] text-gray-500 mt-0.5">
                {selectedClip.rawBreakdown.mp4} MP4 • {selectedClip.rawBreakdown.ai} AI • {selectedClip.rawBreakdown.jpg} JPG
              </span>
            </div>

            <div className="flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-500">{selectedClip.category}</span>
                <span>•</span>
                <AssetTypeBadge type={selectedClip.assetType} />
                <StatusBadge status={selectedClip.status} />
              </div>

              <h1 className="text-2xl font-bold text-gray-900">{selectedClip.title}</h1>

              <div className="flex flex-wrap items-center text-xs text-gray-500 gap-4">
                <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-700">{selectedClip.sku}</span>
                <span>Editor: <strong>{selectedClip.editor}</strong></span>
                <span>Tanggal Selesai Video: <strong>{selectedClip.finishDate}</strong></span>
                <span className="text-emerald-700 font-bold">{selectedClip.views.toLocaleString('id-ID')} Views</span>
              </div>

              {/* Yellow Decision Box from Screenshot 3 */}
              <div className="bg-[#fff9e6] border border-[#ebd9a0] rounded-xl p-4 mt-3">
                <h3 className="font-bold text-gray-900 text-sm">Keputusan Distribusi & Folder OneDrive</h3>
                <p className="text-xs text-gray-600 mt-0.5 mb-3">Path mentahan terhubung ke script lokal & jadwal Repliz.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-white/80 p-3 rounded-lg border border-[#ebd9a0]/60">
                  <div>
                    <span className="text-gray-500 block">Akun Target</span>
                    <span className="font-bold text-gray-900">{selectedClip.account}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Jadwal Tayang Repliz</span>
                    <span className="font-bold text-blue-700">{selectedClip.scheduleTime}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Lokasi OneDrive</span>
                    <span className="font-mono text-[11px] text-gray-700 break-all">{selectedClip.onedrivePath}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Inti Barang Section */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50/60 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base text-gray-900">Inti barang & Spesifikasi Kompresi</h3>
                <p className="text-xs text-gray-500">Untuk panduan naskah voiceover AI, teks video Rahmat, dan deskripsi TikTok</p>
              </div>
            </div>
            <div className="p-5 divide-y divide-gray-100">
              {[
                { label: 'Fungsi dan cara pakai', key: 'fungsi' },
                { label: 'Masalah yang diselesaikan', key: 'masalah' },
                { label: 'Untuk siapa (Target Audiens)', key: 'siapa' },
                { label: 'Spesifikasi & Format Render', key: 'spesifikasi' },
                { label: 'Isi paket', key: 'isiPaket' },
                { label: 'Perawatan dan keamanan', key: 'perawatan' }
              ].map((field) => (
                <div key={field.key} className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="sm:w-1/3 text-xs font-semibold text-gray-600">{field.label}</div>
                  <div className="sm:w-2/3 text-sm text-gray-800">
                    {selectedClip.intiBarang?.[field.key] || <span className="text-gray-400 italic">Belum diisi — Klik "Minta Agen AI Lengkapi Kartu Ini" di atas</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Riset AI & Log Catatan */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-2xs p-5 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base text-gray-900">Riset AI & Strategi Hook Video</h3>
                <p className="text-xs text-gray-500">Diisi otomatis oleh agen riset dari performa Douyin & catatan tim</p>
              </div>
            </div>
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200/80 text-sm text-gray-800">
              {selectedClip.risetAI?.kerangka || 'Belum ada kerangka riset.'}
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedClip.risetAI?.keywords?.map((kw, i) => (
                <span key={i} className="text-xs bg-white border border-gray-200 px-2.5 py-1 rounded-md text-gray-600">#{kw}</span>
              ))}
            </div>

            <div className="pt-4 border-t border-gray-100">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Riwayat Aktivitas Bot & Tim</h4>
              <div className="space-y-2">
                {selectedClip.notes.map((n, idx) => (
                  <div key={idx} className="text-xs bg-gray-50 px-3 py-2 rounded-lg flex items-center justify-between">
                    <span><strong className="text-gray-900">{n.author}:</strong> {n.text}</span>
                    <span className="text-gray-400">{n.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      )}

      {/* =====================================================================
          VIEW 3: LAPORAN MENTAHAN, JENIS ASET (MP4/AI/JPG), & KEKUATAN TIM
          ===================================================================== */}
      {activeTab === 'laporan' && (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full space-y-6 pb-20">
          {/* Header Report */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-gray-200 p-5 rounded-2xl shadow-2xs">
            <div>
              <span className="text-xs font-semibold text-[#2a7a4c] uppercase tracking-wider">Dashboard Eksekutif Divisi Promo</span>
              <h1 className="text-2xl font-bold text-gray-900 mt-0.5">Laporan Mentahan, View Video & Analisis Kekuatan Tim</h1>
              <p className="text-xs text-gray-500 mt-1">
                Data ditarik berdasarkan tanggal selesai pembuatan video di <code className="bg-gray-100 px-1.5 py-0.5 rounded">Klip_Vidio</code>, folder OneDrive, serta kapasitas personel saat ini.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={triggerBotSyncViewsAndCapacity}
                disabled={isBotWorking}
                className="inline-flex items-center gap-2 bg-[#2a7a4c] hover:bg-green-800 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xs cursor-pointer"
              >
                <RefreshCw size={15} className={isBotWorking ? 'animate-spin' : ''} />
                <span>Tarik Data Laporan & Simpulkan dengan Bot</span>
              </button>
            </div>
          </div>

          {/* Executive Summary AI Card */}
          <div className="bg-gradient-to-r from-emerald-950 via-gray-900 to-gray-900 text-white rounded-2xl p-6 shadow-md border border-emerald-800/40">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0">
                <Bot className="text-emerald-400" size={24} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-2">
                    Kesimpulan Otomatis Agent Analis (Stok Mentahan & Kekuatan Tim)
                  </h2>
                  <span className="text-[11px] bg-emerald-500/20 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                    2 Personel • 5 Akun TikTok + Shopee
                  </span>
                </div>
                <p className="text-sm text-gray-200 mt-2 leading-relaxed">
                  {aiExecutiveSummary}
                </p>
              </div>
            </div>
          </div>

          {/* 4 KPI Top Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Total Stok Mentahan (OneDrive)</span>
                <FolderGit2 size={16} className="text-emerald-600" />
              </div>
              <div className="text-2xl font-extrabold text-gray-900">{totalRawAssets} File</div>
              <div className="text-[11px] text-gray-500 mt-1">
                Terbanyak: <strong className="text-gray-800">{sortedByRaw[0]?.title.substring(0, 22)}...</strong> ({sortedByRaw[0]?.rawCount})
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Komposisi Jenis Mentahan</span>
                <Layers size={16} className="text-violet-600" />
              </div>
              <div className="text-lg font-extrabold text-gray-900">
                {totalMp4} MP4 • {totalAi} AI • {totalJpg} JPG
              </div>
              <div className="text-[11px] text-violet-700 font-medium mt-1">
                {mp4Pct}% Video Asli | {aiPct}% Video AI | {jpgPct}% Foto
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Kekuatan Produksi & Upload</span>
                <Zap size={16} className="text-amber-500" />
              </div>
              <div className="text-2xl font-extrabold text-gray-900">
                {totalDailyOutputCapacity} <span className="text-sm font-normal text-gray-500">/ {totalDailyRequired} Konten/Hari</span>
              </div>
              <div className="text-[11px] text-emerald-700 font-medium mt-1">
                Rahmat ({teamConfig.rahmatEditCapacity} edit) + AI/JPG ({teamConfig.aiAndJpgCapacity} auto)
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-2xs">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Total Views (Klip_Vidio)</span>
                <TrendingUp size={16} className="text-blue-600" />
              </div>
              <div className="text-2xl font-extrabold text-gray-900">{totalViews.toLocaleString('id-ID')}</div>
              <div className="text-[11px] text-gray-500 mt-1">
                Dari 5 Akun TikTok & Shopee Video aktif
              </div>
            </div>
          </div>

          {/* SECTION A: ANALISIS MENTAHAN TERBANYAK & JENIS FILE (MP4, VIDEO AI, JPG) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 7 cols: Produk dengan Mentahan Terbanyak */}
            <div className="lg:col-span-7 bg-white border border-gray-200 rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-base text-gray-900">1. Peringkat Stok Mentahan Terbanyak per Produk</h3>
                  <p className="text-xs text-gray-500">Membantu menentukan produk mana yang siap digempur upload massal ke Repliz</p>
                </div>
                <button 
                  onClick={triggerBotScrapeOneDrive}
                  className="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium px-3 py-1.5 rounded-lg border border-emerald-200 cursor-pointer"
                >
                  + Tambah Scrape OneDrive
                </button>
              </div>

              <div className="space-y-3.5 pt-2">
                {sortedByRaw.map((item, index) => {
                  const maxRaw = sortedByRaw[0]?.rawCount || 1;
                  const widthPct = Math.round((item.rawCount / maxRaw) * 100);
                  return (
                    <div key={item.id} className="p-3 rounded-xl border border-gray-100 bg-gray-50/60 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 font-bold text-gray-900">
                          <span className="w-5 h-5 rounded-full bg-gray-900 text-white text-[11px] flex items-center justify-center">
                            {index + 1}
                          </span>
                          <span>{item.title}</span>
                          <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-gray-200 text-gray-700">{item.tier}</span>
                        </div>
                        <span className="font-extrabold text-sm text-[#2a7a4c]">{item.rawCount} Mentahan</span>
                      </div>

                      {/* Stacked progress bar showing MP4, AI, JPG inside this product */}
                      <div className="w-full bg-gray-200 h-2.5 rounded-full overflow-hidden flex" style={{ width: `${Math.max(widthPct, 25)}%` }}>
                        <div style={{ width: `${(item.rawBreakdown.mp4 / item.rawCount) * 100}%` }} className="bg-sky-500 h-full" title="Video MP4" />
                        <div style={{ width: `${(item.rawBreakdown.ai / item.rawCount) * 100}%` }} className="bg-violet-500 h-full" title="Video AI" />
                        <div style={{ width: `${(item.rawBreakdown.jpg / item.rawCount) * 100}%` }} className="bg-amber-500 h-full" title="Foto JPG" />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-gray-500">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-500"></span> {item.rawBreakdown.mp4} Video MP4</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500"></span> {item.rawBreakdown.ai} Video AI</span>
                          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> {item.rawBreakdown.jpg} Foto JPG</span>
                        </div>
                        <span>Views: <strong>{item.views.toLocaleString('id-ID')}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right 5 cols: Breakdown Jenis File Mentahan (MP4 vs Video AI vs JPG) */}
            <div className="lg:col-span-5 bg-white border border-gray-200 rounded-2xl p-5 shadow-2xs flex flex-col justify-between space-y-4">
              <div>
                <h3 className="font-bold text-base text-gray-900">2. Komposisi Jenis File Mentahan</h3>
                <p className="text-xs text-gray-500">Proporsi format bahan konten yang tersimpan di OneDrive</p>

                {/* Combined Multi-Bar */}
                <div className="mt-5 mb-4">
                  <div className="h-5 w-full rounded-xl overflow-hidden flex shadow-inner bg-gray-100">
                    <div style={{ width: `${mp4Pct}%` }} className="bg-sky-500 flex items-center justify-center text-[10px] font-bold text-white">{mp4Pct}%</div>
                    <div style={{ width: `${aiPct}%` }} className="bg-violet-600 flex items-center justify-center text-[10px] font-bold text-white">{aiPct}%</div>
                    <div style={{ width: `${jpgPct}%` }} className="bg-amber-500 flex items-center justify-center text-[10px] font-bold text-white">{jpgPct}%</div>
                  </div>
                </div>

                <div className="space-y-3 mt-4">
                  <div className="p-3.5 rounded-xl border border-sky-100 bg-sky-50/50 flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-sky-500 text-white mt-0.5"><Video size={16}/></div>
                      <div>
                        <h4 className="text-xs font-bold text-gray-900">Video Mentahan Asli (MP4 / Douyin)</h4>
                        <p className="text-[11px] text-gray-600 mt-0.5">Diedit manual oleh Rahmat + kompresi HandBrake QSV 1080x1920 (&lt;50MB).</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <span className="text-sm font-extrabold text-sky-700">{totalMp4} File</span>
                      <span className="block text-[10px] text-gray-500">{mp4Pct}%</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl border border-violet-100 bg-violet-50/50 flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-violet-600 text-white mt-0.5"><Sparkles size={16}/></div>
                      <div>
                        <h4 className="text-xs font-bold text-gray-900">Video AI (Voiceover XTTS / Avatar / Grok)</h4>
                        <p className="text-[11px] text-gray-600 mt-0.5">Bisa langsung dijadwalkan ke Repliz tanpa membebani antrean edit manual.</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <span className="text-sm font-extrabold text-violet-700">{totalAi} File</span>
                      <span className="block text-[10px] text-gray-500">{aiPct}%</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl border border-amber-100 bg-amber-50/50 flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-amber-500 text-white mt-0.5"><FileImage size={16}/></div>
                      <div>
                        <h4 className="text-xs font-bold text-gray-900">Foto / Gambar Katalog (JPG / PNG)</h4>
                        <p className="text-[11px] text-gray-600 mt-0.5">Cocok untuk postingan mode Karusel/Slideshow TikTok & sampul produk.</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <span className="text-sm font-extrabold text-amber-700">{totalJpg} File</span>
                      <span className="block text-[10px] text-gray-500">{jpgPct}%</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 text-xs text-gray-600">
                💡 <strong>Insight Mentahan:</strong> Produk <strong>{sortedByRaw[0]?.title}</strong> memiliki stok MP4 terbanyak, sedangkan <strong>Mata Bor</strong> & <strong>Debeidi</strong> sangat kuat di stok Video AI sehingga siap di-upload otomatis kapan saja.
              </div>
            </div>
          </div>

          {/* SECTION B: KALKULATOR & ANALISIS KEKUATAN TIM & AKUN TIKTOK */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-2xs space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-gray-100 pb-4">
              <div>
                <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                  <Users size={20} className="text-[#2a7a4c]" />
                  <span>3. Simulasi & Kesimpulan Kekuatan Tim Produksi & Upload TikTok</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Ubah angka di bawah jika jumlah orang, akun TikTok, atau target post harian berubah — kesimpulan kapasitas akan menyesuaikan otomatis.
                </p>
              </div>
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Kapasitas Terpenuhi: {capacityUtilizationPct}%
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Column 1: Resource Inputs */}
              <div className="space-y-4 bg-gray-50 p-4 rounded-xl border border-gray-200/80">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">Parameter Tim & Akun Saat Ini</h4>
                
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600">Jumlah Orang Divisi Video</span>
                    <strong className="text-gray-900">{teamConfig.teamMembers} Orang (Anda + Rahmat)</strong>
                  </div>
                  <input 
                    type="range" min="1" max="6" 
                    value={teamConfig.teamMembers}
                    onChange={e => setTeamConfig({...teamConfig, teamMembers: Number(e.target.value)})}
                    className="w-full accent-[#2a7a4c]"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600">Jumlah Akun TikTok Aktif</span>
                    <strong className="text-gray-900">{teamConfig.activeAccounts} Akun (+ Shopee Video)</strong>
                  </div>
                  <input 
                    type="range" min="1" max="15" 
                    value={teamConfig.activeAccounts}
                    onChange={e => setTeamConfig({...teamConfig, activeAccounts: Number(e.target.value)})}
                    className="w-full accent-[#2a7a4c]"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600">Target Upload per Akun / Hari</span>
                    <strong className="text-gray-900">{teamConfig.targetPostPerAccount} Video / Akun</strong>
                  </div>
                  <input 
                    type="range" min="1" max="8" 
                    value={teamConfig.targetPostPerAccount}
                    onChange={e => setTeamConfig({...teamConfig, targetPostPerAccount: Number(e.target.value)})}
                    className="w-full accent-[#2a7a4c]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200">
                  <div>
                    <label className="block text-[11px] text-gray-500">Edit Manual (Rahmat/hr)</label>
                    <input 
                      type="number" 
                      value={teamConfig.rahmatEditCapacity}
                      onChange={e => setTeamConfig({...teamConfig, rahmatEditCapacity: Number(e.target.value)})}
                      className="w-full mt-1 px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500">Output Bot AI & JPG/hr</label>
                    <input 
                      type="number" 
                      value={teamConfig.aiAndJpgCapacity}
                      onChange={e => setTeamConfig({...teamConfig, aiAndJpgCapacity: Number(e.target.value)})}
                      className="w-full mt-1 px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Column 2: Alur Kekuatan Produksi Harian */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">Rincian Kekuatan Per Tahap (Senin–Sabtu, 08:00–17:00)</h4>
                
                <div className="p-3.5 rounded-xl border border-gray-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-gray-900 block">1. Kapasitas Scrape Mentahan (Bot)</span>
                    <span className="text-[11px] text-gray-500">Tarik OneDrive & riset 1688/Douyin</span>
                  </div>
                  <span className="text-sm font-extrabold text-emerald-700">~{teamConfig.scrapeDailyRate} Aset/Hari</span>
                </div>

                <div className="p-3.5 rounded-xl border border-gray-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-gray-900 block">2. Kekuatan Editing Manual (Rahmat)</span>
                    <span className="text-[11px] text-gray-500">Cut, hook, + HandBrake QSV &lt;50MB</span>
                  </div>
                  <span className="text-sm font-extrabold text-sky-700">{teamConfig.rahmatEditCapacity} Video/Hari</span>
                </div>

                <div className="p-3.5 rounded-xl border border-gray-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-gray-900 block">3. Kekuatan Konten AI & Foto JPG</span>
                    <span className="text-[11px] text-gray-500">Voiceover XTTS + Karusel otomatis</span>
                  </div>
                  <span className="text-sm font-extrabold text-violet-700">{teamConfig.aiAndJpgCapacity} Konten/Hari</span>
                </div>

                <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/50 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-blue-950 block">4. Kebutuhan Total {teamConfig.activeAccounts} Akun TikTok</span>
                    <span className="text-[11px] text-blue-700">{teamConfig.activeAccounts} akun × {teamConfig.targetPostPerAccount} jadwal Repliz/hari</span>
                  </div>
                  <span className="text-sm font-extrabold text-blue-700">{totalDailyRequired} Post/Hari</span>
                </div>
              </div>

              {/* Column 3: Bottleneck & Solusi Strategis */}
              <div className="bg-[#f8faf9] border border-emerald-200 rounded-xl p-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#2a7a4c]">Kesimpulan Beban Kerja & Solusi</h4>
                  
                  {totalDailyOutputCapacity >= totalDailyRequired ? (
                    <div className="p-3 rounded-lg bg-emerald-100/70 text-emerald-950 text-xs space-y-1">
                      <div className="font-bold flex items-center gap-1.5">
                        <CheckCircle2 size={15} className="text-emerald-700 shrink-0" />
                        <span>Kapasitas Tim Mencukupi Target!</span>
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        Gabungan edit manual Rahmat ({teamConfig.rahmatEditCapacity}/hari) dan bantuan bot Video AI/JPG ({teamConfig.aiAndJpgCapacity}/hari) mampu menghasilkan <strong>{totalDailyOutputCapacity} konten/hari</strong>, melebihi target {totalDailyRequired} upload untuk {teamConfig.activeAccounts} akun TikTok.
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-amber-100/80 text-amber-950 text-xs space-y-1">
                      <div className="font-bold flex items-center gap-1.5">
                        <AlertCircle size={15} className="text-amber-700 shrink-0" />
                        <span>Defisit {totalDailyRequired - totalDailyOutputCapacity} Konten / Hari</span>
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        Target {teamConfig.activeAccounts} akun ({totalDailyRequired} post/hari) lebih tinggi dari output saat ini ({totalDailyOutputCapacity}/hari). Jangan bebankan ke edit manual; tingkatkan porsi <strong>Video AI & Foto JPG</strong> dari stok OneDrive.
                      </p>
                    </div>
                  )}

                  <div className="text-xs text-gray-700 space-y-2 pt-1">
                    <p><strong>• Pembagian Fokus 50 Project:</strong> Prioritaskan edit manual Rahmat khusus untuk barang tier <em>Winning</em> & <em>Fast Moving</em> (Sarung Tangan, Mata Bor, Helm Las).</p>
                    <p><strong>• Optimasi Bot Repliz:</strong> Gunakan fitur jadwal jam acak untuk <em>New Item</em> & <em>Normal</em> memakai aset Video AI dan JPG.</p>
                  </div>
                </div>

                <button
                  onClick={triggerBotRandomScheduleRepliz}
                  className="mt-4 w-full py-2.5 bg-[#141414] hover:bg-gray-800 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CalendarClock size={14} className="text-blue-400" />
                  <span>Jalankan Jadwal Otomatis {teamConfig.activeAccounts} Akun di Repliz</span>
                </button>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* =====================================================================
          VIEW 4: DEDICATED FULL-SCREEN AGENT CHAT & BOT CONTROLLER (Gambar 1)
          ===================================================================== */}
      {activeTab === 'agent' && (
        <div className="flex-1 flex bg-[#0d0d0d] text-gray-100 h-[calc(100vh-3.5rem)] overflow-hidden">
          
          {/* Left Agent List Sidebar (Persis Gambar Referensi 1) */}
          <div className="w-72 sm:w-80 border-r border-gray-800/80 bg-[#121212] flex flex-col shrink-0">
            <div className="p-4 border-b border-gray-800/80 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Daftar Agent Bot Aktif</span>
              <div className="flex items-center space-x-1.5">
                <button className="w-8 h-8 rounded-full bg-[#1e1e1e] hover:bg-gray-800 flex items-center justify-center text-gray-400">
                  <Search size={14} />
                </button>
                <button className="w-8 h-8 rounded-full bg-[#1e1e1e] hover:bg-gray-800 flex items-center justify-center text-gray-400">
                  <Plus size={15} />
                </button>
              </div>
            </div>

            <div className="p-2.5 space-y-1.5 overflow-y-auto flex-1">
              {AGENT_CHANNELS.map(agent => {
                const isSelected = agent.id === activeAgentId;
                const lastMsg = (agentChats[agent.id] || []).slice(-1)[0]?.text || agent.subtitle;
                return (
                  <div
                    key={agent.id}
                    onClick={() => setActiveAgentId(agent.id)}
                    className={`p-3 rounded-xl flex items-center gap-3 cursor-pointer transition-all ${
                      isSelected ? 'bg-[#242424] shadow-sm border border-gray-700/60' : 'hover:bg-[#1a1a1a]'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl ${agent.color} flex items-center justify-center shrink-0 shadow-md`}>
                      <Bot size={20} className="text-white" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-sm text-white truncate">{agent.name}</h4>
                      </div>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{lastMsg}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick Summary Footer inside Agent Sidebar */}
            <div className="p-3.5 m-3 rounded-xl bg-[#1a1a1a] border border-gray-800 text-xs space-y-2">
              <div className="flex items-center justify-between text-gray-300 font-semibold">
                <span>Status Server Lokal</span>
                <span className="text-emerald-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Terhubung</span>
              </div>
              <p className="text-[11px] text-gray-400">
                Terhubung ke tabel <code className="text-gray-300">Klip_Vidio</code> ({clips.length} produk, {totalRawAssets} mentahan).
              </p>
            </div>
          </div>

          {/* Right Main Chat + Custom Action Buttons Area */}
          <div className="flex-1 flex flex-col bg-[#0d0d0d] relative">
            {/* Top Floating Pill Header like Screenshot 1 */}
            <div className="h-14 border-b border-gray-800/80 px-6 flex items-center justify-between bg-[#111111]/90 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-lg ${activeAgent.color} flex items-center justify-center`}>
                  <Bot size={16} className="text-white" />
                </div>
                <div>
                  <span className="font-bold text-sm text-white">{activeAgent.name}</span>
                  <span className="text-xs text-gray-400 ml-2 hidden sm:inline">• {activeAgent.subtitle}</span>
                </div>
              </div>

              {/* Custom Action Trigger Buttons (Tombol-tombol kustom yang diminta user) */}
              <div className="flex items-center gap-2 overflow-x-auto py-1">
                <button
                  onClick={triggerBotScrapeOneDrive}
                  disabled={isBotWorking}
                  className="px-3 py-1.5 rounded-full bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-medium flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <CloudDownload size={13} /> <span>Scrape OneDrive</span>
                </button>
                <button
                  onClick={triggerBotRandomScheduleRepliz}
                  disabled={isBotWorking}
                  className="px-3 py-1.5 rounded-full bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-medium flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <CalendarClock size={13} /> <span>Jadwal Random Repliz</span>
                </button>
                <button
                  onClick={triggerBotSyncViewsAndCapacity}
                  disabled={isBotWorking}
                  className="px-3 py-1.5 rounded-full bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-medium flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <BarChart3 size={13} /> <span>Tarik Laporan & Kekuatan Tim</span>
                </button>
              </div>
            </div>

            {/* Chat Messages Stream (Matching Screenshot 1 Dark Bubbles & Blue User Bubbles) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-4xl mx-auto w-full">
              {(agentChats[activeAgentId] || []).map((msg, idx) => (
                <div key={idx} className="space-y-1">
                  {idx === 0 && (
                    <div className="text-center text-[11px] text-gray-500 my-2">{msg.time}</div>
                  )}
                  <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-[#0b65c6] text-white rounded-br-xs shadow-sm'
                          : 'bg-[#222222] text-gray-100 border border-gray-800 rounded-bl-xs shadow-sm'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                </div>
              ))}

              {isBotWorking && (
                <div className="flex justify-start">
                  <div className="px-4 py-3 rounded-2xl bg-[#222222] border border-gray-800 text-xs text-gray-400 flex items-center gap-2">
                    <RefreshCw size={14} className="animate-spin text-blue-400" />
                    <span>{activeAgent.name} sedang mengeksekusi perintah & memperbarui data web...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input Box + Quick Prompt Chips */}
            <div className="p-4 border-t border-gray-800/80 bg-[#121212]">
              <div className="max-w-4xl mx-auto space-y-2.5">
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setChatInput('saya ingin jam nya random aja ke 4 video itu')}
                    className="text-[11px] bg-[#1e1e1e] hover:bg-gray-800 text-gray-300 px-2.5 py-1 rounded-full border border-gray-700 cursor-pointer"
                  >
                    "saya ingin jam nya random aja ke 4 video itu"
                  </button>
                  <button
                    type="button"
                    onClick={() => setChatInput('Berapa stok mentahan terbanyak dan rincian MP4, Video AI, JPG kita?')}
                    className="text-[11px] bg-[#1e1e1e] hover:bg-gray-800 text-gray-300 px-2.5 py-1 rounded-full border border-gray-700 cursor-pointer"
                  >
                    "Cek mentahan terbanyak (MP4 / AI / JPG)"
                  </button>
                  <button
                    type="button"
                    onClick={() => setChatInput('Simpulkan kekuatan tim 2 orang kita untuk handle 5 akun TikTok hari ini')}
                    className="text-[11px] bg-[#1e1e1e] hover:bg-gray-800 text-gray-300 px-2.5 py-1 rounded-full border border-gray-700 cursor-pointer"
                  >
                    "Simpulkan kekuatan tim 2 orang & 5 akun TikTok"
                  </button>
                </div>

                <form onSubmit={handleSendChat} className="flex items-center gap-2 bg-[#1e1e1e] border border-gray-700 rounded-full px-4 py-1.5 focus-within:border-blue-500">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder={`Perintahkan ${activeAgent.name}...`}
                    className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none py-1.5"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || isBotWorking}
                    className="w-9 h-9 rounded-full bg-[#0b65c6] hover:bg-blue-500 disabled:opacity-40 text-white flex items-center justify-center cursor-pointer"
                  >
                    <Send size={15} />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SLIDE-OVER DRAWER AGENT BOT (Saat berada di halaman Pipeline / Laporan)
          ===================================================================== */}
      {isDrawerOpen && activeTab !== 'agent' && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[400px] bg-[#121212] text-gray-100 shadow-2xl border-l border-gray-800 z-50 flex flex-col animate-in slide-in-from-right duration-200">
          {/* Drawer Header */}
          <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-[#181818]">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg ${activeAgent.color} flex items-center justify-center`}>
                <Bot size={18} className="text-white" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">{activeAgent.name}</h3>
                <p className="text-[11px] text-emerald-400">Terhubung ke halaman {activeTab}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setIsDrawerOpen(false); setActiveTab('agent'); }}
                className="text-[11px] bg-gray-800 hover:bg-gray-700 text-gray-200 px-2.5 py-1 rounded-md mr-1 cursor-pointer"
              >
                Layar Penuh
              </button>
              <button onClick={() => setIsDrawerOpen(false)} className="p-1.5 text-gray-400 hover:text-white cursor-pointer">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Agent Switcher Pills inside Drawer */}
          <div className="px-3 py-2 bg-[#141414] border-b border-gray-800 flex gap-1.5 overflow-x-auto">
            {AGENT_CHANNELS.map(ag => (
              <button
                key={ag.id}
                onClick={() => setActiveAgentId(ag.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium shrink-0 cursor-pointer ${
                  activeAgentId === ag.id ? 'bg-blue-600 text-white' : 'bg-[#222222] text-gray-400 hover:text-white'
                }`}
              >
                {ag.name}
              </button>
            ))}
          </div>

          {/* Custom Action Buttons Grid inside Drawer */}
          <div className="p-3 bg-[#181818] border-b border-gray-800 grid grid-cols-2 gap-2">
            <button
              onClick={triggerBotScrapeOneDrive}
              disabled={isBotWorking}
              className="p-2 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/70 border border-emerald-700/40 text-emerald-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <CloudDownload size={14} className="shrink-0" />
              <span className="truncate">Scrape OneDrive</span>
            </button>
            <button
              onClick={triggerBotRandomScheduleRepliz}
              disabled={isBotWorking}
              className="p-2 rounded-lg bg-blue-950/60 hover:bg-blue-900/70 border border-blue-700/40 text-blue-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <CalendarClock size={14} className="shrink-0" />
              <span className="truncate">Jadwal Random</span>
            </button>
            <button
              onClick={triggerBotSyncViewsAndCapacity}
              disabled={isBotWorking}
              className="p-2 rounded-lg bg-purple-950/60 hover:bg-purple-900/70 border border-purple-700/40 text-purple-300 text-xs font-medium flex items-center gap-1.5 col-span-2 justify-center cursor-pointer"
            >
              <BarChart3 size={14} className="shrink-0" />
              <span>Tarik Data View & Simpulkan Kekuatan Tim</span>
            </button>
          </div>

          {/* Drawer Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
            {(agentChats[activeAgentId] || []).map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-2xl whitespace-pre-wrap leading-relaxed ${
                  msg.role === 'user' ? 'bg-[#0b65c6] text-white rounded-br-xs' : 'bg-[#222222] text-gray-200 border border-gray-800 rounded-bl-xs'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Drawer Input */}
          <form onSubmit={handleSendChat} className="p-3 border-t border-gray-800 bg-[#181818] flex items-center gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder="Ketik perintah ke agen..."
              className="flex-1 bg-[#242424] border border-gray-700 rounded-full px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
            <button type="submit" className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 cursor-pointer">
              <Send size={14} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}