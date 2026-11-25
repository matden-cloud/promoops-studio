import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderServiceWorker } from './renderServiceWorker.js';
import { listShellAssets, shellVersion } from './shellAssets.js';

export function videoPwaPlugin() {
  let outDir = '';
  return {
    name: 'video-pwa',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const { urls, files } = listShellAssets(outDir);
      const source = renderServiceWorker({
        urls,
        version: shellVersion(files, urls),
      });
      writeFileSync(path.join(outDir, 'sw.js'), source);
    },
  };
}
