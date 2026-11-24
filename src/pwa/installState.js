export const IOS_HINT_STORAGE_KEY = 'video-pwa-ios-hint';

export function isStandaloneDisplay({ displayMode = 'browser', iosStandalone = false } = {}) {
  return displayMode === 'standalone' || displayMode === 'fullscreen' || iosStandalone === true;
}

export function isIosDevice(userAgent, { maxTouchPoints = 0, platform = '' } = {}) {
  const ua = String(userAgent || '');
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return platform === 'MacIntel' && maxTouchPoints > 1;
}

export function resolveInstallSurface({
  standalone = false,
  ios = false,
  dismissed = false,
  hasPrompt = false,
  preview = '',
} = {}) {
  if (preview === 'android') return 'android';
  if (preview === 'ios' && !dismissed) return 'ios';
  if (preview === 'pembaruan') return 'hidden';
  if (standalone) return 'hidden';
  if (hasPrompt) return 'android';
  if (ios && !dismissed) return 'ios';
  return 'hidden';
}

export function shouldOfferUpdate({ updateReady = false, preview = '' } = {}) {
  return updateReady === true || preview === 'pembaruan';
}
