/* The left rail: the run list and the API key list. Ported from the
   prototype's renderRail and renderRailFoot. Runs created in this browser
   session (S.sessionRunIds) are listed under "This session", the rest under
   "Recent runs", newest first as GET /api/runs returns them. A new run
   being set up (S.draft) is listed above them as "New run · Not started",
   also while it is parked and another run is on screen; it is the current
   item only while its setup is shown. */
import { esc, counts, dateLabel, draftRailLine, countOf } from '../model.js';
import { S, setupShown } from '../store.js';
import { R, put, kbd, MOD } from './util.js';

/* A run's counts: the open run's from its rows (they include decisions made
   since the last poll), any other run's from its summary. */
function runCounts(run) {
  if (S.active && S.active.run.id === run.id) return counts(S.active.rows);
  return Object.assign({ total: run.total }, run.counts);
}

/* {dot, text, bar} of run's rail item (text is also the command menu's). */
export function railStatus(run) {
  const k = runCounts(run);
  const bar = k.total ? k.done / k.total : 0;
  const of = k.done + '/' + k.total;
  if (run.status === 'running') return { dot: 'is-running', text: 'Running · ' + of, bar };
  if (run.status === 'stopped') return { dot: 'is-stopped', text: 'Stopped · ' + of, bar };
  if (run.status === 'interrupted') return { dot: 'is-stopped', text: 'Interrupted · ' + of, bar };
  if (run.status === 'failed') return { dot: 'is-failed', text: 'Failed · ' + of, bar };
  return { dot: 'is-complete', text: countOf(k.total, 'company', 'companies') + ' · ' + (k.open ? k.open + ' to review' : 'all reviewed') };
}

/* The draft being set up, at the top of the rail. */
function draftItem() {
  return '<div class="wb-rail-h">Setting up</div><button class="wb-runitem" data-act="open-draft" data-fk="rail-draft" aria-current="' + setupShown() + '">' +
    '<span class="wb-runitem-f">New run</span>' +
    '<span class="wb-runitem-m"><span class="wb-dot is-draft"></span><span>Not started</span></span>' +
    '<span class="wb-runitem-d">' + esc(draftRailLine(S.draft)) + '</span></button>';
}

export function renderRail() {
  const now = new Date();
  // While a new run's setup is shown, no run is the current item: the draft
  // is. With no run open, the run being opened is (after Start).
  const activeId = setupShown() ? null : S.active ? S.active.run.id : S.opening;
  const item = (run) => {
    const st = railStatus(run);
    const sub = [dateLabel(run.createdAt, now), run.model].filter(Boolean).join(' · ');
    const barCls = st.dot === 'is-stopped' || st.dot === 'is-failed' ? st.dot : '';
    return '<button class="wb-runitem" data-act="open-run" data-id="' + esc(run.id) + '" data-fk="rail-' + esc(run.id) + '" aria-current="' + (run.id === activeId) + '">' +
      '<span class="wb-runitem-f">' + esc(run.file) + '</span>' +
      '<span class="wb-runitem-m"><span class="wb-dot ' + st.dot + '"></span><span class="wb-num">' + esc(st.text) + '</span></span>' +
      '<span class="wb-runitem-d">' + esc(sub) + '</span>' +
      (st.bar != null ? '<span class="wb-minibar ' + barCls + '"><span style="transform:scaleX(' + st.bar.toFixed(3) + ')"></span></span>' : '') +
      '</button>';
  };
  const fresh = S.runs.filter((r) => S.sessionRunIds.has(r.id));
  const older = S.runs.filter((r) => !S.sessionRunIds.has(r.id));
  let html = S.draft ? draftItem() : '';
  if (fresh.length) html += '<div class="wb-rail-h">This session</div>' + fresh.map(item).join('');
  if (older.length) html += '<div class="wb-rail-h">Recent runs</div>' + older.map(item).join('');
  put(R('rail'), html);
}

/* The API keys from GET /api/setup (never their values) and the help and
   command menu buttons. */
export function renderRailFoot() {
  const setup = S.setup;
  const keyState = (set) => (set ? '<span class="wb-keyok">key set</span>' : '<span class="wb-keymiss">no key</span>');
  const keys = setup
    ? setup.providers.map((p) => '<div class="wb-keyrow"><span>' + esc(p.label) + '</span>' + keyState(p.keySet) + '</div>').join('') +
      '<div class="wb-keyrow"><span>EPO patents</span>' + keyState(setup.epoKeysSet) + '</div>'
    : '';
  R('railfoot').innerHTML = '<div class="wb-keys-h">API keys (.env)</div>' + keys +
    '<div class="wb-foot-btns"><button class="wb-btn wb-btn-sm" data-act="help" data-fk="foot-help">Shortcuts ' + kbd('?') + '</button>' +
    '<button class="wb-btn wb-btn-sm" data-act="palette" data-fk="foot-palette"><span class="wb-foot-l">Command menu</span><span class="wb-foot-s">Commands</span> <span>' + kbd(MOD, 'K') + '</span></button></div>';
}
