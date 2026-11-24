import { useCallback, useEffect, useRef, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { accountOptionValue, noticeErrorMessage } from './violationNotice.js';

const MAX_DATA_URL = 3_200_000;

function compressNoticeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const edge = 1600;
        const scale = Math.min(1, edge / img.width, edge / img.height);
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => reject(new Error('image'));
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export default function ViolationNoticeReader({ accounts = [], types = [], onApply, onReady }) {
  const [phase, setPhase] = useState('idle');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState('');
  const [dragging, setDragging] = useState(false);
  const requestSeq = useRef(0);
  const onApplyRef = useRef(onApply);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onApplyRef.current = onApply;
    onReadyRef.current = onReady;
  }, [onApply, onReady]);

  const readFile = useCallback(async (file) => {
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    if (!file || (file.type && !file.type.startsWith('image/'))) {
      setPhase('error');
      setMessage('File ini bukan gambar. Unggah JPG, PNG, WEBP, atau GIF, atau tempel screenshot.');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setPhase('error');
      setMessage('Gambar terlalu besar. Coba unggah ulang dengan ukuran lebih kecil.');
      return;
    }
    setPhase('reading');
    setMessage('Sedang membaca screenshot…');
    let dataUrl = '';
    try {
      dataUrl = await compressNoticeImage(file);
      if (requestSeq.current !== seq) return;
      if (!dataUrl.startsWith('data:image/jpeg;base64,') || dataUrl.length > MAX_DATA_URL) {
        setPhase('error');
        setMessage('Gambar terlalu besar. Coba unggah ulang dengan ukuran lebih kecil.');
        return;
      }
      setPreview(dataUrl);
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'read_violation',
          image: dataUrl,
          accounts: accounts.map(accountOptionValue).filter(Boolean).slice(0, 40),
          types: types.map((type) => String(type || '').trim()).filter(Boolean).slice(0, 40),
        }),
      });
      const result = await response.json().catch(() => null);
      if (requestSeq.current !== seq) return;
      if (!response.ok || !result?.fields || typeof result.fields !== 'object') {
        onApplyRef.current?.({ fields: null, image: dataUrl, error: true });
        setPhase('error');
        setMessage(`${noticeErrorMessage(result)} Gambar tetap dilampirkan sebagai bukti.`);
        return;
      }
      const outcome = onApplyRef.current?.({ fields: result.fields, image: dataUrl, error: false }) || { labels: [] };
      setPhase('done');
      setMessage(outcome.labels?.length
        ? 'Screenshot terbaca. Isian yang dikenali ditandai Terisi otomatis. Periksa sebelum simpan. Tautan video diisi sendiri.'
        : 'Screenshot terbaca, tetapi belum ada isian yang dikenali. Gambar dilampirkan sebagai bukti. Isi formulir secara manual. Tautan video diisi sendiri.');
    } catch {
      if (requestSeq.current !== seq) return;
      if (dataUrl) onApplyRef.current?.({ fields: null, image: dataUrl, error: true });
      setPhase('error');
      setMessage(dataUrl
        ? 'Screenshot belum bisa dibaca. Gambar tetap dilampirkan sebagai bukti. Isi formulir secara manual.'
        : 'Gambar ini tidak bisa dibuka. Coba JPG, PNG, atau WEBP.');
    }
  }, [accounts, types]);

  useEffect(() => {
    onReadyRef.current?.(readFile);
  }, [readFile]);

  const onInput = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) readFile(file);
  };

  return (
    <section
      id="baca-screenshot-teguran"
      aria-busy={phase === 'reading'}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = [...(event.dataTransfer?.files || [])].find((item) => item.type.startsWith('image/'));
        if (file) readFile(file);
        else {
          setPhase('error');
          setMessage('File ini bukan gambar. Unggah JPG, PNG, WEBP, atau GIF, atau tempel screenshot.');
        }
      }}
      className={`mb-4 rounded-xl border border-dashed p-3 ${dragging ? 'border-red-500 bg-red-50' : 'border-red-200 bg-red-50/50'} ${phase === 'reading' ? 'animate-pulse' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-red-800">Baca screenshot teguran</h4>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-red-900/70">
            Unggah, seret, atau tempel screenshot pemberitahuan TikTok. Isian terisi otomatis dan masih bisa diubah. Tautan video diisi sendiri. Data tersimpan setelah tombol simpan.
          </p>
          <label className={`mt-3 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2.5 text-xs font-bold text-red-700 shadow-sm sm:w-auto ${phase === 'reading' ? 'pointer-events-none opacity-60' : ''}`}>
            <ImageIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {phase === 'reading' ? 'Sedang membaca…' : 'Unggah screenshot'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={phase === 'reading'}
              onChange={onInput}
            />
          </label>
        </div>
        {preview && (
          <img src={preview} alt="Pratinjau screenshot teguran" className="h-16 w-16 shrink-0 rounded-lg border border-red-100 object-cover" />
        )}
      </div>
      {message && (
        <p role={phase === 'error' ? 'alert' : 'status'} className={`mt-2 text-xs font-semibold leading-relaxed ${phase === 'error' ? 'text-red-700' : phase === 'reading' ? 'text-slate-600' : 'text-emerald-800'}`}>
          {message}
        </p>
      )}
    </section>
  );
}
