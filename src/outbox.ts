type Pending = { itemId: string; firstName: string; code: string; scannedAt: number; clientId: string };
const DB = 'bingo-ae2v';

async function store(mode: IDBTransactionMode) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('outbox', { keyPath: 'clientId' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return db.transaction('outbox', mode).objectStore('outbox');
}

export async function queuePending(item: Pending) {
  const target = await store('readwrite');
  await new Promise<void>((resolve, reject) => { const request = target.put(item); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
}

export async function listPending() {
  const target = await store('readonly');
  return new Promise<Pending[]>((resolve, reject) => { const request = target.getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}

export async function removePending(id: string) {
  const target = await store('readwrite');
  await new Promise<void>((resolve, reject) => { const request = target.delete(id); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
}
