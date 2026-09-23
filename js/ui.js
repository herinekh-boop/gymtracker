// =============================================================
// ui.js — small reusable screen helpers (pop-ups, toasts, etc.)
// =============================================================

/** Make text safe to put inside HTML. Always use for user text! */
export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- toast (little message at the top) ----------
let toastTimer;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ---------- modal (pop-up sheet from the bottom) ----------
/**
 * modal({ title, body, onClick, onClose })
 *   body    : HTML string
 *   onClick : (event, target, close) => void — clicks on [data-m] elements
 * Returns { el, close }.
 */
export function modal({ title = '', body = '', onClick, onClose, onInput }) {
  const root = $('#modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h2>${esc(title)}</h2>
        <button class="icon-btn" data-m="close" aria-label="Close">✕</button>
      </div>
      <div class="modal-body">${body}</div>
    </div>`;
  root.appendChild(wrap);
  document.body.classList.add('modal-open');

  const close = () => {
    wrap.remove();
    if (!root.children.length) document.body.classList.remove('modal-open');
    onClose && onClose();
  };
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) return close(); // tap outside
    const t = e.target.closest('[data-m]');
    if (!t) return;
    if (t.dataset.m === 'close') return close();
    onClick && onClick(e, t, close);
  });
  if (onInput) wrap.addEventListener('input', (e) => onInput(e, wrap));
  return { el: wrap, close };
}

/** Promise-based yes/no question. */
export function confirmDialog(message, { yes = 'Yes', no = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const { close } = modal({
      title: 'Are you sure?',
      body: `<p class="modal-text">${esc(message)}</p>
        <div class="btn-row">
          <button class="btn" data-m="no">${esc(no)}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-m="yes">${esc(yes)}</button>
        </div>`,
      onClick: (e, t, close) => {
        answered = true;
        close();
        resolve(t.dataset.m === 'yes');
      },
      onClose: () => { if (!answered) resolve(false); },
    });
    void close;
  });
}

/** Choose between several buttons. Resolves with the chosen value (or null). */
export function choiceDialog(title, message, choices) {
  return new Promise((resolve) => {
    let answered = false;
    modal({
      title,
      body: `${message ? `<p class="modal-text">${esc(message)}</p>` : ''}
        <div class="stack">
          ${choices.map((c, i) => `<button class="btn btn-big ${c.primary ? 'btn-primary' : ''}" data-m="c" data-i="${i}">
            ${esc(c.label)}${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</button>`).join('')}
        </div>`,
      onClick: (e, t, close) => {
        answered = true;
        close();
        resolve(choices[+t.dataset.i].value);
      },
      onClose: () => { if (!answered) resolve(null); },
    });
  });
}

/**
 * A big −/+ number control.
 *   field : name used by the event handler ('kg', 'reps', 'time')
 *   value : current value (null shows "–")
 *   attrs : extra data-attributes string, e.g. 'data-e="0" data-s="1"'
 */
export function stepperHTML({ field, value, label, attrs = '', display }) {
  const shown = display !== undefined ? display : value === null || value === undefined ? '' : value;
  return `
    <div class="stepper" data-field="${field}" ${attrs}>
      <div class="stepper-label">${esc(label)}</div>
      <div class="stepper-row">
        <button class="step-btn" data-act="dec" aria-label="Less ${esc(label)}">−</button>
        <input class="step-input" data-act="input" inputmode="${field === 'time' ? 'text' : 'decimal'}"
          value="${esc(shown)}" placeholder="–" aria-label="${esc(label)}">
        <button class="step-btn" data-act="inc" aria-label="More ${esc(label)}">+</button>
      </div>
    </div>`;
}
