const DB_NAME = 'promoops-editor-voice';
const STORE = 'hasil';
const DB_VERSION = 1;
const MAX_RESULTS = 24;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB gagal.'));
  });
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB gagal dibuka.'));
  });
}

export async function listVoiceResults() {
  const db = await openDb();
  try {
    const rows = await requestToPromise(db.transaction(STORE, 'readonly').objectStore(STORE).getAll());
    return (Array.isArray(rows) ? rows : [])
      .filter((row) => row && row.id && row.wav)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  } finally {
    db.close();
  }
}

export async function deleteVoiceResult(id) {
  const key = typeof id === 'string' ? id.trim() : '';
  if (!key) throw new Error('Hasil tidak valid.');
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB gagal menghapus.'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB dibatalkan.'));
    });
  } finally {
    db.close();
  }
}

export async function saveVoiceResult(item) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.put(item);
      const listed = store.getAll();
      listed.onsuccess = () => {
        const extra = (Array.isArray(listed.result) ? listed.result : [])
          .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
          .slice(MAX_RESULTS);
        for (const row of extra) store.delete(row.id);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB gagal menyimpan.'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB dibatalkan.'));
    });
  } finally {
    db.close();
  }
}
