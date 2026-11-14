import { formatStarBadge, formatYearMonth, starFileLabel } from './starHistory.js';

export function StarHistoryBadge({ months }) {
  const label = formatStarBadge(months);
  if (!label) return null;
  return (
    <span
      className="inline-flex items-center text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full max-w-full"
      title="Bulan laporan yang bintangnya masih aktif"
    >
      {label}
    </span>
  );
}

function CompareColumn({ title, hint, rows, tone }) {
  const toneClass = {
    amber: 'border-amber-200 bg-amber-50/40',
    emerald: 'border-emerald-200 bg-emerald-50/40',
    gray: 'border-gray-200 bg-gray-50',
  }[tone] || 'border-gray-200 bg-gray-50';

  return (
    <div className={`rounded-xl border p-3 min-w-0 ${toneClass}`}>
      <p className="text-xs font-bold text-gray-900">{title} ({rows.length})</p>
      <p className="text-[11px] text-gray-500 mt-0.5 mb-2">{hint}</p>
      {rows.length === 0 ? (
        <p className="text-xs font-semibold text-gray-400">Tidak ada</p>
      ) : (
        <ul className="max-h-48 overflow-y-auto space-y-1">
          {rows.map((row) => (
            <li key={row.fileKey} className="text-xs font-semibold text-gray-800 break-words">
              {starFileLabel(row)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function StarMonthCompare({
  baseMonth,
  compareMonth,
  onCompareMonth,
  options,
  result,
}) {
  const baseLabel = baseMonth ? formatYearMonth(baseMonth) : '';
  const otherLabel = compareMonth ? formatYearMonth(compareMonth) : '';

  return (
    <div className="bg-white border border-amber-200 rounded-xl p-4 mb-6 print:hidden">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900">Riwayat bintang</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {baseLabel
              ? `Bintang yang tampil adalah bulan ${baseLabel}. Bintang di bulan lain tetap tersimpan.`
              : 'Pilih satu bulan laporan. Bintang masuk ke bulan itu, bukan ke tanggal klik.'}
          </p>
        </div>
        <label className="lg:ml-auto w-full lg:w-auto">
          <span className="sr-only">Bandingkan dengan bulan</span>
          <select
            aria-label="Bandingkan dengan bulan"
            value={options.includes(compareMonth) ? compareMonth : ''}
            onChange={(event) => onCompareMonth(event.target.value)}
            disabled={!baseMonth}
            className="bg-amber-50 border border-amber-200 text-gray-800 text-sm rounded-lg p-2.5 font-semibold w-full lg:w-max disabled:opacity-60"
          >
            <option value="">Bandingkan dengan bulan...</option>
            {options.map((ym) => (
              <option key={ym} value={ym}>{formatYearMonth(ym)}</option>
            ))}
          </select>
        </label>
      </div>
      {result?.ready && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <CompareColumn title="Di kedua bulan" hint={`${baseLabel} dan ${otherLabel}`} rows={result.both} tone="amber" />
          <CompareColumn title="Baru" hint={`Ada di ${baseLabel}, tidak di ${otherLabel}`} rows={result.added} tone="emerald" />
          <CompareColumn title="Hilang" hint={`Ada di ${otherLabel}, tidak di ${baseLabel}`} rows={result.dropped} tone="gray" />
        </div>
      )}
    </div>
  );
}
