/* Boots the workbench: loads NumberFlow if it can (the counters fall back to
   plain text without it), the setup info and the run list, opens the newest
   run, binds events and starts polling. */
import * as api from './api.js';
import { S, openRun, renderAll, startPolling } from './state.js';
import { bindEvents } from './events.js';
import { renderRailFoot } from './render/rail.js';
import { toast } from './render/toast.js';

async function loadNumberFlow() {
  try {
    await import('../vendor/number-flow/number-flow.js');
  } catch (e) {
    // Missing or broken: counters show plain text.
  }
}

async function boot() {
  bindEvents();
  await loadNumberFlow();
  try {
    const [setup, runs] = await Promise.all([api.getSetup(), api.listRuns()]);
    S.setup = setup;
    S.runs = runs;
  } catch (e) {
    toast('Could not load the workbench', e.message);
  }
  renderRailFoot();
  if (S.runs.length) await openRun(S.runs[0].id);
  if (!S.active) renderAll(); // no runs (or the newest could not be opened): the empty state
  startPolling();
}

boot();
