import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, Package, Video } from 'lucide-react';
import { formatYearMonth } from './starHistory.js';
import {
  VIEW_BUCKETS,
  buildRekapProduk,
  formatIdNumber,
  rowYearMonth,
  sortRekapRows,
} from './rekapProduk.js';

const BUCKET_TONE = {
  under1k: 'text-slate-700',
  from1k: 'text-blue-700',
  from5k: 'text-emerald-700',
  from10k: 'text-amber-700',
};

const BUCKET_CARD = {
  under1k: 'border-slate-200 bg-slate-50',
  from1k: 'border-blue-200 bg-blue-50',
  from5k: 'border-emerald-200 bg-emerald-50',
  from10k: 'border-amber-200 bg-amber-50',
};

function SortButton({ column, label, sort, onSort, align }) {
  const active = sort.key === column;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={`inline-flex items-center gap-1 font-bold uppercase tracking-wide text-[11px] text-gray-500 hover:text-gray-900 ${align === 'right' ? 'w-full justify-end' : ''}`}
    >
      {label}
      {active && (sort.dir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
    </button>
  );
}

function CountCell({ count, label, onClick, tone = 'text-gray-900', inverse = false }) {
  if (!count) {
    return <span className={`inline-flex min-h-10 min-w-10 items-center justify-center tabular-nums ${inverse ? 'text-gray-500' : 'text-gray-300'}`}>0</span>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg px-1.5 font-bold tabular-nums underline decoration-dotted underline-offset-4 ${tone} ${inverse ? 'decoration-emerald-300 hover:bg-white/10' : 'decoration-emerald-500 hover:bg-emerald-50'}`}
    >
      {formatIdNumber(count)}
    </button>
  );
}

export default function RekapProdukPanel({
  loading,
  rows,
  month,
  monthOptions,
  onMonthChange,
  onOpenVideos,
  children,
}) {
  const [sort, setSort] = useState({ key: 'upload', dir: 'desc' });
  const report = useMemo(() => buildRekapProduk(rows, month), [rows, month]);
  const sorted = useMemo(() => sortRekapRows(report.products, sort.key, sort.dir), [report.products, sort]);
  const dataMonths = useMemo(() => {
    const found = new Set();
    for (const row of rows || []) {
      const ym = rowYearMonth(row);
      if (ym) found.add(ym);
    }
    return [...found].sort().reverse();
  }, [rows]);

  const showLoading = loading && (!rows || rows.length === 0);
  const monthLabel = formatYearMonth(month) || month || 'bulan ini';
  const empty = !showLoading && report.totals.upload === 0;
  const otherLabels = dataMonths
    .filter((ym) => ym !== month)
    .map((ym) => formatYearMonth(ym))
    .filter(Boolean);
  const options = monthOptions.includes(month) ? monthOptions : [month, ...monthOptions].filter(Boolean);

  const open = (produk, bucket) => {
    if (!onOpenVideos) return;
    onOpenVideos({ produk, bucket });
  };

  const onSort = (column) => {
    setSort((prev) => {
      if (prev.key === column) {
        return { key: column, dir: prev.dir === 'desc' ? 'asc' : 'desc' };
      }
      return { key: column, dir: column === 'produk' ? 'asc' : 'desc' };
    });
  };

  return (
    <div className="animate-in fade-in duration-300">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-6">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-gray-900">Rekap Produk</h2>
          <p className="text-gray-500 mt-1 text-sm md:text-base">
            Jumlah upload, rata-rata view, dan kelompok view per produk. Sumber: tab Data_View.
          </p>
        </div>
        <label className="w-full md:w-64 print:hidden">
          <span className="text-xs font-bold text-gray-500 uppercase mb-1 block">Bulan</span>
          <select
            aria-label="Bulan rekap produk"
            value={month}
            onChange={(event) => onMonthChange(event.target.value)}
            className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg block w-full p-2.5 font-semibold"
          >
            {options.map((ym) => (
              <option key={ym} value={ym}>{formatYearMonth(ym) || ym}</option>
            ))}
          </select>
        </label>
      </div>

      {children}

      {showLoading && (
        <p className="mb-6 rounded-xl border border-gray-200 bg-white px-4 py-8 text-center text-sm font-semibold text-gray-400">
          Menarik data dari Google Sheets...
        </p>
      )}

      {empty && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
          <p className="font-bold">{monthLabel} belum ada video dengan tanggal upload.</p>
          <p className="mt-1 leading-relaxed">
            {otherLabels.length
              ? `Pilih bulan lain yang sudah punya data: ${otherLabels.join(', ')}.`
              : 'Belum ada tanggal upload yang bisa dirangkum dari data yang termuat.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-4">
        <button
          type="button"
          onClick={() => open('', 'upload')}
          disabled={!report.totals.upload}
          className="text-left bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-4 disabled:cursor-default enabled:hover:border-blue-300 enabled:hover:shadow-md transition-all"
        >
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0"><Video className="w-6 h-6" /></div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total video</p>
            <p className="text-2xl md:text-3xl font-black text-gray-900 tabular-nums">{showLoading ? '...' : formatIdNumber(report.totals.upload)}</p>
            <p className="text-xs text-gray-500 mt-0.5">{report.totals.upload ? 'Klik untuk daftar video' : 'upload di bulan ini'}</p>
          </div>
        </button>
        <div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-4">
          <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl shrink-0"><Package className="w-6 h-6" /></div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Jumlah produk</p>
            <p className="text-2xl md:text-3xl font-black text-gray-900 tabular-nums">{showLoading ? '...' : formatIdNumber(report.totals.produkCount)}</p>
            <p className="text-xs text-gray-500 mt-0.5">produk punya upload</p>
          </div>
        </div>
        <div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-4">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl shrink-0"><Eye className="w-6 h-6" /></div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Rata-rata view</p>
            <p className="text-2xl md:text-3xl font-black text-gray-900 tabular-nums">{showLoading ? '...' : formatIdNumber(report.totals.average)}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {report.totals.rated
                ? `${formatIdNumber(report.totals.viewSum)} view dari ${formatIdNumber(report.totals.rated)} video`
                : 'butuh angka view'}
            </p>
          </div>
        </div>
      </div>

      {!empty && !showLoading && (
        <>
          {report.totals.missingViews > 0 && (
            <p className="mb-4 text-xs md:text-sm font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              {formatIdNumber(report.totals.missingViews)} video belum punya angka view. Video itu tetap dihitung di Upload. Rata-rata dan kelompok view hanya memakai video yang punya angka view.
            </p>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {VIEW_BUCKETS.map((bucket) => {
              const count = report.totals[bucket.id] || 0;
              return (
                <button
                  key={bucket.id}
                  type="button"
                  disabled={!count}
                  onClick={() => open('', bucket.id)}
                  className={`text-left rounded-2xl border p-3 md:p-4 disabled:cursor-default enabled:hover:shadow-md transition-shadow ${BUCKET_CARD[bucket.id]}`}
                >
                  <p className={`text-[11px] font-bold uppercase tracking-wide ${BUCKET_TONE[bucket.id]}`}>{bucket.label}</p>
                  <p className={`text-xl md:text-2xl font-black tabular-nums mt-1 ${BUCKET_TONE[bucket.id]}`}>{formatIdNumber(count)}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{bucket.hint}</p>
                </button>
              );
            })}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <p className="font-bold text-gray-900">Peringkat per produk ({formatIdNumber(report.totals.produkCount)} produk)</p>
              <p className="text-xs text-gray-500 md:hidden">Geser ke samping untuk melihat kelompok view.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm min-w-[760px]">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 border-b border-gray-200">
                    <th className="sticky left-0 z-20 bg-gray-50 px-3 md:px-4 py-3 min-w-[9.5rem] max-w-[46vw] sm:max-w-none sm:min-w-[16rem]" aria-sort={sort.key === 'produk' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <SortButton column="produk" label="Produk" sort={sort} onSort={onSort} />
                    </th>
                    <th className="px-2 py-3 text-right" aria-sort={sort.key === 'upload' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <SortButton column="upload" label="Upload" sort={sort} onSort={onSort} align="right" />
                    </th>
                    <th className="px-2 py-3 text-right" aria-sort={sort.key === 'average' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <SortButton column="average" label="Rata-rata view" sort={sort} onSort={onSort} align="right" />
                    </th>
                    {VIEW_BUCKETS.map((bucket) => (
                      <th key={bucket.id} className="px-2 py-3 text-right" aria-sort={sort.key === bucket.id ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <SortButton column={bucket.id} label={bucket.label} sort={sort} onSort={onSort} align="right" />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sorted.map((item) => (
                    <tr key={item.produk} className="group hover:bg-gray-50">
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 px-3 md:px-4 py-2 min-w-[9.5rem] max-w-[46vw] sm:max-w-none sm:min-w-[16rem] shadow-[4px_0_8px_-6px_rgba(0,0,0,0.18)]">
                        <p className="font-semibold text-gray-900 break-words">{item.produk}</p>
                        {item.missingViews > 0 && (
                          <p className="text-[11px] font-semibold text-amber-700 mt-0.5">
                            {item.missingViews === 1 ? '1 video belum ada angka view' : `${formatIdNumber(item.missingViews)} video belum ada angka view`}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-1 text-right">
                        <CountCell count={item.upload} tone="text-gray-900" label={`Lihat ${item.upload} upload ${item.produk}`} onClick={() => open(item.produk, 'upload')} />
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-800 tabular-nums">{formatIdNumber(item.average)}</td>
                      {VIEW_BUCKETS.map((bucket) => (
                        <td key={bucket.id} className="px-2 py-1 text-right">
                          <CountCell
                            count={item[bucket.id]}
                            tone={BUCKET_TONE[bucket.id]}
                            label={`Lihat ${item[bucket.id]} video ${item.produk} kelompok ${bucket.label}`}
                            onClick={() => open(item.produk, bucket.id)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-900 text-white">
                    <td className="sticky left-0 z-10 bg-gray-900 px-3 md:px-4 py-3 font-bold shadow-[4px_0_8px_-6px_rgba(0,0,0,0.35)]">Total</td>
                    <td className="px-2 py-1 text-right">
                      <CountCell inverse count={report.totals.upload} tone="text-white" label={`Lihat semua ${report.totals.upload} upload bulan ini`} onClick={() => open('', 'upload')} />
                    </td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums">{formatIdNumber(report.totals.average)}</td>
                    {VIEW_BUCKETS.map((bucket) => (
                      <td key={bucket.id} className="px-2 py-1 text-right">
                        <CountCell
                          inverse
                          count={report.totals[bucket.id]}
                          tone="text-white"
                          label={`Lihat semua video kelompok ${bucket.label}`}
                          onClick={() => open('', bucket.id)}
                        />
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="px-4 py-3 text-[11px] md:text-xs text-gray-500 leading-relaxed border-t border-gray-100">
              Kelompok view: &lt;1rb di bawah 1.000; 1rb–5rb dari 1.000 sampai di bawah 5.000; 5rb–10rb dari 5.000 sampai di bawah 10.000; &gt;10rb mulai 10.000.
              Klik angka upload atau kelompok untuk membuka daftar videonya. Baris Total membuka semua produk di bulan ini.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
