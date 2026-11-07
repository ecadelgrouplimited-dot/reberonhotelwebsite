'use client';
/** Tiny IndexedDB layer. Same database and stores as public/sw.js — keep them in step. */

export interface OutboxItem {
  /** Also the Idempotency-Key the server uses to ignore repeats. */
  id: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  /** FormData uploads: [name, value, filename?] — files are stored as Blobs. */
  form?: [string, string | Blob, string?][];
  label: string;
  createdAt: number;
  attempts: number;
  status: 'pending' | 'syncing' | 'failed';
  error?: string;
  claimedAt?: number;
  failedAt?: number;
  userId?: string | null;
  userName?: string | null;
  route?: string;
}

let dbp: Promise<IDBDatabase> | null = null;
function db() {
  dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open('rb-offline', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => {
      dbp = null;
      reject(r.error);
    };
  });
  return dbp;
}

const p = <T,>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

export async function idbAll<T>(store: 'outbox' | 'meta'): Promise<T[]> {
  if (typeof indexedDB === 'undefined') return [];
  return p((await db()).transaction(store).objectStore(store).getAll() as IDBRequest<T[]>);
}
export async function idbPut(store: 'outbox' | 'meta', value: unknown) {
  return p((await db()).transaction(store, 'readwrite').objectStore(store).put(value));
}
export async function idbDelete(store: 'outbox' | 'meta', key: string) {
  return p((await db()).transaction(store, 'readwrite').objectStore(store).delete(key));
}
export async function idbClear(store: 'outbox' | 'meta') {
  return p((await db()).transaction(store, 'readwrite').objectStore(store).clear());
}
export async function metaGet<T>(key: string): Promise<T | null> {
  if (typeof indexedDB === 'undefined') return null;
  const row = await p((await db()).transaction('meta').objectStore('meta').get(key) as IDBRequest<{ value: T } | undefined>);
  return row ? row.value : null;
}
export const metaSet = (key: string, value: unknown) => idbPut('meta', { key, value });
