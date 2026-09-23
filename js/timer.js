// =============================================================
// timer.js — rest timer + sound.
//
// The timer stores the END TIME (a timestamp), not a countdown.
// Every quarter second we compute "end time − now". So if the phone
// locks or you switch apps, the time is still right when you come back.
// The timer is saved with the active session, so it even survives
// closing the app.
// =============================================================

import { S, setMeta, settings } from './store.js';
import { fmtTime } from './logic.js';
import { esc } from './ui.js';

let audioCtx = null;

/** iPhone only allows sound after a tap: call this on taps. */
export function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) { /* no audio available */ }
}

/** Three short beeps. */
export function beep() {
  if (!settings()?.sound) return;
  try {
    unlockAudio();
    const t0 = audioCtx.currentTime + 0.05;
    [0, 0.25, 0.5].forEach((offset, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = i === 2 ? 1320 : 880;
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.6, t0 + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.2);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.22);
    });
  } catch (e) { /* ignore */ }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

const SHOW_DONE_MS = 4000; // how long "Go!" stays on screen

function persist() {
  return setMeta('active', S.meta.active);
}

/** Start a timer. kind: 'rest' (between sets) or 'next' (before next exercise). */
export function startTimer(seconds, kind, label = '') {
  const a = S.meta.active;
  if (!a || !seconds) return;
  a.timer = { endsAt: Date.now() + seconds * 1000, total: seconds, kind, label, fired: false };
  persist();
  renderTimer();
}

export function skipTimer() {
  if (!S.meta.active) return;
  S.meta.active.timer = null;
  persist();
  renderTimer();
}

export function addTime(sec) {
  const t = S.meta.active?.timer;
  if (!t) return;
  // If the timer already finished, restart from now
  const base = Math.max(t.endsAt, Date.now());
  t.endsAt = base + sec * 1000;
  t.total += sec;
  t.fired = false;
  persist();
  renderTimer();
}

/** Draw (or hide) the timer bar at the bottom of the screen. */
export function renderTimer() {
  const el = document.getElementById('timer');
  const t = S.meta.active?.timer;
  const onSession = location.hash.startsWith('#/session');
  if (!t || !onSession) {
    el.className = '';
    el.innerHTML = '';
    document.body.classList.remove('has-timer');
    return;
  }
  const now = Date.now();
  const left = Math.ceil((t.endsAt - now) / 1000);

  if (left <= 0) {
    if (!t.fired) {
      t.fired = true;
      persist();
      // Only beep if we're close to the real end (not when coming back 10 min later)
      if (now - t.endsAt < 15000) beep();
    }
    if (now - t.endsAt > SHOW_DONE_MS) {
      S.meta.active.timer = null;
      persist();
      return renderTimer();
    }
  }
  const done = left <= 0;
  const pct = done ? 100 : Math.min(100, ((t.total - left) / t.total) * 100);
  const title = t.kind === 'next' ? 'Next exercise in' : 'Rest';
  document.body.classList.add('has-timer');
  el.className = 'show' + (done ? ' done' : '');
  // Only rebuild HTML when something visible changed (keeps buttons responsive)
  const key = `${done}|${left}|${t.label}|${t.kind}`;
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.innerHTML = `
    <div class="timer-bar" style="width:${pct}%"></div>
    <div class="timer-inner">
      <div class="timer-text">
        <div class="timer-title">${done ? 'Time’s up — go! 💪' : esc(title)}</div>
        ${t.label ? `<div class="timer-label">${esc(t.label)}</div>` : ''}
      </div>
      <div class="timer-num">${done ? '0:00' : fmtTime(left)}</div>
      <div class="timer-btns">
        <button class="btn timer-btn" data-timer="add">+15s</button>
        <button class="btn timer-btn" data-timer="skip">${done ? 'OK' : 'Skip'}</button>
      </div>
    </div>`;
}

export function initTimer() {
  setInterval(renderTimer, 250);
  document.addEventListener('visibilitychange', renderTimer);
  document.getElementById('timer').addEventListener('click', (e) => {
    const b = e.target.closest('[data-timer]');
    if (!b) return;
    unlockAudio();
    if (b.dataset.timer === 'skip') skipTimer();
    if (b.dataset.timer === 'add') addTime(15);
  });
  // Any tap anywhere "unlocks" sound on iPhone
  document.addEventListener('pointerdown', unlockAudio, { passive: true });
}
