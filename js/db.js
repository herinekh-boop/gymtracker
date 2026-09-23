// =============================================================
// db.js — tiny wrapper around IndexedDB (the phone's local database).
// All data lives on the device. Nothing is sent anywhere.
//
// Stores (think "tables"):
//   exercises  – exercise library (name, type, targets…)
//   templates  – your sessions (Push, Pull, …) = ordered list of exercises
//   workouts   – finished workouts (your history)
//   videos     – abs video rotation list
//   meta       – settings, active (in-progress) workout, backup date…
// =============================================================

const DB_NAME = 'gymtracker';
const DB_VERSION = 1;
export const STORES = ['exercises', 'templates', 'workouts', 'videos', 'meta'];

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: name === 'meta' ? 'key' : 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// Run one request inside a transaction and resolve with its result.
async function run(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const getAll = (store) => run(store, 'readonly', (s) => s.getAll());
export const put = (store, obj) => run(store, 'readwrite', (s) => s.put(obj));
export const del = (store, id) => run(store, 'readwrite', (s) => s.delete(id));

// Replace the whole content of several stores in ONE transaction
// (used by seeding and backup import, so it's all-or-nothing).
export async function replaceAll(data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, 'readwrite');
    for (const name of STORES) {
      if (!data[name]) continue;
      const s = tx.objectStore(name);
      s.clear();
      for (const item of data[name]) s.put(item);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
