// =============================================================
// Home screen: weekly counter, suggested session, start button.
// =============================================================

import { S, settings, tplById, setMeta } from '../store.js';
import { countThisWeek, nextRotationTemplate, sortedTemplates, needsBackupReminder, fmtDate } from '../logic.js';
import { esc } from '../ui.js';
import { startWorkout } from './session.js';
import { go } from '../app.js';

let selectedId = null; // session picked on the home screen

export function renderHome(view) {
  const goal = settings().weeklyGoal || 4;
  const count = countThisWeek(S.workouts);
  const next = nextRotationTemplate(S.templates, S.workouts);
  if (!selectedId || !tplById(selectedId)) selectedId = next?.id;
  const templates = sortedTemplates(S.templates);
  const active = S.meta.active;
  const showBackup = needsBackupReminder({
    lastBackupAt: S.meta.lastBackupAt,
    installedAt: S.meta.installedAt,
    snoozedUntil: S.meta.backupSnoozedUntil,
  });

  const dots = Array.from({ length: Math.max(goal, count) }, (_, i) =>
    `<span class="week-dot ${i < count ? 'on' : ''}"></span>`).join('');

  view.innerHTML = `
    <header class="page-head"><h1>Gym Tracker</h1></header>

    ${showBackup ? `
      <div class="banner">
        <div>💾 It’s been a while since your last backup${S.meta.lastBackupAt ? ` (${fmtDate(S.meta.lastBackupAt)})` : ''}. Save a copy of your data?</div>
        <div class="btn-row">
          <button class="btn" data-a="snooze">Later</button>
          <button class="btn btn-primary" data-a="backup">Back up</button>
        </div>
      </div>` : ''}

    <section class="card week-card">
      <div class="week-num"><span class="big-num">${count}</span><span class="of">/ ${goal}</span></div>
      <div class="muted">sessions this week</div>
      <div class="week-dots">${dots}</div>
      ${count >= goal ? '<div class="good">Weekly goal reached 🎉</div>' : ''}
    </section>

    ${active ? `
      <section class="card">
        <div class="muted">Session in progress</div>
        <h2>${esc(active.name)}</h2>
        <button class="btn btn-primary btn-huge" data-a="resume">Resume session</button>
      </section>` : `
      <section>
        <h3 class="section-title">Choose a session</h3>
        <div class="tpl-list">
          ${templates.map((t) => `
            <button class="tpl-btn ${t.id === selectedId ? 'selected' : ''}" data-a="pick" data-id="${t.id}">
              <span class="tpl-name">${esc(t.name)}</span>
              <span class="tpl-sub">${t.items.length} exercises${t.id === next?.id ? ' · <b class="accent">Next up</b>' : ''}${!t.inRotation ? ' · extra' : ''}</span>
            </button>`).join('')}
        </div>
      </section>
      <button class="btn btn-primary btn-huge sticky-cta" data-a="start" ${selectedId ? '' : 'disabled'}>
        Start session${selectedId ? `<small>${esc(tplById(selectedId)?.name || '')}</small>` : ''}
      </button>`}
  `;

  view.onclick = async (e) => {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    const a = t.dataset.a;
    if (a === 'pick') { selectedId = t.dataset.id; renderHome(view); }
    if (a === 'start') { await startWorkout(selectedId); go('#/session'); }
    if (a === 'resume') go('#/session');
    if (a === 'backup') go('#/settings');
    if (a === 'snooze') {
      await setMeta('backupSnoozedUntil', new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString());
      renderHome(view);
    }
  };
}
