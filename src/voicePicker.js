export const GEMINI_VOICE_LABEL = 'Pilih suara Gemini';

export const GEMINI_GENDER_LABEL = Object.freeze({
  female: 'Perempuan',
  male: 'Laki-laki',
  neutral: 'Netral',
  unknown: 'Tidak diketahui',
});

// 30 suara bawaan inti Gemini TTS. Jenis kelamin mengikuti tabel resmi Google,
// sama di Cloud TTS dan Firebase AI Logic. Suara di luar tabel ini tidak ditebak.
// https://docs.cloud.google.com/text-to-speech/docs/gemini-tts
// https://firebase.google.com/docs/ai-logic/generate-speech
export const GEMINI_DOCUMENTED_GENDER = Object.freeze({
  achernar: 'female',
  achird: 'male',
  algenib: 'male',
  algieba: 'male',
  alnilam: 'male',
  aoede: 'female',
  autonoe: 'female',
  callirrhoe: 'female',
  charon: 'male',
  despina: 'female',
  enceladus: 'male',
  erinome: 'female',
  fenrir: 'male',
  gacrux: 'female',
  iapetus: 'male',
  kore: 'female',
  laomedeia: 'female',
  leda: 'female',
  orus: 'male',
  puck: 'male',
  pulcherrima: 'female',
  rasalgethi: 'male',
  sadachbia: 'male',
  sadaltager: 'male',
  schedar: 'male',
  sulafat: 'female',
  umbriel: 'male',
  vindemiatrix: 'female',
  zephyr: 'female',
  zubenelgenubi: 'male',
});

const API_GENDER = new Set(['female', 'male', 'neutral']);

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

export function geminiVoiceGender(voice) {
  const keys = [voice?.id, voice?.name].map((value) => String(value || '').trim().toLowerCase());
  for (const key of keys) {
    if (GEMINI_DOCUMENTED_GENDER[key]) return GEMINI_DOCUMENTED_GENDER[key];
  }
  const reported = String(voice?.gender || '').trim().toLowerCase();
  if (API_GENDER.has(reported)) return reported;
  return 'unknown';
}

export function geminiGenderLabel(voice) {
  return GEMINI_GENDER_LABEL[geminiVoiceGender(voice)] || GEMINI_GENDER_LABEL.unknown;
}

export function filterVoices(voices, query) {
  const list = Array.isArray(voices) ? voices : [];
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return list;
  return list.filter((voice) => {
    const name = String(voice?.name || '').toLowerCase();
    const gender = geminiGenderLabel(voice).toLowerCase();
    return name.includes(needle) || gender.includes(needle);
  });
}

export function voiceSample(voice) {
  const sampleWav = typeof voice?.sampleWav === 'string' ? voice.sampleWav.trim() : '';
  if (!sampleWav) return null;
  const mimeType = typeof voice?.mimeType === 'string' && voice.mimeType.trim() ? voice.mimeType.trim() : 'audio/wav';
  return { sampleWav, mimeType };
}
