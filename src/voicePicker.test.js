import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import {
  GEMINI_DOCUMENTED_GENDER,
  GEMINI_VOICE_LABEL,
  filterVoices,
  geminiGenderLabel,
  geminiVoiceGender,
  partitionProfiles,
  voiceSample,
} from './voicePicker.js';

const DOCUMENTED_FEMALE = ['Achernar', 'Aoede', 'Autonoe', 'Callirrhoe', 'Despina', 'Erinome', 'Gacrux', 'Kore', 'Laomedeia', 'Leda', 'Pulcherrima', 'Sulafat', 'Vindemiatrix', 'Zephyr'];
const DOCUMENTED_MALE = ['Achird', 'Algenib', 'Algieba', 'Alnilam', 'Charon', 'Enceladus', 'Fenrir', 'Iapetus', 'Orus', 'Puck', 'Rasalgethi', 'Sadachbia', 'Sadaltager', 'Schedar', 'Umbriel', 'Zubenelgenubi'];

const voices = [
  { id: 'voice_desain99', name: 'Narator hangat', kind: 'designed' },
  { id: 'Achernar', name: 'Achernar', kind: 'prebuilt' },
  { id: 'Achird', name: 'Achird', kind: 'prebuilt' },
  { id: 'fish_klon', name: 'Klon Fish', kind: 'clone' },
  { id: 'inworld_klon', name: 'Klon Inworld', kind: 'clone' },
  { id: 'commercial', name: 'Commercial Voiceover', kind: 'prebuilt' },
  { id: 'assistant', name: 'Digital Assistant', kind: 'prebuilt' },
];

describe('pemilih suara Gemini', () => {
  test('profil buatan tetap kartu, suara bawaan masuk dropdown', () => {
    const parts = partitionProfiles(voices);
    assert.deepEqual(parts.created.map((voice) => voice.id), ['voice_desain99', 'fish_klon', 'inworld_klon']);
    assert.deepEqual(parts.prebuilt.map((voice) => voice.id), ['Achernar', 'Achird', 'commercial', 'assistant']);
    assert.equal(GEMINI_VOICE_LABEL, 'Pilih suara Gemini');
  });

  test('pencarian menyaring nama tanpa membedakan huruf', () => {
    const prebuilt = partitionProfiles(voices).prebuilt;
    assert.deepEqual(filterVoices(prebuilt, '  aCh ').map((voice) => voice.id), ['Achernar', 'Achird']);
    assert.deepEqual(filterVoices(prebuilt, 'voiceover').map((voice) => voice.name), ['Commercial Voiceover']);
    assert.deepEqual(filterVoices(prebuilt, 'digital').map((voice) => voice.name), ['Digital Assistant']);
    assert.equal(filterVoices(prebuilt, '').length, 4);
    assert.deepEqual(filterVoices(prebuilt, 'tidak-ada'), []);
  });

  test('jenis kelamin 30 suara inti mengikuti tabel Google, sisanya tidak ditebak', () => {
    assert.equal(DOCUMENTED_FEMALE.length + DOCUMENTED_MALE.length, 30);
    assert.equal(Object.keys(GEMINI_DOCUMENTED_GENDER).length, 30);
    for (const name of DOCUMENTED_FEMALE) {
      assert.equal(geminiVoiceGender({ id: name, name, kind: 'prebuilt', engine: 'gemini' }), 'female', name);
      assert.equal(geminiGenderLabel({ id: name.toLowerCase(), name }), 'Perempuan', name);
    }
    for (const name of DOCUMENTED_MALE) {
      assert.equal(geminiVoiceGender({ id: name, name }), 'male', name);
      assert.equal(geminiGenderLabel({ id: name, name }), 'Laki-laki', name);
    }
    assert.equal(geminiVoiceGender({ id: 'Kore', name: 'Kore', gender: 'male' }), 'female');
    assert.equal(geminiVoiceGender({ id: 'en-US-Studio', name: 'Bright Narrator', gender: 'Female', kind: 'prebuilt' }), 'female');
    assert.equal(geminiGenderLabel({ id: 'en-US-Studio', name: 'Calm', gender: 'neutral' }), 'Netral');
    assert.equal(geminiVoiceGender({ id: 'en-US-Studio', name: 'Mystery' }), 'unknown');
    assert.equal(geminiVoiceGender({ id: 'en-US-Studio', name: 'Mystery', gender: 'robot' }), 'unknown');
    assert.equal(geminiGenderLabel({ id: 'voice_desain99', name: 'Narator hangat', kind: 'designed' }), 'Tidak diketahui');
  });

  test('pencarian bisa memakai label jenis kelamin', () => {
    const prebuilt = [
      { id: 'Kore', name: 'Kore', kind: 'prebuilt', engine: 'gemini' },
      { id: 'Puck', name: 'Puck', kind: 'prebuilt', engine: 'gemini' },
      { id: 'library-1', name: 'Narator berita', kind: 'prebuilt', engine: 'gemini', gender: 'neutral' },
      { id: 'library-2', name: 'Tanpa data', kind: 'prebuilt', engine: 'gemini' },
    ];
    assert.deepEqual(filterVoices(prebuilt, 'perempuan').map((voice) => voice.id), ['Kore']);
    assert.deepEqual(filterVoices(prebuilt, 'laki').map((voice) => voice.id), ['Puck']);
    assert.deepEqual(filterVoices(prebuilt, 'netral').map((voice) => voice.id), ['library-1']);
    assert.deepEqual(filterVoices(prebuilt, 'tidak diketahui').map((voice) => voice.id), ['library-2']);
  });

  test('sampel hanya dipakai bila sudah ada di data suara', () => {
    assert.equal(voiceSample({ id: 'Achernar', name: 'Achernar', kind: 'prebuilt' }), null);
    assert.equal(voiceSample({ sampleWav: '   ' }), null);
    assert.deepEqual(voiceSample({ sampleWav: ' UklGRg== ' }), { sampleWav: 'UklGRg==', mimeType: 'audio/wav' });
    assert.deepEqual(voiceSample({ sampleWav: 'UklGRg==', mimeType: ' audio/mpeg ' }), { sampleWav: 'UklGRg==', mimeType: 'audio/mpeg' });
  });

  test('panel tidak merender suara bawaan sebagai kartu', () => {
    const source = readFileSync(new URL('./EditorVoicePanel.jsx', import.meta.url), 'utf8');
    assert.match(source, /GEMINI_VOICE_LABEL/);
    assert.match(source, /partitionProfiles/);
    assert.match(source, /createdVoices\.map/);
    assert.match(source, /voiceSample/);
    assert.match(source, /GenderBadge/);
    assert.match(source, /min-h-48/);
    assert.match(source, /lg:min-h-80/);
    assert.match(source, /deleteVoiceResult/);
    assert.match(source, /Hapus audio ini\?/);
    assert.match(source, /type="range"/);
    assert.match(source, /shortClock\(elapsed\)\} \/ \{shortClock\(total\)\}/);
  });
});
