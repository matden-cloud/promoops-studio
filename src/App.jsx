import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, Video, Eye, RefreshCw, ExternalLink, Edit3, Sparkles, 
  Search, LayoutDashboard, BarChart2, MessageSquare, Database,
  Calendar, Filter, Zap, Flame, Rocket
} from 'lucide-react';

export default function App() {
  const [activeMenu, setActiveMenu] = useState('analitik'); 

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [filterBulan, setFilterBulan] = useState('Semua');
  const [filterAkun, setFilterAkun] = useState('Semua');
  const [filterFyp, setFilterFyp] = useState('Semua');

  const API_URL = "https://script.google.com/macros/s/AKfycbwTxa-MqVkrK65FPqNfR8ZglL17sZQ5QTExgQ0jtc_U--MXMoo4PrHnpOlpfmZQaS1n0g/exec";

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

  // LOGIKA BARU: Deteksi Kelas FYP berdasarkan teks dari Bot Apps Script
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

  // LOGIKA BARU: Pewarnaan Badge Otomatis
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
          item.Link_Postingan && 
          item.Link_Postingan.includes("tiktok.com") && 
          item.Induk_Barang && 
          item.Induk_Barang.trim() !== ""
        );
        setData(validData.reverse());
      }
    } catch (err) {
      setError("Terjadi kesalahan jaringan.");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

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

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 pb-12">
      
      {/* HEADER NAVIGASI */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3 w-1/4">
          <div className="w-10 h-10 bg-emerald-700 text-white rounded-lg flex items-center justify-center font-bold text-lg">RP</div>
          <div>
            <h1 className="font-bold text-gray-900 text-sm">PromoOps & Riset</h1>
            <p className="text-xs text-gray-500">Klip_Vidio • OneDrive • Repliz</p>
          </div>
        </div>
        
        <div className="flex bg-gray-50 p-1 rounded-lg border border-gray-200 shadow-inner">
          <button onClick={() => setActiveMenu('pipeline')} className={`px-4 py-2 text-sm font-semibold rounded-md flex items-center gap-2 transition-all ${activeMenu === 'pipeline' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
            <LayoutDashboard className="w-4 h-4" /> Pipeline & Barang (5)
          </button>
          <button onClick={() => setActiveMenu('analitik')} className={`px-4 py-2 text-sm font-semibold rounded-md flex items-center gap-2 transition-all ${activeMenu === 'analitik' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
            <BarChart2 className="w-4 h-4" /> Laporan Analitik FYP
          </button>
          <button className="px-4 py-2 text-sm font-semibold rounded-md flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-all">
            <MessageSquare className="w-4 h-4" /> Agent Chat & Bot (Full) <span className="w-2 h-2 bg-emerald-500 rounded-full ml-1"></span>
          </button>
        </div>

        <div className="flex items-center gap-3 w-1/4 justify-end">
          <button className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors">
            <Database className="w-4 h-4" /> Buka Agent Bot
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 rounded-full bg-white">
            <div className="w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-xs font-bold">DV</div>
            <span className="text-xs font-semibold text-gray-700">Divisi Promo (2 Orang)</span>
          </div>
        </div>
      </div>

      {/* HALAMAN 1: PIPELINE */}
      {activeMenu === 'pipeline' && (
        <div className="p-6 md:p-8 max-w-[1400px] mx-auto animate-in fade-in duration-300">
          <div className="text-xs text-gray-400 mb-4 font-medium tracking-wide">/ Klip_Vidio / Pipeline</div>
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Pipeline riset barang & mentahan video</h2>
              <p className="text-gray-500 text-sm mt-1">Satu kode = satu barang/kampanye video. Klik kartu untuk buka detail, catatan editor Rahmat, dan jadwal Repliz.</p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button className="bg-white border border-gray-300 text-emerald-700 hover:bg-emerald-50 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm">
                  <Database className="w-4 h-4" /> Scrape Mentahan OneDrive
                </button>
                <button className="bg-white border border-gray-300 text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm">
                  <Calendar className="w-4 h-4" /> Jadwal Random Repliz
                </button>
              </div>
              <button className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm">
                <BarChart2 className="w-4 h-4" /> Lihat Laporan & Kekuatan Tim
              </button>
            </div>
          </div>
          
          {/* Form Pencarian & Kartu Pipeline diringkas (Sama dengan versi sebelumnya) */}
          <div className="flex gap-4 mb-8">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search className="h-5 w-5 text-gray-400" /></div>
              <input type="text" placeholder="Cari kode SKU, nama barang, kategori..." className="bg-white border border-gray-300 text-sm rounded-xl focus:ring-emerald-500 focus:border-emerald-500 block w-full pl-10 p-3 shadow-sm" />
            </div>
            <button className="bg-white border border-gray-300 px-6 py-3 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 shadow-sm">Cari</button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center text-gray-500">
               <Video className="w-12 h-12 mx-auto mb-3 text-gray-300" />
               <p>Daftar Kartu Pipeline Aktif (Sesuai desain Anda sebelumnya)</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center text-gray-500">
               <p>Form Input Barang Baru</p>
            </div>
          </div>
        </div>
      )}

      {/* HALAMAN 2: LAPORAN ANALITIK FYP */}
      {activeMenu === 'analitik' && (
        <div className="p-6 md:p-8 max-w-[1400px] mx-auto animate-in fade-in duration-300">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Performa FYP & Evaluasi</h2>
              <p className="text-gray-500 mt-1">Saring data, pantau view, dan minta AI menganalisa hook video.</p>
            </div>
            <button onClick={fetchData} disabled={loading} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Menyinkronkan...' : 'Sinkron Data Sheet'}
            </button>
          </div>

          {/* BARIS FILTER BARU DENGAN TINGKATAN FYP */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-700 mr-2">
              <Filter className="w-5 h-5 text-emerald-600" /> Filter Data:
            </div>
            <select value={filterBulan} onChange={(e) => setFilterBulan(e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg block p-2.5 font-semibold min-w-[150px]">
              {listBulan.map(b => <option key={b} value={b}>{b === 'Semua' ? '📅 Semua Bulan' : b}</option>)}
            </select>
            <select value={filterAkun} onChange={(e) => setFilterAkun(e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg block p-2.5 font-semibold min-w-[150px]">
              {listAkun.map(a => <option key={a} value={a}>{a === 'Semua' ? '👤 Semua Akun' : a}</option>)}
            </select>
            <select value={filterFyp} onChange={(e) => setFilterFyp(e.target.value)} className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-lg block p-2.5 font-semibold min-w-[150px]">
              <option value="Semua">🔥 Semua Status</option>
              <option value="Semua FYP">✨ Seluruh FYP (All Tiers)</option>
              <option value="FYP Awal">⭐ FYP Awal (10k+)</option>
              <option value="Berkelanjutan">📈 Berkelanjutan (50k+)</option>
              <option value="Mega FYP">🔥 Mega FYP (100k+)</option>
              <option value="Super Viral">🚀 Super Viral (1M+)</option>
              <option value="Belum FYP">📉 Belum FYP</option>
            </select>
          </div>

          {/* WIDGET STATISTIK */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-5">
              <div className="p-4 bg-blue-50 text-blue-600 rounded-xl"><Video className="w-7 h-7" /></div>
              <div>
                <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Video Terfilter</p>
                <h3 className="text-3xl font-black text-gray-900 mt-1">{statTotalVideo} <span className="text-sm font-semibold text-gray-400 normal-case">klip</span></h3>
              </div>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-5">
              <div className="p-4 bg-purple-50 text-purple-600 rounded-xl"><Eye className="w-7 h-7" /></div>
              <div>
                <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Akumulasi View</p>
                <h3 className="text-3xl font-black text-gray-900 mt-1">{statTotalView.toLocaleString('id-ID')} <span className="text-sm font-semibold text-gray-400 normal-case">tayangan</span></h3>
              </div>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-5">
              <div className="p-4 bg-orange-50 text-orange-600 rounded-xl"><TrendingUp className="w-7 h-7" /></div>
              <div>
                <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Tembus Algoritma</p>
                <h3 className="text-3xl font-black text-gray-900 mt-1">{statFyp} <span className="text-sm font-semibold text-gray-400 normal-case">video</span></h3>
              </div>
            </div>
          </div>

          {/* TABEL DATA */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
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
                    filteredData.slice(0, 100).map((row, index) => {
                      // Ambil gaya pewarnaan dinamis
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
                              <button className="flex items-center justify-center gap-1.5 w-full bg-purple-50 text-purple-700 hover:bg-purple-100 px-3 py-1.5 rounded-md text-xs font-bold border border-purple-200 transition-colors shadow-sm">
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
          </div>
        </div>
      )}
    </div>
  );
}