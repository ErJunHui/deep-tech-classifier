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
export const fmtDur = (s) => {
  if (s < 90) return '~' + Math.max(1, Math.round(s)) + ' s';
  if (s < 3600) return '~' + Math.round(s / 60) + ' min';
  const h = Math.floor(s / 3600); const m = Math.round((s % 3600) / 60);
  return '~' + h + ' h' + (m ? ' ' + m + ' min' : '');
};
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

/* ---------- rows ---------- */
const SEV = Object.freeze({ Escalate: 0, Contested: 1, Uncertain: 2, Clear: 3 });
/* Where an error row sits on the risk scale when sorting: after the flagged
   risks, before Clear (its own risk value is not used). */
const ERROR_SEV = 2.5;

/* Effective view of one row: the pipeline result plus the reviewer's current
   decision. decisionOverride, when given (null included), is used instead of
   the row's history (computeIds passes the decision snapshot). total is part
   of the shared signature; the view does not need it. A row without a result
   has r, dec, verdict and action null. An error row (result.error) is never
   flagged or open, has no verdict or decision and its action is
   'Needs Review'; its risk is ignored. */
export function rowView(row, total, decisionOverride) {
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
    const v = rowView(row, rows.length);
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
    const v = rowView(row, rows.length, snapshot ? (snapshot[row.index] || null) : undefined);
    views[row.index] = v;
    if (q && (row.name + ' ' + row.uen + ' ' + row.domain + ' ' + row.description).toLowerCase().indexOf(q) < 0) return;
    if (!v.r) { if (!resultFilter) ids.push(row.index); return; }
    if (v.error) { if (!resultFilter) ids.push(row.index); return; }
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

/* ---------- decision form ---------- */
/* view is a rowView with a (non-error) result; form is {choice, note}. */
export const needsNote = (view, choice) => view.r.risk === 'Clear' && choice === 'change';
export function formProblem(view, form) {
  if (!form.choice) return 'Choose an outcome.';
  if (needsNote(view, form.choice) && !form.note.trim()) return 'A note is required to overturn a Clear verdict. It is written to the workbook.';
  return '';
}

/* ---------- new run setup ---------- */
/* Rows of an uploaded file left blank in the mapped company name column; the
   pipeline skips them. file is the inspect dict from POST /api/files. */
export const skippedCount = (file, mapping) => file.emptyCounts[mapping.company_name] || 0;

/* Why the new run cannot start yet, and where the fix is: {fix, label, text},
   or null when it can start.
   The draft fields used:
     draft.file      the inspect dict from POST /api/files, or null before a
                     file is chosen (only file.rows is read)
     draft.cfg       the run's Settings; cfg.provider and cfg.mapping are read
     draft.excluded  a Set of the file's 0-based table row indexes left out
   setup is GET /api/setup: setup.providers[] holds {id, label, keyVar, keySet}. */
export function startProblem(draft, setup) {
  const d = draft.cfg;
  if (!draft.file) return { fix: 'file', label: 'Choose an input file to start', text: 'Drop a spreadsheet on this column or choose one to see your companies here.' };
  if (!d.mapping.company_name) return { fix: 'map', label: 'Map the company name column to start', text: 'Choose which spreadsheet column holds the company names on the highlighted header.' };
  const excluded = draft.excluded ? draft.excluded.size : 0;
  if (draft.file.rows - excluded <= 0) return { fix: 'rows', label: 'Tick at least one company to start', text: 'Every company is left out. Tick the ones to classify.' };
  const p = setup.providers.find((x) => x.id === d.provider);
  if (p && !p.keySet) return { fix: 'sheet', label: p.keyVar + ' is not set in .env', text: 'Ask your admin to add ' + p.keyVar + ' to .env, or choose another provider in Analyst settings.' };
  return null;
}
