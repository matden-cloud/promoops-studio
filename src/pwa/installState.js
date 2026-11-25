export const IOS_HINT_STORAGE_KEY = 'video-pwa-ios-hint';
export const DESKTOP_INSTALL_MIN_WIDTH = 768;

export function isStandaloneDisplay({ displayMode = 'browser', iosStandalone = false } = {}) {
  return displayMode === 'standalone' || displayMode === 'fullscreen' || iosStandalone === true;
}

export function isIosDevice(userAgent, { maxTouchPoints = 0, platform = '' } = {}) {
  const ua = String(userAgent || '');
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return platform === 'MacIntel' && maxTouchPoints > 1;
}

export function isDesktopInstallViewport({ width = 0, finePointer = false } = {}) {
  return width >= DESKTOP_INSTALL_MIN_WIDTH || finePointer === true;
}

export function resolveInstallSurface({
  standalone = false,
  ios = false,
  dismissed = false,
  hasPrompt = false,
  preview = '',
} = {}) {
  if (preview === 'pembaruan') return 'hidden';
  if (dismissed) return 'hidden';
  if (preview === 'android') return 'android';
  if (preview === 'ios') return 'ios';
  if (standalone) return 'hidden';
  if (hasPrompt) return 'android';
  if (ios) return 'ios';
  return 'hidden';
}

export function installPresentation({ surface, wide = false } = {}) {
  if (surface === 'android' && wide) return 'header';
  if (surface === 'android' || surface === 'ios') return 'bar';
  return 'hidden';
}

export function updatePresentation({ update = false, wide = false } = {}) {
  if (!update) return 'hidden';
  return wide ? 'chip' : 'bar';
}

export function shouldOfferUpdate({ updateReady = false, preview = '' } = {}) {
  return updateReady === true || preview === 'pembaruan';
}
