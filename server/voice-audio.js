// Helper WAV murni (tanpa Node atau DOM) supaya server dan browser memakai aturan yang sama.

export const TARGET_SAMPLE_RATE = 24000;
export const MIN_REFERENCE_SECONDS = 10;
export const MAX_REFERENCE_SECONDS = 30;
export const MIN_CONSENT_SECONDS = 2;
export const MAX_CONSENT_SECONDS = 25;
export const MIN_SAMPLE_RATE = 16000;
export const MAX_SAMPLE_RATE = 24000;

// Kalimat resmi Gemini untuk locale id-ID. Harus dibaca apa adanya.
export const CONSENT_STATEMENT_ID = 'Saya pemilik suara ini dan saya menyetujui Google menggunakan suara ini untuk membuat model suara sintetis.';

const PCM_FORMAT = 1;

function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

function readAscii(view, offset, length) {
  let text = '';
  for (let index = 0; index < length; index += 1) {
    text += String.fromCharCode(view.getUint8(offset + index));
  }
  return text;
}

function asUint8(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  throw new Error('Buffer audio tidak valid.');
}

export function encodeWavPcm16(samples, sampleRate) {
  const rate = Math.round(sampleRate);
  if (!Number.isFinite(rate) || rate < 8000 || rate > 96000) {
    throw new Error('Sample rate WAV tidak valid.');
  }
  const pcm = samples instanceof Int16Array ? samples : floatToPcm16(samples);
  const dataSize = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, PCM_FORMAT, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let index = 0; index < pcm.length; index += 1) {
    view.setInt16(offset, pcm[index], true);
    offset += 2;
  }
  return new Uint8Array(buffer);
}

export function floatToPcm16(samples) {
  const out = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Number(samples[index]) || 0;
    const clamped = Math.max(-1, Math.min(1, value));
    out[index] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }
  return out;
}

export function parseWavPcm(input) {
  const bytes = asUint8(input);
  if (bytes.length < 44) throw new Error('File WAV terlalu pendek.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WAVE') {
    throw new Error('File bukan WAV.');
  }

  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataStart = -1;
  let dataSize = 0;
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const id = readAscii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + size > bytes.length) break;
    if (id === 'fmt ' && size >= 16) {
      audioFormat = view.getUint16(start, true);
      channels = view.getUint16(start + 2, true);
      sampleRate = view.getUint32(start + 4, true);
      bitsPerSample = view.getUint16(start + 14, true);
    } else if (id === 'data') {
      dataStart = start;
      dataSize = size;
    }
    offset = start + size + (size % 2);
  }

  if (audioFormat !== PCM_FORMAT) throw new Error('WAV harus PCM 16-bit, bukan format terkompresi.');
  if (channels < 1 || channels > 2) throw new Error('WAV harus mono atau stereo.');
  if (bitsPerSample !== 16) throw new Error('WAV harus 16-bit.');
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 96000) {
    throw new Error('Sample rate WAV tidak valid.');
  }
  if (dataStart < 0) throw new Error('Chunk data WAV tidak ada.');

  const frameBytes = channels * 2;
  const frameCount = Math.floor(dataSize / frameBytes);
  const mono = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = view.getInt16(dataStart + frame * frameBytes + channel * 2, true);
      sum += sample / 32768;
    }
    mono[frame] = sum / channels;
  }

  return {
    audioFormat,
    channels,
    sampleRate,
    bitsPerSample,
    samples: mono,
    frameCount,
    duration: frameCount / sampleRate,
  };
}

export function trimSamples(samples, sampleRate, startSec, endSec) {
  const rate = Number(sampleRate);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Sample rate tidak valid.');
  const start = Math.max(0, Math.floor(Number(startSec) * rate));
  const end = Math.min(samples.length, Math.ceil(Number(endSec) * rate));
  if (end <= start) return new Float32Array(0);
  return samples.subarray(start, end);
}

export function resampleLinear(samples, fromRate, toRate) {
  const sourceRate = Number(fromRate);
  const targetRate = Number(toRate);
  if (!Number.isFinite(sourceRate) || !Number.isFinite(targetRate) || sourceRate <= 0 || targetRate <= 0) {
    throw new Error('Sample rate tidak valid.');
  }
  if (samples.length === 0) return new Float32Array(0);
  if (sourceRate === targetRate) return samples instanceof Float32Array ? samples : Float32Array.from(samples);
  const outLength = Math.max(1, Math.round(samples.length * targetRate / sourceRate));
  const out = new Float32Array(outLength);
  const scale = sourceRate / targetRate;
  const last = samples.length - 1;
  for (let index = 0; index < outLength; index += 1) {
    const position = index * scale;
    const left = Math.min(last, Math.floor(position));
    const right = Math.min(last, left + 1);
    const fraction = position - left;
    const a = samples[left] || 0;
    const b = samples[right] || 0;
    out[index] = a + (b - a) * fraction;
  }
  return out;
}

export function renderTrimmedWav(samples, sampleRate, startSec, endSec, targetRate = TARGET_SAMPLE_RATE) {
  const sliced = trimSamples(samples, sampleRate, startSec, endSec);
  const resampled = resampleLinear(sliced, sampleRate, targetRate);
  return encodeWavPcm16(resampled, targetRate);
}

export function waveformPeaks(samples, bucketCount) {
  const buckets = Math.max(1, Math.round(bucketCount) || 1);
  const peaks = new Array(buckets).fill(0);
  if (!samples.length) return peaks;
  const size = samples.length / buckets;
  for (let index = 0; index < buckets; index += 1) {
    const start = Math.floor(index * size);
    const end = Math.max(start + 1, Math.floor((index + 1) * size));
    let max = 0;
    for (let cursor = start; cursor < end && cursor < samples.length; cursor += 1) {
      const value = Math.abs(samples[cursor] || 0);
      if (value > max) max = value;
    }
    peaks[index] = Math.max(0, Math.min(1, max));
  }
  return peaks;
}

export function initialSelection(duration, minSeconds = MIN_REFERENCE_SECONDS) {
  const seconds = Number(duration);
  const minimum = Number(minSeconds) || MIN_REFERENCE_SECONDS;
  if (!Number.isFinite(seconds) || seconds < minimum) return null;
  const length = Math.min(20, seconds, MAX_REFERENCE_SECONDS);
  return { start: 0, end: length };
}

export function moveSelection(duration, nextStart, nextEnd, minSeconds = MIN_REFERENCE_SECONDS) {
  const seconds = Number(duration);
  const minimum = Number(minSeconds) || MIN_REFERENCE_SECONDS;
  if (!Number.isFinite(seconds) || seconds < minimum) return null;
  let start = Number(nextStart);
  let end = Number(nextEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  let length = end - start;
  const maxLength = Math.min(MAX_REFERENCE_SECONDS, seconds);
  if (length < minimum) length = Math.min(minimum, maxLength);
  if (length > maxLength) length = maxLength;
  if (start < 0) start = 0;
  if (start + length > seconds) start = Math.max(0, seconds - length);
  return { start, end: start + length };
}

export function referenceDurationError(duration) {
  const seconds = Number(duration);
  if (!Number.isFinite(seconds)) return 'Durasi referensi tidak terbaca.';
  if (seconds < MIN_REFERENCE_SECONDS - 0.05) return 'Referensi harus 10–30 detik.';
  if (seconds > MAX_REFERENCE_SECONDS + 0.2) return 'Referensi harus 10–30 detik.';
  return '';
}

export function describeWavUpload(input, kind) {
  const parsed = parseWavPcm(input);
  if (parsed.channels !== 1) throw new Error('WAV unggahan harus mono.');
  if (parsed.sampleRate < MIN_SAMPLE_RATE || parsed.sampleRate > MAX_SAMPLE_RATE) {
    throw new Error('WAV harus 16–24 kHz.');
  }
  const ranges = {
    consent: [MIN_CONSENT_SECONDS, MAX_CONSENT_SECONDS, 'Rekaman izin harus singkat, sekitar beberapa detik sampai 25 detik.'],
    inworld: [3, MAX_REFERENCE_SECONDS, 'Referensi Inworld harus 3–30 detik.'],
    fish: [MIN_REFERENCE_SECONDS, MAX_REFERENCE_SECONDS, 'Referensi harus 10–30 detik.'],
  };
  const [min, max, rangeMessage] = ranges[kind] || ranges.fish;
  if (parsed.duration < min - 0.05 || parsed.duration > max + 0.2) {
    throw new Error(rangeMessage);
  }
  return parsed;
}
