/* The workbench's state object S and the pure rules read from it. A leaf
   module: it imports only the view model, never state.js or render/, so the
   render modules can read S without an import cycle. state.js re-exports S
   and resumable. No DOM access. */
import { newFilters, ROW_WINDOW } from './model.js';

export const S = {
  setup: null, // GET /api/setup
  runs: [], // RunSummary[], newest first
  listLoaded: false, // GET /api/runs has answered at least once
  active: null, // the open run: {run, rows, cursor} from GET /api/runs/{id}, kept current by polling
  openError: null, // {id, message}: the last run that failed to open, until a run opens
  opening: null, // the id of the run being opened (openRun), until it answers
  selected: null, // the selected row's index
  sortKey: 'priority', sortDir: 1,
  f: newFilters(),
  viewIds: [], // the visible row indexes, filtered and sorted (model.computeIds)
  snap: null, // {runId, dec: {index: decision}}: decisions at the last explicit view change
  limit: ROW_WINDOW, // rows the table renders (model.visibleRows)
  viewKey: '', // model.viewKey of the view the limit belongs to
  draft: null, // the new run being set up; kept (parked in the rail) while a run is looked at
  showSetup: false, // the main column shows the draft: read it through setupShown()
  analyst: false, // the analyst-settings sheet is open
  modal: null,
  forms: {}, // {formKey: {open, choice, note}}: decision form drafts
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

/* Whether the main column shows the new run's setup instead of the open
   run: a draft exists and is on screen. A draft parked in the rail (another
   run opened) is not shown. s defaults to S. */
export const setupShown = (s = S) => !!(s.draft && s.showSetup);

/* What the table area says when no run is open, from state s (S):
   {kind: 'offline'}: the run list has not loaded (the server cannot be reached);
   {kind: 'open-failed', message}: runs exist but the one to show failed to open;
   {kind: 'empty'}: the run list loaded and is empty ("No runs yet");
   {kind: 'opening'}: a run is being opened (s.opening), as after Start;
   null: a run is open, or runs exist and none has been asked to open yet. */
export function tableNotice(s) {
  if (s.active) return null;
  if (s.opening) return { kind: 'opening' };
  if (!s.listLoaded) return { kind: 'offline' };
  if (!s.runs.length) return { kind: 'empty' };
  if (s.openError) return { kind: 'open-failed', message: s.openError.message };
  return null;
}
