import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Send, Sparkles, X } from 'lucide-react';
import {
  CAPTION_LIMIT,
  SCHEDULE_STATUS_FILTERS,
  SEND_GAP_MS,
  appendPlanRows,
  buildQuickRows,
  buildVideoCandidates,
  candidatesForPlanner,
  clearDraftPlan,
  createPlanRow,
  filterCandidates,
  formatPlanDate,
  formatScheduleWib,
  jakartaTomorrow,
  mergePlanRows,
  planRowIssues,
  productChoices,
  removePlanRow,
  scheduleStatusView,
  toScheduleAt,
} from '../server/jadwal-repliz.js';

const PLAN_ENDPOINT = '/api/repliz-plan';
const SCHEDULE_ENDPOINT = '/api/repliz-schedule';

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function StatusChip({ status }) {
  const view = scheduleStatusView(status);
  const tone = {
    menunggu: 'bg-amber-50 text-amber-800 border-amber-200',
    diproses: 'bg-blue-50 text-blue-700 border-blue-100',
    berhasil: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    gagal: 'bg-red-50 text-red-700 border-red-200',
    unknown: 'bg-gray-50 text-gray-600 border-gray-200',
  }[view.tone];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-extrabold ${tone}`}>{view.label}</span>;
}

function HoldBadge() {
  return <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-800">Ditahan (Hold)</span>;
}

function Field({ label, children, className = '' }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{label}</span>
      {children}
    </label>
  );
}

const controlClass = 'w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800 focus:border-emerald-400 focus:outline-none';

function CheckOption({ checked, onChange, children, disabled }) {
  return (
    <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700">
      <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={checked} onChange={onChange} disabled={disabled} />
      {children}
    </label>
  );
}

function accountLabel(account) {
  if (!account) return 'Akun Repliz';
  const name = account.name || 'Akun TikTok';
  return account.username ? `${name} (@${account.username})` : name;
}

export default function JadwalReplizPanel({ klipVideos = [], publishVideos = [], dataViews = [] }) {
  const [accounts, setAccounts] = useState([]);
  const [missing, setMissing] = useState([]);
  const [configMessage, setConfigMessage] = useState('');
  const [accountError, setAccountError] = useState('');
  const [fileAssets, setFileAssets] = useState(null);
  const [assetNote, setAssetNote] = useState('');
  const [schedules, setSchedules] = useState([]);
  const [scheduleStatus, setScheduleStatus] = useState('');
  const [schedulePage, setSchedulePage] = useState(1);
  const [scheduleMeta, setScheduleMeta] = useState({ totalPages: 1, totalDocs: 0 });
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [planRows, setPlanRows] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatMessages, setChatMessages] = useState(() => [{
    id: 'welcome',
    role: 'assistant',
    text: 'Tulis perintah jadwal, misalnya “Jadwalkan 5 video yang belum diupload, 1 per hari jam 19.00 WIB”. Saya hanya mengisi tabel konfirmasi. Tidak ada yang terkirim sebelum tombol Konfirmasi ditekan.',
  }]);
  const [manual, setManual] = useState({
    fileId: '',
    accountId: '',
    date: jakartaTomorrow(),
    time: '19:00',
    caption: '',
    isDraft: false,
    isCommentDisabled: false,
    isAiGenerated: false,
  });
  const [manualNote, setManualNote] = useState('');
  const [quick, setQuick] = useState({
    product: '',
    count: 5,
    startDate: jakartaTomorrow(),
    time: '19:00',
    accountId: '',
  });
  const [quickNote, setQuickNote] = useState('');
  const [videoQuery, setVideoQuery] = useState('');
  const [videoProduct, setVideoProduct] = useState('Semua');
  const [showUploaded, setShowUploaded] = useState(false);
  const [showHeld, setShowHeld] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(null);
  const sendingRef = useRef(false);
  const chatRef = useRef(null);

  const candidates = useMemo(() => buildVideoCandidates({
    fileAssets,
    klipVideos,
    publishVideos,
    dataViews,
  }), [fileAssets, klipVideos, publishVideos, dataViews]);

  const products = useMemo(() => productChoices(candidates), [candidates]);
  const videoOptions = useMemo(() => filterCandidates(candidates, {
    uploaded: showUploaded ? 'semua' : 'belum',
    includeHeld: showHeld,
    product: videoProduct,
    query: videoQuery,
  }), [candidates, showUploaded, showHeld, videoProduct, videoQuery]);

  const applySchedules = useCallback((result, response) => {
    if (!result) {
      setScheduleError('Daftar jadwal tidak terbaca.');
      return;
    }
    setMissing((current) => [...new Set([...current, ...(result.missing || [])])]);
    if (result.message && result.configured === false) setConfigMessage(result.message);
    setSchedules(Array.isArray(result.schedules) ? result.schedules : []);
    setScheduleMeta({
      totalPages: result.totalPages || 1,
      totalDocs: result.totalDocs || 0,
    });
    setScheduleError(response?.ok ? '' : (result.message || 'Gagal memuat jadwal Repliz.'));
  }, []);

  const loadSchedules = useCallback(async (status, page, signal) => {
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (status) params.set('status', status);
    setScheduleBusy(true);
    try {
      const response = await fetch(`${SCHEDULE_ENDPOINT}?${params}`, { signal });
      const result = await readJson(response);
      if (signal?.aborted) return;
      applySchedules(result, response);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setScheduleError('Gagal menghubungi server jadwal.');
    } finally {
      if (!signal?.aborted) setScheduleBusy(false);
    }
  }, [applySchedules]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    async function load() {
      try {
        const params = new URLSearchParams({ page: '1', limit: '20' });
        const [accountResponse, assetResponse, scheduleResponse] = await Promise.all([
          fetch('/api/repliz-accounts', { signal }),
          fetch('/api/repliz-assets', { signal }),
          fetch(`${SCHEDULE_ENDPOINT}?${params}`, { signal }),
        ]);
        const accountBody = await readJson(accountResponse);
        const assetBody = await readJson(assetResponse);
        const scheduleBody = await readJson(scheduleResponse);
        if (signal.aborted) return;
        if (accountBody) {
          setAccounts(Array.isArray(accountBody.accounts) ? accountBody.accounts : []);
          setMissing(accountBody.missing || []);
          setConfigMessage(accountBody.message || '');
          setAccountError(accountResponse.ok ? '' : (accountBody.message || 'Gagal memuat akun Repliz.'));
        } else {
          setAccountError('Gagal memuat akun Repliz.');
        }
        if (assetBody?.configured && Array.isArray(assetBody.rows)) {
          setFileAssets(assetBody.rows.map((row) => ({
            idFile: row.id,
            namaFile: row.name,
            pathFolder: row.path,
          })));
          setAssetNote('');
        } else {
          setFileAssets(null);
          setAssetNote(assetBody?.message || '');
        }
        applySchedules(scheduleBody, scheduleResponse);
      } catch (err) {
        if (err?.name === 'AbortError') return;
        setAccountError('Gagal menghubungi server jadwal.');
        setFileAssets(null);
      }
    }
    load();
    return () => controller.abort();
  }, [applySchedules]);

  const defaultAccountId = accounts.find((item) => item.connected)?.id || accounts[0]?.id || '';
  const manualAccountId = manual.accountId || defaultAccountId;
  const quickAccountId = quick.accountId || defaultAccountId;

  useEffect(() => {
    if (!chatRef.current) return;
    chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatMessages, chatBusy]);

  const candidateById = useMemo(() => {
    const map = new Map();
    for (const item of candidates) map.set(item.fileId, item);
    return map;
  }, [candidates]);

  function patchRow(localId, patch) {
    setPlanRows((current) => current.map((row) => (
      row.localId === localId ? { ...row, ...patch, error: patch.error ?? '' } : row
    )));
  }

  async function sendChat(event) {
    event?.preventDefault();
    const text = chatInput.trim();
    if (!text || chatBusy || sendingRef.current) return;
    const history = chatMessages.slice(-8).map((item) => ({ role: item.role, text: item.text }));
    setChatInput('');
    setChatMessages((current) => [...current, { id: newId(), role: 'user', text }]);
    setChatBusy(true);
    try {
      const response = await fetch(PLAN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history,
          candidates: candidatesForPlanner(candidates),
          accounts: accounts.map((item) => ({ id: item.id, name: item.name, username: item.username })),
          currentPlan: planRows.filter((row) => row.sendState !== 'sent').map((row) => ({
            fileId: row.fileId,
            date: row.date,
            time: row.time,
            accountId: row.accountId,
          })),
        }),
      });
      const result = await readJson(response);
      if (result?.error === 'quota_exhausted' || response.status === 429) {
        setChatMessages((current) => [...current, {
          id: newId(),
          role: 'assistant',
          quota: true,
          text: result?.message || 'Kuota harian Gemini gratis sudah habis. Kuota biasanya pulih sekitar pukul 15.00 WIB. Form manual dan Isi cepat tetap bisa dipakai tanpa AI.',
        }]);
        return;
      }
      if (!response.ok || !result) {
        setChatMessages((current) => [...current, {
          id: newId(),
          role: 'assistant',
          text: result?.message || 'Asisten gagal menyusun rencana. Form manual dan Isi cepat tetap bisa dipakai.',
        }]);
        return;
      }
      const incoming = (Array.isArray(result.plan) ? result.plan : []).map((item, index) => createPlanRow({
        ...item,
        localId: `ai-${item.fileId}-${item.date}-${index}`,
      }));
      if (incoming.length) setPlanRows((current) => mergePlanRows(current, incoming));
      setChatMessages((current) => [...current, {
        id: newId(),
        role: 'assistant',
        text: result.reply || 'Rencana ada di tabel konfirmasi. Belum ada yang dikirim.',
        plan: incoming,
      }]);
    } catch {
      setChatMessages((current) => [...current, {
        id: newId(),
        role: 'assistant',
        text: 'Gagal menghubungi asisten. Form manual dan Isi cepat tetap bisa dipakai.',
      }]);
    } finally {
      setChatBusy(false);
    }
  }

  function addManual(event) {
    event.preventDefault();
    const video = candidates.find((item) => item.fileId === manual.fileId);
    if (!video) {
      setManualNote('Pilih video final.');
      return;
    }
    if (video.held && !window.confirm('Video ini ditahan (Hold). Tetap masukkan ke rencana untuk diperiksa?')) return;
    const row = createPlanRow({
      localId: `manual-${video.fileId}-${Date.now()}`,
      fileId: video.fileId,
      fileName: video.fileName,
      product: video.product,
      held: video.held,
      accountId: manualAccountId,
      date: manual.date,
      time: manual.time,
      caption: manual.caption,
      isDraft: manual.isDraft,
      isCommentDisabled: manual.isCommentDisabled,
      isAiGenerated: manual.isAiGenerated,
    });
    const issues = planRowIssues(row);
    if (issues.length) {
      setManualNote(issues[0]);
      return;
    }
    const next = appendPlanRows(planRows, [row]);
    if (!next.rows.length || next.skipped) {
      setManualNote('Video ini sudah ada di rencana.');
      return;
    }
    setPlanRows(next.rows);
    setManualNote('Ditambahkan ke tabel konfirmasi. Belum dikirim.');
  }

  function fillQuick(event) {
    event.preventDefault();
    const result = buildQuickRows({
      candidates,
      product: quick.product,
      count: Number(quick.count),
      startDate: quick.startDate,
      time: quick.time,
      accountId: quickAccountId,
      existing: planRows,
    });
    if (!result.rows.length) {
      setQuickNote(result.message || 'Tidak ada video yang bisa diisi.');
      return;
    }
    const next = appendPlanRows(planRows, result.rows);
    setPlanRows(next.rows);
    setQuickNote(result.message || `${result.rows.length} video masuk ke rencana. Belum dikirim.`);
  }

  async function confirmSend() {
    if (sendingRef.current) return;
    const queue = planRows.filter((row) => row.sendState !== 'sent' && row.sendState !== 'sending');
    if (!queue.length) return;
    if (queue.some((row) => row.held) && !window.confirm('Ada video produk yang ditahan (Hold) di rencana ini. Lanjutkan kirim ke Repliz?')) return;
    sendingRef.current = true;
    setSending(true);
    try {
      for (let index = 0; index < queue.length; index += 1) {
        const row = queue[index];
        setSendProgress({ current: index + 1, total: queue.length });
        const issues = planRowIssues(row);
        if (issues.length) {
          setPlanRows((current) => current.map((item) => (
            item.localId === row.localId ? { ...item, sendState: 'failed', error: issues[0] } : item
          )));
          continue;
        }
        setPlanRows((current) => current.map((item) => (
          item.localId === row.localId ? { ...item, sendState: 'sending', error: '' } : item
        )));
        let outcome = { ok: false, message: 'Gagal mengirim jadwal.' };
        try {
          const response = await fetch(SCHEDULE_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accountId: row.accountId,
              fileId: row.fileId,
              scheduleAt: toScheduleAt(row.date, row.time),
              caption: row.caption,
              additionalInfo: {
                isDraft: Boolean(row.isDraft),
                isCommentDisabled: Boolean(row.isCommentDisabled),
                isAiGenerated: Boolean(row.isAiGenerated),
              },
            }),
          });
          const result = await readJson(response);
          outcome = response.ok
            ? { ok: true, message: '' }
            : { ok: false, message: result?.message || 'Gagal mengirim jadwal.' };
        } catch {
          outcome = { ok: false, message: 'Gagal menghubungi server.' };
        }
        setPlanRows((current) => current.map((item) => (
          item.localId === row.localId
            ? { ...item, sendState: outcome.ok ? 'sent' : 'failed', error: outcome.message }
            : item
        )));
        if (index < queue.length - 1) await wait(SEND_GAP_MS);
      }
      await loadSchedules(scheduleStatus, schedulePage);
    } finally {
      sendingRef.current = false;
      setSending(false);
      setSendProgress(null);
    }
  }

  async function actOnSchedule(item, action) {
    const question = action === 'cancel'
      ? 'Batalkan jadwal yang masih menunggu ini?'
      : 'Coba kirim ulang jadwal yang gagal?';
    if (!window.confirm(question)) return;
    setScheduleBusy(true);
    try {
      const response = await fetch(`${SCHEDULE_ENDPOINT}?scheduleId=${encodeURIComponent(item.id)}`, {
        method: action === 'cancel' ? 'DELETE' : 'PUT',
      });
      const result = await readJson(response);
      if (!response.ok) {
        setScheduleError(result?.message || 'Aksi jadwal gagal.');
        return;
      }
      setScheduleError('');
      await loadSchedules(scheduleStatus, schedulePage);
    } catch {
      setScheduleError('Gagal menghubungi server jadwal.');
    } finally {
      setScheduleBusy(false);
    }
  }

  const pendingRows = planRows.filter((row) => row.sendState !== 'sent');
  const planState = planRows.some((row) => row.sendState === 'failed')
    ? 'Sebagian gagal — periksa barisnya'
    : (pendingRows.length ? 'Belum dikirim — menunggu konfirmasi' : 'Terkirim');

  return (
    <div id="jadwal-repliz" className="mx-auto max-w-[1400px] p-4 md:p-8">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-gray-900">Jadwal Repliz</h2>
        <p className="mt-1 text-sm text-gray-500">
          Jadwalkan video final lewat asisten atau form. <strong className="font-semibold text-gray-700">Tidak ada yang dikirim</strong> sebelum tombol <strong className="font-semibold text-gray-700">Konfirmasi & kirim ke Repliz</strong> ditekan.
        </p>
      </div>

      {missing.length > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="repliz-config-banner">
          <p className="font-bold">Konfigurasi Repliz belum lengkap</p>
          <p className="mt-1">{configMessage || 'Isi variabel berikut di Vercel, lalu deploy ulang. Penyusunan draf tetap bisa dilakukan.'}</p>
          <p className="mt-2 font-semibold">{missing.join(', ')}</p>
        </div>
      )}
      {accountError && !missing.length && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{accountError}</p>
      )}

      <section className="mb-5 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Asisten Jadwal · Gemini</h3>
            <p className="text-[11px] font-semibold text-gray-500">Bisa merencanakan upload harian dari Video Final</p>
          </div>
        </div>
        <div ref={chatRef} className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto bg-neutral-50 px-4 py-4">
          {chatMessages.map((message) => (
            <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed sm:max-w-[78%] ${message.role === 'user' ? 'rounded-br-sm bg-emerald-600 font-semibold text-white' : 'rounded-bl-sm border border-gray-200 bg-white text-gray-800'} ${message.quota ? 'border-amber-200 bg-amber-50 text-amber-900' : ''}`}>
                <div className={`mb-1 text-[10px] font-extrabold uppercase tracking-wide ${message.role === 'user' ? 'text-white/80' : 'text-purple-600'}`}>
                  {message.role === 'user' ? 'Anda' : 'Asisten'}
                </div>
                <p className="whitespace-pre-wrap">{message.text}</p>
                {message.plan?.length > 0 && (
                  <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-gray-700">
                    <h4 className="mb-1 text-xs font-extrabold text-emerald-700">Rencana yang saya usulkan</h4>
                    <ul className="list-disc space-y-0.5 pl-4 text-xs">
                      {message.plan.map((item) => (
                        <li key={item.localId}>{item.fileName} · {formatPlanDate(item.date)} · {item.time} WIB{item.held ? ' · Ditahan' : ''}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}
          {chatBusy && <p className="text-xs font-semibold text-purple-600">Asisten sedang menyusun rencana…</p>}
        </div>
        <form onSubmit={sendChat} className="flex items-center gap-2 border-t border-gray-100 px-3 py-2.5">
          <input
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            placeholder='Tulis perintah, misalnya “tambahkan 2 hari lagi”…'
            className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800 focus:border-emerald-400 focus:outline-none"
            aria-label="Perintah jadwal"
          />
          <button type="submit" disabled={chatBusy || !chatInput.trim()} className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-white disabled:opacity-50" aria-label="Kirim perintah">
            <Send className="h-4 w-4" />
          </button>
        </form>
        <p className="px-4 pb-3 text-[11px] font-semibold text-gray-400">Asisten hanya mengisi tabel. Chat tidak mengirim jadwal ke Repliz.</p>
      </section>

      <section className="mb-5 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-[15px] font-bold text-gray-900">Rencana jadwal — periksa sebelum dikirim</h3>
            <p className="mt-1 text-xs text-gray-500">
              {planRows.length ? `${planRows.length} video. Caption, akun, dan jam bisa diubah. Baris bisa dihapus.` : 'Belum ada rencana. Gunakan asisten, jadwal manual, atau Isi cepat.'}
            </p>
          </div>
          {planRows.length > 0 && (
            <span className="w-fit rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-800">{planState}</span>
          )}
        </div>
        {planRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-y border-gray-200 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2.5 font-bold">File video</th>
                  <th className="px-2 py-2.5 font-bold">Produk</th>
                  <th className="px-2 py-2.5 font-bold">Akun Repliz</th>
                  <th className="px-2 py-2.5 font-bold">Tanggal</th>
                  <th className="px-2 py-2.5 font-bold">Caption</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {planRows.map((row) => (
                  <tr key={row.localId} className="border-b border-gray-100 align-top">
                    <td className="px-4 py-3">
                      <div className="text-xs font-semibold text-gray-800">{row.fileName}</div>
                      <div className="mt-1 text-[10px] font-semibold text-gray-400">Video Final · {formatPlanDate(row.date)}</div>
                      {row.held && <div className="mt-1"><HoldBadge /></div>}
                      {row.sendState === 'sent' && <p className="mt-1 text-[11px] font-bold text-emerald-700">Terkirim</p>}
                      {row.sendState === 'sending' && <p className="mt-1 text-[11px] font-bold text-emerald-700">Mengirim…</p>}
                      {row.sendState === 'failed' && <p className="mt-1 max-w-[220px] text-[11px] font-semibold text-red-700">{row.error}</p>}
                    </td>
                    <td className="px-2 py-3 text-xs font-semibold text-gray-700">{row.product || '—'}</td>
                    <td className="px-2 py-3">
                      <select value={row.accountId} disabled={sending || row.sendState === 'sent'} onChange={(event) => patchRow(row.localId, { accountId: event.target.value })} className="max-w-[180px] rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-semibold">
                        <option value="">Pilih akun</option>
                        {accounts.map((account) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-3">
                      <input type="date" value={row.date} disabled={sending || row.sendState === 'sent'} onChange={(event) => patchRow(row.localId, { date: event.target.value })} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-bold" />
                      <input type="time" value={row.time} disabled={sending || row.sendState === 'sent'} onChange={(event) => patchRow(row.localId, { time: event.target.value })} className="mt-1 block rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-bold text-emerald-700" />
                    </td>
                    <td className="px-2 py-3">
                      <textarea value={row.caption} disabled={sending || row.sendState === 'sent'} onChange={(event) => patchRow(row.localId, { caption: event.target.value })} rows={2} className="min-w-[260px] w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700" />
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          <CheckOption checked={row.isDraft} disabled={sending || row.sendState === 'sent'} onChange={(event) => patchRow(row.localId, { isDraft: event.target.checked })}>Simpan sebagai draft</CheckOption>
                          <CheckOption checked={row.isCommentDisabled} disabled={sending || row.sendState === 'sent'} onChange={(event) => patchRow(row.localId, { isCommentDisabled: event.target.checked })}>Matikan komentar</CheckOption>
                          <CheckOption checked={row.isAiGenerated} disabled={sending || row.sendState === 'sent'} onChange={(event) => patchRow(row.localId, { isAiGenerated: event.target.checked })}>Label AI</CheckOption>
                        </div>
                        <span className={`text-[10px] font-bold ${row.caption.length > CAPTION_LIMIT ? 'text-red-600' : 'text-gray-400'}`}>{row.caption.length}/{CAPTION_LIMIT}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <button type="button" aria-label="Hapus baris" disabled={sending || row.sendState === 'sending'} onClick={() => setPlanRows((current) => removePlanRow(current, row.localId))} className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-base font-bold text-gray-500 hover:bg-gray-50 disabled:opacity-40">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-col gap-3 border-t border-gray-100 bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold text-gray-500">Tidak ada yang dikirim tanpa tombol Konfirmasi.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={sending || planRows.length === 0} onClick={() => setPlanRows((current) => clearDraftPlan(current))} className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 disabled:opacity-50">Batal</button>
            <button type="button" disabled={sending || pendingRows.length === 0} onClick={confirmSend} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {sending && sendProgress ? `Mengirim ${sendProgress.current} dari ${sendProgress.total}…` : 'Konfirmasi & kirim ke Repliz'}
            </button>
          </div>
        </div>
      </section>

      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-5">
        <form onSubmit={addManual} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm xl:col-span-3">
          <h3 className="text-[15px] font-bold">Jadwal manual</h3>
          <p className="mb-3 text-xs text-gray-500">Pilih satu video final, lalu isi akun, waktu, dan caption.</p>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <input value={videoQuery} onChange={(event) => setVideoQuery(event.target.value)} placeholder="Cari nama file" className={`${controlClass} sm:max-w-[220px]`} aria-label="Cari video" />
            <select value={videoProduct} onChange={(event) => setVideoProduct(event.target.value)} className={controlClass} aria-label="Filter produk">
              <option value="Semua">Semua produk</option>
              {products.map((item) => <option key={item.name} value={item.name}>{item.name}{item.held ? ' (Ditahan)' : ''}</option>)}
            </select>
          </div>
          <div className="mb-3 flex flex-wrap gap-3">
            <CheckOption checked={!showUploaded} onChange={(event) => setShowUploaded(!event.target.checked)}>Belum diupload</CheckOption>
            <CheckOption checked={showHeld} onChange={(event) => setShowHeld(event.target.checked)}>Tampilkan yang ditahan</CheckOption>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Video (Video Final)" className="sm:col-span-2">
              <select value={manual.fileId} onChange={(event) => setManual((current) => ({ ...current, fileId: event.target.value }))} className={controlClass}>
                <option value="">{videoOptions.length ? 'Pilih video' : 'Tidak ada video pada filter ini'}</option>
                {videoOptions.map((item) => (
                  <option key={item.fileId} value={item.fileId}>
                    {item.fileName}{item.product ? ` · ${item.product}` : ''}{item.held ? ' · Ditahan' : ''}{item.uploaded ? ' · sudah diupload' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Akun Repliz">
              <select value={manualAccountId} onChange={(event) => setManual((current) => ({ ...current, accountId: event.target.value }))} className={controlClass}>
                <option value="">Pilih akun</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}
              </select>
            </Field>
            <Field label="Produk">
              <input readOnly value={candidates.find((item) => item.fileId === manual.fileId)?.product || ''} className={controlClass} />
            </Field>
            <Field label="Tanggal">
              <input type="date" value={manual.date} onChange={(event) => setManual((current) => ({ ...current, date: event.target.value }))} className={controlClass} />
            </Field>
            <Field label="Jam (WIB)">
              <input type="time" value={manual.time} onChange={(event) => setManual((current) => ({ ...current, time: event.target.value }))} className={controlClass} />
            </Field>
            <Field label="Caption" className="sm:col-span-2">
              <textarea value={manual.caption} onChange={(event) => setManual((current) => ({ ...current, caption: event.target.value }))} rows={2} className={controlClass} />
              <span className={`text-[10px] font-bold ${manual.caption.length > CAPTION_LIMIT ? 'text-red-600' : 'text-gray-400'}`}>{manual.caption.length}/{CAPTION_LIMIT}</span>
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <CheckOption checked={manual.isDraft} onChange={(event) => setManual((current) => ({ ...current, isDraft: event.target.checked }))}>Simpan sebagai draft</CheckOption>
            <CheckOption checked={manual.isCommentDisabled} onChange={(event) => setManual((current) => ({ ...current, isCommentDisabled: event.target.checked }))}>Matikan komentar</CheckOption>
            <CheckOption checked={manual.isAiGenerated} onChange={(event) => setManual((current) => ({ ...current, isAiGenerated: event.target.checked }))}>Label AI</CheckOption>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white">Tambahkan ke rencana</button>
            <button type="button" onClick={() => { setManual((current) => ({ ...current, fileId: '', caption: '', isDraft: false, isCommentDisabled: false, isAiGenerated: false })); setManualNote(''); }} className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-gray-700">Reset</button>
          </div>
          {manualNote && <p className="mt-2 text-xs font-semibold text-gray-600">{manualNote}</p>}
          {assetNote && <p className="mt-2 text-xs text-gray-500">{assetNote}</p>}
        </form>

        <form onSubmit={fillQuick} className="rounded-2xl border border-emerald-100 bg-gradient-to-b from-white to-emerald-50 p-4 shadow-sm xl:col-span-2">
          <h3 className="text-[15px] font-bold">Isi cepat</h3>
          <p className="mb-3 text-xs text-gray-500">Pilih produk, lalu isi otomatis: 1 video per hari pada jam tertentu, mulai tanggal yang dipilih. Video yang ditahan tidak ikut.</p>
          <div className="grid grid-cols-1 gap-3">
            <Field label="Produk">
              <select value={quick.product} onChange={(event) => setQuick((current) => ({ ...current, product: event.target.value }))} className={`${controlClass} bg-white`}>
                <option value="">Pilih produk</option>
                {products.map((item) => <option key={item.name} value={item.name} disabled={item.held || item.open === 0}>{item.name}{item.held ? ' (Ditahan)' : ` (${item.open})`}</option>)}
              </select>
            </Field>
            <Field label="Jumlah video">
              <input type="number" min="1" max="15" value={quick.count} onChange={(event) => setQuick((current) => ({ ...current, count: event.target.value }))} className={`${controlClass} bg-white`} />
            </Field>
            <Field label="1 video per hari jam">
              <input type="time" value={quick.time} onChange={(event) => setQuick((current) => ({ ...current, time: event.target.value }))} className={`${controlClass} bg-white`} />
            </Field>
            <Field label="Mulai">
              <input type="date" value={quick.startDate} onChange={(event) => setQuick((current) => ({ ...current, startDate: event.target.value }))} className={`${controlClass} bg-white`} />
            </Field>
            <Field label="Akun Repliz">
              <select value={quickAccountId} onChange={(event) => setQuick((current) => ({ ...current, accountId: event.target.value }))} className={`${controlClass} bg-white`}>
                <option value="">Pilih akun</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}
              </select>
            </Field>
          </div>
          <button type="submit" className="mt-3 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white">Isi ke rencana</button>
          {quickNote && <p className="mt-2 text-xs font-semibold text-gray-700">{quickNote}</p>}
        </form>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-[15px] font-bold">Daftar jadwal</h3>
            <p className="mt-1 text-xs text-gray-500">Status langsung dari Repliz. Waktu ditampilkan dalam WIB.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {SCHEDULE_STATUS_FILTERS.map((item) => (
              <button
                key={item.id || 'semua'}
                type="button"
                onClick={() => {
                  setScheduleStatus(item.id);
                  setSchedulePage(1);
                  loadSchedules(item.id, 1);
                }}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${scheduleStatus === item.id ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600'}`}
              >
                {item.label}
              </button>
            ))}
            <button type="button" onClick={() => loadSchedules(scheduleStatus, schedulePage)} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1 text-[11px] font-bold text-gray-700" aria-label="Muat ulang jadwal">
              <RefreshCw className={`h-3.5 w-3.5 ${scheduleBusy ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        {scheduleError && <p className="px-4 pb-2 text-xs font-semibold text-red-700">{scheduleError}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-y border-gray-200 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2.5 font-bold">File video</th>
                <th className="px-2 py-2.5 font-bold">Produk</th>
                <th className="px-2 py-2.5 font-bold">Akun Repliz</th>
                <th className="px-2 py-2.5 font-bold">Jadwal</th>
                <th className="px-4 py-2.5 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {schedules.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                    {scheduleBusy ? 'Memuat jadwal…' : 'Belum ada jadwal pada filter ini.'}
                  </td>
                </tr>
              )}
              {schedules.map((item) => {
                const video = candidateById.get(item.fileId);
                const view = scheduleStatusView(item.status);
                return (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="px-4 py-3 text-xs font-semibold text-gray-800">{video?.fileName || item.description || 'Video'}</td>
                    <td className="px-2 py-3 text-xs font-semibold text-gray-700">{video?.product || '—'}</td>
                    <td className="px-2 py-3 text-xs font-semibold text-gray-600">{item.accountName || item.accountUsername || '—'}</td>
                    <td className="px-2 py-3 text-xs font-semibold text-gray-800">{formatScheduleWib(item.scheduleAt)}</td>
                    <td className="px-4 py-3">
                      <StatusChip status={item.status} />
                      {view.key === 'error' && item.errorMessage && <p className="mt-1 max-w-[260px] text-[11px] font-semibold text-red-700">{item.errorMessage}</p>}
                      {view.key === 'pending' && (
                        <button type="button" disabled={scheduleBusy} onClick={() => actOnSchedule(item, 'cancel')} className="mt-1 block text-[11px] font-bold text-gray-600 underline">Batalkan jadwal</button>
                      )}
                      {view.key === 'error' && (
                        <button type="button" disabled={scheduleBusy} onClick={() => actOnSchedule(item, 'retry')} className="mt-1 block text-[11px] font-bold text-red-700 underline">Coba lagi</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {scheduleMeta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-600">
            <button type="button" disabled={schedulePage <= 1} onClick={() => { const page = schedulePage - 1; setSchedulePage(page); loadSchedules(scheduleStatus, page); }} className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40">Sebelumnya</button>
            <span>Hal {schedulePage} dari {scheduleMeta.totalPages}</span>
            <button type="button" disabled={schedulePage >= scheduleMeta.totalPages} onClick={() => { const page = schedulePage + 1; setSchedulePage(page); loadSchedules(scheduleStatus, page); }} className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:opacity-40">Berikutnya</button>
          </div>
        )}
      </section>
      <p className="mt-4 text-xs leading-relaxed text-gray-500">
        Video produk <strong className="font-semibold text-gray-700">Gantungan Bor</strong> sedang ditahan: tidak masuk ke rencana Gemini atau Isi cepat. Tandai Ditahan (Hold) tetap terlihat bila daftar lengkap dibuka.
      </p>
    </div>
  );
}
