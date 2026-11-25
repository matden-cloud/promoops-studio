import { mkdirSync, writeFileSync } from 'node:fs';
import { PWA_ICONS, renderFaviconSvg, renderIconPng } from '../src/pwa/iconPng.js';

const publicDir = new URL('../public/', import.meta.url);
const iconDir = new URL('../public/icons/', import.meta.url);
mkdirSync(iconDir, { recursive: true });

for (const icon of PWA_ICONS) {
  writeFileSync(new URL(icon.file, iconDir), renderIconPng(icon.size, icon.paddingRatio));
}
writeFileSync(new URL('favicon.svg', publicDir), renderFaviconSvg());
