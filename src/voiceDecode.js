const MAX_PLAYBACK_SECONDS = 180;

export function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function mixChannels(audio) {
  const length = audio.length;
  const samples = new Float32Array(length);
  const channels = audio.numberOfChannels;
  const data = [];
  for (let channel = 0; channel < channels; channel += 1) data.push(audio.getChannelData(channel));
  for (let index = 0; index < length; index += 1) {
    let sum = 0;
    for (const channel of data) sum += channel[index] || 0;
    samples[index] = sum / channels;
  }
  return { samples, sampleRate: audio.sampleRate };
}

export async function decodeArrayBuffer(buffer) {
  const ctx = new AudioContext();
  try {
    await ctx.resume();
    const audio = await ctx.decodeAudioData(buffer.slice(0));
    return mixChannels(audio);
  } finally {
    await ctx.close();
  }
}

function mediaElement(file) {
  const type = file.type || '';
  const media = type.startsWith('audio/') ? document.createElement('audio') : document.createElement('video');
  media.preload = 'auto';
  media.playsInline = true;
  media.muted = true;
  media.src = URL.createObjectURL(file);
  return media;
}

export async function decodeByPlayback(file, onProgress, isCancelled) {
  const media = mediaElement(file);
  try {
    await new Promise((resolve, reject) => {
      media.onloadedmetadata = resolve;
      media.onerror = () => reject(new Error('File tidak bisa dibaca di browser ini.'));
    });
    const duration = media.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('Durasi file tidak terbaca.');
    }
    if (duration > MAX_PLAYBACK_SECONDS) {
      throw new Error('File lebih dari 3 menit. Pilih klip yang lebih pendek, atau unggah potongan dari HP.');
    }
    const stream = media.captureStream?.() || media.mozCaptureStream?.();
    if (!stream || typeof MediaRecorder === 'undefined') {
      throw new Error('Browser tidak bisa mengambil audio dari file ini.');
    }
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size) chunks.push(event.data);
    };
    const stopped = new Promise((resolve, reject) => {
      recorder.onstop = resolve;
      recorder.onerror = () => reject(new Error('Pengambilan audio gagal.'));
    });
    const ended = new Promise((resolve, reject) => {
      media.onended = resolve;
      media.ontimeupdate = () => {
        if (isCancelled?.()) {
          media.pause();
          resolve();
          return;
        }
        if (onProgress && duration) onProgress(Math.min(1, media.currentTime / duration));
      };
      media.onerror = () => reject(new Error('Pemutaran file gagal.'));
    });
    recorder.start(250);
    await media.play();
    await ended;
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;
    if (isCancelled?.()) throw new Error('Dibatalkan.');
    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
    if (!blob.size) throw new Error('Audio dari file kosong.');
    return decodeArrayBuffer(await blob.arrayBuffer());
  } finally {
    const url = media.src;
    media.pause();
    media.removeAttribute('src');
    media.load();
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
}

export async function decodeMediaFile(file, onProgress, isCancelled) {
  try {
    return await decodeArrayBuffer(await file.arrayBuffer());
  } catch (err) {
    if (isCancelled?.()) throw err;
    return decodeByPlayback(file, onProgress, isCancelled);
  }
}
