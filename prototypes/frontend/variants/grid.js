/* Grid variant: spreadsheet-first. The grid is the whole application.
   Runs are a switcher in the top bar, evidence unfolds inline beneath a row,
   reviewer decisions are made in the row's action cell, and the grid offers
   group-by, a frozen header, totals row and company column, a column chooser,
   multi-select with a bulk bar, and cell-level keyboard movement.
   Setup, scoring, cost estimate and the run engine are ported from workbench.js. */
(function () {
  'use strict';

  const css = `
.v-grid { position: relative; display: flex; flex-direction: column; height: 100%; overflow: hidden; background: var(--bg); color: var(--text); font: 13px/1.4 var(--font); }
.v-grid [hidden] { display: none !important; }
.v-grid .gd-num { font-variant-numeric: tabular-nums; }
.v-grid .gd-mono { font-family: var(--mono); font-size: 12px; }
.v-grid .gd-muted { color: var(--text-3); }
.v-grid .gd-dim { color: var(--text-2); }
.v-grid :focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.v-grid h1, .v-grid h2, .v-grid h3, .v-grid p { margin: 0; }
.v-grid kbd { font: 11px/1 var(--mono); padding: 2px 4px; border: 1px solid var(--border-strong); border-bottom-width: 2px; border-radius: 4px; background: var(--surface); color: var(--text-2); }

/* Buttons */
.v-grid .gd-btn { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); background: var(--surface); color: var(--text); font-weight: 500; font-size: 13px; cursor: pointer; white-space: nowrap; transition: transform 120ms var(--ease-out); }
.v-grid .gd-btn:hover { background: var(--surface-2); }
.v-grid .gd-btn:active { transform: scale(0.97); }
.v-grid .gd-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; background: var(--surface); }
.v-grid .gd-btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.v-grid .gd-btn-primary:hover { background: var(--accent); filter: brightness(1.08); }
.v-grid .gd-btn-primary:disabled { background: var(--accent); filter: none; }
.v-grid .gd-btn-ghost { border-color: transparent; background: transparent; color: var(--text-2); }
.v-grid .gd-btn-ghost:hover { background: var(--surface-2); color: var(--text); }
.v-grid .gd-btn-sm { height: 26px; padding: 0 9px; font-size: 12.5px; }
.v-grid .gd-btn-xs { height: 22px; padding: 0 7px; font-size: 12px; }
.v-grid .gd-btn-stop { color: var(--error); }
.v-grid .gd-btn[aria-expanded="true"] { background: var(--surface-2); border-color: var(--text-3); }

/* Top bar */
.v-grid .gd-top { flex: none; position: relative; z-index: 6; display: flex; align-items: center; gap: 8px; height: 50px; padding: 0 12px; background: var(--surface); border-bottom: 1px solid var(--border); }
.v-grid .gd-brand { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 650; color: var(--text-2); white-space: nowrap; padding-right: 6px; }
.v-grid .gd-brand svg { color: var(--accent); flex: none; }
.v-grid .gd-sw { position: relative; min-width: 0; flex: 0 1 auto; }
.v-grid .gd-swbtn { display: flex; align-items: center; gap: 9px; height: 38px; max-width: 400px; min-width: 0; padding: 0 9px 0 10px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); background: var(--surface); color: var(--text); cursor: pointer; text-align: left; transition: transform 120ms var(--ease-out); }
.v-grid .gd-swbtn:hover { background: var(--surface-2); }
.v-grid .gd-swbtn:active { transform: scale(0.98); }
.v-grid .gd-swbtn[aria-expanded="true"] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.v-grid .gd-sw-t { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
.v-grid .gd-sw-f { font-weight: 650; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v-grid .gd-sw-m { font-size: 11.5px; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v-grid .gd-caret { color: var(--text-3); flex: none; }
.v-grid .gd-top-sp { flex: 1; min-width: 8px; }
.v-grid .gd-top-acts { display: flex; gap: 6px; flex: none; }
.v-grid .gd-status { flex: none; font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 999px; background: var(--general-soft); color: var(--text-2); white-space: nowrap; }
.v-grid .gd-status.is-running { background: var(--accent-soft); color: var(--accent); }
.v-grid .gd-status.is-stopped { background: var(--escalate-soft); color: var(--escalate); }
.v-grid .gd-status.is-complete { background: var(--deep-soft); color: var(--deep); }
.v-grid .gd-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-3); flex: none; }
.v-grid .gd-dot.is-running { background: var(--accent); animation: grid-pulse 1s ease-in-out infinite alternate; }
.v-grid .gd-dot.is-stopped { background: var(--escalate); }
.v-grid .gd-dot.is-complete { background: var(--deep); }

/* Popovers (run switcher, column chooser) */
.v-grid .gd-pop { position: absolute; top: calc(100% + 6px); left: 0; z-index: 15; width: 340px; max-width: calc(100vw - 32px); background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--radius-m); box-shadow: var(--shadow-2); padding: 6px; transform-origin: top left; }
.v-grid .gd-pop.is-right { left: auto; right: 0; transform-origin: top right; width: 300px; }
.v-grid .gd-pop.is-enter { animation: grid-pop 160ms var(--ease-out) both; }
.v-grid .gd-pop-h { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 6px 8px 4px; font-size: 11px; font-weight: 650; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; }
.v-grid .gd-pop-h span { text-transform: none; letter-spacing: 0; font-weight: 500; }
.v-grid .gd-runitem { display: grid; grid-template-columns: 10px 1fr auto; gap: 1px 8px; align-items: center; width: 100%; text-align: left; border: 1px solid transparent; background: transparent; border-radius: var(--radius-s); padding: 7px 8px; cursor: pointer; color: var(--text); }
.v-grid .gd-runitem:hover { background: var(--surface-2); }
.v-grid .gd-runitem[aria-current="true"] { background: var(--accent-soft); }
.v-grid .gd-runitem-f { font-weight: 600; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v-grid .gd-runitem-s { font-size: 11.5px; color: var(--text-2); white-space: nowrap; }
.v-grid .gd-runitem-d { grid-column: 2 / -1; font-size: 11px; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v-grid .gd-minibar { grid-column: 2 / -1; height: 3px; border-radius: 2px; background: var(--border); margin-top: 4px; overflow: hidden; }
.v-grid .gd-minibar > span { display: block; height: 100%; background: var(--accent); transform-origin: left center; }
.v-grid .gd-minibar.is-stopped > span { background: var(--escalate); }
.v-grid .gd-pop-foot { border-top: 1px solid var(--border); margin-top: 6px; padding: 8px 8px 4px; font-size: 11.5px; color: var(--text-2); }
.v-grid .gd-pop-foot + .gd-pop-foot { margin-top: 0; }
.v-grid .gd-keys { display: flex; flex-wrap: wrap; gap: 2px 10px; }
.v-grid .gd-keyok { color: var(--deep); }
.v-grid .gd-keymiss { color: var(--escalate); }
.v-grid .gd-cfg { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.v-grid .gd-cfgtag { font-size: 11px; padding: 1px 6px; border: 1px solid var(--border); border-radius: 4px; color: var(--text-2); background: var(--surface); }
.v-grid .gd-cfgtag.is-off { color: var(--text-3); text-decoration: line-through; }
.v-grid .gd-colopt { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: var(--radius-s); cursor: pointer; font-size: 12.5px; }
.v-grid .gd-colopt:hover { background: var(--surface-2); }
.v-grid .gd-colopt input { margin: 0; accent-color: var(--accent); }
.v-grid .gd-colopt span:first-of-type { flex: 1; }
.v-grid .gd-colopt small { color: var(--text-3); font-size: 11px; font-variant-numeric: tabular-nums; }
.v-grid .gd-colopt.is-lock { cursor: default; color: var(--text-2); }
.v-grid .gd-colopt.is-lock:hover { background: transparent; }

/* Run line (progress / stopped notice) */
.v-grid .gd-runline { flex: none; display: flex; align-items: center; gap: 10px; padding: 7px 12px; background: var(--surface); border-bottom: 1px solid var(--border); font-size: 12px; color: var(--text-2); min-width: 0; }
.v-grid .gd-runline.is-stopped { background: var(--escalate-soft); color: var(--text); }
.v-grid .gd-runline p { flex: 1; min-width: 0; }
.v-grid .gd-prog-bar { flex: 0 0 220px; height: 4px; border-radius: 2px; background: var(--border); overflow: hidden; }
.v-grid .gd-prog-bar > span { display: block; height: 100%; background: var(--accent); transform-origin: left center; transition: transform 200ms var(--ease-out); }
.v-grid .gd-prog-t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Tools row */
.v-grid .gd-tools { flex: none; position: relative; z-index: 5; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 7px 12px; border-bottom: 1px solid var(--border); background: var(--bg); }
.v-grid .gd-search { position: relative; flex: 0 1 200px; min-width: 150px; }
.v-grid .gd-search input { width: 100%; height: 28px; padding: 0 26px 0 9px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); background: var(--surface); font-size: 13px; }
.v-grid .gd-search input:focus-visible { outline-offset: 0; }
.v-grid .gd-search kbd { position: absolute; right: 7px; top: 6px; pointer-events: none; }
.v-grid .gd-fld { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-2); white-space: nowrap; }
.v-grid .gd-fld select { height: 28px; padding: 0 6px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); background: var(--surface); font-size: 12.5px; color: var(--text); }
.v-grid .gd-fld select:disabled { color: var(--text-3); }
.v-grid .gd-tsep { width: 1px; height: 18px; background: var(--border-strong); flex: none; }
.v-grid .gd-colwrap { position: relative; }
.v-grid .gd-stats { display: flex; align-items: center; gap: 2px; margin-left: auto; flex-wrap: wrap; }
.v-grid .gd-stat { height: 28px; display: inline-flex; align-items: center; gap: 6px; padding: 0 8px; border: 1px solid transparent; border-radius: var(--radius-s); background: transparent; font-size: 12px; color: var(--text-2); cursor: pointer; white-space: nowrap; }
.v-grid .gd-stat b { font-size: 14px; font-weight: 650; color: var(--text); font-variant-numeric: tabular-nums; }
.v-grid .gd-stat small { font-size: 11.5px; color: var(--text-3); font-variant-numeric: tabular-nums; }
.v-grid .gd-stat.is-deep b { color: var(--deep); }
.v-grid .gd-stat.is-review b { color: var(--escalate); }
.v-grid button.gd-stat:hover { background: var(--surface); border-color: var(--border); }
.v-grid button.gd-stat[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); }
.v-grid span.gd-stat { cursor: default; }
.v-grid .gd-stats-note { font-size: 12px; color: var(--text-3); padding: 0 6px; white-space: nowrap; }

/* Bulk bar */
.v-grid .gd-bulk { flex: none; display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--accent-soft); border-bottom: 1px solid var(--border); font-size: 12.5px; flex-wrap: wrap; }
.v-grid .gd-bulk-n { font-weight: 650; color: var(--accent); font-variant-numeric: tabular-nums; margin-right: 4px; }
.v-grid .gd-bulk-hint { color: var(--text-2); font-size: 12px; }

/* Grid */
.v-grid .gd-scroll { flex: 1; min-height: 0; overflow: auto; background: var(--surface); position: relative; }
.v-grid .gd-table { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; font-size: 13px; }
.v-grid .gd-table th { position: sticky; top: 0; z-index: 3; height: 32px; padding: 0; background: var(--surface-2); border-bottom: 1px solid var(--border-strong); border-right: 1px solid var(--border); text-align: left; font-weight: 600; font-size: 11px; color: var(--text-2); text-transform: uppercase; letter-spacing: 0.03em; white-space: nowrap; overflow: hidden; }
.v-grid .gd-table th.gd-lead { z-index: 4; }
.v-grid .gd-table tr.gd-tot th { top: 32px; height: 28px; padding: 0 8px; background: var(--surface); border-bottom: 1px solid var(--border-strong); font-size: 11.5px; font-weight: 500; text-transform: none; letter-spacing: 0; color: var(--text-2); font-variant-numeric: tabular-nums; text-overflow: ellipsis; }
.v-grid .gd-table tr.gd-tot th b { color: var(--text); font-weight: 650; }
.v-grid .gd-tot-lead { color: var(--text) !important; font-weight: 600 !important; }
.v-grid .gd-sig { display: inline-block; width: 16px; color: var(--text-3); font-weight: 500; }
.v-grid .gd-th { display: flex; align-items: center; gap: 3px; width: 100%; height: 32px; padding: 0 8px; border: 0; background: transparent; font: inherit; text-transform: inherit; letter-spacing: inherit; color: inherit; cursor: pointer; }
.v-grid .gd-th:hover { color: var(--text); background: var(--border); }
.v-grid .gd-th.is-r { justify-content: flex-end; }
.v-grid .gd-th.is-c { justify-content: center; }
.v-grid .gd-th-ar { font-size: 9px; color: var(--accent); width: 7px; flex: none; }
.v-grid .gd-table td { height: 32px; padding: 0 8px; background: var(--surface); border-bottom: 1px solid var(--border); border-right: 1px solid var(--border); white-space: nowrap; vertical-align: middle; overflow: hidden; text-overflow: ellipsis; }
.v-grid .gd-table .is-r { text-align: right; font-variant-numeric: tabular-nums; }
.v-grid .gd-table .is-c { text-align: center; }
.v-grid .gd-lead { position: sticky; z-index: 1; }
.v-grid .gd-c-sel { left: 0; padding: 0 !important; }
.v-grid .gd-c-chev { left: 34px; padding: 0 !important; border-right-color: transparent !important; }
.v-grid .gd-c-idx { left: 62px; color: var(--text-3); font-size: 12px; padding: 0 6px !important; }
.v-grid .gd-c-co { left: 96px; }
.v-grid .gd-table thead .gd-c-sel { left: 0; }
.v-grid .gd-scroll.is-hscroll .gd-c-co { box-shadow: 6px 0 8px -6px rgba(0, 0, 0, 0.22); }
.v-grid .gd-scroll.is-hscroll tr.gd-tot th.gd-tot-lead { box-shadow: 6px 0 8px -6px rgba(0, 0, 0, 0.22); }
.v-grid .gd-table tbody tr[data-row] { cursor: pointer; scroll-margin: 70px 0 100px; }
.v-grid .gd-table tbody tr[data-row]:hover td { background: var(--surface-2); }
.v-grid .gd-table tbody tr.is-sel td { background: var(--accent-soft); }
.v-grid .gd-table tbody tr.is-open td { background: var(--surface-2); border-bottom-color: transparent; }
.v-grid .gd-table tbody tr.is-cursor td { box-shadow: inset 0 1px 0 var(--accent), inset 0 -1px 0 var(--accent); }
.v-grid .gd-table tbody tr.is-cursor td.gd-c-sel { box-shadow: inset 3px 0 0 var(--accent), inset 0 1px 0 var(--accent), inset 0 -1px 0 var(--accent); }
.v-grid .gd-scroll.is-hscroll tbody tr.is-cursor td.gd-c-co { box-shadow: inset 0 1px 0 var(--accent), inset 0 -1px 0 var(--accent), 6px 0 8px -6px rgba(0, 0, 0, 0.22); }
.v-grid .gd-ck { display: flex; align-items: center; justify-content: center; width: 100%; height: 31px; cursor: pointer; }
.v-grid .gd-ck input { margin: 0; width: 14px; height: 14px; accent-color: var(--accent); cursor: pointer; }
.v-grid .gd-chev { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; margin: 0 auto; border: 0; border-radius: 4px; background: transparent; color: var(--text-3); cursor: pointer; }
.v-grid .gd-chev:hover { background: var(--border); color: var(--text); }
.v-grid .gd-chev[aria-expanded="true"] { color: var(--accent); }
.v-grid .gd-chev[aria-expanded="true"] svg, .v-grid .gd-grpbtn[aria-expanded="true"] svg { transform: rotate(90deg); }
.v-grid .gd-co { display: flex; align-items: baseline; gap: 8px; min-width: 0; overflow: hidden; }
.v-grid .gd-name { display: block; flex: 0 1 auto; min-width: 0; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border: 0; padding: 0; background: transparent; font: inherit; font-weight: 600; color: var(--text); cursor: pointer; text-align: left; }
.v-grid .gd-name:focus-visible { outline: none; text-decoration: underline; text-decoration-color: var(--accent); text-decoration-thickness: 2px; text-underline-offset: 3px; }
.v-grid .gd-co-d { flex: 1 1 0; min-width: 0; color: var(--text-3); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.v-grid tr.is-pending .gd-name { color: var(--text-2); font-weight: 500; }
.v-grid .gd-verdict { display: inline-flex; align-items: center; gap: 6px; font-weight: 500; }
.v-grid .gd-verdict::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--general); flex: none; }
.v-grid .gd-verdict.is-deep { color: var(--deep); }
.v-grid .gd-verdict.is-deep::before { background: var(--deep); }
.v-grid .gd-verdict.is-gen { color: var(--text-2); }
.v-grid .gd-verdict.is-gen::before { background: transparent; box-shadow: inset 0 0 0 1.5px var(--general); }
.v-grid .gd-conf { display: inline-flex; align-items: center; gap: 7px; justify-content: flex-end; }
.v-grid .gd-conf-t { width: 30px; height: 4px; border-radius: 2px; background: var(--general-soft); overflow: hidden; }
.v-grid .gd-conf-t > span { display: block; height: 100%; background: var(--text-3); transform-origin: left center; }
.v-grid .gd-conf-t.is-low > span { background: var(--contested); }
.v-grid .gd-conf-n { width: 22px; text-align: right; }
.v-grid .gd-mks { display: inline-flex; gap: 3px; }
.v-grid .gd-mk { width: 15px; height: 15px; border-radius: 3px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; line-height: 1; flex: none; }
.v-grid .gd-mk.is-y { background: var(--deep-soft); color: var(--deep); }
.v-grid .gd-mk.is-n { background: transparent; color: var(--text-3); box-shadow: inset 0 0 0 1px var(--border-strong); }
.v-grid .gd-risk { display: inline-block; font-size: 11.5px; font-weight: 600; padding: 1px 7px; border-radius: 4px; }
.v-grid .gd-risk.r-Clear { color: var(--text-3); font-weight: 500; padding-left: 0; }
.v-grid .gd-risk.r-Uncertain { background: var(--uncertain-soft); color: var(--uncertain); }
.v-grid .gd-risk.r-Contested { background: var(--contested-soft); color: var(--contested); }
.v-grid .gd-risk.r-Escalate { background: var(--escalate-soft); color: var(--escalate); }
.v-grid .gd-acts { display: flex; align-items: center; gap: 4px; }
.v-grid .gd-dbtn { height: 22px; padding: 0 7px; border: 1px solid var(--border-strong); border-radius: 5px; background: var(--surface); color: var(--text); font-size: 12px; font-weight: 500; cursor: pointer; white-space: nowrap; transition: transform 100ms var(--ease-out); }
.v-grid .gd-dbtn:hover { background: var(--surface-2); border-color: var(--text-3); }
.v-grid .gd-dbtn:active { transform: scale(0.96); }
.v-grid .gd-dbtn.is-confirm { color: var(--accent); border-color: var(--accent); }
.v-grid .gd-dbtn.is-confirm:hover { background: var(--accent-soft); }
.v-grid .gd-act { font-size: 12.5px; color: var(--text-2); }
.v-grid .gd-act.is-done { color: var(--text); font-weight: 600; }
.v-grid .gd-rev { font-size: 10.5px; font-weight: 600; color: var(--accent); background: var(--accent-soft); border-radius: 3px; padding: 1px 5px; white-space: nowrap; }
.v-grid .gd-undo { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; margin-left: auto; border: 0; border-radius: 4px; background: transparent; color: var(--text-3); cursor: pointer; font-size: 13px; }
.v-grid .gd-undo:hover { background: var(--border); color: var(--text); }
.v-grid .gd-step { display: inline-flex; align-items: center; gap: 7px; color: var(--accent); font-size: 12.5px; }
.v-grid .gd-step::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: grid-pulse 0.8s ease-in-out infinite alternate; }
.v-grid .gd-step.is-wait { color: var(--text-2); }
.v-grid .gd-step.is-wait::before { background: var(--text-3); animation: none; }
.v-grid .gd-queued { color: var(--text-3); font-size: 12.5px; }
.v-grid .gd-land { animation: grid-land 240ms var(--ease-out) both; }

/* Group header rows */
.v-grid .gd-table tr.gd-grp td { height: 32px; padding: 0; background: var(--bg); border-right: 0; border-bottom: 1px solid var(--border-strong); overflow: visible; }
.v-grid .gd-table tr.gd-grp + tr.gd-grp td { border-top: 0; }
.v-grid .gd-grp-in { position: sticky; left: 0; width: var(--gd-vw, 100%); display: flex; align-items: center; gap: 10px; padding: 0 12px 0 6px; min-width: 0; }
.v-grid .gd-grpbtn { display: inline-flex; align-items: center; gap: 7px; height: 26px; padding: 0 8px 0 6px; border: 0; border-radius: 5px; background: transparent; font: inherit; font-weight: 650; font-size: 12.5px; color: var(--text); cursor: pointer; white-space: nowrap; }
.v-grid .gd-grpbtn:hover { background: var(--surface-2); }
.v-grid .gd-grpbtn svg { color: var(--text-3); }
.v-grid .gd-sw-dot { width: 8px; height: 8px; border-radius: 2px; flex: none; background: var(--border-strong); }
.v-grid .gd-grp-n { font-weight: 600; font-size: 11.5px; padding: 0 6px; border-radius: 999px; background: var(--surface); border: 1px solid var(--border); color: var(--text-2); font-variant-numeric: tabular-nums; }
.v-grid .gd-grp-meta { font-size: 11.5px; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; font-variant-numeric: tabular-nums; }
.v-grid .gd-grp-done { font-size: 11.5px; color: var(--deep); font-weight: 600; }

/* Inline evidence block */
.v-grid .gd-table tr.gd-evrow td { height: auto; padding: 0; white-space: normal; overflow: visible; background: var(--surface-2); border-right: 0; border-bottom: 1px solid var(--border-strong); }
.v-grid .gd-ev { position: sticky; left: 0; width: var(--gd-vw, 100%); padding: 4px 16px 16px 62px; box-shadow: inset 3px 0 0 var(--border-strong); }
.v-grid .gd-ev.r-Uncertain { box-shadow: inset 3px 0 0 var(--uncertain); }
.v-grid .gd-ev.r-Contested { box-shadow: inset 3px 0 0 var(--contested); }
.v-grid .gd-ev.r-Escalate { box-shadow: inset 3px 0 0 var(--escalate); }
.v-grid .gd-ev.r-pending { box-shadow: inset 3px 0 0 var(--accent); }
.v-grid .gd-evgrid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr) minmax(0, 1.15fr) minmax(0, 1.05fr) minmax(0, 1fr); row-gap: 14px; }
.v-grid .gd-evgrid.is-2 { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); max-width: 760px; }
.v-grid .gd-evcol { min-width: 0; padding: 0 14px; border-left: 1px solid var(--border); font-size: 12.5px; }
.v-grid .gd-evcol:first-child { padding-left: 0; border-left: 0; }
@media (max-width: 1279px) {
  .v-grid .gd-evgrid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .v-grid .gd-evcol:nth-child(3n+1) { padding-left: 0; border-left: 0; }
}
@media (max-width: 1059px) {
  .v-grid .gd-ev { padding-left: 16px; }
  .v-grid .gd-evgrid, .v-grid .gd-evgrid.is-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .v-grid .gd-evcol, .v-grid .gd-evcol:nth-child(3n+1) { padding-left: 14px; border-left: 1px solid var(--border); }
  .v-grid .gd-evcol:nth-child(2n+1) { padding-left: 0; border-left: 0; }
}
.v-grid .gd-sec { margin-top: 12px; }
.v-grid .gd-sec-h { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: 11px; font-weight: 650; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
.v-grid .gd-sec-h span { text-transform: none; letter-spacing: 0; font-weight: 500; }
.v-grid .gd-flag { padding: 8px 10px; border-radius: var(--radius-s); background: var(--surface); border-left: 3px solid var(--border-strong); }
.v-grid .gd-flag.r-Uncertain { background: var(--uncertain-soft); border-left-color: var(--uncertain); }
.v-grid .gd-flag.r-Contested { background: var(--contested-soft); border-left-color: var(--contested); }
.v-grid .gd-flag.r-Escalate { background: var(--escalate-soft); border-left-color: var(--escalate); }
.v-grid .gd-flag-t { font-weight: 650; margin-bottom: 2px; }
.v-grid .gd-flag p + p { margin-top: 5px; }
.v-grid .gd-evdec { padding: 8px 10px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); background: var(--surface); }
.v-grid .gd-evdec-s { display: flex; align-items: center; gap: 8px; }
.v-grid .gd-evdec-s > span { flex: 1; min-width: 0; }
.v-grid .gd-evdec textarea { display: block; width: 100%; margin-top: 7px; min-height: 50px; resize: vertical; padding: 6px 8px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); background: var(--surface); font-size: 12.5px; }
.v-grid .gd-hint { font-size: 12px; color: var(--text-3); margin-top: 6px; }
.v-grid .gd-warn { font-size: 12px; color: var(--escalate); margin-top: 6px; }
.v-grid .gd-build { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.v-grid .gd-build td { padding: 3px 0; border-bottom: 1px dashed var(--border-strong); vertical-align: top; }
.v-grid .gd-build td:last-child { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; padding-left: 10px; }
.v-grid .gd-build tr.is-total td { border-bottom: 0; border-top: 1px solid var(--text-3); font-weight: 650; padding-top: 5px; }
.v-grid .gd-build .gd-why { display: block; font-size: 11.5px; color: var(--text-3); font-weight: 400; }
.v-grid .gd-track { position: relative; height: 18px; margin: 8px 0 2px; }
.v-grid .gd-track-l { position: absolute; left: 0; right: 0; top: 8px; height: 2px; background: var(--border-strong); }
.v-grid .gd-track-th { position: absolute; top: 2px; height: 14px; border-left: 1px dashed var(--escalate); }
.v-grid .gd-track-pre { position: absolute; top: 5px; width: 8px; height: 8px; margin-left: -4px; border-radius: 50%; background: var(--surface); box-shadow: inset 0 0 0 1.5px var(--text-3); }
.v-grid .gd-track-fin { position: absolute; top: 3px; width: 12px; height: 12px; margin-left: -6px; border-radius: 50%; background: var(--text); }
.v-grid .gd-track-ax { display: flex; justify-content: space-between; gap: 6px; font-size: 10px; color: var(--text-3); font-variant-numeric: tabular-nums; }
.v-grid .gd-crit { display: grid; grid-template-columns: 18px 1fr; gap: 2px 8px; padding: 5px 0; border-bottom: 1px solid var(--border); }
.v-grid .gd-crit:last-of-type { border-bottom: 0; }
.v-grid .gd-crit .gd-mk { margin-top: 1px; }
.v-grid .gd-crit b { font-weight: 600; }
.v-grid .gd-crit p { grid-column: 2; color: var(--text-2); }
.v-grid .gd-quote { padding: 7px 9px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-s); color: var(--text); }
.v-grid .gd-quote + .gd-quote { margin-top: 6px; }
.v-grid .gd-quote-src { display: block; margin-top: 3px; font-size: 11.5px; color: var(--text-3); }
.v-grid .gd-kv { display: grid; grid-template-columns: 92px 1fr; gap: 3px 10px; margin: 0; }
.v-grid .gd-kv dt { color: var(--text-3); }
.v-grid .gd-kv dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.v-grid .gd-cpc { display: flex; gap: 8px; padding: 4px 0; border-top: 1px solid var(--border); }
.v-grid .gd-cpc code { font-family: var(--mono); font-size: 12px; color: var(--text); flex: 0 0 92px; }
.v-grid .gd-srcs { margin: 6px 0 0; padding: 0; list-style: none; }
.v-grid .gd-srcs li { font-family: var(--mono); font-size: 11.5px; color: var(--text-2); padding: 2px 0; overflow-wrap: anywhere; }
.v-grid .gd-srcs li::before { content: "\\2197"; margin-right: 6px; color: var(--text-3); font-family: var(--font); }
.v-grid .gd-steps { list-style: none; margin: 0; padding: 0; }
.v-grid .gd-steps li { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--border); }
.v-grid .gd-steps li span:last-child { margin-left: auto; color: var(--text-3); font-size: 12px; }
.v-grid .gd-steps .is-now { color: var(--accent); font-weight: 600; }
.v-grid .gd-steps .is-done { color: var(--text-2); }

.v-grid .gd-empty { padding: 48px 24px 120px; text-align: center; color: var(--text-2); }
.v-grid .gd-empty h2 { font-size: 15px; color: var(--text); margin-bottom: 6px; }
.v-grid .gd-empty .gd-btn { margin-top: 12px; }
.v-grid .gd-pad { height: 110px; padding: 14px 16px; font-size: 11.5px; color: var(--text-3); display: flex; flex-wrap: wrap; gap: 4px 14px; align-content: flex-start; }
.v-grid .gd-pad span { white-space: nowrap; }

/* Summary-only runs */
.v-grid .gd-arch { max-width: 600px; margin: 40px auto 120px; padding: 0 24px; }
.v-grid .gd-arch h2 { font-size: 15px; margin-bottom: 6px; }
.v-grid .gd-arch p { color: var(--text-2); margin-bottom: 12px; }
.v-grid .gd-arch-bar { height: 6px; border-radius: 3px; background: var(--border); overflow: hidden; margin: 14px 0 6px; }
.v-grid .gd-arch-bar > span { display: block; height: 100%; background: var(--escalate); transform-origin: left center; transition: transform 200ms var(--ease-out); }
.v-grid .gd-arch-bar.is-running > span { background: var(--accent); }
.v-grid .gd-arch-bar.is-complete > span { background: var(--deep); }
.v-grid .gd-arch-acts { display: flex; gap: 8px; margin-top: 14px; }
.v-grid .gd-arch-kv { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--border); border-radius: var(--radius-s); margin: 14px 0; }
.v-grid .gd-arch-kv div { padding: 8px 10px; border-left: 1px solid var(--border); }
.v-grid .gd-arch-kv div:first-child { border-left: 0; }
.v-grid .gd-arch-kv span { display: block; font-size: 11px; font-weight: 600; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.04em; }
.v-grid .gd-arch-kv b { font-size: 17px; font-weight: 650; font-variant-numeric: tabular-nums; }

/* Drawer (ported from Workbench) */
.v-grid .gd-scrim { position: absolute; inset: 0; z-index: 20; background: rgba(20, 20, 18, 0.18); animation: grid-fade 200ms var(--ease-out) both; }
.v-grid .gd-drawer { position: absolute; top: 0; right: 0; bottom: 0; z-index: 21; width: min(580px, calc(100% - 120px)); display: flex; flex-direction: column; background: var(--surface); border-left: 1px solid var(--border-strong); box-shadow: var(--shadow-2); animation: grid-slide 240ms var(--ease-out) both; }
.v-grid .gd-scrim.is-leaving { animation: grid-out 160ms var(--ease-out) both; }
.v-grid .gd-drawer.is-leaving { animation: grid-slide-out 160ms var(--ease-out) both; }
.v-grid .gd-dr-head { flex: none; border-bottom: 1px solid var(--border); padding: 14px 18px 12px; }
.v-grid .gd-dr-title { display: flex; align-items: center; justify-content: space-between; }
.v-grid .gd-dr-title h2 { font-size: 15px; font-weight: 650; }
.v-grid .gd-est { display: grid; grid-template-columns: auto auto 1fr auto; gap: 4px 18px; align-items: end; margin-top: 10px; }
.v-grid .gd-est-v { font-size: 20px; font-weight: 650; font-variant-numeric: tabular-nums; line-height: 1.15; }
.v-grid .gd-est-l { font-size: 11px; font-weight: 600; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.04em; }
.v-grid .gd-est-split { align-self: center; min-width: 0; }
.v-grid .gd-est-bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden; background: var(--border); }
.v-grid .gd-est-bar > span { display: block; height: 100%; }
.v-grid .gd-est-lg { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 11px; color: var(--text-2); margin-top: 4px; font-variant-numeric: tabular-nums; }
.v-grid .gd-est-note { grid-column: 1 / -1; font-size: 11.5px; color: var(--text-3); }
.v-grid .gd-est-why { grid-column: 1 / -1; font-size: 12px; color: var(--escalate); text-align: right; }
.v-grid .gd-swatch { display: inline-block; width: 7px; height: 7px; border-radius: 1px; margin-right: 3px; vertical-align: 0; }
.v-grid .gd-dr-body { flex: 1; overflow-y: auto; padding: 4px 18px 96px; }
.v-grid .gd-fs { border: 0; margin: 0; padding: 14px 0 4px; border-bottom: 1px solid var(--border); min-width: 0; }
.v-grid .gd-fs:last-child { border-bottom: 0; }
.v-grid .gd-fs legend { padding: 0; font-size: 11px; font-weight: 650; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; float: left; width: 100%; }
.v-grid .gd-fs legend + * { clear: both; }
.v-grid .gd-drop { border: 1.5px dashed var(--border-strong); border-radius: var(--radius-m); padding: 18px; text-align: center; color: var(--text-2); background: var(--bg); }
.v-grid .gd-drop.is-over { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.v-grid .gd-drop b { display: block; color: var(--text); font-weight: 600; margin-bottom: 2px; }
.v-grid .gd-drop .gd-btn { margin-top: 10px; }
.v-grid .gd-file { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-s); background: var(--bg); }
.v-grid .gd-file-n { font-weight: 600; }
.v-grid .gd-file > div { flex: 1; min-width: 0; }
.v-grid .gd-file-m { font-size: 12px; color: var(--text-2); }
.v-grid .gd-map { display: grid; grid-template-columns: 130px 1fr auto; gap: 6px 10px; align-items: center; margin-top: 10px; font-size: 12.5px; }
.v-grid .gd-map select, .v-grid .gd-input { height: 28px; padding: 0 8px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); background: var(--surface); font-size: 12.5px; min-width: 0; width: 100%; }
.v-grid .gd-tag { font-size: 10.5px; font-weight: 600; padding: 1px 5px; border-radius: 3px; background: var(--general-soft); color: var(--text-2); white-space: nowrap; }
.v-grid .gd-tag.is-auto { background: var(--deep-soft); color: var(--deep); }
.v-grid .gd-tag.is-req { background: var(--escalate-soft); color: var(--escalate); }
.v-grid .gd-prev { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; table-layout: fixed; }
.v-grid .gd-prev th { text-align: left; font-weight: 600; color: var(--text-3); font-size: 11px; padding: 4px 6px; border-bottom: 1px solid var(--border); }
.v-grid .gd-prev td { padding: 4px 6px; border-bottom: 1px solid var(--border); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-2); }
.v-grid .gd-prev td.is-none { color: var(--text-3); font-style: italic; }
.v-grid .gd-provs, .v-grid .gd-tiers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.v-grid .gd-tiers { margin-top: 8px; }
.v-grid .gd-opt { position: relative; display: block; padding: 8px 10px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); cursor: pointer; background: var(--surface); transition: transform 120ms var(--ease-out); }
.v-grid .gd-opt:hover { background: var(--surface-2); }
.v-grid .gd-opt:active { transform: scale(0.98); }
.v-grid .gd-opt:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent); }
.v-grid .gd-opt:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 1px; }
.v-grid .gd-opt input { position: absolute; opacity: 0; pointer-events: none; }
.v-grid .gd-opt-t { display: block; font-weight: 600; font-size: 13px; }
.v-grid .gd-opt-s { display: block; font-size: 11.5px; color: var(--text-2); margin-top: 1px; }
.v-grid .gd-opt-s.is-ok { color: var(--deep); }
.v-grid .gd-opt-s.is-miss { color: var(--escalate); }
.v-grid .gd-row2 { display: grid; grid-template-columns: 130px 1fr; gap: 10px; align-items: center; margin-top: 8px; font-size: 12.5px; }
.v-grid .gd-tg { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--border); cursor: pointer; }
.v-grid .gd-tg:last-child { border-bottom: 0; }
.v-grid .gd-tg-t { font-weight: 600; font-size: 13px; }
.v-grid .gd-tg-s { grid-column: 1; font-size: 12px; color: var(--text-2); }
.v-grid .gd-tg.is-disabled { cursor: not-allowed; }
.v-grid .gd-tg.is-disabled .gd-tg-t { color: var(--text-3); }
.v-grid .gd-switch { grid-row: 1 / span 2; grid-column: 2; appearance: none; -webkit-appearance: none; position: relative; width: 30px; height: 18px; margin: 0; border-radius: 999px; background: var(--border-strong); cursor: pointer; }
.v-grid .gd-switch::before { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.2); transition: transform 160ms var(--ease-out); }
.v-grid .gd-switch:checked { background: var(--accent); }
.v-grid .gd-switch:checked::before { transform: translateX(12px); }
.v-grid .gd-switch:disabled { opacity: 0.5; cursor: not-allowed; }
.v-grid .gd-th-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }
.v-grid .gd-thf { display: grid; grid-template-columns: 1fr 64px; gap: 1px 8px; align-items: center; font-size: 12.5px; }
.v-grid .gd-thf .gd-input { text-align: right; font-variant-numeric: tabular-nums; padding-right: 6px; }
.v-grid .gd-thf small { grid-column: 1 / -1; font-size: 11.5px; color: var(--text-3); }
.v-grid .gd-thf.is-off { opacity: 0.5; }
.v-grid .gd-fs-foot { display: flex; justify-content: flex-end; margin-top: 8px; }

/* Toasts: bottom-right, narrow enough to stay clear of the centred picker */
.v-grid .gd-toasts { position: absolute; right: 16px; bottom: 24px; z-index: 30; display: flex; flex-direction: column; gap: 8px; align-items: flex-end; pointer-events: none; }
.v-grid .gd-toast { pointer-events: auto; display: flex; align-items: center; gap: 12px; max-width: min(380px, calc(50vw - 176px)); min-width: 200px; padding: 9px 10px 9px 12px; border-radius: var(--radius-m); background: var(--text); color: var(--surface); font-size: 12.5px; box-shadow: var(--shadow-2); transform-origin: bottom right; animation: grid-toast 220ms var(--ease-out) both; }
.v-grid .gd-toast > div { flex: 1; min-width: 0; }
.v-grid .gd-toast b { font-weight: 600; }
.v-grid .gd-toast span { display: block; opacity: 0.75; margin-top: 1px; }
.v-grid .gd-toast-btn { flex: none; height: 26px; padding: 0 10px; border: 1px solid rgba(255,255,255,.3); border-radius: var(--radius-s); background: transparent; color: var(--surface); font-weight: 600; font-size: 12.5px; cursor: pointer; transition: transform 120ms var(--ease-out); }
.v-grid .gd-toast-btn:hover { background: rgba(255,255,255,.12); }
.v-grid .gd-toast-btn:active { transform: scale(0.96); }
.v-grid .gd-toast-btn:focus-visible { outline-color: #fff; }
.v-grid .gd-toast.is-leaving { animation: grid-out 160ms var(--ease-out) both; }

@keyframes grid-pulse { from { opacity: 1; } to { opacity: 0.3; } }
@keyframes grid-land { from { opacity: 0; } to { opacity: 1; } }
@keyframes grid-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes grid-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes grid-pop { from { opacity: 0; transform: translateY(-4px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes grid-slide { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }
@keyframes grid-slide-out { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(16px); } }
@keyframes grid-toast { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@media (prefers-reduced-motion: reduce) {
  .v-grid *, .v-grid *::before, .v-grid *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition: none !important; }
  .v-grid .gd-step::before, .v-grid .gd-dot.is-running { animation: none !important; }
}
`;

  function render() {
    return `<div class="v-grid">
  <header class="gd-top" data-r="top"></header>
  <div class="gd-runline" data-r="runline" hidden></div>
  <div class="gd-tools" data-r="tools">
    <div class="gd-search" data-tool>
      <input type="search" data-fk="search" placeholder="Search company, UEN, sector" aria-label="Search companies" autocomplete="off">
      <kbd aria-hidden="true">/</kbd>
    </div>
    <label class="gd-fld" data-tool><span>Group by</span>
      <select data-fk="group" data-r="group" aria-label="Group rows by">
        <option value="review">Review status</option>
        <option value="risk">Risk flag</option>
        <option value="verdict">Verdict</option>
        <option value="sector">Sector</option>
        <option value="none">No grouping</option>
      </select>
    </label>
    <span class="gd-tsep" data-tool aria-hidden="true"></span>
    <button class="gd-btn gd-btn-sm" data-tool data-act="expand-flagged" data-fk="expand-flagged" data-r="expflag">Expand flagged</button>
    <button class="gd-btn gd-btn-sm" data-tool data-act="collapse-all" data-fk="collapse-all" data-r="colall">Collapse all</button>
    <div class="gd-colwrap" data-tool>
      <button class="gd-btn gd-btn-sm" data-act="pop-cols" data-fk="pop-cols" data-r="colbtn" aria-haspopup="true" aria-expanded="false">Columns <span class="gd-num gd-muted" data-r="colcount"></span></button>
      <div data-r="colpop"></div>
    </div>
    <div class="gd-stats" data-r="stats"></div>
  </div>
  <div class="gd-bulk" data-r="bulk" hidden></div>
  <div class="gd-scroll" data-r="scroll"></div>
  <div data-r="overlay"></div>
  <div class="gd-toasts" data-r="toasts" role="status" aria-live="polite"></div>
</div>`;
  }

  function init(stage) {
    const root = stage.querySelector('.v-grid');
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
    /* Data columns after the frozen lead (checkbox 34 + chevron 28 + row number 34 = 96px)
       and the Company column, which takes the remaining width (min 180px). */
    const COLS = [
      { k: 'verdict', label: 'Verdict', w: 112, lock: true },
      { k: 'conf', label: 'Conf.', w: 84, al: 'is-r', lock: true, name: 'Confidence' },
      { k: 'crit', label: 'I · S · P', w: 76, al: 'is-c', name: 'Criteria met (I · S · P)', title: 'Innovation · Scientific foundation · Proprietary IP' },
      { k: 'risk', label: 'Risk flag', w: 96, name: 'Risk flag' },
      { k: 'action', label: 'Action', w: 168, lock: true, name: 'Action and decision' },
      { k: 'patents', label: 'Patents', w: 68, al: 'is-r', name: 'Patent count' },
      { k: 'cost', label: 'Cost', w: 72, al: 'is-r' },
      { k: 'sector', label: 'Sector', w: 136, extra: true },
      { k: 'uen', label: 'UEN', w: 108, extra: true },
      { k: 'basis', label: 'Basis', w: 112, extra: true, name: 'Evidence basis' },
      { k: 'val', label: 'Validator', w: 128, extra: true, name: 'Validator verdict' },
      { k: 'plevel', label: 'Patent level', w: 112, extra: true },
      { k: 'time', label: 'Time', w: 68, al: 'is-r', extra: true, name: 'Processing time' },
    ];
    const LEAD_W = 96;
    const CO_MIN = 180;
    const DEFAULT_COLS = ['crit', 'risk', 'patents', 'cost'];
    const BASIS = { COMBINED: 'Input + web', WEB_DESCRIPTION: 'Web only', DESCRIPTION_ONLY: 'Input only' };
    const BASIS_LONG = { COMBINED: 'Input and web descriptions', WEB_DESCRIPTION: 'Web description', DESCRIPTION_ONLY: 'Input description only' };
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
    const vShort = (v) => (v === 'deep tech' ? 'Deep' : 'General');
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
    const now0 = new Date();
    const stamp = (d) => '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes());
    const CHEV = '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 1.8 6.7 5 3.5 8.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const CARET = '<svg class="gd-caret" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    /* ---------- timers (all cleared in cleanup) ---------- */
    const timeouts = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timeouts.delete(t); fn(); }, ms); timeouts.add(t); return t; };
    const cancel = (t) => { if (t) { clearTimeout(t); timeouts.delete(t); } };
    const rafs = new Set();

    /* ---------- config + derivation (ported from Workbench) ---------- */
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
      const tf = tierFactor(cfg);
      const baseCost = c.validator.triggered && !validated ? c.cost * 0.42 : c.cost;
      const cost = baseCost * tf * (batchOn(cfg) ? 0.82 : 1) * (cfg.enrichment ? 1 : 0.65);
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
      return Object.assign({ kind: 'rows', results: {}, progress: {}, landed: {}, decisions: {}, phase: '', current: null }, o);
    }
    const initialCfg = defaultCfg();
    const initialRun = makeRowsRun({
      id: 'run_' + stamp(now0).slice(0, 8) + '_0842', file: D.file.name, rows: D.file.rows,
      dateLabel: 'Today, 08:42', status: 'complete', cfg: initialCfg, model: modelFor(initialCfg),
      ids: D.companies.map((c) => c.id),
    });
    D.companies.forEach((c) => { initialRun.results[c.id] = derive(c, initialCfg); });

    const pastRuns = D.pastRuns.map((p) => ({
      kind: 'summary', id: p.id, file: p.file, dateLabel: p.date, status: p.status, model: p.model,
      summary: p.status === 'interrupted'
        ? { total: p.total, done: p.done, deep: 7, general: 15, review: 2, errors: 0, cost: null }
        : { total: p.total, done: p.total, deep: p.deep, general: p.general, review: p.review, errors: p.errors, cost: p.cost },
    }));

    const S = {
      runs: [initialRun].concat(pastRuns),
      activeId: initialRun.id,
      cursorId: null, anchorId: null,
      expanded: new Set(), selected: new Set(), collapsed: new Set(),
      groupBy: 'review', sortKey: 'priority', sortDir: 1,
      f: { verdict: null, flagged: false, q: '' },
      cols: new Set(DEFAULT_COLS),
      pop: null, popEnter: false,
      drawer: null,
      notes: {},
    };
    const engines = {};
    const runById = (id) => S.runs.find((r) => r.id === id);
    const activeRun = () => runById(S.activeId);

    /* Effective view of one row: result plus any reviewer decision. */
    function rowView(run, id) {
      const c = C_BY_ID[id];
      const r = run.results[id] || null;
      const dec = run.decisions[id] || null;
      const idx = run.ids.indexOf(id) + 1;
      if (!r) return { c, r: null, dec: null, prog: run.progress[id] || null, idx, flagged: false, open: false };
      const flagged = r.risk !== 'Clear';
      const verdict = dec ? dec.verdict : r.verdict;
      const action = dec ? (verdict === 'deep tech' ? 'Approve' : 'Reject') : flagged ? 'Needs Review' : (verdict === 'deep tech' ? 'Approve' : 'Reject');
      return { c, r, dec, flagged, open: flagged && !dec, verdict, action, idx };
    }

    /* Counting convention (same as Workbench): deep / general count every finished row under
       its current verdict, flagged ones included; Needs review counts flagged rows not yet decided. */
    function counts(run) {
      if (run.kind === 'summary') {
        const s = run.summary;
        return { total: s.total, done: s.done, deep: s.deep, general: s.general, open: s.review, reviewed: 0, flagged: s.review, cost: s.cost, avg: null };
      }
      const out = { total: run.ids.length, done: 0, deep: 0, general: 0, open: 0, reviewed: 0, flagged: 0, cost: 0, avg: null, costUnknown: false };
      let sum = 0;
      run.ids.forEach((id) => {
        const v = rowView(run, id);
        if (!v.r) return;
        out.done++;
        if (v.verdict === 'deep tech') out.deep++; else out.general++;
        if (v.flagged) { out.flagged++; if (v.dec) out.reviewed++; else out.open++; }
        if (v.r.cost == null) out.costUnknown = true; else out.cost += v.r.cost;
        sum += v.r.conf;
      });
      out.avg = out.done ? Math.round(sum / out.done) : null;
      return out;
    }

    /* ---------- simulation engine (ported from Workbench) ---------- */
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
      const land = (id) => () => {
        run.results[id] = pre[id]; delete run.progress[id]; run.landed[id] = Date.now();
        run.current = id;
      };
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
        if (op.dur > 0 || eng.i >= eng.ops.length) { onTick(run); eng.timer = later(tick, op.dur); }
        else tick();
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
      renderAll();
    }

    function finishRun(run) {
      delete engines[run.id];
      run.status = 'complete'; run.phase = ''; run.current = null;
      if (run.kind === 'rows') {
        const k = counts(run);
        toast('Run complete: ' + run.file, k.done + ' companies · ' + k.deep + ' deep tech · ' + k.open + ' need review');
        if (run.id === S.activeId) {
          // Grouping resumes now; put the cursor on the first company to review.
          const L = layout(run);
          const first = L.flat.find((id) => rowView(run, id).open);
          if (first) S.cursorId = first;
          R('scroll').scrollTop = 0;
        }
      } else {
        run.resumed = true;
        run.summary.cost = Math.round(run.summary.total * D.estCostPerCompany.fast * 0.97 * 100) / 100;
        toast('Run complete: ' + run.file, run.summary.total + ' companies classified');
      }
      renderAll();
    }

    let tickScheduled = false;
    function onTick(run) {
      // Coalesce renders into one per frame.
      if (tickScheduled) return;
      tickScheduled = true;
      const rid = requestAnimationFrame(() => {
        rafs.delete(rid);
        tickScheduled = false;
        renderTop();
        if (run.id !== S.activeId) return;
        renderRunline(); renderTools(); renderBulk(); renderGrid();
      });
      rafs.add(rid);
    }

    /* ---------- filtering, sorting, grouping ---------- */
    function filterIds(run) {
      const f = S.f; const q = f.q.trim().toLowerCase();
      return run.ids.filter((id) => {
        const v = rowView(run, id);
        if (q) {
          const c = v.c;
          const hay = (c.name + ' ' + c.uen + ' ' + c.domain + ' ' + c.description).toLowerCase();
          if (hay.indexOf(q) < 0) return false;
        }
        if (!v.r) return !(f.verdict || f.flagged);
        if (f.verdict && v.verdict !== f.verdict) return false;
        if (f.flagged && !v.flagged) return false;
        return true;
      });
    }

    function sortVal(v, key) {
      switch (key) {
        case 'idx': return v.idx;
        case 'name': return v.c.name.toLowerCase();
        case 'verdict': return v.verdict;
        case 'conf': return v.r.conf;
        case 'crit': return ['innovation', 'scientific_foundation', 'proprietary_ip'].filter((k) => v.c.criteria[k].met).length;
        case 'risk': return SEV[v.r.risk];
        case 'action': return v.open ? 0 : v.dec ? 1 : v.action === 'Approve' ? 2 : 3;
        case 'patents': return v.r.patents.count;
        case 'cost': return v.r.cost == null ? -1 : v.r.cost;
        case 'sector': return (v.c.domain || '').toLowerCase();
        case 'uen': return v.c.uen;
        case 'basis': return v.r.basis;
        case 'val': return v.r.validated ? v.r.val.verdict : 'zz';
        case 'plevel': return ({ 'Very Strong': 0, Strong: 1, Moderate: 2, 'Not Deep-tech': 3, 'Not looked up': 4 })[v.r.patents.level] || 5;
        case 'time': return v.r.timeS;
        default: return 0;
      }
    }

    function sortIds(run, ids, running) {
      const key = S.sortKey; const dir = S.sortDir;
      if (running || key === 'idx') {
        return ids.slice().sort((a, b) => (run.ids.indexOf(a) - run.ids.indexOf(b)) * (key === 'idx' && !running ? dir : 1));
      }
      const views = {};
      ids.forEach((id) => { views[id] = rowView(run, id); });
      return ids.slice().sort((a, b) => {
        const va = views[a]; const vb = views[b];
        if (key === 'name') { const x = sortVal(va, key); const y = sortVal(vb, key); return (x < y ? -1 : x > y ? 1 : 0) * dir; }
        if (!va.r || !vb.r) { if (va.r) return -1; if (vb.r) return 1; return va.idx - vb.idx; }
        if (key === 'priority') {
          const ga = va.open ? 0 : va.flagged ? 1 : 2; const gb = vb.open ? 0 : vb.flagged ? 1 : 2;
          if (ga !== gb) return ga - gb;
          if (SEV[va.r.risk] !== SEV[vb.r.risk]) return SEV[va.r.risk] - SEV[vb.r.risk];
          return va.r.conf - vb.r.conf || va.idx - vb.idx;
        }
        const x = sortVal(va, key); const y = sortVal(vb, key);
        if (x < y) return -1 * dir; if (x > y) return 1 * dir;
        return va.idx - vb.idx;
      });
    }

    const GROUPS = {
      review: [
        { key: 'open', label: 'Needs review', tone: 'var(--escalate)' },
        { key: 'reviewed', label: 'Reviewed', tone: 'var(--accent)' },
        { key: 'clear', label: 'Clear · no review needed', tone: 'var(--border-strong)' },
      ],
      risk: [
        { key: 'Escalate', label: 'Escalate', tone: 'var(--escalate)' },
        { key: 'Contested', label: 'Contested', tone: 'var(--contested)' },
        { key: 'Uncertain', label: 'Uncertain', tone: 'var(--uncertain)' },
        { key: 'Clear', label: 'Clear', tone: 'var(--border-strong)' },
      ],
      verdict: [
        { key: 'deep tech', label: 'Deep tech', tone: 'var(--deep)' },
        { key: 'general tech', label: 'General tech', tone: 'var(--general)' },
      ],
    };
    function groupKey(v, g) {
      if (g === 'sector') return v.c.domain || 'No sector';
      if (!v.r) return 'pending';
      if (g === 'review') return v.open ? 'open' : v.flagged ? 'reviewed' : 'clear';
      if (g === 'risk') return v.r.risk;
      return v.verdict;
    }

    /* Returns display groups plus the flat order of visible rows (skipping collapsed groups). */
    function layout(run) {
      const running = run.status === 'running';
      const g = running ? 'none' : S.groupBy;
      const sorted = sortIds(run, filterIds(run), running);
      if (g === 'none') return { grouped: false, groups: [{ key: 'all', ids: sorted }], flat: sorted.slice(), all: sorted };
      const buckets = {};
      sorted.forEach((id) => { const k = groupKey(rowView(run, id), g); (buckets[k] = buckets[k] || []).push(id); });
      let defs;
      if (g === 'sector') {
        defs = Object.keys(buckets).sort((a, b) => buckets[b].length - buckets[a].length || a.localeCompare(b)).map((k) => ({ key: k, label: k, tone: 'var(--border-strong)' }));
      } else {
        defs = GROUPS[g].slice();
      }
      if (g !== 'sector') defs.push({ key: 'pending', label: run.status === 'stopped' ? 'Not classified yet · resume to finish' : 'Not classified yet', tone: 'var(--accent)' });
      const groups = [];
      defs.forEach((d) => {
        const ids = buckets[d.key] || [];
        const keepEmpty = g === 'review' && d.key === 'open' && counts(run).flagged > 0 && !S.f.q.trim();
        if (!ids.length && !keepEmpty) return;
        groups.push(Object.assign({}, d, { ids, ck: g + ':' + d.key }));
      });
      const flat = []; const all = [];
      groups.forEach((gr) => { gr.ids.forEach((id) => { all.push(id); if (!S.collapsed.has(gr.ck)) flat.push(id); }); });
      return { grouped: true, by: g, groups, flat, all };
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
    const verdictHtml = (v) => '<span class="gd-verdict ' + vClass(v) + '">' + vLabel(v) + '</span>';
    const riskHtml = (r) => '<span class="gd-risk r-' + r + '">' + r + '</span>';
    const CRIT = [['innovation', 'I', 'Innovation'], ['scientific_foundation', 'S', 'Scientific foundation'], ['proprietary_ip', 'P', 'Proprietary IP']];
    function marksHtml(c) {
      const label = CRIT.map((x) => x[2] + (c.criteria[x[0]].met ? ' met' : ' not met')).join(', ');
      return '<span class="gd-mks" role="img" aria-label="' + label + '">' + CRIT.map((x) => {
        const m = c.criteria[x[0]].met;
        return '<span class="gd-mk ' + (m ? 'is-y' : 'is-n') + '" title="' + x[2] + ': ' + (m ? 'met' : 'not met') + '" aria-hidden="true">' + (m ? '✓' : x[1]) + '</span>';
      }).join('') + '</span>';
    }
    const visCols = () => COLS.filter((c) => c.lock || S.cols.has(c.k));
    function statusOf(run) {
      if (run.kind === 'rows') {
        const k = counts(run);
        if (run.status === 'running') return { dot: 'is-running', pill: 'is-running', label: 'Running', text: 'Running · ' + k.done + '/' + k.total, bar: k.done / k.total };
        if (run.status === 'stopped') return { dot: 'is-stopped', pill: 'is-stopped', label: 'Stopped', text: 'Stopped · ' + k.done + '/' + k.total, bar: k.done / k.total };
        return { dot: 'is-complete', pill: 'is-complete', label: 'Complete', text: k.open ? k.open + ' to review' : 'All reviewed' };
      }
      const s = run.summary;
      if (run.status === 'running') return { dot: 'is-running', pill: 'is-running', label: 'Resuming', text: 'Resuming · ' + s.done + '/' + s.total, bar: s.done / s.total };
      if (run.status === 'interrupted' || run.status === 'stopped') return { dot: 'is-stopped', pill: 'is-stopped', label: 'Interrupted', text: 'Interrupted · ' + s.done + '/' + s.total, bar: s.done / s.total };
      return { dot: 'is-complete', pill: 'is-complete', label: 'Complete', text: s.review + ' to review' };
    }
    function cfgTags(cfg) {
      const t = (on, label) => '<span class="gd-cfgtag ' + (on ? '' : 'is-off') + '">' + label + '</span>';
      return '<div class="gd-cfg">' +
        t(cfg.enrichment, 'Web enrichment') + t(cfg.epo, 'Patent lookup') +
        t(cfg.validator, 'Validation &lt; ' + cfg.validatorThreshold) + t(batchOn(cfg), 'Batch mode') +
        '<span class="gd-cfgtag">Override ≥ ' + cfg.overrideMinConfidence + '</span>' +
        '<span class="gd-cfgtag">Patent adj. ±' + cfg.epoAdjustMax + '</span>' +
        '<span class="gd-cfgtag">Low-evidence cap ' + cfg.lowEvidenceCap + '</span></div>';
    }

    /* ---------- top bar + run switcher ---------- */
    function renderTop() {
      const run = activeRun();
      const st = statusOf(run);
      const k = counts(run);
      let acts = '';
      if (run.status === 'running') acts += '<button class="gd-btn gd-btn-stop" data-act="stop" data-fk="stop">■ Stop</button>';
      if (run.status === 'stopped' || run.status === 'interrupted') acts += '<button class="gd-btn gd-btn-primary" data-act="resume" data-fk="resume">Resume</button>';
      if (run.kind === 'rows') acts += '<button class="gd-btn" data-act="rerun" data-fk="rerun" title="Open a new run with these settings">Same settings…</button>';
      acts += '<button class="gd-btn" data-act="download" data-fk="download">Download Excel</button>';
      const sub = esc(run.dateLabel) + ' · ' + esc(run.model) + ' · ' + k.total + ' companies';
      let pop = '';
      if (S.pop === 'runs') {
        const item = (r) => {
          const s = statusOf(r);
          return '<button class="gd-runitem" data-act="open-run" data-id="' + r.id + '" data-fk="run-' + r.id + '" aria-current="' + (r.id === S.activeId) + '">' +
            '<span class="gd-dot ' + s.dot + '"></span><span class="gd-runitem-f">' + esc(r.file) + '</span><span class="gd-runitem-s gd-num">' + esc(s.text) + '</span>' +
            '<span></span><span class="gd-runitem-d">' + esc(r.dateLabel) + ' · ' + esc(r.model) + ' · ' + counts(r).total + ' companies</span>' +
            (s.bar != null ? '<span></span><span class="gd-minibar ' + (s.dot === 'is-stopped' ? 'is-stopped' : '') + '"><span style="transform:scaleX(' + s.bar.toFixed(3) + ')"></span></span>' : '') +
            '</button>';
        };
        const fresh = S.runs.filter((r) => r.fresh);
        const older = S.runs.filter((r) => !r.fresh);
        let list = '';
        if (fresh.length) list += '<div class="gd-pop-h">This session</div>' + fresh.map(item).join('');
        list += '<div class="gd-pop-h">Recent runs<span>' + older.length + '</span></div>' + older.map(item).join('');
        const keys = D.providers.map((p) => '<span>' + esc(p.label) + ' ' + (p.keySet ? '<span class="gd-keyok">key set</span>' : '<span class="gd-keymiss">no key</span>') + '</span>').join('') +
          '<span>EPO ' + (D.epoKeysSet ? '<span class="gd-keyok">key set</span>' : '<span class="gd-keymiss">no key</span>') + '</span>';
        pop = '<div class="gd-pop' + (S.popEnter ? ' is-enter' : '') + '" role="dialog" aria-label="Runs" data-pop="runs">' + list +
          (run.kind === 'rows' ? '<div class="gd-pop-foot">Settings for this run' + cfgTags(run.cfg) + '</div>' : '') +
          '<div class="gd-pop-foot"><div class="gd-keys">API keys (.env): ' + keys + '</div></div></div>';
        S.popEnter = false;
      }
      put(R('top'),
        '<span class="gd-brand"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1 1h12v12H1zM1 5h12M1 9h12M5 1v12" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>Deep Tech Classifier</span>' +
        '<div class="gd-sw"><button class="gd-swbtn" data-act="pop-runs" data-fk="pop-runs" aria-haspopup="true" aria-expanded="' + (S.pop === 'runs') + '" aria-label="Switch run. Current: ' + esc(run.file) + ', ' + esc(st.label) + '">' +
        '<span class="gd-dot ' + st.dot + '"></span><span class="gd-sw-t"><span class="gd-sw-f">' + esc(run.file) + '</span><span class="gd-sw-m">' + sub + '</span></span>' +
        '<span class="gd-status ' + st.pill + '">' + esc(st.label) + '</span>' + CARET + '</button>' + pop + '</div>' +
        '<button class="gd-btn" data-act="new-run" data-fk="new-run">+ New run</button>' +
        '<span class="gd-top-sp"></span><div class="gd-top-acts">' + acts + '</div>');
    }

    function renderRunline() {
      const run = activeRun();
      const el = R('runline');
      el.classList.remove('is-stopped');
      if (run.kind === 'rows' && run.status === 'running') {
        const k = counts(run);
        el.hidden = false;
        put(el, '<span class="gd-prog-bar"><span style="transform:scaleX(' + (k.done / k.total).toFixed(3) + ')"></span></span><span class="gd-num"><b>' + k.done + '</b> of ' + k.total + '</span><span class="gd-prog-t">' + (batchOn(run.cfg) ? 'Batch · ' : 'Sequential · ') + esc(run.phase) + '</span><span class="gd-muted">Rows fill in place; grouping resumes when the run finishes</span>');
      } else if (run.kind === 'rows' && run.status === 'stopped') {
        const k = counts(run);
        el.hidden = false; el.classList.add('is-stopped');
        put(el, '<p>Stopped after <b class="gd-num">' + k.done + ' of ' + k.total + '</b>. Finished rows can be reviewed now. Resume continues at the next unfinished company with <span class="gd-mono">' + esc(run.model) + '</span>, the model this run started with.</p><button class="gd-btn gd-btn-sm gd-btn-primary" data-act="resume" data-fk="rl-resume">Resume</button>');
      } else {
        el.hidden = true; el.innerHTML = '';
      }
    }

    /* ---------- tools row ---------- */
    function renderTools() {
      const run = activeRun();
      const rows = run.kind === 'rows';
      root.querySelectorAll('[data-tool]').forEach((n) => { n.hidden = !rows; });
      const k = counts(run);
      if (rows) {
        const running = run.status === 'running';
        const sel = R('group');
        sel.value = S.groupBy;
        sel.disabled = running;
        sel.title = running ? 'Rows stay in input order while the run is going' : '';
        const nFlag = run.ids.filter((id) => rowView(run, id).flagged).length;
        const ef = R('expflag');
        ef.textContent = 'Expand flagged' + (nFlag ? ' (' + nFlag + ')' : '');
        ef.disabled = !nFlag;
        ef.title = nFlag ? 'Open the evidence for every flagged company' : 'No flagged companies yet';
        const ca = R('colall');
        ca.disabled = !S.expanded.size;
        const extraOn = COLS.filter((c) => c.extra && S.cols.has(c.k)).length;
        R('colcount').textContent = extraOn ? '+' + extraOn : '';
        R('colbtn').setAttribute('aria-expanded', String(S.pop === 'cols'));
        renderColPop();
      }
      // Stats: counts are filter toggles on row runs, plain numbers on summary runs.
      const f = S.f;
      const stat = (key, label, value, cls, pressed, small) => rows
        ? '<button class="gd-stat ' + (cls || '') + '" data-act="stat" data-k="' + key + '" data-fk="stat-' + key + '" aria-pressed="' + !!pressed + '">' + label + ' <b>' + value + '</b>' + (small ? '<small>' + small + '</small>' : '') + '</button>'
        : '<span class="gd-stat ' + (cls || '') + '">' + label + ' <b>' + value + '</b></span>';
      let html = '';
      if (k.done < k.total) html += '<span class="gd-stat">Processed <b>' + k.done + '</b><small>/ ' + k.total + '</small></span>';
      html += stat('deep', 'Deep tech', k.deep, 'is-deep', f.verdict === 'deep tech') +
        stat('general', 'General tech', k.general, '', f.verdict === 'general tech') +
        stat('review', 'Needs review', k.open, k.open ? 'is-review' : '', f.flagged, rows && k.reviewed ? '· ' + k.reviewed + ' reviewed' : '');
      if (rows) {
        const any = f.verdict || f.flagged || f.q.trim();
        if (any) {
          html += '<span class="gd-stats-note gd-num">' + filterIds(run).length + ' of ' + run.ids.length + ' shown</span><button class="gd-btn gd-btn-ghost gd-btn-sm" data-act="clear-filters" data-fk="clear-filters">Clear filters</button>';
        }
        if (S.sortKey !== 'priority' && run.status !== 'running') html += '<button class="gd-btn gd-btn-ghost gd-btn-sm" data-act="sort-priority" data-fk="sort-priority" title="Within each group: most severe flag first, then lowest confidence">Reset sort</button>';
      }
      put(R('stats'), html);
    }

    function renderColPop() {
      const el = R('colpop');
      if (S.pop !== 'cols') { el.innerHTML = ''; return; }
      const opt = (c) => {
        const on = c.lock || S.cols.has(c.k);
        return '<label class="gd-colopt' + (c.lock ? ' is-lock' : '') + '"><input type="checkbox" data-col="' + c.k + '" data-fk="col-' + c.k + '"' + (on ? ' checked' : '') + (c.lock ? ' disabled' : '') + '><span>' + esc(c.name || c.label) + '</span><small>' + (c.lock ? 'always' : c.w + 'px') + '</small></label>';
      };
      const extraW = COLS.filter((c) => c.extra && S.cols.has(c.k)).reduce((s, c) => s + c.w, 0);
      put(el, '<div class="gd-pop is-right' + (S.popEnter ? ' is-enter' : '') + '" role="dialog" aria-label="Columns" data-pop="cols">' +
        '<div class="gd-pop-h">Columns<span>Company is frozen on the left</span></div>' +
        COLS.filter((c) => !c.extra).map(opt).join('') +
        '<div class="gd-pop-h">More columns<span>Not in the Workbench table</span></div>' +
        COLS.filter((c) => c.extra).map(opt).join('') +
        '<div class="gd-pop-foot">' + (extraW ? 'Extra columns add ' + extraW + 'px; the grid scrolls sideways if they do not fit, with Company kept in view.' : 'The default set fits without sideways scrolling.') +
        '<div style="margin-top:6px;display:flex;justify-content:flex-end"><button class="gd-btn gd-btn-ghost gd-btn-xs" data-act="reset-cols" data-fk="reset-cols">Reset to default columns</button></div></div></div>');
      S.popEnter = false;
    }

    /* ---------- bulk bar ---------- */
    function renderBulk() {
      const run = activeRun();
      const el = R('bulk');
      if (run.kind !== 'rows' || !S.selected.size) { el.hidden = true; el.innerHTML = ''; return; }
      const ids = [...S.selected];
      const confirmable = ids.filter((id) => rowView(run, id).open).length;
      const n = ids.length;
      el.hidden = false;
      const label = !confirmable ? 'Confirm' : confirmable === n ? 'Confirm ' + n + ' selected' : 'Confirm the ' + confirmable + ' that need review';
      const hint = !confirmable ? 'None of the selection needs review' : confirmable < n ? (n - confirmable) + ' selected ' + (n - confirmable === 1 ? 'row needs' : 'rows need') + ' no decision' : 'Keeps each pipeline verdict and records you as reviewer';
      put(el, '<span class="gd-bulk-n">' + plural(n, 'row') + ' selected</span>' +
        '<button class="gd-btn gd-btn-sm gd-btn-primary" data-act="bulk-confirm" data-fk="bulk-confirm"' + (confirmable ? '' : ' disabled') + '>' + label + '</button>' +
        '<button class="gd-btn gd-btn-sm" data-act="bulk-download" data-fk="bulk-download">Download selected</button>' +
        '<button class="gd-btn gd-btn-sm gd-btn-ghost" data-act="sel-clear" data-fk="sel-clear">Clear selection <kbd>Esc</kbd></button>' +
        '<span class="gd-bulk-hint">' + esc(hint) + '</span>');
    }

    /* ---------- grid ---------- */
    function cellHtml(run, v, col, land) {
      const r = v.r; const c = v.c;
      const al = col.al ? ' class="' + col.al + '"' : '';
      switch (col.k) {
        case 'verdict': {
          const t = v.dec && v.dec.verdict !== r.verdict ? ' title="Changed by reviewer; the pipeline said ' + vLabel(r.verdict).toLowerCase() + '"' : '';
          return '<td' + t + '><span' + land + '>' + verdictHtml(v.verdict) + '</span></td>';
        }
        case 'conf': {
          const low = r.conf < run.cfg.validatorThreshold;
          return '<td class="is-r" title="' + confWord(r.conf) + ' confidence"><span class="gd-conf"' + land + '><span class="gd-conf-t ' + (low ? 'is-low' : '') + '"><span style="transform:scaleX(' + (r.conf / 100).toFixed(2) + ')"></span></span><span class="gd-conf-n">' + r.conf + '</span></span></td>';
        }
        case 'crit': return '<td class="is-c">' + marksHtml(c) + '</td>';
        case 'risk': return '<td>' + riskHtml(r.risk) + '</td>';
        case 'action': return '<td>' + actionCell(v) + '</td>';
        case 'patents': return '<td class="is-r ' + (r.patents.count ? '' : 'gd-muted') + '">' + (r.patents.status === 'disabled' ? '—' : r.patents.count) + '</td>';
        case 'cost': return '<td class="is-r gd-dim">' + (r.cost == null ? '<span title="Pinned model has no listed price">?</span>' : money(r.cost, 3)) + '</td>';
        case 'sector': return '<td title="' + esc(c.domain) + '">' + esc(c.domain || '—') + '</td>';
        case 'uen': return '<td class="gd-mono gd-dim">' + (run.cfg.mapping.uen ? esc(c.uen) : '<span class="gd-muted">not mapped</span>') + '</td>';
        case 'basis': return '<td class="gd-dim" title="' + esc(BASIS_LONG[r.basis]) + '">' + esc(BASIS[r.basis]) + '</td>';
        case 'val': {
          if (!r.validated) return '<td class="gd-muted">Not run</td>';
          const V = { confirm: 'Confirmed', override: r.override === 'applied' ? 'Override applied' : 'Override blocked', insufficient_evidence: 'Insufficient' };
          return '<td title="Validator confidence ' + r.val.confidence + '">' + V[r.val.verdict] + ' <span class="gd-muted gd-num">' + r.val.confidence + '</span></td>';
        }
        case 'plevel': return '<td class="' + (r.patents.count ? '' : 'gd-muted') + '">' + esc(r.patents.level) + '</td>';
        case 'time': return '<td' + al + '>' + r.timeS.toFixed(1) + ' s</td>';
        default: return '<td></td>';
      }
    }

    function actionCell(v) {
      const id = v.c.id; const tab = id === S.cursorId ? '0' : '-1';
      if (v.open) {
        const other = flip(v.r.verdict);
        return '<div class="gd-acts">' +
          '<button class="gd-dbtn is-confirm" data-act="confirm" data-id="' + id + '" data-fk="confirm-' + id + '" tabindex="' + tab + '" title="Confirm ' + vLabel(v.r.verdict).toLowerCase() + ' → ' + (v.r.verdict === 'deep tech' ? 'Approve' : 'Reject') + '" aria-label="Confirm ' + vLabel(v.r.verdict).toLowerCase() + ' for ' + esc(v.c.name) + '">✓ Confirm</button>' +
          '<button class="gd-dbtn" data-act="change" data-id="' + id + '" data-fk="change-' + id + '" tabindex="' + tab + '" title="Change to ' + vLabel(other).toLowerCase() + ' → ' + (other === 'deep tech' ? 'Approve' : 'Reject') + '" aria-label="Change ' + esc(v.c.name) + ' to ' + vLabel(other).toLowerCase() + '">→ ' + vShort(other) + '</button></div>';
      }
      if (v.dec) {
        const same = v.dec.verdict === v.r.verdict;
        return '<div class="gd-acts"><span class="gd-act is-done">' + v.action + '</span><span class="gd-rev" title="' + (same ? 'Reviewer confirmed the pipeline verdict' : 'Reviewer changed the verdict') + (v.dec.note ? ': ' + esc(v.dec.note) : '') + '">' + (same ? '✓ Confirmed' : '⇄ Changed') + '</span>' +
          '<button class="gd-undo" data-act="undo" data-id="' + id + '" data-fk="undo-' + id + '" tabindex="' + tab + '" title="Undo decision" aria-label="Undo decision for ' + esc(v.c.name) + '">↺</button></div>';
      }
      return '<span class="gd-act">' + v.action + '</span>';
    }

    function rowHtml(run, v, cols, t) {
      const id = v.c.id;
      const cur = id === S.cursorId; const sel = S.selected.has(id); const open = S.expanded.has(id);
      const cls = [v.r ? '' : 'is-pending', cur ? 'is-cursor' : '', sel ? 'is-sel' : '', open ? 'is-open' : ''].join(' ').trim();
      const tab = cur ? '0' : '-1';
      const nm = esc(v.c.name);
      const desc = [v.c.domain, v.c.description].filter(Boolean).join(' · ');
      let h = '<tr class="' + cls + '" data-row="' + id + '">' +
        '<td class="gd-lead gd-c-sel"><label class="gd-ck"><input type="checkbox" data-act="sel" data-id="' + id + '" data-fk="sel-' + id + '" tabindex="' + tab + '"' + (sel ? ' checked' : '') + ' aria-label="Select ' + nm + '"></label></td>' +
        '<td class="gd-lead gd-c-chev"><button class="gd-chev" data-act="toggle" data-id="' + id + '" tabindex="-1" aria-expanded="' + open + '" aria-label="' + (open ? 'Hide' : 'Show') + ' evidence for ' + nm + '">' + CHEV + '</button></td>' +
        '<td class="gd-lead gd-c-idx is-r">' + v.idx + '</td>' +
        '<td class="gd-lead gd-c-co"><div class="gd-co"><button class="gd-name" data-act="toggle" data-id="' + id + '" data-fk="row-' + id + '" tabindex="' + tab + '" aria-expanded="' + open + '" title="' + nm + (open ? ' · Enter to hide evidence' : ' · Enter to show evidence') + '">' + nm + '</button><span class="gd-co-d">' + esc(desc) + '</span></div></td>';
      if (!v.r) {
        const p = v.prog;
        const wait = p === 'Waiting for batch' || p === 'In batch job' || p === 'Validation queued';
        const st = p ? '<span class="gd-step ' + (wait ? 'is-wait' : '') + '">' + esc(p) + '</span>' : '<span class="gd-queued">' + (run.status === 'stopped' ? 'Not started' : 'Queued') + '</span>';
        h += '<td colspan="' + cols.length + '">' + st + '</td></tr>';
      } else {
        const age = run.landed[id] ? t - run.landed[id] : 9999;
        const land = age < 240 ? ' class="gd-land" style="animation-delay:-' + age + 'ms"' : '';
        h += cols.map((col) => cellHtml(run, v, col, land)).join('') + '</tr>';
      }
      if (open) h += '<tr class="gd-evrow" data-ev="' + id + '"><td colspan="' + (cols.length + 4) + '">' + evHtml(run, v) + '</td></tr>';
      return h;
    }

    function totalsHtml(run, ids, cols) {
      const vs = ids.map((id) => rowView(run, id)).filter((v) => v.r);
      const n = vs.length;
      const sum = (fn) => vs.reduce((s, v) => s + fn(v), 0);
      const deep = vs.filter((v) => v.verdict === 'deep tech').length;
      const flagged = vs.filter((v) => v.flagged).length;
      const open = vs.filter((v) => v.open).length;
      const lead = '<span class="gd-sig">Σ</span>' + (ids.length === run.ids.length ? run.ids.length + ' companies' : ids.length + ' of ' + run.ids.length + ' shown') + (n < ids.length ? ' · ' + n + ' done' : '');
      const cell = (col) => {
        if (!n && col.k !== 'sector' && col.k !== 'uen') return '<th></th>';
        const cls = col.al ? ' class="' + col.al + '"' : '';
        switch (col.k) {
          case 'verdict': return '<th title="Deep tech · general tech"><b>' + deep + '</b> deep · <b>' + (n - deep) + '</b> gen</th>';
          case 'conf': return '<th class="is-r">avg <b>' + Math.round(sum((v) => v.r.conf) / n) + '</b></th>';
          case 'crit': return '<th class="is-c" title="Companies meeting each criterion">' + CRIT.map((x) => vs.filter((v) => v.c.criteria[x[0]].met).length).join(' · ') + '</th>';
          case 'risk': return '<th><b>' + flagged + '</b> flagged</th>';
          case 'action': return '<th>' + (open ? '<b>' + open + '</b> to review · ' : 'none to review · ') + (flagged - open) + ' reviewed</th>';
          case 'patents': return '<th class="is-r"><b>' + sum((v) => v.r.patents.count) + '</b></th>';
          case 'cost': return '<th class="is-r">' + (vs.some((v) => v.r.cost == null) ? 'unknown' : '<b>' + money(sum((v) => v.r.cost)) + '</b>') + '</th>';
          case 'sector': return '<th>' + new Set(ids.map((id) => C_BY_ID[id].domain)).size + ' sectors</th>';
          case 'uen': return '<th>' + ids.length + ' UENs</th>';
          case 'basis': return '<th>' + vs.filter((v) => v.r.basis !== 'DESCRIPTION_ONLY').length + ' used web</th>';
          case 'val': return '<th>' + vs.filter((v) => v.r.validated).length + ' validated</th>';
          case 'plevel': return '<th>' + vs.filter((v) => /Strong/.test(v.r.patents.level)).length + ' strong or better</th>';
          case 'time': return '<th' + cls + '><b>' + (sum((v) => v.r.timeS) / 60).toFixed(1) + '</b> min</th>';
          default: return '<th></th>';
        }
      };
      return '<tr class="gd-tot"><th colspan="4" class="gd-lead gd-c-sel gd-tot-lead">' + lead + '</th>' + cols.map(cell).join('') + '</tr>';
    }

    function headHtml(run, cols, L) {
      const sortBtn = (k, label, al, name, title) => {
        const active = S.sortKey === k && run.status !== 'running';
        const ar = active ? (S.sortDir > 0 ? '▲' : '▼') : '';
        return '<button class="gd-th ' + (al || '') + '" data-act="sort" data-k="' + k + '" data-fk="sort-' + k + '" aria-label="Sort by ' + esc((name || label).toLowerCase()) + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + label + '<span class="gd-th-ar" aria-hidden="true">' + ar + '</span></button>';
      };
      const aria = (k) => S.sortKey === k && run.status !== 'running' ? (S.sortDir > 0 ? 'ascending' : 'descending') : 'none';
      const allSel = L.flat.length > 0 && L.flat.every((id) => S.selected.has(id));
      return '<tr><th class="gd-lead gd-c-sel"><label class="gd-ck"><input type="checkbox" data-act="sel-all" data-fk="sel-all"' + (allSel ? ' checked' : '') + ' aria-label="Select all visible rows"></label></th>' +
        '<th class="gd-lead gd-c-chev" aria-label="Evidence"></th>' +
        '<th class="gd-lead gd-c-idx" aria-sort="' + aria('idx') + '">' + sortBtn('idx', '#', 'is-r', 'input row') + '</th>' +
        '<th class="gd-lead gd-c-co" aria-sort="' + aria('name') + '">' + sortBtn('name', 'Company', '', 'company name') + '</th>' +
        cols.map((c) => '<th aria-sort="' + aria(c.k) + '">' + sortBtn(c.k, c.label, c.al, c.name, c.title) + '</th>').join('') + '</tr>';
    }

    function renderGrid() {
      const run = activeRun();
      const wrap = R('scroll');
      const st = wrap.scrollTop; const sl = wrap.scrollLeft;
      if (run.kind !== 'rows') { put(wrap, archiveHtml(run)); wrap.classList.remove('is-hscroll'); return; }
      const L = layout(run);
      if (L.flat.length && L.flat.indexOf(S.cursorId) < 0) S.cursorId = L.flat[0];
      const cols = visCols();
      const minW = LEAD_W + CO_MIN + cols.reduce((s, c) => s + c.w, 0);
      const ncol = cols.length + 4;
      const colgroup = '<colgroup><col style="width:34px"><col style="width:28px"><col style="width:34px"><col>' + cols.map((c) => '<col style="width:' + c.w + 'px">').join('') + '</colgroup>';
      const t = Date.now();
      let body = '';
      if (!L.all.length && !L.groups.some((g) => g.key === 'open')) {
        body = '<tr><td colspan="' + ncol + '" style="height:auto;padding:0;border:0"><div class="gd-empty"><h2>No companies match</h2><p>' + run.ids.length + ' companies in this run.</p><button class="gd-btn" data-act="clear-filters" data-fk="empty-clear">Clear filters</button></div></td></tr>';
      } else {
        L.groups.forEach((g) => {
          if (L.grouped) {
            const closed = S.collapsed.has(g.ck);
            const vs = g.ids.map((id) => rowView(run, id)).filter((v) => v.r);
            const deep = vs.filter((v) => v.verdict === 'deep tech').length;
            let meta = '';
            if (vs.length) meta = deep + ' deep · ' + (vs.length - deep) + ' general · avg conf ' + Math.round(vs.reduce((s, v) => s + v.r.conf, 0) / vs.length);
            if (g.key === 'open' && L.by === 'review' && !g.ids.length) meta = '<span class="gd-grp-done">✓ Every flagged company has a decision</span>';
            else if (g.key === 'open' && L.by === 'review') meta += ' · decide in the Action column, or press <kbd>N</kbd> to jump between them';
            body += '<tr class="gd-grp"><td colspan="' + ncol + '"><div class="gd-grp-in">' +
              '<button class="gd-grpbtn" data-act="grp" data-g="' + esc(g.ck) + '" data-fk="grp-' + esc(g.ck) + '" aria-expanded="' + !closed + '">' + CHEV + '<span class="gd-sw-dot" style="background:' + g.tone + '"></span>' + esc(g.label) + ' <span class="gd-grp-n">' + g.ids.length + '</span></button>' +
              '<span class="gd-grp-meta">' + meta + '</span></div></td></tr>';
            if (closed) return;
          }
          g.ids.forEach((id) => { body += rowHtml(run, rowView(run, id), cols, t); });
        });
      }
      const pad = '<div class="gd-pad"><span><kbd>J</kbd> <kbd>K</kbd> or <kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> show / hide evidence</span><span><kbd>N</kbd> next to review</span><span><kbd>X</kbd> select row</span><span><kbd>/</kbd> search</span><span><kbd>Esc</kbd> clear selection, then collapse</span></div>';
      put(wrap, '<table class="gd-table" style="min-width:' + minW + 'px" aria-label="Classification results">' + colgroup + '<thead>' + headHtml(run, cols, L) + totalsHtml(run, filterIds(run), cols) + '</thead><tbody>' + body + '</tbody></table>' + pad);
      wrap.scrollTop = st; wrap.scrollLeft = sl;
      const all = wrap.querySelector('[data-fk="sel-all"]');
      if (all) all.indeterminate = !all.checked && L.flat.some((id) => S.selected.has(id));
      syncHScroll();
    }

    /* ---------- inline evidence ---------- */
    function evHtml(run, v) {
      const c = v.c;
      if (!v.r) {
        return '<div class="gd-ev r-pending" role="region" aria-label="Progress for ' + esc(c.name) + '"><div class="gd-evgrid is-2"><div class="gd-evcol">' + pendingSteps(run, v) + '</div><div class="gd-evcol"><section class="gd-sec"><div class="gd-sec-h">From the input file</div><div class="gd-quote">' + (c.description ? esc(c.description) : '<span class="gd-muted">No description in the input file.</span>') + '</div></section></div></div></div>';
      }
      const r = v.r;
      return '<div class="gd-ev r-' + r.risk + '" role="region" aria-label="Evidence for ' + esc(c.name) + '"><div class="gd-evgrid">' +
        '<div class="gd-evcol">' + flagHtml(run, r) + decisionHtml(run, v) + '</div>' +
        '<div class="gd-evcol">' + buildHtml(run, r) + '</div>' +
        '<div class="gd-evcol">' + criteriaHtml(c) + '</div>' +
        '<div class="gd-evcol">' + readHtml(c, r) + patentsHtml(r) + '</div>' +
        '<div class="gd-evcol">' + validatorHtml(run, r) + '<section class="gd-sec"><div class="gd-sec-h">Run facts</div><dl class="gd-kv"><dt>UEN</dt><dd class="gd-mono">' + esc(c.uen) + '</dd><dt>Cost</dt><dd class="gd-num">' + (r.cost == null ? 'unknown' : money(r.cost, 3)) + '</dd><dt>Time</dt><dd class="gd-num">' + r.timeS.toFixed(1) + ' s</dd><dt>Model</dt><dd class="gd-mono">' + esc(run.model) + '</dd></dl></section></div>' +
        '</div></div>';
    }

    function pendingSteps(run, v) {
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
      return '<section class="gd-sec"><div class="gd-sec-h">' + (p ? 'In progress' : run.status === 'stopped' ? 'Not started' : 'Queued') + '<span>' + (batchOn(run.cfg) ? 'Batch mode' : 'One at a time') + '</span></div><ul class="gd-steps">' + list + '</ul>' +
        (run.status === 'stopped' ? '<p class="gd-hint">This company had not finished when the run stopped. Resume to classify it.</p>' : '') + '</section>';
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
        p = 'A second pass argued for ' + vLabel(flip(r.verdict)).toLowerCase() + ', with confidence ' + r.val.confidence + '. That is below the ' + run.cfg.overrideMinConfidence + ' needed to change the verdict, so the original verdict stands with reduced confidence.';
      } else {
        t = 'Escalate: needs a human decision';
        p = 'The validator found the evidence contradictory or insufficient and handed the call to a reviewer.';
      }
      const reason = r.val && r.val.escalationReason ? '<p><b>Reason:</b> ' + esc(r.val.escalationReason) + '</p>' : '';
      return '<section class="gd-sec"><div class="gd-sec-h">Why ' + (r.risk === 'Clear' ? 'it is clear' : 'it is flagged') + '</div><div class="gd-flag r-' + r.risk + '"><div class="gd-flag-t">' + t + '</div><p>' + p + '</p>' + reason + '</div></section>';
    }

    function decisionHtml(run, v) {
      if (!v.flagged) return '<section class="gd-sec"><div class="gd-sec-h">Decision</div><p class="gd-dim">None needed. The workbook records <b>' + v.action + '</b> from the verdict.</p></section>';
      const id = v.c.id;
      if (v.dec) {
        const same = v.dec.verdict === v.r.verdict;
        return '<section class="gd-sec"><div class="gd-sec-h">Reviewer decision<span>Recorded in the workbook</span></div><div class="gd-evdec"><div class="gd-evdec-s"><span><b>' + (same ? 'Confirmed ' : 'Changed to ') + vLabel(v.dec.verdict).toLowerCase() + '</b> · ' + v.action + '</span><button class="gd-btn gd-btn-xs" data-act="undo" data-id="' + id + '" data-fk="evundo-' + id + '">Undo</button></div>' +
          '<textarea data-note="' + id + '" data-fk="note-' + id + '" placeholder="Add a note for the record (optional)" aria-label="Reviewer note for ' + esc(v.c.name) + '">' + esc(v.dec.note) + '</textarea><p class="gd-hint">Edits to the note save as you type.</p></div></section>';
      }
      const note = S.notes[run.id + ':' + id] || '';
      return '<section class="gd-sec"><div class="gd-sec-h">Reviewer decision<span>Open</span></div><div class="gd-evdec">' +
        '<span class="gd-dim">Decide in the row above: <b>✓ Confirm</b> keeps ' + vLabel(v.r.verdict).toLowerCase() + ', <b>→ ' + vShort(flip(v.r.verdict)) + '</b> changes it.</span>' +
        '<textarea data-note="' + id + '" data-fk="note-' + id + '" placeholder="Note for the record (optional)" aria-label="Reviewer note for ' + esc(v.c.name) + '">' + esc(note) + '</textarea><p class="gd-hint">The note is saved with whichever decision you make.</p></div></section>';
    }

    function buildHtml(run, r) {
      const cfg = run.cfg;
      const th = cfg.validatorThreshold;
      let rows = '<tr><td>Classifier score<span class="gd-why">Agent 1 confidence in its verdict</span></td><td>' + r.llm + '</td></tr>';
      const patWhy = !cfg.epo ? 'Patent lookup was off for this run' : r.adj === 0 ? (r.patents.count ? 'Patents are not deep tech; no adjustment' : 'No patents found; no adjustment') : r.patents.level + ' portfolio, ' + plural(r.patents.count, 'patent') + ', max ±' + cfg.epoAdjustMax;
      rows += '<tr><td>Patent adjustment<span class="gd-why">' + esc(patWhy) + '</span></td><td>' + signed(r.adj) + '</td></tr>';
      if (r.capped && !r.validated) rows += '<tr><td>Low-evidence cap<span class="gd-why">No description and no patents</span></td><td>≤ ' + cfg.lowEvidenceCap + '</td></tr>';
      rows += '<tr><td>Before validation<span class="gd-why">' + (!cfg.validator ? 'Validation off for this run' : r.validated ? 'Below ' + th + ', so the validator ran' : r.pre < th ? 'Below ' + th + '; validator not triggered' : th + ' or more, so no validation needed') + '</span></td><td>' + r.pre + '</td></tr>';
      if (r.validated) {
        const how = r.val.verdict === 'confirm' ? 'Confirmed: takes the validator’s confidence'
          : r.override === 'applied' ? 'Override applied: verdict flipped'
            : r.override === 'blocked' ? 'Override blocked: at most 100 − ' + r.val.confidence
              : 'Insufficient evidence: can only go down';
        rows += '<tr><td>Validator<span class="gd-why">' + how + (r.capped ? '; low-evidence cap ' + cfg.lowEvidenceCap : '') + '</span></td><td>' + signed(r.conf - r.pre) + '</td></tr>';
      }
      rows += '<tr class="is-total"><td>Final confidence<span class="gd-why">' + confWord(r.conf) + '</span></td><td>' + r.conf + '</td></tr>';
      const track = '<div class="gd-track" aria-hidden="true"><span class="gd-track-l"></span><span class="gd-track-th" style="left:' + th + '%"></span>' +
        (r.pre !== r.conf ? '<span class="gd-track-pre" style="left:' + r.pre + '%"></span>' : '') + '<span class="gd-track-fin" style="left:' + r.conf + '%"></span></div>' +
        '<div class="gd-track-ax"><span>0</span><span>' + (r.pre !== r.conf ? '○ before · ● final · ' : '') + 'dashed: threshold ' + th + '</span><span>100</span></div>';
      return '<section class="gd-sec"><div class="gd-sec-h">How confidence was built</div><table class="gd-build"><tbody>' + rows + '</tbody></table>' + track + '</section>';
    }

    function criteriaHtml(c) {
      const met = CRIT.filter((x) => c.criteria[x[0]].met).length;
      return '<section class="gd-sec"><div class="gd-sec-h">Criteria<span class="gd-num">' + met + ' of 3 met</span></div>' + CRIT.map((x) => {
        const cr = c.criteria[x[0]];
        return '<div class="gd-crit"><span class="gd-mk ' + (cr.met ? 'is-y' : 'is-n') + '" aria-hidden="true">' + (cr.met ? '✓' : x[1]) + '</span><b>' + x[2] + ' · ' + (cr.met ? 'met' : 'not met') + '</b><p>' + esc(cr.reasoning) + '</p></div>';
      }).join('') + '<div class="gd-quote" style="margin-top:8px">' + esc(c.reasoning) + '<span class="gd-quote-src">Classifier reasoning</span></div></section>';
    }

    function readHtml(c, r) {
      let q = '';
      if (r.hasWeb) q += '<div class="gd-quote">' + esc(c.webDescription) + '<span class="gd-quote-src">Web · ' + esc(c.webSource) + '</span></div>';
      if (r.hasInputDesc) q += '<div class="gd-quote">' + esc(c.description) + '<span class="gd-quote-src">Input file</span></div>';
      if (!q) q = '<div class="gd-quote"><span class="gd-muted">No description in the input file' + (c.webStatus === 'not_found' ? ' and nothing reliable found on the web' : '') + '. The verdict rests on the company name' + (r.patents.count ? ' and patents' : '') + '.</span></div>';
      return '<section class="gd-sec"><div class="gd-sec-h">What it read<span>' + BASIS_LONG[r.basis] + '</span></div>' + q + '</section>';
    }

    function patentsHtml(r) {
      const p = r.patents;
      if (p.status === 'disabled') return '<section class="gd-sec"><div class="gd-sec-h">Patents (EPO)</div><p class="gd-muted">Patent lookup was off for this run.</p></section>';
      const cpc = p.cpc.map((x) => '<div class="gd-cpc"><code>' + esc(x.code) + '</code><span>' + esc(x.desc) + '</span></div>').join('');
      return '<section class="gd-sec"><div class="gd-sec-h">Patents (EPO)<span class="gd-num">' + p.count + ' found</span></div><dl class="gd-kv"><dt>Level</dt><dd>' + esc(p.level) + '</dd>' + (p.domain ? '<dt>Domain</dt><dd>' + esc(p.domain) + '</dd>' : '') + '<dt>Lookup</dt><dd>' + (p.status === 'success' ? 'Matched in EPO' : 'No matching applicant') + '</dd></dl>' + (cpc ? '<div style="margin-top:6px">' + cpc + '</div>' : '') + '</section>';
    }

    function validatorHtml(run, r) {
      if (!r.validated) {
        const why = !run.cfg.validator ? 'Validation was off for this run.' : 'Not run: confidence before validation was ' + r.pre + ', at or above the threshold of ' + run.cfg.validatorThreshold + ', or this company was not flagged for a second pass.';
        return '<section class="gd-sec"><div class="gd-sec-h">Validator (Agent 2)</div><p class="gd-muted">' + why + '</p></section>';
      }
      const V = { confirm: 'Confirmed the verdict', override: 'Argued for the other verdict', insufficient_evidence: 'Insufficient evidence' };
      const DEC = { AUTO_APPROVE: 'No escalation', ESCALATE_FOR_HUMAN_REVIEW: 'Escalated for human review' };
      const val = r.val;
      return '<section class="gd-sec"><div class="gd-sec-h">Validator (Agent 2)<span class="gd-num">confidence ' + val.confidence + '</span></div><dl class="gd-kv"><dt>Finding</dt><dd>' + V[val.verdict] + (r.override ? ' (override ' + r.override + ')' : '') + '</dd><dt>Decision</dt><dd>' + DEC[val.decision] + '</dd></dl>' +
        '<div class="gd-quote" style="margin-top:6px">' + esc(val.summary) + '</div>' +
        '<div class="gd-sec-h" style="margin-top:8px">Sources<span class="gd-num">' + val.sources.length + '</span></div><ul class="gd-srcs">' + val.sources.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ul></section>';
    }

    function archiveHtml(run) {
      const s = run.summary;
      const kv = '<div class="gd-arch-kv"><div><span>Processed</span><b>' + s.done + '</b> <small class="gd-muted">/ ' + s.total + '</small></div><div><span>Deep tech</span><b style="color:var(--deep)">' + s.deep + '</b></div><div><span>General tech</span><b>' + s.general + '</b></div><div><span>Needs review</span><b style="color:var(--escalate)">' + s.review + '</b></div></div>';
      if (run.status === 'complete') {
        return '<div class="gd-arch"><h2>Results are in the workbook</h2><p>' + (run.resumed ? 'This run was resumed and finished today.' : 'This run finished on ' + esc(run.dateLabel) + '.') + ' Its rows were not kept in this workspace, so the Management View and Full Detail sheets are the record. Download the workbook to review its ' + plural(s.review, 'flagged company', 'flagged companies') + '.</p>' + kv +
          '<div class="gd-arch-bar is-complete"><span style="transform:scaleX(1)"></span></div><p class="gd-num">' + s.total + ' of ' + s.total + ' classified' + (s.errors ? ' · ' + s.errors + ' ended in an error and will be retried on a re-run' : '') + (s.cost != null ? ' · ' + money(s.cost) : '') + '</p>' +
          '<div class="gd-arch-acts"><button class="gd-btn" data-act="download" data-fk="arch-download">Download Excel</button><button class="gd-btn gd-btn-ghost" data-act="new-run" data-fk="arch-new">New run…</button></div></div>';
      }
      const running = run.status === 'running';
      return '<div class="gd-arch"><h2>' + (running ? 'Resuming ' : 'Interrupted at company ') + '<span class="gd-num">' + s.done + ' of ' + s.total + '</span></h2>' +
        '<p>Progress is checkpointed after every company. Resume continues at company ' + (s.done + 1) + ' with <span class="gd-mono">' + esc(run.model) + '</span>, the model this run started with, and retries any company that ended in an error. It needs the same input file, <b>' + esc(run.file) + '</b>, with its rows in the same order.</p>' + kv +
        '<div class="gd-arch-bar ' + (running ? 'is-running' : '') + '"><span style="transform:scaleX(' + (s.done / s.total).toFixed(3) + ')"></span></div>' +
        '<p class="gd-num">' + (running ? esc(run.phase) : (s.total - s.done) + ' companies left · about ' + fmtDur((s.total - s.done) * D.estSecondsPerCompany.sequential).slice(1) + ' at the usual pace') + '</p>' +
        '<div class="gd-arch-acts">' + (running ? '<button class="gd-btn gd-btn-stop" data-act="stop" data-fk="arch-stop">■ Stop</button>' : '<button class="gd-btn gd-btn-primary" data-act="resume" data-fk="arch-resume">Resume run</button>') +
        '<button class="gd-btn" data-act="download" data-fk="arch-download">Download partial Excel</button></div></div>';
    }

    function renderAll() {
      renderTop(); renderRunline(); renderTools(); renderBulk(); renderGrid();
    }

    /* ---------- horizontal scroll + evidence width ---------- */
    const scrollEl = R('scroll');
    function syncHScroll() {
      const on = scrollEl.scrollLeft > 0;
      if (scrollEl.classList.contains('is-hscroll') !== on) scrollEl.classList.toggle('is-hscroll', on);
    }
    const setVw = () => { const w = scrollEl.clientWidth; if (w) root.style.setProperty('--gd-vw', w + 'px'); };
    let ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(setVw); ro.observe(scrollEl); } else window.addEventListener('resize', setVw);

    /* ---------- cursor, expansion, selection ---------- */
    function focusRow(id) {
      const tr = scrollEl.querySelector('tr[data-row="' + id + '"]');
      if (!tr) return;
      if (tr.scrollIntoView) tr.scrollIntoView({ block: 'nearest' });
      const b = tr.querySelector('[data-fk="row-' + id + '"]');
      if (b) b.focus({ preventScroll: true });
    }
    function setCursor(id, focus) {
      S.cursorId = id;
      renderGrid();
      if (focus) focusRow(id);
    }
    function move(delta) {
      const run = activeRun(); if (run.kind !== 'rows') return;
      const flat = layout(run).flat; if (!flat.length) return;
      const i = flat.indexOf(S.cursorId);
      const next = i < 0 ? flat[delta > 0 ? 0 : flat.length - 1] : flat[clamp(i + delta, 0, flat.length - 1)];
      setCursor(next, true);
    }
    function toggleRow(id, focus) {
      if (S.expanded.has(id)) S.expanded.delete(id); else S.expanded.add(id);
      S.cursorId = id;
      renderTools(); renderGrid();
      if (focus) focusRow(id);
    }
    function nextFlagged() {
      const run = activeRun(); if (run.kind !== 'rows') return;
      const L = layout(run);
      const open = L.all.filter((id) => rowView(run, id).open);
      if (!open.length) {
        const anyOpen = run.ids.some((id) => rowView(run, id).open);
        toast(anyOpen ? 'No unreviewed companies in this view' : 'Nothing left to review', anyOpen ? 'Clear filters to see the rest.' : 'Every flagged company has a decision.');
        return;
      }
      const i = L.all.indexOf(S.cursorId);
      const after = L.all.slice(i + 1).concat(L.all.slice(0, i + 1));
      const next = after.find((id) => rowView(run, id).open) || open[0];
      // Open a collapsed group that hides the target.
      L.groups.forEach((g) => { if (g.ids.indexOf(next) >= 0) S.collapsed.delete(g.ck); });
      setCursor(next, true);
    }
    function toggleSelect(id, shift) {
      const run = activeRun();
      if (shift && S.anchorId && S.anchorId !== id) {
        const flat = layout(run).flat;
        const a = flat.indexOf(S.anchorId); const b = flat.indexOf(id);
        if (a >= 0 && b >= 0) {
          const on = !S.selected.has(id) || S.selected.has(S.anchorId);
          flat.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((x) => { if (on) S.selected.add(x); else S.selected.delete(x); });
        }
      } else if (S.selected.has(id)) S.selected.delete(id); else S.selected.add(id);
      S.anchorId = id;
      S.cursorId = id;
      renderBulk(); renderGrid();
    }

    /* ---------- decisions ---------- */
    function decide(ids, choice, opts) {
      const run = activeRun();
      const o = opts || {};
      const before = layout(run).flat;
      const done = [];
      ids.forEach((id) => {
        const v = rowView(run, id);
        if (!v.r || !v.open) return;
        const key = run.id + ':' + id;
        const verdict = choice === 'confirm' ? v.r.verdict : flip(v.r.verdict);
        run.decisions[id] = { choice, verdict, note: (S.notes[key] || '').trim() };
        delete S.notes[key];
        done.push(id);
      });
      if (!done.length) return;
      const hadFocusInGrid = scrollEl.contains(document.activeElement) || o.keyboard;
      // In the review grouping a decided row leaves the queue: hand the cursor (and, when only
      // that row was open, the evidence) to the next company that still needs review.
      if (done.indexOf(S.cursorId) >= 0 && S.groupBy === 'review' && !o.bulk) {
        const i = before.indexOf(S.cursorId);
        const nextOpen = before.slice(i + 1).concat(before.slice(0, Math.max(0, i))).find((id) => rowView(run, id).open);
        if (nextOpen) {
          if (S.expanded.size === 1 && S.expanded.has(S.cursorId)) { S.expanded.delete(S.cursorId); S.expanded.add(nextOpen); }
          S.cursorId = nextOpen;
        }
      }
      if (o.bulk) S.selected.clear();
      renderAll();
      if (hadFocusInGrid && S.cursorId) focusRow(S.cursorId);
      const runId = run.id;
      if (done.length === 1) {
        const v = rowView(run, done[0]);
        toast((choice === 'confirm' ? 'Confirmed ' : 'Changed ') + v.c.name, (choice === 'confirm' ? 'Kept as ' : 'Now ') + vLabel(v.verdict).toLowerCase() + ' · ' + v.action + (v.dec.note ? ' · note saved' : ''), { label: 'Undo', fn: () => undo(runId, done) });
      } else {
        toast('Confirmed ' + done.length + ' companies', 'Each keeps its pipeline verdict · recorded as reviewed', { label: 'Undo', fn: () => undo(runId, done) });
      }
    }
    function undo(runId, ids) {
      const run = runById(runId); if (!run) return;
      let n = 0;
      ids.forEach((id) => {
        const d = run.decisions[id];
        if (!d) return;
        delete run.decisions[id];
        if (d.note) S.notes[run.id + ':' + id] = d.note;
        n++;
      });
      if (!n) return;
      if (run.id === S.activeId && ids.length === 1) S.cursorId = ids[0];
      renderAll();
      if (run.id === S.activeId && ids.length === 1) focusRow(ids[0]);
      toast(n === 1 ? 'Decision undone' : n + ' decisions undone', 'Back in Needs review');
    }

    /* ---------- runs ---------- */
    function resetView() {
      S.expanded = new Set(); S.selected = new Set(); S.collapsed = new Set(); S.anchorId = null;
      S.f = { verdict: null, flagged: false, q: '' };
      root.querySelector('[data-fk="search"]').value = '';
      S.sortKey = 'priority'; S.sortDir = 1;
    }
    function openRun(id) {
      closePop(false);
      if (S.activeId === id) return;
      S.activeId = id;
      resetView();
      const run = activeRun();
      S.cursorId = null;
      if (run.kind === 'rows') {
        const L = layout(run);
        S.cursorId = L.flat.find((x) => rowView(run, x).open) || L.flat[0] || null;
      }
      scrollEl.scrollTop = 0; scrollEl.scrollLeft = 0;
      renderAll();
    }

    /* ---------- popovers ---------- */
    function openPop(which) {
      S.pop = which; S.popEnter = true;
      if (which === 'runs') renderTop(); else renderTools();
      const first = root.querySelector('[data-pop="' + which + '"] button[aria-current="true"], [data-pop="' + which + '"] input:not(:disabled), [data-pop="' + which + '"] button');
      if (first) first.focus();
    }
    function closePop(refocus) {
      if (!S.pop) return;
      const which = S.pop;
      S.pop = null;
      if (which === 'runs') renderTop(); else renderTools();
      if (refocus) { const b = root.querySelector('[data-fk="' + (which === 'runs' ? 'pop-runs' : 'pop-cols') + '"]'); if (b) b.focus(); }
    }

    /* ---------- toasts ---------- */
    const toastActs = new Map();
    let toastSeq = 0;
    function toast(title, body, action) {
      const host = R('toasts');
      const el = document.createElement('div');
      const tid = 't' + (++toastSeq);
      el.className = 'gd-toast';
      el.setAttribute('data-tid', tid);
      el.innerHTML = '<div><b>' + esc(title) + '</b>' + (body ? '<span>' + esc(body) + '</span>' : '') + '</div>' + (action ? '<button class="gd-toast-btn" data-act="toast-act" data-t="' + tid + '">' + esc(action.label) + '</button>' : '');
      if (action) toastActs.set(tid, action.fn);
      host.appendChild(el);
      while (host.children.length > 3) { const f = host.firstChild; toastActs.delete(f.getAttribute('data-tid')); host.removeChild(f); }
      later(() => {
        if (!el.isConnected) return;
        el.classList.add('is-leaving');
        later(() => { el.remove(); toastActs.delete(tid); }, 170);
      }, action ? 6000 : 3400);
    }

    function workbookName(run, suffix) {
      const base = run.file.replace(/\.(xlsx|xls|csv)$/i, '');
      return base + (suffix || '') + '_classified_' + run.id.replace(/^run_/, '') + '.xlsx';
    }
    function download() {
      const run = activeRun();
      const name = workbookName(run);
      if (run.kind === 'rows') {
        const k = counts(run);
        const partial = k.done < k.total;
        const decs = Object.keys(run.decisions).length;
        toast((partial ? 'Saved partial workbook ' : 'Saved ') + name, (partial ? k.done + ' of ' + k.total + ' companies · ' : '') + 'Overview, Management View, Full Detail, Legend' + (decs ? ' · ' + plural(decs, 'reviewer decision') : ''));
      } else {
        const s = run.summary;
        toast((s.done < s.total ? 'Saved partial workbook ' : 'Saved ') + name, s.done + ' of ' + s.total + ' companies · Overview, Management View, Full Detail, Legend');
      }
    }
    function downloadSelected() {
      const run = activeRun();
      const ids = [...S.selected];
      const decs = ids.filter((id) => run.decisions[id]).length;
      toast('Saved ' + workbookName(run, '_selected'), plural(ids.length, 'company', 'companies') + ' in input order · Management View, Full Detail' + (decs ? ' · ' + plural(decs, 'reviewer decision') : ''));
    }

    /* ---------- drawer (new run; ported from Workbench) ---------- */
    function openDrawer(fromRun) {
      if (S.drawer) return;
      closePop(false);
      const draft = fromRun && fromRun.cfg ? JSON.parse(JSON.stringify(fromRun.cfg)) : defaultCfg();
      draft.file = fromRun && fromRun.kind === 'rows' ? { name: D.file.name, rows: D.file.rows, note: '' } : null;
      S.drawer = { draft, returnFocus: document.activeElement, over: false };
      const ov = R('overlay');
      ov.innerHTML = '<div class="gd-scrim" data-act="close-drawer"></div>' +
        '<section class="gd-drawer" role="dialog" aria-modal="true" aria-labelledby="gd-dr-t">' +
        '<div class="gd-dr-head"><div class="gd-dr-title"><h2 id="gd-dr-t">' + (fromRun ? 'New run with the same settings' : 'New run') + '</h2><button class="gd-btn gd-btn-ghost gd-btn-sm" data-act="close-drawer" aria-label="Close" data-fk="dr-close">Close <kbd>Esc</kbd></button></div><div data-r="dr-est"></div></div>' +
        '<div class="gd-dr-body" data-r="dr-body"></div></section>';
      renderDrawer();
      const first = ov.querySelector(draft.file ? '[data-fk="start"]' : '[data-fk="use-sample"]');
      if (first && !first.disabled) first.focus(); else ov.querySelector('[data-fk="dr-close"]').focus();
    }
    let drawerCloseTimer = null;
    function closeDrawer() {
      if (!S.drawer) return;
      const ret = S.drawer.returnFocus;
      S.drawer = null;
      const ov = R('overlay');
      ov.querySelectorAll('.gd-scrim, .gd-drawer').forEach((n) => n.classList.add('is-leaving'));
      cancel(drawerCloseTimer);
      drawerCloseTimer = later(() => { if (!S.drawer) ov.innerHTML = ''; }, 170);
      if (ret && root.contains(ret) && ret.focus) ret.focus(); else { const nb = root.querySelector('[data-fk="new-run"]'); if (nb) nb.focus(); }
    }

    function startProblems(d) {
      if (!d.file) return 'Choose an input file to start';
      if (!d.mapping.company_name) return 'Map the company name column to start';
      const p = provById(d.provider);
      if (!p.keySet) return p.keyVar + ' is not set in .env';
      return '';
    }

    function renderDrawerEst() {
      const d = S.drawer.draft;
      const e = estimate(d);
      const prob = startProblems(d);
      const tot = e.parts.classify + e.parts.enrich + e.parts.validate || 1;
      const seg = (v, col) => '<span style="width:' + (v / tot * 100).toFixed(1) + '%;background:' + col + '"></span>';
      const per = e.rows ? '' : ' per 20 companies';
      const ref = e.rows ? e : estimate(Object.assign({}, d, { file: { rows: D.file.rows } }));
      const html = '<div class="gd-est">' +
        '<div><div class="gd-est-l">Est. cost' + per + '</div><div class="gd-est-v">' + (e.known ? money(ref.cost) : 'unknown') + '</div></div>' +
        '<div><div class="gd-est-l">Duration</div><div class="gd-est-v">' + fmtDur(ref.secs) + '</div></div>' +
        '<div class="gd-est-split">' + (e.known ? '<div class="gd-est-bar" aria-hidden="true">' + seg(e.parts.classify, 'var(--accent)') + seg(e.parts.enrich, 'var(--deep)') + seg(e.parts.validate, 'var(--contested)') + '</div>' +
          '<div class="gd-est-lg"><span><i class="gd-swatch" style="background:var(--accent)"></i>Classify ' + Math.round(e.parts.classify / tot * 100) + '%</span><span><i class="gd-swatch" style="background:var(--deep)"></i>Enrich ' + Math.round(e.parts.enrich / tot * 100) + '%</span><span><i class="gd-swatch" style="background:var(--contested)"></i>Validate ' + Math.round(e.parts.validate / tot * 100) + '%</span></div>' : '<div class="gd-est-lg">Pinned model is not priced in pipeline/models.py; token totals will be reported instead.</div>') + '</div>' +
        '<button class="gd-btn gd-btn-primary" data-act="start" data-fk="start" ' + (prob ? 'disabled' : '') + '>Start run</button>' +
        (prob ? '<div class="gd-est-why">' + esc(prob) + '</div>' : '') +
        '<div class="gd-est-note">' + esc(modelFor(d)) + ' · ' + (e.batch ? 'batch mode halves classifier cost; a real batch job can take up to an hour' : 'one company at a time') + ' · web searches are usually the largest part of the bill</div>' +
        '</div>';
      put(R('dr-est'), html);
    }

    function renderDrawerBody() {
      const d = S.drawer.draft;
      const f = D.file;
      let h = '<fieldset class="gd-fs"><legend>Input file</legend>';
      if (!d.file) {
        h += '<div class="gd-drop ' + (S.drawer.over ? 'is-over' : '') + '" data-dropzone><b>Drop an .xlsx, .xls or .csv file here</b>One row per company. Column headers are matched case-insensitively.<br><button class="gd-btn" data-act="use-sample" data-fk="use-sample">Use sample file · ' + esc(f.name) + '</button></div>';
      } else {
        h += '<div class="gd-file"><div><div class="gd-file-n">' + esc(d.file.name) + '</div><div class="gd-file-m gd-num">' + f.rows + ' rows · ' + f.skipped + ' skipped (empty name) · ' + f.headers.length + ' columns</div></div><button class="gd-btn gd-btn-sm" data-act="clear-file" data-fk="clear-file">Change file</button></div>';
        if (d.file.note) h += '<div class="gd-hint">' + esc(d.file.note) + '</div>';
        const used = {};
        FIELDS.forEach((fl) => { const col = d.mapping[fl.key]; if (col) used[col] = (used[col] || 0) + 1; });
        h += '<div class="gd-map">' + FIELDS.map((fl) => {
          const cur = d.mapping[fl.key] || '';
          const auto = cur && cur === f.mapping[fl.key];
          const opts = (fl.required ? '<option value="">Choose a column</option>' : '<option value="">Not mapped</option>') + f.headers.map((hd) => '<option value="' + esc(hd) + '"' + (hd === cur ? ' selected' : '') + '>' + esc(hd) + '</option>').join('');
          const tag = !cur ? (fl.required ? '<span class="gd-tag is-req">Required</span>' : '<span class="gd-tag">Skipped</span>') : auto ? '<span class="gd-tag is-auto">Detected</span>' : used[cur] > 1 ? '<span class="gd-tag is-req">Used twice</span>' : '<span class="gd-tag">Changed</span>';
          return '<label for="gd-map-' + fl.key + '">' + fl.label + '</label><select id="gd-map-' + fl.key + '" data-map="' + fl.key + '" data-fk="map-' + fl.key + '">' + opts + '</select>' + tag;
        }).join('') + '</div>';
        if (!d.mapping.description) h += '<div class="gd-warn">' + (d.enrichment ? 'No description column: classification will rely on web enrichment.' : 'No description and enrichment is off: companies without patents are capped at ' + d.lowEvidenceCap + ' confidence.') + '</div>';
        const extra = f.headers.filter((hd) => !Object.values(d.mapping).includes(hd));
        h += '<table class="gd-prev"><thead><tr>' + FIELDS.map((fl) => '<th>' + fl.label + '</th>').join('') + '</tr></thead><tbody>' + f.preview.map((row) => '<tr>' + FIELDS.map((fl) => {
          const col = d.mapping[fl.key];
          return col ? '<td title="' + esc(row[col] || '') + '">' + esc(row[col] != null ? row[col] : '') + '</td>' : '<td class="is-none">not mapped</td>';
        }).join('') + '</tr>').join('') + '</tbody></table>';
        h += '<div class="gd-hint">First ' + f.preview.length + ' of ' + f.rows + ' rows. Carried through to the output unchanged: ' + esc(extra.join(', ') || 'none') + '.</div>';
      }
      h += '</fieldset>';
      const prov = provById(d.provider);
      h += '<fieldset class="gd-fs"><legend>Model</legend><div class="gd-provs" role="radiogroup" aria-label="Provider">' + D.providers.map((p) =>
        '<label class="gd-opt"><input type="radio" name="gd-prov" value="' + p.id + '" data-fk="prov-' + p.id + '"' + (p.id === d.provider ? ' checked' : '') + '><span class="gd-opt-t">' + esc(p.label) + '</span><span class="gd-opt-s ' + (p.keySet ? 'is-ok' : 'is-miss') + '">' + (p.keySet ? 'Key set' : p.keyVar + ' missing') + '</span></label>').join('') + '</div>';
      if (!prov.keySet) h += '<div class="gd-warn">Add ' + prov.keyVar + ' to .env and reopen this panel to use ' + prov.label + '.</div>';
      h += '<div class="gd-tiers" role="radiogroup" aria-label="Tier">' + ['fast', 'balanced', 'best'].map((t) =>
        '<label class="gd-opt"><input type="radio" name="gd-tier" value="' + t + '" data-fk="tier-' + t + '"' + (t === d.tier ? ' checked' : '') + '><span class="gd-opt-t">' + t[0].toUpperCase() + t.slice(1) + ' · ' + esc(prov.tiers[t]) + '</span><span class="gd-opt-s gd-num">~' + money(D.estCostPerCompany[t], 2) + ' per company</span></label>').join('') + '</div>';
      h += '<div class="gd-row2"><label for="gd-pin">Pin exact model</label><input id="gd-pin" class="gd-input gd-mono" data-field="model" data-fk="pin" placeholder="' + esc(MODEL_IDS[d.provider][d.tier]) + ' (from tier)" value="' + esc(d.model) + '" autocomplete="off" spellcheck="false"></div>';
      h += '<div class="gd-hint">Leave empty to use the tier. Pin a model for audits or runs you will compare over time.' + (d.model && !KNOWN_MODELS.has(d.model.trim()) ? ' This model is not listed in pipeline/models.py: it runs with the original request settings and its cost shows as unknown.' : '') + '</div></fieldset>';
      const tg = (key, title, sub, disabled) => '<label class="gd-tg ' + (disabled ? 'is-disabled' : '') + '"><span class="gd-tg-t">' + title + '</span><span class="gd-tg-s">' + sub + '</span><input type="checkbox" class="gd-switch" data-toggle="' + key + '" data-fk="tg-' + key + '"' + (d[key] && !disabled ? ' checked' : '') + (disabled ? ' disabled' : '') + '></label>';
      h += '<fieldset class="gd-fs"><legend>Steps</legend>' +
        tg('enrichment', 'Web enrichment', 'Search the web for a current description before classifying') +
        tg('epo', 'Patent lookup', 'EPO patent data adjusts confidence by up to ±' + d.epoAdjustMax + (D.epoKeysSet ? ' · EPO keys set' : ' · EPO keys missing; the run continues without patents')) +
        tg('validator', 'Validation', 'A second pass searches the web when confidence is below ' + d.validatorThreshold + ', then confirms, overrides or escalates') +
        tg('batch', 'Batch mode', prov.batch ? 'Classify all companies in one batch job: about half the classifier cost, but results can take an hour or more' : 'Only Anthropic supports batch jobs; ' + prov.label + ' processes companies one at a time', !prov.batch) +
        '</fieldset>';
      h += '<fieldset class="gd-fs"><legend>Thresholds</legend><div class="gd-th-grid">' + THRESHOLDS.map((t) => {
        const off = t.needs && !d[t.needs];
        return '<label class="gd-thf ' + (off ? 'is-off' : '') + '"><span>' + t.label + '</span><input type="number" class="gd-input" min="' + t.min + '" max="' + t.max + '" data-num="' + t.key + '" data-fk="num-' + t.key + '" value="' + d[t.key] + '"' + (off ? ' disabled' : '') + '><small>' + t.help + (off ? ' (step is off)' : '') + '</small></label>';
      }).join('') + '</div><div class="gd-fs-foot"><button class="gd-btn gd-btn-ghost gd-btn-sm" data-act="reset-th" data-fk="reset-th">Reset thresholds to defaults</button></div></fieldset>';
      put(R('dr-body'), h);
    }
    function renderDrawer() { if (!S.drawer) return; renderDrawerEst(); renderDrawerBody(); }

    function loadSample(note) {
      if (!S.drawer) return;
      S.drawer.draft.file = { name: D.file.name, rows: D.file.rows, note: note || '' };
      S.drawer.draft.mapping = Object.assign({}, D.file.mapping);
      renderDrawer();
      const n = R('dr-body').querySelector('[data-fk="map-company_name"]');
      if (n) n.focus();
    }

    function startRun() {
      const d = S.drawer && S.drawer.draft;
      if (!d || startProblems(d)) return;
      const cfg = JSON.parse(JSON.stringify(d));
      delete cfg.file;
      cfg.model = (cfg.model || '').trim();
      const t = new Date();
      let id = 'run_' + stamp(t);
      if (runById(id)) id += pad(t.getSeconds());
      while (runById(id)) id += 'b';
      const run = makeRowsRun({
        id, file: d.file.name, rows: d.file.rows, dateLabel: 'Today, ' + pad(t.getHours()) + ':' + pad(t.getMinutes()),
        status: 'running', cfg, model: modelFor(cfg), ids: D.companies.map((c) => c.id), fresh: true,
      });
      S.runs.unshift(run);
      S.drawer.returnFocus = null;
      closeDrawer();
      S.activeId = run.id;
      resetView();
      S.cursorId = run.ids[0];
      scrollEl.scrollTop = 0; scrollEl.scrollLeft = 0;
      startEngine(run);
      renderAll();
      const stop = R('top').querySelector('[data-fk="stop"]');
      if (stop) stop.focus();
    }

    /* ---------- events ---------- */
    function onClick(e) {
      const tgt = e.target;
      if (S.pop && !tgt.closest('[data-pop]') && !tgt.closest('[data-act="pop-runs"], [data-act="pop-cols"]')) closePop(false);
      const a = tgt.closest('[data-act]');
      const tr = tgt.closest('tr[data-row]');
      if (!a && tr && !tgt.closest('label, input, textarea, select')) { toggleRow(tr.getAttribute('data-row'), false); return; }
      if (!a || !root.contains(a)) return;
      const act = a.getAttribute('data-act');
      const run = activeRun();
      const id = a.getAttribute('data-id');
      switch (act) {
        case 'toggle': toggleRow(id, true); break;
        case 'sel': toggleSelect(id, e.shiftKey); { const n = scrollEl.querySelector('[data-fk="sel-' + id + '"]'); if (n) n.focus({ preventScroll: true }); } break;
        case 'sel-all': {
          const flat = layout(run).flat;
          const all = flat.length && flat.every((x) => S.selected.has(x));
          flat.forEach((x) => { if (all) S.selected.delete(x); else S.selected.add(x); });
          renderBulk(); renderGrid(); break;
        }
        case 'sel-clear': S.selected.clear(); renderBulk(); renderGrid(); focusRow(S.cursorId); break;
        case 'confirm': decide([id], 'confirm'); break;
        case 'change': decide([id], 'change'); break;
        case 'undo': undo(run.id, [id]); break;
        case 'bulk-confirm': decide([...S.selected], 'confirm', { bulk: true }); break;
        case 'bulk-download': downloadSelected(); break;
        case 'grp': {
          const g = a.getAttribute('data-g');
          if (S.collapsed.has(g)) S.collapsed.delete(g); else S.collapsed.add(g);
          renderGrid(); break;
        }
        case 'expand-flagged': {
          const L = layout(run);
          run.ids.forEach((x) => { if (rowView(run, x).flagged) S.expanded.add(x); });
          L.groups.forEach((g) => { if (g.ids.some((x) => rowView(run, x).flagged)) S.collapsed.delete(g.ck); });
          renderTools(); renderGrid(); break;
        }
        case 'collapse-all': S.expanded.clear(); renderTools(); renderGrid(); { const b = R('colall'); if (b && b.disabled) focusRow(S.cursorId); } break;
        case 'pop-runs': if (S.pop === 'runs') closePop(true); else { closePop(false); openPop('runs'); } break;
        case 'pop-cols': if (S.pop === 'cols') closePop(true); else { closePop(false); openPop('cols'); } break;
        case 'reset-cols': S.cols = new Set(DEFAULT_COLS); renderTools(); renderGrid(); break;
        case 'new-run': openDrawer(null); break;
        case 'rerun': openDrawer(run); break;
        case 'close-drawer': closeDrawer(); break;
        case 'open-run': { openRun(id); const b = root.querySelector('[data-fk="pop-runs"]'); if (b) b.focus(); break; }
        case 'stop': if (run.status === 'running') stopRun(run); break;
        case 'resume':
          if (run.status === 'stopped' || run.status === 'interrupted') {
            startEngine(run);
            toast('Resuming ' + run.file, 'Continuing with ' + run.model + ', the model this run started with.');
            renderAll();
            const s = root.querySelector('[data-fk="stop"]'); if (s) s.focus();
          }
          break;
        case 'download': download(); break;
        case 'sort': {
          if (run.status === 'running') { toast('Input order while running', 'Sorting and grouping apply when the run finishes or is stopped.'); break; }
          const k = a.getAttribute('data-k');
          if (S.sortKey === k) S.sortDir = -S.sortDir;
          else { S.sortKey = k; S.sortDir = (k === 'cost' || k === 'patents' || k === 'time') ? -1 : 1; }
          renderTools(); renderGrid(); break;
        }
        case 'sort-priority': S.sortKey = 'priority'; S.sortDir = 1; renderTools(); renderGrid(); break;
        case 'stat': {
          const k = a.getAttribute('data-k');
          if (k === 'review') S.f.flagged = !S.f.flagged;
          else { const v = k === 'deep' ? 'deep tech' : 'general tech'; S.f.verdict = S.f.verdict === v ? null : v; }
          refreshFilters(); break;
        }
        case 'clear-filters':
          S.f = { verdict: null, flagged: false, q: '' };
          root.querySelector('[data-fk="search"]').value = '';
          refreshFilters(); break;
        case 'toast-act': {
          const tid = a.getAttribute('data-t');
          const fn = toastActs.get(tid);
          toastActs.delete(tid);
          const el = a.closest('.gd-toast'); if (el) el.remove();
          if (fn) fn();
          break;
        }
        case 'use-sample': loadSample(''); break;
        case 'clear-file': S.drawer.draft.file = null; renderDrawer(); { const u = root.querySelector('[data-fk="use-sample"]'); if (u) u.focus(); } break;
        case 'reset-th': {
          const df = D.defaults;
          THRESHOLDS.forEach((t) => { S.drawer.draft[t.key] = df[t.key]; });
          renderDrawer(); break;
        }
        case 'start': startRun(); break;
        default: break;
      }
    }

    function refreshFilters() { renderTools(); renderBulk(); renderGrid(); }

    function onInput(e) {
      const t = e.target;
      if (t.getAttribute('data-fk') === 'search') { S.f.q = t.value; refreshFilters(); return; }
      if (t.hasAttribute('data-note')) {
        const run = activeRun(); const id = t.getAttribute('data-note');
        if (run.decisions[id]) run.decisions[id].note = t.value;
        else S.notes[run.id + ':' + id] = t.value;
        return;
      }
      if (!S.drawer) return;
      const d = S.drawer.draft;
      if (t.hasAttribute('data-num')) {
        const k = t.getAttribute('data-num');
        const meta = THRESHOLDS.find((x) => x.key === k);
        if (t.value === '' || isNaN(+t.value)) return;
        d[k] = clamp(Math.round(+t.value), meta.min, meta.max);
        renderDrawerEst();
      } else if (t.getAttribute('data-field') === 'model') {
        d.model = t.value;
        renderDrawerEst();
      }
    }

    function onChange(e) {
      const t = e.target;
      if (t.getAttribute('data-fk') === 'group') {
        S.groupBy = t.value; S.collapsed.clear();
        renderGrid(); return;
      }
      if (t.hasAttribute('data-col')) {
        const k = t.getAttribute('data-col');
        if (t.checked) S.cols.add(k); else S.cols.delete(k);
        renderTools(); renderGrid(); return;
      }
      if (t.hasAttribute('data-note')) {
        // Persist a trimmed note on blur for decided rows.
        const run = activeRun(); const id = t.getAttribute('data-note');
        // No re-render here: it would replace the control the user is clicking on.
        if (run.decisions[id]) run.decisions[id].note = t.value.trim();
        return;
      }
      if (!S.drawer) return;
      const d = S.drawer.draft;
      if (t.name === 'gd-prov') d.provider = t.value;
      else if (t.name === 'gd-tier') d.tier = t.value;
      else if (t.hasAttribute('data-map')) d.mapping[t.getAttribute('data-map')] = t.value;
      else if (t.hasAttribute('data-toggle')) d[t.getAttribute('data-toggle')] = t.checked;
      else if (t.hasAttribute('data-num')) {
        const k = t.getAttribute('data-num'); const meta = THRESHOLDS.find((x) => x.key === k);
        d[k] = t.value === '' || isNaN(+t.value) ? D.defaults[k] : clamp(Math.round(+t.value), meta.min, meta.max);
      } else if (t.getAttribute('data-field') === 'model') d.model = t.value;
      else return;
      renderDrawer();
    }

    /* Root-level keys: drawer focus trap, search field shortcuts, Escape inside popovers. */
    function onRootKey(e) {
      const t = e.target;
      if (S.drawer && R('overlay').contains(t)) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDrawer(); return; }
        if (e.key === 'Tab') {
          const dr = R('overlay').querySelector('.gd-drawer');
          const f = [...dr.querySelectorAll('button, input, select, textarea')].filter((n) => !n.disabled && n.offsetParent !== null);
          if (!f.length) return;
          const first = f[0]; const last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
        return;
      }
      if (S.pop && e.key === 'Escape' && t.closest && t.closest('[data-pop]')) { e.preventDefault(); closePop(true); return; }
      if (t.getAttribute && t.getAttribute('data-fk') === 'search') {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (t.value) { t.value = ''; S.f.q = ''; refreshFilters(); } else t.blur();
        } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
          e.preventDefault();
          const flat = layout(activeRun()).flat;
          if (flat.length) setCursor(flat[0], true);
        }
        return;
      }
      if (t.hasAttribute && t.hasAttribute('data-note') && e.key === 'Escape') { e.preventDefault(); focusRow(t.getAttribute('data-note')); }
    }

    function onDocKey(e) {
      const t = e.target;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!root.isConnected) return;
      if (S.drawer) { if (e.key === 'Escape') { e.preventDefault(); closeDrawer(); } return; }
      const k = e.key;
      if (k === 'Escape') {
        if (S.pop) { e.preventDefault(); closePop(true); return; }
        if (S.selected.size) { e.preventDefault(); S.selected.clear(); renderBulk(); renderGrid(); focusRow(S.cursorId); return; }
        if (S.cursorId && S.expanded.has(S.cursorId)) { e.preventDefault(); toggleRow(S.cursorId, true); }
        return;
      }
      if (S.pop) return;
      const run = activeRun();
      if (k === '/') { if (run.kind === 'rows') { e.preventDefault(); root.querySelector('[data-fk="search"]').focus(); } return; }
      if (run.kind !== 'rows') return;
      const onControl = t && t.closest && t.closest('button, a, label, summary');
      if (k === 'j' || k === 'J' || k === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (k === 'k' || k === 'K' || k === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (k === 'n' || k === 'N') { e.preventDefault(); nextFlagged(); }
      else if (k === 'x' || k === 'X') { if (S.cursorId) { e.preventDefault(); toggleSelect(S.cursorId, e.shiftKey); focusRow(S.cursorId); } }
      else if ((k === 'Enter' || k === ' ') && !onControl) { if (S.cursorId) { e.preventDefault(); toggleRow(S.cursorId, true); } }
    }

    function onScroll() { syncHScroll(); }

    function onDragOver(e) {
      e.preventDefault();
      const z = e.target.closest && e.target.closest('[data-dropzone]');
      if (e.dataTransfer) e.dataTransfer.dropEffect = z ? 'copy' : 'none';
      if (z && S.drawer && !S.drawer.over) { S.drawer.over = true; z.classList.add('is-over'); }
    }
    function onDragLeave(e) {
      const z = e.target.closest && e.target.closest('[data-dropzone]');
      if (z && S.drawer && !z.contains(e.relatedTarget)) { S.drawer.over = false; z.classList.remove('is-over'); }
    }
    function onDrop(e) {
      e.preventDefault();
      const z = e.target.closest && e.target.closest('[data-dropzone]');
      if (!z || !S.drawer) return;
      S.drawer.over = false;
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      loadSample(f ? 'Files are not read in this prototype; ' + f.name + ' was swapped for the sample file.' : '');
    }

    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('keydown', onRootKey);
    root.addEventListener('dragover', onDragOver);
    root.addEventListener('dragleave', onDragLeave);
    root.addEventListener('drop', onDrop);
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('keydown', onDocKey);

    /* ---------- first paint: completed sample run, first company to review open ---------- */
    {
      const L = layout(initialRun);
      const first = L.flat.find((id) => rowView(initialRun, id).open) || L.flat[0];
      S.cursorId = first;
      if (first) S.expanded.add(first);
    }
    setVw();
    renderAll();

    return function cleanup() {
      Object.keys(engines).forEach((id) => { cancel(engines[id].timer); delete engines[id]; });
      timeouts.forEach((t) => clearTimeout(t)); timeouts.clear();
      rafs.forEach((r) => cancelAnimationFrame(r)); rafs.clear();
      toastActs.clear();
      if (ro) ro.disconnect(); else window.removeEventListener('resize', setVw);
      document.removeEventListener('keydown', onDocKey);
      scrollEl.removeEventListener('scroll', onScroll);
      root.removeEventListener('click', onClick);
      root.removeEventListener('input', onInput);
      root.removeEventListener('change', onChange);
      root.removeEventListener('keydown', onRootKey);
      root.removeEventListener('dragover', onDragOver);
      root.removeEventListener('dragleave', onDragLeave);
      root.removeEventListener('drop', onDrop);
    };
  }

  window.PROTO_VARIANTS = window.PROTO_VARIANTS || {};
  window.PROTO_VARIANTS.grid = { css, render, init };
})();
