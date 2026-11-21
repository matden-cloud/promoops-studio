import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  CONSENT_STATEMENT_ID,
  MAX_REFERENCE_SECONDS,
  MIN_REFERENCE_SECONDS,
  TARGET_SAMPLE_RATE,
  encodeWavPcm16,
  initialSelection,
  moveSelection,
  parseWavPcm,
  renderTrimmedWav,
  resampleLinear,
  trimSamples,
  waveformPeaks,
} from './voice-audio.js';

function tone(length, sampleRate, frequency = 440) {
  const samples = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    samples[index] = Math.sin((2 * Math.PI * frequency * index) / sampleRate) * 0.5;
  }
  return samples;
}

describe('WAV referensi suara', () => {
  test('kalimat izin id-ID mengikuti dokumentasi Gemini', () => {
    assert.equal(
      CONSENT_STATEMENT_ID,
      'Saya pemilik suara ini dan saya menyetujui Google menggunakan suara ini untuk membuat model suara sintetis.',
    );
  });

  test('encode dan parse menjaga mono 16-bit serta durasi', () => {
    const rate = 16000;
    const samples = tone(rate * 2, rate);
    const wav = encodeWavPcm16(samples, rate);
    const parsed = parseWavPcm(wav);
    assert.equal(parsed.channels, 1);
    assert.equal(parsed.bitsPerSample, 16);
    assert.equal(parsed.sampleRate, rate);
    assert.equal(parsed.frameCount, samples.length);
    assert.ok(Math.abs(parsed.duration - 2) < 0.001);
    assert.ok(Math.abs(parsed.samples[0] - samples[0]) < 0.001);
  });

  test('potongan dan resample menghasilkan WAV 24 kHz sesuai rentang', () => {
    const rate = 48000;
    const samples = tone(rate * 40, rate, 220);
    const start = 5;
    const end = 23;
    const sliced = trimSamples(samples, rate, start, end);
    assert.equal(sliced.length, rate * (end - start));
    const halved = resampleLinear(sliced, rate, TARGET_SAMPLE_RATE);
    assert.equal(halved.length, TARGET_SAMPLE_RATE * (end - start));

    const wav = renderTrimmedWav(samples, rate, start, end);
    const parsed = parseWavPcm(wav);
    assert.equal(parsed.sampleRate, TARGET_SAMPLE_RATE);
    assert.equal(parsed.channels, 1);
    assert.ok(Math.abs(parsed.duration - (end - start)) < 0.02);
    assert.ok(parsed.duration >= MIN_REFERENCE_SECONDS);
    assert.ok(parsed.duration <= MAX_REFERENCE_SECONDS);
  });

  test('pemilihan 10–30 detik menempel di dalam durasi', () => {
    assert.equal(initialSelection(8), null);
    assert.deepEqual(initialSelection(47), { start: 0, end: 20 });
    assert.deepEqual(initialSelection(12), { start: 0, end: 12 });

    const dragged = moveSelection(47, 40, 70);
    assert.ok(dragged);
    assert.ok(dragged.end - dragged.start <= 30);
    assert.ok(dragged.end - dragged.start >= 10);
    assert.ok(dragged.end <= 47);
    assert.ok(dragged.start >= 0);

    const short = moveSelection(47, 1, 3);
    assert.equal(short.end - short.start, 10);
  });

  test('puncak waveform tetap di rentang 0 sampai 1', () => {
    const samples = new Float32Array([0, 0.2, -0.8, 1.4, -0.1]);
    const peaks = waveformPeaks(samples, 5);
    assert.equal(peaks.length, 5);
    assert.ok(peaks.every((peak) => peak >= 0 && peak <= 1));
    assert.equal(peaks[3], 1);
  });
});
