import { useEffect, useState } from 'react';
import {
  IOS_HINT_STORAGE_KEY,
  isIosDevice,
  isStandaloneDisplay,
  resolveInstallSurface,
  shouldOfferUpdate,
} from './installState.js';
import { requestPwaUpdate, UPDATE_EVENT } from './register.js';

function readPreview() {
  try {
    const value = new URLSearchParams(window.location.search).get('pratinjau-pasang');
    if (value === 'android' || value === 'ios' || value === 'pembaruan') return value;
  } catch {
    return '';
  }
  return '';
}

function readIos() {
  return isIosDevice(window.navigator.userAgent, {
    maxTouchPoints: window.navigator.maxTouchPoints,
    platform: window.navigator.platform,
  });
}

function readDismissed() {
  try {
    return window.localStorage.getItem(IOS_HINT_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function readStandalone() {
  const fullscreen = window.matchMedia('(display-mode: fullscreen)').matches;
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  return isStandaloneDisplay({
    displayMode: fullscreen ? 'fullscreen' : (standalone ? 'standalone' : 'browser'),
    iosStandalone: window.navigator.standalone === true,
  });
}

export function useInstallPrompt() {
  const [preview] = useState(readPreview);
  const [hasPrompt, setHasPrompt] = useState(false);
  const [promptEvent, setPromptEvent] = useState(null);
  const [standalone, setStandalone] = useState(readStandalone);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [ios] = useState(readIos);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)');
    const onDisplay = () => setStandalone(readStandalone());
    const onPrompt = (event) => {
      event.preventDefault();
      setPromptEvent(event);
      setHasPrompt(true);
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setHasPrompt(false);
      setStandalone(true);
    };
    const onUpdate = () => setUpdateReady(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener(UPDATE_EVENT, onUpdate);
    media.addEventListener?.('change', onDisplay);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener(UPDATE_EVENT, onUpdate);
      media.removeEventListener?.('change', onDisplay);
    };
  }, []);

  return {
    surface: resolveInstallSurface({ standalone, ios, dismissed, hasPrompt, preview }),
    update: shouldOfferUpdate({ updateReady, preview }),
    async install() {
      if (!promptEvent) return;
      promptEvent.prompt();
      try {
        await promptEvent.userChoice;
      } catch {
        // Browser menolak prompt kedua. Sembunyikan tombol.
      }
      setPromptEvent(null);
      setHasPrompt(false);
    },
    dismiss() {
      setDismissed(true);
      try {
        window.localStorage.setItem(IOS_HINT_STORAGE_KEY, '1');
      } catch {
        // Mode privat bisa menolak penyimpanan. Petunjuk tetap hilang di kunjungan ini.
      }
    },
    applyUpdate() {
      requestPwaUpdate(window).catch(() => window.location.reload());
    },
  };
}
