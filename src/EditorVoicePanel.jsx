import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Cloud,
  Download,
  Mic,
  Pause,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { isItemId } from '../server/onedrive-plan.js';
import {
  CONSENT_STATEMENT_ID,
  initialSelection,
  moveSelection,
  parseWavPcm,
  renderTrimmedWav,
  waveformPeaks,
} from '../server/voice-audio.js';
import { base64ToBytes, bytesToBase64, decodeArrayBuffer, decodeMediaFile } from './voiceDecode.js';
import { listVoiceResults, saveVoiceResult } from './voiceStore.js';

const FLASH = 'gemini-3.8-flash-tts';
const FLASH_LITE = 'gemini-3.8-flash-lite-tts';
const SCRIPT_LIMIT = 2000;
const AVATAR_TONES = ['bg-emerald-100 text-emerald-800', 'bg-amber-100 text-amber-800', 'bg-slate-200 text-slate-800'];

function failureText(result, fallback) {
  const message = typeof result?.message === 'string' ? result.message.trim() : '';
  const detail = typeof result?.detail === 'string' ? result.detail.trim() : '';
  if (message && detail && message !== detail) return `${message} ${detail}`;
  return message || detail || fallback;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function clock(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function shortClock(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function formatIdDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'SV';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function suggestName(fileName) {
  return String(fileName || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function fileSlug(title) {
  const clean = String(title || '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 48);
  return clean || 'voice';
}

function wavBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array();
}

function mentahanChoices(rawAssets) {
  const seen = new Set();
  const rows = [];
  for (const row of rawAssets || []) {
    const fileId = String(row?.fileId || row?.Id_File || row?.Cloud_File_ID || row?.id || '').trim();
    if (!isItemId(fileId) || seen.has(fileId)) continue;
    seen.add(fileId);
    rows.push({
      fileId,
      name: String(row?.fileName || row?.Nama_File || 'File Mentahan').trim() || 'File Mentahan',
      produk: String(row?.produk || '').trim(),
      date: String(row?.date || '').trim(),
    });
  }
  return rows;
}

function QuotaChip() {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10.5px] font-bold text-emerald-800 lg:px-3 lg:py-1.5 lg:text-xs">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
      Gratis (Free Tier Gemini) · ada batas harian
    </div>
  );
}

function Note({ children }) {
  return (
    <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] font-semibold leading-snug text-amber-900">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

function FieldLabel({ children }) {
  return <span className="mb-1 block text-[8.5px] font-extrabold uppercase tracking-[0.08em] text-slate-400">{children}</span>;
}

function WaveTrim({ samples, sampleRate, selection, onChange }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const duration = samples.length / sampleRate;
  const peaks = useMemo(() => waveformPeaks(samples, 48), [samples]);
  const left = selection ? (selection.start / duration) * 100 : 0;
  const width = selection ? ((selection.end - selection.start) / duration) * 100 : 0;

  function secondsAt(clientX) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || !rect.width) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }

  function pointerDown(event, mode) {
    if (!selection) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { mode, anchor: secondsAt(event.clientX), start: selection.start, end: selection.end };
  }

  function pointerMove(event) {
    if (!drag.current) return;
    const point = secondsAt(event.clientX);
    const { mode, anchor, start, end } = drag.current;
    if (mode === 'body') onChange(moveSelection(duration, start + (point - anchor), end + (point - anchor)));
    else if (mode === 'start') onChange(moveSelection(duration, point, end));
    else onChange(moveSelection(duration, start, point));
  }

  function pointerUp() {
    drag.current = null;
  }

  return (
    <div className="mt-2.5">
      <div
        ref={ref}
        className="relative h-14 overflow-hidden rounded-xl border border-black/[0.06] bg-[#f3f5f4]"
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
      >
        <div className="absolute inset-0 flex items-center gap-px px-1">
          {peaks.map((peak, index) => {
            const ratio = peaks.length ? index / peaks.length : 0;
            const active = selection && ratio >= selection.start / duration && ratio <= selection.end / duration;
            return (
              <span
                key={index}
                className={`flex-1 rounded-sm ${active ? 'bg-emerald-500' : 'bg-emerald-200'}`}
                style={{ height: `${Math.max(8, peak * 100)}%` }}
              />
            );
          })}
        </div>
        {selection && (
          <div
            className="absolute inset-y-0 cursor-grab border-x-2 border-emerald-600 bg-emerald-600/15"
            style={{ left: `${left}%`, width: `${width}%` }}
            onPointerDown={(event) => pointerDown(event, 'body')}
          >
            <span
              className="absolute top-1/2 left-0 h-5 w-2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded bg-emerald-600"
              onPointerDown={(event) => { event.stopPropagation(); pointerDown(event, 'start'); }}
            />
            <span
              className="absolute top-1/2 right-0 h-5 w-2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded bg-emerald-600"
              onPointerDown={(event) => { event.stopPropagation(); pointerDown(event, 'end'); }}
            />
          </div>
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] font-bold text-slate-500">
        <span>00:00</span>
        <span>
          {selection ? (
            <b className="font-extrabold text-emerald-800">
              {clock(selection.start)} – {clock(selection.end)} · {Math.round(selection.end - selection.start)} detik
            </b>
          ) : 'Pilih 10–30 detik'}
        </span>
        <span>{clock(duration)}</span>
      </div>
    </div>
  );
}

function CreateProfile({ rawAssets, onCancel, onCreated }) {
  const fileRef = useRef(null);
  const cancelRead = useRef(false);
  const alive = useRef(true);
  const recorderRef = useRef(null);
  const [sourceKind, setSourceKind] = useState('drive');
  const [driveQuery, setDriveQuery] = useState('');
  const [source, setSource] = useState(null);
  const [selection, setSelection] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState(0);
  const [consent, setConsent] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [error, setError] = useState('');
  const files = useMemo(() => mentahanChoices(rawAssets), [rawAssets]);
  const visibleFiles = files.filter((file) => {
    const query = driveQuery.trim().toLowerCase();
    if (!query) return true;
    return `${file.name} ${file.produk}`.toLowerCase().includes(query);
  }).slice(0, 40);

  useEffect(() => () => {
    alive.current = false;
    cancelRead.current = true;
    recorderRef.current?.stream?.getTracks().forEach((track) => track.stop());
    window.clearInterval(recorderRef.current?.timer);
  }, []);

  useEffect(() => () => {
    if (consent?.url) URL.revokeObjectURL(consent.url);
  }, [consent?.url]);

  async function adoptFile(file, origin) {
    cancelRead.current = false;
    setBusy('Membaca audio…');
    setProgress(0);
    setError('');
    setSource(null);
    setSelection(null);
    try {
      const decoded = await decodeMediaFile(file, setProgress, () => cancelRead.current);
      if (cancelRead.current) return;
      const duration = decoded.samples.length / decoded.sampleRate;
      const next = initialSelection(duration);
      if (!next) {
        setError('Referensi harus 10–30 detik suara yang bersih. File ini lebih pendek.');
        return;
      }
      setSource({
        name: file.name || 'Referensi',
        origin,
        samples: decoded.samples,
        sampleRate: decoded.sampleRate,
      });
      setSelection(next);
      setDisplayName((current) => current || suggestName(file.name));
    } catch (err) {
      if (!cancelRead.current) setError(err instanceof Error ? err.message : 'Audio tidak bisa dibaca.');
    } finally {
      setBusy('');
    }
  }

  async function chooseDrive(file) {
    setError('');
    setBusy('Mengambil file Mentahan…');
    try {
      const response = await fetch(`/api/onedrive-stream?id=${encodeURIComponent(file.fileId)}&proxy=1`);
      const result = await readJson(response);
      if (!response.ok) {
        throw new Error(failureText(result, 'File OneDrive tidak bisa diambil. Coba unggah dari HP.'));
      }
      const blob = await response.blob();
      const local = new File([blob], file.name, { type: blob.type || 'video/mp4' });
      await adoptFile(local, 'OneDrive Mentahan');
    } catch (err) {
      setBusy('');
      setError(err instanceof Error ? err.message : 'File OneDrive tidak bisa diambil.');
    }
  }

  async function toggleRecording() {
    if (recording && recorderRef.current) {
      recorderRef.current.recorder.stop();
      return;
    }
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks = [];
      const started = Date.now();
      recorderRef.current = { recorder, stream, timer: window.setInterval(() => {
        setRecordSeconds((Date.now() - started) / 1000);
      }, 200) };
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        window.clearInterval(recorderRef.current?.timer);
        stream.getTracks().forEach((track) => track.stop());
        if (!alive.current) return;
        setRecording(false);
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (!blob.size) {
          setError('Rekaman izin kosong. Coba lagi.');
          return;
        }
        try {
          const decoded = await decodeArrayBuffer(await blob.arrayBuffer());
          const seconds = decoded.samples.length / decoded.sampleRate;
          const end = Math.min(seconds, 25);
          const wav = renderTrimmedWav(decoded.samples, decoded.sampleRate, 0, end);
          setConsent((current) => {
            if (current?.url) URL.revokeObjectURL(current.url);
            return { url: URL.createObjectURL(blob), seconds: end, wavBase64: bytesToBase64(wav) };
          });
          if (seconds < 2) setError('Rekaman izin terlalu singkat. Baca kalimatnya sampai selesai.');
        } catch {
          setError('Rekaman izin tidak bisa diubah menjadi WAV.');
        }
      };
      recorder.start();
      setRecording(true);
      setRecordSeconds(0);
      window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 25000);
    } catch {
      setError('Mikrofon tidak bisa dipakai. Izinkan akses mikrofon, lalu coba lagi.');
    }
  }

  async function saveProfile() {
    if (!source || !selection || !consent) return;
    const name = displayName.trim();
    if (!name) {
      setError('Isi nama profil suara.');
      return;
    }
    if (consent.seconds < 2) {
      setError('Rekaman izin terlalu singkat.');
      return;
    }
    setBusy('Menyimpan profil…');
    setError('');
    try {
      const wav = renderTrimmedWav(source.samples, source.sampleRate, selection.start, selection.end);
      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          displayName: name,
          sourceWav: bytesToBase64(wav),
          consentWav: consent.wavBase64,
        }),
      });
      const result = await readJson(response);
      if (!response.ok) throw new Error(failureText(result, 'Profil suara gagal disimpan.'));
      onCreated(result.voice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profil suara gagal disimpan.');
    } finally {
      setBusy('');
    }
  }

  const referenceReady = Boolean(source && selection);
  const canSave = referenceReady && consent && consent.seconds >= 2 && displayName.trim() && !busy && !recording;

  return (
    <div>
      <p className="mb-2 hidden text-[13px] font-medium text-slate-500 lg:block">Dua langkah: referensi suara, lalu rekaman izin.</p>
      <section className="rounded-[20px] border border-black/[0.06] bg-white p-3.5 shadow-[0_8px_28px_rgba(15,23,42,0.07)]">
        <div className="mb-2 flex items-center gap-2">
          <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-extrabold text-white ${referenceReady ? 'bg-emerald-700' : 'bg-emerald-600'}`}>
            {referenceReady ? <Check className="h-3 w-3" aria-hidden="true" /> : '1'}
          </span>
          <div>
            <p className="text-[8.5px] font-extrabold uppercase tracking-[0.08em] text-slate-400">Langkah 1</p>
            <h3 className="text-sm font-extrabold tracking-tight">Referensi suara</h3>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setSourceKind('drive')}
            className={`rounded-[14px] border px-2.5 py-2.5 text-left ${sourceKind === 'drive' ? 'border-emerald-300 bg-emerald-50' : 'border-black/[0.06] bg-white'}`}
          >
            <Cloud className="mb-1 h-4 w-4 text-emerald-700" aria-hidden="true" />
            <span className="block text-[11.5px] font-extrabold">OneDrive Mentahan</span>
            <span className="mt-0.5 block text-[10px] font-medium text-slate-500">Pilih klip mentahan</span>
          </button>
          <button
            type="button"
            onClick={() => { setSourceKind('upload'); fileRef.current?.click(); }}
            className={`rounded-[14px] border px-2.5 py-2.5 text-left ${sourceKind === 'upload' ? 'border-emerald-300 bg-emerald-50' : 'border-black/[0.06] bg-white'}`}
          >
            <Upload className="mb-1 h-4 w-4" aria-hidden="true" />
            <span className="block text-[11.5px] font-extrabold">Unggah dari HP</span>
            <span className="mt-0.5 block text-[10px] font-medium text-slate-500">Video atau audio</span>
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,video/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) adoptFile(file, 'Unggah dari HP');
          }}
        />
        {sourceKind === 'drive' && (
          <div className="mt-2">
            <input
              value={driveQuery}
              onChange={(event) => setDriveQuery(event.target.value)}
              placeholder="Cari file Mentahan"
              className="mb-1 w-full rounded-xl border border-black/[0.06] px-2.5 py-2 text-[12px] font-semibold"
            />
            <div className="max-h-36 overflow-y-auto rounded-xl border border-black/[0.06]">
              {visibleFiles.length === 0 && (
                <p className="px-2.5 py-3 text-[11px] font-semibold text-slate-500">Belum ada file Mentahan. Sinkronkan OneDrive, atau unggah dari HP.</p>
              )}
              {visibleFiles.map((file) => (
                <button
                  key={file.fileId}
                  type="button"
                  onClick={() => chooseDrive(file)}
                  className="block w-full border-t border-black/[0.06] px-2.5 py-2 text-left first:border-t-0"
                >
                  <span className="block truncate text-[12px] font-extrabold">{file.name}</span>
                  <span className="block truncate text-[10px] font-semibold text-slate-500">{[file.produk, file.date].filter(Boolean).join(' · ') || 'OneDrive Mentahan'}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {busy && <p className="mt-2 text-[11px] font-bold text-emerald-800">{busy}{progress ? ` ${Math.round(progress * 100)}%` : ''}</p>}
        {source && (
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-black/[0.06] bg-[#f8faf9] px-2.5 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11.5px] font-extrabold">{source.name}</span>
              <span className="block text-[10px] font-semibold text-slate-500">{source.origin} · {clock(source.samples.length / source.sampleRate)}</span>
            </span>
            <button
              type="button"
              aria-label="Putar potongan"
              onClick={() => playSlice(source, selection)}
              className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-slate-900 text-white"
            >
              <Play className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true" />
            </button>
          </div>
        )}
        {source && selection && (
          <WaveTrim samples={source.samples} sampleRate={source.sampleRate} selection={selection} onChange={(next) => next && setSelection(next)} />
        )}
        <p className="mt-1.5 text-[11px] font-medium text-slate-500">Pilih 10–30 detik suara yang bersih, tanpa musik atau gaduh.</p>
      </section>

      <section className="mt-2.5 rounded-[20px] border border-black/[0.06] bg-white p-3.5 shadow-[0_8px_28px_rgba(15,23,42,0.07)]">
        <div className="mb-2 flex items-center gap-2">
          <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-extrabold ${consent ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-600'}`}>
            {consent ? <Check className="h-3 w-3" aria-hidden="true" /> : '2'}
          </span>
          <div>
            <p className="text-[8.5px] font-extrabold uppercase tracking-[0.08em] text-slate-400">Langkah 2</p>
            <h3 className="text-sm font-extrabold tracking-tight">Rekaman izin</h3>
          </div>
        </div>
        <Note>Gemini mewajibkan rekaman izin dari pemilik suara.</Note>
        <p className="mt-2 text-[12px] font-medium text-slate-600">Baca kalimat ini dengan suara yang jelas, satu kali saja.</p>
        <blockquote className="mt-2 rounded-[14px] border border-dashed border-slate-300 bg-[#f8faf9] px-3 py-2.5 text-[12.5px] font-semibold leading-snug text-slate-900">
          “{CONSENT_STATEMENT_ID}”
        </blockquote>
        <div className="mt-2.5 flex items-center gap-2.5">
          <button
            type="button"
            onClick={toggleRecording}
            aria-pressed={recording}
            aria-label={recording ? 'Stop rekaman izin' : 'Rekam izin'}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-[1.5px] border-red-200 bg-white text-red-600 shadow-[0_4px_12px_rgba(220,38,38,0.12)]"
          >
            {recording ? <Pause className="h-4 w-4" fill="currentColor" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[14px] border border-black/[0.06] bg-white px-2.5 py-2">
            <button
              type="button"
              aria-label="Putar rekaman izin"
              disabled={!consent}
              onClick={() => consent && new Audio(consent.url).play()}
              className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-slate-900 text-white disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true" />
            </button>
            <span className="min-w-0">
              <span className="block text-xs font-extrabold">{recording ? 'Merekam…' : 'Rekaman izin'}</span>
              <span className="block text-[10.5px] font-semibold text-slate-500">
                {recording ? clock(recordSeconds) : consent ? `${clock(consent.seconds)} · Ketuk untuk dengar` : 'Belum ada rekaman'}
              </span>
            </span>
          </div>
        </div>
        <label className="mt-3 block">
          <FieldLabel>Nama profil</FieldLabel>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value.slice(0, 60))}
            placeholder="Nama pemilik suara"
            className="w-full rounded-xl border border-black/[0.06] px-2.5 py-2 text-[12.5px] font-semibold"
          />
        </label>
        {error && <p className="mt-2 text-[11px] font-bold text-red-700" role="alert">{error}</p>}
        <button
          type="button"
          onClick={saveProfile}
          disabled={!canSave}
          className="mt-3 inline-flex w-[calc(100%-4.5rem)] items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-[12.5px] font-extrabold text-white shadow-[0_6px_14px_rgba(5,150,105,0.28)] disabled:opacity-50 lg:w-full"
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          {busy === 'Menyimpan profil…' ? 'Menyimpan…' : 'Simpan profil suara'}
        </button>
        <button type="button" onClick={onCancel} className="mt-2 hidden text-[12px] font-bold text-slate-500 lg:inline">
          Batal
        </button>
      </section>
    </div>
  );
}

function playSlice(source, selection) {
  if (!source || !selection) return;
  const ctx = new AudioContext();
  const start = Math.max(0, Math.floor(selection.start * source.sampleRate));
  const end = Math.min(source.samples.length, Math.floor(selection.end * source.sampleRate));
  const slice = source.samples.slice(start, end);
  const buffer = ctx.createBuffer(1, Math.max(1, slice.length), source.sampleRate);
  buffer.copyToChannel(slice.length ? slice : new Float32Array([0]), 0);
  const node = ctx.createBufferSource();
  node.buffer = buffer;
  node.connect(ctx.destination);
  node.onended = () => ctx.close();
  node.start();
}

export default function EditorVoicePanel({ rawAssets = [], onChromeChange, backRef }) {
  const [mode, setMode] = useState('main');
  const [configured, setConfigured] = useState(true);
  const [configMessage, setConfigMessage] = useState('');
  const [voices, setVoices] = useState([]);
  const [voiceError, setVoiceError] = useState('');
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [voiceId, setVoiceId] = useState('');
  const [script, setScript] = useState('');
  const [style, setStyle] = useState('');
  const [model, setModel] = useState(FLASH);
  const [results, setResults] = useState([]);
  const [working, setWorking] = useState('');
  const [formError, setFormError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [playingId, setPlayingId] = useState('');
  const playerRef = useRef(null);

  const loadVoices = async () => {
    setLoadingVoices(true);
    try {
      const response = await fetch('/api/voice');
      const result = await readJson(response);
      if (!response.ok) throw new Error(failureText(result, 'Profil suara tidak bisa dimuat.'));
      setConfigured(result?.configured !== false);
      setConfigMessage(result?.configured === false ? (result.message || 'Kunci Gemini belum dikonfigurasi di server.') : '');
      const rows = Array.isArray(result?.voices) ? result.voices : [];
      setVoices(rows);
      setVoiceId((current) => (rows.some((voice) => voice.id === current) ? current : (rows[0]?.id || '')));
      setVoiceError('');
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : 'Profil suara tidak bisa dimuat.');
    } finally {
      setLoadingVoices(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await fetch('/api/voice');
        const result = await readJson(response);
        if (ignore) return;
        if (!response.ok) throw new Error(failureText(result, 'Profil suara tidak bisa dimuat.'));
        setConfigured(result?.configured !== false);
        setConfigMessage(result?.configured === false ? (result.message || 'Kunci Gemini belum dikonfigurasi di server.') : '');
        const rows = Array.isArray(result?.voices) ? result.voices : [];
        setVoices(rows);
        setVoiceId((current) => (rows.some((voice) => voice.id === current) ? current : (rows[0]?.id || '')));
        setVoiceError('');
      } catch (err) {
        if (!ignore) setVoiceError(err instanceof Error ? err.message : 'Profil suara tidak bisa dimuat.');
      } finally {
        if (!ignore) setLoadingVoices(false);
      }
    })();
    listVoiceResults().then((rows) => {
      if (!ignore) setResults(rows);
    }).catch(() => {
      if (!ignore) setResults([]);
    });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!onChromeChange) return undefined;
    if (mode === 'create') {
      onChromeChange({
        title: 'Buat profil suara',
        subtitle: 'Dua langkah: referensi suara, lalu rekaman izin.',
        back: true,
      });
    } else {
      onChromeChange(null);
    }
    return () => onChromeChange(null);
  }, [mode, onChromeChange]);

  useEffect(() => {
    if (!backRef) return undefined;
    backRef.current = () => setMode('main');
    return () => {
      backRef.current = () => {};
    };
  }, [backRef]);

  useEffect(() => () => {
    playerRef.current?.audio.pause();
    if (playerRef.current?.url) URL.revokeObjectURL(playerRef.current.url);
  }, []);

  const counts = useMemo(() => {
    const map = new Map();
    for (const item of results) {
      const key = item.voiceId || '';
      const current = map.get(key) || { count: 0, latest: '' };
      current.count += 1;
      if (!current.latest || String(item.createdAt) > current.latest) current.latest = item.createdAt;
      map.set(key, current);
    }
    return map;
  }, [results]);

  async function helpScript() {
    setWorking('naskah');
    setFormError('');
    try {
      const prompt = [
        'Kamu membantu editor iklan TikTok berbahasa Indonesia menulis naskah yang akan dibacakan apa adanya.',
        'Hasilkan 4 sampai 7 kalimat pendek, natural, tanpa markdown, tanpa arahan panggung, dan tanpa tanda kurung.',
        script.trim()
          ? `Perhalus naskah berikut tanpa mengganti produk yang disebut:\n${script.trim()}`
          : 'Tulis contoh naskah promosi singkat. Jangan mengarang nama merek. Sisakan kalimat yang mudah diganti produknya.',
        'Balas hanya naskahnya.',
      ].join('\n\n');
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, temperature: 0.7, maxOutputTokens: 700 }),
      });
      const result = await readJson(response);
      if (!response.ok || typeof result?.text !== 'string' || !result.text.trim()) {
        throw new Error(failureText(result, 'Gemini tidak bisa menulis naskah.'));
      }
      setScript(result.text.trim().slice(0, SCRIPT_LIMIT));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gemini tidak bisa menulis naskah.');
    } finally {
      setWorking('');
    }
  }

  async function generate() {
    const text = script.trim();
    if (!voiceId || !text) return;
    setWorking('voice');
    setFormError('');
    try {
      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'speak',
          voiceId,
          text,
          style: style.trim(),
          model,
        }),
      });
      const result = await readJson(response);
      if (result?.error === 'missing_api_key') {
        setConfigured(false);
        setConfigMessage(result.message || 'Kunci Gemini belum dikonfigurasi di server.');
      }
      if (!response.ok || typeof result?.audioWav !== 'string') {
        throw new Error(failureText(result, 'Voice gagal dibuat.'));
      }
      const bytes = base64ToBytes(result.audioWav);
      let durationSec = 0;
      try {
        durationSec = parseWavPcm(bytes).duration;
      } catch {
        durationSec = 0;
      }
      const voice = voices.find((item) => item.id === voiceId);
      const title = text.split('\n').map((line) => line.trim()).find(Boolean)?.slice(0, 48) || 'Voice';
      const item = {
        id: `${Date.now()}-${voiceId}`,
        title,
        voiceId,
        voiceName: voice?.name || 'Profil suara',
        modelLabel: model === FLASH_LITE ? 'Flash-Lite' : 'Flash',
        createdAt: new Date().toISOString(),
        durationSec,
        wav: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      };
      try {
        await saveVoiceResult(item);
        setResults(await listVoiceResults());
      } catch {
        setResults((current) => [item, ...current].slice(0, 24));
        setFormError('Audio jadi, tetapi browser menolak menyimpannya. Unduh WAV sebelum menutup halaman.');
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Voice gagal dibuat.');
    } finally {
      setWorking('');
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setVoiceError('');
    try {
      const response = await fetch(`/api/voice?id=${encodeURIComponent(target.id)}`, { method: 'DELETE' });
      const result = await readJson(response);
      if (!response.ok) throw new Error(failureText(result, 'Profil suara gagal dihapus.'));
      await loadVoices();
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : 'Profil suara gagal dihapus.');
    }
  }

  function togglePlay(item) {
    if (playerRef.current?.id === item.id) {
      playerRef.current.audio.pause();
      URL.revokeObjectURL(playerRef.current.url);
      playerRef.current = null;
      setPlayingId('');
      return;
    }
    if (playerRef.current) {
      playerRef.current.audio.pause();
      URL.revokeObjectURL(playerRef.current.url);
    }
    const url = URL.createObjectURL(new Blob([wavBytes(item.wav)], { type: 'audio/wav' }));
    const audio = new Audio(url);
    audio.onended = () => {
      setPlayingId('');
      URL.revokeObjectURL(url);
      if (playerRef.current?.id === item.id) playerRef.current = null;
    };
    audio.play().catch(() => setFormError('Audio tidak bisa diputar di browser ini.'));
    playerRef.current = { id: item.id, audio, url };
    setPlayingId(item.id);
  }

  function download(item) {
    const url = URL.createObjectURL(new Blob([wavBytes(item.wav)], { type: 'audio/wav' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileSlug(item.title)}.wav`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  const selected = voices.find((voice) => voice.id === voiceId);

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-[58vh] lg:px-8 lg:py-7 lg:pb-7">
      <div className={mode === 'create' ? 'hidden lg:mb-4 lg:flex lg:items-start lg:justify-between lg:gap-4' : 'mb-2.5 lg:mb-4 lg:flex lg:items-start lg:justify-between lg:gap-4'}>
        <div className="hidden lg:block">
          <h2 className="text-[26px] font-extrabold tracking-tight text-gray-900">Editor Voice</h2>
          <p className="mt-1 text-sm font-medium text-gray-500">Clone suara dari klip mentahan, tulis naskah, lalu unduh audio WAV.</p>
        </div>
        <QuotaChip />
      </div>

      {!configured && (
        <div className="mb-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold leading-snug text-amber-950" role="status">
          {configMessage || 'Kunci Gemini belum dikonfigurasi di server.'} Tab tetap bisa dibuka, tetapi profil dan audio belum bisa dibuat.
        </div>
      )}

      {mode === 'create' && (
        <div className="lg:fixed lg:inset-0 lg:z-50 lg:flex lg:items-center lg:justify-center lg:bg-slate-900/40 lg:p-6">
          <div className="lg:max-h-[90vh] lg:w-full lg:max-w-lg lg:overflow-y-auto lg:rounded-[28px] lg:bg-[#f3f5f4] lg:p-4 lg:shadow-2xl">
            <div className="mb-2 hidden items-center justify-between lg:flex">
              <h2 className="text-lg font-extrabold tracking-tight">Buat profil suara</h2>
              <button type="button" onClick={() => setMode('main')} className="text-[12px] font-extrabold text-slate-500">Tutup</button>
            </div>
            <CreateProfile
              rawAssets={rawAssets}
              onCancel={() => setMode('main')}
              onCreated={(voice) => {
                setMode('main');
                if (voice?.id) setVoiceId(voice.id);
                loadVoices();
              }}
            />
          </div>
        </div>
      )}

      <div className={mode === 'create' ? 'hidden lg:grid lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:gap-4' : 'lg:grid lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:gap-4'}>
        <div>
          <section className="rounded-[20px] border border-black/[0.06] bg-white p-3.5 shadow-[0_8px_28px_rgba(15,23,42,0.07)] lg:rounded-2xl lg:p-[18px]">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[8.5px] font-extrabold uppercase tracking-[0.08em] text-slate-400 lg:text-[10px]">Suara tersimpan</p>
                <h3 className="text-sm font-extrabold tracking-tight lg:text-[15px]">Profil suara</h3>
              </div>
              <button
                type="button"
                onClick={() => setMode('create')}
                className="hidden items-center gap-1 rounded-full border border-black/[0.06] bg-white px-2.5 py-1.5 text-[11px] font-extrabold lg:inline-flex"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Buat profil suara
              </button>
            </div>
            {loadingVoices && <p className="mt-3 text-[12px] font-semibold text-slate-500">Memuat profil suara…</p>}
            {!loadingVoices && voices.length === 0 && (
              <p className="mt-3 text-[12px] font-semibold text-slate-500">Belum ada profil suara. Buat dari klip Mentahan atau unggahan HP.</p>
            )}
            {voiceError && <p className="mt-2 text-[11px] font-bold text-red-700" role="alert">{voiceError}</p>}
            <div>
              {voices.map((voice, index) => {
                const meta = counts.get(voice.id);
                const ready = voice.status === 'ready';
                return (
                  <div key={voice.id} className="flex items-center gap-2.5 border-t border-black/[0.06] py-2.5 first:border-t-0">
                    <button type="button" onClick={() => setVoiceId(voice.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold ${AVATAR_TONES[index % AVATAR_TONES.length]}`}>{initials(voice.name)}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-extrabold tracking-tight">{voice.name}</span>
                        <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">
                          {meta?.count ? `${meta.count} naskah · ${formatIdDate(meta.latest)}` : 'Belum dipakai'}
                        </span>
                      </span>
                    </button>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-extrabold ${ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                      {ready && <Check className="h-3 w-3" aria-hidden="true" />}
                      {ready ? 'Siap' : 'Perlu izin'}
                    </span>
                    <button type="button" aria-label={`Hapus ${voice.name}`} onClick={() => setPendingDelete(voice)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-700">
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setMode('create')}
              className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-black/[0.06] bg-white px-3 py-2.5 text-[12.5px] font-extrabold lg:hidden"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Buat profil suara
            </button>
          </section>

          <section className="mt-2.5 rounded-[20px] border border-black/[0.06] bg-white p-3.5 shadow-[0_8px_28px_rgba(15,23,42,0.07)] lg:mt-4 lg:rounded-2xl lg:p-[18px]">
            <p className="text-[8.5px] font-extrabold uppercase tracking-[0.08em] text-slate-400 lg:text-[10px]">Teks ke suara</p>
            <h3 className="text-sm font-extrabold tracking-tight lg:text-[15px]">Naskah</h3>
            <div className="mt-2 grid gap-2 lg:grid-cols-2">
              <label>
                <FieldLabel>Profil suara</FieldLabel>
                <span className="relative block">
                  <select
                    value={voiceId}
                    onChange={(event) => setVoiceId(event.target.value)}
                    className="w-full appearance-none rounded-xl border border-black/[0.06] bg-white px-2.5 py-2 pr-8 text-[12.5px] font-semibold"
                  >
                    {voices.length === 0 && <option value="">Belum ada profil</option>}
                    {voices.map((voice) => (
                      <option key={voice.id} value={voice.id}>{voice.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                </span>
              </label>
              <label>
                <FieldLabel>Gaya bicara (opsional)</FieldLabel>
                <input
                  value={style}
                  onChange={(event) => setStyle(event.target.value.slice(0, 160))}
                  placeholder="santai, semangat"
                  className="w-full rounded-xl border border-black/[0.06] px-2.5 py-2 text-[12.5px] font-semibold"
                />
              </label>
            </div>
            <label className="mt-2 block">
              <FieldLabel>Naskah</FieldLabel>
              <textarea
                value={script}
                onChange={(event) => setScript(event.target.value.slice(0, SCRIPT_LIMIT))}
                rows={5}
                placeholder="Tulis naskah yang akan dibacakan."
                className="min-h-[86px] w-full resize-none rounded-xl border border-black/[0.06] px-3 py-2.5 text-[12.5px] font-medium leading-snug lg:min-h-[118px] lg:text-[13.5px]"
              />
            </label>
            <div className="mt-1 flex items-center justify-between gap-2 max-lg:pr-16">
              <button type="button" onClick={helpScript} disabled={working === 'naskah'} className="inline-flex items-center gap-1 text-[11.5px] font-bold text-emerald-800 disabled:opacity-50">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {working === 'naskah' ? 'Menulis…' : 'Bantu tulis naskah (Gemini)'}
              </button>
              <span className="text-[10.5px] font-bold text-slate-400">{script.length} karakter</span>
            </div>
            <div className="mt-2 lg:flex lg:items-end lg:justify-between lg:gap-3">
              <div className="lg:w-56">
                <FieldLabel>Model</FieldLabel>
                <div className="flex rounded-xl bg-[#f1f5f4] p-[3px]">
                  {[[FLASH, 'Flash'], [FLASH_LITE, 'Flash-Lite']].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setModel(id)}
                      className={`flex-1 rounded-[10px] px-2 py-1.5 text-[11.5px] font-bold ${model === id ? 'bg-white font-extrabold text-emerald-800 shadow-sm' : 'text-slate-500'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={generate}
                disabled={!voiceId || !script.trim() || working === 'voice' || !configured}
                className="mt-3 inline-flex w-[calc(100%-4.5rem)] items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-[12.5px] font-extrabold text-white shadow-[0_6px_14px_rgba(5,150,105,0.28)] disabled:opacity-50 lg:mt-0 lg:w-auto lg:px-4"
              >
                <Mic className="h-3.5 w-3.5" aria-hidden="true" />
                {working === 'voice' ? 'Membuat…' : 'Buat voice'}
              </button>
            </div>
            {formError && <p className="mt-2 text-[11px] font-bold text-red-700" role="alert">{formError}</p>}
            {selected && <p className="mt-1 hidden text-[11px] font-semibold text-slate-400 lg:block">Suara aktif: {selected.name}</p>}
          </section>
        </div>

        <div className={mode === 'create' ? 'hidden lg:block' : 'mt-2.5 lg:mt-0'}>
          <section className="rounded-[20px] border border-black/[0.06] bg-white p-3.5 shadow-[0_8px_28px_rgba(15,23,42,0.07)] lg:rounded-2xl lg:p-[18px]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[8.5px] font-extrabold uppercase tracking-[0.08em] text-slate-400 lg:text-[10px]">Audio jadi</p>
                <h3 className="text-sm font-extrabold tracking-tight lg:text-[15px]">Hasil</h3>
              </div>
              <span className="text-[11px] font-bold text-slate-400">{results.length} file</span>
            </div>
            {results.length === 0 && (
              <p className="mt-3 text-[12px] font-medium text-slate-500">Belum ada audio. Tulis naskah, lalu klik Buat voice. Hasil tersimpan di browser ini.</p>
            )}
            {results.map((item) => (
              <div key={item.id} className="flex items-center gap-2.5 border-t border-black/[0.06] py-2.5 first:border-t-0">
                <button
                  type="button"
                  aria-label={playingId === item.id ? `Jeda ${item.title}` : `Putar ${item.title}`}
                  onClick={() => togglePlay(item)}
                  className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-slate-900 text-white"
                >
                  {playingId === item.id ? <Pause className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true" />}
                </button>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-extrabold tracking-tight">{item.title}</span>
                  <span className="mt-0.5 block text-[10.5px] font-semibold text-slate-500">
                    {shortClock(item.durationSec)} · {formatIdDate(item.createdAt)} · {item.voiceName} · {item.modelLabel}
                  </span>
                </span>
                <button type="button" onClick={() => download(item)} className="inline-flex shrink-0 items-center gap-1 rounded-[10px] border border-black/[0.06] bg-white px-2 py-1.5 text-[10.5px] font-extrabold">
                  <Download className="h-3 w-3" aria-hidden="true" /> Unduh WAV
                </button>
              </div>
            ))}
            {results.length > 0 && (
              <p className="mt-1 text-[11px] font-medium text-slate-400">Audio tersimpan di browser ini dan bisa diunduh sebagai WAV.</p>
            )}
          </section>

          <section className="mt-4 hidden rounded-2xl border border-black/[0.06] bg-white p-[18px] shadow-[0_8px_28px_rgba(15,23,42,0.06)] lg:block">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">Cara kerja</p>
            <h3 className="text-[15px] font-extrabold tracking-tight">Dua langkah profil baru</h3>
            <div className="mt-3 flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-extrabold text-white">1</span>
              <p className="text-[13px] leading-snug text-slate-600"><b className="text-slate-900">Referensi suara.</b> Pilih klip Mentahan di OneDrive atau unggah dari perangkat, lalu potong 10–30 detik yang bersih.</p>
            </div>
            <div className="mt-3 flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-extrabold text-white">2</span>
              <p className="text-[13px] leading-snug text-slate-600"><b className="text-slate-900">Rekaman izin.</b> Gemini mewajibkan rekaman izin dari pemilik suara, dibaca sekali dari HP atau mikrofon.</p>
            </div>
          </section>
        </div>
      </div>

      {pendingDelete && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div role="dialog" aria-modal="true" aria-labelledby="hapus-suara" className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
            <h3 id="hapus-suara" className="text-base font-extrabold">Hapus profil suara?</h3>
            <p className="mt-1 text-[13px] font-medium text-slate-600">Profil “{pendingDelete.name}” dihapus dari Gemini. Audio yang sudah tersimpan di browser ini tidak ikut terhapus.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setPendingDelete(null)} className="rounded-xl border border-black/[0.06] px-3 py-2 text-[12px] font-extrabold">Batal</button>
              <button type="button" onClick={confirmDelete} className="rounded-xl bg-red-700 px-3 py-2 text-[12px] font-extrabold text-white">Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
