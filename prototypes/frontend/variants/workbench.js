/* Workbench variant: a dense, everything-on-one-screen analyst workbench.
   Left rail of runs, central sortable/filterable results table with a live
   summary strip, a resizable evidence panel (with a reading view) where any
   finished company can be reviewed or reclassified, a command menu and a
   keyboard cheat sheet. A new run is set up in the table itself: the dropped
   spreadsheet becomes the main table, mapped in its headers and started from an
   action bar, with a settings popover and an analyst sheet for the rest. */
(function () {
  'use strict';

  /* Compact chrome for the main column: used in reading view and whenever the
     main column is narrow (same threshold as the table's list layout). */
  const compact = (P) => `
${P} .wb-head { padding: 8px 12px; }
${P} .wb-head-meta, ${P} .wb-cfg, ${P} .wb-notice, ${P} .wb-prog-t, ${P} .wb-head [data-act="rerun"], ${P} .wb-l-long, ${P} .wb-hist, ${P} .wb-strip-sep, ${P} .wb-stat.is-extra, ${P} .wb-stat-s, ${P} .wb-chips, ${P} .wb-tools-r { display: none; }
${P} .wb-l-short { display: inline; }
${P} .wb-head-row { align-items: center; gap: 8px; }
${P} .wb-head h1 { font-size: 14px; }
${P} .wb-head-acts { flex-wrap: nowrap; max-width: none; }
${P} .wb-prog { margin-top: 6px; }
${P} .wb-prog-bar { flex: 1 1 auto; }
${P} .wb-strip { flex-wrap: nowrap; padding: 0 6px; overflow: hidden; }
${P} .wb-stat { flex-direction: row; align-items: baseline; gap: 5px; padding: 4px 7px; margin: 3px 0; }
${P} .wb-stat-v { font-size: 14px; }
${P} .wb-tools { padding: 6px 10px; gap: 6px; }
${P} .wb-search { flex: 1 1 140px; min-width: 0; }
${P} .wb-filt-tg { display: inline-flex; }
${P} .wb-tools.is-open .wb-chips { display: flex; flex-basis: 100%; }
${P} .wb-chipgrp { flex-wrap: wrap; }
`;

  const css = `
.v-workbench { --wb-rail: 200px; --wb-detail: 480px; position: relative; display: grid; grid-template-columns: var(--wb-rail) minmax(0, 1fr) min(var(--wb-detail), calc((100% - var(--wb-rail)) * 0.6)); height: 100%; overflow: hidden; background: var(--bg); color: var(--text); font: 13px/1.4 var(--font); }
@media (min-width: 1600px) { .v-workbench { --wb-detail: 540px; } }
@media (max-width: 1299px) { .v-workbench { --wb-rail: 176px; --wb-detail: 380px; } }
@media (max-width: 1099px) { .v-workbench { --wb-rail: 160px; --wb-detail: 340px; } }
.v-workbench.is-reading { grid-template-columns: var(--wb-rail) minmax(0, 1fr) calc((100% - var(--wb-rail)) * 0.65); }
.v-workbench.is-resizing { cursor: col-resize; user-select: none; -webkit-user-select: none; }
.v-workbench .wb-num { font-variant-numeric: tabular-nums; }
.v-workbench .wb-mono { font-family: var(--mono); font-size: 12px; }
.v-workbench .wb-muted { color: var(--text-3); }
.v-workbench .wb-dim { color: var(--text-2); }
.v-workbench :focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.v-workbench h1, .v-workbench h2, .v-workbench h3, .v-workbench p, .v-workbench ol, .v-workbench ul { margin: 0; }
.v-workbench kbd { display: inline-block; font: 10.5px/1 var(--mono); padding: 2px 4px; min-width: 16px; text-align: center; border: 1px solid var(--border-strong); border-bottom-width: 2px; border-radius: 4px; background: var(--surface); color: var(--text-2); }
.v-workbench .wb-btn-primary kbd { background: rgba(255,255,255,.16); border-color: rgba(255,255,255,.35); color: #fff; }

/* Buttons */
.v-workbench .wb-btn { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); background: var(--surface); color: var(--text); font-weight: 500; font-size: 13px; cursor: pointer; white-space: nowrap; transition: transform 120ms var(--ease-out); }
.v-workbench .wb-btn:hover { background: var(--surface-2); }
.v-workbench .wb-btn:active { transform: scale(0.97); }
.v-workbench .wb-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; background: var(--surface); }
.v-workbench .wb-btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.v-workbench .wb-btn-primary:hover { background: var(--accent); filter: brightness(1.08); }
.v-workbench .wb-btn-primary:disabled { background: var(--accent); filter: none; }
.v-workbench .wb-btn-ghost { border-color: transparent; background: transparent; color: var(--text-2); }
.v-workbench .wb-btn-ghost:hover { background: var(--surface-2); color: var(--text); }
.v-workbench .wb-btn-sm { height: 26px; padding: 0 8px; font-size: 12px; }
.v-workbench .wb-btn-stop { color: var(--error); }

/* Rail */
.v-workbench .wb-rail { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--border); background: var(--surface-2); }
.v-workbench .wb-rail-top { padding: 14px 12px 10px; }
.v-workbench .wb-brand { font-size: 12px; font-weight: 600; color: var(--text-2); margin-bottom: 10px; }
.v-workbench .wb-newrun { width: 100%; justify-content: center; height: 32px; }
.v-workbench .wb-rail-list { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 8px 12px; }
.v-workbench .wb-rail-h { font-size: 11px; font-weight: 600; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; padding: 10px 6px 4px; }
.v-workbench .wb-runitem { display: block; width: 100%; text-align: left; border: 1px solid transparent; background: transparent; border-radius: var(--radius-s); padding: 7px 8px; cursor: pointer; color: var(--text); }
.v-workbench .wb-runitem:hover { background: var(--surface); }
.v-workbench .wb-runitem[aria-current="true"] { background: var(--surface); border-color: var(--border-strong); box-shadow: var(--shadow-1); }
.v-workbench .wb-runitem-f { display: block; font-weight: 600; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v-workbench .wb-runitem-m { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-2); margin-top: 2px; }
.v-workbench .wb-runitem-d { display: block; font-size: 11px; color: var(--text-3); margin-top: 1px; }
.v-workbench .wb-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-3); flex: none; }
.v-workbench .wb-dot.is-running { background: var(--accent); animation: workbench-pulse 1s ease-in-out infinite alternate; }
.v-workbench .wb-dot.is-stopped { background: var(--escalate); }
.v-workbench .wb-dot.is-complete { background: var(--deep); }
.v-workbench .wb-minibar { display: block; height: 3px; border-radius: 2px; background: var(--border); margin-top: 5px; overflow: hidden; }
.v-workbench .wb-minibar > span { display: block; height: 100%; background: var(--accent); transform-origin: left center; }
.v-workbench .wb-minibar.is-stopped > span { background: var(--escalate); }
.v-workbench .wb-rail-foot { border-top: 1px solid var(--border); padding: 10px 12px 12px; font-size: 11.5px; color: var(--text-2); }
.v-workbench .wb-keys-h { font-size: 11px; font-weight: 600; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
.v-workbench .wb-keyrow { display: flex; justify-content: space-between; align-items: center; padding: 1.5px 0; }
.v-workbench .wb-keyok { color: var(--deep); }
.v-workbench .wb-keymiss { color: var(--escalate); }
.v-workbench .wb-foot-btns { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; }
.v-workbench .wb-foot-btns .wb-btn { justify-content: space-between; width: 100%; }

/* Main column */
.v-workbench .wb-main { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; container: wbmain / inline-size; }
.v-workbench .wb-h1-f { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.v-workbench .wb-l-short, .v-workbench .wb-filt-tg { display: none; }
.v-workbench .wb-head { padding: 12px 16px 10px; border-bottom: 1px solid var(--border); background: var(--surface); }
.v-workbench .wb-head-row { display: flex; align-items: flex-start; gap: 12px; }
.v-workbench .wb-head-t { flex: 1; min-width: 0; }
.v-workbench .wb-head h1 { font-size: 15px; font-weight: 650; display: flex; align-items: center; gap: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.v-workbench .wb-head-meta { display: flex; flex-wrap: wrap; gap: 4px 10px; color: var(--text-2); font-size: 12px; margin-top: 3px; }
.v-workbench .wb-head-acts { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; flex: none; max-width: 60%; }
.v-workbench .wb-status { font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 999px; background: var(--general-soft); color: var(--text-2); }
.v-workbench .wb-status.is-running { background: var(--accent-soft); color: var(--accent); }
.v-workbench .wb-status.is-stopped { background: var(--escalate-soft); color: var(--escalate); }
.v-workbench .wb-status.is-complete { background: var(--deep-soft); color: var(--deep); }
.v-workbench .wb-cfg { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 7px; }
.v-workbench .wb-cfgtag { font-size: 11px; padding: 1px 6px; border: 1px solid var(--border); border-radius: 4px; color: var(--text-2); background: var(--surface); }
.v-workbench .wb-cfgtag.is-off { color: var(--text-3); text-decoration: line-through; }
.v-workbench .wb-prog { display: flex; align-items: center; gap: 10px; margin-top: 9px; font-size: 12px; color: var(--text-2); }
.v-workbench .wb-prog-bar { flex: 0 0 160px; height: 4px; border-radius: 2px; background: var(--border); overflow: hidden; }
.v-workbench .wb-prog-bar > span { display: block; height: 100%; background: var(--accent); transform-origin: left center; transition: transform 200ms var(--ease-out); }
.v-workbench .wb-prog-t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v-workbench .wb-notice { margin-top: 9px; padding: 7px 10px; border-radius: var(--radius-s); background: var(--escalate-soft); color: var(--text); font-size: 12px; }

/* Summary strip */
.v-workbench .wb-strip { display: flex; flex-wrap: wrap; align-items: stretch; border-bottom: 1px solid var(--border); background: var(--surface); padding: 0 8px; }
.v-workbench .wb-stat { display: flex; flex-direction: column; justify-content: center; text-align: left; min-width: 0; padding: 6px 10px; border: 0; background: transparent; border-radius: var(--radius-s); color: var(--text); cursor: pointer; margin: 4px 0; }
.v-workbench button.wb-stat:hover { background: var(--surface-2); }
.v-workbench .wb-stat[aria-pressed="true"] { background: var(--accent-soft); }
.v-workbench div.wb-stat { cursor: default; }
.v-workbench .wb-stat-l { font-size: 11px; color: var(--text-3); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
.v-workbench .wb-stat-v { font-size: 19px; font-weight: 600; line-height: 1.2; font-variant-numeric: tabular-nums; white-space: nowrap; }
.v-workbench .wb-stat-v small { font-size: 12px; font-weight: 500; color: var(--text-3); }
.v-workbench .wb-stat-v.is-deep { color: var(--deep); }
.v-workbench .wb-stat-v.is-review { color: var(--escalate); }
.v-workbench .wb-stat-s { font-size: 11px; color: var(--text-2); white-space: nowrap; font-variant-numeric: tabular-nums; }
.v-workbench .wb-strip-sep { width: 1px; background: var(--border); margin: 10px 4px; flex: none; }
.v-workbench .wb-hist { margin-left: auto; padding: 6px 8px 6px 12px; flex: none; }
.v-workbench .wb-hist-bars { position: relative; display: flex; align-items: flex-end; gap: 2px; height: 32px; width: 150px; }
.v-workbench .wb-bin { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; border: 0; padding: 0; background: transparent; cursor: pointer; border-radius: 2px; }
.v-workbench .wb-bin:hover { background: var(--surface-2); }
.v-workbench .wb-bin[aria-pressed="true"] { background: var(--accent-soft); box-shadow: inset 0 -2px 0 var(--accent); }
.v-workbench .wb-bin:disabled { cursor: default; background: transparent; }
.v-workbench .wb-bin-g { display: block; background: var(--border-strong); border-radius: 1px 1px 0 0; }
.v-workbench .wb-bin-d { display: block; background: var(--deep); }
.v-workbench .wb-hist-th { position: absolute; top: -3px; bottom: 0; width: 0; border-left: 1px dashed var(--escalate); pointer-events: none; }
.v-workbench .wb-hist-ax { display: flex; justify-content: space-between; width: 150px; font-size: 10px; color: var(--text-3); margin-top: 2px; font-variant-numeric: tabular-nums; }
.v-workbench .wb-sw { display: inline-block; width: 7px; height: 7px; border-radius: 1px; margin-right: 3px; }

/* Toolbar */
.v-workbench .wb-tools { display: flex; align-items: center; gap: 8px 10px; padding: 8px 16px; border-bottom: 1px solid var(--border); background: var(--bg); flex-wrap: wrap; }
.v-workbench .wb-tools[hidden] { display: none; }
.v-workbench .wb-search { position: relative; flex: 0 1 220px; min-width: 150px; }
.v-workbench .wb-search input { width: 100%; height: 28px; padding: 0 28px 0 9px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); background: var(--surface); font-size: 13px; }
.v-workbench .wb-search kbd { position: absolute; right: 7px; top: 6px; pointer-events: none; }
.v-workbench .wb-chips { display: flex; align-items: center; gap: 4px 6px; flex-wrap: wrap; flex: 1; min-width: 0; }
.v-workbench .wb-chipgrp { display: inline-flex; align-items: center; gap: 3px; margin-right: 4px; }
.v-workbench .wb-chipgrp-l { font-size: 11px; color: var(--text-3); margin-right: 2px; }
.v-workbench .wb-chip { height: 24px; padding: 0 8px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); font-size: 12px; color: var(--text-2); cursor: pointer; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.v-workbench .wb-chip:hover { border-color: var(--border-strong); color: var(--text); }
.v-workbench .wb-chip[aria-pressed="true"] { background: var(--text); border-color: var(--text); color: var(--surface); }
.v-workbench .wb-chip-n { font-variant-numeric: tabular-nums; opacity: 0.7; }
.v-workbench .wb-tools-r { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-2); white-space: nowrap; margin-left: auto; }

/* Table. Column sets follow the table's own width (container queries):
   <500 list | 500 compact | 560 +criteria | 620 +patents | 680 +cost | 800 roomy | 960 wide.
   Reading view always uses the list set. Widths include cell padding. */
.v-workbench .wb-tablewrap { flex: 1; min-height: 0; overflow: auto; background: var(--surface); container: wbtable / inline-size; }
.v-workbench .wb-table { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; font-size: 13px; }
.v-workbench .wb-table th { position: sticky; top: 0; z-index: 1; background: var(--surface-2); border-bottom: 1px solid var(--border-strong); height: 30px; padding: 0; text-align: left; font-weight: 600; font-size: 11px; color: var(--text-2); text-transform: uppercase; letter-spacing: 0.03em; white-space: nowrap; overflow: hidden; }
.v-workbench .wb-th { display: flex; align-items: center; gap: 3px; width: 100%; height: 30px; padding: 0 6px; border: 0; background: transparent; font: inherit; text-transform: inherit; letter-spacing: inherit; color: inherit; cursor: pointer; overflow: hidden; }
.v-workbench .wb-th:hover { color: var(--text); }
.v-workbench .wb-th.is-r { justify-content: flex-end; }
.v-workbench .wb-th.is-c { justify-content: center; cursor: default; }
.v-workbench .wb-th-ar { font-size: 9px; color: var(--accent); width: 7px; flex: none; }
.v-workbench .wb-table td { height: 31px; padding: 0 6px; border-bottom: 1px solid var(--border); white-space: nowrap; vertical-align: middle; overflow: hidden; text-overflow: ellipsis; }
.v-workbench .wb-table td.wb-stepcell { overflow: visible; }
.v-workbench .wb-table tbody tr { cursor: pointer; }
.v-workbench .wb-table tbody tr:hover td { background: var(--surface-2); }
.v-workbench .wb-table tbody tr[aria-selected="true"] td { background: var(--accent-soft); }
.v-workbench .wb-table tbody tr[aria-selected="true"] td:first-child { box-shadow: inset 3px 0 0 var(--accent); }
.v-workbench .wb-table .is-r { text-align: right; font-variant-numeric: tabular-nums; }
.v-workbench .wb-table .is-c { text-align: center; }
.v-workbench .wb-table td.wb-idx { color: var(--text-3); font-size: 12px; }
.v-workbench .wb-w-idx { width: 28px; } .v-workbench .wb-w-verdict { width: 24px; } .v-workbench .wb-w-conf { width: 48px; }
.v-workbench .wb-w-crit { width: 58px; } .v-workbench .wb-w-risk { width: 84px; } .v-workbench .wb-w-action { width: 34px; }
.v-workbench .wb-w-patents { width: 48px; } .v-workbench .wb-w-cost { width: 56px; }
.v-workbench .wb-table .wb-c-crit, .v-workbench .wb-table .wb-c-patents, .v-workbench .wb-table .wb-c-cost { display: none; }
.v-workbench .wb-table .wb-vtxt, .v-workbench .wb-table .wb-was, .v-workbench .wb-table .wb-was-t, .v-workbench .wb-table .wb-conf-t, .v-workbench .wb-table .wb-act, .v-workbench .wb-table .wb-revtag-t, .v-workbench .wb-table .wb-co-d, .v-workbench .wb-table .wb-th-l, .v-workbench .wb-table .wb-th-s { display: none; }
.v-workbench .wb-table .wb-th-t { display: inline; }
@container wbtable (min-width: 500px) {
  .v-workbench .wb-w-verdict { width: 110px; } .v-workbench .wb-w-conf { width: 64px; } .v-workbench .wb-w-action { width: 112px; }
  .v-workbench .wb-table .wb-vtxt, .v-workbench .wb-table .wb-act { display: inline; }
  .v-workbench .wb-table .wb-was { display: inline-flex; }
  .v-workbench .wb-table .wb-conf-t { display: block; }
  .v-workbench .wb-table .wb-th-t { display: none; } .v-workbench .wb-table .wb-th-s { display: inline; }
  .v-workbench .wb-table .wb-revtag { margin-left: 4px; }
}
@container wbtable (min-width: 560px) { .v-workbench .wb-table .wb-c-crit { display: table-cell; } }
@container wbtable (min-width: 620px) { .v-workbench .wb-table .wb-c-patents { display: table-cell; } }
@container wbtable (min-width: 680px) { .v-workbench .wb-table .wb-c-cost { display: table-cell; } }
@container wbtable (min-width: 800px) {
  .v-workbench .wb-table td { padding: 0 8px; } .v-workbench .wb-th { padding: 0 8px; }
  .v-workbench .wb-w-idx { width: 34px; } .v-workbench .wb-w-verdict { width: 118px; } .v-workbench .wb-w-conf { width: 76px; }
  .v-workbench .wb-w-crit { width: 68px; } .v-workbench .wb-w-risk { width: 92px; } .v-workbench .wb-w-action { width: 116px; }
  .v-workbench .wb-w-patents { width: 80px; } .v-workbench .wb-w-cost { width: 66px; }
  .v-workbench .wb-table .wb-th-s { display: none; } .v-workbench .wb-table .wb-th-l { display: inline; }
}
@container wbtable (min-width: 960px) {
  .v-workbench .wb-w-verdict { width: 190px; } .v-workbench .wb-w-action { width: 150px; }
  .v-workbench .wb-table .wb-was-g { display: none; } .v-workbench .wb-table .wb-was-t { display: inline; }
  .v-workbench .wb-table .wb-revtag-t { display: inline; } .v-workbench .wb-table .wb-co-d { display: block; }
}
.v-workbench.is-reading .wb-table td { padding: 0 6px; } .v-workbench.is-reading .wb-th { padding: 0 6px; }
.v-workbench.is-reading .wb-w-idx { width: 28px; } .v-workbench.is-reading .wb-w-verdict { width: 24px; } .v-workbench.is-reading .wb-w-conf { width: 48px; }
.v-workbench.is-reading .wb-w-risk { width: 84px; } .v-workbench.is-reading .wb-w-action { width: 34px; } .v-workbench.is-reading .wb-table .wb-revtag { margin-left: 0; }
.v-workbench.is-reading .wb-table .wb-c-crit, .v-workbench.is-reading .wb-table .wb-c-patents, .v-workbench.is-reading .wb-table .wb-c-cost { display: none; }
.v-workbench.is-reading .wb-table .wb-vtxt, .v-workbench.is-reading .wb-table .wb-was, .v-workbench.is-reading .wb-table .wb-conf-t, .v-workbench.is-reading .wb-table .wb-act, .v-workbench.is-reading .wb-table .wb-revtag-t, .v-workbench.is-reading .wb-table .wb-co-d, .v-workbench.is-reading .wb-table .wb-th-l, .v-workbench.is-reading .wb-table .wb-th-s { display: none; }
.v-workbench.is-reading .wb-table .wb-th-t { display: inline; }
@container wbmain (max-width: 519px) {${compact('.v-workbench')}}
${compact('.v-workbench.is-reading')}
.v-workbench .wb-rowbtn { display: block; flex: 0 1 auto; min-width: 0; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border: 0; padding: 0; background: transparent; font: inherit; font-weight: 550; color: var(--text); cursor: pointer; text-align: left; scroll-margin: 34px 0 76px; }
.v-workbench .wb-rowbtn:focus-visible { outline-offset: 2px; border-radius: 2px; }
.v-workbench .wb-co { display: flex; align-items: baseline; gap: 8px; min-width: 0; overflow: hidden; }
.v-workbench .wb-co-d { flex: 1 1 0; min-width: 0; color: var(--text-3); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.v-workbench .wb-verdict { display: inline-flex; align-items: center; gap: 6px; font-weight: 500; vertical-align: middle; }
.v-workbench .wb-verdict::before { content: ""; flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--general); }
.v-workbench .wb-verdict.is-deep { color: var(--deep); }
.v-workbench .wb-verdict.is-deep::before { background: var(--deep); }
.v-workbench .wb-verdict.is-gen { color: var(--text-2); }
.v-workbench .wb-verdict.is-gen::before { background: transparent; box-shadow: inset 0 0 0 1.5px var(--general); }
.v-workbench .wb-was { align-items: center; gap: 3px; margin-left: 5px; font-size: 10.5px; color: var(--accent); vertical-align: middle; }
.v-workbench .wb-conf { display: inline-flex; align-items: center; gap: 6px; justify-content: flex-end; }
.v-workbench .wb-conf-t { width: 28px; height: 4px; border-radius: 2px; background: var(--general-soft); overflow: hidden; }
.v-workbench .wb-conf-t > span { display: block; height: 100%; background: var(--text-3); transform-origin: left center; }
.v-workbench .wb-conf-t.is-low > span { background: var(--contested); }
.v-workbench .wb-conf.is-muted { color: var(--text-3); }
.v-workbench .wb-conf.is-muted .wb-conf-t > span { background: var(--border-strong); }
.v-workbench .wb-conf-n { width: 22px; text-align: right; }
.v-workbench .wb-mks { display: inline-flex; gap: 2px; }
.v-workbench .wb-mk { width: 14px; height: 14px; border-radius: 3px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; line-height: 1; flex: none; }
.v-workbench .wb-mk.is-y { background: var(--deep-soft); color: var(--deep); }
.v-workbench .wb-mk.is-n { background: transparent; color: var(--text-3); box-shadow: inset 0 0 0 1px var(--border-strong); }
.v-workbench .wb-risk { display: inline-block; font-size: 11.5px; font-weight: 600; padding: 1px 5px; border-radius: 4px; }
.v-workbench .wb-risk.r-Clear { color: var(--text-3); font-weight: 500; padding-left: 0; }
.v-workbench .wb-risk.r-Uncertain { background: var(--uncertain-soft); color: var(--uncertain); }
.v-workbench .wb-risk.r-Contested { background: var(--contested-soft); color: var(--contested); }
.v-workbench .wb-risk.r-Escalate { background: var(--escalate-soft); color: var(--escalate); }
.v-workbench .wb-act { font-size: 12.5px; color: var(--text-2); }
.v-workbench .wb-act.is-review { color: var(--text); font-weight: 600; }
.v-workbench .wb-act.is-review::before { content: ""; display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--escalate); margin-right: 6px; vertical-align: 1px; }
.v-workbench .wb-revtag { font-size: 10.5px; font-weight: 600; color: var(--deep); background: var(--deep-soft); border-radius: 3px; padding: 0 4px; margin-left: 4px; white-space: nowrap; }
.v-workbench .wb-table .wb-revtag { margin-left: 0; }
.v-workbench .wb-revtag.is-re { color: var(--accent); background: var(--accent-soft); }
.v-workbench .wb-step { display: inline-flex; align-items: center; gap: 7px; color: var(--accent); font-size: 12.5px; }
.v-workbench .wb-step::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: workbench-pulse 0.8s ease-in-out infinite alternate; }
.v-workbench .wb-step.is-wait { color: var(--text-2); }
.v-workbench .wb-step.is-wait::before { background: var(--text-3); animation: none; }
.v-workbench .wb-queued { color: var(--text-3); font-size: 12.5px; }
.v-workbench tr.is-pending .wb-rowbtn { color: var(--text-2); font-weight: 500; }
.v-workbench .wb-land { animation: workbench-land 240ms var(--ease-out) both; }
.v-workbench .wb-empty { padding: 48px 24px 96px; text-align: center; color: var(--text-2); }
.v-workbench .wb-empty h2 { font-size: 15px; color: var(--text); margin-bottom: 6px; }
.v-workbench .wb-empty .wb-btn { margin-top: 12px; }
.v-workbench .wb-tablepad { height: 76px; }

/* Summary-only runs */
.v-workbench .wb-arch { max-width: 560px; margin: 40px auto 96px; padding: 0 24px; }
.v-workbench .wb-arch h2 { font-size: 15px; margin-bottom: 6px; }
.v-workbench .wb-arch p { color: var(--text-2); margin-bottom: 12px; }
.v-workbench .wb-arch-bar { height: 6px; border-radius: 3px; background: var(--border); overflow: hidden; margin: 14px 0 6px; }
.v-workbench .wb-arch-bar > span { display: block; height: 100%; background: var(--escalate); transform-origin: left center; transition: transform 200ms var(--ease-out); }
.v-workbench .wb-arch-bar.is-running > span { background: var(--accent); }
.v-workbench .wb-arch-bar.is-complete > span { background: var(--deep); }
.v-workbench .wb-arch-acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }

/* Side panel + divider */
.v-workbench .wb-side { position: relative; display: flex; min-width: 0; min-height: 0; }
.v-workbench .wb-divider { position: absolute; left: -4px; top: 0; bottom: 0; width: 9px; z-index: 6; cursor: col-resize; touch-action: none; }
.v-workbench .wb-divider::after { content: ""; position: absolute; left: 3px; top: 0; bottom: 0; width: 3px; background: transparent; }
.v-workbench .wb-divider:hover::after, .v-workbench .wb-divider:focus-visible::after, .v-workbench.is-resizing .wb-divider::after { background: var(--accent); }
.v-workbench .wb-divider:focus-visible { outline: none; }
.v-workbench.is-reading .wb-divider { display: none; }
.v-workbench .wb-detail { flex: 1; min-width: 0; border-left: 1px solid var(--border); background: var(--surface); overflow-y: auto; container: wbdetail / inline-size; }
.v-workbench .wb-d { padding-bottom: 96px; }
.v-workbench .wb-d-top { position: sticky; top: 0; z-index: 3; background: var(--surface); border-bottom: 1px solid var(--border); padding: 12px 20px 10px; }
.v-workbench .wb-d-row1 { display: flex; align-items: flex-start; gap: 10px; }
.v-workbench .wb-d-row1 > div { flex: 1; min-width: 0; }
.v-workbench .wb-d-row1 h2 { font-size: 16px; font-weight: 650; line-height: 1.25; overflow-wrap: anywhere; }
.v-workbench .wb-d-sub { display: flex; flex-wrap: wrap; gap: 2px 8px; color: var(--text-2); font-size: 12px; margin-top: 2px; }
.v-workbench .wb-d-row2 { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-top: 8px; font-size: 12.5px; }
.v-workbench .wb-d-row2 .wb-verdict { font-size: 14px; font-weight: 650; }
.v-workbench .wb-was-full { font-size: 12px; color: var(--accent); }
.v-workbench .wb-d-conf { color: var(--text-2); font-variant-numeric: tabular-nums; }
.v-workbench .wb-d-conf b { font-size: 15px; color: var(--text); font-weight: 650; }
.v-workbench .wb-ds { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 10px; }
.v-workbench .wb-ds-t { flex: 1 1 160px; min-width: 0; font-size: 12.5px; color: var(--text-2); }
.v-workbench .wb-ds-t b { color: var(--text); font-weight: 600; }
.v-workbench .wb-form { margin-top: 10px; padding: 10px; border: 1px solid var(--border-strong); border-radius: var(--radius-m); background: var(--bg); }
.v-workbench .wb-seg { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.v-workbench .wb-seg label { display: flex; align-items: center; gap: 7px; padding: 6px 9px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); cursor: pointer; font-size: 12.5px; font-weight: 500; background: var(--surface); transition: transform 120ms var(--ease-out); }
.v-workbench .wb-seg label:hover { background: var(--surface-2); }
.v-workbench .wb-seg label:active { transform: scale(0.98); }
.v-workbench .wb-seg label:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); }
.v-workbench .wb-seg label:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 1px; }
.v-workbench .wb-seg input { margin: 0; accent-color: var(--accent); }
.v-workbench .wb-form textarea { display: block; width: 100%; margin-top: 8px; min-height: 54px; resize: vertical; padding: 6px 8px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); background: var(--surface); font-size: 13px; line-height: 1.45; }
.v-workbench .wb-form-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin-top: 8px; }
.v-workbench .wb-form-why { flex: 1 1 180px; font-size: 12px; color: var(--escalate); }
.v-workbench .wb-form-why.is-ok { color: var(--text-3); }
.v-workbench .wb-doc { padding: 0 20px; }
.v-workbench .wb-doc-facts { display: none; }
.v-workbench .wb-flag { margin-top: 14px; padding: 10px 12px; border-radius: var(--radius-m); background: var(--surface-2); border-left: 3px solid var(--border-strong); font-size: 13.5px; line-height: 1.5; max-width: 68ch; }
.v-workbench .wb-flag.r-Uncertain { background: var(--uncertain-soft); border-left-color: var(--uncertain); }
.v-workbench .wb-flag.r-Contested { background: var(--contested-soft); border-left-color: var(--contested); }
.v-workbench .wb-flag.r-Escalate { background: var(--escalate-soft); border-left-color: var(--escalate); }
.v-workbench .wb-flag.r-Reclass { background: var(--surface-2); border-left-color: var(--accent); }
.v-workbench .wb-flag-t { font-weight: 650; margin-bottom: 2px; }
.v-workbench .wb-flag p + p { margin-top: 5px; }
.v-workbench .wb-sec { margin-top: 18px; }
.v-workbench .wb-sec-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 0 6px; font-size: 11px; font-weight: 650; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; }
.v-workbench .wb-sec-btn { display: inline-flex; align-items: center; gap: 6px; border: 0; background: transparent; padding: 2px 4px 2px 0; font: inherit; color: var(--text-2); text-transform: inherit; letter-spacing: inherit; cursor: pointer; border-radius: 3px; }
.v-workbench .wb-sec-btn:hover { color: var(--text); }
.v-workbench .wb-caret { display: inline-block; width: 10px; font-size: 10px; color: var(--text-3); }
.v-workbench .wb-sec-aside { text-transform: none; letter-spacing: 0; font-weight: 500; text-align: right; }
.v-workbench .wb-lead { font-size: 15px; line-height: 1.55; color: var(--text); max-width: 68ch; }
.v-workbench .wb-crit { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 2px 8px; padding: 8px 0; border-bottom: 1px solid var(--border); max-width: calc(68ch + 26px); }
.v-workbench .wb-crit:last-child { border-bottom: 0; }
.v-workbench .wb-crit .wb-mk { margin-top: 3px; }
.v-workbench .wb-crit b { font-weight: 600; font-size: 13px; }
.v-workbench .wb-crit p { grid-column: 2; font-size: 14.5px; line-height: 1.55; color: var(--text); max-width: 68ch; }
.v-workbench .wb-quote { padding: 9px 12px; background: var(--surface-2); border-radius: var(--radius-s); font-size: 14px; line-height: 1.5; color: var(--text); max-width: 68ch; }
.v-workbench .wb-quote + .wb-quote { margin-top: 6px; }
.v-workbench .wb-quote-src { display: block; margin-top: 4px; font-size: 11.5px; color: var(--text-3); overflow-wrap: anywhere; }
.v-workbench .wb-build { width: 100%; max-width: 560px; border-collapse: collapse; font-size: 12.5px; }
.v-workbench .wb-build td { padding: 3px 0; border-bottom: 1px dashed var(--border); vertical-align: top; }
.v-workbench .wb-build td:last-child { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; padding-left: 10px; }
.v-workbench .wb-build tr.is-total td { border-bottom: 0; border-top: 1px solid var(--border-strong); font-weight: 650; padding-top: 5px; }
.v-workbench .wb-build .wb-why { display: block; font-size: 11.5px; color: var(--text-3); font-weight: 400; }
.v-workbench .wb-track { position: relative; height: 18px; margin: 8px 0 2px; max-width: 560px; }
.v-workbench .wb-track-l { position: absolute; left: 0; right: 0; top: 8px; height: 2px; background: var(--border); }
.v-workbench .wb-track-th { position: absolute; top: 2px; height: 14px; border-left: 1px dashed var(--escalate); }
.v-workbench .wb-track-pre { position: absolute; top: 5px; width: 8px; height: 8px; margin-left: -4px; border-radius: 50%; background: var(--surface); box-shadow: inset 0 0 0 1.5px var(--text-3); }
.v-workbench .wb-track-fin { position: absolute; top: 3px; width: 12px; height: 12px; margin-left: -6px; border-radius: 50%; background: var(--text); }
.v-workbench .wb-track-ax { display: flex; justify-content: space-between; gap: 8px; font-size: 10.5px; color: var(--text-3); font-variant-numeric: tabular-nums; max-width: 560px; }
.v-workbench .wb-kv { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 3px 10px; font-size: 12.5px; }
.v-workbench .wb-kv dt { color: var(--text-3); }
.v-workbench .wb-kv dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.v-workbench .wb-kv.is-stack { grid-template-columns: minmax(0, 1fr); gap: 0; }
.v-workbench .wb-kv.is-stack dt { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; margin-top: 9px; }
.v-workbench .wb-kv.is-stack dt:first-child { margin-top: 0; }
.v-workbench .wb-cpc { display: flex; gap: 8px; padding: 4px 0; font-size: 12.5px; border-top: 1px solid var(--border); }
.v-workbench .wb-cpc code { font-family: var(--mono); font-size: 12px; color: var(--text); flex: 0 0 104px; }
.v-workbench .wb-srcs { padding: 0; list-style: none; margin-top: 6px; }
.v-workbench .wb-srcs li { font-family: var(--mono); font-size: 11.5px; color: var(--text-2); padding: 2px 0; overflow-wrap: anywhere; }
.v-workbench .wb-srcs li::before { content: "\\2197"; margin-right: 6px; color: var(--text-3); font-family: var(--font); }
.v-workbench .wb-hlist { list-style: none; padding: 0; font-size: 12.5px; }
.v-workbench .wb-hlist li { display: grid; grid-template-columns: 42px minmax(0, 1fr); gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--border); }
.v-workbench .wb-hlist li:last-child { border-bottom: 0; }
.v-workbench .wb-h-time { color: var(--text-3); font-variant-numeric: tabular-nums; }
.v-workbench .wb-h-note { display: block; color: var(--text-2); margin-top: 1px; overflow-wrap: anywhere; }
.v-workbench .wb-steps { list-style: none; padding: 0; }
.v-workbench .wb-steps li { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--border); font-size: 12.5px; }
.v-workbench .wb-steps li span:last-child { margin-left: auto; color: var(--text-3); font-size: 12px; }
.v-workbench .wb-steps .is-now { color: var(--accent); font-weight: 600; }
.v-workbench .wb-steps .is-done { color: var(--text-2); }
.v-workbench .wb-hint { font-size: 12px; color: var(--text-3); margin-top: 6px; }
.v-workbench .wb-d-empty { padding: 48px 20px; color: var(--text-3); text-align: center; line-height: 1.8; }
@container wbdetail (min-width: 700px) {
  .v-workbench .wb-d-top { padding: 14px 28px 12px; }
  .v-workbench .wb-doc { display: grid; grid-template-columns: minmax(0, 1fr) 220px; gap: 0 36px; padding: 0 28px; align-items: start; }
  .v-workbench .wb-doc-facts { display: block; padding-top: 18px; }
  .v-workbench .wb-doc-main .wb-sec[data-sec="facts"] { display: none; }
}

/* New run, set up in the table: the main column holds the draft, the evidence panel steps aside */
.v-workbench.is-setup { grid-template-columns: var(--wb-rail) minmax(0, 1fr) 0; }
.v-workbench.is-setup .wb-side { display: none; }
.v-workbench.is-setup .wb-tablewrap { position: relative; }
.v-workbench.is-setup .wb-toasts { bottom: 176px; }
.v-workbench .wb-strip[hidden], .v-workbench .wb-setbar[hidden] { display: none; }
.v-workbench .wb-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.v-workbench .wb-dot.is-draft { background: transparent; box-shadow: inset 0 0 0 1.5px var(--accent); }
.v-workbench .wb-file-n { font-weight: 600; color: var(--text); }
.v-workbench .wb-snotes { display: flex; flex-direction: column; gap: 5px; margin-top: 9px; }
.v-workbench .wb-snote { padding: 6px 10px; border-radius: var(--radius-s); background: var(--surface-2); color: var(--text-2); font-size: 12px; }
.v-workbench .wb-snote b { color: var(--text); font-weight: 600; }
.v-workbench .wb-snote.is-warn { background: var(--escalate-soft); color: var(--text); }
.v-workbench .wb-snote.is-err { background: var(--error-soft); color: var(--error); }
.v-workbench .wb-table.is-setup th { height: auto; padding: 6px 6px 7px; vertical-align: top; }
.v-workbench .wb-table.is-setup tbody tr { cursor: default; }
.v-workbench .wb-table.is-setup .wb-chk { padding: 0; text-align: center; vertical-align: middle; }
.v-workbench .wb-table.is-setup input[type="checkbox"] { width: 15px; height: 15px; margin: 0; accent-color: var(--accent); cursor: pointer; vertical-align: middle; }
.v-workbench .wb-s-chk { width: 32px; } .v-workbench .wb-s-idx { width: 32px; } .v-workbench .wb-s-company_name { width: 21%; }
.v-workbench .wb-s-uen { width: 112px; } .v-workbench .wb-s-domain { width: 15%; } .v-workbench .wb-s-status { width: 84px; }
@container wbtable (max-width: 699px) { .v-workbench .wb-table.is-setup .wb-s-domain { display: none; } .v-workbench .wb-s-company_name { width: 30%; } }
@container wbtable (max-width: 539px) { .v-workbench .wb-table.is-setup .wb-s-uen { display: none; } }
.v-workbench .wb-sth { display: flex; align-items: center; gap: 6px; min-width: 0; height: 18px; }
.v-workbench .wb-sth.is-r { justify-content: flex-end; }
.v-workbench .wb-sth-l { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.v-workbench .wb-sth .wb-tag { text-transform: none; letter-spacing: 0; }
.v-workbench .wb-table.is-setup th.is-out-col { color: var(--text-3); }
.v-workbench .wb-mapchip { display: inline-flex; align-items: center; gap: 3px; max-width: 100%; height: 22px; margin-top: 4px; padding: 0 7px; border: 1px solid var(--border-strong); border-radius: 999px; background: var(--surface); color: var(--text-2); font: 400 12px/1 var(--font); text-transform: none; letter-spacing: 0; white-space: nowrap; overflow: hidden; cursor: pointer; transition: transform 120ms var(--ease-out); }
.v-workbench .wb-mapchip b { min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--text); font-weight: 600; }
.v-workbench .wb-mapchip:hover { border-color: var(--text-3); }
.v-workbench .wb-mapchip:active { transform: scale(0.97); }
.v-workbench .wb-mapchip[aria-expanded="true"] { border-color: var(--accent); background: var(--accent-soft); }
.v-workbench .wb-mapchip.is-off { border-style: dashed; }
.v-workbench .wb-mapchip.is-dup { border-color: var(--escalate); }
.v-workbench .wb-table.is-setup th.is-missing { background: var(--escalate-soft); box-shadow: inset 0 -2px 0 var(--escalate); }
.v-workbench th.is-missing .wb-mapchip { border-color: var(--escalate); color: var(--escalate); font-weight: 600; }
.v-workbench .wb-sname { font-weight: 550; }
.v-workbench .wb-table.is-setup tr.is-out td:not(.wb-chk), .v-workbench .wb-table.is-setup tr.is-out .wb-dim { color: var(--text-3); }
.v-workbench .wb-table.is-setup tr.is-out .wb-sname { text-decoration: line-through; text-decoration-color: var(--border-strong); }
.v-workbench .wb-cell-miss { color: var(--escalate); font-style: italic; }
.v-workbench .wb-cell-empty { color: var(--text-3); font-style: italic; }
.v-workbench .wb-table.is-setup tr.is-enter { animation: workbench-land 200ms var(--ease-out) both; animation-delay: calc(var(--i) * 12ms); }
.v-workbench .wb-ghost-bar { display: block; height: 8px; border-radius: 4px; background: var(--surface-2); }
.v-workbench .wb-sempty { position: absolute; inset: 36px 0 0; display: grid; place-items: center; padding: 24px 24px 176px; text-align: center; }
.v-workbench .wb-sempty-in { max-width: 440px; padding: 18px 20px; border-radius: var(--radius-l); background: var(--surface); }
.v-workbench .wb-sempty-ic { display: grid; place-items: center; width: 44px; height: 44px; margin: 0 auto 12px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); }
.v-workbench .wb-sempty h2 { font-size: 16px; font-weight: 650; margin-bottom: 4px; }
.v-workbench .wb-sempty p { color: var(--text-2); margin-bottom: 14px; }
.v-workbench .wb-sempty-acts { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.v-workbench .wb-sempty small { display: block; margin-top: 12px; color: var(--text-3); font-size: 12px; }
.v-workbench .wb-setpad { height: 176px; }
.v-workbench .wb-dropover { position: absolute; inset: 8px; z-index: 15; display: none; place-items: center; border: 2px dashed var(--accent); border-radius: var(--radius-l); background: rgba(232, 238, 252, 0.9); color: var(--accent); font-size: 15px; font-weight: 600; pointer-events: none; }
.v-workbench.is-setup .wb-dropover { display: grid; opacity: 0; transform: scale(0.99); transition: opacity 150ms var(--ease-out), transform 200ms var(--ease-out); }
.v-workbench.is-setup .wb-main.is-drag .wb-dropover { opacity: 1; transform: none; }

/* Action bar: bottom right of the main column, clear of the centred picker */
.v-workbench .wb-setbar { position: absolute; right: 16px; bottom: 16px; z-index: 12; width: min(440px, calc(100% - 32px)); padding: 10px; border: 1px solid var(--border-strong); border-radius: var(--radius-l); background: var(--surface); box-shadow: var(--shadow-2); transform-origin: bottom right; animation: workbench-rise 220ms var(--ease-out) both; }
.v-workbench .wb-setbar-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; min-width: 0; }
.v-workbench .wb-set { font-weight: 400; color: var(--text-2); }
.v-workbench .wb-set b { color: var(--text); font-weight: 600; }
.v-workbench .wb-set[aria-expanded="true"] { border-color: var(--accent); background: var(--accent-soft); }
.v-workbench .wb-setbar-meta { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--text-3); }
.v-workbench .wb-setbar-meta .wb-mono { font-size: 11.5px; }
.v-workbench .wb-setbar-row { display: flex; gap: 6px; }
.v-workbench .wb-go { flex: 1 1 auto; min-width: 0; height: 36px; justify-content: center; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; }
.v-workbench .wb-go[aria-disabled="true"] { background: var(--surface-2); border-color: var(--border-strong); color: var(--text-2); filter: none; }
.v-workbench .wb-setbar-note { margin-top: 7px; font-size: 12px; color: var(--text-3); }
.v-workbench .wb-setbar-note.is-why { color: var(--escalate); font-weight: 500; }

/* Popovers: column menu and settings */
.v-workbench .wb-pop { position: absolute; z-index: 25; overflow-y: auto; border: 1px solid var(--border-strong); border-radius: var(--radius-m); background: var(--surface); box-shadow: var(--shadow-2); animation: workbench-pop-in 160ms var(--ease-out) both; }
.v-workbench .wb-pop.is-map { width: 290px; padding: 4px; transform-origin: top left; }
.v-workbench .wb-pop.is-set { width: 380px; padding: 2px 12px 12px; transform-origin: bottom right; }
.v-workbench .wb-pop hr { margin: 4px 0; border: 0; border-top: 1px solid var(--border); }
.v-workbench .wb-pop-h { padding: 6px 8px 4px; font-size: 11.5px; color: var(--text-3); }
.v-workbench .wb-mopt { display: grid; grid-template-columns: 16px minmax(0, 1fr); gap: 0 6px; width: 100%; padding: 6px 8px; border: 0; border-radius: var(--radius-s); background: transparent; text-align: left; cursor: pointer; font-size: 13px; }
.v-workbench .wb-mopt:hover, .v-workbench .wb-mopt:focus-visible { background: var(--surface-2); outline: none; }
.v-workbench .wb-mopt:focus-visible { box-shadow: inset 0 0 0 2px var(--accent); }
.v-workbench .wb-mopt-ck { grid-row: 1 / span 2; color: var(--accent); font-weight: 700; }
.v-workbench .wb-mopt-t { font-weight: 550; display: flex; align-items: center; gap: 6px; }
.v-workbench .wb-mopt-s { font-size: 11.5px; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v-workbench .wb-qlist { display: grid; gap: 6px; }
.v-workbench .wb-opt-p { float: right; font-weight: 500; font-size: 12px; color: var(--text-3); }
.v-workbench .wb-pop-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 10px; }

/* Analyst settings sheet */
.v-workbench .wb-scrim { position: absolute; inset: 0; z-index: 20; background: rgba(20, 20, 18, 0.18); animation: workbench-fade 200ms var(--ease-out) both; }
.v-workbench .wb-sheet { position: absolute; top: 0; right: 0; bottom: 0; z-index: 21; width: min(560px, calc(100% - 160px)); display: flex; flex-direction: column; background: var(--surface); border-left: 1px solid var(--border-strong); box-shadow: var(--shadow-2); transform-origin: right center; animation: workbench-slide 240ms var(--ease-out) both; }
.v-workbench .wb-sheet.is-leaving { animation: workbench-slide-out 160ms var(--ease-out) both; }
.v-workbench .wb-scrim.is-leaving { animation: workbench-out 160ms var(--ease-out) both; }
.v-workbench .wb-sh-head { flex: none; border-bottom: 1px solid var(--border); padding: 14px 18px 12px; }
.v-workbench .wb-sh-title { display: flex; align-items: center; justify-content: space-between; }
.v-workbench .wb-sh-title h2 { font-size: 15px; font-weight: 650; }
.v-workbench .wb-sh-sub { font-size: 12.5px; color: var(--text-2); margin-top: 2px; }
.v-workbench .wb-est { display: grid; grid-template-columns: auto auto 1fr; gap: 4px 18px; align-items: end; margin-top: 10px; }
.v-workbench .wb-est-v { font-size: 20px; font-weight: 650; font-variant-numeric: tabular-nums; line-height: 1.15; }
.v-workbench .wb-est-l { font-size: 11px; font-weight: 600; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.04em; }
.v-workbench .wb-est-split { align-self: center; min-width: 0; }
.v-workbench .wb-est-bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden; background: var(--border); }
.v-workbench .wb-est-bar > span { display: block; height: 100%; }
.v-workbench .wb-est-lg { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 11px; color: var(--text-2); margin-top: 4px; font-variant-numeric: tabular-nums; }
.v-workbench .wb-est-note { grid-column: 1 / -1; font-size: 11.5px; color: var(--text-3); }
.v-workbench .wb-est-why { grid-column: 1 / -1; font-size: 12px; color: var(--escalate); }
.v-workbench .wb-sh-body { flex: 1; overflow-y: auto; padding: 4px 18px 88px; }
.v-workbench .wb-fs { border: 0; margin: 0; padding: 14px 0 4px; border-bottom: 1px solid var(--border); min-width: 0; }
.v-workbench .wb-fs:last-child { border-bottom: 0; }
.v-workbench .wb-fs legend { padding: 0; font-size: 11px; font-weight: 650; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; float: left; width: 100%; }
.v-workbench .wb-fs legend + * { clear: both; }
.v-workbench .wb-warn { font-size: 12px; color: var(--escalate); margin-top: 6px; }
.v-workbench .wb-input { height: 28px; padding: 0 8px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); background: var(--surface); font-size: 12.5px; min-width: 0; width: 100%; }
.v-workbench .wb-tag { font-size: 10.5px; font-weight: 600; padding: 1px 5px; border-radius: 3px; background: var(--general-soft); color: var(--text-2); white-space: nowrap; }
.v-workbench .wb-tag.is-auto { background: var(--deep-soft); color: var(--deep); }
.v-workbench .wb-tag.is-req { background: var(--escalate-soft); color: var(--escalate); }
.v-workbench .wb-provs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.v-workbench .wb-opt { position: relative; display: block; padding: 8px 10px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); cursor: pointer; background: var(--surface); transition: transform 120ms var(--ease-out); }
.v-workbench .wb-opt:hover { background: var(--surface-2); }
.v-workbench .wb-opt:active { transform: scale(0.98); }
.v-workbench .wb-opt:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent); }
.v-workbench .wb-opt:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 1px; }
.v-workbench .wb-opt input { position: absolute; opacity: 0; pointer-events: none; }
.v-workbench .wb-opt-t { display: block; font-weight: 600; font-size: 13px; }
.v-workbench .wb-opt-s { display: block; font-size: 11.5px; color: var(--text-2); margin-top: 1px; }
.v-workbench .wb-opt-s.is-ok { color: var(--deep); }
.v-workbench .wb-opt-s.is-miss { color: var(--escalate); }
.v-workbench .wb-tiers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 8px; }
.v-workbench .wb-row2 { display: grid; grid-template-columns: 130px 1fr; gap: 10px; align-items: center; margin-top: 8px; font-size: 12.5px; }
.v-workbench .wb-tg { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--border); cursor: pointer; }
.v-workbench .wb-tg:last-child { border-bottom: 0; }
.v-workbench .wb-tg-t { font-weight: 600; font-size: 13px; }
.v-workbench .wb-tg-s { grid-column: 1; font-size: 12px; color: var(--text-2); }
.v-workbench .wb-tg.is-disabled { cursor: not-allowed; }
.v-workbench .wb-tg.is-disabled .wb-tg-t { color: var(--text-3); }
.v-workbench .wb-switch { grid-row: 1 / span 2; grid-column: 2; appearance: none; -webkit-appearance: none; position: relative; width: 30px; height: 18px; margin: 0; border-radius: 999px; background: var(--border-strong); cursor: pointer; }
.v-workbench .wb-switch::before { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.2); transition: transform 160ms var(--ease-out); }
.v-workbench .wb-switch:checked { background: var(--accent); }
.v-workbench .wb-switch:checked::before { transform: translateX(12px); }
.v-workbench .wb-switch:disabled { opacity: 0.5; cursor: not-allowed; }
.v-workbench .wb-th-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }
.v-workbench .wb-thf { display: grid; grid-template-columns: 1fr 64px; gap: 1px 8px; align-items: center; font-size: 12.5px; }
.v-workbench .wb-thf .wb-input { text-align: right; font-variant-numeric: tabular-nums; padding-right: 6px; }
.v-workbench .wb-thf small { grid-column: 1 / -1; font-size: 11.5px; color: var(--text-3); }
.v-workbench .wb-thf.is-off { opacity: 0.5; }
.v-workbench .wb-fs-foot { display: flex; justify-content: flex-end; margin-top: 8px; }

/* Command menu + cheat sheet (above centre, clear of the picker pill) */
.v-workbench .wb-mscrim { position: absolute; inset: 0; z-index: 40; background: rgba(20, 20, 18, 0.22); animation: workbench-fade 160ms var(--ease-out) both; }
.v-workbench .wb-modal { position: absolute; z-index: 41; left: 50%; top: 11%; width: min(580px, calc(100% - 32px)); max-height: 72%; display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--radius-l); box-shadow: var(--shadow-2); transform: translateX(-50%); transform-origin: 50% 0; animation: workbench-pop 180ms var(--ease-out) both; overflow: hidden; }
.v-workbench .wb-modal.is-help { width: min(700px, calc(100% - 32px)); }
.v-workbench .wb-pal-in { flex: none; height: 46px; border: 0; border-bottom: 1px solid var(--border); padding: 0 16px; font-size: 15px; background: transparent; outline: none; }
.v-workbench .wb-pal-list { list-style: none; padding: 6px; overflow-y: auto; flex: 1; }
.v-workbench .wb-pal-it { display: grid; grid-template-columns: 70px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 6px 10px; border-radius: var(--radius-s); cursor: pointer; font-size: 13px; }
.v-workbench .wb-pal-it[aria-selected="true"] { background: var(--accent-soft); }
.v-workbench .wb-pal-g { font-size: 11px; color: var(--text-3); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
.v-workbench .wb-pal-l { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v-workbench .wb-pal-l small { color: var(--text-3); margin-left: 6px; font-size: 12px; }
.v-workbench .wb-pal-keys { display: inline-flex; gap: 3px; }
.v-workbench .wb-pal-empty { padding: 18px; color: var(--text-3); text-align: center; }
.v-workbench .wb-modal-foot { flex: none; border-top: 1px solid var(--border); padding: 7px 14px; font-size: 11.5px; color: var(--text-3); display: flex; gap: 12px; flex-wrap: wrap; }
.v-workbench .wb-help-h { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.v-workbench .wb-help-h h2 { font-size: 15px; font-weight: 650; }
.v-workbench .wb-help-b { overflow-y: auto; padding: 8px 16px 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 28px; }
.v-workbench .wb-help-g h3 { font-size: 11px; font-weight: 650; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; margin: 10px 0 4px; }
.v-workbench .wb-help-r { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 3px 0; font-size: 12.5px; border-bottom: 1px solid var(--border); }
.v-workbench .wb-help-r span:last-child { display: inline-flex; gap: 3px; flex: none; }

/* Toasts */
.v-workbench .wb-toasts { position: absolute; right: 16px; bottom: 24px; z-index: 30; display: flex; flex-direction: column; gap: 8px; align-items: flex-end; pointer-events: none; }
.v-workbench .wb-toast { pointer-events: auto; display: flex; align-items: center; gap: 12px; max-width: 400px; padding: 9px 12px; border-radius: var(--radius-m); background: var(--text); color: var(--surface); font-size: 12.5px; box-shadow: var(--shadow-2); transform-origin: bottom right; animation: workbench-toast 220ms var(--ease-out) both; }
.v-workbench .wb-toast > div { flex: 1; min-width: 0; }
.v-workbench .wb-toast b { font-weight: 600; }
.v-workbench .wb-toast span { display: block; opacity: 0.75; margin-top: 1px; }
.v-workbench .wb-toast-btn { flex: none; height: 26px; padding: 0 8px; border: 1px solid rgba(255,255,255,.3); border-radius: var(--radius-s); background: transparent; color: inherit; font-size: 12px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; transition: transform 120ms var(--ease-out); }
.v-workbench .wb-toast-btn:hover { background: rgba(255,255,255,.1); }
.v-workbench .wb-toast-btn:active { transform: scale(0.97); }
.v-workbench .wb-toast-btn kbd { background: transparent; color: inherit; border-color: rgba(255,255,255,.35); }
.v-workbench .wb-toast.is-leaving { animation: workbench-out 160ms var(--ease-out) both; }

@keyframes workbench-pulse { from { opacity: 1; } to { opacity: 0.3; } }
@keyframes workbench-land { from { opacity: 0; } to { opacity: 1; } }
@keyframes workbench-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes workbench-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes workbench-slide { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }
@keyframes workbench-slide-out { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(16px); } }
@keyframes workbench-pop-in { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: none; } }
@keyframes workbench-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes workbench-pop { from { opacity: 0; transform: translateX(-50%) translateY(-6px) scale(0.98); } to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } }
@keyframes workbench-toast { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@media (prefers-reduced-motion: reduce) {
  .v-workbench *, .v-workbench *::before, .v-workbench *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition: none !important; }
  .v-workbench .wb-step::before, .v-workbench .wb-dot.is-running { animation: none !important; }
}
`;

  function render() {
    return `<div class="v-workbench">
  <aside class="wb-rail" aria-label="Runs">
    <div class="wb-rail-top">
      <div class="wb-brand">Deep Tech Classifier</div>
      <button class="wb-btn wb-btn-primary wb-newrun" data-act="new-run" data-fk="new-run">+ New run <kbd>O</kbd></button>
    </div>
    <nav class="wb-rail-list" data-r="rail"></nav>
    <div class="wb-rail-foot" data-r="railfoot"></div>
  </aside>
  <main class="wb-main" data-r="main">
    <header class="wb-head" data-r="head"></header>
    <section class="wb-strip" data-r="strip" aria-label="Run summary"></section>
    <div class="wb-tools" data-r="tools">
      <div class="wb-search">
        <input type="search" data-fk="search" placeholder="Search company, UEN, sector" aria-label="Search companies" autocomplete="off">
        <kbd aria-hidden="true">/</kbd>
      </div>
      <button class="wb-btn wb-btn-sm wb-filt-tg" data-act="filters-toggle" data-r="filt-tg" data-fk="filt-tg" aria-expanded="false">Filters</button>
      <div class="wb-chips" data-r="chips"></div>
    </div>
    <div class="wb-tablewrap" data-r="table"></div>
    <div class="wb-setbar" data-r="setbar" role="region" aria-label="Start the new run" hidden></div>
    <div class="wb-dropover" aria-hidden="true">Drop to load this spreadsheet</div>
  </main>
  <div class="wb-side">
    <div class="wb-divider" data-r="divider" role="separator" aria-orientation="vertical" aria-label="Resize evidence panel. Up or ] widens, down or [ narrows, Enter resets." tabindex="0"></div>
    <aside class="wb-detail" data-r="detail" aria-label="Company evidence"></aside>
  </div>
  <div data-r="overlay"></div>
  <div data-r="pop"></div>
  <div data-r="modal"></div>
  <div class="wb-toasts" data-r="toasts" role="status" aria-live="polite"></div>
  <div class="wb-sr" data-r="live" role="status" aria-live="polite"></div>
  <input type="file" class="wb-sr" data-r="file" accept=".xlsx,.xls,.csv" tabindex="-1" aria-hidden="true">
</div>`;
  }

  function init(stage) {
    const root = stage.querySelector('.v-workbench');
    const D = window.PROTO_DATA;
    const R = (k) => root.querySelector('[data-r="' + k + '"]');

    /* ---------- constants ---------- */
    const MODEL_IDS = {
      anthropic: { fast: 'claude-haiku-5-5', balanced: 'claude-sonnet-5-5', best: 'claude-opus-5-5' },
      gemini: { fast: 'gemini-flash-lite-latest', balanced: 'gemini-flash-latest', best: 'gemini-pro-latest' },
      openai: { fast: 'gpt-4o-mini', balanced: 'gpt-4o', best: 'gpt-4o' },
    };
    const KNOWN_MODELS = new Set([].concat(...Object.values(MODEL_IDS).map((t) => Object.values(t))));
    const SEV = { Escalate: 0, Contested: 1, Uncertain: 2, Clear: 3 };
    const RISKS = ['Escalate', 'Contested', 'Uncertain', 'Clear'];
    const MOD = /Mac|iPhone|iPad/.test((navigator.platform || '') + (navigator.userAgent || '')) ? '⌘' : 'Ctrl';
    const FIELDS = [
      { key: 'company_name', label: 'Company name', required: true },
      { key: 'description', label: 'Description' },
      { key: 'domain', label: 'Domain / industry' },
      { key: 'uen', label: 'UEN' },
    ];
    const THRESHOLDS = [
      { key: 'validatorThreshold', label: 'Validation threshold', help: 'Validator runs below this confidence', min: 0, max: 100, needs: 'validator' },
      { key: 'overrideMinConfidence', label: 'Override minimum', help: 'Validator may flip a verdict at or above this', min: 0, max: 100, needs: 'validator' },
      { key: 'epoAdjustMax', label: 'Patent adjustment max', help: 'Points patents add or subtract', min: 0, max: 30, needs: 'epo' },
      { key: 'lowEvidenceCap', label: 'Low-evidence cap', help: 'Ceiling with no description and no patents', min: 0, max: 100 },
      { key: 'maxWebSearches', label: 'Validator web searches', help: 'Per validated company', min: 0, max: 10, needs: 'validator' },
      { key: 'enrichmentMaxSearches', label: 'Enrichment web searches', help: 'Per company', min: 0, max: 10, needs: 'enrichment' },
    ];
    const CRIT = [['innovation', 'I', 'Innovation'], ['scientific_foundation', 'S', 'Scientific foundation'], ['proprietary_ip', 'P', 'Proprietary IP']];
    const BASIS = { COMBINED: 'Input and web descriptions', WEB_DESCRIPTION: 'Web description', DESCRIPTION_ONLY: 'Input description only' };
    const VAL_FIND = { confirm: 'Confirmed the verdict', override: 'Argued for the other verdict', insufficient_evidence: 'Insufficient evidence' };
    const VAL_DEC = { AUTO_APPROVE: 'No escalation', ESCALATE_FOR_HUMAN_REVIEW: 'Escalated for human review' };
    const C_BY_ID = {};
    D.companies.forEach((c) => { C_BY_ID[c.id] = c; });
    const provById = (id) => D.providers.find((p) => p.id === id);

    /* ---------- small helpers ---------- */
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
    const pad = (n) => String(n).padStart(2, '0');
    const money = (n, d) => '$' + n.toFixed(d == null ? 2 : d);
    const fmtDur = (s) => {
      if (s < 90) return '~' + Math.max(1, Math.round(s)) + ' s';
      if (s < 3600) return '~' + Math.round(s / 60) + ' min';
      const h = Math.floor(s / 3600); const m = Math.round((s % 3600) / 60);
      return '~' + h + ' h' + (m ? ' ' + m + ' min' : '');
    };
    const confWord = (n) => n >= 90 ? 'Near-definitive' : n >= 75 ? 'Strong' : n >= 60 ? 'Moderate' : n >= 45 ? 'Borderline' : n >= 30 ? 'Weak' : 'Minimal';
    const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
    const flip = (v) => (v === 'deep tech' ? 'general tech' : 'deep tech');
    const vClass = (v) => (v === 'deep tech' ? 'is-deep' : 'is-gen');
    const vLabel = (v) => (v === 'deep tech' ? 'Deep tech' : 'General tech');
    const vLow = (v) => vLabel(v).toLowerCase();
    const actionFor = (v) => (v === 'deep tech' ? 'Approve' : 'Reject');
    const now0 = new Date();
    const stamp = (d) => '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes());
    const hhmm = (d) => pad(d.getHours()) + ':' + pad(d.getMinutes());
    const kbd = (...keys) => keys.map((k) => '<kbd>' + esc(k) + '</kbd>').join('');

    /* ---------- timers (all cleared in cleanup) ---------- */
    const timeouts = new Set();
    const rafs = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timeouts.delete(t); fn(); }, ms); timeouts.add(t); return t; };
    const cancel = (t) => { if (t) { clearTimeout(t); timeouts.delete(t); } };

    /* ---------- config + derivation ---------- */
    function defaultCfg() {
      const d = D.defaults;
      return {
        provider: d.provider, tier: d.tier, model: d.model || '',
        enrichment: d.enrichment, epo: d.epo, validator: d.validator, batch: d.batch,
        validatorThreshold: d.validatorThreshold, overrideMinConfidence: d.overrideMinConfidence,
        epoAdjustMax: d.epoAdjustMax, lowEvidenceCap: d.lowEvidenceCap,
        maxWebSearches: d.maxWebSearches, enrichmentMaxSearches: d.enrichmentMaxSearches,
        mapping: Object.assign({}, D.file.mapping),
      };
    }
    const modelFor = (cfg) => (cfg.model && cfg.model.trim()) || MODEL_IDS[cfg.provider][cfg.tier];
    const batchOn = (cfg) => !!(cfg.batch && provById(cfg.provider).batch);
    const costKnown = (cfg) => KNOWN_MODELS.has(modelFor(cfg));
    const tierFactor = (cfg) => D.estCostPerCompany[cfg.tier] / D.estCostPerCompany.fast;

    /* Applies a run's settings to a sample company, following the scoring rules in
       PROJECT_OVERVIEW.md section 7. The sample data is the default-settings result. */
    function derive(c, cfg) {
      const patents = cfg.epo ? c.patents : { count: 0, level: 'Not looked up', domain: '', status: 'disabled', cpc: [] };
      const adj = cfg.epo ? Math.round(c.signals.epoAdjust * cfg.epoAdjustMax / 15) : 0;
      const hasInputDesc = !!(cfg.mapping.description && c.description);
      const hasWeb = !!(cfg.enrichment && c.webStatus === 'found' && c.webDescription);
      const lowEvidence = !hasInputDesc && !hasWeb && patents.count === 0;
      let pre = clamp(c.signals.llm + adj, 0, 100);
      let capped = false;
      if (lowEvidence && pre > cfg.lowEvidenceCap) { pre = cfg.lowEvidenceCap; capped = true; }
      const validated = !!(cfg.validator && c.validator.triggered && pre < cfg.validatorThreshold);
      let verdict = c.verdict; let conf = pre; let risk = 'Clear'; let val = null; let override = '';
      if (validated) {
        val = Object.assign({}, c.validator);
        conf = c.confidence; risk = c.risk;
        if (val.verdict === 'override') {
          const base = val.summary.replace(/\s*Override blocked:.*$/, '');
          if (val.confidence >= cfg.overrideMinConfidence) {
            override = 'applied'; verdict = flip(c.verdict); conf = val.confidence;
            risk = conf < cfg.validatorThreshold ? 'Uncertain' : 'Clear';
            val.summary = base + ' Override applied: validator confidence ' + val.confidence + ' meets the minimum of ' + cfg.overrideMinConfidence + '.';
          } else {
            override = 'blocked'; risk = 'Contested';
            val.summary = base + ' Override blocked: validator confidence ' + val.confidence + ' is below the minimum of ' + cfg.overrideMinConfidence + '.';
          }
        }
        if (lowEvidence && conf > cfg.lowEvidenceCap) { conf = cfg.lowEvidenceCap; capped = true; }
      }
      const baseCost = c.validator.triggered && !validated ? c.cost * 0.42 : c.cost;
      const cost = baseCost * tierFactor(cfg) * (batchOn(cfg) ? 0.82 : 1) * (cfg.enrichment ? 1 : 0.65);
      const basis = !cfg.enrichment ? 'DESCRIPTION_ONLY' : c.basis;
      return {
        verdict, conf, risk, validated, val, override, pre, adj, capped, lowEvidence,
        llm: c.signals.llm, patents, basis, hasInputDesc, hasWeb,
        cost: costKnown(cfg) ? cost : null,
        timeS: c.timeS * (validated ? 1 : (c.validator.triggered ? 0.5 : 1)),
      };
    }

    function estimate(d) {
      const rows = d.file ? d.file.rows : 0;
      const per = D.estCostPerCompany[d.tier];
      const batch = batchOn(d);
      const parts = {
        classify: per * 0.35 * (batch ? 0.5 : 1),
        enrich: d.enrichment ? per * 0.35 * (0.5 + 0.25 * d.enrichmentMaxSearches) : 0,
        validate: d.validator ? per * 0.30 * (d.validatorThreshold / 70) * (0.4 + 0.2 * d.maxWebSearches) : 0,
      };
      const perTotal = parts.classify + parts.enrich + parts.validate;
      const tierSlow = d.tier === 'best' ? 1.3 : d.tier === 'balanced' ? 1.1 : 1;
      const secPer = (batch ? D.estSecondsPerCompany.batch : D.estSecondsPerCompany.sequential) * (d.enrichment ? 1 : 0.75) * (d.validator ? 1 : 0.85) * tierSlow;
      return { rows, parts, cost: rows * perTotal, secs: rows * secPer, batch, known: costKnown(d) };
    }

    /* ---------- runs ---------- */
    function makeRowsRun(o) {
      return Object.assign({ kind: 'rows', results: {}, progress: {}, landed: {}, decisions: {}, history: {}, phase: '', current: null }, o);
    }
    const initialCfg = defaultCfg();
    const initialRun = makeRowsRun({
      id: 'run_' + stamp(now0).slice(0, 8) + '_0842', file: D.file.name, rows: D.file.rows,
      dateLabel: 'Today, 08:42', timeLabel: '08:42', status: 'complete', cfg: initialCfg, model: modelFor(initialCfg),
      ids: D.companies.map((c) => c.id),
    });
    D.companies.forEach((c) => { initialRun.results[c.id] = derive(c, initialCfg); });

    const pastRuns = D.pastRuns.map((p) => ({
      kind: 'summary', id: p.id, file: p.file, dateLabel: p.date, status: p.status, model: p.model,
      summary: p.status === 'interrupted'
        ? { total: p.total, done: p.done, deep: 7, general: 15, review: 2, errors: 0, cost: null }
        : { total: p.total, done: p.total, deep: p.deep, general: p.general, review: p.review, errors: p.errors, cost: p.cost },
    }));

    const newFilters = () => ({ risk: new Set(), verdict: new Set(), status: new Set(), bin: null, q: '' });
    const S = {
      runs: [initialRun].concat(pastRuns),
      activeId: initialRun.id,
      selectedId: null,
      sortKey: 'priority', sortDir: 1,
      f: newFilters(),
      viewIds: [], snap: null,
      modal: null,
      /* New run setup: the draft, whether the main column shows it, its popover and sheet. */
      draft: null, setup: false, setupRet: null, pop: null, sheet: null, dragDepth: 0, enter: false,
      forms: {},
      collapsed: { facts: true },
      reading: false, detailW: null, filtersOpen: false,
    };
    const undoStack = [];
    const engines = {};
    let lastDetailSig = '';
    const runById = (id) => S.runs.find((r) => r.id === id);
    const activeRun = () => runById(S.activeId);
    const formKey = (run, id) => run.id + ':' + id;

    /* Effective view of one row: pipeline result plus the reviewer's current decision. */
    function rowView(run, id, decs) {
      const c = C_BY_ID[id];
      const r = run.results[id] || null;
      const idx = run.ids.indexOf(id) + 1;
      if (!r) return { c, r: null, dec: null, prog: run.progress[id] || null, idx };
      const dec = (decs || run.decisions)[id] || null;
      const flagged = r.risk !== 'Clear';
      const verdict = dec ? dec.verdict : r.verdict;
      const reclassified = !!dec && dec.verdict !== r.verdict;
      const action = dec ? actionFor(verdict) : flagged ? 'Needs Review' : actionFor(verdict);
      return { c, r, dec, flagged, open: flagged && !dec, verdict, reclassified, confirmed: !!dec && !reclassified, action, idx };
    }

    function counts(run) {
      if (run.kind === 'summary') {
        const s = run.summary;
        return { total: s.total, done: s.done, deep: s.deep, general: s.general, open: s.review, confirmed: 0, reclassified: 0, cost: s.cost, avg: null, risk: null };
      }
      const out = { total: run.ids.length, done: 0, deep: 0, general: 0, open: 0, confirmed: 0, reclassified: 0, cost: 0, avg: null, risk: { Clear: 0, Uncertain: 0, Contested: 0, Escalate: 0 }, costUnknown: false };
      let sum = 0;
      run.ids.forEach((id) => {
        const v = rowView(run, id);
        if (!v.r) return;
        out.done++;
        if (v.verdict === 'deep tech') out.deep++; else out.general++;
        if (v.open) out.open++;
        if (v.confirmed) out.confirmed++;
        if (v.reclassified) out.reclassified++;
        out.risk[v.r.risk]++;
        if (v.r.cost == null) out.costUnknown = true; else out.cost += v.r.cost;
        sum += v.r.conf;
      });
      out.avg = out.done ? Math.round(sum / out.done) : null;
      return out;
    }

    /* ---------- simulation engine ---------- */
    function stepsFor(cfg, r) {
      const s = [];
      if (cfg.enrichment) s.push('Enrichment');
      if (cfg.epo) s.push('Patent lookup');
      s.push('Classification', 'Confidence scoring');
      if (r.validated) s.push('Validation');
      return s;
    }

    function buildOps(run) {
      const cfg = run.cfg;
      const pending = run.ids.filter((id) => !run.results[id]);
      const pre = {};
      pending.forEach((id) => { pre[id] = derive(C_BY_ID[id], cfg); });
      const land = (id) => () => { run.results[id] = pre[id]; delete run.progress[id]; run.landed[id] = Date.now(); run.current = id; };
      const ops = [];
      if (!batchOn(cfg)) {
        pending.forEach((id) => {
          const steps = stepsFor(cfg, pre[id]);
          const per = (pre[id].validated ? 380 : 300) / steps.length;
          steps.forEach((s) => ops.push({ id, dur: per, fn: () => { run.progress[id] = s; run.current = id; run.phase = s + ' — ' + C_BY_ID[id].name; } }));
          ops.push({ id, dur: 0, fn: land(id) });
        });
        return ops;
      }
      const gather = [];
      if (cfg.enrichment) gather.push('Enrichment');
      if (cfg.epo) gather.push('Patent lookup');
      if (!gather.length) gather.push('Reading input');
      pending.forEach((id) => {
        gather.forEach((s) => ops.push({ id, dur: 130 / gather.length, fn: () => { run.progress[id] = s; run.current = id; run.phase = 'Gather company data · ' + s + ' — ' + C_BY_ID[id].name; } }));
        ops.push({ id, dur: 0, fn: () => { run.progress[id] = 'Waiting for batch'; } });
      });
      ops.push({ id: null, dur: 1000, fn: () => {
        pending.forEach((id) => { run.progress[id] = 'In batch job'; });
        run.current = null;
        run.phase = 'Classify in one batch job · ' + pending.length + ' companies submitted (a real batch can take up to an hour)';
      } });
      const toValidate = [];
      pending.forEach((id) => {
        ops.push({ id, dur: 55, fn: () => {
          run.phase = 'Read batch results — ' + C_BY_ID[id].name;
          if (pre[id].validated) { run.progress[id] = 'Validation queued'; run.current = id; } else land(id)();
        } });
        if (pre[id].validated) toValidate.push(id);
      });
      toValidate.forEach((id) => {
        ops.push({ id, dur: 340, fn: () => { run.progress[id] = 'Validation'; run.current = id; run.phase = 'Validate uncertain results — ' + C_BY_ID[id].name; } });
        ops.push({ id, dur: 0, fn: land(id) });
      });
      return ops;
    }

    function buildSummaryOps(run) {
      const ops = [];
      for (let i = run.summary.done; i < run.summary.total; i++) {
        ops.push({ id: null, dur: 300, fn: () => {
          const s = run.summary; s.done++;
          if (s.done % 3 === 0) s.deep++; else s.general++;
          if (s.done % 7 === 0) s.review++;
          run.phase = 'Company ' + s.done + ' of ' + s.total;
        } });
      }
      return ops;
    }

    function startEngine(run) {
      run.status = 'running';
      const ops = run.kind === 'rows' ? buildOps(run) : buildSummaryOps(run);
      const eng = { i: 0, ops, timer: null };
      engines[run.id] = eng;
      const tick = () => {
        eng.timer = null;
        if (eng.i >= eng.ops.length) { finishRun(run); return; }
        const op = eng.ops[eng.i++];
        op.fn();
        if (op.dur > 0 || eng.i >= eng.ops.length) { onTick(run); eng.timer = later(tick, op.dur); } else tick();
      };
      tick();
    }

    function stopRun(run) {
      const eng = engines[run.id];
      if (eng) { cancel(eng.timer); delete engines[run.id]; }
      if (run.kind === 'rows') run.progress = {};
      run.status = 'stopped'; run.phase = ''; run.current = null;
      const n = run.kind === 'rows' ? counts(run).done : run.summary.done;
      toast('Run stopped', n + ' finished ' + (n === 1 ? 'result' : 'results') + ' kept. Resume continues with the next unfinished company.');
      refreshView(false);
      renderAll();
    }

    function resumeRun(run) {
      if (run.status !== 'stopped' && run.status !== 'interrupted') return;
      startEngine(run);
      toast('Resuming ' + run.file, 'Continuing with ' + run.model + ', the model this run started with.');
      refreshView(false);
      renderAll();
    }

    function finishRun(run) {
      delete engines[run.id];
      run.status = 'complete'; run.phase = ''; run.current = null;
      if (run.kind === 'rows') {
        const k = counts(run);
        toast('Run complete: ' + run.file, k.done + ' companies · ' + k.deep + ' deep tech · ' + k.open + ' need review');
      } else {
        run.resumed = true;
        run.summary.cost = Math.round(run.summary.total * D.estCostPerCompany.fast * 0.97 * 100) / 100;
        toast('Run complete: ' + run.file, run.summary.total + ' companies classified');
      }
      if (run.id === S.activeId) refreshView(false);
      renderAll();
    }

    let tickScheduled = false;
    function onTick(run) {
      if (tickScheduled) return;
      tickScheduled = true;
      const rid = requestAnimationFrame(() => {
        rafs.delete(rid);
        tickScheduled = false;
        renderRail();
        if (S.activeId !== run.id || S.setup) return;
        refreshView(false);
        renderHead(); renderStrip(); renderChips(); renderTable();
        if (detailSig() !== lastDetailSig) renderDetail();
      });
      rafs.add(rid);
    }

    /* ---------- view: filtering + sorting ----------
       The visible order is recomputed only on an explicit sort, filter, search or run
       switch, or when new results land. Decisions never trigger it, and sorting uses
       the decisions as they were at the last explicit change, so a row the reviewer
       just decided keeps its place until the next sort or filter change. */
    function computeIds(run, decs) {
      if (run.kind !== 'rows') return [];
      const f = S.f; const q = f.q.trim().toLowerCase();
      const resultFilter = f.risk.size || f.verdict.size || f.status.size || f.bin != null;
      const views = {};
      let ids = run.ids.filter((id) => {
        const v = rowView(run, id, decs);
        views[id] = v;
        if (q) {
          const c = v.c;
          if ((c.name + ' ' + c.uen + ' ' + c.domain + ' ' + c.description).toLowerCase().indexOf(q) < 0) return false;
        }
        if (!v.r) return !resultFilter;
        if (f.risk.size && !f.risk.has(v.r.risk)) return false;
        if (f.verdict.size && !f.verdict.has(v.verdict)) return false;
        if (f.status.size && !((f.status.has('open') && v.open) || (f.status.has('reviewed') && v.confirmed) || (f.status.has('reclassified') && v.reclassified))) return false;
        if (f.bin != null && Math.min(9, Math.floor(v.r.conf / 10)) !== f.bin) return false;
        return true;
      });
      const key = S.sortKey; const dir = S.sortDir;
      if (key === 'idx' || (key === 'priority' && run.status === 'running')) {
        return ids.sort((a, b) => (views[a].idx - views[b].idx) * (key === 'idx' ? dir : 1));
      }
      const val = (v) => {
        switch (key) {
          case 'name': return v.c.name.toLowerCase();
          case 'verdict': return v.verdict;
          case 'conf': return v.r.conf;
          case 'risk': return SEV[v.r.risk];
          case 'action': return v.action;
          case 'patents': return v.r.patents.count;
          case 'cost': return v.r.cost == null ? -1 : v.r.cost;
          default: return 0;
        }
      };
      return ids.sort((a, b) => {
        const va = views[a]; const vb = views[b];
        if (!va.r || !vb.r) { if (va.r) return -1; if (vb.r) return 1; return va.idx - vb.idx; }
        if (key === 'priority') {
          const ga = va.open ? 0 : va.flagged ? 1 : 2; const gb = vb.open ? 0 : vb.flagged ? 1 : 2;
          if (ga !== gb) return ga - gb;
          if (SEV[va.r.risk] !== SEV[vb.r.risk]) return SEV[va.r.risk] - SEV[vb.r.risk];
          return va.r.conf - vb.r.conf || va.idx - vb.idx;
        }
        const x = val(va); const y = val(vb);
        if (x < y) return -dir; if (x > y) return dir;
        return va.idx - vb.idx;
      });
    }
    function refreshView(explicit) {
      const run = activeRun();
      if (explicit || !S.snap || S.snap.runId !== run.id) S.snap = { runId: run.id, dec: Object.assign({}, run.decisions || {}) };
      S.viewIds = computeIds(run, S.snap.dec);
    }

    /* ---------- rendering helpers ---------- */
    function put(el, html) {
      if (!el) return;
      const a = document.activeElement;
      const fk = a && el.contains(a) ? a.getAttribute('data-fk') : null;
      let sel = null;
      if (fk) { try { if (a.selectionStart != null) sel = [a.selectionStart, a.selectionEnd]; } catch (e) { sel = null; } }
      el.innerHTML = html;
      if (fk) {
        const n = el.querySelector('[data-fk="' + fk + '"]');
        if (n) { n.focus({ preventScroll: true }); if (sel) { try { n.setSelectionRange(sel[0], sel[1]); } catch (e) { /* not a text field */ } } }
      }
    }
    const verdictHtml = (v) => '<span class="wb-verdict ' + vClass(v) + '" title="' + vLabel(v) + '"><span class="wb-vtxt">' + vLabel(v) + '</span></span>';
    const riskHtml = (r) => '<span class="wb-risk r-' + r + '">' + r + '</span>';
    function marksHtml(c) {
      const label = CRIT.map((x) => x[2] + (c.criteria[x[0]].met ? ' met' : ' not met')).join(', ');
      return '<span class="wb-mks" role="img" aria-label="' + label + '">' + CRIT.map((x) => {
        const m = c.criteria[x[0]].met;
        return '<span class="wb-mk ' + (m ? 'is-y' : 'is-n') + '" title="' + x[2] + ': ' + (m ? 'met' : 'not met') + '" aria-hidden="true">' + (m ? '✓' : x[1]) + '</span>';
      }).join('') + '</span>';
    }
    const revTag = (v) => v.reclassified
      ? '<span class="wb-revtag is-re" title="Reclassified from ' + vLow(v.r.verdict) + '">↺<span class="wb-revtag-t"> Reclassified</span></span>'
      : v.confirmed ? '<span class="wb-revtag" title="Reviewed: pipeline verdict confirmed">✓<span class="wb-revtag-t"> Reviewed</span></span>' : '';

    /* ---------- rail ---------- */
    function railStatus(run) {
      if (run.kind === 'rows') {
        const k = counts(run);
        if (run.status === 'running') return { dot: 'is-running', text: 'Running · ' + k.done + '/' + k.total, bar: k.done / k.total };
        if (run.status === 'stopped') return { dot: 'is-stopped', text: 'Stopped · ' + k.done + '/' + k.total, bar: k.done / k.total };
        return { dot: 'is-complete', text: k.total + ' companies · ' + (k.open ? k.open + ' to review' : 'all reviewed') };
      }
      const s = run.summary;
      if (run.status === 'running') return { dot: 'is-running', text: 'Resuming · ' + s.done + '/' + s.total, bar: s.done / s.total };
      if (run.status === 'interrupted' || run.status === 'stopped') return { dot: 'is-stopped', text: 'Interrupted · ' + s.done + '/' + s.total, bar: s.done / s.total };
      return { dot: 'is-complete', text: s.total + ' companies · ' + s.review + ' to review' };
    }
    function renderRail() {
      const item = (run) => {
        const st = railStatus(run);
        return '<button class="wb-runitem" data-act="open-run" data-id="' + run.id + '" data-fk="rail-' + run.id + '" aria-current="' + (run.id === S.activeId && !S.setup) + '">' +
          '<span class="wb-runitem-f">' + esc(run.file) + '</span>' +
          '<span class="wb-runitem-m"><span class="wb-dot ' + st.dot + '"></span><span class="wb-num">' + esc(st.text) + '</span></span>' +
          '<span class="wb-runitem-d">' + esc(run.dateLabel) + ' · ' + esc(run.model.replace(/^claude-/, '')) + '</span>' +
          (st.bar != null ? '<span class="wb-minibar ' + (st.dot === 'is-stopped' ? 'is-stopped' : '') + '"><span style="transform:scaleX(' + st.bar.toFixed(3) + ')"></span></span>' : '') +
          '</button>';
      };
      const fresh = S.runs.filter((r) => r.fresh);
      const older = S.runs.filter((r) => !r.fresh);
      let html = '';
      if (S.draft) {
        const dr = S.draft;
        html += '<div class="wb-rail-h">Setting up</div><button class="wb-runitem" data-act="open-draft" data-fk="rail-draft" aria-current="' + S.setup + '">' +
          '<span class="wb-runitem-f">New run</span>' +
          '<span class="wb-runitem-m"><span class="wb-dot is-draft"></span><span>Not started</span></span>' +
          '<span class="wb-runitem-d">' + (dr.file ? esc(dr.file.name) + ' · ' + includedIds().length + ' companies' : 'No file yet') + '</span></button>';
      }
      if (fresh.length) html += '<div class="wb-rail-h">This session</div>' + fresh.map(item).join('');
      html += '<div class="wb-rail-h">Recent runs</div>' + older.map(item).join('');
      put(R('rail'), html);
    }
    function renderRailFoot() {
      const keys = D.providers.map((p) => '<div class="wb-keyrow"><span>' + esc(p.label) + '</span>' + (p.keySet ? '<span class="wb-keyok">key set</span>' : '<span class="wb-keymiss">no key</span>') + '</div>').join('') +
        '<div class="wb-keyrow"><span>EPO patents</span>' + (D.epoKeysSet ? '<span class="wb-keyok">key set</span>' : '<span class="wb-keymiss">no key</span>') + '</div>';
      R('railfoot').innerHTML = '<div class="wb-keys-h">API keys (.env)</div>' + keys +
        '<div class="wb-foot-btns"><button class="wb-btn wb-btn-sm" data-act="help" data-fk="foot-help">Shortcuts ' + kbd('?') + '</button>' +
        '<button class="wb-btn wb-btn-sm" data-act="palette" data-fk="foot-palette">Command menu <span>' + kbd(MOD, 'K') + '</span></button></div>';
    }

    /* ---------- head ---------- */
    function cfgTags(cfg) {
      const t = (on, label) => '<span class="wb-cfgtag ' + (on ? '' : 'is-off') + '">' + label + '</span>';
      return '<div class="wb-cfg">' +
        t(cfg.enrichment, 'Web enrichment') + t(cfg.epo, 'Patent lookup') +
        t(cfg.validator, 'Validation &lt; ' + cfg.validatorThreshold) + t(batchOn(cfg), 'Batch mode') +
        '<span class="wb-cfgtag">Override ≥ ' + cfg.overrideMinConfidence + '</span>' +
        '<span class="wb-cfgtag">Patent adj. ±' + cfg.epoAdjustMax + '</span>' +
        '<span class="wb-cfgtag">Low-evidence cap ' + cfg.lowEvidenceCap + '</span></div>';
    }
    function renderHead() {
      const run = activeRun();
      const stCls = run.status === 'running' ? 'is-running' : run.status === 'complete' ? 'is-complete' : 'is-stopped';
      const stTxt = run.status === 'running' ? (run.kind === 'summary' ? 'Resuming' : 'Running') : run.status === 'complete' ? 'Complete' : run.status === 'interrupted' ? 'Interrupted' : 'Stopped';
      let acts = '';
      if (run.status === 'running') acts += '<button class="wb-btn wb-btn-stop" data-act="stop" data-fk="stop">■ Stop ' + kbd('S') + '</button>';
      if (run.status === 'stopped' || run.status === 'interrupted') acts += '<button class="wb-btn wb-btn-primary" data-act="resume" data-fk="resume">Resume ' + kbd('S') + '</button>';
      if (run.kind === 'rows') acts += '<button class="wb-btn" data-act="rerun" data-fk="rerun" title="Set up a new run with these settings and column mapping">Same settings…</button>';
      acts += '<button class="wb-btn" data-act="download" data-fk="download"><span class="wb-l-long">Download Excel</span><span class="wb-l-short">Excel</span> ' + kbd('D') + '</button>';
      const k = counts(run);
      const meta = '<span class="wb-mono">' + esc(run.id) + '</span><span>' + esc(run.dateLabel) + '</span><span class="wb-mono">' + esc(run.model) + '</span><span class="wb-num">' + k.total + ' companies</span>';
      let extra = '';
      if (run.kind === 'rows') {
        extra += cfgTags(run.cfg);
        if (run.status === 'running') {
          extra += '<div class="wb-prog"><span class="wb-prog-bar"><span style="transform:scaleX(' + (k.done / k.total).toFixed(3) + ')"></span></span><span class="wb-num">' + k.done + ' of ' + k.total + '</span><span class="wb-prog-t">' + (batchOn(run.cfg) ? 'Batch · ' : 'Sequential · ') + esc(run.phase) + '</span></div>';
        } else if (run.status === 'stopped') {
          extra += '<div class="wb-notice">Stopped after <b class="wb-num">' + k.done + ' of ' + k.total + '</b>. Finished results are kept and can be reviewed now. Resume continues at the next unfinished company with <span class="wb-mono">' + esc(run.model) + '</span>, the model this run started with.</div>';
        }
      }
      const tip = run.id + ' \u00b7 ' + run.dateLabel + ' \u00b7 ' + run.model + ' \u00b7 ' + k.total + ' companies';
      put(R('head'), '<div class="wb-head-row"><div class="wb-head-t"><h1 title="' + esc(tip) + '"><span class="wb-h1-f">' + esc(run.file) + '</span> <span class="wb-status ' + stCls + '">' + stTxt + '</span></h1><div class="wb-head-meta">' + meta + '</div></div><div class="wb-head-acts">' + acts + '</div></div>' + extra);
    }

    /* ---------- strip ---------- */
    function renderStrip() {
      const run = activeRun();
      const k = counts(run);
      const f = S.f;
      const rows = run.kind === 'rows';
      const L = (long, short) => '<span class="wb-l-long">' + long + '</span><span class="wb-l-short">' + short + '</span>';
      const stat = (key, label, value, cls, pressed, sub, extra) => {
        const inner = '<span class="wb-stat-l">' + label + '</span><span class="wb-stat-v ' + (cls || '') + '">' + value + '</span>' + (sub ? '<span class="wb-stat-s">' + sub + '</span>' : '');
        return key && rows ? '<button class="wb-stat" data-act="stat" data-k="' + key + '" data-fk="stat-' + key + '" aria-pressed="' + !!pressed + '">' + inner + '</button>' : '<div class="wb-stat' + (extra ? ' is-extra' : '') + '">' + inner + '</div>';
      };
      const sub = [];
      if (rows && k.confirmed) sub.push(k.confirmed + ' reviewed');
      if (rows && k.reclassified) sub.push(k.reclassified + ' reclassified');
      let html = stat(null, L('Processed', 'Done'), k.done + '<small>/' + k.total + '</small>') +
        '<span class="wb-strip-sep"></span>' +
        stat('deep', L('Deep tech', 'Deep'), k.deep, 'is-deep', f.verdict.size === 1 && f.verdict.has('deep tech')) +
        stat('general', L('General tech', 'General'), k.general, '', f.verdict.size === 1 && f.verdict.has('general tech')) +
        stat('review', L('Needs review', 'Review'), k.open, k.open ? 'is-review' : '', f.status.size === 1 && f.status.has('open'), sub.join(' · ')) +
        '<span class="wb-strip-sep"></span>' +
        stat(null, 'Avg conf.', k.avg == null ? '\u2014' : k.avg, '', false, '', true) +
        stat(null, run.status === 'running' ? 'Cost so far' : 'Cost', k.costUnknown ? 'unknown' : k.cost == null ? '\u2014' : money(k.cost), '', false, '', true);
      if (rows) {
        const bins = Array.from({ length: 10 }, () => ({ d: 0, g: 0 }));
        run.ids.forEach((id) => {
          const v = rowView(run, id); if (!v.r) return;
          const b = bins[Math.min(9, Math.floor(v.r.conf / 10))];
          if (v.verdict === 'deep tech') b.d++; else b.g++;
        });
        const max = Math.max(1, ...bins.map((b) => b.d + b.g));
        const th = run.cfg.validatorThreshold;
        html += '<div class="wb-hist"><div class="wb-hist-bars" role="group" aria-label="Confidence distribution by final verdict">' + bins.map((b, i) => {
          const n = b.d + b.g;
          const lo = i * 10; const hi = i === 9 ? 100 : i * 10 + 9;
          return '<button class="wb-bin" data-act="bin" data-bin="' + i + '" data-fk="bin-' + i + '" aria-pressed="' + (f.bin === i) + '" ' + (n ? '' : 'disabled') + ' title="Confidence ' + lo + '–' + hi + ': ' + b.d + ' deep tech, ' + b.g + ' general tech" aria-label="Confidence ' + lo + ' to ' + hi + ', ' + n + ' companies">' +
            '<span class="wb-bin-g" style="height:' + Math.round(b.g / max * 30) + 'px"></span><span class="wb-bin-d" style="height:' + Math.round(b.d / max * 30) + 'px"></span></button>';
        }).join('') + '<span class="wb-hist-th" style="left:' + th + '%" title="Validation threshold ' + th + '"></span></div>' +
          '<div class="wb-hist-ax"><span>0</span><span><i class="wb-sw" style="background:var(--deep)"></i>deep · <i class="wb-sw" style="background:var(--border-strong)"></i>general</span><span>100</span></div></div>';
      }
      put(R('strip'), html);
    }

    /* ---------- chips ---------- */
    function anyFilter() { const f = S.f; return !!(f.risk.size || f.verdict.size || f.status.size || f.bin != null || f.q.trim()); }
    function renderChips() {
      const run = activeRun();
      R('tools').hidden = run.kind !== 'rows';
      if (run.kind !== 'rows') return;
      const k = counts(run);
      const f = S.f;
      const nAct = f.risk.size + f.verdict.size + f.status.size + (f.bin != null ? 1 : 0);
      R('tools').classList.toggle('is-open', S.filtersOpen);
      const tg = R('filt-tg');
      tg.setAttribute('aria-expanded', String(S.filtersOpen));
      tg.textContent = 'Filters' + (nAct ? ' \u00b7 ' + nAct + ' active' : '') + (anyFilter() ? ' \u00b7 ' + S.viewIds.length + ' of ' + run.ids.length : '') + (S.filtersOpen ? ' \u25b4' : ' \u25be');
      const chip = (grp, val, label, n) => '<button class="wb-chip" data-act="chip" data-g="' + grp + '" data-v="' + esc(val) + '" data-fk="chip-' + grp + '-' + esc(val) + '" aria-pressed="' + f[grp].has(val) + '">' + label + ' <span class="wb-chip-n">' + n + '</span></button>';
      let html = '<span class="wb-chipgrp"><span class="wb-chipgrp-l">Review</span>' + chip('status', 'open', 'Needs review', k.open) + chip('status', 'reviewed', 'Reviewed', k.confirmed) + chip('status', 'reclassified', 'Reclassified', k.reclassified) + '</span>' +
        '<span class="wb-chipgrp"><span class="wb-chipgrp-l">Risk</span>' + RISKS.map((r) => chip('risk', r, r, k.risk[r])).join('') + '</span>' +
        '<span class="wb-chipgrp"><span class="wb-chipgrp-l">Verdict</span>' + chip('verdict', 'deep tech', 'Deep tech', k.deep) + chip('verdict', 'general tech', 'General tech', k.general) + '</span>';
      if (f.bin != null) html += '<button class="wb-chip" data-act="clear-bin" data-fk="chip-bin" aria-pressed="true">Confidence ' + (f.bin * 10) + '–' + (f.bin === 9 ? 100 : f.bin * 10 + 9) + ' ✕</button>';
      let right = '<span class="wb-num">' + (anyFilter() ? 'Showing ' + S.viewIds.length + ' of ' + run.ids.length : run.ids.length + ' rows') + '</span>';
      if (anyFilter()) right += '<button class="wb-btn wb-btn-ghost wb-btn-sm" data-act="clear-filters" data-fk="clear-filters">Clear filters</button>';
      if (S.sortKey !== 'priority') right += '<button class="wb-btn wb-btn-ghost wb-btn-sm" data-act="sort-priority" data-fk="sort-priority" title="Needs review first, then lowest confidence">Sort: review priority</button>';
      else right += '<span class="wb-muted">' + (run.status === 'running' ? 'Input order while running' : 'Review priority order') + '</span>';
      put(R('chips'), html + '<span class="wb-tools-r">' + right + '</span>');
    }

    /* ---------- table ---------- */
    const COLS = [
      { k: 'idx', l: '#', a: 'is-r' }, { k: 'name', l: 'Company', a: '' },
      { k: 'verdict', l: 'Verdict', t: 'V', a: '' }, { k: 'conf', l: 'Conf.', a: 'is-r' },
      { k: 'crit', l: 'I · S · P', a: 'is-c' }, { k: 'risk', l: 'Risk flag', s: 'Risk', t: 'Risk', a: '' },
      { k: 'action', l: 'Action', t: '✓', a: '' }, { k: 'patents', l: 'Patents', s: 'Pat.', t: 'Pat.', a: 'is-r' },
      { k: 'cost', l: 'Cost', a: 'is-r' },
    ];
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
    function renderTable() {
      const run = activeRun();
      const wrap = R('table');
      if (run.kind !== 'rows') { put(wrap, archiveHtml(run)); return; }
      const ids = S.viewIds;
      if (!ids.length) {
        put(wrap, '<table class="wb-table">' + headHtml() + '</table><div class="wb-empty"><h2>No companies match these filters</h2><p>' + run.ids.length + ' companies in this run.</p><button class="wb-btn" data-act="clear-filters" data-fk="empty-clear">Clear filters</button></div>');
        return;
      }
      const t = Date.now();
      const body = ids.map((id) => {
        const v = rowView(run, id);
        const sel = id === S.selectedId;
        const nameCell = '<td><div class="wb-co"><button class="wb-rowbtn" data-act="select" data-id="' + id + '" data-fk="row-' + id + '" tabindex="' + (sel ? 0 : -1) + '" title="' + esc(v.c.name) + '">' + esc(v.c.name) + '</button><span class="wb-co-d">' + esc(v.c.domain) + '</span></div></td>';
        const idx = '<td class="wb-idx is-r">' + v.idx + '</td>';
        if (!v.r) {
          const p = v.prog;
          const wait = p === 'Waiting for batch' || p === 'In batch job' || p === 'Validation queued';
          const st = p ? '<span class="wb-step ' + (wait ? 'is-wait' : '') + '">' + esc(p) + '</span>' : '<span class="wb-queued">' + (run.status === 'stopped' ? 'Not started' : 'Queued') + '</span>';
          return '<tr class="is-pending" data-row="' + id + '" aria-selected="' + sel + '">' + idx + nameCell + '<td class="wb-stepcell">' + st + '</td><td></td><td class="wb-c-crit"></td><td></td><td></td><td class="is-r wb-muted wb-c-patents">—</td><td class="is-r wb-muted wb-c-cost">—</td></tr>';
        }
        const age = run.landed[id] ? t - run.landed[id] : 9999;
        const fresh = age < 240;
        const landStyle = fresh ? ' style="animation-delay:-' + age + 'ms"' : '';
        const landCls = fresh ? ' wb-land' : '';
        const r = v.r;
        const low = r.conf < run.cfg.validatorThreshold;
        const was = v.reclassified ? '<span class="wb-was" title="Pipeline verdict: ' + vLow(r.verdict) + '"><span class="wb-was-g" aria-hidden="true">↺</span><span class="wb-was-t">was ' + vLow(r.verdict) + '</span></span>' : '';
        return '<tr data-row="' + id + '" aria-selected="' + sel + '">' + idx + nameCell +
          '<td><span class="' + landCls + '"' + landStyle + '>' + verdictHtml(v.verdict) + was + '</span></td>' +
          '<td class="is-r"><span class="wb-conf' + (v.reclassified ? ' is-muted' : '') + landCls + '"' + landStyle + (v.reclassified ? ' title="Pipeline confidence in ' + vLow(r.verdict) + ', the verdict the reviewer overturned"' : '') + '><span class="wb-conf-t ' + (low ? 'is-low' : '') + '"><span style="transform:scaleX(' + (r.conf / 100).toFixed(2) + ')"></span></span><span class="wb-conf-n">' + r.conf + '</span></span></td>' +
          '<td class="is-c wb-c-crit">' + marksHtml(v.c) + '</td>' +
          '<td>' + riskHtml(r.risk) + '</td>' +
          '<td><span class="wb-act ' + (v.action === 'Needs Review' ? 'is-review' : '') + '">' + v.action + '</span>' + revTag(v) + '</td>' +
          '<td class="is-r wb-c-patents ' + (r.patents.count ? '' : 'wb-muted') + '">' + (r.patents.status === 'disabled' ? '—' : r.patents.count) + '</td>' +
          '<td class="is-r wb-dim wb-c-cost">' + (r.cost == null ? '<span title="Pinned model has no listed price">?</span>' : money(r.cost, 3)) + '</td></tr>';
      }).join('');
      const scroll = wrap.scrollTop;
      put(wrap, '<table class="wb-table" aria-label="Classification results">' + headHtml() + '<tbody>' + body + '</tbody></table><div class="wb-tablepad"></div>');
      wrap.scrollTop = scroll;
    }

    function archiveHtml(run) {
      const s = run.summary;
      if (run.status === 'complete') {
        return '<div class="wb-arch"><h2>Results are in the workbook</h2><p>' + (run.resumed ? 'This run was resumed and finished today.' : 'This run finished on ' + esc(run.dateLabel) + '.') + ' Its rows were not kept in this workspace, so the Management View and Full Detail sheets are the record. Download the workbook to review its ' + s.review + ' flagged ' + (s.review === 1 ? 'company' : 'companies') + '.</p>' +
          '<div class="wb-arch-bar is-complete"><span style="transform:scaleX(1)"></span></div><p class="wb-num">' + s.total + ' of ' + s.total + ' classified' + (s.errors ? ' · ' + s.errors + ' ended in an error and will be retried on a re-run' : '') + '</p>' +
          '<div class="wb-arch-acts"><button class="wb-btn" data-act="download" data-fk="arch-download">Download Excel ' + kbd('D') + '</button><button class="wb-btn wb-btn-ghost" data-act="new-run" data-fk="arch-new">New run</button></div></div>';
      }
      const running = run.status === 'running';
      return '<div class="wb-arch"><h2>' + (running ? 'Resuming ' : 'Interrupted at company ') + '<span class="wb-num">' + s.done + ' of ' + s.total + '</span></h2>' +
        '<p>Progress is checkpointed after every company. Resume continues at company ' + (s.done + 1) + ' with <span class="wb-mono">' + esc(run.model) + '</span>, the model this run started with, and retries any company that ended in an error. It needs the same input file, <b>' + esc(run.file) + '</b>, with its rows in the same order.</p>' +
        '<div class="wb-arch-bar ' + (running ? 'is-running' : '') + '"><span style="transform:scaleX(' + (s.done / s.total).toFixed(3) + ')"></span></div>' +
        '<p class="wb-num">' + (running ? esc(run.phase) : (s.total - s.done) + ' companies left · about ' + fmtDur((s.total - s.done) * D.estSecondsPerCompany.sequential).slice(1) + ' at the usual pace') + '</p>' +
        '<div class="wb-arch-acts">' + (running ? '<button class="wb-btn wb-btn-stop" data-act="stop" data-fk="arch-stop">■ Stop ' + kbd('S') + '</button>' : '<button class="wb-btn wb-btn-primary" data-act="resume" data-fk="arch-resume">Resume run ' + kbd('S') + '</button>') +
        '<button class="wb-btn" data-act="download" data-fk="arch-download">Download partial Excel</button></div></div>';
    }

    /* ---------- detail panel ---------- */
    function detailSig() {
      const run = activeRun();
      if (run.kind !== 'rows') return run.id + '|' + run.status + '|' + run.summary.done;
      const id = S.selectedId;
      return run.id + '|' + run.status + '|' + id + '|' + (id ? (run.results[id] ? 'done' : run.progress[id] || 'q') : '');
    }
    function readToggle() {
      return '<button class="wb-btn wb-btn-sm" data-act="reading" data-fk="reading" aria-pressed="' + S.reading + '" title="' + (S.reading ? 'Back to the table layout' : 'Give the evidence most of the screen') + '">' + (S.reading ? 'Exit reading view' : 'Reading view') + ' ' + kbd('E') + '</button>';
    }
    function renderDetail(opts) {
      const run = activeRun();
      const el = R('detail');
      const keep = el.scrollTop;
      lastDetailSig = detailSig();
      if (run.kind !== 'rows') { put(el, runDetailHtml(run)); el.scrollTop = 0; return; }
      const id = S.selectedId;
      if (!id) { put(el, '<div class="wb-d-empty">Select a row to see its evidence.<br>' + kbd('J') + ' ' + kbd('K') + ' move through the table · ' + kbd('?') + ' all shortcuts</div>'); return; }
      const v = rowView(run, id);
      put(el, '<div class="wb-d">' + detailTop(run, v) + (v.r ? docHtml(run, v) : pendingDetail(run, v)) + '</div>');
      el.scrollTop = opts && opts.reset ? 0 : keep;
    }

    function detailTop(run, v) {
      const c = v.c;
      const sub = '<div class="wb-d-sub">' + (run.cfg.mapping.uen ? '<span class="wb-mono">UEN ' + esc(c.uen) + '</span>' : '') + '<span>' + esc(c.domain) + '</span><span class="wb-num">Row ' + v.idx + ' of ' + run.ids.length + '</span></div>';
      let h = '<div class="wb-d-top"><div class="wb-d-row1"><div><h2>' + esc(c.name) + '</h2>' + sub + '</div>' + readToggle() + '</div>';
      if (v.r) {
        const r = v.r;
        h += v.reclassified
          ? '<div class="wb-d-row2">' + verdictHtml(v.verdict) + '<span class="wb-dim">\u00b7 reviewer decision</span>' +
            '<span class="wb-muted wb-num">Pipeline: ' + vLow(r.verdict) + ', ' + r.conf + ' \u00b7 ' + r.risk + '</span>' +
            '<span class="wb-dim">' + v.action + ' \u00b7 reclassified</span></div>'
          : '<div class="wb-d-row2">' + verdictHtml(v.verdict) +
            '<span class="wb-d-conf"><b>' + r.conf + '</b> ' + confWord(r.conf).toLowerCase() + ' confidence</span>' + riskHtml(r.risk) +
            '<span class="wb-dim">' + v.action + (v.confirmed ? ' \u00b7 reviewed' : '') + '</span></div>';
        h += decisionArea(run, v);
      } else {
        h += '<div class="wb-d-row2"><span class="wb-dim">' + (v.prog ? 'In progress: ' + esc(v.prog) : run.status === 'stopped' ? 'Not started' : 'Queued') + '. Decisions open when the result is in.</span></div>';
      }
      return h + '</div>';
    }

    const needsNote = (v, choice) => v.r.risk === 'Clear' && choice === 'change';
    function formProblem(v, form) {
      if (!form.choice) return 'Choose an outcome.';
      if (needsNote(v, form.choice) && !form.note.trim()) return 'A note is required to overturn a Clear verdict. It is written to the workbook.';
      return '';
    }
    function decisionArea(run, v) {
      const key = formKey(run, v.c.id);
      const form = S.forms[key];
      if (form && form.open) return formHtml(run, v, form);
      const pv = v.r.verdict;
      if (v.dec) {
        const last = (run.history[v.c.id] || []).slice(-1)[0];
        return '<div class="wb-ds"><span class="wb-ds-t"><b>' + (v.reclassified ? '↺ Reclassified to ' + vLow(v.dec.verdict) : '✓ Confirmed ' + vLow(v.dec.verdict)) + '</b>' + (last ? ' · ' + hhmm(last.at) : '') + (v.dec.note ? ' · “' + esc(v.dec.note) + '”' : '') + '</span>' +
          '<button class="wb-btn wb-btn-sm" data-act="change-dec" data-fk="change-dec">Change decision ' + kbd('X') + '</button>' +
          '<button class="wb-btn wb-btn-sm wb-btn-ghost" data-act="restore" data-fk="restore">Restore pipeline verdict</button></div>';
      }
      if (v.flagged) {
        return '<div class="wb-ds"><button class="wb-btn wb-btn-sm wb-btn-primary" data-act="quick-confirm" data-fk="quick-confirm">✓ Confirm ' + vLow(pv) + ' ' + kbd('C') + '</button>' +
          '<button class="wb-btn wb-btn-sm" data-act="open-change" data-fk="open-change">Change to ' + vLow(flip(pv)) + ' ' + kbd('X') + '</button>' +
          '<button class="wb-btn wb-btn-sm wb-btn-ghost" data-act="open-note" data-fk="open-note">Note ' + kbd('M') + '</button></div>';
      }
      return '<div class="wb-ds"><span class="wb-ds-t">' + v.action + ' · no review needed</span><button class="wb-btn wb-btn-sm wb-btn-ghost" data-act="open-change" data-fk="open-change">Reclassify ' + kbd('X') + '</button></div>';
    }
    function formHtml(run, v, form) {
      const pv = v.r.verdict;
      const req = form.choice ? needsNote(v, form.choice) : false;
      const prob = formProblem(v, form);
      return '<div class="wb-form"><div class="wb-seg" role="radiogroup" aria-label="Outcome">' +
        '<label><input type="radio" name="wb-dec" value="confirm" data-fk="dec-confirm"' + (form.choice === 'confirm' ? ' checked' : '') + '>' + (v.flagged ? 'Confirm ' : 'Keep ') + vLow(pv) + ' ' + kbd('C') + '</label>' +
        '<label><input type="radio" name="wb-dec" value="change" data-fk="dec-change"' + (form.choice === 'change' ? ' checked' : '') + '>Change to ' + vLow(flip(pv)) + ' ' + kbd('X') + '</label></div>' +
        '<textarea data-fk="note" aria-label="Reviewer note" placeholder="' + (req ? 'Why the pipeline verdict is wrong (required, written to the workbook)' : 'Note for the record (optional)') + '">' + esc(form.note) + '</textarea>' +
        '<div class="wb-form-acts"><button class="wb-btn wb-btn-sm wb-btn-primary" data-act="record" data-fk="record"' + (prob ? ' disabled' : '') + '>Record ' + kbd(MOD, '↵') + '</button>' +
        '<button class="wb-btn wb-btn-sm wb-btn-ghost" data-act="cancel-form" data-fk="cancel-form">Cancel</button>' +
        '<span class="wb-form-why ' + (prob ? '' : 'is-ok') + '" data-r="form-why">' + (prob || (req ? 'The note will be written to the workbook.' : kbd('Esc') + ' leaves the note, the draft is kept')) + '</span></div></div>';
    }
    function syncForm() {
      const run = activeRun(); const id = S.selectedId; if (!id) return;
      const v = rowView(run, id); const form = S.forms[formKey(run, id)];
      if (!v.r || !form) return;
      const el = R('detail');
      const prob = formProblem(v, form);
      const req = form.choice ? needsNote(v, form.choice) : false;
      const b = el.querySelector('[data-fk="record"]'); if (b) b.disabled = !!prob;
      const w = el.querySelector('[data-r="form-why"]');
      if (w) { w.className = 'wb-form-why ' + (prob ? '' : 'is-ok'); w.innerHTML = prob ? esc(prob) : (req ? 'The note will be written to the workbook.' : kbd('Esc') + ' leaves the note, the draft is kept'); }
      const ta = el.querySelector('[data-fk="note"]');
      if (ta) ta.placeholder = req ? 'Why the pipeline verdict is wrong (required, written to the workbook)' : 'Note for the record (optional)';
    }

    function sec(key, title, aside, body) {
      const closed = !!S.collapsed[key];
      return '<section class="wb-sec" data-sec="' + key + '"><h3 class="wb-sec-h"><button class="wb-sec-btn" data-act="toggle-sec" data-k="' + key + '" data-fk="sec-' + key + '" aria-expanded="' + !closed + '"><span class="wb-caret" aria-hidden="true">' + (closed ? '▸' : '▾') + '</span>' + title + '</button><span class="wb-sec-aside">' + (aside || '') + '</span></h3>' + (closed ? '' : '<div class="wb-sec-b">' + body + '</div>') + '</section>';
    }

    function docHtml(run, v) {
      const r = v.r; const c = v.c;
      const main = (v.reclassified ? reclassHtml(v) : flagHtml(run, r)) +
        sec('reasoning', 'Reasoning', v.reclassified ? 'Pipeline, supports ' + vLow(r.verdict) : 'Classifier, ' + BASIS[r.basis].toLowerCase(), '<p class="wb-lead">' + esc(c.reasoning) + '</p>') +
        criteriaHtml(c) + buildHtml(run, r, v) + evidenceHtml(c, r) + patentsHtml(r) + validatorHtml(run, r) + historyHtml(run, v) +
        sec('facts', 'Run facts', '', factsHtml(run, v, false));
      return '<div class="wb-doc"><div class="wb-doc-main">' + main + '</div><aside class="wb-doc-facts" aria-label="Facts">' + factsHtml(run, v, true) + '</aside></div>';
    }

    function factsHtml(run, v, stack) {
      const c = v.c; const r = v.r;
      const web = r.hasWeb ? c.webSource : !run.cfg.enrichment ? 'Enrichment off' : c.webStatus === 'not_found' ? 'Nothing reliable found' : 'Not used';
      const pat = r.patents.status === 'disabled' ? 'Lookup off' : r.patents.count + ' · ' + r.patents.level;
      const val = r.validated ? VAL_FIND[r.val.verdict] + ' · ' + r.val.confidence : run.cfg.validator ? 'Not needed' : 'Validation off';
      const rows = [
        ['UEN', run.cfg.mapping.uen ? '<span class="wb-mono">' + esc(c.uen) + '</span>' : 'Not mapped'],
        ['Sector', esc(c.domain)], ['Basis', BASIS[r.basis]], ['Web source', esc(web)], ['Patents', esc(pat)], ['Validator', esc(val)],
        ['Cost', r.cost == null ? 'unknown (pinned model has no listed price)' : money(r.cost, 3)], ['Time', r.timeS.toFixed(1) + ' s'],
        ['Model', '<span class="wb-mono">' + esc(run.model) + '</span>'],
      ];
      return '<dl class="wb-kv wb-num' + (stack ? ' is-stack' : '') + '">' + rows.map((x) => '<dt>' + x[0] + '</dt><dd>' + x[1] + '</dd>').join('') + '</dl>';
    }

    function reclassHtml(v) {
      const r = v.r;
      return '<div class="wb-flag r-Reclass"><div class="wb-flag-t">Reclassified by reviewer: ' + vLow(v.verdict) + '</div>' +
        '<p>' + (v.dec.note ? '\u201c' + esc(v.dec.note) + '\u201d' : 'No note recorded.') + '</p>' +
        '<p>The pipeline said ' + vLow(r.verdict) + ' with confidence ' + r.conf + ' (' + r.risk + '). The reasoning, criteria and confidence below are the pipeline\u2019s and support its original verdict, not the reviewer\u2019s.</p></div>';
    }

    function flagHtml(run, r) {
      const th = run.cfg.validatorThreshold;
      let t = ''; let p = '';
      if (r.risk === 'Clear') {
        t = 'Clear: no open questions';
        p = r.validated ? 'The validator checked the web and confirmed the verdict with enough confidence, so the action follows the verdict.'
          : r.conf < th && !run.cfg.validator ? 'Confidence is below ' + th + ', but validation was off for this run, so nothing challenged the verdict. Treat it with care.'
            : 'Confidence reached ' + th + ' or more without needing a second opinion. The action follows the verdict.';
      } else if (r.risk === 'Uncertain') {
        t = 'Uncertain: evidence is thin';
        p = 'The validator searched the web, but confidence is still below ' + th + '. Nothing contradicts the verdict; there just is not enough to be sure.';
      } else if (r.risk === 'Contested') {
        t = 'Contested: the validator disagreed';
        p = 'A second pass argued for ' + vLow(flip(r.verdict)) + ', with confidence ' + r.val.confidence + '. That is below the ' + run.cfg.overrideMinConfidence + ' needed to change the verdict, so the original verdict stands with reduced confidence. Two readings are plausible.';
      } else {
        t = 'Escalate: needs a human decision';
        p = 'The validator found the evidence contradictory or insufficient and handed the call to a reviewer.';
      }
      const reason = r.val && r.val.escalationReason ? '<p><b>Reason:</b> ' + esc(r.val.escalationReason) + '</p>' : '';
      return '<div class="wb-flag r-' + r.risk + '"><div class="wb-flag-t">' + t + '</div><p>' + p + '</p>' + reason + '</div>';
    }

    function criteriaHtml(c) {
      const met = CRIT.filter((x) => c.criteria[x[0]].met).length;
      return sec('criteria', 'Criteria', '<span class="wb-num">' + met + ' of 3 met</span>', CRIT.map((x) => {
        const cr = c.criteria[x[0]];
        return '<div class="wb-crit"><span class="wb-mk ' + (cr.met ? 'is-y' : 'is-n') + '" aria-hidden="true">' + (cr.met ? '✓' : x[1]) + '</span><b>' + x[2] + ' · ' + (cr.met ? 'met' : 'not met') + '</b><p>' + esc(cr.reasoning) + '</p></div>';
      }).join(''));
    }

    function buildHtml(run, r, v) {
      const cfg = run.cfg;
      const th = cfg.validatorThreshold;
      let rows = '<tr><td>Classifier score<span class="wb-why">Agent 1 confidence in its verdict</span></td><td>' + r.llm + '</td></tr>';
      const patWhy = !cfg.epo ? 'Patent lookup was off for this run' : r.adj === 0 ? (r.patents.count ? 'Patents are not deep tech; no adjustment' : 'No patents found; no adjustment') : r.patents.level + ' portfolio, ' + r.patents.count + ' patent' + (r.patents.count === 1 ? '' : 's') + ', max ±' + cfg.epoAdjustMax;
      rows += '<tr><td>Patent adjustment<span class="wb-why">' + esc(patWhy) + '</span></td><td>' + signed(r.adj) + '</td></tr>';
      if (r.capped && !r.validated) rows += '<tr><td>Low-evidence cap<span class="wb-why">No description and no patents</span></td><td>≤ ' + cfg.lowEvidenceCap + '</td></tr>';
      rows += '<tr><td>Before validation<span class="wb-why">' + (!cfg.validator ? 'Validation off for this run' : r.validated ? 'Below ' + th + ', so the validator ran' : r.pre < th ? 'Below ' + th + '; validator not triggered in this run' : th + ' or more, so no validation needed') + '</span></td><td>' + r.pre + '</td></tr>';
      if (r.validated) {
        const how = r.val.verdict === 'confirm' ? 'Confirmed: takes the validator’s confidence'
          : r.override === 'applied' ? 'Override applied: verdict flipped, takes the validator’s confidence'
            : r.override === 'blocked' ? 'Override blocked: at most 100 − ' + r.val.confidence
              : 'Insufficient evidence: confidence can only go down';
        rows += '<tr><td>Validator<span class="wb-why">' + how + (r.capped ? '; low-evidence cap ' + cfg.lowEvidenceCap : '') + '</span></td><td>' + signed(r.conf - r.pre) + '</td></tr>';
      }
      rows += '<tr class="is-total"><td>Final confidence</td><td>' + r.conf + '</td></tr>';
      const track = '<div class="wb-track" aria-hidden="true"><span class="wb-track-l"></span><span class="wb-track-th" style="left:' + th + '%"></span>' +
        (r.pre !== r.conf ? '<span class="wb-track-pre" style="left:' + r.pre + '%"></span>' : '') + '<span class="wb-track-fin" style="left:' + r.conf + '%"></span></div>' +
        '<div class="wb-track-ax"><span>0</span><span>' + (r.pre !== r.conf ? '○ before validation · ● final · ' : '') + 'dashed: validation threshold ' + th + '</span><span>100</span></div>';
      return sec('build', 'How the pipeline\u2019s confidence was built', '<span class="wb-num">' + (v && v.reclassified ? 'in ' + vLow(r.verdict) + ': ' + r.conf : r.conf + ' \u00b7 ' + confWord(r.conf).toLowerCase()) + '</span>', '<table class="wb-build"><tbody>' + rows + '</tbody></table>' + track);
    }

    function evidenceHtml(c, r) {
      let q = '';
      if (r.hasWeb) q += '<div class="wb-quote">' + esc(c.webDescription) + '<span class="wb-quote-src">Web enrichment · ' + esc(c.webSource) + '</span></div>';
      if (r.hasInputDesc) q += '<div class="wb-quote">' + esc(c.description) + '<span class="wb-quote-src">Input file</span></div>';
      if (!q) q = '<div class="wb-quote">No description in the input file' + (c.webStatus === 'not_found' ? ' and nothing reliable found on the web' : '') + '. The verdict rests on the company name' + (r.patents.count ? ' and patents' : '') + '.</div>';
      return sec('read', 'What the classifier read', BASIS[r.basis], q);
    }

    function patentsHtml(r) {
      const p = r.patents;
      if (p.status === 'disabled') return sec('patents', 'Patents (EPO)', 'off', '<p class="wb-muted">Patent lookup was off for this run.</p>');
      const cpc = p.cpc.map((x) => '<div class="wb-cpc"><code>' + esc(x.code) + '</code><span>' + esc(x.desc) + '</span></div>').join('');
      return sec('patents', 'Patents (EPO)', '<span class="wb-num">' + p.count + ' found</span>', '<dl class="wb-kv"><dt>Deep tech level</dt><dd>' + esc(p.level) + '</dd>' + (p.domain ? '<dt>Domain</dt><dd>' + esc(p.domain) + '</dd>' : '') + '<dt>Lookup</dt><dd>' + (p.status === 'success' ? 'Matched in EPO' : 'No matching applicant') + '</dd></dl>' + (cpc ? '<div style="margin-top:6px">' + cpc + '</div>' : ''));
    }

    function validatorHtml(run, r) {
      if (!r.validated) {
        const why = !run.cfg.validator ? 'Validation was off for this run.' : 'Not run: confidence before validation was ' + r.pre + ', at or above the threshold of ' + run.cfg.validatorThreshold + ', or this company was not flagged for a second pass.';
        return sec('validator', 'Validator (Agent 2)', 'not run', '<p class="wb-muted">' + why + '</p>');
      }
      const val = r.val;
      return sec('validator', 'Validator (Agent 2)', '<span class="wb-num">confidence ' + val.confidence + '</span>',
        '<dl class="wb-kv"><dt>Finding</dt><dd>' + VAL_FIND[val.verdict] + (r.override ? ' (override ' + r.override + ')' : '') + '</dd><dt>Decision</dt><dd>' + VAL_DEC[val.decision] + '</dd></dl>' +
        '<div class="wb-quote" style="margin-top:8px">' + esc(val.summary) + '</div>' +
        '<div class="wb-hint">Sources (' + val.sources.length + ')</div><ul class="wb-srcs">' + val.sources.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ul>');
    }

    function historyHtml(run, v) {
      const h = run.history[v.c.id] || [];
      const r = v.r;
      const items = ['<li><span class="wb-h-time">' + esc(run.timeLabel) + '</span><span><b>Pipeline:</b> ' + vLow(r.verdict) + ' · confidence ' + r.conf + ' · ' + r.risk + ' → ' + (r.risk !== 'Clear' ? 'Needs Review' : actionFor(r.verdict)) + '</span></li>'];
      let final = r.verdict;
      h.forEach((e) => {
        const what = e.type === 'restore' ? 'Restored pipeline verdict (' + vLow(e.verdict) + ')'
          : e.verdict !== final ? 'Changed to ' + vLow(e.verdict) : 'Confirmed ' + vLow(e.verdict);
        final = e.verdict;
        items.push('<li><span class="wb-h-time">' + hhmm(e.at) + '</span><span><b>' + what + '</b>' + (e.note ? '<span class="wb-h-note">“' + esc(e.note) + '”</span>' : '') + '</span></li>');
      });
      return sec('history', 'Decision history', h.length ? h.length + ' reviewer action' + (h.length === 1 ? '' : 's') : 'no reviewer actions yet', '<ol class="wb-hlist">' + items.join('') + '</ol>');
    }

    function pendingDetail(run, v) {
      const r0 = derive(v.c, run.cfg);
      const steps = batchOn(run.cfg)
        ? ['Enrichment', 'Patent lookup', 'Classification', 'Validation'].filter((s) => (s !== 'Enrichment' || run.cfg.enrichment) && (s !== 'Patent lookup' || run.cfg.epo) && (s !== 'Validation' || r0.validated))
        : stepsFor(run.cfg, r0);
      const p = v.prog;
      const map = { 'Waiting for batch': 'Classification', 'In batch job': 'Classification', 'Validation queued': 'Validation', 'Reading input': 'Classification' };
      const cur = p ? (map[p] || p) : null;
      const ci = cur ? steps.indexOf(cur) : -1;
      const list = steps.map((s, i) => {
        const cls = ci < 0 ? '' : i < ci ? 'is-done' : i === ci ? 'is-now' : '';
        const txt = ci < 0 ? 'waiting' : i < ci ? 'done' : i === ci ? (p === s ? 'in progress' : p.toLowerCase()) : 'waiting';
        return '<li class="' + cls + '"><span>' + (i + 1) + '.</span><span>' + s + '</span><span>' + txt + '</span></li>';
      }).join('');
      return '<div class="wb-doc"><div class="wb-doc-main"><section class="wb-sec"><h3 class="wb-sec-h">' + (p ? 'In progress' : run.status === 'stopped' ? 'Not started' : 'Queued') + '<span class="wb-sec-aside">' + (batchOn(run.cfg) ? 'Batch mode' : 'One at a time') + '</span></h3><ul class="wb-steps">' + list + '</ul>' +
        (run.status === 'stopped' ? '<p class="wb-hint">This company had not finished when the run stopped. Resume to classify it.</p>' : '') + '</section>' +
        '<section class="wb-sec"><h3 class="wb-sec-h">From the input file</h3><div class="wb-quote">' + (v.c.description ? esc(v.c.description) : 'No description in the input file.') + '</div></section></div></div>';
    }

    function runDetailHtml(run) {
      const s = run.summary;
      const st = run.status === 'complete' ? 'Complete' : run.status === 'running' ? 'Resuming' : 'Interrupted';
      return '<div class="wb-d"><div class="wb-d-top"><div class="wb-d-row1"><div><h2>' + esc(run.file) + '</h2><div class="wb-d-sub"><span class="wb-mono">' + esc(run.id) + '</span></div></div></div></div><div class="wb-doc"><div class="wb-doc-main">' +
        '<section class="wb-sec"><h3 class="wb-sec-h">Run</h3><dl class="wb-kv wb-num"><dt>Status</dt><dd>' + st + '</dd><dt>Date</dt><dd>' + esc(run.dateLabel) + '</dd><dt>Model</dt><dd class="wb-mono">' + esc(run.model) + '</dd><dt>Companies</dt><dd>' + s.done + ' of ' + s.total + '</dd>' +
        '<dt>Deep tech</dt><dd>' + s.deep + '</dd><dt>General tech</dt><dd>' + s.general + '</dd><dt>Needs review</dt><dd>' + s.review + '</dd>' +
        (s.errors ? '<dt>Errors</dt><dd>' + s.errors + '</dd>' : '') +
        '<dt>Cost</dt><dd>' + (s.cost != null ? money(s.cost) : 'shown when the run completes') + '</dd></dl></section>' +
        (run.status !== 'complete' ? '<section class="wb-sec"><h3 class="wb-sec-h">Resume rules</h3><p class="wb-dim">Resume with the same input file; checkpoints are keyed by row position and the run stops if the rows no longer match. Companies that ended in an error are retried.</p></section>' : '') +
        '</div></div></div>';
    }

    /* While a new run is being set up, the main column shows the draft instead. */
    function renderAll() {
      renderRail();
      if (S.setup) { renderSetup(); return; }
      R('strip').hidden = false;
      renderHead(); renderStrip(); renderChips(); renderTable(); renderDetail();
    }

    /* ---------- selection ---------- */
    function rowBtn(id) { return R('table').querySelector('[data-fk="row-' + id + '"]'); }
    function select(id, opts) {
      S.selectedId = id;
      renderTable(); renderDetail({ reset: true });
      const btn = rowBtn(id);
      if (btn) {
        if (btn.scrollIntoView) btn.scrollIntoView({ block: 'nearest' });
        if (opts && opts.focus) btn.focus({ preventScroll: true });
      }
    }
    const focusInTable = () => R('table').contains(document.activeElement);
    function move(delta) {
      const run = activeRun(); if (run.kind !== 'rows') return;
      const ids = S.viewIds; if (!ids.length) return;
      const i = ids.indexOf(S.selectedId);
      const next = i < 0 ? ids[delta > 0 ? 0 : ids.length - 1] : ids[clamp(i + delta, 0, ids.length - 1)];
      select(next, { focus: focusInTable() });
    }
    function moveTo(end) {
      const run = activeRun(); if (run.kind !== 'rows' || !S.viewIds.length) return;
      select(end ? S.viewIds[S.viewIds.length - 1] : S.viewIds[0], { focus: focusInTable() });
    }
    function nextOpen(dir) {
      const run = activeRun(); if (run.kind !== 'rows') return;
      const ids = S.viewIds;
      const n = ids.length;
      const i = ids.indexOf(S.selectedId);
      for (let step = 1; step <= n; step++) {
        const j = ((i < 0 ? (dir > 0 ? -1 : 0) : i) + dir * step + n * 2) % n;
        if (rowView(run, ids[j]).open) { select(ids[j], { focus: focusInTable() }); return; }
      }
      const anyOpen = run.ids.some((id) => rowView(run, id).open);
      toast(anyOpen ? 'No company needing review in this view' : 'Nothing left to review', anyOpen ? 'Clear filters to see the rest.' : 'Every flagged company has a decision.');
    }

    function openRun(id) {
      if (S.setup) {
        // Leaving setup keeps the draft in the rail; Cancel is what discards it.
        exitSetup();
        if (S.activeId === id) { renderAll(); return; }
      }
      if (S.activeId === id) return;
      S.activeId = id;
      S.f = newFilters();
      root.querySelector('[data-fk="search"]').value = '';
      S.sortKey = 'priority'; S.sortDir = 1;
      refreshView(true);
      S.selectedId = S.viewIds.length ? S.viewIds[0] : null;
      renderAll();
      R('table').scrollTop = 0;
      R('detail').scrollTop = 0;
    }
    function refreshFilters() {
      refreshView(true);
      renderStrip(); renderChips(); renderTable();
    }

    /* ---------- toasts ---------- */
    /* One toast at a time: a new message replaces the current one in place. */
    let toastEl = null; let toastTimer = null; let toastGone = null;
    function toast(title, body, opts) {
      const host = R('toasts');
      const html = '<div><b>' + esc(title) + '</b>' + (body ? '<span>' + esc(body) + '</span>' : '') + '</div>' +
        (opts && opts.undo ? '<button class="wb-toast-btn" data-act="undo">Undo ' + kbd('U') + '</button>' : '');
      cancel(toastTimer); cancel(toastGone);
      if (toastEl && toastEl.isConnected && !toastEl.classList.contains('is-leaving')) {
        toastEl.innerHTML = html;
      } else {
        host.innerHTML = '';
        toastEl = document.createElement('div');
        toastEl.className = 'wb-toast';
        toastEl.innerHTML = html;
        host.appendChild(toastEl);
      }
      const el = toastEl;
      toastTimer = later(() => {
        el.classList.add('is-leaving');
        toastGone = later(() => { el.remove(); if (toastEl === el) toastEl = null; }, 170);
      }, opts && opts.undo ? 5200 : 3400);
    }

    function download() {
      const run = activeRun();
      const base = run.file.replace(/\.(xlsx|xls|csv)$/i, '');
      const name = base + '_classified_' + run.id.replace(/^run_/, '') + '.xlsx';
      if (run.kind === 'rows') {
        const k = counts(run);
        const partial = k.done < k.total;
        toast((partial ? 'Saved partial workbook ' : 'Saved ') + name, (partial ? k.done + ' of ' + k.total + ' companies · ' : '') + k.confirmed + ' verdict' + (k.confirmed === 1 ? '' : 's') + ' confirmed · ' + k.reclassified + ' reclassified · ' + k.open + ' still need review');
      } else {
        const s = run.summary;
        toast((s.done < s.total ? 'Saved partial workbook ' : 'Saved ') + name, s.done + ' of ' + s.total + ' companies · Overview, Management View, Full Detail, Legend');
      }
    }

    /* ---------- decisions, reclassification, undo ---------- */
    function pushUndo(run, id, label) {
      undoStack.push({ runId: run.id, id, prev: run.decisions[id] || null, histLen: (run.history[id] || []).length, label });
    }
    function afterDecision() {
      renderRail();
      if (S.setup) return; renderStrip(); renderChips(); renderTable(); renderDetail();
    }
    function record(run, id, choice, note) {
      const v = rowView(run, id);
      if (!v.r) return;
      const verdict = choice === 'confirm' ? v.r.verdict : flip(v.r.verdict);
      const prevFinal = v.verdict;
      const at = new Date();
      const what = verdict !== prevFinal ? 'Changed ' + v.c.name + ' to ' + vLow(verdict) : 'Confirmed ' + v.c.name + ' as ' + vLow(verdict);
      pushUndo(run, id, what);
      run.decisions[id] = { choice, verdict, note: note || '', at };
      (run.history[id] = run.history[id] || []).push({ type: choice, verdict, note: note || '', at });
      delete S.forms[formKey(run, id)];
      toast(what, actionFor(verdict) + (note ? ' \u00b7 note saved' : '') + ' \u00b7 ' + undoStack.length + ' undoable', { undo: true });
      afterDecision();
    }
    function restore(run, id) {
      const v = rowView(run, id);
      if (!v.r || !v.dec) return;
      pushUndo(run, id, 'Restored ' + v.c.name);
      delete run.decisions[id];
      (run.history[id] = run.history[id] || []).push({ type: 'restore', verdict: v.r.verdict, note: '', at: new Date() });
      delete S.forms[formKey(run, id)];
      toast('Restored pipeline verdict for ' + v.c.name, v.flagged ? 'Back to Needs Review' : actionFor(v.r.verdict), { undo: true });
      afterDecision();
    }
    function undo() {
      const u = undoStack.pop();
      if (!u) { toast('Nothing to undo', 'Reviewer actions in this session can be undone one at a time.'); return; }
      const run = runById(u.runId);
      if (u.prev) run.decisions[u.id] = u.prev; else delete run.decisions[u.id];
      if (run.history[u.id]) run.history[u.id].length = u.histLen;
      toast('Undone: ' + u.label, undoStack.length ? undoStack.length + ' more action' + (undoStack.length === 1 ? '' : 's') + ' can be undone' : '');
      if (run.id === S.activeId) {
        if (S.viewIds.indexOf(u.id) >= 0 && S.selectedId !== u.id) { S.selectedId = u.id; afterDecision(); const b = rowBtn(u.id); if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest' }); }
        else afterDecision();
      } else renderRail();
    }
    function selectedView() {
      const run = activeRun();
      if (run.kind !== 'rows' || !S.selectedId) return null;
      return { run, v: rowView(run, S.selectedId) };
    }
    function openForm(choice, focusNote) {
      const sv = selectedView(); if (!sv || !sv.v.r) return;
      const key = formKey(sv.run, sv.v.c.id);
      const prev = S.forms[key];
      S.forms[key] = { open: true, choice: choice != null ? choice : (prev ? prev.choice : ''), note: prev ? prev.note : (sv.v.dec ? sv.v.dec.note : '') };
      renderDetail();
      if (focusNote) {
        const ta = R('detail').querySelector('[data-fk="note"]');
        if (ta) { ta.focus({ preventScroll: true }); ta.setSelectionRange(ta.value.length, ta.value.length); }
      }
    }
    function keyConfirm() {
      const sv = selectedView(); if (!sv || !sv.v.r) return;
      const v = sv.v;
      if (!v.flagged) { toast('C confirms flagged companies', 'This one is Clear. Press X to reclassify it.'); return; }
      if (v.confirmed) { toast(v.c.name + ' is already confirmed', 'Press N for the next company needing review.'); return; }
      const form = S.forms[formKey(sv.run, v.c.id)];
      record(sv.run, v.c.id, 'confirm', form ? form.note.trim() : '');
      nextOpen(1);
    }
    function keyChange() {
      const sv = selectedView(); if (!sv || !sv.v.r) return;
      const target = flip(sv.v.verdict);
      openForm(target === sv.v.r.verdict ? 'confirm' : 'change', true);
    }
    function focusNote() {
      const sv = selectedView(); if (!sv || !sv.v.r) return;
      openForm(null, true);
    }
    function recordFromForm() {
      const sv = selectedView(); if (!sv || !sv.v.r) return;
      const form = S.forms[formKey(sv.run, sv.v.c.id)];
      if (!form || formProblem(sv.v, form)) { syncForm(); return; }
      record(sv.run, sv.v.c.id, form.choice, form.note.trim());
      const b = R('detail').querySelector('[data-fk="change-dec"]'); if (b) b.focus({ preventScroll: true });
    }
    function leaveNote() {
      const b = rowBtn(S.selectedId);
      if (b) b.focus({ preventScroll: true }); else document.activeElement.blur();
    }

    /* ---------- view toggles ---------- */
    function toggleReading(force) {
      S.reading = typeof force === 'boolean' ? force : !S.reading;
      root.classList.toggle('is-reading', S.reading);
      const top = R('detail').querySelector('[data-fk="reading"]');
      if (top) { top.setAttribute('aria-pressed', String(S.reading)); top.innerHTML = (S.reading ? 'Exit reading view' : 'Reading view') + ' ' + kbd('E'); }
      const b = S.selectedId && rowBtn(S.selectedId);
      if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest' });
    }
    function toggleNeeds() {
      if (activeRun().kind !== 'rows') return;
      const on = S.f.status.size === 1 && S.f.status.has('open');
      S.f.status = on ? new Set() : new Set(['open']);
      refreshFilters();
    }
    function focusChips() {
      if (R('tools').hidden) return;
      if (getComputedStyle(R('chips')).display === 'none') { S.filtersOpen = true; renderChips(); }
      const c = R('chips').querySelector('.wb-chip'); if (c) c.focus();
    }
    function focusSearch() { const s = root.querySelector('[data-fk="search"]'); if (s && !R('tools').hidden) s.focus(); }
    function stopOrResume() {
      const run = activeRun();
      if (run.status === 'running') stopRun(run);
      else if (run.status === 'stopped' || run.status === 'interrupted') resumeRun(run);
      else toast('No run in progress', 'S stops a running run or resumes a stopped one.');
    }

    /* ---------- panel width (divider) ---------- */
    const MIN_W = 340;
    function maxW() { return (root.clientWidth - R('rail').parentElement.offsetWidth) * 0.6; }
    function panelW() { return root.querySelector('.wb-side').getBoundingClientRect().width; }
    function setPanelW(w) {
      w = Math.round(clamp(w, MIN_W, Math.max(MIN_W, maxW())));
      S.detailW = w;
      root.style.setProperty('--wb-detail', w + 'px');
      const d = R('divider'); d.setAttribute('aria-valuenow', String(w));
    }
    function resetPanelW() { S.detailW = null; root.style.removeProperty('--wb-detail'); R('divider').removeAttribute('aria-valuenow'); }
    let drag = null;
    function onPointerDown(e) {
      const d = e.target.closest && e.target.closest('[data-r="divider"]');
      if (!d || e.button !== 0) return;
      e.preventDefault();
      d.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, x: e.clientX, w: panelW() };
      root.classList.add('is-resizing');
    }
    function onPointerMove(e) { if (drag && e.pointerId === drag.id) setPanelW(drag.w + (drag.x - e.clientX)); }
    function onPointerUp(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const d = R('divider');
      try { d.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
      drag = null;
      root.classList.remove('is-resizing');
    }
    function onDblClick(e) { if (e.target.closest && e.target.closest('[data-r="divider"]')) resetPanelW(); }

    /* ---------- commands (cheat sheet + command menu) ---------- */
    const CMDS = [
      { g: 'Navigate', l: 'Next row', k: ['J', '↓'], run: () => move(1) },
      { g: 'Navigate', l: 'Previous row', k: ['K', '↑'], run: () => move(-1) },
      { g: 'Navigate', l: 'First row', k: ['Home'], run: () => moveTo(false) },
      { g: 'Navigate', l: 'Last row', k: ['End'], run: () => moveTo(true) },
      { g: 'Navigate', l: 'Next company needing review', k: ['N'], run: () => nextOpen(1) },
      { g: 'Navigate', l: 'Previous company needing review', k: ['⇧', 'N'], run: () => nextOpen(-1) },
      { g: 'Navigate', l: 'Search companies', k: ['/'], run: focusSearch },
      { g: 'Navigate', l: 'Focus the filter chips', k: ['F'], run: focusChips },
      { g: 'Navigate', l: 'Command menu', k: [MOD, 'K'], menu: false, setup: true },
      { g: 'Decide', l: 'Confirm the pipeline verdict (flagged row)', k: ['C'], run: keyConfirm },
      { g: 'Decide', l: 'Change or reclassify the verdict', k: ['X'], run: keyChange },
      { g: 'Decide', l: 'Write a note', k: ['M'], run: focusNote },
      { g: 'Decide', l: 'Record the decision (in the note)', k: [MOD, '↵'], menu: false },
      { g: 'Decide', l: 'Undo the last reviewer action', k: ['U'], run: undo },
      { g: 'View', l: 'Reading view', k: ['E'], run: () => toggleReading() },
      { g: 'View', l: 'Needs review only', k: ['A'], run: toggleNeeds },
      { g: 'View', l: 'Keyboard shortcuts', k: ['?'], run: () => openHelp(), setup: true },
      { g: 'View', l: 'Leave the note, close the form or reading view', k: ['Esc'], menu: false },
      { g: 'View', l: 'Resize the panel (divider focused)', k: ['↑', '↓', '[', ']'], menu: false },
      { g: 'View', l: 'Reset the panel width', k: ['Double-click'], menu: false, run: resetPanelW, menuLabel: 'Reset the evidence panel width' },
      { g: 'Run', l: 'New run: set it up in the table', k: ['O'], run: () => openSetup(null), setup: true },
      { g: 'Run', l: 'Cancel the new run (or close its menu)', k: ['Esc'], menu: false, setup: true },
      { g: 'Run', l: 'Download Excel', k: ['D'], run: download },
      { g: 'Run', l: 'Stop or resume the active run', k: ['S'], run: stopOrResume },
    ];

    function openHelp() {
      if (S.sheet) return;
      if (S.modal) closeModal(false);
      closePop(false);
      S.modal = { type: 'help', ret: document.activeElement };
      const groups = ['Navigate', 'Decide', 'View', 'Run'];
      R('modal').innerHTML = '<div class="wb-mscrim" data-act="close-modal"></div><section class="wb-modal is-help" role="dialog" aria-modal="true" aria-labelledby="wb-help-t">' +
        '<div class="wb-help-h"><h2 id="wb-help-t">Keyboard shortcuts</h2><button class="wb-btn wb-btn-sm wb-btn-ghost" data-act="close-modal" data-fk="help-close">Close ' + kbd('Esc') + '</button></div>' +
        '<div class="wb-help-b">' + groups.map((g) => '<div class="wb-help-g"><h3>' + g + '</h3>' + CMDS.filter((c) => c.g === g).map((c) => '<div class="wb-help-r"><span>' + esc(c.l) + '</span><span>' + c.k.map((x) => kbd(x)).join('') + '</span></div>').join('') + '</div>').join('') + '</div>' +
        '<div class="wb-modal-foot"><span>Shortcuts are off while you type in a field, and while this sheet, the command menu or Analyst settings is open. While a new run is being set up, only ' + esc('O, ?, Esc and ' + MOD + ' K') + ' work.</span></div></section>';
      R('modal').querySelector('[data-fk="help-close"]').focus();
    }

    function paletteItems(q) {
      const run = activeRun();
      const items = [];
      // While setting up, only actions that make sense there; a run or company leaves setup.
      CMDS.forEach((c) => { if (c.run && c.menu !== false && (!S.setup || c.setup)) items.push({ g: 'Action', l: c.l, keys: c.k, run: c.run }); });
      if (!S.setup) items.push({ g: 'Action', l: 'Reset the evidence panel width', keys: [], run: resetPanelW });
      S.runs.forEach((r) => items.push({ g: 'Run', l: r.file, sub: r.dateLabel + ' · ' + railStatus(r).text, keys: r.id === S.activeId && !S.setup ? ['current'] : [], run: () => openRun(r.id) }));
      if (run.kind === 'rows' && !S.setup) run.ids.forEach((id) => { const c = C_BY_ID[id]; items.push({ g: 'Company', l: c.name, sub: c.uen + ' · ' + c.domain, hay: c.uen + ' ' + c.domain, keys: [], run: () => goToCompany(id) }); });
      const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.length) return items;
      return items.filter((it) => { const hay = (it.g + ' ' + it.l + ' ' + (it.sub || '') + ' ' + (it.hay || '')).toLowerCase(); return terms.every((t) => hay.indexOf(t) >= 0); });
    }
    function goToCompany(id) {
      if (S.viewIds.indexOf(id) < 0) {
        S.f = newFilters(); root.querySelector('[data-fk="search"]').value = '';
        refreshFilters();
      }
      select(id, { focus: true });
    }
    function openPalette() {
      if (S.sheet) return;
      if (S.modal) closeModal(false);
      closePop(false);
      S.modal = { type: 'palette', ret: document.activeElement, q: '', active: 0, items: [] };
      R('modal').innerHTML = '<div class="wb-mscrim" data-act="close-modal"></div><section class="wb-modal" role="dialog" aria-modal="true" aria-label="Command menu">' +
        '<input class="wb-pal-in" data-fk="pal-q" role="combobox" aria-expanded="true" aria-controls="wb-pal-list" aria-autocomplete="list" placeholder="Jump to a company, switch run, or run an action…" autocomplete="off" spellcheck="false">' +
        '<ul class="wb-pal-list" id="wb-pal-list" role="listbox" data-r="pal-list"></ul>' +
        '<div class="wb-modal-foot"><span>' + kbd('↑') + kbd('↓') + ' move</span><span>' + kbd('↵') + ' run</span><span>' + kbd('Esc') + ' close</span></div></section>';
      renderPalette();
      R('modal').querySelector('[data-fk="pal-q"]').focus();
    }
    function renderPalette() {
      const m = S.modal; if (!m || m.type !== 'palette') return;
      m.items = paletteItems(m.q).slice(0, 80);
      m.active = clamp(m.active, 0, Math.max(0, m.items.length - 1));
      const list = R('pal-list');
      list.innerHTML = m.items.length ? m.items.map((it, i) => '<li class="wb-pal-it" role="option" id="wb-pal-' + i + '" data-act="pal-run" data-i="' + i + '" aria-selected="' + (i === m.active) + '"><span class="wb-pal-g">' + it.g + '</span><span class="wb-pal-l">' + esc(it.l) + (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') + '</span><span class="wb-pal-keys">' + it.keys.map((k) => kbd(k)).join('') + '</span></li>').join('')
        : '<li class="wb-pal-empty">No matches</li>';
      const inp = R('modal').querySelector('[data-fk="pal-q"]');
      if (inp) { if (m.items.length) inp.setAttribute('aria-activedescendant', 'wb-pal-' + m.active); else inp.removeAttribute('aria-activedescendant'); }
      const act = list.querySelector('[aria-selected="true"]');
      if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
    }
    function runPalette(i) {
      const m = S.modal; if (!m || m.type !== 'palette') return;
      const it = m.items[i]; if (!it) return;
      closeModal(false);
      it.run();
    }
    function closeModal(restoreFocus) {
      const m = S.modal; if (!m) return;
      S.modal = null;
      R('modal').innerHTML = '';
      if (restoreFocus !== false && m.ret && root.contains(m.ret) && m.ret.focus) m.ret.focus({ preventScroll: true });
    }

    /* ---------- new run: set up in the table ----------
       "+ New run" turns the main column into the draft run: the dropped spreadsheet
       becomes the table at once, column mapping lives in the headers, rows are
       ticked in or out in place, and the action bar starts it. On start the same
       table becomes the live run. Only one draft exists; opening another run keeps
       it in the rail, Cancel discards it. */
    const QUALITY = [
      { tier: 'fast', name: 'Standard', sub: 'Quick and accurate for most lists.' },
      { tier: 'balanced', name: 'Careful', sub: 'Slower; better on borderline companies.' },
      { tier: 'best', name: 'Most thorough', sub: 'Strongest reasoning, highest cost.' },
    ];
    const qualityOf = (tier) => QUALITY.find((q) => q.tier === tier);
    const PLAIN_STEPS = [
      { key: 'enrichment', label: 'Look each company up on the web', sub: 'Finds a current description before deciding.' },
      { key: 'epo', label: 'Check patent records', sub: 'European Patent Office data nudges confidence up or down.' },
      { key: 'validator', label: 'Double-check unsure results', sub: 'A second pass with web searches when confidence is low.' },
      { key: 'batch', label: 'Batch mode', sub: 'About half the classifier cost, but results can take an hour or more.' },
    ];
    const SETUP_COLS = ['company_name', 'uen', 'domain', 'description'].map((k) => FIELDS.find((f) => f.key === k));
    const SPREADSHEET = /\.(xlsx|xls|csv)$/i;
    /* The sample file's cells: mapped columns come from the companies, the rest are
       extra columns that a real run carries through to the output unchanged. */
    const PROP = { company_name: 'name', description: 'description', domain: 'domain', uen: 'uen' };
    const FIELD_OF_COL = {};
    Object.keys(D.file.mapping).forEach((k) => { FIELD_OF_COL[D.file.mapping[k]] = k; });
    const EXTRA_CELLS = {
      location: ['one-north', 'Jurong Innovation District', 'Raffles Place', 'Science Park II', 'Changi Business Park'],
      funding_rounds: ['Seed', 'Series A', 'Pre-seed', 'Series B'],
      funding_amount: ['S$1.2M', 'S$6.5M', 'S$0.4M', 'S$18M', 'S$2.1M'],
    };
    const cellOf = (c, i, col) => (FIELD_OF_COL[col] ? c[PROP[FIELD_OF_COL[col]]] : (EXTRA_CELLS[col] || [''])[i % (EXTRA_CELLS[col] || ['']).length]);
    const exampleOf = (col) => { const i = D.companies.findIndex((c, j) => cellOf(c, j, col)); return i < 0 ? '' : cellOf(D.companies[i], i, col); };
    const usd = (n) => '~US$' + n.toFixed(2);

    function newDraft(fromRun) {
      const cfg = fromRun && fromRun.cfg ? JSON.parse(JSON.stringify(fromRun.cfg)) : defaultCfg();
      return { cfg, file: null, error: '', excluded: new Set(), fromId: fromRun ? fromRun.id : null };
    }
    const includedIds = () => D.companies.map((c) => c.id).filter((id) => !S.draft.excluded.has(id));
    function draftEst() {
      const dr = S.draft;
      return estimate(Object.assign({}, dr.cfg, { file: dr.file ? { rows: includedIds().length } : null }));
    }
    function isCustom(cfg) {
      const z = defaultCfg();
      return Object.keys(z).some((k) => k !== 'tier' && k !== 'mapping' && String(z[k]) !== String(cfg[k]));
    }
    /* Why the run cannot start yet, and where the fix is. */
    function setupProblem() {
      const dr = S.draft; const d = dr.cfg;
      if (!dr.file) return { fix: 'file', label: 'Choose a file to start', text: 'Drop a spreadsheet on this column or choose one to see your companies here.' };
      if (!d.mapping.company_name) return { fix: 'map', label: 'Map the company name column to start', text: 'Choose which spreadsheet column holds the company names on the highlighted header.' };
      if (!includedIds().length) return { fix: 'rows', label: 'Tick at least one company to start', text: 'Every company is left out. Tick the ones to classify.' };
      const p = provById(d.provider);
      if (!p.keySet) return { fix: 'sheet', label: p.label + ' has no API key', text: 'Ask your admin to add ' + p.keyVar + ' to .env, or choose another provider in Analyst settings.' };
      return null;
    }
    const announce = (msg) => { const l = R('live'); l.textContent = ''; later(() => { l.textContent = msg; }, 30); };

    function openSetup(fromRun) {
      if (S.modal) closeModal(false);
      if (S.setup && !fromRun) { focusSetupStart(); return; }
      if (!S.setup) {
        const a = document.activeElement;
        S.setupRet = a && root.contains(a) ? a.getAttribute('data-fk') : null;
      }
      if (fromRun || !S.draft) S.draft = newDraft(fromRun);
      closePop(false); closeSheet(false);
      S.setup = true;
      if (S.reading) { S.reading = false; root.classList.remove('is-reading'); }
      root.classList.add('is-setup');
      R('setbar').hidden = false;
      renderAll();
      R('table').scrollTop = 0;
      focusSetupStart();
    }
    function focusSetupStart() {
      const b = root.querySelector(S.draft.file ? '[data-fk="start"]' : '[data-fk="pick-file"]');
      if (b) b.focus();
    }
    /* Leaves setup mode without rendering; callers render the run they go to. */
    function exitSetup() {
      if (!S.setup) return;
      closePop(false); closeSheet(false);
      S.setup = false; S.dragDepth = 0;
      root.classList.remove('is-setup');
      R('main').classList.remove('is-drag');
      R('setbar').hidden = true;
      put(R('setbar'), '');
    }
    function cancelSetup() {
      const ret = S.setupRet;
      S.draft = null;
      exitSetup();
      renderAll();
      const b = (ret && root.querySelector('[data-fk="' + ret + '"]')) || root.querySelector('[data-fk="rail-' + S.activeId + '"]');
      if (b) b.focus();
    }

    /* ----- head: title, file line, notes ----- */
    function setupHeadHtml() {
      const dr = S.draft; const d = dr.cfg; const f = D.file;
      const title = dr.fromId ? 'New run with the same settings' : 'New run';
      const meta = dr.file
        ? '<span class="wb-file-n">' + esc(dr.file.name) + '</span><span class="wb-num">' + f.rows + ' rows · ' + f.skipped + ' skipped (empty name) · ' + f.headers.length + ' columns</span>'
        : '<span>' + (dr.fromId ? 'Settings and column mapping from <span class="wb-mono">' + esc(dr.fromId) + '</span>. ' : '') + 'Drop a spreadsheet anywhere in this column.</span>';
      let h = '<div class="wb-head-row"><div class="wb-head-t"><h1><span class="wb-h1-f">' + title + '</span> <span class="wb-status">Not started</span></h1><div class="wb-head-meta">' + meta + '</div></div>' +
        (dr.file ? '<div class="wb-head-acts"><button class="wb-btn wb-btn-sm" data-act="clear-file" data-fk="clear-file">Change file</button></div>' : '') + '</div>';
      const n = [];
      if (dr.error) n.push('<p class="wb-snote is-err" role="alert">' + esc(dr.error) + '</p>');
      if (dr.file) {
        if (dr.file.note) n.push('<p class="wb-snote">' + esc(dr.file.note) + '</p>');
        if (!d.mapping.company_name) n.push('<p class="wb-snote is-warn"><b>One thing to fix:</b> choose which column holds the company names with <b>Choose column</b> on the highlighted header.</p>');
        if (!d.mapping.description) n.push('<p class="wb-snote is-warn">' + (d.enrichment ? 'No description column: classification will rely on web enrichment.' : 'No description and enrichment is off: companies without patents are capped at ' + d.lowEvidenceCap + ' confidence.') + '</p>');
        const used = Object.values(d.mapping).filter(Boolean);
        const extra = f.headers.filter((hd) => used.indexOf(hd) < 0);
        if (extra.length) n.push('<p class="wb-snote">Also in your file and kept unchanged in your output: <b>' + esc(extra.join(', ')) + '</b>.</p>');
      }
      return h + (n.length ? '<div class="wb-snotes">' + n.join('') + '</div>' : '');
    }

    /* ----- table ----- */
    function mapState(d, fl) {
      const col = d.mapping[fl.key] || '';
      if (!col) return fl.required ? { cls: 'is-missing', tag: '<span class="wb-tag is-req">Required</span>', word: 'required, not chosen' } : { cls: 'is-off', tag: '<span class="wb-tag">Skipped</span>', word: 'not used' };
      if (SETUP_COLS.some((o) => o.key !== fl.key && d.mapping[o.key] === col)) return { cls: 'is-dup', tag: '<span class="wb-tag is-req">Used twice</span>', word: 'also used for another field' };
      if (col === D.file.mapping[fl.key]) return { cls: 'is-auto', tag: '<span class="wb-tag is-auto">Detected</span>', word: 'detected' };
      return { cls: 'is-changed', tag: '<span class="wb-tag">Changed</span>', word: 'changed' };
    }
    function setupThHtml(fl) {
      const dr = S.draft;
      if (!dr.file) return '<th scope="col" class="wb-s-' + fl.key + '"><div class="wb-sth"><span class="wb-sth-l">' + fl.label + '</span></div></th>';
      const col = dr.cfg.mapping[fl.key] || '';
      const st = mapState(dr.cfg, fl);
      const open = !!(S.pop && S.pop.kind === 'map' && S.pop.field === fl.key);
      const label = st.cls === 'is-missing' ? 'Choose column' : col ? 'from: <b>' + esc(col) + '</b>' : 'not used';
      const aria = fl.label + (col ? ' reads from spreadsheet column ' + col : '') + ', ' + st.word + '. Change column';
      return '<th scope="col" class="wb-s-' + fl.key + (st.cls === 'is-missing' ? ' is-missing' : '') + '"><div class="wb-sth"><span class="wb-sth-l">' + fl.label + '</span>' + st.tag + '</div>' +
        '<button class="wb-mapchip ' + st.cls + '" data-act="map-open" data-field="' + fl.key + '" data-fk="map-' + fl.key + '" aria-haspopup="menu" aria-expanded="' + open + '" aria-label="' + esc(aria) + '">' + label + ' <span aria-hidden="true">▾</span></button></th>';
    }
    function renderSetupTable() {
      const dr = S.draft; const d = dr.cfg;
      const wrap = R('table');
      const n = dr.file ? includedIds().length : 0;
      const all = D.companies.length;
      const chk = dr.file ? '<input type="checkbox" data-inc-all data-fk="inc-all" aria-label="Include all companies"' + (n === all ? ' checked' : '') + '>' : '<span class="wb-sr">Included</span>';
      let h = '<table class="wb-table is-setup" aria-label="' + (dr.file ? 'Companies in ' + esc(dr.file.name) : 'New run, no file yet') + '"><thead><tr>' +
        '<th scope="col" class="wb-s-chk wb-chk">' + chk + '</th><th scope="col" class="wb-s-idx is-r"><div class="wb-sth is-r">#</div></th>' +
        SETUP_COLS.map(setupThHtml).join('') + '<th scope="col" class="wb-s-status is-out-col"><div class="wb-sth">Status</div></th></tr></thead><tbody>';
      if (!dr.file) {
        for (let i = 0; i < 7; i++) h += '<tr class="wb-ghost" aria-hidden="true"><td></td><td></td>' + [62, 48, 40, 78, 34].map((w) => '<td><span class="wb-ghost-bar" style="width:' + (w - i * 4) + '%"></span></td>').join('') + '</tr>';
        put(wrap, h + '</tbody></table>' + setupEmptyHtml());
        return;
      }
      D.companies.forEach((c, i) => {
        const out = dr.excluded.has(c.id);
        h += '<tr data-srow="' + c.id + '" class="' + (out ? 'is-out' : '') + (S.enter ? ' is-enter' : '') + '"' + (S.enter ? ' style="--i:' + Math.min(i, 20) + '"' : '') + '>' +
          '<td class="wb-chk"><input type="checkbox" data-inc="' + c.id + '" data-fk="inc-' + c.id + '" aria-label="Include ' + esc(c.name) + '"' + (out ? '' : ' checked') + '></td>' +
          '<td class="wb-idx is-r">' + (i + 1) + '</td>' +
          SETUP_COLS.map((fl) => {
            const col = d.mapping[fl.key];
            const v = col ? cellOf(c, i, col) : '';
            let inner;
            if (!col) inner = fl.required ? '<span class="wb-cell-miss">column not chosen</span>' : '<span class="wb-muted">·</span>';
            else if (!v) inner = '<span class="wb-cell-empty">Empty</span>';
            else inner = '<span class="' + (fl.key === 'company_name' ? 'wb-sname' : fl.key === 'uen' ? 'wb-mono' : fl.key === 'description' ? 'wb-dim' : '') + '">' + esc(v) + '</span>';
            return '<td class="wb-s-' + fl.key + '"' + (v ? ' title="' + esc(v) + '"' : '') + '>' + inner + '</td>';
          }).join('') +
          '<td class="wb-s-status"><span class="wb-queued">' + (out ? 'Left out' : 'Queued') + '</span></td></tr>';
      });
      const scroll = wrap.scrollTop;
      put(wrap, h + '</tbody></table><div class="wb-setpad"></div>');
      wrap.scrollTop = scroll;
      const box = wrap.querySelector('[data-fk="inc-all"]');
      if (box) box.indeterminate = n > 0 && n < all;
    }
    function setupEmptyHtml() {
      return '<div class="wb-sempty"><div class="wb-sempty-in">' +
        '<div class="wb-sempty-ic" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4"/><path d="m7 9 5-5 5 5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg></div>' +
        '<h2>Drop a spreadsheet here to start</h2>' +
        '<p>One row per company. Column headers are matched case-insensitively, and your companies appear in this table before anything runs.</p>' +
        '<div class="wb-sempty-acts"><button class="wb-btn wb-btn-primary" data-act="pick-file" data-fk="pick-file">Choose a file…</button><button class="wb-btn" data-act="use-sample" data-fk="use-sample">Use sample file · ' + esc(D.file.name) + '</button></div>' +
        '<small>Excel (.xlsx, .xls) or CSV. Nothing is sent anywhere until you start the run.</small></div></div>';
    }

    /* ----- action bar ----- */
    function renderSetupBar() {
      const dr = S.draft; const d = dr.cfg;
      const n = dr.file ? includedIds().length : 0;
      const e = draftEst();
      const prob = setupProblem();
      const prov = provById(d.provider);
      const open = !!(S.pop && S.pop.kind === 'settings');
      const label = prob ? prob.label : 'Classify ' + n + ' compan' + (n === 1 ? 'y' : 'ies') + ' · ' + (e.known ? usd(e.cost) : 'cost unknown') + ' · about ' + fmtDur(e.secs).slice(1);
      const note = prob ? '<p class="wb-setbar-note is-why" id="wb-setbar-why">' + esc(prob.text) + '</p>'
        : '<p class="wb-setbar-note">' + (e.batch ? 'Batch mode: about half the classifier cost, but a real batch job can take up to an hour.' : 'One company at a time; results appear as each one finishes.') + (e.known ? '' : ' The pinned model has no listed price, so the cost is reported after the run.') + '</p>';
      put(R('setbar'), '<div class="wb-setbar-top"><button class="wb-btn wb-btn-sm wb-set" data-act="settings" data-fk="settings" aria-haspopup="dialog" aria-expanded="' + open + '">Settings: <b>' + qualityOf(d.tier).name + (isCustom(d) ? ', customised' : '') + '</b> <span aria-hidden="true">▾</span></button>' +
        '<span class="wb-setbar-meta">' + esc(prov.label) + ' · <span class="wb-mono">' + esc(modelFor(d)) + '</span></span></div>' +
        '<div class="wb-setbar-row"><button class="wb-btn wb-btn-ghost" data-act="cancel-setup" data-fk="cancel-setup">Cancel ' + kbd('Esc') + '</button>' +
        '<button class="wb-btn wb-btn-primary wb-go" data-act="start" data-fk="start"' + (prob ? ' aria-disabled="true" aria-describedby="wb-setbar-why"' : '') + '>' + esc(label) + '</button></div>' + note);
    }
    function fixProblem(prob) {
      if (prob.fix === 'map') openMap('company_name');
      else if (prob.fix === 'sheet') openSheet('start');
      else { const b = root.querySelector(prob.fix === 'rows' ? '[data-fk="inc-all"]' : '[data-fk="pick-file"]'); if (b) b.focus(); }
    }

    function renderSetup() {
      put(R('head'), setupHeadHtml());
      R('strip').hidden = true; R('tools').hidden = true;
      renderSetupTable(); renderSetupBar(); renderPop(); renderSheet();
    }
    /* After a settings change: everything except the table, which settings do not touch. */
    function syncSetup() {
      if (!S.setup) return;
      renderRail(); put(R('head'), setupHeadHtml()); renderSetupBar(); renderPop(); renderSheet();
    }

    /* ----- file ----- */
    function loadFile(name) {
      const dr = S.draft; const f = D.file;
      const sample = name === f.name;
      dr.file = { name, rows: f.rows, note: sample ? '' : 'Files are not read in this prototype: the sample rows stand in for ' + name + ', and the company name column is left for you to choose.' };
      dr.error = '';
      dr.excluded = new Set();
      const m = dr.cfg.mapping;
      if (!dr.fromId) dr.cfg.mapping = Object.assign({}, f.mapping);
      else Object.keys(m).forEach((k) => { if (m[k] && f.headers.indexOf(m[k]) < 0) m[k] = ''; });
      if (!sample) dr.cfg.mapping.company_name = '';
      closePop(false);
      S.enter = true;
      R('table').scrollTop = 0;
      renderRail(); renderSetup();
      S.enter = false;
      announce('Loaded ' + D.companies.length + ' companies from ' + name + (dr.cfg.mapping.company_name ? '.' : '. Choose the company name column to continue.'));
      const t = root.querySelector(dr.cfg.mapping.company_name ? '[data-fk="start"]' : '[data-fk="map-company_name"]');
      if (t) t.focus();
    }
    function handleFile(file) {
      if (!file || !S.draft) return;
      if (!SPREADSHEET.test(file.name)) {
        const ext = (file.name.match(/\.([^.]+)$/) || [])[1];
        S.draft.error = (ext ? 'That is a .' + ext + ' file.' : 'That file has no extension.') + ' Drop an Excel (.xlsx, .xls) or CSV spreadsheet with one row per company.';
        put(R('head'), setupHeadHtml());
        announce(S.draft.error);
        return;
      }
      loadFile(file.name);
    }

    /* ----- popovers: column menu and settings ----- */
    const popAnchor = (p) => root.querySelector(p.kind === 'map' ? '[data-fk="map-' + p.field + '"]' : '[data-fk="settings"]');
    function closePop(restore) {
      const p = S.pop; if (!p) return;
      S.pop = null;
      R('pop').innerHTML = '';
      const a = popAnchor(p);
      if (a) { a.setAttribute('aria-expanded', 'false'); if (restore) a.focus(); }
    }
    function placePop(el, anchor, mode) {
      const rr = root.getBoundingClientRect();
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
    function openMap(field) {
      closePop(false);
      const anchor = root.querySelector('[data-fk="map-' + field + '"]');
      if (!anchor) return;
      const fl = FIELDS.find((x) => x.key === field);
      const d = S.draft.cfg;
      const cur = d.mapping[field] || '';
      S.pop = { kind: 'map', field };
      const usedBy = (col) => SETUP_COLS.find((o) => o.key !== field && d.mapping[o.key] === col);
      const opt = (col, i, title, sub) => '<button class="wb-mopt" role="menuitemradio" aria-checked="' + (col === cur) + '" data-act="map-set" data-col="' + esc(col) + '" data-fk="mopt-' + i + '"><span class="wb-mopt-ck" aria-hidden="true">' + (col === cur ? '✓' : '') + '</span><span class="wb-mopt-t">' + title + '</span><span class="wb-mopt-s">' + sub + '</span></button>';
      let h = '<div class="wb-pop is-map" role="menu" aria-label="Spreadsheet column for ' + esc(fl.label) + '"><div class="wb-pop-h">Which column holds the ' + esc(fl.label.toLowerCase()) + '?</div>' +
        D.file.headers.map((col, i) => {
          const other = usedBy(col);
          return opt(col, i, esc(col) + (col === D.file.mapping[field] ? ' <span class="wb-tag is-auto">Detected</span>' : ''), (other ? 'Also used for ' + esc(other.label) + ' · ' : '') + 'e.g. ' + esc(exampleOf(col)));
        }).join('');
      if (!fl.required) h += '<hr>' + opt('', 'none', 'Don’t use a column', field === 'description' ? (d.enrichment ? 'Classification relies on web enrichment' : 'Low-evidence cap applies without patents') : 'Left blank in the output');
      R('pop').innerHTML = h + '</div>';
      anchor.setAttribute('aria-expanded', 'true');
      placePop(R('pop').firstElementChild, anchor, 'below');
      const first = R('pop').querySelector('[aria-checked="true"]') || R('pop').querySelector('.wb-mopt');
      if (first) first.focus();
    }
    function setMapping(col) {
      const field = S.pop && S.pop.kind === 'map' ? S.pop.field : null;
      if (!field) return;
      S.draft.cfg.mapping[field] = col;
      closePop(false);
      renderSetupTable(); syncSetup();
      const b = root.querySelector('[data-fk="map-' + field + '"]'); if (b) b.focus();
      announce(FIELDS.find((x) => x.key === field).label + (col ? ' now reads from ' + col : ' no longer uses a column') + '.');
    }
    function settingsPopHtml() {
      const d = S.draft.cfg; const prov = provById(d.provider);
      return '<fieldset class="wb-fs"><legend>How careful should the AI be?</legend><div class="wb-qlist" role="radiogroup" aria-label="Quality">' + QUALITY.map((q) =>
        '<label class="wb-opt"><input type="radio" name="wb-q" value="' + q.tier + '" data-fk="q-' + q.tier + '"' + (d.tier === q.tier ? ' checked' : '') + '><span class="wb-opt-t">' + q.name + (q.tier === D.defaults.tier ? ' <span class="wb-tag is-auto">Recommended</span>' : '') + '<span class="wb-opt-p wb-num">~' + money(D.estCostPerCompany[q.tier]) + ' each</span></span><span class="wb-opt-s">' + q.sub + ' Uses ' + esc(prov.tiers[q.tier]) + '.</span></label>').join('') + '</div></fieldset>' +
        '<fieldset class="wb-fs"><legend>What to check</legend>' + PLAIN_STEPS.map((s) => {
          const off = s.key === 'batch' && !prov.batch;
          return '<label class="wb-tg ' + (off ? 'is-disabled' : '') + '"><span class="wb-tg-t">' + s.label + '</span><span class="wb-tg-s">' + esc(off ? 'Only Anthropic supports batch jobs; ' + prov.label + ' works one company at a time.' : s.sub) + '</span><input type="checkbox" class="wb-switch" data-toggle="' + s.key + '" data-fk="pq-' + s.key + '"' + (d[s.key] && !off ? ' checked' : '') + (off ? ' disabled' : '') + '></label>';
        }).join('') + '</fieldset>' +
        '<div class="wb-pop-foot"><button class="wb-btn wb-btn-ghost wb-btn-sm" data-act="analyst" data-fk="analyst">Analyst settings…</button><button class="wb-btn wb-btn-sm" data-act="settings-done" data-fk="settings-done">Done</button></div>';
    }
    function openSettings() {
      closePop(false);
      const anchor = root.querySelector('[data-fk="settings"]');
      if (!anchor) return;
      S.pop = { kind: 'settings' };
      R('pop').innerHTML = '<div class="wb-pop is-set" role="dialog" aria-label="Run settings"></div>';
      renderPop();
      anchor.setAttribute('aria-expanded', 'true');
      placePop(R('pop').firstElementChild, anchor, 'above');
      const f = R('pop').querySelector('input:checked');
      if (f) f.focus();
    }
    function renderPop() {
      if (!S.pop || S.pop.kind !== 'settings') return;
      put(R('pop').firstElementChild, settingsPopHtml());
    }

    /* ----- analyst settings sheet: everything the pipeline can be tuned with ----- */
    let sheetCloseTimer = null;
    function openSheet(ret) {
      if (!S.setup) return;
      closePop(false);
      cancel(sheetCloseTimer);
      S.sheet = { ret: ret || 'settings' };
      R('overlay').innerHTML = '<div class="wb-scrim" data-act="close-sheet"></div>' +
        '<section class="wb-sheet" role="dialog" aria-modal="true" aria-labelledby="wb-sh-t">' +
        '<div class="wb-sh-head"><div class="wb-sh-title"><h2 id="wb-sh-t">Analyst settings</h2><button class="wb-btn wb-btn-sm" data-act="close-sheet" data-fk="sh-close">Done ' + kbd('Esc') + '</button></div>' +
        '<p class="wb-sh-sub">Everything the pipeline can be tuned with. The defaults suit most runs.</p><div data-r="sh-est"></div></div>' +
        '<div class="wb-sh-body" data-r="sh-body"></div></section>';
      renderSheet();
      const f = R('overlay').querySelector('input[name="wb-prov"]:checked');
      if (f) f.focus();
    }
    function closeSheet(restore) {
      const sh = S.sheet; if (!sh) return;
      S.sheet = null;
      const ov = R('overlay');
      ov.querySelectorAll('.wb-scrim, .wb-sheet').forEach((n) => n.classList.add('is-leaving'));
      cancel(sheetCloseTimer);
      sheetCloseTimer = later(() => { if (!S.sheet) ov.innerHTML = ''; }, 170);
      if (restore !== false) { const b = root.querySelector('[data-fk="' + sh.ret + '"]') || root.querySelector('[data-fk="settings"]'); if (b) b.focus(); }
    }
    function sheetEstHtml() {
      const d = S.draft.cfg;
      const e = draftEst();
      const prob = setupProblem();
      const tot = e.parts.classify + e.parts.enrich + e.parts.validate || 1;
      const seg = (v, col) => '<span style="width:' + (v / tot * 100).toFixed(1) + '%;background:' + col + '"></span>';
      const sample = estimate(Object.assign({}, d, { file: { rows: D.file.rows } }));
      const shown = e.rows ? e.cost : sample.cost;
      const secs = e.rows ? e.secs : sample.secs;
      return '<div class="wb-est">' +
        '<div><div class="wb-est-l">Est. cost' + (e.rows ? '' : ' per ' + D.file.rows + ' companies') + '</div><div class="wb-est-v">' + (e.known ? money(shown) : 'unknown') + '</div></div>' +
        '<div><div class="wb-est-l">Duration</div><div class="wb-est-v">' + fmtDur(secs) + '</div></div>' +
        '<div class="wb-est-split">' + (e.known ? '<div class="wb-est-bar" aria-hidden="true">' + seg(e.parts.classify, 'var(--accent)') + seg(e.parts.enrich, 'var(--deep)') + seg(e.parts.validate, 'var(--contested)') + '</div>' +
          '<div class="wb-est-lg"><span><i class="wb-sw" style="background:var(--accent)"></i>Classify ' + Math.round(e.parts.classify / tot * 100) + '%</span><span><i class="wb-sw" style="background:var(--deep)"></i>Enrich ' + Math.round(e.parts.enrich / tot * 100) + '%</span><span><i class="wb-sw" style="background:var(--contested)"></i>Validate ' + Math.round(e.parts.validate / tot * 100) + '%</span></div>' : '<div class="wb-est-lg">Pinned model is not priced in pipeline/models.py; token totals will be reported instead.</div>') + '</div>' +
        (prob ? '<div class="wb-est-why">' + esc(prob.label) + '</div>' : '') +
        '<div class="wb-est-note">' + esc(modelFor(d)) + ' · ' + (e.batch ? 'batch mode halves classifier cost; a real batch job can take up to an hour' : 'one company at a time') + ' · web searches are usually the largest part of the bill</div></div>';
    }
    function sheetBodyHtml() {
      const d = S.draft.cfg; const prov = provById(d.provider);
      let h = '<fieldset class="wb-fs"><legend>Model</legend><div class="wb-provs" role="radiogroup" aria-label="Provider">' + D.providers.map((p) =>
        '<label class="wb-opt"><input type="radio" name="wb-prov" value="' + p.id + '" data-fk="prov-' + p.id + '"' + (p.id === d.provider ? ' checked' : '') + '><span class="wb-opt-t">' + esc(p.label) + '</span><span class="wb-opt-s ' + (p.keySet ? 'is-ok' : 'is-miss') + '">' + (p.keySet ? 'Key set' : esc(p.keyVar) + ' missing') + '</span></label>').join('') + '</div>';
      if (!prov.keySet) h += '<div class="wb-warn">' + esc(prov.label) + ' is not set up yet. Ask your admin to add ' + esc(prov.keyVar) + ' to .env, then reload.</div>';
      h += '<div class="wb-tiers" role="radiogroup" aria-label="Tier">' + QUALITY.map((q) =>
        '<label class="wb-opt"><input type="radio" name="wb-tier" value="' + q.tier + '" data-fk="tier-' + q.tier + '"' + (q.tier === d.tier ? ' checked' : '') + '><span class="wb-opt-t">' + q.name + ' · ' + esc(prov.tiers[q.tier]) + '</span><span class="wb-opt-s wb-num">' + q.tier + ' tier · ~' + money(D.estCostPerCompany[q.tier]) + ' per company</span></label>').join('') + '</div>';
      h += '<div class="wb-row2"><label for="wb-pin">Pin exact model</label><input id="wb-pin" class="wb-input wb-mono" data-field="model" data-fk="pin" placeholder="' + esc(MODEL_IDS[d.provider][d.tier]) + ' (from tier)" value="' + esc(d.model) + '" autocomplete="off" spellcheck="false"></div>';
      h += '<div class="wb-hint">Leave empty to use the tier. Pin a model for audits or runs you will compare over time.' + (d.model && !KNOWN_MODELS.has(d.model.trim()) ? ' This model is not listed in pipeline/models.py: it runs with the original request settings and its cost shows as unknown.' : '') + '</div></fieldset>';
      const tg = (key, title, sub, disabled) => '<label class="wb-tg ' + (disabled ? 'is-disabled' : '') + '"><span class="wb-tg-t">' + title + '</span><span class="wb-tg-s">' + sub + '</span><input type="checkbox" class="wb-switch" data-toggle="' + key + '" data-fk="tg-' + key + '"' + (d[key] && !disabled ? ' checked' : '') + (disabled ? ' disabled' : '') + '></label>';
      h += '<fieldset class="wb-fs"><legend>Steps</legend>' +
        tg('enrichment', 'Web enrichment', 'Search the web for a current description before classifying') +
        tg('epo', 'Patent lookup', 'EPO patent data adjusts confidence by up to ±' + d.epoAdjustMax + (D.epoKeysSet ? ' · EPO keys set' : ' · EPO keys missing; the run continues without patents')) +
        tg('validator', 'Validation', 'A second pass searches the web when confidence is below ' + d.validatorThreshold + ', then confirms, overrides or escalates') +
        tg('batch', 'Batch mode', prov.batch ? 'Classify all companies in one batch job: about half the classifier cost, but results can take an hour or more' : 'Only Anthropic supports batch jobs; ' + esc(prov.label) + ' processes companies one at a time', !prov.batch) +
        '</fieldset>';
      h += '<fieldset class="wb-fs"><legend>Thresholds</legend><div class="wb-th-grid">' + THRESHOLDS.map((t) => {
        const off = t.needs && !d[t.needs];
        return '<label class="wb-thf ' + (off ? 'is-off' : '') + '"><span>' + t.label + '</span><input type="number" class="wb-input" min="' + t.min + '" max="' + t.max + '" data-num="' + t.key + '" data-fk="num-' + t.key + '" value="' + d[t.key] + '"' + (off ? ' disabled' : '') + '><small>' + t.help + (off ? ' (step is off)' : '') + '</small></label>';
      }).join('') + '</div><div class="wb-fs-foot"><button class="wb-btn wb-btn-ghost wb-btn-sm" data-act="reset-th" data-fk="reset-th">Reset thresholds to defaults</button></div></fieldset>';
      return h;
    }
    function renderSheetEst() { if (S.sheet) put(R('sh-est'), sheetEstHtml()); }
    function renderSheet() { if (!S.sheet) return; renderSheetEst(); put(R('sh-body'), sheetBodyHtml()); }

    /* ----- start: the draft becomes a run, and the same table shows it live ----- */
    function startRun() {
      if (!S.setup || !S.draft) return;
      const prob = setupProblem();
      if (prob) { fixProblem(prob); return; }
      const dr = S.draft;
      const cfg = JSON.parse(JSON.stringify(dr.cfg));
      cfg.model = (cfg.model || '').trim();
      const ids = includedIds();
      const t = new Date();
      let id = 'run_' + stamp(t);
      if (runById(id)) id += pad(t.getSeconds());
      while (runById(id)) id += 'b';
      const run = makeRowsRun({
        id, file: dr.file.name, rows: ids.length, dateLabel: 'Today, ' + hhmm(t), timeLabel: hhmm(t),
        status: 'running', cfg, model: modelFor(cfg), ids, fresh: true,
      });
      S.runs.unshift(run);
      S.draft = null;
      exitSetup();
      startEngine(run);
      openRun(run.id);
      announce('Run started for ' + ids.length + ' companies.');
      const stop = R('head').querySelector('[data-fk="stop"]');
      if (stop) stop.focus();
    }

    /* ---------- events ---------- */
    function onClick(e) {
      const a = e.target.closest('[data-act]');
      const tr = e.target.closest('tr[data-row]');
      if (!a && tr) { select(tr.getAttribute('data-row')); return; }
      if (!a || !root.contains(a)) return;
      const act = a.getAttribute('data-act');
      const run = activeRun();
      switch (act) {
        case 'select': select(a.getAttribute('data-id'), { focus: true }); break;
        case 'new-run': openSetup(null); break;
        case 'rerun': openSetup(run); break;
        case 'open-draft': openSetup(null); break;
        case 'close-modal': closeModal(); break;
        case 'help': openHelp(); break;
        case 'palette': openPalette(); break;
        case 'pal-run': runPalette(+a.getAttribute('data-i')); break;
        case 'open-run': openRun(a.getAttribute('data-id')); break;
        case 'stop': if (run.status === 'running') stopRun(run); break;
        case 'resume': resumeRun(run); { const s = root.querySelector('[data-fk="stop"], [data-fk="arch-stop"]'); if (s) s.focus(); } break;
        case 'download': download(); break;
        case 'sort': {
          const k = a.getAttribute('data-k');
          if (S.sortKey === k) S.sortDir = -S.sortDir;
          else { S.sortKey = k; S.sortDir = (k === 'cost' || k === 'patents') ? -1 : 1; }
          refreshFilters(); break;
        }
        case 'sort-priority': S.sortKey = 'priority'; S.sortDir = 1; refreshFilters(); break;
        case 'chip': {
          const g = a.getAttribute('data-g'); const v = a.getAttribute('data-v');
          if (S.f[g].has(v)) S.f[g].delete(v); else S.f[g].add(v);
          refreshFilters(); break;
        }
        case 'stat': {
          const k = a.getAttribute('data-k');
          if (k === 'review') { toggleNeeds(); break; }
          const v = k === 'deep' ? 'deep tech' : 'general tech';
          const on = S.f.verdict.size === 1 && S.f.verdict.has(v);
          S.f.verdict = on ? new Set() : new Set([v]);
          refreshFilters(); break;
        }
        case 'bin': { const b = +a.getAttribute('data-bin'); S.f.bin = S.f.bin === b ? null : b; refreshFilters(); break; }
        case 'clear-bin': S.f.bin = null; refreshFilters(); break;
        case 'clear-filters':
          S.f = newFilters();
          root.querySelector('[data-fk="search"]').value = '';
          refreshFilters(); break;
        case 'reading': toggleReading(); break;
        case 'filters-toggle': S.filtersOpen = !S.filtersOpen; renderChips(); break;
        case 'toggle-sec': {
          const k = a.getAttribute('data-k');
          S.collapsed[k] = !S.collapsed[k];
          renderDetail(); break;
        }
        case 'quick-confirm': keyConfirm(); break;
        case 'open-change': keyChange(); break;
        case 'open-note': focusNote(); break;
        case 'change-dec': {
          const sv = selectedView(); if (sv && sv.v.dec) openForm(sv.v.dec.choice, true);
          break;
        }
        case 'restore': { const sv = selectedView(); if (sv) restore(sv.run, sv.v.c.id); break; }
        case 'record': recordFromForm(); break;
        case 'cancel-form': {
          const sv = selectedView(); if (sv) delete S.forms[formKey(sv.run, sv.v.c.id)];
          renderDetail(); break;
        }
        case 'undo': undo(); break;
        /* new run setup */
        case 'pick-file': R('file').value = ''; R('file').click(); break;
        case 'use-sample': loadFile(D.file.name); break;
        case 'clear-file':
          S.draft.file = null; S.draft.error = ''; S.draft.excluded = new Set();
          closePop(false); renderRail(); renderSetup();
          { const b = root.querySelector('[data-fk="pick-file"]'); if (b) b.focus(); }
          break;
        case 'map-open': {
          const f = a.getAttribute('data-field');
          const same = S.pop && S.pop.kind === 'map' && S.pop.field === f;
          if (same) closePop(true); else openMap(f);
          break;
        }
        case 'map-set': setMapping(a.getAttribute('data-col')); break;
        case 'settings': if (S.pop && S.pop.kind === 'settings') closePop(true); else openSettings(); break;
        case 'settings-done': closePop(true); break;
        case 'analyst': openSheet('settings'); break;
        case 'close-sheet': closeSheet(); break;
        case 'reset-th': THRESHOLDS.forEach((t) => { S.draft.cfg[t.key] = D.defaults[t.key]; }); syncSetup(); break;
        case 'start': startRun(); break;
        case 'cancel-setup': cancelSetup(); break;
        default: break;
      }
    }

    function onInput(e) {
      const t = e.target;
      const fk = t.getAttribute('data-fk');
      if (fk === 'search') { S.f.q = t.value; refreshFilters(); return; }
      if (fk === 'pal-q') { if (S.modal) { S.modal.q = t.value; S.modal.active = 0; renderPalette(); } return; }
      if (fk === 'note') {
        const sv = selectedView(); if (!sv) return;
        const key = formKey(sv.run, sv.v.c.id);
        S.forms[key] = Object.assign({ open: true, choice: '' }, S.forms[key], { note: t.value });
        syncForm();
        return;
      }
      if (!S.setup || !S.draft) return;
      const d = S.draft.cfg;
      if (t.hasAttribute('data-num')) {
        const k = t.getAttribute('data-num');
        const meta = THRESHOLDS.find((x) => x.key === k);
        if (t.value === '' || isNaN(+t.value)) return;
        d[k] = clamp(Math.round(+t.value), meta.min, meta.max);
      } else if (t.getAttribute('data-field') === 'model') d.model = t.value;
      else return;
      // While typing, refresh the numbers only; the fields re-render on change.
      put(R('head'), setupHeadHtml()); renderSetupBar(); renderSheetEst();
    }

    function onChange(e) {
      const t = e.target;
      if (t.name === 'wb-dec') {
        const sv = selectedView(); if (!sv) return;
        const key = formKey(sv.run, sv.v.c.id);
        S.forms[key] = Object.assign({ open: true, note: '' }, S.forms[key], { choice: t.value });
        syncForm();
        return;
      }
      if (!S.setup || !S.draft) return;
      const dr = S.draft; const d = dr.cfg;
      if (t === R('file')) { handleFile(t.files && t.files[0]); return; }
      if (t.hasAttribute('data-inc-all') || t.hasAttribute('data-inc')) {
        if (t.hasAttribute('data-inc-all')) { if (t.checked) dr.excluded.clear(); else D.companies.forEach((c) => dr.excluded.add(c.id)); }
        else if (t.checked) dr.excluded.delete(t.getAttribute('data-inc')); else dr.excluded.add(t.getAttribute('data-inc'));
        renderSetupTable(); syncSetup();
        return;
      }
      if (t.name === 'wb-prov') d.provider = t.value;
      else if (t.name === 'wb-tier' || t.name === 'wb-q') d.tier = t.value;
      else if (t.hasAttribute('data-toggle')) d[t.getAttribute('data-toggle')] = t.checked;
      else if (t.hasAttribute('data-num')) {
        const k = t.getAttribute('data-num'); const meta = THRESHOLDS.find((x) => x.key === k);
        d[k] = t.value === '' || isNaN(+t.value) ? D.defaults[k] : clamp(Math.round(+t.value), meta.min, meta.max);
      } else if (t.getAttribute('data-field') === 'model') d.model = t.value;
      else return;
      syncSetup();
    }

    /* Keys that belong to a focused element inside the workbench (fields, dialogs, divider, setup). */
    function onRootKey(e) {
      const t = e.target;
      const fk = t.getAttribute ? t.getAttribute('data-fk') : null;
      if (S.modal && R('modal').contains(t)) {
        const m = S.modal;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeModal(); return; }
        if (m.type === 'palette') {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (m.items.length) { m.active = (m.active + (e.key === 'ArrowDown' ? 1 : -1) + m.items.length) % m.items.length; renderPalette(); }
          } else if (e.key === 'Enter') { e.preventDefault(); runPalette(m.active); }
          else if (e.key === 'Tab') e.preventDefault();
        } else if (e.key === 'Tab') { e.preventDefault(); }
        else if (e.key === '?') { e.preventDefault(); e.stopPropagation(); closeModal(); }
        return;
      }
      if (S.sheet && R('overlay').contains(t)) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSheet(); return; }
        if (e.key === 'Tab') {
          const sh = R('overlay').querySelector('.wb-sheet');
          const f = [...sh.querySelectorAll('button, input, select, textarea')].filter((n) => !n.disabled && n.offsetParent !== null);
          if (!f.length) return;
          const first = f[0]; const last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
        return;
      }
      if (S.pop && R('pop').contains(t)) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePop(true); return; }
        if (S.pop.kind === 'map') {
          const opts = [...R('pop').querySelectorAll('.wb-mopt')];
          let i = opts.indexOf(document.activeElement);
          if (e.key === 'ArrowDown') i = (i + 1) % opts.length;
          else if (e.key === 'ArrowUp') i = (i - 1 + opts.length) % opts.length;
          else if (e.key === 'Home') i = 0;
          else if (e.key === 'End') i = opts.length - 1;
          else if (e.key === 'Tab') { e.preventDefault(); closePop(true); return; }
          else return;
          e.preventDefault();
          opts[i].focus();
        }
        return;
      }
      if (S.setup) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (S.pop) closePop(true); else cancelSetup(); }
        return;
      }
      if (t === R('divider')) {
        const k = e.key;
        if (k === 'ArrowUp' || k === ']') { e.preventDefault(); e.stopPropagation(); setPanelW(panelW() + 24); }
        else if (k === 'ArrowDown' || k === '[') { e.preventDefault(); e.stopPropagation(); setPanelW(panelW() - 24); }
        else if (k === 'Enter') { e.preventDefault(); e.stopPropagation(); resetPanelW(); }
        return;
      }
      if (fk === 'note') {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); recordFromForm(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); leaveNote(); }
        return;
      }
      if (fk === 'search') {
        if (e.key === 'Escape') {
          e.preventDefault(); e.stopPropagation();
          if (t.value) { t.value = ''; S.f.q = ''; refreshFilters(); } else t.blur();
        } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
          e.preventDefault(); move(1);
          const b = rowBtn(S.selectedId); if (b) b.focus();
        }
      }
    }

    /* Global shortcuts. The harness owns bare 1-9, ArrowLeft/ArrowRight and R: never bound here. */
    function onDocKey(e) {
      if (!root.isConnected) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (S.modal && S.modal.type === 'palette') closeModal(); else if (!S.sheet) openPalette();
        return;
      }
      const t = e.target;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (S.modal || S.sheet) {
        if (e.key === 'Escape') { e.preventDefault(); if (S.modal) closeModal(); else closeSheet(); }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (S.setup) {
        // Setting up a new run: only these keys; the rest act on a run.
        if (k === 'Escape') { if (S.pop) closePop(true); else cancelSetup(); }
        else if (k === '?') openHelp();
        else if (k === 'o' || k === 'O') openSetup(null);
        else return;
        e.preventDefault();
        return;
      }
      let done = true;
      switch (k) {
        case 'j': case 'J': case 'ArrowDown': move(1); break;
        case 'k': case 'K': case 'ArrowUp': move(-1); break;
        case 'Home': moveTo(false); break;
        case 'End': moveTo(true); break;
        case 'n': case 'N': nextOpen(e.shiftKey ? -1 : 1); break;
        case 'c': case 'C': keyConfirm(); break;
        case 'x': case 'X': keyChange(); break;
        case 'm': case 'M': focusNote(); break;
        case 'u': case 'U': undo(); break;
        case 'e': case 'E': toggleReading(); break;
        case 'a': case 'A': toggleNeeds(); break;
        case 'f': case 'F': focusChips(); break;
        case 'o': case 'O': openSetup(null); break;
        case 'd': case 'D': download(); break;
        case 's': case 'S': stopOrResume(); break;
        case '/': focusSearch(); break;
        case '?': openHelp(); break;
        case 'Escape': {
          const sv = selectedView();
          const form = sv && S.forms[formKey(sv.run, sv.v.c.id)];
          if (S.reading) toggleReading(false);
          else if (form && form.open) { form.open = false; renderDetail(); }
          else done = false;
          break;
        }
        default: done = false;
      }
      if (done) e.preventDefault();
    }

    /* Popovers close on a press or focus outside them (their own button toggles). */
    const popOwns = (n) => !!(n && n.closest && (R('pop').contains(n) || n.closest('[data-act="map-open"], [data-act="settings"]')));
    function onPopPointer(e) { if (S.pop && !popOwns(e.target)) closePop(false); }
    function onFocusIn(e) { if (S.pop && !popOwns(e.target)) closePop(false); }
    function onScroll(e) { if (S.pop && S.pop.kind === 'map' && e.target === R('table')) closePop(false); }
    function onResize() { if (S.pop) closePop(false); }

    /* Drag and drop: while setting up, the whole main column takes a spreadsheet. */
    const isFileDrag = (e) => !!(e.dataTransfer && [...(e.dataTransfer.types || [])].indexOf('Files') >= 0);
    const dropOk = (e) => S.setup && !S.sheet && R('main').contains(e.target);
    function onDragEnter(e) {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      if (!dropOk(e)) return;
      S.dragDepth++;
      R('main').classList.add('is-drag');
    }
    function onDragOver(e) {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = dropOk(e) ? 'copy' : 'none';
    }
    function onDragLeave(e) {
      if (!isFileDrag(e) || !dropOk(e)) return;
      S.dragDepth = Math.max(0, S.dragDepth - 1);
      if (!S.dragDepth) R('main').classList.remove('is-drag');
    }
    function onDrop(e) {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      S.dragDepth = 0;
      R('main').classList.remove('is-drag');
      if (dropOk(e)) handleFile(e.dataTransfer.files && e.dataTransfer.files[0]);
    }

    const listeners = [
      ['click', onClick], ['input', onInput], ['change', onChange], ['keydown', onRootKey], ['focusin', onFocusIn],
      ['dragenter', onDragEnter], ['dragover', onDragOver], ['dragleave', onDragLeave], ['drop', onDrop],
      ['pointerdown', onPopPointer], ['pointerdown', onPointerDown], ['pointermove', onPointerMove], ['pointerup', onPointerUp], ['pointercancel', onPointerUp], ['dblclick', onDblClick],
    ];
    listeners.forEach(([ev, fn]) => root.addEventListener(ev, fn));
    root.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onDocKey);

    /* ---------- first paint ---------- */
    R('divider').setAttribute('aria-valuemin', String(MIN_W));
    refreshView(true);
    S.selectedId = S.viewIds[0] || null;
    renderRailFoot();
    renderAll();

    return function cleanup() {
      Object.keys(engines).forEach((id) => { cancel(engines[id].timer); delete engines[id]; });
      timeouts.forEach((t) => clearTimeout(t)); timeouts.clear();
      rafs.forEach((r) => cancelAnimationFrame(r)); rafs.clear();
      document.removeEventListener('keydown', onDocKey);
      window.removeEventListener('resize', onResize);
      root.removeEventListener('scroll', onScroll, true);
      listeners.forEach(([ev, fn]) => root.removeEventListener(ev, fn));
      drag = null;
    };
  }

  window.PROTO_VARIANTS = window.PROTO_VARIANTS || {};
  window.PROTO_VARIANTS.workbench = { css, render, init };
})();
