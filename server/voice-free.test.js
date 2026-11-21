import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  FISH_ENDED_MESSAGE,
  FISH_FREE_ENDS_AT,
  FISH_FREE_MODEL,
  INWORLD_STOP_SECONDS,
  INWORLD_TTS_MODEL,
  addInworldUsage,
  fishFreeStatus,
  inworldUsageState,
} from './voice-free.js';

const CUTOFF = Date.parse(FISH_FREE_ENDS_AT);

describe('batas gratis mesin suara', () => {
  test('model gratis terkunci di satu konstanta', () => {
    assert.equal(FISH_FREE_MODEL, 's2.1-pro-free');
    assert.equal(INWORLD_TTS_MODEL, 'inworld-tts-2-flash');
    assert.equal(FISH_FREE_ENDS_AT, '2026-12-01T00:00:00+07:00');
  });

  test('Fish masih gratis sebelum batas WIB dan mati tepat di 1 Des 2026 00.00', () => {
    const justBefore = Date.parse('2026-11-30T16:59:59.000Z');
    assert.equal(justBefore, CUTOFF - 1000);
    const before = fishFreeStatus(justBefore);
    assert.equal(before.expired, false);
    assert.equal(before.label.includes('sisa'), true);

    const exact = fishFreeStatus(CUTOFF);
    assert.equal(exact.expired, true);
    assert.equal(exact.daysLeft, 0);
    assert.equal(exact.label, FISH_ENDED_MESSAGE);
    assert.equal(Date.parse('2026-11-30T17:00:00.000Z'), CUTOFF);
    assert.equal(fishFreeStatus(Date.parse('2026-11-30T17:00:00.000Z')).expired, true);

    const after = fishFreeStatus(Date.parse('2026-12-01T00:00:01+07:00'));
    assert.equal(after.expired, true);
  });

  test('peringatan Fish muncul saat sisa 3 hari atau kurang', () => {
    const threeDays = fishFreeStatus(CUTOFF - (3 * 24 * 60 * 60 * 1000));
    assert.equal(threeDays.expired, false);
    assert.equal(threeDays.daysLeft, 3);
    assert.equal(threeDays.warn, true);
    const fourDays = fishFreeStatus(CUTOFF - (4 * 24 * 60 * 60 * 1000));
    assert.equal(fourDays.daysLeft, 4);
    assert.equal(fourDays.warn, false);
  });

  test('penghitung Inworld berhenti di 65 menit dan memperingatkan sisa 10 menit', () => {
    const fresh = inworldUsageState(0);
    assert.equal(fresh.stopped, false);
    assert.equal(fresh.warn, false);
    assert.equal(fresh.remainingMinutes, 65);

    const near = addInworldUsage(54 * 60, 60);
    assert.equal(near.used, 55 * 60);
    assert.equal(near.remaining, 10 * 60);
    assert.equal(near.warn, true);
    assert.equal(near.stopped, false);
    assert.equal(near.remainingMinutes, 10);

    const almost = addInworldUsage(INWORLD_STOP_SECONDS - 30, 20);
    assert.equal(almost.stopped, false);
    assert.equal(almost.warn, true);

    const stopped = addInworldUsage(64 * 60, 60);
    assert.equal(stopped.used, INWORLD_STOP_SECONDS);
    assert.equal(stopped.stopped, true);
    assert.equal(stopped.remainingMinutes, 0);
    assert.equal(inworldUsageState(INWORLD_STOP_SECONDS + 5).stopped, true);
  });
});
