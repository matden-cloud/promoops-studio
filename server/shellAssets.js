import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

function skipShellPath(relativePath) {
  return relativePath === 'sw.js'
    || relativePath.endsWith('.map')
    || relativePath === 'api'
    || relativePath.startsWith('api/');
}

export function listShellAssets(distDir) {
  const urls = [];
  const files = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      const relativePath = path.relative(distDir, full).split(path.sep).join('/');
      if (skipShellPath(relativePath)) continue;
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const url = `/${relativePath}`;
      urls.push(url);
      files.push({ url, bytes: readFileSync(full) });
    }
  };

  walk(distDir);
  urls.push('/');
  return { urls, files };
}

export function shellVersion(files, urls) {
  const hash = createHash('sha256');
  const ordered = [...files].sort((a, b) => a.url.localeCompare(b.url));
  for (const file of ordered) {
    hash.update(file.url);
    hash.update(file.bytes);
  }
  hash.update([...urls].sort().join('\n'));
  return hash.digest('hex').slice(0, 12);
}
