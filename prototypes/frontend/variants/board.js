/* Board variant: the outcome is a place. Three columns (Deep tech, Needs review,
   General tech); where a card sits is its status, and moving a card is the
   reviewer's decision. Evidence opens in a wide bottom sheet over the board so
   the board stays in view. The New-run drawer, scoring (derive), estimate, run
   engine and toasts are ported from the Workbench variant, so the comparison
   stays about the results screen. */
(function () {
  'use strict';

  const css = `
.v-board { position: relative; display: flex; flex-direction: column; height: 100%; overflow: hidden; background: var(--bg); color: var(--text); font: 13px/1.4 var(--font); }
.v-board .bd-num { font-variant-numeric: tabular-nums; }
.v-board .bd-mono { font-family: var(--mono); font-size: 12px; }
.v-board .bd-muted { color: var(--text-3); }
.v-board .bd-dimtext { color: var(--text-2); }
.v-board :focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.v-board h1, .v-board h2, .v-board h3, .v-board p { margin: 0; }
.v-board kbd { font: 10.5px/1 var(--mono); padding: 2px 4px; border: 1px solid var(--border-strong); border-bottom-width: 2px; border-radius: 4px; background: var(--surface); color: var(--text-2); }

/* Buttons */
.v-board .bd-btn { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 11px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); background: var(--surface); color: var(--text); font-weight: 500; font-size: 13px; cursor: pointer; white-space: nowrap; transition: transform 120ms var(--ease-out); }
.v-board .bd-btn:hover { background: var(--surface-2); }
.v-board .bd-btn:active { transform: scale(0.97); }
.v-board .bd-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; background: var(--surface); }
.v-board .bd-btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.v-board .bd-btn-primary:hover { background: var(--accent); filter: brightness(1.08); }
.v-board .bd-btn-primary:disabled { background: var(--accent); filter: none; }
.v-board .bd-btn-ghost { border-color: transparent; background: transparent; color: var(--text-2); }
.v-board .bd-btn-ghost:hover { background: var(--surface-2); color: var(--text); }
.v-board .bd-btn-sm { height: 26px; padding: 0 8px; font-size: 12px; }
.v-board .bd-btn-stop { color: var(--error); }

/* Top bar */
.v-board .bd-top { flex: none; position: relative; z-index: 30; display: flex; align-items: center; gap: 10px; height: 54px; padding: 0 14px; background: var(--surface); border-bottom: 1px solid var(--border); }
.v-board .bd-brand { font-size: 12px; font-weight: 650; color: var(--text-2); white-space: nowrap; }
@media (max-width: 1359px) { .v-board .bd-brand { display: none; } }
.v-board .bd-runwrap { position: relative; flex: 0 1 270px; min-width: 150px; }
.v-board .bd-runbtn { display: flex; align-items: center; gap: 8px; width: 100%; height: 38px; padding: 0 8px 0 10px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); background: var(--surface); color: var(--text); text-align: left; cursor: pointer; transition: transform 120ms var(--ease-out); }
.v-board .bd-runbtn:hover { background: var(--surface-2); }
.v-board .bd-runbtn:active { transform: scale(0.98); }
.v-board .bd-runbtn[aria-expanded="true"] { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
.v-board .bd-runbtn-x { flex: 1; min-width: 0; }
.v-board .bd-runbtn-t { display: block; font-weight: 600; font-size: 12.5px; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v-board .bd-runbtn-s { display: block; font-size: 11px; color: var(--text-2); line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v-board .bd-caret { flex: none; color: var(--text-3); font-size: 10px; }
.v-board .bd-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-3); flex: none; }
.v-board .bd-dot.is-running { background: var(--accent); animation: board-pulse 1s ease-in-out infinite alternate; }
.v-board .bd-dot.is-stopped { background: var(--escalate); }
.v-board .bd-dot.is-complete { background: var(--deep); }
.v-board .bd-menu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 2; width: 330px; max-height: min(460px, calc(100vh - 140px)); overflow-y: auto; padding: 6px; background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--radius-m); box-shadow: var(--shadow-2); transform-origin: top left; animation: board-pop 160ms var(--ease-out) both; }
.v-board .bd-menu-h { font-size: 10.5px; font-weight: 650; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; padding: 8px 8px 4px; }
.v-board .bd-menu-i { display: block; width: 100%; text-align: left; border: 0; background: transparent; color: var(--text); border-radius: var(--radius-s); padding: 7px 8px; cursor: pointer; }
.v-board .bd-menu-i:hover { background: var(--surface-2); }
.v-board .bd-menu-i[aria-current="true"] { background: var(--accent-soft); }
.v-board .bd-menu-f { display: block; font-weight: 600; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v-board .bd-menu-m { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-2); margin-top: 1px; }
.v-board .bd-menu-d { display: block; font-size: 11px; color: var(--text-3); }
.v-board .bd-minibar { display: block; height: 3px; border-radius: 2px; background: var(--border); margin-top: 5px; overflow: hidden; }
.v-board .bd-minibar > span { display: block; height: 100%; background: var(--accent); transform-origin: left center; }
.v-board .bd-minibar.is-stopped > span { background: var(--escalate); }
.v-board .bd-menu-foot { border-top: 1px solid var(--border); margin-top: 6px; padding: 6px 2px 0; display: flex; gap: 6px; }
.v-board .bd-keyline { font-size: 11px; color: var(--text-3); padding: 6px 8px 2px; display: flex; flex-wrap: wrap; gap: 2px 10px; }
.v-board .bd-keyok { color: var(--deep); }
.v-board .bd-keymiss { color: var(--escalate); }
.v-board .bd-stats { display: flex; align-items: center; flex: none; }
.v-board .bd-stat { padding: 0 11px; border-left: 1px solid var(--border); white-space: nowrap; }
.v-board .bd-stat-l { display: block; font-size: 10.5px; font-weight: 600; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.04em; line-height: 1.2; }
.v-board .bd-stat-v { display: block; font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.3; }
.v-board .bd-stat-v small { font-size: 11.5px; font-weight: 500; color: var(--text-3); }
@media (max-width: 1119px) { .v-board .bd-stat.is-opt { display: none; } }
.v-board .bd-hist { flex: none; padding-left: 11px; border-left: 1px solid var(--border); }
.v-board .bd-hist-bars { position: relative; display: flex; align-items: flex-end; gap: 2px; width: 110px; height: 26px; }
.v-board .bd-bin { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; padding: 0; border: 0; border-radius: 2px; background: transparent; cursor: pointer; }
.v-board .bd-bin:hover { background: var(--surface-2); }
.v-board .bd-bin[aria-pressed="true"] { background: var(--accent-soft); box-shadow: inset 0 -2px 0 var(--accent); }
.v-board .bd-bin:disabled { cursor: default; background: transparent; }
.v-board .bd-bin-g { display: block; background: var(--border-strong); border-radius: 1px 1px 0 0; }
.v-board .bd-bin-d { display: block; background: var(--deep); }
.v-board .bd-hist-th { position: absolute; top: -2px; bottom: 0; width: 0; border-left: 1px dashed var(--escalate); pointer-events: none; }
.v-board .bd-hist-ax { display: flex; justify-content: space-between; width: 110px; font-size: 9.5px; color: var(--text-3); line-height: 1.1; margin-top: 2px; font-variant-numeric: tabular-nums; }
.v-board .bd-top-sp { flex: 1 1 0; min-width: 0; }
.v-board .bd-search { position: relative; flex: 0 1 220px; min-width: 130px; }
.v-board .bd-search[hidden] { display: none; }
.v-board .bd-search input { width: 100%; height: 30px; padding: 0 26px 0 9px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); background: var(--surface); font-size: 13px; }
.v-board .bd-search input:focus-visible { outline-offset: 0; }
.v-board .bd-search kbd { position: absolute; right: 7px; top: 7px; pointer-events: none; }
.v-board .bd-search input:not(:placeholder-shown) + kbd { display: none; }

/* Processing strip */
.v-board .bd-strip { flex: none; position: relative; z-index: 2; display: flex; align-items: center; gap: 12px; min-height: 42px; padding: 6px 14px; background: var(--surface); border-bottom: 1px solid var(--border); }
.v-board .bd-strip[hidden] { display: none; }
.v-board .bd-strip-st { display: flex; align-items: center; gap: 7px; white-space: nowrap; font-size: 12.5px; }
.v-board .bd-prog { flex: none; width: 120px; height: 4px; border-radius: 2px; background: var(--border); overflow: hidden; }
.v-board .bd-prog > span { display: block; height: 100%; background: var(--accent); transform-origin: left center; transition: transform 200ms var(--ease-out); }
.v-board .bd-prog.is-stopped > span { background: var(--escalate); }
.v-board .bd-lane { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; overflow: hidden; }
.v-board .bd-chip { flex: none; display: inline-flex; align-items: center; gap: 6px; height: 26px; max-width: 250px; padding: 0 9px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface-2); font-size: 12px; white-space: nowrap; }
.v-board .bd-chip-n { overflow: hidden; text-overflow: ellipsis; font-weight: 550; }
.v-board .bd-chip-s { color: var(--text-3); flex: none; }
.v-board .bd-chip.is-now { border-color: var(--accent); background: var(--accent-soft); }
.v-board .bd-chip.is-now .bd-chip-s { color: var(--accent); }
.v-board .bd-chip.is-now::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); flex: none; animation: board-pulse 0.8s ease-in-out infinite alternate; }
.v-board .bd-chip.is-queued { background: transparent; color: var(--text-2); border-style: dashed; }
.v-board .bd-lane-more { font-size: 12px; color: var(--text-3); white-space: nowrap; flex: none; }
.v-board .bd-strip-phase { flex: 0 1 320px; min-width: 0; font-size: 12px; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v-board .bd-strip-msg { flex: 1; min-width: 0; font-size: 12.5px; }
@media (max-width: 1199px) { .v-board .bd-strip-phase { display: none; } }

/* Board */
.v-board .bd-board { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1fr); gap: 12px; padding: 12px 12px 0; }
.v-board .bd-col { position: relative; display: flex; flex-direction: column; min-height: 0; min-width: 0; background: var(--surface-2); border: 1px solid var(--border); border-bottom: 0; border-radius: var(--radius-l) var(--radius-l) 0 0; }
.v-board .bd-col.is-review { background: var(--surface); border-color: var(--border-strong); box-shadow: var(--shadow-1); }
.v-board .bd-col::before { content: ""; position: absolute; inset: 0; border-radius: inherit; background: var(--accent-soft); opacity: 0; pointer-events: none; transition: opacity 120ms var(--ease-out); }
.v-board .bd-col::after { content: ""; position: absolute; inset: -1px -1px 0; border-radius: inherit; border: 2px dashed var(--accent); border-bottom: 0; opacity: 0; pointer-events: none; transition: opacity 120ms var(--ease-out); z-index: 3; }
.v-board .bd-col.is-droppable::after { opacity: 0.4; }
.v-board .bd-col.is-over::after { opacity: 1; border-style: solid; }
.v-board .bd-col.is-over::before { opacity: 0.6; }
.v-board .bd-col-h, .v-board .bd-col-b { position: relative; z-index: 1; }
.v-board .bd-col-h { flex: none; padding: 10px 12px 9px; border-bottom: 1px solid var(--border); }
.v-board .bd-col-top { display: flex; align-items: center; gap: 8px; }
.v-board .bd-col-h h2 { font-size: 13.5px; font-weight: 650; display: flex; align-items: center; gap: 7px; white-space: nowrap; }
.v-board .bd-col-h h2::before { content: ""; width: 8px; height: 8px; border-radius: 50%; flex: none; }
.v-board .is-deep .bd-col-h h2::before { background: var(--deep); }
.v-board .is-general .bd-col-h h2::before { box-shadow: inset 0 0 0 1.5px var(--general); }
.v-board .is-review .bd-col-h h2::before { background: var(--escalate); }
.v-board .bd-col-n { margin-left: auto; font-size: 22px; font-weight: 650; line-height: 1; font-variant-numeric: tabular-nums; }
.v-board .is-deep .bd-col-n { color: var(--deep); }
.v-board .bd-col-n.is-open { color: var(--escalate); }
.v-board .bd-col-sub { display: flex; gap: 10px; margin-top: 4px; font-size: 11.5px; color: var(--text-2); white-space: nowrap; overflow: hidden; }
.v-board .bd-col-sub > span { flex: none; display: inline-flex; align-items: center; gap: 4px; }
.v-board .bd-col-match { color: var(--accent); font-weight: 600; }
.v-board .bd-col-foot { display: flex; align-items: center; gap: 8px; margin-top: 4px; font-size: 11px; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-height: 15px; }
.v-board .bd-pile { flex: 0 0 80px; height: 4px; border-radius: 2px; background: var(--border); overflow: hidden; }
.v-board .bd-pile > span { display: block; height: 100%; background: var(--deep); transform-origin: left center; transition: transform 220ms var(--ease-out); }
.v-board .bd-sw { display: inline-block; width: 7px; height: 7px; border-radius: 2px; flex: none; }
.v-board .bd-sw.r-Escalate { background: var(--escalate); }
.v-board .bd-sw.r-Contested { background: var(--contested); }
.v-board .bd-sw.r-Uncertain { background: var(--uncertain); }
.v-board .bd-col-b { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 5px; padding: 8px 8px 96px; }
.v-board .bd-col.is-review .bd-col-b { gap: 8px; padding: 10px 10px 96px; }
.v-board .bd-col-b > * { flex: none; }
.v-board .bd-grp { display: flex; justify-content: space-between; gap: 8px; padding: 6px 4px 1px; font-size: 10.5px; font-weight: 650; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; }
.v-board .bd-grp:first-child { padding-top: 0; }

/* Cards */
.v-board .bd-card { position: relative; border: 1px solid var(--border); border-radius: var(--radius-m); background: var(--surface); box-shadow: var(--shadow-1); touch-action: pan-y; user-select: none; -webkit-user-select: none; transition: opacity 150ms var(--ease-out); }
.v-board .bd-card:hover { border-color: var(--border-strong); }
.v-board .bd-card.is-recent { background: var(--accent-soft); }
.v-board .bd-card.is-open { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent), var(--shadow-1); }
.v-board .bd-card.is-dim { opacity: 0.28; }
.v-board .bd-card.is-lifted { opacity: 0.35; box-shadow: none; border-style: dashed; background: transparent; }
.v-board .bd-card.is-flying { opacity: 0; transition: none; }
.v-board .bd-card.is-arrive { animation: board-arrive 160ms var(--ease-out) both; }
.v-board .bd-card-main { display: block; width: 100%; padding: 7px 10px 7px 13px; border: 0; border-radius: inherit; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.v-board .bd-card-main:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.v-board .bd-grip { position: absolute; left: 3px; top: 8px; bottom: 8px; width: 6px; opacity: 0; background-image: radial-gradient(circle, var(--text-3) 1px, transparent 1.3px); background-size: 3px 4px; touch-action: none; cursor: grab; z-index: 1; transition: opacity 120ms var(--ease-out); }
.v-board .bd-card:hover .bd-grip { opacity: 1; }
.v-board .bd-r { display: flex; align-items: center; gap: 8px; min-width: 0; }
.v-board .bd-r + .bd-r { margin-top: 2px; }
.v-board .bd-name { flex: 1 1 auto; min-width: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v-board .bd-sector { flex: 1 1 auto; min-width: 0; font-size: 12px; color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v-board .bd-rev { flex: none; font-size: 10.5px; font-weight: 600; color: var(--accent); background: var(--accent-soft); border-radius: 3px; padding: 0 5px; line-height: 16px; }
.v-board .bd-card.is-recent .bd-rev { background: var(--surface); }
.v-board .bd-ovr { flex: none; font-size: 10.5px; color: var(--text-2); border: 1px solid var(--border-strong); border-radius: 3px; padding: 0 4px; line-height: 14px; }
@media (max-width: 1259px) { .v-board .bd-ovr { display: none; } }
.v-board .bd-conf { flex: none; display: inline-flex; align-items: center; gap: 6px; }
.v-board .bd-conf-t { width: 30px; height: 4px; border-radius: 2px; background: var(--general-soft); overflow: hidden; }
.v-board .bd-conf-t > span { display: block; height: 100%; background: var(--text-3); transform-origin: left center; }
.v-board .bd-conf-t.is-low > span { background: var(--contested); }
.v-board .bd-conf-n { width: 20px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; font-size: 12.5px; }
.v-board .bd-mks { flex: none; display: inline-flex; gap: 2px; }
.v-board .bd-mk { width: 14px; height: 14px; border-radius: 3px; display: inline-flex; align-items: center; justify-content: center; font-size: 9.5px; font-weight: 700; line-height: 1; }
.v-board .bd-mk.is-y { background: var(--deep-soft); color: var(--deep); }
.v-board .bd-mk.is-n { background: transparent; color: var(--text-3); box-shadow: inset 0 0 0 1px var(--border-strong); }
.v-board .bd-pat { flex: none; min-width: 38px; text-align: right; font-size: 11.5px; color: var(--text-2); font-variant-numeric: tabular-nums; }
.v-board .bd-pat.is-none { color: var(--text-3); }
.v-board .bd-risk { flex: none; display: inline-block; font-size: 11px; font-weight: 600; padding: 0 6px; line-height: 17px; border-radius: 4px; white-space: nowrap; }
.v-board .bd-risk.r-Clear { color: var(--text-3); font-weight: 500; padding-left: 0; }
.v-board .bd-risk.r-Uncertain { background: var(--uncertain-soft); color: var(--uncertain); }
.v-board .bd-risk.r-Contested { background: var(--contested-soft); color: var(--contested); }
.v-board .bd-risk.r-Escalate { background: var(--escalate-soft); color: var(--escalate); }
.v-board .bd-risk.r-Pulled { background: var(--accent-soft); color: var(--accent); }
.v-board .bd-card.is-rich { overflow: hidden; }
.v-board .bd-card.is-rich .bd-card-main { padding: 10px 12px 8px 14px; }
.v-board .bd-card.is-rich .bd-name { font-size: 14px; }
.v-board .bd-card.is-rich .bd-grip { left: 5px; }
.v-board .bd-reason { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-top: 6px; font-size: 12.5px; line-height: 1.38; color: var(--text); }
.v-board .bd-lean { position: absolute; top: 0; bottom: 0; width: 3px; pointer-events: none; }
.v-board .lean-deep .bd-lean { left: 0; background: var(--deep); }
.v-board .lean-general .bd-lean { right: 0; background: var(--general); }
.v-board .bd-acts { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 0 12px 10px 14px; }
.v-board .bd-mv { display: flex; align-items: center; gap: 6px; min-width: 0; height: 30px; padding: 0 8px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); background: var(--surface); color: var(--text); font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: transform 120ms var(--ease-out); }
.v-board .bd-mv:hover { background: var(--surface-2); }
.v-board .bd-mv:active { transform: scale(0.97); }
.v-board .bd-mv.to-general { justify-content: flex-end; }
.v-board .bd-mv-l { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.v-board .bd-mv-tag { flex: none; font-size: 10.5px; font-weight: 500; color: var(--text-3); }
.v-board .bd-mv-ar { flex: none; color: var(--text-3); font-size: 11px; }
.v-board .bd-mv kbd { flex: none; }
.v-board .bd-mv.to-deep kbd { margin-left: auto; }
.v-board .bd-mv.to-general kbd { margin-right: auto; }
.v-board .bd-mv.is-lean.to-deep { border-color: var(--deep); box-shadow: inset 3px 0 0 var(--deep); }
.v-board .bd-mv.is-lean.to-general { border-color: var(--general); box-shadow: inset -3px 0 0 var(--general); }
.v-board .bd-mv.is-lean .bd-mv-tag { color: var(--text-2); }
@media (max-width: 1139px) { .v-board .bd-mv-tag { display: none; } }
.v-board .bd-empty { padding: 22px 16px; text-align: center; color: var(--text-2); font-size: 12.5px; border: 1.5px dashed var(--border-strong); border-radius: var(--radius-m); }
.v-board .bd-empty b { display: block; color: var(--text); font-size: 13.5px; margin-bottom: 3px; }
.v-board .bd-empty .bd-btn { margin-top: 10px; }
.v-board .bd-keys { margin-top: 6px; padding: 9px 10px; border-radius: var(--radius-m); background: var(--surface-2); font-size: 11.5px; color: var(--text-2); }
.v-board .bd-keys-h { font-size: 10.5px; font-weight: 650; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 5px; }
.v-board .bd-keys dl { display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 4px 8px; margin: 0; align-items: center; }
.v-board .bd-keys dt { white-space: nowrap; }
.v-board .bd-keys dd { margin: 0; min-width: 0; }
@media (max-width: 1259px) { .v-board .bd-keys dl { grid-template-columns: auto 1fr; } }

/* Past runs without rows */
.v-board .bd-arch-out { padding: 28px 12px; text-align: center; color: var(--text-2); font-size: 12.5px; }
.v-board .bd-arch-out b { display: block; font-size: 30px; font-weight: 650; color: var(--text); line-height: 1.1; margin-bottom: 4px; font-variant-numeric: tabular-nums; }
.v-board .bd-arch-out span { display: block; }
.v-board .bd-arch { padding: 8px 6px; }
.v-board .bd-arch h3 { font-size: 14px; font-weight: 650; margin-bottom: 6px; }
.v-board .bd-arch p { color: var(--text-2); margin-bottom: 10px; font-size: 12.5px; }
.v-board .bd-arch-bar { height: 6px; border-radius: 3px; background: var(--border); overflow: hidden; margin: 12px 0 6px; }
.v-board .bd-arch-bar > span { display: block; height: 100%; background: var(--escalate); transform-origin: left center; transition: transform 200ms var(--ease-out); }
.v-board .bd-arch-bar.is-running > span { background: var(--accent); }
.v-board .bd-arch-bar.is-complete > span { background: var(--deep); }
.v-board .bd-arch-acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }

/* Evidence sheet */
.v-board .bd-sheet { position: absolute; left: 12px; right: 12px; bottom: 0; top: max(36%, 250px); z-index: 25; display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--border-strong); border-bottom: 0; border-radius: var(--radius-l) var(--radius-l) 0 0; box-shadow: 0 -12px 36px rgba(0,0,0,.12), 0 -2px 6px rgba(0,0,0,.05); transform-origin: bottom center; animation: board-sheet-in 220ms var(--ease-out) both; }
.v-board .bd-sheet:focus { outline: none; }
.v-board .bd-sheet:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.v-board .bd-sheet.is-leaving { animation: board-sheet-out 160ms var(--ease-out) both; pointer-events: none; }
.v-board .bd-sh-h { flex: none; display: flex; align-items: center; gap: 14px; padding: 10px 14px 10px 16px; border-bottom: 1px solid var(--border); }
.v-board .bd-sh-nav { display: flex; gap: 4px; flex: none; }
.v-board .bd-sh-t { flex: 1; min-width: 0; }
.v-board .bd-sh-pos { font-size: 11px; font-weight: 600; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.v-board .bd-sh-t h2 { font-size: 17px; font-weight: 650; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.v-board .bd-sh-sub { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 12px; color: var(--text-2); }
.v-board .bd-sh-v { flex: none; text-align: right; }
.v-board .bd-sh-v .bd-verdict { font-size: 14px; font-weight: 650; }
.v-board .bd-sh-v > div { font-size: 12px; color: var(--text-2); margin-top: 2px; }
.v-board .bd-sh-conf { flex: none; text-align: right; font-variant-numeric: tabular-nums; padding-left: 14px; border-left: 1px solid var(--border); }
.v-board .bd-sh-conf b { display: block; font-size: 24px; font-weight: 650; line-height: 1; }
.v-board .bd-sh-conf span { display: block; font-size: 11px; color: var(--text-2); margin-top: 2px; white-space: nowrap; }
.v-board .bd-sh-acts { display: flex; gap: 6px; flex: none; }
@media (max-width: 1199px) { .v-board .bd-sh-v { display: none; } }
.v-board .bd-sh-b { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 16px 92px; }
.v-board .bd-sh-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 0 26px; }
.v-board .bd-sh-c { min-width: 0; }
.v-board .bd-verdict { display: inline-flex; align-items: center; gap: 6px; font-weight: 500; }
.v-board .bd-verdict::before { content: ""; width: 7px; height: 7px; border-radius: 50%; }
.v-board .bd-verdict.is-deep { color: var(--deep); }
.v-board .bd-verdict.is-deep::before { background: var(--deep); }
.v-board .bd-verdict.is-gen { color: var(--text-2); }
.v-board .bd-verdict.is-gen::before { box-shadow: inset 0 0 0 1.5px var(--general); }
.v-board .bd-sec { margin-top: 14px; }
.v-board .bd-sec-h { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: 11px; font-weight: 650; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
.v-board .bd-sec-h span { text-transform: none; letter-spacing: 0; font-weight: 500; }
.v-board .bd-flag { padding: 10px 12px; border-radius: var(--radius-m); background: var(--surface-2); border-left: 3px solid var(--border-strong); }
.v-board .bd-flag.r-Uncertain { background: var(--uncertain-soft); border-left-color: var(--uncertain); }
.v-board .bd-flag.r-Contested { background: var(--contested-soft); border-left-color: var(--contested); }
.v-board .bd-flag.r-Escalate { background: var(--escalate-soft); border-left-color: var(--escalate); }
.v-board .bd-flag-t { font-weight: 650; margin-bottom: 2px; }
.v-board .bd-flag p + p { margin-top: 5px; }
.v-board .bd-place { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
.v-board .bd-place-b { display: flex; align-items: center; gap: 6px; min-width: 0; height: 46px; padding: 0 9px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); background: var(--surface); color: var(--text); text-align: left; cursor: pointer; transition: transform 120ms var(--ease-out); }
.v-board .bd-place-b:hover { background: var(--surface-2); }
.v-board .bd-place-b:active { transform: scale(0.97); }
.v-board .bd-place-b[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent); }
.v-board .bd-place-x { flex: 1; min-width: 0; }
.v-board .bd-place-b b { display: block; font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.v-board .bd-place-b small { display: block; font-size: 11px; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.v-board .bd-place-b.to-general { text-align: right; }
.v-board .bd-place-ar { flex: none; color: var(--text-3); font-size: 11px; }
.v-board .bd-place-st { margin-top: 8px; font-size: 12.5px; color: var(--text-2); }
.v-board .bd-place-st b { color: var(--text); font-weight: 600; }
.v-board .bd-note-l { display: flex; justify-content: space-between; margin-top: 10px; font-size: 12px; font-weight: 600; }
.v-board .bd-note-l span { font-weight: 400; color: var(--text-3); }
.v-board .bd-sheet textarea { display: block; width: 100%; margin-top: 4px; min-height: 56px; resize: vertical; padding: 6px 8px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); background: var(--surface); font-size: 12.5px; }
.v-board .bd-hint { font-size: 11.5px; color: var(--text-3); margin-top: 4px; }
.v-board .bd-build { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.v-board .bd-build td { padding: 3px 0; border-bottom: 1px dashed var(--border); vertical-align: top; }
.v-board .bd-build td:last-child { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; padding-left: 10px; }
.v-board .bd-build tr.is-total td { border-bottom: 0; border-top: 1px solid var(--border-strong); font-weight: 650; padding-top: 5px; }
.v-board .bd-why { display: block; font-size: 11.5px; color: var(--text-3); font-weight: 400; }
.v-board .bd-track { position: relative; height: 18px; margin: 8px 0 2px; }
.v-board .bd-track-l { position: absolute; left: 0; right: 0; top: 8px; height: 2px; background: var(--border); }
.v-board .bd-track-th { position: absolute; top: 2px; height: 14px; border-left: 1px dashed var(--escalate); }
.v-board .bd-track-pre { position: absolute; top: 5px; width: 8px; height: 8px; margin-left: -4px; border-radius: 50%; background: var(--surface); box-shadow: inset 0 0 0 1.5px var(--text-3); }
.v-board .bd-track-fin { position: absolute; top: 3px; width: 12px; height: 12px; margin-left: -6px; border-radius: 50%; background: var(--text); }
.v-board .bd-track-ax { display: flex; justify-content: space-between; font-size: 10px; color: var(--text-3); font-variant-numeric: tabular-nums; }
.v-board .bd-crit { display: grid; grid-template-columns: 18px 1fr; gap: 2px 8px; padding: 6px 0; border-bottom: 1px solid var(--border); }
.v-board .bd-crit:last-of-type { border-bottom: 0; }
.v-board .bd-crit .bd-mk { margin-top: 1px; }
.v-board .bd-crit b { font-weight: 600; font-size: 12.5px; }
.v-board .bd-crit p { grid-column: 2; color: var(--text-2); font-size: 12.5px; }
.v-board .bd-quote { padding: 8px 10px; background: var(--surface-2); border-radius: var(--radius-s); font-size: 12.5px; }
.v-board .bd-quote + .bd-quote { margin-top: 6px; }
.v-board .bd-quote-src { display: block; margin-top: 4px; font-size: 11.5px; color: var(--text-3); }
.v-board .bd-kv { display: grid; grid-template-columns: 112px 1fr; gap: 3px 10px; font-size: 12.5px; margin: 0; }
.v-board .bd-kv dt { color: var(--text-3); }
.v-board .bd-kv dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.v-board .bd-cpc { display: flex; gap: 8px; padding: 4px 0; font-size: 12.5px; border-top: 1px solid var(--border); }
.v-board .bd-cpc code { font-family: var(--mono); font-size: 12px; flex: 0 0 104px; }
.v-board .bd-srcs { margin: 6px 0 0; padding: 0; list-style: none; }
.v-board .bd-srcs li { font-family: var(--mono); font-size: 11.5px; color: var(--text-2); padding: 2px 0; overflow-wrap: anywhere; }
.v-board .bd-srcs li::before { content: "↗"; margin-right: 6px; color: var(--text-3); font-family: var(--font); }

/* Drawer (ported from Workbench) */
.v-board .bd-scrim { position: absolute; inset: 0; z-index: 31; background: rgba(20, 20, 18, 0.18); animation: board-fade 200ms var(--ease-out) both; }
.v-board .bd-drawer { position: absolute; top: 0; right: 0; bottom: 0; z-index: 32; width: min(580px, calc(100% - 200px)); display: flex; flex-direction: column; background: var(--surface); border-left: 1px solid var(--border-strong); box-shadow: var(--shadow-2); transform-origin: right center; animation: board-slide 240ms var(--ease-out) both; }
.v-board .bd-scrim.is-leaving { animation: board-out 160ms var(--ease-out) both; }
.v-board .bd-drawer.is-leaving { animation: board-slide-out 160ms var(--ease-out) both; }
.v-board .bd-dr-head { flex: none; border-bottom: 1px solid var(--border); padding: 14px 18px 12px; }
.v-board .bd-dr-title { display: flex; align-items: center; justify-content: space-between; }
.v-board .bd-dr-title h2 { font-size: 15px; font-weight: 650; }
.v-board .bd-est { display: grid; grid-template-columns: auto auto 1fr auto; gap: 4px 18px; align-items: end; margin-top: 10px; }
.v-board .bd-est-v { font-size: 20px; font-weight: 650; font-variant-numeric: tabular-nums; line-height: 1.15; }
.v-board .bd-est-l { font-size: 11px; font-weight: 600; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.04em; }
.v-board .bd-est-split { align-self: center; min-width: 0; }
.v-board .bd-est-bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden; background: var(--border); }
.v-board .bd-est-bar > span { display: block; height: 100%; }
.v-board .bd-est-lg { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 11px; color: var(--text-2); margin-top: 4px; font-variant-numeric: tabular-nums; }
.v-board .bd-est-lg i { display: inline-block; width: 7px; height: 7px; border-radius: 1px; margin-right: 3px; }
.v-board .bd-est-note { grid-column: 1 / -1; font-size: 11.5px; color: var(--text-3); }
.v-board .bd-est-why { grid-column: 1 / -1; font-size: 12px; color: var(--escalate); text-align: right; }
.v-board .bd-dr-body { flex: 1; overflow-y: auto; padding: 4px 18px 88px; }
.v-board .bd-fs { border: 0; margin: 0; padding: 14px 0 4px; border-bottom: 1px solid var(--border); min-width: 0; }
.v-board .bd-fs:last-child { border-bottom: 0; }
.v-board .bd-fs legend { padding: 0; font-size: 11px; font-weight: 650; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; float: left; width: 100%; }
.v-board .bd-fs legend + * { clear: both; }
.v-board .bd-drop { border: 1.5px dashed var(--border-strong); border-radius: var(--radius-m); padding: 18px; text-align: center; color: var(--text-2); background: var(--bg); }
.v-board .bd-drop.is-over { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.v-board .bd-drop b { display: block; color: var(--text); font-weight: 600; margin-bottom: 2px; }
.v-board .bd-drop .bd-btn { margin-top: 10px; }
.v-board .bd-file { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-s); background: var(--bg); }
.v-board .bd-file > div { flex: 1; min-width: 0; }
.v-board .bd-file-n { font-weight: 600; }
.v-board .bd-file-m { font-size: 12px; color: var(--text-2); }
.v-board .bd-warn { font-size: 12px; color: var(--escalate); margin-top: 6px; }
.v-board .bd-map { display: grid; grid-template-columns: 130px 1fr auto; gap: 6px 10px; align-items: center; margin-top: 10px; font-size: 12.5px; }
.v-board .bd-map select, .v-board .bd-input { height: 28px; padding: 0 8px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); background: var(--surface); font-size: 12.5px; min-width: 0; width: 100%; }
.v-board .bd-tag { font-size: 10.5px; font-weight: 600; padding: 1px 5px; border-radius: 3px; background: var(--general-soft); color: var(--text-2); white-space: nowrap; }
.v-board .bd-tag.is-auto { background: var(--deep-soft); color: var(--deep); }
.v-board .bd-tag.is-req { background: var(--escalate-soft); color: var(--escalate); }
.v-board .bd-prev { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; table-layout: fixed; }
.v-board .bd-prev th { text-align: left; font-weight: 600; color: var(--text-3); font-size: 11px; padding: 4px 6px; border-bottom: 1px solid var(--border); }
.v-board .bd-prev td { padding: 4px 6px; border-bottom: 1px solid var(--border); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-2); }
.v-board .bd-prev td.is-none { color: var(--text-3); font-style: italic; }
.v-board .bd-provs, .v-board .bd-tiers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.v-board .bd-tiers { margin-top: 8px; }
.v-board .bd-opt { position: relative; display: block; padding: 8px 10px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); cursor: pointer; background: var(--surface); transition: transform 120ms var(--ease-out); }
.v-board .bd-opt:hover { background: var(--surface-2); }
.v-board .bd-opt:active { transform: scale(0.98); }
.v-board .bd-opt:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent); }
.v-board .bd-opt:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 1px; }
.v-board .bd-opt input { position: absolute; opacity: 0; pointer-events: none; }
.v-board .bd-opt-t { display: block; font-weight: 600; font-size: 13px; }
.v-board .bd-opt-s { display: block; font-size: 11.5px; color: var(--text-2); margin-top: 1px; }
.v-board .bd-opt-s.is-ok { color: var(--deep); }
.v-board .bd-opt-s.is-miss { color: var(--escalate); }
.v-board .bd-row2 { display: grid; grid-template-columns: 130px 1fr; gap: 10px; align-items: center; margin-top: 8px; font-size: 12.5px; }
.v-board .bd-tg { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--border); cursor: pointer; }
.v-board .bd-tg:last-child { border-bottom: 0; }
.v-board .bd-tg-t { font-weight: 600; font-size: 13px; }
.v-board .bd-tg-s { grid-column: 1; font-size: 12px; color: var(--text-2); }
.v-board .bd-tg.is-disabled { cursor: not-allowed; }
.v-board .bd-tg.is-disabled .bd-tg-t { color: var(--text-3); }
.v-board .bd-switch { grid-row: 1 / span 2; grid-column: 2; appearance: none; -webkit-appearance: none; position: relative; width: 30px; height: 18px; margin: 0; border-radius: 999px; background: var(--border-strong); cursor: pointer; }
.v-board .bd-switch::before { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.2); transition: transform 160ms var(--ease-out); }
.v-board .bd-switch:checked { background: var(--accent); }
.v-board .bd-switch:checked::before { transform: translateX(12px); }
.v-board .bd-switch:disabled { opacity: 0.5; cursor: not-allowed; }
.v-board .bd-th-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }
.v-board .bd-thf { display: grid; grid-template-columns: 1fr 64px; gap: 1px 8px; align-items: center; font-size: 12.5px; }
.v-board .bd-thf .bd-input { text-align: right; font-variant-numeric: tabular-nums; padding-right: 6px; }
.v-board .bd-thf small { grid-column: 1 / -1; font-size: 11.5px; color: var(--text-3); }
.v-board .bd-thf.is-off { opacity: 0.5; }
.v-board .bd-fs-foot { display: flex; justify-content: flex-end; margin-top: 8px; }

/* Toasts */
.v-board .bd-toasts { position: absolute; right: 16px; bottom: 24px; z-index: 50; display: flex; flex-direction: column; gap: 8px; align-items: flex-end; pointer-events: none; }
.v-board .bd-toast { pointer-events: auto; width: max-content; max-width: min(380px, calc(50vw - 176px)); padding: 9px 12px; border-radius: var(--radius-m); background: var(--text); color: var(--surface); font-size: 12.5px; box-shadow: var(--shadow-2); transform-origin: bottom right; animation: board-toast 220ms var(--ease-out) both; }
.v-board .bd-toast b { font-weight: 600; }
.v-board .bd-toast > span { display: block; opacity: 0.75; margin-top: 1px; }
.v-board .bd-toast.is-leaving { animation: board-out 160ms var(--ease-out) both; }
.v-board .bd-toast-acts { display: flex; gap: 6px; margin-top: 7px; }
.v-board .bd-tbtn { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 8px; border: 1px solid rgba(255,255,255,0.28); border-radius: var(--radius-s); background: transparent; color: var(--surface); font-size: 12px; font-weight: 600; cursor: pointer; transition: transform 120ms var(--ease-out); }
.v-board .bd-tbtn:hover { background: rgba(255,255,255,0.12); }
.v-board .bd-tbtn:active { transform: scale(0.97); }
.v-board .bd-tbtn:focus-visible { outline-color: #fff; }
.v-board .bd-tbtn kbd { background: transparent; color: inherit; border-color: rgba(255,255,255,0.35); }

/* Flight layer: lifted card, settling cards and landing ghosts */
.v-board .bd-fly { position: absolute; inset: 0; z-index: 45; pointer-events: none; overflow: hidden; }
.v-board .bd-fly .bd-card { position: absolute; margin: 0; }
.v-board .bd-fly .bd-card.is-lift { box-shadow: var(--shadow-2); border-color: var(--border-strong); will-change: transform; }
.v-board .bd-ghost { position: absolute; display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px; background: var(--surface); border: 1px solid var(--border-strong); box-shadow: var(--shadow-2); font-size: 12px; font-weight: 600; white-space: nowrap; will-change: transform, opacity; }
.v-board .bd-ghost i { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.v-board.is-dragging, .v-board.is-dragging * { cursor: grabbing !important; }

@keyframes board-pulse { from { opacity: 1; } to { opacity: 0.3; } }
@keyframes board-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes board-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes board-pop { from { opacity: 0; transform: translateY(-4px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes board-slide { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }
@keyframes board-slide-out { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(16px); } }
@keyframes board-sheet-in { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: translateY(0); } }
@keyframes board-sheet-out { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(20px); } }
@keyframes board-toast { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes board-arrive { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) {
  .v-board *, .v-board *::before, .v-board *::after { animation-duration: 1ms !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; transition: none !important; }
  .v-board .bd-dot.is-running, .v-board .bd-chip.is-now::before { animation: none !important; }
}
`;

  function render() {
    return `<div class="v-board">
  <header class="bd-top">
    <span class="bd-brand">Deep Tech Classifier</span>
    <div class="bd-runwrap" data-r="runwrap"></div>
    <button class="bd-btn bd-btn-primary" data-act="new-run" data-fk="new-run">+ New run</button>
    <div class="bd-stats" data-r="stats" aria-label="Run summary"></div>
    <div class="bd-hist" data-r="hist"></div>
    <span class="bd-top-sp"></span>
    <div class="bd-search" data-r="searchwrap">
      <input type="search" data-fk="search" placeholder="Search company, UEN, sector" aria-label="Search companies; non-matching cards are dimmed" autocomplete="off">
      <kbd aria-hidden="true">/</kbd>
    </div>
    <button class="bd-btn" data-act="download" data-fk="download">Download Excel</button>
  </header>
  <section class="bd-strip" data-r="strip" aria-label="Processing" hidden></section>
  <main class="bd-board" data-r="board" aria-label="Results board">
    <section class="bd-col is-deep" data-col="deep" aria-labelledby="bd-h-deep"><header class="bd-col-h" data-r="h-deep"></header><div class="bd-col-b" data-r="b-deep"></div></section>
    <section class="bd-col is-review" data-col="review" aria-labelledby="bd-h-review"><header class="bd-col-h" data-r="h-review"></header><div class="bd-col-b" data-r="b-review"></div></section>
    <section class="bd-col is-general" data-col="general" aria-labelledby="bd-h-general"><header class="bd-col-h" data-r="h-general"></header><div class="bd-col-b" data-r="b-general"></div></section>
  </main>
  <div data-r="sheet"></div>
  <div data-r="overlay"></div>
  <div class="bd-fly" data-r="fly" aria-hidden="true"></div>
  <div class="bd-toasts" data-r="toasts" role="status" aria-live="polite"></div>
</div>`;
  }

  function init(stage) {
    const root = stage.querySelector('.v-board');
    const D = window.PROTO_DATA;
    const R = (k) => root.querySelector('[data-r="' + k + '"]');

    /* ---------- constants ---------- */
    const COLS = ['deep', 'review', 'general'];
    const COL_LABEL = { deep: 'Deep tech', review: 'Needs review', general: 'General tech' };
    const COL_OF = { 'deep tech': 'deep', 'general tech': 'general' };
    const VERDICT_OF = { deep: 'deep tech', general: 'general tech' };
    const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
    const ARRIVE_DELAY = 200; // card fades in as the landing ghost reaches it
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
    const C_BY_ID = {};
    D.companies.forEach((c) => { C_BY_ID[c.id] = c; });
    const provById = (id) => D.providers.find((p) => p.id === id);

    /* ---------- helpers ---------- */
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
    const vLabel = (v) => (v === 'deep tech' ? 'Deep tech' : 'General tech');
    const firstSentence = (s) => { const m = String(s || '').match(/^.*?[.!?](\s|$)/); return m ? m[0].trim() : String(s || ''); };
    const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const now0 = new Date();
    const stamp = (d) => '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes());

    /* ---------- timers, frames and animations (all cleared in cleanup) ---------- */
    const timeouts = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timeouts.delete(t); fn(); }, ms); timeouts.add(t); return t; };
    const cancel = (t) => { if (t) { clearTimeout(t); timeouts.delete(t); } };
    const rafs = new Set();
    const anims = new Set();

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
      return Object.assign({ kind: 'rows', results: {}, progress: {}, landed: {}, decisions: {}, notes: {}, phase: '', current: null }, o);
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
      q: '', bin: null,
      menu: false,
      sheet: null,   // { id, col, idx, returnFocus }
      drawer: null,  // { draft, returnFocus, over }
      colFocus: { deep: null, review: null, general: null },
      recent: null,
      liftedId: null,
      flying: {},    // id -> Animation
      undo: [],      // { runId, id, prev }
      seen: new Set(),
    };
    const engines = {};
    const runById = (id) => S.runs.find((r) => r.id === id);
    const activeRun = () => runById(S.activeId);
    const markSeen = (run) => { if (run.kind === 'rows') Object.keys(run.results).forEach((id) => S.seen.add(run.id + ':' + id)); };
    markSeen(initialRun);

    /* Effective state of one company: result, reviewer decision and its place. */
    function view(run, id) {
      const c = C_BY_ID[id];
      const r = run.results[id] || null;
      const idx = run.ids.indexOf(id) + 1;
      if (!r) return { c, r: null, idx, prog: run.progress[id] || null };
      const dec = run.decisions[id] || null;
      const flagged = r.risk !== 'Clear';
      let place; let verdict = r.verdict;
      if (dec && dec.verdict) { verdict = dec.verdict; place = COL_OF[verdict]; }
      else if (dec) place = 'review';
      else place = flagged ? 'review' : COL_OF[r.verdict];
      const reviewed = !!(dec && dec.verdict);
      return {
        c, r, idx, dec, flagged, place, verdict, reviewed,
        open: place === 'review', pulled: !!(dec && !dec.verdict),
        overturned: reviewed && dec.verdict !== r.verdict,
        action: place === 'review' ? 'Needs Review' : verdict === 'deep tech' ? 'Approve' : 'Reject',
      };
    }

    /* Workbench convention: Deep and General count every finished company under its
       current verdict (flagged ones included); Needs review counts the open pile. */
    function counts(run) {
      if (run.kind === 'summary') {
        const s = run.summary;
        return { total: s.total, done: s.done, deep: s.deep, general: s.general, open: s.review, flagged: s.review, decided: 0, reviewed: 0, overturned: 0, avg: null, cost: s.cost, costUnknown: false, errors: s.errors };
      }
      const o = { total: run.ids.length, done: 0, deep: 0, general: 0, open: 0, flagged: 0, decided: 0, reviewed: 0, overturned: 0, avg: null, cost: 0, costUnknown: false,
        here: { deep: 0, general: 0 }, lean: { deep: 0, general: 0 }, openRisk: { Escalate: 0, Contested: 0, Uncertain: 0, Clear: 0 } };
      let sum = 0;
      run.ids.forEach((id) => {
        const v = view(run, id);
        if (!v.r) return;
        o.done++; sum += v.r.conf;
        const vc = COL_OF[v.verdict];
        o[vc]++;
        if (v.open) { o.open++; o.lean[vc]++; o.openRisk[v.r.risk]++; } else o.here[vc]++;
        if (v.flagged) { o.flagged++; if (v.reviewed) o.decided++; }
        if (v.reviewed) { o.reviewed++; if (v.overturned) o.overturned++; }
        if (v.r.cost == null) o.costUnknown = true; else o.cost += v.r.cost;
      });
      o.avg = o.done ? Math.round(sum / o.done) : null;
      return o;
    }

    /* Column order: review pile by severity then lowest confidence; outer columns put
       the reviewer's placements on top (newest first), then lowest confidence first. */
    function colGroups(run, col) {
      const vs = run.ids.map((id) => view(run, id)).filter((v) => v.r && v.place === col);
      const id = (v) => v.c.id;
      if (col === 'review') {
        vs.sort((a, b) => (SEV[a.r.risk] - SEV[b.r.risk]) || (a.r.conf - b.r.conf) || (a.idx - b.idx));
        return { placed: [], rest: vs.map(id) };
      }
      const placed = vs.filter((v) => v.reviewed).sort((a, b) => b.dec.at - a.dec.at);
      const rest = vs.filter((v) => !v.reviewed).sort((a, b) => (a.r.conf - b.r.conf) || (a.idx - b.idx));
      return { placed: placed.map(id), rest: rest.map(id) };
    }
    const colIds = (run, col) => { const g = colGroups(run, col); return g.placed.concat(g.rest); };

    const filtering = () => !!(S.q.trim() || S.bin != null);
    function matches(v) {
      const q = S.q.trim().toLowerCase();
      if (q) {
        const c = v.c;
        if ((c.name + ' ' + c.uen + ' ' + c.domain + ' ' + c.description).toLowerCase().indexOf(q) < 0) return false;
      }
      if (S.bin != null && Math.min(9, Math.floor(v.r.conf / 10)) !== S.bin) return false;
      return true;
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
      toast('Run stopped', n + ' finished ' + (n === 1 ? 'result' : 'results') + ' kept on the board. Resume continues with the next unfinished company.');
      renderAll();
      const b = R('strip').querySelector('[data-fk="resume"]'); if (b) b.focus();
    }

    function finishRun(run) {
      delete engines[run.id];
      run.status = 'complete'; run.phase = ''; run.current = null;
      if (run.kind === 'rows') {
        const k = counts(run);
        toast('Run complete: ' + run.file, k.done + ' companies · ' + k.deep + ' deep tech · ' + k.open + ' in Needs review');
      } else {
        run.resumed = true;
        run.summary.cost = Math.round(run.summary.total * D.estCostPerCompany.fast * 0.97 * 100) / 100;
        toast('Run complete: ' + run.file, run.summary.total + ' companies classified');
      }
      if (run.id === S.activeId) renderAll(); else renderRunwrap();
    }

    let tickScheduled = false;
    function onTick(run) {
      if (tickScheduled) return;
      tickScheduled = true;
      const rid = requestAnimationFrame(() => {
        rafs.delete(rid);
        tickScheduled = false;
        if (!root.isConnected) return;
        if (run.id !== S.activeId) { renderRunwrap(); return; }
        renderAll({ tick: true });
      });
      rafs.add(rid);
    }

    /* ---------- render helpers ---------- */
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
    const verdictHtml = (v) => '<span class="bd-verdict ' + (v === 'deep tech' ? 'is-deep' : 'is-gen') + '">' + vLabel(v) + '</span>';
    const riskHtml = (r) => '<span class="bd-risk r-' + r + '">' + (r === 'Pulled' ? 'Pulled by you' : r) + '</span>';
    const confHtml = (r, th) => '<span class="bd-conf" title="Confidence ' + r.conf + '"><span class="bd-conf-t ' + (r.conf < th ? 'is-low' : '') + '"><span style="transform:scaleX(' + (r.conf / 100).toFixed(2) + ')"></span></span><span class="bd-conf-n">' + r.conf + '</span></span>';
    const patHtml = (r) => r.patents.status === 'disabled'
      ? '<span class="bd-pat is-none" title="Patent lookup was off">— pat.</span>'
      : '<span class="bd-pat ' + (r.patents.count ? '' : 'is-none') + '" title="EPO patents found">' + r.patents.count + ' pat.</span>';
    const CRIT = [['innovation', 'I', 'Innovation'], ['scientific_foundation', 'S', 'Scientific foundation'], ['proprietary_ip', 'P', 'Proprietary IP']];
    function marksHtml(c) {
      const label = CRIT.map((x) => x[2] + (c.criteria[x[0]].met ? ' met' : ' not met')).join(', ');
      return '<span class="bd-mks" role="img" aria-label="' + label + '">' + CRIT.map((x) => {
        const m = c.criteria[x[0]].met;
        return '<span class="bd-mk ' + (m ? 'is-y' : 'is-n') + '" title="' + x[2] + ': ' + (m ? 'met' : 'not met') + '" aria-hidden="true">' + (m ? '✓' : x[1]) + '</span>';
      }).join('') + '</span>';
    }

    function reasonLine(run, v) {
      const r = v.r; const cfg = run.cfg;
      if (v.pulled) return 'You pulled this back for review. The pipeline settled it as ' + vLabel(r.verdict).toLowerCase() + ' at ' + r.conf + '.';
      if (r.risk === 'Escalate') return (r.val && r.val.escalationReason) || 'The validator found the evidence contradictory and handed the call to a reviewer.';
      if (r.risk === 'Contested') return 'The validator argued for ' + vLabel(flip(r.verdict)).toLowerCase() + ' at ' + r.val.confidence + ', short of the ' + cfg.overrideMinConfidence + ' needed to flip the verdict.';
      if (r.lowEvidence) return 'No description and nothing reliable on the web; the verdict rests on the company name alone.';
      return 'Validated, but confidence ' + r.conf + ' is still below ' + cfg.validatorThreshold + '. ' + (r.val ? firstSentence(r.val.summary) : '');
    }

    /* ---------- top bar ---------- */
    function runStatus(run) {
      if (run.kind === 'rows') {
        const k = counts(run);
        if (run.status === 'running') return { dot: 'is-running', text: 'Running · ' + k.done + '/' + k.total, bar: k.done / k.total };
        if (run.status === 'stopped') return { dot: 'is-stopped', text: 'Stopped · ' + k.done + '/' + k.total, bar: k.done / k.total };
        return { dot: 'is-complete', text: k.total + ' companies · ' + (k.open ? k.open + ' to review' : 'all placed') };
      }
      const s = run.summary;
      if (run.status === 'running') return { dot: 'is-running', text: 'Resuming · ' + s.done + '/' + s.total, bar: s.done / s.total };
      if (run.status === 'interrupted' || run.status === 'stopped') return { dot: 'is-stopped', text: 'Interrupted · ' + s.done + '/' + s.total, bar: s.done / s.total };
      return { dot: 'is-complete', text: s.total + ' companies · ' + s.review + ' to review' };
    }

    function renderRunwrap() {
      const run = activeRun();
      const st = runStatus(run);
      let html = '<button class="bd-runbtn" data-act="toggle-menu" data-fk="runbtn" aria-haspopup="true" aria-expanded="' + S.menu + '" title="Switch run">' +
        '<span class="bd-dot ' + st.dot + '"></span><span class="bd-runbtn-x"><span class="bd-runbtn-t">' + esc(run.file) + '</span><span class="bd-runbtn-s bd-num">' + esc(st.text) + ' · ' + esc(run.dateLabel) + '</span></span><span class="bd-caret" aria-hidden="true">▾</span></button>';
      if (S.menu) {
        const item = (r) => {
          const s = runStatus(r);
          return '<button class="bd-menu-i" role="menuitem" data-act="open-run" data-id="' + r.id + '" data-fk="menu-' + r.id + '" aria-current="' + (r.id === S.activeId) + '">' +
            '<span class="bd-menu-f">' + esc(r.file) + '</span>' +
            '<span class="bd-menu-m"><span class="bd-dot ' + s.dot + '"></span><span class="bd-num">' + esc(s.text) + '</span></span>' +
            '<span class="bd-menu-d">' + esc(r.dateLabel) + ' · ' + esc(r.model.replace(/^claude-/, '')) + '</span>' +
            (s.bar != null ? '<span class="bd-minibar ' + (s.dot === 'is-stopped' ? 'is-stopped' : '') + '"><span style="transform:scaleX(' + s.bar.toFixed(3) + ')"></span></span>' : '') +
            '</button>';
        };
        const fresh = S.runs.filter((r) => r.fresh);
        const older = S.runs.filter((r) => !r.fresh);
        const keys = D.providers.map((p) => '<span>' + esc(p.label) + ' <span class="' + (p.keySet ? 'bd-keyok">key set' : 'bd-keymiss">no key') + '</span></span>').join('') +
          '<span>EPO <span class="' + (D.epoKeysSet ? 'bd-keyok">key set' : 'bd-keymiss">no key') + '</span></span>';
        html += '<div class="bd-menu" role="menu" aria-label="Runs">' +
          (fresh.length ? '<div class="bd-menu-h">This session</div>' + fresh.map(item).join('') : '') +
          '<div class="bd-menu-h">Recent runs</div>' + older.map(item).join('') +
          '<div class="bd-keyline" title="API keys read from .env">' + keys + '</div>' +
          '<div class="bd-menu-foot"><button class="bd-btn bd-btn-sm" role="menuitem" data-act="new-run" data-fk="menu-new">+ New run</button>' +
          (run.kind === 'rows' ? '<button class="bd-btn bd-btn-sm bd-btn-ghost" role="menuitem" data-act="rerun" data-fk="menu-rerun">New run with these settings…</button>' : '') + '</div></div>';
      }
      put(R('runwrap'), html);
    }

    function renderStats() {
      const run = activeRun();
      const k = counts(run);
      const st = (l, v, cls, title) => '<div class="bd-stat ' + (cls || '') + '"' + (title ? ' title="' + esc(title) + '"' : '') + '><span class="bd-stat-l">' + l + '</span><span class="bd-stat-v">' + v + '</span></div>';
      let h = st('Processed', k.done + '<small>/' + k.total + '</small>');
      if (run.kind === 'rows') {
        h += st('Reviewed', k.reviewed + (k.overturned ? '<small> · ' + k.overturned + ' overturned</small>' : ''), '', 'Companies you placed in a column');
        h += st('Avg conf.', k.avg == null ? '—' : k.avg, 'is-opt');
        h += st(run.status === 'running' ? 'Cost so far' : 'Cost', k.costUnknown ? 'unknown' : k.done ? money(k.cost) : '—', 'is-opt');
      } else {
        h += st('Errors', k.errors || 0, '', 'Retried on a re-run');
        h += st('Cost', k.cost != null ? money(k.cost) : '—', 'is-opt');
      }
      put(R('stats'), h);
    }

    function renderHist() {
      const run = activeRun();
      const el = R('hist');
      if (run.kind !== 'rows') { el.hidden = true; el.innerHTML = ''; return; }
      el.hidden = false;
      const bins = Array.from({ length: 10 }, () => ({ d: 0, g: 0 }));
      run.ids.forEach((id) => {
        const v = view(run, id); if (!v.r) return;
        const b = bins[Math.min(9, Math.floor(v.r.conf / 10))];
        if (v.verdict === 'deep tech') b.d++; else b.g++;
      });
      const max = Math.max(1, ...bins.map((b) => b.d + b.g));
      const th = run.cfg.validatorThreshold;
      put(el, '<div class="bd-hist-bars" role="group" aria-label="Confidence distribution; choose a range to highlight its cards">' + bins.map((b, i) => {
        const n = b.d + b.g; const lo = i * 10; const hi = i === 9 ? 100 : i * 10 + 9;
        return '<button class="bd-bin" data-act="bin" data-bin="' + i + '" data-fk="bin-' + i + '" aria-pressed="' + (S.bin === i) + '" ' + (n ? '' : 'disabled') +
          ' title="Confidence ' + lo + '–' + hi + ': ' + b.d + ' deep tech, ' + b.g + ' general tech" aria-label="Confidence ' + lo + ' to ' + hi + ', ' + n + ' companies">' +
          '<span class="bd-bin-g" style="height:' + Math.round(b.g / max * 24) + 'px"></span><span class="bd-bin-d" style="height:' + Math.round(b.d / max * 24) + 'px"></span></button>';
      }).join('') + '<span class="bd-hist-th" style="left:' + th + '%" title="Validation threshold ' + th + '"></span></div>' +
        '<div class="bd-hist-ax"><span>0</span><span>confidence · validates &lt; ' + th + '</span><span>100</span></div>');
    }

    function renderSearchState() {
      const run = activeRun();
      R('searchwrap').hidden = run.kind !== 'rows';
    }

    /* ---------- processing strip ---------- */
    function renderStrip() {
      const run = activeRun();
      const el = R('strip');
      let html = '';
      if (run.kind === 'rows' && (run.status === 'running' || run.status === 'stopped')) {
        const k = counts(run);
        const pend = run.ids.filter((id) => !run.results[id]);
        if (run.status === 'running') {
          const active = pend.filter((id) => run.progress[id]);
          const queued = pend.filter((id) => !run.progress[id]);
          const WAIT = { 'Waiting for batch': 1, 'In batch job': 1, 'Validation queued': 1 };
          const shownA = active.slice(0, 5);
          const shownQ = shownA.length < 3 ? queued.slice(0, 3 - shownA.length) : [];
          const chips = shownA.map((id) => {
            const p = run.progress[id];
            return '<span class="bd-chip ' + (WAIT[p] ? '' : 'is-now') + '" data-chip="' + id + '"><span class="bd-chip-n">' + esc(C_BY_ID[id].name) + '</span><span class="bd-chip-s">' + esc(p) + '</span></span>';
          }).concat(shownQ.map((id) => '<span class="bd-chip is-queued" data-chip="' + id + '"><span class="bd-chip-n">' + esc(C_BY_ID[id].name) + '</span><span class="bd-chip-s">queued</span></span>'));
          const more = pend.length - shownA.length - shownQ.length;
          html = '<span class="bd-strip-st"><span class="bd-dot is-running"></span><b>Processing</b><span class="bd-num">' + k.done + ' of ' + k.total + '</span></span>' +
            '<span class="bd-prog" aria-hidden="true"><span style="transform:scaleX(' + (k.done / k.total).toFixed(3) + ')"></span></span>' +
            '<div class="bd-lane">' + chips.join('') + (more > 0 ? '<span class="bd-lane-more bd-num">+' + more + ' more</span>' : '') + '</div>' +
            '<span class="bd-strip-phase">' + (batchOn(run.cfg) ? 'Batch · ' : 'One at a time · ') + esc(run.phase) + '</span>' +
            '<button class="bd-btn bd-btn-sm bd-btn-stop" data-act="stop" data-fk="stop">■ Stop</button>';
        } else {
          html = '<span class="bd-strip-st"><span class="bd-dot is-stopped"></span><b>Stopped</b><span class="bd-num">' + k.done + ' of ' + k.total + '</span></span>' +
            '<span class="bd-prog is-stopped" aria-hidden="true"><span style="transform:scaleX(' + (k.done / k.total).toFixed(3) + ')"></span></span>' +
            '<span class="bd-strip-msg">Finished results are on the board and can be reviewed now. ' + pend.length + ' not started; Resume continues with <span class="bd-mono">' + esc(run.model) + '</span>, the model this run started with.</span>' +
            '<button class="bd-btn bd-btn-sm bd-btn-primary" data-act="resume" data-fk="resume">Resume</button>';
        }
      } else if (run.kind === 'summary' && run.status !== 'complete') {
        const s = run.summary;
        const running = run.status === 'running';
        html = '<span class="bd-strip-st"><span class="bd-dot ' + (running ? 'is-running' : 'is-stopped') + '"></span><b>' + (running ? 'Resuming' : 'Interrupted') + '</b><span class="bd-num">' + s.done + ' of ' + s.total + '</span></span>' +
          '<span class="bd-prog ' + (running ? '' : 'is-stopped') + '" aria-hidden="true"><span style="transform:scaleX(' + (s.done / s.total).toFixed(3) + ')"></span></span>' +
          '<span class="bd-strip-msg">' + (running ? esc(run.phase) : 'Checkpointed after every company. Resume continues at company ' + (s.done + 1) + ' with <span class="bd-mono">' + esc(run.model) + '</span>.') + '</span>' +
          (running ? '<button class="bd-btn bd-btn-sm bd-btn-stop" data-act="stop" data-fk="stop">■ Stop</button>' : '<button class="bd-btn bd-btn-sm bd-btn-primary" data-act="resume" data-fk="resume">Resume</button>');
      }
      el.hidden = !html;
      put(el, html);
    }

    /* ---------- board ---------- */
    function cardHtml(run, v, col, ctx) {
      const id = v.c.id; const r = v.r; const rich = col === 'review';
      const cls = ['bd-card', rich ? 'is-rich' : 'is-compact'];
      if (rich) cls.push(v.verdict === 'deep tech' ? 'lean-deep' : 'lean-general');
      if (S.sheet && S.sheet.id === id) cls.push('is-open');
      if (S.recent === id) cls.push('is-recent');
      if (ctx.filt && !matches(v)) cls.push('is-dim');
      if (S.liftedId === id) cls.push('is-lifted');
      if (S.flying[id]) cls.push('is-flying');
      let style = '';
      const age = run.landed[id] ? ctx.now - run.landed[id] : Infinity;
      if (age < ARRIVE_DELAY + 180) { cls.push('is-arrive'); style = ' style="animation-delay:' + Math.round(ARRIVE_DELAY - age) + 'ms"'; }
      const ti = ctx.roving === id ? '0' : '-1';
      const label = v.c.name + ', ' + vLabel(v.verdict) + ', confidence ' + r.conf + (r.risk !== 'Clear' ? ', ' + r.risk : '') + (v.reviewed ? ', reviewed' : '') + '. Enter opens the evidence; D, G or B moves it.';
      const main = '<button class="bd-card-main" data-act="open" data-id="' + id + '" data-fk="card-' + id + '" tabindex="' + ti + '" aria-label="' + esc(label) + '">';
      const th = run.cfg.validatorThreshold;
      const open = '<div class="' + cls.join(' ') + '" data-card="' + id + '" data-col="' + col + '"' + style + '>';
      if (!rich) {
        return open + '<span class="bd-grip" aria-hidden="true"></span>' + main +
          '<span class="bd-r"><span class="bd-name">' + esc(v.c.name) + '</span>' +
          (v.reviewed ? '<span class="bd-rev">✓ Reviewed</span>' + (v.overturned ? '<span class="bd-ovr" title="Pipeline said ' + vLabel(r.verdict).toLowerCase() + '">overturned</span>' : '') : '') +
          confHtml(r, th) + '</span>' +
          '<span class="bd-r"><span class="bd-sector">' + esc(v.c.domain) + '</span>' + (r.risk !== 'Clear' ? riskHtml(r.risk) : '') + marksHtml(v.c) + patHtml(r) + '</span>' +
          '</button></div>';
      }
      const mv = (to) => {
        const lean = v.verdict === VERDICT_OF[to]; const L = COL_LABEL[to]; const key = to === 'deep' ? 'D' : 'G';
        const tag = '<span class="bd-mv-tag">' + (lean ? 'confirm' : 'overturn') + '</span>';
        const inner = to === 'deep'
          ? '<span class="bd-mv-ar" aria-hidden="true">◂</span><span class="bd-mv-l">' + L + '</span>' + tag + '<kbd aria-hidden="true">' + key + '</kbd>'
          : '<kbd aria-hidden="true">' + key + '</kbd>' + tag + '<span class="bd-mv-l">' + L + '</span><span class="bd-mv-ar" aria-hidden="true">▸</span>';
        return '<button class="bd-mv to-' + to + (lean ? ' is-lean' : '') + '" data-act="move" data-id="' + id + '" data-to="' + to + '" data-fk="mv-' + to + '-' + id + '" tabindex="' + ti + '" aria-label="Move ' + esc(v.c.name) + ' to ' + L + (lean ? ', confirming the pipeline' : ', overturning the pipeline') + ' (' + key + ')">' + inner + '</button>';
      };
      return open + '<span class="bd-lean" aria-hidden="true"></span><span class="bd-grip" aria-hidden="true"></span>' + main +
        '<span class="bd-r">' + riskHtml(v.pulled ? 'Pulled' : r.risk) + '<span class="bd-name">' + esc(v.c.name) + '</span>' + confHtml(r, th) + '</span>' +
        '<span class="bd-r"><span class="bd-sector">' + esc(v.c.domain) + '</span>' + marksHtml(v.c) + patHtml(r) + '</span>' +
        '<span class="bd-reason">' + esc(reasonLine(run, v)) + '</span>' +
        '</button><div class="bd-acts">' + mv('deep') + mv('general') + '</div></div>';
    }

    function keysHtml() {
      const row = (k, t) => '<dt>' + k + '</dt><dd>' + t + '</dd>';
      return '<div class="bd-keys"><div class="bd-keys-h">Keyboard · or drag a card to a column</div><dl>' +
        row('<kbd>J</kbd> <kbd>K</kbd>', 'Down / up a column') +
        row('<kbd>H</kbd> <kbd>L</kbd>', 'Column left / right') +
        row('<kbd>D</kbd> <kbd>G</kbd>', 'Place in Deep / General') +
        row('<kbd>B</kbd>', 'Back to Needs review') +
        row('<kbd>Enter</kbd>', 'Open evidence') +
        row('<kbd>U</kbd>', 'Undo last move') +
        row('<kbd>N</kbd>', 'Next to review') +
        row('<kbd>/</kbd>', 'Search') +
        '</dl></div>';
    }

    function emptyReviewHtml(run, k) {
      const unfinished = k.done < k.total;
      if (!k.flagged && !k.reviewed) {
        return unfinished
          ? '<div class="bd-empty"><b>Nothing flagged yet</b>Companies the pipeline is unsure about collect here as they finish.</div>'
          : '<div class="bd-empty"><b>Nothing was flagged</b>Every company was settled with confidence. Press <kbd>B</kbd> on any card to pull it back here.</div>';
      }
      return '<div class="bd-empty"><b>' + (unfinished ? 'Pile cleared so far' : 'Pile cleared') + '</b>' +
        'All ' + k.flagged + ' flagged ' + (k.flagged === 1 ? 'company is' : 'companies are') + ' placed' + (k.overturned ? ', ' + k.overturned + ' against the pipeline' : '') + '. Your decisions go into the workbook.' +
        (unfinished ? '' : '<br><button class="bd-btn" data-act="download" data-fk="empty-dl">Download Excel</button>') + '</div>';
    }

    function colHeadHtml(run, col, k, ctx) {
      const m = ctx.filt ? colIds(run, col).filter((id) => matches(view(run, id))).length : null;
      const match = m != null ? '<span class="bd-col-match bd-num">' + m + ' match</span>' : '';
      if (col === 'review') {
        const parts = ['Escalate', 'Contested', 'Uncertain'].filter((x) => k.openRisk[x]).map((x) => '<span><i class="bd-sw r-' + x + '"></i><span class="bd-num">' + k.openRisk[x] + '</span> ' + x + '</span>');
        if (k.openRisk.Clear) parts.push('<span><span class="bd-num">' + k.openRisk.Clear + '</span> pulled by you</span>');
        if (!parts.length) parts.push('<span>' + (k.done ? 'Nothing waiting' : 'Waiting for results') + '</span>');
        return '<div class="bd-col-top"><h2 id="bd-h-review">Needs review</h2><span class="bd-col-n ' + (k.open ? 'is-open' : '') + '">' + k.open + '</span></div>' +
          '<div class="bd-col-sub">' + parts.join('') + match + '</div>' +
          '<div class="bd-col-foot"><span class="bd-pile" aria-hidden="true"><span style="transform:scaleX(' + (k.flagged ? k.decided / k.flagged : 0).toFixed(3) + ')"></span></span><span class="bd-num">' + k.decided + ' of ' + k.flagged + ' flagged decided</span></div>';
      }
      const placed = colGroups(run, col).placed.length;
      return '<div class="bd-col-top"><h2 id="bd-h-' + col + '">' + COL_LABEL[col] + '</h2><span class="bd-col-n">' + k[col] + '</span></div>' +
        '<div class="bd-col-sub"><span><span class="bd-num">' + k.here[col] + '</span>&nbsp;here</span>' +
        (k.lean[col] ? '<span title="Flagged companies whose current verdict is ' + COL_LABEL[col].toLowerCase() + '">+<span class="bd-num">' + k.lean[col] + '</span>&nbsp;leaning ' + (col === 'deep' ? '◂' : '▸') + ' in review</span>' : '') + match + '</div>' +
        '<div class="bd-col-foot">' + (placed ? 'Your placements first, then lowest confidence' : 'Lowest confidence first: shakiest calls on top') + '</div>';
    }

    function colBodyHtml(run, col, k, ctx) {
      const g = colGroups(run, col);
      const ids = g.placed.concat(g.rest);
      ctx.roving = ids.indexOf(S.colFocus[col]) >= 0 ? S.colFocus[col] : ids[0];
      const card = (id) => cardHtml(run, view(run, id), col, ctx);
      if (col === 'review') return (ids.length ? ids.map(card).join('') : emptyReviewHtml(run, k)) + keysHtml();
      if (!ids.length) return '<div class="bd-empty">' + (k.done < k.total ? COL_LABEL[col] + ' results land here as companies finish.' : 'No companies here.') + '</div>';
      let h = '';
      if (g.placed.length) {
        h += '<div class="bd-grp"><span>Placed by you</span><span class="bd-num">' + g.placed.length + '</span></div>' + g.placed.map(card).join('');
        if (g.rest.length) h += '<div class="bd-grp"><span>From the pipeline</span><span class="bd-num">' + g.rest.length + '</span></div>';
      }
      return h + g.rest.map(card).join('');
    }

    function renderBoard() {
      const run = activeRun();
      if (run.kind !== 'rows') { renderArchiveBoard(run); return; }
      const k = counts(run);
      const ctx = { filt: filtering(), now: Date.now(), roving: null };
      COLS.forEach((col) => {
        put(R('h-' + col), colHeadHtml(run, col, k, ctx));
        const body = R('b-' + col); const st = body.scrollTop;
        put(body, colBodyHtml(run, col, k, ctx));
        body.scrollTop = st;
      });
    }

    function renderArchiveBoard(run) {
      const s = run.summary;
      const done = run.status === 'complete';
      const head = (col, n, sub) => '<div class="bd-col-top"><h2 id="bd-h-' + col + '">' + COL_LABEL[col] + '</h2><span class="bd-col-n ' + (col === 'review' && n ? 'is-open' : '') + '">' + n + '</span></div>' +
        '<div class="bd-col-sub"><span>' + sub + '</span></div><div class="bd-col-foot">' + (done ? 'Rows are kept in the workbook' : 'So far: ' + s.done + ' of ' + s.total + ' classified') + '</div>';
      put(R('h-deep'), head('deep', s.deep, 'Classified deep tech'));
      put(R('h-review'), head('review', s.review, 'Flagged for a reviewer'));
      put(R('h-general'), head('general', s.general, 'Classified general tech'));
      const outer = (n, what) => '<div class="bd-arch-out"><b>' + n + '</b><span>' + what + '</span><span class="bd-muted" style="margin-top:6px">Cards are not kept for past runs. The Management View sheet lists every company.</span></div>';
      put(R('b-deep'), outer(s.deep, 'companies classified deep tech'));
      put(R('b-general'), outer(s.general, 'companies classified general tech'));
      put(R('b-review'), archiveHtml(run));
    }

    function archiveHtml(run) {
      const s = run.summary;
      if (run.status === 'complete') {
        return '<div class="bd-arch"><h3>Results are in the workbook</h3><p>' + (run.resumed ? 'This run was resumed and finished today.' : 'This run finished on ' + esc(run.dateLabel) + '.') + ' Its rows were not kept in this workspace, so the Management View and Full Detail sheets are the record. Download the workbook to review its ' + s.review + ' flagged ' + (s.review === 1 ? 'company' : 'companies') + '.</p>' +
          '<div class="bd-arch-bar is-complete"><span style="transform:scaleX(1)"></span></div><p class="bd-num">' + s.total + ' of ' + s.total + ' classified' + (s.errors ? ' · ' + s.errors + ' ended in an error and will be retried on a re-run' : '') + '</p>' +
          '<div class="bd-arch-acts"><button class="bd-btn" data-act="download" data-fk="arch-download">Download Excel</button><button class="bd-btn bd-btn-ghost" data-act="new-run" data-fk="arch-new">New run…</button></div></div>';
      }
      const running = run.status === 'running';
      return '<div class="bd-arch"><h3>' + (running ? 'Resuming ' : 'Interrupted at company ') + '<span class="bd-num">' + s.done + ' of ' + s.total + '</span></h3>' +
        '<p>Progress is checkpointed after every company. Resume continues at company ' + (s.done + 1) + ' with <span class="bd-mono">' + esc(run.model) + '</span>, the model this run started with, and retries any company that ended in an error. It needs the same input file, <b>' + esc(run.file) + '</b>, with its rows in the same order.</p>' +
        '<div class="bd-arch-bar ' + (running ? 'is-running' : '') + '"><span style="transform:scaleX(' + (s.done / s.total).toFixed(3) + ')"></span></div>' +
        '<p class="bd-num">' + (running ? esc(run.phase) : (s.total - s.done) + ' companies left · about ' + fmtDur((s.total - s.done) * D.estSecondsPerCompany.sequential).slice(1) + ' at the usual pace') + '</p>' +
        '<div class="bd-arch-acts">' + (running ? '<button class="bd-btn bd-btn-stop" data-act="stop" data-fk="arch-stop">■ Stop</button>' : '<button class="bd-btn bd-btn-primary" data-act="resume" data-fk="arch-resume">Resume run</button>') +
        '<button class="bd-btn" data-act="download" data-fk="arch-download">Download partial Excel</button></div></div>';
    }

    /* Renders everything; new results that landed since the last paint get a short
       flight from the processing strip to their column. */
    function renderAll(opts) {
      const run = activeRun();
      const origins = [];
      if (run.kind === 'rows') {
        run.ids.forEach((id) => {
          const key = run.id + ':' + id;
          if (run.results[id] && !S.seen.has(key)) { S.seen.add(key); origins.push({ id, from: stripOrigin(id) }); }
        });
      }
      renderRunwrap(); renderStats(); renderHist(); renderSearchState(); renderStrip(); renderBoard();
      if (!(opts && opts.tick)) renderSheet();
      origins.forEach((o) => { if (o.from) ghostFly(run, o.id, o.from); });
    }
    function renderCounts() { renderRunwrap(); renderStats(); renderHist(); renderBoard(); renderSheet(); }

    /* ---------- element lookups ---------- */
    const cardEl = (id) => R('board').querySelector('.bd-card[data-card="' + id + '"]');
    const cardMain = (id) => R('board').querySelector('[data-fk="card-' + id + '"]');
    const colEl = (col) => R('board').querySelector('.bd-col[data-col="' + col + '"]');
    const sheetEl = () => R('sheet').querySelector('.bd-sheet:not(.is-leaving)');
    function focusedCardId() {
      const a = document.activeElement;
      const card = a && a.closest ? a.closest('.bd-card[data-card]') : null;
      return card && R('board').contains(card) ? card.getAttribute('data-card') : null;
    }
    /* Card rect, or null when it is scrolled out of its column. */
    function visibleRect(id) {
      const el = cardEl(id); if (!el) return null;
      const body = el.closest('.bd-col-b'); const r = el.getBoundingClientRect(); const b = body.getBoundingClientRect();
      if (!r.width || r.bottom < b.top || r.top > b.bottom) return null;
      return r;
    }
    function ensureVisible(id) {
      const el = cardEl(id); if (!el) return;
      const body = el.closest('.bd-col-b');
      const b = body.getBoundingClientRect(); const r = el.getBoundingClientRect();
      const top = b.top + 6;
      let bottom = b.bottom - 80;
      const sh = sheetEl();
      if (sh) bottom = Math.min(bottom, sh.getBoundingClientRect().top - 10);
      if (r.top < top) body.scrollTop -= (top - r.top);
      else if (r.bottom > bottom) body.scrollTop += Math.min(r.bottom - bottom, r.top - top);
    }
    function applyRoving(col) {
      const body = R('b-' + col); if (!body) return;
      const id = S.colFocus[col];
      body.querySelectorAll('.bd-card[data-card]').forEach((card) => {
        const ti = card.getAttribute('data-card') === id ? '0' : '-1';
        card.querySelectorAll('.bd-card-main, .bd-mv').forEach((b) => b.setAttribute('tabindex', ti));
      });
    }
    function focusCard(id) {
      const b = cardMain(id); if (!b) return;
      const col = b.closest('.bd-card').getAttribute('data-col');
      S.colFocus[col] = id; applyRoving(col);
      b.focus({ preventScroll: true });
      ensureVisible(id);
    }

    /* ---------- flights (transform + opacity only, skipped under reduced motion) ---------- */
    function scrub(n) {
      n.removeAttribute('data-card');
      n.querySelectorAll('[data-fk], [data-act], [id]').forEach((x) => { x.removeAttribute('data-fk'); x.removeAttribute('data-act'); x.removeAttribute('id'); });
      n.querySelectorAll('button').forEach((b) => b.setAttribute('tabindex', '-1'));
      n.setAttribute('aria-hidden', 'true');
      n.classList.remove('is-arrive', 'is-flying', 'is-lifted', 'is-dim');
      n.style.animationDelay = '';
    }
    function placeAt(n, rect) {
      const rr = root.getBoundingClientRect();
      n.style.left = (rect.left - rr.left) + 'px'; n.style.top = (rect.top - rr.top) + 'px';
      n.style.width = rect.width + 'px'; n.style.height = rect.height + 'px';
    }
    /* Card travels from `from` (viewport rect) into its new place. */
    function flyFrom(id, from, dur) {
      if (!cardEl(id)) return;
      ensureVisible(id);
      const el = cardEl(id);
      if (!from || reduced() || !el.animate) return;
      const to = el.getBoundingClientRect();
      const dx = from.left - to.left; const dy = from.top - to.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      if (S.flying[id]) S.flying[id].cancel();
      const clone = el.cloneNode(true); scrub(clone); placeAt(clone, to);
      R('fly').appendChild(clone);
      const anim = clone.animate([{ transform: 'translate(' + dx + 'px, ' + dy + 'px)' }, { transform: 'translate(0px, 0px)' }], { duration: dur, easing: EASE });
      S.flying[id] = anim; anims.add(anim); el.classList.add('is-flying');
      const done = () => {
        anims.delete(anim); clone.remove();
        if (S.flying[id] === anim) { delete S.flying[id]; const cur = cardEl(id); if (cur) cur.classList.remove('is-flying'); }
      };
      anim.onfinish = done; anim.oncancel = done;
    }
    function stripOrigin(id) {
      const strip = R('strip');
      if (strip.hidden) return null;
      const el = strip.querySelector('[data-chip="' + id + '"]') || strip.querySelector('.bd-lane');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width ? r : null;
    }
    /* A small pill flies from the processing lane to where the card landed. */
    function ghostFly(run, id, from) {
      if (reduced()) return;
      const fly = R('fly');
      if (fly.querySelectorAll('.bd-ghost').length >= 8) return;
      const col = view(run, id).place;
      const to = visibleRect(id) || R('h-' + col).getBoundingClientRect();
      const g = document.createElement('div');
      g.className = 'bd-ghost';
      const deep = run.results[id].verdict === 'deep tech';
      g.innerHTML = '<i style="background:' + (col === 'review' ? 'var(--escalate)' : deep ? 'var(--deep)' : 'var(--border-strong)') + '"></i>' + esc(C_BY_ID[id].name);
      const rr = root.getBoundingClientRect();
      g.style.left = (from.left - rr.left) + 'px'; g.style.top = (from.top - rr.top) + 'px';
      fly.appendChild(g);
      if (!g.animate) { g.remove(); return; }
      const anim = g.animate([
        { transform: 'translate(0px, 0px)', opacity: 1 },
        { transform: 'translate(' + (to.left + 12 - from.left) + 'px, ' + (to.top + 8 - from.top) + 'px)', opacity: 0.3 },
      ], { duration: 260, easing: EASE, fill: 'forwards' });
      anims.add(anim);
      const done = () => { anims.delete(anim); g.remove(); };
      anim.onfinish = done; anim.oncancel = done;
    }

    /* ---------- moves, decisions, undo ---------- */
    function moveCard(id, to, how, from) {
      const run = activeRun(); if (run.kind !== 'rows') return false;
      const v = view(run, id); if (!v.r) return false;
      if (v.place === to) { if (how !== 'drag') toast(v.c.name + ' is already in ' + COL_LABEL[to]); return false; }
      const src = v.place;
      const srcIdx = colIds(run, src).indexOf(id);
      const fromRect = from || visibleRect(id);
      const focusInBoard = R('board').contains(document.activeElement);
      const prev = run.decisions[id] ? Object.assign({}, run.decisions[id]) : null;
      if (to === 'review') { if (v.flagged) delete run.decisions[id]; else run.decisions[id] = { verdict: null, at: Date.now() }; }
      else run.decisions[id] = { verdict: VERDICT_OF[to], at: Date.now() };
      S.undo.push({ runId: run.id, id, prev });
      if (S.undo.length > 60) S.undo.shift();
      S.recent = id;
      renderCounts();
      flyFrom(id, fromRect, how === 'drag' ? 200 : 220);
      if (focusInBoard && how !== 'drag') {
        const list = colIds(run, src);
        focusCard(list.length ? list[Math.min(srcIdx, list.length - 1)] : id);
      }
      const nv = view(run, id);
      let body;
      if (to === 'review') body = v.flagged ? 'Decision removed; back in the pile as ' + v.r.risk + '.' : 'Pulled back for review; counts as Needs review until you place it.';
      else body = (nv.overturned ? 'Overturns the pipeline (' + vLabel(v.r.verdict).toLowerCase() + ')' : 'Confirms the pipeline') + ' · Action: ' + nv.action;
      toast(v.c.name + ' → ' + COL_LABEL[to], body, { key: 'move', ms: 6000, actions: [{ label: 'Undo', act: 'undo', kbd: 'U' }, { label: run.notes[id] ? 'Edit note' : 'Add note', act: 'add-note', id }] });
      return true;
    }

    function undo() {
      const run = activeRun();
      let entry = null;
      for (let i = S.undo.length - 1; i >= 0; i--) if (S.undo[i].runId === run.id) { entry = S.undo.splice(i, 1)[0]; break; }
      if (!entry) { toast('Nothing to undo', run.kind === 'rows' ? 'No moves on this run yet.' : ''); return; }
      const fromRect = visibleRect(entry.id);
      const focusInBoard = R('board').contains(document.activeElement);
      if (entry.prev) run.decisions[entry.id] = entry.prev; else delete run.decisions[entry.id];
      S.recent = entry.id;
      renderCounts();
      flyFrom(entry.id, fromRect, 220);
      if (focusInBoard) focusCard(entry.id);
      const old = R('toasts').querySelector('[data-key="move"]'); if (old) old.remove();
      toast('Undone: ' + C_BY_ID[entry.id].name, 'Back in ' + COL_LABEL[view(run, entry.id).place] + '.', { key: 'undo' });
    }

    function nextReview() {
      const run = activeRun(); if (run.kind !== 'rows') return;
      const list = colIds(run, 'review');
      if (!list.length) { toast('Nothing left to review', run.status === 'running' ? 'Flagged companies collect in the middle column as they finish.' : 'Every flagged company has been placed.'); return; }
      const cur = S.sheet ? S.sheet.id : focusedCardId();
      const next = list[(list.indexOf(cur) + 1) % list.length];
      if (S.sheet) {
        S.sheet.col = 'review'; S.sheet.id = next; S.sheet.idx = list.indexOf(next); S.colFocus.review = next;
        renderSheet(); renderBoard(); ensureVisible(next);
      } else focusCard(next);
    }

    /* ---------- keyboard navigation on the board ---------- */
    function navList(run, col, keep) {
      const ids = colIds(run, col);
      return filtering() ? ids.filter((id) => id === keep || matches(view(run, id))) : ids;
    }
    function firstCard(run) {
      for (const col of ['review', 'deep', 'general']) {
        const l = navList(run, col);
        if (l.length) return l.indexOf(S.colFocus[col]) >= 0 ? S.colFocus[col] : l[0];
      }
      return null;
    }
    function boardNav(delta) {
      const run = activeRun();
      const cur = focusedCardId();
      if (!cur) { const f = firstCard(run); if (f) focusCard(f); return; }
      const list = navList(run, view(run, cur).place, cur);
      const i = list.indexOf(cur);
      focusCard(list[clamp(i + delta, 0, list.length - 1)]);
    }
    function boardCol(dir) {
      const run = activeRun();
      const cur = focusedCardId();
      if (!cur) { const f = firstCard(run); if (f) focusCard(f); return; }
      const col = view(run, cur).place;
      const idx = navList(run, col, cur).indexOf(cur);
      for (let c = COLS.indexOf(col) + dir; c >= 0 && c < COLS.length; c += dir) {
        const l = navList(run, COLS[c]);
        if (l.length) { focusCard(l[Math.min(idx, l.length - 1)]); return; }
      }
    }
    function focusFirstMatch() {
      const run = activeRun(); if (run.kind !== 'rows') return;
      for (const col of ['review', 'deep', 'general']) {
        const l = navList(run, col);
        if (l.length) { focusCard(l[0]); return; }
      }
    }

    /* ---------- evidence sheet ---------- */
    let sheetCloseTimer = null;
    function openSheet(id, opts) {
      const run = activeRun(); if (run.kind !== 'rows') return;
      const v = view(run, id); if (!v.r) return;
      const wasOpen = !!S.sheet;
      S.sheet = { id, col: v.place, idx: colIds(run, v.place).indexOf(id), returnFocus: wasOpen ? S.sheet.returnFocus : document.activeElement };
      S.colFocus[v.place] = id;
      renderSheet(); renderBoard();
      ensureVisible(id);
      const sh = sheetEl();
      if (!sh) return;
      if (opts && opts.note) {
        const ta = sh.querySelector('[data-fk="note"]');
        if (ta) { ta.focus({ preventScroll: true }); ta.setSelectionRange(ta.value.length, ta.value.length); ta.scrollIntoView({ block: 'nearest' }); }
      } else if (!sh.contains(document.activeElement)) sh.focus({ preventScroll: true });
    }
    function closeSheet(immediate) {
      if (!S.sheet) return;
      const id = S.sheet.id; const ret = S.sheet.returnFocus;
      S.sheet = null;
      const host = R('sheet'); const el = host.querySelector('.bd-sheet');
      const hadFocus = !!(el && el.contains(document.activeElement));
      if (el) {
        if (immediate || reduced()) host.innerHTML = '';
        else {
          el.classList.add('is-leaving');
          cancel(sheetCloseTimer);
          sheetCloseTimer = later(() => { const x = host.querySelector('.bd-sheet.is-leaving'); if (x) x.remove(); }, 170);
        }
      }
      renderBoard();
      if (immediate) return;
      if (hadFocus || !root.contains(document.activeElement)) {
        if (cardMain(id)) focusCard(id);
        else if (ret && root.contains(ret) && ret.focus) ret.focus();
      }
    }
    function sheetNav(delta) {
      const run = activeRun(); const sh = S.sheet;
      const list = colIds(run, sh.col);
      if (!list.length) return;
      const i = list.indexOf(sh.id);
      const ni = clamp(i >= 0 ? i + delta : (delta > 0 ? sh.idx : sh.idx - 1), 0, list.length - 1);
      if (list[ni] === sh.id) return;
      sh.id = list[ni]; sh.idx = ni; S.colFocus[sh.col] = sh.id;
      renderSheet(); renderBoard(); ensureVisible(sh.id);
    }

    function renderSheet() {
      if (!S.sheet) return;
      const run = activeRun();
      const v = view(run, S.sheet.id);
      if (!v.r) { closeSheet(true); return; }
      const host = R('sheet');
      if (!sheetEl()) {
        cancel(sheetCloseTimer);
        host.innerHTML = '<section class="bd-sheet" role="dialog" aria-modal="false" aria-labelledby="bd-sh-title" tabindex="-1"><header class="bd-sh-h" data-r="sh-h"></header><div class="bd-sh-b" data-r="sh-b"></div></section>';
      }
      const list = colIds(run, S.sheet.col);
      const i = list.indexOf(v.c.id);
      if (i >= 0) S.sheet.idx = i;
      put(R('sh-h'), sheetHeadHtml(run, v, list, i));
      const body = R('sh-b');
      const changed = body.getAttribute('data-id') !== v.c.id;
      const st = body.scrollTop;
      put(body, sheetBodyHtml(run, v));
      body.setAttribute('data-id', v.c.id);
      body.scrollTop = changed ? 0 : st;
    }

    function sheetHeadHtml(run, v, list, i) {
      const sh = S.sheet; const c = v.c; const r = v.r;
      const pos = i >= 0
        ? (i + 1) + ' of ' + list.length + ' in ' + COL_LABEL[sh.col]
        : 'Now in ' + COL_LABEL[v.place] + (list.length ? ' · J for the next in ' + COL_LABEL[sh.col] : '');
      const prevOff = i >= 0 ? i === 0 : sh.idx <= 0;
      const nextOff = !list.length || (i >= 0 ? i === list.length - 1 : false);
      const k = counts(run);
      const more = k.open > (v.open ? 1 : 0);
      return '<div class="bd-sh-nav"><button class="bd-btn bd-btn-sm" data-act="sheet-prev" data-fk="sh-prev" ' + (prevOff ? 'disabled' : '') + ' aria-label="Previous company (K)">Prev <kbd>K</kbd></button>' +
        '<button class="bd-btn bd-btn-sm" data-act="sheet-next" data-fk="sh-next" ' + (nextOff ? 'disabled' : '') + ' aria-label="Next company (J)">Next <kbd>J</kbd></button></div>' +
        '<div class="bd-sh-t"><div class="bd-sh-pos bd-num">' + esc(pos) + '</div><h2 id="bd-sh-title">' + esc(c.name) + '</h2>' +
        '<div class="bd-sh-sub">' + (run.cfg.mapping.uen ? '<span class="bd-mono">UEN ' + esc(c.uen) + '</span>' : '') + '<span>' + esc(c.domain) + '</span><span class="bd-num">Row ' + v.idx + ' of ' + run.ids.length + '</span></div></div>' +
        '<div class="bd-sh-v">' + verdictHtml(v.verdict) + '<div>' + riskHtml(r.risk) + ' · ' + (v.reviewed ? 'Reviewed: ' : '') + v.action + '</div></div>' +
        '<div class="bd-sh-conf"><b>' + r.conf + '</b><span>' + confWord(r.conf) + ' confidence</span></div>' +
        '<div class="bd-sh-acts">' + (more ? '<button class="bd-btn bd-btn-sm" data-act="next-review" data-fk="sh-nextrev">Next to review <kbd>N</kbd></button>' : '') +
        '<button class="bd-btn bd-btn-ghost bd-btn-sm" data-act="close-sheet" data-fk="sh-close" aria-label="Close evidence (Esc)">Close <kbd>Esc</kbd></button></div>';
    }

    function sheetBodyHtml(run, v) {
      const r = v.r;
      const facts = '<section class="bd-sec"><div class="bd-sec-h">Run facts</div><dl class="bd-kv"><dt>Cost</dt><dd class="bd-num">' + (r.cost == null ? 'unknown (pinned model has no listed price)' : money(r.cost, 3)) + '</dd><dt>Time</dt><dd class="bd-num">' + r.timeS.toFixed(1) + ' s</dd><dt>Model</dt><dd class="bd-mono">' + esc(run.model) + '</dd></dl></section>';
      return '<div class="bd-sh-grid">' +
        '<div class="bd-sh-c">' + flagHtml(run, r) + placeHtml(run, v) + facts + '</div>' +
        '<div class="bd-sh-c">' + buildHtml(run, r) + criteriaHtml(v.c) + '</div>' +
        '<div class="bd-sh-c">' + evidenceHtml(v.c, r) + patentsHtml(r) + validatorHtml(run, r) + '</div>' +
        '</div>';
    }

    function placeHtml(run, v) {
      const id = v.c.id; const r = v.r;
      const b = (to, inner) => '<button class="bd-place-b to-' + to + '" data-act="move" data-id="' + id + '" data-to="' + to + '" data-fk="place-' + to + '" aria-pressed="' + (v.place === to) + '">' + inner + '</button>';
      const pipe = vLabel(r.verdict).toLowerCase();
      let st;
      if (v.reviewed) st = (v.overturned ? 'You overturned the pipeline, which said <b>' + pipe + '</b>. ' : 'You confirmed the pipeline verdict. ') + 'Action in the workbook: <b>' + v.action + '</b>.';
      else if (v.pulled) st = 'You pulled this back for review. The pipeline settled it as <b>' + pipe + '</b> (Clear). Place it to record a decision.';
      else if (v.open) st = 'Undecided. The pipeline leans <b>' + pipe + '</b> ' + (r.verdict === 'deep tech' ? '◂' : '▸') + '. Placing it in a column records your decision.';
      else st = 'Settled by the pipeline as <b>' + pipe + '</b> (Clear). Move it across to overturn the verdict, or back to Needs review.';
      const note = run.notes[id] || '';
      return '<section class="bd-sec"><div class="bd-sec-h">Placement<span>Recorded in the workbook</span></div>' +
        '<div class="bd-place" role="group" aria-label="Place this company">' +
        b('deep', '<span class="bd-place-ar" aria-hidden="true">◂</span><span class="bd-place-x"><b>Deep tech</b><small>Approve' + (r.verdict === 'deep tech' ? ' · pipeline' : '') + '</small></span><kbd aria-hidden="true">D</kbd>') +
        b('review', '<span class="bd-place-x"><b>Needs review</b><small>Undecided</small></span><kbd aria-hidden="true">B</kbd>') +
        b('general', '<kbd aria-hidden="true">G</kbd><span class="bd-place-x"><b>General tech</b><small>' + (r.verdict === 'general tech' ? 'pipeline · ' : '') + 'Reject</small></span><span class="bd-place-ar" aria-hidden="true">▸</span>') +
        '</div><p class="bd-place-st">' + st + '</p>' +
        '<label class="bd-note-l" for="bd-note">Note for the record <span>optional</span></label>' +
        '<textarea id="bd-note" data-fk="note" placeholder="Why this placement? Saved in the workbook next to the decision.">' + esc(note) + '</textarea>' +
        '<div class="bd-hint">' + (v.reviewed ? 'Saved with your decision.' : 'Kept with the company and recorded when you place it.') + '</div></section>';
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
        p = 'A second pass argued for ' + vLabel(flip(r.verdict)).toLowerCase() + ', with confidence ' + r.val.confidence + '. That is below the ' + run.cfg.overrideMinConfidence + ' needed to change the verdict, so the original verdict stands with reduced confidence. Two readings are plausible.';
      } else {
        t = 'Escalate: needs a human decision';
        p = 'The validator found the evidence contradictory or insufficient and handed the call to a reviewer.';
      }
      const reason = r.val && r.val.escalationReason ? '<p><b>Reason:</b> ' + esc(r.val.escalationReason) + '</p>' : '';
      return '<section class="bd-sec"><div class="bd-flag r-' + r.risk + '"><div class="bd-flag-t">' + t + '</div><p>' + p + '</p>' + reason + '</div></section>';
    }

    function buildHtml(run, r) {
      const cfg = run.cfg;
      const th = cfg.validatorThreshold;
      let rows = '<tr><td>Classifier score<span class="bd-why">Agent 1 confidence in its verdict</span></td><td>' + r.llm + '</td></tr>';
      const patWhy = !cfg.epo ? 'Patent lookup was off for this run' : r.adj === 0 ? (r.patents.count ? 'Patents are not deep tech; no adjustment' : 'No patents found; no adjustment') : r.patents.level + ' portfolio, ' + r.patents.count + ' patent' + (r.patents.count === 1 ? '' : 's') + ', max ±' + cfg.epoAdjustMax;
      rows += '<tr><td>Patent adjustment<span class="bd-why">' + esc(patWhy) + '</span></td><td>' + signed(r.adj) + '</td></tr>';
      if (r.capped && !r.validated) rows += '<tr><td>Low-evidence cap<span class="bd-why">No description and no patents</span></td><td>≤ ' + cfg.lowEvidenceCap + '</td></tr>';
      rows += '<tr><td>Before validation<span class="bd-why">' + (!cfg.validator ? 'Validation off for this run' : r.validated ? 'Below ' + th + ', so the validator ran' : r.pre < th ? 'Below ' + th + '; validator not triggered in this run' : th + ' or more, so no validation needed') + '</span></td><td>' + r.pre + '</td></tr>';
      if (r.validated) {
        const how = r.val.verdict === 'confirm' ? 'Confirmed: takes the validator’s confidence'
          : r.override === 'applied' ? 'Override applied: verdict flipped, takes the validator’s confidence'
            : r.override === 'blocked' ? 'Override blocked: at most 100 − ' + r.val.confidence
              : 'Insufficient evidence: confidence can only go down';
        rows += '<tr><td>Validator<span class="bd-why">' + how + (r.capped ? '; low-evidence cap ' + cfg.lowEvidenceCap : '') + '</span></td><td>' + signed(r.conf - r.pre) + '</td></tr>';
      }
      rows += '<tr class="is-total"><td>Final confidence</td><td>' + r.conf + '</td></tr>';
      const track = '<div class="bd-track" aria-hidden="true"><span class="bd-track-l"></span><span class="bd-track-th" style="left:' + th + '%"></span>' +
        (r.pre !== r.conf ? '<span class="bd-track-pre" style="left:' + r.pre + '%"></span>' : '') + '<span class="bd-track-fin" style="left:' + r.conf + '%"></span></div>' +
        '<div class="bd-track-ax"><span>0</span><span>' + (r.pre !== r.conf ? '○ before validation · ● final · ' : '') + 'dashed: validation threshold ' + th + '</span><span>100</span></div>';
      return '<section class="bd-sec"><div class="bd-sec-h">How confidence was built</div><table class="bd-build"><tbody>' + rows + '</tbody></table>' + track + '</section>';
    }

    function criteriaHtml(c) {
      const met = CRIT.filter((x) => c.criteria[x[0]].met).length;
      return '<section class="bd-sec"><div class="bd-sec-h">Criteria<span class="bd-num">' + met + ' of 3 met</span></div>' + CRIT.map((x) => {
        const cr = c.criteria[x[0]];
        return '<div class="bd-crit"><span class="bd-mk ' + (cr.met ? 'is-y' : 'is-n') + '" aria-hidden="true">' + (cr.met ? '✓' : x[1]) + '</span><b>' + x[2] + ' · ' + (cr.met ? 'met' : 'not met') + '</b><p>' + esc(cr.reasoning) + '</p></div>';
      }).join('') + '<div class="bd-quote" style="margin-top:8px">' + esc(c.reasoning) + '<span class="bd-quote-src">Classifier reasoning</span></div></section>';
    }

    function evidenceHtml(c, r) {
      const BASIS = { COMBINED: 'Input and web descriptions', WEB_DESCRIPTION: 'Web description', DESCRIPTION_ONLY: 'Input description only' };
      let q = '';
      if (r.hasWeb) q += '<div class="bd-quote">' + esc(c.webDescription) + '<span class="bd-quote-src">Web enrichment · ' + esc(c.webSource) + '</span></div>';
      if (r.hasInputDesc) q += '<div class="bd-quote">' + esc(c.description) + '<span class="bd-quote-src">Input file</span></div>';
      if (!q) q = '<div class="bd-quote"><span class="bd-muted">No description in the input file' + (c.webStatus === 'not_found' ? ' and nothing reliable found on the web' : '') + '. The verdict rests on the company name' + (r.patents.count ? ' and patents' : '') + '.</span></div>';
      return '<section class="bd-sec"><div class="bd-sec-h">What the classifier read<span>' + BASIS[r.basis] + '</span></div>' + q + '</section>';
    }

    function patentsHtml(r) {
      const p = r.patents;
      if (p.status === 'disabled') return '<section class="bd-sec"><div class="bd-sec-h">Patents (EPO)</div><p class="bd-muted">Patent lookup was off for this run.</p></section>';
      const cpc = p.cpc.map((x) => '<div class="bd-cpc"><code>' + esc(x.code) + '</code><span>' + esc(x.desc) + '</span></div>').join('');
      return '<section class="bd-sec"><div class="bd-sec-h">Patents (EPO)<span class="bd-num">' + p.count + ' found</span></div><dl class="bd-kv"><dt>Deep tech level</dt><dd>' + esc(p.level) + '</dd>' + (p.domain ? '<dt>Domain</dt><dd>' + esc(p.domain) + '</dd>' : '') + '<dt>Lookup</dt><dd>' + (p.status === 'success' ? 'Matched in EPO' : 'No matching applicant') + '</dd></dl>' + (cpc ? '<div style="margin-top:6px">' + cpc + '</div>' : '') + '</section>';
    }

    function validatorHtml(run, r) {
      if (!r.validated) {
        const why = !run.cfg.validator ? 'Validation was off for this run.' : 'Not run: confidence before validation was ' + r.pre + ', at or above the threshold of ' + run.cfg.validatorThreshold + ', or this company was not flagged for a second pass.';
        return '<section class="bd-sec"><div class="bd-sec-h">Validator (Agent 2)</div><p class="bd-muted">' + why + '</p></section>';
      }
      const V = { confirm: 'Confirmed the verdict', override: 'Argued for the other verdict', insufficient_evidence: 'Insufficient evidence' };
      const DEC = { AUTO_APPROVE: 'No escalation', ESCALATE_FOR_HUMAN_REVIEW: 'Escalated for human review' };
      const val = r.val;
      return '<section class="bd-sec"><div class="bd-sec-h">Validator (Agent 2)<span class="bd-num">confidence ' + val.confidence + '</span></div><dl class="bd-kv"><dt>Finding</dt><dd>' + V[val.verdict] + (r.override ? ' (override ' + r.override + ')' : '') + '</dd><dt>Decision</dt><dd>' + DEC[val.decision] + '</dd></dl>' +
        '<div class="bd-quote" style="margin-top:6px">' + esc(val.summary) + '</div>' +
        '<div class="bd-sec-h" style="margin-top:8px">Sources<span class="bd-num">' + val.sources.length + '</span></div><ul class="bd-srcs">' + val.sources.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ul></section>';
    }

    /* ---------- run switching ---------- */
    function openMenu() {
      S.menu = true; renderRunwrap();
      const cur = R('runwrap').querySelector('[data-fk="menu-' + S.activeId + '"]') || R('runwrap').querySelector('.bd-menu-i');
      if (cur) cur.focus();
    }
    function closeMenu(refocus) {
      if (!S.menu) return;
      S.menu = false; renderRunwrap();
      if (refocus) { const b = R('runwrap').querySelector('[data-fk="runbtn"]'); if (b) b.focus(); }
    }
    function openRun(id) {
      S.menu = false;
      if (S.activeId === id) { renderRunwrap(); return; }
      closeSheet(true);
      S.activeId = id;
      S.q = ''; S.bin = null; S.recent = null;
      root.querySelector('[data-fk="search"]').value = '';
      S.colFocus = { deep: null, review: null, general: null };
      markSeen(activeRun());
      renderAll();
      COLS.forEach((c) => { R('b-' + c).scrollTop = 0; });
    }

    /* ---------- toasts ---------- */
    function toast(title, body, opts) {
      opts = opts || {};
      const host = R('toasts');
      if (opts.key) { const old = host.querySelector('[data-key="' + opts.key + '"]'); if (old) old.remove(); }
      const el = document.createElement('div');
      el.className = 'bd-toast';
      if (opts.key) el.setAttribute('data-key', opts.key);
      el.innerHTML = '<b>' + esc(title) + '</b>' + (body ? '<span>' + esc(body) + '</span>' : '') +
        (opts.actions ? '<div class="bd-toast-acts">' + opts.actions.map((a) => '<button class="bd-tbtn" data-act="' + a.act + '"' + (a.id ? ' data-id="' + a.id + '"' : '') + '>' + esc(a.label) + (a.kbd ? ' <kbd aria-hidden="true">' + a.kbd + '</kbd>' : '') + '</button>').join('') + '</div>' : '');
      host.appendChild(el);
      while (host.children.length > 3) host.removeChild(host.firstChild);
      later(() => {
        if (!el.isConnected) return;
        el.classList.add('is-leaving');
        later(() => el.remove(), 170);
      }, opts.ms || 3400);
    }

    function download() {
      const run = activeRun();
      const base = run.file.replace(/\.(xlsx|xls|csv)$/i, '');
      const name = base + '_classified_' + run.id.replace(/^run_/, '') + '.xlsx';
      if (run.kind === 'rows') {
        const k = counts(run);
        const partial = k.done < k.total;
        const decs = Object.keys(run.decisions).filter((id) => run.decisions[id].verdict).length;
        const notes = Object.keys(run.notes).filter((id) => run.notes[id].trim()).length;
        toast((partial ? 'Saved partial workbook ' : 'Saved ') + name, (partial ? k.done + ' of ' + k.total + ' companies · ' : '') + 'Overview, Management View, Full Detail, Legend' +
          (decs ? ' · ' + decs + ' reviewer decision' + (decs === 1 ? '' : 's') : '') + (notes ? ' · ' + notes + ' note' + (notes === 1 ? '' : 's') : '') + (k.open ? ' · ' + k.open + ' still Needs Review' : ''));
      } else {
        const s = run.summary;
        toast((s.done < s.total ? 'Saved partial workbook ' : 'Saved ') + name, s.done + ' of ' + s.total + ' companies · Overview, Management View, Full Detail, Legend');
      }
    }

    /* ---------- New-run drawer (ported from Workbench) ---------- */
    function openDrawer(fromRun) {
      if (S.drawer) return;
      S.menu = false; renderRunwrap();
      const draft = fromRun && fromRun.cfg ? JSON.parse(JSON.stringify(fromRun.cfg)) : defaultCfg();
      draft.file = fromRun && fromRun.kind === 'rows' ? { name: D.file.name, rows: D.file.rows, note: '' } : null;
      S.drawer = { draft, returnFocus: document.activeElement, over: false };
      const ov = R('overlay');
      ov.innerHTML = '<div class="bd-scrim" data-act="close-drawer"></div>' +
        '<section class="bd-drawer" role="dialog" aria-modal="true" aria-labelledby="bd-dr-t">' +
        '<div class="bd-dr-head"><div class="bd-dr-title"><h2 id="bd-dr-t">' + (fromRun ? 'New run with the same settings' : 'New run') + '</h2><button class="bd-btn bd-btn-ghost bd-btn-sm" data-act="close-drawer" aria-label="Close" data-fk="dr-close">Close <kbd>Esc</kbd></button></div><div data-r="dr-est"></div></div>' +
        '<div class="bd-dr-body" data-r="dr-body"></div></section>';
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
      ov.querySelectorAll('.bd-scrim, .bd-drawer').forEach((n) => n.classList.add('is-leaving'));
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
      const sample = estimate(Object.assign({}, d, { file: { rows: D.file.rows } }));
      const shown = e.rows ? e.cost : sample.cost;
      const secs = e.rows ? e.secs : sample.secs;
      put(R('dr-est'), '<div class="bd-est">' +
        '<div><div class="bd-est-l">Est. cost' + per + '</div><div class="bd-est-v">' + (e.known ? money(shown) : 'unknown') + '</div></div>' +
        '<div><div class="bd-est-l">Duration</div><div class="bd-est-v">' + fmtDur(secs) + '</div></div>' +
        '<div class="bd-est-split">' + (e.known ? '<div class="bd-est-bar" aria-hidden="true">' + seg(e.parts.classify, 'var(--accent)') + seg(e.parts.enrich, 'var(--deep)') + seg(e.parts.validate, 'var(--contested)') + '</div>' +
          '<div class="bd-est-lg"><span><i style="background:var(--accent)"></i>Classify ' + Math.round(e.parts.classify / tot * 100) + '%</span><span><i style="background:var(--deep)"></i>Enrich ' + Math.round(e.parts.enrich / tot * 100) + '%</span><span><i style="background:var(--contested)"></i>Validate ' + Math.round(e.parts.validate / tot * 100) + '%</span></div>'
          : '<div class="bd-est-lg">Pinned model is not priced in pipeline/models.py; token totals will be reported instead.</div>') + '</div>' +
        '<button class="bd-btn bd-btn-primary" data-act="start" data-fk="start" ' + (prob ? 'disabled' : '') + '>Start run</button>' +
        (prob ? '<div class="bd-est-why">' + esc(prob) + '</div>' : '') +
        '<div class="bd-est-note">' + esc(modelFor(d)) + ' · ' + (e.batch ? 'batch mode halves classifier cost; a real batch job can take up to an hour' : 'one company at a time') + ' · web searches are usually the largest part of the bill</div>' +
        '</div>');
    }

    function renderDrawerBody() {
      const d = S.drawer.draft;
      const f = D.file;
      let h = '<fieldset class="bd-fs"><legend>Input file</legend>';
      if (!d.file) {
        h += '<div class="bd-drop ' + (S.drawer.over ? 'is-over' : '') + '" data-dropzone><b>Drop an .xlsx, .xls or .csv file here</b>One row per company. Column headers are matched case-insensitively.<br><button class="bd-btn" data-act="use-sample" data-fk="use-sample">Use sample file · ' + esc(f.name) + '</button></div>';
      } else {
        h += '<div class="bd-file"><div><div class="bd-file-n">' + esc(d.file.name) + '</div><div class="bd-file-m bd-num">' + f.rows + ' rows · ' + f.skipped + ' skipped (empty name) · ' + f.headers.length + ' columns</div></div><button class="bd-btn bd-btn-sm" data-act="clear-file" data-fk="clear-file">Change file</button></div>';
        if (d.file.note) h += '<div class="bd-hint">' + esc(d.file.note) + '</div>';
        const used = {};
        FIELDS.forEach((fl) => { const col = d.mapping[fl.key]; if (col) used[col] = (used[col] || 0) + 1; });
        h += '<div class="bd-map">' + FIELDS.map((fl) => {
          const cur = d.mapping[fl.key] || '';
          const auto = cur && cur === f.mapping[fl.key];
          const opts = (fl.required ? '<option value="">Choose a column</option>' : '<option value="">Not mapped</option>') + f.headers.map((hd) => '<option value="' + esc(hd) + '"' + (hd === cur ? ' selected' : '') + '>' + esc(hd) + '</option>').join('');
          const tag = !cur ? (fl.required ? '<span class="bd-tag is-req">Required</span>' : '<span class="bd-tag">Skipped</span>') : auto ? '<span class="bd-tag is-auto">Detected</span>' : used[cur] > 1 ? '<span class="bd-tag is-req">Used twice</span>' : '<span class="bd-tag">Changed</span>';
          return '<label for="bd-map-' + fl.key + '">' + fl.label + '</label><select id="bd-map-' + fl.key + '" data-map="' + fl.key + '" data-fk="map-' + fl.key + '">' + opts + '</select>' + tag;
        }).join('') + '</div>';
        if (!d.mapping.description) h += '<div class="bd-warn">' + (d.enrichment ? 'No description column: classification will rely on web enrichment.' : 'No description and enrichment is off: companies without patents are capped at ' + d.lowEvidenceCap + ' confidence.') + '</div>';
        const extra = f.headers.filter((hd) => !Object.values(d.mapping).includes(hd));
        h += '<table class="bd-prev"><thead><tr>' + FIELDS.map((fl) => '<th>' + fl.label + '</th>').join('') + '</tr></thead><tbody>' + f.preview.map((row) => '<tr>' + FIELDS.map((fl) => {
          const col = d.mapping[fl.key];
          return col ? '<td title="' + esc(row[col] || '') + '">' + esc(row[col] != null ? row[col] : '') + '</td>' : '<td class="is-none">not mapped</td>';
        }).join('') + '</tr>').join('') + '</tbody></table>';
        h += '<div class="bd-hint">First ' + f.preview.length + ' of ' + f.rows + ' rows. Carried through to the output unchanged: ' + esc(extra.join(', ') || 'none') + '.</div>';
      }
      h += '</fieldset>';
      const prov = provById(d.provider);
      h += '<fieldset class="bd-fs"><legend>Model</legend><div class="bd-provs" role="radiogroup" aria-label="Provider">' + D.providers.map((p) =>
        '<label class="bd-opt"><input type="radio" name="bd-prov" value="' + p.id + '" data-fk="prov-' + p.id + '"' + (p.id === d.provider ? ' checked' : '') + '><span class="bd-opt-t">' + esc(p.label) + '</span><span class="bd-opt-s ' + (p.keySet ? 'is-ok' : 'is-miss') + '">' + (p.keySet ? 'Key set' : p.keyVar + ' missing') + '</span></label>').join('') + '</div>';
      if (!prov.keySet) h += '<div class="bd-warn">Add ' + prov.keyVar + ' to .env and reopen this panel to use ' + prov.label + '.</div>';
      h += '<div class="bd-tiers" role="radiogroup" aria-label="Tier">' + ['fast', 'balanced', 'best'].map((t) =>
        '<label class="bd-opt"><input type="radio" name="bd-tier" value="' + t + '" data-fk="tier-' + t + '"' + (t === d.tier ? ' checked' : '') + '><span class="bd-opt-t">' + t[0].toUpperCase() + t.slice(1) + ' · ' + esc(prov.tiers[t]) + '</span><span class="bd-opt-s bd-num">~' + money(D.estCostPerCompany[t], 2) + ' per company</span></label>').join('') + '</div>';
      h += '<div class="bd-row2"><label for="bd-pin">Pin exact model</label><input id="bd-pin" class="bd-input bd-mono" data-field="model" data-fk="pin" placeholder="' + esc(MODEL_IDS[d.provider][d.tier]) + ' (from tier)" value="' + esc(d.model) + '" autocomplete="off" spellcheck="false"></div>';
      h += '<div class="bd-hint">Leave empty to use the tier. Pin a model for audits or runs you will compare over time.' + (d.model && !KNOWN_MODELS.has(d.model.trim()) ? ' This model is not listed in pipeline/models.py: it runs with the original request settings and its cost shows as unknown.' : '') + '</div></fieldset>';
      const tg = (key, title, sub, disabled) => '<label class="bd-tg ' + (disabled ? 'is-disabled' : '') + '"><span class="bd-tg-t">' + title + '</span><span class="bd-tg-s">' + sub + '</span><input type="checkbox" class="bd-switch" data-toggle="' + key + '" data-fk="tg-' + key + '"' + (d[key] && !disabled ? ' checked' : '') + (disabled ? ' disabled' : '') + '></label>';
      h += '<fieldset class="bd-fs"><legend>Steps</legend>' +
        tg('enrichment', 'Web enrichment', 'Search the web for a current description before classifying') +
        tg('epo', 'Patent lookup', 'EPO patent data adjusts confidence by up to ±' + d.epoAdjustMax + (D.epoKeysSet ? ' · EPO keys set' : ' · EPO keys missing; the run continues without patents')) +
        tg('validator', 'Validation', 'A second pass searches the web when confidence is below ' + d.validatorThreshold + ', then confirms, overrides or escalates') +
        tg('batch', 'Batch mode', prov.batch ? 'Classify all companies in one batch job: about half the classifier cost, but results can take an hour or more' : 'Only Anthropic supports batch jobs; ' + prov.label + ' processes companies one at a time', !prov.batch) +
        '</fieldset>';
      h += '<fieldset class="bd-fs"><legend>Thresholds</legend><div class="bd-th-grid">' + THRESHOLDS.map((t) => {
        const off = t.needs && !d[t.needs];
        return '<label class="bd-thf ' + (off ? 'is-off' : '') + '"><span>' + t.label + '</span><input type="number" class="bd-input" min="' + t.min + '" max="' + t.max + '" data-num="' + t.key + '" data-fk="num-' + t.key + '" value="' + d[t.key] + '"' + (off ? ' disabled' : '') + '><small>' + t.help + (off ? ' (step is off)' : '') + '</small></label>';
      }).join('') + '</div><div class="bd-fs-foot"><button class="bd-btn bd-btn-ghost bd-btn-sm" data-act="reset-th" data-fk="reset-th">Reset thresholds to defaults</button></div></fieldset>';
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
      openRun(run.id);
      startEngine(run);
      renderAll();
      const stop = R('strip').querySelector('[data-fk="stop"]');
      if (stop) stop.focus();
    }

    /* ---------- drag (pointer events + pointer capture) ---------- */
    let drag = null;
    let suppressClick = false;
    function onPointerDown(e) {
      if (drag || e.button !== 0 || S.drawer) return;
      const card = e.target.closest ? e.target.closest('.bd-card[data-card]') : null;
      if (!card || !R('board').contains(card)) return;
      if (e.target.closest('.bd-acts')) return;
      if (e.pointerType === 'touch' && !e.target.closest('.bd-grip')) return;
      if (activeRun().kind !== 'rows') return;
      drag = { id: card.getAttribute('data-card'), from: card.getAttribute('data-col'), pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, started: false, target: null };
      document.addEventListener('pointermove', onDragMove);
      document.addEventListener('pointerup', onDragUp);
      document.addEventListener('pointercancel', onDragCancel);
    }
    function detachDrag(d) {
      document.removeEventListener('pointermove', onDragMove);
      document.removeEventListener('pointerup', onDragUp);
      document.removeEventListener('pointercancel', onDragCancel);
      if (d && d.captured) { try { if (root.hasPointerCapture && root.hasPointerCapture(d.pointerId)) root.releasePointerCapture(d.pointerId); } catch (err) { /* already released */ } d.captured = false; }
      root.classList.remove('is-dragging');
      COLS.forEach((c) => { const el = colEl(c); if (el) el.classList.remove('is-droppable', 'is-over'); });
    }
    function liftCard() {
      const card = cardEl(drag.id);
      if (!card) { detachDrag(drag); drag = null; return; }
      const rect = card.getBoundingClientRect();
      const lift = card.cloneNode(true); scrub(lift); lift.classList.add('is-lift'); lift.classList.remove('is-open', 'is-recent');
      placeAt(lift, rect);
      lift.style.transformOrigin = (drag.sx - rect.left) + 'px ' + (drag.sy - rect.top) + 'px';
      R('fly').appendChild(lift);
      drag.lift = lift; drag.rect = rect; drag.started = true;
      try { if (root.setPointerCapture) { root.setPointerCapture(drag.pointerId); drag.captured = true; } } catch (err) { drag.captured = false; }
      S.liftedId = drag.id; card.classList.add('is-lifted');
      root.classList.add('is-dragging');
      const sh = sheetEl();
      drag.sheetTop = sh ? sh.getBoundingClientRect().top : Infinity;
      drag.cols = COLS.map((col) => ({ col, rect: colEl(col).getBoundingClientRect() }));
      COLS.forEach((col) => { if (col !== drag.from) colEl(col).classList.add('is-droppable'); });
    }
    function onDragMove(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const dx = e.clientX - drag.sx; const dy = e.clientY - drag.sy;
      if (!drag.started) {
        if (Math.hypot(dx, dy) < 5) return;
        liftCard();
        if (!drag) return;
      }
      e.preventDefault();
      drag.dx = dx; drag.dy = dy;
      drag.lift.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(1.02)';
      let t = null;
      if (e.clientY < drag.sheetTop) {
        drag.cols.forEach((c) => {
          if (c.col !== drag.from && e.clientX >= c.rect.left && e.clientX <= c.rect.right && e.clientY >= c.rect.top && e.clientY <= c.rect.bottom) t = c.col;
        });
      }
      if (t !== drag.target) {
        if (drag.target) colEl(drag.target).classList.remove('is-over');
        if (t) colEl(t).classList.add('is-over');
        drag.target = t;
      }
    }
    function onDragUp(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      if (!drag.started) { detachDrag(drag); drag = null; return; } // a plain click: let it select
      finishDrag(drag.target);
    }
    function onDragCancel(e) {
      if (!drag || e.pointerId !== drag.pointerId) return;
      if (!drag.started) { detachDrag(drag); drag = null; return; }
      finishDrag(null);
    }
    function finishDrag(target) {
      const d = drag; drag = null;
      detachDrag(d);
      suppressClick = true;
      later(() => { suppressClick = false; }, 0);
      if (target) {
        const from = { left: d.rect.left + d.dx, top: d.rect.top + d.dy };
        d.lift.remove();
        S.liftedId = null;
        moveCard(d.id, target, 'drag', from);
        return;
      }
      snapBack(d);
    }
    function snapBack(d) {
      const done = () => {
        if (d.lift) d.lift.remove();
        if (S.liftedId === d.id) S.liftedId = null;
        const cur = cardEl(d.id); if (cur) cur.classList.remove('is-lifted');
      };
      const cur = cardEl(d.id);
      if (!cur || reduced() || !d.lift.animate) { done(); return; }
      const to = cur.getBoundingClientRect();
      const anim = d.lift.animate([
        { transform: 'translate(' + d.dx + 'px, ' + d.dy + 'px) scale(1.02)' },
        { transform: 'translate(' + (to.left - d.rect.left) + 'px, ' + (to.top - d.rect.top) + 'px) scale(1)' },
      ], { duration: 200, easing: EASE, fill: 'forwards' });
      anims.add(anim);
      const end = () => { anims.delete(anim); done(); };
      anim.onfinish = end; anim.oncancel = end;
    }

    /* ---------- events ---------- */
    function onClick(e) {
      if (suppressClick) { suppressClick = false; return; }
      if (S.menu && !(e.target.closest && e.target.closest('[data-r="runwrap"]'))) closeMenu(false);
      const a = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!a || !root.contains(a)) return;
      const act = a.getAttribute('data-act');
      const run = activeRun();
      switch (act) {
        case 'toggle-menu': if (S.menu) closeMenu(true); else openMenu(); break;
        case 'open-run': openRun(a.getAttribute('data-id')); { const b = R('runwrap').querySelector('[data-fk="runbtn"]'); if (b) b.focus(); } break;
        case 'new-run': openDrawer(null); break;
        case 'rerun': openDrawer(run); break;
        case 'close-drawer': closeDrawer(); break;
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
        case 'bin': { const b = +a.getAttribute('data-bin'); S.bin = S.bin === b ? null : b; renderHist(); renderBoard(); break; }
        case 'open': openSheet(a.getAttribute('data-id')); break;
        case 'move': moveCard(a.getAttribute('data-id'), a.getAttribute('data-to'), a.closest('.bd-sheet') ? 'sheet' : 'button'); break;
        case 'close-sheet': closeSheet(); break;
        case 'sheet-prev': if (S.sheet) sheetNav(-1); break;
        case 'sheet-next': if (S.sheet) sheetNav(1); break;
        case 'next-review': nextReview(); break;
        case 'undo': undo(); break;
        case 'add-note': { const id = a.getAttribute('data-id'); if (run.kind === 'rows' && run.results[id]) openSheet(id, { note: true }); break; }
        case 'use-sample': loadSample(''); break;
        case 'clear-file': S.drawer.draft.file = null; renderDrawer(); { const u = root.querySelector('[data-fk="use-sample"]'); if (u) u.focus(); } break;
        case 'reset-th': THRESHOLDS.forEach((t) => { S.drawer.draft[t.key] = D.defaults[t.key]; }); renderDrawer(); break;
        case 'start': startRun(); break;
        default: break;
      }
    }

    function onFocusIn(e) {
      const t = e.target;
      if (!t.classList || !t.classList.contains('bd-card-main')) return;
      const card = t.closest('.bd-card[data-card]'); if (!card) return;
      const col = card.getAttribute('data-col');
      if (S.colFocus[col] !== card.getAttribute('data-card')) { S.colFocus[col] = card.getAttribute('data-card'); applyRoving(col); }
    }

    function onInput(e) {
      const t = e.target;
      const fk = t.getAttribute('data-fk');
      if (fk === 'search') { S.q = t.value; renderBoard(); return; }
      if (fk === 'note') { if (S.sheet) activeRun().notes[S.sheet.id] = t.value; return; }
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
      if (!S.drawer) return;
      const d = S.drawer.draft;
      if (t.name === 'bd-prov') d.provider = t.value;
      else if (t.name === 'bd-tier') d.tier = t.value;
      else if (t.hasAttribute('data-map')) d.mapping[t.getAttribute('data-map')] = t.value;
      else if (t.hasAttribute('data-toggle')) d[t.getAttribute('data-toggle')] = t.checked;
      else if (t.hasAttribute('data-num')) {
        const k = t.getAttribute('data-num'); const meta = THRESHOLDS.find((x) => x.key === k);
        d[k] = t.value === '' || isNaN(+t.value) ? D.defaults[k] : clamp(Math.round(+t.value), meta.min, meta.max);
      } else if (t.getAttribute('data-field') === 'model') d.model = t.value;
      else return;
      renderDrawer();
    }

    function onRootKey(e) {
      const t = e.target;
      if (S.drawer && R('overlay').contains(t)) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDrawer(); return; }
        if (e.key === 'Tab') {
          const dr = R('overlay').querySelector('.bd-drawer');
          const f = [...dr.querySelectorAll('button, input, select, textarea')].filter((n) => !n.disabled && n.offsetParent !== null);
          if (!f.length) return;
          const first = f[0]; const last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
        return;
      }
      if (S.menu && t.closest && t.closest('.bd-menu')) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const items = [...R('runwrap').querySelectorAll('.bd-menu [role="menuitem"]')];
          const i = items.indexOf(t);
          const n = items[clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, items.length - 1)];
          if (n) n.focus();
        } else if (e.key === 'Tab') closeMenu(false);
        return;
      }
      const fk = t.getAttribute ? t.getAttribute('data-fk') : null;
      if (fk === 'search') {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (t.value) { t.value = ''; S.q = ''; renderBoard(); } else t.blur(); }
        else if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); focusFirstMatch(); }
        return;
      }
      if (fk === 'note' && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSheet(); }
    }

    function onDocKey(e) {
      if (!root.isConnected) return;
      const t = e.target;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (drag) { if (k === 'Escape' && drag.started) { e.preventDefault(); finishDrag(null); } return; }
      if (S.drawer) { if (k === 'Escape') { e.preventDefault(); closeDrawer(); } return; }
      if (S.menu) { if (k === 'Escape') { e.preventDefault(); closeMenu(true); } return; }
      if (k === 'Escape') { if (S.sheet) { e.preventDefault(); closeSheet(); } return; }
      if (k === '/') { const s = root.querySelector('[data-fk="search"]'); if (s && !R('searchwrap').hidden) { e.preventDefault(); s.focus(); } return; }
      const run = activeRun();
      if (run.kind !== 'rows') return;
      const key = k.length === 1 ? k.toLowerCase() : k;
      const target = () => focusedCardId() || (S.sheet ? S.sheet.id : null);
      switch (key) {
        case 'j': e.preventDefault(); if (S.sheet) sheetNav(1); else boardNav(1); break;
        case 'k': e.preventDefault(); if (S.sheet) sheetNav(-1); else boardNav(-1); break;
        case 'ArrowDown': if (!S.sheet) { e.preventDefault(); boardNav(1); } break;
        case 'ArrowUp': if (!S.sheet) { e.preventDefault(); boardNav(-1); } break;
        case 'h': if (!S.sheet) { e.preventDefault(); boardCol(-1); } break;
        case 'l': if (!S.sheet) { e.preventDefault(); boardCol(1); } break;
        case 'd': case 'g': case 'b': {
          const id = target();
          if (!id) { if (key !== 'b') toast('Focus a card first', 'Use J and K to move between cards, then D or G to place one.'); break; }
          e.preventDefault();
          moveCard(id, key === 'd' ? 'deep' : key === 'g' ? 'general' : 'review', 'key');
          break;
        }
        case 'u': e.preventDefault(); undo(); break;
        case 'n': e.preventDefault(); nextReview(); break;
        default: break;
      }
    }

    function onDragOverFile(e) {
      if (!S.drawer) return;
      e.preventDefault();
      const z = e.target.closest && e.target.closest('[data-dropzone]');
      if (e.dataTransfer) e.dataTransfer.dropEffect = z ? 'copy' : 'none';
      if (z && !S.drawer.over) { S.drawer.over = true; z.classList.add('is-over'); }
    }
    function onDragLeaveFile(e) {
      const z = e.target.closest && e.target.closest('[data-dropzone]');
      if (z && S.drawer && !z.contains(e.relatedTarget)) { S.drawer.over = false; z.classList.remove('is-over'); }
    }
    function onDropFile(e) {
      if (!S.drawer) return;
      e.preventDefault();
      const z = e.target.closest && e.target.closest('[data-dropzone]');
      if (!z) return;
      S.drawer.over = false;
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      loadSample(f ? 'Files are not read in this prototype; ' + f.name + ' was swapped for the sample file.' : '');
    }

    root.addEventListener('click', onClick);
    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('keydown', onRootKey);
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('dragover', onDragOverFile);
    root.addEventListener('dragleave', onDragLeaveFile);
    root.addEventListener('drop', onDropFile);
    document.addEventListener('keydown', onDocKey);

    /* ---------- first paint ---------- */
    renderAll();

    return function cleanup() {
      Object.keys(engines).forEach((id) => { cancel(engines[id].timer); delete engines[id]; });
      timeouts.forEach((t) => clearTimeout(t)); timeouts.clear();
      rafs.forEach((r) => cancelAnimationFrame(r)); rafs.clear();
      anims.forEach((a) => { a.onfinish = null; a.oncancel = null; try { a.cancel(); } catch (err) { /* gone */ } }); anims.clear();
      if (drag) { const d = drag; drag = null; detachDrag(d); if (d.lift) d.lift.remove(); }
      document.removeEventListener('pointermove', onDragMove);
      document.removeEventListener('pointerup', onDragUp);
      document.removeEventListener('pointercancel', onDragCancel);
      document.removeEventListener('keydown', onDocKey);
      root.removeEventListener('click', onClick);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('input', onInput);
      root.removeEventListener('change', onChange);
      root.removeEventListener('keydown', onRootKey);
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('dragover', onDragOverFile);
      root.removeEventListener('dragleave', onDragLeaveFile);
      root.removeEventListener('drop', onDropFile);
    };
  }

  window.PROTO_VARIANTS = window.PROTO_VARIANTS || {};
  window.PROTO_VARIANTS.board = { css, render, init };
})();
