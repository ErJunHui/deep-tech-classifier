/* The reviewer's decisions: record, restore and undo. Ported from the
   prototype's record, restore and undo, with the simulation replaced by the
   API. Each action calls the API and puts the row it answers with in place
   of the open run's row, then re-renders. The table keeps its order
   (state.js refreshView's snapshot). One decision request at a time: an
   action while one is in flight is not performed, and from BUSY_NOTICE_MS
   into the request it says so once. undoStack holds this session's actions,
   newest last. The pure rules are in model.js. */
import * as api from './api.js';
import {
  rowView, formKey, recordToast, restoreToast, undoToast,
  decisionErrorPlace, undoFailureKeeps, busyNotice, pushUndo, popUndo,
} from './model.js';
import { S, renderDetail, pollSoon, refreshListSoon } from './state.js';
import { renderRail } from './render/rail.js';
import { renderStrip } from './render/strip.js';
import { renderChips } from './render/chips.js';
import { renderTable, rowBtn } from './render/table.js';
import { showFormError } from './render/detail.js';
import { toast } from './render/toast.js';

let undoStack = [];
/* The request in flight: {startedAt, noticed}, or null. */
let inFlight = null;

/* True when a request is in flight (the caller then does nothing); shows
   "Still saving the last decision" once when it has been running long
   enough. */
function busy() {
  if (!inFlight) return false;
  if (busyNotice(inFlight.startedAt, Date.now(), inFlight.noticed)) {
    inFlight.noticed = true;
    toast('Still saving the last decision');
  }
  return true;
}
/* Runs request (a promise-returning API call) as the one in flight. */
async function send(request) {
  inFlight = { startedAt: Date.now(), noticed: false };
  try { return await request(); } finally { inFlight = null; }
}

/* Shows a decided row of the open run: the row is replaced and every region
   that counts decisions re-renders, the counters rolling. patch: the table
   rows to redraw. */
function afterDecision(a, row, patch) {
  a.rows[row.index] = row;
  renderRail();
  renderStrip({ animate: true }); renderChips(); renderTable({ patch }); renderDetail();
  pollSoon(); // the run summary's counts
}

/* An API error: in the open form's hint when the row's form is on screen,
   else as a toast. */
function decisionFailed(runId, index, title, e) {
  const place = decisionErrorPlace({ forms: S.forms, runId, index, activeRunId: S.active ? S.active.run.id : null, selected: S.selected });
  if (!(place === 'form' && showFormError(e.message))) toast(title, e.message);
}

/* Records a decision on row index of the open run: choice 'confirm' (the
   pipeline's verdict) or 'change' (the other one), with note. Resolves true
   when it was recorded and the run is still open. */
export async function record(index, choice, note) {
  const a = S.active;
  if (!a || busy()) return false;
  const v = rowView(a.rows[index]);
  if (!v.r || v.error) return false;
  let row;
  try { row = await send(() => api.putDecision(a.run.id, index, choice, note)); } catch (e) { decisionFailed(a.run.id, index, 'Could not record the decision', e); return false; }
  const t = recordToast(v, choice, note, undoStack.length + 1);
  undoStack = pushUndo(undoStack, { runId: a.run.id, index, label: t.title });
  delete S.forms[formKey(a.run.id, index)];
  toast(t.title, t.body, { undo: true });
  if (S.active !== a) { renderRail(); return false; }
  afterDecision(a, row, [index]);
  return true;
}

/* Goes back to the pipeline's verdict on row index of the open run. */
export async function restore(index) {
  const a = S.active;
  if (!a || busy()) return;
  const v = rowView(a.rows[index]);
  if (!v.r || v.error || !v.dec) return;
  let row;
  try { row = await send(() => api.restoreDecision(a.run.id, index)); } catch (e) { toast('Could not restore the pipeline verdict', e.message); return; }
  const t = restoreToast(v);
  undoStack = pushUndo(undoStack, { runId: a.run.id, index, label: t.label });
  delete S.forms[formKey(a.run.id, index)];
  toast(t.title, t.body, { undo: true });
  if (S.active !== a) { renderRail(); return; }
  afterDecision(a, row, [index]);
}

/* Undoes the newest action in undoStack, on whichever run it was made. The
   row is selected when it is in the open run's view; for a run that is not
   open only the rail is refreshed (from the next run list). A failed undo
   goes back on the stack unless the server refused it (undoFailureKeeps). */
export async function undo() {
  if (busy()) return;
  const p = popUndo(undoStack);
  if (!p) { toast('Nothing to undo', 'Reviewer actions in this session can be undone one at a time.'); return; }
  const u = p.entry;
  undoStack = p.stack;
  let row;
  try {
    row = await send(() => api.undoDecision(u.runId, u.index));
  } catch (e) {
    if (undoFailureKeeps(e)) undoStack = pushUndo(undoStack, u);
    toast('Could not undo: ' + u.label, e.message);
    return;
  }
  const t = undoToast(u.label, undoStack.length);
  toast(t.title, t.body);
  const a = S.active;
  if (!a || a.run.id !== u.runId) {
    refreshListSoon();
    renderRail();
    return;
  }
  const prev = S.selected;
  const at = S.viewIds.indexOf(u.index);
  const moved = at >= 0 && prev !== u.index;
  if (moved) {
    S.selected = u.index;
    if (at >= S.limit) S.limit = at + 1;
  }
  afterDecision(a, row, moved && prev != null ? [prev, u.index] : [u.index]);
  if (moved) { const b = rowBtn(u.index); if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest' }); }
}
