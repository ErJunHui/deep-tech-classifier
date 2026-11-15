/* Toasts, ported from the prototype: one at a time, a new message replaces
   the current one in place. title and body are text. */
import { esc } from '../model.js';
import { R, kbd } from './util.js';

let toastEl = null; let toastTimer = null; let toastGone = null;

/* opts.undo adds the prototype's Undo button (data-act="undo"). */
export function toast(title, body, opts) {
  const host = R('toasts');
  if (!host) return;
  const html = '<div><b>' + esc(title) + '</b>' + (body ? '<span>' + esc(body) + '</span>' : '') + '</div>' +
    (opts && opts.undo ? '<button class="wb-toast-btn" data-act="undo">Undo ' + kbd('U') + '</button>' : '');
  clearTimeout(toastTimer); clearTimeout(toastGone);
  if (toastEl && toastEl.isConnected && !toastEl.classList.contains('is-leaving')) {
    toastEl.innerHTML = html;
  } else {
    host.innerHTML = '';
    toastEl = document.createElement('div');
    toastEl.className = 'wb-toast';
    toastEl.innerHTML = html;
    host.appendChild(toastEl);
  }
  const el = toastEl;
  toastTimer = setTimeout(() => {
    el.classList.add('is-leaving');
    toastGone = setTimeout(() => { el.remove(); if (toastEl === el) toastEl = null; }, 170);
  }, opts && opts.undo ? 5200 : 3400);
}
