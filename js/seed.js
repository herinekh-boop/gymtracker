// =============================================================
// seed.js — the starting data loaded the very first time the app
// opens: your exercises, sessions, abs videos and past workouts.
// After that, everything is edited inside the app (this file is
// not used again, so editing it later won't change your data).
//
// Notation: "8x4" = 8 reps × 4 sets. targetReps: null = "max reps".
// step = how much to add/remove when progressing (1 kg dumbbells,
// 2.5 kg machines).
// =============================================================

const ex = (id, name, type, o = {}) => ({
  id, name, type,
  targetSets: o.sets ?? (type === 'timed' || type === 'video' ? 1 : 4),
  targetReps: o.reps ?? null,
  targetTime: o.time ?? null, // seconds, timed challenges only
  step: o.step ?? (type === 'bodyweight' || type === 'video' ? null : 2.5),
  defaultKg: o.kg ?? null,
  note: o.note ?? '',
});

export const SEED_EXERCISES = [
  // Push
  ex('dips', 'Dips assistés', 'assisted', { reps: 6, kg: 18, step: 2.5 }),
  ex('pompes-max', 'Pompes max', 'bodyweight', { sets: 3, note: 'Max reps per set' }),
  ex('ext-triceps', 'Extension triceps poulie', 'weighted', { kg: 18, step: 2.5 }),
  ex('dev-couche', 'Développé couché alterné haltères', 'weighted', { reps: 8, kg: 4, step: 1 }),
  // Pull
  ex('tractions', 'Tractions supination assistées', 'assisted', { reps: 6, kg: 28, step: 2.5 }),
  ex('tirage-neutre', 'Tirage neutre', 'weighted', { reps: 8, kg: 15, step: 2.5 }),
  ex('bucheron', 'Tirage bûcheron', 'weighted', { kg: 6, step: 1 }),
  ex('curl', 'Curl biceps', 'weighted', { kg: 5, step: 1 }),
  ex('lat', 'Lat machine (tirage vertical)', 'weighted', { kg: 20, step: 2.5 }),
  // Jambes
  ex('squats', 'Squats', 'weighted', { reps: 8, kg: 4, step: 1 }),
  ex('sauts', 'Petits sauts (jump squats)', 'bodyweight', { reps: 10 }),
  ex('fentes', 'Fentes bulgares', 'weighted', { reps: 8, step: 1 }),
  // Abdos + Épaules
  ex('abs-video', 'Abs video', 'video'),
  ex('dev-epaules', 'Développé épaules haltères assis', 'weighted', { reps: 8, kg: 4, step: 1, note: 'kg per hand' }),
  ex('elev-lat', 'Élévations latérales haltères', 'weighted', { reps: 8, kg: 4, step: 1, note: 'kg per hand' }),
  ex('crunch', 'Crunch machine', 'weighted', { reps: 8, kg: 10, step: 2.5 }),
  // Raptor Half Body Remix
  ex('pompes-inclinees', 'Pompes inclinées (chaise 45°)', 'bodyweight', { reps: 8 }),
  ex('burpees', 'Burpees', 'timed', { reps: 50, time: 15 * 60 }),
  ex('releves', 'Relevés de genoux chaise romaine', 'bodyweight', { reps: 8 }),
  // Alternatives to Burpees in Raptor
  ex('tv-large', 'Tirage vertical prise large pronation', 'weighted', { step: 2.5 }),
  ex('tv-serree', 'Tirage vertical prise serrée supination', 'weighted', { step: 2.5 }),
];

// item = one exercise inside a session.
//   original    = Vincent's exercise (small grey text)
//   optional    = shown with an "optional" tag
//   alternatives= suggested first when you tap "Swap"
const item = (exerciseId, o = {}) => ({
  exerciseId,
  original: o.original ?? '',
  optional: !!o.optional,
  note: o.note ?? '',
  alternatives: o.alternatives ?? [],
});

export const SEED_TEMPLATES = [
  { id: 'push', name: 'Push (Poussée)', order: 0, inRotation: true, note: '',
    items: [item('dips'), item('pompes-max'), item('ext-triceps'), item('dev-couche')] },
  { id: 'pull', name: 'Pull (Tirage)', order: 1, inRotation: true, note: '',
    items: [item('tractions'), item('tirage-neutre'), item('bucheron'), item('curl'), item('lat')] },
  { id: 'legs', name: 'Jambes', order: 2, inRotation: true, note: '',
    items: [item('squats'), item('sauts'), item('fentes')] },
  { id: 'abs', name: 'Abdos + Épaules', order: 3, inRotation: true, note: '',
    items: [item('abs-video'), item('dev-epaules'), item('elev-lat'), item('crunch')] },
  { id: 'raptor', name: 'Raptor Half Body Remix', order: 4, inRotation: false,
    note: "My version of Vincent's session",
    items: [
      item('pompes-inclinees', { original: 'Pompes serrées' }),
      item('burpees', { original: '25 Tractions pronation + 25 Tractions supination (timed)', alternatives: ['tv-large', 'tv-serree'] }),
      item('dips', { original: 'Dips' }),
      item('dev-epaules', { original: 'Overhead Press barre à vide', note: '3–4 kg per hand' }),
      item('elev-lat', { original: 'Poulie épaule latérale' }),
      item('crunch', { original: 'Abdominal Crunch' }),
      item('releves', { original: 'L-Sit chaise romaine', optional: true }),
    ] },
];

export const SEED_VIDEOS = [
  { id: 'v-caroline', title: 'Caroline abs', url: 'https://youtu.be/3oeimlA6s68', order: 0 },
];

// ---------- past workouts ----------
const byId = Object.fromEntries(SEED_EXERCISES.map((e) => [e.id, e]));
const s = (kg, reps, time = null) => ({ kg, reps, time, done: true });
const times = (n, kg, reps) => Array.from({ length: n }, () => s(kg, reps));
const entry = (exerciseId, sets, note = '') => ({
  exerciseId, name: byId[exerciseId].name, type: byId[exerciseId].type,
  original: '', note, sets,
});
// month is 1–12 here; stored in local time, start only (duration unknown)
const at = (y, m, d, h) => new Date(y, m - 1, d, h, 0).toISOString();
const workout = (id, templateId, name, start, entries) => ({ id, templateId, name, start, end: null, note: '', imported: true, entries });

export function seedWorkouts() {
  return [
    workout('h1', 'legs', 'Jambes', at(2026, 9, 15, 18), [
      entry('squats', [s(4, 8)]),
      entry('sauts', [s(null, 10)]),
      entry('fentes', times(4, null, 8)),
    ]),
    workout('h2', 'pull', 'Pull (Tirage)', at(2026, 9, 16, 18), [
      entry('tractions', times(4, 28, 6)),
      entry('lat', [s(15, null)]),
    ]),
    workout('h3', 'push', 'Push (Poussée)', at(2026, 9, 20, 18), [
      entry('dips', [s(23, null)]),
      entry('pompes-max', [s(null, 20), s(null, 6), s(null, 3)], '6 descendu mieux'),
      entry('ext-triceps', [s(18, null)]),
      entry('dev-couche', times(4, 4, 8)),
    ]),
    workout('h4', 'pull', 'Pull (Tirage)', at(2026, 9, 23, 18), [
      entry('tractions', times(4, 28, 6)),
      entry('tirage-neutre', times(4, 15, 8)),
      entry('bucheron', [s(6, null)]),
      entry('curl', [s(5, null)]),
      entry('lat', [s(20, null)]),
    ]),
    workout('h5', 'raptor', 'Raptor Half Body Remix', at(2026, 9, 23, 19), [
      entry('pompes-inclinees', times(4, null, 8)),
      entry('burpees', [s(null, 50, 15 * 60)]),
      entry('dips', times(4, 18, 6)),
      entry('dev-epaules', [s(3, 8), s(3, 8), s(4, 8), s(4, 8)]),
      entry('elev-lat', times(4, 4, 8)),
      entry('crunch', times(4, 10, 8)),
    ]),
  ];
}

export const DEFAULT_SETTINGS = {
  restSec: 90,      // rest between sets
  nextSec: 30,      // pause before the next exercise
  weeklyGoal: 4,    // sessions per week
  sound: true,      // beep when a timer ends
  wakeLock: true,   // keep the screen on during a session
};
