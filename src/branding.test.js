import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { APP_MARK, APP_SUBTITLE, APP_TITLE } from './branding.js';

describe('merek Video', () => {
  test('lencana, judul, dan subtitle header', () => {
    assert.equal(APP_MARK, 'V');
    assert.equal(APP_TITLE, 'Video');
    assert.equal(APP_SUBTITLE, 'OneDrive • Produksi • Publisher');
  });

  test('judul tab browser, dan manifest bila ada', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.match(html, /<title>Video<\/title>/);
    const link = html.match(/rel="manifest"\s+href="([^"]+)"/);
    if (!link) return;
    const manifest = JSON.parse(readFileSync(new URL(`../public${link[1].startsWith('/') ? '' : '/'}${link[1]}`, import.meta.url), 'utf8'));
    assert.equal(manifest.name, 'Video');
    assert.equal(manifest.short_name, 'Video');
  });

  test('header desktop dan ponsel memakai merek baru', () => {
    const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');
    const mobile = readFileSync(new URL('./MobileShell.jsx', import.meta.url), 'utf8');
    assert.equal(app.includes('>RP<'), false);
    assert.equal(app.includes('PromoOps & Riset'), false);
    assert.match(app, /AppBrand/);
    assert.match(mobile, /AppBrand/);
  });
});
