// =============================================================
// app.js — starts the app and switches between screens.
//
// Screens are chosen by the part of the address after "#":
//   #/home  #/session  #/summary/<id>  #/history  #/exercise/<id>
//   #/workout/<id>  #/manage  #/manage/session/<id>  #/manage/videos
//   #/settings
// =============================================================

import { S, loadAll } from './store.js';
import { initTimer, renderTimer } from './timer.js';
import { renderHome } from './views/home.js';
import { renderSession, renderSummary } from './views/session.js';
import { renderHistory, renderExercise, renderWorkout } from './views/history.js';
import { renderManage, renderTemplateEditor, renderVideos } from './views/manage.js';
import { renderSettings } from './views/settings.js';

// Shown in Settings. Bump together with VERSION in sw.js when you update.
export const APP_VERSION = '1.0.0';

export function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

const TABS = [
  { hash: '#/home', icon: '🏠', label: 'Home' },
  { hash: '#/history', icon: '📅', label: 'History' },
  { hash: '#/manage', icon: '🛠', label: 'Manage' },
  { hash: '#/settings', icon: '⚙️', label: 'Settings' },
];

function renderTabs(current) {
  const nav = document.getElementById('tabbar');
  const inSession = current.startsWith('#/session');
  nav.hidden = inSession; // full screen while training
  document.body.classList.toggle('in-session', inSession);
  const section = '#/' + (current.split('/')[1] || 'home');
  const map = { '#/exercise': '#/history', '#/workout': '#/history', '#/summary': '#/home' };
  const activeTab = map[section] || section;
  nav.innerHTML = TABS.map((t) => `
    <a href="${t.hash}" class="tab ${t.hash === activeTab ? 'active' : ''}">
      <span class="tab-icon">${t.icon}</span><span>${t.label}</span>
      ${t.hash === '#/home' && S.meta.active && !inSession ? '<i class="tab-badge"></i>' : ''}
    </a>`).join('');
}

function route() {
  const hash = location.hash || '#/home';
  const [, section, a, b] = hash.split('/');
  const view = document.getElementById('view');
  // Reset handlers left by the previous screen
  view.onclick = view.onchange = view.oninput = null;
  renderTabs(hash);

  switch (section) {
    case 'session': renderSession(view); break;
    case 'summary': renderSummary(view, a); break;
    case 'history': renderHistory(view); break;
    case 'exercise': renderExercise(view, a); break;
    case 'workout': renderWorkout(view, a); break;
    case 'manage':
      if (a === 'session') renderTemplateEditor(view, b);
      else if (a === 'videos') renderVideos(view);
      else renderManage(view);
      break;
    case 'settings': renderSettings(view); break;
    default: renderHome(view);
  }
  renderTimer();
  window.scrollTo(0, 0);
}

// ---------- offline support & updates ----------

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const showUpdate = () => {
      const bar = document.getElementById('update-bar');
      bar.hidden = false;
      bar.onclick = () => reg.waiting?.postMessage('skipWaiting');
    };
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate();
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdate();
      });
    });
    // Check for a new version each time the app comes back to the screen
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
  // Reload once when a NEW version takes over (not on the very first install)
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !hadController) return;
    reloaded = true;
    location.reload();
  });
}

// ---------- start ----------

async function boot() {
  try {
    await loadAll();
  } catch (err) {
    document.getElementById('view').innerHTML =
      `<p class="card">Could not open the app’s storage. If you’re in Private Browsing, switch it off.<br><small>${err}</small></p>`;
    return;
  }
  // Ask the browser to never auto-delete our data
  navigator.storage?.persist?.().catch(() => {});
  initTimer();
  window.addEventListener('hashchange', route);
  // Closed the app mid-session? Go straight back to it.
  if (S.meta.active && (!location.hash || location.hash === '#/home')) location.hash = '#/session';
  route();
  registerServiceWorker();
}

boot();
