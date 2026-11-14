import { useRef } from 'react';
import { Search } from 'lucide-react';

export default function SearchBox({ id, value, onChange, shown, total, className = '' }) {
  const inputRef = useRef(null);
  const hasQuery = String(value || '').length > 0;

  const clear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  return (
    <div className={className}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="searchbox"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Cari file, produk, akun..."
          aria-label="Cari file, produk, akun"
          autoComplete="off"
          className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-11 text-sm font-medium text-gray-900 shadow-sm placeholder:font-normal placeholder:text-gray-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
        {hasQuery ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Hapus pencarian"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-sm font-bold leading-none text-gray-500 hover:bg-gray-200 hover:text-gray-800"
          >
            ✕
          </button>
        ) : null}
      </div>
      <p className="mt-1.5 text-xs font-medium text-gray-500" aria-live="polite">
        Menampilkan <span className="font-bold text-gray-900">{shown.toLocaleString('id-ID')}</span> dari <span className="font-bold text-gray-900">{total.toLocaleString('id-ID')}</span>
      </p>
    </div>
  );
}
