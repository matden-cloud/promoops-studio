// Satu tempat untuk batas gratis. Jangan menduplikasi tanggal atau model berbayar.

export const FISH_FREE_MODEL = 's2.1-pro-free';
export const FISH_FREE_ENDS_AT = '2026-12-01T00:00:00+07:00';
export const FISH_ENDED_MESSAGE = 'Masa gratis Fish Audio sudah berakhir (30 Nov 2026)';
export const FISH_FREE_UNTIL_LABEL = '30 Nov 2026';

export const INWORLD_TTS_MODEL = 'inworld-tts-2-flash';
export const INWORLD_FREE_SECONDS = 70 * 60;
export const INWORLD_STOP_SECONDS = 65 * 60;
export const INWORLD_WARN_REMAINING_SECONDS = 10 * 60;
export const INWORLD_STOP_MESSAGE = 'Batas gratis Inworld di browser ini sudah tercapai (65 menit). Permintaan dihentikan supaya tidak masuk kuota berbayar.';

const DAY_MS = 24 * 60 * 60 * 1000;

export function fishFreeEndsMs() {
  return Date.parse(FISH_FREE_ENDS_AT);
}

export function fishFreeStatus(nowMs = Date.now()) {
  const now = Number(nowMs);
  const endsAt = fishFreeEndsMs();
  const expired = Number.isFinite(now) && Number.isFinite(endsAt) && now >= endsAt;
  const remainingMs = expired ? 0 : Math.max(0, endsAt - now);
  const daysLeft = expired ? 0 : Math.max(1, Math.ceil(remainingMs / DAY_MS));
  return {
    expired,
    endsAt: FISH_FREE_ENDS_AT,
    daysLeft,
    warn: !expired && daysLeft <= 3,
    label: expired
      ? FISH_ENDED_MESSAGE
      : `Gratis sampai ${FISH_FREE_UNTIL_LABEL} · sisa ${daysLeft} hari`,
  };
}

export function inworldUsageState(usedSeconds) {
  const used = Math.max(0, Number(usedSeconds) || 0);
  const remaining = Math.max(0, INWORLD_STOP_SECONDS - used);
  const stopped = used >= INWORLD_STOP_SECONDS;
  const warn = !stopped && remaining <= INWORLD_WARN_REMAINING_SECONDS;
  const remainingMinutes = stopped ? 0 : Math.max(1, Math.ceil(remaining / 60));
  return { used, remaining, remainingMinutes, stopped, warn };
}

export function addInworldUsage(usedSeconds, moreSeconds) {
  const more = Math.max(0, Number(moreSeconds) || 0);
  return inworldUsageState((Number(usedSeconds) || 0) + more);
}

export function redactSecrets(value, apiKey) {
  if (typeof value !== 'string' || value === '') return '';
  if (typeof apiKey !== 'string' || apiKey === '') return value;
  let out = value.split(apiKey).join('[redacted]');
  const encoded = encodeURIComponent(apiKey);
  if (encoded && encoded !== apiKey) out = out.split(encoded).join('[redacted]');
  return out;
}
