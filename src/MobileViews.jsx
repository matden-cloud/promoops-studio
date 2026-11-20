import { useMemo, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Image as ImageIcon,
  Play,
  Plus,
  Star,
} from 'lucide-react';
import SearchBox from './SearchBox.jsx';
import { canPlayTikTokUrl } from '../server/tiktok-url.js';
import {
  VIEW_BUCKETS,
  buildRekapProduk,
  formatIdNumber,
} from './rekapProduk.js';
import { formatYearMonth } from './starHistory.js';

function ChipSelect({ label, value, onChange, active, children }) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={onChange}
        className={`w-full appearance-none rounded-xl border py-2 pl-2.5 pr-7 text-xs font-bold shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-black/[0.06] bg-white text-slate-900'}`}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
    </label>
  );
}

function Stat({ label, value, hint, tone = 'text-slate-900', labelTone = 'text-slate-400' }) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white px-2 py-2.5 shadow-[0_8px_28px_rgba(15,23,42,0.07)]">
      <p className={`text-[8.5px] font-extrabold uppercase tracking-wide ${labelTone}`}>{label}</p>
      <p className={`mt-0.5 text-[22px] font-extrabold leading-none tracking-tight tabular-nums ${tone}`}>{value}</p>
      {hint && <p className="mt-1 text-[9.5px] font-semibold leading-snug text-slate-500">{hint}</p>}
    </div>
  );
}

export function MobilePipeline({
  loading,
  query,
  onQuery,
  shown,
  total,
  months,
  bulan,
  onBulan,
  products,
  produk,
  onProduk,
  people,
  accounts,
  tim,
  onTim,
  onlyWinning,
  onToggleWinning,
  cards,
  onOpenFiles,
  totals,
  ranking,
  sortBy,
  onSort,
  compare,
}) {
  return (
    <div className="space-y-2.5 px-4 pb-2 lg:hidden">
      <SearchBox id="search-pipeline-mobile" value={query} onChange={onQuery} shown={shown} total={total} />
      <div className="grid grid-cols-2 gap-1.5">
        <ChipSelect label="Bulan" value={bulan} onChange={(event) => onBulan(event.target.value)} active={bulan !== 'Semua'}>
          {months.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </ChipSelect>
        <ChipSelect label="Filter produk" value={produk} onChange={(event) => onProduk(event.target.value)} active={produk !== 'Semua'}>
          {products.map((item) => <option key={item} value={item}>{item === 'Semua' ? 'Semua produk' : item}</option>)}
        </ChipSelect>
        <ChipSelect label="Tim atau akun" value={tim} onChange={(event) => onTim(event.target.value)} active={tim !== 'Semua'}>
          <option value="Semua">Semua akun</option>
          <optgroup label="Anggota tim">
            {people.map((person) => <option key={person} value={person}>{person}</option>)}
          </optgroup>
          <optgroup label="Akun toko">
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.label}{account.pemegang ? ` (${account.pemegang})` : ''}</option>
            ))}
          </optgroup>
        </ChipSelect>
        <button
          type="button"
          onClick={onToggleWinning}
          aria-pressed={onlyWinning}
          className={`inline-flex items-center justify-center gap-1 rounded-xl border px-2 text-xs font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${onlyWinning ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-black/[0.06] bg-white text-amber-800'}`}
        >
          <Star className={`h-3.5 w-3.5 ${onlyWinning ? 'fill-amber-400 text-amber-400' : 'text-amber-400'}`} aria-hidden="true" />
          Mentahan bagus
        </button>
      </div>
      {compare}
      {loading && cards.length === 0 ? (
        <p className="rounded-[20px] bg-white px-4 py-8 text-center text-sm font-semibold text-slate-400 shadow-[0_8px_28px_rgba(15,23,42,0.07)]">Menghitung kekuatan bulanan…</p>
      ) : cards.map((card) => (
        <MonthCard key={card.month} card={card} selected={bulan === card.month} onBulan={onBulan} onOpenFiles={onOpenFiles} />
      ))}
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Mentahan" value={loading ? '…' : totals.mentahan} hint={`${totals.belum} belum dipakai`} labelTone="text-blue-600" />
        <Stat label="Video Final" value={loading ? '…' : totals.final} hint="klip selesai" labelTone="text-amber-600" />
        <Stat label="Upload" value={loading ? '…' : totals.upload} hint="target 15/hari" labelTone="text-emerald-700" />
      </div>
      <section className="rounded-[20px] border border-black/[0.06] bg-white p-3.5 shadow-[0_8px_28px_rgba(15,23,42,0.07)]">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold tracking-tight">Peringkat per produk</h3>
          <div className="flex gap-1 text-[10px] font-extrabold">
            {[['mentahan', 'Ment'], ['videoFinal', 'Edit'], ['upload', 'Up']].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => onSort(key)}
                className={`rounded-full px-2 py-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${sortBy === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {ranking.length === 0 ? (
          <p className="py-6 text-center text-xs font-semibold text-slate-400">Tidak ada data produk sesuai filter.</p>
        ) : ranking.map((item) => (
          <div key={item.produk} className="flex items-center justify-between gap-2 border-t border-black/[0.06] py-2.5 first:border-t-0">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-extrabold">{item.produk}</p>
              <p className="text-[11px] font-semibold text-slate-500">{item.isWinning || item.starredFilesCount > 0 ? '⭐ Winning' : `Sisa ${item.belumDipakai} raw`}</p>
            </div>
            <div className="flex gap-2 text-center text-[11px] font-extrabold tabular-nums">
              <Count label="Ment" value={item.mentahan} tone="text-slate-900" onClick={() => onOpenFiles(item.produk, 'Mentahan (Raw_Asset)', item.rawFiles)} />
              <Count label="Edit" value={item.videoFinal} tone="text-amber-600" onClick={() => onOpenFiles(item.produk, 'Video Final (Klip_Vidio)', item.klipFiles)} />
              <Count label="Up" value={item.upload} tone="text-emerald-700" onClick={() => onOpenFiles(item.produk, 'Video Terupload (Publish)', item.uploadFiles)} />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function Count({ label, value, tone, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`min-w-7 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${tone}`}>
      <span className="block text-[8px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      {value}
    </button>
  );
}

function MonthCard({ card, selected, onBulan, onOpenFiles }) {
  const width = Math.min(card.powerPercentage, 100);
  return (
    <section className={`rounded-[20px] border bg-white p-3.5 shadow-[0_8px_28px_rgba(15,23,42,0.07)] ${selected ? 'border-emerald-400' : 'border-black/[0.06]'}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button type="button" onClick={() => onBulan(selected ? 'Semua' : card.month)} className="inline-flex items-center gap-1.5 text-[13px] font-extrabold focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
          {card.title}
        </button>
        <span className="rounded-full border border-blue-200 bg-blue-100 px-1.5 py-0.5 text-[9.5px] font-extrabold text-blue-800">⚡ Power Publish {card.powerPercentage}%</span>
      </div>
      <div className="mb-2 grid grid-cols-3 gap-1.5 text-center">
        <Mini onClick={() => onOpenFiles(card.title, 'Mentahan (Raw_Asset)', card.rawFiles, card.month)} label="1. Mentahan" value={card.mentahan} rate={`⚡ ${card.powerRawPerHari}/hr`} note={card.isCurrentMonth ? `Est: ~${card.estRawBulanan}` : `${card.rawActiveDays} hr aktif`} tone="text-blue-600" />
        <Mini onClick={() => onOpenFiles(card.title, 'Produksi (Klip_Vidio)', card.klipFiles, card.month)} label="2. Produksi" value={card.produksi} rate={`⚡ ${card.powerKlipPerHari}/hr`} note={card.isCurrentMonth ? `Est: ~${card.estKlipBulanan}` : `${card.klipActiveDays} hr edit`} tone="text-amber-600" />
        <Mini onClick={() => onOpenFiles(card.title, 'Publish (Tayang)', card.uploadFiles, card.month)} label="3. Publish" value={card.publish} rate={`⚡ ${card.powerPubPerHari}/hr`} note={card.isCurrentMonth ? `Est: ~${card.estPubBulanan}` : `${card.pubActiveDays} hr tayang`} tone="text-emerald-700" />
      </div>
      <div className="flex justify-between text-[10px] font-bold text-slate-500">
        <span>Sisa mentahan: <b className="text-slate-900">{card.mentahanBelumDipakai} raw</b></span>
        <span>Target 15/hr</span>
      </div>
      <div className="mt-1 h-[5px] overflow-hidden rounded-full bg-slate-200">
        <i className="block h-full rounded-full bg-blue-500" style={{ width: `${width}%` }} />
      </div>
    </section>
  );
}

function Mini({ onClick, label, value, rate, note, tone }) {
  return (
    <button type="button" onClick={onClick} className="rounded-xl border border-black/[0.06] bg-white px-1 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600">
      <span className={`block text-[8.5px] font-extrabold uppercase tracking-wide ${tone}`}>{label}</span>
      <span className="mt-0.5 block text-lg font-extrabold leading-none tracking-tight underline decoration-dotted">{value}</span>
      <span className={`mt-0.5 block text-[9.5px] font-bold ${tone}`}>{rate}</span>
      <span className="block text-[9px] font-semibold text-slate-400">{note}</span>
    </button>
  );
}

const BUCKET_MOBILE = {
  under1k: 'bg-slate-50 text-slate-600',
  from1k: 'bg-blue-50 text-blue-700',
  from5k: 'bg-orange-50 text-orange-700',
  from10k: 'bg-emerald-50 text-emerald-800',
};

export function MobileProduk({
  loading,
  rows,
  month,
  monthOptions,
  onMonthChange,
  onOpenVideos,
  compare,
}) {
  const [sort, setSort] = useState({ key: 'upload', dir: 'desc' });
  const report = useMemo(() => buildRekapProduk(rows, month), [rows, month]);
  const sorted = useMemo(() => {
    const list = [...report.products];
    list.sort((a, b) => {
      const left = sort.key === 'produk' ? a.produk : a[sort.key];
      const right = sort.key === 'produk' ? b.produk : b[sort.key];
      const base = typeof left === 'string' ? left.localeCompare(right, 'id') : (left || 0) - (right || 0);
      return sort.dir === 'asc' ? base : -base;
    });
    return list;
  }, [report.products, sort]);
  const showLoading = loading && (!rows || rows.length === 0);
  const empty = !showLoading && report.totals.upload === 0;
  const monthLabel = formatYearMonth(month) || month;

  return (
    <div className="space-y-2.5 px-4 pb-2 lg:hidden">
      <ChipSelect label="Bulan rekap produk" value={month} onChange={(event) => onMonthChange(event.target.value)} active>
        {monthOptions.map((ym) => <option key={ym} value={ym}>{formatYearMonth(ym) || ym}</option>)}
      </ChipSelect>
      {compare}
      {showLoading && <p className="rounded-[20px] bg-white px-4 py-8 text-center text-sm font-semibold text-slate-400">Menarik data dari Google Sheets…</p>}
      {empty && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-950">{monthLabel} belum ada video dengan tanggal upload.</p>
      )}
      <div className="grid grid-cols-3 gap-1.5">
        <button type="button" disabled={!report.totals.upload} onClick={() => onOpenVideos({ produk: '', bucket: 'upload' })} className="text-left disabled:cursor-default">
          <Stat label="Total video" value={showLoading ? '…' : formatIdNumber(report.totals.upload)} hint="klik untuk daftar" labelTone="text-blue-600" />
        </button>
        <Stat label="Produk" value={showLoading ? '…' : formatIdNumber(report.totals.produkCount)} hint="punya upload" labelTone="text-emerald-700" />
        <Stat label="Rata-rata" value={showLoading ? '…' : formatIdNumber(report.totals.average)} hint={report.totals.rated ? `dari ${formatIdNumber(report.totals.rated)} ber-view` : 'butuh angka view'} labelTone="text-violet-600" />
      </div>
      {!empty && !showLoading && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            {VIEW_BUCKETS.map((bucket) => (
              <button
                key={bucket.id}
                type="button"
                disabled={!report.totals[bucket.id]}
                onClick={() => onOpenVideos({ produk: '', bucket: bucket.id })}
                className={`rounded-2xl px-3 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-default ${BUCKET_MOBILE[bucket.id]}`}
              >
                <span className="block text-[10px] font-extrabold uppercase tracking-wide">{bucket.label}</span>
                <span className="mt-0.5 block text-xl font-extrabold tracking-tight">{formatIdNumber(report.totals[bucket.id] || 0)}</span>
                <span className="text-[10px] font-semibold text-slate-500">{bucket.hint}</span>
              </button>
            ))}
          </div>
          <section className="rounded-[20px] border border-black/[0.06] bg-white p-3.5 shadow-[0_8px_28px_rgba(15,23,42,0.07)]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold">Peringkat per produk</h3>
              <button
                type="button"
                onClick={() => setSort((prev) => ({ key: 'upload', dir: prev.dir === 'desc' ? 'asc' : 'desc' }))}
                className="text-[10px] font-bold text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              >
                {formatIdNumber(report.totals.produkCount)} produk
              </button>
            </div>
            {sorted.map((item) => (
              <button
                key={item.produk}
                type="button"
                onClick={() => onOpenVideos({ produk: item.produk, bucket: 'upload' })}
                className="flex w-full items-center justify-between gap-3 border-t border-black/[0.06] py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-extrabold">{item.produk}</span>
                  <span className="text-[11px] font-semibold text-slate-500">
                    {formatIdNumber(item.upload)} upload{item.missingViews ? ` · ${formatIdNumber(item.missingViews)} tanpa view` : ''}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-[15px] font-extrabold tracking-tight">{formatIdNumber(item.average)}</span>
                  <span className="text-[10px] font-semibold text-slate-500">rata-rata view</span>
                </span>
              </button>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

export function MobileFyp({
  query,
  onQuery,
  shown,
  total,
  months,
  bulan,
  onBulan,
  accounts,
  akun,
  onAkun,
  accountLabel,
  statuses,
  status,
  onStatus,
  onlyStar,
  onToggleStar,
  starred,
  stats,
  rows,
  page,
  pages,
  onPage,
  onStar,
  onPlay,
  onOpen,
  compare,
  loading,
}) {
  return (
    <div className="space-y-2.5 px-4 pb-2 lg:hidden">
      <SearchBox id="search-fyp-mobile" value={query} onChange={onQuery} shown={shown} total={total} />
      <div className="grid grid-cols-2 gap-1.5">
        <ChipSelect label="Bulan laporan" value={bulan} onChange={(event) => onBulan(event.target.value)} active={bulan !== 'Semua'}>
          {months.map((item) => <option key={item} value={item}>{item === 'Semua' ? 'Semua bulan' : item}</option>)}
        </ChipSelect>
        <ChipSelect label="Akun" value={akun} onChange={(event) => onAkun(event.target.value)} active={akun !== 'Semua'}>
          {accounts.map((item) => <option key={item} value={item}>{item === 'Semua' ? 'Semua akun' : accountLabel(item)}</option>)}
        </ChipSelect>
        <ChipSelect label="Status FYP" value={status} onChange={(event) => onStatus(event.target.value)} active={status !== 'Semua'}>
          {statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </ChipSelect>
        <button
          type="button"
          onClick={onToggleStar}
          aria-pressed={onlyStar}
          className={`inline-flex items-center justify-center gap-1 rounded-xl border px-2 text-xs font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${onlyStar ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-black/[0.06] bg-white text-amber-800'}`}
        >
          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
          {starred} video ditandai
        </button>
      </div>
      {compare}
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="Terfilter" value={stats.videos} hint="klip" labelTone="text-blue-600" />
        <Stat label="Akumulasi" value={stats.views} hint="tayangan" labelTone="text-violet-600" />
        <Stat label="Tembus FYP" value={stats.fyp} hint="video" labelTone="text-orange-700" />
      </div>
      {loading && rows.length === 0 ? (
        <p className="rounded-[20px] bg-white px-4 py-8 text-center text-sm font-semibold text-slate-400">Menarik data dari Google Sheets…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-[20px] bg-white px-4 py-8 text-center text-sm font-semibold text-slate-400">Tidak ada video yang cocok dengan filter.</p>
      ) : rows.map((row) => (
        <FypCard key={row.key} row={row} onStar={onStar} onPlay={onPlay} onOpen={onOpen} />
      ))}
      {pages > 1 && (
        <div className="flex items-center justify-between px-1 text-xs font-bold text-slate-600">
          <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 disabled:opacity-40" aria-label="Halaman sebelumnya">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span>Hal {page} dari {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 disabled:opacity-40" aria-label="Halaman berikutnya">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function fypBadge(status) {
  const value = String(status || 'Belum FYP');
  const key = value.toLowerCase();
  if (key.includes('mega') || key.includes('viral')) return 'border-red-200 bg-red-50 text-red-700';
  if (key.includes('fyp') && !key.includes('belum')) return 'border-orange-200 bg-orange-50 text-orange-700';
  if (key.includes('belum')) return 'border-slate-200 bg-slate-100 text-slate-600';
  return 'border-emerald-200 bg-emerald-50 text-emerald-800';
}

function FypCard({ row, onStar, onPlay, onOpen }) {
  return (
    <article className="rounded-[20px] border border-black/[0.06] bg-white p-3.5 shadow-[0_8px_28px_rgba(15,23,42,0.07)]">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={row.starLocked}
          aria-pressed={row.starred}
          aria-label={row.starred ? 'Hapus bintang' : 'Tandai bintang'}
          onClick={() => onStar(row)}
          className="mt-0.5 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-40"
        >
          <Star className={`h-4 w-4 ${row.starred ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-extrabold tracking-tight">{row.name}</p>
          {row.account && <span className="mt-1 inline-block rounded-md border border-slate-200 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-700">{row.account}</span>}
          <p className="mt-1 text-[11px] font-semibold text-slate-500">{row.date}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {row.canPlay && (
              <button type="button" onClick={() => onPlay(row)} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-extrabold text-white">
                <Play className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true" /> Play
              </button>
            )}
            <span className={`inline-flex rounded-lg border px-2 py-1 text-[10.5px] font-extrabold ${fypBadge(row.status)}`}>{row.status || 'Belum FYP'}</span>
            <span className="ml-auto text-[15px] font-extrabold tabular-nums tracking-tight">{row.views}</span>
          </div>
          {row.url && (
            <button type="button" onClick={() => onOpen(row.url)} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-blue-600">
              Buka di TikTok <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function MobileViolations({
  items,
  formOpen,
  onCreate,
  onPlay,
  onPreview,
  onAddShots,
  onStatus,
  onEdit,
}) {
  return (
    <div className="mb-3 space-y-2.5 lg:hidden">
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={onCreate} className="inline-flex items-center gap-1 rounded-xl bg-red-600 px-3 py-2 text-[12.5px] font-extrabold text-white shadow-[0_6px_14px_rgba(220,38,38,0.25)] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-800">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Catat baru
        </button>
        <span className="rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-[10.5px] font-extrabold text-slate-600">{items.length} kasus</span>
      </div>
      {items.length === 0 && !formOpen && (
        <p className="rounded-[20px] bg-white px-4 py-8 text-center text-sm font-semibold text-slate-400">Belum ada pelanggaran tercatat.</p>
      )}
      {items.map((item) => (
        <article key={item.id} className="rounded-[20px] border border-black/[0.06] bg-white p-3.5 shadow-[0_8px_28px_rgba(15,23,42,0.07)]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-extrabold">{item.produk || 'Tanpa produk'}</p>
              <p className="text-[11px] font-semibold text-slate-500">{item.tanggal || 'Tanpa tanggal'} · {item.akun || 'Tanpa akun'}</p>
            </div>
            <select
              aria-label={`Status banding ${item.produk || ''}`}
              value={item.status || 'Belum Banding'}
              onChange={(event) => onStatus(item.id, event.target.value)}
              className="max-w-[46%] rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10.5px] font-extrabold text-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              <option>Belum Banding</option>
              <option>Menunggu Banding</option>
              <option>Banding Diterima</option>
              <option>Banding Ditolak</option>
            </select>
          </div>
          {item.jenis && <span className="mt-1.5 inline-block rounded-lg border border-red-200 bg-red-50 px-2 py-0.5 text-[10.5px] font-extrabold text-red-700">{item.jenis}</span>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {canPlayTikTokUrl(item.linkVideo) && (
              <button type="button" onClick={() => onPlay(item)} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-extrabold text-white">
                <Play className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true" /> Putar
              </button>
            )}
            {item.linkVideo && (
              <a href={item.linkVideo} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-blue-600">Buka Video</a>
            )}
            <button type="button" onClick={() => onEdit(item)} className="text-[11px] font-bold text-amber-800">Edit</button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {(item.shots || []).map((shot, index) => (
              <button key={shot.id || index} type="button" onClick={() => onPreview(item, index)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                <ImageIcon className="h-2.5 w-2.5" aria-hidden="true" /> {shot.label || `SS #${index + 1}`}
              </button>
            ))}
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-dashed border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-800">
              <Plus className="h-2.5 w-2.5" aria-hidden="true" /> Tambah SS
              <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => onAddShots(event, item.id)} />
            </label>
          </div>
          {item.catatan && <p className="mt-2 text-[11px] font-medium leading-snug text-slate-500">Catatan: {item.catatan}</p>}
        </article>
      ))}
    </div>
  );
}
