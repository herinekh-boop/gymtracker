// =============================================================
// Settings: timers, weekly goal, sound, backup export / import.
// =============================================================

import { S, setMeta, settings, exportData, importData } from '../store.js';
import { fmtDate } from '../logic.js';
import { esc, toast, confirmDialog } from '../ui.js';
import { beep, unlockAudio } from '../timer.js';
import { APP_VERSION } from '../app.js';
import { replaceAll } from '../db.js';

export function renderSettings(view) {
  const st = settings();
  const last = S.meta.lastBackupAt;
  view.innerHTML = `
    <header class="page-head"><h1>Settings</h1></header>

    <section class="card">
      <h2>Timers</h2>
      <div class="grid2">
        <label class="field"><span>Rest between sets (sec)</span><input inputmode="numeric" data-s="restSec" value="${st.restSec}"></label>
        <label class="field"><span>Before next exercise (sec)</span><input inputmode="numeric" data-s="nextSec" value="${st.nextSec}"></label>
      </div>
      <label class="check"><input type="checkbox" data-s="sound" ${st.sound ? 'checked' : ''}><span>Beep when a timer ends</span></label>
      <button class="btn" data-a="testsound">🔊 Test sound</button>
      <p class="muted small">iPhone: the beep follows the ring/silent switch, and can’t play while the screen is locked.</p>
      <label class="check"><input type="checkbox" data-s="wakeLock" ${st.wakeLock ? 'checked' : ''}><span>Keep the screen on during a session</span></label>
    </section>

    <section class="card">
      <h2>Weekly goal</h2>
      <label class="field"><span>Sessions per week</span><input inputmode="numeric" data-s="weeklyGoal" value="${st.weeklyGoal}"></label>
    </section>

    <section class="card">
      <h2>💾 Backup</h2>
      <p>Your data lives only on this phone. Save a backup file regularly (to Files or Google Drive) so you never lose it.</p>
      <p class="muted small">Last backup: ${last ? esc(fmtDate(last, { day: 'numeric', month: 'long', year: 'numeric' })) : 'never'}</p>
      <button class="btn btn-primary btn-big" data-a="export">Export backup</button>
      <label class="btn btn-big file-btn">Import backup…
        <input type="file" accept="application/json,.json" data-a="import" hidden></label>
      <p class="muted small">Importing replaces ALL data on this phone with the file’s content.</p>
    </section>

    <section class="card">
      <h2>About</h2>
      <p class="muted small">Gym Tracker v${APP_VERSION} · works offline · data stored on this device only.</p>
      <p class="muted small">${S.workouts.length} sessions · ${S.exercises.length} exercises</p>
      <button class="btn btn-link danger" data-a="reset">Reset app to starting data…</button>
    </section>`;

  view.onchange = async (e) => {
    const t = e.target;
    if (t.dataset.s) {
      const key = t.dataset.s;
      const val = t.type === 'checkbox' ? t.checked : Math.max(0, parseInt(t.value, 10) || 0);
      await setMeta('settings', { ...settings(), [key]: val });
      toast('Saved');
    }
    if (t.dataset.a === 'import' && t.files[0]) {
      await doImport(t.files[0]);
      t.value = '';
      renderSettings(view);
    }
  };
  view.onclick = async (e) => {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    if (t.dataset.a === 'testsound') { unlockAudio(); const was = settings().sound; settings().sound = true; beep(); settings().sound = was; }
    if (t.dataset.a === 'export') { await doExport(); renderSettings(view); }
    if (t.dataset.a === 'reset') {
      if (await confirmDialog('Erase ALL your data and go back to the starting data? Export a backup first!', { yes: 'Erase everything', danger: true })
        && await confirmDialog('Really sure? This cannot be undone.', { yes: 'Yes, erase', danger: true })) {
        // Empty every store; on reload the app starts fresh with the starting data
        await replaceAll({ exercises: [], templates: [], workouts: [], videos: [], meta: [] });
        location.reload();
      }
    }
  };
}

/** Save a JSON file. On iPhone this opens the Share sheet → “Save to Files” / Google Drive. */
export async function doExport() {
  const data = exportData();
  const text = JSON.stringify(data, null, 1);
  const d = new Date();
  const name = `gymtracker-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
  const file = new File([text], name, { type: 'application/json' });
  let ok = false;
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Gym Tracker backup' });
      ok = true;
    }
  } catch (err) {
    if (err.name === 'AbortError') return; // user closed the share sheet
  }
  if (!ok) {
    // Fallback: normal download
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  await setMeta('lastBackupAt', new Date().toISOString());
  await setMeta('backupSnoozedUntil', null);
  toast('Backup exported ✓');
}

export async function doImport(file) {
  let json;
  try { json = JSON.parse(await file.text()); } catch { toast('This file is not a valid backup.'); return false; }
  const n = json?.data?.workouts?.length ?? 0;
  if (!(await confirmDialog(`Replace everything on this phone with this backup (${n} sessions)?`, { yes: 'Import', danger: true }))) return false;
  try {
    await importData(json);
    toast('Backup imported ✓');
    return true;
  } catch (err) {
    toast(err.message || 'Import failed');
    return false;
  }
}
