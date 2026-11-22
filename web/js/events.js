/* Clicks, typing, drag and drop, and keyboard shortcuts. Ported from the
   prototype's onClick, onInput, onChange, onRootKey, onDocKey and the drag
   handlers, for the actions this part of the app has: opening runs,
   selection and J/K/N movement, sorting, filters, search, the table window,
   Stop/Resume, the evidence panel's sections, the reviewer's decisions, and
   a new run's setup (file, column menus, row ticks, settings popover,
   analyst sheet, Start). The command menu, shortcuts sheet, reading view,
   divider, filter shortcuts and download are in commands.js. */
import { S, renderDetail, stopActive, resumeActive } from './state.js';
import { openSetup, cancelSetup, parkSetup, showRun, setupChanged, loadFile, clearFile, startRun } from './setup.js';
import { setupShown } from './store.js';
import { record, restore, undo } from './decisions.js';
import {
  registerActions, refreshFilters, toggleNeeds, focusChips, focusSearch, stopOrResume, toggleReading, download,
  openHelp, openPalette, paletteQuery, runPalette, closeModal, modalKey, saveUi,
  onDividerDown, onDividerMove, onDividerUp, onDividerDblClick, dividerKey,
} from './commands.js';
import { clamp, newFilters, rowView, formProblem, formKey, changeChoice, editChoice, settingValue, SETUP_FIELDS, ROW_WINDOW, setupEscapeAction } from './model.js';
import { R } from './render/util.js';
import { renderChips } from './render/chips.js';
import { renderTable, rowBtn } from './render/table.js';
import { syncForm } from './render/detail.js';
import { toast } from './render/toast.js';
import { renderSetupTable, openMap, openSettings, closePop, popKind, popOwns, mapField, announce } from './render/setup.js';
import { openAnalyst, closeAnalyst, trapTab, THRESHOLD_KEYS } from './render/analyst.js';

const root = () => document.querySelector('.v-workbench');

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
/* The command menu's company: row index id of the open run, searched in
   the whole run. When the filters hide it they are cleared first. */
function goToCompany(id) {
  if (!S.active || !S.active.rows[id]) return;
  if (S.viewIds.indexOf(id) < 0) {
    S.f = newFilters();
    const s = document.querySelector('[data-fk="search"]'); if (s) s.value = '';
    refreshFilters();
  }
  select(id, { focus: true });
}

/* ---------- decisions ---------- */
/* The selected row's rowView, or null. */
function selectedView() {
  if (!S.active || S.selected == null) return null;
  const row = S.active.rows[S.selected];
  return row ? rowView(row) : null;
}
/* Never while a new run's setup is shown: the open run is not on screen. */
const decidable = (v) => !setupShown() && !!(v && v.r && !v.error);
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
  openForm(changeChoice(v), true);
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

/* ---------- new run setup ---------- */
/* The column menu's choice: field reads column col ('' for none). */
function setMapping(col) {
  const field = mapField();
  if (!field || !setupShown()) return;
  S.draft.cfg.mapping[field] = col;
  closePop(false);
  setupChanged({ table: true });
  const b = R('table').querySelector('[data-fk="map-' + field + '"]');
  if (b) b.focus();
  announce(SETUP_FIELDS.find((x) => x.key === field).label + (col ? ' now reads from ' + col : ' no longer uses a column') + '.');
}
/* A row checkbox (index i) or the header checkbox (i null) changed to on. */
function tick(i, on) {
  const dr = S.draft;
  if (!setupShown() || !dr.file) return;
  if (i == null) {
    if (on) dr.excluded.clear();
    else dr.file.table.forEach((cells, j) => dr.excluded.add(j));
  } else if (on) dr.excluded.delete(i);
  else dr.excluded.add(i);
  setupChanged({ table: true });
}
function resetThresholds() {
  if (!setupShown()) return;
  THRESHOLD_KEYS.forEach((k) => { S.draft.cfg[k] = S.setup.defaults[k]; });
  setupChanged();
}
/* A setting field of the popover or the sheet; typing (live) only takes a
   valid number, a committed blank or invalid number falls back to the
   default. Switches and radios act on change only; other fields are ignored. */
function setSetting(t, live) {
  const d = S.draft.cfg;
  if (t.hasAttribute('data-num')) {
    const k = t.getAttribute('data-num');
    const v = settingValue(k, t.value, live ? null : S.setup.defaults[k]);
    if (v == null) return;
    d[k] = v;
  } else if (t.getAttribute('data-field') === 'model') d.model = t.value;
  else if (live) return;
  else if (t.name === 'wb-prov') d.provider = t.value;
  else if (t.name === 'wb-tier' || t.name === 'wb-q') d.tier = t.value;
  else if (t.hasAttribute('data-toggle')) d[t.getAttribute('data-toggle')] = t.checked;
  else return;
  // While typing, only the numbers follow; the fields re-render on change.
  setupChanged(live ? { fields: false } : undefined);
}

/* ---------- events ---------- */
function onClick(e) {
  const a = e.target.closest('[data-act]');
  const tr = e.target.closest('tr[data-row]');
  if (!a && tr) { select(+tr.getAttribute('data-row')); return; }
  if (!a || !root().contains(a)) return;
  switch (a.getAttribute('data-act')) {
    case 'select': select(+a.getAttribute('data-id'), { focus: true }); break;
    case 'open-run': showRun(a.getAttribute('data-id')); break;
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
    case 'show-more':
      if (setupShown()) { S.draft.limit += ROW_WINDOW; renderSetupTable(); } else { S.limit += ROW_WINDOW; renderTable(); }
      break;
    case 'show-all':
      if (setupShown()) { S.draft.limit = S.draft.file.table.length; renderSetupTable(); } else { S.limit = S.viewIds.length; renderTable(); }
      break;
    case 'toggle-sec': {
      const k = a.getAttribute('data-k');
      S.collapsed[k] = !S.collapsed[k];
      saveUi();
      renderDetail(); break;
    }
    case 'reading': toggleReading(); break;
    case 'download': download(); break;
    case 'help': openHelp(); break;
    case 'palette': openPalette(); break;
    case 'close-modal': closeModal(); break;
    case 'pal-run': runPalette(+a.getAttribute('data-i')); break;
    case 'quick-confirm': keyConfirm(); break;
    case 'open-change': keyChange(); break;
    case 'open-note': focusNote(); break;
    case 'change-dec': { const v = selectedView(); if (decidable(v) && v.dec) openForm(editChoice(v), true); break; }
    case 'restore': if (decidable(selectedView())) restore(S.selected); break;
    case 'record': recordFromForm(); break;
    case 'cancel-form': if (S.active && S.selected != null) delete S.forms[selectedKey()]; renderDetail(); break;
    case 'undo': undo(); break;
    /* new run setup */
    case 'new-run': case 'open-draft': openSetup(null); break;
    case 'rerun': if (S.active) openSetup(S.active.run); break;
    case 'cancel-setup': cancelSetup(); break;
    case 'pick-file': R('file').value = ''; R('file').click(); break;
    case 'clear-file': clearFile(); break;
    case 'col-menu': {
      const f = a.getAttribute('data-field');
      if (mapField() === f) closePop(true); else openMap(f);
      break;
    }
    case 'map': setMapping(a.getAttribute('data-col')); break;
    case 'settings-pop': if (popKind() === 'settings') closePop(true); else openSettings(); break;
    case 'settings-done': closePop(true); break;
    case 'analyst-open': openAnalyst('analyst-open'); break;
    case 'analyst-close': closeAnalyst(); break;
    case 'reset-th': resetThresholds(); break;
    case 'start': startRun(); break;
    default: break;
  }
}

function onInput(e) {
  const t = e.target;
  const fk = t.getAttribute('data-fk');
  if (fk === 'pal-q') { paletteQuery(t.value); return; }
  if (fk === 'search') { S.f.q = t.value; refreshFilters(); return; }
  if (fk === 'note') {
    if (!decidable(selectedView())) return;
    const key = selectedKey();
    S.forms[key] = Object.assign({ open: true, choice: '' }, S.forms[key], { note: t.value });
    syncForm();
    return;
  }
  if (setupShown()) setSetting(t, true);
}

function onChange(e) {
  const t = e.target;
  if (t === R('file')) { loadFile(t.files && t.files[0]); return; }
  if (setupShown()) {
    const act = t.getAttribute('data-act');
    if (act === 'tick-all') tick(null, t.checked);
    else if (act === 'tick-row') tick(+t.getAttribute('data-i'), t.checked);
    else setSetting(t, false);
    return;
  }
  if (t.name === 'wb-dec') {
    if (!decidable(selectedView())) return;
    const key = selectedKey();
    S.forms[key] = Object.assign({ open: true, note: '' }, S.forms[key], { choice: t.value });
    syncForm();
  }
}

/* Keys inside the analyst sheet: Esc closes it, Tab stays in it. */
function sheetKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeAnalyst(); }
  else if (e.key === 'Tab') trapTab(e);
}
/* Keys inside a popover: Esc closes it; a column menu moves with the arrow
   keys, Home and End, and Tab closes it. */
function popKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(true); return; }
  if (popKind() !== 'map') return;
  const opts = [...R('pop').querySelectorAll('.wb-mopt')];
  let i = opts.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') i = (i + 1) % opts.length;
  else if (e.key === 'ArrowUp') i = (i - 1 + opts.length) % opts.length;
  else if (e.key === 'Home') i = 0;
  else if (e.key === 'End') i = opts.length - 1;
  else if (e.key === 'Tab') { e.preventDefault(); closePop(true); return; }
  else return;
  e.preventDefault();
  opts[i].focus();
}
/* Esc while setting up: closes the open popover; else discards an empty
   draft and parks one with a file (model.setupEscapeAction). */
function setupEscape() {
  if (popKind()) { closePop(true); return; }
  const act = setupEscapeAction(S.draft);
  if (act === 'discard') cancelSetup(); else if (act === 'park') parkSetup();
}

/* Keys that belong to a focused field, an overlay, the setup or the divider. */
function onRootKey(e) {
  const t = e.target;
  const fk = t.getAttribute ? t.getAttribute('data-fk') : null;
  if (S.modal && R('modal').contains(t)) { modalKey(e); return; }
  if (S.analyst && R('overlay').contains(t)) { sheetKey(e); return; }
  if (popKind() && R('pop').contains(t)) { popKey(e); return; }
  if (setupShown()) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setupEscape(); }
    return;
  }
  if (t === R('divider')) { dividerKey(e); return; }
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

/* Esc with nothing focused: leaves reading view, else closes the selected
   row's decision form (its draft is kept). False when there was neither. */
function escapeView() {
  if (S.reading) { toggleReading(false); return true; }
  const form = S.active && S.selected != null ? S.forms[selectedKey()] : null;
  if (!form || !form.open) return false;
  form.open = false;
  renderDetail();
  return true;
}

/* Global shortcuts. Ctrl/⌘+K toggles the command menu anywhere, also in a
   field and while setting up (not over the analyst sheet). */
function onDocKey(e) {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    if (S.modal && S.modal.type === 'palette') closeModal(); else openPalette();
    return;
  }
  const t = e.target;
  if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
  if (S.modal) {
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
    return;
  }
  if (S.analyst) {
    if (e.key === 'Escape') { e.preventDefault(); closeAnalyst(); }
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (setupShown()) {
    // Setting up a new run: only these keys; the rest act on a run.
    if (e.key === 'Escape') setupEscape();
    else if (e.key === '?') openHelp();
    else if (e.key === 'o' || e.key === 'O') openSetup(null);
    else return;
    e.preventDefault();
    return;
  }
  let done = true;
  switch (e.key) {
    case 'o': case 'O': openSetup(null); break;
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
    case 'e': case 'E': toggleReading(); break;
    case 'd': case 'D': download(); break;
    case '/': focusSearch(); break;
    case '?': openHelp(); break;
    case 'Escape': done = escapeView(); break;
    default: done = false;
  }
  if (done) e.preventDefault();
}

/* Popovers close on a press or focus outside them (their own buttons
   toggle them), when the table under a column menu scrolls, and on resize. */
function onPopPointer(e) { if (popKind() && !popOwns(e.target)) closePop(false); }
function onFocusIn(e) { if (popKind() && !popOwns(e.target)) closePop(false); }
function onScroll(e) { if (popKind() === 'map' && e.target === R('table')) closePop(false); }
function onResize() { if (popKind()) closePop(false); }

/* Drag and drop: while setting up, the whole main column takes a spreadsheet. */
let dragDepth = 0;
const isFileDrag = (e) => !!(e.dataTransfer && [...(e.dataTransfer.types || [])].indexOf('Files') >= 0);
const dropOk = (e) => setupShown() && !S.analyst && R('main').contains(e.target);
function onDragEnter(e) {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  if (!dropOk(e)) return;
  dragDepth++;
  R('main').classList.add('is-drag');
}
function onDragOver(e) {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = dropOk(e) ? 'copy' : 'none';
}
function onDragLeave(e) {
  if (!isFileDrag(e) || !dropOk(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) R('main').classList.remove('is-drag');
}
function onDrop(e) {
  if (!isFileDrag(e)) return;
  e.preventDefault();
  dragDepth = 0;
  R('main').classList.remove('is-drag');
  if (dropOk(e)) loadFile(e.dataTransfer.files && e.dataTransfer.files[0]);
}

export function bindEvents() {
  const r = root();
  registerActions({
    next: () => move(1), prev: () => move(-1), first: () => moveTo(false), last: () => moveTo(true),
    'next-open': () => nextOpen(1), 'prev-open': () => nextOpen(-1),
    confirm: keyConfirm, change: keyChange, note: focusNote, company: goToCompany,
  });
  [
    ['click', onClick], ['input', onInput], ['change', onChange], ['keydown', onRootKey],
    ['focusin', onFocusIn], ['pointerdown', onPopPointer],
    ['pointerdown', onDividerDown], ['pointermove', onDividerMove], ['pointerup', onDividerUp], ['pointercancel', onDividerUp], ['dblclick', onDividerDblClick],
    ['dragenter', onDragEnter], ['dragover', onDragOver], ['dragleave', onDragLeave], ['drop', onDrop],
  ].forEach(([ev, fn]) => r.addEventListener(ev, fn));
  r.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);
  document.addEventListener('keydown', onDocKey);
}
