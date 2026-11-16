/* The open run, polling, the render pass over all regions, and the actions
   of a new run's setup. Ported from the prototype's openRun, refreshView,
   stopRun/resumeRun, onTick, openSetup, cancelSetup, loadFile and startRun,
   with the simulation replaced by the API. The reviewer's decisions are in
   decisions.js. The state object S lives in store.js and is re-exported
   here. */
import * as api from './api.js';
import {
  currentDecision, computeIds, newFilters, mergeChanges, viewKey, ROW_WINDOW,
  newDraft, mappingForFile, startProblem, excludeList, estimateRows, tickedCount,
} from './model.js';
import { S, resumable, setupShown } from './store.js';
import { R } from './render/util.js';
import { renderRail, renderRailFoot } from './render/rail.js';
import { renderHead } from './render/head.js';
import { renderStrip } from './render/strip.js';
import { renderChips } from './render/chips.js';
import { renderTable } from './render/table.js';
import { toast } from './render/toast.js';
import {
  renderSetup, renderSetupHead, renderSetupTable, renderSetupBar, renderPop, setSetupChrome,
  focusSetupStart, openMap, closePop, announce,
} from './render/setup.js';
import { renderAnalyst, renderAnalystEst, openAnalyst, closeAnalyst } from './render/analyst.js';

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
/* Opens run id: loads it, resets filters and sort, selects the first row.
   Choosing the run that is already open cancels a pending open of another.
   On failure the error is kept in S.openError (the table shows it when no
   run is open) and toasted; opts.retry (the automatic retry) toasts only
   when the failure differs from the last one for the same run. */
export async function openRun(id, opts) {
  const token = ++openToken;
  if (S.active && S.active.run.id === id) return;
  let data;
  try {
    data = await api.getRun(id);
  } catch (e) {
    if (token !== openToken) return;
    const prev = S.openError;
    const repeat = !!(opts && opts.retry) && !!prev && prev.id === id && prev.message === e.message;
    S.openError = { id, message: e.message };
    if (!repeat) toast(e.message);
    if (!S.active) renderRuns();
    return;
  }
  if (token !== openToken) return;
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
  renderAll();
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
    if (list.length) openRun(list[0].id, { retry: true });
    return;
  }
  const mine = list.find((r) => r.id === S.active.run.id);
  if (mine && mine.status !== S.active.run.status) syncActive = true;
  renderRail();
}


/* ---------- new run setup ----------
   "+ New run" turns the main column into the draft run (S.draft): the
   uploaded spreadsheet becomes the table at once, column mapping lives in
   the headers, rows are ticked in or out in place, and the action bar
   starts it. On Start the same table shows the live run. Only one draft
   exists: opening another run parks it in the rail (S.showSetup false,
   see store.setupShown), "+ New run" or its rail item returns to it, and
   Cancel discards it. */
const ESTIMATE_DEBOUNCE_MS = 250;
let setupRet = null; // data-fk of the control focused before setup was shown
let estTimer = null; let estToken = 0;
let uploadToken = 0;
let starting = false;

/* Shows setup. fromRun ("Same settings…"): a new draft with that run's
   settings and no file, replacing any draft. Otherwise the parked draft, or
   a fresh one; when setup is already shown it only moves focus to it. */
export function openSetup(fromRun) {
  if (!S.setup) { toast('Can’t set up a new run yet', 'The settings could not be loaded from the server. It keeps trying.'); return; }
  if (setupShown() && !fromRun) { focusSetupStart(); return; }
  if (!setupShown()) {
    const a = document.activeElement;
    setupRet = a && a.getAttribute ? a.getAttribute('data-fk') : null;
  }
  closePop(false); closeAnalyst(false);
  if (fromRun || !S.draft) {
    S.draft = newDraft(S.setup, fromRun);
    uploadToken++; estToken++;
  }
  S.showSetup = true;
  // Setup has no evidence panel: reading view is left (as in the prototype).
  if (S.reading) { S.reading = false; document.querySelector('.v-workbench').classList.remove('is-reading'); }
  renderAll();
  R('table').scrollTop = 0;
  focusSetupStart();
  estimateSoon();
}

/* Leaves the setup view without rendering; the draft stays parked. */
function hideSetup() {
  S.showSetup = false;
  closePop(false); closeAnalyst(false);
}
/* Drops the draft and every answer still on its way for it. */
function dropDraft() {
  hideSetup();
  S.draft = null;
  uploadToken++; estToken++;
  clearTimeout(estTimer);
}

/* Shows run id from the rail. When setup is shown the draft is parked
   there; the run is shown as soon as it is loaded. */
export function showRun(id) {
  if (setupShown()) { hideSetup(); renderAll(); }
  openRun(id);
}

/* Discards the draft and shows the open run. restoreFocus (default true):
   focus goes back to where it was before setup was shown, else to the open
   run in the rail. */
export function cancelSetup(restoreFocus) {
  if (!S.draft) return;
  dropDraft();
  renderAll();
  if (restoreFocus === false) return;
  const ret = setupRet && document.querySelector('[data-fk="' + setupRet + '"]');
  const b = ret || (S.active && document.querySelector('[data-fk="rail-' + S.active.run.id + '"]'));
  if (b) b.focus();
}

/* After the draft changed: re-renders what shows it and asks for a new
   estimate. opts.table: the table too (mapping, ticks). opts.fields false:
   only the numbers, while a field of the sheet is being typed in. */
export function setupChanged(opts) {
  const dr = S.draft;
  if (!dr) return;
  dr.startError = '';
  renderRail();
  renderSetupHead();
  if (opts && opts.table) renderSetupTable();
  renderSetupBar();
  if (opts && opts.fields === false) renderAnalystEst();
  else { renderPop(); renderAnalyst(); }
  estimateSoon();
}

/* POST /api/estimate for the draft, ESTIMATE_DEBOUNCE_MS after the last
   change. The previous numbers stay until the answer to the latest request
   arrives; older answers are dropped. A failed request clears the numbers
   and marks the estimate as unavailable (draft.estFailed). The setup
   renders do nothing while the draft is parked. */
function estimateSoon() {
  clearTimeout(estTimer);
  estTimer = setTimeout(async () => {
    const dr = S.draft;
    if (!dr) return;
    const token = ++estToken;
    let est = null;
    try { est = await api.postEstimate(dr.cfg, estimateRows(dr)); } catch (e) { est = null; }
    if (token !== estToken || S.draft !== dr) return;
    dr.est = est;
    dr.estFailed = !est;
    renderSetupBar(); renderAnalystEst();
  }, ESTIMATE_DEBOUNCE_MS);
}

/* Uploads file (a File from the picker or a drop) and shows its rows. The
   server's rejection is shown with the file area. When the draft was parked
   meanwhile, the answer is kept in it and only the rail changes. */
export async function loadFile(file) {
  const dr = S.draft;
  if (!file || !setupShown()) return;
  const token = ++uploadToken;
  dr.reading = file.name; dr.error = '';
  renderSetupHead();
  if (!dr.file) renderSetupTable();
  announce('Reading ' + file.name + '…');
  let info;
  try {
    info = await api.uploadFile(file);
  } catch (e) {
    if (token !== uploadToken || S.draft !== dr) return;
    dr.reading = ''; dr.error = e.message;
    renderSetupHead(); renderSetupTable();
    if (setupShown()) announce(e.message);
    return;
  }
  if (token !== uploadToken || S.draft !== dr) return;
  dr.reading = ''; dr.error = ''; dr.startError = '';
  dr.file = info;
  dr.excluded = new Set();
  dr.limit = ROW_WINDOW;
  dr.cfg.mapping = mappingForFile(dr.cfg.mapping, info, !!dr.fromId);
  renderRail();
  estimateSoon();
  if (!setupShown()) return;
  closePop(false);
  renderSetup({ enter: true }); renderAnalyst();
  const mapped = !!dr.cfg.mapping.company_name;
  announce('Loaded ' + info.rows + ' companies from ' + info.name + (mapped ? '.' : '. Choose the company name column to continue.'));
  const t = document.querySelector(mapped ? '[data-fk="start"]' : '[data-fk="map-company_name"]');
  if (t) t.focus();
}

/* "Change file": back to the drop target, keeping the settings. */
export function clearFile() {
  const dr = S.draft;
  if (!dr) return;
  uploadToken++;
  dr.file = null; dr.reading = ''; dr.error = '';
  dr.excluded = new Set(); dr.limit = ROW_WINDOW;
  closePop(false);
  setupChanged({ table: true });
  focusSetupStart();
}

/* Takes the user to what blocks the start (model.startProblem's fix). */
function fixProblem(prob) {
  if (prob.fix === 'map') openMap('company_name');
  else if (prob.fix === 'sheet') openAnalyst('start');
  else {
    const b = document.querySelector(prob.fix === 'rows' ? '[data-fk="inc-all"]' : '[data-fk="pick-file"]');
    if (b) b.focus();
  }
}

/* Start: creates the run from the ticked rows, adds it to "This session",
   opens it in the same table and focuses Stop. A refusal is shown in the
   action bar. One start at a time: the draft and its Start button are gone
   before the new run is loaded, and starting stays set until then. */
export async function startRun() {
  const dr = S.draft;
  if (!setupShown() || starting) return;
  const prob = startProblem(dr, S.setup);
  if (prob) { fixProblem(prob); return; }
  starting = true;
  let run;
  try {
    run = await api.createRun(dr.file.fileId, dr.cfg, excludeList(dr.excluded, dr.file.table.length));
  } catch (e) {
    starting = false;
    if (S.draft === dr) { dr.startError = e.message; renderSetupBar(); }
    return;
  }
  S.sessionRunIds.add(run.id);
  noteSummary(run);
  const n = tickedCount(dr);
  const shown = S.draft === dr && setupShown();
  // The draft became this run, also when it was parked meanwhile.
  if (S.draft === dr) dropDraft();
  if (!shown) { starting = false; renderRail(); return; }
  renderAll();
  try { await openRun(run.id); } finally { starting = false; }
  announce('Run started for ' + n + (n === 1 ? ' company.' : ' companies.'));
  const stop = R('head').querySelector('[data-fk="stop"]');
  if (stop) stop.focus();
}
