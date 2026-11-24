import { violationJenisPills } from './violationDisplay.js';

export default function ViolationJenisPills({ jenis }) {
  const pills = violationJenisPills(jenis);
  if (!pills.length) return <span className="text-xs italic text-gray-400">Tanpa jenis</span>;
  return (
    <div className="flex flex-wrap content-start gap-1.5">
      {pills.map((label, index) => (
        <span
          key={`${label}-${index}`}
          className="inline-block max-w-full rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-left text-xs font-semibold leading-snug text-red-800 break-words"
        >
          {label}
        </span>
      ))}
    </div>
  );
}
