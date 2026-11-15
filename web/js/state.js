/* The workbench's state, the open run, polling, and the render pass over
   all regions. Ported from the prototype's state (S), openRun, refreshView,
   stopRun/resumeRun and onTick, with the simulation replaced by the API. */
import * as api from './api.js';
import { currentDecision, computeIds, newFilters, mergeChanges, viewKey, ROW_WINDOW } from './model.js';
import { R } from './render/util.js';
import { renderRail, renderRailFoot } from './render/rail.js';
import { renderHead } from './render/head.js';
import { renderStrip } from './render/strip.js';
import { renderChips } from './render/chips.js';
import { renderTable } from './render/table.js';
import { toast } from './render/toast.js';

const POLL_MS = 1000;
const LIST_MS = 5000;

export const S = {
  setup: null, // GET /api/setup
  runs: [], // RunSummary[], newest first
  active: null, // the open run: {run, rows, cursor} from GET /api/runs/{id}, kept current by polling
  selected: null, // the selected row's index
  sortKey: 'priority', sortDir: 1,
  f: newFilters(),
  viewIds: [], // the visible row indexes, filtered and sorted (model.computeIds)
  snap: null, // {runId, dec: {index: decision}}: decisions at the last explicit view change
  limit: ROW_WINDOW, // rows the table renders (model.visibleRows)
  viewKey: '', // model.viewKey of the view the limit belongs to
  draft: null, // the new run being set up
  analyst: false, // the analyst-settings sheet is open
  modal: null,
  forms: {},
  collapsed: { facts: true },
  reading: false, detailW: null, filtersOpen: false,
  sessionRunIds: new Set(), // runs created in this browser session
  landed: {}, // {index: Date.now()} when a row's result arrived, for the wb-land animation
};

/* Stopped, interrupted and failed runs resume; so does a complete run with
   error rows (they are retried). */
export function resumable(run) {
  if (run.status === 'stopped' || run.status === 'interrupted' || run.status === 'failed') return true;
  return run.status === 'complete' && !!(run.counts && run.counts.errors);
}

/* ---------- view ----------
   The visible order is recomputed on an explicit sort, filter, search or run
   switch, and when polling brings new data. Decisions never reorder it:
   sorting and filtering use the decisions as they were at the last explicit
   change, so a row just decided keeps its place. */
function decisionsOf(rows) {
  const dec = {};
  rows.forEach((row) => { const d = currentDecision(row.history); if (d) dec[row.index] = d; });
  return dec;
}
export function refreshView(explicit) {
  const a = S.active;
  if (!a) { S.viewIds = []; return; }
  const id = a.run.id;
  if (explicit || !S.snap || S.snap.runId !== id) S.snap = { runId: id, dec: decisionsOf(a.rows) };
  const key = viewKey(id, S.sortKey, S.sortDir, S.f);
  if (key !== S.viewKey) { S.viewKey = key; S.limit = ROW_WINDOW; }
  S.viewIds = computeIds(a.rows, { filters: S.f, sortKey: S.sortKey, sortDir: S.sortDir, running: a.run.status === 'running', snapshot: S.snap.dec });
}

/* ---------- detail panel hook ----------
   The evidence panel (web/js/render/detail.js, a later task) registers its
   render function here. renderDetail runs it; polling calls it only when
   detailSig() changed since the last render. */
let detailRenderer = null;
let lastDetailSig = '';
export function setDetailRenderer(fn) { detailRenderer = fn; }
export function detailSig() {
  const a = S.active;
  if (!a) return '';
  const id = S.selected;
  const row = id == null ? null : a.rows[id];
  return a.run.id + '|' + a.run.status + '|' + id + '|' + (row ? (row.result ? 'done' : row.step || 'q') : '');
}
export function renderDetail(opts) {
  lastDetailSig = detailSig();
  if (detailRenderer) detailRenderer(opts);
}

/* opts.animate: counters roll to their new values (only for the same run's
   values changing). */
export function renderAll(opts) {
  renderRail();
  renderHead(opts); renderStrip(opts); renderChips(); renderTable(); renderDetail();
}

/* ---------- runs ---------- */
/* Records a run summary in S.runs. A run seen leaving "running" gets the
   prototype's toast: complete or failed. */
function noteSummary(run) {
  const i = S.runs.findIndex((r) => r.id === run.id);
  const prev = i >= 0 ? S.runs[i] : null;
  if (i >= 0) S.runs[i] = run; else S.runs.unshift(run);
  if (!prev || prev.status !== 'running' || run.status === 'running') return;
  if (run.status === 'complete') {
    const k = run.counts;
    toast('Run complete: ' + run.file, k.done + ' companies · ' + k.deep + ' deep tech · ' + k.open + ' need review');
  } else if (run.status === 'failed') {
    toast('Run failed: ' + run.file, run.error);
  }
}

let openToken = 0;
/* Opens run id: loads it, resets filters and sort, selects the first row. */
export async function openRun(id) {
  if (S.active && S.active.run.id === id) return;
  const token = ++openToken;
  let data;
  try {
    data = await api.getRun(id);
  } catch (e) {
    toast(e.message);
    return;
  }
  if (token !== openToken) return;
  S.active = data;
  S.landed = {};
  noteSummary(data.run);
  S.f = newFilters();
  const search = document.querySelector('[data-fk="search"]');
  if (search) search.value = '';
  S.sortKey = 'priority'; S.sortDir = 1;
  refreshView(true);
  S.selected = S.viewIds.length ? S.viewIds[0] : null;
  renderAll();
  R('table').scrollTop = 0;
  R('detail').scrollTop = 0;
}

let acting = false;
export async function stopActive() {
  const a = S.active;
  if (!a || a.run.status !== 'running' || acting) return;
  acting = true;
  let run;
  try { run = await api.stopRun(a.run.id); } catch (e) { toast(e.message); return; } finally { acting = false; }
  noteSummary(run);
  if (S.active !== a) { renderRail(); return; }
  a.run = run;
  const n = run.counts.done;
  toast('Run stopped', n + ' finished ' + (n === 1 ? 'result' : 'results') + ' kept. Resume continues with the next unfinished company.');
  refreshView(false);
  renderAll();
  pollSoon(); // rows that landed since the last poll
}

export async function resumeActive() {
  const a = S.active;
  if (!a || !resumable(a.run) || acting) return;
  acting = true;
  let run;
  try { run = await api.resumeRun(a.run.id); } catch (e) { toast(e.message); return; } finally { acting = false; }
  noteSummary(run);
  if (S.active !== a) { renderRail(); return; }
  a.run = run;
  toast('Resuming ' + run.file, run.model ? 'Continuing with ' + run.model + ', the model this run started with.' : 'Continuing with the model this run started with.');
  refreshView(false);
  renderAll();
  const stop = R('head').querySelector('[data-fk="stop"]');
  if (stop) stop.focus();
  pollSoon();
}

/* ---------- polling ----------
   While the open run is running: GET changes every POLL_MS, merge them and
   re-render. Otherwise: GET /api/runs every LIST_MS (every POLL_MS while
   another run is running) so the rail stays current. One failed poll shows
   "Lost contact with the server"; the next success shows "Reconnected". */
let pollTimer = null;
let lastList = 0;
let lost = false;
let syncActive = false; // fetch the open run's changes on the next tick even if it is not running

export function startPolling() {
  if (pollTimer == null) pollTimer = setTimeout(tick, POLL_MS);
}
function pollSoon() {
  syncActive = true;
  clearTimeout(pollTimer);
  pollTimer = setTimeout(tick, 0);
}

async function tick() {
  pollTimer = null;
  let ok = true;
  try {
    if (!S.setup) { S.setup = await api.getSetup(); renderRailFoot(); } // boot could not load it
    const a = S.active;
    if (a && (a.run.status === 'running' || syncActive)) {
      syncActive = false;
      const changes = await api.getChanges(a.run.id, a.cursor);
      if (S.active === a) applyChanges(a, changes);
    } else {
      const other = S.runs.some((r) => r.status === 'running');
      if (other || Date.now() - lastList >= LIST_MS) {
        const list = await api.listRuns();
        lastList = Date.now();
        applyRunList(list);
      }
    }
  } catch (e) {
    ok = false;
  }
  if (!ok && !lost) { lost = true; toast('Lost contact with the server'); }
  else if (ok && lost) { lost = false; toast('Reconnected'); }
  if (pollTimer == null) pollTimer = setTimeout(tick, POLL_MS);
}

function applyChanges(a, changes) {
  const prevStatus = a.run.status;
  const m = mergeChanges(a, changes);
  a.run = m.active.run; a.rows = m.active.rows; a.cursor = m.active.cursor;
  const now = Date.now();
  m.landed.forEach((i) => { S.landed[i] = now; });
  noteSummary(a.run);
  refreshView(false);
  renderRail();
  renderHead({ animate: true }); renderStrip({ animate: true }); renderChips();
  // A status change re-renders every pending row ("Queued" / "Not started").
  renderTable(prevStatus === a.run.status ? { patch: m.changed } : undefined);
  if (detailSig() !== lastDetailSig) renderDetail();
}

function applyRunList(list) {
  list.forEach((run) => noteSummary(run));
  S.runs = list;
  if (!S.active) {
    renderRail();
    if (list.length) openRun(list[0].id);
    return;
  }
  const mine = list.find((r) => r.id === S.active.run.id);
  if (mine && mine.status !== S.active.run.status) syncActive = true;
  renderRail();
}
