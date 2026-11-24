import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
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
  FISH_ENDED_MESSAGE,
  FISH_FREE_MODEL,
  INWORLD_STOP_MESSAGE,
  INWORLD_TTS_MODEL,
  fishFreeStatus,
} from '../server/voice-free.js';
import { initialSelection, moveSelection, parseWavPcm, renderTrimmedWav, waveformPeaks } from '../server/voice-audio.js';
import { base64ToBytes, bytesToBase64, decodeMediaFile } from './voiceDecode.js';
import { readInworldUsage, rememberInworldAudio } from './inworldMeter.js';
import { deleteVoiceResult, listVoiceResults, saveVoiceResult } from './voiceStore.js';
import { GEMINI_VOICE_LABEL, filterVoices, geminiGenderLabel, geminiVoiceGender, partitionProfiles, voiceSample } from './voicePicker.js';

const ENGINES = [
  { id: 'gemini', label: 'Gemini' },
  { id: 'fish', label: 'Fish' },
  { id: 'inworld', label: 'Inworld' },
];
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
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
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
  return String(fileName || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
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

function enginePath(engine, extra = '') {
  const params = new URLSearchParams(extra);
  if (engine === 'fish' || engine === 'inworld') params.set('engine', engine);
  const query = params.toString();
  return query ? `/api/voice?${query}` : '/api/voice';
}

function FieldLabel({ children }) {
  return <span className="mb-1 block text-[8.5px] font-extrabold uppercase tracking-[0.08em] text-slate-400">{children}</span>;
}

function WaveTrim({ samples, sampleRate, selection, minSeconds, onChange }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const duration = samples.length / sampleRate;
  const peaks = useMemo(() => waveformPeaks(samples, 48), [samples]);
  const left = selection ? (selection.start / duration) * 100 : 0;
  const width = selection ? ((selection.end - selection.start) / duration) * 100 : 0;

  function secondsAt(clientX) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect?.width) return 0;
    return Math.min(duration, Math.max(0, ((clientX - rect.left) / rect.width) * duration));
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
    const next = mode === 'body'
      ? moveSelection(duration, start + (point - anchor), end + (point - anchor), minSeconds)
      : moveSelection(duration, mode === 'start' ? point : start, mode === 'end' ? point : end, minSeconds);
    if (next) onChange(next);
  }

  return (
    <div className="mt-2.5">
      <div ref={ref} className="relative h-14 overflow-hidden rounded-xl border border-black/[0.06] bg-[#f3f5f4]" onPointerMove={pointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <div className="absolute inset-0 flex items-center gap-px px-1">
          {peaks.map((peak, index) => {
            const ratio = index / peaks.length;
            const active = selection && ratio >= selection.start / duration && ratio <= selection.end / duration;
            return <span key={index} className={`flex-1 rounded-sm ${active ? 'bg-emerald-500' : 'bg-emerald-200'}`} style={{ height: `${Math.max(8, peak * 100)}%` }} />;
          })}
        </div>
        {selection && (
          <div className="absolute inset-y-0 cursor-grab border-x-2 border-emerald-600 bg-emerald-600/15" style={{ left: `${left}%`, width: `${width}%` }} onPointerDown={(event) => pointerDown(event, 'body')}>
            <span className="absolute top-1/2 left-0 h-5 w-2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded bg-emerald-600" onPointerDown={(event) => { event.stopPropagation(); pointerDown(event, 'start'); }} />
            <span className="absolute top-1/2 right-0 h-5 w-2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded bg-emerald-600" onPointerDown={(event) => { event.stopPropagation(); pointerDown(event, 'end'); }} />
          </div>
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] font-bold text-slate-500">
        <span>00:00</span>
        <b className="font-extrabold text-emerald-800">{selection ? `${clock(selection.start)} – ${clock(selection.end)} · ${Math.round(selection.end - selection.start)} detik` : `Pilih ${minSeconds}–30 detik`}</b>
        <span>{clock(duration)}</span>
      </div>
    </div>
  );
}

function GenderBadge({ voice }) {
  const gender = geminiVoiceGender(voice);
  const tone = gender === 'unknown' ? 'bg-slate-50 text-slate-400' : 'bg-slate-100 text-slate-700';
  return <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${tone}`}>{geminiGenderLabel(voice)}</span>;
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

function GeminiVoiceSelect({ voices, value, onChange, playingId, onPlaySample }) {
  const listId = useId();
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = voices.find((voice) => voice.id === value) || null;
  const shown = filterVoices(voices, query);
  const sample = voiceSample(selected);
  const sampleId = selected ? `sample:${selected.id}` : '';

  useEffect(() => {
    if (!open) return undefined;
    searchRef.current?.focus();
    function onPointer(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function choose(id) {
    onChange(id);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={rootRef} className="relative mt-2 border-t border-black/[0.06] pt-2">
      <span id={`${listId}-label`} className="mb-1 block text-[8.5px] font-extrabold uppercase tracking-[0.08em] text-slate-400">{GEMINI_VOICE_LABEL}</span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-10 min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border border-black/[0.06] bg-white px-2.5 py-2 text-left text-[12.5px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
        >
          <span className={`flex min-w-0 items-center gap-2 ${selected ? 'text-slate-900' : 'text-slate-500'}`}>
            <span className="truncate">{selected ? selected.name : GEMINI_VOICE_LABEL}</span>
            {selected && <GenderBadge voice={selected} />}
          </span>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {sample && (
          <button
            type="button"
            aria-label={playingId === sampleId ? `Jeda sampel ${selected.name}` : `Putar sampel ${selected.name}`}
            onClick={() => onPlaySample(selected)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            {playingId === sampleId ? <Pause className="h-3.5 w-3.5" fill="currentColor" /> : <Play className="h-3.5 w-3.5" fill="currentColor" />}
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-black/[0.06] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.16)]">
          <div className="border-b border-black/[0.06] p-2">
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && shown[0]) {
                  event.preventDefault();
                  choose(shown[0].id);
                }
              }}
              placeholder="Cari suara"
              aria-label="Cari suara Gemini"
              autoComplete="off"
              enterKeyHint="search"
              className="w-full rounded-lg border border-black/[0.06] px-2.5 py-2 text-[12.5px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            />
          </div>
          <ul id={listId} role="listbox" aria-labelledby={`${listId}-label`} className="max-h-52 overflow-y-auto overscroll-contain">
            {shown.length === 0 && <li className="px-3 py-2.5 text-[12px] font-semibold text-slate-500">Tidak ada suara yang cocok.</li>}
            {shown.map((voice) => {
              const active = voice.id === value;
              return (
                <li key={voice.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => choose(voice.id)}
                    className={`flex min-h-10 w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12.5px] focus:outline-none focus-visible:bg-emerald-50 ${active ? 'bg-emerald-50 font-extrabold text-emerald-900' : 'font-semibold text-slate-800'}`}
                  >
                    <span className="truncate">{voice.name}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <GenderBadge voice={voice} />
                      {active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function ReferenceForm({ engine, rawAssets, minSeconds, onCancel, onCreated }) {
  const fileRef = useRef(null);
  const cancelRead = useRef(false);
  const [sourceKind, setSourceKind] = useState('drive');
  const [driveQuery, setDriveQuery] = useState('');
  const [source, setSource] = useState(null);
  const [selection, setSelection] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const files = useMemo(() => mentahanChoices(rawAssets), [rawAssets]);
  const visibleFiles = files.filter((file) => `${file.name} ${file.produk}`.toLowerCase().includes(driveQuery.trim().toLowerCase())).slice(0, 40);

  useEffect(() => () => { cancelRead.current = true; }, []);

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
      const next = initialSelection(duration, minSeconds);
      if (!next) {
        setError(`Referensi harus ${minSeconds}–30 detik suara yang bersih.`);
        return;
      }
      setSource({ name: file.name || 'Referensi', origin, samples: decoded.samples, sampleRate: decoded.sampleRate });
      setSelection(next);
      setDisplayName((current) => current || suggestName(file.name));
    } catch (err) {
      if (!cancelRead.current) setError(err instanceof Error ? err.message : 'Audio tidak bisa dibaca.');
    } finally {
      setBusy('');
    }
  }

  async function chooseDrive(file) {
    setBusy('Mengambil file Mentahan…');
    setError('');
    try {
      const response = await fetch(`/api/onedrive-stream?id=${encodeURIComponent(file.fileId)}&proxy=1`);
      const result = response.ok ? null : await readJson(response);
      if (!response.ok) throw new Error(failureText(result, 'File OneDrive tidak bisa diambil. Coba unggah dari HP.'));
      const blob = await response.blob();
      await adoptFile(new File([blob], file.name, { type: blob.type || 'video/mp4' }), 'OneDrive Mentahan');
    } catch (err) {
      setBusy('');
      setError(err instanceof Error ? err.message : 'File OneDrive tidak bisa diambil.');
    }
  }

  async function saveProfile() {
    if (!source || !selection || !displayName.trim()) return;
    setBusy('Menyimpan profil…');
    setError('');
    try {
      const wav = renderTrimmedWav(source.samples, source.sampleRate, selection.start, selection.end);
      const response = await fetch(enginePath(engine), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', displayName: displayName.trim(), sourceWav: bytesToBase64(wav) }),
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

  return (
    <section className="rounded-[20px] border border-black/[0.06] bg-white p-3.5 shadow-[0_8px_28px_rgba(15,23,42,0.07)]">
      <p className="text-[8.5px] font-extrabold uppercase tracking-[0.08em] text-slate-400">Referensi suara · {engine === 'fish' ? 'Fish' : 'Inworld'}</p>
      <h3 className="text-sm font-extrabold">Potong {minSeconds}–30 detik</h3>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button type="button" onClick={() => setSourceKind('drive')} className={`rounded-[14px] border px-2.5 py-2.5 text-left ${sourceKind === 'drive' ? 'border-emerald-300 bg-emerald-50' : 'border-black/[0.06]'}`}>
          <Cloud className="mb-1 h-4 w-4 text-emerald-700" aria-hidden="true" />
          <span className="block text-[11.5px] font-extrabold">OneDrive Mentahan</span>
        </button>
        <button type="button" onClick={() => { setSourceKind('upload'); fileRef.current?.click(); }} className={`rounded-[14px] border px-2.5 py-2.5 text-left ${sourceKind === 'upload' ? 'border-emerald-300 bg-emerald-50' : 'border-black/[0.06]'}`}>
          <Upload className="mb-1 h-4 w-4" aria-hidden="true" />
          <span className="block text-[11.5px] font-extrabold">Unggah dari HP</span>
        </button>
      </div>
      <input ref={fileRef} type="file" accept="audio/*,video/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) adoptFile(file, 'Unggah dari HP'); }} />
      {sourceKind === 'drive' && (
        <div className="mt-2">
          <input value={driveQuery} onChange={(event) => setDriveQuery(event.target.value)} placeholder="Cari file Mentahan" className="mb-1 w-full rounded-xl border border-black/[0.06] px-2.5 py-2 text-[12px] font-semibold" />
          <div className="max-h-36 overflow-y-auto rounded-xl border border-black/[0.06]">
            {visibleFiles.length === 0 && <p className="px-2.5 py-3 text-[11px] font-semibold text-slate-500">Belum ada file Mentahan. Sinkronkan OneDrive, atau unggah dari HP.</p>}
            {visibleFiles.map((file) => (
              <button key={file.fileId} type="button" onClick={() => chooseDrive(file)} className="block w-full border-t border-black/[0.06] px-2.5 py-2 text-left first:border-t-0">
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
          <button type="button" aria-label="Putar potongan" onClick={() => playSlice(source, selection)} className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-slate-900 text-white"><Play className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true" /></button>
        </div>
      )}
      {source && selection && <WaveTrim samples={source.samples} sampleRate={source.sampleRate} selection={selection} minSeconds={minSeconds} onChange={setSelection} />}
      <label className="mt-3 block">
        <FieldLabel>Nama profil</FieldLabel>
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value.slice(0, 60))} placeholder="Nama pemilik suara" className="w-full rounded-xl border border-black/[0.06] px-2.5 py-2 text-[12.5px] font-semibold" />
      </label>
      {error && <p className="mt-2 text-[11px] font-bold text-red-700" role="alert">{error}</p>}
      <button type="button" onClick={saveProfile} disabled={!source || !selection || !displayName.trim() || Boolean(busy)} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-50">
        <Check className="h-3.5 w-3.5" aria-hidden="true" /> {busy === 'Menyimpan profil…' ? 'Menyimpan…' : 'Simpan profil suara'}
      </button>
      <button type="button" onClick={onCancel} className="mt-2 text-[12px] font-bold text-slate-500">Batal</button>
    </section>
  );
}

function DesignForm({ onCancel, onCreated }) {
  const [displayName, setDisplayName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sample, setSample] = useState('');
  const [saved, setSaved] = useState(null);

  async function saveProfile() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'design', displayName: displayName.trim(), prompt: prompt.trim() }),
      });
      const result = await readJson(response);
      if (!response.ok) throw new Error(failureText(result, 'Desain suara gagal disimpan.'));
      if (result.sampleWav) {
        setSample(result.sampleWav);
        setSaved(result.voice);
        return;
      }
      onCreated(result.voice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Desain suara gagal disimpan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[20px] border border-black/[0.06] bg-white p-3.5 shadow-[0_8px_28px_rgba(15,23,42,0.07)]">
      <p className="text-[8.5px] font-extrabold uppercase tracking-[0.08em] text-slate-400">Gemini · desain suara</p>
      <h3 className="text-sm font-extrabold">Deskripsi bahasa alami</h3>
      <p className="mt-1 text-[11px] font-medium text-slate-500">Replikasi suara Gemini dimatikan karena butuh paket berbayar. Desain suara tetap di free tier.</p>
      <label className="mt-2 block">
        <FieldLabel>Nama profil</FieldLabel>
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value.slice(0, 60))} className="w-full rounded-xl border border-black/[0.06] px-2.5 py-2 text-[12.5px] font-semibold" />
      </label>
      <label className="mt-2 block">
        <FieldLabel>Deskripsi</FieldLabel>
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value.slice(0, 500))} rows={4} placeholder="Misalnya suara perempuan dewasa, hangat, tempo sedang." className="w-full rounded-xl border border-black/[0.06] px-3 py-2 text-[12.5px] font-medium" />
      </label>
      {sample && <button type="button" className="mt-2 text-[12px] font-extrabold text-emerald-800" onClick={() => new Audio(URL.createObjectURL(new Blob([base64ToBytes(sample)], { type: 'audio/wav' }))).play()}>Putar pratinjau</button>}
      {error && <p className="mt-2 text-[11px] font-bold text-red-700" role="alert">{error}</p>}
      <button type="button" onClick={saved ? () => onCreated(saved) : saveProfile} disabled={!saved && (!displayName.trim() || prompt.trim().length < 8 || busy)} className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-3 py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-50">{saved ? 'Selesai' : (busy ? 'Menyimpan…' : 'Simpan desain suara')}</button>
      <button type="button" onClick={onCancel} className="mt-2 text-[12px] font-bold text-slate-500">Batal</button>
    </section>
  );
}

export default function EditorVoicePanel({ rawAssets = [], onChromeChange, backRef }) {
  const [clock, setClock] = useState(() => Date.now());
  const fishNow = fishFreeStatus(clock);
  const [engine, setEngine] = useState('gemini');
  const [creating, setCreating] = useState(false);
  const [accounts, setAccounts] = useState({
    gemini: { configured: true, voices: [], message: '' },
    fish: { configured: true, voices: [], message: '', fish: fishNow },
    inworld: { configured: true, voices: [], message: '' },
  });
  const [picked, setPicked] = useState({ gemini: '', fish: '', inworld: '' });
  const [script, setScript] = useState('');
  const [style, setStyle] = useState('');
  const [model, setModel] = useState(FLASH);
  const [results, setResults] = useState([]);
  const [working, setWorking] = useState('');
  const [formError, setFormError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingAudio, setPendingAudio] = useState(null);
  const [playback, setPlayback] = useState({ id: '', current: 0, duration: 0, playing: false });
  const [usage, setUsage] = useState(() => readInworldUsage());
  const playerRef = useRef(null);
  const playingId = playback.playing ? playback.id : '';

  async function loadEngine(id) {
    const response = await fetch(enginePath(id));
    const result = await readJson(response);
    if (id === 'fish' && (response.status === 410 || result?.fish?.expired)) {
      return { configured: result?.configured !== false, voices: [], message: result?.message || FISH_ENDED_MESSAGE, fish: result?.fish || fishFreeStatus(Date.now()) };
    }
    if (!response.ok && response.status !== 503) {
      return { configured: result?.configured !== false, voices: [], message: failureText(result, 'Profil tidak bisa dimuat.') };
    }
    return {
      configured: result?.configured !== false,
      voices: Array.isArray(result?.voices) ? result.voices : [],
      message: result?.configured === false ? (result.message || '') : (response.ok ? '' : failureText(result, '')),
      fish: result?.fish,
    };
  }

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const entries = await Promise.all(ENGINES.map(async (item) => [item.id, await loadEngine(item.id).catch((err) => ({ configured: true, voices: [], message: err.message }))]));
      if (ignore) return;
      setAccounts(Object.fromEntries(entries));
    })();
    listVoiceResults().then((rows) => { if (!ignore) setResults(rows); }).catch(() => {});
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    if (!onChromeChange) return undefined;
    onChromeChange(creating ? { title: engine === 'gemini' ? 'Desain suara' : 'Buat profil suara', subtitle: engine === 'gemini' ? 'Deskripsikan suara, tanpa rekaman izin.' : 'Potong referensi, lalu simpan profil.', back: true } : null);
    return () => onChromeChange(null);
  }, [creating, engine, onChromeChange]);

  useEffect(() => {
    if (!backRef) return undefined;
    backRef.current = () => setCreating(false);
    return () => { backRef.current = () => {}; };
  }, [backRef]);

  useEffect(() => () => {
    playerRef.current?.audio.pause();
    if (playerRef.current?.url) URL.revokeObjectURL(playerRef.current.url);
  }, []);

  const fish = accounts.fish.fish || fishNow;
  const voices = accounts[engine]?.voices || [];
  const voiceId = voices.some((voice) => voice.id === picked[engine]) ? picked[engine] : (voices[0]?.id || '');
  const profileParts = partitionProfiles(voices);
  const createdVoices = engine === 'gemini' ? profileParts.created : voices;
  const prebuiltVoices = engine === 'gemini' ? profileParts.prebuilt : [];
  const prebuiltId = prebuiltVoices.some((voice) => voice.id === voiceId) ? voiceId : '';

  const counts = useMemo(() => {
    const map = new Map();
    for (const item of results) {
      const current = map.get(item.voiceId) || { count: 0, latest: '' };
      current.count += 1;
      if (!current.latest || String(item.createdAt) > current.latest) current.latest = item.createdAt;
      map.set(item.voiceId, current);
    }
    return map;
  }, [results]);

  function chipFor(id) {
    if (id === 'gemini') return accounts.gemini.configured ? 'Gratis · batas harian' : 'Belum dikonfigurasi';
    if (id === 'fish') return fish.expired ? 'Berakhir' : (accounts.fish.configured ? fish.label : 'Belum dikonfigurasi');
    if (!accounts.inworld.configured) return 'Belum dikonfigurasi';
    if (usage.stopped) return 'Batas 65 menit';
    return `Sisa ${usage.remainingMinutes} menit gratis`;
  }

  async function helpScript() {
    setWorking('naskah');
    setFormError('');
    try {
      const prompt = [
        'Kamu membantu editor iklan TikTok berbahasa Indonesia menulis naskah yang akan dibacakan apa adanya.',
        'Hasilkan 4 sampai 7 kalimat pendek, natural, tanpa markdown dan tanpa arahan panggung.',
        script.trim() ? `Perhalus naskah berikut:\n${script.trim()}` : 'Tulis contoh naskah promosi singkat tanpa mengarang nama merek.',
        'Balas hanya naskahnya.',
      ].join('\n\n');
      const response = await fetch('/api/gemini', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, temperature: 0.7, maxOutputTokens: 700 }) });
      const result = await readJson(response);
      if (!response.ok || !result?.text?.trim()) throw new Error(failureText(result, 'Gemini tidak bisa menulis naskah.'));
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
    if (engine === 'fish' && fish.expired) {
      setFormError(FISH_ENDED_MESSAGE);
      return;
    }
    if (engine === 'inworld' && usage.stopped) {
      setFormError(INWORLD_STOP_MESSAGE);
      return;
    }
    setWorking('voice');
    setFormError('');
    try {
      const payload = { action: 'speak', voiceId, text };
      if (engine === 'gemini') {
        payload.style = style.trim();
        payload.model = model;
      }
      const response = await fetch(enginePath(engine), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await readJson(response);
      if (!response.ok || typeof result?.audioWav !== 'string') throw new Error(failureText(result, 'Voice gagal dibuat.'));
      const bytes = base64ToBytes(result.audioWav);
      let durationSec = 0;
      try { durationSec = parseWavPcm(bytes).duration; } catch { durationSec = 0; }
      if (engine === 'inworld') setUsage(rememberInworldAudio(durationSec));
      const voice = voices.find((item) => item.id === voiceId);
      const item = {
        id: `${Date.now()}-${voiceId}`,
        title: text.split('\n').map((line) => line.trim()).find(Boolean)?.slice(0, 48) || 'Voice',
        voiceId,
        voiceName: voice?.name || 'Profil suara',
        engine,
        modelLabel: engine === 'gemini' ? (model === FLASH_LITE ? 'Flash-Lite' : 'Flash') : (engine === 'fish' ? 's2.1-pro-free' : 'tts-2-flash'),
        createdAt: new Date().toISOString(),
        durationSec,
        wav: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      };
      try {
        await saveVoiceResult(item);
        setResults(await listVoiceResults());
      } catch {
        setResults((current) => [item, ...current].slice(0, 24));
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Voice gagal dibuat.');
    } finally {
      setWorking('');
    }
  }

  async function confirmDelete() {
    if (!pendingDelete || pendingDelete.kind === 'prebuilt') return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      const response = await fetch(enginePath(engine, `id=${encodeURIComponent(target.id)}`), { method: 'DELETE' });
      const result = await readJson(response);
      if (!response.ok) throw new Error(failureText(result, 'Profil gagal dihapus.'));
      const next = await loadEngine(engine);
      setAccounts((current) => ({ ...current, [engine]: next }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Profil gagal dihapus.');
    }
  }

  function bindPlayer(audio, id, fallbackDuration) {
    const publish = () => {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (Number(fallbackDuration) || 0);
      setPlayback({
        id,
        current: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
        duration,
        playing: !audio.paused && !audio.ended,
      });
    };
    audio.ontimeupdate = publish;
    audio.onplay = publish;
    audio.onpause = publish;
    audio.onloadedmetadata = publish;
    audio.onended = () => {
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (Number(fallbackDuration) || 0);
      setPlayback({ id, current: duration, duration, playing: false });
    };
  }

  function openPlayer(item) {
    const existing = playerRef.current;
    if (existing?.id === item.id) return existing;
    if (existing) {
      existing.audio.pause();
      URL.revokeObjectURL(existing.url);
    }
    const url = URL.createObjectURL(new Blob([wavBytes(item.wav)], { type: 'audio/wav' }));
    const audio = new Audio(url);
    audio.preload = 'auto';
    const fallback = Number(item.durationSec) || 0;
    bindPlayer(audio, item.id, fallback);
    const player = { id: item.id, audio, url, fallback, pendingSeek: null, waitingSeek: false };
    playerRef.current = player;
    setPlayback({ id: item.id, current: 0, duration: fallback, playing: false });
    return player;
  }

  function togglePlay(item) {
    const player = openPlayer(item);
    if (!player.audio.paused && !player.audio.ended) {
      player.audio.pause();
      return;
    }
    if (player.audio.ended) player.audio.currentTime = 0;
    player.audio.play().catch(() => setFormError('Audio tidak bisa diputar di browser ini.'));
  }

  function seekItem(item, seconds) {
    const player = openPlayer(item);
    const requested = Number(seconds);
    const known = Number.isFinite(player.audio.duration) && player.audio.duration > 0 ? player.audio.duration : (player.fallback || 0);
    const next = Math.min(Math.max(0, Number.isFinite(requested) ? requested : 0), known || 0);
    player.pendingSeek = next;
    setPlayback({
      id: item.id,
      current: next,
      duration: known,
      playing: !player.audio.paused && !player.audio.ended,
    });
    const apply = () => {
      if (playerRef.current !== player || player.pendingSeek == null) return;
      const target = player.pendingSeek;
      player.pendingSeek = null;
      const duration = Number.isFinite(player.audio.duration) && player.audio.duration > 0 ? player.audio.duration : (player.fallback || 0);
      const clamped = Math.min(Math.max(0, target), duration || 0);
      if (player.audio.readyState >= 1) {
        try { player.audio.currentTime = clamped; } catch { /* metadata belum siap */ }
      }
      setPlayback({
        id: item.id,
        current: clamped,
        duration,
        playing: !player.audio.paused && !player.audio.ended,
      });
    };
    if (player.audio.readyState >= 1) apply();
    else if (!player.waitingSeek) {
      player.waitingSeek = true;
      player.audio.addEventListener('loadedmetadata', () => {
        player.waitingSeek = false;
        apply();
      }, { once: true });
    }
  }

  function releasePlayer(id) {
    const current = playerRef.current;
    if (!current || (id && current.id !== id)) return;
    current.audio.pause();
    URL.revokeObjectURL(current.url);
    playerRef.current = null;
    setPlayback({ id: '', current: 0, duration: 0, playing: false });
  }

  async function confirmDeleteAudio() {
    if (!pendingAudio) return;
    const target = pendingAudio;
    setPendingAudio(null);
    try {
      await deleteVoiceResult(target.id);
      releasePlayer(target.id);
      setResults((current) => current.filter((item) => item.id !== target.id));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Audio gagal dihapus.');
    }
  }

  function playVoiceSample(voice) {
    const sample = voiceSample(voice);
    if (!sample) return;
    try {
      togglePlay({ id: `sample:${voice.id}`, wav: base64ToBytes(sample.sampleWav) });
    } catch {
      setFormError('Sampel suara tidak bisa diputar.');
    }
  }

  function download(item) {
    const url = URL.createObjectURL(new Blob([wavBytes(item.wav)], { type: 'audio/wav' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileSlug(item.title)}.wav`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  const active = accounts[engine];
  const createDisabled = (engine === 'fish' && fish.expired) || (engine === 'inworld' && usage.stopped) || !active.configured;
  const speakDisabled = !voiceId || !script.trim() || working === 'voice' || !active.configured || (engine === 'fish' && fish.expired) || (engine === 'inworld' && usage.stopped);

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-[58vh] lg:px-8 lg:py-7 lg:pb-7">
      <div className={creating ? 'hidden lg:mb-4 lg:flex lg:items-start lg:justify-between' : 'mb-2.5 lg:mb-4 lg:flex lg:items-start lg:justify-between lg:gap-4'}>
        <div className="hidden lg:block">
          <h2 className="text-[26px] font-extrabold tracking-tight text-gray-900">Editor Voice</h2>
          <p className="mt-1 text-sm font-medium text-gray-500">Mesin gratis saja. Replikasi Gemini berbayar dimatikan.</p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10.5px] font-bold text-emerald-800 lg:px-3 lg:py-1.5 lg:text-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
          {chipFor(engine)}
        </div>
      </div>

      {!active.configured && (
        <div className="mb-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-950" role="status">{active.message}</div>
      )}
      {engine === 'fish' && fish.expired && (
        <div className="mb-2.5 rounded-2xl border border-slate-300 bg-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-800" role="status">{FISH_ENDED_MESSAGE}</div>
      )}
      {engine === 'fish' && !fish.expired && fish.warn && (
        <div className="mb-2.5 rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-950" role="status">Masa gratis Fish Audio tinggal {fish.daysLeft} hari. Setelah 30 Nov 2026 mesin ini berhenti.</div>
      )}
      {engine === 'inworld' && usage.stopped && (
        <div className="mb-2.5 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-800" role="status">{INWORLD_STOP_MESSAGE} Penghitung ini hanya di browser ini.</div>
      )}
      {engine === 'inworld' && usage.warn && !usage.stopped && (
        <div className="mb-2.5 rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-950" role="status">Sisa {usage.remainingMinutes} menit gratis Inworld di browser ini. Berhenti otomatis di 65 menit.</div>
      )}

      {creating && (
        <div className="lg:fixed lg:inset-0 lg:z-50 lg:flex lg:items-center lg:justify-center lg:bg-slate-900/40 lg:p-6">
          <div className="lg:max-h-[90vh] lg:w-full lg:max-w-lg lg:overflow-y-auto lg:rounded-[28px] lg:bg-[#f3f5f4] lg:p-4">
            {engine === 'gemini'
              ? <DesignForm onCancel={() => setCreating(false)} onCreated={() => { setCreating(false); loadEngine('gemini').then((next) => setAccounts((current) => ({ ...current, gemini: next }))); }} />
              : <ReferenceForm engine={engine} rawAssets={rawAssets} minSeconds={engine === 'inworld' ? 3 : 10} onCancel={() => setCreating(false)} onCreated={() => { setCreating(false); loadEngine(engine).then((next) => setAccounts((current) => ({ ...current, [engine]: next }))); }} />}
          </div>
        </div>
      )}

      <div className={creating ? 'hidden lg:grid lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:gap-4' : 'lg:grid lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:gap-4'}>
        <div>
          <section className="relative z-20 rounded-[20px] border border-black/[0.06] bg-white p-3.5 shadow-[0_8px_28px_rgba(15,23,42,0.07)]">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[8.5px] font-extrabold uppercase tracking-[0.08em] text-slate-400">Suara tersimpan</p>
                <h3 className="text-sm font-extrabold">Profil suara</h3>
              </div>
              <button type="button" disabled={createDisabled} onClick={() => setCreating(true)} className="hidden items-center gap-1 rounded-full border border-black/[0.06] px-2.5 py-1.5 text-[11px] font-extrabold disabled:opacity-40 lg:inline-flex">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {engine === 'gemini' ? 'Desain suara' : 'Buat profil suara'}
              </button>
            </div>
            {createdVoices.length === 0 && prebuiltVoices.length === 0 && <p className="mt-3 text-[12px] font-semibold text-slate-500">{active.message || (engine === 'gemini' ? 'Pilih suara bawaan, atau desain suara baru.' : 'Belum ada profil di mesin ini.')}</p>}
            {createdVoices.map((voice, index) => (
              <div key={`${voice.engine}-${voice.id}`} className="flex items-center gap-2.5 border-t border-black/[0.06] py-2.5 first:border-t-0">
                <button type="button" aria-pressed={voice.id === voiceId} onClick={() => setPicked((current) => ({ ...current, [engine]: voice.id }))} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold ${AVATAR_TONES[index % AVATAR_TONES.length]} ${voice.id === voiceId ? 'ring-2 ring-emerald-600' : ''}`}>{initials(voice.name)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-extrabold">{voice.name}</span>
                    <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">{counts.get(voice.id)?.count ? `${counts.get(voice.id).count} naskah · ${formatIdDate(counts.get(voice.id).latest)}` : voice.kind === 'prebuilt' ? 'Suara bawaan' : 'Belum dipakai'}</span>
                  </span>
                </button>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">{voice.engine === 'gemini' ? 'Gemini' : voice.engine === 'fish' ? 'Fish' : 'Inworld'}</span>
                {voice.kind !== 'prebuilt' && (
                  <button type="button" aria-label={`Hapus ${voice.name}`} onClick={() => setPendingDelete(voice)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
                )}
              </div>
            ))}
            {engine === 'gemini' && (
              <GeminiVoiceSelect
                voices={prebuiltVoices}
                value={prebuiltId}
                onChange={(id) => setPicked((current) => ({ ...current, gemini: id }))}
                playingId={playingId}
                onPlaySample={playVoiceSample}
              />
            )}
            <button type="button" disabled={createDisabled} onClick={() => setCreating(true)} className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-black/[0.06] px-3 py-2.5 text-[12.5px] font-extrabold disabled:opacity-40 lg:hidden">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {engine === 'gemini' ? 'Desain suara' : 'Buat profil suara'}
            </button>
          </section>

          <section className="mt-2.5 rounded-[20px] border border-black/[0.06] bg-white p-3.5 shadow-[0_8px_28px_rgba(15,23,42,0.07)]">
            <p className="text-[8.5px] font-extrabold uppercase tracking-[0.08em] text-slate-400">Teks ke suara</p>
            <h3 className="text-sm font-extrabold">Naskah</h3>
            <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-[#f1f5f4] p-1" role="radiogroup" aria-label="Mesin suara">
              {ENGINES.map((item) => (
                <button key={item.id} type="button" role="radio" aria-checked={engine === item.id} disabled={item.id === 'fish' && fish.expired} onClick={() => setEngine(item.id)} className={`rounded-[10px] px-1 py-1.5 text-center disabled:opacity-50 ${engine === item.id ? 'bg-white font-extrabold text-emerald-800 shadow-sm' : 'font-bold text-slate-500'}`}>
                  <span className="block text-[12px]">{item.label}</span>
                  <span className="mt-0.5 block text-[8.5px] font-bold leading-tight text-emerald-800">{chipFor(item.id)}</span>
                </button>
              ))}
            </div>
            {fish.expired && <p className="mt-2 text-[11px] font-bold text-slate-600">{FISH_ENDED_MESSAGE}</p>}
            <label className="mt-2 block">
              <FieldLabel>Profil suara</FieldLabel>
              <span className="relative block">
                <select value={voiceId} onChange={(event) => setPicked((current) => ({ ...current, [engine]: event.target.value }))} className="w-full appearance-none rounded-xl border border-black/[0.06] px-2.5 py-2 pr-8 text-[12.5px] font-semibold">
                  {voices.length === 0 && <option value="">Belum ada profil</option>}
                  {voices.map((voice) => <option key={voice.id} value={voice.id}>{engine === 'gemini' && voice.kind === 'prebuilt' ? `${voice.name} · ${geminiGenderLabel(voice)}` : voice.name}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              </span>
            </label>
            <label className="mt-2 block">
              <FieldLabel>Naskah</FieldLabel>
              <textarea value={script} onChange={(event) => setScript(event.target.value.slice(0, SCRIPT_LIMIT))} rows={10} placeholder="Tulis naskah yang akan dibacakan." className="min-h-48 w-full resize-y rounded-xl border border-black/[0.06] px-3 py-2.5 text-[13px] font-medium leading-relaxed lg:min-h-80" />
            </label>
            <div className="mt-1 flex items-center justify-between gap-2 max-lg:pr-16">
              <button type="button" onClick={helpScript} disabled={working === 'naskah'} className="inline-flex items-center gap-1 text-[11.5px] font-bold text-emerald-800 disabled:opacity-50"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" />{working === 'naskah' ? 'Menulis…' : 'Bantu tulis naskah (Gemini)'}</button>
              <span className="text-[10.5px] font-bold text-slate-400">{script.length} karakter</span>
            </div>
            {engine === 'gemini' && (
              <div className="mt-2 grid gap-2 lg:grid-cols-2">
                <label>
                  <FieldLabel>Gaya bicara (opsional)</FieldLabel>
                  <input value={style} onChange={(event) => setStyle(event.target.value.slice(0, 160))} placeholder="santai, semangat" className="w-full rounded-xl border border-black/[0.06] px-2.5 py-2 text-[12.5px] font-semibold" />
                </label>
                <div>
                  <FieldLabel>Model</FieldLabel>
                  <div className="flex rounded-xl bg-[#f1f5f4] p-[3px]">
                    {[[FLASH, 'Flash'], [FLASH_LITE, 'Flash-Lite']].map(([id, label]) => (
                      <button key={id} type="button" onClick={() => setModel(id)} className={`flex-1 rounded-[10px] px-2 py-1.5 text-[11.5px] ${model === id ? 'bg-white font-extrabold text-emerald-800 shadow-sm' : 'font-bold text-slate-500'}`}>{label}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {engine !== 'gemini' && <p className="mt-2 text-[11px] font-bold text-slate-500">Model terkunci: {engine === 'fish' ? FISH_FREE_MODEL : INWORLD_TTS_MODEL}</p>}
            {engine === 'inworld' && <p className="mt-1 text-[10.5px] font-semibold text-slate-400">Penghitung menit hanya di browser ini, bukan di server.</p>}
            <button type="button" onClick={generate} disabled={speakDisabled} className="mt-3 inline-flex w-[calc(100%-4.5rem)] items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-50 lg:w-auto">
              <Mic className="h-3.5 w-3.5" aria-hidden="true" /> {working === 'voice' ? 'Membuat…' : 'Buat voice'}
            </button>
            {formError && <p className="mt-2 text-[11px] font-bold text-red-700" role="alert">{formError}</p>}
          </section>
        </div>
        <section className={creating ? 'hidden rounded-[20px] border border-black/[0.06] bg-white p-3.5 shadow-[0_8px_28px_rgba(15,23,42,0.07)] lg:block' : 'mt-2.5 rounded-[20px] border border-black/[0.06] bg-white p-3.5 shadow-[0_8px_28px_rgba(15,23,42,0.07)] lg:mt-0'}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[8.5px] font-extrabold uppercase tracking-[0.08em] text-slate-400">Audio jadi</p>
              <h3 className="text-sm font-extrabold">Hasil</h3>
            </div>
            <span className="text-[11px] font-bold text-slate-400">{results.length} file</span>
          </div>
          {results.length === 0 && <p className="mt-3 text-[12px] font-medium text-slate-500">Belum ada audio. Hasil tersimpan di browser ini.</p>}
          {results.map((item) => {
            const active = playback.id === item.id;
            const total = active && playback.duration > 0 ? playback.duration : (Number(item.durationSec) || 0);
            const elapsed = active ? Math.min(Math.max(0, playback.current || 0), total || playback.current || 0) : 0;
            const playing = active && playback.playing;
            return (
              <div key={item.id} className="border-t border-black/[0.06] py-2.5">
                <div className="flex items-start gap-2.5">
                  <button type="button" aria-label={playing ? `Jeda ${item.title}` : `Putar ${item.title}`} onClick={() => togglePlay(item)} className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-slate-900 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
                    {playing ? <Pause className="h-3.5 w-3.5" fill="currentColor" /> : <Play className="h-3.5 w-3.5" fill="currentColor" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-extrabold">{item.title}</span>
                    <span className="mt-0.5 block truncate text-[10.5px] font-semibold text-slate-500">{formatIdDate(item.createdAt)} · {item.voiceName} · {item.engine || 'gemini'}</span>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={total > 0 ? total : 0}
                        step={0.1}
                        value={total > 0 ? Math.min(elapsed, total) : 0}
                        disabled={total <= 0}
                        aria-label={`Geser posisi ${item.title}`}
                        aria-valuemin={0}
                        aria-valuemax={Math.round(total)}
                        aria-valuenow={Math.round(elapsed)}
                        aria-valuetext={`${shortClock(elapsed)} dari ${shortClock(total)}`}
                        onChange={(event) => seekItem(item, Number(event.target.value))}
                        className="h-6 min-w-0 flex-1 cursor-pointer accent-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                      />
                      <span className="shrink-0 font-bold tabular-nums text-[10.5px] text-slate-600">{shortClock(elapsed)} / {shortClock(total)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <button type="button" onClick={() => download(item)} className="inline-flex shrink-0 items-center gap-1 rounded-[10px] border border-black/[0.06] px-2 py-1.5 text-[10.5px] font-extrabold"><Download className="h-3 w-3" aria-hidden="true" /> Unduh WAV</button>
                      <button type="button" aria-label={`Hapus ${item.title}`} onClick={() => setPendingAudio(item)} className="inline-flex shrink-0 items-center gap-1 rounded-[10px] border border-red-200 px-2 py-1.5 text-[10.5px] font-extrabold text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-700"><Trash2 className="h-3 w-3" aria-hidden="true" /> Hapus</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      </div>

      {pendingDelete && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
            <h3 className="text-base font-extrabold">Hapus profil suara?</h3>
            <p className="mt-1 text-[13px] font-medium text-slate-600">Profil “{pendingDelete.name}” dihapus dari {pendingDelete.engine === 'fish' ? 'Fish Audio' : pendingDelete.engine === 'inworld' ? 'Inworld' : 'Gemini'}.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setPendingDelete(null)} className="rounded-xl border border-black/[0.06] px-3 py-2 text-[12px] font-extrabold">Batal</button>
              <button type="button" onClick={confirmDelete} className="rounded-xl bg-red-700 px-3 py-2 text-[12px] font-extrabold text-white">Hapus</button>
            </div>
          </div>
        </div>
      )}

      {pendingAudio && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div role="dialog" aria-modal="true" aria-labelledby="hapus-audio-judul" className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
            <h3 id="hapus-audio-judul" className="text-base font-extrabold">Hapus audio ini?</h3>
            <p className="mt-1 text-[13px] font-medium text-slate-600">Audio “{pendingAudio.title}” dihapus dari browser ini. Tindakan ini tidak bisa dibatalkan.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setPendingAudio(null)} className="rounded-xl border border-black/[0.06] px-3 py-2 text-[12px] font-extrabold">Batal</button>
              <button type="button" onClick={confirmDeleteAudio} className="rounded-xl bg-red-700 px-3 py-2 text-[12px] font-extrabold text-white">Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
