import { crc32, deflateSync } from 'node:zlib';
import { ICON_RGB } from './constants.js';

export const ICON_FG = Object.freeze([255, 255, 255, 255]);
export const ICON_SAMPLES = 3;

const NORMALIZED_V = Object.freeze([
  [0.07, 0.02],
  [0.34, 0.02],
  [0.5, 0.62],
  [0.66, 0.02],
  [0.93, 0.02],
  [0.58, 0.98],
  [0.42, 0.98],
]);

export const PWA_ICONS = Object.freeze([
  { file: 'icon-192.png', size: 192, paddingRatio: 0.2, purpose: 'any' },
  { file: 'icon-512.png', size: 512, paddingRatio: 0.2, purpose: 'any' },
  { file: 'icon-maskable-192.png', size: 192, paddingRatio: 0.28, purpose: 'maskable' },
  { file: 'icon-maskable-512.png', size: 512, paddingRatio: 0.28, purpose: 'maskable' },
  { file: 'apple-touch-icon.png', size: 180, paddingRatio: 0.2, purpose: 'apple' },
]);

function concat(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function chunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  const crc = new Uint8Array(4);
  new DataView(crc.buffer).setUint32(0, crc32(concat([typeBytes, data])) >>> 0);
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, data.length);
  return concat([length, typeBytes, data, crc]);
}

export function encodePng(width, height, rgba) {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const start = y * (stride + 1);
    raw[start] = 0;
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), start + 1);
  }
  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

export function glyphPolygon(size, paddingRatio) {
  const pad = size * paddingRatio;
  const side = size - pad * 2;
  return NORMALIZED_V.map(([nx, ny]) => [pad + nx * side, pad + ny * side]);
}

export function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];
    const crosses = (yi > y) !== (yj > y);
    if (!crosses) continue;
    const xAtY = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (x < xAtY) inside = !inside;
  }
  return inside;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

export function renderFaviconSvg({ size = 48, paddingRatio = 0.2 } = {}) {
  const d = glyphPolygon(size, paddingRatio)
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${round1(point[0])} ${round1(point[1])}`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="#047857"/><path fill="#fff" d="${d}Z"/></svg>\n`;
}

export function renderIconImage(size, paddingRatio, samples = ICON_SAMPLES) {
  const polygon = glyphPolygon(size, paddingRatio);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of polygon) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const rgba = new Uint8Array(size * size * 4);
  const n = samples * samples;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let fg = 0;
      if (x + 1 >= minX && x <= maxX && y + 1 >= minY && y <= maxY) {
        for (let sy = 0; sy < samples; sy += 1) {
          for (let sx = 0; sx < samples; sx += 1) {
            const px = x + (sx + 0.5) / samples;
            const py = y + (sy + 0.5) / samples;
            if (pointInPolygon(px, py, polygon)) fg += 1;
          }
        }
      }
      const offset = (y * size + x) * 4;
      const mix = fg / n;
      rgba[offset] = Math.round(ICON_RGB[0] + (ICON_FG[0] - ICON_RGB[0]) * mix);
      rgba[offset + 1] = Math.round(ICON_RGB[1] + (ICON_FG[1] - ICON_RGB[1]) * mix);
      rgba[offset + 2] = Math.round(ICON_RGB[2] + (ICON_FG[2] - ICON_RGB[2]) * mix);
      rgba[offset + 3] = 255;
    }
  }
  return rgba;
}

export function renderIconPng(size, paddingRatio, samples = ICON_SAMPLES) {
  return encodePng(size, size, renderIconImage(size, paddingRatio, samples));
}
