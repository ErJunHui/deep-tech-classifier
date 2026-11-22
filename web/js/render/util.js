/* Rendering helpers shared by the render modules. Ported from the prototype
   (prototypes/frontend/variants/workbench.js, "rendering helpers"). */
import { esc } from '../model.js';

/* The shell's named regions: <… data-r="key">. */
export const R = (key) => document.querySelector('[data-r="' + key + '"]');

/* Sets el's HTML, keeping focus (and a text field's selection) on the element
   with the same data-fk when the focused element was inside el. */
export function put(el, html) {
  if (!el) return;
  const a = document.activeElement;
  const fk = a && el.contains(a) ? a.getAttribute('data-fk') : null;
  let sel = null;
  if (fk) { try { if (a.selectionStart != null) sel = [a.selectionStart, a.selectionEnd]; } catch (e) { sel = null; } }
  el.innerHTML = html;
  if (fk) {
    const n = el.querySelector('[data-fk="' + fk + '"]');
    if (n) { n.focus({ preventScroll: true }); if (sel) { try { n.setSelectionRange(sel[0], sel[1]); } catch (e) { /* not a text field */ } } }
  }
}

export const MOD = /Mac|iPhone|iPad/.test((navigator.platform || '') + (navigator.userAgent || '')) ? '⌘' : 'Ctrl';
export const kbd = (...keys) => keys.map((k) => '<kbd>' + esc(k) + '</kbd>').join('');

/* The head's Runs button, which opens the run rail as a drawer. styles.css
   shows it only below 900px, where the rail is not a column. open: S.drawer. */
export const railBtn = (open) => '<button class="wb-btn wb-btn-sm wb-railbtn" data-act="drawer" data-fk="drawer" aria-controls="wb-rail" aria-expanded="' + !!open + '">Runs</button>';

/* The three criteria: [result.criteria key, mark letter, label]. */
export const CRIT = [['innovation', 'I', 'Innovation'], ['scientific_foundation', 'S', 'Scientific foundation'], ['proprietary_ip', 'P', 'Proprietary IP']];
