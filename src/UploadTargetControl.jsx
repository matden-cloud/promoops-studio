import { useEffect, useRef, useState } from 'react';
import { Settings } from 'lucide-react';

export function UploadTargetButton({ rows, total, onChange }) {
  const [open, setOpen] = useState(false);
  const [lift, setLift] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const panelHeight = Math.min(360, window.innerHeight - 24);
      setLift(window.innerHeight - rect.bottom < panelHeight && rect.top > panelHeight);
    };
    place();
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  const openPanel = () => {
    if (!open) {
      const rect = rootRef.current?.getBoundingClientRect();
      if (rect && window.innerHeight - rect.bottom < 320) {
        rootRef.current?.scrollIntoView({ block: 'center', inline: 'nearest' });
      }
    }
    setOpen((value) => !value);
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Atur target upload"
        aria-expanded={open}
        onClick={openPanel}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-200 bg-white text-emerald-700 shadow-sm hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
      >
        <Settings className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Target upload per akun"
          className={`fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[70] flex max-h-[min(24rem,calc(100dvh-7rem))] flex-col rounded-2xl border border-gray-200 bg-white p-3 text-left shadow-2xl lg:absolute lg:inset-x-auto lg:w-[22rem] lg:max-h-[min(24rem,calc(100dvh-2rem))] ${lift ? 'lg:bottom-full lg:top-auto lg:right-0 lg:mb-2' : 'lg:bottom-auto lg:right-0 lg:top-full lg:mt-2'}`}
        >
          <p className="text-xs font-bold text-gray-900">Target video per hari</p>
          <p className="mt-0.5 text-[11px] font-medium leading-snug text-gray-500">Isi 0 bila akun itu tidak punya target. Jumlahnya menjadi target harian.</p>
          {rows.length === 0 ? (
            <p className="py-4 text-center text-xs font-semibold text-gray-400">Belum ada akun aktif.</p>
          ) : (
            <ul className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto px-0.5">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3">
                  <label htmlFor={`upload-target-${row.id}`} className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-800">
                    {row.name}
                  </label>
                  <input
                    id={`upload-target-${row.id}`}
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="999"
                    step="1"
                    aria-label={`Target ${row.name}`}
                    value={row.perDay}
                    onChange={(event) => onChange(row.id, event.target.value)}
                    className="w-[4.5rem] shrink-0 rounded-lg border border-gray-300 px-2 py-1 text-right text-sm font-bold tabular-nums text-gray-900 focus:border-emerald-500 focus:outline-none"
                  />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 shrink-0 border-t border-gray-100 pt-2 text-[11px] font-bold text-emerald-700">Total {total}/hari ({rows.length} akun)</p>
        </div>
      )}
    </div>
  );
}
