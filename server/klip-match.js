function safeHttpUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    if (url.username || url.password) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function pageKey(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    const path = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.protocol}//${url.host.toLowerCase()}${path}`;
  } catch {
    return '';
  }
}

export function findKlipByFileId(klipVideos, fileId) {
  const id = String(fileId ?? '').trim();
  if (!id || !Array.isArray(klipVideos)) return null;
  for (const klip of klipVideos) {
    if (String(klip?.fileId ?? '').trim() === id) return klip;
  }
  return null;
}

export function originalFileUrl(klip) {
  if (!klip || typeof klip !== 'object') return '';
  const linkHp = klip.linkHp ?? klip.Link_HP ?? klip.link_hp;
  return safeHttpUrl(typeof linkHp === 'string' ? linkHp : '') || safeHttpUrl(klip.url) || '';
}

export function findPublishForFypRow(row, publishVideos) {
  const list = Array.isArray(publishVideos) ? publishVideos : [];
  const klipId = String(row?.Id_Klip ?? '').trim();
  if (klipId) {
    const byId = list.find((item) => String(item?.klipId ?? '').trim() === klipId);
    if (byId) return byId;
  }
  const page = pageKey(row?.Link_Postingan);
  if (!page) return null;
  return list.find((item) => pageKey(item?.url) === page) || null;
}

export function klipIdForFypRow(row, publishVideos) {
  const publish = findPublishForFypRow(row, publishVideos);
  const fromPublish = String(publish?.klipId ?? '').trim();
  if (fromPublish) return fromPublish;
  return String(row?.Id_Klip ?? '').trim();
}

export function originalUrlForPublish(publish, klipVideos) {
  return originalFileUrl(findKlipByFileId(klipVideos, publish?.klipId));
}

export function originalUrlForFypRow(row, publishVideos, klipVideos) {
  return originalFileUrl(findKlipByFileId(klipVideos, klipIdForFypRow(row, publishVideos)));
}
