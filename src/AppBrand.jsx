import { APP_MARK, APP_SUBTITLE, APP_TITLE } from './branding.js';

export default function AppBrand({ className = '', compact = false, heading: Heading = 'h1' }) {
  const mark = compact ? 'h-9 w-9 rounded-lg text-base' : 'h-10 w-10 rounded-lg text-lg';
  const title = compact ? 'text-sm font-bold leading-tight text-slate-900' : 'font-bold text-gray-900 text-sm';
  const subtitle = compact ? 'text-[11px] leading-tight text-slate-500' : 'text-xs text-gray-500';
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className={`${mark} flex shrink-0 items-center justify-center bg-emerald-700 font-bold text-white`} aria-hidden="true">{APP_MARK}</div>
      <div className="min-w-0">
        <Heading className={title}>{APP_TITLE}</Heading>
        <p className={subtitle}>{APP_SUBTITLE}</p>
      </div>
    </div>
  );
}
