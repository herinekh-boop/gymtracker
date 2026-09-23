// =============================================================
// Session screen: logging sets during a workout.
//
// The in-progress workout lives in S.meta.active and is saved to
// the phone after EVERY change, so closing the app never loses it.
// =============================================================

import { S, save, setMeta, exById, tplById, settings, exercisesById, workoutById } from '../store.js';
import {
  uid, historyFor, prefillSets, progressionHint, formatSets, fmtDate, fmtNum, fmtTime, fmtMinutes,
  parseTime, suggestVideo, videoStats, entryHasData, newRecords,
} from '../logic.js';
import { esc, stepperHTML, toast, confirmDialog, choiceDialog, modal, $ } from '../ui.js';
import { startTimer, renderTimer, unlockAudio } from '../timer.js';
import { editExerciseModal } from './manage.js';
import { go } from '../app.js';

const A = () => S.meta.active; // shortcut: the active workout
const persist = () => setMeta('active', S.meta.active);

// ---------- creating a workout ----------

/** Build one exercise "entry" for today, prefilled from last time. */
export function makeEntry(exerciseId, item = {}) {
  const ex = exById(exerciseId);
  if (!ex) return null;
  const last = historyFor(ex.id, S.workouts)[0]?.entry;
  const e = {
    uid: uid(),
    exerciseId: ex.id,
    name: ex.name,
    type: ex.type,
    original: item.original || '',
    optional: !!item.optional,
    itemNote: item.note || '',
    alternatives: item.alternatives || [],
    note: '',
    sets: prefillSets(ex, last),
    open: true,
  };
  if (ex.type === 'video') {
    const v = suggestVideo(S.videos, S.workouts);
    e.video = { videoId: v?.id || null, title: v?.title || '', done: false };
  }
  return e;
}

export async function startWorkout(templateId) {
  const tpl = tplById(templateId);
  if (!tpl) return;
  const active = {
    id: uid(),
    templateId: tpl.id,
    name: tpl.name,
    start: new Date().toISOString(),
    note: '',
    entries: tpl.items
      .map((it, idx) => { const e = makeEntry(it.exerciseId, it); if (e) e.itemIndex = idx; return e; })
      .filter(Boolean),
    timer: null,
  };
  await setMeta('active', active);
}

// ---------- screen keep-awake ----------
let wakeLock = null;
async function requestWakeLock() {
  if (!settings().wakeLock || !('wakeLock' in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (e) { wakeLock = null; }
}
export function releaseWakeLock() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && location.hash.startsWith('#/session') && A()) requestWakeLock();
});

// ---------- rendering ----------

function targetText(ex) {
  if (!ex) return '';
  if (ex.type === 'video') return '';
  if (ex.type === 'timed') {
    const parts = [];
    if (ex.targetReps) parts.push(`${ex.targetReps} reps`);
    if (ex.targetTime) parts.push(`in ${fmtMinutes(ex.targetTime)}`);
    return parts.length ? 'Target: ' + parts.join(' ') : '';
  }
  if (ex.targetReps) return `Target: ${ex.targetSets || 1} × ${ex.targetReps}`;
  if (ex.type === 'bodyweight') return `Target: ${ex.targetSets || 1} × max reps`;
  return `Target: ${ex.targetSets || 1} sets`;
}

const isComplete = (e) => (e.type === 'video' ? !!e.video?.done : e.sets.length > 0 && e.sets.every((s) => s.done));

function setRowHTML(e, ex, i, j) {
  const s = e.sets[j];
  const at = `data-e="${i}" data-s="${j}"`;
  const controls = [];
  if (e.type === 'weighted' || e.type === 'assisted') {
    controls.push(stepperHTML({ field: 'kg', value: s.kg === null ? null : fmtNum(s.kg), label: e.type === 'assisted' ? 'Assistance kg' : 'kg', attrs: at }));
  }
  controls.push(stepperHTML({ field: 'reps', value: s.reps, label: 'Reps', attrs: at }));
  if (e.type === 'timed') {
    controls.push(stepperHTML({ field: 'time', value: s.time, display: s.time === null ? '' : fmtTime(s.time), label: 'Time (min:sec)', attrs: at }));
  }
  return `
    <div class="set-row ${s.done ? 'done' : ''}">
      <div class="set-top">
        <span class="set-no">${e.type === 'timed' ? 'Attempt' : 'Set'} ${j + 1}</span>
        <button class="done-btn ${s.done ? 'on' : ''}" data-a="done" ${at} aria-label="Mark set done">${s.done ? '✓ Done' : '✓'}</button>
      </div>
      <div class="set-controls n${controls.length}">${controls.join('')}</div>
    </div>`;
}

function videoHTML(e, i) {
  const stats = videoStats(S.videos, S.workouts);
  const v = S.videos.find((x) => x.id === e.video?.videoId);
  if (!S.videos.length) return `<p class="muted">No videos yet — add some in Manage → Abs videos.</p>
    ${doneToggle(e, i)}`;
  const opts = [...S.videos].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((x) => {
    const st = stats[x.id];
    return `<option value="${x.id}" ${x.id === v?.id ? 'selected' : ''}>${esc(x.title)} — ${st.count}× ${st.last ? '(last ' + fmtDate(st.last, { day: 'numeric', month: 'short' }) + ')' : '(never)'}</option>`;
  }).join('');
  return `
    <div class="video-box">
      <div class="muted small">Suggested: the one you haven’t done for longest</div>
      <div class="video-title">${esc(v?.title || '—')} <span class="muted small">done ${stats[v?.id]?.count || 0}×</span></div>
      ${v ? `<a class="btn btn-big" href="${esc(v.url)}" target="_blank" rel="noopener">▶ Open video</a>` : ''}
      <label class="field"><span>Pick another</span><select data-a="pickvideo" data-e="${i}">${opts}</select></label>
      ${doneToggle(e, i)}
    </div>`;
}
const doneToggle = (e, i) => `<button class="btn btn-big ${e.video?.done ? 'btn-good' : 'btn-primary'}" data-a="vdone" data-e="${i}">${e.video?.done ? '✓ Done' : 'Mark as done'}</button>`;

function cardHTML(e, i) {
  const ex = exById(e.exerciseId) || { id: e.exerciseId, name: e.name, type: e.type, targetSets: 1 };
  const a = A();
  const last = historyFor(ex.id, S.workouts, a.id)[0];
  const hint = progressionHint(ex, S.workouts, a.id);
  const complete = isComplete(e);
  const collapsed = complete && !e.open;
  const meta = [targetText(ex), ex.note, e.itemNote].filter(Boolean).map(esc).join(' · ');

  let body = '';
  if (collapsed) {
    body = `<button class="summary-row" data-a="open" data-e="${i}"><span class="good">✓ ${esc(formatSets(e))}</span><span class="muted small">Edit</span></button>`;
  } else if (e.type === 'video') {
    body = videoHTML(e, i);
  } else {
    body = e.sets.map((_, j) => setRowHTML(e, ex, i, j)).join('');
    if (e.type === 'timed') {
      const running = !!e.swStart;
      body += `<button class="btn btn-big ${running ? 'btn-danger' : ''}" data-a="sw" data-e="${i}">
        ${running ? `■ Stop stopwatch <span class="sw-time" data-sw="${i}">${fmtTime((Date.now() - e.swStart) / 1000)}</span>` : '⏱ Start stopwatch'}</button>`;
    }
  }
  const showNote = e.showNote || e.note;
  return `
    <article class="ex-card ${complete ? 'complete' : ''}" data-card="${i}">
      <div class="ex-head">
        <div class="ex-num">${complete ? '✓' : i + 1}</div>
        <div class="ex-title">
          <h3>${esc(e.name)}${e.optional ? ' <span class="tag">optional</span>' : ''}${e.extra ? ' <span class="tag">extra</span>' : ''}</h3>
          ${e.original ? `<div class="orig">Vincent: ${esc(e.original)}</div>` : ''}
          ${e.swappedFrom ? `<div class="orig">Swapped from ${esc(e.swappedFrom)}</div>` : ''}
        </div>
      </div>
      ${meta ? `<div class="ex-meta">${meta}</div>` : ''}
      <div class="last">${last
        ? `<span class="muted">Last (${fmtDate(last.workout.start, { day: 'numeric', month: 'short' })}):</span> <b>${esc(formatSets(last.entry))}</b>`
        : '<span class="muted">No history yet</span>'}</div>
      ${last?.entry.note ? `<div class="last-note">“${esc(last.entry.note)}”</div>` : ''}
      ${hint ? `<div class="hint">💡 ${esc(hint)}</div>` : ''}
      ${e.type === 'assisted' && !collapsed ? '<div class="assist-note">Assisted: less kg = stronger ↓</div>' : ''}
      ${body}
      ${collapsed ? '' : `
      <div class="card-actions">
        ${e.type !== 'video' && e.type !== 'timed' ? `<button class="btn btn-sm" data-a="addset" data-e="${i}">+ Set</button>
        <button class="btn btn-sm" data-a="delset" data-e="${i}" ${e.sets.length <= 1 ? 'disabled' : ''}>− Set</button>` : ''}
        <button class="btn btn-sm" data-a="swap" data-e="${i}">⇄ Swap</button>
        <button class="btn btn-sm" data-a="note" data-e="${i}">✎ Note</button>
      </div>`}
      ${showNote && !collapsed ? `<textarea class="note" data-a="enote" data-e="${i}" placeholder="Note for this exercise…" rows="2">${esc(e.note)}</textarea>` : ''}
    </article>`;
}

export function renderSession(view) {
  const a = A();
  if (!a) { go('#/home'); return; }
  requestWakeLock();
  view.innerHTML = `
    <header class="session-head">
      <button class="icon-btn" data-a="home" aria-label="Back to home">‹</button>
      <div class="session-title">
        <h1>${esc(a.name)}</h1>
        <div class="muted small">⏱ <span id="elapsed">${fmtTime((Date.now() - new Date(a.start)) / 1000)}</span></div>
      </div>
      <button class="btn btn-sm btn-primary" data-a="finish">Finish</button>
    </header>
    <div id="entries">${a.entries.map(cardHTML).join('')}</div>
    <button class="btn btn-big" data-a="addex">+ Add exercise</button>
    <label class="field"><span>Session note</span>
      <textarea class="note" data-a="snote" rows="3" placeholder="How did it go?">${esc(a.note)}</textarea></label>
    <button class="btn btn-primary btn-huge" data-a="finish">Finish session</button>
    <button class="btn btn-link danger" data-a="discard">Discard this session</button>
  `;
  view.onclick = onClick;
  view.onchange = onChange;
  view.oninput = onInput;
  renderTimer();
}

/** Re-draw just one exercise card (faster, keeps scroll position). */
function rerenderCard(i) {
  const el = document.querySelector(`[data-card="${i}"]`);
  if (el) el.outerHTML = cardHTML(A().entries[i], i);
}
function rerenderAll() {
  const el = $('#entries');
  if (el) el.innerHTML = A().entries.map(cardHTML).join('');
}

// Live clock: session duration + stopwatches
setInterval(() => {
  const a = A();
  if (!a) return;
  const el = document.getElementById('elapsed');
  if (el) el.textContent = fmtTime((Date.now() - new Date(a.start)) / 1000);
  document.querySelectorAll('[data-sw]').forEach((sw) => {
    const e = a.entries[+sw.dataset.sw];
    if (e?.swStart) sw.textContent = fmtTime((Date.now() - e.swStart) / 1000);
  });
}, 500);

// ---------- event handlers ----------

function stepFor(e, field) {
  if (field === 'reps') return 1;
  if (field === 'time') return 15;
  const ex = exById(e.exerciseId);
  return ex?.step || 1;
}

function setValue(i, j, field, value) {
  const e = A().entries[i];
  const old = e.sets[j][field];
  e.sets[j][field] = value;
  // Changing the weight also updates the following sets you haven't done yet
  if (field === 'kg') {
    for (let k = j + 1; k < e.sets.length; k++) {
      if (!e.sets[k].done && e.sets[k].kg === old) e.sets[k].kg = value;
    }
  }
}

async function onClick(ev) {
  const stepBtn = ev.target.closest('[data-act="inc"],[data-act="dec"]');
  if (stepBtn) {
    const st = stepBtn.closest('.stepper');
    const i = +st.dataset.e, j = +st.dataset.s, field = st.dataset.field;
    const e = A().entries[i];
    const step = stepFor(e, field);
    let v = e.sets[j][field];
    const dir = stepBtn.dataset.act === 'inc' ? 1 : -1;
    if (v === null || v === undefined) {
      if (dir < 0) return;
      const ex = exById(e.exerciseId);
      v = field === 'kg' ? (ex?.defaultKg ?? step) : field === 'time' ? (ex?.targetTime ?? 60) : 1;
    } else {
      v = Math.max(0, Math.round((v + dir * step) * 100) / 100);
    }
    setValue(i, j, field, v);
    persist();
    rerenderCard(i);
    return;
  }

  const t = ev.target.closest('[data-a]');
  if (!t) return;
  const act = t.dataset.a;
  const i = t.dataset.e !== undefined ? +t.dataset.e : null;
  const a = A();
  const e = i !== null ? a.entries[i] : null;

  switch (act) {
    case 'home': go('#/home'); break;

    case 'done': {
      unlockAudio();
      const j = +t.dataset.s;
      const set = e.sets[j];
      set.done = !set.done;
      if (set.done) {
        if (isComplete(e)) {
          e.open = false;
          const next = a.entries.slice(i + 1).find((x) => !isComplete(x)) || a.entries.find((x) => !isComplete(x));
          if (next) startTimer(settings().nextSec, 'next', `Next: ${next.name}`);
          else toast('All exercises done — tap Finish 🎉');
        } else {
          const nextSet = e.sets.findIndex((s) => !s.done);
          startTimer(settings().restSec, 'rest', `Next: ${e.type === 'timed' ? 'attempt' : 'set'} ${nextSet + 1} — ${e.name}`);
        }
      }
      await persist();
      rerenderCard(i);
      break;
    }
    case 'open': e.open = true; rerenderCard(i); break;
    case 'addset': {
      const lastSet = e.sets[e.sets.length - 1] || { kg: null, reps: null, time: null };
      e.sets.push({ kg: lastSet.kg, reps: lastSet.reps, time: lastSet.time, done: false });
      e.open = true;
      await persist(); rerenderCard(i); break;
    }
    case 'delset':
      if (e.sets.length > 1) { e.sets.pop(); await persist(); rerenderCard(i); }
      break;
    case 'note': e.showNote = !e.showNote; rerenderCard(i); break;
    case 'swap': await swapExercise(i); break;
    case 'addex': await addExercise(); break;
    case 'vdone':
      e.video.done = !e.video.done;
      if (e.video.done) { e.open = false; }
      await persist(); rerenderCard(i); break;
    case 'sw': {
      unlockAudio();
      if (e.swStart) {
        const sec = Math.round((Date.now() - e.swStart) / 1000);
        e.swStart = null;
        const target = e.sets.find((s) => !s.done) || e.sets[e.sets.length - 1];
        target.time = sec;
        toast(`Time saved: ${fmtTime(sec)}`);
      } else {
        e.swStart = Date.now();
      }
      await persist(); rerenderCard(i); break;
    }
    case 'finish': await finishWorkout(); break;
    case 'discard':
      if (await confirmDialog('Discard this session? Nothing from today will be saved.', { yes: 'Discard', danger: true })) {
        releaseWakeLock();
        await setMeta('active', null);
        go('#/home');
      }
      break;
  }
}

function onChange(ev) {
  const t = ev.target;
  if (t.matches('.step-input')) {
    const st = t.closest('.stepper');
    const i = +st.dataset.e, j = +st.dataset.s, field = st.dataset.field;
    let v;
    if (field === 'time') v = parseTime(t.value);
    else {
      v = t.value.trim() === '' ? null : Number(t.value.replace(',', '.'));
      if (v !== null && (isNaN(v) || v < 0)) v = A().entries[i].sets[j][field];
    }
    setValue(i, j, field, v);
    persist();
    rerenderCard(i);
  }
  if (t.dataset.a === 'pickvideo') {
    const e = A().entries[+t.dataset.e];
    const v = S.videos.find((x) => x.id === t.value);
    e.video.videoId = v?.id || null;
    e.video.title = v?.title || '';
    persist();
    rerenderCard(+t.dataset.e);
  }
}

let noteTimer;
function onInput(ev) {
  const t = ev.target;
  if (t.dataset.a === 'enote') A().entries[+t.dataset.e].note = t.value;
  else if (t.dataset.a === 'snote') A().note = t.value;
  else return;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(persist, 400);
}

// ---------- swap / add exercise ----------

/**
 * Pop-up list of exercises from your library (with search and
 * "create new"). Resolves with an exercise id, '__remove', or null.
 */
export function pickExercise({ title, suggestions = [], exclude = [], allowRemove = false }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (val, close) => { done = true; close(); resolve(val); };
    const listHTML = (q = '') => {
      const ql = q.trim().toLowerCase();
      const all = [...S.exercises].filter((x) => !exclude.includes(x.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      const sugg = suggestions.map(exById).filter(Boolean);
      const match = (x) => !ql || x.name.toLowerCase().includes(ql);
      return `
        ${sugg.length && !ql ? `<div class="list-title">Suggested alternatives</div>
          ${sugg.map((x) => `<button class="list-btn accent-border" data-m="pick" data-id="${x.id}">${esc(x.name)}</button>`).join('')}` : ''}
        <div class="list-title">Your exercises</div>
        ${all.filter(match).map((x) => `<button class="list-btn" data-m="pick" data-id="${x.id}">${esc(x.name)}<small>${esc(x.type)}</small></button>`).join('') || '<p class="muted">No match.</p>'}`;
    };
    const { el } = modal({
      title,
      body: `
        <button class="btn btn-big btn-primary" data-m="new">+ Create a new exercise</button>
        ${allowRemove ? '<button class="btn btn-big" data-m="remove">Remove from today</button>' : ''}
        <input class="search" type="search" placeholder="Search…" data-search>
        <div class="pick-list">${listHTML()}</div>`,
      onClick: async (ev, t, close) => {
        if (t.dataset.m === 'pick') finish(t.dataset.id, close);
        if (t.dataset.m === 'remove') finish('__remove', close);
        if (t.dataset.m === 'new') {
          const ex = await editExerciseModal(null);
          if (ex) finish(ex.id, close);
        }
      },
      onInput: (ev, wrap) => {
        if (ev.target.matches('[data-search]')) wrap.querySelector('.pick-list').innerHTML = listHTML(ev.target.value);
      },
      onClose: () => { if (!done) resolve(null); },
    });
    void el;
  });
}

async function swapExercise(i) {
  const a = A();
  const old = a.entries[i];
  const id = await pickExercise({ title: `Swap ${old.name}`, suggestions: old.alternatives, exclude: [old.exerciseId], allowRemove: true });
  if (!id) return;
  if (id === '__remove') {
    a.entries.splice(i, 1);
    await persist();
    rerenderAll();
    return;
  }
  const tpl = tplById(a.templateId);
  let scope = 'today';
  if (tpl && !old.extra) {
    scope = await choiceDialog('Swap for…', `Replace “${old.name}” with “${exById(id).name}”`, [
      { label: 'Today only', value: 'today', primary: true },
      { label: 'Permanently', sub: `Also change the “${tpl.name}” session`, value: 'forever' },
    ]);
    if (!scope) return;
  }
  const fresh = makeEntry(id, { original: old.original, optional: old.optional, alternatives: old.alternatives });
  fresh.itemIndex = old.itemIndex;
  fresh.extra = old.extra;
  if (scope === 'today') fresh.swappedFrom = old.name;
  a.entries[i] = fresh;
  if (scope === 'forever') {
    let idx = old.itemIndex;
    if (idx === undefined || tpl.items[idx]?.exerciseId !== old.exerciseId) idx = tpl.items.findIndex((it) => it.exerciseId === old.exerciseId);
    if (idx >= 0) {
      tpl.items[idx] = { ...tpl.items[idx], exerciseId: id };
      await save('templates', tpl);
    }
    toast(`“${tpl.name}” updated`);
  }
  await persist();
  rerenderAll();
}

async function addExercise() {
  const id = await pickExercise({ title: 'Add an exercise' });
  if (!id || id === '__remove') return;
  const e = makeEntry(id);
  e.extra = true;
  A().entries.push(e);
  await persist();
  rerenderAll();
  document.querySelector(`[data-card="${A().entries.length - 1}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- finishing ----------

/** Keep only what was actually logged. */
function cleanEntry(e) {
  const out = {
    exerciseId: e.exerciseId, name: e.name, type: e.type, original: e.original || '',
    note: e.note || '', sets: (e.sets || []).filter((s) => s.done),
  };
  if (e.video) out.video = { ...e.video };
  if (e.swappedFrom) out.swappedFrom = e.swappedFrom;
  return out;
}

async function finishWorkout() {
  const a = A();
  const logged = a.entries.filter(entryHasData);
  if (!logged.length) {
    if (await confirmDialog('Nothing has been logged yet. Discard this session?', { yes: 'Discard', danger: true })) {
      releaseWakeLock();
      await setMeta('active', null);
      go('#/home');
    }
    return;
  }
  const skipped = a.entries.length - logged.length;
  const msg = skipped
    ? `Finish the session? ${skipped} exercise(s) with nothing ticked won’t be saved.`
    : 'Finish the session?';
  if (!(await confirmDialog(msg, { yes: 'Finish' }))) return;

  const w = {
    id: a.id, templateId: a.templateId, name: a.name,
    start: a.start, end: new Date().toISOString(), note: a.note || '',
    entries: a.entries.filter(entryHasData).map(cleanEntry),
  };
  await save('workouts', w);
  releaseWakeLock();
  await setMeta('active', null);
  go('#/summary/' + w.id);
}

// ---------- end screen ----------

export function renderSummary(view, id) {
  const w = workoutById(id);
  if (!w) { go('#/home'); return; }
  const prs = newRecords(w, exercisesById(), S.workouts);
  const sets = w.entries.reduce((n, e) => n + (e.sets?.length || 0), 0);
  const dur = w.end ? (new Date(w.end) - new Date(w.start)) / 1000 : null;
  view.innerHTML = `
    <header class="page-head"><h1>Session complete 🎉</h1></header>
    <section class="card">
      <h2>${esc(w.name)}</h2>
      <div class="stats">
        <div><span class="big-num">${dur ? fmtTime(dur) : '–'}</span><span class="muted">duration</span></div>
        <div><span class="big-num">${w.entries.length}</span><span class="muted">exercises</span></div>
        <div><span class="big-num">${sets}</span><span class="muted">sets</span></div>
      </div>
    </section>
    ${prs.length ? `
      <section class="card pr-card">
        <h2>🏆 New personal records</h2>
        ${prs.map((p) => `<div class="pr-row"><b>${esc(p.name)}</b><div>${esc(p.label)}: <span class="good">${esc(p.text)}</span> <span class="muted small">(was ${esc(p.previous)})</span></div></div>`).join('')}
      </section>` : ''}
    <section class="card">
      ${w.entries.map((e) => `<div class="sum-row"><div>${esc(e.name)}</div><div class="muted">${esc(formatSets(e))}</div></div>`).join('')}
      ${w.note ? `<p class="muted">“${esc(w.note)}”</p>` : ''}
    </section>
    <button class="btn btn-primary btn-huge" data-a="done">Done</button>`;
  view.onclick = (e) => { if (e.target.closest('[data-a="done"]')) go('#/home'); };
}

