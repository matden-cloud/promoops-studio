import React, { useState, useEffect } from 'react';
import { TrendingUp, Video, Eye, RefreshCw, ExternalLink, AlertTriangle, LayoutDashboard, MessageSquare } from 'lucide-react';

export default function App() {
  // State untuk Tab Menu
  const [activeMenu, setActiveMenu] = useState('analitik'); // Pilihan: 'pipeline' atau 'analitik'

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const API_URL = "https://script.google.com/macros/s/AKfycbwTxa-MqVkrK65FPqNfR8ZglL17sZQ5QTExgQ0jtc_U--MXMoo4PrHnpOlpfmZQaS1n0g/exec";

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch(API_URL);
      const result = await response.json();
      if (result.status === "success") {
        // PERBAIKAN: Hanya mengambil baris yang benar-benar memiliki Nama Barang (membuang baris kosong)
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

  const totalVideos = data.length;
  const totalViews = data.reduce((sum, item) => sum + (parseInt(item.View) || 0), 0);
  const fypVideos = data.filter(v => v.Video_FYP && v.Video_FYP.includes("FYP")).length;

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      
      {/* HEADER & NAVIGASI (MENGEMBALIKAN TAMPILAN LAMA) */}
      <div className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-700 text-white rounded-lg flex items-center justify-center font-bold text-lg">RP</div>
          <div>
            <h1 className="font-bold text-gray-900 leading-tight">PromoOps & Riset</h1>
            <p className="text-xs text-gray-500">Klip_Vidio • OneDrive • Repliz</p>
          </div>
        </div>
        
        <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
          <button 
            onClick={() => setActiveMenu('pipeline')}
            className={`px-4 py-2 text-sm font-bold rounded-md flex items-center gap-2 transition-all ${activeMenu === 'pipeline' ? 'bg-white text-emerald-700 shadow' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <LayoutDashboard className="w-4 h-4" /> Pipeline & Barang (5)
          </button>
          <button 
            onClick={() => setActiveMenu('analitik')}
            className={`px-4 py-2 text-sm font-bold rounded-md flex items-center gap-2 transition-all ${activeMenu === 'analitik' ? 'bg-white text-emerald-700 shadow' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <TrendingUp className="w-4 h-4" /> Laporan Analitik FYP
          </button>
        </div>

        <button className="bg-gray-900 hover:bg-gray-800 text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors">
          <MessageSquare className="w-4 h-4" /> Buka Agent Bot
        </button>
      </div>

      {/* HALAMAN 1: PIPELINE (TEMPAT KODE LAMA ANDA) */}
      {activeMenu === 'pipeline' && (
        <div className="p-8 max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Pipeline riset barang & mentahan video</h2>
          <p className="text-gray-600 mb-8">Satu kode = satu barang/kampanye video. Klik kartu untuk buka detail, catatan editor Rahmat, dan jadwal Repliz.</p>
          
          <div className="bg-white p-12 text-center rounded-xl border-2 border-dashed border-gray-300">
             <LayoutDashboard className="w-12 h-12 text-gray-300 mx-auto mb-3" />
             <h3 className="text-lg font-bold text-gray-700">Area Pipeline</h3>
             <p className="text-gray-500 text-sm mt-1">
               Karena kode sebelumnya tertimpa, silakan ambil kembali kode kartu Pipeline Anda dari file lama (atau kita bisa merakit ulangnya bersama).
             </p>
          </div>
        </div>
      )}

      {/* HALAMAN 2: LAPORAN ANALITIK (YANG SUDAH DIPERBAIKI) */}
      {activeMenu === 'analitik' && (
        <div className="p-8 max-w-7xl mx-auto animate-in fade-in duration-300">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Performa FYP 5 Akun TikTok</h2>
              <p className="text-gray-500 mt-1">Data ditarik secara real-time dari Sheet Data_View</p>
            </div>
            <button onClick={fetchData} disabled={loading} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm transition-colors disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Menyinkronkan...' : 'Sinkron Data Sheets'}
            </button>
          </div>

          {/* Widget Statistik */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-5">
              <div className="p-4 bg-blue-50 text-blue-600 rounded-xl"><Video className="w-7 h-7" /></div>
              <div>
                <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Total Video Upload</p>
                <h3 className="text-3xl font-black text-gray-900 mt-1">{totalVideos} <span className="text-sm font-medium text-gray-400 normal-case">klip</span></h3>
              </div>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-5">
              <div className="p-4 bg-purple-50 text-purple-600 rounded-xl"><Eye className="w-7 h-7" /></div>
              <div>
                <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Akumulasi View</p>
                <h3 className="text-3xl font-black text-gray-900 mt-1">{totalViews.toLocaleString('id-ID')} <span className="text-sm font-medium text-gray-400 normal-case">tayangan</span></h3>
              </div>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-5">
              <div className="p-4 bg-orange-50 text-orange-600 rounded-xl"><TrendingUp className="w-7 h-7" /></div>
              <div>
                <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Berhasil Masuk FYP</p>
                <h3 className="text-3xl font-black text-gray-900 mt-1">{fypVideos} <span className="text-sm font-medium text-gray-400 normal-case">video</span></h3>
              </div>
            </div>
          </div>

          {/* Tabel Data Real-time */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-sm border-b border-gray-100">
                    <th className="px-6 py-4 font-bold">Barang / Kampanye</th>
                    <th className="px-6 py-4 font-bold">Akun Publish</th>
                    <th className="px-6 py-4 font-bold text-right">Jumlah View</th>
                    <th className="px-6 py-4 font-bold">Status Algoritma</th>
                    <th className="px-6 py-4 font-bold text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {loading && data.length === 0 ? (
                    <tr><td colSpan="5" className="px-6 py-12 text-center text-gray-400 font-medium">Menarik data dari Google Sheets...</td></tr>
                  ) : (
                    data.slice(0, 50).map((row, index) => (
                      <tr key={index} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-bold text-gray-900">{row.Induk_Barang}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{row.Id_Klip}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200">
                            {row.Nama_Akun || row.Id_Akun}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="font-black text-gray-700 text-base">{(parseInt(row.View) || 0).toLocaleString('id-ID')}</span>
                        </td>
                        <td className="px-6 py-4">
                          {row.Video_FYP && row.Video_FYP.includes("FYP") ? (
                            <span className="inline-flex items-center gap-1.5 text-orange-700 font-bold bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-100">
                              <TrendingUp className="w-4 h-4" /> {row.Video_FYP}
                            </span>
                          ) : (
                            <span className="text-gray-500 font-medium">{row.Video_FYP || "Belum FYP"}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <a 
                            href={row.Link_Postingan} 
                            target="_blank" 
                            rel="noreferrer"
                            className="inline-flex p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </td>
                      </tr>
                    ))
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