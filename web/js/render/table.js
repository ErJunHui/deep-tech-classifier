/* The results table. Ported from the prototype's headHtml and renderTable,
   with error rows (Error verdict; — for confidence, criteria and risk;
   action Needs Review) and a window: only visibleRows(S.viewIds, S.limit,
   S.selected) are rendered, followed by a "Showing 200 of 5,000" footer,
   which the setup table shares (moreHtml). Without an open run it shows why
   (store.tableNotice). While a new run is set up (setupShown) the table area is
   the setup table's (render/setup.js) and renderTable leaves it alone. */
import { esc, vLabel, vLow, rowView, visibleRows, ROW_WINDOW, countOf } from '../model.js';
import { S, tableNotice, setupShown } from '../store.js';
import { R, put, CRIT } from './util.js';

/* "Show all" is offered up to this many rows in the view. */
const SHOW_ALL_MAX = 5000;
const WAIT_STEPS = new Set(['Waiting for batch', 'In batch job', 'Validation queued']);
/* Status merges the verdict, the risk flag and the action: the verdict as
   text, plus an attention marker only while a row still needs a decision.
   Cost lives in the evidence panel and the summary strip, not per row.
   l: wide label, s: compact, t: list (narrowest). sl: what sorting means. */
const COLS = [
  { k: 'idx', l: '#', a: 'is-r', sl: 'input order' }, { k: 'name', l: 'Company', a: '', sl: 'company' },
  { k: 'verdict', l: 'Status', a: '', sl: 'verdict' }, { k: 'conf', l: 'Confidence', s: 'Conf.', a: 'is-r', sl: 'confidence' },
  { k: 'crit', l: 'Criteria', a: 'is-r' }, { k: 'patents', l: 'Patents', s: 'Pat.', a: 'is-r', sl: 'patents' },
];
const n = (x) => x.toLocaleString('en-US');

/* The ids the table body shows now, in order, and the view length then:
   polling patches rows in place while these stay the same. */
let shown = null;

function headHtml() {
  return '<thead><tr>' + COLS.map((c) => {
    const cls = 'wb-w-' + c.k + ' wb-c-' + c.k;
    if (c.k === 'crit') return '<th class="' + cls + '" title="Criteria met: innovation, scientific foundation, proprietary IP"><span class="wb-th is-r is-static">' + c.l + '</span></th>';
    const active = S.sortKey === c.k;
    const ar = active ? (S.sortDir > 0 ? '▲' : '▼') : '';
    const aria = active ? (S.sortDir > 0 ? 'ascending' : 'descending') : 'none';
    const s = c.s || c.l; const t = c.t || s;
    const lbl = s === c.l && t === c.l ? c.l : '<span class="wb-th-l">' + c.l + '</span><span class="wb-th-s">' + s + '</span><span class="wb-th-t">' + t + '</span>';
    const label = c.sl;
    return '<th class="' + cls + '" aria-sort="' + aria + '"><button class="wb-th ' + c.a + '" data-act="sort" data-k="' + c.k + '" data-fk="sort-' + c.k + '" aria-label="Sort by ' + label + '" title="Sort by ' + label + '">' + lbl + '<span class="wb-th-ar" aria-hidden="true">' + ar + '</span></button></th>';
  }).join('') + '</tr></thead>';
}

/* The status cell: the verdict, then at most one qualifier. An open row
   (flagged, no decision yet) gets the attention marker with its risk; a
   decided row a muted note; a clear row nothing. */
function statusHtml(v) {
  const deep = v.verdict === 'deep tech';
  const short = deep ? 'Deep' : 'General';
  let q = '';
  if (v.open) q = '<span class="wb-st-flag" title="Needs review: ' + esc(v.r.risk) + '"><span class="wb-st-q">' + esc(v.r.risk) + '</span></span>';
  else if (v.reclassified) q = '<span class="wb-st-note" title="Reclassified by a reviewer; the pipeline said ' + vLow(v.r.verdict) + '">was ' + vLow(v.r.verdict).replace(' tech', '') + '</span>';
  else if (v.confirmed) q = '<span class="wb-st-note" title="Reviewed: pipeline verdict confirmed">Reviewed</span>';
  return '<span class="wb-st' + (deep ? ' is-deep' : '') + '"><span class="wb-st-v">' + vLabel(v.verdict) + '</span><span class="wb-st-s">' + short + '</span>' + q + '</span>';
}

/* "2/3" criteria met, with the breakdown in the tooltip. */
function critHtml(criteria) {
  const met = (k) => !!(criteria && criteria[k] && criteria[k].met);
  const n = CRIT.filter((x) => met(x[0])).length;
  const label = CRIT.map((x) => x[2] + (met(x[0]) ? ': met' : ': not met')).join(', ');
  return '<span class="wb-critn' + (n ? '' : ' is-none') + '" title="' + label + '" aria-label="' + n + ' of 3 criteria met. ' + label + '">' + n + '/3</span>';
}

/* One body row of the open run (S.active). now: Date.now(), for the landing
   animation. Exported for tests. */
export function rowHtml(row, now) {
  const run = S.active.run;
  const v = rowView(row);
  const id = row.index;
  const sel = id === S.selected;
  const nameCell = '<td><div class="wb-co"><button class="wb-rowbtn" data-act="select" data-id="' + id + '" data-fk="row-' + id + '" tabindex="' + (sel ? 0 : -1) + '" title="' + esc(row.name) + '">' + esc(row.name) + '</button><span class="wb-co-d">' + esc(row.domain) + '</span></div></td>';
  const idx = '<td class="wb-idx is-r">' + v.idx + '</td>';
  const dash = (cls) => '<td class="is-r wb-muted' + (cls ? ' ' + cls : '') + '">—</td>';
  if (!v.r) {
    const p = run.status === 'running' ? row.step : null;
    const st = p
      ? '<span class="wb-step ' + (WAIT_STEPS.has(p) ? 'is-wait' : '') + '">' + esc(p) + '</span>'
      : '<span class="wb-queued">' + (run.status === 'running' ? 'Queued' : 'Not started') + '</span>';
    return '<tr class="is-pending" data-row="' + id + '" aria-selected="' + sel + '">' + idx + nameCell + '<td class="wb-stepcell">' + st + '</td><td></td><td class="wb-c-crit"></td><td class="wb-c-patents"></td></tr>';
  }
  const landedAt = S.landed[id];
  const age = landedAt ? now - landedAt : 9999;
  const fresh = age < 240;
  const land = (inner) => (fresh ? '<span class="wb-land" style="animation-delay:-' + age + 'ms">' + inner + '</span>' : inner);
  const r = v.r;
  const pat = r.patents;
  if (v.error) {
    return '<tr data-row="' + id + '" aria-selected="' + sel + '">' + idx + nameCell +
      '<td>' + land('<span class="wb-st is-error" title="' + esc(r.errorMessage || 'Not classified') + '"><span class="wb-st-v">Error</span><span class="wb-st-s">Error</span></span>') + '</td>' +
      dash() + dash('wb-c-crit') +
      '<td class="is-r wb-c-patents' + (pat && pat.count ? '' : ' wb-muted') + '">' + (pat ? pat.count : '—') + '</td></tr>';
  }
  const low = r.conf < Number((run.settings || {}).validatorThreshold);
  const confTitle = v.reclassified ? ' title="Pipeline confidence in ' + vLow(r.verdict) + ', the verdict the reviewer overturned"' : low ? ' title="Below the validation threshold"' : '';
  return '<tr data-row="' + id + '" aria-selected="' + sel + '">' + idx + nameCell +
    '<td>' + land(statusHtml(v)) + '</td>' +
    '<td class="is-r"><span class="wb-confn' + (v.reclassified ? ' is-muted' : low ? ' is-low' : '') + '"' + confTitle + '>' + land(String(r.conf)) + '</span></td>' +
    '<td class="is-r wb-c-crit">' + critHtml(r.criteria) + '</td>' +
    '<td class="is-r wb-c-patents' + (pat.count ? '' : ' wb-muted') + '">' + (pat.status === 'disabled' ? '—' : pat.count) + '</td></tr>';
}

/* The footer under a table that shows shownCount of its total rows. */
export function moreHtml(shownCount, total) {
  const more = Math.min(ROW_WINDOW, total - shownCount);
  return '<div class="wb-more"><span class="wb-num">Showing ' + n(shownCount) + ' of ' + n(total) + '</span>' +
    ' · <button class="wb-linkbtn" data-act="show-more" data-fk="show-more">Show ' + n(more) + ' more</button>' +
    (total <= SHOW_ALL_MAX ? ' · <button class="wb-linkbtn" data-act="show-all" data-fk="show-all">Show all</button>' : '') + '</div>';
}

/* The table area without an open run. */
function noticeHtml(n) {
  if (!n) return '';
  if (n.kind === 'empty') return '<div class="wb-empty"><h2>No runs yet</h2><p>Start a run to classify a spreadsheet of companies.</p><button class="wb-btn wb-btn-primary" data-act="new-run" data-fk="empty-new">+ New run</button></div>';
  if (n.kind === 'offline') return '<div class="wb-empty"><h2>Can’t reach the server</h2><p>Check that the app is still running, then reload this page. It keeps trying in the meantime.</p></div>';
  if (n.kind === 'opening') return '<div class="wb-empty" role="status"><h2>Opening the run…</h2></div>';
  return '<div class="wb-empty"><h2>Couldn’t open this run</h2><p>' + esc(n.message) + '</p></div>';
}

const sameIds = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/* opts.patch: row indexes whose data changed. When the window shows the same
   rows in the same order as last time, only those rows are replaced and the
   rest of the body is left alone; otherwise the table is rendered again. */
export function renderTable(opts) {
  if (setupShown()) { shown = null; return; }
  const wrap = R('table');
  if (!S.active) {
    shown = null;
    put(wrap, noticeHtml(tableNotice(S)));
    return;
  }
  const rows = S.active.rows;
  const win = visibleRows(S.viewIds, S.limit, S.selected);
  const tbody = wrap.querySelector('tbody');
  if (opts && opts.patch && shown && tbody && shown.total === S.viewIds.length && sameIds(shown.ids, win.ids)) {
    const now = Date.now();
    opts.patch.forEach((i) => {
      const tr = tbody.querySelector('tr[data-row="' + i + '"]');
      if (!tr || !rows[i]) return;
      const focused = tr.contains(document.activeElement);
      tr.outerHTML = rowHtml(rows[i], now);
      if (focused) { const b = tbody.querySelector('[data-fk="row-' + i + '"]'); if (b) b.focus({ preventScroll: true }); }
    });
    return;
  }
  shown = { ids: win.ids, total: S.viewIds.length };
  if (!win.ids.length) {
    put(wrap, '<table class="wb-table">' + headHtml() + '</table><div class="wb-empty"><h2>No companies match these filters</h2><p>' + countOf(rows.length, 'company', 'companies') + ' in this run.</p><button class="wb-btn" data-act="clear-filters" data-fk="empty-clear">Clear filters</button></div>');
    return;
  }
  const now = Date.now();
  const body = win.ids.map((i) => rowHtml(rows[i], now)).join('');
  const scroll = wrap.scrollTop;
  put(wrap, '<table class="wb-table" aria-label="Classification results">' + headHtml() + '<tbody>' + body + '</tbody></table>' +
    (win.hidden ? moreHtml(win.ids.length, S.viewIds.length) : '') + '<div class="wb-tablepad"></div>');
  wrap.scrollTop = scroll;
}

/* The selected row's name button, when it is rendered. */
export const rowBtn = (id) => R('table').querySelector('[data-fk="row-' + id + '"]');
