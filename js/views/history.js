// =============================================================
// History: calendar, per-exercise charts & records, past sessions
// (view, edit, delete).
// =============================================================

import { S, save, remove, exById, workoutById, exercisesById, tplById } from '../store.js';
import {
  dayKey, fmtDate, fmtTime, fmtNum, formatSets, historyFor, chartMetric, CHART_LABEL,
  LOWER_IS_BETTER, personalRecords, progressionHint, newRecords, parseTime, sortedTemplates, TYPE_LABELS,
} from '../logic.js';
import { esc, confirmDialog, toast } from '../ui.js';
import { go } from '../app.js';

// Colours for each session in the calendar (in session order)
const COLORS = ['#ff7a00', '#4da3ff', '#34c759', '#bf5af2', '#ffd60a', '#ff6482', '#64d2ff', '#ac8e68'];
function colorFor(templateId) {
  const i = sortedTemplates(S.templates).findIndex((t) => t.id === templateId);
  return i >= 0 ? COLORS[i % COLORS.length] : '#8b8b98';
}

let calMonth = null;   // first day of the month shown in the calendar
let selectedDay = null; // "2026-09-23"

const byDateDesc = (a, b) => new Date(b.start) - new Date(a.start);

// ---------- main history screen ----------

export function renderHistory(view) {
  if (!calMonth) { const d = new Date(); calMonth = new Date(d.getFullYear(), d.getMonth(), 1); }
  const workouts = [...S.workouts].sort(byDateDesc);
  const byDay = {};
  for (const w of workouts) (byDay[dayKey(w.start)] ||= []).push(w);

  // Calendar grid (weeks start on Monday)
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = dayKey(new Date());
  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const key = dayKey(new Date(y, m, d));
    const ws = byDay[key] || [];
    cells += `<button class="cal-cell ${ws.length ? 'has' : ''} ${key === today ? 'today' : ''} ${key === selectedDay ? 'sel' : ''}" data-a="day" data-day="${key}">
      <span>${d}</span>
      <span class="cal-dots">${ws.slice(0, 3).map((w) => `<i style="background:${colorFor(w.templateId)}"></i>`).join('')}</span>
    </button>`;
  }
  const monthCount = workouts.filter((w) => { const d = new Date(w.start); return d.getFullYear() === y && d.getMonth() === m; }).length;
  const dayList = selectedDay ? (byDay[selectedDay] || []) : [];

  // Exercises that have history
  const exWithHistory = S.exercises
    .filter((x) => x.type !== 'video' && historyFor(x.id, S.workouts).length)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  view.innerHTML = `
    <header class="page-head"><h1>History</h1></header>

    <section class="card">
      <div class="cal-head">
        <button class="icon-btn" data-a="prev" aria-label="Previous month">‹</button>
        <div><b>${calMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</b>
          <div class="muted small">${monthCount} session${monthCount === 1 ? '' : 's'}</div></div>
        <button class="icon-btn" data-a="next" aria-label="Next month">›</button>
      </div>
      <div class="cal-grid">
        ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<div class="cal-dow">${d}</div>`).join('')}
        ${cells}
      </div>
      <div class="legend">${sortedTemplates(S.templates).map((t) => `<span><i style="background:${colorFor(t.id)}"></i>${esc(t.name)}</span>`).join('')}</div>
      ${selectedDay ? `<div class="day-list">
        <div class="muted small">${fmtDate(selectedDay + 'T12:00', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        ${dayList.map(workoutRow).join('') || '<p class="muted">Rest day 😴</p>'}</div>` : ''}
    </section>

    <h3 class="section-title">Progress per exercise</h3>
    <div class="list">
      ${exWithHistory.map((x) => `<button class="list-btn" data-a="ex" data-id="${x.id}">${esc(x.name)}
        <small>${historyFor(x.id, S.workouts).length}× · last: ${esc(formatSets(historyFor(x.id, S.workouts)[0].entry))}</small></button>`).join('')
        || '<p class="muted">Nothing yet.</p>'}
    </div>

    <h3 class="section-title">Past sessions</h3>
    <div class="list">${workouts.map(workoutRow).join('') || '<p class="muted">No sessions yet.</p>'}</div>
  `;

  view.onclick = (e) => {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    const a = t.dataset.a;
    if (a === 'prev') { calMonth = new Date(y, m - 1, 1); renderHistory(view); }
    if (a === 'next') { calMonth = new Date(y, m + 1, 1); renderHistory(view); }
    if (a === 'day') { selectedDay = selectedDay === t.dataset.day ? null : t.dataset.day; renderHistory(view); }
    if (a === 'ex') go('#/exercise/' + t.dataset.id);
    if (a === 'w') go('#/workout/' + t.dataset.id);
  };
}

function workoutRow(w) {
  const dur = w.end ? fmtTime((new Date(w.end) - new Date(w.start)) / 1000) : '';
  return `<button class="list-btn" data-a="w" data-id="${w.id}">
    <span><i class="dot" style="background:${colorFor(w.templateId)}"></i>${esc(w.name)}</span>
    <small>${fmtDate(w.start)} · ${w.entries.length} exercises${dur ? ' · ' + dur : ''}</small></button>`;
}

// ---------- one exercise: chart + records ----------

let chart = null;

export function renderExercise(view, id) {
  const ex = exById(id);
  if (!ex) { go('#/history'); return; }
  const hist = historyFor(ex.id, S.workouts);
  const lower = !!LOWER_IS_BETTER[ex.type];
  const records = personalRecords(ex, S.workouts);
  const hint = progressionHint(ex, S.workouts);
  const points = hist
    .map((h) => ({ x: new Date(h.workout.start).getTime(), y: chartMetric(h.entry, ex.type) }))
    .filter((p) => p.y !== null)
    .reverse(); // oldest first

  view.innerHTML = `
    <header class="page-head">
      <button class="icon-btn" data-a="back" aria-label="Back">‹</button>
      <h1 class="h-small">${esc(ex.name)}</h1>
    </header>
    <div class="muted small">${esc(TYPE_LABELS[ex.type] || ex.type)}</div>
    ${hint ? `<div class="hint">💡 ${esc(hint)}</div>` : ''}
    <section class="card">
      <div class="muted small">${esc(CHART_LABEL[ex.type] || '')}</div>
      ${lower ? `<div class="assist-note big">⬇ Going down is good — ${ex.type === 'assisted' ? 'less assistance means you’re stronger' : 'a faster time'}</div>` : ''}
      <div class="chart-box">${points.length ? '<canvas id="chart"></canvas>' : '<p class="muted">Not enough data for a chart yet.</p>'}</div>
      <div class="legend"><span><i style="background:#34c759"></i>better</span><span><i style="background:#ff453a"></i>worse</span></div>
    </section>
    <section class="card">
      <h2>🏆 Personal records</h2>
      ${records.map((r) => `<div class="pr-row"><div>${esc(r.label)}</div><div><b>${esc(r.text)}</b> <span class="muted small">${fmtDate(r.date)}</span></div></div>`).join('') || '<p class="muted">None yet.</p>'}
    </section>
    <section class="card">
      <h2>All sessions</h2>
      ${hist.map((h) => `<button class="sum-row as-btn" data-a="w" data-id="${h.workout.id}">
        <div class="muted">${fmtDate(h.workout.start)}</div><div>${esc(formatSets(h.entry))}${h.entry.note ? ` <span class="muted">“${esc(h.entry.note)}”</span>` : ''}</div></button>`).join('')}
    </section>`;

  view.onclick = (e) => {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    if (t.dataset.a === 'back') history.length > 1 ? history.back() : go('#/history');
    if (t.dataset.a === 'w') go('#/workout/' + t.dataset.id);
  };

  if (points.length) drawChart(points, ex.type, lower);
}

function drawChart(points, type, lower) {
  if (chart) { chart.destroy(); chart = null; }
  const Chart = window.Chart;
  if (!Chart) return;
  const GOOD = '#34c759', BAD = '#ff453a', SAME = '#8b8b98';
  const fmtY = (v) => (type === 'timed' ? fmtTime(v) : fmtNum(v));
  chart = new Chart(document.getElementById('chart'), {
    type: 'line',
    data: {
      datasets: [{
        data: points,
        borderWidth: 3,
        pointRadius: 5,
        pointBackgroundColor: '#f2f2f5',
        tension: 0,
        // colour each line segment: green = improvement, red = worse
        segment: {
          borderColor: (ctx) => {
            const a = ctx.p0.parsed.y, b = ctx.p1.parsed.y;
            if (a === b) return SAME;
            return (lower ? b < a : b > a) ? GOOD : BAD;
          },
        },
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          title: (items) => fmtDate(items[0].parsed.x),
          label: (item) => fmtY(item.parsed.y) + (type === 'assisted' ? ' kg assist.' : type === 'weighted' ? ' kg' : type === 'bodyweight' ? ' reps' : ''),
        } },
      },
      scales: {
        x: {
          type: 'linear',
          ticks: { color: '#8b8b98', maxTicksLimit: 5, callback: (v) => fmtDate(v, { day: 'numeric', month: 'short' }) },
          grid: { color: '#2a2a33' },
          // a little padding so single points aren't on the edge
          suggestedMin: points[0].x - 86400000, suggestedMax: points[points.length - 1].x + 86400000,
        },
        y: {
          ticks: { color: '#8b8b98', callback: fmtY },
          grid: { color: '#2a2a33' },
        },
      },
    },
  });
}

// ---------- one past workout: view / edit / delete ----------

let editing = null; // a copy of the workout being edited

function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function renderWorkout(view, id) {
  const w = workoutById(id);
  if (!w) { go('#/history'); return; }
  if (editing && editing.id !== id) editing = null;
  if (editing) return renderWorkoutEdit(view, w);

  const dur = w.end ? fmtTime((new Date(w.end) - new Date(w.start)) / 1000) : '–';
  const prs = newRecords(w, exercisesById(), S.workouts);
  view.innerHTML = `
    <header class="page-head">
      <button class="icon-btn" data-a="back" aria-label="Back">‹</button>
      <h1 class="h-small">${esc(w.name)}</h1>
    </header>
    <div class="muted">${fmtDate(w.start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      · ${new Date(w.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · ⏱ ${dur}</div>
    ${prs.length ? `<section class="card pr-card"><h2>🏆 Records set</h2>
      ${prs.map((p) => `<div class="pr-row"><b>${esc(p.name)}</b><div>${esc(p.label)}: <span class="good">${esc(p.text)}</span></div></div>`).join('')}</section>` : ''}
    <section class="card">
      ${w.entries.map((e) => `
        <div class="sum-row">
          <div><b>${esc(e.name)}</b>${e.swappedFrom ? ` <span class="muted small">(swapped from ${esc(e.swappedFrom)})</span>` : ''}</div>
          <div>${esc(formatSets(e))}</div>
          ${e.note ? `<div class="muted">“${esc(e.note)}”</div>` : ''}
        </div>`).join('') || '<p class="muted">Empty session.</p>'}
      ${w.note ? `<p class="muted">Session note: “${esc(w.note)}”</p>` : ''}
    </section>
    <div class="btn-row">
      <button class="btn btn-big" data-a="edit">✎ Edit</button>
      <button class="btn btn-big btn-danger" data-a="delete">Delete</button>
    </div>`;

  view.onclick = async (e) => {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    const a = t.dataset.a;
    if (a === 'back') history.length > 1 ? history.back() : go('#/history');
    if (a === 'edit') { editing = JSON.parse(JSON.stringify(w)); renderWorkout(view, id); }
    if (a === 'delete' && await confirmDialog(`Delete the ${w.name} session of ${fmtDate(w.start)}? This can’t be undone.`, { yes: 'Delete', danger: true })) {
      await remove('workouts', w.id);
      toast('Session deleted');
      go('#/history');
    }
  };
}

function renderWorkoutEdit(view, w) {
  const d = editing;
  const durMin = d.end ? Math.round((new Date(d.end) - new Date(d.start)) / 60000) : '';
  const videoOpts = (sel) => S.videos.map((v) => `<option value="${v.id}" ${v.id === sel ? 'selected' : ''}>${esc(v.title)}</option>`).join('');
  view.innerHTML = `
    <header class="page-head">
      <button class="icon-btn" data-a="cancel" aria-label="Cancel">✕</button>
      <h1 class="h-small">Edit session</h1>
    </header>
    <label class="field"><span>Session</span>
      <select data-f="templateId">${sortedTemplates(S.templates).map((t) => `<option value="${t.id}" ${t.id === d.templateId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}
        ${tplById(d.templateId) ? '' : `<option value="${esc(d.templateId)}" selected>${esc(d.name)}</option>`}</select></label>
    <div class="grid2">
      <label class="field"><span>Date & time</span><input type="datetime-local" data-f="start" value="${toLocalInput(d.start)}"></label>
      <label class="field"><span>Duration (min)</span><input inputmode="numeric" data-f="dur" value="${durMin}" placeholder="unknown"></label>
    </div>
    ${d.entries.map((e, i) => `
      <section class="card">
        <div class="row-between"><b>${esc(e.name)}</b><button class="btn btn-sm danger" data-a="delentry" data-i="${i}">Remove</button></div>
        ${e.type === 'video' ? `
          <label class="field"><span>Video</span><select data-e="${i}" data-f="videoId">${videoOpts(e.video?.videoId)}</select></label>
          <label class="check"><input type="checkbox" data-e="${i}" data-f="vdone" ${e.video?.done ? 'checked' : ''}><span>Done</span></label>` : `
          <div class="edit-sets">
            ${e.sets.map((s, j) => `
              <div class="edit-set">
                <span class="muted">${j + 1}</span>
                ${e.type === 'weighted' || e.type === 'assisted' ? `<label><small>${e.type === 'assisted' ? 'assist. kg' : 'kg'}</small><input inputmode="decimal" data-e="${i}" data-s="${j}" data-f="kg" value="${s.kg ?? ''}"></label>` : ''}
                <label><small>reps</small><input inputmode="numeric" data-e="${i}" data-s="${j}" data-f="reps" value="${s.reps ?? ''}"></label>
                ${e.type === 'timed' ? `<label><small>time</small><input data-e="${i}" data-s="${j}" data-f="time" value="${s.time ? fmtTime(s.time) : ''}"></label>` : ''}
                <button class="icon-btn danger" data-a="delset" data-i="${i}" data-j="${j}" aria-label="Remove set">✕</button>
              </div>`).join('')}
          </div>
          <button class="btn btn-sm" data-a="addset" data-i="${i}">+ Set</button>`}
        <input class="note-input" data-e="${i}" data-f="note" value="${esc(e.note || '')}" placeholder="Note">
      </section>`).join('')}
    <label class="field"><span>Session note</span><textarea class="note" data-f="snote" rows="2">${esc(d.note || '')}</textarea></label>
    <div class="btn-row">
      <button class="btn btn-big" data-a="cancel">Cancel</button>
      <button class="btn btn-big btn-primary" data-a="save">Save</button>
    </div>`;

  const num = (v) => (String(v).trim() === '' ? null : Number(String(v).replace(',', '.')));
  view.onchange = view.oninput = (e) => {
    const t = e.target, f = t.dataset.f;
    if (!f) return;
    const entry = t.dataset.e !== undefined ? d.entries[+t.dataset.e] : null;
    if (t.dataset.s !== undefined) {
      const set = entry.sets[+t.dataset.s];
      set[f] = f === 'time' ? parseTime(t.value) : num(t.value);
    } else if (f === 'note') entry.note = t.value;
    else if (f === 'videoId') { entry.video.videoId = t.value; entry.video.title = S.videos.find((v) => v.id === t.value)?.title || ''; }
    else if (f === 'vdone') entry.video.done = t.checked;
    else if (f === 'snote') d.note = t.value;
    else if (f === 'templateId') { d.templateId = t.value; d.name = tplById(t.value)?.name || d.name; }
    else if (f === 'start' && t.value) {
      const oldDur = d.end ? new Date(d.end) - new Date(d.start) : null;
      d.start = new Date(t.value).toISOString();
      if (oldDur !== null) d.end = new Date(new Date(d.start).getTime() + oldDur).toISOString();
    } else if (f === 'dur') {
      const mins = num(t.value);
      d.end = mins ? new Date(new Date(d.start).getTime() + mins * 60000).toISOString() : null;
    }
  };
  view.onclick = async (e) => {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    const a = t.dataset.a, i = +t.dataset.i;
    if (a === 'cancel') { editing = null; renderWorkout(view, w.id); }
    if (a === 'addset') {
      const last = d.entries[i].sets.at(-1) || { kg: null, reps: null, time: null };
      d.entries[i].sets.push({ ...last, done: true });
      renderWorkoutEdit(view, w);
    }
    if (a === 'delset') { d.entries[i].sets.splice(+t.dataset.j, 1); renderWorkoutEdit(view, w); }
    if (a === 'delentry') { d.entries.splice(i, 1); renderWorkoutEdit(view, w); }
    if (a === 'save') {
      d.entries.forEach((en) => en.sets?.forEach((s) => { s.done = true; }));
      await save('workouts', d);
      editing = null;
      toast('Saved');
      renderWorkout(view, w.id);
    }
  };
}
