import {
  appendSyncDetails,
  changelogForRun,
  readSyncChangelog,
  statsForRequest,
  writeSyncChangelog,
} from './syncChangelog.js';

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function defaultRequest(url, options) {
  return fetch(url, options);
}

export function createSyncRun({
  request = defaultRequest,
  readLog = () => readSyncChangelog(localStorage),
  writeLog = (log) => writeSyncChangelog(localStorage, log),
  now = () => new Date().toISOString(),
  targets = [],
} = {}) {
  let running = null;
  let report = null;
  let error = '';
  let resume = null;
  let changelog = readLog() || null;
  let needsLogin = false;
  const listeners = new Set();

  function snapshot() {
    return { running, report, error, resume, changelog, needsLogin };
  }

  function emit() {
    const next = snapshot();
    for (const listener of listeners) listener(next);
  }

  function commitLog(next) {
    changelog = next;
    writeLog(next);
    emit();
  }

  async function start(targetId, { onSynced } = {}) {
    if (running) return false;
    running = targetId;
    error = '';
    const continued = resume?.target === targetId;
    const target = targets.find((item) => item.id === targetId);
    let log = changelogForRun(changelog, {
      continued,
      targetId,
      targetLabel: target?.label || targetId,
      startedAt: now(),
    });
    commitLog(log);
    let cursor = continued ? resume.cursor : null;
    let stats = continued ? statsForRequest(resume.stats) : null;
    let lastSerial = '';
    let guard = 0;
    let finished = false;
    try {
      while (guard < 500) {
        guard += 1;
        const response = await request('/api/onedrive-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: targetId, cursor, stats }),
        });
        const result = await readJson(response);
        if (!result) throw new Error('Server tidak membalas dengan JSON.');
        if (!response.ok || result.status === 'error') {
          if (result.needsLogin) needsLogin = true;
          if (response.status === 400) cursor = null;
          throw new Error(result.message || 'Sinkron OneDrive gagal.');
        }
        log = appendSyncDetails(log, result.stats);
        report = result;
        stats = statsForRequest(result.stats);
        if (result.done) {
          finished = true;
          resume = null;
          commitLog(log);
          if (onSynced) await onSynced();
          break;
        }
        const serial = JSON.stringify(result.cursor);
        if (!result.cursor || serial === lastSerial) {
          throw new Error('Sinkron berhenti sebelum selesai. Jalankan lagi; file yang sudah masuk tidak diulang.');
        }
        lastSerial = serial;
        cursor = result.cursor;
        resume = { target: targetId, cursor, stats };
        commitLog(log);
      }
      if (!finished && guard >= 500) {
        throw new Error('Sinkron belum selesai. Klik lanjutkan untuk meneruskan.');
      }
    } catch (err) {
      if (!finished && cursor) resume = { target: targetId, cursor, stats };
      else if (!finished) resume = null;
      error = err.message || 'Sinkron OneDrive gagal.';
      emit();
    } finally {
      running = null;
      emit();
    }
    return true;
  }

  function dismiss() {
    if (running) return false;
    changelog = null;
    writeLog(null);
    emit();
    return true;
  }

  return {
    snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start,
    dismiss,
  };
}
