import { useCallback, useEffect, useRef, useState } from 'react';
import { Film, Upload } from 'lucide-react';
import {
  MAX_DIRECT_VIDEO_BYTES,
  MAX_SERVER_VIDEO_BYTES,
  safeClientFileUri,
  videoErrorMessage,
  videoMimeFromFile,
} from './violationVideo.js';

function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

function safeUploadUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return '';
    if (url.hostname !== 'generativelanguage.googleapis.com') return '';
    if (url.username || url.password) return '';
    if (!url.pathname.startsWith('/upload/')) return '';
    if (url.searchParams.has('key') || url.searchParams.has('api_key')) return '';
    return url.toString();
  } catch {
    return '';
  }
}

async function postGemini(body) {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  return { response, result };
}

export default function ViolationVideoAnalysis({
  fileId = '',
  hasLink = false,
  context = {},
  runToken = 0,
  session = 0,
  onApply,
  onConsumed,
}) {
  const [phase, setPhase] = useState('idle');
  const [message, setMessage] = useState('');
  const [penjelasan, setPenjelasan] = useState('');
  const [seenSession, setSeenSession] = useState(session);
  if (seenSession !== session) {
    setSeenSession(session);
    setPhase('idle');
    setMessage('');
    setPenjelasan('');
  }
  const requestSeq = useRef(0);
  const onApplyRef = useRef(onApply);
  const onConsumedRef = useRef(onConsumed);
  useEffect(() => {
    onApplyRef.current = onApply;
    onConsumedRef.current = onConsumed;
  }, [onApply, onConsumed]);

  const finishAnalysis = useCallback(async (seed, seq) => {
    let current = seed;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { response, result } = await postGemini({
        action: 'analyze_violation_video',
        context,
        ...current,
      });
      if (requestSeq.current !== seq) return;
      if (response.status === 202 && result?.phase === 'processing' && result.fileName && safeClientFileUri(result.fileUri)) {
        setMessage(typeof result.message === 'string' && result.message.trim()
          ? result.message.trim()
          : 'Video masih diproses Gemini. Tunggu sebentar…');
        await new Promise((resolve) => setTimeout(resolve, 2000));
        current = {
          fileName: result.fileName,
          fileUri: result.fileUri,
          mimeType: result.mimeType || current.mimeType,
        };
        continue;
      }
      if (!response.ok || !result?.fields) {
        setPhase('error');
        setMessage(videoErrorMessage(result));
        return;
      }
      const applied = onApplyRef.current?.(result.fields) || { labels: [], penjelasan: '' };
      setPenjelasan(applied.penjelasan || '');
      setPhase('done');
      setMessage(applied.labels?.length
        ? 'Analisis selesai. Penyebab dan evaluasi terisi untuk diperiksa. Data baru tersimpan setelah tombol simpan.'
        : 'Video terbaca, tetapi penyebab belum dikenali. Isi manual bila perlu.');
      return;
    }
    if (requestSeq.current !== seq) return;
    setPhase('error');
    setMessage('Video masih diproses terlalu lama. Coba lagi sebentar, atau unggah file yang lebih pendek.');
  }, [context]);

  const startKnown = useCallback(async () => {
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    setPhase('working');
    setPenjelasan('');
    setMessage('Sedang menyiapkan video…');
    if (fileId) {
      await finishAnalysis({ fileId }, seq);
      return;
    }
    if (requestSeq.current !== seq) return;
    setPhase('error');
    setMessage(hasLink
      ? 'Tautan TikTok tidak bisa diunduh dari dashboard. Unggah file videonya untuk dianalisis.'
      : 'Belum ada file video yang bisa diambil. Unggah file videonya untuk dianalisis.');
  }, [fileId, finishAnalysis, hasLink]);

  const startRef = useRef(startKnown);
  useEffect(() => {
    startRef.current = startKnown;
  }, [startKnown]);
  useEffect(() => {
    if (!runToken) return;
    startRef.current();
    onConsumedRef.current?.();
  }, [runToken]);

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const mime = videoMimeFromFile(file);
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    if (!mime) {
      setPhase('error');
      setMessage('File ini bukan video yang bisa dibaca. Unggah MP4, WEBM, MOV, atau 3GP.');
      return;
    }
    if (file.size > MAX_DIRECT_VIDEO_BYTES) {
      setPhase('error');
      setMessage('Video terlalu besar. Potong videonya (maksimal 80 MB), lalu unggah lagi.');
      return;
    }
    setPhase('working');
    setPenjelasan('');
    try {
      if (file.size <= MAX_SERVER_VIDEO_BYTES) {
        setMessage('Sedang menganalisis video…');
        const dataUrl = await readDataUrl(file);
        if (requestSeq.current !== seq) return;
        await finishAnalysis({ video: dataUrl, mimeType: mime }, seq);
        return;
      }
      setMessage('Video besar sedang diunggah ke Gemini…');
      const started = await postGemini({
        action: 'start_violation_video_upload',
        mimeType: mime,
        sizeBytes: file.size,
      });
      if (requestSeq.current !== seq) return;
      const uploadUrl = safeUploadUrl(started.result?.uploadUrl);
      if (!started.response.ok || !uploadUrl) {
        setPhase('error');
        setMessage(videoErrorMessage(started.result));
        return;
      }
      let uploaded = null;
      try {
        uploaded = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'X-Goog-Upload-Offset': '0',
            'X-Goog-Upload-Command': 'upload, finalize',
            'Content-Type': mime,
          },
          body: file,
        });
      } catch {
        uploaded = null;
      }
      if (requestSeq.current !== seq) return;
      if (!uploaded?.ok) {
        setPhase('error');
        setMessage('Video belum terkirim ke Gemini dari browser. Coba potong videonya di bawah 2,5 MB, lalu unggah lagi.');
        return;
      }
      const info = await uploaded.json().catch(() => null);
      const fileUri = safeClientFileUri(info?.file?.uri || info?.file?.file_uri);
      const fileName = String(info?.file?.name || '');
      if (!fileUri || !/^files\/[A-Za-z0-9_-]+$/.test(fileName)) {
        setPhase('error');
        setMessage('Gemini belum menerima video itu. Coba unggah ulang.');
        return;
      }
      setMessage('Sedang menganalisis video…');
      await finishAnalysis({ fileUri, fileName, mimeType: mime }, seq);
    } catch {
      if (requestSeq.current !== seq) return;
      setPhase('error');
      setMessage('Video belum bisa dianalisis. Unggah file videonya, lalu coba lagi.');
    }
  };

  return (
    <section id="analisis-video-pelanggaran" aria-busy={phase === 'working'} className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={startKnown}
          disabled={phase === 'working'}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
        >
          <Film className="h-4 w-4 shrink-0" aria-hidden="true" />
          {phase === 'working' ? 'Sedang menganalisis…' : 'Analisis Video'}
        </button>
        <label className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 ${phase === 'working' ? 'pointer-events-none opacity-60' : ''}`}>
          <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
          Unggah video
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/3gpp,.mp4,.webm,.mov,.3gp"
            className="hidden"
            disabled={phase === 'working'}
            onChange={onFile}
          />
        </label>
      </div>
      <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">
        Analisis memakai file OneDrive bila tautannya sama dengan postingan di rekap. Tautan TikTok tidak diunduh. Kalau video tidak bisa diambil, unggah file MP4-nya. Hasil bisa diubah sebelum simpan.
      </p>
      {message && (
        <p role={phase === 'error' ? 'alert' : 'status'} className={`mt-2 text-xs font-semibold leading-relaxed ${phase === 'error' ? 'text-red-700' : phase === 'working' ? 'text-slate-600' : 'text-emerald-800'}`}>
          {message}
        </p>
      )}
      {penjelasan && phase === 'done' && (
        <p className="mt-2 text-xs font-medium leading-relaxed text-slate-700">{penjelasan}</p>
      )}
    </section>
  );
}
