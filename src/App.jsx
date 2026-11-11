import React, { useState, useEffect } from 'react';
import { TrendingUp, Video, Eye, RefreshCw, ExternalLink, AlertTriangle } from 'lucide-react';

export default function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // URL API Google Sheets Anda
  const API_URL = "https://script.google.com/macros/s/AKfycbwTxa-MqVkrK65FPqNfR8ZglL17sZQ5QTExgQ0jtc_U--MXMoo4PrHnpOlpfmZQaS1n0g/exec";

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_URL);
      const result = await response.json();
      if (result.status === "success") {
        // Filter data yang benar-benar ada link postingannya
        const validData = result.data.filter(item => item.Link_Postingan && item.Link_Postingan.includes("tiktok.com"));
        setData(validData.reverse()); // Balik urutan agar yang terbaru di atas
      } else {
        setError("Gagal memuat data dari Sheets.");
      }
    } catch (err) {
      setError("Terjadi kesalahan jaringan.");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Kalkulasi Analitik
  const totalVideos = data.length;
  const totalViews = data.reduce((sum, item) => sum + (parseInt(item.View) || 0), 0);
  const fypVideos = data.filter(v => v.Video_FYP && v.Video_FYP.includes("FYP")).length;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
      {/* Header Panel */}
      <div className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">PromoOps Studio</h1>
          <p className="text-gray-500 mt-1">Command Center & Analitik FYP TikTok</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={fetchData} 
            disabled={loading}
            className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Menyinkronkan...' : 'Sinkron Data Sheets'}
          </button>
        </div>
      </div>

      {/* Widget Statistik */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-4 bg-blue-50 text-blue-600 rounded-xl"><Video className="w-6 h-6" /></div>
          <div>
            <p className="text-sm font-medium text-gray-500">Total Video Diupload</p>
            <h3 className="text-2xl font-bold text-gray-900">{totalVideos} <span className="text-sm font-normal text-gray-400">klip</span></h3>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-4 bg-purple-50 text-purple-600 rounded-xl"><Eye className="w-6 h-6" /></div>
          <div>
            <p className="text-sm font-medium text-gray-500">Total Akumulasi View</p>
            <h3 className="text-2xl font-bold text-gray-900">{totalViews.toLocaleString('id-ID')} <span className="text-sm font-normal text-gray-400">tayangan</span></h3>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="p-4 bg-orange-50 text-orange-600 rounded-xl"><TrendingUp className="w-6 h-6" /></div>
          <div>
            <p className="text-sm font-medium text-gray-500">Video Menembus FYP</p>
            <h3 className="text-2xl font-bold text-gray-900">{fypVideos} <span className="text-sm font-normal text-gray-400">berhasil</span></h3>
          </div>
        </div>
      </div>

      {/* Tabel Data Real-time */}
      <div className="max-w-7xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-800">Riwayat Upload & Status View (Live)</h2>
          {error && <p className="text-sm text-red-500 flex items-center gap-1"><AlertTriangle className="w-4 h-4"/> {error}</p>}
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 text-gray-500 text-sm">
                <th className="px-6 py-4 font-medium">Barang / Kampanye</th>
                <th className="px-6 py-4 font-medium">Akun Target</th>
                <th className="px-6 py-4 font-medium">Jumlah View</th>
                <th className="px-6 py-4 font-medium">Status Algoritma</th>
                <th className="px-6 py-4 font-medium text-right">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {loading && data.length === 0 ? (
                <tr><td colSpan="5" className="px-6 py-12 text-center text-gray-400">Memuat data dari Google Sheets...</td></tr>
              ) : (
                data.slice(0, 50).map((row, index) => (
                  <tr key={index} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900 truncate max-w-[200px]">{row.Induk_Barang || "Nama Barang Kosong"}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{row.Nama_File || row.Id_Klip}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        {row.Nama_Akun || row.Id_Akun || "Tidak Diketahui"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <Eye className="w-4 h-4 text-gray-400" />
                        <span className="font-semibold text-gray-700">{(parseInt(row.View) || 0).toLocaleString('id-ID')}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {row.Video_FYP && row.Video_FYP.includes("FYP") ? (
                        <span className="inline-flex items-center gap-1 text-orange-600 font-medium bg-orange-50 px-2.5 py-1 rounded-md">
                          <TrendingUp className="w-3.5 h-3.5" /> {row.Video_FYP}
                        </span>
                      ) : (
                        <span className="text-gray-500">{row.Video_FYP || "Belum FYP"}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <a 
                        href={row.Link_Postingan} 
                        target="_blank" 
                        rel="noreferrer"
                        className="inline-flex items-center justify-center p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Buka di TikTok"
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
  );
}