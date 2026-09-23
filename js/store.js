// =============================================================
// store.js — keeps a copy of all data in memory (fast to read)
// and writes every change to IndexedDB (safe on the phone).
// =============================================================

import * as db from './db.js';
import { SEED_EXERCISES, SEED_TEMPLATES, SEED_VIDEOS, seedWorkouts, DEFAULT_SETTINGS } from './seed.js';

// The in-memory copy. Screens read from here.
export const S = {
  exercises: [],
  templates: [],
  workouts: [],
  videos: [],
  meta: {}, // { settings, active, lastBackupAt, installedAt, backupSnoozedUntil, seeded }
};

export async function loadAll() {
  for (const name of ['exercises', 'templates', 'workouts', 'videos']) {
    S[name] = await db.getAll(name);
  }
  const metaRows = await db.getAll('meta');
  S.meta = Object.fromEntries(metaRows.map((r) => [r.key, r.value]));

  if (!S.meta.seeded) {
    await seed();
    return loadAll();
  }
  S.meta.settings = { ...DEFAULT_SETTINGS, ...(S.meta.settings || {}) };
}

async function seed() {
  const now = new Date().toISOString();
  await db.replaceAll({
    exercises: SEED_EXERCISES,
    templates: SEED_TEMPLATES,
    workouts: seedWorkouts(),
    videos: SEED_VIDEOS,
    meta: [
      { key: 'seeded', value: true },
      { key: 'installedAt', value: now },
      { key: 'settings', value: DEFAULT_SETTINGS },
    ],
  });
}

// ---------- generic save / delete ----------

/** Insert or update an object in a store (and in memory). */
export async function save(store, obj) {
  const list = S[store];
  const i = list.findIndex((x) => x.id === obj.id);
  if (i >= 0) list[i] = obj; else list.push(obj);
  await db.put(store, obj);
  return obj;
}

export async function remove(store, id) {
  S[store] = S[store].filter((x) => x.id !== id);
  await db.del(store, id);
}

export async function setMeta(key, value) {
  S.meta[key] = value;
  await db.put('meta', { key, value });
}

// ---------- lookups ----------

export const exById = (id) => S.exercises.find((e) => e.id === id);
export const tplById = (id) => S.templates.find((t) => t.id === id);
export const workoutById = (id) => S.workouts.find((w) => w.id === id);
export const exercisesById = () => Object.fromEntries(S.exercises.map((e) => [e.id, e]));
export const settings = () => S.meta.settings;

// ---------- backup ----------

export function exportData() {
  const meta = Object.entries(S.meta)
    .filter(([k]) => k !== 'active') // don't include a half-finished session
    .map(([key, value]) => ({ key, value }));
  return {
    app: 'gymtracker',
    format: 1,
    exportedAt: new Date().toISOString(),
    data: {
      exercises: S.exercises,
      templates: S.templates,
      workouts: S.workouts,
      videos: S.videos,
      meta,
    },
  };
}

/** Replace ALL data with a backup file's content. Throws if the file looks wrong. */
export async function importData(json) {
  if (!json || json.app !== 'gymtracker' || !json.data) throw new Error('This is not a Gym Tracker backup file.');
  const d = json.data;
  for (const k of ['exercises', 'templates', 'workouts', 'videos']) {
    if (!Array.isArray(d[k])) throw new Error(`Backup is missing "${k}".`);
  }
  const meta = (d.meta || []).filter((m) => m.key !== 'active');
  if (!meta.some((m) => m.key === 'seeded')) meta.push({ key: 'seeded', value: true });
  await db.replaceAll({ ...d, meta });
  await loadAll();
}
