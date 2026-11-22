import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  esc, clamp, pad, money, fmtDur, confWord, signed, flip, vLabel, vLow, actionFor, hhmm, dateLabel,
  currentDecision, rowView, counts, newFilters, anyFilter, computeIds,
  formProblem, needsNote, startProblem, skippedCount, ROW_WINDOW, visibleRows, viewKey, mergeChanges,
  pushUndo, popUndo, decisionVerdict, editChoice, changeChoice, recordToast, restoreToast, undoToast,
  decisionErrorPlace, undoFailureKeeps, busyNotice,
  tickedCount, newDraft, mappingForFile, mapState, tickAllState, excludeList, estimateRows,
  classifyLabel, estimateNote, unknownCostLine, extraColumns, noDescriptionNote, cellExample,
  modelFor, isCustom, settingValue, pinUnpriced, SETUP_FIELDS, draftRailLine,
  durText, countOf, fileLine, noBatchText, tierPriceText, startRequest,
  paletteItems, exportName, downloadToast, PANEL_MIN_W, panelWidth, parseUi, uiToStore,
  keptSelection, setupEscapeAction, cancelHintsEsc, formHint, missingKeyText, setupRowStatus, quickStepNote, batchSmallRunText,
} from '../js/model.js';

/* ---------- fixtures in the Row shape ---------- */
const result = (o = {}) => Object.assign({
  error: false, errorMessage: '', verdict: 'deep tech', conf: 80, risk: 'Clear', tier: 'High',
  llm: 80, adj: 0, pre: 80, capped: false, validated: false, override: '', val: null,
  patents: { count: 0, level: '', domain: '', status: 'no_results', cpc: [] },
  basis: 'COMBINED', reasoning: '', criteria: {}, hasInputDesc: true, hasWeb: true,
  webDescription: '', webSource: '', webStatus: 'found', cost: 0.05, timeS: 30, model: '',
}, o);
const row = (index, res = null, history = [], o = {}) => Object.assign({
  index, name: 'Company ' + index, uen: 'UEN' + index, domain: 'Sector ' + index, description: 'About ' + index,
  step: null, result: res, history,
}, o);
const entry = (type, verdict, note = '') => ({ type, verdict, note, at: '2026-11-13T14:40:02' });
const errorResult = (o = {}) => result(Object.assign({ error: true, errorMessage: 'boom', verdict: 'error', conf: 0, risk: 'Escalate', cost: null }, o));
const ids = (rows, opts = {}) => computeIds(rows, Object.assign({ filters: newFilters(), sortKey: 'priority', sortDir: 1, running: false, snapshot: null }, opts));

/* ---------- formatters ---------- */
test('esc neutralises markup', () => assert.equal(esc(`<img src=x onerror="a">&'`), '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;'));
test('esc renders null and undefined as empty and numbers as text', () => {
  assert.deepEqual([esc(null), esc(undefined), esc(0), esc(42)], ['', '', '0', '42']);
});
test('fmtDur', () => assert.deepEqual([fmtDur(40), fmtDur(600), fmtDur(5400)], ['~40 s', '~10 min', '~1 h 30 min']));
test('fmtDur: under a second rounds up to 1 s; whole hours have no minutes', () => {
  assert.deepEqual([fmtDur(0.2), fmtDur(89), fmtDur(90), fmtDur(7200)], ['~1 s', '~89 s', '~2 min', '~2 h']);
});
test('confWord boundaries', () => {
  assert.deepEqual(
    [100, 90, 89, 75, 74, 60, 59, 45, 44, 30, 29, 0].map(confWord),
    ['Near-definitive', 'Near-definitive', 'Strong', 'Strong', 'Moderate', 'Moderate', 'Borderline', 'Borderline', 'Weak', 'Weak', 'Minimal', 'Minimal'],
  );
});
test('clamp and pad', () => {
  assert.deepEqual([clamp(-5, 0, 100), clamp(50, 0, 100), clamp(120, 0, 100)], [0, 50, 100]);
  assert.deepEqual([pad(3), pad(12)], ['03', '12']);
});
test('money: two decimals by default, or the given number', () => {
  assert.deepEqual([money(1.5), money(0.0523, 3), money(12, 0)], ['$1.50', '$0.052', '$12']);
});
test('signed uses a real minus sign and ± for zero', () => {
  assert.deepEqual([signed(3), signed(-4), signed(0)], ['+3', '−4', '±0']);
});
test('verdict helpers', () => {
  assert.deepEqual([flip('deep tech'), flip('general tech')], ['general tech', 'deep tech']);
  assert.deepEqual([vLabel('deep tech'), vLabel('general tech')], ['Deep tech', 'General tech']);
  assert.deepEqual([vLow('deep tech'), vLow('general tech')], ['deep tech', 'general tech']);
  assert.deepEqual([actionFor('deep tech'), actionFor('general tech')], ['Approve', 'Reject']);
});
test('hhmm pads local hours and minutes', () => assert.equal(hhmm(new Date(2026, 10, 13, 8, 5)), '08:05'));
test('dateLabel: today shows the time, another day shows the date', () => {
  const now = new Date(2026, 10, 13, 17, 0);
  assert.equal(dateLabel('2026-11-13T08:42:10', now), 'Today, 08:42');
  assert.equal(dateLabel('2026-11-02T23:59:00', now), '2 Nov 2026');
  assert.equal(dateLabel('2025-11-13T08:42:10', now), '13 Nov 2025');
  assert.equal(dateLabel('', now), '');
  assert.equal(dateLabel('not a date', now), '');
});

/* ---------- decisions ---------- */
test('currentDecision: last entry unless it is a restore or there is none', () => {
  assert.equal(currentDecision([]), null);
  assert.equal(currentDecision(undefined), null);
  const c = entry('change', 'general tech');
  assert.equal(currentDecision([entry('confirm', 'deep tech'), c]), c);
  assert.equal(currentDecision([c, entry('restore', 'deep tech')]), null);
});

/* ---------- rowView ---------- */
test('rowView: flagged undecided row is open and Needs Review', () => {
  const r = row(2, result({ risk: 'Contested' }));
  const v = rowView(r);
  assert.equal(v.row, r);
  assert.equal(v.r, r.result);
  assert.equal(v.idx, 3);
  assert.equal(v.dec, null);
  assert.equal(v.error, false);
  assert.equal(v.flagged, true);
  assert.equal(v.open, true);
  assert.equal(v.verdict, 'deep tech');
  assert.equal(v.reclassified, false);
  assert.equal(v.confirmed, false);
  assert.equal(v.action, 'Needs Review');
});
test('rowView: clear undecided row is not open and its action follows the verdict', () => {
  const v = rowView(row(0, result({ verdict: 'general tech' })));
  assert.deepEqual([v.flagged, v.open, v.action], [false, false, 'Reject']);
});
test('rowView: change decision reclassifies and sets action from the new verdict', () => {
  const v = rowView(row(0, result({ risk: 'Escalate', verdict: 'deep tech' }), [entry('change', 'general tech', 'why')]));
  assert.equal(v.dec.type, 'change');
  assert.equal(v.verdict, 'general tech');
  assert.equal(v.reclassified, true);
  assert.equal(v.confirmed, false);
  assert.equal(v.open, false);
  assert.equal(v.flagged, true);
  assert.equal(v.action, 'Reject');
});
test('rowView: confirm decision is confirmed and closes a flagged row', () => {
  const v = rowView(row(0, result({ risk: 'Uncertain' }), [entry('confirm', 'deep tech')]));
  assert.deepEqual([v.confirmed, v.reclassified, v.open, v.action], [true, false, false, 'Approve']);
});
test('rowView: restore clears the decision', () => {
  const v = rowView(row(0, result({ risk: 'Escalate' }), [entry('change', 'general tech'), entry('restore', 'deep tech')]));
  assert.equal(v.dec, null);
  assert.equal(v.verdict, 'deep tech');
  assert.deepEqual([v.reclassified, v.confirmed, v.open, v.action], [false, false, true, 'Needs Review']);
});
test('rowView: a decision override replaces the history, null meaning none', () => {
  const r = row(0, result({ risk: 'Escalate' }), [entry('change', 'general tech')]);
  assert.equal(rowView(r, null).open, true);
  assert.equal(rowView(r, null).verdict, 'deep tech');
  const v = rowView(row(0, result({ risk: 'Escalate' })), entry('confirm', 'deep tech'));
  assert.equal(v.confirmed, true);
});
test('rowView: error row is never open and has no verdict', () => {
  const v = rowView(row(1, errorResult({ risk: 'Escalate' })));
  assert.equal(v.error, true);
  assert.equal(v.flagged, false);
  assert.equal(v.open, false);
  assert.equal(v.verdict, null);
  assert.equal(v.dec, null);
  assert.deepEqual([v.reclassified, v.confirmed], [false, false]);
  assert.equal(v.action, 'Needs Review');
  assert.equal(v.idx, 2);
});
test('rowView: pending row has no result, verdict or action', () => {
  const v = rowView(row(4, null, [], { step: 'Enrichment' }));
  assert.deepEqual([v.r, v.dec, v.verdict, v.action, v.error, v.open, v.flagged, v.idx], [null, null, null, null, false, false, false, 5]);
});

/* ---------- counts ---------- */
test('counts: reclassified row counts under its new verdict; errors counted apart', () => {
  const rows = [
    row(0, result({ verdict: 'deep tech', risk: 'Clear', conf: 90, cost: 0.1 })),
    row(1, result({ verdict: 'deep tech', risk: 'Escalate', conf: 50, cost: 0.2 }), [entry('change', 'general tech')]),
    row(2, result({ verdict: 'general tech', risk: 'Contested', conf: 40, cost: 0.3 })),
    row(3, result({ verdict: 'general tech', risk: 'Uncertain', conf: 60, cost: 0.4 }), [entry('confirm', 'general tech')]),
    row(4, errorResult({ risk: 'Escalate', conf: 0, cost: 9 })),
    row(5, null),
  ];
  const k = counts(rows);
  assert.equal(k.total, 6);
  assert.equal(k.done, 5);
  assert.equal(k.errors, 1);
  assert.equal(k.deep, 1);
  assert.equal(k.general, 3);
  assert.equal(k.open, 1);
  assert.equal(k.confirmed, 1);
  assert.equal(k.reclassified, 1);
  assert.deepEqual(k.risk, { Clear: 1, Uncertain: 1, Contested: 1, Escalate: 1 });
  assert.equal(Math.round(k.cost * 100) / 100, 1);
  assert.equal(k.costUnknown, false);
  assert.equal(k.avg, 60);
});
test('counts: unknown cost is flagged; no results means no average', () => {
  assert.equal(counts([row(0, result({ cost: null })), row(1, result({ cost: 0.1 }))]).costUnknown, true);
  const k = counts([row(0, null), row(1, errorResult())]);
  assert.deepEqual([k.total, k.done, k.errors, k.avg, k.cost], [2, 1, 1, null, 0]);
});

/* ---------- filters ---------- */
test('newFilters and anyFilter', () => {
  const f = newFilters();
  assert.equal(anyFilter(f), false);
  assert.equal(anyFilter(Object.assign(newFilters(), { q: '   ' })), false);
  assert.equal(anyFilter(Object.assign(newFilters(), { q: 'x' })), true);
  assert.equal(anyFilter(Object.assign(newFilters(), { bin: 0 })), true);
  const g = newFilters(); g.risk.add('Clear');
  assert.equal(anyFilter(g), true);
  assert.notEqual(newFilters().risk, newFilters().risk);
});

/* ---------- computeIds ---------- */
test('computeIds: priority puts open rows first, then by severity Escalate<Contested<Uncertain, then lowest confidence', () => {
  const rows = [
    row(0, result({ risk: 'Clear', conf: 95 })),
    row(1, result({ risk: 'Uncertain', conf: 55 })),
    row(2, result({ risk: 'Escalate', conf: 70 })),
    row(3, result({ risk: 'Contested', conf: 60 })),
    row(4, result({ risk: 'Escalate', conf: 40 })),
    row(5, result({ risk: 'Escalate', conf: 30 }), [entry('confirm', 'deep tech')]),
    row(6, result({ risk: 'Clear', conf: 80 })),
    row(7, null),
  ];
  assert.deepEqual(ids(rows), [4, 2, 3, 1, 5, 6, 0, 7]);
});
test('computeIds: error rows sort after flagged rows and before clear rows', () => {
  const rows = [
    row(0, result({ risk: 'Clear', conf: 95 })),
    row(1, errorResult({ risk: 'Escalate' })),
    row(2, result({ risk: 'Contested', conf: 60 }), [entry('confirm', 'deep tech')]),
    row(3, result({ risk: 'Escalate', conf: 50 })),
    row(4, errorResult({ risk: 'Clear' })),
    row(5, null),
  ];
  assert.deepEqual(ids(rows), [3, 2, 1, 4, 0, 5]);
});
test('computeIds: input order while running', () => {
  const rows = [
    row(0, result({ risk: 'Clear' })),
    row(1, null),
    row(2, result({ risk: 'Escalate' })),
  ];
  assert.deepEqual(ids(rows, { running: true }), [0, 1, 2]);
  assert.deepEqual(ids(rows, { running: false }), [2, 0, 1]);
});
test('computeIds: idx sort honours direction; other keys sort by value then input order', () => {
  const rows = [
    row(0, result({ conf: 70 }), [], { name: 'beta' }),
    row(1, result({ conf: 50 }), [], { name: 'Alpha' }),
    row(2, result({ conf: 70 }), [], { name: 'gamma' }),
    row(3, null, [], { name: 'aardvark' }),
  ];
  assert.deepEqual(ids(rows, { sortKey: 'idx', sortDir: -1 }), [3, 2, 1, 0]);
  assert.deepEqual(ids(rows, { sortKey: 'name', sortDir: 1 }), [1, 0, 2, 3]);
  assert.deepEqual(ids(rows, { sortKey: 'conf', sortDir: -1 }), [0, 2, 1, 3]);
});
test('computeIds: a row decided after the snapshot keeps its place', () => {
  const rows = [
    row(0, result({ risk: 'Clear', conf: 90 })),
    row(1, result({ risk: 'Escalate', conf: 40 }), [entry('confirm', 'deep tech')]),
    row(2, result({ risk: 'Contested', conf: 50 })),
  ];
  // Snapshot taken before row 1 was decided: it still sorts as open.
  assert.deepEqual(ids(rows, { snapshot: {} }), [1, 2, 0]);
  // With the decisions as they are now, it drops below the open row.
  assert.deepEqual(ids(rows, { snapshot: null }), [2, 1, 0]);
  // A snapshot that holds the decision sorts by it.
  assert.deepEqual(ids(rows, { snapshot: { 1: entry('confirm', 'deep tech') } }), [2, 1, 0]);
});
test('computeIds: search matches name, UEN, domain and description, case-insensitively', () => {
  const rows = [
    row(0, result(), [], { name: 'Lumora Photonics' }),
    row(1, result(), [], { uen: '201912345K' }),
    row(2, result(), [], { domain: 'Quantum Sensing' }),
    row(3, result(), [], { description: 'Builds BATTERY cells' }),
    row(4, result()),
  ];
  const q = (s) => ids(rows, { filters: Object.assign(newFilters(), { q: s }), sortKey: 'idx' });
  assert.deepEqual(q('lumora'), [0]);
  assert.deepEqual(q('201912345k'), [1]);
  assert.deepEqual(q('  QUANTUM '), [2]);
  assert.deepEqual(q('battery'), [3]);
  assert.deepEqual(q('nothing like it'), []);
});
test('computeIds: pending rows are hidden by any result filter but not by search', () => {
  const rows = [row(0, result({ risk: 'Clear' })), row(1, null, [], { name: 'Pending Co' })];
  const f = newFilters(); f.risk.add('Clear');
  assert.deepEqual(ids(rows, { filters: f }), [0]);
  assert.deepEqual(ids(rows, { filters: Object.assign(newFilters(), { q: 'pending' }) }), [1]);
});
test('computeIds: risk, verdict and status filters use the current verdict and decision', () => {
  const rows = [
    row(0, result({ risk: 'Escalate', verdict: 'deep tech' })),
    row(1, result({ risk: 'Escalate', verdict: 'deep tech' }), [entry('change', 'general tech')]),
    row(2, result({ risk: 'Clear', verdict: 'general tech' }), [entry('confirm', 'general tech')]),
  ];
  const by = (k, vals) => { const f = newFilters(); vals.forEach((x) => f[k].add(x)); return ids(rows, { filters: f, sortKey: 'idx' }); };
  assert.deepEqual(by('risk', ['Escalate']), [0, 1]);
  assert.deepEqual(by('verdict', ['general tech']), [1, 2]);
  assert.deepEqual(by('status', ['open']), [0]);
  assert.deepEqual(by('status', ['reviewed']), [2]);
  assert.deepEqual(by('status', ['reclassified']), [1]);
  assert.deepEqual(by('status', ['open', 'reclassified']), [0, 1]);
});
test('computeIds: error rows match no result filter but do match search', () => {
  const rows = [row(0, errorResult({ risk: 'Escalate', conf: 0 }), [], { name: 'Broken Co' }), row(1, result({ risk: 'Escalate', conf: 5 }))];
  const one = (k, v) => { const f = newFilters(); if (k === 'bin') f.bin = v; else f[k].add(v); return ids(rows, { filters: f }); };
  assert.deepEqual(one('risk', 'Escalate'), [1]);
  assert.deepEqual(one('verdict', 'deep tech'), [1]);
  assert.deepEqual(one('status', 'open'), [1]);
  assert.deepEqual(one('bin', 0), [1]);
  assert.deepEqual(ids(rows, { filters: Object.assign(newFilters(), { q: 'broken' }) }), [0]);
});
test('computeIds: confidence bin 9 includes 100', () => {
  const rows = [row(0, result({ conf: 100 })), row(1, result({ conf: 90 })), row(2, result({ conf: 89 })), row(3, result({ conf: 0 }))];
  const bin = (b) => ids(rows, { filters: Object.assign(newFilters(), { bin: b }), sortKey: 'idx' });
  assert.deepEqual(bin(9), [0, 1]);
  assert.deepEqual(bin(8), [2]);
  assert.deepEqual(bin(0), [3]);
});

/* ---------- decision form ---------- */
test('formProblem: change on Clear needs a note; change on flagged does not', () => {
  const clear = rowView(row(0, result({ risk: 'Clear' })));
  const flagged = rowView(row(1, result({ risk: 'Contested' })));
  const note = 'A note is required to overturn a Clear verdict. It is written to the workbook.';
  assert.equal(formProblem(clear, { choice: '', note: '' }), 'Choose an outcome.');
  assert.equal(formProblem(clear, { choice: 'change', note: '' }), note);
  assert.equal(formProblem(clear, { choice: 'change', note: '   ' }), note);
  assert.equal(formProblem(clear, { choice: 'change', note: 'Has a lab.' }), '');
  assert.equal(formProblem(clear, { choice: 'confirm', note: '' }), '');
  assert.equal(formProblem(flagged, { choice: 'change', note: '' }), '');
});
test('needsNote: only a change on a Clear row', () => {
  const clear = rowView(row(0, result({ risk: 'Clear' })));
  const flagged = rowView(row(1, result({ risk: 'Uncertain' })));
  assert.deepEqual([needsNote(clear, 'change'), needsNote(clear, 'confirm'), needsNote(flagged, 'change')], [true, false, false]);
});

/* ---------- new run setup ---------- */
test('startProblem: file, then mapping, then ticked rows, then key', () => {
  const setup = {
    providers: [
      { id: 'anthropic', label: 'Anthropic', keyVar: 'ANTHROPIC_API_KEY', keySet: false, batch: true },
      { id: 'openai', label: 'OpenAI', keyVar: 'OPENAI_API_KEY', keySet: true, batch: false },
    ],
  };
  const file = { fileId: 'f'.repeat(32), name: 'list.xlsx', rows: 2, headers: ['Company', 'About'], mapping: { company_name: 'Company' },
    preview: [], table: [['A', ''], ['B', '']], emptyCounts: { Company: 0, About: 2 } };
  const draft = { cfg: { provider: 'anthropic', mapping: {} }, file: null, excluded: new Set() };
  let p = startProblem(draft, setup);
  assert.equal(p.fix, 'file');
  assert.equal(p.label, 'Choose an input file to start');
  assert.equal(typeof p.text, 'string');

  draft.file = file;
  p = startProblem(draft, setup);
  assert.deepEqual([p.fix, p.label], ['map', 'Map the company name column to start']);

  draft.cfg.mapping = { company_name: 'Company' };
  draft.excluded = new Set([0, 1]);
  p = startProblem(draft, setup);
  assert.deepEqual([p.fix, p.label], ['rows', 'Tick at least one company to start']);

  draft.excluded = new Set([1]);
  p = startProblem(draft, setup);
  assert.deepEqual([p.fix, p.label], ['sheet', 'ANTHROPIC_API_KEY is not set in .env']);
  assert.match(p.text, /ANTHROPIC_API_KEY/);

  draft.cfg.provider = 'openai';
  assert.equal(startProblem(draft, setup), null);
});
const SETUP = { providers: [{ id: 'openai', label: 'OpenAI', keyVar: 'OPENAI_API_KEY', keySet: true, batch: false }] };
const named = (excluded, file) => ({
  cfg: { provider: 'openai', mapping: { company_name: 'Company' } },
  file: file || { rows: 3, headers: ['About', 'Company'], table: [['x', 'Alpha'], ['y', '   '], ['z', 'Gamma']], emptyCounts: { About: 0, Company: 1 } },
  excluded: new Set(excluded),
});
test('startProblem: a provider not in setup blocks the start', () => {
  const draft = named([]);
  draft.cfg.provider = 'nosuch';
  assert.deepEqual(startProblem(draft, SETUP), {
    fix: 'sheet', label: 'Choose a provider to start', text: 'The selected provider is not available. Choose another provider in Analyst settings.',
  });
  assert.equal(startProblem(named([]), SETUP), null);
});
test('startProblem: rows with a blank company name do not count as ticked', () => {
  const p = startProblem(named([0, 2]), SETUP);
  assert.deepEqual(p, { fix: 'rows', label: 'Tick at least one company to start', text: 'Every company is left out. Tick the ones to classify.' });
  assert.equal(startProblem(named([0]), SETUP), null);
  assert.equal(startProblem(named([2]), SETUP), null);
});
test('startProblem: a file without its table counts rows less exclusions', () => {
  const noTable = { rows: 3, headers: ['About', 'Company'], emptyCounts: { About: 0, Company: 1 } };
  assert.equal(startProblem(named([0, 2], noTable), SETUP), null);
  assert.equal(startProblem(named([0, 1, 2], noTable), SETUP).fix, 'rows');
});

/* Error rows sort by stand-in values: verdict '', risk between Uncertain and
   Clear, action 'Needs Review', and their real patent count and cost. */
const sortRows = () => [
  row(0, result({ risk: 'Clear', verdict: 'deep tech', conf: 90, cost: 0.2, patents: { count: 3 } })),
  row(1, errorResult({ risk: 'Escalate', conf: 0, cost: null, patents: { count: 0 } })),
  row(2, result({ risk: 'Escalate', verdict: 'general tech', conf: 40, cost: 0.1, patents: { count: 1 } })),
  row(3, result({ risk: 'Uncertain', verdict: 'deep tech', conf: 55, cost: 0, patents: { count: 0 } }), [entry('confirm', 'deep tech')]),
  row(4, result({ risk: 'Clear', verdict: 'general tech', conf: 85, cost: null, patents: { count: 2 } })),
  row(5, null),
];
const sorted = (key, dir) => ids(sortRows(), { sortKey: key, sortDir: dir });
test('computeIds with an error row: risk sorts it after Uncertain and before Clear', () => {
  assert.deepEqual(sorted('risk', 1), [2, 3, 1, 0, 4, 5]);
  assert.deepEqual(sorted('risk', -1), [0, 4, 1, 3, 2, 5]);
});
test('computeIds with an error row: verdict sorts it before deep tech ascending, last descending', () => {
  assert.deepEqual(sorted('verdict', 1), [1, 0, 3, 2, 4, 5]);
  assert.deepEqual(sorted('verdict', -1), [2, 4, 0, 3, 1, 5]);
});
test('computeIds with an error row: action sorts it with the Needs Review rows', () => {
  assert.deepEqual(sorted('action', 1), [0, 3, 1, 2, 4, 5]);
  assert.deepEqual(sorted('action', -1), [4, 1, 2, 0, 3, 5]);
});
test('computeIds with an error row: patents uses its real count', () => {
  assert.deepEqual(sorted('patents', 1), [1, 3, 2, 4, 0, 5]);
  assert.deepEqual(sorted('patents', -1), [0, 4, 2, 1, 3, 5]);
});
test('computeIds with an error row: cost puts it with the unknown costs, below $0', () => {
  assert.deepEqual(sorted('cost', 1), [1, 4, 3, 2, 0, 5]);
  assert.deepEqual(sorted('cost', -1), [0, 2, 3, 1, 4, 5]);
});
test('skippedCount: blank cells in the company name column', () => {
  const file = { emptyCounts: { Company: 3, About: 7 } };
  assert.equal(skippedCount(file, { company_name: 'Company' }), 3);
  assert.equal(skippedCount(file, {}), 0);
  assert.equal(skippedCount(file, { company_name: 'Missing' }), 0);
});

/* ---------- long tables ---------- */
const range = (n) => Array.from({ length: n }, (_, i) => i);
test('visibleRows: the first ROW_WINDOW (200) ids by default, the rest counted as hidden', () => {
  assert.equal(ROW_WINDOW, 200);
  const view = range(450).reverse();
  const out = visibleRows(view, ROW_WINDOW, null);
  assert.deepEqual(out.ids, view.slice(0, 200));
  assert.equal(out.hidden, 250);
});
test('visibleRows: the window grows by 200 and stops at the end of the view', () => {
  const view = range(450);
  assert.deepEqual([visibleRows(view, 400, null).ids.length, visibleRows(view, 400, null).hidden], [400, 50]);
  assert.deepEqual([visibleRows(view, 600, null).ids.length, visibleRows(view, 600, null).hidden], [450, 0]);
  assert.deepEqual(visibleRows([], 200, null), { ids: [], hidden: 0 });
});
test('visibleRows never cuts off the selected row', () => {
  const view = range(450).map((i) => (i * 7) % 450);
  const at = view.indexOf(300);
  assert.ok(at >= 200);
  const out = visibleRows(view, 200, 300);
  assert.deepEqual(out.ids, view.slice(0, at + 1));
  assert.equal(out.hidden, 450 - at - 1);
  assert.equal(out.ids[out.ids.length - 1], 300);
});
test('visibleRows: a selected row inside the window, or not in the view, leaves it as is', () => {
  const view = range(450);
  assert.equal(visibleRows(view, 200, 10).ids.length, 200);
  assert.equal(visibleRows(view, 200, 999).ids.length, 200);
  assert.equal(visibleRows(view, 200, 0).ids.length, 200);
});
test('viewKey: back to the first window when the sort, filters, search or run change', () => {
  const key = (o = {}) => viewKey(o.run || 'run_a', o.sortKey || 'priority', o.sortDir || 1, o.f || newFilters());
  const base = key();
  assert.equal(key(), base, 'the same view keeps its window (polling, decisions)');
  const withQ = newFilters(); withQ.q = 'acme';
  const withQSpaces = newFilters(); withQSpaces.q = '  acme ';
  const withChip = newFilters(); withChip.risk.add('Escalate');
  const withBin = newFilters(); withBin.bin = 4;
  for (const changed of [key({ run: 'run_b' }), key({ sortKey: 'name' }), key({ sortDir: -1 }), key({ f: withQ }), key({ f: withChip }), key({ f: withBin })]) {
    assert.notEqual(changed, base);
  }
  assert.equal(key({ f: withQSpaces }), key({ f: withQ }), 'the search is compared as computeIds reads it');
  const twoA = newFilters(); twoA.risk.add('Escalate'); twoA.risk.add('Contested');
  const twoB = newFilters(); twoB.risk.add('Contested'); twoB.risk.add('Escalate');
  assert.equal(key({ f: twoA }), key({ f: twoB }), 'chip order does not matter');
});

/* ---------- polling ---------- */
test('mergeChanges: landed rows replace theirs by index, steps follow the server, the rest keep their objects', () => {
  const rows = [row(0, result()), row(1, null, [], { step: 'Enrichment' }), row(2, null, [], { step: 'Classification' }), row(3, null), row(4, null)];
  const active = { run: { id: 'r', status: 'running' }, rows, cursor: 3 };
  const changes = {
    run: { id: 'r', status: 'running', counts: {} },
    steps: { 2: 'Validation', 4: 'Enrichment' },
    rows: [row(1, result({ verdict: 'general tech' }))],
    cursor: 4,
  };
  const out = mergeChanges(active, changes);
  assert.equal(out.active.run, changes.run);
  assert.equal(out.active.cursor, 4);
  assert.deepEqual(out.landed, [1]);
  assert.deepEqual(out.changed.slice().sort(), [1, 2, 4]);
  assert.equal(out.active.rows[1], changes.rows[0]);
  assert.equal(out.active.rows[2].step, 'Validation');
  assert.equal(out.active.rows[4].step, 'Enrichment');
  assert.equal(out.active.rows[0], rows[0]);
  assert.equal(out.active.rows[3], rows[3]);
  assert.equal(active.rows, rows, 'the open run is not changed');
  assert.equal(rows[2].step, 'Classification');
});
test('mergeChanges: a pending row absent from steps has no step; out-of-range rows are ignored', () => {
  const active = { run: {}, rows: [row(0, null, [], { step: 'Enrichment' })], cursor: 0 };
  const out = mergeChanges(active, { run: {}, steps: {}, rows: [row(5, result())], cursor: 1 });
  assert.equal(out.active.rows[0].step, null);
  assert.deepEqual([out.landed, out.changed], [[], [0]]);
});
test('mergeChanges: a retried error row that lands again counts as landed', () => {
  const active = { run: {}, rows: [row(0, errorResult())], cursor: 1 };
  const out = mergeChanges(active, { run: {}, steps: {}, rows: [row(0, result())], cursor: 2 });
  assert.deepEqual(out.landed, [0]);
  assert.equal(out.active.rows[0].result.error, false);
});

/* ---------- undo stack ---------- */
test('pushUndo and popUndo: last in, first out, without changing the stack given', () => {
  const a = { runId: 'run_a', index: 3, label: 'Confirmed A as deep tech' };
  const b = { runId: 'run_b', index: 0, label: 'Restored B' };
  const empty = [];
  const one = pushUndo(empty, a);
  const two = pushUndo(one, b);
  assert.deepEqual(empty, []);
  assert.deepEqual(one, [a]);
  assert.deepEqual(two, [a, b]);
  const first = popUndo(two);
  assert.equal(first.entry, b);
  assert.deepEqual(first.stack, [a]);
  assert.deepEqual(two, [a, b], 'the stack given is not changed');
  const second = popUndo(first.stack);
  assert.equal(second.entry, a);
  assert.deepEqual(second.stack, []);
});
test('popUndo on an empty stack returns null', () => {
  assert.equal(popUndo([]), null);
});

/* ---------- decision flow ---------- */
const NAME = 'A<b>&"Co';
const oddRow = (res, history = []) => row(0, res, history, { name: NAME });
test('decisionVerdict: confirm sends the pipeline verdict, change the other one', () => {
  const v = rowView(oddRow(result({ verdict: 'deep tech' })));
  assert.equal(decisionVerdict(v, 'confirm'), 'deep tech');
  assert.equal(decisionVerdict(v, 'change'), 'general tech');
});
test('editChoice: Change decision on a reclassified row reopens "change", which keeps the reviewer verdict', () => {
  const v = rowView(oddRow(result({ verdict: 'deep tech' }), [entry('change', 'general tech', 'why')]));
  assert.equal(editChoice(v), 'change');
  assert.equal(decisionVerdict(v, editChoice(v)), 'general tech');
  const c = rowView(oddRow(result({ verdict: 'deep tech', risk: 'Escalate' }), [entry('confirm', 'deep tech')]));
  assert.equal(editChoice(c), 'confirm');
  assert.equal(editChoice(rowView(oddRow(result()))), '');
});
test('changeChoice: X picks the verdict the row does not have now', () => {
  assert.equal(changeChoice(rowView(oddRow(result({ verdict: 'deep tech' })))), 'change');
  assert.equal(changeChoice(rowView(oddRow(result({ verdict: 'deep tech' }), [entry('change', 'general tech', 'n')]))), 'confirm');
});
test('recordToast: confirm, change with a note, change without one; the name is raw text', () => {
  const flagged = rowView(oddRow(result({ verdict: 'deep tech', risk: 'Escalate' })));
  assert.deepEqual(recordToast(flagged, 'confirm', '', 1), { title: 'Confirmed A<b>&"Co as deep tech', body: 'Approve · 1 undoable' });
  assert.deepEqual(recordToast(flagged, 'change', 'because', 2), { title: 'Changed A<b>&"Co to general tech', body: 'Reject · note saved · 2 undoable' });
  assert.deepEqual(recordToast(flagged, 'change', '', 3), { title: 'Changed A<b>&"Co to general tech', body: 'Reject · 3 undoable' });
  const re = rowView(oddRow(result({ verdict: 'deep tech' }), [entry('change', 'general tech', 'n')]));
  assert.equal(recordToast(re, 'confirm', '', 1).title, 'Changed A<b>&"Co to deep tech', 'back to the pipeline verdict is a change from the current one');
});
test('restoreToast: label, title and body; flagged rows go back to review', () => {
  const flagged = rowView(oddRow(result({ risk: 'Contested' }), [entry('confirm', 'deep tech')]));
  assert.deepEqual(restoreToast(flagged), { label: 'Restored A<b>&"Co', title: 'Restored pipeline verdict for A<b>&"Co', body: 'Back to Needs Review' });
  const clear = rowView(oddRow(result({ verdict: 'general tech' }), [entry('change', 'deep tech', 'n')]));
  assert.equal(restoreToast(clear).body, 'Reject');
});
test('undoToast: what was undone and how many more can be', () => {
  assert.deepEqual(undoToast('Restored A<b>&"Co', 0), { title: 'Undone: Restored A<b>&"Co', body: '' });
  assert.deepEqual(undoToast('x', 1), { title: 'Undone: x', body: '1 more action can be undone' });
  assert.deepEqual(undoToast('x', 2), { title: 'Undone: x', body: '2 more actions can be undone' });
});
test('decisionErrorPlace: the open form of that row in the open run, else a toast', () => {
  const base = { forms: { 'r:3': { open: true, choice: 'change', note: '' } }, runId: 'r', index: 3, activeRunId: 'r', selected: 3 };
  assert.equal(decisionErrorPlace(base), 'form');
  assert.equal(decisionErrorPlace(Object.assign({}, base, { selected: 4 })), 'toast');
  assert.equal(decisionErrorPlace(Object.assign({}, base, { activeRunId: 'other' })), 'toast');
  assert.equal(decisionErrorPlace(Object.assign({}, base, { forms: {} })), 'toast');
  assert.equal(decisionErrorPlace(Object.assign({}, base, { forms: { 'r:3': { open: false, choice: '', note: '' } } })), 'toast');
});
test('undoFailureKeeps: a 4xx answer drops the entry; a network error or 5xx keeps it', () => {
  const err = (status) => Object.assign(new Error('x'), { status });
  assert.equal(undoFailureKeeps(err(409)), false);
  assert.equal(undoFailureKeeps(err(404)), false);
  assert.equal(undoFailureKeeps(err(400)), false);
  assert.equal(undoFailureKeeps(err(500)), true);
  assert.equal(undoFailureKeeps(err(503)), true);
  assert.equal(undoFailureKeeps(new Error('Could not reach the server.')), true);
});
test('busyNotice: from 300 ms into the request, once', () => {
  assert.equal(busyNotice(1000, 1299, false), false);
  assert.equal(busyNotice(1000, 1300, false), true);
  assert.equal(busyNotice(1000, 5000, true), false);
});

/* ---------- new run setup: the rules behind the setup table ---------- */
const DEFAULTS = {
  provider: 'anthropic', tier: 'fast', model: '', enrichment: true, epo: true, validator: true, batch: true,
  validatorThreshold: 70, overrideMinConfidence: 65, epoAdjustMax: 15, lowEvidenceCap: 60,
  maxWebSearches: 3, enrichmentMaxSearches: 2, mapping: {},
};
const SETUP_INFO = {
  providers: [
    { id: 'anthropic', label: 'Anthropic', keyVar: 'ANTHROPIC_API_KEY', keySet: true, batch: true, tiers: { fast: 'model-a-fast', balanced: 'model-a-mid', best: 'model-a-best' } },
    { id: 'openai', label: 'OpenAI', keyVar: 'OPENAI_API_KEY', keySet: false, batch: false, tiers: { fast: 'model-o-fast', balanced: 'model-o-mid', best: 'model-o-best' } },
  ],
  defaults: DEFAULTS,
  pricedModels: ['model-a-fast', 'model-a-mid'],
};
const upload = (o = {}) => Object.assign({
  fileId: 'f'.repeat(32), name: 'list.xlsx', rows: 3,
  headers: ['Company', 'About', 'Sector', 'UEN', 'City'],
  mapping: { company_name: 'Company', description: 'About', domain: 'Sector', uen: 'UEN' },
  preview: [], table: [['Alpha', '', 'Bio', 'U1', 'SG'], ['Beta', 'Lasers', 'Optics', 'U2', ''], ['', 'x', 'y', 'U3', 'SG']],
  emptyCounts: { Company: 1, About: 1, Sector: 0, UEN: 0, City: 1 },
}, o);

test('SETUP_FIELDS: the setup table columns in order; only the company name is required', () => {
  assert.deepEqual(SETUP_FIELDS.map((f) => f.key), ['company_name', 'uen', 'domain', 'description']);
  assert.deepEqual(SETUP_FIELDS.filter((f) => f.required).map((f) => f.key), ['company_name']);
});
test('newDraft: a fresh draft takes copies of the defaults, no file and no rows left out', () => {
  const d = newDraft(SETUP_INFO, null);
  assert.deepEqual(d.cfg, DEFAULTS);
  assert.notEqual(d.cfg, DEFAULTS);
  assert.notEqual(d.cfg.mapping, DEFAULTS.mapping);
  assert.equal(d.file, null);
  assert.ok(d.excluded instanceof Set && d.excluded.size === 0);
  assert.equal(d.fromId, null);
  assert.equal(d.limit, ROW_WINDOW);
  assert.deepEqual([d.reading, d.error, d.est, d.estFailed, d.startError], ['', '', null, false, '']);
});
test('newDraft: "Same settings…" copies the run settings over the defaults, never sharing them', () => {
  const run = { id: 'run_1', settings: { provider: 'openai', tier: 'best', validatorThreshold: 50, mapping: { company_name: 'Name' } } };
  const d = newDraft(SETUP_INFO, run);
  assert.equal(d.fromId, 'run_1');
  assert.equal(d.cfg.provider, 'openai');
  assert.equal(d.cfg.tier, 'best');
  assert.equal(d.cfg.validatorThreshold, 50);
  assert.equal(d.cfg.lowEvidenceCap, 60);
  assert.deepEqual(d.cfg.mapping, { company_name: 'Name' });
  d.cfg.mapping.company_name = 'Other';
  assert.equal(run.settings.mapping.company_name, 'Name');
  assert.equal(d.file, null);
});
test('mappingForFile: a fresh draft takes the detected mapping', () => {
  const file = upload();
  const m = mappingForFile({ company_name: 'Old' }, file, false);
  assert.deepEqual(m, file.mapping);
  assert.notEqual(m, file.mapping);
});
test('mappingForFile: a kept mapping keeps present columns; absent ones are cleared and re-detected', () => {
  const file = upload({ mapping: { company_name: 'Company', domain: 'Sector' } });
  const m = mappingForFile({ company_name: 'City', description: 'Blurb', uen: 'UEN' }, file, true);
  // City is in the file: kept. Blurb is not: re-detected, and nothing was detected for it.
  // uen is kept; domain had no column: detected.
  assert.deepEqual(m, { company_name: 'City', description: '', domain: 'Sector', uen: 'UEN' });
});
test('mapState: Required, Skipped, Used twice, Detected, Changed', () => {
  const detected = { company_name: 'Company', description: 'About' };
  assert.equal(mapState({}, detected, 'company_name'), 'missing');
  assert.equal(mapState({ description: '' }, detected, 'description'), 'off');
  assert.equal(mapState({ company_name: 'About', description: 'About' }, detected, 'description'), 'dup');
  assert.equal(mapState({ company_name: 'About', description: 'About' }, detected, 'company_name'), 'dup');
  assert.equal(mapState({ company_name: 'Company' }, detected, 'company_name'), 'auto');
  assert.equal(mapState({ company_name: 'Sector' }, detected, 'company_name'), 'changed');
  assert.equal(mapState({ uen: 'UEN' }, detected, 'uen'), 'changed');
});
test('tickAllState: all, none or some of the file rows ticked', () => {
  assert.equal(tickAllState(3, new Set()), 'all');
  assert.equal(tickAllState(3, new Set([1])), 'some');
  assert.equal(tickAllState(3, new Set([0, 1, 2])), 'none');
  assert.equal(tickAllState(5000, new Set(Array.from({ length: 5000 }, (_, i) => i))), 'none');
});
test('excludeList: the left-out rows in ascending order, only rows of the file', () => {
  assert.deepEqual(excludeList(new Set([12, 2, 7]), 20), [2, 7, 12]);
  assert.deepEqual(excludeList(new Set([1, 5, -1]), 3), [1]);
  assert.deepEqual(excludeList(new Set(), 3), []);
});
test('tickedCount: rows not left out whose company name is not blank', () => {
  const draft = { file: upload(), cfg: { mapping: { company_name: 'Company' } }, excluded: new Set([0]) };
  assert.equal(tickedCount(draft), 1);
  draft.excluded = new Set();
  assert.equal(tickedCount(draft), 2);
});
test('estimateRows: the ticked companies, or 20 before a file is chosen', () => {
  assert.equal(estimateRows({ file: null, cfg: { mapping: {} }, excluded: new Set() }), 20);
  assert.equal(estimateRows({ file: upload(), cfg: { mapping: { company_name: 'Company' } }, excluded: new Set([1]) }), 1);
});
test('classifyLabel: count, cost and duration; unknown cost; nothing estimated yet', () => {
  const est = { known: true, cost: 0.4512, secs: 120 };
  assert.equal(classifyLabel(18, est), 'Classify 18 companies · ~US$0.45 · about 2 min');
  assert.equal(classifyLabel(1, { known: false, cost: null, secs: 18 }), 'Classify 1 company · cost unknown · about 18 s');
  assert.equal(classifyLabel(5, null), 'Classify 5 companies');
  assert.equal(classifyLabel(2000, { known: true, cost: 12, secs: 5400 }), 'Classify 2,000 companies · ~US$12.00 · about 1 h 30 min');
});
test('classifyLabel: a failed estimate says so instead of showing numbers', () => {
  assert.equal(classifyLabel(18, null, true), 'Classify 18 companies · estimate unavailable');
  assert.equal(classifyLabel(1, { known: true, cost: 1, secs: 60 }, true), 'Classify 1 company · estimate unavailable');
});
test('draftRailLine: the file and its ticked companies, or no file yet', () => {
  assert.equal(draftRailLine({ file: null, cfg: { mapping: {} }, excluded: new Set() }), 'No file yet');
  assert.equal(draftRailLine({ file: upload({ name: 'a<b>.xlsx' }), cfg: { mapping: { company_name: 'Company' } }, excluded: new Set([0]) }), 'a<b>.xlsx · 1 company');
  assert.equal(draftRailLine({ file: upload(), cfg: { mapping: { company_name: 'Company' } }, excluded: new Set() }), 'list.xlsx · 2 companies');
});
test('estimateNote: a rough estimate, naming the stand-in price when there is one', () => {
  assert.equal(estimateNote({ pricedAs: null }), 'Rough estimate.');
  assert.equal(estimateNote({ pricedAs: 'model-<v1>' }), 'Rough estimate; priced as model-<v1>; the run is priced by the version the API reports.');
});
test('unknownCostLine: why the cost is unknown, pinned or not; empty when known', () => {
  assert.equal(unknownCostLine({ known: true, pinned: false, model: 'm' }), '');
  assert.equal(unknownCostLine({ known: false, pinned: true, model: 'm' }), 'Pinned model is not priced in pipeline/models.py; token totals will be reported instead.');
  assert.equal(unknownCostLine({ known: false, pinned: false, model: 'm-latest' }), 'm-latest has no listed price; the cost is shown after the run if the API reports a priced version.');
});
test('extraColumns: headers no field reads, in file order', () => {
  assert.deepEqual(extraColumns(['Company', 'About', 'City', 'Funding'], { company_name: 'Company', description: 'About', uen: '' }), ['City', 'Funding']);
  assert.deepEqual(extraColumns(['A'], { company_name: 'A' }), []);
});
test('noDescriptionNote: wording depends on enrichment; empty when a description is mapped', () => {
  assert.equal(noDescriptionNote({ mapping: { description: 'About' }, enrichment: true, lowEvidenceCap: 60 }), '');
  assert.equal(noDescriptionNote({ mapping: {}, enrichment: true, lowEvidenceCap: 60 }), 'No description column: classification will rely on web enrichment.');
  assert.equal(noDescriptionNote({ mapping: { description: '' }, enrichment: false, lowEvidenceCap: 55 }), 'No description and enrichment is off: companies without patents are capped at 55 confidence.');
});
test('cellExample: the first non-blank cell of a column; empty when there is none', () => {
  const file = upload();
  assert.equal(cellExample(file, 'About'), 'Lasers');
  assert.equal(cellExample(file, 'Company'), 'Alpha');
  assert.equal(cellExample(upload({ table: [['', '  ', '', '', '']] }), 'About'), '');
  assert.equal(cellExample(file, 'Missing'), '');
});
test('modelFor: the pinned model, else the tier model of the provider from setup', () => {
  assert.equal(modelFor({ provider: 'openai', tier: 'best', model: '' }, SETUP_INFO), 'model-o-best');
  assert.equal(modelFor({ provider: 'openai', tier: 'best', model: '  pinned-1 ' }, SETUP_INFO), 'pinned-1');
  assert.equal(modelFor({ provider: 'nosuch', tier: 'best', model: '' }, SETUP_INFO), '');
});
test('isCustom: any setting but the tier and mapping differs from the defaults', () => {
  assert.equal(isCustom(Object.assign({}, DEFAULTS, { tier: 'best', mapping: { company_name: 'X' } }), DEFAULTS), false);
  assert.equal(isCustom(Object.assign({}, DEFAULTS, { validatorThreshold: 71 }), DEFAULTS), true);
  assert.equal(isCustom(Object.assign({}, DEFAULTS, { batch: false }), DEFAULTS), true);
  assert.equal(isCustom(Object.assign({}, DEFAULTS, { model: 'pinned' }), DEFAULTS), true);
});
test('settingValue: a typed number rounded and clamped to its bounds; otherwise the fallback', () => {
  assert.equal(settingValue('validatorThreshold', '150', 70), 100);
  assert.equal(settingValue('validatorThreshold', '-5', 70), 0);
  assert.equal(settingValue('epoAdjustMax', '40', 15), 30);
  assert.equal(settingValue('maxWebSearches', '12.6', 3), 10);
  assert.equal(settingValue('enrichmentMaxSearches', '2.4', 2), 2);
  assert.equal(settingValue('lowEvidenceCap', '', 60), 60);
  assert.equal(settingValue('lowEvidenceCap', 'abc', 60), 60);
  assert.equal(settingValue('overrideMinConfidence', '66', 65), 66);
});
test('pinUnpriced: a pinned model not in pricedModels; never when nothing is pinned', () => {
  assert.equal(pinUnpriced('', SETUP_INFO.pricedModels), false);
  assert.equal(pinUnpriced('   ', SETUP_INFO.pricedModels), false);
  assert.equal(pinUnpriced(' model-a-fast ', SETUP_INFO.pricedModels), false);
  assert.equal(pinUnpriced('model-x', SETUP_INFO.pricedModels), true);
});

/* ---------- command menu ---------- */
const CMD_FIXTURE = [
  { g: 'Navigate', l: 'Next row', k: ['J', '↓'], act: 'next' },
  { g: 'Navigate', l: 'Command menu', k: ['Ctrl', 'K'], menu: false, setup: true },
  { g: 'Decide', l: 'Record the decision (in the note)', k: ['Ctrl', '↵'], menu: false },
  { g: 'View', l: 'Keyboard shortcuts', k: ['?'], act: 'help', setup: true },
  { g: 'View', l: 'Reset the panel width', k: ['Double-click'], menu: false, act: 'reset-width' },
  { g: 'Run', l: 'New run: set it up in the table', k: ['O'], act: 'new-run', setup: true },
  { g: 'Run', l: 'Download Excel', k: ['D'], act: 'download' },
];
const PAL_RUNS = [
  { id: 'run_b', file: 'pilot.xlsx', sub: 'Today, 09:00 · Running · 3/10' },
  { id: 'run_a', file: 'companies.xlsx', sub: '2 Nov 2026 · 10 companies · all reviewed' },
];
const palCtx = (o = {}) => Object.assign({
  cmds: CMD_FIXTURE, runs: PAL_RUNS, activeId: 'run_a', setup: false,
  rows: [row(0, null, [], { name: 'Acme Robotics', uen: '201912345K', domain: 'Robotics' }), row(1, null, [], { name: 'Beta Foods', uen: '', domain: 'Food' })],
}, o);
const brief = (items) => items.map((it) => [it.g, it.l]);

test('paletteItems: menu actions, the width reset, every run, then every company of the open run', () => {
  const items = paletteItems('', palCtx());
  assert.deepEqual(brief(items), [
    ['Action', 'Next row'], ['Action', 'Keyboard shortcuts'], ['Action', 'New run: set it up in the table'], ['Action', 'Download Excel'],
    ['Action', 'Reset the evidence panel width'],
    ['Run', 'pilot.xlsx'], ['Run', 'companies.xlsx'],
    ['Company', 'Acme Robotics'], ['Company', 'Beta Foods'],
  ]);
  assert.deepEqual(items[0], { g: 'Action', l: 'Next row', keys: ['J', '↓'], act: 'next' });
  assert.deepEqual(items[4], { g: 'Action', l: 'Reset the evidence panel width', keys: [], act: 'reset-width' });
  assert.deepEqual(items[5], { g: 'Run', l: 'pilot.xlsx', sub: 'Today, 09:00 · Running · 3/10', keys: [], act: 'run', id: 'run_b' });
  assert.deepEqual(items[6].keys, ['current']);
  assert.deepEqual(items[7], { g: 'Company', l: 'Acme Robotics', sub: '201912345K · Robotics', hay: '201912345K Robotics', keys: [], act: 'company', id: 0 });
  assert.equal(items[8].sub, 'Food', 'a missing UEN leaves no stray separator');
});
test('paletteItems: while setting up, only setup actions and the runs; no run is current', () => {
  const items = paletteItems('', palCtx({ setup: true }));
  assert.deepEqual(brief(items), [
    ['Action', 'Keyboard shortcuts'], ['Action', 'New run: set it up in the table'],
    ['Run', 'pilot.xlsx'], ['Run', 'companies.xlsx'],
  ]);
  assert.ok(items.every((it) => !it.keys.includes('current')));
});
test('paletteItems: no open run lists no companies', () => {
  assert.equal(paletteItems('', palCtx({ rows: null, activeId: null })).filter((it) => it.g === 'Company').length, 0);
});
test('paletteItems: every search term must appear, in any case, in the group, label, sub or UEN and sector', () => {
  assert.deepEqual(brief(paletteItems('acme', palCtx())), [['Company', 'Acme Robotics']]);
  assert.deepEqual(brief(paletteItems('  201912345k  ', palCtx())), [['Company', 'Acme Robotics']]);
  assert.deepEqual(brief(paletteItems('robotics acme', palCtx())), [['Company', 'Acme Robotics']]);
  assert.deepEqual(brief(paletteItems('companies.xlsx', palCtx())), [['Run', 'companies.xlsx']]);
  assert.deepEqual(brief(paletteItems('run pilot', palCtx())), [['Run', 'pilot.xlsx']]);
  assert.deepEqual(brief(paletteItems('action download', palCtx())), [['Action', 'Download Excel']]);
  assert.deepEqual(paletteItems('acme zzz', palCtx()), []);
});

/* ---------- download ---------- */
test('exportName: the server workbook name, without the input extension or the run_ prefix', () => {
  assert.equal(exportName('companies.xlsx', 'run_20261113_101500_ab12'), 'companies_classified_20261113_101500_ab12.xlsx');
  assert.equal(exportName('Pilot List.CSV', 'run_x'), 'Pilot List_classified_x.xlsx');
  assert.equal(exportName('a.b.xls', 'run_x'), 'a.b_classified_x.xlsx');
});
test('downloadToast: a complete run saves the workbook with the review counts', () => {
  const k = { total: 10, done: 10, confirmed: 1, reclassified: 2, open: 3 };
  assert.deepEqual(downloadToast({ id: 'run_x', file: 'companies.xlsx', status: 'complete' }, k), {
    download: true, title: 'Saved companies_classified_x.xlsx', body: '1 verdict confirmed · 2 reclassified · 3 still need review',
  });
  assert.equal(downloadToast({ id: 'run_x', file: 'c.xlsx', status: 'complete' }, Object.assign({}, k, { confirmed: 2 })).body, '2 verdicts confirmed · 2 reclassified · 3 still need review');
});
test('downloadToast: a run that is not complete saves the partial workbook', () => {
  const k = { total: 10, done: 4, confirmed: 0, reclassified: 1, open: 2 };
  ['stopped', 'running', 'interrupted', 'failed'].forEach((status) => {
    assert.deepEqual(downloadToast({ id: 'run_x', file: 'companies.xlsx', status }, k), {
      download: true, title: 'Saved partial workbook companies_classified_x.xlsx', body: '4 of 10 companies · 0 verdicts confirmed · 1 reclassified · 2 still need review',
    });
  });
});
test('downloadToast: nothing to download before the first company finishes', () => {
  assert.deepEqual(downloadToast({ id: 'run_x', file: 'c.xlsx', status: 'running' }, { total: 10, done: 0, confirmed: 0, reclassified: 0, open: 0 }), {
    download: false, title: 'Nothing to download yet', body: 'The workbook is available once the first company finishes.',
  });
});

/* ---------- panel width and stored layout ---------- */
test('panelWidth: rounded, at least PANEL_MIN_W, at most maxW (never below the minimum)', () => {
  assert.equal(PANEL_MIN_W, 340);
  assert.deepEqual([panelWidth(500.4, 900), panelWidth(200, 900), panelWidth(1200, 900), panelWidth(500, 300)], [500, 340, 900, 340]);
});
test('parseUi: the stored width, reading view and collapsed sections', () => {
  assert.deepEqual(parseUi(JSON.stringify({ detailW: 520, reading: true, collapsed: { facts: false, history: true } })),
    { detailW: 520, reading: true, collapsed: { facts: false, history: true } });
});
test('parseUi: missing, unparsable or wrong-shaped values fall back to the defaults', () => {
  const def = { detailW: null, reading: false, collapsed: { facts: true } };
  [null, undefined, '', 'not json', '42', '"x"', 'null', '[]', '[1,2]'].forEach((raw) => assert.deepEqual(parseUi(raw), def, String(raw)));
  assert.deepEqual(parseUi(JSON.stringify({ detailW: 'wide', reading: 'yes', collapsed: [true] })), def);
  assert.deepEqual(parseUi(JSON.stringify({ detailW: -5 })), def);
  assert.deepEqual(parseUi('{"detailW": 1e999}'), def);
  assert.deepEqual(parseUi(JSON.stringify({ collapsed: { reasoning: true, facts: 'no', build: 1 } })), { detailW: null, reading: false, collapsed: { facts: true, reasoning: true } });
});
test('uiToStore: the persisted fields of the state, read back by parseUi', () => {
  const s = { detailW: 610, reading: true, collapsed: { facts: false }, modal: null, selected: 3 };
  assert.deepEqual(uiToStore(s), { detailW: 610, reading: true, collapsed: { facts: false } });
  assert.deepEqual(parseUi(JSON.stringify(uiToStore(s))), { detailW: 610, reading: true, collapsed: { facts: false } });
});

/* ---------- Task 14b: setup review items ---------- */
test('countOf: one company, many companies, with thousands separators', () => {
  assert.equal(countOf(1, 'company', 'companies'), '1 company');
  assert.equal(countOf(0, 'company', 'companies'), '0 companies');
  assert.equal(countOf(2000, 'row', 'rows'), '2,000 rows');
});
test('fileLine: rows, skipped and columns, singular for one', () => {
  const one = { rows: 1, headers: ['Company'], emptyCounts: { Company: 0 } };
  assert.equal(fileLine(one, { company_name: 'Company' }), '1 row · 0 skipped (empty name) · 1 column');
  const many = { rows: 1200, headers: ['Company', 'About'], emptyCounts: { Company: 3 } };
  assert.equal(fileLine(many, { company_name: 'Company' }), '1,200 rows · 3 skipped (empty name) · 2 columns');
});
test('draftRailLine and the Start label: a one-row file reads 1 company', () => {
  const file = { name: 'one.csv', rows: 1, headers: ['Company'], table: [['Solo Pte Ltd']], emptyCounts: { Company: 0 } };
  const draft = { file, cfg: { mapping: { company_name: 'Company' } }, excluded: new Set() };
  assert.equal(draftRailLine(draft), 'one.csv · 1 company');
  assert.equal(classifyLabel(tickedCount(draft), { known: true, cost: 0.03, secs: 18 }), 'Classify 1 company · ~US$0.03 · about 18 s');
});
test('durText: the duration without the leading ~', () => {
  assert.deepEqual([durText(40), durText(600), durText(5400), durText(7200), durText(0.2)], ['40 s', '10 min', '1 h 30 min', '2 h', '1 s']);
  [40, 600, 5400].forEach((s) => assert.equal(fmtDur(s), '~' + durText(s)));
});
test('noBatchText: the batch providers, or none available', () => {
  const ant = { id: 'anthropic', label: 'Anthropic', batch: true };
  const oai = { id: 'openai', label: 'OpenAI', batch: false };
  const gem = { id: 'gemini', label: 'Google Gemini', batch: false };
  assert.equal(noBatchText([ant, oai], oai), 'Only Anthropic supports batch jobs; OpenAI works one company at a time.');
  assert.equal(noBatchText([oai, gem], oai), 'Batch jobs are not available.');
  assert.equal(noBatchText([], oai), 'Batch jobs are not available.');
  assert.equal(noBatchText([ant, Object.assign({}, gem, { batch: true }), oai], oai), 'Only Anthropic and Google Gemini support batch jobs; OpenAI works one company at a time.');
});
test('startProblem: a file being read blocks the start, named on the button', () => {
  const draft = named([]);
  draft.reading = 'new<list>.xlsx';
  const p = startProblem(draft, SETUP);
  assert.equal(p.fix, 'reading');
  assert.equal(p.label, 'Reading new<list>.xlsx…');
  assert.equal(typeof p.text, 'string');
  const first = { cfg: { provider: 'openai', mapping: {} }, file: null, excluded: new Set(), reading: 'a.csv' };
  assert.equal(startProblem(first, SETUP).label, 'Reading a.csv…');
  draft.reading = '';
  assert.equal(startProblem(draft, SETUP), null);
});
test('tierPriceText: about US$x each, under a cent, or nothing without a price', () => {
  assert.equal(tierPriceText(0.029425), '~US$0.03 each');
  assert.equal(tierPriceText(0.1045), '~US$0.10 each');
  assert.equal(tierPriceText(1.5), '~US$1.50 each');
  assert.equal(tierPriceText(0.0031), 'under US$0.01 each');
  assert.equal(tierPriceText(null), '');
  assert.equal(tierPriceText(undefined), '');
});
test('startRequest: the exclude list sent and its count, unchanged by later ticks', () => {
  const draft = named([2, 0]);
  const req = startRequest(draft);
  assert.deepEqual(req, { exclude: [0, 2], n: 0 });
  const d2 = named([0]);
  const r2 = startRequest(d2);
  assert.deepEqual(r2, { exclude: [0], n: 1 }); // row 1 has a blank name
  d2.excluded.add(2); // ticked out while the request is in flight
  assert.deepEqual(r2, { exclude: [0], n: 1 });
  assert.deepEqual(startRequest(named([])), { exclude: [], n: 2 });
});

/* ---------- selection after a filter change ---------- */
test('keptSelection: a row still in view stays selected', () => {
  assert.equal(keptSelection(2, [3, 2, 4]), 2);
  assert.equal(keptSelection(0, [0]), 0);
});
test('keptSelection: a row the filters hide gives way to the first visible row', () => {
  assert.equal(keptSelection(1, [2]), 2);
  assert.equal(keptSelection(null, [4, 1]), 4);
});
test('keptSelection: an empty view selects nothing', () => {
  assert.equal(keptSelection(1, []), null);
  assert.equal(keptSelection(null, []), null);
});

/* ---------- Esc while setting up a new run ---------- */
const draftWith = (o) => Object.assign({ file: null, reading: '', starting: false }, o);
test('setupEscapeAction: an empty draft is discarded; there is nothing to lose', () => {
  assert.equal(setupEscapeAction(draftWith({})), 'discard');
});
test('setupEscapeAction: a draft with a file, or one still uploading, is parked', () => {
  assert.equal(setupEscapeAction(draftWith({ file: { name: 'a.xlsx' } })), 'park');
  assert.equal(setupEscapeAction(draftWith({ reading: 'a.xlsx' })), 'park');
});
test('setupEscapeAction: nothing while Start is in flight or without a draft', () => {
  assert.equal(setupEscapeAction(draftWith({ file: { name: 'a.xlsx' }, starting: true })), 'none');
  assert.equal(setupEscapeAction(null), 'none');
});
test('cancelHintsEsc: the Cancel button shows Esc only when Esc would also discard', () => {
  assert.equal(cancelHintsEsc(draftWith({})), true);
  assert.equal(cancelHintsEsc(draftWith({ file: { name: 'a.xlsx' } })), false);
});

/* ---------- decision form hint (#6) ---------- */
test('formHint: a missing note is a quiet instruction until Record is tried', () => {
  const clear = rowView(row(0, result({ risk: 'Clear' })));
  const quiet = formHint(clear, { choice: 'change', note: '' });
  assert.equal(quiet.tone, 'pending');
  assert.equal(quiet.text, 'Add a note to change a Clear verdict. It is written to the workbook.');
  const tried = formHint(clear, { choice: 'change', note: '', tried: true });
  assert.equal(tried.tone, 'error');
  assert.equal(tried.text, 'A note is required to overturn a Clear verdict. It is written to the workbook.');
});
test('formHint: no outcome yet is pending, then an error once tried', () => {
  const clear = rowView(row(0, result({ risk: 'Clear' })));
  assert.deepEqual(formHint(clear, { choice: '', note: '' }), { tone: 'pending', text: 'Choose an outcome.' });
  assert.deepEqual(formHint(clear, { choice: '', note: '', tried: true }), { tone: 'error', text: 'Choose an outcome.' });
});
test('formHint: a complete form is ok and has no problem text', () => {
  const clear = rowView(row(0, result({ risk: 'Clear' })));
  assert.deepEqual(formHint(clear, { choice: 'change', note: 'Has a lab.', tried: true }), { tone: 'ok', text: '' });
});

/* ---------- missing key wording (#8) ---------- */
test('missingKeyText: names the file and says to restart the app, not to ask an admin', () => {
  const t = missingKeyText('ANTHROPIC_API_KEY');
  assert.equal(t, 'Add ANTHROPIC_API_KEY to the .env file in the project folder, then restart the app (python serve.py).');
});
test('startProblem: a missing key uses the restart wording and offers another provider', () => {
  const draft = named([]);
  const setup = { providers: [{ id: 'openai', label: 'OpenAI', keyVar: 'OPENAI_API_KEY', keySet: false, batch: false }] };
  const p = startProblem(draft, setup);
  assert.equal(p.text, missingKeyText('OPENAI_API_KEY') + ' Or choose another provider in Analyst settings.');
  assert.doesNotMatch(p.text, /admin/);
});

/* ---------- setup row status (#5) ---------- */
test('setupRowStatus: nothing is queued before Start; only left-out rows say so', () => {
  assert.equal(setupRowStatus(false), '');
  assert.equal(setupRowStatus(true), 'Left out');
});

/* ---------- quick settings: patent lookup without EPO keys (#7) ---------- */
test('quickStepNote: patent lookup warns when the EPO keys are missing', () => {
  assert.deepEqual(quickStepNote('epo', { epoKeysSet: false }), { warn: true, text: 'EPO keys missing, so the run continues without patents.' });
  assert.equal(quickStepNote('epo', { epoKeysSet: true }), null);
  assert.equal(quickStepNote('enrichment', { epoKeysSet: false }), null);
});

/* ---------- batch mode on a run too small to batch (#3) ---------- */
test('batchSmallRunText: explains that a run under the threshold classifies directly', () => {
  assert.equal(batchSmallRunText(4, 100), 'Batch jobs start at 100 companies. This run has 4, so it runs directly and this setting changes nothing.');
  assert.equal(batchSmallRunText(1, 100), 'Batch jobs start at 100 companies. This run has 1, so it runs directly and this setting changes nothing.');
});
test('batchSmallRunText: null at or above the threshold, or before any company is ticked', () => {
  assert.equal(batchSmallRunText(100, 100), null);
  assert.equal(batchSmallRunText(5000, 100), null);
  assert.equal(batchSmallRunText(0, 100), null);
});
test('batchSmallRunText: formats large thresholds', () => {
  assert.equal(batchSmallRunText(12, 1500), 'Batch jobs start at 1,500 companies. This run has 12, so it runs directly and this setting changes nothing.');
});
