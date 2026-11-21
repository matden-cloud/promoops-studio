import { useEffect, useRef, useState } from 'react';
import {
  BarChart2,
  Bot,
  CalendarClock,
  LayoutDashboard,
  Mic,
  MoreHorizontal,
  Package,
  Play,
  Printer,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';

const TABS = [
  { id: 'pipeline', label: 'Rekap', icon: LayoutDashboard },
  { id: 'analitik', label: 'FYP', icon: BarChart2 },
  { id: 'jadwal', label: 'Jadwal', icon: CalendarClock },
  { id: 'produk', label: 'Produk', icon: Package },
];

function TabButton({ active, label, icon: Icon, onClick, ariaExpanded }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-expanded={ariaExpanded}
      className={`flex h-[58px] flex-1 flex-col items-center justify-center gap-0.5 border-0 bg-transparent text-[9.5px] tracking-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${active ? 'font-extrabold text-emerald-800' : 'font-semibold text-slate-500'}`}
    >
      <span className={`flex h-7 w-7 items-center justify-center rounded-[10px] ${active ? 'bg-emerald-600 text-white shadow-[0_4px_10px_rgba(5,150,105,0.35)]' : ''}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      {label}
    </button>
  );
}

export default function MobileShell({
  menu,
  title,
  subtitle,
  refreshing,
  onRefresh,
  headerAction,
  violationCount,
  syncing,
  sheetOpen,
  onOpenSheet,
  onCloseSheet,
  onSelect,
  onSyncSheets,
  onPrint,
  onAskAi,
}) {
  const sheetRef = useRef(null);
  const [compact, setCompact] = useState(false);
  const lainActive = menu === 'pelanggaran' || menu === 'sinkron' || menu === 'voice';

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 36);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (window.matchMedia('(min-width: 1024px)').matches) return;
    window.scrollTo(0, 0);
  }, [menu]);

  useEffect(() => {
    if (!sheetOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event) => {
      if (event.key === 'Escape') onCloseSheet();
    };
    window.addEventListener('keydown', onKey);
    sheetRef.current?.querySelector('button')?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [sheetOpen, onCloseSheet]);

  return (
    <div className="lg:hidden print:hidden">
      <div className="px-4 pb-3 pt-1">
        <div className="flex min-h-7 items-center justify-between gap-2">
          <div className="min-w-0">{headerAction}</div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Sinkron Sheets"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] border border-black/[0.06] bg-white text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-emerald-600' : ''}`} aria-hidden="true" />
          </button>
        </div>
        <h2 className="mt-0.5 text-[32px] font-extrabold leading-none tracking-tight text-slate-900">{title}</h2>
        {subtitle && <p className="mt-1 text-[13px] font-medium text-slate-500">{subtitle}</p>}
      </div>

      {compact && (
        <div className="fixed inset-x-0 top-0 z-30 flex h-12 items-center justify-between border-b border-black/[0.06] bg-[#f3f5f4]/80 px-4 backdrop-blur-xl">
          <h2 className="text-[17px] font-extrabold tracking-tight text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Sinkron Sheets"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[9px] border border-black/[0.06] bg-white text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-emerald-600' : ''}`} aria-hidden="true" />
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onAskAi}
        aria-label="Tanya AI"
        className="fixed right-[18px] z-[31] flex h-14 w-14 items-center justify-center rounded-[20px] border-0 bg-emerald-600 text-white shadow-[0_12px_28px_rgba(5,150,105,0.38),0_0_0_4px_rgba(5,150,105,0.12)] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
        style={{ bottom: 'calc(108px + env(safe-area-inset-bottom))' }}
      >
        <Sparkles className="h-[22px] w-[22px]" aria-hidden="true" />
      </button>

      <nav
        aria-label="Navigasi utama"
        className="fixed left-4 right-4 z-30 flex h-[68px] items-center justify-around rounded-[28px] border border-white/70 bg-white/80 px-1.5 shadow-[0_12px_40px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-xl"
        style={{ bottom: 'calc(20px + env(safe-area-inset-bottom))' }}
      >
        {TABS.map((tab) => (
          <TabButton
            key={tab.id}
            active={menu === tab.id}
            label={tab.label}
            icon={tab.icon}
            onClick={() => onSelect(tab.id)}
          />
        ))}
        <TabButton
          active={lainActive || sheetOpen}
          label="Lainnya"
          icon={MoreHorizontal}
          ariaExpanded={sheetOpen}
          onClick={onOpenSheet}
        />
      </nav>

      {sheetOpen && (
        <div className="fixed inset-0 z-40">
          <button type="button" className="absolute inset-0 bg-slate-900/30" aria-label="Tutup menu Lainnya" onClick={onCloseSheet} />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Lainnya"
            className="absolute inset-x-0 bottom-0 rounded-t-[28px] bg-white px-4 pt-2 shadow-[0_-16px_48px_rgba(15,23,42,0.2)]"
            style={{ paddingBottom: 'calc(1.35rem + env(safe-area-inset-bottom))' }}
          >
            <div className="mx-auto mb-3 mt-1.5 h-1 w-10 rounded-full bg-[#d5dbd7]" />
            <h3 className="mb-1.5 text-[17px] font-extrabold tracking-tight text-slate-900">Lainnya</h3>
            <SheetRow
              icon={Mic}
              tone="bg-emerald-50 text-emerald-800"
              title="Editor Voice"
              detail="Clone suara dan buat naskah jadi audio"
              badge="Baru"
              highlight
              onClick={() => onSelect('voice')}
            />
            <SheetRow
              icon={ShieldAlert}
              tone="bg-red-50 text-red-700"
              title="Pelanggaran"
              detail="Teguran, bukti SS, dan status banding"
              count={violationCount}
              onClick={() => onSelect('pelanggaran')}
            />
            <SheetRow
              icon={Bot}
              tone="bg-emerald-50 text-emerald-800"
              title="Sinkron Bot"
              detail="OneDrive ke FILE_ASSET"
              busy={syncing}
              onClick={() => onSelect('sinkron')}
            />
            <SheetRow
              icon={RefreshCw}
              tone="bg-emerald-50 text-emerald-800"
              title="Sinkron Sheets"
              detail="Perbarui data dari Google Sheets"
              busy={refreshing}
              onClick={onSyncSheets}
            />
            <SheetRow
              icon={Printer}
              tone="bg-slate-900 text-white"
              title="Cetak PDF"
              detail="Simpan atau cetak laporan di layar"
              onClick={onPrint}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SheetRow({ icon: Icon, tone, title, detail, count, badge, highlight, busy, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${highlight ? 'my-0.5 rounded-2xl border-[1.5px] border-emerald-400 bg-emerald-50 px-2.5' : 'border-t border-black/[0.06] px-0.5'}`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] ${tone}`}>
        <Icon className={`h-[18px] w-[18px] ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-extrabold tracking-tight text-slate-900">{title}</span>
        <span className="mt-0.5 block text-[11.5px] font-medium text-slate-500">{detail}</span>
      </span>
      {badge && (
        <span className="ml-auto rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800">{badge}</span>
      )}
      {Number.isFinite(count) && (
        <span className="ml-auto rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-extrabold text-red-700">{count}</span>
      )}
    </button>
  );
}

export function MobileBotButton({ busy, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-1.5 text-[11px] font-extrabold text-white shadow-[0_6px_14px_rgba(5,150,105,0.28)] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 disabled:opacity-50"
    >
      <Play className="h-3 w-3" fill="currentColor" aria-hidden="true" />
      {busy ? 'Menjalankan…' : 'Jalankan Bot'}
    </button>
  );
}
