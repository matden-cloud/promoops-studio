import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, FolderOpen, RefreshCw } from 'lucide-react';
import { ONEDRIVE_TARGETS } from '../server/onedrive-plan.js';

const TARGETS = [ONEDRIVE_TARGETS.final, ONEDRIVE_TARGETS.mentahan];

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function safeVerifyHref(value) {
  const fallback = 'https://microsoft.com/devicelogin';
  try {
    const url = new URL(value);
    const host = url.hostname;
    if (url.protocol !== 'https:') return fallback;
    if (host !== 'microsoft.com' && host !== 'www.microsoft.com' && host !== 'login.microsoft.com') {
      return fallback;
    }
    return url.toString();
  } catch {
    return fallback;
  }
}

export default function OneDriveSync({ onSynced }) {
  const [connected, setConnected] = useState(null);
  const [busy, setBusy] = useState(null);
  const [login, setLogin] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [resume, setResume] = useState(null);
  const [copied, setCopied] = useState(false);
  const pollTimer = useRef(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(pollTimer.current);
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await fetch('/api/onedrive-login');
        const result = await readJson(response);
        if (ignore || !mounted.current) return;
        if (result?.status === 'success') setConnected(Boolean(result.connected));
        else {
          setConnected(false);
          if (result?.message) setError(result.message);
        }
      } catch {
        if (!ignore && mounted.current) {
          setConnected(false);
          setError('Tidak dapat memeriksa koneksi OneDrive.');
        }
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  function schedulePoll(intervalSec) {
    clearTimeout(pollTimer.current);
    const wait = Math.max(5, Number(intervalSec) || 5) * 1000;
    pollTimer.current = setTimeout(() => {
      pollLogin();
    }, wait);
  }

  async function pollLogin() {
    if (!mounted.current) return;
    try {
      const response = await fetch('/api/onedrive-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'poll' }),
      });
      const result = await readJson(response);
      if (!mounted.current) return;
      if (result?.status === 'pending') {
        schedulePoll(result.interval);
        return;
      }
      if (result?.status === 'connected') {
        setConnected(true);
        setLogin(null);
        setBusy(null);
        setError('');
        return;
      }
      setBusy(null);
      setError(result?.message || 'Gagal masuk OneDrive.');
    } catch {
      if (!mounted.current) return;
      setBusy(null);
      setError('Tidak dapat menghubungi server.');
    }
  }

  async function connect() {
    if (busy) return;
    clearTimeout(pollTimer.current);
    setBusy('login');
    setError('');
    setCopied(false);
    try {
      const response = await fetch('/api/onedrive-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      const result = await readJson(response);
      if (!mounted.current) return;
      if (!response.ok || result?.status === 'error' || !result?.userCode) {
        setBusy(null);
        setError(result?.message || 'Gagal memulai masuk OneDrive.');
        return;
      }
      setLogin({
        userCode: result.userCode,
        verificationUri: result.verificationUri,
        expiresIn: result.expiresIn,
      });
      schedulePoll(result.interval);
    } catch {
      if (!mounted.current) return;
      setBusy(null);
      setError('Tidak dapat menghubungi server.');
    }
  }

  async function copyCode() {
    if (!login?.userCode) return;
    try {
      await navigator.clipboard.writeText(login.userCode);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function runSync(targetId) {
    if (busy) return;
    setBusy(targetId);
    setError('');
    const continued = resume?.target === targetId;
    let cursor = continued ? resume.cursor : null;
    let stats = continued ? resume.stats : null;
    let lastSerial = '';
    let guard = 0;
    let finished = false;
    try {
      while (mounted.current && guard < 500) {
        guard += 1;
        const response = await fetch('/api/onedrive-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: targetId, cursor, stats }),
        });
        const result = await readJson(response);
        if (!mounted.current) return;
        if (!result) throw new Error('Server tidak membalas dengan JSON.');
        if (!response.ok || result.status === 'error') {
          if (result.needsLogin) setConnected(false);
          if (response.status === 400) cursor = null;
          throw new Error(result.message || 'Sinkron OneDrive gagal.');
        }
        stats = result.stats;
        setReport(result);
        if (result.done) {
          finished = true;
          setResume(null);
          if (onSynced) await onSynced();
          break;
        }
        const serial = JSON.stringify(result.cursor);
        if (!result.cursor || serial === lastSerial) {
          throw new Error('Sinkron berhenti sebelum selesai. Jalankan lagi; file yang sudah masuk tidak diulang.');
        }
        lastSerial = serial;
        cursor = result.cursor;
        setResume({ target: targetId, cursor, stats });
      }
      if (!finished && guard >= 500 && mounted.current) {
        throw new Error('Sinkron belum selesai. Klik lanjutkan untuk meneruskan.');
      }
    } catch (err) {
      if (!mounted.current) return;
      if (!finished && cursor) setResume({ target: targetId, cursor, stats });
      else if (!finished) setResume(null);
      setError(err.message || 'Sinkron OneDrive gagal.');
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  const locked = Boolean(busy);
  const kembar = Array.isArray(report?.stats?.kembar) ? report.stats.kembar : [];

  return (
    <div className="mb-6 print:hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Sinkron OneDrive ke FILE_ASSET</p>
          <p className="text-sm text-gray-600 mt-1">
            Memindai subfolder. Baris lama tidak dihapus; yang berubah hanya nama, path, dan link folder.
          </p>
          <p className={`text-xs mt-2 font-semibold ${connected ? 'text-emerald-700' : 'text-amber-700'}`}>
            {connected === null && 'Memeriksa koneksi OneDrive...'}
            {connected === true && 'OneDrive terhubung'}
            {connected === false && 'OneDrive belum terhubung. Masuk sekali dengan kode perangkat.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {TARGETS.map((target) => {
            const running = busy === target.id;
            const continuing = resume?.target === target.id;
            return (
              <button
                key={target.id}
                type="button"
                onClick={() => runSync(target.id)}
                disabled={locked || connected === false}
                title={target.path}
                className="px-4 py-2.5 rounded-xl font-bold text-xs md:text-sm flex items-center gap-2 border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {running ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}
                {running ? 'Memindai...' : (continuing ? `Lanjutkan ${target.label}` : target.button)}
              </button>
            );
          })}
          <button
            type="button"
            onClick={connect}
            disabled={locked}
            className="px-4 py-2.5 rounded-xl font-bold text-xs md:text-sm flex items-center gap-2 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${busy === 'login' ? 'animate-spin text-emerald-600' : ''}`} />
            {busy === 'login' ? 'Menunggu masuk...' : connected ? 'Hubungkan ulang' : 'Hubungkan OneDrive'}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-col sm:flex-row sm:flex-wrap gap-1 text-xs text-gray-500">
        {TARGETS.map((target) => (
          <span key={target.id} className="sm:mr-4">
            <span className="font-semibold text-gray-700">{target.label}:</span> {target.path}
          </span>
        ))}
      </div>

      {login && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-900 font-semibold">Masukkan kode ini di halaman Microsoft, lalu kembali ke sini.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="font-mono text-2xl font-black tracking-widest text-gray-900">{login.userCode}</p>
            <button type="button" onClick={copyCode} className="px-3 py-1.5 rounded-lg bg-white border border-emerald-200 text-xs font-bold text-emerald-800">
              {copied ? 'Kode tersalin' : 'Salin kode'}
            </button>
            <a
              href={safeVerifyHref(login.verificationUri)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-800 underline"
            >
              Buka halaman masuk Microsoft <ExternalLink className="w-4 h-4" />
            </a>
          </div>
          <p className="mt-2 text-xs text-emerald-800">Menunggu konfirmasi. Kode berlaku sekitar {Math.max(1, Math.round((login.expiresIn || 900) / 60))} menit.</p>
        </div>
      )}

      {busy && busy !== 'login' && (
        <p className="mt-4 text-sm font-semibold text-emerald-700" role="status">Memindai folder dan menyimpan ke FILE_ASSET...</p>
      )}

      {report?.stats && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4" role="status">
          <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
            {report.done ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />}
            {report.done ? `Sinkron ${report.label || ''} selesai` : `Memindai ${report.label || ''}...`}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-white border border-gray-200 px-3 py-2">
              <p className="text-[11px] font-bold uppercase text-gray-500">File baru</p>
              <p className="text-lg font-black text-gray-900">{report.stats.baru || 0}</p>
            </div>
            <div className="rounded-lg bg-white border border-gray-200 px-3 py-2">
              <p className="text-[11px] font-bold uppercase text-gray-500">Diperbarui</p>
              <p className="text-lg font-black text-gray-900">{report.stats.diperbarui || 0}</p>
            </div>
            <div className="rounded-lg bg-white border border-gray-200 px-3 py-2">
              <p className="text-[11px] font-bold uppercase text-gray-500">Dilewati</p>
              <p className="text-lg font-black text-gray-900">{report.stats.dilewati || 0}</p>
            </div>
          </div>
          <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${kembar.length ? 'bg-amber-50 border border-amber-200 text-amber-900' : 'text-gray-600'}`}>
            <p className="font-bold">Nama kembar: {kembar.length}</p>
            {kembar.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {kembar.slice(0, 100).map((name, index) => (
                  <li key={`${name}-${index}`} className="break-all">→ {name}</li>
                ))}
                {kembar.length > 100 && <li>dan {kembar.length - 100} nama lain</li>}
              </ul>
            )}
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" role="alert">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
