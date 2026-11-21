/* The run header: file, status pill, actions, run facts, settings tags and
   the progress line or notice. Ported from the prototype's renderHead, plus
   the Failed and Interrupted pills and their notices. */
import { esc, counts, dateLabel, countOf } from '../model.js';
import { S, resumable, setupShown } from '../store.js';
import { R, kbd } from './util.js';
import { counterHtml, putWithCounters } from './counter.js';

const PILL = {
  running: ['is-running', 'Running'],
  complete: ['is-complete', 'Complete'],
  stopped: ['is-stopped', 'Stopped'],
  interrupted: ['is-interrupted', 'Interrupted'],
  failed: ['is-failed', 'Failed'],
};

/* cfg: the run's Settings; batch: whether it runs in batch mode. */
function cfgTags(cfg, batch) {
  const t = (on, label) => '<span class="wb-cfgtag ' + (on ? '' : 'is-off') + '">' + label + '</span>';
  return '<div class="wb-cfg">' +
    t(cfg.enrichment, 'Web enrichment') + t(cfg.epo, 'Patent lookup') +
    t(cfg.validator, 'Validation &lt; ' + esc(cfg.validatorThreshold)) + t(batch, 'Batch mode') +
    '<span class="wb-cfgtag">Override ≥ ' + esc(cfg.overrideMinConfidence) + '</span>' +
    '<span class="wb-cfgtag">Patent adj. ±' + esc(cfg.epoAdjustMax) + '</span>' +
    '<span class="wb-cfgtag">Low-evidence cap ' + esc(cfg.lowEvidenceCap) + '</span></div>';
}

/* opts.animate: the counters roll to their new values (polling, decisions). */
export function renderHead(opts) {
  if (setupShown()) return; // the setup head (render/setup.js)
  const el = R('head');
  el.hidden = !S.active;
  if (!S.active) { el.innerHTML = ''; return; }
  const run = S.active.run;
  const pill = PILL[run.status] || PILL.stopped;
  const date = dateLabel(run.createdAt, new Date());
  let acts = '';
  if (run.status === 'running') acts += '<button class="wb-btn wb-btn-stop" data-act="stop" data-fk="stop">■ Stop ' + kbd('S') + '</button>';
  if (resumable(run)) acts += '<button class="wb-btn wb-btn-primary" data-act="resume" data-fk="resume">Resume ' + kbd('S') + '</button>';
  acts += '<button class="wb-btn" data-act="rerun" data-fk="rerun" title="Set up a new run with these settings and column mapping">Same settings…</button>';
  acts += '<button class="wb-btn" data-act="download" data-fk="download"><span class="wb-l-long">Download Excel</span><span class="wb-l-short">Excel</span> ' + kbd('D') + '</button>';
  const k = counts(S.active.rows);
  const meta = '<span class="wb-mono">' + esc(run.id) + '</span>' + (date ? '<span>' + esc(date) + '</span>' : '') +
    (run.model ? '<span class="wb-mono">' + esc(run.model) + '</span>' : '') + '<span class="wb-num">' + countOf(k.total, 'company', 'companies') + '</span>';
  const modelTxt = run.model ? '<span class="wb-mono">' + esc(run.model) + '</span>, the model this run started with' : 'the model this run started with';
  let extra = cfgTags(run.settings || {}, run.batch);
  if (run.status === 'running') {
    extra += '<div class="wb-prog"><span class="wb-prog-bar"><span style="transform:scaleX(' + (k.total ? k.done / k.total : 0).toFixed(3) + ')"></span></span>' +
      '<span class="wb-num">' + counterHtml('prog', k.done) + ' of ' + k.total + '</span>' +
      '<span class="wb-prog-t">' + (run.batch ? 'Batch · ' : 'Sequential · ') + esc(run.phase) + '</span></div>';
  } else if (run.status === 'stopped' || run.status === 'interrupted') {
    extra += '<div class="wb-notice">Stopped after <b class="wb-num">' + k.done + ' of ' + k.total + '</b>. Finished results are kept and can be reviewed now. Resume continues at the next unfinished company with ' + modelTxt + '.</div>';
  } else if (run.status === 'failed') {
    extra += '<div class="wb-notice">' + esc(run.error || 'The pipeline stopped with an error.') + '</div>';
  }
  const tip = [run.id, date, run.model, countOf(k.total, 'company', 'companies')].filter(Boolean).join(' · ');
  putWithCounters(el, '<div class="wb-head-row"><div class="wb-head-t"><h1 title="' + esc(tip) + '"><span class="wb-h1-f">' + esc(run.file) + '</span> <span class="wb-status ' + pill[0] + '">' + pill[1] + '</span></h1><div class="wb-head-meta">' + meta + '</div></div><div class="wb-head-acts">' + acts + '</div></div>' + extra, opts);
}
