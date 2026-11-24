const JAKARTA = 'Asia/Jakarta';

function pad(value) {
  return String(value).padStart(2, '0');
}

function validYmd(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 2016 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function fromParts(year, month, day) {
  if (!validYmd(year, month, day)) return '';
  return `${pad(day)}/${pad(month)}/${year}`;
}

function jakartaParts(ms) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: JAKARTA,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(new Date(ms));
  const read = (type) => Number(parts.find((part) => part.type === type)?.value);
  return fromParts(read('year'), read('month'), read('day'));
}

export function formatViolationDate(value) {
  if (value == null) return '';
  const text = String(value).trim();
  if (!text || text === '-') return '';

  const slash = text.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (slash) return fromParts(Number(slash[3]), Number(slash[2]), Number(slash[1]));

  const isoDay = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDay) return fromParts(Number(isoDay[1]), Number(isoDay[2]), Number(isoDay[3]));

  const zoned = text.match(/^(\d{4}-\d{2}-\d{2})[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/);
  if (zoned) {
    const ms = Date.parse(text.includes(' ') ? text.replace(' ', 'T') : text);
    if (!Number.isFinite(ms)) return '';
    return jakartaParts(ms);
  }

  const floating = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T]\d{2}:\d{2}/);
  if (floating) return fromParts(Number(floating[1]), Number(floating[2]), Number(floating[3]));

  return '';
}

export function violationDateToIso(value) {
  const shown = formatViolationDate(value);
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(shown);
  if (!match) return '';
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function violationJenisPills(jenis) {
  const raw = Array.isArray(jenis) ? jenis.join('\n') : String(jenis ?? '');
  const parts = raw
    .split(/\s*(?:\n+|\s\|\s|;\s)\s*/g)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const unique = [];
  for (const part of parts) {
    const label = part.slice(0, 160);
    if (!unique.includes(label)) unique.push(label);
  }
  return unique;
}

export function violationTextCanExpand(text) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!value || value === '-' || value.toLowerCase() === 'null') return false;
  return value.length > 90;
}

export function violationPenyebab(record) {
  const source = record && typeof record === 'object' ? record : {};
  const raw = source.penyebab ?? source.Penyebab ?? source.cause ?? '';
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text || text === '-' || text.toLowerCase() === 'null') return '';
  return text.slice(0, 500);
}
