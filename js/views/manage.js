// =============================================================
// Manage screen: sessions, exercise library and abs videos.
// Add, edit, delete, reorder.
// =============================================================

import { S, save, remove, exById, tplById } from '../store.js';
import { uid, sortedTemplates, TYPE_LABELS, fmtNum, fmtTime, parseTime, videoStats, historyFor } from '../logic.js';
import { esc, modal, confirmDialog, toast } from '../ui.js';
import { pickExercise } from './session.js';
import { go } from '../app.js';

// ---------- main list ----------

export function renderManage(view) {
  const tpls = sortedTemplates(S.templates);
  const exs = [...S.exercises].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  view.innerHTML = `
    <header class="page-head"><h1>Manage</h1></header>

    <h3 class="section-title">Sessions</h3>
    <div class="list">
      ${tpls.map((t, i) => `
        <div class="list-row">
          <button class="list-main" data-a="tpl" data-id="${t.id}">
            <span>${esc(t.name)}</span>
            <small>${t.items.length} exercises · ${t.inRotation ? 'in rotation' : 'not in rotation'}</small>
          </button>
          <button class="icon-btn" data-a="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
          <button class="icon-btn" data-a="down" data-i="${i}" ${i === tpls.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
        </div>`).join('')}
    </div>
    <button class="btn btn-big" data-a="newtpl">+ New session</button>
    <p class="muted small">The rotation on the home screen follows this order (only sessions marked “in rotation”).</p>

    <h3 class="section-title">Abs videos</h3>
    <button class="btn btn-big" data-a="videos">🎬 Manage abs videos (${S.videos.length})</button>

    <h3 class="section-title">Exercise library</h3>
    <div class="list">
      ${exs.map((x) => `
        <button class="list-btn" data-a="ex" data-id="${x.id}">${esc(x.name)}
          <small>${esc(x.type)}${x.targetReps ? ` · ${x.targetSets}×${x.targetReps}` : ''}${x.step ? ` · step ${fmtNum(x.step)} kg` : ''}</small></button>`).join('')}
    </div>
    <button class="btn btn-big" data-a="newex">+ New exercise</button>
  `;
  view.onclick = async (e) => {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    const a = t.dataset.a;
    if (a === 'tpl') go('#/manage/session/' + t.dataset.id);
    if (a === 'videos') go('#/manage/videos');
    if (a === 'up' || a === 'down') {
      const i = +t.dataset.i;
      const j = a === 'up' ? i - 1 : i + 1;
      [tpls[i], tpls[j]] = [tpls[j], tpls[i]];
      for (let k = 0; k < tpls.length; k++) { tpls[k].order = k; await save('templates', tpls[k]); }
      renderManage(view);
    }
    if (a === 'newtpl') {
      const t2 = { id: uid(), name: 'New session', order: tpls.length, inRotation: false, note: '', items: [] };
      await save('templates', t2);
      go('#/manage/session/' + t2.id);
    }
    if (a === 'ex') { if (await editExerciseModal(exById(t.dataset.id))) renderManage(view); }
    if (a === 'newex') { if (await editExerciseModal(null)) renderManage(view); }
  };
}

// ---------- one session ----------

export function renderTemplateEditor(view, id) {
  const tpl = tplById(id);
  if (!tpl) { go('#/manage'); return; }
  view.innerHTML = `
    <header class="page-head">
      <button class="icon-btn" data-a="back" aria-label="Back">‹</button>
      <h1>Edit session</h1>
    </header>
    <label class="field"><span>Name</span><input data-f="name" value="${esc(tpl.name)}"></label>
    <label class="field"><span>Note</span><input data-f="note" value="${esc(tpl.note || '')}" placeholder="optional"></label>
    <label class="check"><input type="checkbox" data-f="inRotation" ${tpl.inRotation ? 'checked' : ''}>
      <span>Part of the rotation (suggested as “next up”)</span></label>

    <h3 class="section-title">Exercises (in order)</h3>
    <div class="list">
      ${tpl.items.map((it, i) => {
        const x = exById(it.exerciseId);
        return `
        <div class="list-row">
          <button class="list-main" data-a="item" data-i="${i}">
            <span>${esc(x?.name || '(deleted exercise)')}${it.optional ? ' <span class="tag">optional</span>' : ''}</span>
            ${it.original ? `<small>Vincent: ${esc(it.original)}</small>` : ''}
          </button>
          <button class="icon-btn" data-a="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
          <button class="icon-btn" data-a="down" data-i="${i}" ${i === tpl.items.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
          <button class="icon-btn danger" data-a="del" data-i="${i}" aria-label="Remove">✕</button>
        </div>`;
      }).join('') || '<p class="muted">No exercises yet.</p>'}
    </div>
    <button class="btn btn-big" data-a="add">+ Add exercise</button>
    <button class="btn btn-link danger" data-a="deltpl">Delete this session</button>
  `;
  const rerender = () => renderTemplateEditor(view, id);

  view.onchange = async (e) => {
    const f = e.target.dataset.f;
    if (!f) return;
    tpl[f] = e.target.type === 'checkbox' ? e.target.checked : e.target.value.trim();
    if (f === 'name' && !tpl.name) tpl.name = 'Session';
    await save('templates', tpl);
    toast('Saved');
  };
  view.onclick = async (e) => {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    const a = t.dataset.a;
    const i = +t.dataset.i;
    if (a === 'back') go('#/manage');
    if (a === 'up' || a === 'down') {
      const j = a === 'up' ? i - 1 : i + 1;
      [tpl.items[i], tpl.items[j]] = [tpl.items[j], tpl.items[i]];
      await save('templates', tpl); rerender();
    }
    if (a === 'del') {
      if (await confirmDialog(`Remove “${exById(tpl.items[i].exerciseId)?.name || 'this exercise'}” from ${tpl.name}? (Your history is kept.)`, { yes: 'Remove', danger: true })) {
        tpl.items.splice(i, 1); await save('templates', tpl); rerender();
      }
    }
    if (a === 'add') {
      const exId = await pickExercise({ title: `Add to ${tpl.name}` });
      if (exId && exId !== '__remove') {
        tpl.items.push({ exerciseId: exId, original: '', optional: false, note: '', alternatives: [] });
        await save('templates', tpl); rerender();
      }
    }
    if (a === 'item') { await editItemModal(tpl, i); rerender(); }
    if (a === 'deltpl') {
      if (await confirmDialog(`Delete the session “${tpl.name}”? Past workouts stay in your history.`, { yes: 'Delete', danger: true })) {
        await remove('templates', tpl.id); go('#/manage');
      }
    }
  };
}

/** Edit how an exercise appears inside a session (Vincent's name, optional, alternatives…). */
function editItemModal(tpl, i) {
  return new Promise((resolve) => {
    const it = tpl.items[i];
    const body = () => `
      <div class="muted">Exercise</div>
      <button class="list-btn" data-m="change">${esc(exById(it.exerciseId)?.name || '(deleted)')}<small>Tap to change</small></button>
      <button class="btn" data-m="editex">Edit this exercise’s targets…</button>
      <label class="field"><span>Original exercise (Vincent)</span><input data-f="original" value="${esc(it.original || '')}" placeholder="optional"></label>
      <label class="field"><span>Note in this session</span><input data-f="note" value="${esc(it.note || '')}" placeholder="optional"></label>
      <label class="check"><input type="checkbox" data-f="optional" ${it.optional ? 'checked' : ''}><span>Optional exercise</span></label>
      <div class="muted">Suggested alternatives (shown first when swapping)</div>
      ${(it.alternatives || []).map((a, k) => `<div class="list-row"><span class="list-main">${esc(exById(a)?.name || '(deleted)')}</span>
        <button class="icon-btn danger" data-m="delalt" data-k="${k}" aria-label="Remove">✕</button></div>`).join('')}
      <button class="btn" data-m="addalt">+ Add alternative</button>
      <button class="btn btn-primary btn-big" data-m="close">Done</button>`;
    const { el } = modal({
      title: 'Exercise in session',
      body: body(),
      onClick: async (e, t) => {
        const m = t.dataset.m;
        if (m === 'change') {
          const id = await pickExercise({ title: 'Choose exercise', exclude: [it.exerciseId] });
          if (id && id !== '__remove') it.exerciseId = id;
        }
        if (m === 'editex') await editExerciseModal(exById(it.exerciseId));
        if (m === 'addalt') {
          const id = await pickExercise({ title: 'Add alternative', exclude: [it.exerciseId, ...(it.alternatives || [])] });
          if (id && id !== '__remove') it.alternatives = [...(it.alternatives || []), id];
        }
        if (m === 'delalt') it.alternatives.splice(+t.dataset.k, 1);
        await save('templates', tpl);
        el.querySelector('.modal-body').innerHTML = body();
      },
      onClose: resolve,
    });
    el.addEventListener('change', async (e) => {
      const f = e.target.dataset.f;
      if (!f) return;
      it[f] = e.target.type === 'checkbox' ? e.target.checked : e.target.value.trim();
      await save('templates', tpl);
    });
  });
}

// ---------- exercise editor (pop-up) ----------

/**
 * Create (ex = null) or edit an exercise.
 * Resolves with the saved exercise, or null if cancelled/deleted.
 */
export function editExerciseModal(ex) {
  const isNew = !ex;
  const d = ex ? { ...ex } : { id: uid(), name: '', type: 'weighted', targetSets: 4, targetReps: 8, targetTime: null, step: 1, defaultKg: null, note: '' };
  return new Promise((resolve) => {
    let result = null;
    const typeOpts = Object.entries(TYPE_LABELS).map(([k, v]) => `<option value="${k}" ${d.type === k ? 'selected' : ''}>${esc(v)}</option>`).join('');
    const used = !isNew && historyFor(d.id, S.workouts).length;
    const { el, close } = modal({
      title: isNew ? 'New exercise' : 'Edit exercise',
      body: `
        <form class="form" data-form onsubmit="return false">
          <label class="field"><span>Name</span><input name="name" value="${esc(d.name)}" placeholder="e.g. Rowing haltère" required></label>
          <label class="field"><span>Type</span><select name="type">${typeOpts}</select></label>
          <div class="grid2" data-show="sets">
            <label class="field"><span>Target sets</span><input name="targetSets" inputmode="numeric" value="${d.targetSets ?? ''}"></label>
            <label class="field"><span>Target reps <small>(empty = max)</small></span><input name="targetReps" inputmode="numeric" value="${d.targetReps ?? ''}"></label>
          </div>
          <div class="grid2" data-show="timed">
            <label class="field"><span>Target reps</span><input name="targetRepsT" inputmode="numeric" value="${d.targetReps ?? ''}"></label>
            <label class="field"><span>Target time (min:sec)</span><input name="targetTime" value="${d.targetTime ? fmtTime(d.targetTime) : ''}" placeholder="15:00"></label>
          </div>
          <div class="grid2" data-show="kg">
            <label class="field"><span>Weight step (kg)</span><input name="step" inputmode="decimal" value="${d.step ?? ''}" placeholder="1 or 2.5"></label>
            <label class="field"><span>Starting kg</span><input name="defaultKg" inputmode="decimal" value="${d.defaultKg ?? ''}" placeholder="optional"></label>
          </div>
          <p class="muted small" data-show="assisted">Assisted: enter the kg of ASSISTANCE. Less assistance = progress.</p>
          <label class="field"><span>Note</span><input name="note" value="${esc(d.note || '')}" placeholder="optional, e.g. kg per hand"></label>
          <button class="btn btn-primary btn-big" data-m="save">Save</button>
          ${isNew ? '' : `<button class="btn btn-link danger" data-m="delete">Delete exercise</button>`}
        </form>`,
      onClick: async (e, t, close) => {
        const form = el.querySelector('[data-form]');
        if (t.dataset.m === 'save') {
          const f = Object.fromEntries(new FormData(form));
          const num = (v) => (v === '' || v === undefined ? null : Number(String(v).replace(',', '.')));
          if (!f.name.trim()) { toast('Please enter a name'); return; }
          d.name = f.name.trim();
          d.type = f.type;
          d.note = f.note.trim();
          if (d.type === 'timed') {
            d.targetSets = 1;
            d.targetReps = num(f.targetRepsT);
            d.targetTime = parseTime(f.targetTime);
          } else if (d.type === 'video') {
            d.targetSets = 1; d.targetReps = null; d.targetTime = null;
          } else {
            d.targetSets = num(f.targetSets) || 1;
            d.targetReps = num(f.targetReps);
            d.targetTime = null;
          }
          if (d.type === 'weighted' || d.type === 'assisted') {
            d.step = num(f.step) || (d.type === 'assisted' ? 2.5 : 1);
            d.defaultKg = num(f.defaultKg);
          } else { d.step = null; d.defaultKg = null; }
          result = await save('exercises', d);
          toast('Exercise saved');
          close();
        }
        if (t.dataset.m === 'delete') {
          const msg = used
            ? `Delete “${d.name}”? It will be removed from your sessions. Past workouts keep their records.`
            : `Delete “${d.name}”?`;
          if (await confirmDialog(msg, { yes: 'Delete', danger: true })) {
            // Remove it from every session (as exercise or as alternative)
            for (const tpl of S.templates) {
              tpl.items = tpl.items.filter((it) => it.exerciseId !== d.id);
              tpl.items.forEach((it) => { it.alternatives = (it.alternatives || []).filter((a) => a !== d.id); });
              await save('templates', tpl);
            }
            await remove('exercises', d.id);
            close();
          }
        }
      },
      onClose: () => resolve(result),
    });
    // Show only the fields that matter for the chosen type
    const sync = () => {
      const type = el.querySelector('[name=type]').value;
      const show = { sets: ['weighted', 'assisted', 'bodyweight'], timed: ['timed'], kg: ['weighted', 'assisted'], assisted: ['assisted'] };
      el.querySelectorAll('[data-show]').forEach((n) => { n.hidden = !show[n.dataset.show].includes(type); });
    };
    el.querySelector('[name=type]').addEventListener('change', sync);
    sync();
    void close;
  });
}

// ---------- abs videos ----------

export function renderVideos(view) {
  const vids = [...S.videos].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const stats = videoStats(S.videos, S.workouts);
  view.innerHTML = `
    <header class="page-head">
      <button class="icon-btn" data-a="back" aria-label="Back">‹</button>
      <h1>Abs videos</h1>
    </header>
    <p class="muted">Each Abdos session suggests the video you haven’t done for the longest time.</p>
    ${vids.map((v, i) => `
      <section class="card">
        <label class="field"><span>Title</span><input data-id="${v.id}" data-f="title" value="${esc(v.title)}"></label>
        <label class="field"><span>YouTube link</span><input data-id="${v.id}" data-f="url" value="${esc(v.url)}" inputmode="url"></label>
        <div class="muted small">Done ${stats[v.id].count}×${stats[v.id].last ? ' · last on ' + new Date(stats[v.id].last).toLocaleDateString('en-GB') : ''}</div>
        <div class="btn-row">
          <a class="btn btn-sm" href="${esc(v.url)}" target="_blank" rel="noopener">▶ Open</a>
          <button class="btn btn-sm" data-a="up" data-i="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn btn-sm" data-a="down" data-i="${i}" ${i === vids.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn btn-sm danger" data-a="del" data-i="${i}">Delete</button>
        </div>
      </section>`).join('')}
    <button class="btn btn-big" data-a="add">+ Add video</button>`;

  view.onchange = async (e) => {
    const v = S.videos.find((x) => x.id === e.target.dataset.id);
    if (!v) return;
    v[e.target.dataset.f] = e.target.value.trim();
    await save('videos', v);
    toast('Saved');
  };
  view.onclick = async (e) => {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    const a = t.dataset.a, i = +t.dataset.i;
    if (a === 'back') go('#/manage');
    if (a === 'add') {
      await save('videos', { id: uid(), title: 'New video', url: 'https://youtu.be/', order: vids.length });
      renderVideos(view);
    }
    if (a === 'del' && await confirmDialog(`Delete “${vids[i].title}”?`, { yes: 'Delete', danger: true })) {
      await remove('videos', vids[i].id); renderVideos(view);
    }
    if (a === 'up' || a === 'down') {
      const j = a === 'up' ? i - 1 : i + 1;
      [vids[i], vids[j]] = [vids[j], vids[i]];
      for (let k = 0; k < vids.length; k++) { vids[k].order = k; await save('videos', vids[k]); }
      renderVideos(view);
    }
  };
}
