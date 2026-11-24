import { useInstallPrompt } from './pwa/useInstallPrompt.js';

function Mark() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-base font-bold text-white" aria-hidden="true">V</span>
  );
}

export default function InstallBanner() {
  const { surface, update, install, dismiss, applyUpdate } = useInstallPrompt();
  if (surface === 'hidden' && !update) return null;

  return (
    <div className="print:hidden">
      {update && (
        <div id="pembaruan-aplikasi" className="border-b border-emerald-800 bg-emerald-800 px-4 py-2.5 text-white" role="status">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-2">
            <p className="min-w-[12rem] flex-1 text-sm font-semibold">Versi baru Video siap.</p>
            <button
              type="button"
              onClick={applyUpdate}
              className="ml-auto rounded-lg bg-white px-3 py-1.5 text-xs font-extrabold text-emerald-900"
            >
              Muat ulang
            </button>
          </div>
        </div>
      )}
      {surface === 'android' && (
        <div id="pasang-aplikasi" className="border-b border-emerald-200 bg-emerald-50 px-4 py-2.5">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-2">
            <Mark />
            <p className="min-w-[12rem] flex-1 text-sm font-semibold text-emerald-950">Pasang Video di layar utama, tanpa bilah browser.</p>
            <button
              id="install-aplikasi"
              type="button"
              onClick={install}
              className="ml-auto rounded-lg bg-emerald-700 px-3 py-2 text-xs font-extrabold text-white"
            >
              Install aplikasi
            </button>
          </div>
        </div>
      )}
      {surface === 'ios' && (
        <div id="petunjuk-iphone" className="border-b border-emerald-200 bg-white px-4 py-2.5" role="region" aria-label="Pasang aplikasi">
          <div className="mx-auto flex max-w-[1400px] items-start gap-3">
            <Mark />
            <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-slate-800">
              Pasang Video di iPhone: ketuk <span className="font-extrabold">Bagikan</span>, lalu <span className="font-extrabold">Tambah ke Layar Utama</span>.
            </p>
            <button
              type="button"
              onClick={dismiss}
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
