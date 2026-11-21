/* A new run, set up in the table: the setup head (file line and notes), the
   setup table with its column chips and row checkboxes, the action bar, and
   the popovers (column menu and settings). Ported from the prototype's
   setupHeadHtml, setupThHtml, renderSetupTable, setupEmptyHtml,
   renderSetupBar, openMap, settingsPopHtml and closePop. Reads S.draft (the
   draft run, model.newDraft) and S.setup (GET /api/setup); the actions that
   call the API (upload, estimate, start) are in ../setup.js. Only a window of
   the file's rows is rendered, with the results table's footer. Every
   render does nothing while the draft is parked (store.setupShown false),
   so an answer for it never paints over the run on screen. */
import {
  esc, clamp, SETUP_FIELDS, mapState, tickAllState, tickedCount, startProblem,
  classifyLabel, estimateNote, unknownCostLine, ESTIMATE_FAILED, extraColumns, noDescriptionNote, cellExample,
  modelFor, isCustom, visibleRows, fileLine, noBatchText, tierPriceText,
} from '../model.js';
import { S, setupShown } from '../store.js';
import { R, put, kbd } from './util.js';
import { moreHtml } from './table.js';

/* The three quality levels, by tier. */
export const QUALITY = [
  { tier: 'fast', name: 'Standard', sub: 'Quick and accurate for most lists.' },
  { tier: 'balanced', name: 'Careful', sub: 'Slower; better on borderline companies.' },
  { tier: 'best', name: 'Most thorough', sub: 'Strongest reasoning, highest cost.' },
];
const qualityName = (tier) => (QUALITY.find((q) => q.tier === tier) || { name: tier }).name;
const PLAIN_STEPS = [
  { key: 'enrichment', label: 'Look each company up on the web', sub: 'Finds a current description before deciding.' },
  { key: 'epo', label: 'Check patent records', sub: 'European Patent Office data nudges confidence up or down.' },
  { key: 'validator', label: 'Double-check unsure results', sub: 'A second pass with web searches when confidence is low.' },
  { key: 'batch', label: 'Batch mode', sub: 'About half the classifier cost, but results can take an hour or more.' },
];
const CHIP = {
  missing: { tag: '<span class="wb-tag is-req">Required</span>', word: 'required, not chosen' },
  off: { tag: '<span class="wb-tag">Skipped</span>', word: 'not used' },
  dup: { tag: '<span class="wb-tag is-req">Used twice</span>', word: 'also used for another field' },
  auto: { tag: '<span class="wb-tag is-auto">Detected</span>', word: 'detected' },
  changed: { tag: '<span class="wb-tag">Changed</span>', word: 'changed' },
};
const root = () => document.querySelector('.v-workbench');

/* The provider of the draft's settings, or null when setup does not list it. */
export const draftProvider = () => S.setup.providers.find((p) => p.id === S.draft.cfg.provider) || null;
/* Why batch mode is off for prov (model.noBatchText). */
export const batchOffText = (prov) => noBatchText(S.setup.providers, prov);

/* Reads msg out through the live region. */
export function announce(msg) {
  const l = R('live');
  if (!l) return;
  l.textContent = '';
  setTimeout(() => { l.textContent = msg; }, 30);
}

/* ---------- chrome ---------- */
/* Turns the main column into the setup surface (on) or back. */
export function setSetupChrome(on) {
  const r = root();
  if (!r) return;
  r.classList.toggle('is-setup', on);
  R('setbar').hidden = !on;
  if (on) return;
  closePop(false);
  R('main').classList.remove('is-drag');
  R('setbar').innerHTML = '';
}

/* Focus where setup starts: Start when a file is loaded, else Choose file. */
export function focusSetupStart() {
  if (!setupShown()) return;
  const b = root().querySelector(S.draft.file ? '[data-fk="start"]' : '[data-fk="pick-file"]');
  if (b) b.focus();
}

/* ---------- head: title, file line, notes ---------- */
function headHtml() {
  const dr = S.draft; const d = dr.cfg; const f = dr.file;
  const title = dr.fromId ? 'New run with the same settings' : 'New run';
  let meta = f
    ? '<span class="wb-file-n">' + esc(f.name) + '</span><span class="wb-num">' + esc(fileLine(f, d.mapping)) + '</span>'
    : '<span>' + (dr.fromId ? 'Settings and column mapping from <span class="wb-mono">' + esc(dr.fromId) + '</span>. ' : '') + 'Drop a spreadsheet anywhere in this column.</span>';
  if (f && dr.reading) meta += '<span>Reading ' + esc(dr.reading) + '…</span>';
  const h = '<div class="wb-head-row"><div class="wb-head-t"><h1><span class="wb-h1-f">' + title + '</span> <span class="wb-status">Not started</span></h1><div class="wb-head-meta">' + meta + '</div></div>' +
    (f ? '<div class="wb-head-acts"><button class="wb-btn wb-btn-sm" data-act="clear-file" data-fk="clear-file">Change file</button></div>' : '') + '</div>';
  const notes = [];
  if (f) {
    if (dr.error) notes.push('<p class="wb-snote is-err" role="alert">' + esc(dr.error) + '</p>');
    if (!d.mapping.company_name) notes.push('<p class="wb-snote is-warn"><b>One thing to fix:</b> choose which column holds the company names with <b>Choose column</b> on the highlighted header.</p>');
    const desc = noDescriptionNote(d);
    if (desc) notes.push('<p class="wb-snote is-warn">' + esc(desc) + '</p>');
    const extra = extraColumns(f.headers, d.mapping);
    if (extra.length) notes.push('<p class="wb-snote">Also in your file and kept unchanged in your output: <b>' + esc(extra.join(', ')) + '</b>.</p>');
  }
  return h + (notes.length ? '<div class="wb-snotes">' + notes.join('') + '</div>' : '');
}
export function renderSetupHead() {
  if (!setupShown()) return;
  const el = R('head');
  el.hidden = false;
  put(el, headHtml());
}

/* ---------- table ---------- */
function thHtml(fl) {
  const dr = S.draft;
  if (!dr.file) return '<th scope="col" class="wb-s-' + fl.key + '"><div class="wb-sth"><span class="wb-sth-l">' + fl.label + '</span></div></th>';
  const col = dr.cfg.mapping[fl.key] || '';
  const st = mapState(dr.cfg.mapping, dr.file.mapping, fl.key);
  const chip = CHIP[st];
  const open = !!(pop && pop.kind === 'map' && pop.field === fl.key);
  const label = st === 'missing' ? 'Choose column' : col ? 'from: <b>' + esc(col) + '</b>' : 'not used';
  const aria = fl.label + (col ? ' reads from spreadsheet column ' + col : '') + ', ' + chip.word + '. Change column';
  return '<th scope="col" class="wb-s-' + fl.key + (st === 'missing' ? ' is-missing' : '') + '"><div class="wb-sth"><span class="wb-sth-l">' + fl.label + '</span>' + chip.tag + '</div>' +
    '<button class="wb-mapchip is-' + st + '" data-act="col-menu" data-field="' + fl.key + '" data-fk="map-' + fl.key + '" aria-haspopup="menu" aria-expanded="' + open + '" aria-label="' + esc(aria) + '">' + label + ' <span aria-hidden="true">▾</span></button></th>';
}

function emptyHtml() {
  const dr = S.draft;
  return '<div class="wb-sempty"><div class="wb-sempty-in">' +
    '<div class="wb-sempty-ic" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4"/><path d="m7 9 5-5 5 5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg></div>' +
    '<h2>' + (dr.reading ? 'Reading ' + esc(dr.reading) + '…' : 'Drop a spreadsheet here to start') + '</h2>' +
    '<p>One row per company. Column headers are matched case-insensitively, and your companies appear in this table before anything runs.</p>' +
    '<div class="wb-sempty-acts"><button class="wb-btn wb-btn-primary" data-act="pick-file" data-fk="pick-file">Choose file…</button></div>' +
    (dr.error ? '<p class="wb-snote is-err" role="alert">' + esc(dr.error) + '</p>' : '') +
    '<small>Excel (.xlsx, .xls) or CSV. Nothing is sent to an AI provider until you start the run.</small></div></div>';
}

/* One file row. cols: [{fl, at}] with at the header index of the field's
   column (-1 when none). enter: the row fades in (the file just landed). */
function rowHtml(i, cells, cols, enter) {
  const dr = S.draft;
  const out = dr.excluded.has(i);
  const nameAt = cols[0].at;
  const name = nameAt >= 0 ? String(cells[nameAt] == null ? '' : cells[nameAt]).trim() : '';
  return '<tr data-srow="' + i + '" class="' + (out ? 'is-out' : '') + (enter ? ' is-enter' : '') + '"' + (enter ? ' style="--i:' + Math.min(i, 20) + '"' : '') + '>' +
    '<td class="wb-chk"><input type="checkbox" data-act="tick-row" data-i="' + i + '" data-fk="inc-' + i + '" aria-label="Include ' + esc(name || 'row ' + (i + 1)) + '"' + (out ? '' : ' checked') + '></td>' +
    '<td class="wb-idx is-r">' + (i + 1) + '</td>' +
    cols.map(({ fl, at }) => {
      const v = at >= 0 ? String(cells[at] == null ? '' : cells[at]) : '';
      let inner;
      if (at < 0) inner = fl.required ? '<span class="wb-cell-miss">column not chosen</span>' : '<span class="wb-muted">·</span>';
      else if (!v.trim()) inner = '<span class="wb-cell-empty">Empty</span>';
      else inner = '<span class="' + (fl.key === 'company_name' ? 'wb-sname' : fl.key === 'uen' ? 'wb-mono' : fl.key === 'description' ? 'wb-dim' : '') + '">' + esc(v) + '</span>';
      return '<td class="wb-s-' + fl.key + '"' + (v.trim() ? ' title="' + esc(v) + '"' : '') + '>' + inner + '</td>';
    }).join('') +
    '<td class="wb-s-status"><span class="wb-queued">' + (out ? 'Left out' : 'Queued') + '</span></td></tr>';
}

/* opts.enter: the rows fade in, and the table starts at the top. */
export function renderSetupTable(opts) {
  if (!setupShown()) return;
  const dr = S.draft; const f = dr.file;
  const wrap = R('table');
  const state = f ? tickAllState(f.table.length, dr.excluded) : 'all';
  const chk = f ? '<input type="checkbox" data-act="tick-all" data-fk="inc-all" aria-label="Include all companies"' + (state === 'all' ? ' checked' : '') + '>' : '<span class="wb-sr">Included</span>';
  let h = '<table class="wb-table is-setup" aria-label="' + (f ? 'Companies in ' + esc(f.name) : 'New run, no file yet') + '"><thead><tr>' +
    '<th scope="col" class="wb-s-chk wb-chk">' + chk + '</th><th scope="col" class="wb-s-idx is-r"><div class="wb-sth is-r">#</div></th>' +
    SETUP_FIELDS.map(thHtml).join('') + '<th scope="col" class="wb-s-status is-out-col"><div class="wb-sth">Status</div></th></tr></thead><tbody>';
  if (!f) {
    for (let i = 0; i < 7; i++) h += '<tr class="wb-ghost" aria-hidden="true"><td></td><td></td>' + [62, 48, 40, 78, 34].map((w) => '<td><span class="wb-ghost-bar" style="width:' + (w - i * 4) + '%"></span></td>').join('') + '</tr>';
    put(wrap, h + '</tbody></table>' + emptyHtml());
    return;
  }
  const cols = SETUP_FIELDS.map((fl) => {
    const col = dr.cfg.mapping[fl.key] || '';
    return { fl, at: col ? f.headers.indexOf(col) : -1 };
  });
  const enter = !!(opts && opts.enter);
  const all = f.table.map((cells, i) => i);
  const win = visibleRows(all, dr.limit, null);
  h += win.ids.map((i) => rowHtml(i, f.table[i], cols, enter)).join('');
  const scroll = enter ? 0 : wrap.scrollTop;
  put(wrap, h + '</tbody></table>' + (win.hidden ? moreHtml(win.ids.length, all.length) : '') + '<div class="wb-setpad"></div>');
  wrap.scrollTop = scroll;
  const box = wrap.querySelector('[data-fk="inc-all"]');
  if (box) box.indeterminate = state === 'some';
}

/* ---------- action bar ---------- */
export function renderSetupBar() {
  if (!setupShown()) return;
  const dr = S.draft; const d = dr.cfg;
  const e = dr.est;
  const prob = startProblem(dr, S.setup);
  const prov = draftProvider();
  const open = !!(pop && pop.kind === 'settings');
  // While Start's request is in flight (dr.starting) Start and Cancel are inert.
  const label = dr.starting ? 'Starting…' : prob ? prob.label : classifyLabel(tickedCount(dr), e, dr.estFailed);
  const batch = e ? e.batch : !!(prov && prov.batch && d.batch);
  let note;
  if (prob) note = '<p class="wb-setbar-note is-why" id="wb-setbar-why">' + esc(prob.text) + '</p>';
  else if (dr.startError) note = '<p class="wb-setbar-note is-why" id="wb-setbar-why" role="alert">' + esc(dr.startError) + '</p>';
  else {
    const est = dr.estFailed ? ' ' + ESTIMATE_FAILED : e ? (e.known ? '' : ' ' + esc(unknownCostLine(e))) + ' ' + esc(estimateNote(e)) : '';
    note = '<p class="wb-setbar-note">' + (batch ? 'Batch mode: about half the classifier cost, but a real batch job can take up to an hour.' : 'One company at a time; results appear as each one finishes.') + est + '</p>';
  }
  const why = prob || dr.startError;
  put(R('setbar'), '<div class="wb-setbar-top"><button class="wb-btn wb-btn-sm wb-set" data-act="settings-pop" data-fk="settings" aria-haspopup="dialog" aria-expanded="' + open + '">Settings: <b>' + esc(qualityName(d.tier)) + (isCustom(d, S.setup.defaults) ? ', customised' : '') + '</b> <span aria-hidden="true">▾</span></button>' +
    '<span class="wb-setbar-meta">' + (prov ? esc(prov.label) + ' · ' : '') + '<span class="wb-mono">' + esc(modelFor(d, S.setup)) + '</span></span></div>' +
    '<div class="wb-setbar-row"><button class="wb-btn wb-btn-ghost" data-act="cancel-setup" data-fk="cancel-setup"' + (dr.starting ? ' aria-disabled="true"' : '') + '>Cancel ' + kbd('Esc') + '</button>' +
    '<button class="wb-btn wb-btn-primary wb-go" data-act="start" data-fk="start"' + (prob || dr.starting ? ' aria-disabled="true"' : '') + (dr.starting ? ' aria-busy="true"' : '') + (why ? ' aria-describedby="wb-setbar-why"' : '') + '>' + esc(label) + '</button></div>' + note);
}

/* The head, table, bar and open popover of the draft. opts: renderSetupTable's. */
export function renderSetup(opts) {
  if (!setupShown()) return;
  renderSetupHead();
  R('strip').hidden = true; R('tools').hidden = true;
  renderSetupTable(opts); renderSetupBar(); renderPop();
}

/* ---------- popovers: column menu and settings ---------- */
let pop = null; // {kind: 'map', field} or {kind: 'settings'}
export const popKind = () => (pop ? pop.kind : null);
const popAnchor = (p) => root().querySelector(p.kind === 'map' ? '[data-fk="map-' + p.field + '"]' : '[data-fk="settings"]');
/* Whether node belongs to the open popover or to a button that toggles one. */
export const popOwns = (node) => !!(node && node.closest && (R('pop').contains(node) || node.closest('[data-act="col-menu"], [data-act="settings-pop"]')));

/* restore: focus goes back to the button that opened it. */
export function closePop(restore) {
  const p = pop; if (!p) return;
  pop = null;
  R('pop').innerHTML = '';
  const a = popAnchor(p);
  if (a) { a.setAttribute('aria-expanded', 'false'); if (restore) a.focus(); }
}
function placePop(el, anchor, mode) {
  const rr = root().getBoundingClientRect();
  if (mode === 'below') {
    const ar = anchor.getBoundingClientRect();
    el.style.left = clamp(ar.left - rr.left, 8, rr.width - el.offsetWidth - 8) + 'px';
    el.style.top = (ar.bottom - rr.top + 4) + 'px';
    el.style.maxHeight = (rr.bottom - ar.bottom - 16) + 'px';
  } else {
    // Grows out of the action bar, right edges aligned.
    const br = R('setbar').getBoundingClientRect();
    el.style.right = (rr.right - br.right) + 'px';
    el.style.bottom = (rr.bottom - br.top + 8) + 'px';
    el.style.maxHeight = (br.top - rr.top - 16) + 'px';
  }
}

/* The column menu of field key: the file's headers with an example value
   each, and "Don't use a column" for an optional field. */
export function openMap(field) {
  closePop(false);
  const anchor = root().querySelector('[data-fk="map-' + field + '"]');
  const dr = S.draft;
  if (!anchor || !setupShown() || !dr.file) return;
  const fl = SETUP_FIELDS.find((x) => x.key === field);
  const d = dr.cfg; const f = dr.file;
  const cur = d.mapping[field] || '';
  pop = { kind: 'map', field };
  const usedBy = (col) => SETUP_FIELDS.find((o) => o.key !== field && d.mapping[o.key] === col);
  const opt = (col, i, title, sub) => '<button class="wb-mopt" role="menuitemradio" aria-checked="' + (col === cur) + '" data-act="map" data-col="' + esc(col) + '" data-fk="mopt-' + i + '"><span class="wb-mopt-ck" aria-hidden="true">' + (col === cur ? '✓' : '') + '</span><span class="wb-mopt-t">' + title + '</span><span class="wb-mopt-s">' + sub + '</span></button>';
  let h = '<div class="wb-pop is-map" role="menu" aria-label="Spreadsheet column for ' + esc(fl.label) + '"><div class="wb-pop-h">Which column holds the ' + esc(fl.label.toLowerCase()) + '?</div>' +
    f.headers.map((col, i) => {
      const other = usedBy(col);
      const ex = cellExample(f, col);
      return opt(col, i, esc(col) + (col === f.mapping[field] ? ' <span class="wb-tag is-auto">Detected</span>' : ''), (other ? 'Also used for ' + esc(other.label) + ' · ' : '') + 'e.g. ' + (ex ? esc(ex) : '—'));
    }).join('');
  // The company name has it too, so a wrongly detected column can be undone; Start then waits for a choice.
  const noneSub = fl.required ? 'Required: the run cannot start without it' : field === 'description' ? (d.enrichment ? 'Classification relies on web enrichment' : 'Low-evidence cap applies without patents') : 'Left blank in the output';
  h += '<hr>' + opt('', 'none', 'Don’t use a column', noneSub);
  R('pop').innerHTML = h + '</div>';
  anchor.setAttribute('aria-expanded', 'true');
  placePop(R('pop').firstElementChild, anchor, 'below');
  const first = R('pop').querySelector('[aria-checked="true"]') || R('pop').querySelector('.wb-mopt');
  if (first) first.focus();
}
/* The field the open column menu is for, or null. */
export const mapField = () => (pop && pop.kind === 'map' ? pop.field : null);

/* The price of one company on tier beside its quality level, or nothing. */
function tierPriceHtml(prov, tier) {
  const t = prov && prov.costPerCompany ? tierPriceText(prov.costPerCompany[tier]) : '';
  return t ? '<span class="wb-opt-p wb-num">' + t + '</span>' : '';
}
function settingsPopHtml() {
  const d = S.draft.cfg; const prov = draftProvider();
  return '<fieldset class="wb-fs"><legend>How careful should the AI be?</legend><div class="wb-qlist" role="radiogroup" aria-label="Quality">' + QUALITY.map((q) =>
    '<label class="wb-opt"><input type="radio" name="wb-q" value="' + q.tier + '" data-fk="q-' + q.tier + '"' + (d.tier === q.tier ? ' checked' : '') + '><span class="wb-opt-t">' + q.name + (q.tier === S.setup.defaults.tier ? ' <span class="wb-tag is-auto">Recommended</span>' : '') + tierPriceHtml(prov, q.tier) + '</span><span class="wb-opt-s">' + q.sub + (prov ? ' Uses ' + esc(prov.tiers[q.tier]) + '.' : '') + '</span></label>').join('') + '</div></fieldset>' +
    '<fieldset class="wb-fs"><legend>What to check</legend>' + PLAIN_STEPS.map((s) => {
      const off = s.key === 'batch' && !!prov && !prov.batch;
      return '<label class="wb-tg ' + (off ? 'is-disabled' : '') + '"><span class="wb-tg-t">' + s.label + '</span><span class="wb-tg-s">' + esc(off ? batchOffText(prov) : s.sub) + '</span><input type="checkbox" class="wb-switch" data-toggle="' + s.key + '" data-fk="pq-' + s.key + '"' + (d[s.key] && !off ? ' checked' : '') + (off ? ' disabled' : '') + '></label>';
    }).join('') + '</fieldset>' +
    '<div class="wb-pop-foot"><button class="wb-btn wb-btn-ghost wb-btn-sm" data-act="analyst-open" data-fk="analyst-open">Analyst settings…</button><button class="wb-btn wb-btn-sm" data-act="settings-done" data-fk="settings-done">Done</button></div>';
}
/* The settings popover over the action bar; focus on the chosen quality. */
export function openSettings() {
  closePop(false);
  const anchor = root().querySelector('[data-fk="settings"]');
  if (!anchor || !setupShown()) return;
  pop = { kind: 'settings' };
  R('pop').innerHTML = '<div class="wb-pop is-set" role="dialog" aria-label="Run settings"></div>';
  renderPop();
  anchor.setAttribute('aria-expanded', 'true');
  placePop(R('pop').firstElementChild, anchor, 'above');
  const f = R('pop').querySelector('input:checked');
  if (f) f.focus();
}
/* Re-renders the open settings popover (a column menu is static). */
export function renderPop() {
  if (!pop || pop.kind !== 'settings' || !setupShown()) return;
  put(R('pop').firstElementChild, settingsPopHtml());
}
