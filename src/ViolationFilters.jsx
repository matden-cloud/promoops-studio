function FilterSelect({ label, value, options, onChange, compact }) {
  const active = value !== 'Semua';
  return (
    <label className={compact ? 'w-[9.6rem] shrink-0' : 'min-w-0'}>
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={options.some((option) => option.value === value) ? value : 'Semua'}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-lg border bg-white font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 ${compact ? 'px-2 py-1.5 text-[11px]' : 'px-2.5 py-2 text-xs'} ${active ? 'border-red-300 text-red-800' : 'border-gray-200 text-gray-800'}`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

export default function ViolationFilters({ view, onChange, onReset, compact = false }) {
  const filters = view.filters;
  return (
    <div className={compact ? 'space-y-1.5' : 'mb-3 space-y-2'}>
      <div className={compact ? 'flex gap-1.5 overflow-x-auto pb-0.5' : 'grid grid-cols-2 gap-2 xl:grid-cols-4'}>
        <FilterSelect compact={compact} label="Filter bulan" value={filters.bulan} options={view.months} onChange={(value) => onChange('bulan', value)} />
        <FilterSelect compact={compact} label="Filter akun" value={filters.akun} options={view.accounts} onChange={(value) => onChange('akun', value)} />
        <FilterSelect compact={compact} label="Filter status" value={filters.status} options={view.statuses} onChange={(value) => onChange('status', value)} />
        <FilterSelect compact={compact} label="Filter sanksi" value={filters.sanksi} options={view.sanctions} onChange={(value) => onChange('sanksi', value)} />
      </div>
      <div className={compact ? 'space-y-1' : 'flex flex-wrap items-center gap-x-3 gap-y-1.5'}>
        <div className="flex min-w-0 items-center gap-2">
          <p className={compact ? 'min-w-0 text-[11px] font-semibold leading-snug text-slate-600' : 'text-sm font-semibold text-gray-700'}>
            <span className="font-extrabold text-gray-900">{view.headline}</span>
            <span> · {view.rangeLabel}</span>
          </p>
          {view.active && (
            <button
              type="button"
              onClick={onReset}
              className={`shrink-0 rounded-lg border border-gray-200 bg-white font-bold text-gray-700 hover:bg-gray-50 ${compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'}`}
            >
              Reset filter
            </button>
          )}
        </div>
        {view.accountChips.length > 0 && (
          <div className={`flex gap-1 ${compact ? 'overflow-x-auto' : 'flex-wrap'}`}>
            {view.accountChips.map((chip) => {
              const selected = filters.akun === chip.value;
              return (
                <button
                  key={chip.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange('akun', selected ? 'Semua' : chip.value)}
                  className={`shrink-0 rounded-full border px-2 py-0.5 font-bold ${compact ? 'text-[10px]' : 'text-[11px]'} ${selected ? 'border-red-300 bg-red-50 text-red-800' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
