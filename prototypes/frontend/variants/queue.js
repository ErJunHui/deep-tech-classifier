/* Variant "Review Queue" (slug: queue).
   The human decision is the product: the app opens on the queue of companies
   the pipeline could not settle, one case file at a time, keyboard-first.
   Runs happen in the background as a slim status bar. */
(function () {
  window.PROTO_VARIANTS = window.PROTO_VARIANTS || {};

  const css = `
.v-queue {
  --q-rail: 248px;
  --q-panel: 320px;
  height: 100%;
  display: grid;
  grid-template-rows: auto 1fr;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  position: relative;
  overflow: hidden;
}
.v-queue *:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.v-queue button { cursor: pointer; }
.v-queue button:disabled { cursor: not-allowed; }
.v-queue [hidden] { display: none !important; }

/* ---------- top bar + run status ---------- */
.v-queue .q-top {
  position: relative;
  display: flex; align-items: center; gap: 20px;
  height: 56px; padding: 0 20px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.v-queue .q-brand { font-weight: 650; font-size: 14px; letter-spacing: -0.01em; white-space: nowrap; display: flex; align-items: center; gap: 8px; }
.v-queue .q-brand-mark { width: 18px; height: 18px; border-radius: 5px; background: var(--text); position: relative; }
.v-queue .q-brand-mark::after { content: ""; position: absolute; inset: 5px; border-radius: 2px; background: var(--surface); }
.v-queue .q-status { flex: 1; min-width: 0; display: flex; align-items: center; gap: 16px; }
.v-queue .q-run { display: flex; align-items: center; gap: 10px; min-width: 0; }
.v-queue .q-run-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-3); flex: none; }
.v-queue .q-run-dot.is-running { background: var(--accent); animation: queue-pulse 1.1s ease-in-out infinite alternate; }
.v-queue .q-run-dot.is-done { background: var(--deep); }
.v-queue .q-run-dot.is-stopped { background: var(--contested); }
@keyframes queue-pulse { from { opacity: 1; } to { opacity: .35; } }
.v-queue .q-run-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
.v-queue .q-run-text strong { font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.v-queue .q-run-text span { font-size: 12px; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.v-queue .q-counts { display: flex; align-items: center; gap: 12px; font-size: 12.5px; color: var(--text-2); white-space: nowrap; margin-left: auto; font-variant-numeric: tabular-nums; }
.v-queue .q-count b { color: var(--text); font-weight: 600; }
.v-queue .q-count::before { content: ""; display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; vertical-align: 1px; }
.v-queue .q-count-deep::before { background: var(--deep); }
.v-queue .q-count-general::before { background: var(--general); }
.v-queue .q-count-review::before { background: var(--escalate); }
.v-queue .q-cost { font-size: 12.5px; color: var(--text-2); white-space: nowrap; font-variant-numeric: tabular-nums; }
.v-queue .q-top-actions { display: flex; gap: 8px; flex: none; }
.v-queue .q-progress { position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; overflow: hidden; }
.v-queue .q-progress span { display: block; height: 100%; background: var(--accent); transform-origin: left center; transform: scaleX(0); transition: transform 240ms var(--ease-out), opacity 240ms var(--ease-out); }
.v-queue .q-progress.is-idle span { opacity: 0; }

/* ---------- buttons ---------- */
.v-queue .q-btn {
  display: inline-flex; align-items: center; gap: 8px;
  height: 32px; padding: 0 12px;
  border: 1px solid var(--border-strong); border-radius: var(--radius-s);
  background: var(--surface); color: var(--text);
  font-size: 13px; font-weight: 500; white-space: nowrap;
  transition: background-color 120ms ease-out, transform 100ms var(--ease-out);
}
.v-queue .q-btn:hover:not(:disabled) { background: var(--surface-2); }
.v-queue .q-btn:active:not(:disabled) { transform: scale(0.97); }
.v-queue .q-btn:disabled { opacity: .45; }
.v-queue .q-btn-primary { background: var(--text); border-color: var(--text); color: var(--surface); }
.v-queue .q-btn-primary:hover:not(:disabled) { background: #33332f; }
.v-queue .q-btn-quiet { border-color: transparent; background: transparent; color: var(--text-2); }
.v-queue .q-btn-quiet:hover:not(:disabled) { background: var(--surface-2); color: var(--text); }
.v-queue .q-btn-sm { height: 28px; padding: 0 10px; font-size: 12.5px; }
.v-queue .q-kbd {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 20px; height: 20px; padding: 0 5px;
  border: 1px solid var(--border-strong); border-bottom-width: 2px; border-radius: 4px;
  font: 600 11px/1 var(--mono); color: var(--text-2); background: var(--surface);
}
.v-queue .q-btn-primary .q-kbd { background: transparent; color: rgba(255,255,255,.75); border-color: rgba(255,255,255,.3); }

/* ---------- body grid ---------- */
.v-queue .q-body { display: grid; grid-template-columns: var(--q-rail) minmax(0, 1fr) var(--q-panel); min-height: 0; }
.v-queue .q-body.is-wide { grid-template-columns: var(--q-rail) minmax(0, 1fr); }

/* ---------- rail ---------- */
.v-queue .q-rail { border-right: 1px solid var(--border); overflow-y: auto; padding: 16px 10px 96px; }
.v-queue .q-rail-head { display: flex; align-items: baseline; justify-content: space-between; padding: 4px 8px 8px; }
.v-queue .q-rail-head h2 { margin: 0; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--text-2); }
.v-queue .q-rail-head span { font-size: 12px; color: var(--text-3); font-variant-numeric: tabular-nums; }
.v-queue .q-rail-empty { padding: 6px 8px 12px; font-size: 12.5px; color: var(--text-3); }
.v-queue .q-item {
  display: flex; flex-direction: column; gap: 3px; width: 100%;
  padding: 8px 10px; border: 0; border-radius: var(--radius-s);
  background: transparent; text-align: left;
  transition: background-color 120ms ease-out;
}
.v-queue .q-item:hover { background: var(--surface-2); }
.v-queue .q-item:active { background: var(--general-soft); }
.v-queue .q-item[aria-current="true"] { background: var(--surface); box-shadow: 0 0 0 1px var(--border-strong), var(--shadow-1); }
.v-queue .q-item-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.v-queue .q-item-meta { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-3); }
.v-queue .q-item.is-done .q-item-name { color: var(--text-2); }
.v-queue .q-item-new { animation: queue-arrive 220ms var(--ease-out) both; }
@keyframes queue-arrive { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
.v-queue .q-rail-sep { height: 1px; background: var(--border); margin: 14px 8px; }
.v-queue .q-disclose {
  display: flex; align-items: center; justify-content: space-between; width: 100%;
  padding: 6px 8px; border: 0; border-radius: var(--radius-s); background: transparent;
  font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--text-2);
}
.v-queue .q-disclose:hover { background: var(--surface-2); }
.v-queue .q-disclose-caret { transition: transform 160ms var(--ease-out); font-size: 10px; }
.v-queue .q-disclose[aria-expanded="true"] .q-disclose-caret { transform: rotate(90deg); }
.v-queue .q-rail-sub { padding: 10px 8px 4px; font-size: 11.5px; color: var(--text-3); }
.v-queue .q-item-conf { margin-left: auto; font-variant-numeric: tabular-nums; }

/* ---------- chips ---------- */
.v-queue .q-chip { display: inline-flex; align-items: center; height: 20px; padding: 0 7px; border-radius: 999px; font-size: 11.5px; font-weight: 600; white-space: nowrap; }
.v-queue .q-chip-Escalate { background: var(--escalate-soft); color: var(--escalate); }
.v-queue .q-chip-Contested { background: var(--contested-soft); color: var(--contested); }
.v-queue .q-chip-Uncertain { background: var(--uncertain-soft); color: var(--uncertain); }
.v-queue .q-chip-Clear { background: var(--surface-2); color: var(--text-2); }
.v-queue .q-chip-skip { background: var(--surface-2); color: var(--text-2); }
.v-queue .q-verdict-deep { color: var(--deep); font-weight: 600; }
.v-queue .q-verdict-general { color: var(--general); font-weight: 600; }

/* ---------- case file ---------- */
.v-queue .q-main { overflow-y: auto; min-width: 0; }
.v-queue .q-case { max-width: 820px; margin: 0 auto; padding: 28px 36px 120px; }
.v-queue .q-enter { animation: queue-in 160ms var(--ease-out) both; }
@keyframes queue-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.v-queue .q-case-top { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: var(--text-2); }
.v-queue .q-pos { font-variant-numeric: tabular-nums; }
.v-queue .q-question { margin: 12px 0 6px; font-size: 26px; line-height: 1.2; font-weight: 650; letter-spacing: -0.02em; text-wrap: balance; }
.v-queue .q-lede { margin: 0; font-size: 16px; color: var(--text-2); max-width: 62ch; }
.v-queue .q-lede strong { color: var(--text); font-weight: 600; }
.v-queue .q-meta { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12.5px; color: var(--text-3); }
.v-queue .q-meta code { font-family: var(--mono); font-size: 12px; }
.v-queue .q-why {
  margin-top: 20px; padding: 14px 16px; border-radius: var(--radius-m);
  border: 1px solid var(--border); background: var(--surface);
  display: grid; grid-template-columns: 4px 1fr; gap: 0 14px;
}
.v-queue .q-why::before { content: ""; border-radius: 2px; background: var(--q-tone, var(--text-3)); }
.v-queue .q-why h2 { margin: 0 0 4px; font-size: 13px; font-weight: 600; }
.v-queue .q-why p { margin: 0; color: var(--text-2); }
.v-queue .q-why p + p { margin-top: 6px; }
.v-queue .q-tone-Escalate { --q-tone: var(--escalate); }
.v-queue .q-tone-Contested { --q-tone: var(--contested); }
.v-queue .q-tone-Uncertain { --q-tone: var(--uncertain); }
.v-queue .q-tone-Clear { --q-tone: var(--deep); }
.v-queue .q-sec { margin-top: 28px; }
.v-queue .q-sec > h2 { margin: 0 0 10px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--text-2); }
.v-queue .q-desc { margin: 0; font-size: 14.5px; max-width: 68ch; }
.v-queue .q-desc-src { margin-top: 6px; font-size: 12.5px; color: var(--text-3); }
.v-queue .q-desc-src q { color: var(--text-2); }
.v-queue .q-weigh { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.v-queue .q-col { border: 1px solid var(--border); border-radius: var(--radius-m); background: var(--surface); padding: 12px 14px; }
.v-queue .q-col h3 { margin: 0 0 8px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.v-queue .q-col h3::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--deep); }
.v-queue .q-col-against h3::before { background: var(--general); }
.v-queue .q-col ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
.v-queue .q-col li { font-size: 13px; color: var(--text-2); }
.v-queue .q-col li b { display: block; font-size: 11.5px; font-weight: 600; color: var(--text-3); text-transform: uppercase; letter-spacing: .04em; }
.v-queue .q-col .q-none { color: var(--text-3); font-style: italic; }
.v-queue .q-open { margin-top: 12px; padding: 10px 14px; border-radius: var(--radius-m); background: var(--surface-2); font-size: 13px; color: var(--text-2); }
.v-queue .q-open b { color: var(--text); font-weight: 600; }
.v-queue .q-criteria { display: grid; gap: 1px; border: 1px solid var(--border); border-radius: var(--radius-m); overflow: hidden; background: var(--border); }
.v-queue .q-crit { display: grid; grid-template-columns: 170px 1fr; gap: 14px; padding: 12px 14px; background: var(--surface); }
.v-queue .q-crit-name { font-weight: 600; font-size: 13px; }
.v-queue .q-crit-met { display: block; margin-top: 2px; font-size: 12px; font-weight: 500; }
.v-queue .q-crit-met.is-met { color: var(--deep); }
.v-queue .q-crit-met.is-not { color: var(--text-3); }
.v-queue .q-crit p { margin: 0; font-size: 13.5px; color: var(--text-2); }
.v-queue .q-two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.v-queue .q-card { border: 1px solid var(--border); border-radius: var(--radius-m); background: var(--surface); padding: 14px; font-size: 13px; }
.v-queue .q-card h3 { margin: 0 0 8px; font-size: 13px; font-weight: 600; }
.v-queue .q-card p { margin: 0; color: var(--text-2); }
.v-queue .q-card p + p, .v-queue .q-card p + ul, .v-queue .q-card ul + p { margin-top: 8px; }
.v-queue .q-kv { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-bottom: 8px; color: var(--text-2); }
.v-queue .q-kv b { color: var(--text); font-weight: 600; }
.v-queue .q-cpc { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; }
.v-queue .q-cpc li { display: flex; gap: 10px; color: var(--text-2); }
.v-queue .q-cpc code { font-family: var(--mono); font-size: 12px; color: var(--text); background: var(--surface-2); padding: 1px 6px; border-radius: 4px; flex: none; }
.v-queue .q-sources { margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 3px; }
.v-queue .q-sources li { font-family: var(--mono); font-size: 12px; color: var(--text-2); overflow-wrap: anywhere; }
.v-queue .q-sources li::before { content: "\\2197"; margin-right: 6px; color: var(--text-3); font-family: var(--font); }
.v-queue .q-build { border: 1px solid var(--border); border-radius: var(--radius-m); background: var(--surface); padding: 6px 14px; }
.v-queue .q-build-row { display: grid; grid-template-columns: 1fr 64px; gap: 14px; padding: 8px 0; border-bottom: 1px solid var(--border); }
.v-queue .q-build-row:last-child { border-bottom: 0; }
.v-queue .q-build-row span { font-size: 13px; }
.v-queue .q-build-row small { display: block; font-size: 12px; color: var(--text-3); }
.v-queue .q-build-row output { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; font-size: 14px; }
.v-queue .q-build-row.is-final span, .v-queue .q-build-row.is-final output { font-weight: 650; }
.v-queue .q-meter { height: 6px; border-radius: 3px; background: var(--surface-2); margin-top: 6px; overflow: hidden; }
.v-queue .q-meter i { display: block; height: 100%; background: var(--text-2); border-radius: 3px; transform-origin: left center; }

/* ---------- decision panel ---------- */
.v-queue .q-panel { border-left: 1px solid var(--border); background: var(--surface); overflow-y: auto; padding: 24px 20px 96px; display: flex; flex-direction: column; gap: 16px; }
.v-queue .q-panel-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--text-2); margin: 0; }
.v-queue .q-panel-says { font-size: 13px; color: var(--text-2); margin: -8px 0 0; }
.v-queue .q-decide { display: grid; gap: 8px; }
.v-queue .q-dbtn {
  display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 2px 10px;
  width: 100%; min-height: 60px; padding: 10px 14px;
  border: 1px solid var(--border-strong); border-radius: var(--radius-m);
  background: var(--surface); text-align: left;
  transition: background-color 120ms ease-out, border-color 120ms ease-out, transform 100ms var(--ease-out);
}
.v-queue .q-dbtn:hover:not(:disabled) { background: var(--surface-2); }
.v-queue .q-dbtn:active:not(:disabled) { transform: scale(0.98); }
.v-queue .q-dbtn-title { font-size: 15px; font-weight: 600; }
.v-queue .q-dbtn-sub { grid-column: 1; font-size: 12px; color: var(--text-3); }
.v-queue .q-dbtn .q-kbd { grid-row: 1 / span 2; grid-column: 2; min-width: 24px; height: 24px; font-size: 12px; }
.v-queue .q-dbtn-deep .q-dbtn-title { color: var(--deep); }
.v-queue .q-dbtn-deep[aria-pressed="true"] { background: var(--deep-soft); border-color: var(--deep); }
.v-queue .q-dbtn-general[aria-pressed="true"] { background: var(--general-soft); border-color: var(--general); }
.v-queue .q-dbtn-skip { min-height: 44px; }
.v-queue .q-dbtn-skip .q-dbtn-title { font-size: 13.5px; font-weight: 500; color: var(--text-2); }
.v-queue .q-dbtn-skip[aria-pressed="true"] { background: var(--surface-2); }
.v-queue .q-decided { padding: 10px 12px; border-radius: var(--radius-s); background: var(--surface-2); font-size: 13px; color: var(--text-2); }
.v-queue .q-decided strong { color: var(--text); }
.v-queue .q-note label { display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 500; margin-bottom: 6px; }
.v-queue .q-note textarea {
  width: 100%; min-height: 76px; resize: vertical; padding: 8px 10px;
  border: 1px solid var(--border-strong); border-radius: var(--radius-s); background: var(--surface);
  font-size: 13px; line-height: 1.45;
}
.v-queue .q-note textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 0; border-color: var(--accent); }
.v-queue .q-note-hint { margin-top: 4px; font-size: 11.5px; color: var(--text-3); }
.v-queue .q-nav { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.v-queue .q-nav .q-btn { justify-content: space-between; }
.v-queue .q-panel-foot { margin-top: auto; padding-top: 12px; border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--text-3); }

/* ---------- empty / done states ---------- */
.v-queue .q-state { max-width: 720px; margin: 0 auto; padding: 56px 36px 120px; }
.v-queue .q-state h1 { margin: 0 0 8px; font-size: 26px; font-weight: 650; letter-spacing: -0.02em; }
.v-queue .q-state > p { margin: 0; font-size: 15px; color: var(--text-2); max-width: 60ch; }
.v-queue .q-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 24px 0; }
.v-queue .q-stat { border: 1px solid var(--border); border-radius: var(--radius-m); background: var(--surface); padding: 12px 14px; }
.v-queue .q-stat b { display: block; font-size: 24px; font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.v-queue .q-stat span { font-size: 12.5px; color: var(--text-2); }
.v-queue .q-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 20px 0; }
.v-queue .q-actions .q-btn { height: 36px; padding: 0 14px; }
.v-queue .q-list { border: 1px solid var(--border); border-radius: var(--radius-m); background: var(--surface); overflow: hidden; }
.v-queue .q-list-head { padding: 10px 14px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--text-2); border-bottom: 1px solid var(--border); }
.v-queue .q-list-row { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; width: 100%; padding: 10px 14px; border: 0; border-bottom: 1px solid var(--border); background: transparent; text-align: left; }
.v-queue .q-list-row:last-child { border-bottom: 0; }
.v-queue .q-list-row:hover { background: var(--surface-2); }
.v-queue .q-list-row:active { background: var(--general-soft); }
.v-queue .q-list-row small { grid-column: 1 / -1; color: var(--text-3); font-size: 12px; }
.v-queue .q-list-name { font-weight: 500; }
.v-queue .q-banner { margin-top: 20px; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px dashed var(--border-strong); border-radius: var(--radius-m); font-size: 13px; color: var(--text-2); }
.v-queue .q-banner span { flex: 1; }
.v-queue .q-wait { display: flex; align-items: center; gap: 10px; margin-top: 18px; font-size: 13px; color: var(--text-2); }

/* ---------- new-run sheet ---------- */
.v-queue .q-scrim { position: absolute; inset: 0; background: rgba(20,20,18,.18); z-index: 20; animation: queue-fade 180ms var(--ease-out) both; }
@keyframes queue-fade { from { opacity: 0; } to { opacity: 1; } }
.v-queue .q-sheet {
  position: absolute; top: 64px; right: 16px; bottom: 80px; z-index: 21;
  width: 440px; max-width: calc(100% - 32px);
  display: flex; flex-direction: column;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-l);
  box-shadow: var(--shadow-2);
  transform-origin: top right;
  animation: queue-sheet 200ms var(--ease-out) both;
}
@keyframes queue-sheet { from { opacity: 0; transform: translateY(-6px) scale(.98); } to { opacity: 1; transform: none; } }
.v-queue .q-sheet-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 10px 20px; }
.v-queue .q-sheet-head h2 { margin: 0; font-size: 16px; font-weight: 650; }
.v-queue .q-sheet-body { flex: 1; overflow-y: auto; padding: 4px 20px 16px; display: grid; gap: 18px; align-content: start; }
.v-queue .q-sheet-foot { padding: 14px 20px; border-top: 1px solid var(--border); display: grid; gap: 10px; }
.v-queue .q-field-label { display: block; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--text-2); margin-bottom: 8px; }
.v-queue .q-resume-card { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: var(--radius-m); background: var(--contested-soft); font-size: 13px; }
.v-queue .q-resume-card span { flex: 1; }
.v-queue .q-drop {
  display: grid; place-items: center; gap: 4px; width: 100%; padding: 18px 12px;
  border: 1.5px dashed var(--border-strong); border-radius: var(--radius-m); background: var(--bg);
  font-size: 13px; color: var(--text-2); text-align: center;
  transition: background-color 120ms ease-out, border-color 120ms ease-out;
}
.v-queue .q-drop:hover, .v-queue .q-drop.is-over { border-color: var(--accent); background: var(--accent-soft); }
.v-queue .q-drop strong { color: var(--text); font-weight: 600; }
.v-queue .q-file-row { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.v-queue .q-file { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius-m); }
.v-queue .q-file-icon { width: 28px; height: 32px; border-radius: 4px; background: var(--deep-soft); color: var(--deep); font: 700 9px/32px var(--mono); text-align: center; flex: none; }
.v-queue .q-file div { flex: 1; min-width: 0; }
.v-queue .q-file strong { display: block; font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.v-queue .q-file small { color: var(--text-3); font-size: 12px; }
.v-queue .q-map { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; }
.v-queue .q-map label { display: grid; gap: 4px; font-size: 12.5px; color: var(--text-2); }
.v-queue .q-map select { height: 32px; padding: 0 8px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); background: var(--surface); font-size: 13px; color: var(--text); }
.v-queue .q-map small { font-size: 11.5px; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.v-queue .q-map .is-missing select { border-color: var(--error); }
.v-queue .q-seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.v-queue .q-seg label { position: relative; display: block; }
.v-queue .q-seg input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.v-queue .q-seg span {
  display: grid; gap: 1px; padding: 8px 10px; border: 1px solid var(--border-strong); border-radius: var(--radius-s);
  font-size: 13px; font-weight: 500; transition: background-color 120ms ease-out, border-color 120ms ease-out;
}
.v-queue .q-seg small { font-size: 11.5px; font-weight: 400; color: var(--text-3); }
.v-queue .q-seg small.is-missing { color: var(--error); }
.v-queue .q-seg label:hover span { background: var(--surface-2); }
.v-queue .q-seg input:checked + span { border-color: var(--text); box-shadow: inset 0 0 0 1px var(--text); }
.v-queue .q-seg input:focus-visible + span { outline: 2px solid var(--accent); outline-offset: 2px; }
.v-queue .q-warn { font-size: 12.5px; color: var(--error); margin-top: 8px; }
.v-queue .q-hint { font-size: 12.5px; color: var(--text-3); margin-top: 8px; }
.v-queue .q-more-btn { justify-self: start; padding-left: 0; }
.v-queue .q-more { display: grid; gap: 12px; }
.v-queue .q-switch { display: grid; grid-template-columns: 34px 1fr; gap: 2px 10px; align-items: start; font-size: 13px; position: relative; cursor: pointer; }
.v-queue .q-switch input { position: absolute; opacity: 0; width: 34px; height: 20px; margin: 0; cursor: pointer; }
.v-queue .q-switch-ui { grid-row: 1 / span 2; width: 34px; height: 20px; border-radius: 999px; background: var(--border-strong); position: relative; transition: background-color 160ms ease-out; }
.v-queue .q-switch-ui::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: var(--shadow-1); transition: transform 160ms var(--ease-out); }
.v-queue .q-switch input:checked + .q-switch-ui { background: var(--text); }
.v-queue .q-switch input:checked + .q-switch-ui::after { transform: translateX(14px); }
.v-queue .q-switch input:focus-visible + .q-switch-ui { outline: 2px solid var(--accent); outline-offset: 2px; }
.v-queue .q-switch input:disabled + .q-switch-ui { opacity: .4; }
.v-queue .q-switch b { font-weight: 500; }
.v-queue .q-switch small { color: var(--text-3); font-size: 12px; }
.v-queue .q-thresh { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; }
.v-queue .q-thresh label { display: grid; gap: 4px; font-size: 12.5px; color: var(--text-2); }
.v-queue .q-thresh input { height: 32px; padding: 0 8px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); font-variant-numeric: tabular-nums; }
.v-queue .q-est { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.v-queue .q-est strong { font-size: 18px; font-weight: 650; font-variant-numeric: tabular-nums; }
.v-queue .q-est span { font-size: 12.5px; color: var(--text-2); text-align: right; }
.v-queue .q-foot-row { display: flex; align-items: center; gap: 10px; }
.v-queue .q-foot-row small { flex: 1; font-size: 12px; color: var(--text-3); }
.v-queue .q-foot-row .q-btn { height: 36px; padding: 0 16px; }

/* ---------- toast ---------- */
.v-queue .q-toast {
  position: absolute; left: 20px; bottom: 24px; z-index: 30; max-width: min(440px, calc(50% - 190px));
  display: flex; align-items: center; gap: 12px; padding: 10px 10px 10px 14px;
  background: var(--text); color: var(--surface); border-radius: var(--radius-m); box-shadow: var(--shadow-2);
  font-size: 13px; animation: queue-toast 200ms var(--ease-out) both;
}
.v-queue .q-toast span { flex: 1; }
.v-queue .q-toast .q-btn { height: 28px; background: transparent; color: var(--surface); border-color: rgba(255,255,255,.3); }
.v-queue .q-toast .q-btn:hover { background: rgba(255,255,255,.12); }
.v-queue .q-toast .q-kbd { background: transparent; color: rgba(255,255,255,.7); border-color: rgba(255,255,255,.3); }
@keyframes queue-toast { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

.v-queue .q-only-narrow { display: none; }

@media (max-width: 1240px) {
  .v-queue { --q-rail: 220px; --q-panel: 296px; }
  .v-queue .q-case { padding: 24px 24px 120px; }
  .v-queue .q-cost-label { display: none; }
}
@media (max-width: 1100px) {
  .v-queue .q-counts .q-count-label { display: none; }
  .v-queue .q-two, .v-queue .q-weigh { grid-template-columns: 1fr; }
  .v-queue .q-crit { grid-template-columns: 1fr; gap: 4px; }
}
@media (max-width: 1000px) {
  .v-queue .q-body, .v-queue .q-body.is-wide { grid-template-columns: minmax(0, 1fr) var(--q-panel); }
  .v-queue .q-body.is-wide { grid-template-columns: minmax(0, 1fr); }
  .v-queue .q-rail { display: none; }
  .v-queue .q-only-narrow { display: inline-flex; }
  .v-queue .q-brand-text { display: none; }
  .v-queue .q-stats { grid-template-columns: repeat(2, 1fr); }
  .v-queue .q-toast { max-width: 260px; }
}
@media (prefers-reduced-motion: reduce) {
  .v-queue *, .v-queue *::before, .v-queue *::after { animation: none !important; transition: none !important; }
}
`;

  /* ------------------------------------------------------------------ */

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const money = (x) => '$' + x.toFixed(2);
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
  const VLABEL = { 'deep tech': 'Deep tech', 'general tech': 'General tech' };
  const vcls = (v) => (v === 'deep tech' ? 'deep' : 'general');
  const other = (v) => (v === 'deep tech' ? 'general tech' : 'deep tech');
  const RISK_ORDER = { Escalate: 0, Contested: 1, Uncertain: 2 };
  const FIELDS = [
    { key: 'company_name', label: 'Company name', required: true },
    { key: 'description', label: 'Description' },
    { key: 'domain', label: 'Domain / industry' },
    { key: 'uen', label: 'UEN' },
  ];

  function render() {
    return `<div class="v-queue">
  <header class="q-top">
    <div class="q-brand"><span class="q-brand-mark" aria-hidden="true"></span><span class="q-brand-text">Deep Tech Classifier</span></div>
    <div class="q-status" data-region="status"></div>
    <div class="q-top-actions">
      <button type="button" class="q-btn q-only-narrow" data-act="settled-first">Settled list</button>
      <button type="button" class="q-btn" data-act="download">Download Excel</button>
      <button type="button" class="q-btn q-btn-primary" data-act="sheet-open" aria-haspopup="dialog">New run</button>
    </div>
    <div class="q-progress" aria-hidden="true"><span data-region="bar"></span></div>
  </header>
  <div class="q-body" data-region="body">
    <nav class="q-rail" data-region="rail" aria-label="Review queue"></nav>
    <main class="q-main" data-region="main"></main>
    <aside class="q-panel" data-region="panel" aria-label="Decision"></aside>
  </div>
  <div data-region="layer"></div>
  <div data-region="toast" aria-live="polite"></div>
</div>`;
  }

  function init(stage) {
    const D = window.PROTO_DATA;
    const el = stage.querySelector('.v-queue');
    const R = (name) => el.querySelector('[data-region="' + name + '"]');
    const byId = Object.fromEntries(D.companies.map((c) => [c.id, c]));
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    const cancel = (t) => { if (t) { clearTimeout(t); timers.delete(t); } };

    /* ---------------- state ---------------- */
    const S = {
      cfg: Object.assign({}, D.defaults, { file: D.file.name, sample: true, mapping: Object.assign({}, D.file.mapping) }),
      draft: null,
      run: null,
      decisions: {},     // id -> { verdict, note, agrees }
      skipped: new Set(),
      notes: {},         // id -> draft note text
      undo: [],
      view: 'queue',     // 'queue' | 'settled'
      cur: null,
      settledCur: null,
      settledOpen: false,
      sheet: false,
      moreOpen: false,
      sheetMsg: '',
      pastRuns: D.pastRuns.map((r) => Object.assign({}, r)),
      lastShown: null,
      seen: new Set(),   // queue ids already rendered in the rail (for arrival animation)
      runTimer: null,
      toastTimer: null,
      sheetReturn: null,
    };

    function batchEff(cfg) {
      const p = D.providers.find((x) => x.id === cfg.provider);
      return !!(cfg.batch && p && p.batch);
    }
    function baseConf(c) { return c.signals.llm + c.signals.epoAdjust; }
    function needsValidation(c, cfg) { return cfg.validator && c.validator.triggered; }

    function makeRun(opts) {
      const cfg = Object.assign({}, opts.cfg);
      return {
        file: opts.file, total: opts.total, offset: opts.offset || 0, pool: opts.pool, cfg,
        batch: batchEff(cfg), processed: [], status: 'running',
        phase: 'gather', i: 0, sub: 0, held: [], step: '', name: '', pastId: opts.pastId || null,
      };
    }

    // First mount: the sample run has already finished and its flagged companies wait in the queue.
    S.run = makeRun({ file: D.file.name, total: D.file.rows, pool: D.companies.map((c) => c.id), cfg: S.cfg });
    S.run.processed = S.run.pool.slice();
    S.run.status = 'done';

    /* ---------------- derived ---------------- */
    function processed() { return S.run.processed.map((id) => byId[id]); }
    function flagged() {
      const order = S.run.processed;
      return processed().filter((c) => c.risk !== 'Clear')
        .sort((a, b) => (RISK_ORDER[a.risk] - RISK_ORDER[b.risk]) || (order.indexOf(a.id) - order.indexOf(b.id)));
    }
    function settled() {
      const list = processed().filter((c) => c.risk === 'Clear');
      return list.filter((c) => c.verdict === 'deep tech').concat(list.filter((c) => c.verdict !== 'deep tech'));
    }
    function isOpen(id) { return !S.decisions[id]; }
    function counts() {
      let deep = 0, general = 0, review = 0;
      processed().forEach((c) => {
        const d = S.decisions[c.id];
        const v = d ? d.verdict : c.risk === 'Clear' ? c.verdict : null;
        if (v === 'deep tech') deep++; else if (v) general++; else review++;
      });
      return { deep, general, review };
    }
    function tierFactor(cfg) { return D.estCostPerCompany[cfg.tier] / D.estCostPerCompany.fast; }
    function costSoFar() {
      const r = S.run;
      const f = tierFactor(r.cfg) * (r.batch ? 0.8 : 1);
      return processed().reduce((s, c) => s + c.cost * f, 0);
    }
    function doneCount() { return S.run.offset + S.run.processed.length; }
    function progressFraction() {
      const r = S.run;
      if (r.status === 'done') return 1;
      if (!r.batch) return doneCount() / r.total;
      const n = r.pool.length, pre = r.offset / r.total, span = n / r.total;
      let f = 0;
      if (r.phase === 'gather') f = 0.4 * (r.i / n);
      else if (r.phase === 'batch') f = 0.45;
      else if (r.phase === 'read') f = 0.5 + 0.35 * (r.i / n);
      else f = 0.85 + 0.15 * (r.i / Math.max(1, r.held.length));
      return pre + span * f;
    }
    function providerOf(cfg) { return D.providers.find((p) => p.id === cfg.provider); }
    function modelLabel(cfg) { const p = providerOf(cfg); return p.label + ' ' + p.tiers[cfg.tier]; }

    function estimate(cfg, n) {
      const per = D.estCostPerCompany[cfg.tier];
      const below = D.companies.filter((c) => baseConf(c) < cfg.validatorThreshold).length / D.companies.length;
      const b = batchEff(cfg);
      const share = (cfg.enrichment ? 0.3 : 0) + 0.4 * (b ? 0.5 : 1) + (cfg.validator ? 1.2 * below : 0);
      const cost = n * per * share;
      let secs = n * (b ? D.estSecondsPerCompany.batch : D.estSecondsPerCompany.sequential);
      if (!cfg.enrichment) secs *= 0.8;
      if (!cfg.epo) secs *= 0.9;
      const mins = Math.max(1, Math.round(secs / 60));
      return { cost, mins, batch: b, validated: Math.round(below * n) };
    }

    /* ---------------- copy helpers ---------------- */
    function riskPlain(c, cfg) {
      const v = c.validator;
      if (c.risk === 'Escalate') return 'The second check searched the web and found evidence pointing both ways, so it handed the decision to a person instead of guessing.';
      if (c.risk === 'Contested') return 'A second check disagreed with this verdict' + (v.confidence ? ' (' + v.confidence + '% sure it is ' + other(c.verdict) + ')' : '') + ', but that is below the ' + cfg.overrideMinConfidence + '% needed to change a verdict. Two automated checks disagree, so a person should decide.';
      if (c.risk === 'Uncertain') return 'A second check ran and confidence is still below ' + cfg.validatorThreshold + '%. Nothing contradicts the verdict, but there is not enough evidence to settle it automatically.';
      return 'The verdict stands without open questions, so the pipeline settled it without asking anyone.';
    }
    function askLine(c) {
      const yes = c.verdict === 'deep tech';
      const tail = c.risk === 'Clear' ? 'and settled it without review.' : 'and wants a human to check.';
      return 'The pipeline says <strong>' + (yes ? 'yes' : 'no, general tech') + '</strong>, ' + c.confidence + '% confident, ' + tail;
    }
    function evidence(c, cfg) {
      const pro = [], con = [], open = [];
      const crit = [['Innovation', c.criteria.innovation], ['Scientific foundation', c.criteria.scientific_foundation], ['Proprietary IP', c.criteria.proprietary_ip]];
      crit.forEach(([label, x]) => (x.met ? pro : con).push({ src: label, text: x.reasoning }));
      const p = c.patents;
      if (!cfg.epo) open.push({ src: 'Patents', text: 'Patent lookup was off for this run, so patents were not checked.' });
      else if (p.count && p.level !== 'Not Deep-tech') pro.push({ src: 'Patents', text: plural(p.count, 'EPO patent') + ', rated ' + p.level + (p.cpc.length ? ' (' + p.cpc.map((x) => x.desc.toLowerCase()).join(', ') + ')' : '') + '.' });
      else if (p.count) con.push({ src: 'Patents', text: plural(p.count, 'patent') + ' found, but not deep tech in nature' + (p.cpc.length ? ' (' + p.cpc[0].desc.toLowerCase() + ')' : '') + '.' });
      else con.push({ src: 'Patents', text: 'No EPO patents found under this name.' });
      const v = c.validator;
      if (v.triggered) {
        if (v.verdict === 'override') (c.verdict === 'deep tech' ? con : pro).push({ src: 'Second check', text: v.summary });
        else if (v.verdict === 'confirm') (c.verdict === 'deep tech' ? pro : con).push({ src: 'Second check', text: v.summary });
        else open.push({ src: 'Second check', text: v.escalationReason || v.summary });
      }
      if (c.webStatus === 'not_found') open.push({ src: 'Web', text: 'No website or press coverage was found for this company.' });
      return { pro, con, open };
    }
    function confidenceRows(c, cfg) {
      const rows = [];
      const adj = c.signals.epoAdjust;
      rows.push({ label: "Classifier's own confidence", note: 'How sure the model was after reading the description.', value: c.signals.llm });
      rows.push({
        label: 'Patent evidence', value: (adj >= 0 ? '+' : '−') + Math.abs(adj),
        note: adj ? (c.patents.count ? 'Patents agree with the verdict' : 'Adjustment from the patent check') + '; it can move the score by up to ' + cfg.epoAdjustMax + ' points.' : 'No relevant patents, so no change.',
      });
      const base = baseConf(c);
      const noEvidence = !c.description && !c.patents.count;
      rows.push({
        label: 'Before the second check', value: base,
        note: (noEvidence ? 'Capped at ' + cfg.lowEvidenceCap + ' because there is no description and no patents. ' : '') +
          (c.validator.triggered ? 'Below ' + cfg.validatorThreshold + ', so the second check ran.' : 'At or above ' + cfg.validatorThreshold + ', so no second check was needed.'),
      });
      if (c.validator.triggered) {
        const v = c.validator;
        let note = '';
        if (v.decision === 'ESCALATE_FOR_HUMAN_REVIEW') note = 'Escalated to a person. When the check escalates, confidence can only go down.';
        else if (v.verdict === 'override') note = 'Disagreed at ' + v.confidence + '%, below the ' + cfg.overrideMinConfidence + '% needed to overturn. Verdict kept, confidence lowered.';
        else if (v.verdict === 'confirm') note = 'Agreed with the verdict; its own confidence (' + v.confidence + '%) replaces the score.';
        else note = 'Could not find enough evidence either way.';
        rows.push({ label: 'After the second check', value: c.confidence, note });
      }
      rows.push({ label: 'Final confidence', value: c.confidence + '%', note: c.tier + ' tier', final: true });
      return rows;
    }
    function validatorWords(v) {
      if (v.verdict === 'confirm') return 'Agreed with the verdict';
      if (v.verdict === 'override') return 'Disagreed with the verdict';
      return 'Could not find enough evidence';
    }

    /* ---------------- rendering: status ---------------- */
    function renderStatus() {
      const r = S.run;
      const k = counts();
      let dot = 'is-done', title = '', sub = '', btn = '';
      if (r.status === 'running') {
        dot = 'is-running';
        if (r.batch) {
          const labels = { gather: D.batchPhases[0], batch: D.batchPhases[1], read: D.batchPhases[2], validate: D.batchPhases[3] };
          title = labels[r.phase] + (r.phase === 'batch' ? '' : ' · ' + (r.phase === 'validate' ? (r.i + 1) + ' of ' + r.held.length : (r.offset + r.i + 1) + ' of ' + r.total));
          sub = r.phase === 'batch' ? 'One batch job for ' + plural(r.pool.length, 'company', 'companies') + ' (real runs can take up to an hour)' : r.name;
        } else {
          title = 'Checking ' + Math.min(r.total, doneCount() + 1) + ' of ' + r.total;
          sub = r.step + (r.name ? ' · ' + r.name : '');
        }
        btn = '<button type="button" class="q-btn q-btn-sm" data-act="stop">Stop</button>';
      } else if (r.status === 'stopped') {
        dot = 'is-stopped';
        title = 'Stopped at ' + doneCount() + ' of ' + r.total;
        sub = 'Finished results are kept · ' + r.file;
        btn = '<button type="button" class="q-btn q-btn-sm q-btn-primary" data-act="resume">Resume</button>';
      } else {
        title = r.file;
        sub = 'Complete · ' + plural(r.total, 'company', 'companies') + ' · ' + modelLabel(r.cfg) + (r.batch ? ' · batch' : '');
      }
      R('status').innerHTML =
        '<div class="q-run"><span class="q-run-dot ' + dot + '" aria-hidden="true"></span><div class="q-run-text"><strong>' + esc(title) + '</strong><span>' + esc(sub) + '</span></div></div>' +
        btn +
        '<div class="q-counts">' +
          '<span class="q-count q-count-deep"><b>' + k.deep + '</b> <span class="q-count-label">deep tech</span></span>' +
          '<span class="q-count q-count-general"><b>' + k.general + '</b> <span class="q-count-label">general tech</span></span>' +
          '<span class="q-count q-count-review"><b>' + k.review + '</b> <span class="q-count-label">need you</span></span>' +
        '</div>' +
        '<span class="q-cost"><span class="q-cost-label">' + (r.status === 'done' ? 'Cost ' : 'Cost so far ') + '</span>' + money(costSoFar()) + '</span>';
      const bar = R('bar');
      bar.style.transform = 'scaleX(' + progressFraction().toFixed(4) + ')';
      bar.parentElement.classList.toggle('is-idle', r.status === 'done');
    }

    /* ---------------- rendering: rail ---------------- */
    function itemState(c) {
      const d = S.decisions[c.id];
      if (d) return '<span class="q-verdict-' + vcls(d.verdict) + '">' + VLABEL[d.verdict] + '</span><span>' + (d.agrees ? 'confirmed' : 'overturned') + '</span>';
      if (S.skipped.has(c.id)) return '<span class="q-chip q-chip-skip">Skipped</span><span class="q-chip q-chip-' + c.risk + '">' + c.risk + '</span>';
      return '<span class="q-chip q-chip-' + c.risk + '">' + c.risk + '</span><span>' + VLABEL[c.verdict] + ' · ' + c.confidence + '%</span>';
    }
    function renderRail() {
      const q = flagged();
      const left = q.filter((c) => isOpen(c.id)).length;
      let h = '<div class="q-rail-head"><h2>To review</h2><span>' + (q.length ? left + ' left' : '') + '</span></div>';
      if (!q.length) h += '<p class="q-rail-empty">' + (S.run.status === 'running' ? 'Companies the pipeline cannot settle will appear here as they are found.' : 'Nothing was flagged.') + '</p>';
      q.forEach((c) => {
        const cur = S.view === 'queue' && S.cur === c.id;
        const isNew = !S.seen.has(c.id);
        S.seen.add(c.id);
        h += '<button type="button" class="q-item' + (S.decisions[c.id] ? ' is-done' : '') + (isNew && S.run.status === 'running' ? ' q-item-new' : '') + '" data-act="goto" data-id="' + c.id + '"' + (cur ? ' aria-current="true"' : '') + '>' +
          '<span class="q-item-name">' + esc(c.name) + '</span><span class="q-item-meta">' + itemState(c) + '</span></button>';
      });
      const st = settled();
      h += '<div class="q-rail-sep"></div>';
      h += '<button type="button" class="q-disclose" data-act="toggle-settled" aria-expanded="' + S.settledOpen + '"><span>Settled by the pipeline · ' + st.length + '</span><span class="q-disclose-caret" aria-hidden="true">▶</span></button>';
      if (S.settledOpen) {
        let lastV = null;
        st.forEach((c) => {
          if (c.verdict !== lastV) { lastV = c.verdict; h += '<div class="q-rail-sub">' + VLABEL[c.verdict] + ' · ' + st.filter((x) => x.verdict === c.verdict).length + '</div>'; }
          const d = S.decisions[c.id];
          const cur = S.view === 'settled' && S.settledCur === c.id;
          h += '<button type="button" class="q-item" data-act="goto-settled" data-id="' + c.id + '"' + (cur ? ' aria-current="true"' : '') + '>' +
            '<span class="q-item-name">' + esc(c.name) + '</span><span class="q-item-meta">' +
            (d ? '<span class="q-verdict-' + vcls(d.verdict) + '">Overturned to ' + VLABEL[d.verdict].toLowerCase() + '</span>' : '<span>' + esc(c.domain) + '</span>') +
            '<span class="q-item-conf">' + c.confidence + '%</span></span></button>';
        });
        if (!st.length) h += '<p class="q-rail-empty">None yet.</p>';
      }
      const rail = R('rail');
      const top = rail.scrollTop;
      rail.innerHTML = h;
      rail.scrollTop = top;
    }

    /* ---------------- rendering: case file ---------------- */
    function caseHTML(c, mode) {
      const cfg = S.run.cfg;
      const ev = evidence(c, cfg);
      let pos = '';
      if (mode === 'queue') {
        pos = '<span class="q-pos" data-region="pos">' + posText(c) + '</span>';
      } else {
        const st = settled();
        pos = '<span class="q-pos">Settled ' + (st.indexOf(c) + 1) + ' of ' + st.length + ' · read-only</span>';
      }
      const li = (x) => '<li><b>' + esc(x.src) + '</b>' + esc(x.text) + '</li>';
      const desc = c.webDescription || c.description;
      let descH = desc ? '<p class="q-desc">' + esc(desc) + '</p>' : '<p class="q-desc" style="color:var(--text-3)">No description in your file, and the web search found nothing.</p>';
      if (c.webDescription) {
        descH += '<div class="q-desc-src">From the web · ' + esc(c.webSource) + (c.description && c.description !== c.webDescription ? ' · your file says <q>' + esc(c.description) + '</q>' : '') + '</div>';
      } else if (c.description) {
        descH += '<div class="q-desc-src">From your file; nothing newer found on the web.</div>';
      }
      const crit = [['Innovation', c.criteria.innovation], ['Scientific foundation', c.criteria.scientific_foundation], ['Proprietary IP', c.criteria.proprietary_ip]]
        .map(([n, x]) => '<div class="q-crit"><div><span class="q-crit-name">' + n + '</span><span class="q-crit-met ' + (x.met ? 'is-met">Met' : 'is-not">Not met') + '</span></div><p>' + esc(x.reasoning) + '</p></div>').join('');
      const p = c.patents;
      const patH = !cfg.epo ? '<p>Patent lookup was off for this run.</p>' : p.count
        ? '<div class="q-kv"><span><b>' + p.count + '</b> found</span><span>Level <b>' + esc(p.level) + '</b></span>' + (p.domain ? '<span>' + esc(p.domain) + '</span>' : '') + '</div><ul class="q-cpc">' + p.cpc.map((x) => '<li><code>' + esc(x.code) + '</code><span>' + esc(x.desc) + '</span></li>').join('') + '</ul>'
        : '<p>No patents found in the EPO database under this name.' + (c.risk !== 'Clear' && c.criteria.proprietary_ip.reasoning.indexOf('parent') >= 0 ? ' They may be held by a parent entity.' : '') + '</p>';
      const v = c.validator;
      const valH = v.triggered
        ? '<div class="q-kv"><span><b>' + validatorWords(v) + '</b></span><span>' + v.confidence + '% sure</span></div><p>' + esc(v.summary) + '</p>' +
          (v.escalationReason ? '<p><b style="color:var(--text)">Why it escalated:</b> ' + esc(v.escalationReason) + '</p>' : '') +
          '<ul class="q-sources" aria-label="Sources">' + v.sources.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ul>'
        : '<p>Not needed: confidence was ' + baseConf(c) + ' before validation, at or above the ' + cfg.validatorThreshold + ' threshold.</p>';
      const build = confidenceRows(c, cfg).map((r) =>
        '<div class="q-build-row' + (r.final ? ' is-final' : '') + '"><span>' + esc(r.label) + '<small>' + esc(r.note) + '</small>' +
        (r.final ? '<div class="q-meter"><i style="transform:scaleX(' + (c.confidence / 100) + ')"></i></div>' : '') +
        '</span><output>' + esc(r.value) + '</output></div>').join('');

      return '<article class="q-case" aria-labelledby="q-q">' +
        '<div class="q-case-top"><span class="q-chip q-chip-' + c.risk + '">' + c.risk + '</span>' + pos + '</div>' +
        '<h1 class="q-question" id="q-q">Is ' + esc(c.name) + ' deep tech?</h1>' +
        '<p class="q-lede">' + askLine(c) + '</p>' +
        '<div class="q-meta"><span>' + esc(c.domain || 'No domain given') + '</span><span>UEN <code>' + esc(c.uen) + '</code></span>' + (c.webSource ? '<span>' + esc(c.webSource) + '</span>' : '<span>No website found</span>') + '</div>' +
        '<section class="q-why q-tone-' + c.risk + '"><div><h2>' + (c.risk === 'Clear' ? 'Why it was settled' : 'Why it needs you') + '</h2><p>' + esc(riskPlain(c, cfg)) + '</p><p>' + esc(c.reasoning) + '</p></div></section>' +
        '<section class="q-sec"><h2>What the company does</h2>' + descH + '</section>' +
        '<section class="q-sec"><h2>Weighing it up</h2><div class="q-weigh">' +
          '<div class="q-col q-col-for"><h3>Points to deep tech</h3><ul>' + (ev.pro.map(li).join('') || '<li class="q-none">Nothing found.</li>') + '</ul></div>' +
          '<div class="q-col q-col-against"><h3>Points to general tech</h3><ul>' + (ev.con.map(li).join('') || '<li class="q-none">Nothing found.</li>') + '</ul></div>' +
        '</div>' + ev.open.map((x) => '<div class="q-open"><b>Open question · ' + esc(x.src) + ':</b> ' + esc(x.text) + '</div>').join('') + '</section>' +
        '<section class="q-sec"><h2>The three criteria</h2><div class="q-criteria">' + crit + '</div></section>' +
        '<section class="q-sec"><div class="q-two">' +
          '<div class="q-card"><h3>Patents (EPO)</h3>' + patH + '</div>' +
          '<div class="q-card"><h3>What the second check found on the web</h3>' + valH + '</div>' +
        '</div></section>' +
        '<section class="q-sec"><h2>How ' + c.confidence + '% was reached</h2><div class="q-build">' + build + '</div></section>' +
        '</article>';
    }
    function posText(c) {
      const q = flagged();
      const left = q.filter((x) => isOpen(x.id)).length;
      const more = S.run.status === 'running' ? ' so far' : '';
      return (q.indexOf(c) + 1) + ' of ' + q.length + ' to review' + more + ' · ' + (left ? left + ' still open' : 'all decided');
    }

    /* ---------------- rendering: decision panel ---------------- */
    function panelHTML(c) {
      const d = S.decisions[c.id];
      const note = S.notes[c.id] != null ? S.notes[c.id] : d ? d.note : '';
      const undoBtn = '<button type="button" class="q-btn q-btn-sm q-btn-quiet" data-act="undo"' + (S.undo.length ? '' : ' disabled') + '>Undo <span class="q-kbd">U</span></button>';
      const noteH = '<div class="q-note"><label for="q-note"><span>Note <span style="color:var(--text-3);font-weight:400">(optional)</span></span><span class="q-kbd">N</span></label>' +
        '<textarea id="q-note" data-id="' + c.id + '" placeholder="Why you decided this. Goes into the workbook.">' + esc(note) + '</textarea>' +
        '<div class="q-note-hint">Esc returns to the shortcuts.</div></div>';
      if (S.view === 'settled') {
        const opp = other(c.verdict);
        const top = '<p class="q-panel-label">Settled automatically</p><p class="q-panel-says">The pipeline decided <span class="q-verdict-' + vcls(c.verdict) + '">' + VLABEL[c.verdict] + '</span> at ' + c.confidence + '% (' + c.action + ').</p>';
        const act = d
          ? '<div class="q-decided">You overturned this to <strong>' + VLABEL[d.verdict] + '</strong>.</div><button type="button" class="q-btn" data-act="restore">Restore the pipeline verdict</button>'
          : '<button type="button" class="q-dbtn q-dbtn-' + vcls(opp) + '" data-act="overturn"><span class="q-dbtn-title">Overturn to ' + VLABEL[opp].toLowerCase() + '</span><span class="q-dbtn-sub">Records your call in place of the pipeline’s</span><span class="q-kbd">O</span></button>';
        return top + '<div class="q-decide">' + act + '</div>' + noteH +
          '<div class="q-nav"><button type="button" class="q-btn" data-act="prev">Previous <span class="q-kbd">K</span></button><button type="button" class="q-btn" data-act="next">Next <span class="q-kbd">J</span></button></div>' +
          '<button type="button" class="q-btn" data-act="back-queue">Back to the review queue <span class="q-kbd">Esc</span></button>' +
          '<div class="q-panel-foot"><span>Read-only case file</span>' + undoBtn + '</div>';
      }
      const btn = (v, key) => {
        const agrees = v === c.verdict;
        const pressed = d && d.verdict === v;
        return '<button type="button" class="q-dbtn q-dbtn-' + vcls(v) + '" data-act="decide" data-v="' + v + '" aria-pressed="' + !!pressed + '">' +
          '<span class="q-dbtn-title">' + VLABEL[v] + '</span><span class="q-dbtn-sub">' + (agrees ? 'Agree with the pipeline' : 'Overturn the pipeline') + '</span><span class="q-kbd">' + key + '</span></button>';
      };
      const status = d
        ? '<div class="q-decided">You decided <strong>' + VLABEL[d.verdict] + '</strong> (' + (d.agrees ? 'agrees with' : 'overturns') + ' the pipeline). Press the other key to change it.</div>'
        : S.skipped.has(c.id) ? '<div class="q-decided">Skipped for now. It stays in the queue.</div>' : '';
      return '<p class="q-panel-label">Your call</p><p class="q-panel-says">Is it deep tech? The pipeline says ' + VLABEL[c.verdict].toLowerCase() + ', ' + c.confidence + '%.</p>' +
        status +
        '<div class="q-decide">' + btn('deep tech', 'D') + btn('general tech', 'G') +
        '<button type="button" class="q-dbtn q-dbtn-skip" data-act="skip" aria-pressed="' + S.skipped.has(c.id) + '"><span class="q-dbtn-title">Skip for now</span><span class="q-kbd">S</span></button></div>' +
        noteH +
        '<div class="q-nav"><button type="button" class="q-btn" data-act="prev">Previous <span class="q-kbd">K</span></button><button type="button" class="q-btn" data-act="next">Next <span class="q-kbd">J</span></button></div>' +
        '<div class="q-panel-foot"><span>Decisions advance to the next case</span>' + undoBtn + '</div>';
    }

    /* ---------------- rendering: empty / done states ---------------- */
    function stateHTML() {
      const r = S.run;
      const q = flagged();
      const k = counts();
      const decided = q.filter((c) => S.decisions[c.id]);
      const skipped = q.filter((c) => !S.decisions[c.id] && S.skipped.has(c.id));
      const remaining = r.pool.length - r.processed.length;
      const overturnedSettled = settled().filter((c) => S.decisions[c.id]);
      const interrupted = S.pastRuns.find((p) => p.status === 'interrupted');
      let head = '', lede = '', extra = '';

      if (r.status === 'running' && !q.length) {
        head = 'Nothing to review yet';
        lede = 'The run is checking ' + r.file + '. Companies the pipeline cannot settle by itself will land here as soon as they are found, so you can start before it finishes.';
        extra = '<div class="q-wait"><span class="q-run-dot is-running" aria-hidden="true"></span>' + doneCount() + ' of ' + r.total + ' checked so far.</div>';
        return '<div class="q-state"><h1>' + head + '</h1><p>' + esc(lede) + '</p>' + extra + '</div>';
      }
      if (r.status === 'running') {
        head = 'You are caught up';
        lede = 'All ' + plural(q.length, 'flagged company', 'flagged companies') + ' found so far ' + (q.length === 1 ? 'has' : 'have') + ' a decision' + (skipped.length ? ' or were skipped' : '') + '. The run is still checking ' + plural(remaining, 'company', 'companies') + '; new cases will open here as they arrive.';
      } else if (r.status === 'stopped') {
        head = q.length ? 'Everything found so far is reviewed' : 'Run stopped before anything needed review';
        lede = plural(remaining, 'company', 'companies') + ' in ' + r.file + ' ' + (remaining === 1 ? 'was' : 'were') + ' not checked. Finished results are kept; resume to check the rest.';
        extra = '<div class="q-banner"><span>Stopped at ' + doneCount() + ' of ' + r.total + '.</span><button type="button" class="q-btn q-btn-primary q-btn-sm" data-act="resume">Resume run</button></div>';
      } else if (skipped.length) {
        head = decided.length + ' of ' + q.length + ' reviewed, ' + skipped.length + ' skipped';
        lede = 'The skipped ' + (skipped.length === 1 ? 'company is' : 'companies are') + ' still marked Needs Review. Come back when you have more to go on, or download the workbook as it is.';
      } else {
        head = q.length ? 'All ' + plural(q.length, 'flagged company', 'flagged companies') + ' reviewed' : 'Nothing needed review';
        lede = 'The pipeline settled ' + settled().length + ' of ' + r.processed.length + ' companies by itself' + (q.length ? ' and you decided the rest' : '') + '. The workbook is ready.';
      }
      const stats = '<div class="q-stats">' +
        '<div class="q-stat"><b>' + k.deep + '</b><span>Deep tech</span></div>' +
        '<div class="q-stat"><b>' + k.general + '</b><span>General tech</span></div>' +
        '<div class="q-stat"><b>' + k.review + '</b><span>Still need review</span></div>' +
        '<div class="q-stat"><b>' + (decided.length + overturnedSettled.length) + '</b><span>Decided by you</span></div></div>';
      const actions = '<div class="q-actions">' +
        '<button type="button" class="q-btn q-btn-primary" data-act="download">Download Excel</button>' +
        (skipped.length ? '<button type="button" class="q-btn" data-act="goto" data-id="' + skipped[0].id + '">Review skipped <span class="q-kbd">J</span></button>' : '') +
        '<button type="button" class="q-btn" data-act="settled-first"' + (settled().length ? '' : ' disabled') + '>Browse ' + settled().length + ' settled companies</button>' +
        '<button type="button" class="q-btn q-btn-quiet" data-act="sheet-open">Start a new run</button></div>';
      const mine = decided.concat(overturnedSettled);
      const list = mine.length ? '<div class="q-list"><div class="q-list-head">Your decisions</div>' + mine.map((c) => {
        const d = S.decisions[c.id];
        return '<button type="button" class="q-list-row" data-act="' + (c.risk === 'Clear' ? 'goto-settled' : 'goto') + '" data-id="' + c.id + '"><span class="q-list-name">' + esc(c.name) + '</span>' +
          '<span class="q-verdict-' + vcls(d.verdict) + '">' + VLABEL[d.verdict] + '</span>' +
          '<small>' + (d.agrees ? 'Confirmed the pipeline' : 'Overturned the pipeline (' + VLABEL[c.verdict].toLowerCase() + ', ' + c.confidence + '%)') + (d.note ? ' · “' + esc(d.note) + '”' : '') + '</small></button>';
      }).join('') + '</div>' : '';
      const past = interrupted && r.status === 'done'
        ? '<div class="q-banner"><span>' + esc(interrupted.file) + ' was interrupted at ' + interrupted.done + ' of ' + interrupted.total + ' on ' + esc(interrupted.date) + '.</span><button type="button" class="q-btn q-btn-sm" data-act="resume-past" data-id="' + interrupted.id + '">Resume that run</button></div>'
        : '';
      return '<div class="q-state"><h1>' + esc(head) + '</h1><p>' + esc(lede) + '</p>' + extra + stats + actions + list + past + '</div>';
    }

    /* ---------------- main + panel ---------------- */
    function renderMain() {
      const body = R('body');
      const main = R('main');
      const panel = R('panel');
      let c = null, key = '';
      if (S.view === 'settled' && S.settledCur) { c = byId[S.settledCur]; key = 's:' + c.id; }
      else if (S.view === 'queue' && S.cur) { c = byId[S.cur]; key = 'q:' + c.id; }
      if (c) {
        const changed = S.lastShown !== key;
        main.innerHTML = caseHTML(c, S.view);
        if (changed) { main.firstElementChild.classList.add('q-enter'); main.scrollTop = 0; }
        panel.innerHTML = panelHTML(c);
        panel.hidden = false;
        body.classList.remove('is-wide');
        S.lastShown = key;
      } else {
        main.innerHTML = stateHTML();
        if (S.lastShown !== 'state') { main.firstElementChild.classList.add('q-enter'); main.scrollTop = 0; }
        panel.innerHTML = '';
        panel.hidden = true;
        body.classList.add('is-wide');
        S.lastShown = 'state';
      }
    }
    function renderAll() { renderStatus(); renderRail(); renderMain(); }
    // Light refresh during a run: never rebuild the case file the reviewer is reading.
    function refreshLive() {
      renderStatus();
      renderRail();
      if (!S.cur && S.view === 'queue') renderMain();
      else {
        const pos = el.querySelector('[data-region="pos"]');
        if (pos && S.cur) pos.textContent = posText(byId[S.cur]);
      }
    }

    /* ---------------- toast ---------------- */
    function toast(msg, withUndo) {
      cancel(S.toastTimer);
      R('toast').innerHTML = '<div class="q-toast" role="status"><span>' + esc(msg) + '</span>' +
        (withUndo ? '<button type="button" class="q-btn q-btn-sm" data-act="undo">Undo <span class="q-kbd">U</span></button>' : '') + '</div>';
      S.toastTimer = later(() => { R('toast').innerHTML = ''; }, 4200);
    }

    /* ---------------- queue actions ---------------- */
    function nextOpenAfter(id) {
      const q = flagged();
      const n = q.length;
      const start = Math.max(0, q.findIndex((c) => c.id === id));
      for (let i = 1; i <= n; i++) {
        const c = q[(start + i) % n];
        if (isOpen(c.id) && !S.skipped.has(c.id)) return c.id;
      }
      return null;
    }
    function goto(id) { S.view = 'queue'; S.cur = id; renderRail(); renderMain(); }
    function gotoSettled(id) { S.view = 'settled'; S.settledCur = id; S.settledOpen = true; renderRail(); renderMain(); }

    function decide(verdict) {
      const id = S.view === 'queue' ? S.cur : S.settledCur;
      if (!id) return;
      const c = byId[id];
      const prev = S.decisions[id] ? Object.assign({}, S.decisions[id]) : null;
      const noteNow = S.notes[id] != null ? S.notes[id] : prev ? prev.note : '';
      if (prev && prev.verdict === verdict && S.view === 'queue') { advance(id); return; }
      S.undo.push({ id, prev, prevSkip: S.skipped.has(id), view: S.view });
      S.decisions[id] = { verdict, note: (noteNow || '').trim(), agrees: verdict === c.verdict };
      S.skipped.delete(id);
      const label = c.name + ': ' + VLABEL[verdict].toLowerCase() + (verdict === c.verdict ? ' (confirmed)' : ' (overturned)');
      toast(label, true);
      if (S.view === 'queue') advance(id);
      else { renderStatus(); renderRail(); renderMain(); }
    }
    function advance(fromId) {
      S.cur = nextOpenAfter(fromId);
      renderStatus(); renderRail(); renderMain();
    }
    function skip() {
      if (S.view !== 'queue' || !S.cur) return;
      const id = S.cur;
      if (S.decisions[id]) { advance(id); return; }
      S.undo.push({ id, prev: null, prevSkip: S.skipped.has(id), view: 'queue' });
      S.skipped.add(id);
      toast(byId[id].name + ' skipped for now', true);
      advance(id);
    }
    function restore() {
      const id = S.settledCur;
      if (!id || !S.decisions[id]) return;
      S.undo.push({ id, prev: Object.assign({}, S.decisions[id]), prevSkip: false, view: 'settled' });
      delete S.decisions[id];
      toast(byId[id].name + ': pipeline verdict restored', true);
      renderStatus(); renderRail(); renderMain();
    }
    function undo() {
      const u = S.undo.pop();
      if (!u) { toast('Nothing to undo'); return; }
      if (u.prev) S.decisions[u.id] = u.prev; else delete S.decisions[u.id];
      if (u.prevSkip) S.skipped.add(u.id); else S.skipped.delete(u.id);
      if (!S.run.processed.includes(u.id)) { renderAll(); return; }
      if (u.view === 'settled') { S.view = 'settled'; S.settledCur = u.id; S.settledOpen = true; }
      else { S.view = 'queue'; S.cur = u.id; }
      toast('Undone: ' + byId[u.id].name);
      renderAll();
    }
    function move(dir) {
      if (S.view === 'settled') {
        const st = settled();
        if (!st.length) return;
        const i = st.findIndex((c) => c.id === S.settledCur);
        gotoSettled(st[(i + dir + st.length) % st.length].id);
        return;
      }
      const q = flagged();
      if (!q.length) return;
      if (!S.cur) {
        const sk = q.find((c) => isOpen(c.id));
        goto(dir > 0 ? (sk || q[0]).id : q[q.length - 1].id);
        return;
      }
      const i = q.findIndex((c) => c.id === S.cur);
      goto(q[(i + dir + q.length) % q.length].id);
    }

    /* ---------------- run simulation ---------------- */
    function stepsFor(c, cfg) {
      const s = [];
      if (cfg.enrichment) s.push(D.steps[0]);
      if (cfg.epo) s.push(D.steps[1]);
      s.push(D.steps[2], D.steps[3]);
      if (needsValidation(c, cfg)) s.push(D.steps[4]);
      return s;
    }
    function arrive(c) {
      S.run.processed.push(c.id);
      if (c.risk !== 'Clear' && S.view === 'queue' && !S.cur && !S.skipped.has(c.id)) {
        S.cur = c.id;
        renderStatus(); renderRail(); renderMain();
        return;
      }
      refreshLive();
    }
    function tick() {
      const r = S.run;
      S.runTimer = null;
      if (r.status !== 'running') return;
      const n = r.pool.length;
      if (!r.batch) {
        if (r.i >= n) return finish();
        const c = byId[r.pool[r.i]];
        const steps = stepsFor(c, r.cfg);
        if (r.sub < steps.length) {
          r.step = steps[r.sub]; r.name = c.name; r.sub++;
          renderStatus();
          S.runTimer = later(tick, Math.round(280 / steps.length));
          return;
        }
        r.sub = 0; r.i++;
        arrive(c);
        S.runTimer = later(tick, 16);
        return;
      }
      if (r.phase === 'gather') {
        if (r.i >= n) { r.phase = 'batch'; r.i = 0; r.name = ''; renderStatus(); S.runTimer = later(tick, 900); return; }
        r.name = byId[r.pool[r.i]].name; renderStatus(); r.i++;
        S.runTimer = later(tick, 80);
        return;
      }
      if (r.phase === 'batch') { r.phase = 'read'; r.i = 0; renderStatus(); S.runTimer = later(tick, 16); return; }
      if (r.phase === 'read') {
        if (r.i >= n) {
          r.phase = 'validate'; r.i = 0;
          if (!r.held.length) return finish();
          renderStatus(); S.runTimer = later(tick, 16); return;
        }
        const c = byId[r.pool[r.i]];
        r.name = c.name; r.i++;
        if (needsValidation(c, r.cfg)) { r.held.push(c.id); renderStatus(); }
        else arrive(c);
        S.runTimer = later(tick, 90);
        return;
      }
      // validate
      if (r.i >= r.held.length) return finish();
      const c = byId[r.held[r.i]];
      r.name = c.name;
      renderStatus();
      r.i++;
      S.runTimer = later(() => { arrive(c); S.runTimer = later(tick, 16); }, 420);
    }
    function finish() {
      const r = S.run;
      r.status = 'done';
      if (r.pastId) { const p = S.pastRuns.find((x) => x.id === r.pastId); if (p) p.status = 'complete'; }
      const left = flagged().filter((c) => isOpen(c.id)).length;
      toast('Run complete. ' + (left ? plural(left, 'company still needs', 'companies still need') + ' your call.' : 'Nothing left to review.'));
      renderAll();
    }
    function stopRun() {
      if (S.run.status !== 'running') return;
      cancel(S.runTimer); S.runTimer = null;
      S.run.status = 'stopped';
      // A company in flight is not kept (as with Ctrl-C); restart its steps on resume.
      S.run.sub = 0;
      toast('Run stopped. ' + plural(doneCount(), 'finished company', 'finished companies') + ' kept.');
      renderAll();
    }
    function resumeRun() {
      if (S.run.status !== 'stopped') return;
      S.run.status = 'running';
      if (S.run.batch && S.run.phase === 'validate' && S.run.i > 0 && !S.run.processed.includes(S.run.held[S.run.i - 1])) S.run.i--;
      renderAll();
      tick();
    }
    function startRun(run) {
      cancel(S.runTimer);
      S.run = run;
      S.decisions = {}; S.skipped = new Set(); S.notes = {}; S.undo = [];
      S.view = 'queue'; S.cur = null; S.settledCur = null; S.seen = new Set(); S.lastShown = null;
      renderAll();
      S.runTimer = later(tick, 120);
    }
    function resumePast(id) {
      const p = S.pastRuns.find((x) => x.id === id);
      if (!p) return;
      // Prototype: the companies left in that run are stood in for by the last 13 sample companies.
      const left = p.total - p.done;
      const pool = D.companies.slice(D.companies.length - left).map((c) => c.id);
      closeSheet(false);
      startRun(makeRun({ file: p.file, total: p.total, offset: p.done, pool, cfg: S.cfg, pastId: p.id }));
      toast('Resuming ' + p.file + ' at ' + (p.done + 1) + ' of ' + p.total + '. The first ' + p.done + ' results come from the checkpoint.');
    }

    /* ---------------- new-run sheet ---------------- */
    function sheetHTML() {
      const d = S.draft;
      const prov = providerOf(d);
      const interrupted = S.pastRuns.find((p) => p.status === 'interrupted');
      const n = D.file.rows;
      const e = estimate(d, n);
      const missingName = !d.mapping.company_name;
      const keyMissing = !prov.keySet;
      const headers = D.file.headers;
      const sampleVal = (h) => { const row = D.file.preview[0]; return h && row[h] ? 'e.g. ' + row[h] : h ? 'No example in preview' : 'Not used'; };

      let h = '';
      if (interrupted) {
        h += '<div class="q-resume-card"><span><b>' + esc(interrupted.file) + '</b> stopped at ' + interrupted.done + ' of ' + interrupted.total + ' on ' + esc(interrupted.date) + '.</span>' +
          '<button type="button" class="q-btn q-btn-sm" data-act="resume-past" data-id="' + interrupted.id + '">Resume</button></div>';
      }
      h += '<div><span class="q-field-label">Spreadsheet</span>';
      if (!d.file) {
        h += '<button type="button" class="q-drop" data-act="pick-file" id="q-drop"><strong>Drop an .xlsx or .csv here</strong><span>or click to choose a file</span></button>' +
          '<div class="q-file-row"><button type="button" class="q-btn q-btn-sm" data-act="use-sample">Use the sample file</button><small style="color:var(--text-3);font-size:12px">' + esc(D.file.name) + ', ' + D.file.rows + ' companies</small></div>';
      } else {
        h += '<div class="q-file"><span class="q-file-icon" aria-hidden="true">' + (/\.csv$/i.test(d.file) ? 'CSV' : 'XLSX') + '</span><div><strong>' + esc(d.file) + '</strong><small>' + D.file.rows + ' companies' + (D.file.skipped ? ', ' + D.file.skipped + ' skipped' : '') + ' · ' + headers.length + ' columns' + (d.sample ? '' : ' · sample rows stand in') + '</small></div>' +
          '<button type="button" class="q-btn q-btn-sm q-btn-quiet" data-act="clear-file">Change</button></div>';
      }
      h += '</div>';
      if (d.file) {
        h += '<div><span class="q-field-label">Columns we found</span><div class="q-map">' + FIELDS.map((f) => {
          const val = d.mapping[f.key] || '';
          return '<label class="' + (f.required && !val ? 'is-missing' : '') + '">' + f.label + (f.required ? '' : ' <span style="color:var(--text-3)">(optional)</span>') +
            '<select id="q-map-' + f.key + '" data-map="' + f.key + '"><option value="">' + (f.required ? 'Choose a column' : 'Not in file') + '</option>' +
            headers.map((hd) => '<option' + (hd === val ? ' selected' : '') + '>' + esc(hd) + '</option>').join('') + '</select><small>' + esc(sampleVal(val)) + '</small></label>';
        }).join('') + '</div>' + (missingName ? '<div class="q-warn">Choose the column that holds company names.</div>' : '') + '</div>';
      }
      h += '<div><span class="q-field-label">Model</span><div class="q-seg" role="radiogroup" aria-label="Provider">' + D.providers.map((p) =>
        '<label><input type="radio" name="q-provider" id="q-prov-' + p.id + '" value="' + p.id + '"' + (p.id === d.provider ? ' checked' : '') + '><span>' + p.label +
        '<small class="' + (p.keySet ? '' : 'is-missing') + '">' + (p.keySet ? 'Key set' : 'No API key') + '</small></span></label>').join('') + '</div>' +
        (keyMissing ? '<div class="q-warn">' + prov.keyVar + ' is not set. Add it to .env, or pick another provider.</div>' : '') +
        '<div class="q-seg" role="radiogroup" aria-label="Tier" style="margin-top:8px">' + ['fast', 'balanced', 'best'].map((t) =>
          '<label><input type="radio" name="q-tier" id="q-tier-' + t + '" value="' + t + '"' + (t === d.tier ? ' checked' : '') + '><span>' + t[0].toUpperCase() + t.slice(1) +
          '<small>' + esc(prov.tiers[t]) + ' · ~' + money(D.estCostPerCompany[t]) + '/co.</small></span></label>').join('') + '</div></div>';

      h += '<button type="button" class="q-btn q-btn-quiet q-more-btn" data-act="toggle-more" aria-expanded="' + S.moreOpen + '">' + (S.moreOpen ? 'Fewer settings' : 'More settings') + ' <span aria-hidden="true">' + (S.moreOpen ? '−' : '+') + '</span></button>';
      if (S.moreOpen) {
        const sw = (key, title, sub, disabled) => '<label class="q-switch"><input type="checkbox" id="q-sw-' + key + '" data-sw="' + key + '"' + (d[key] && !disabled ? ' checked' : '') + (disabled ? ' disabled' : '') + '><span class="q-switch-ui" aria-hidden="true"></span><b>' + title + '</b><small>' + sub + '</small></label>';
        const num = (key, label, min, max) => '<label>' + label + '<input type="number" id="q-num-' + key + '" data-num="' + key + '" min="' + min + '" max="' + max + '" value="' + d[key] + '"></label>';
        h += '<div class="q-more">' +
          sw('enrichment', 'Find a current description on the web', 'Replaces the file’s description when a better one is found.') +
          sw('epo', 'Look up patents (EPO)', D.epoKeysSet ? 'EPO keys are set.' : 'EPO keys missing; the run continues without patents.') +
          sw('validator', 'Double-check low-confidence results', 'A second pass searches the web for about <span data-region="valcount">' + e.validated + '</span> of ' + n + ' companies.') +
          sw('batch', 'Batch mode', prov.batch ? 'About half the classifier cost; real batch jobs can take up to an hour.' : prov.label + ' has no batch mode; companies run one at a time.', !prov.batch) +
          '<div class="q-thresh">' + num('validatorThreshold', 'Double-check below (%)', 0, 100) + num('overrideMinConfidence', 'Min. confidence to overturn (%)', 0, 100) +
          num('epoAdjustMax', 'Max patent adjustment (pts)', 0, 30) + num('lowEvidenceCap', 'Cap with no evidence (%)', 0, 100) + '</div></div>';
      }

      return '<div class="q-scrim" data-act="sheet-close"></div>' +
        '<section class="q-sheet" role="dialog" aria-modal="true" aria-labelledby="q-sheet-title">' +
        '<div class="q-sheet-head"><h2 id="q-sheet-title">New run</h2><button type="button" class="q-btn q-btn-sm q-btn-quiet" data-act="sheet-close" aria-label="Close">Close <span class="q-kbd">Esc</span></button></div>' +
        '<div class="q-sheet-body">' + (S.sheetMsg ? '<div class="q-hint" style="margin:0">' + esc(S.sheetMsg) + '</div>' : '') + h + '</div>' +
        '<div class="q-sheet-foot">' + footHTML() + '</div></section>';
    }
    function footHTML() {
      const d = S.draft;
      const n = D.file.rows;
      const e = estimate(d, n);
      const canStart = d.file && d.mapping.company_name && providerOf(d).keySet;
      const replacing = S.run.status !== 'done' || Object.keys(S.decisions).length;
      return '<div class="q-est"><strong>About ' + money(e.cost) + '</strong><span>' + n + ' companies · about ' + e.mins + ' min' + (e.batch ? ' plus batch wait' : '') + '<br>' + esc(modelLabel(d)) + (e.batch ? ', batch' : '') + '</span></div>' +
        '<div class="q-foot-row"><small>' + (replacing ? 'Starts a fresh queue. Download the current workbook first if you need your ' + plural(Object.keys(S.decisions).length, 'decision') + '.' : 'Flagged companies appear in the queue as they are found.') + '</small>' +
        '<button type="button" class="q-btn q-btn-primary" data-act="start"' + (canStart ? '' : ' disabled') + '>Start run</button></div>';
    }
    function renderSheet(isOpening) {
      const layer = R('layer');
      const active = document.activeElement && el.contains(document.activeElement) ? document.activeElement.id : '';
      const body = layer.querySelector('.q-sheet-body');
      const top = body ? body.scrollTop : 0;
      layer.innerHTML = sheetHTML();
      if (!isOpening) {
        // Keep the entrance from replaying on every edit.
        layer.querySelectorAll('.q-scrim, .q-sheet').forEach((n) => { n.style.animation = 'none'; });
        layer.querySelector('.q-sheet-body').scrollTop = top;
        if (active) { const f = layer.querySelector('#' + active); if (f) f.focus(); }
      }
    }
    function openSheet() {
      if (S.sheet) return;
      S.sheet = true;
      S.sheetMsg = '';
      S.sheetReturn = document.activeElement;
      S.draft = Object.assign({}, S.cfg, { mapping: Object.assign({}, S.cfg.mapping) });
      renderSheet(true);
      const first = R('layer').querySelector('.q-sheet-body button, .q-sheet-body input, .q-sheet-body select');
      if (first) first.focus();
    }
    function closeSheet(restoreFocus) {
      if (!S.sheet) return;
      S.sheet = false;
      R('layer').innerHTML = '';
      if (restoreFocus !== false && S.sheetReturn && el.contains(S.sheetReturn)) S.sheetReturn.focus();
      S.sheetReturn = null;
    }
    function loadFile(name, sample, msg) {
      S.draft.file = name; S.draft.sample = sample;
      S.draft.mapping = Object.assign({}, D.file.mapping);
      S.sheetMsg = msg || '';
      renderSheet();
      const sel = R('layer').querySelector('#q-map-company_name');
      if (sel) sel.focus();
    }

    /* ---------------- downloads ---------------- */
    function download() {
      const r = S.run;
      const base = r.file.replace(/\.(xlsx|xls|csv)$/i, '');
      const mine = Object.keys(S.decisions).length;
      const partial = r.status !== 'done' ? ' Partial: ' + doneCount() + ' of ' + r.total + ' companies.' : '';
      toast('Saved ' + base + '_classified_20261113_0942.xlsx with ' + plural(mine, 'decision') + ' of yours in Management View.' + partial);
    }

    /* ---------------- events ---------------- */
    function onClick(e) {
      const t = e.target.closest('[data-act]');
      if (!t || !el.contains(t) || t.disabled) return;
      const act = t.dataset.act, id = t.dataset.id;
      switch (act) {
        case 'decide': decide(t.dataset.v); break;
        case 'skip': skip(); break;
        case 'undo': undo(); break;
        case 'prev': move(-1); break;
        case 'next': move(1); break;
        case 'goto': goto(id); break;
        case 'goto-settled': gotoSettled(id); break;
        case 'settled-first': { const st = settled(); if (st.length) gotoSettled(st[0].id); break; }
        case 'toggle-settled': S.settledOpen = !S.settledOpen; renderRail(); break;
        case 'overturn': if (S.settledCur) decide(other(byId[S.settledCur].verdict)); break;
        case 'restore': restore(); break;
        case 'back-queue': backToQueue(); break;
        case 'download': download(); break;
        case 'stop': stopRun(); break;
        case 'resume': resumeRun(); break;
        case 'resume-past': resumePast(id); break;
        case 'sheet-open': openSheet(); break;
        case 'sheet-close': closeSheet(); break;
        case 'pick-file': loadFile(D.file.name, true, 'Choosing a file is simulated here, so the sample file was loaded.'); break;
        case 'use-sample': loadFile(D.file.name, true); break;
        case 'clear-file': S.draft.file = null; S.sheetMsg = ''; renderSheet(); { const z = R('layer').querySelector('#q-drop'); if (z) z.focus(); } break;
        case 'toggle-more': S.moreOpen = !S.moreOpen; renderSheet(); { const b = R('layer').querySelector('[data-act="toggle-more"]'); if (b) b.focus(); } break;
        case 'start': {
          S.cfg = S.draft;
          const run = makeRun({ file: S.cfg.file, total: D.file.rows, pool: D.companies.map((c) => c.id), cfg: S.cfg });
          closeSheet(false);
          startRun(run);
          toast('Run started. Flagged companies will open here as they are found.');
          break;
        }
      }
    }
    function backToQueue() {
      S.view = 'queue';
      if (S.cur && !flagged().some((c) => c.id === S.cur)) S.cur = null;
      renderRail(); renderMain();
    }
    function onChange(e) {
      const t = e.target;
      if (!S.sheet || !R('layer').contains(t)) return;
      const d = S.draft;
      if (t.dataset.map) d.mapping[t.dataset.map] = t.value;
      else if (t.name === 'q-provider') d.provider = t.value;
      else if (t.name === 'q-tier') d.tier = t.value;
      else if (t.dataset.sw) d[t.dataset.sw] = t.checked;
      else if (t.dataset.num) {
        const v = Math.round(Number(t.value));
        const min = Number(t.min), max = Number(t.max);
        d[t.dataset.num] = isFinite(v) ? Math.min(max, Math.max(min, v)) : d[t.dataset.num];
        t.value = d[t.dataset.num];
        // Update only the dependent text, so tabbing out of the field is not disturbed.
        R('layer').querySelector('.q-sheet-foot').innerHTML = footHTML();
        const vc = R('layer').querySelector('[data-region="valcount"]');
        if (vc) vc.textContent = estimate(d, D.file.rows).validated;
        return;
      } else return;
      renderSheet();
    }
    function onInput(e) {
      const t = e.target;
      if (t.id === 'q-note') {
        const id = t.dataset.id;
        S.notes[id] = t.value;
        if (S.decisions[id]) S.decisions[id].note = t.value.trim();
      }
    }
    function onDrag(e) {
      const z = e.target.closest && e.target.closest('.q-drop');
      if (!z) return;
      e.preventDefault();
      if (e.type === 'dragover') z.classList.add('is-over');
      else if (e.type === 'dragleave') z.classList.remove('is-over');
      else if (e.type === 'drop') {
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        loadFile(f ? f.name : D.file.name, !f, f ? 'Files are not read in this prototype; the sample rows stand in for ' + f.name + '.' : '');
      }
    }
    function trapTab(e) {
      const nodes = [...R('layer').querySelectorAll('.q-sheet button:not(:disabled), .q-sheet input:not(:disabled), .q-sheet select, .q-sheet textarea')];
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!R('layer').contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }
    function onKey(e) {
      if (S.sheet) {
        if (e.key === 'Escape') { e.preventDefault(); closeSheet(); }
        else if (e.key === 'Tab') trapTab(e);
        return;
      }
      const t = e.target;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) {
        if (e.key === 'Escape' && t.id === 'q-note') { e.preventDefault(); t.blur(); }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const onCase = (S.view === 'queue' && S.cur) || (S.view === 'settled' && S.settledCur);
      let handled = true;
      if (k === 'j') move(1);
      else if (k === 'k') move(-1);
      else if (k === 'u') undo();
      else if (k === 'n' && onCase) { const ta = el.querySelector('#q-note'); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }
      else if (S.view === 'queue' && S.cur && k === 'd') decide('deep tech');
      else if (S.view === 'queue' && S.cur && k === 'g') decide('general tech');
      else if (S.view === 'queue' && S.cur && k === 's') skip();
      else if (S.view === 'settled' && S.settledCur && k === 'o' && !S.decisions[S.settledCur]) decide(other(byId[S.settledCur].verdict));
      else if (S.view === 'settled' && k === 'Escape') backToQueue();
      else handled = false;
      if (handled) e.preventDefault();
    }

    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    el.addEventListener('input', onInput);
    el.addEventListener('dragover', onDrag);
    el.addEventListener('dragleave', onDrag);
    el.addEventListener('drop', onDrag);
    document.addEventListener('keydown', onKey);

    // Opening state: the sample run is done; the first escalated case is on screen.
    S.cur = flagged()[0] ? flagged()[0].id : null;
    flagged().forEach((c) => S.seen.add(c.id));
    renderAll();

    return function cleanup() {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      document.removeEventListener('keydown', onKey);
      el.removeEventListener('click', onClick);
      el.removeEventListener('change', onChange);
      el.removeEventListener('input', onInput);
      el.removeEventListener('dragover', onDrag);
      el.removeEventListener('dragleave', onDrag);
      el.removeEventListener('drop', onDrag);
    };
  }

  window.PROTO_VARIANTS.queue = { css, render, init };
})();
