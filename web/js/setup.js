/* The actions of a new run's setup: open, park, cancel, the file upload,
   the estimate request and Start. Ported from the prototype's openSetup,
   cancelSetup, loadFile and startRun, with the simulation replaced by the
   API. Moved out of state.js the way the decisions moved to decisions.js:
   this module imports state.js (openRun, renderAll, noteSummary), and
   state.js never imports it. The pure rules are in model.js and the setup's
   rendering in render/setup.js. */
import * as api from './api.js';
import {
  ROW_WINDOW, newDraft, mappingForFile, startProblem, startRequest, estimateRows, countOf,
} from './model.js';
import { S, setupShown } from './store.js';
import { openRun, renderAll, noteSummary } from './state.js';
import { R } from './render/util.js';
import { renderRail } from './render/rail.js';
import { toast } from './render/toast.js';
import {
  renderSetup, renderSetupHead, renderSetupTable, renderSetupBar, renderPop,
  focusSetupStart, openMap, closePop, announce,
} from './render/setup.js';
import { renderAnalyst, renderAnalystEst, openAnalyst, closeAnalyst } from './render/analyst.js';

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
   run in the rail. Ignored while Start's request for the draft is in flight
   (draft.starting): the server may already have created the run. */
export function cancelSetup(restoreFocus) {
  if (!S.draft || S.draft.starting) return;
  dropDraft();
  renderAll();
  if (restoreFocus === false) return;
  const ret = setupRet && document.querySelector('[data-fk="' + setupRet + '"]');
  const b = ret || (S.active && document.querySelector('[data-fk="rail-' + S.active.run.id + '"]'));
  if (b) b.focus();
}

/* Esc with a file loaded: leaves setup but keeps the draft parked in the
   rail ("+ New run", O or its rail item returns to it), so a stray key
   never throws away an upload and its mapping. Focus as in cancelSetup. */
export function parkSetup() {
  if (!S.draft || S.draft.starting) return;
  hideSetup();
  renderAll();
  toast('New run kept', 'Press O or pick it in the sidebar to return.');
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
  // While Start's request is in flight the file it uses stays.
  if (!file || !setupShown() || dr.starting) return;
  const token = ++uploadToken;
  dr.reading = file.name; dr.error = '';
  renderSetupHead();
  if (!dr.file) renderSetupTable();
  renderSetupBar(); // Start waits for the file (model.startProblem)
  announce('Reading ' + file.name + '…');
  let info;
  try {
    info = await api.uploadFile(file);
  } catch (e) {
    if (token !== uploadToken || S.draft !== dr) return;
    dr.reading = ''; dr.error = e.message;
    renderSetupHead(); renderSetupTable(); renderSetupBar();
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
  announce('Loaded ' + countOf(info.rows, 'company', 'companies') + ' from ' + info.name + (mapped ? '.' : '. Choose the company name column to continue.'));
  const t = document.querySelector(mapped ? '[data-fk="start"]' : '[data-fk="map-company_name"]');
  if (t) t.focus();
}

/* "Change file": back to the drop target, keeping the settings. */
export function clearFile() {
  const dr = S.draft;
  if (!dr || dr.starting) return;
  uploadToken++;
  dr.file = null; dr.reading = ''; dr.error = '';
  dr.excluded = new Set(); dr.limit = ROW_WINDOW;
  closePop(false);
  setupChanged({ table: true });
  focusSetupStart();
}

/* Takes the user to what blocks the start (model.startProblem's fix). */
function fixProblem(prob) {
  if (prob.fix === 'reading') announce(prob.label);
  else if (prob.fix === 'map') openMap('company_name');
  else if (prob.fix === 'sheet') openAnalyst('start');
  else {
    const b = document.querySelector(prob.fix === 'rows' ? '[data-fk="inc-all"]' : '[data-fk="pick-file"]');
    if (b) b.focus();
  }
}

/* Start: creates the run from the ticked rows, adds it to "This session",
   opens it in the same table and focuses Stop. A refusal is shown in the
   action bar. One start at a time: while the request is in flight the
   draft is marked starting (Start reads "Starting…"; Cancel and Esc do
   nothing), and starting stays set until the new run has opened.
   Once created, the draft is used up. When setup was still on screen, the
   main column shows the run being opened (S.active null, S.opening; no run
   keys act meanwhile) and only a successful open announces it and focuses
   Stop; a failed open shows openRun's notice and toast. When the user had
   gone to another run meanwhile, they stay there and a toast says the run
   started. */
export async function startRun() {
  const dr = S.draft;
  if (!setupShown() || starting || dr.starting) return;
  const prob = startProblem(dr, S.setup);
  if (prob) { fixProblem(prob); return; }
  starting = true;
  dr.starting = true; dr.startError = '';
  renderSetupBar();
  // The count announced is the one sent, also when ticks change meanwhile.
  const { exclude, n } = startRequest(dr);
  let run;
  try {
    run = await api.createRun(dr.file.fileId, dr.cfg, exclude);
  } catch (e) {
    starting = false;
    dr.starting = false;
    if (S.draft === dr) { dr.startError = e.message; renderSetupBar(); }
    return;
  }
  dr.starting = false;
  S.sessionRunIds.add(run.id);
  noteSummary(run);
  const shown = S.draft === dr && setupShown();
  // The draft became this run, also when it was parked meanwhile.
  if (S.draft === dr) dropDraft();
  if (!shown) {
    starting = false;
    renderRail();
    toast('Run started: ' + run.file, 'Classifying ' + countOf(n, 'company', 'companies') + '. It is in the rail under This session.');
    return;
  }
  // The previous run is no longer shown or acted on: the new one is opening.
  S.active = null; S.selected = null; S.opening = run.id;
  renderAll();
  try { await openRun(run.id); } finally { starting = false; }
  if (!S.active || S.active.run.id !== run.id || setupShown()) return;
  announce('Run started for ' + countOf(n, 'company', 'companies') + '.');
  const stop = R('head').querySelector('[data-fk="stop"]');
  if (stop) stop.focus();
}
