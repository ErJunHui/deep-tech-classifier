/* The analyst-settings side sheet of a new run: provider with key status,
   tier, pinned model, steps, the six thresholds and the estimate. Ported
   from the prototype's openSheet, closeSheet, sheetEstHtml and
   sheetBodyHtml. It is a modal dialog: S.analyst is true while it is open,
   global shortcuts are off, Tab stays inside it (trapTab) and closing it
   returns focus to the control that opened it. */
import { esc, money, fmtDur, startProblem, modelFor, pinUnpriced, estimateNote, unknownCostLine, ESTIMATE_FAILED, ESTIMATE_SAMPLE, SETTING_BOUNDS } from '../model.js';
import { S, setupShown } from '../store.js';
import { R, put, kbd } from './util.js';
import { QUALITY, draftProvider, noBatchText, closePop, openSettings } from './setup.js';

const THRESHOLDS = [
  { key: 'validatorThreshold', label: 'Validation threshold', help: 'Validator runs below this confidence', needs: 'validator' },
  { key: 'overrideMinConfidence', label: 'Override minimum', help: 'Validator may flip a verdict at or above this', needs: 'validator' },
  { key: 'epoAdjustMax', label: 'Patent adjustment max', help: 'Points patents add or subtract', needs: 'epo' },
  { key: 'lowEvidenceCap', label: 'Low-evidence cap', help: 'Ceiling with no description and no patents' },
  { key: 'maxWebSearches', label: 'Validator web searches', help: 'Per validated company', needs: 'validator' },
  { key: 'enrichmentMaxSearches', label: 'Enrichment web searches', help: 'Per company', needs: 'enrichment' },
];
export const THRESHOLD_KEYS = THRESHOLDS.map((t) => t.key);

let ret = null; // data-fk of the control focus returns to
let closeTimer = null;

/* from: data-fk of the control that opened it ('analyst-open', the link in
   the settings popover, or 'start'). Focus goes to the chosen provider. */
export function openAnalyst(from) {
  if (!setupShown()) return;
  closePop(false);
  clearTimeout(closeTimer);
  S.analyst = true;
  ret = from || 'settings';
  R('overlay').innerHTML = '<div class="wb-scrim" data-act="analyst-close"></div>' +
    '<section class="wb-sheet" role="dialog" aria-modal="true" aria-labelledby="wb-sh-t">' +
    '<div class="wb-sh-head"><div class="wb-sh-title"><h2 id="wb-sh-t">Analyst settings</h2><button class="wb-btn wb-btn-sm" data-act="analyst-close" data-fk="sh-close">Done ' + kbd('Esc') + '</button></div>' +
    '<p class="wb-sh-sub">Everything the pipeline can be tuned with. The defaults suit most runs.</p><div data-r="sh-est"></div></div>' +
    '<div class="wb-sh-body" data-r="sh-body"></div></section>';
  renderAnalyst();
  const f = R('overlay').querySelector('input[name="wb-prov"]:checked') || R('overlay').querySelector('[data-fk="sh-close"]');
  if (f) f.focus();
}

/* restore (default true): focus returns to the opener. Opened from the
   settings popover's link, the popover opens again with the link focused. */
export function closeAnalyst(restore) {
  if (!S.analyst) return;
  S.analyst = false;
  const ov = R('overlay');
  ov.querySelectorAll('.wb-scrim, .wb-sheet').forEach((el) => el.classList.add('is-leaving'));
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => { if (!S.analyst) ov.innerHTML = ''; }, 170);
  if (restore === false || !setupShown()) return;
  if (ret === 'analyst-open') openSettings();
  const b = document.querySelector('[data-fk="' + ret + '"]') || document.querySelector('[data-fk="settings"]');
  if (b) b.focus();
}

/* Keeps Tab and Shift+Tab inside the sheet. e: a keydown inside it. */
export function trapTab(e) {
  const sh = R('overlay').querySelector('.wb-sheet');
  if (!sh) return;
  const f = [...sh.querySelectorAll('button, input, select, textarea')].filter((el) => !el.disabled && el.offsetParent !== null);
  if (!f.length) return;
  const first = f[0]; const last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function estHtml() {
  const dr = S.draft; const d = dr.cfg;
  const e = dr.est;
  const prob = startProblem(dr, S.setup);
  const parts = e ? e.parts : null;
  const tot = parts ? (parts.classify + parts.enrich + parts.validate) || 1 : 1;
  const seg = (v, col) => '<span style="width:' + (v / tot * 100).toFixed(1) + '%;background:' + col + '"></span>';
  let split = '';
  if (e && e.known) {
    split = '<div class="wb-est-bar" aria-hidden="true">' + seg(parts.classify, 'var(--accent)') + seg(parts.enrich, 'var(--deep)') + seg(parts.validate, 'var(--contested)') + '</div>' +
      '<div class="wb-est-lg"><span><i class="wb-sw" style="background:var(--accent)"></i>Classify ' + Math.round(parts.classify / tot * 100) + '%</span><span><i class="wb-sw" style="background:var(--deep)"></i>Enrich ' + Math.round(parts.enrich / tot * 100) + '%</span><span><i class="wb-sw" style="background:var(--contested)"></i>Validate ' + Math.round(parts.validate / tot * 100) + '%</span></div>';
  } else if (e) {
    split = '<div class="wb-est-lg">' + esc(unknownCostLine(e)) + '</div>';
  } else if (dr.estFailed) {
    split = '<div class="wb-est-lg">' + ESTIMATE_FAILED + '</div>';
  }
  const prov = draftProvider();
  const model = e ? e.model : modelFor(d, S.setup);
  const batch = e ? e.batch : !!(prov && prov.batch && d.batch);
  // No answer: '—' when the request failed, '…' while the first is awaited.
  const none = dr.estFailed ? '—' : '…';
  return '<div class="wb-est">' +
    '<div><div class="wb-est-l">Est. cost' + (dr.file ? '' : ' per ' + ESTIMATE_SAMPLE + ' companies') + '</div><div class="wb-est-v">' + (e ? (e.known ? money(e.cost) : 'unknown') : none) + '</div></div>' +
    '<div><div class="wb-est-l">Duration</div><div class="wb-est-v">' + (e ? fmtDur(e.secs) : none) + '</div></div>' +
    '<div class="wb-est-split">' + split + '</div>' +
    (prob ? '<div class="wb-est-why">' + esc(prob.label) + '</div>' : '') +
    '<div class="wb-est-note">' + esc(model) + ' · ' + (batch ? 'batch mode halves classifier cost; a real batch job can take up to an hour' : 'one company at a time') + ' · web searches are usually the largest part of the bill</div>' +
    (e ? '<div class="wb-est-note">' + esc(estimateNote(e)) + '</div>' : '') + '</div>';
}

function bodyHtml() {
  const d = S.draft.cfg; const prov = draftProvider(); const setup = S.setup;
  let h = '<fieldset class="wb-fs"><legend>Model</legend><div class="wb-provs" role="radiogroup" aria-label="Provider">' + setup.providers.map((p) =>
    '<label class="wb-opt"><input type="radio" name="wb-prov" value="' + esc(p.id) + '" data-fk="prov-' + esc(p.id) + '"' + (p.id === d.provider ? ' checked' : '') + '><span class="wb-opt-t">' + esc(p.label) + '</span><span class="wb-opt-s ' + (p.keySet ? 'is-ok' : 'is-miss') + '">' + (p.keySet ? 'Key set' : esc(p.keyVar) + ' missing') + '</span></label>').join('') + '</div>';
  if (prov && !prov.keySet) h += '<div class="wb-warn">' + esc(prov.label) + ' is not set up yet. Ask your admin to add ' + esc(prov.keyVar) + ' to .env, then reload.</div>';
  if (prov) {
    h += '<div class="wb-tiers" role="radiogroup" aria-label="Tier">' + QUALITY.map((q) =>
      '<label class="wb-opt"><input type="radio" name="wb-tier" value="' + q.tier + '" data-fk="tier-' + q.tier + '"' + (q.tier === d.tier ? ' checked' : '') + '><span class="wb-opt-t">' + q.name + ' · ' + esc(prov.tiers[q.tier]) + '</span><span class="wb-opt-s wb-num">' + q.tier + ' tier</span></label>').join('') + '</div>';
  }
  const tierModel = prov ? prov.tiers[d.tier] || '' : '';
  h += '<div class="wb-row2"><label for="wb-pin">Pin exact model</label><input id="wb-pin" class="wb-input wb-mono" data-field="model" data-fk="pin" placeholder="' + esc(tierModel) + ' (from tier)" value="' + esc(d.model) + '" autocomplete="off" spellcheck="false"></div>';
  h += '<div class="wb-hint">Leave empty to use the tier. Pin a model for audits or runs you will compare over time.' + (pinUnpriced(d.model, setup.pricedModels) ? ' This model is not listed in pipeline/models.py: it runs with the original request settings and its cost shows as unknown.' : '') + '</div></fieldset>';
  const tg = (key, title, sub, disabled) => '<label class="wb-tg ' + (disabled ? 'is-disabled' : '') + '"><span class="wb-tg-t">' + title + '</span><span class="wb-tg-s">' + sub + '</span><input type="checkbox" class="wb-switch" data-toggle="' + key + '" data-fk="tg-' + key + '"' + (d[key] && !disabled ? ' checked' : '') + (disabled ? ' disabled' : '') + '></label>';
  const noBatch = !!prov && !prov.batch;
  h += '<fieldset class="wb-fs"><legend>Steps</legend>' +
    tg('enrichment', 'Web enrichment', 'Search the web for a current description before classifying') +
    tg('epo', 'Patent lookup', 'EPO patent data adjusts confidence by up to ±' + esc(d.epoAdjustMax) + (setup.epoKeysSet ? ' · EPO keys set' : ' · EPO keys missing; the run continues without patents')) +
    tg('validator', 'Validation', 'A second pass searches the web when confidence is below ' + esc(d.validatorThreshold) + ', then confirms, overrides or escalates') +
    tg('batch', 'Batch mode', noBatch ? esc(noBatchText(prov)) : 'Classify all companies in one batch job: about half the classifier cost, but results can take an hour or more', noBatch) +
    '</fieldset>';
  h += '<fieldset class="wb-fs"><legend>Thresholds</legend><div class="wb-th-grid">' + THRESHOLDS.map((t) => {
    const off = t.needs && !d[t.needs];
    const b = SETTING_BOUNDS[t.key];
    return '<label class="wb-thf ' + (off ? 'is-off' : '') + '"><span>' + t.label + '</span><input type="number" class="wb-input" min="' + b[0] + '" max="' + b[1] + '" data-num="' + t.key + '" data-fk="num-' + t.key + '" value="' + esc(d[t.key]) + '"' + (off ? ' disabled' : '') + '><small>' + t.help + (off ? ' (step is off)' : '') + '</small></label>';
  }).join('') + '</div><div class="wb-fs-foot"><button class="wb-btn wb-btn-ghost wb-btn-sm" data-act="reset-th" data-fk="reset-th">Reset thresholds to defaults</button></div></fieldset>';
  return h;
}

/* The estimate at the top of the open sheet. */
export function renderAnalystEst() {
  if (S.analyst && setupShown()) put(R('sh-est'), estHtml());
}
/* The whole open sheet. */
export function renderAnalyst() {
  if (!S.analyst || !setupShown()) return;
  renderAnalystEst();
  put(R('sh-body'), bodyHtml());
}
