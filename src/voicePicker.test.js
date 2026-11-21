import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { GEMINI_VOICE_LABEL, filterVoices, partitionProfiles, voiceSample } from './voicePicker.js';

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
  });
});
