/* Commands that act on the view rather than a row: the command menu and the
   shortcuts sheet, reading view, the evidence panel's width (the divider),
   the filter shortcuts, Stop/Resume and the workbook download, and the
   layout kept in localStorage ('dtc.ui'). Ported from the prototype's CMDS,
   openHelp, paletteItems, openPalette, renderPalette, runPalette,
   closeModal, toggleReading, toggleNeeds, focusChips, focusSearch,
   stopOrResume, setPanelW/resetPanelW, the divider's pointer handlers,
   download, and onRootKey's modal and divider keys. The pure rules are in
   model.js, the modal HTML in render/modal.js. events.js binds these and
   registers the row actions it owns (registerActions). */
import * as api from './api.js';
import { clamp, counts, dateLabel, paletteItems, downloadToast, panelWidth, parseUi, uiToStore } from './model.js';
import { S, refreshView, stopActive, resumeActive, resumable } from './state.js';
import { openSetup, showRun } from './setup.js';
import { setupShown } from './store.js';
import { undo } from './decisions.js';
import { R, MOD } from './render/util.js';
import { renderStrip } from './render/strip.js';
import { renderChips } from './render/chips.js';
import { renderTable, rowBtn } from './render/table.js';
import { railStatus } from './render/rail.js';
import { closePop } from './render/setup.js';
import { toast } from './render/toast.js';
import { renderHelp, renderPaletteShell, renderPaletteList, clearModal } from './render/modal.js';

const root = () => document.querySelector('.v-workbench');

/* ---------- commands (shortcuts sheet + command menu) ----------
   act names the action the command menu runs (actions below); menu: false
   lists it in the sheet only; setup: true keeps it in the menu while a new
   run is being set up. */
export const CMDS = [
  { g: 'Navigate', l: 'Next row', k: ['J', '↓'], act: 'next' },
  { g: 'Navigate', l: 'Previous row', k: ['K', '↑'], act: 'prev' },
  { g: 'Navigate', l: 'First row', k: ['Home'], act: 'first' },
  { g: 'Navigate', l: 'Last row', k: ['End'], act: 'last' },
  { g: 'Navigate', l: 'Next company needing review', k: ['N'], act: 'next-open' },
  { g: 'Navigate', l: 'Previous company needing review', k: ['⇧', 'N'], act: 'prev-open' },
  { g: 'Navigate', l: 'Search companies', k: ['/'], act: 'search' },
  { g: 'Navigate', l: 'Focus the filter chips', k: ['F'], act: 'chips' },
  { g: 'Navigate', l: 'Command menu', k: [MOD, 'K'], menu: false, setup: true },
  { g: 'Decide', l: 'Confirm the pipeline verdict (flagged row)', k: ['C'], act: 'confirm' },
  { g: 'Decide', l: 'Change or reclassify the verdict', k: ['X'], act: 'change' },
  { g: 'Decide', l: 'Write a note', k: ['M'], act: 'note' },
  { g: 'Decide', l: 'Record the decision (in the note)', k: [MOD, '↵'], menu: false },
  { g: 'Decide', l: 'Undo the last reviewer action', k: ['U'], act: 'undo' },
  { g: 'View', l: 'Reading view', k: ['E'], act: 'reading' },
  { g: 'View', l: 'Needs review only', k: ['A'], act: 'needs' },
  { g: 'View', l: 'Keyboard shortcuts', k: ['?'], act: 'help', setup: true },
  { g: 'View', l: 'Leave the note, close the form or reading view', k: ['Esc'], menu: false },
  { g: 'View', l: 'Resize the panel (divider focused)', k: ['↑', '↓', '[', ']'], menu: false },
  { g: 'View', l: 'Reset the panel width', k: ['Double-click'], menu: false },
  { g: 'Run', l: 'New run: set it up in the table', k: ['O'], act: 'new-run', setup: true },
  { g: 'Run', l: 'Cancel the new run (or close its menu)', k: ['Esc'], menu: false, setup: true },
  { g: 'Run', l: 'Download Excel', k: ['D'], act: 'download' },
  { g: 'Run', l: 'Stop or resume the active run', k: ['S'], act: 'stop-resume' },
];

/* What the command menu runs, by act. 'run' and 'company' take the item's
   id. The row actions (next, prev, first, last, next-open, prev-open,
   confirm, change, note, company) are events.js's, added by
   registerActions. */
const actions = {
  search: () => focusSearch(), chips: () => focusChips(), undo: () => undo(),
  reading: () => toggleReading(), needs: () => toggleNeeds(), help: () => openHelp(),
  'reset-width': () => resetPanelW(), 'new-run': () => openSetup(null),
  download: () => download(), 'stop-resume': () => stopOrResume(),
  run: (id) => showRun(id),
};
export function registerActions(more) { Object.assign(actions, more); }

/* ---------- modal: shortcuts sheet and command menu ----------
   S.modal is {type: 'help' | 'palette', ret} (ret: the element focused
   before it opened); the palette adds q, active and items. Neither opens
   over the analyst sheet. */
export function openHelp() {
  if (S.analyst) return;
  if (S.modal) closeModal(false);
  closePop(false);
  S.modal = { type: 'help', ret: document.activeElement };
  renderHelp(CMDS);
}

/* The command menu shows at most this many items. */
const PALETTE_MAX = 80;
export function openPalette() {
  if (S.analyst) return;
  if (S.modal) closeModal(false);
  closePop(false);
  S.modal = { type: 'palette', ret: document.activeElement, q: '', active: 0, items: [] };
  renderPaletteShell();
  renderPalette();
}
export function renderPalette() {
  const m = S.modal;
  if (!m || m.type !== 'palette') return;
  const now = new Date();
  const runs = S.runs.map((r) => ({ id: r.id, file: r.file, sub: [dateLabel(r.createdAt, now), railStatus(r).text].filter(Boolean).join(' · ') }));
  m.items = paletteItems(m.q, {
    cmds: CMDS, runs, rows: S.active ? S.active.rows : null, activeId: S.active ? S.active.run.id : null, setup: setupShown(),
  }).slice(0, PALETTE_MAX);
  m.active = clamp(m.active, 0, Math.max(0, m.items.length - 1));
  renderPaletteList(m);
}
/* The search field changed. */
export function paletteQuery(q) {
  const m = S.modal;
  if (!m || m.type !== 'palette') return;
  m.q = q; m.active = 0;
  renderPalette();
}
export function runPalette(i) {
  const m = S.modal;
  if (!m || m.type !== 'palette') return;
  const it = m.items[i];
  if (!it) return;
  closeModal(false);
  const fn = actions[it.act];
  if (fn) fn(it.id);
}
/* restoreFocus (default true): focus goes back to where it was. */
export function closeModal(restoreFocus) {
  const m = S.modal;
  if (!m) return;
  S.modal = null;
  clearModal();
  if (restoreFocus !== false && m.ret && root().contains(m.ret) && m.ret.focus) m.ret.focus({ preventScroll: true });
}
/* Keys inside the modal: Esc closes it; the menu moves with the arrow keys
   and runs on Enter; ? closes the sheet; Tab stays put. */
export function modalKey(e) {
  const m = S.modal;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeModal(); return; }
  if (m.type === 'palette') {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (m.items.length) { m.active = (m.active + (e.key === 'ArrowDown' ? 1 : -1) + m.items.length) % m.items.length; renderPaletteList(m); }
    } else if (e.key === 'Enter') { e.preventDefault(); runPalette(m.active); }
    else if (e.key === 'Tab') e.preventDefault();
  } else if (e.key === 'Tab') e.preventDefault();
  else if (e.key === '?') { e.preventDefault(); e.stopPropagation(); closeModal(); }
}

/* ---------- filters and the run ---------- */
export function refreshFilters() {
  refreshView(true);
  renderStrip(); renderChips(); renderTable();
}
export function toggleNeeds() {
  if (!S.active) return;
  const on = S.f.status.size === 1 && S.f.status.has('open');
  S.f.status = on ? new Set() : new Set(['open']);
  refreshFilters();
}
export function focusChips() {
  if (R('tools').hidden) return;
  if (getComputedStyle(R('chips')).display === 'none') { S.filtersOpen = true; renderChips(); }
  const c = R('chips').querySelector('.wb-chip'); if (c) c.focus();
}
export function focusSearch() {
  const s = document.querySelector('[data-fk="search"]');
  if (s && !R('tools').hidden) s.focus();
}
export function stopOrResume() {
  if (!S.active) return;
  const run = S.active.run;
  if (run.status === 'running') stopActive();
  else if (resumable(run)) resumeActive();
  else toast('No run in progress', 'S stops a running run or resumes a stopped one.');
}

/* Downloads the open run's workbook (the partial one while it is not
   complete) through a hidden link, and says what was saved; before the
   first company finishes it only says there is nothing yet. */
export function download() {
  const a = S.active;
  if (!a) return;
  const t = downloadToast(a.run, counts(a.rows));
  if (t.download) {
    const link = document.createElement('a');
    link.href = api.exportUrl(a.run.id);
    link.download = ''; // the server names the file
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  toast(t.title, t.body);
}

/* ---------- reading view ---------- */
/* force: true or false sets it, otherwise it toggles. */
export function toggleReading(force) {
  S.reading = typeof force === 'boolean' ? force : !S.reading;
  root().classList.toggle('is-reading', S.reading);
  const top = R('detail').querySelector('[data-fk="reading"]');
  if (top) {
    top.setAttribute('aria-pressed', String(S.reading));
    top.title = (S.reading ? 'Back to the table layout' : 'Give the evidence most of the screen') + ' (E)';
    top.textContent = S.reading ? 'Exit reading view' : 'Reading view';
  }
  const b = S.selected != null && rowBtn(S.selected);
  if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest' });
  saveUi();
}

/* ---------- panel width (divider) ---------- */
const maxW = () => (root().clientWidth - R('rail').parentElement.offsetWidth) * 0.6;
const currentW = () => root().querySelector('.wb-side').getBoundingClientRect().width;
function setPanelW(w) {
  S.detailW = panelWidth(w, maxW());
  root().style.setProperty('--wb-detail', S.detailW + 'px');
  R('divider').setAttribute('aria-valuenow', String(S.detailW));
}
export function resetPanelW() {
  S.detailW = null;
  root().style.removeProperty('--wb-detail');
  R('divider').removeAttribute('aria-valuenow');
  saveUi();
}
let drag = null;
export function onDividerDown(e) {
  const d = e.target.closest && e.target.closest('[data-r="divider"]');
  if (!d || e.button !== 0) return;
  e.preventDefault();
  d.setPointerCapture(e.pointerId);
  drag = { id: e.pointerId, x: e.clientX, w: currentW() };
  root().classList.add('is-resizing');
}
export function onDividerMove(e) {
  if (drag && e.pointerId === drag.id) setPanelW(drag.w + (drag.x - e.clientX));
}
export function onDividerUp(e) {
  if (!drag || e.pointerId !== drag.id) return;
  try { R('divider').releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
  drag = null;
  root().classList.remove('is-resizing');
  saveUi();
}
export function onDividerDblClick(e) {
  if (e.target.closest && e.target.closest('[data-r="divider"]')) resetPanelW();
}
/* Keys on the focused divider: up or ] widens, down or [ narrows, Enter
   resets. */
export function dividerKey(e) {
  const k = e.key;
  const step = k === 'ArrowUp' || k === ']' ? 24 : k === 'ArrowDown' || k === '[' ? -24 : 0;
  if (!step && k !== 'Enter') return;
  e.preventDefault(); e.stopPropagation();
  if (!step) { resetPanelW(); return; }
  setPanelW(currentW() + step);
  saveUi();
}

/* ---------- stored layout ---------- */
const UI_KEY = 'dtc.ui';
/* Stores the panel width, reading view and collapsed sections. */
export function saveUi() {
  try { localStorage.setItem(UI_KEY, JSON.stringify(uiToStore(S))); } catch (e) { /* storage unavailable: not kept */ }
}
/* Applies the stored layout (model.parseUi; the defaults when there is none
   or it cannot be read). The width is kept within the panel's limits. */
export function loadUi() {
  let raw = null;
  try { raw = localStorage.getItem(UI_KEY); } catch (e) { raw = null; }
  const ui = parseUi(raw);
  S.reading = ui.reading;
  S.collapsed = ui.collapsed;
  root().classList.toggle('is-reading', S.reading);
  if (ui.detailW != null) setPanelW(ui.detailW);
}
