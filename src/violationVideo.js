export const MAX_SERVER_VIDEO_BYTES = 2_500_000;
export const MAX_DIRECT_VIDEO_BYTES = 80 * 1024 * 1024;

const VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp']);

function cleanText(value, max) {
  return String(value ?? '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b(?:[a-z0-9-]+\.)?tiktok\.com\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function videoMimeFromFile(file) {
  const type = String(file?.type || '').toLowerCase().split(';')[0].trim();
  if (VIDEO_MIMES.has(type)) return type;
  const name = String(file?.name || '').toLowerCase();
  if (name.endsWith('.mp4') || name.endsWith('.m4v')) return 'video/mp4';
  if (name.endsWith('.webm')) return 'video/webm';
  if (name.endsWith('.mov')) return 'video/quicktime';
  if (name.endsWith('.3gp')) return 'video/3gpp';
  return '';
}

export function safeClientFileUri(value) {
  const text = String(value ?? '').trim();
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:') return '';
    if (url.hostname !== 'generativelanguage.googleapis.com') return '';
    if (url.username || url.password) return '';
    if (!/^\/v1beta\/files\/[A-Za-z0-9_-]+$/.test(url.pathname)) return '';
    return url.origin + url.pathname;
  } catch {
    return '';
  }
}

function evaluasiCatatan(fields) {
  const evaluasi = cleanText(fields?.evaluasi, 500);
  const penjelasan = cleanText(fields?.penjelasan, 500);
  const withTime = /\d{1,2}:\d{2}/.test(penjelasan) ? penjelasan : '';
  const merged = [evaluasi, withTime && withTime !== evaluasi ? withTime : ''].filter(Boolean).join(' ');
  return merged.slice(0, 500);
}

export function applyVideoSuggestion(form, fields) {
  const current = form && typeof form === 'object' ? form : {};
  const next = { ...current };
  const filled = {};
  const penyebab = cleanText(fields?.penyebab, 500);
  if (penyebab) {
    next.penyebab = penyebab;
    filled.penyebab = true;
  }
  const catatan = evaluasiCatatan(fields);
  if (catatan) {
    next.catatan = catatan;
    filled.catatan = true;
  }
  const labels = [];
  if (filled.penyebab) labels.push('penyebab');
  if (filled.catatan) labels.push('evaluasi');
  return {
    form: next,
    filled,
    labels,
    penjelasan: cleanText(fields?.penjelasan, 1200),
  };
}

export function videoErrorMessage(result) {
  const code = result?.error;
  if (code === 'missing_api_key') return 'Kunci Gemini belum siap. Isi penyebab secara manual.';
  if (code === 'quota_exhausted') return 'Kuota Gemini hari ini habis. Isi penyebab secara manual, atau coba lagi nanti.';
  if (code === 'video_too_large') return 'Video terlalu besar. Potong videonya (maksimal 80 MB), lalu unggah lagi.';
  if (code === 'invalid_video') return 'File ini bukan video yang bisa dibaca. Unggah MP4, WEBM, MOV, atau 3GP.';
  if (code === 'upload_rejected') return 'Video belum terkirim ke Gemini. Coba file yang lebih kecil (di bawah 2,5 MB), atau unggah ulang.';
  const message = typeof result?.message === 'string' ? result.message.trim() : '';
  if (message && !/https?:\/\//i.test(message) && !message.includes('API')) return message;
  return 'Video belum bisa dianalisis. Unggah file videonya, lalu coba lagi.';
}
