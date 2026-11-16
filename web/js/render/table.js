/* The results table. Ported from the prototype's headHtml and renderTable,
   with error rows (Error verdict; — for confidence, criteria and risk;
   action Needs Review) and a window: only visibleRows(S.viewIds, S.limit,
   S.selected) are rendered, followed by a "Showing 200 of 5,000" footer,
   which the setup table shares (moreHtml). Without an open run it shows why
   (store.tableNotice). While a new run is set up (setupShown) the table area is
   the setup table's (render/setup.js) and renderTable leaves it alone. */
import { esc, money, vLow, rowView, visibleRows, ROW_WINDOW } from '../model.js';
import { S, tableNotice, setupShown } from '../store.js';
import { R, put, verdictHtml, errorVerdictHtml, riskHtml, marksHtml, revTag } from './util.js';

/* "Show all" is offered up to this many rows in the view. */
const SHOW_ALL_MAX = 5000;
const WAIT_STEPS = new Set(['Waiting for batch', 'In batch job', 'Validation queued']);
const COLS = [
  { k: 'idx', l: '#', a: 'is-r' }, { k: 'name', l: 'Company', a: '' },
  { k: 'verdict', l: 'Verdict', t: 'V', a: '' }, { k: 'conf', l: 'Conf.', a: 'is-r' },
  { k: 'crit', l: 'I · S · P', a: 'is-c' }, { k: 'risk', l: 'Risk flag', s: 'Risk', t: 'Risk', a: '' },
  { k: 'action', l: 'Action', t: '✓', a: '' }, { k: 'patents', l: 'Patents', s: 'Pat.', t: 'Pat.', a: 'is-r' },
  { k: 'cost', l: 'Cost', a: 'is-r' },
];
const n = (x) => x.toLocaleString('en-US');

/* The ids the table body shows now, in order, and the view length then:
   polling patches rows in place while these stay the same. */
let shown = null;

function headHtml() {
  return '<thead><tr>' + COLS.map((c) => {
    const cls = 'wb-w-' + c.k + ' wb-c-' + c.k;
    if (c.k === 'crit') return '<th class="' + cls + ' is-c" title="Innovation · Scientific foundation · Proprietary IP"><span class="wb-th is-c">' + c.l + '</span></th>';
    const active = S.sortKey === c.k;
    const ar = active ? (S.sortDir > 0 ? '▲' : '▼') : '';
    const aria = active ? (S.sortDir > 0 ? 'ascending' : 'descending') : 'none';
    const s = c.s || c.l; const t = c.t || s;
    const lbl = s === c.l && t === c.l ? c.l : '<span class="wb-th-l">' + c.l + '</span><span class="wb-th-s">' + s + '</span><span class="wb-th-t">' + t + '</span>';
    const label = c.k === 'action' ? 'action and review status' : c.l === '#' ? 'input order' : c.l.toLowerCase();
    return '<th class="' + cls + '" aria-sort="' + aria + '"><button class="wb-th ' + c.a + '" data-act="sort" data-k="' + c.k + '" data-fk="sort-' + c.k + '" aria-label="Sort by ' + label + '" title="Sort by ' + label + '">' + lbl + '<span class="wb-th-ar" aria-hidden="true">' + ar + '</span></button></th>';
  }).join('') + '</tr></thead>';
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
  if (!v.r) {
    const p = run.status === 'running' ? row.step : null;
    const st = p
      ? '<span class="wb-step ' + (WAIT_STEPS.has(p) ? 'is-wait' : '') + '">' + esc(p) + '</span>'
      : '<span class="wb-queued">' + (run.status === 'running' ? 'Queued' : 'Not started') + '</span>';
    return '<tr class="is-pending" data-row="' + id + '" aria-selected="' + sel + '">' + idx + nameCell + '<td class="wb-stepcell">' + st + '</td><td></td><td class="wb-c-crit"></td><td></td><td></td><td class="is-r wb-muted wb-c-patents">—</td><td class="is-r wb-muted wb-c-cost">—</td></tr>';
  }
  const landedAt = S.landed[id];
  const age = landedAt ? now - landedAt : 9999;
  const fresh = age < 240;
  const landStyle = fresh ? ' style="animation-delay:-' + age + 'ms"' : '';
  const landCls = fresh ? ' wb-land' : '';
  const r = v.r;
  const pat = r.patents;
  if (v.error) {
    return '<tr data-row="' + id + '" aria-selected="' + sel + '">' + idx + nameCell +
      '<td><span class="' + landCls + '"' + landStyle + '>' + errorVerdictHtml() + '</span></td>' +
      '<td class="is-r wb-muted">—</td>' +
      '<td class="is-c wb-c-crit wb-muted">—</td>' +
      '<td class="wb-muted">—</td>' +
      '<td><span class="wb-act is-review">' + v.action + '</span></td>' +
      '<td class="is-r wb-c-patents ' + (pat && pat.count ? '' : 'wb-muted') + '">' + (pat ? pat.count : '—') + '</td>' +
      // Its real cost when known, else —; never the "?" of a classified row whose model has no listed price.
      '<td class="is-r wb-dim wb-c-cost">' + (typeof r.cost === 'number' ? money(r.cost, 3) : '<span class="wb-muted">—</span>') + '</td></tr>';
  }
  const low = r.conf < Number((run.settings || {}).validatorThreshold);
  const was = v.reclassified ? '<span class="wb-was" title="Pipeline verdict: ' + vLow(r.verdict) + '"><span class="wb-was-g" aria-hidden="true">↺</span><span class="wb-was-t">was ' + vLow(r.verdict) + '</span></span>' : '';
  return '<tr data-row="' + id + '" aria-selected="' + sel + '">' + idx + nameCell +
    '<td><span class="' + landCls + '"' + landStyle + '>' + verdictHtml(v.verdict) + was + '</span></td>' +
    '<td class="is-r"><span class="wb-conf' + (v.reclassified ? ' is-muted' : '') + landCls + '"' + landStyle + (v.reclassified ? ' title="Pipeline confidence in ' + vLow(r.verdict) + ', the verdict the reviewer overturned"' : '') + '><span class="wb-conf-t ' + (low ? 'is-low' : '') + '"><span style="transform:scaleX(' + (r.conf / 100).toFixed(2) + ')"></span></span><span class="wb-conf-n">' + r.conf + '</span></span></td>' +
    '<td class="is-c wb-c-crit">' + marksHtml(r.criteria) + '</td>' +
    '<td>' + riskHtml(r.risk) + '</td>' +
    '<td><span class="wb-act ' + (v.action === 'Needs Review' ? 'is-review' : '') + '">' + v.action + '</span>' + revTag(v) + '</td>' +
    '<td class="is-r wb-c-patents ' + (pat.count ? '' : 'wb-muted') + '">' + (pat.status === 'disabled' ? '—' : pat.count) + '</td>' +
    '<td class="is-r wb-dim wb-c-cost">' + (r.cost == null ? '<span title="Pinned model has no listed price">?</span>' : money(r.cost, 3)) + '</td></tr>';
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
    put(wrap, '<table class="wb-table">' + headHtml() + '</table><div class="wb-empty"><h2>No companies match these filters</h2><p>' + rows.length + ' companies in this run.</p><button class="wb-btn" data-act="clear-filters" data-fk="empty-clear">Clear filters</button></div>');
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
