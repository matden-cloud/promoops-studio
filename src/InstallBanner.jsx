import { useInstallPrompt } from './pwa/useInstallPrompt.js';
import { installPresentation, updatePresentation } from './pwa/installState.js';

function CloseButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Tutup"
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold leading-none text-slate-500 hover:bg-black/5 hover:text-slate-800"
    >
      ×
    </button>
  );
}

function HeaderInstall({ onInstall, onDismiss }) {
  return (
    <div id="pasang-aplikasi" className="pointer-events-none fixed right-4 top-3 z-40 print:hidden lg:right-auto lg:left-[24rem] lg:top-[0.85rem]">
      <div className="pointer-events-auto inline-flex items-center gap-0.5 rounded-full border border-emerald-200 bg-white py-0.5 pl-0.5 pr-0.5 shadow-sm">
        <button
          id="install-aplikasi"
          type="button"
          onClick={onInstall}
          className="inline-flex items-center gap-1 rounded-full bg-emerald-700 py-1 pl-1 pr-2.5 text-xs font-extrabold text-white"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/15 text-[11px] font-bold" aria-hidden="true">V</span>
          Install
        </button>
        <CloseButton onClick={onDismiss} />
      </div>
    </div>
  );
}

function SlimBar({ id, children, tone = 'bg-emerald-50 border-emerald-200' }) {
  return (
    <div id={id} className={`flex h-9 items-center gap-1.5 border-b px-3 print:hidden ${tone}`}>
      {children}
    </div>
  );
}

function MobileInstall({ onInstall, onDismiss }) {
  return (
    <SlimBar id="pasang-aplikasi">
      <p className="min-w-0 flex-1 truncate text-xs font-semibold text-emerald-950">Pasang ke layar utama</p>
      <button
        id="install-aplikasi"
        type="button"
        onClick={onInstall}
        className="shrink-0 rounded-full bg-emerald-700 px-2.5 py-1 text-[11px] font-extrabold text-white"
      >
        Install
      </button>
      <CloseButton onClick={onDismiss} />
    </SlimBar>
  );
}

function MobileIos({ onDismiss }) {
  return (
    <SlimBar id="petunjuk-iphone" tone="border-emerald-200 bg-white">
      <p className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800" role="region" aria-label="Pasang aplikasi">
        Ketuk <span className="font-extrabold">Bagikan</span>, lalu <span className="font-extrabold">Tambah ke Layar Utama</span>
      </p>
      <CloseButton onClick={onDismiss} />
    </SlimBar>
  );
}

function UpdateNotice({ wide, onApply }) {
  const body = (
    <>
      <p className="min-w-0 truncate text-xs font-semibold">Versi baru siap.</p>
      <button
        type="button"
        onClick={onApply}
        className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-extrabold text-emerald-900"
      >
        Muat ulang
      </button>
    </>
  );
  if (!wide) {
    return (
      <SlimBar id="pembaruan-aplikasi" tone="border-emerald-800 bg-emerald-800 text-white">
        {body}
      </SlimBar>
    );
  }
  return (
    <div id="pembaruan-aplikasi" className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 print:hidden" role="status">
      <div className="inline-flex max-w-[20rem] items-center gap-2 rounded-full bg-emerald-800 py-1 pl-3 pr-1 text-white shadow-lg">
        {body}
      </div>
    </div>
  );
}

export default function InstallBanner() {
  const { wide, surface, update, install, dismiss, applyUpdate } = useInstallPrompt();
  const chrome = installPresentation({ surface, wide });
  const refresh = updatePresentation({ update, wide });
  if (chrome === 'hidden' && refresh === 'hidden') return null;

  return (
    <>
      {refresh !== 'hidden' && <UpdateNotice wide={wide} onApply={applyUpdate} />}
      {chrome === 'header' && <HeaderInstall onInstall={install} onDismiss={dismiss} />}
      {chrome === 'bar' && surface === 'android' && <MobileInstall onInstall={install} onDismiss={dismiss} />}
      {chrome === 'bar' && surface === 'ios' && <MobileIos onDismiss={dismiss} />}
    </>
  );
}
