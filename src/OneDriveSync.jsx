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

function formatRunTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '';
  return date.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCount(value) {
  return Number(value || 0).toLocaleString('id-ID');
}

function DetailNote({ shown, total }) {
  if (total <= shown) return null;
  return (
    <p className="mt-2 text-xs font-semibold text-gray-500">
      Menampilkan {formatCount(shown)} dari {formatCount(total)}.
    </p>
  );
}

function SyncChangelog({ log, scanning, onClose, closeDisabled }) {
  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4" role="region" aria-label={`Hasil sinkron ${log.targetLabel}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-gray-900">Hasil sinkron {log.targetLabel}</p>
          <p className="text-xs text-gray-500 mt-0.5">Mulai {formatRunTime(log.startedAt)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={closeDisabled}
          className="px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Tutup
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">File baru ({formatCount(log.totalBaru)})</h3>
          {log.daftarBaru.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">{scanning ? 'Daftar terisi seiring pemindaian.' : 'Tidak ada file baru.'}</p>
          ) : (
            <ul className="mt-2 max-h-80 overflow-y-auto space-y-2">
              {log.daftarBaru.map((item, index) => (
                <li key={`baru-${index}`} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <p className="text-sm font-semibold text-gray-900 break-all">{item.nama || '—'}</p>
                  <p className="text-xs text-gray-500 break-all">{item.path || '—'}</p>
                </li>
              ))}
            </ul>
          )}
          <DetailNote shown={log.daftarBaru.length} total={log.totalBaru} />
        </section>

        <section>
          <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">File berubah ({formatCount(log.totalDiubah)})</h3>
          {log.daftarDiubah.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">{scanning ? 'Daftar terisi seiring pemindaian.' : 'Tidak ada file yang berubah.'}</p>
          ) : (
            <ul className="mt-2 max-h-80 overflow-y-auto space-y-2">
              {log.daftarDiubah.map((item, index) => (
                <li key={`ubah-${index}`} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <p className="text-sm font-semibold text-gray-900 break-all">{item.namaLama || '—'}</p>
                  <p className="text-xs text-gray-500 break-all">{item.pathLama || '—'}</p>
                  <p className="my-1 text-xs font-bold text-emerald-700">→</p>
                  <p className="text-sm font-semibold text-gray-900 break-all">{item.namaBaru || '—'}</p>
                  <p className="text-xs text-gray-500 break-all">{item.pathBaru || '—'}</p>
                </li>
              ))}
            </ul>
          )}
          <DetailNote shown={log.daftarDiubah.length} total={log.totalDiubah} />
        </section>
      </div>
    </div>
  );
}

export default function OneDriveSync({
  running,
  report,
  syncError,
  resume,
  changelog,
  needsLogin,
  startSync,
  dismissChangelog,
}) {
  const [connected, setConnected] = useState(null);
  const [busy, setBusy] = useState(null);
  const [login, setLogin] = useState(null);
  const [error, setError] = useState('');
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
    if (busy || running) return;
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

  const locked = Boolean(running) || Boolean(busy);
  const syncing = Boolean(running);
  const shownConnected = needsLogin ? false : connected;
  const kembar = Array.isArray(report?.stats?.kembar) ? report.stats.kembar : [];
  const alertText = [syncError, error].filter(Boolean).join(' ');

  return (
    <div className="mb-6 print:hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Sinkron OneDrive ke FILE_ASSET</p>
          <p className="text-sm text-gray-600 mt-1">
            Memindai subfolder. Baris lama tidak dihapus; yang berubah hanya nama, path, dan link folder.
          </p>
          <p className={`text-xs mt-2 font-semibold ${shownConnected ? 'text-emerald-700' : 'text-amber-700'}`}>
            {shownConnected === null && 'Memeriksa koneksi OneDrive...'}
            {shownConnected === true && 'OneDrive terhubung'}
            {shownConnected === false && 'OneDrive belum terhubung. Masuk sekali dengan kode perangkat.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {TARGETS.map((target) => {
            const runningThis = running === target.id;
            const continuing = resume?.target === target.id;
            return (
              <button
                key={target.id}
                type="button"
                onClick={() => startSync(target.id)}
                disabled={locked || shownConnected === false}
                title={target.path}
                className="px-4 py-2.5 rounded-xl font-bold text-xs md:text-sm flex items-center gap-2 border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {runningThis ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}
                {runningThis ? 'Memindai...' : (continuing ? `Lanjutkan ${target.label}` : target.button)}
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
            {busy === 'login' ? 'Menunggu masuk...' : shownConnected ? 'Hubungkan ulang' : 'Hubungkan OneDrive'}
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

      {syncing && (
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

      {changelog && (
        <SyncChangelog
          log={changelog}
          scanning={syncing && running === changelog.targetId}
          onClose={dismissChangelog}
          closeDisabled={syncing}
        />
      )}

      {alertText && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" role="alert">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{alertText}</span>
        </p>
      )}
    </div>
  );
}
