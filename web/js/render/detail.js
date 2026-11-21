/* The evidence panel: the selected row's header, the reviewer's decision
   controls and form, and the evidence sections. Ported from the prototype's
   renderDetail through pendingDetail, with company fields read from the Row
   and result fields from row.result. A row whose classification ended in an
   error shows what went wrong and has no decision controls. main.js
   registers renderDetail with state.js (setDetailRenderer). */
import { esc, money, signed, flip, vLow, actionFor, confWord, hhmm, rowView, formProblem, needsNote, formKey } from '../model.js';
import { S, setupShown } from '../store.js';
import { R, put, kbd, MOD, CRIT, verdictHtml, errorVerdictHtml, riskHtml } from './util.js';

const BASIS = { COMBINED: 'Input and web descriptions', WEB_DESCRIPTION: 'Web description', DESCRIPTION_ONLY: 'Input description only' };
const VAL_FIND = { confirm: 'Confirmed the verdict', override: 'Argued for the other verdict', insufficient_evidence: 'Insufficient evidence' };
const VAL_DEC = { AUTO_APPROVE: 'No escalation', ESCALATE_FOR_HUMAN_REVIEW: 'Escalated for human review' };
/* Progress steps reported by the pipeline, mapped to the step list's keys. */
const STEP_OF = { 'Waiting for batch': 'Classification', 'In batch job': 'Classification', 'Validation queued': 'Validation' };

const basisLabel = (b) => BASIS[b] || 'Basis not recorded';
/* An ISO timestamp from the server (local time) as 14:40; '' when unreadable. */
function timeOf(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? hhmm(d) : '';
}
const settingsOf = (run) => run.settings || {};
const pct = (n) => Math.max(0, Math.min(100, Number(n) || 0));

/* opts.reset: scroll the panel back to the top (a new selection). */
export function renderDetail(opts) {
  const el = R('detail');
  if (!el) return;
  const keep = el.scrollTop;
  if (!S.active || setupShown()) { put(el, ''); return; }
  const row = S.selected == null ? null : S.active.rows[S.selected];
  if (!row) { put(el, '<div class="wb-d-empty">Select a row to see its evidence.<br>' + kbd('J') + ' ' + kbd('K') + ' move through the table · ' + kbd('?') + ' all shortcuts</div>'); return; }
  const run = S.active.run;
  const v = rowView(row);
  const body = v.error ? errorHtml(v) : v.r ? docHtml(run, v) : pendingDetail(run, v);
  put(el, '<div class="wb-d">' + detailTop(run, v) + body + '</div>');
  el.scrollTop = opts && opts.reset ? 0 : keep;
}

function readToggle() {
  return '<button class="wb-btn wb-btn-sm" data-act="reading" data-fk="reading" aria-pressed="' + S.reading + '" title="' + (S.reading ? 'Back to the table layout' : 'Give the evidence most of the screen') + '">' + (S.reading ? 'Exit reading view' : 'Reading view') + ' ' + kbd('E') + '</button>';
}

function detailTop(run, v) {
  const row = v.row;
  const mapping = settingsOf(run).mapping || {};
  const sub = '<div class="wb-d-sub">' + (mapping.uen ? '<span class="wb-mono">UEN ' + esc(row.uen) + '</span>' : '') + '<span>' + esc(row.domain) + '</span><span class="wb-num">Row ' + v.idx + ' of ' + S.active.rows.length + '</span></div>';
  let h = '<div class="wb-d-top"><div class="wb-d-row1"><div><h2>' + esc(row.name) + '</h2>' + sub + '</div>' + readToggle() + '</div>';
  if (v.error) {
    h += '<div class="wb-d-row2">' + errorVerdictHtml() + '<span class="wb-dim">' + v.action + '</span></div>';
  } else if (v.r) {
    const r = v.r;
    h += v.reclassified
      ? '<div class="wb-d-row2">' + verdictHtml(v.verdict) + '<span class="wb-dim">· reviewer decision</span>' +
        '<span class="wb-muted wb-num">Pipeline: ' + vLow(r.verdict) + ', ' + r.conf + ' · ' + esc(r.risk) + '</span>' +
        '<span class="wb-dim">' + v.action + ' · reclassified</span></div>'
      : '<div class="wb-d-row2">' + verdictHtml(v.verdict) +
        '<span class="wb-d-conf"><b>' + r.conf + '</b> ' + confWord(r.conf).toLowerCase() + ' confidence</span>' + riskHtml(r.risk) +
        '<span class="wb-dim">' + v.action + (v.confirmed ? ' · reviewed' : '') + '</span></div>';
    h += decisionArea(run, v);
  } else {
    const p = run.status === 'running' ? row.step : null;
    h += '<div class="wb-d-row2"><span class="wb-dim">' + (p ? 'In progress: ' + esc(p) : run.status === 'running' ? 'Queued' : 'Not started') + '. Decisions open when the result is in.</span></div>';
  }
  return h + '</div>';
}

function decisionArea(run, v) {
  const form = S.forms[formKey(run.id, v.row.index)];
  if (form && form.open) return formHtml(v, form);
  const pv = v.r.verdict;
  if (v.dec) {
    const at = timeOf(v.dec.at);
    return '<div class="wb-ds"><span class="wb-ds-t"><b>' + (v.reclassified ? '↺ Reclassified to ' + vLow(v.dec.verdict) : '✓ Confirmed ' + vLow(v.dec.verdict)) + '</b>' + (at ? ' · ' + at : '') + (v.dec.note ? ' · “' + esc(v.dec.note) + '”' : '') + '</span>' +
      '<button class="wb-btn wb-btn-sm" data-act="change-dec" data-fk="change-dec">Change decision ' + kbd('X') + '</button>' +
      '<button class="wb-btn wb-btn-sm wb-btn-ghost" data-act="restore" data-fk="restore">Restore pipeline verdict</button></div>';
  }
  if (v.flagged) {
    return '<div class="wb-ds"><button class="wb-btn wb-btn-sm wb-btn-primary" data-act="quick-confirm" data-fk="quick-confirm">✓ Confirm ' + vLow(pv) + ' ' + kbd('C') + '</button>' +
      '<button class="wb-btn wb-btn-sm" data-act="open-change" data-fk="open-change">Change to ' + vLow(flip(pv)) + ' ' + kbd('X') + '</button>' +
      '<button class="wb-btn wb-btn-sm wb-btn-ghost" data-act="open-note" data-fk="open-note">Note ' + kbd('M') + '</button></div>';
  }
  return '<div class="wb-ds"><span class="wb-ds-t">' + v.action + ' · no review needed</span><button class="wb-btn wb-btn-sm wb-btn-ghost" data-act="open-change" data-fk="open-change">Reclassify ' + kbd('X') + '</button></div>';
}

const NOTE_REQUIRED = 'Why the pipeline verdict is wrong (required, written to the workbook)';
const NOTE_OPTIONAL = 'Note for the record (optional)';
const whyOk = (req) => (req ? 'The note will be written to the workbook.' : kbd('Esc') + ' leaves the note, the draft is kept');

function formHtml(v, form) {
  const pv = v.r.verdict;
  const req = form.choice ? needsNote(v, form.choice) : false;
  const prob = formProblem(v, form);
  return '<div class="wb-form"><div class="wb-seg" role="radiogroup" aria-label="Outcome">' +
    '<label><input type="radio" name="wb-dec" value="confirm" data-fk="dec-confirm"' + (form.choice === 'confirm' ? ' checked' : '') + '>' + (v.flagged ? 'Confirm ' : 'Keep ') + vLow(pv) + ' ' + kbd('C') + '</label>' +
    '<label><input type="radio" name="wb-dec" value="change" data-fk="dec-change"' + (form.choice === 'change' ? ' checked' : '') + '>Change to ' + vLow(flip(pv)) + ' ' + kbd('X') + '</label></div>' +
    '<textarea data-fk="note" aria-label="Reviewer note" placeholder="' + (req ? NOTE_REQUIRED : NOTE_OPTIONAL) + '">' + esc(form.note) + '</textarea>' +
    '<div class="wb-form-acts"><button class="wb-btn wb-btn-sm wb-btn-primary" data-act="record" data-fk="record"' + (prob ? ' disabled' : '') + '>Record ' + kbd(MOD, '↵') + '</button>' +
    '<button class="wb-btn wb-btn-sm wb-btn-ghost" data-act="cancel-form" data-fk="cancel-form">Cancel</button>' +
    '<span class="wb-form-why ' + (prob ? '' : 'is-ok') + '" data-r="form-why">' + (prob ? esc(prob) : whyOk(req)) + '</span></div></div>';
}

/* Brings the open form's Record button, hint and note placeholder up to date
   with its draft, without re-rendering it (the note keeps focus). */
export function syncForm() {
  if (!S.active || S.selected == null) return;
  const row = S.active.rows[S.selected];
  const form = row && S.forms[formKey(S.active.run.id, row.index)];
  if (!form) return;
  const v = rowView(row);
  if (!v.r || v.error) return;
  const el = R('detail');
  const prob = formProblem(v, form);
  const req = form.choice ? needsNote(v, form.choice) : false;
  const b = el.querySelector('[data-fk="record"]'); if (b) b.disabled = !!prob;
  const w = el.querySelector('[data-r="form-why"]');
  if (w) { w.className = 'wb-form-why ' + (prob ? '' : 'is-ok'); w.innerHTML = prob ? esc(prob) : whyOk(req); }
  const ta = el.querySelector('[data-fk="note"]');
  if (ta) ta.placeholder = req ? NOTE_REQUIRED : NOTE_OPTIONAL;
}

/* Shows message (an API error) in the open form's hint; false when no form
   is on screen. */
export function showFormError(message) {
  const w = R('detail').querySelector('[data-r="form-why"]');
  if (!w) return false;
  w.className = 'wb-form-why';
  w.textContent = message;
  return true;
}

function sec(key, title, aside, body) {
  const closed = !!S.collapsed[key];
  return '<section class="wb-sec" data-sec="' + key + '"><h3 class="wb-sec-h"><button class="wb-sec-btn" data-act="toggle-sec" data-k="' + key + '" data-fk="sec-' + key + '" aria-expanded="' + !closed + '"><span class="wb-caret" aria-hidden="true">' + (closed ? '▸' : '▾') + '</span>' + title + '</button><span class="wb-sec-aside">' + (aside || '') + '</span></h3>' + (closed ? '' : '<div class="wb-sec-b">' + body + '</div>') + '</section>';
}

function docHtml(run, v) {
  const r = v.r;
  const main = (v.reclassified ? reclassHtml(v) : flagHtml(run, r)) +
    sec('reasoning', 'Reasoning', v.reclassified ? 'Pipeline, supports ' + vLow(r.verdict) : 'Classifier, ' + basisLabel(r.basis).toLowerCase(), '<p class="wb-lead">' + esc(r.reasoning) + '</p>') +
    criteriaHtml(r) + buildHtml(run, r, v) + evidenceHtml(v.row, r) + patentsHtml(r) + validatorHtml(run, r) + historyHtml(run, v) +
    sec('facts', 'Run facts', '', factsHtml(run, v, false));
  return '<div class="wb-doc"><div class="wb-doc-main">' + main + '</div><aside class="wb-doc-facts" aria-label="Facts">' + factsHtml(run, v, true) + '</aside></div>';
}

function factsHtml(run, v, stack) {
  const row = v.row; const r = v.r; const cfg = settingsOf(run);
  const web = r.hasWeb ? r.webSource : !cfg.enrichment ? 'Enrichment off' : r.webStatus === 'not_found' ? 'Nothing reliable found' : 'Not used';
  const pat = r.patents.status === 'disabled' ? 'Lookup off' : r.patents.count + (r.patents.level ? ' · ' + r.patents.level : '');
  const val = r.validated ? (VAL_FIND[r.val.verdict] || r.val.verdict) + ' · ' + r.val.confidence : cfg.validator ? 'Not needed' : 'Validation off';
  const rows = [
    ['UEN', (cfg.mapping || {}).uen ? '<span class="wb-mono">' + esc(row.uen) + '</span>' : 'Not mapped'],
    ['Sector', esc(row.domain)], ['Basis', basisLabel(r.basis)], ['Web source', esc(web)], ['Patents', esc(pat)], ['Validator', esc(val)],
    ['Cost', r.cost == null ? 'unknown (pinned model has no listed price)' : money(r.cost, 3)], ['Time', r.timeS == null ? '—' : r.timeS.toFixed(1) + ' s'],
    ['Model', '<span class="wb-mono">' + esc(r.model || run.model) + '</span>'],
  ];
  return '<dl class="wb-kv wb-num' + (stack ? ' is-stack' : '') + '">' + rows.map((x) => '<dt>' + x[0] + '</dt><dd>' + x[1] + '</dd>').join('') + '</dl>';
}

function reclassHtml(v) {
  const r = v.r;
  return '<div class="wb-flag r-Reclass"><div class="wb-flag-t">Reclassified by reviewer: ' + vLow(v.verdict) + '</div>' +
    '<p>' + (v.dec.note ? '“' + esc(v.dec.note) + '”' : 'No note recorded.') + '</p>' +
    '<p>The pipeline said ' + vLow(r.verdict) + ' with confidence ' + r.conf + ' (' + esc(r.risk) + '). The reasoning, criteria and confidence below are the pipeline’s and support its original verdict, not the reviewer’s.</p></div>';
}

function flagHtml(run, r) {
  const cfg = settingsOf(run);
  const th = Number(cfg.validatorThreshold);
  let t = ''; let p = '';
  if (r.risk === 'Clear') {
    t = 'Clear: no open questions';
    p = r.validated ? 'The validator checked the web and confirmed the verdict with enough confidence, so the action follows the verdict.'
      : r.conf < th && !cfg.validator ? 'Confidence is below ' + th + ', but validation was off for this run, so nothing challenged the verdict. Treat it with care.'
        : 'Confidence reached ' + th + ' or more without needing a second opinion. The action follows the verdict.';
  } else if (r.risk === 'Uncertain') {
    t = 'Uncertain: evidence is thin';
    p = 'The validator searched the web, but confidence is still below ' + th + '. Nothing contradicts the verdict; there just is not enough to be sure.';
  } else if (r.risk === 'Contested') {
    t = 'Contested: the validator disagreed';
    p = 'A second pass argued for ' + vLow(flip(r.verdict)) + ', with confidence ' + esc(r.val ? r.val.confidence : '') + '. That is below the ' + Number(cfg.overrideMinConfidence) + ' needed to change the verdict, so the original verdict stands with reduced confidence. Two readings are plausible.';
  } else {
    t = 'Escalate: needs a human decision';
    p = 'The validator found the evidence contradictory or insufficient and handed the call to a reviewer.';
  }
  const reason = r.val && r.val.escalationReason ? '<p><b>Reason:</b> ' + esc(r.val.escalationReason) + '</p>' : '';
  return '<div class="wb-flag r-' + esc(r.risk) + '"><div class="wb-flag-t">' + t + '</div><p>' + p + '</p>' + reason + '</div>';
}

function criteriaHtml(r) {
  const crit = (k) => (r.criteria && r.criteria[k]) || {};
  const met = CRIT.filter((x) => crit(x[0]).met).length;
  return sec('criteria', 'Criteria', '<span class="wb-num">' + met + ' of 3 met</span>', CRIT.map((x) => {
    const cr = crit(x[0]);
    return '<div class="wb-crit"><span class="wb-mk ' + (cr.met ? 'is-y' : 'is-n') + '" aria-hidden="true">' + (cr.met ? '✓' : x[1]) + '</span><b>' + x[2] + ' · ' + (cr.met ? 'met' : 'not met') + '</b><p>' + esc(cr.reasoning) + '</p></div>';
  }).join(''));
}

function buildHtml(run, r, v) {
  const cfg = settingsOf(run);
  const th = Number(cfg.validatorThreshold);
  const adjMax = Number(cfg.epoAdjustMax);
  const cap = Number(cfg.lowEvidenceCap);
  let rows = '<tr><td>Classifier score<span class="wb-why">Agent 1 confidence in its verdict</span></td><td>' + r.llm + '</td></tr>';
  const patWhy = !cfg.epo ? 'Patent lookup was off for this run' : r.adj === 0 ? (r.patents.count ? 'Patents are not deep tech; no adjustment' : 'No patents found; no adjustment') : r.patents.level + ' portfolio, ' + r.patents.count + ' patent' + (r.patents.count === 1 ? '' : 's') + ', max ±' + adjMax;
  rows += '<tr><td>Patent adjustment<span class="wb-why">' + esc(patWhy) + '</span></td><td>' + signed(r.adj) + '</td></tr>';
  if (r.capped && !r.validated) rows += '<tr><td>Low-evidence cap<span class="wb-why">No description and no patents</span></td><td>≤ ' + cap + '</td></tr>';
  rows += '<tr><td>Before validation<span class="wb-why">' + (!cfg.validator ? 'Validation off for this run' : r.validated ? 'Below ' + th + ', so the validator ran' : r.pre < th ? 'Below ' + th + '; validator not triggered in this run' : th + ' or more, so no validation needed') + '</span></td><td>' + r.pre + '</td></tr>';
  if (r.validated) {
    const how = r.val.verdict === 'confirm' ? 'Confirmed: takes the validator’s confidence'
      : r.override === 'applied' ? 'Override applied: verdict flipped, takes the validator’s confidence'
        : r.override === 'blocked' ? 'Override blocked: at most 100 − ' + esc(r.val.confidence)
          : 'Insufficient evidence: confidence can only go down';
    rows += '<tr><td>Validator<span class="wb-why">' + how + (r.capped ? '; low-evidence cap ' + cap : '') + '</span></td><td>' + signed(r.conf - r.pre) + '</td></tr>';
  }
  rows += '<tr class="is-total"><td>Final confidence</td><td>' + r.conf + '</td></tr>';
  const track = '<div class="wb-track" aria-hidden="true"><span class="wb-track-l"></span><span class="wb-track-th" style="left:' + pct(th) + '%"></span>' +
    (r.pre !== r.conf ? '<span class="wb-track-pre" style="left:' + pct(r.pre) + '%"></span>' : '') + '<span class="wb-track-fin" style="left:' + pct(r.conf) + '%"></span></div>' +
    '<div class="wb-track-ax"><span>0</span><span>' + (r.pre !== r.conf ? '○ before validation · ● final · ' : '') + 'dashed: validation threshold ' + th + '</span><span>100</span></div>';
  return sec('build', 'How the pipeline’s confidence was built', '<span class="wb-num">' + (v.reclassified ? 'in ' + vLow(r.verdict) + ': ' + r.conf : r.conf + ' · ' + confWord(r.conf).toLowerCase()) + '</span>', '<table class="wb-build"><tbody>' + rows + '</tbody></table>' + track);
}

function evidenceHtml(row, r) {
  let q = '';
  if (r.hasWeb) q += '<div class="wb-quote">' + esc(r.webDescription) + '<span class="wb-quote-src">Web enrichment · ' + esc(r.webSource) + '</span></div>';
  if (r.hasInputDesc) q += '<div class="wb-quote">' + esc(row.description) + '<span class="wb-quote-src">Input file</span></div>';
  if (!q) q = '<div class="wb-quote">No description in the input file' + (r.webStatus === 'not_found' ? ' and nothing reliable found on the web' : '') + '. The verdict rests on the company name' + (r.patents.count ? ' and patents' : '') + '.</div>';
  return sec('read', 'What the classifier read', basisLabel(r.basis), q);
}

function patentsHtml(r) {
  const p = r.patents;
  if (p.status === 'disabled') return sec('patents', 'Patents (EPO)', 'off', '<p class="wb-muted">Patent lookup was off for this run.</p>');
  const cpc = (p.cpc || []).map((x) => '<div class="wb-cpc"><code>' + esc(x.code) + '</code><span>' + esc(x.desc) + '</span></div>').join('');
  return sec('patents', 'Patents (EPO)', '<span class="wb-num">' + p.count + ' found</span>', '<dl class="wb-kv"><dt>Deep tech level</dt><dd>' + esc(p.level) + '</dd>' + (p.domain ? '<dt>Domain</dt><dd>' + esc(p.domain) + '</dd>' : '') + '<dt>Lookup</dt><dd>' + (p.status === 'success' ? 'Matched in EPO' : 'No matching applicant') + '</dd></dl>' + (cpc ? '<div style="margin-top:6px">' + cpc + '</div>' : ''));
}

function validatorHtml(run, r) {
  const cfg = settingsOf(run);
  if (!r.validated) {
    const why = !cfg.validator ? 'Validation was off for this run.' : 'Not run: confidence before validation was ' + r.pre + ', at or above the threshold of ' + Number(cfg.validatorThreshold) + ', or this company was not flagged for a second pass.';
    return sec('validator', 'Validator (Agent 2)', 'not run', '<p class="wb-muted">' + why + '</p>');
  }
  const val = r.val;
  const sources = val.sources || [];
  return sec('validator', 'Validator (Agent 2)', '<span class="wb-num">confidence ' + esc(val.confidence) + '</span>',
    '<dl class="wb-kv"><dt>Finding</dt><dd>' + esc(VAL_FIND[val.verdict] || val.verdict) + (r.override ? ' (override ' + esc(r.override) + ')' : '') + '</dd><dt>Decision</dt><dd>' + esc(VAL_DEC[val.decision] || val.decision) + '</dd></dl>' +
    '<div class="wb-quote" style="margin-top:8px">' + esc(val.summary) + '</div>' +
    '<div class="wb-hint">Sources (' + sources.length + ')</div><ul class="wb-srcs">' + sources.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ul>');
}

function historyHtml(run, v) {
  const h = v.row.history || [];
  const r = v.r;
  const items = ['<li><span class="wb-h-time">' + esc(timeOf(run.createdAt)) + '</span><span><b>Pipeline:</b> ' + vLow(r.verdict) + ' · confidence ' + r.conf + ' · ' + esc(r.risk) + ' → ' + (r.risk !== 'Clear' ? 'Needs Review' : actionFor(r.verdict)) + '</span></li>'];
  let final = r.verdict;
  h.forEach((e) => {
    const what = e.type === 'restore' ? 'Restored pipeline verdict (' + vLow(e.verdict) + ')'
      : e.verdict !== final ? 'Changed to ' + vLow(e.verdict) : 'Confirmed ' + vLow(e.verdict);
    final = e.verdict;
    items.push('<li><span class="wb-h-time">' + esc(timeOf(e.at)) + '</span><span><b>' + what + '</b>' + (e.note ? '<span class="wb-h-note">“' + esc(e.note) + '”</span>' : '') + '</span></li>');
  });
  return sec('history', 'Decision history', h.length ? h.length + ' reviewer action' + (h.length === 1 ? '' : 's') : 'no reviewer actions yet', '<ol class="wb-hlist">' + items.join('') + '</ol>');
}

const inputHtml = (row) => '<section class="wb-sec"><h3 class="wb-sec-h">From the input file</h3><div class="wb-quote">' + (row.description ? esc(row.description) : 'No description in the input file.') + '</div></section>';

/* A row without a result: the steps it goes through (the current one marked
   while the run is running) and its input description. Whether validation
   will run is not known until the confidence is. */
function pendingDetail(run, v) {
  const cfg = settingsOf(run);
  const steps = [];
  if (cfg.enrichment) steps.push(['Enrichment', 'Enrichment']);
  if (cfg.epo) steps.push(['Patent lookup', 'Patent lookup']);
  steps.push(['Classification', 'Classification'], ['Confidence scoring', 'Confidence scoring']);
  if (cfg.validator) steps.push(['Validation', 'Validation (if needed)']);
  const running = run.status === 'running';
  const p = running ? v.row.step : null;
  const cur = p ? (STEP_OF[p] || p) : null;
  const ci = cur ? steps.findIndex((s) => s[0] === cur) : -1;
  const list = steps.map((s, i) => {
    const cls = ci < 0 ? '' : i < ci ? 'is-done' : i === ci ? 'is-now' : '';
    const txt = ci < 0 ? 'waiting' : i < ci ? 'done' : i === ci ? (p === s[0] ? 'in progress' : esc(p.toLowerCase())) : 'waiting';
    return '<li class="' + cls + '"><span>' + (i + 1) + '.</span><span>' + s[1] + '</span><span>' + txt + '</span></li>';
  }).join('');
  return '<div class="wb-doc"><div class="wb-doc-main"><section class="wb-sec"><h3 class="wb-sec-h">' + (p ? 'In progress' : running ? 'Queued' : 'Not started') + '<span class="wb-sec-aside">' + (run.batch ? 'Batch mode' : 'One at a time') + '</span></h3><ul class="wb-steps">' + list + '</ul>' +
    (running ? '' : '<p class="wb-hint">This company had not finished when the run stopped. Resume to classify it.</p>') + '</section>' +
    inputHtml(v.row) + '</div></div>';
}

/* A row whose classification ended in an error: what went wrong and its
   input description, no decision controls. */
function errorHtml(v) {
  return '<div class="wb-doc"><div class="wb-doc-main"><div class="wb-flag"><div class="wb-flag-t">Error: this company was not classified</div>' +
    (v.r.errorMessage ? '<p>' + esc(v.r.errorMessage) + '</p>' : '') +
    (v.row.description ? '<p><b>From the input file:</b> ' + esc(v.row.description) + '</p>' : '') +
    '<p>Resume the run to retry it.</p></div></div></div>';
}
