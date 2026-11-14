import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  findKlipByFileId,
  findPublishForFypRow,
  klipIdForFypRow,
  originalFileUrl,
  originalUrlForFypRow,
  originalUrlForPublish,
} from './klip-match.js';

const FILE_ID = '5A278D0C5E50242F!sa41210e3b56340668705da817774f7aa';
const OTHER_ID = '5A278D0C5E50242F!sbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const LINK_HP = 'https://1drv.ms/v/c/demo-hp';
const ONEDRIVE = 'https://onedrive.live.com/edit.aspx?id=demo';
const TIKTOK = 'https://vt.tiktok.com/ZSxFKGMS6/';
const OTHER_TIKTOK = 'https://www.tiktok.com/@toko/video/7637126793828437269';

const klipVideos = [
  {
    id: 'k-other',
    fileId: OTHER_ID,
    url: 'https://onedrive.live.com/other',
    linkHp: 'https://1drv.ms/v/c/other',
  },
  {
    id: 'k-match',
    fileId: `  ${FILE_ID}  `,
    url: ONEDRIVE,
    linkHp: LINK_HP,
  },
];

const publishVideos = [
  { id: 'p-other', klipId: OTHER_ID, url: OTHER_TIKTOK },
  { id: 'p-match', klipId: FILE_ID, url: TIKTOK },
];

describe('pencocokan klipId ke file Video Final', () => {
  test('publish.klipId yang sama dengan klip.fileId mengembalikan file itu', () => {
    const klip = findKlipByFileId(klipVideos, FILE_ID);
    assert.equal(klip.id, 'k-match');
    assert.equal(originalUrlForPublish({ klipId: FILE_ID }, klipVideos), new URL(LINK_HP).href);
  });

  test('klipId dengan spasi tetap cocok, dan id berbeda tidak cocok', () => {
    assert.equal(findKlipByFileId(klipVideos, ` ${FILE_ID} `).id, 'k-match');
    assert.equal(findKlipByFileId(klipVideos, 'bukan-id'), null);
    assert.equal(findKlipByFileId(klipVideos, ''), null);
    assert.equal(findKlipByFileId(null, FILE_ID), null);
    assert.equal(originalUrlForPublish({ klipId: 'tidak-ada' }, klipVideos), '');
    assert.equal(originalUrlForPublish({}, klipVideos), '');
    assert.equal(originalUrlForPublish(null, klipVideos), '');
  });

  test('linkHp dipakai lebih dulu, url OneDrive jadi cadangan, URL tidak aman ditolak', () => {
    assert.equal(originalFileUrl({ linkHp: '', url: ONEDRIVE }), new URL(ONEDRIVE).href);
    assert.equal(originalFileUrl({ linkHp: '   ', url: ONEDRIVE }), new URL(ONEDRIVE).href);
    assert.equal(originalFileUrl({ Link_HP: LINK_HP, url: ONEDRIVE }), new URL(LINK_HP).href);
    assert.equal(
      originalFileUrl({ linkHp: 'javascript:alert(1)', url: ONEDRIVE }),
      new URL(ONEDRIVE).href,
    );
    assert.equal(
      originalFileUrl({ linkHp: 'https://user:secret@1drv.ms/v/c/x', url: ONEDRIVE }),
      new URL(ONEDRIVE).href,
    );
    assert.equal(originalFileUrl({ linkHp: '', url: '' }), '');
    assert.equal(originalFileUrl(null), '');
  });
});

describe('baris Laporan FYP ke publish.klipId', () => {
  test('Id_Klip dicocokkan ke publish.klipId, lalu ke file Video Final', () => {
    const row = { Id_Klip: FILE_ID, Link_Postingan: OTHER_TIKTOK };
    assert.equal(findPublishForFypRow(row, publishVideos).id, 'p-match');
    assert.equal(klipIdForFypRow(row, publishVideos), FILE_ID);
    assert.equal(originalUrlForFypRow(row, publishVideos, klipVideos), new URL(LINK_HP).href);
  });

  test('bila Id_Klip kosong, tautan postingan mencocokkan publish.url', () => {
    const row = { Id_Klip: '', Link_Postingan: `${OTHER_TIKTOK}?is_from_webapp=1` };
    assert.equal(findPublishForFypRow(row, publishVideos).id, 'p-other');
    assert.equal(klipIdForFypRow(row, publishVideos), OTHER_ID);
    assert.equal(
      originalUrlForFypRow(row, publishVideos, klipVideos),
      'https://1drv.ms/v/c/other',
    );
  });

  test('tanpa baris publish, Id_Klip tetap dipakai sebagai fileId Video Final', () => {
    const row = { Id_Klip: FILE_ID, Link_Postingan: 'https://vt.tiktok.com/tidak-ada/' };
    assert.equal(findPublishForFypRow(row, []), null);
    assert.equal(klipIdForFypRow(row, []), FILE_ID);
    assert.equal(originalUrlForFypRow(row, [], klipVideos), new URL(LINK_HP).href);
  });

  test('tanpa pasangan publish maupun klip, tidak ada tautan file asli', () => {
    const row = { Id_Klip: 'hilang', Link_Postingan: 'https://vt.tiktok.com/hilang/' };
    assert.equal(findPublishForFypRow(row, publishVideos), null);
    assert.equal(originalUrlForFypRow(row, publishVideos, klipVideos), '');
    assert.equal(originalUrlForFypRow(null, publishVideos, klipVideos), '');
  });
});
