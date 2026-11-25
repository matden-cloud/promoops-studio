const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;

function isTableLine(line) {
  const text = String(line || '').trim();
  return text.startsWith('|') && text.endsWith('|') && text.includes('|');
}

function isSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(String(line || '').trim());
}

function splitRow(line) {
  return String(line || '')
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

export function inlineMarkdown(text) {
  const source = String(text ?? '');
  const parts = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match = pattern.exec(source);
  while (match) {
    if (match.index > last) parts.push({ text: source.slice(last, match.index), bold: false });
    parts.push({ text: match[1], bold: true });
    last = match.index + match[0].length;
    match = pattern.exec(source);
  }
  if (last < source.length) parts.push({ text: source.slice(last), bold: false });
  if (!parts.length) parts.push({ text: '', bold: false });
  return parts;
}

export function parseAiMarkdown(source) {
  const lines = String(source ?? '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!String(line).trim()) {
      index += 1;
      continue;
    }
    if (isTableLine(line)) {
      const rows = [];
      while (index < lines.length && isTableLine(lines[index])) {
        if (!isSeparator(lines[index])) rows.push(splitRow(lines[index]));
        index += 1;
      }
      if (rows.length) blocks.push({ type: 'table', rows });
      continue;
    }
    if (BULLET.test(line)) {
      const items = [];
      while (index < lines.length && BULLET.test(lines[index])) {
        items.push(String(lines[index]).replace(BULLET, '').trim());
        index += 1;
      }
      blocks.push({ type: 'list', items });
      continue;
    }
    if (String(line).trim().startsWith('>')) {
      const notes = [];
      while (index < lines.length && String(lines[index]).trim().startsWith('>')) {
        notes.push(String(lines[index]).trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'note', text: notes.join(' ') });
      continue;
    }
    const heading = String(line).trim().match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: 'heading', text: heading[2] });
      index += 1;
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (
      index < lines.length
      && String(lines[index]).trim()
      && !isTableLine(lines[index])
      && !BULLET.test(lines[index])
      && !String(lines[index]).trim().startsWith('>')
      && !/^#{1,3}\s+/.test(String(lines[index]).trim())
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
  }
  return blocks;
}
