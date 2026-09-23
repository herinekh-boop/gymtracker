// =============================================================
// logic.js — pure "brain" functions (no screen code here).
// Everything here takes plain data and returns plain data, which
// makes it easy to test (see tests/logic.test.mjs).
//
// Data shapes (for reference):
//   exercise = { id, name, type, targetSets, targetReps, targetTime,
//                step, defaultKg, note }
//   type     = 'weighted' | 'assisted' | 'bodyweight' | 'timed' | 'video'
//   workout  = { id, templateId, name, start, end, note, entries: [entry] }
//   entry    = { exerciseId, name, type, original, note,
//                sets: [{ kg, reps, time, done }],
//                video: { videoId, title, done } }   // video type only
// =============================================================

export const TYPE_LABELS = {
  weighted: 'Weighted (kg + reps)',
  assisted: 'Assisted (kg of assistance — lower is better)',
  bodyweight: 'Bodyweight (reps only)',
  timed: 'Timed challenge (reps + time)',
  video: 'Video (done + note)',
};

// ---------- small helpers ----------

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 2.5 -> "2.5", 4 -> "4", 3.25 -> "3.25" */
export function fmtNum(n) {
  if (n === null || n === undefined || n === '') return '–';
  return String(Math.round(Number(n) * 100) / 100);
}

/** seconds -> "15:00" (or "1:02:03" if over an hour) */
export function fmtTime(sec) {
  if (sec === null || sec === undefined || isNaN(sec)) return '–';
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (x) => String(x).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "15:00" / "15" / "1:02:03" -> seconds (null if empty/invalid) */
export function parseTime(str) {
  if (str === null || str === undefined) return null;
  str = String(str).trim();
  if (!str) return null;
  const parts = str.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 1) return Math.round(parts[0] * 60); // plain number = minutes
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/** Minutes text for timer hints: 900 -> "15 min", 870 -> "14:30" */
export function fmtMinutes(sec) {
  return sec % 60 === 0 ? `${sec / 60} min` : fmtTime(sec);
}

export function fmtDate(iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(iso).toLocaleDateString('en-GB', opts);
}

/** Same calendar day (local time)? */
export function sameDay(a, b) {
  a = new Date(a); b = new Date(b);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "2026-09-23" in LOCAL time (for calendars) */
export function dayKey(d) {
  d = new Date(d);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- weeks & rotation ----------

/** Monday 00:00 (local time) of the week containing `date`. */
export function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const daysSinceMonday = (d.getDay() + 6) % 7; // Sunday=6, Monday=0
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
}

/** How many workouts started this week (Mon–Sun). Any session counts. */
export function countThisWeek(workouts, now = new Date()) {
  const from = startOfWeek(now).getTime();
  const to = from + 7 * 24 * 3600 * 1000;
  return workouts.filter((w) => {
    const t = new Date(w.start).getTime();
    return t >= from && t < to;
  }).length;
}

export function sortedTemplates(templates) {
  return [...templates].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * Next session in the rotation (Push → Pull → Jambes → Abdos + Épaules → …).
 * Looks at the most recent workout that belongs to the rotation and returns
 * the template after it. Sessions outside the rotation (e.g. Raptor) are ignored.
 */
export function nextRotationTemplate(templates, workouts) {
  const rotation = sortedTemplates(templates).filter((t) => t.inRotation);
  if (!rotation.length) return sortedTemplates(templates)[0] || null;
  const recent = [...workouts]
    .sort((a, b) => new Date(b.start) - new Date(a.start))
    .find((w) => rotation.some((t) => t.id === w.templateId));
  if (!recent) return rotation[0];
  const idx = rotation.findIndex((t) => t.id === recent.templateId);
  return rotation[(idx + 1) % rotation.length];
}

// ---------- exercise history ----------

export const doneSets = (entry) => (entry?.sets || []).filter((s) => s.done);

/** Did this entry actually get logged? */
export function entryHasData(entry) {
  if (!entry) return false;
  if (entry.type === 'video') return !!entry.video?.done;
  return doneSets(entry).length > 0;
}

/**
 * All logged entries of one exercise, newest first:
 *   [{ workout, entry }, …]
 * `excludeId` lets us skip the workout currently being logged.
 */
export function historyFor(exerciseId, workouts, excludeId = null) {
  const out = [];
  for (const w of workouts) {
    if (w.id === excludeId) continue;
    for (const e of w.entries || []) {
      if (e.exerciseId === exerciseId && entryHasData(e)) out.push({ workout: w, entry: e });
    }
  }
  return out.sort((a, b) => new Date(b.workout.start) - new Date(a.workout.start));
}

/**
 * Human text for the sets of an entry, e.g.
 *   weighted  : "15 kg, 8/8/8/7"      or  "3 kg, 8/8 · 4 kg, 8/8"
 *   assisted  : "18 kg assist., 6/6/6/6"
 *   bodyweight: "20/6/3 reps"
 *   timed     : "50 reps in 15:00"
 */
export function formatSets(entry, type = entry?.type) {
  if (!entry) return '—';
  if (type === 'video') {
    return entry.video?.done ? `Done ✓${entry.video.title ? ' — ' + entry.video.title : ''}` : 'Not done';
  }
  const sets = doneSets(entry);
  if (!sets.length) return '—';
  const reps = (s) => (s.reps === null || s.reps === undefined ? '?' : fmtNum(s.reps));

  if (type === 'timed') {
    return sets.map((s) => `${reps(s)} reps in ${fmtTime(s.time)}`).join(' · ');
  }
  if (type === 'bodyweight') {
    return sets.map(reps).join('/') + ' reps';
  }
  // weighted / assisted: group consecutive sets with the same kg
  const groups = [];
  for (const s of sets) {
    const last = groups[groups.length - 1];
    if (last && last.kg === s.kg) last.sets.push(s);
    else groups.push({ kg: s.kg, sets: [s] });
  }
  const unit = type === 'assisted' ? ' kg assist.' : ' kg';
  return groups
    .map((g) => {
      const hasReps = g.sets.some((s) => s.reps !== null && s.reps !== undefined);
      const kg = g.kg === null || g.kg === undefined ? '' : fmtNum(g.kg) + unit;
      const r = hasReps ? g.sets.map(reps).join('/') : '';
      if (kg && r) return `${kg}, ${r}`;
      return kg || (r ? r + ' reps' : '—');
    })
    .join(' · ');
}

/**
 * Pre-fill today's sets from last time.
 * Number of sets = max(target sets, sets done last time).
 * Each set copies the same-numbered set from last time (or the last one).
 */
export function prefillSets(ex, lastEntry) {
  if (ex.type === 'video') return [];
  const last = doneSets(lastEntry);
  const count = ex.type === 'timed' ? Math.max(1, last.length) : Math.max(ex.targetSets || 1, last.length);
  const sets = [];
  for (let i = 0; i < count; i++) {
    const src = last[i] || last[last.length - 1] || null;
    sets.push({
      kg: ex.type === 'weighted' || ex.type === 'assisted' ? (src?.kg ?? ex.defaultKg ?? null) : null,
      reps: src?.reps ?? ex.targetReps ?? null,
      time: ex.type === 'timed' ? (src?.time ?? ex.targetTime ?? null) : null,
      done: false,
    });
  }
  return sets;
}

// ---------- progression hints ----------

/** Did this logged entry hit every target? */
export function entryHitTarget(entry, ex) {
  const sets = doneSets(entry);
  if (!sets.length) return false;
  if (ex.type === 'timed') {
    const need = ex.targetReps || 0;
    return sets.some((s) => (s.reps ?? 0) >= need && (!ex.targetTime || (s.time ?? Infinity) <= ex.targetTime));
  }
  if (!ex.targetReps) return false; // "max" exercises have no fixed target
  if (sets.length < (ex.targetSets || 1)) return false;
  return sets.every((s) => (s.reps ?? 0) >= ex.targetReps);
}

/**
 * A small suggestion, never an automatic change.
 * Shown when ALL target reps were hit on ALL sets in the last 2 sessions.
 */
export function progressionHint(ex, workouts, excludeId = null) {
  if (!ex || ex.type === 'video') return null;
  const recent = historyFor(ex.id, workouts, excludeId).slice(0, 2);
  if (recent.length < 2) return null;
  if (!recent.every((h) => entryHitTarget(h.entry, ex))) return null;
  const step = fmtNum(ex.step || (ex.type === 'assisted' ? 2.5 : 1));
  switch (ex.type) {
    case 'weighted': return `Try +${step} kg`;
    case 'assisted': return `Try −${step} kg assistance`;
    case 'bodyweight': return 'Try +1 rep';
    case 'timed': {
      const best = Math.min(...recent.flatMap((h) => doneSets(h.entry).map((s) => s.time ?? Infinity)));
      return isFinite(best) ? `Try to beat ${fmtMinutes(best)}` : null;
    }
  }
  return null;
}

// ---------- charts & records ----------

/**
 * One number per workout for the progress chart:
 *   weighted  → heaviest kg        (higher = better)
 *   assisted  → lowest assistance  (LOWER = better)
 *   bodyweight→ best set reps      (higher = better)
 *   timed     → fastest time (sec) (LOWER = better)
 */
export function chartMetric(entry, type) {
  const sets = doneSets(entry);
  const nums = (key) => sets.map((s) => s[key]).filter((v) => v !== null && v !== undefined && !isNaN(v));
  switch (type) {
    case 'weighted': { const k = nums('kg'); return k.length ? Math.max(...k) : null; }
    case 'assisted': { const k = nums('kg'); return k.length ? Math.min(...k) : null; }
    case 'bodyweight': { const r = nums('reps'); return r.length ? Math.max(...r) : null; }
    case 'timed': { const t = nums('time'); return t.length ? Math.min(...t) : null; }
  }
  return null;
}

export const LOWER_IS_BETTER = { assisted: true, timed: true };

export const CHART_LABEL = {
  weighted: 'Heaviest set (kg)',
  assisted: 'Assistance (kg) — lower is better',
  bodyweight: 'Best set (reps)',
  timed: 'Time — lower is better',
};

/**
 * Record candidates found in ONE entry. Each: { key, label, value, text, lower }
 * `lower: true` means a smaller value is the better one.
 */
export function entryRecords(entry, ex) {
  const type = ex.type;
  const sets = doneSets(entry);
  const out = [];
  const withKg = sets.filter((s) => s.kg !== null && s.kg !== undefined);
  const withReps = sets.filter((s) => s.reps !== null && s.reps !== undefined);

  if (type === 'weighted') {
    if (withKg.length) {
      const best = withKg.reduce((a, b) => (b.kg > a.kg || (b.kg === a.kg && (b.reps ?? 0) > (a.reps ?? 0)) ? b : a));
      out.push({ key: 'heaviest', label: 'Heaviest weight', value: best.kg, text: `${fmtNum(best.kg)} kg${best.reps ? ' × ' + best.reps : ''}` });
      const vol = withKg.reduce((sum, s) => sum + s.kg * (s.reps || 0), 0);
      if (vol > 0) out.push({ key: 'volume', label: 'Best session volume', value: vol, text: `${fmtNum(vol)} kg` });
    }
  }
  if (type === 'assisted') {
    // only count sets where you actually did reps (or reps weren't recorded)
    if (withKg.length) {
      const best = withKg.reduce((a, b) => (b.kg < a.kg ? b : a));
      out.push({ key: 'least', label: 'Least assistance', value: best.kg, text: `${fmtNum(best.kg)} kg assist.${best.reps ? ' × ' + best.reps : ''}`, lower: true });
    }
  }
  if (type === 'weighted' || type === 'assisted' || type === 'bodyweight') {
    if (withReps.length) {
      const best = Math.max(...withReps.map((s) => s.reps));
      out.push({ key: 'reps', label: 'Most reps in a set', value: best, text: `${best} reps` });
    }
  }
  if (type === 'bodyweight' && withReps.length) {
    const total = withReps.reduce((sum, s) => sum + s.reps, 0);
    out.push({ key: 'total', label: 'Most reps in a session', value: total, text: `${total} reps` });
  }
  if (type === 'timed') {
    const need = ex.targetReps || 0;
    const valid = sets.filter((s) => s.time && (s.reps ?? 0) >= need);
    if (valid.length) {
      const best = valid.reduce((a, b) => (b.time < a.time ? b : a));
      out.push({ key: 'fastest', label: need ? `Fastest (${need}+ reps)` : 'Fastest time', value: best.time, text: `${fmtTime(best.time)} (${best.reps} reps)`, lower: true });
    }
    if (withReps.length) {
      const best = Math.max(...withReps.map((s) => s.reps));
      out.push({ key: 'reps', label: 'Most reps', value: best, text: `${best} reps` });
    }
  }
  return out;
}

/** Best-ever records for an exercise: [{ …record, date }] */
export function personalRecords(ex, workouts) {
  const best = {};
  const hist = historyFor(ex.id, workouts).reverse(); // oldest first: ties keep the first date
  for (const { workout, entry } of hist) {
    for (const r of entryRecords(entry, ex)) {
      const cur = best[r.key];
      if (!cur || (r.lower ? r.value < cur.value : r.value > cur.value)) best[r.key] = { ...r, date: workout.start };
    }
  }
  return Object.values(best);
}

/**
 * New personal records set in `workout`, compared with everything BEFORE it.
 * First-ever time doing an exercise doesn't count as a record.
 */
export function newRecords(workout, exercisesById, workouts) {
  const before = workouts.filter((w) => w.id !== workout.id && new Date(w.start) < new Date(workout.start));
  const out = [];
  for (const entry of workout.entries || []) {
    const ex = exercisesById[entry.exerciseId] || { id: entry.exerciseId, type: entry.type, name: entry.name };
    if (ex.type === 'video' || !entryHasData(entry)) continue;
    const prev = personalRecords(ex, before);
    if (!prev.length) continue;
    for (const r of entryRecords(entry, ex)) {
      const p = prev.find((x) => x.key === r.key);
      if (p && (r.lower ? r.value < p.value : r.value > p.value)) {
        out.push({ exerciseId: ex.id, name: ex.name || entry.name, label: r.label, text: r.text, previous: p.text });
      }
    }
  }
  return out;
}

// ---------- abs videos ----------

/** { videoId: { count, last } } */
export function videoStats(videos, workouts) {
  const stats = {};
  for (const v of videos) stats[v.id] = { count: 0, last: null };
  for (const w of workouts) {
    for (const e of w.entries || []) {
      const id = e.video?.videoId;
      if (e.type === 'video' && e.video?.done && stats[id]) {
        stats[id].count++;
        if (!stats[id].last || new Date(w.start) > new Date(stats[id].last)) stats[id].last = w.start;
      }
    }
  }
  return stats;
}

/** The video not done for the longest time (never-done ones first, in list order). */
export function suggestVideo(videos, workouts) {
  if (!videos.length) return null;
  const stats = videoStats(videos, workouts);
  const sorted = [...videos].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  let pick = null;
  for (const v of sorted) {
    const last = stats[v.id].last ? new Date(stats[v.id].last).getTime() : -Infinity;
    if (!pick || last < pick.last) pick = { v, last };
  }
  return pick.v;
}

// ---------- backup reminder ----------

export const BACKUP_EVERY_DAYS = 14;

/** true if no backup in the last 14 days (counting from install if never). */
export function needsBackupReminder({ lastBackupAt, installedAt, snoozedUntil }, now = new Date()) {
  const t = now.getTime();
  if (snoozedUntil && t < new Date(snoozedUntil).getTime()) return false;
  const ref = lastBackupAt || installedAt;
  if (!ref) return false;
  return t - new Date(ref).getTime() > BACKUP_EVERY_DAYS * 24 * 3600 * 1000;
}
