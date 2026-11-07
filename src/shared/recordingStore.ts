// A finished recording waits here until the user saves or discards it in the Library.
// IndexedDB is shared by every page of the extension, including the offscreen recorder.

const DB_NAME = 'pramana';
const STORE = 'recordings';
const PENDING_KEY = 'pending';

export interface PendingRecording {
  blob: Blob;
  fileName: string;
  createdAt: number;
  warning?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function savePendingRecording(recording: PendingRecording) {
  return run('readwrite', (store) => store.put(recording, PENDING_KEY));
}

export async function getPendingRecording(): Promise<PendingRecording | null> {
  return (await run<PendingRecording | undefined>('readonly', (store) => store.get(PENDING_KEY))) || null;
}

export function clearPendingRecording() {
  return run('readwrite', (store) => store.delete(PENDING_KEY));
}
