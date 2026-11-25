export const UPDATE_EVENT = 'video-pwa-update';

export function shouldRegisterServiceWorker(prod) {
  return prod === true;
}

export function attachUpdateWatcher(registration, { isControlled, onUpdate }) {
  if (!registration || typeof onUpdate !== 'function') return () => {};

  const consider = (worker) => {
    if (!worker) return;
    const check = () => {
      if (worker.state === 'installed' && isControlled()) onUpdate();
    };
    check();
    worker.addEventListener('statechange', check);
  };

  consider(registration.waiting);
  const onFound = () => consider(registration.installing);
  registration.addEventListener('updatefound', onFound);
  return () => registration.removeEventListener('updatefound', onFound);
}

export function reloadOnLaterControllerChange(serviceWorker, reload) {
  if (!serviceWorker || typeof reload !== 'function') return () => {};
  let sawController = Boolean(serviceWorker.controller);
  let reloading = false;
  const onChange = () => {
    const shouldReload = sawController;
    sawController = Boolean(serviceWorker.controller);
    if (!shouldReload || reloading) return;
    reloading = true;
    reload();
  };
  serviceWorker.addEventListener('controllerchange', onChange);
  return () => serviceWorker.removeEventListener('controllerchange', onChange);
}

export async function requestPwaUpdate(win) {
  const target = win || globalThis;
  const finish = () => target.location.reload();
  const serviceWorker = target.navigator?.serviceWorker;
  if (!serviceWorker) {
    finish();
    return;
  }
  let reloaded = false;
  const reload = () => {
    if (reloaded) return;
    reloaded = true;
    finish();
  };
  serviceWorker.addEventListener('controllerchange', reload);
  try {
    const registration = await serviceWorker.getRegistration();
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      return;
    }
  } catch {
    reload();
    return;
  }
  reload();
}

export function registerPwa(win = globalThis, prod = import.meta.env?.PROD) {
  if (!shouldRegisterServiceWorker(prod)) return;
  const serviceWorker = win?.navigator?.serviceWorker;
  if (!serviceWorker) return;

  const start = () => {
    serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        attachUpdateWatcher(registration, {
          isControlled: () => Boolean(serviceWorker.controller),
          onUpdate: () => win.dispatchEvent(new CustomEvent(UPDATE_EVENT)),
        });
        reloadOnLaterControllerChange(serviceWorker, () => win.location.reload());
        const refresh = () => registration.update().catch(() => {});
        win.document?.addEventListener('visibilitychange', () => {
          if (win.document.visibilityState === 'visible') refresh();
        });
      })
      .catch(() => {});
  };

  if (win.document?.readyState === 'complete') start();
  else win.addEventListener('load', start, { once: true });
}
