/* The evidence panel: the selected row's header, the reviewer's decision
   controls and form, and the evidence sections. Ported from the prototype's
   renderDetail through pendingDetail, with company fields read from the Row
   and result fields from row.result. A row whose classification ended in an
   error shows what went wrong and has no decision controls. main.js
   registers renderDetail with state.js (setDetailRenderer).

   Reads top-down by importance: the decision, why the row was flagged (one
   plain sentence, only when it was), the reasoning, then the evidence, then
   the audit detail (confidence, validator, history) and a one-line footer of
   run metadata. Colour marks only what still needs a decision. */
import { esc, money, signed, flip, vLabel, vLow, actionFor, confWord, hhmm, rowView, formProblem, formHint, needsNote, formKey } from '../model.js';
import { S, setupShown } from '../store.js';
import { R, put, kbd, MOD, CRIT } from './util.js';

const BASIS = { COMBINED: 'Input and web descriptions', WEB_DESCRIPTION: 'Web description', DESCRIPTION_ONLY: 'Input description only' };
const VAL_FIND = { confirm: 'Confirmed the verdict', override: 'Argued for the other verdict', insufficient_evidence: 'Insufficient evidence' };
const VAL_DEC = { AUTO_APPROVE: 'No escalation', ESCALATE_FOR_HUMAN_REVIEW: 'Escalated for human review' };
/* Progress steps reported by the pipeline, mapped to the step list's keys. */
const STEP_OF = { 'Waiting for batch': 'Classification', 'In batch job': 'Classification', 'Validation queued': 'Validation' };
const CHEVRON = '<svg class="wb-chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 3.75 5 6.25l2.5-2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const basisLabel = (b) => BASIS[b] || 'Basis not recorded';
/* An ISO timestamp from the server (local time) as 14:40; '' when unreadable. */
function timeOf(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? hhmm(d) : '';
}
const settingsOf = (run) => run.settings || {};
const pct = (n) => Math.max(0, Math.min(100, Number(n) || 0));
/* A button label with its shortcut in the tooltip rather than on the button. */
const keyTitle = (label, key) => ' title="' + label + ' (' + key + ')"';

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
  const label = S.reading ? 'Exit reading view' : 'Reading view';
  return '<button class="wb-btn wb-btn-sm wb-btn-ghost" data-act="reading" data-fk="reading" aria-pressed="' + S.reading + '"' + keyTitle(S.reading ? 'Back to the table layout' : 'Give the evidence most of the screen', 'E') + '>' + label + '</button>';
}

function detailTop(run, v) {
  const row = v.row;
  const mapping = settingsOf(run).mapping || {};
  const sub = [mapping.uen && row.uen ? '<span class="wb-mono">' + esc(row.uen) + '</span>' : '', row.domain ? esc(row.domain) : '', '<span class="wb-num">Row ' + v.idx + ' of ' + S.active.rows.length + '</span>']
    .filter(Boolean).join('<span class="wb-sep" aria-hidden="true">·</span>');
  let h = '<div class="wb-d-top"><div class="wb-d-row1"><div><h2>' + esc(row.name) + '</h2><div class="wb-d-sub">' + sub + '</div></div>' + readToggle() + '</div>';
  if (v.error) {
    h += '<div class="wb-d-sum"><span class="wb-d-v is-error">Not classified</span></div>';
  } else if (v.r) {
    const r = v.r;
    const deep = v.verdict === 'deep tech';
    h += '<div class="wb-d-sum"><span class="wb-d-v' + (deep ? ' is-deep' : '') + '">' + vLabel(v.verdict) + '</span>' +
      (v.reclassified
        ? '<span class="wb-d-c">Pipeline said ' + vLow(r.verdict) + ', <span class="wb-num">' + r.conf + '</span></span>'
        : '<span class="wb-d-c"><b class="wb-num">' + r.conf + '</b> ' + confWord(r.conf).toLowerCase() + ' confidence</span>') +
      (v.open ? '<span class="wb-st-flag">' + esc(r.risk) + '</span>' : '') + '</div>';
    h += decisionArea(run, v);
  } else {
    const p = run.status === 'running' ? row.step : null;
    h += '<div class="wb-d-sum"><span class="wb-d-c">' + (p ? 'In progress: ' + esc(p) : run.status === 'running' ? 'Queued' : 'Not started') + '. Decisions open when the result is in.</span></div>';
  }
  return h + '</div>';
}

function decisionArea(run, v) {
  const form = S.forms[formKey(run.id, v.row.index)];
  if (form && form.open) return formHtml(v, form);
  const pv = v.r.verdict;
  if (v.dec) {
    const at = timeOf(v.dec.at);
    return '<div class="wb-ds"><span class="wb-ds-t">' + (v.reclassified ? 'Reclassified to ' + vLow(v.dec.verdict) : 'Confirmed ' + vLow(v.dec.verdict)) + (at ? ' at ' + at : '') + '</span>' +
      '<button class="wb-btn wb-btn-sm" data-act="change-dec" data-fk="change-dec"' + keyTitle('Change decision', 'X') + '>Change</button>' +
      '<button class="wb-btn wb-btn-sm wb-btn-ghost" data-act="restore" data-fk="restore" title="Drop the reviewer decision and go back to the pipeline verdict">Restore pipeline verdict</button></div>';
  }
  if (v.flagged) {
    return '<div class="wb-ds"><button class="wb-btn wb-btn-sm wb-btn-primary" data-act="quick-confirm" data-fk="quick-confirm">Confirm ' + vLow(pv) + ' ' + kbd('C') + '</button>' +
      '<button class="wb-btn wb-btn-sm" data-act="open-change" data-fk="open-change"' + keyTitle('Change to ' + vLow(flip(pv)), 'X') + '>Change to ' + vLow(flip(pv)) + '</button>' +
      '<button class="wb-btn wb-btn-sm wb-btn-ghost" data-act="open-note" data-fk="open-note"' + keyTitle('Add a note', 'M') + '>Add note</button></div>';
  }
  return '<div class="wb-ds"><span class="wb-ds-t">No review needed</span><button class="wb-btn wb-btn-sm wb-btn-ghost" data-act="open-change" data-fk="open-change"' + keyTitle('Reclassify', 'X') + '>Reclassify</button></div>';
}

const NOTE_REQUIRED = 'Why the pipeline verdict is wrong (required, written to the workbook)';
const NOTE_OPTIONAL = 'Note for the record (optional)';
const whyOk = (req) => (req ? 'The note will be written to the workbook.' : kbd('Esc') + ' leaves the note, the draft is kept');
/* The hint's class and HTML (model.formHint): grey until Record is tried. */
const hintClass = (h) => 'wb-form-why' + (h.tone === 'error' ? '' : ' is-ok');
const hintHtml = (h, req) => (h.tone === 'ok' ? whyOk(req) : esc(h.text));

function formHtml(v, form) {
  const pv = v.r.verdict;
  const req = form.choice ? needsNote(v, form.choice) : false;
  const prob = formProblem(v, form);
  const hint = formHint(v, form);
  return '<div class="wb-form"><div class="wb-seg" role="radiogroup" aria-label="Outcome">' +
    '<label title="Shortcut: C"><input type="radio" name="wb-dec" value="confirm" data-fk="dec-confirm"' + (form.choice === 'confirm' ? ' checked' : '') + '>' + (v.flagged ? 'Confirm ' : 'Keep ') + vLow(pv) + '</label>' +
    '<label title="Shortcut: X"><input type="radio" name="wb-dec" value="change" data-fk="dec-change"' + (form.choice === 'change' ? ' checked' : '') + '>Change to ' + vLow(flip(pv)) + '</label></div>' +
    '<textarea data-fk="note" aria-label="Reviewer note" placeholder="' + (req ? NOTE_REQUIRED : NOTE_OPTIONAL) + '">' + esc(form.note) + '</textarea>' +
    '<div class="wb-form-acts"><button class="wb-btn wb-btn-sm wb-btn-primary" data-act="record" data-fk="record"' + (prob ? ' aria-disabled="true"' : '') + '>Record ' + kbd(MOD, '↵') + '</button>' +
    '<button class="wb-btn wb-btn-sm wb-btn-ghost" data-act="cancel-form" data-fk="cancel-form">Cancel</button>' +
    '<span class="' + hintClass(hint) + '" data-r="form-why" aria-live="polite">' + hintHtml(hint, req) + '</span></div></div>';
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
  const hint = formHint(v, form);
  const b = el.querySelector('[data-fk="record"]');
  if (b) { if (prob) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled'); }
  const w = el.querySelector('[data-r="form-why"]');
  if (w) { w.className = hintClass(hint); w.innerHTML = hintHtml(hint, req); }
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

/* A collapsible section. The chevron shows when it is closed, or on hover. */
function sec(key, title, aside, body) {
  const closed = !!S.collapsed[key];
  return '<section class="wb-sec' + (closed ? ' is-closed' : '') + '" data-sec="' + key + '"><h3 class="wb-sec-h"><button class="wb-sec-btn" data-act="toggle-sec" data-k="' + key + '" data-fk="sec-' + key + '" aria-expanded="' + !closed + '">' + title + CHEVRON + '</button><span class="wb-sec-aside">' + (aside || '') + '</span></h3>' + (closed ? '' : '<div class="wb-sec-b">' + body + '</div>') + '</section>';
}

function docHtml(run, v) {
  const r = v.r;
  return '<div class="wb-doc">' + (v.reclassified ? reclassHtml(v) : flagHtml(run, v)) +
    sec('reasoning', 'Reasoning', v.reclassified ? 'Pipeline’s, supports ' + vLow(r.verdict) : '', '<p class="wb-lead">' + esc(r.reasoning) + '</p>') +
    criteriaHtml(r) + evidenceHtml(v.row, r) + patentsHtml(r) + validatorHtml(run, r) + buildHtml(run, r, v) + historyHtml(run, v) +
    metaHtml(run, r) + '</div>';
}

/* One line of run metadata. Values that only say something was off or not
   used are left out. */
function metaHtml(run, r) {
  const items = [basisLabel(r.basis)];
  if (r.hasWeb && r.webSource) items.push('Web: ' + esc(r.webSource));
  items.push('<span class="wb-mono">' + esc(r.model || run.model) + '</span>');
  if (r.timeS != null) items.push('<span class="wb-num">' + r.timeS.toFixed(1) + ' s</span>');
  items.push(r.cost == null ? '<span title="Pinned model has no listed price">cost unknown</span>' : '<span class="wb-num">' + money(r.cost, 3) + '</span>');
  return '<p class="wb-meta">' + items.join('<span class="wb-sep" aria-hidden="true">·</span>') + '</p>';
}

/* Why the reviewer is looking at this row: one sentence (and the validator's
   reason, when it gave one), coloured only while the row is still open. A
   clear row gets nothing, unless nothing could have challenged it. */
function flagHtml(run, v) {
  const r = v.r;
  const cfg = settingsOf(run);
  const th = Number(cfg.validatorThreshold);
  let t = '';
  if (r.risk === 'Clear') {
    if (!(r.conf < th && !cfg.validator)) return '';
    return '<div class="wb-note is-quiet"><p>Confidence is below ' + th + ' but validation was off for this run, so nothing challenged the verdict.</p></div>';
  }
  if (r.risk === 'Uncertain') t = 'Uncertain: the validator searched the web but confidence stayed below ' + th + '.';
  else if (r.risk === 'Contested') t = 'Contested: the validator argued for ' + vLow(flip(r.verdict)) + ' at ' + esc(r.val ? r.val.confidence : '') + ', short of the ' + Number(cfg.overrideMinConfidence) + ' needed to override.';
  else t = 'Escalated: the validator found the evidence contradictory or insufficient.';
  const reason = r.val && r.val.escalationReason ? '<p>' + esc(r.val.escalationReason) + '</p>' : '';
  return '<div class="wb-note' + (v.open ? ' is-open' : '') + '"><p class="wb-note-t">' + t + '</p>' + reason + '</div>';
}

function reclassHtml(v) {
  const r = v.r;
  return '<div class="wb-note"><p class="wb-note-t">Reclassified to ' + vLow(v.verdict) + ' by a reviewer.</p>' +
    (v.dec.note ? '<p>“' + esc(v.dec.note) + '”</p>' : '') +
    '<p class="wb-note-s">The pipeline said ' + vLow(r.verdict) + ' at ' + r.conf + '. The reasoning, criteria and confidence below are the pipeline’s.</p></div>';
}

function criteriaHtml(r) {
  const crit = (k) => (r.criteria && r.criteria[k]) || {};
  const met = CRIT.filter((x) => crit(x[0]).met).length;
  return sec('criteria', 'Criteria', '<span class="wb-num">' + met + ' of 3 met</span>', CRIT.map((x) => {
    const cr = crit(x[0]);
    return '<div class="wb-crit"><div class="wb-crit-h"><b>' + x[2] + '</b><span class="wb-crit-m' + (cr.met ? ' is-y' : '') + '">' + (cr.met ? 'Met' : 'Not met') + '</span></div><p>' + esc(cr.reasoning) + '</p></div>';
  }).join(''));
}

/* The confidence as a chain of steps, with what moved it underneath. */
function buildHtml(run, r, v) {
  const cfg = settingsOf(run);
  const th = Number(cfg.validatorThreshold);
  const adjMax = Number(cfg.epoAdjustMax);
  const cap = Number(cfg.lowEvidenceCap);
  const step = (l, val, cls) => '<li' + (cls ? ' class="' + cls + '"' : '') + '><span class="wb-flow-l">' + l + '</span><span class="wb-flow-v">' + val + '</span></li>';
  const notes = [];
  let steps = step('Classifier', r.llm);
  if (cfg.epo) {
    steps += step('Patents', signed(r.adj));
    if (r.adj !== 0) notes.push('<b>Patents</b> ' + esc(r.patents.level) + ' portfolio, ' + r.patents.count + ' patent' + (r.patents.count === 1 ? '' : 's') + ', at most ±' + adjMax + '.');
  }
  if (r.capped && !r.validated) { steps += step('Cap', '≤ ' + cap); notes.push('<b>Cap</b> No description and no patents, so confidence is capped at ' + cap + '.'); }
  if (r.validated) {
    steps += step('Validator', signed(r.conf - r.pre));
    const how = r.val.verdict === 'confirm' ? 'Confirmed, so the validator’s confidence is used'
      : r.override === 'applied' ? 'Override applied: the verdict flipped and takes the validator’s confidence'
        : r.override === 'blocked' ? 'Override blocked, so confidence is at most 100 − ' + esc(r.val.confidence)
          : 'Insufficient evidence, so confidence can only go down';
    notes.push('<b>Validator</b> Ran because ' + r.pre + ' was below ' + th + '. ' + how + (r.capped ? '; low-evidence cap ' + cap : '') + '.');
  } else if (cfg.validator && r.pre < th) {
    notes.push('<b>Validator</b> Not triggered in this run, although ' + r.pre + ' is below ' + th + '.');
  }
  steps += step('Final', r.conf, 'is-total');
  const track = '<div class="wb-track" aria-hidden="true"><span class="wb-track-l"></span><span class="wb-track-th" style="left:' + pct(th) + '%"></span>' +
    (r.pre !== r.conf ? '<span class="wb-track-pre" style="left:' + pct(r.pre) + '%"></span>' : '') + '<span class="wb-track-fin" style="left:' + pct(r.conf) + '%"></span></div>' +
    '<div class="wb-track-ax"><span>0</span><span>' + (r.pre !== r.conf ? '○ before validation · ● final · ' : '') + 'dashed: threshold ' + th + '</span><span>100</span></div>';
  return sec('build', 'How confidence was built', v.reclassified ? 'in ' + vLow(r.verdict) : '',
    '<ol class="wb-flow">' + steps + '</ol>' + (notes.length ? '<div class="wb-flow-n">' + notes.map((n) => '<p>' + n + '</p>').join('') + '</div>' : '') + track);
}

function evidenceHtml(row, r) {
  let q = '';
  if (r.hasWeb) q += '<blockquote class="wb-quote">' + esc(r.webDescription) + '<span class="wb-quote-src">Web · ' + esc(r.webSource) + '</span></blockquote>';
  if (r.hasInputDesc) q += '<blockquote class="wb-quote">' + esc(row.description) + '<span class="wb-quote-src">Input file</span></blockquote>';
  if (!q) q = '<p class="wb-body">No description in the input file' + (r.webStatus === 'not_found' ? ' and nothing reliable found on the web' : '') + '. The verdict rests on the company name' + (r.patents.count ? ' and patents' : '') + '.</p>';
  return sec('read', 'What the classifier read', '', q);
}

function patentsHtml(r) {
  const p = r.patents;
  if (p.status === 'disabled') return sec('patents', 'Patents', 'lookup off', '<p class="wb-body wb-muted">Patent lookup was off for this run.</p>');
  if (p.status !== 'success') return sec('patents', 'Patents', 'none found', '<p class="wb-body wb-muted">No matching applicant in the EPO register.</p>');
  const cpc = (p.cpc || []).map((x) => '<li><code>' + esc(x.code) + '</code><span>' + esc(x.desc) + '</span></li>').join('');
  return sec('patents', 'Patents', '<span class="wb-num">' + p.count + ' in EPO</span>',
    '<dl class="wb-kv"><dt>Deep tech level</dt><dd>' + esc(p.level) + '</dd>' + (p.domain ? '<dt>Domain</dt><dd>' + esc(p.domain) + '</dd>' : '') + '</dl>' +
    (cpc ? '<ul class="wb-cpc">' + cpc + '</ul>' : ''));
}

function validatorHtml(run, r) {
  const cfg = settingsOf(run);
  if (!r.validated) {
    const th = Number(cfg.validatorThreshold);
    const why = !cfg.validator ? 'Validation was off for this run.'
      : r.pre < th ? 'Not triggered for this company in this run, although confidence before validation (' + r.pre + ') was below ' + th + '.'
        : 'Not needed: confidence before validation was ' + r.pre + ', at or above the threshold of ' + th + '.';
    return sec('validator', 'Validator', 'not run', '<p class="wb-body wb-muted">' + why + '</p>');
  }
  const val = r.val;
  const sources = val.sources || [];
  return sec('validator', 'Validator', '<span class="wb-num">confidence ' + esc(val.confidence) + '</span>',
    '<dl class="wb-kv"><dt>Finding</dt><dd>' + esc(VAL_FIND[val.verdict] || val.verdict) + (r.override ? ' (override ' + esc(r.override) + ')' : '') + '</dd><dt>Decision</dt><dd>' + esc(VAL_DEC[val.decision] || val.decision) + '</dd></dl>' +
    (val.summary ? '<p class="wb-body">' + esc(val.summary) + '</p>' : '') +
    (sources.length ? '<ul class="wb-srcs">' + sources.map(sourceHtml).join('') + '</ul>' : ''));
}

/* A validator source on one line: a web address as a link showing its site
   and a faded path; anything else as plain text. */
function sourceHtml(s) {
  let u = null;
  try { u = /^https?:\/\//i.test(s) ? new URL(s) : null; } catch (e) { u = null; }
  if (!u) return '<li title="' + esc(s) + '">' + esc(s) + '</li>';
  const path = (u.pathname + u.search).replace(/\/$/, '');
  return '<li><a href="' + esc(u.href) + '" target="_blank" rel="noopener noreferrer" title="' + esc(s) + '">' + esc(u.hostname.replace(/^www\./, '')) + '<span>' + esc(path) + '</span></a></li>';
}

function historyHtml(run, v) {
  const h = v.row.history || [];
  const r = v.r;
  const items = ['<li><span class="wb-h-time">' + esc(timeOf(run.createdAt)) + '</span><span>Pipeline: ' + vLow(r.verdict) + ', confidence ' + r.conf + ', ' + esc(r.risk).toLowerCase() + ' → ' + (r.risk !== 'Clear' ? 'needs review' : actionFor(r.verdict).toLowerCase()) + '</span></li>'];
  let final = r.verdict;
  h.forEach((e) => {
    const what = e.type === 'restore' ? 'Restored pipeline verdict (' + vLow(e.verdict) + ')'
      : e.verdict !== final ? 'Changed to ' + vLow(e.verdict) : 'Confirmed ' + vLow(e.verdict);
    final = e.verdict;
    items.push('<li><span class="wb-h-time">' + esc(timeOf(e.at)) + '</span><span>' + what + (e.note ? '<span class="wb-h-note">“' + esc(e.note) + '”</span>' : '') + '</span></li>');
  });
  return sec('history', 'History', h.length ? h.length + ' reviewer action' + (h.length === 1 ? '' : 's') : '', '<ol class="wb-hlist">' + items.join('') + '</ol>');
}

const inputHtml = (row) => '<section class="wb-sec"><h3 class="wb-sec-h">From the input file</h3>' + (row.description ? '<blockquote class="wb-quote">' + esc(row.description) + '</blockquote>' : '<p class="wb-body wb-muted">No description in the input file.</p>') + '</section>';

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
  return '<div class="wb-doc"><section class="wb-sec"><h3 class="wb-sec-h">' + (p ? 'In progress' : running ? 'Queued' : 'Not started') + '<span class="wb-sec-aside">' + (run.batch ? 'Batch mode' : 'One at a time') + '</span></h3><ul class="wb-steps">' + list + '</ul>' +
    (running ? '' : '<p class="wb-hint">This company had not finished when the run stopped. Resume to classify it.</p>') + '</section>' +
    inputHtml(v.row) + '</div>';
}

/* A row whose classification ended in an error: what went wrong and its
   input description, no decision controls. */
function errorHtml(v) {
  return '<div class="wb-doc"><div class="wb-note is-error"><p class="wb-note-t">This company was not classified. Resume the run to retry it.</p>' +
    (v.r.errorMessage ? '<p class="wb-mono">' + esc(v.r.errorMessage) + '</p>' : '') + '</div>' +
    inputHtml(v.row) + '</div>';
}
