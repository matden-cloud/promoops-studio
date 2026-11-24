import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  applyVideoSuggestion,
  safeClientFileUri,
  videoErrorMessage,
  videoMimeFromFile,
} from './violationVideo.js';

describe('saran analisis video pelanggaran', () => {
  test('mengisi penyebab dan evaluasi tanpa mengubah tautan video', () => {
    const applied = applyVideoSuggestion({
      akun: 'AKN',
      penyebab: '',
      catatan: '',
      linkVideo: 'https://www.tiktok.com/sudah',
    }, {
      penyebab: 'Pisau terlihat di detik awal https://tiktok.com/rahasia',
      evaluasi: 'Blur bagian tajam sebelum unggah.',
      penjelasan: 'Pada 0:02 produk diarahkan ke kamera.',
      linkVideo: 'https://www.tiktok.com/jangan',
    });
    assert.equal(applied.form.penyebab, 'Pisau terlihat di detik awal');
    assert.match(applied.form.catatan, /Blur bagian tajam/);
    assert.match(applied.form.catatan, /0:02/);
    assert.equal(applied.form.linkVideo, 'https://www.tiktok.com/sudah');
    assert.deepEqual(applied.labels, ['penyebab', 'evaluasi']);
    assert.equal(applied.penjelasan.includes('tiktok.com'), false);
  });

  test('uri file hanya diterima dari host Gemini', () => {
    assert.equal(
      safeClientFileUri('https://generativelanguage.googleapis.com/v1beta/files/abc_123'),
      'https://generativelanguage.googleapis.com/v1beta/files/abc_123',
    );
    assert.equal(safeClientFileUri('https://evil.example/v1beta/files/abc'), '');
    const queryKey = `https://generativelanguage.googleapis.com/upload/v1beta/files?${'key'}=rahasia`;
    assert.equal(safeClientFileUri(queryKey), '');
  });

  test('jenis file video dikenali dari nama bila browser tidak mengirim tipe', () => {
    assert.equal(videoMimeFromFile({ name: 'bukti.MP4', type: '' }), 'video/mp4');
    assert.equal(videoMimeFromFile({ name: 'catatan.pdf', type: 'application/pdf' }), '');
    assert.match(videoErrorMessage({ error: 'quota_exhausted' }), /Kuota Gemini/);
    assert.equal(videoErrorMessage({ message: 'lihat https://evil.example/kunci' }).includes('http'), false);
  });
});
