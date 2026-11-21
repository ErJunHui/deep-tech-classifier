/* The live workbench's DOM-free parts: the state store, the poll scheduler,
   which notice the table shows without an open run, the counter formats, the
   API error text and the error row's cost cell. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, resumable, tableNotice, setupShown } from '../js/store.js';
import { createPoller } from '../js/state.js';
import { fmtCounter } from '../js/render/counter.js';
import { detailText } from '../js/api.js';
import { rowHtml } from '../js/render/table.js';

/* ---------- store ---------- */
test('store.js loads under Node without a DOM and holds S and resumable', () => {
  assert.equal(typeof document, 'undefined');
  assert.equal(S.active, null);
  assert.equal(S.sortKey, 'priority');
  assert.equal(resumable({ status: 'failed' }), true);
  assert.equal(resumable({ status: 'complete', counts: { errors: 1 } }), true);
  assert.equal(resumable({ status: 'complete', counts: { errors: 0 } }), false);
});
test('state.js re-exports the same S and resumable', async () => {
  const state = await import('../js/state.js');
  assert.equal(state.S, S);
  assert.equal(state.resumable, resumable);
});

/* ---------- new run setup on screen ---------- */
test('setupShown: only when a draft exists and setup is on screen; a parked draft is not', () => {
  assert.equal(S.showSetup, false);
  assert.equal(setupShown({ draft: null, showSetup: false }), false);
  assert.equal(setupShown({ draft: {}, showSetup: true }), true);
  assert.equal(setupShown({ draft: {}, showSetup: false }), false); // parked in the rail
  assert.equal(setupShown({ draft: null, showSetup: true }), false);
  assert.equal(setupShown(), false); // defaults to S
});

/* ---------- table notice without an open run ---------- */
const st = (o) => Object.assign({ active: null, runs: [], listLoaded: false, openError: null }, o);
test('tableNotice: "No runs yet" only when the run list was loaded and is empty', () => {
  assert.deepEqual(tableNotice(st({ listLoaded: true })), { kind: 'empty' });
  assert.deepEqual(tableNotice(st({ listLoaded: false })), { kind: 'offline' });
});
test('tableNotice: a run that failed to open shows the server message', () => {
  const runs = [{ id: 'run_a' }];
  assert.deepEqual(tableNotice(st({ listLoaded: true, runs, openError: { id: 'run_a', message: 'No such run.' } })), { kind: 'open-failed', message: 'No such run.' });
});
test('tableNotice: nothing while a run is open or still opening', () => {
  assert.equal(tableNotice(st({ listLoaded: true, runs: [{ id: 'a' }], active: { run: { id: 'a' } } })), null);
  assert.equal(tableNotice(st({ listLoaded: true, runs: [{ id: 'a' }] })), null);
});
test('tableNotice: a run being opened with none open shows the opening notice', () => {
  assert.deepEqual(tableNotice(st({ listLoaded: true, runs: [{ id: 'a' }], opening: 'a' })), { kind: 'opening' });
  // An open run wins: the opening notice shows only while no run is open.
  assert.equal(tableNotice(st({ listLoaded: true, runs: [{ id: 'a' }], active: { run: { id: 'b' } }, opening: 'a' })), null);
});

/* ---------- poll scheduler ---------- */
/* A fake clock: schedule records callbacks; fire runs the next one. */
function fakeClock() {
  const timers = new Map(); let n = 0;
  return {
    schedule: (fn, ms) => { const id = ++n; timers.set(id, { fn, ms }); return id; },
    cancel: (id) => { timers.delete(id); },
    pending: () => [...timers.values()].map((t) => t.ms),
    fire() { const [id, t] = timers.entries().next().value; timers.delete(id); t.fn(); },
  };
}
const flush = () => new Promise((r) => setImmediate(r));
function gate() { let open; const p = new Promise((r) => { open = r; }); return { p, open }; }

test('createPoller: start schedules one tick after the interval', () => {
  const c = fakeClock();
  const p = createPoller(async () => {}, { interval: 1000, schedule: c.schedule, cancel: c.cancel });
  p.start(); p.start();
  assert.deepEqual(c.pending(), [1000]);
});
test('createPoller: soon() while idle replaces the pending tick with an immediate one', () => {
  const c = fakeClock();
  const p = createPoller(async () => {}, { interval: 1000, schedule: c.schedule, cancel: c.cancel });
  p.start(); p.soon();
  assert.deepEqual(c.pending(), [0]);
});
test('createPoller: at most one tick in flight; soon() during a tick makes its follow-up immediate', async () => {
  const c = fakeClock();
  let inFlight = 0; let most = 0; let calls = 0; const g = gate();
  const p = createPoller(async () => {
    calls++; inFlight++; most = Math.max(most, inFlight);
    if (calls === 1) await g.p;
    inFlight--;
  }, { interval: 1000, schedule: c.schedule, cancel: c.cancel });
  p.start(); c.fire();
  assert.deepEqual(c.pending(), [], 'nothing scheduled while the tick is in flight');
  p.soon(); p.soon();
  assert.deepEqual(c.pending(), [], 'soon() during a tick does not start another');
  g.open(); await flush();
  assert.deepEqual(c.pending(), [0], 'the follow-up runs immediately');
  c.fire(); await flush();
  assert.deepEqual(c.pending(), [1000], 'then back to the interval');
  assert.equal(most, 1);
  assert.equal(calls, 2);
});
test('createPoller: a response requested before soon() is not fresh; one requested after is', async () => {
  const c = fakeClock();
  const seen = []; const g = gate(); let calls = 0;
  const p = createPoller(async (fresh) => {
    calls++;
    if (calls === 1) await g.p;
    seen.push(fresh());
  }, { interval: 1000, schedule: c.schedule, cancel: c.cancel });
  p.start(); c.fire();
  p.soon(); // a Stop or Resume completed while the first request was out
  g.open(); await flush();
  c.fire(); await flush();
  assert.deepEqual(seen, [false, true]);
});
test('createPoller: a step that throws still schedules the next tick', async () => {
  const c = fakeClock();
  const p = createPoller(async () => { throw new Error('boom'); }, { interval: 1000, schedule: c.schedule, cancel: c.cancel });
  p.start(); c.fire(); await flush();
  assert.deepEqual(c.pending(), [1000]);
});

/* ---------- counters ---------- */
test('fmtCounter: whole numbers with thousands separators', () => {
  assert.deepEqual([0, 999, 5000, 1234567].map((n) => fmtCounter(n, 'int')), ['0', '999', '5,000', '1,234,567']);
});
test('fmtCounter: cost in US dollars with 2 decimals', () => {
  assert.deepEqual([4.31, 0, 1234.5].map((n) => fmtCounter(n, 'usd')), ['US$4.31', 'US$0.00', 'US$1,234.50']);
});

/* ---------- API error text ---------- */
test('detailText: the server detail string', () => assert.equal(detailText({ detail: 'No such run.' }, 404), 'No such run.'));
test('detailText: a FastAPI validation list joins its messages', () => {
  assert.equal(detailText({ detail: [{ msg: 'field required' }, { msg: 'value is not an integer' }] }, 422), 'field required value is not an integer');
});
test('detailText: no detail, or a body that was not JSON, gives the fallback', () => {
  assert.equal(detailText({}, 500), 'The server answered with an error (500).');
  assert.equal(detailText(null, 502), 'The server answered with an error (502).');
});

/* ---------- table row status ---------- */
const crit = (i, s, p) => ({ innovation: { met: i }, scientific_foundation: { met: s }, proprietary_ip: { met: p } });
const resRow = (result, history) => ({ index: 0, name: 'Acme', uen: '', domain: 'Sector', description: '', step: null, history: history || [], result });
const scored = (o) => Object.assign({ verdict: 'general tech', conf: 82, risk: 'Clear', criteria: crit(true, false, false), patents: { status: 'success', count: 2 }, cost: 0.01 }, o);
const withRun = (fn) => {
  S.active = { run: { id: 'r', status: 'complete', settings: { validatorThreshold: 70 } }, rows: [], cursor: 0 };
  try { fn(); } finally { S.active = null; }
};
test('rowHtml: an error row says Error in the status, with dashes for confidence and criteria', () => withRun(() => {
  const html = rowHtml(resRow({ error: true, errorMessage: 'boom', verdict: 'error', conf: 0, risk: 'Escalate', criteria: {}, patents: null, cost: 0.01 }), 0);
  assert.match(html, /wb-st is-error" title="boom"/);
  assert.equal((html.match(/>—</g) || []).length, 3);
  assert.doesNotMatch(html, /\$/, 'cost is not a table column');
}));
test('rowHtml: only an open flagged row carries the attention marker, with its risk', () => withRun(() => {
  const open = rowHtml(resRow(scored({ risk: 'Contested', conf: 55 })), 0);
  assert.match(open, /wb-st-flag[^>]*><span class="wb-st-q">Contested</);
  assert.match(open, /wb-confn is-low/);
  const clear = rowHtml(resRow(scored({})), 0);
  assert.doesNotMatch(clear, /wb-st-flag|wb-st-note|is-low/);
  assert.match(clear, />1\/3</);
}));
test('rowHtml: a decided row shows a muted note instead of the marker', () => withRun(() => {
  const confirmed = rowHtml(resRow(scored({ risk: 'Escalate' }), [{ type: 'decision', verdict: 'general tech', at: '2026-11-16T21:44:00' }]), 0);
  assert.doesNotMatch(confirmed, /wb-st-flag/);
  assert.match(confirmed, /wb-st-note[^>]*>Reviewed</);
  const reclass = rowHtml(resRow(scored({ risk: 'Escalate' }), [{ type: 'decision', verdict: 'deep tech', at: '2026-11-16T21:44:00' }]), 0);
  assert.match(reclass, /wb-st is-deep/);
  assert.match(reclass, /wb-st-note[^>]*>was general</);
  assert.match(reclass, /wb-confn is-muted/);
}));

/* ---------- API errors carry the HTTP status ---------- */
test('api: a non-2xx answer rejects with the server detail and its status; a network failure has none', async () => {
  const api = await import('../js/api.js');
  const real = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'This row has nothing to undo.' }), { status: 409 });
    await assert.rejects(api.undoDecision('r', 0), (e) => e.message === 'This row has nothing to undo.' && e.status === 409);
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(api.undoDecision('r', 0), (e) => e.message === 'Could not reach the server.' && e.status === undefined);
  } finally {
    globalThis.fetch = real;
  }
});

/* ---------- toast text ---------- */
test('toastHtml escapes the title and body once: decision toasts pass raw text', async () => {
  const { toastHtml } = await import('../js/render/toast.js');
  const { recordToast, rowView } = await import('../js/model.js');
  const v = rowView({ index: 0, name: 'A<b>&"Co', uen: '', domain: '', description: '', step: null, history: [],
    result: { error: false, verdict: 'deep tech', risk: 'Escalate', conf: 58 } });
  const t = recordToast(v, 'confirm', '', 1);
  const html = toastHtml(t.title, t.body, { undo: true });
  assert.match(html, /<b>Confirmed A&lt;b&gt;&amp;&quot;Co as deep tech<\/b>/);
  assert.doesNotMatch(html, /&amp;lt;|A<b>&/);
  assert.match(html, /<span>Approve · 1 undoable<\/span>/);
  assert.match(html, /data-act="undo"/);
});
