/* Rendering helpers shared by the render modules. Ported from the prototype
   (prototypes/frontend/variants/workbench.js, "rendering helpers"). */
import { esc, vLabel, vLow } from '../model.js';

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

const vClass = (v) => (v === 'deep tech' ? 'is-deep' : 'is-gen');
/* The three criteria: [result.criteria key, mark letter, label]. */
export const CRIT = [['innovation', 'I', 'Innovation'], ['scientific_foundation', 'S', 'Scientific foundation'], ['proprietary_ip', 'P', 'Proprietary IP']];

export const verdictHtml = (v) => '<span class="wb-verdict ' + vClass(v) + '" title="' + vLabel(v) + '"><span class="wb-vtxt">' + vLabel(v) + '</span></span>';
/* The verdict cell of a row whose classification ended in an error. */
export const errorVerdictHtml = () => '<span class="wb-verdict is-error" title="Error"><span class="wb-vtxt">Error</span></span>';
export const riskHtml = (r) => '<span class="wb-risk r-' + esc(r) + '">' + esc(r) + '</span>';
/* criteria: result.criteria, {innovation: {met, reasoning}, …}; a missing
   criterion reads as not met. */
export function marksHtml(criteria) {
  const met = (k) => !!(criteria && criteria[k] && criteria[k].met);
  const label = CRIT.map((x) => x[2] + (met(x[0]) ? ' met' : ' not met')).join(', ');
  return '<span class="wb-mks" role="img" aria-label="' + label + '">' + CRIT.map((x) => {
    const m = met(x[0]);
    return '<span class="wb-mk ' + (m ? 'is-y' : 'is-n') + '" title="' + x[2] + ': ' + (m ? 'met' : 'not met') + '" aria-hidden="true">' + (m ? '✓' : x[1]) + '</span>';
  }).join('') + '</span>';
}
/* v: a rowView. */
export const revTag = (v) => v.reclassified
  ? '<span class="wb-revtag is-re" title="Reclassified from ' + vLow(v.r.verdict) + '">↺<span class="wb-revtag-t"> Reclassified</span></span>'
  : v.confirmed ? '<span class="wb-revtag" title="Reviewed: pipeline verdict confirmed">✓<span class="wb-revtag-t"> Reviewed</span></span>' : '';
