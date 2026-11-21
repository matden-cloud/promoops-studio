import { addInworldUsage, inworldUsageState } from '../server/voice-free.js';

const KEY = 'promoops-inworld-tts-seconds';

export function readInworldUsed() {
  try {
    const value = Number(localStorage.getItem(KEY) || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function readInworldUsage() {
  return inworldUsageState(readInworldUsed());
}

export function rememberInworldAudio(seconds) {
  const next = addInworldUsage(readInworldUsed(), seconds);
  try {
    localStorage.setItem(KEY, String(next.used));
  } catch {
    // Penghitung tetap berlaku di memori lewat nilai yang dikembalikan.
  }
  return next;
}
