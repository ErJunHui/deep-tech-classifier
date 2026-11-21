/* The open run, polling and the render pass over all regions. Ported from
   the prototype's openRun, refreshView, stopRun/resumeRun and onTick, with
   the simulation replaced by the API. The reviewer's decisions are in
   decisions.js and a new run's setup in setup.js; both import this module,
   which imports neither. The state object S lives in store.js and is
   re-exported here. */
import * as api from './api.js';
import {
  currentDecision, computeIds, newFilters, mergeChanges, viewKey, ROW_WINDOW, countOf,
} from './model.js';
import { S, resumable, setupShown } from './store.js';
import { R } from './render/util.js';
import { renderRail, renderRailFoot } from './render/rail.js';
import { renderHead } from './render/head.js';
import { renderStrip } from './render/strip.js';
import { renderChips } from './render/chips.js';
import { renderTable } from './render/table.js';
import { toast } from './render/toast.js';
import { renderSetup, setSetupChrome } from './render/setup.js';
import { renderAnalyst } from './render/analyst.js';

const POLL_MS = 1000;
const LIST_MS = 5000;

export { S, resumable };

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
   The evidence panel (web/js/render/detail.js) registers its render function
   here (main.js). renderDetail runs it; polling calls it only when
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
   values changing). While a new run's setup is shown (setupShown) the main
   column shows the setup instead of the open run, and the evidence panel is
   empty. */
export function renderAll(opts) {
  renderRail();
  const setup = setupShown();
  setSetupChrome(setup);
  if (setup) { renderSetup(); renderAnalyst(); renderDetail(); return; }
  renderHead(opts); renderStrip(opts); renderChips(); renderTable(); renderDetail();
}
/* After the run list or the open run changed: the rail only while setup is
   shown (rebuilding the setup would reset fields being typed in and the
   table), else everything. */
function renderRuns() {
  if (setupShown()) renderRail(); else renderAll();
}

/* ---------- runs ---------- */
/* Records a run summary in S.runs. A run seen leaving "running" gets the
   prototype's toast: complete or failed. Also used by setup.js's Start. */
export function noteSummary(run) {
  const i = S.runs.findIndex((r) => r.id === run.id);
  const prev = i >= 0 ? S.runs[i] : null;
  if (i >= 0) S.runs[i] = run; else S.runs.unshift(run);
  if (!prev || prev.status !== 'running' || run.status === 'running') return;
  if (run.status === 'complete') {
    const k = run.counts;
    toast('Run complete: ' + run.file, countOf(k.done, 'company', 'companies') + ' · ' + k.deep + ' deep tech · ' + k.open + ' need review');
  } else if (run.status === 'failed') {
    toast('Run failed: ' + run.file, run.error);
  }
}

let openToken = 0;
/* Opens run id: loads it, resets filters and sort, selects the first row.
   Choosing the run that is already open cancels a pending open of another.
   S.opening holds id until the latest open answers (the table shows it when
   no run is open). On failure the error is kept in S.openError (the table
   shows it when no run is open) and toasted; opts.retry (the automatic
   retry) toasts only when the failure differs from the last one for the
   same run. */
export async function openRun(id, opts) {
  const token = ++openToken;
  if (S.active && S.active.run.id === id) { S.opening = null; return; }
  S.opening = id;
  let data;
  try {
    data = await api.getRun(id);
  } catch (e) {
    if (token !== openToken) return;
    S.opening = null;
    const prev = S.openError;
    const repeat = !!(opts && opts.retry) && !!prev && prev.id === id && prev.message === e.message;
    S.openError = { id, message: e.message };
    if (!repeat) toast(e.message);
    if (!S.active) renderRuns();
    return;
  }
  if (token !== openToken) return;
  S.opening = null;
  S.active = data;
  S.openError = null;
  S.landed = {};
  noteSummary(data.run);
  S.f = newFilters();
  const search = document.querySelector('[data-fk="search"]');
  if (search) search.value = '';
  S.sortKey = 'priority'; S.sortDir = 1;
  refreshView(true);
  S.selected = S.viewIds.length ? S.viewIds[0] : null;
  // Opened behind the setup (the run list's first run): shown when setup is left.
  if (setupShown()) { renderRail(); return; }
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
  renderRuns(); // the rail only while setup was opened meanwhile
  pollSoon(); // rows that landed since the last poll; drops answers requested before the stop
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
  renderRuns(); // the rail only while setup was opened meanwhile
  if (!setupShown()) {
    const stop = R('head').querySelector('[data-fk="stop"]');
    if (stop) stop.focus();
  }
  pollSoon();
}

/* ---------- polling ----------
   While the open run is running: GET changes every POLL_MS, merge them and
   re-render. Otherwise: GET /api/runs every LIST_MS (every POLL_MS while
   another run is running) so the rail stays current. One failed poll shows
   "Lost contact with the server"; the next success shows "Reconnected". */

/* Runs step(fresh) every interval, one call at a time. soon() asks for a
   call now: when one is in flight, its follow-up runs immediately instead of
   a second call starting. fresh() tells a call whether soon() has been
   called since it started, so an answer requested before a Stop or Resume
   completed is never applied over the newer state. A step that throws still
   schedules the next call. schedule and cancel default to setTimeout and
   clearTimeout. */
export function createPoller(step, opts) {
  const schedule = opts.schedule || ((fn, ms) => setTimeout(fn, ms));
  const cancel = opts.cancel || ((t) => clearTimeout(t));
  let timer = null; let inFlight = false; let again = false; let epoch = 0;
  async function run() {
    timer = null; inFlight = true; again = false;
    const started = epoch;
    try {
      await step(() => epoch === started);
    } catch (e) {
      // The step reports its own failures.
    } finally {
      inFlight = false;
      timer = schedule(run, again ? 0 : opts.interval);
      again = false;
    }
  }
  return {
    start() { if (timer == null && !inFlight) timer = schedule(run, opts.interval); },
    soon() {
      epoch++;
      if (inFlight) { again = true; return; }
      if (timer != null) cancel(timer);
      timer = schedule(run, 0);
    },
  };
}

let lastList = 0;
let lost = false;
let syncActive = false; // fetch the open run's changes on the next tick even if it is not running
const poller = createPoller(tick, { interval: POLL_MS });

export function startPolling() { poller.start(); }
/* Fetches the open run's changes now (after Stop, Resume or a decision). */
export function pollSoon() {
  syncActive = true;
  poller.soon();
}
/* Fetches the run list on the next tick (a decision undone on a run that is
   not open changes only its summary). */
export function refreshListSoon() {
  lastList = 0;
  poller.soon();
}

async function tick(fresh) {
  if (!S.setup) {
    // Boot could not load it. Its own failure neither stops the polling
    // below nor counts as losing the server.
    try { S.setup = await api.getSetup(); renderRailFoot(); } catch (e) { /* retried next tick */ }
  }
  let ok = true;
  try {
    const a = S.active;
    if (a && (a.run.status === 'running' || syncActive)) {
      syncActive = false;
      const changes = await api.getChanges(a.run.id, a.cursor);
      if (S.active === a && fresh()) applyChanges(a, changes);
    } else {
      const other = S.runs.some((r) => r.status === 'running');
      if (other || Date.now() - lastList >= LIST_MS) {
        const list = await api.listRuns();
        lastList = Date.now();
        if (fresh()) applyRunList(list);
      }
    }
  } catch (e) {
    ok = false;
  }
  if (!ok && !lost) { lost = true; toast('Lost contact with the server'); }
  else if (ok && lost) { lost = false; toast('Reconnected'); }
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
  S.listLoaded = true;
  if (!S.active) {
    renderRuns(); // the table's notice: no runs, or the open that failed
    // Not while a run is being opened (after Start): its answer decides.
    if (list.length && !S.opening) openRun(list[0].id, { retry: true });
    return;
  }
  const mine = list.find((r) => r.id === S.active.run.id);
  if (mine && mine.status !== S.active.run.status) syncActive = true;
  renderRail();
}
