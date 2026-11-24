import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { deleteVoiceResult, listVoiceResults, saveVoiceResult } from './voiceStore.js';

function createMemoryIndexedDB() {
  const databases = new Map();

  function makeDb(meta) {
    return {
      objectStoreNames: {
        contains(name) {
          return meta.stores.has(name);
        },
      },
      createObjectStore(name) {
        if (!meta.stores.has(name)) meta.stores.set(name, new Map());
      },
      transaction(storeName) {
        const records = meta.stores.get(storeName);
        let pending = 0;
        let finished = false;
        const tx = {
          oncomplete: null,
          onerror: null,
          onabort: null,
          error: null,
          objectStore() {
            return {
              put(item) {
                return request(() => {
                  records.set(item.id, structuredClone(item));
                  return item.id;
                });
              },
              delete(id) {
                return request(() => {
                  records.delete(id);
                });
              },
              getAll() {
                return request(() => [...records.values()].map((row) => structuredClone(row)));
              },
            };
          },
        };
        function settle() {
          if (finished || pending > 0) return;
          finished = true;
          queueMicrotask(() => tx.oncomplete?.());
        }
        function request(run) {
          pending += 1;
          const req = { result: undefined, error: null, onsuccess: null, onerror: null };
          queueMicrotask(() => {
            try {
              req.result = run();
              pending -= 1;
              req.onsuccess?.();
              settle();
            } catch (error) {
              pending -= 1;
              req.error = error;
              tx.error = error;
              req.onerror?.();
              tx.onerror?.();
            }
          });
          return req;
        }
        queueMicrotask(settle);
        return tx;
      },
      close() {},
    };
  }

  return {
    open(name, version) {
      const req = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      queueMicrotask(() => {
        let meta = databases.get(name);
        if (!meta) {
          meta = { version: 0, stores: new Map() };
          databases.set(name, meta);
        }
        req.result = makeDb(meta);
        if (meta.version < version) {
          req.onupgradeneeded?.();
          meta.version = version;
        }
        req.onsuccess?.();
      });
      return req;
    },
  };
}

function result(id, createdAt) {
  return {
    id,
    title: `Naskah ${id}`,
    voiceId: 'Kore',
    voiceName: 'Kore',
    engine: 'gemini',
    createdAt,
    durationSec: 3,
    wav: new Uint8Array([1, 2, 3]).buffer,
  };
}

describe('penyimpanan hasil Editor Voice', () => {
  beforeEach(() => {
    globalThis.indexedDB = createMemoryIndexedDB();
  });

  afterEach(() => {
    delete globalThis.indexedDB;
  });

  test('hapus menghilangkan rekaman tersimpan dan membiarkan yang lain', async () => {
    await saveVoiceResult(result('audio-lama', '2026-11-01T00:00:00.000Z'));
    await saveVoiceResult(result('audio-baru', '2026-11-02T00:00:00.000Z'));
    assert.deepEqual((await listVoiceResults()).map((row) => row.id), ['audio-baru', 'audio-lama']);

    await deleteVoiceResult('audio-baru');
    const left = await listVoiceResults();
    assert.deepEqual(left.map((row) => row.id), ['audio-lama']);
    assert.equal(left[0].wav.byteLength, 3);

    await deleteVoiceResult('tidak-ada');
    assert.deepEqual((await listVoiceResults()).map((row) => row.id), ['audio-lama']);
  });

  test('id kosong ditolak tanpa menghapus data', async () => {
    await saveVoiceResult(result('audio-tetap', '2026-11-03T00:00:00.000Z'));
    await assert.rejects(() => deleteVoiceResult('   '), /tidak valid/);
    await assert.rejects(() => deleteVoiceResult(null), /tidak valid/);
    assert.deepEqual((await listVoiceResults()).map((row) => row.id), ['audio-tetap']);
  });
});
