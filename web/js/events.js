/* Clicks, typing and keyboard shortcuts for the run view. Ported from the
   prototype's onClick, onInput, onChange, onRootKey and onDocKey, for the
   actions this part of the app has: opening runs, selection and J/K/N
   movement, sorting, filters, search, the table window, Stop/Resume, the
   evidence panel's sections and the reviewer's decisions. Other actions
   (new-run, rerun, download, help, palette, reading view) are bound
   elsewhere; until then their buttons do nothing. */
import { S, openRun, refreshView, renderDetail, stopActive, resumeActive, resumable, record, restore, undo } from './state.js';
import { clamp, flip, newFilters, rowView, formProblem, ROW_WINDOW } from './model.js';
import { formKey } from './store.js';
import { R } from './render/util.js';
import { renderStrip } from './render/strip.js';
import { renderChips } from './render/chips.js';
import { renderTable, rowBtn } from './render/table.js';
import { syncForm } from './render/detail.js';
import { toast } from './render/toast.js';

const root = () => document.querySelector('.v-workbench');

export function refreshFilters() {
  refreshView(true);
  renderStrip(); renderChips(); renderTable();
}

/* ---------- selection ---------- */
/* Selects row index id. The table window grows to include it (it never
   shrinks here), and the row is scrolled into view. */
export function select(id, opts) {
  const prev = S.selected;
  S.selected = id;
  const at = S.viewIds.indexOf(id);
  if (at >= S.limit) S.limit = at + 1;
  renderTable({ patch: [prev, id].filter((x) => x != null) });
  renderDetail({ reset: true });
  const btn = rowBtn(id);
  if (btn) {
    if (btn.scrollIntoView) btn.scrollIntoView({ block: 'nearest' });
    if (opts && opts.focus) btn.focus({ preventScroll: true });
  }
}
const focusInTable = () => R('table').contains(document.activeElement);
export function move(delta) {
  if (!S.active) return;
  const ids = S.viewIds; if (!ids.length) return;
  const i = ids.indexOf(S.selected);
  const next = i < 0 ? ids[delta > 0 ? 0 : ids.length - 1] : ids[clamp(i + delta, 0, ids.length - 1)];
  select(next, { focus: focusInTable() });
}
export function moveTo(end) {
  if (!S.active || !S.viewIds.length) return;
  select(end ? S.viewIds[S.viewIds.length - 1] : S.viewIds[0], { focus: focusInTable() });
}
export function nextOpen(dir) {
  if (!S.active) return;
  const rows = S.active.rows;
  const ids = S.viewIds;
  const n = ids.length;
  const i = ids.indexOf(S.selected);
  for (let step = 1; step <= n; step++) {
    const j = ((i < 0 ? (dir > 0 ? -1 : 0) : i) + dir * step + n * 2) % n;
    if (rowView(rows[ids[j]]).open) { select(ids[j], { focus: focusInTable() }); return; }
  }
  const anyOpen = rows.some((row) => rowView(row).open);
  toast(anyOpen ? 'No company needing review in this view' : 'Nothing left to review', anyOpen ? 'Clear filters to see the rest.' : 'Every flagged company has a decision.');
}

/* ---------- filters ---------- */
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

/* ---------- decisions ---------- */
/* The selected row's rowView, or null. */
function selectedView() {
  if (!S.active || S.selected == null) return null;
  const row = S.active.rows[S.selected];
  return row ? rowView(row) : null;
}
const decidable = (v) => !!(v && v.r && !v.error);
const selectedKey = () => formKey(S.active.run.id, S.selected);

/* Opens the selected row's decision form with choice (null keeps the
   draft's), the note from the draft or the current decision. focusNote puts
   the caret at the end of the note. */
function openForm(choice, focusNote) {
  const v = selectedView(); if (!decidable(v)) return;
  const key = selectedKey();
  const prev = S.forms[key];
  S.forms[key] = { open: true, choice: choice != null ? choice : (prev ? prev.choice : ''), note: prev ? prev.note : (v.dec ? v.dec.note : '') };
  renderDetail();
  if (focusNote) {
    const ta = R('detail').querySelector('[data-fk="note"]');
    if (ta) { ta.focus({ preventScroll: true }); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }
}
/* C: confirm a flagged row's verdict, then go to the next row needing review. */
async function keyConfirm() {
  const v = selectedView(); if (!decidable(v)) return;
  if (!v.flagged) { toast('C confirms flagged companies', 'This one is Clear. Press X to reclassify it.'); return; }
  if (v.confirmed) { toast(v.row.name + ' is already confirmed', 'Press N for the next company needing review.'); return; }
  const form = S.forms[selectedKey()];
  const index = v.row.index;
  if (await record(index, 'confirm', form ? form.note.trim() : '') && S.selected === index) nextOpen(1);
}
/* X: the form, set to the verdict the row does not have now. */
function keyChange() {
  const v = selectedView(); if (!decidable(v)) return;
  openForm(flip(v.verdict) === v.r.verdict ? 'confirm' : 'change', true);
}
/* M: the form with the note focused. */
function focusNote() {
  if (!decidable(selectedView())) return;
  openForm(null, true);
}
async function recordFromForm() {
  const v = selectedView(); if (!decidable(v)) return;
  const form = S.forms[selectedKey()];
  if (!form || formProblem(v, form)) { syncForm(); return; }
  const index = v.row.index;
  if (await record(index, form.choice, form.note.trim()) && S.selected === index) {
    const b = R('detail').querySelector('[data-fk="change-dec"]'); if (b) b.focus({ preventScroll: true });
  }
}
/* Esc in the note: back to the table row; the draft is kept. */
function leaveNote() {
  const b = rowBtn(S.selected);
  if (b) b.focus({ preventScroll: true }); else document.activeElement.blur();
}

/* ---------- events ---------- */
function onClick(e) {
  const a = e.target.closest('[data-act]');
  const tr = e.target.closest('tr[data-row]');
  if (!a && tr) { select(+tr.getAttribute('data-row')); return; }
  if (!a || !root().contains(a)) return;
  switch (a.getAttribute('data-act')) {
    case 'select': select(+a.getAttribute('data-id'), { focus: true }); break;
    case 'open-run': openRun(a.getAttribute('data-id')); break;
    case 'stop': stopActive(); break;
    case 'resume': resumeActive(); break;
    case 'sort': {
      const k = a.getAttribute('data-k');
      if (S.sortKey === k) S.sortDir = -S.sortDir;
      else { S.sortKey = k; S.sortDir = (k === 'cost' || k === 'patents') ? -1 : 1; }
      refreshFilters(); break;
    }
    case 'sort-priority': S.sortKey = 'priority'; S.sortDir = 1; refreshFilters(); break;
    case 'chip': {
      const g = a.getAttribute('data-g'); const v = a.getAttribute('data-v');
      if (S.f[g].has(v)) S.f[g].delete(v); else S.f[g].add(v);
      refreshFilters(); break;
    }
    case 'stat': {
      const k = a.getAttribute('data-k');
      if (k === 'review') { toggleNeeds(); break; }
      const v = k === 'deep' ? 'deep tech' : 'general tech';
      const on = S.f.verdict.size === 1 && S.f.verdict.has(v);
      S.f.verdict = on ? new Set() : new Set([v]);
      refreshFilters(); break;
    }
    case 'bin': { const b = +a.getAttribute('data-bin'); S.f.bin = S.f.bin === b ? null : b; refreshFilters(); break; }
    case 'clear-bin': S.f.bin = null; refreshFilters(); break;
    case 'clear-filters': {
      S.f = newFilters();
      const s = document.querySelector('[data-fk="search"]'); if (s) s.value = '';
      refreshFilters(); break;
    }
    case 'filters-toggle': S.filtersOpen = !S.filtersOpen; renderChips(); break;
    case 'show-more': S.limit += ROW_WINDOW; renderTable(); break;
    case 'show-all': S.limit = S.viewIds.length; renderTable(); break;
    case 'toggle-sec': {
      const k = a.getAttribute('data-k');
      S.collapsed[k] = !S.collapsed[k];
      renderDetail(); break;
    }
    case 'quick-confirm': keyConfirm(); break;
    case 'open-change': keyChange(); break;
    case 'open-note': focusNote(); break;
    case 'change-dec': { const v = selectedView(); if (decidable(v) && v.dec) openForm(v.dec.type, true); break; }
    case 'restore': if (decidable(selectedView())) restore(S.selected); break;
    case 'record': recordFromForm(); break;
    case 'cancel-form': if (S.active && S.selected != null) delete S.forms[selectedKey()]; renderDetail(); break;
    case 'undo': undo(); break;
    default: break;
  }
}

function onInput(e) {
  const t = e.target;
  const fk = t.getAttribute('data-fk');
  if (fk === 'search') { S.f.q = t.value; refreshFilters(); return; }
  if (fk === 'note') {
    if (!decidable(selectedView())) return;
    const key = selectedKey();
    S.forms[key] = Object.assign({ open: true, choice: '' }, S.forms[key], { note: t.value });
    syncForm();
  }
}

function onChange(e) {
  const t = e.target;
  if (t.name === 'wb-dec') {
    if (!decidable(selectedView())) return;
    const key = selectedKey();
    S.forms[key] = Object.assign({ open: true, note: '' }, S.forms[key], { choice: t.value });
    syncForm();
  }
}

/* Keys that belong to a focused field. */
function onRootKey(e) {
  const t = e.target;
  const fk = t.getAttribute ? t.getAttribute('data-fk') : null;
  if (fk === 'note') {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); recordFromForm(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); leaveNote(); }
    return;
  }
  if (fk !== 'search') return;
  if (e.key === 'Escape') {
    e.preventDefault(); e.stopPropagation();
    if (t.value) { t.value = ''; S.f.q = ''; refreshFilters(); } else t.blur();
  } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
    e.preventDefault(); move(1);
    const b = rowBtn(S.selected); if (b) b.focus();
  }
}

/* Global shortcuts. Bare 1-9, ArrowLeft/ArrowRight and R are never bound. */
function onDocKey(e) {
  const t = e.target;
  if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
  if (S.modal || S.analyst) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  let done = true;
  switch (e.key) {
    case 'j': case 'J': case 'ArrowDown': move(1); break;
    case 'k': case 'K': case 'ArrowUp': move(-1); break;
    case 'Home': moveTo(false); break;
    case 'End': moveTo(true); break;
    case 'n': case 'N': nextOpen(e.shiftKey ? -1 : 1); break;
    case 'a': case 'A': toggleNeeds(); break;
    case 'f': case 'F': focusChips(); break;
    case 'c': case 'C': keyConfirm(); break;
    case 'x': case 'X': keyChange(); break;
    case 'm': case 'M': focusNote(); break;
    case 'u': case 'U': undo(); break;
    case 's': case 'S': stopOrResume(); break;
    case '/': focusSearch(); break;
    default: done = false;
  }
  if (done) e.preventDefault();
}

export function bindEvents() {
  const r = root();
  r.addEventListener('click', onClick);
  r.addEventListener('input', onInput);
  r.addEventListener('change', onChange);
  r.addEventListener('keydown', onRootKey);
  document.addEventListener('keydown', onDocKey);
}
