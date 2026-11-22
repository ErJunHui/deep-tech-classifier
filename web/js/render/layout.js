/* The small-screen layout (below model.NARROW_BELOW): applies S.narrow,
   S.drawer and S.panel to the workbench's classes, and keeps what is covered
   out of reach. The run drawer covers the main column and the evidence panel;
   the open evidence panel covers the main column. Covered regions are inert,
   so Tab and screen readers stay in what is on top. commands.js changes the
   state and calls syncLayout; state.renderAll calls it on every full render. */
import { S, setupShown } from '../store.js';
import { R } from './util.js';

const root = () => document.querySelector('.v-workbench');

/* motion: true for a pointer-triggered open or close, which slides
   (styles.css .is-motion); false for a keyboard-triggered one, which switches
   at once. Left out (a re-render) it stays as it is, so a render landing
   mid-slide, like a run opened from the drawer, does not cut the slide short. */
export function syncLayout(motion) {
  const r = root();
  if (!r) return;
  // Setup has no evidence panel; the panel stays shut until a row is picked again.
  if (!S.narrow || setupShown()) S.panel = false;
  if (!S.narrow) S.drawer = false;
  if (typeof motion === 'boolean') r.classList.toggle('is-motion', motion);
  r.classList.toggle('is-narrow', S.narrow);
  r.classList.toggle('is-drawer', S.drawer);
  r.classList.toggle('is-panel', S.panel);
  // Reading view widens a column; one column has none to widen.
  r.classList.toggle('is-reading', S.reading && !S.narrow);
  R('main').inert = S.drawer || S.panel;
  r.querySelector('.wb-side').inert = S.drawer || (S.narrow && !S.panel);
  const b = R('head') && R('head').querySelector('[data-fk="drawer"]');
  if (b) b.setAttribute('aria-expanded', String(S.drawer));
}
