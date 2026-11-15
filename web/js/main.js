/* Boots the workbench: registers the evidence panel, binds events, loads
   NumberFlow if it can (the counters fall back to plain text without it),
   the setup info and the run list, opens the newest run and starts polling. */
import * as api from './api.js';
import { S, openRun, renderAll, setDetailRenderer, startPolling } from './state.js';
import { bindEvents } from './events.js';
import { renderRailFoot } from './render/rail.js';
import { renderDetail } from './render/detail.js';
import { toast } from './render/toast.js';

async function loadNumberFlow() {
  try {
    await import('../vendor/number-flow/number-flow.js');
  } catch (e) {
    // Missing or broken: counters show plain text.
  }
}

async function boot() {
  setDetailRenderer(renderDetail);
  bindEvents();
  await loadNumberFlow();
  // Each is retried by polling when it fails here (state.js tick).
  const [setup, runs] = await Promise.allSettled([api.getSetup(), api.listRuns()]);
  if (setup.status === 'fulfilled') S.setup = setup.value;
  if (runs.status === 'fulfilled') { S.runs = runs.value; S.listLoaded = true; }
  else toast('Could not load the workbench', runs.reason.message);
  renderRailFoot();
  if (S.runs.length) await openRun(S.runs[0].id);
  // No open run: the table says why (store.js tableNotice).
  if (!S.active) renderAll();
  startPolling();
}

boot();
