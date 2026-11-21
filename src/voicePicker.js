export const GEMINI_VOICE_LABEL = 'Pilih suara Gemini';

export function partitionProfiles(voices) {
  const created = [];
  const prebuilt = [];
  for (const voice of voices || []) {
    if (!voice) continue;
    if (voice.kind === 'prebuilt') prebuilt.push(voice);
    else created.push(voice);
  }
  return { created, prebuilt };
}

export function filterVoices(voices, query) {
  const list = Array.isArray(voices) ? voices : [];
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return list;
  return list.filter((voice) => String(voice?.name || '').toLowerCase().includes(needle));
}

export function voiceSample(voice) {
  const sampleWav = typeof voice?.sampleWav === 'string' ? voice.sampleWav.trim() : '';
  if (!sampleWav) return null;
  const mimeType = typeof voice?.mimeType === 'string' && voice.mimeType.trim() ? voice.mimeType.trim() : 'audio/wav';
  return { sampleWav, mimeType };
}
