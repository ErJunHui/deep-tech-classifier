/* The workbench's pure view model: formatters, the effective view of a row,
   run counts, filtering and sorting, and the checks that block a decision or
   a new run. Ported from the prototype (prototypes/frontend/variants/workbench.js)
   with the simulation removed: company fields come from the Row, result fields
   from row.result, and a row's id is its index. No DOM access and no state:
   every export is a function of its arguments. */

/* ---------- formatters ---------- */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ESC[ch]);
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const pad = (n) => String(n).padStart(2, '0');
export const money = (n, d) => '$' + n.toFixed(d == null ? 2 : d);
/* A duration of s seconds: '40 s', '10 min', '1 h 30 min'. fmtDur adds the
   '~' of an estimate. */
export const durText = (s) => {
  if (s < 90) return Math.max(1, Math.round(s)) + ' s';
  if (s < 3600) return Math.round(s / 60) + ' min';
  const h = Math.floor(s / 3600); const m = Math.round((s % 3600) / 60);
  return h + ' h' + (m ? ' ' + m + ' min' : '');
};
export const fmtDur = (s) => '~' + durText(s);
/* 'n one' for 1, else 'n many', n with thousands separators: '1 company',
   '2,000 companies'. */
export const countOf = (n, one, many) => n.toLocaleString('en-US') + ' ' + (n === 1 ? one : many);
export const confWord = (n) => n >= 90 ? 'Near-definitive' : n >= 75 ? 'Strong' : n >= 60 ? 'Moderate' : n >= 45 ? 'Borderline' : n >= 30 ? 'Weak' : 'Minimal';
export const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
export const flip = (v) => (v === 'deep tech' ? 'general tech' : 'deep tech');
export const vLabel = (v) => (v === 'deep tech' ? 'Deep tech' : 'General tech');
export const vLow = (v) => vLabel(v).toLowerCase();
export const actionFor = (v) => (v === 'deep tech' ? 'Approve' : 'Reject');
/* Local time, as is dateLabel. */
export const hhmm = (d) => pad(d.getHours()) + ':' + pad(d.getMinutes());

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/* A run's createdAt for the rail: 'Today, 08:42' on now's local day, else
   '2 Nov 2026'. iso is a server timestamp without a zone (local time); ''
   when it is missing or not a date. */
export function dateLabel(iso, now) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const today = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return today ? 'Today, ' + hhmm(d) : d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

/* ---------- decisions ---------- */
/* The server's rule (webapp/decisions.py, current): the last history entry,
   unless it is a restore; null when there is none. */
export function currentDecision(history) {
  if (!history || !history.length) return null;
  const last = history[history.length - 1];
  return last.type === 'restore' ? null : last;
}

/* The reviewer's undo stack: entries {runId, index, label}, the newest last.
   Neither function changes the stack it is given. */
export const pushUndo = (stack, entry) => stack.concat([entry]);
/* {entry, stack}: the newest entry and the stack without it; null when the
   stack is empty. */
export function popUndo(stack) {
  if (!stack.length) return null;
  return { entry: stack[stack.length - 1], stack: stack.slice(0, -1) };
}

/* ---------- decision flow ----------
   The pure parts of record, restore and undo (decisions.js). view is a
   rowView with a (non-error) result. Toast texts are raw: toast.js escapes
   its arguments. */

/* The key of a row's decision form draft in S.forms. */
export const formKey = (runId, index) => runId + ':' + index;
/* The verdict a choice records: 'confirm' the pipeline's, 'change' the other. */
export const decisionVerdict = (view, choice) => (choice === 'confirm' ? view.r.verdict : flip(view.r.verdict));
/* The form choice "Change decision" reopens: the current decision's own, so
   recording it again keeps the reviewer's verdict; '' without a decision. */
export const editChoice = (view) => (view.dec ? view.dec.type : '');
/* The form choice X opens: the verdict the row does not have now. */
export const changeChoice = (view) => (flip(view.verdict) === view.r.verdict ? 'confirm' : 'change');

/* {title, body} of the toast after recording choice with note; the title is
   also the undo label. undoCount: the undo stack's size after the push. */
export function recordToast(view, choice, note, undoCount) {
  const verdict = decisionVerdict(view, choice);
  const name = view.row.name;
  const title = verdict !== view.verdict ? 'Changed ' + name + ' to ' + vLow(verdict) : 'Confirmed ' + name + ' as ' + vLow(verdict);
  return { title, body: actionFor(verdict) + (note ? ' · note saved' : '') + ' · ' + undoCount + ' undoable' };
}
/* {label, title, body} after restoring the pipeline's verdict. */
export function restoreToast(view) {
  const name = view.row.name;
  return { label: 'Restored ' + name, title: 'Restored pipeline verdict for ' + name, body: view.flagged ? 'Back to Needs Review' : actionFor(view.r.verdict) };
}
/* {title, body} after undoing label; remaining: entries left on the stack. */
export function undoToast(label, remaining) {
  return { title: 'Undone: ' + label, body: remaining ? remaining + ' more action' + (remaining === 1 ? '' : 's') + ' can be undone' : '' };
}

/* Where a failed decision's message goes: 'form' (the hint of the open form)
   when the row's form is open and on screen (its run open, the row
   selected), else 'toast'. */
export function decisionErrorPlace({ forms, runId, index, activeRunId, selected }) {
  const form = forms[formKey(runId, index)];
  return form && form.open && activeRunId === runId && selected === index ? 'form' : 'toast';
}
/* Whether a failed undo goes back on the stack: not when the server refused
   it (HTTP 4xx: nothing to undo, no such row or run); yes on a network error
   or a server failure, so U can try again. error: from api.js. */
export const undoFailureKeeps = (error) => !(error.status >= 400 && error.status < 500);
/* A decision request this long in flight gets "Still saving the last
   decision" when another action arrives. */
export const BUSY_NOTICE_MS = 300;
export const busyNotice = (startedAt, now, alreadyShown) => !alreadyShown && now - startedAt >= BUSY_NOTICE_MS;

/* ---------- rows ---------- */
const SEV = Object.freeze({ Escalate: 0, Contested: 1, Uncertain: 2, Clear: 3 });
/* Where an error row sits on the risk scale when sorting: after the flagged
   risks, before Clear (its own risk value is not used). */
const ERROR_SEV = 2.5;

/* Effective view of one row: the pipeline result plus the reviewer's current
   decision. decisionOverride, when given (null included), is used instead of
   the row's history (computeIds passes the decision snapshot). A row without a result
   has r, dec, verdict and action null. An error row (result.error) is never
   flagged or open, has no verdict or decision and its action is
   'Needs Review'; its risk is ignored. */
export function rowView(row, decisionOverride) {
  const r = row.result || null;
  const idx = row.index + 1;
  const base = { row, r, idx, dec: null, error: false, flagged: false, open: false, verdict: null, reclassified: false, confirmed: false, action: null };
  if (!r) return base;
  if (r.error) return Object.assign(base, { error: true, action: 'Needs Review' });
  const dec = (decisionOverride === undefined ? currentDecision(row.history) : decisionOverride) || null;
  const flagged = r.risk !== 'Clear';
  const verdict = dec ? dec.verdict : r.verdict;
  const reclassified = !!dec && dec.verdict !== r.verdict;
  const action = dec ? actionFor(verdict) : flagged ? 'Needs Review' : actionFor(verdict);
  return Object.assign(base, { dec, flagged, open: flagged && !dec, verdict, reclassified, confirmed: !!dec && !reclassified, action });
}

/* A run's totals over its rows. Error rows add to done and errors only; avg
   is over the scored (non-error) rows. A verdict counts as in
   webapp/rows.py: deep tech, general tech, or neither. */
export function counts(rows) {
  const out = {
    total: rows.length, done: 0, deep: 0, general: 0, errors: 0, open: 0, confirmed: 0, reclassified: 0,
    cost: 0, costUnknown: false, avg: null, risk: { Clear: 0, Uncertain: 0, Contested: 0, Escalate: 0 },
  };
  let sum = 0; let scored = 0;
  rows.forEach((row) => {
    const v = rowView(row);
    if (!v.r) return;
    out.done++;
    if (v.error) { out.errors++; return; }
    scored++;
    if (v.verdict === 'deep tech') out.deep++; else if (v.verdict === 'general tech') out.general++;
    if (v.open) out.open++;
    if (v.confirmed) out.confirmed++;
    if (v.reclassified) out.reclassified++;
    if (v.r.risk in out.risk) out.risk[v.r.risk]++;
    if (v.r.cost == null) out.costUnknown = true; else out.cost += v.r.cost;
    sum += v.r.conf;
  });
  out.avg = scored ? Math.round(sum / scored) : null;
  return out;
}

/* ---------- filtering + sorting ---------- */
export const newFilters = () => ({ risk: new Set(), verdict: new Set(), status: new Set(), bin: null, q: '' });
export function anyFilter(f) {
  return !!(f.risk.size || f.verdict.size || f.status.size || f.bin != null || f.q.trim());
}

/* The visible row indexes, filtered and sorted.
   filters: from newFilters. sortKey: 'priority', 'idx', 'name', 'verdict',
   'conf', 'risk', 'action', 'patents' or 'cost'; sortDir 1 or -1 (priority
   ignores it). running: the run is running, so priority falls back to input
   order. snapshot: the decisions as they were at the last explicit sort,
   filter or search change, as {rowIndex: decision} (a missing index means no
   decision); a row decided since keeps its place. null or undefined sorts
   and filters by the current decisions.
   Rows without a result match only the search, and sort after the rest in
   input order. Error rows match the search but no risk, verdict, status or
   bin filter. */
export function computeIds(rows, { filters, sortKey, sortDir, running, snapshot }) {
  const f = filters; const q = f.q.trim().toLowerCase();
  const resultFilter = f.risk.size || f.verdict.size || f.status.size || f.bin != null;
  const views = {};
  const ids = [];
  rows.forEach((row) => {
    const v = rowView(row, snapshot ? (snapshot[row.index] || null) : undefined);
    views[row.index] = v;
    if (q && (row.name + ' ' + row.uen + ' ' + row.domain + ' ' + row.description).toLowerCase().indexOf(q) < 0) return;
    if (!v.r || v.error) { if (!resultFilter) ids.push(row.index); return; }
    if (f.risk.size && !f.risk.has(v.r.risk)) return;
    if (f.verdict.size && !f.verdict.has(v.verdict)) return;
    if (f.status.size && !((f.status.has('open') && v.open) || (f.status.has('reviewed') && v.confirmed) || (f.status.has('reclassified') && v.reclassified))) return;
    if (f.bin != null && Math.min(9, Math.floor(v.r.conf / 10)) !== f.bin) return;
    ids.push(row.index);
  });
  const key = sortKey; const dir = sortDir;
  if (key === 'idx' || (key === 'priority' && running)) {
    return ids.sort((a, b) => (views[a].idx - views[b].idx) * (key === 'idx' ? dir : 1));
  }
  const val = (v) => {
    switch (key) {
      case 'name': return v.row.name.toLowerCase();
      case 'verdict': return v.error ? '' : v.verdict;
      case 'conf': return v.r.conf;
      case 'risk': return v.error ? ERROR_SEV : SEV[v.r.risk];
      case 'action': return v.action;
      case 'patents': return v.r.patents ? v.r.patents.count : -1;
      case 'cost': return v.r.cost == null ? -1 : v.r.cost;
      default: return 0;
    }
  };
  /* Priority groups: open, flagged and decided, error, clear. */
  const group = (v) => (v.open ? 0 : v.flagged ? 1 : v.error ? 2 : 3);
  return ids.sort((a, b) => {
    const va = views[a]; const vb = views[b];
    if (!va.r || !vb.r) { if (va.r) return -1; if (vb.r) return 1; return va.idx - vb.idx; }
    if (key === 'priority') {
      const ga = group(va); const gb = group(vb);
      if (ga !== gb) return ga - gb;
      if (va.error) return va.idx - vb.idx;
      if (SEV[va.r.risk] !== SEV[vb.r.risk]) return SEV[va.r.risk] - SEV[vb.r.risk];
      return va.r.conf - vb.r.conf || va.idx - vb.idx;
    }
    const x = val(va); const y = val(vb);
    if (x < y) return -dir; if (x > y) return dir;
    return va.idx - vb.idx;
  });
}

/* ---------- long tables ---------- */
/* Rows a table renders at first, and how many more each "Show more" adds. */
export const ROW_WINDOW = 200;

/* The window of the view a table renders: the first limit ids, extended so
   selectedId (when it is in the view) is always included. hidden is how many
   ids of the view are left out. */
export function visibleRows(viewIds, limit, selectedId) {
  let n = Math.min(limit, viewIds.length);
  if (selectedId != null) {
    const at = viewIds.indexOf(selectedId);
    if (at >= n) n = at + 1;
  }
  return { ids: viewIds.slice(0, n), hidden: viewIds.length - n };
}

/* What the window depends on: the run, the sort, the filters and the search
   (as computeIds reads them). When it changes the window goes back to
   ROW_WINDOW; polling and decisions leave it alone. */
export function viewKey(runId, sortKey, sortDir, f) {
  const set = (s) => [...s].sort().join(',');
  return JSON.stringify([runId, sortKey, sortDir, set(f.risk), set(f.verdict), set(f.status), f.bin, f.q.trim().toLowerCase()]);
}

/* ---------- polling ---------- */
/* Merges GET /api/runs/{id}/changes into the open run.
   active: {run, rows, cursor} as GET /api/runs/{id} returned it (not
   changed). changes: {run, steps, rows, cursor}; changes.rows are the rows
   whose result was written since active.cursor, changes.steps the current
   step of every row that has one ({"<index>": step}).
   Returns {active, landed, changed}: the merged {run, rows, cursor}, the
   indexes whose result is new, and every index whose row changed (landed,
   or a pending row whose step changed). Unchanged rows keep their objects. */
export function mergeChanges(active, changes) {
  const rows = active.rows.slice();
  const landed = []; const changed = [];
  changes.rows.forEach((r) => {
    if (!(r.index >= 0 && r.index < rows.length)) return;
    rows[r.index] = r;
    landed.push(r.index); changed.push(r.index);
  });
  const steps = changes.steps || {};
  rows.forEach((row, i) => {
    if (row.result) return;
    const step = Object.prototype.hasOwnProperty.call(steps, i) ? steps[i] : null;
    if (row.step === step) return;
    rows[i] = Object.assign({}, row, { step });
    changed.push(i);
  });
  return { active: { run: changes.run, rows, cursor: changes.cursor }, landed, changed };
}

/* ---------- decision form ---------- */
/* view is a rowView with a (non-error) result; form is {choice, note}. */
export const needsNote = (view, choice) => view.r.risk === 'Clear' && choice === 'change';
export function formProblem(view, form) {
  if (!form.choice) return 'Choose an outcome.';
  if (needsNote(view, form.choice) && !form.note.trim()) return 'A note is required to overturn a Clear verdict. It is written to the workbook.';
  return '';
}
/* The form's hint {tone, text}. tone 'ok' (text empty: the caller shows its
   own line), 'pending' (a quiet instruction while the form is incomplete)
   or 'error' (form.tried: Record was attempted while incomplete). */
export function formHint(view, form) {
  const prob = formProblem(view, form);
  if (!prob) return { tone: 'ok', text: '' };
  if (form.tried) return { tone: 'error', text: prob };
  if (needsNote(view, form.choice)) return { tone: 'pending', text: 'Add a note to change a Clear verdict. It is written to the workbook.' };
  return { tone: 'pending', text: prob };
}

/* ---------- new run setup ---------- */
/* What to do about a missing API key. The server reads .env only when it
   starts, so a reload is not enough. */
export const missingKeyText = (keyVar) => 'Add ' + keyVar + ' to the .env file in the project folder, then restart the app (python serve.py).';
/* A setup row's Status cell before Start: nothing is queued yet. */
export const setupRowStatus = (out) => (out ? 'Left out' : '');
/* A note under a quick-settings step, or null. setup is GET /api/setup. */
export function quickStepNote(key, setup) {
  if (key === 'epo' && !setup.epoKeysSet) return { warn: true, text: 'EPO keys missing, so the run continues without patents.' };
  return null;
}
/* Rows of an uploaded file left blank in the mapped company name column; the
   pipeline skips them. file is the inspect dict from POST /api/files. */
export const skippedCount = (file, mapping) => file.emptyCounts[mapping.company_name] || 0;

/* Rows of the draft's file that would be classified (see startProblem). */
export function tickedCount(draft) {
  const file = draft.file; const excluded = draft.excluded || new Set();
  if (!file.table || !file.headers) return Math.max(0, file.rows - excluded.size);
  const col = file.headers.indexOf(draft.cfg.mapping.company_name);
  if (col < 0) return 0;
  return file.table.filter((cells, i) => !excluded.has(i) && String(cells[col] == null ? '' : cells[col]).trim()).length;
}

/* Why the new run cannot start yet, and where the fix is: {fix, label, text},
   or null when it can start.
   The draft fields used:
     draft.file      the inspect dict from POST /api/files, or null before a
                     file is chosen; file.table and file.headers (or, without
                     a table, file.rows) are read
     draft.cfg       the run's Settings; cfg.provider and cfg.mapping are read
     draft.excluded  a Set of the file's 0-based table row indexes left out
     draft.reading   the name of a file being uploaded, or '' (optional)
   A row counts as ticked when it is not excluded and its cell in the mapped
   company name column is not blank (the pipeline skips blank names).
   setup is GET /api/setup: setup.providers[] holds {id, label, keyVar, keySet}. */
export function startProblem(draft, setup) {
  const d = draft.cfg;
  // A file being uploaded (draft.reading, its name) replaces the one shown.
  if (draft.reading) return { fix: 'reading', label: 'Reading ' + draft.reading + '…', text: 'Start is available once the file has been read.' };
  if (!draft.file) return { fix: 'file', label: 'Choose an input file to start', text: 'Drop a spreadsheet on this column or choose one to see your companies here.' };
  if (!d.mapping.company_name) return { fix: 'map', label: 'Map the company name column to start', text: 'Choose which spreadsheet column holds the company names on the highlighted header.' };
  if (!tickedCount(draft)) return { fix: 'rows', label: 'Tick at least one company to start', text: 'Every company is left out. Tick the ones to classify.' };
  const p = setup.providers.find((x) => x.id === d.provider);
  if (!p) return { fix: 'sheet', label: 'Choose a provider to start', text: 'The selected provider is not available. Choose another provider in Analyst settings.' };
  if (!p.keySet) return { fix: 'sheet', label: p.keyVar + ' is not set in .env', text: missingKeyText(p.keyVar) + ' Or choose another provider in Analyst settings.' };
  return null;
}

/* The setup table's input columns, in table order: the Settings mapping key
   and the header label. */
export const SETUP_FIELDS = Object.freeze([
  { key: 'company_name', label: 'Company name', required: true },
  { key: 'uen', label: 'UEN' },
  { key: 'domain', label: 'Domain / industry' },
  { key: 'description', label: 'Description' },
]);

/* A new draft run (S.draft). setup is GET /api/setup; fromRun, for "Same
   settings…", a RunSummary whose settings are copied over the defaults. The
   cfg never shares objects with either. Besides cfg, file and excluded
   (see startProblem): fromId names the run it came from; limit is the setup
   table's row window (visibleRows); reading is the name of the file being
   uploaded and error the last upload's rejection; est is the last
   POST /api/estimate answer, estFailed true when the latest request for one
   failed (est is then null), and startError the last POST /api/runs
   refusal. */
export function newDraft(setup, fromRun) {
  const copy = (o) => JSON.parse(JSON.stringify(o || {}));
  const cfg = Object.assign(copy(setup.defaults), fromRun ? copy(fromRun.settings) : {});
  cfg.mapping = Object.assign({}, cfg.mapping);
  return {
    cfg, file: null, excluded: new Set(), fromId: fromRun ? fromRun.id : null, limit: ROW_WINDOW,
    reading: '', error: '', est: null, estFailed: false, startError: '',
  };
}

/* The mapping to use with a newly loaded file (the inspect dict). A fresh
   draft takes the file's detected mapping. keep (a "Same settings…" draft)
   keeps each column of mapping that is among the file's headers; every other
   field is cleared and takes the detected column, or '' when none was
   detected. */
export function mappingForFile(mapping, file, keep) {
  if (!keep) return Object.assign({}, file.mapping);
  const out = {};
  SETUP_FIELDS.forEach(({ key }) => {
    const col = mapping[key];
    out[key] = col && file.headers.indexOf(col) >= 0 ? col : (file.mapping[key] || '');
  });
  return out;
}

/* The state of field key's column chip: 'missing' (required, no column),
   'off' (no column), 'dup' (another field reads the same column), 'auto'
   (the detected column) or 'changed'. detected: the file's detected mapping. */
export function mapState(mapping, detected, key) {
  const col = mapping[key] || '';
  if (!col) return SETUP_FIELDS.some((f) => f.key === key && f.required) ? 'missing' : 'off';
  if (SETUP_FIELDS.some((f) => f.key !== key && mapping[f.key] === col)) return 'dup';
  return col === detected[key] ? 'auto' : 'changed';
}

/* The header checkbox over rows file rows with excluded left out: 'all'
   (checked), 'none' (unchecked) or 'some' (indeterminate). */
export function tickAllState(rows, excluded) {
  if (!excluded.size) return 'all';
  return excluded.size >= rows ? 'none' : 'some';
}

/* POST /api/runs exclude: the left-out rows of a file of rows rows, ascending. */
export const excludeList = (excluded, rows) => [...excluded].filter((i) => i >= 0 && i < rows).sort((a, b) => a - b);

/* What Start sends for draft, fixed when the request is made: exclude (the
   POST /api/runs exclude list) and n, the companies those rows leave to
   classify (tickedCount). Ticks changed while the request is in flight do
   not change either. */
export function startRequest(draft) {
  const exclude = excludeList(draft.excluded, draft.file.table.length);
  return { exclude, n: tickedCount(Object.assign({}, draft, { excluded: new Set(exclude) })) };
}

/* Rows the estimate is for: the ticked companies, or 20 before a file is chosen. */
export const ESTIMATE_SAMPLE = 20;
export const estimateRows = (draft) => (draft.file ? tickedCount(draft) : ESTIMATE_SAMPLE);

/* The Start button: 'Classify 18 companies · ~US$0.45 · about 2 min'. est:
   POST /api/estimate's answer, or null before the first one. failed: the
   latest estimate request failed, so no numbers are shown. */
export function classifyLabel(n, est, failed) {
  const head = 'Classify ' + countOf(n, 'company', 'companies');
  if (failed) return head + ' · estimate unavailable';
  if (!est) return head;
  return head + ' · ' + (est.known ? '~US$' + est.cost.toFixed(2) : 'cost unknown') + ' · about ' + durText(est.secs);
}
/* The settings popover's price beside a quality level: '~US$0.03 each', 'under
   US$0.01 each' below a cent, '' when the tier has no listed price (cost
   null, GET /api/setup providers[].costPerCompany). */
export function tierPriceText(cost) {
  if (cost == null) return '';
  return cost < 0.01 ? 'under US$0.01 each' : '~US$' + cost.toFixed(2) + ' each';
}
/* Why batch mode is off for provider prov: the providers that have it, or
   none. providers: GET /api/setup providers[] ({label, batch}). */
/* Under the Batch mode toggle when the run is too small for a batch job:
   rows ticked companies, batchMin the server's threshold (GET /api/setup
   batchMinCompanies, as pipeline/orchestrator.py applies it). Null when
   batch would apply, or before any company is ticked. */
export function batchSmallRunText(rows, batchMin) {
  if (!rows || rows >= batchMin) return null;
  return 'Batch jobs start at ' + batchMin.toLocaleString('en-US') + ' companies. This run has ' + rows.toLocaleString('en-US') + ', so it runs directly and this setting changes nothing.';
}
export function noBatchText(providers, prov) {
  const labels = providers.filter((p) => p.batch).map((p) => p.label);
  if (!labels.length) return 'Batch jobs are not available.';
  return 'Only ' + labels.join(' and ') + (labels.length === 1 ? ' supports' : ' support') + ' batch jobs; ' + prov.label + ' works one company at a time.';
}
/* The setup head's file line (text): '1 row · 0 skipped (empty name) · 1 column'. */
export const fileLine = (file, mapping) => countOf(file.rows, 'row', 'rows') + ' · ' + skippedCount(file, mapping).toLocaleString('en-US') + ' skipped (empty name) · ' + countOf(file.headers.length, 'column', 'columns');
/* What the action bar and the analyst sheet say when the estimate failed. */
export const ESTIMATE_FAILED = 'Estimate unavailable; it is tried again after the next change.';
/* The estimate's caveat, naming the model it was priced as when that is not
   the run's model (estimate pricedAs). */
export const estimateNote = (est) => 'Rough estimate' + (est.pricedAs ? '; priced as ' + est.pricedAs + '; the run is priced by the version the API reports' : '') + '.';
/* Why the cost is unknown; '' when it is known. */
export function unknownCostLine(est) {
  if (est.known) return '';
  return est.pinned
    ? 'Pinned model is not priced in pipeline/models.py; token totals will be reported instead.'
    : est.model + ' has no listed price; the cost is shown after the run if the API reports a priced version.';
}

/* The draft's line in the rail (text, not HTML). */
export function draftRailLine(draft) {
  if (!draft.file) return 'No file yet';
  return draft.file.name + ' · ' + countOf(tickedCount(draft), 'company', 'companies');
}

/* Headers no field reads: they are kept unchanged in the output. */
export function extraColumns(headers, mapping) {
  const used = Object.values(mapping).filter(Boolean);
  return headers.filter((h) => used.indexOf(h) < 0);
}
/* The extra columns to name in the setup note: the first max, and how many
   more. "and 1 more" is never said, as naming that one is just as short. */
export function extraColumnsShort(extra, max) {
  if (extra.length <= max + 1) return { shown: extra.slice(), more: 0 };
  return { shown: extra.slice(0, max), more: extra.length - max };
}
/* The warning when no description column is mapped; '' when one is. */
export function noDescriptionNote(cfg) {
  if (cfg.mapping.description) return '';
  return cfg.enrichment
    ? 'No description column: classification will rely on web enrichment.'
    : 'No description and enrichment is off: companies without patents are capped at ' + cfg.lowEvidenceCap + ' confidence.';
}
/* The first non-blank cell of column col in the file's table; '' when none. */
export function cellExample(file, col) {
  const i = file.headers.indexOf(col);
  if (i < 0) return '';
  const row = file.table.find((cells) => String(cells[i] == null ? '' : cells[i]).trim());
  return row ? row[i] : '';
}

/* The model a run with cfg would use: the pinned model, else the provider's
   tier model from setup (GET /api/setup); '' for an unknown provider. */
export function modelFor(cfg, setup) {
  const pin = (cfg.model || '').trim();
  if (pin) return pin;
  const p = setup.providers.find((x) => x.id === cfg.provider);
  return (p && p.tiers[cfg.tier]) || '';
}
/* Whether cfg differs from the defaults in anything but the tier (the
   quality level names that) and the mapping. */
export const isCustom = (cfg, defaults) => Object.keys(defaults).some((k) => k !== 'tier' && k !== 'mapping' && String(defaults[k]) !== String(cfg[k]));

/* Bounds of the numeric settings (webapp/settings_map.py _BOUNDS). */
export const SETTING_BOUNDS = Object.freeze({
  validatorThreshold: [0, 100], overrideMinConfidence: [0, 100], lowEvidenceCap: [0, 100],
  epoAdjustMax: [0, 30], maxWebSearches: [0, 10], enrichmentMaxSearches: [0, 10],
});
/* A typed numeric setting: rounded and clamped to its bounds, or fallback
   when raw is blank or not a number. */
export function settingValue(key, raw, fallback) {
  const s = String(raw == null ? '' : raw).trim();
  const n = Number(s);
  if (!s || !Number.isFinite(n)) return fallback;
  const b = SETTING_BOUNDS[key];
  return clamp(Math.round(n), b[0], b[1]);
}
/* Whether model is a pinned model that has no listed price (not in
   GET /api/setup pricedModels). */
export function pinUnpriced(model, pricedModels) {
  const m = (model || '').trim();
  return !!m && pricedModels.indexOf(m) < 0;
}

/* ---------- command menu ---------- */
/* The command menu's heading above items[i] when a group starts there, else
   null. Rows no longer carry their group name. */
const PAL_HEADS = { Action: 'Actions', Run: 'Runs', Company: 'Companies' };
export function paletteHeading(items, i) {
  if (i > 0 && items[i - 1].g === items[i].g) return null;
  return PAL_HEADS[items[i].g] || items[i].g;
}
/* The command menu's items for search q, in order: the actions (cmds
   entries with an act and not menu: false; while setting up only those
   marked setup), then "Reset the evidence panel width" (not while setting
   up), every run, and every company of the open run (not while setting up).
   Each item is {g, l, sub?, hay?, keys, act, id?}: act names the action;
   'run' (id: the run id) and 'company' (id: the row index) are the runs and
   companies. ctx: cmds (commands.js CMDS), runs [{id, file, sub}] newest
   first, rows (the open run's, or null), activeId (the open run's id, marked
   'current' when not setting up) and setup (a new run's setup is shown).
   Every whitespace-separated term of q must appear, ignoring case, in the
   item's group, label, sub or hay. */
export function paletteItems(q, { cmds, runs, rows, activeId, setup }) {
  const items = [];
  cmds.forEach((c) => { if (c.act && c.menu !== false && (!setup || c.setup)) items.push({ g: 'Action', l: c.l, keys: c.k, act: c.act }); });
  if (!setup) items.push({ g: 'Action', l: 'Reset the evidence panel width', keys: [], act: 'reset-width' });
  runs.forEach((r) => items.push({ g: 'Run', l: r.file, sub: r.sub, keys: r.id === activeId && !setup ? ['current'] : [], act: 'run', id: r.id }));
  if (rows && !setup) {
    rows.forEach((row) => items.push({
      g: 'Company', l: row.name, sub: [row.uen, row.domain].filter(Boolean).join(' · '), hay: row.uen + ' ' + row.domain, keys: [], act: 'company', id: row.index,
    }));
  }
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return items;
  return items.filter((it) => {
    const hay = (it.g + ' ' + it.l + ' ' + (it.sub || '') + ' ' + (it.hay || '')).toLowerCase();
    return terms.every((t) => hay.indexOf(t) >= 0);
  });
}

/* ---------- download ---------- */
/* The workbook's file name as the server sends it (webapp/app.py
   get_export): the input name without its extension, '_classified_', the
   run id without 'run_'. */
export const exportName = (file, runId) => file.replace(/\.(xlsx|xls|csv)$/i, '') + '_classified_' + runId.replace(/^run_/, '') + '.xlsx';

/* What "Download Excel" does for run with counts k (counts of its rows):
   {download, title, body}. download false (no row has a result yet, the
   server has nothing to export) shows only the toast. A run that is not
   complete gets the partial workbook (the server writes it the same way). */
export function downloadToast(run, k) {
  if (!k.done) return { download: false, title: 'Nothing to download yet', body: 'The workbook is available once the first company finishes.' };
  const partial = run.status !== 'complete';
  const name = exportName(run.file, run.id);
  return {
    download: true,
    title: (partial ? 'Saved partial workbook ' : 'Saved ') + name,
    body: (partial ? k.done + ' of ' + countOf(k.total, 'company', 'companies') + ' · ' : '') + k.confirmed + ' verdict' + (k.confirmed === 1 ? '' : 's') + ' confirmed · ' + k.reclassified + ' reclassified · ' + k.open + ' still need review',
  };
}

/* ---------- layout ---------- */
/* The evidence panel's narrowest width (px) when dragged or stored. */
export const PANEL_MIN_W = 340;
/* Width w rounded and kept between PANEL_MIN_W and maxW (60% of the space
   next to the rail); never below PANEL_MIN_W. */
export const panelWidth = (w, maxW) => Math.round(clamp(w, PANEL_MIN_W, Math.max(PANEL_MIN_W, maxW)));

const isObject = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
/* The layout stored under localStorage 'dtc.ui' (raw: the stored string, or
   null): {detailW, reading, collapsed}. detailW is a positive width or null
   (the default width); collapsed maps evidence section keys to true/false
   over the default {facts: true}. A missing, unparsable or wrong-shaped
   value, or field, falls back to its default. */
export function parseUi(raw) {
  const out = { detailW: null, reading: false, collapsed: { facts: true } };
  let v = null;
  try { v = JSON.parse(raw); } catch (e) { v = null; }
  if (!isObject(v)) return out;
  if (typeof v.detailW === 'number' && Number.isFinite(v.detailW) && v.detailW > 0) out.detailW = v.detailW;
  if (typeof v.reading === 'boolean') out.reading = v.reading;
  if (isObject(v.collapsed)) {
    Object.keys(v.collapsed).forEach((k) => { if (typeof v.collapsed[k] === 'boolean') out.collapsed[k] = v.collapsed[k]; });
  }
  return out;
}
/* The fields of state s that are stored under 'dtc.ui'. */
export const uiToStore = (s) => ({ detailW: s.detailW, reading: s.reading, collapsed: s.collapsed });

/* The row to select after the user changed filters, search or sort:
   selected while it is still among ids (the view), else the first visible
   row, or null when nothing is visible. */
export function keptSelection(selected, ids) {
  if (selected != null && ids.indexOf(selected) >= 0) return selected;
  return ids.length ? ids[0] : null;
}

/* What Esc does to the new run's draft once no popover is open: 'none'
   while Start is in flight (or without a draft), 'discard' when no file is
   loaded or uploading (nothing to lose), else 'park' (kept in the rail). */
export function setupEscapeAction(draft) {
  if (!draft || draft.starting) return 'none';
  return draft.file || draft.reading ? 'park' : 'discard';
}
/* Whether the Cancel button shows the Esc hint: only when Esc discards too. */
export function cancelHintsEsc(draft) {
  return setupEscapeAction(draft) === 'discard';
}

/* ---------- small screens ----------
   Below 900px the three columns do not fit: the main column takes the width,
   the run rail becomes a drawer and the evidence panel opens over the table.
   NARROW_QUERY is the media query the JS watches; styles.css uses the same
   @media (width < 900px). A range rather than max-width: 899px, because a
   zoomed window can be 899.5px wide and would match neither layout. */
export const NARROW_BELOW = 900;
export const NARROW_QUERY = '(width < ' + NARROW_BELOW + 'px)';
export const isNarrow = (width) => width < NARROW_BELOW;

/* What Esc closes when no field, overlay or setup takes it, from
   {narrow, drawer, panel, reading, form} (form: the selected row's decision
   form is open). Wide: reading view, then the form. Narrow: the run drawer,
   then the form, then the evidence panel; reading view has no meaning in one
   column. null: nothing to close. */
export function escapeTarget(st) {
  if (st.narrow && st.drawer) return 'drawer';
  if (!st.narrow && st.reading) return 'reading';
  if (st.form) return 'form';
  if (st.narrow && st.panel) return 'panel';
  return null;
}

/* Whether the evidence panel is open after a row is selected, from
   {narrow, panel, pick}. pick: the user chose the row (click, Enter, the
   command menu); otherwise it was a move (J, K, N, Home, End), which keeps
   the panel as it was so the list can be browsed without it. Only narrow
   windows open the panel; wide ones always show it as a column. */
export const panelAfterSelect = (st) => !!st.narrow && (!!st.pick || !!st.panel);

/* What E does, from {narrow, panel}: reading view when wide; when narrow the
   panel already takes the whole width, so E shows or hides it instead. */
export function readingKeyAction(st) {
  if (!st.narrow) return 'reading';
  return st.panel ? 'close-panel' : 'open-panel';
}
