import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, Volume2, VolumeX, X } from 'lucide-react';

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

function streamSrc(fileId) {
  return `/api/onedrive-stream?id=${encodeURIComponent(fileId)}`;
}

function OneDriveVideo({ fileId, muted = false, bind, className }) {
  const [phase, setPhase] = useState('loading');
  const [message, setMessage] = useState('');
  const src = streamSrc(fileId);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await fetch(src, { redirect: 'manual' });
        if (ignore) return;
        if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
          setPhase('ready');
          return;
        }
        let body = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }
        const text = typeof body?.message === 'string' ? body.message.trim() : '';
        setMessage(body?.needsLogin
          ? (text || 'OneDrive perlu dihubungkan ulang dari tab Sinkron Bot.')
          : (text || 'File OneDrive tidak bisa diputar.'));
        setPhase('error');
      } catch {
        if (ignore) return;
        setMessage('Gagal menghubungi server pemutar.');
        setPhase('error');
      }
    })();
    return () => {
      ignore = true;
    };
  }, [src]);

  if (phase === 'loading') {
    return <p className="px-4 text-sm font-semibold text-white text-center">Menyiapkan file OneDrive...</p>;
  }
  if (phase === 'error') {
    return (
      <div className="px-6 py-8 text-center">
        <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
        <p className="text-sm font-semibold text-white leading-relaxed">{message}</p>
      </div>
    );
  }
  return (
    <video
      ref={bind}
      src={src}
      controls
      playsInline
      muted={muted}
      className={className}
      onError={() => {
        setPhase('error');
        setMessage('Pemutaran OneDrive gagal. Hubungkan ulang dari tab Sinkron Bot, atau buka file di luar dashboard.');
      }}
    />
  );
}

function TikTokFrame({ embedUrl, title, className }) {
  if (!embedUrl) {
    return <p className="px-4 text-sm font-semibold text-white text-center">Versi TikTok belum bisa diputar di sini.</p>;
  }
  return (
    <iframe
      src={embedUrl}
      title={title ? `Pemutar TikTok: ${title}` : 'Pemutar TikTok'}
      className={className}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
      allowFullScreen
    />
  );
}

function SourceSwitch({ source, fileId, embedUrl, onChange }) {
  if (!fileId || !embedUrl) return null;
  return (
    <button
      type="button"
      onClick={() => onChange(source === 'onedrive' ? 'tiktok' : 'onedrive')}
      className="inline-flex items-center justify-center px-4 py-2.5 bg-white hover:bg-gray-50 text-gray-800 text-sm font-bold rounded-xl border border-gray-300"
    >
      {source === 'onedrive' ? 'Lihat versi TikTok' : 'Putar file OneDrive'}
    </button>
  );
}

export function DashboardPlayerModal({ player, onClose }) {
  if (!player) return null;
  const fallback = safeHttpUrl(player.pageUrl);
  const originalUrl = safeHttpUrl(player.originalUrl);
  return (
    <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4 print:hidden">
      <PlayerBody key={`${player.fileId || ''}|${player.embedUrl || ''}|${player.title || ''}`} player={player} fallback={fallback} originalUrl={originalUrl} onClose={onClose} />
    </div>
  );
}

function PlayerBody({ player, fallback, originalUrl, onClose }) {
  const [source, setSource] = useState(player.fileId ? 'onedrive' : 'tiktok');
  const frameClass = `w-full aspect-[9/16] bg-black ${player.showCartNote ? 'max-h-[min(70vh,calc(92vh-22rem))]' : 'max-h-[70vh]'}`;

  return (
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-y-auto flex flex-col max-h-[92vh]">
      <div className="px-5 py-4 bg-gray-900 text-white flex items-start justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <h3 className="font-bold text-base leading-tight">Putar di Dashboard</h3>
          <p className="text-xs text-gray-300 mt-1 break-words">{player.title || 'Video'}</p>
          {player.produk && <p className="text-xs text-gray-400 mt-0.5 break-words">{player.produk}</p>}
        </div>
        <button type="button" onClick={onClose} className="text-gray-300 hover:text-white bg-gray-800 p-2 rounded-full shrink-0" aria-label="Tutup pemutar">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="bg-black min-h-[240px] overflow-hidden flex items-center justify-center">
        {player.status === 'loading' && !player.fileId && (
          <p className="text-sm font-semibold text-white px-6 text-center">Membaca tautan TikTok...</p>
        )}
        {player.status === 'error' && !player.fileId && (
          <div className="px-6 py-8 text-center">
            <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-white leading-relaxed">{player.message}</p>
          </div>
        )}
        {source === 'onedrive' && player.fileId && (
          <OneDriveVideo key={player.fileId} fileId={player.fileId} className={frameClass} />
        )}
        {source === 'tiktok' && (player.status === 'ready' || player.embedUrl) && (
          <TikTokFrame embedUrl={player.embedUrl} title={player.title} className={frameClass} />
        )}
      </div>

      {player.showCartNote && source === 'tiktok' && (
        <p className="px-5 pt-3 text-xs text-gray-500 leading-relaxed">
          Video berkeranjang kuning hanya bisa diputar di aplikasi TikTok HP. Kalau layar hitam, pakai tombol di bawah.
        </p>
      )}

      <div className="px-5 py-4 bg-white border-t border-gray-200 flex flex-col gap-2 shrink-0">
        <SourceSwitch source={source} fileId={player.fileId} embedUrl={player.embedUrl} onChange={setSource} />
        {fallback && (
          <a href={fallback} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white hover:bg-gray-50 text-gray-800 text-sm font-bold rounded-xl border border-gray-300">
            Buka di TikTok <ExternalLink className="w-4 h-4" />
          </a>
        )}
        {originalUrl && (
          <a href={originalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl">
            Putar file asli (OneDrive) <ExternalLink className="w-4 h-4" />
          </a>
        )}
        <button type="button" onClick={onClose} className="px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-bold rounded-xl">
          Tutup
        </button>
      </div>
    </div>
  );
}

function CompareSide({ item, muted, onMuted, bind, noteSide }) {
  const [source, setSource] = useState(item?.fileId ? 'onedrive' : 'tiktok');
  const frameClass = 'w-full aspect-[9/16] bg-black max-h-[68vh]';
  if (!item) return null;
  return (
    <div className="min-w-0 flex flex-col bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="font-bold text-sm text-gray-900 break-all">{item.name || 'Video'}</p>
        {item.produk && <p className="text-xs text-gray-500 mt-0.5 break-words">{item.produk}</p>}
        {item.views != null && (
          <p className="text-xs font-semibold text-gray-700 mt-1">{Number(item.views).toLocaleString('id-ID')} view</p>
        )}
      </div>
      <div className="bg-black min-h-[220px] flex items-center justify-center">
        {source === 'onedrive' && item.fileId && (
          <OneDriveVideo key={item.fileId} fileId={item.fileId} muted={muted} bind={bind} className={frameClass} />
        )}
        {source !== 'onedrive' && (
          <TikTokFrame embedUrl={item.embedUrl} title={item.name} className={frameClass} />
        )}
      </div>
      <div className="p-3 flex flex-col gap-2">
        <SourceSwitch source={source} fileId={item.fileId} embedUrl={item.embedUrl} onChange={setSource} />
        {noteSide && source === 'tiktok' && (
          <p className="text-xs text-gray-500">Pemutar TikTok tidak bisa dimulai bersamaan. Jalankan video ini manual.</p>
        )}
        {onMuted && source === 'onedrive' && item.fileId && (
          <button type="button" onClick={() => onMuted(!muted)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-700">
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            {muted ? 'Nyalakan suara kanan' : 'Bisukan kanan'}
          </button>
        )}
      </div>
    </div>
  );
}

export function CompareModal({ items, onClose }) {
  const [rightMuted, setRightMuted] = useState(true);
  const videos = useRef({ left: null, right: null });
  if (!items || items.length < 2) return null;
  const tiktokNote = items.some((item) => item && !item.fileId && (item.embedUrl || item.pageUrl));

  function playTogether() {
    for (const side of ['left', 'right']) {
      const element = videos.current[side];
      if (!element) continue;
      try {
        element.currentTime = 0;
      } catch {
        // pemutar belum siap
      }
      element.play().catch(() => {});
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4 print:hidden">
      <div className="bg-gray-50 rounded-2xl shadow-xl w-full max-w-5xl max-h-[92vh] overflow-y-auto">
        <div className="px-5 py-4 bg-gray-900 text-white flex items-center justify-between gap-3 sticky top-0 z-10">
          <h3 className="font-bold text-base">Bandingkan video</h3>
          <button type="button" onClick={onClose} className="text-gray-300 hover:text-white bg-gray-800 p-2 rounded-full" aria-label="Tutup perbandingan">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={playTogether} className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold">
              Putar bersama
            </button>
            {(tiktokNote || items.some((item) => item?.embedUrl && !item?.fileId)) && (
              <p className="text-xs text-gray-600">Pemutar TikTok tidak bisa diselaraskan. Sisi itu dijalankan manual.</p>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CompareSide item={items[0]} bind={(node) => { videos.current.left = node; }} noteSide />
            <CompareSide item={items[1]} muted={rightMuted} onMuted={setRightMuted} bind={(node) => { videos.current.right = node; }} noteSide />
          </div>
        </div>
      </div>
    </div>
  );
}

export function CompareTray({ items, onOpen, onClear, elevated = false }) {
  if (!items?.length) return null;
  return (
    <div className={`fixed bottom-[calc(7.5rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 lg:bottom-4 ${elevated ? 'z-[55]' : 'z-40'} w-[min(640px,calc(100%-2rem))] print:hidden`}>
      <div className="rounded-2xl border border-gray-200 bg-white shadow-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase text-gray-500">Bandingkan</p>
          <p className="text-sm font-semibold text-gray-900 truncate">
            {items.map((item) => item.name).join('  ·  ')}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClear} className="px-3 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-700">
            Batal
          </button>
          <button
            type="button"
            onClick={onOpen}
            disabled={items.length < 2}
            className="px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold disabled:opacity-40"
          >
            Bandingkan sekarang
          </button>
        </div>
      </div>
    </div>
  );
}

export function CompareButton({ selected, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`inline-flex items-center justify-center px-3 py-2 rounded-lg text-xs font-bold border ${selected ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'} disabled:opacity-40`}
    >
      {selected ? 'Dipilih' : 'Bandingkan'}
    </button>
  );
}
