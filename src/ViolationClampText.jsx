import { useEffect, useId, useRef, useState } from 'react';
import { violationTextCanExpand } from './violationDisplay.js';

export default function ViolationClampText({ text, label = '', empty = 'Belum diisi', className = '' }) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  const blank = !value || value === '-' || value.toLowerCase() === 'null';
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [measured, setMeasured] = useState(false);
  const [seen, setSeen] = useState(value);
  const ref = useRef(null);
  const panelId = useId();

  if (seen !== value) {
    setSeen(value);
    setOpen(false);
    setOverflows(false);
    setMeasured(false);
  }

  useEffect(() => {
    const node = ref.current;
    if (!node || open || blank) return undefined;
    const observer = new ResizeObserver(() => {
      setMeasured(true);
      setOverflows(node.scrollHeight > node.clientHeight + 1);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [value, open, blank]);

  if (blank) {
    return <span className="text-xs italic text-gray-400">{empty}</span>;
  }

  const canExpand = open || overflows || (!measured && violationTextCanExpand(value));

  return (
    <div className="min-w-0">
      <p
        id={panelId}
        ref={ref}
        onClick={() => {
          if (!open && canExpand) setOpen(true);
        }}
        className={`${open ? '' : 'line-clamp-3 print:line-clamp-none'} text-xs font-medium leading-relaxed break-words ${canExpand && !open ? 'cursor-pointer' : ''} ${className}`}
      >
        {label ? <span className="font-extrabold">{label}: </span> : null}
        {value}
      </p>
      {canExpand && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
          className="mt-1 inline-flex min-h-8 items-center text-[11px] font-bold text-red-700 underline-offset-2 hover:underline print:hidden"
        >
          {open ? 'Sembunyikan' : 'Lihat semua'}
        </button>
      )}
    </div>
  );
}
