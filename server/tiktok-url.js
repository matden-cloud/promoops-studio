// Pemutar yang dipakai iframe resmi oEmbed TikTok:
// https://www.tiktok.com/player/v1/<id>
// Halaman itu tidak mengirim X-Frame-Options, jadi bisa ditanam di dashboard.
// embed/v2 hanya kartu pratinjau, bukan pemutar yang sama.

const VIDEO_ID = /^\d{8,24}$/;

export const ALLOWED_TIKTOK_HOSTS = new Set([
  'tiktok.com',
  'www.tiktok.com',
  'm.tiktok.com',
  'vt.tiktok.com',
  'vm.tiktok.com',
]);

const SHORT_HOSTS = new Set(['vt.tiktok.com', 'vm.tiktok.com']);

function videoIdFromPath(pathname) {
  const patterns = [
    /\/video\/(\d{8,24})(?!\d)/,
    /\/player\/v1\/(\d{8,24})(?!\d)/,
    /\/embed\/v2\/(\d{8,24})(?!\d)/,
  ];
  for (const pattern of patterns) {
    const match = pathname.match(pattern);
    if (match) return match[1];
  }
  return '';
}

export function inspectTikTokUrl(input) {
  if (typeof input !== 'string') return { ok: false, reason: 'invalid' };
  const raw = input.trim();
  if (!raw || raw.length > 4096) return { ok: false, reason: 'invalid' };
  if (raw.includes('\\')) return { ok: false, reason: 'invalid' };

  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  if (url.username || url.password) return { ok: false, reason: 'invalid' };
  if (url.protocol !== 'https:') return { ok: false, reason: 'invalid' };
  if (url.port && url.port !== '443') return { ok: false, reason: 'invalid' };

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!ALLOWED_TIKTOK_HOSTS.has(host)) return { ok: false, reason: 'host' };

  let videoId = videoIdFromPath(url.pathname);
  if (!videoId) {
    const shareId = url.searchParams.get('share_item_id') || '';
    if (VIDEO_ID.test(shareId)) videoId = shareId;
  }

  return {
    ok: true,
    href: url.toString(),
    host,
    pathname: url.pathname,
    videoId,
  };
}

export function buildTikTokEmbedUrl(videoId) {
  if (!VIDEO_ID.test(String(videoId || ''))) return '';
  const url = new URL(`https://www.tiktok.com/player/v1/${videoId}`);
  url.searchParams.set('music_info', '1');
  url.searchParams.set('description', '1');
  url.searchParams.set('autoplay', '1');
  url.searchParams.set('muted', '1');
  url.searchParams.set('controls', '1');
  url.searchParams.set('progress_bar', '1');
  url.searchParams.set('play_button', '1');
  url.searchParams.set('volume_control', '1');
  url.searchParams.set('fullscreen_button', '1');
  url.searchParams.set('rel', '0');
  return url.toString();
}

export function buildTikTokPageUrl(videoId) {
  if (!VIDEO_ID.test(String(videoId || ''))) return '';
  return `https://www.tiktok.com/@/video/${videoId}`;
}

export function canPlayTikTokUrl(input) {
  const inspected = inspectTikTokUrl(input);
  if (!inspected.ok) return false;
  if (inspected.videoId) return true;
  if (SHORT_HOSTS.has(inspected.host)) return inspected.pathname.length > 1;
  return /^\/t\/[^/]+/.test(inspected.pathname);
}

export function videoIdInText(text) {
  if (typeof text !== 'string' || text === '') return '';
  const match = text.match(/\/video\/(\d{8,24})(?!\d)/);
  return match ? match[1] : '';
}
