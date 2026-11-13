/* Split variant: reading over scanning. A compact, grouped company list on the
   left (like a mail client's message list) and a wide reading pane on the
   right laid out as a typeset document: verdict header, classifier reasoning,
   criteria, a step-by-step confidence ledger, patents and the validator's
   finding, with a facts sidebar. A decision bar stays docked at the top of
   the pane, so deciding never needs a scroll back. Setup lives in a New run
   drawer ported from Workbench. */
(function () {
  'use strict';

  const css = `
.v-split { --sp-list: 328px; --sp-pad: 40px; --sp-side: 248px; --sp-gap: 40px; position: relative; display: grid; grid-template-columns: var(--sp-list) minmax(0, 1fr); height: 100%; overflow: hidden; background: var(--bg); color: var(--text); font: 13px/1.4 var(--font); }
@media (max-width: 1399px) { .v-split { --sp-list: 312px; --sp-pad: 32px; --sp-side: 232px; --sp-gap: 32px; } }
@media (max-width: 1199px) { .v-split { --sp-list: 288px; --sp-pad: 24px; --sp-side: 216px; --sp-gap: 28px; } }
.v-split .sp-num { font-variant-numeric: tabular-nums; }
.v-split .sp-mono { font-family: var(--mono); font-size: 12px; }
.v-split .sp-muted { color: var(--text-3); }
.v-split .sp-dim { color: var(--text-2); }
.v-split :focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.v-split h1, .v-split h2, .v-split h3, .v-split p, .v-split blockquote, .v-split dl, .v-split ol, .v-split ul, .v-split figure { margin: 0; }
.v-split kbd { display: inline-block; font: 10.5px/1 var(--mono); padding: 2px 4px; min-width: 16px; text-align: center; border: 1px solid var(--border-strong); border-bottom-width: 2px; border-radius: 4px; background: var(--surface); color: var(--text-2); }

/* Buttons */
.v-split .sp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); background: var(--surface); color: var(--text); font-weight: 500; font-size: 12.5px; cursor: pointer; white-space: nowrap; transition: transform 120ms var(--ease-out); }
.v-split .sp-btn:hover { background: var(--surface-2); }
.v-split .sp-btn:active { transform: scale(0.97); }
.v-split .sp-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; background: var(--surface); }
.v-split .sp-btn[aria-pressed="true"] { background: var(--text); border-color: var(--text); color: var(--surface); }
.v-split .sp-btn[aria-pressed="true"] kbd { background: transparent; color: inherit; border-color: rgba(255,255,255,.35); }
.v-split .sp-btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.v-split .sp-btn-primary:hover { background: var(--accent); filter: brightness(1.08); }
.v-split .sp-btn-primary:disabled { background: var(--accent); filter: none; }
.v-split .sp-btn-primary kbd { background: transparent; color: #fff; border-color: rgba(255,255,255,.4); }
.v-split .sp-btn-ghost { border-color: transparent; background: transparent; color: var(--text-2); }
.v-split .sp-btn-ghost:hover { background: var(--surface-2); color: var(--text); }
.v-split .sp-btn-sm { height: 24px; padding: 0 8px; font-size: 12px; }
.v-split .sp-btn-stop { color: var(--error); }

/* Status dots, pills, marks */
.v-split .sp-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-3); flex: none; display: inline-block; }
.v-split .sp-dot.is-running { background: var(--accent); animation: split-pulse 1s ease-in-out infinite alternate; }
.v-split .sp-dot.is-stopped { background: var(--escalate); }
.v-split .sp-dot.is-complete { background: var(--deep); }
.v-split .sp-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: var(--general-soft); color: var(--text-2); white-space: nowrap; }
.v-split .sp-pill.is-running { background: var(--accent-soft); color: var(--accent); }
.v-split .sp-pill.is-stopped { background: var(--escalate-soft); color: var(--escalate); }
.v-split .sp-pill.is-complete { background: var(--deep-soft); color: var(--deep); }
.v-split .sp-vm { display: inline-flex; align-items: center; gap: 6px; }
.v-split .sp-vm::before { content: ""; width: 7px; height: 7px; border-radius: 50%; flex: none; background: transparent; box-shadow: inset 0 0 0 1.5px var(--general); }
.v-split .sp-vm.is-deep { color: var(--deep); }
.v-split .sp-vm.is-deep::before { background: var(--deep); box-shadow: none; }
.v-split .sp-vm.is-gen { color: var(--text-2); }
.v-split .sp-risk { display: inline-block; font-size: 11px; font-weight: 600; padding: 0 6px; border-radius: 4px; line-height: 17px; white-space: nowrap; }
.v-split .sp-risk.r-Clear { color: var(--text-3); font-weight: 500; padding: 0; }
.v-split .sp-risk.r-Uncertain { background: var(--uncertain-soft); color: var(--uncertain); }
.v-split .sp-risk.r-Contested { background: var(--contested-soft); color: var(--contested); }
.v-split .sp-risk.r-Escalate { background: var(--escalate-soft); color: var(--escalate); }
.v-split .sp-mks { display: inline-flex; gap: 3px; }
.v-split .sp-mk { width: 15px; height: 15px; border-radius: 3px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; line-height: 1; flex: none; }
.v-split .sp-mk.is-y { background: var(--deep-soft); color: var(--deep); }
.v-split .sp-mk.is-n { color: var(--text-3); box-shadow: inset 0 0 0 1px var(--border-strong); }
.v-split .sp-tick { font-size: 11px; font-weight: 600; color: var(--accent); white-space: nowrap; }
.v-split .sp-pintag { font-size: 10.5px; font-weight: 600; color: var(--accent); background: var(--accent-soft); border-radius: 3px; padding: 0 4px; line-height: 16px; white-space: nowrap; }

/* Left column */
.v-split .sp-side { display: flex; flex-direction: column; min-height: 0; min-width: 0; border-right: 1px solid var(--border); background: var(--surface); }
.v-split .sp-side-top { flex: none; padding: 10px 10px 8px; border-bottom: 1px solid var(--border); background: var(--surface); }
.v-split .sp-runrow { display: flex; gap: 6px; align-items: stretch; }
.v-split .sp-swwrap { position: relative; flex: 1; min-width: 0; }
.v-split .sp-runsw { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 6px; text-align: left; padding: 5px 8px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); background: var(--surface); cursor: pointer; transition: transform 120ms var(--ease-out); }
.v-split .sp-runsw:hover { background: var(--surface-2); }
.v-split .sp-runsw:active { transform: scale(0.99); }
.v-split .sp-runsw[aria-expanded="true"] { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.v-split .sp-runsw-f { font-weight: 650; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v-split .sp-runsw-m { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-2); min-width: 0; white-space: nowrap; overflow: hidden; }
.v-split .sp-runsw-m > span:last-child { overflow: hidden; text-overflow: ellipsis; }
.v-split .sp-runsw-chev { grid-row: 1 / span 2; grid-column: 2; align-self: center; color: var(--text-3); font-size: 11px; }
.v-split .sp-newrun { flex: none; height: auto; }
.v-split .sp-menu { position: absolute; top: calc(100% + 4px); left: 0; z-index: 15; width: calc(var(--sp-list) - 20px); max-height: min(440px, 70vh); overflow-y: auto; padding: 4px; border: 1px solid var(--border-strong); border-radius: var(--radius-m); background: var(--surface); box-shadow: var(--shadow-2); transform-origin: top left; }
.v-split .sp-menu.is-enter { animation: split-pop 160ms var(--ease-out) both; }
.v-split .sp-menu-h { font-size: 10.5px; font-weight: 650; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; padding: 8px 8px 3px; }
.v-split .sp-mi { display: block; width: 100%; text-align: left; border: 0; border-radius: var(--radius-s); background: transparent; padding: 6px 8px; cursor: pointer; }
.v-split .sp-mi:hover, .v-split .sp-mi:focus-visible { background: var(--surface-2); }
.v-split .sp-mi[aria-current="true"] { background: var(--accent-soft); }
.v-split .sp-mi-f { display: block; font-weight: 600; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v-split .sp-mi-m { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-2); margin-top: 1px; }
.v-split .sp-mi-d { display: block; font-size: 11px; color: var(--text-3); margin-top: 1px; }
.v-split .sp-minibar { display: block; height: 3px; border-radius: 2px; background: var(--border); margin-top: 5px; overflow: hidden; }
.v-split .sp-minibar > span { display: block; height: 100%; background: var(--accent); transform-origin: left center; }
.v-split .sp-minibar.is-stopped > span { background: var(--escalate); }
.v-split .sp-filter[hidden] { display: none; }
.v-split .sp-search { position: relative; margin-top: 8px; }
.v-split .sp-search input { width: 100%; height: 28px; padding: 0 28px 0 8px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); background: var(--surface); font-size: 12.5px; }
.v-split .sp-search input:focus-visible { outline-offset: 0; }
.v-split .sp-search kbd { position: absolute; right: 6px; top: 6px; pointer-events: none; }
.v-split .sp-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.v-split .sp-chip { height: 22px; padding: 0 7px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); font-size: 11.5px; color: var(--text-2); cursor: pointer; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; transition: transform 120ms var(--ease-out); }
.v-split .sp-chip:hover { border-color: var(--border-strong); color: var(--text); }
.v-split .sp-chip:active { transform: scale(0.97); }
.v-split .sp-chip[aria-pressed="true"] { background: var(--text); border-color: var(--text); color: var(--surface); }
.v-split .sp-chip-n { font-variant-numeric: tabular-nums; opacity: 0.7; }
.v-split .sp-chip-clear { border-style: dashed; }

.v-split .sp-list { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; background: var(--surface); }
.v-split .sp-grp { position: relative; }
.v-split .sp-gh { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 6px; width: 100%; height: 28px; padding: 0 10px 0 8px; border: 0; border-bottom: 1px solid var(--border); background: var(--surface-2); font-size: 11px; font-weight: 650; color: var(--text-2); text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; text-align: left; white-space: nowrap; }
.v-split .sp-gh:hover { color: var(--text); }
.v-split .sp-gh:focus-visible { outline-offset: -2px; }
.v-split .sp-gh-chev { display: inline-block; width: 10px; font-size: 9px; color: var(--text-3); transition: transform 120ms var(--ease-out); }
.v-split .sp-gh[aria-expanded="false"] .sp-gh-chev { transform: rotate(-90deg); }
.v-split .sp-gh-s { text-transform: none; letter-spacing: 0; font-weight: 500; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.v-split .sp-gh-n { margin-left: auto; font-variant-numeric: tabular-nums; font-weight: 650; color: var(--text-2); }
.v-split .sp-gh.is-hot .sp-gh-n { color: #fff; background: var(--escalate); border-radius: 999px; padding: 0 6px; line-height: 16px; }
.v-split .sp-ghint { padding: 8px 12px 10px; font-size: 12px; color: var(--text-3); border-bottom: 1px solid var(--border); }
.v-split .sp-item { display: block; width: 100%; text-align: left; border: 0; border-bottom: 1px solid var(--border); background: var(--surface); padding: 6px 10px 6px 12px; cursor: pointer; scroll-margin: 30px 0 12px; }
.v-split .sp-item:hover { background: var(--bg); }
.v-split .sp-item:focus-visible { outline-offset: -2px; }
.v-split .sp-item[aria-current="true"] { background: var(--accent-soft); box-shadow: inset 3px 0 0 var(--accent); }
.v-split .sp-i1, .v-split .sp-i2 { display: flex; align-items: center; gap: 8px; min-width: 0; }
.v-split .sp-i2 { margin-top: 2px; }
.v-split .sp-i-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; font-size: 13px; color: var(--text); }
.v-split .sp-i-v { font-size: 12px; }
.v-split .sp-i-c { width: 22px; text-align: right; font-size: 12.5px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--text); }
.v-split .sp-i-c.is-low { color: var(--contested); }
.v-split .sp-i-sec { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--text-2); }
.v-split .sp-item.is-pending .sp-i-name { color: var(--text-2); font-weight: 500; }
.v-split .sp-step { display: inline-flex; align-items: center; gap: 6px; color: var(--accent); font-size: 11.5px; white-space: nowrap; }
.v-split .sp-step::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: split-pulse 0.8s ease-in-out infinite alternate; }
.v-split .sp-step.is-wait { color: var(--text-2); }
.v-split .sp-step.is-wait::before { background: var(--text-3); animation: none; }
.v-split .sp-land { animation: split-land 240ms var(--ease-out) both; }
.v-split .sp-listnote { padding: 18px 14px; color: var(--text-2); font-size: 12.5px; }
.v-split .sp-listnote b { display: block; color: var(--text); margin-bottom: 4px; }
.v-split .sp-listnote .sp-btn { margin-top: 10px; }
.v-split .sp-listpad { height: 24px; }
.v-split .sp-keys { flex: none; display: flex; flex-wrap: wrap; gap: 4px 10px; padding: 8px 10px 10px; border-top: 1px solid var(--border); background: var(--surface-2); font-size: 11px; color: var(--text-2); }
.v-split .sp-keys span { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }

/* Pane */
.v-split .sp-pane { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: var(--surface); }
.v-split .sp-runbar { flex: none; position: relative; display: flex; align-items: center; gap: 14px; min-height: 46px; padding: 6px 16px 6px var(--sp-pad); border-bottom: 1px solid var(--border); background: var(--surface); }
.v-split .sp-rb-stats { display: flex; align-items: baseline; gap: 16px; flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; font-size: 12px; color: var(--text-2); }
.v-split .sp-rb-stat b { font-size: 14px; color: var(--text); font-weight: 650; font-variant-numeric: tabular-nums; margin-left: 4px; }
.v-split .sp-rb-stat b.is-deep { color: var(--deep); }
.v-split .sp-rb-stat b.is-review { color: var(--escalate); }
.v-split .sp-rb-stat small { color: var(--text-3); font-size: 11.5px; margin-left: 3px; }
.v-split .sp-rb-acts { display: flex; gap: 6px; flex: none; }
.v-split .sp-rb-prog { position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; overflow: hidden; }
.v-split .sp-rb-prog > span { display: block; height: 100%; background: var(--accent); transform-origin: left center; transition: transform 200ms var(--ease-out); }
.v-split .sp-rb-prog.is-stopped > span { background: var(--escalate); }
@media (max-width: 1439px) { .v-split .sp-rb-opt { display: none; } }
@media (max-width: 1199px) { .v-split .sp-rb-stats { gap: 10px; } .v-split .sp-rb-acts kbd, .v-split .sp-rb-stat small { display: none; } .v-split .sp-runbar { gap: 10px; } }

/* Dock: decision bar + compare strip */
.v-split .sp-dock { flex: none; background: var(--surface-2); border-bottom: 1px solid var(--border); }
.v-split .sp-dock:empty { display: none; }
.v-split .sp-dock-in { max-width: 1000px; padding: 8px 16px 9px var(--sp-pad); }
.v-split .sp-dec-k { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--text-3); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 5px; white-space: nowrap; }
.v-split .sp-dec-k b { color: var(--text-2); font-variant-numeric: tabular-nums; }
.v-split .sp-dec-k .sp-dec-k-r { margin-left: auto; text-transform: none; letter-spacing: 0; font-weight: 500; }
.v-split .sp-dec-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.v-split .sp-seg { display: inline-flex; gap: 4px; flex: none; }
.v-split .sp-seg .sp-btn { height: 30px; }
.v-split .sp-seg .sp-btn[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
.v-split .sp-note { position: relative; flex: 1 1 180px; min-width: 160px; }
.v-split .sp-note input { width: 100%; height: 30px; padding: 0 28px 0 9px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); background: var(--surface); font-size: 12.5px; }
.v-split .sp-note input:focus-visible { outline-offset: 0; }
.v-split .sp-note kbd { position: absolute; right: 6px; top: 7px; pointer-events: none; }
.v-split .sp-dec-row .sp-btn-primary { height: 30px; }
.v-split .sp-dec-sep { width: 1px; align-self: stretch; background: var(--border); margin: 2px 2px; }
.v-split .sp-dec-msg { flex: 1 1 200px; min-width: 0; font-size: 13px; color: var(--text); }
.v-split .sp-dec-msg q { color: var(--text-2); }
.v-split .sp-dec-msg .sp-dim { font-size: 12.5px; }
.v-split .sp-cmp { border-top: 1px solid var(--border); background: var(--surface); }
.v-split .sp-cmp-row { display: grid; grid-template-columns: 58px minmax(0, 1.4fr) 104px 30px 84px 60px minmax(0, 1fr) 64px; gap: 10px; align-items: center; min-height: 28px; font-size: 12.5px; white-space: nowrap; }
.v-split .sp-cmp-row + .sp-cmp-row { border-top: 1px dashed var(--border); }
.v-split .sp-cmp-row > * { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.v-split .sp-cmp-k { font-size: 10.5px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-3); }
.v-split .sp-cmp-row.is-pin .sp-cmp-k { color: var(--accent); }
.v-split .sp-cmp-n { font-weight: 600; border: 0; padding: 0; background: transparent; text-align: left; cursor: pointer; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.v-split .sp-cmp-n:hover { text-decoration: underline; }
.v-split span.sp-cmp-n { cursor: default; }
.v-split span.sp-cmp-n:hover { text-decoration: none; }
.v-split .sp-cmp-c { text-align: right; font-weight: 650; font-variant-numeric: tabular-nums; }
.v-split .sp-cmp-x { justify-self: end; }
.v-split .sp-cmp-one { display: flex; align-items: center; gap: 10px; min-height: 28px; font-size: 12.5px; color: var(--text-2); }
@media (max-width: 1099px) { .v-split .sp-cmp-row { grid-template-columns: 52px minmax(0, 1.4fr) 96px 28px 80px 56px 60px; } .v-split .sp-cmp-o { display: none; } }

/* Reading document */
.v-split .sp-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; background: var(--surface); }
.v-split .sp-doc { max-width: 1000px; padding: 26px 16px 128px var(--sp-pad); }
.v-split .sp-kicker { display: flex; flex-wrap: wrap; gap: 2px 12px; font-size: 12px; color: var(--text-3); }
.v-split .sp-h1 { font-size: 24px; font-weight: 680; line-height: 1.2; letter-spacing: -0.01em; margin-top: 5px; }
.v-split .sp-dek { font-size: 15px; line-height: 1.5; color: var(--text-2); margin-top: 4px; max-width: 64ch; }
.v-split .sp-vline { display: grid; grid-template-columns: auto auto minmax(0, 1fr); margin-top: 18px; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.v-split .sp-vcell { padding: 12px 28px 14px 0; min-width: 0; }
.v-split .sp-vcell + .sp-vcell { padding-left: 24px; border-left: 1px solid var(--border); }
.v-split .sp-vcell:last-child { padding-right: 0; }
.v-split .sp-vl { display: block; font-size: 11px; font-weight: 650; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
.v-split .sp-vbig { font-size: 21px; font-weight: 650; line-height: 1.25; }
.v-split .sp-vbig.sp-vm::before { width: 10px; height: 10px; }
.v-split .sp-vbig.sp-vm.is-gen::before { box-shadow: inset 0 0 0 2px var(--general); }
.v-split .sp-cbig { font-size: 40px; font-weight: 650; line-height: 1; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.v-split .sp-cbig small { font-size: 13px; font-weight: 500; color: var(--text-3); letter-spacing: 0; margin-left: 2px; }
.v-split .sp-vs { display: block; font-size: 12.5px; color: var(--text-2); margin-top: 4px; }
.v-split .sp-ft { font-size: 15px; font-weight: 650; line-height: 1.3; }
.v-split .sp-ft.r-Uncertain { color: var(--uncertain); }
.v-split .sp-ft.r-Contested { color: var(--contested); }
.v-split .sp-ft.r-Escalate { color: var(--escalate); }
.v-split .sp-ft.r-Clear { color: var(--text); }
.v-split .sp-fp { font-size: 13.5px; line-height: 1.5; color: var(--text-2); margin-top: 3px; }
.v-split .sp-fp b { color: var(--text); font-weight: 600; }
.v-split .sp-body { display: grid; grid-template-columns: minmax(0, 1fr) var(--sp-side); gap: var(--sp-gap); margin-top: 26px; align-items: start; }
.v-split .sp-main { min-width: 0; }
.v-split .sp-sec { padding-top: 22px; margin-top: 24px; border-top: 1px solid var(--border); }
.v-split .sp-sec:first-child { padding-top: 0; margin-top: 0; border-top: 0; }
.v-split .sp-sec h2 { display: flex; align-items: baseline; gap: 10px; font-size: 15.5px; font-weight: 650; margin-bottom: 10px; }
.v-split .sp-sec h2 span { font-size: 12.5px; font-weight: 500; color: var(--text-3); font-variant-numeric: tabular-nums; }
.v-split .sp-sec h3 { font-size: 11px; font-weight: 650; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; margin: 18px 0 6px; }
.v-split .sp-prose { font-size: 14.5px; line-height: 1.62; color: var(--text); }
.v-split .sp-prose + .sp-prose { margin-top: 10px; }
.v-split .sp-lead { font-size: 16.5px; line-height: 1.55; color: var(--text); }
.v-split .sp-quote { margin: 10px 0 0; padding: 1px 0 1px 14px; border-left: 2px solid var(--border-strong); font-size: 14px; line-height: 1.58; color: var(--text-2); }
.v-split .sp-quote cite { display: block; font-style: normal; font-size: 12px; color: var(--text-3); margin-top: 3px; }
.v-split .sp-crits { list-style: none; padding: 0; }
.v-split .sp-crits li { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 2px 10px; padding: 10px 0; border-bottom: 1px solid var(--border); }
.v-split .sp-crits li:first-child { padding-top: 2px; }
.v-split .sp-crits li:last-child { border-bottom: 0; }
.v-split .sp-crits .sp-mk { width: 18px; height: 18px; font-size: 11px; margin-top: 1px; }
.v-split .sp-crits b { font-weight: 650; font-size: 14px; }
.v-split .sp-crits b small { font-weight: 500; font-size: 12.5px; color: var(--text-3); margin-left: 6px; }
.v-split .sp-crits p { grid-column: 2; font-size: 14px; line-height: 1.55; color: var(--text-2); }
.v-split .sp-ledger { list-style: none; padding: 0; border-top: 1px solid var(--border); }
.v-split .sp-ledger li { display: grid; grid-template-columns: 22px minmax(0, 1fr) 56px 44px; gap: 12px; align-items: baseline; padding: 9px 0; border-bottom: 1px dashed var(--border); }
.v-split .sp-lg-i { width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 650; color: var(--text-2); box-shadow: inset 0 0 0 1px var(--border-strong); font-variant-numeric: tabular-nums; align-self: start; }
.v-split .sp-lg-t { font-weight: 600; font-size: 14px; }
.v-split .sp-lg-w { display: block; font-size: 13px; line-height: 1.5; color: var(--text-2); margin-top: 1px; }
.v-split .sp-lg-d { text-align: right; font-variant-numeric: tabular-nums; color: var(--text-2); font-size: 13.5px; white-space: nowrap; }
.v-split .sp-lg-v { text-align: right; font-variant-numeric: tabular-nums; font-weight: 650; font-size: 14.5px; }
.v-split .sp-ledger li.is-gate .sp-lg-i { box-shadow: none; background: var(--surface-2); }
.v-split .sp-ledger li.is-gate .sp-lg-v { color: var(--text-3); font-weight: 500; }
.v-split .sp-ledger li.is-total { border-bottom: 0; border-top: 1px solid var(--border-strong); margin-top: -1px; padding-top: 11px; }
.v-split .sp-ledger li.is-total .sp-lg-t { font-size: 15px; }
.v-split .sp-ledger li.is-total .sp-lg-v { font-size: 22px; line-height: 1; }
.v-split .sp-track { position: relative; height: 22px; margin: 14px 0 2px; }
.v-split .sp-track-l { position: absolute; left: 0; right: 0; top: 10px; height: 2px; background: var(--border); }
.v-split .sp-track-th { position: absolute; top: 2px; height: 18px; border-left: 1px dashed var(--escalate); }
.v-split .sp-track-pre { position: absolute; top: 6px; width: 10px; height: 10px; margin-left: -5px; border-radius: 50%; background: var(--surface); box-shadow: inset 0 0 0 1.5px var(--text-3); }
.v-split .sp-track-fin { position: absolute; top: 4px; width: 14px; height: 14px; margin-left: -7px; border-radius: 50%; background: var(--text); }
.v-split .sp-track-ax { display: flex; justify-content: space-between; gap: 10px; font-size: 11px; color: var(--text-3); font-variant-numeric: tabular-nums; }
.v-split .sp-cpc { display: grid; grid-template-columns: 120px minmax(0, 1fr); border-top: 1px solid var(--border); margin-top: 12px; }
.v-split .sp-cpc > * { padding: 7px 0; border-bottom: 1px solid var(--border); font-size: 13.5px; }
.v-split .sp-cpc code { font-family: var(--mono); font-size: 12.5px; color: var(--text); }
.v-split .sp-cpc span { color: var(--text-2); }
.v-split .sp-kv { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 5px 14px; font-size: 13.5px; margin-top: 4px; }
.v-split .sp-kv dt { color: var(--text-3); }
.v-split .sp-kv dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.v-split .sp-srcs { list-style: none; padding: 0; margin-top: 4px; }
.v-split .sp-srcs li { display: flex; gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--border); font-family: var(--mono); font-size: 12.5px; color: var(--text-2); overflow-wrap: anywhere; }
.v-split .sp-srcs li::before { content: "↗"; color: var(--text-3); font-family: var(--font); }
.v-split .sp-reason { margin-top: 12px; padding: 9px 12px; border-radius: var(--radius-s); background: var(--escalate-soft); font-size: 13.5px; line-height: 1.5; }
.v-split .sp-facts { position: sticky; top: 18px; min-width: 0; font-size: 12.5px; }
.v-split .sp-facts-h { font-size: 11px; font-weight: 650; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
.v-split .sp-facts dl { display: grid; grid-template-columns: 78px minmax(0, 1fr); gap: 0 10px; border-top: 1px solid var(--border); }
.v-split .sp-facts dt, .v-split .sp-facts dd { padding: 5px 0; border-bottom: 1px solid var(--border); }
.v-split .sp-facts dt { color: var(--text-3); }
.v-split .sp-facts dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.v-split .sp-toc { margin-top: 18px; }
.v-split .sp-toc button { display: block; width: 100%; text-align: left; border: 0; background: transparent; padding: 4px 8px; margin-left: -8px; border-radius: var(--radius-s); color: var(--text-2); font-size: 12.5px; cursor: pointer; }
.v-split .sp-toc button:hover { background: var(--surface-2); color: var(--text); }
.v-split .sp-steps { list-style: none; padding: 0; border-top: 1px solid var(--border); max-width: 520px; }
.v-split .sp-steps li { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13.5px; }
.v-split .sp-steps li span:last-child { margin-left: auto; color: var(--text-3); font-size: 12.5px; }
.v-split .sp-steps .is-now { color: var(--accent); font-weight: 600; }
.v-split .sp-steps .is-done { color: var(--text-2); }
@media (max-width: 1099px) {
  .v-split .sp-body { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .v-split .sp-facts { position: static; order: -1; margin-bottom: 26px; }
  .v-split .sp-facts dl { grid-template-columns: 78px minmax(0, 1fr) 78px minmax(0, 1fr); }
  .v-split .sp-toc { display: none; }
  .v-split .sp-vline { grid-template-columns: auto auto; }
  .v-split .sp-vcell:last-child { grid-column: 1 / -1; padding-left: 0; border-left: 0; border-top: 1px solid var(--border); padding-top: 10px; }
}

/* Overview */
.v-split .sp-notice { margin-top: 14px; padding: 9px 12px; border-radius: var(--radius-s); background: var(--escalate-soft); font-size: 13px; display: flex; align-items: center; gap: 12px; }
.v-split .sp-notice.is-running { background: var(--accent-soft); }
.v-split .sp-notice p { flex: 1; min-width: 0; }
.v-split .sp-stats { display: grid; grid-template-columns: repeat(6, minmax(0, auto)); justify-content: start; margin-top: 18px; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.v-split .sp-stat { padding: 12px 26px 12px 0; }
.v-split .sp-stat + .sp-stat { padding-left: 20px; border-left: 1px solid var(--border); }
.v-split .sp-stat-v { font-size: 28px; font-weight: 650; line-height: 1.1; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; white-space: nowrap; }
.v-split .sp-stat-v small { font-size: 13px; font-weight: 500; color: var(--text-3); letter-spacing: 0; }
.v-split .sp-stat-v.is-deep { color: var(--deep); }
.v-split .sp-stat-v.is-review { color: var(--escalate); }
@media (max-width: 1199px) { .v-split .sp-stats { grid-template-columns: repeat(3, minmax(0, auto)); } .v-split .sp-stat:nth-child(4) { padding-left: 0; border-left: 0; } .v-split .sp-stat:nth-child(n+4) { border-top: 1px solid var(--border); } }
.v-split .sp-hist { max-width: 520px; }
.v-split .sp-hist-bars { position: relative; display: flex; align-items: flex-end; gap: 4px; height: 96px; border-bottom: 1px solid var(--border-strong); }
.v-split .sp-bin { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; }
.v-split .sp-bin-g { display: block; background: var(--border-strong); border-radius: 2px 2px 0 0; }
.v-split .sp-bin-d { display: block; background: var(--deep); }
.v-split .sp-bin-n { display: block; font-size: 10.5px; text-align: center; color: var(--text-3); font-variant-numeric: tabular-nums; margin-bottom: 2px; }
.v-split .sp-hist-th { position: absolute; top: 0; bottom: 0; width: 0; border-left: 1px dashed var(--escalate); pointer-events: none; }
.v-split .sp-hist-ax { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-3); margin-top: 3px; font-variant-numeric: tabular-nums; }
.v-split .sp-hist-lg { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; color: var(--text-2); margin-top: 8px; }
.v-split .sp-sw { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; vertical-align: 0; }
.v-split .sp-risklist { list-style: none; padding: 0; border-top: 1px solid var(--border); }
.v-split .sp-risklist li { display: grid; grid-template-columns: 92px minmax(0, 1fr) 32px; gap: 12px; align-items: baseline; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13.5px; color: var(--text-2); }
.v-split .sp-risklist li b { text-align: right; color: var(--text); font-variant-numeric: tabular-nums; }
.v-split .sp-cfg { display: flex; flex-wrap: wrap; gap: 4px; }
.v-split .sp-cfgtag { font-size: 11.5px; padding: 1px 6px; border: 1px solid var(--border); border-radius: 4px; color: var(--text-2); background: var(--surface); }
.v-split .sp-cfgtag.is-off { color: var(--text-3); text-decoration: line-through; }
.v-split .sp-ov-acts { display: flex; flex-direction: column; align-items: stretch; gap: 6px; margin-top: 16px; }
.v-split .sp-ov-acts .sp-btn { height: 32px; }
.v-split .sp-bigbar { height: 6px; border-radius: 3px; background: var(--border); overflow: hidden; margin: 16px 0 6px; max-width: 520px; }
.v-split .sp-bigbar > span { display: block; height: 100%; background: var(--escalate); transform-origin: left center; transition: transform 200ms var(--ease-out); }
.v-split .sp-bigbar.is-running > span { background: var(--accent); }
.v-split .sp-bigbar.is-complete > span { background: var(--deep); }

/* Drawer (ported from Workbench) */
.v-split .sp-scrim { position: absolute; inset: 0; z-index: 20; background: rgba(20, 20, 18, 0.18); animation: split-fade 200ms var(--ease-out) both; }
.v-split .sp-drawer { position: absolute; top: 0; right: 0; bottom: 0; z-index: 21; width: min(580px, calc(100% - 200px)); display: flex; flex-direction: column; background: var(--surface); border-left: 1px solid var(--border-strong); box-shadow: var(--shadow-2); animation: split-slide 240ms var(--ease-out) both; }
.v-split .sp-drawer.is-leaving, .v-split .sp-scrim.is-leaving { animation: split-out 160ms var(--ease-out) both; }
.v-split .sp-drawer.is-leaving { animation-name: split-slide-out; }
.v-split .sp-dr-head { flex: none; border-bottom: 1px solid var(--border); padding: 14px 18px 12px; }
.v-split .sp-dr-title { display: flex; align-items: center; justify-content: space-between; }
.v-split .sp-dr-title h2 { font-size: 15px; font-weight: 650; }
.v-split .sp-est { display: grid; grid-template-columns: auto auto 1fr auto; gap: 4px 18px; align-items: end; margin-top: 10px; }
.v-split .sp-est-v { font-size: 20px; font-weight: 650; font-variant-numeric: tabular-nums; line-height: 1.15; }
.v-split .sp-est-l { font-size: 11px; font-weight: 600; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.04em; }
.v-split .sp-est-split { align-self: center; min-width: 0; }
.v-split .sp-est-bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden; background: var(--border); }
.v-split .sp-est-bar > span { display: block; height: 100%; }
.v-split .sp-est-lg { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 11px; color: var(--text-2); margin-top: 4px; font-variant-numeric: tabular-nums; }
.v-split .sp-est-note { grid-column: 1 / -1; font-size: 11.5px; color: var(--text-3); }
.v-split .sp-est-why { grid-column: 1 / -1; font-size: 12px; color: var(--escalate); text-align: right; }
.v-split .sp-dr-body { flex: 1; overflow-y: auto; padding: 4px 18px 96px; }
.v-split .sp-fs { border: 0; margin: 0; padding: 14px 0 4px; border-bottom: 1px solid var(--border); min-width: 0; }
.v-split .sp-fs:last-child { border-bottom: 0; }
.v-split .sp-fs legend { padding: 0; font-size: 11px; font-weight: 650; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; float: left; width: 100%; }
.v-split .sp-fs legend + * { clear: both; }
.v-split .sp-drop { border: 1.5px dashed var(--border-strong); border-radius: var(--radius-m); padding: 18px; text-align: center; color: var(--text-2); background: var(--bg); }
.v-split .sp-drop.is-over { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.v-split .sp-drop b { display: block; color: var(--text); font-weight: 600; margin-bottom: 2px; }
.v-split .sp-drop .sp-btn { margin-top: 10px; }
.v-split .sp-file { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-s); background: var(--bg); }
.v-split .sp-file-n { font-weight: 600; }
.v-split .sp-file > div { flex: 1; min-width: 0; }
.v-split .sp-file-m { font-size: 12px; color: var(--text-2); }
.v-split .sp-hint { font-size: 12px; color: var(--text-3); margin-top: 6px; }
.v-split .sp-warn { font-size: 12px; color: var(--escalate); margin-top: 6px; }
.v-split .sp-map { display: grid; grid-template-columns: 130px 1fr auto; gap: 6px 10px; align-items: center; margin-top: 10px; font-size: 12.5px; }
.v-split .sp-map select, .v-split .sp-input { height: 28px; padding: 0 8px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); background: var(--surface); font-size: 12.5px; min-width: 0; width: 100%; }
.v-split .sp-tag { font-size: 10.5px; font-weight: 600; padding: 1px 5px; border-radius: 3px; background: var(--general-soft); color: var(--text-2); white-space: nowrap; }
.v-split .sp-tag.is-auto { background: var(--deep-soft); color: var(--deep); }
.v-split .sp-tag.is-req { background: var(--escalate-soft); color: var(--escalate); }
.v-split .sp-prev { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; table-layout: fixed; }
.v-split .sp-prev th { text-align: left; font-weight: 600; color: var(--text-3); font-size: 11px; padding: 4px 6px; border-bottom: 1px solid var(--border); }
.v-split .sp-prev td { padding: 4px 6px; border-bottom: 1px solid var(--border); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-2); }
.v-split .sp-prev td.is-none { color: var(--text-3); font-style: italic; }
.v-split .sp-provs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.v-split .sp-opt { position: relative; display: block; padding: 8px 10px; border: 1px solid var(--border-strong); border-radius: var(--radius-s); cursor: pointer; background: var(--surface); transition: transform 120ms var(--ease-out); }
.v-split .sp-opt:hover { background: var(--surface-2); }
.v-split .sp-opt:active { transform: scale(0.98); }
.v-split .sp-opt:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent); }
.v-split .sp-opt:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 1px; }
.v-split .sp-opt input { position: absolute; opacity: 0; pointer-events: none; }
.v-split .sp-opt-t { display: block; font-weight: 600; font-size: 13px; }
.v-split .sp-opt-s { display: block; font-size: 11.5px; color: var(--text-2); margin-top: 1px; }
.v-split .sp-opt-s.is-ok { color: var(--deep); }
.v-split .sp-opt-s.is-miss { color: var(--escalate); }
.v-split .sp-tiers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 8px; }
.v-split .sp-row2 { display: grid; grid-template-columns: 130px 1fr; gap: 10px; align-items: center; margin-top: 8px; font-size: 12.5px; }
.v-split .sp-tg { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--border); cursor: pointer; }
.v-split .sp-tg:last-child { border-bottom: 0; }
.v-split .sp-tg-t { font-weight: 600; font-size: 13px; }
.v-split .sp-tg-s { grid-column: 1; font-size: 12px; color: var(--text-2); }
.v-split .sp-tg.is-disabled { cursor: not-allowed; }
.v-split .sp-tg.is-disabled .sp-tg-t { color: var(--text-3); }
.v-split .sp-toggle { grid-row: 1 / span 2; grid-column: 2; appearance: none; -webkit-appearance: none; position: relative; width: 30px; height: 18px; margin: 0; border-radius: 999px; background: var(--border-strong); cursor: pointer; }
.v-split .sp-toggle::before { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.2); transition: transform 160ms var(--ease-out); }
.v-split .sp-toggle:checked { background: var(--accent); }
.v-split .sp-toggle:checked::before { transform: translateX(12px); }
.v-split .sp-toggle:disabled { opacity: 0.5; cursor: not-allowed; }
.v-split .sp-th-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }
.v-split .sp-thf { display: grid; grid-template-columns: 1fr 64px; gap: 1px 8px; align-items: center; font-size: 12.5px; }
.v-split .sp-thf .sp-input { text-align: right; font-variant-numeric: tabular-nums; padding-right: 6px; }
.v-split .sp-thf small { grid-column: 1 / -1; font-size: 11.5px; color: var(--text-3); }
.v-split .sp-thf.is-off { opacity: 0.5; }
.v-split .sp-fs-foot { display: flex; justify-content: flex-end; margin-top: 8px; }

/* Toasts: bottom right, sized to stay clear of the centred picker pill */
.v-split .sp-toasts { position: absolute; right: 16px; bottom: 24px; z-index: 30; width: min(360px, calc(50% - 176px)); display: flex; flex-direction: column; gap: 8px; align-items: stretch; pointer-events: none; }
.v-split .sp-toast { pointer-events: auto; display: flex; align-items: flex-start; gap: 10px; padding: 9px 10px 9px 12px; border-radius: var(--radius-m); background: var(--text); color: var(--surface); font-size: 12.5px; box-shadow: var(--shadow-2); transform-origin: bottom right; animation: split-toast 220ms var(--ease-out) both; }
.v-split .sp-toast > div { flex: 1; min-width: 0; }
.v-split .sp-toast b { font-weight: 600; }
.v-split .sp-toast span { display: block; opacity: 0.75; margin-top: 1px; }
.v-split .sp-toast button { flex: none; height: 24px; padding: 0 8px; border: 1px solid rgba(255,255,255,.3); border-radius: var(--radius-s); background: transparent; color: var(--surface); font-size: 12px; font-weight: 600; cursor: pointer; transition: transform 120ms var(--ease-out); }
.v-split .sp-toast button:hover { background: rgba(255,255,255,.1); }
.v-split .sp-toast button:active { transform: scale(0.97); }
.v-split .sp-toast button:focus-visible { outline-color: #fff; }
.v-split .sp-toast.is-leaving { animation: split-out 160ms var(--ease-out) both; }

@keyframes split-pulse { from { opacity: 1; } to { opacity: 0.3; } }
@keyframes split-land { from { opacity: 0; } to { opacity: 1; } }
@keyframes split-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes split-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes split-pop { from { opacity: 0; transform: translateY(-4px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes split-slide { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }
@keyframes split-slide-out { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(16px); } }
@keyframes split-toast { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@media (prefers-reduced-motion: reduce) {
  .v-split *, .v-split *::before, .v-split *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition: none !important; }
  .v-split .sp-step::before, .v-split .sp-dot.is-running { animation: none !important; }
}
`;

  function render() {
    return `<div class="v-split">
  <aside class="sp-side" aria-label="Runs and companies">
    <div class="sp-side-top">
      <div class="sp-runrow">
        <div class="sp-swwrap" data-r="switch"></div>
        <button class="sp-btn sp-btn-primary sp-newrun" data-act="new-run" data-fk="new-run">+ New run</button>
      </div>
      <div class="sp-filter" data-r="filter">
        <div class="sp-search">
          <input type="search" data-fk="search" placeholder="Search company, UEN, sector" aria-label="Search companies" autocomplete="off">
          <kbd aria-hidden="true">/</kbd>
        </div>
        <div class="sp-chips" data-r="chips" role="group" aria-label="Filters"></div>
      </div>
    </div>
    <nav class="sp-list" data-r="list" aria-label="Companies in this run"></nav>
    <div class="sp-keys" aria-label="Keyboard shortcuts">
      <span><kbd>J</kbd><kbd>K</kbd> move</span><span><kbd>C</kbd><kbd>X</kbd> decide</span><span><kbd>N</kbd> note</span><span><kbd>U</kbd> undo</span><span><kbd>P</kbd> pin</span><span><kbd>O</kbd> overview</span>
    </div>
  </aside>
  <main class="sp-pane">
    <header class="sp-runbar" data-r="runbar"></header>
    <div class="sp-dock" data-r="dock"></div>
    <div class="sp-scroll" data-r="doc" aria-label="Reading pane"></div>
  </main>
  <div data-r="overlay"></div>
  <div class="sp-toasts" data-r="toasts" role="status" aria-live="polite"></div>
</div>`;
  }

  function init(stage) {
    const root = stage.querySelector('.v-split');
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
    const CRIT = [['innovation', 'I', 'Innovation'], ['scientific_foundation', 'S', 'Scientific foundation'], ['proprietary_ip', 'P', 'Proprietary IP']];
    const BASIS = { COMBINED: 'Input and web descriptions', WEB_DESCRIPTION: 'Web description', DESCRIPTION_ONLY: 'Input description only' };
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
    const vClass = (v) => (v === 'deep tech' ? 'is-deep' : 'is-gen');
    const vLabel = (v) => (v === 'deep tech' ? 'Deep tech' : 'General tech');
    const vmark = (v, extra) => '<span class="sp-vm ' + vClass(v) + (extra ? ' ' + extra : '') + '">' + vLabel(v) + '</span>';
    const riskHtml = (r) => '<span class="sp-risk r-' + r + '">' + r + '</span>';
    const plural = (n, a, b) => n + ' ' + (n === 1 ? a : (b || a + 's'));
    const now0 = new Date();
    const stamp = (d) => '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes());
    const isField = (t) => t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);

    /* ---------- timers ---------- */
    const timeouts = new Set();
    const rafs = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timeouts.delete(t); fn(); }, ms); timeouts.add(t); return t; };
    const cancel = (t) => { if (t) { clearTimeout(t); timeouts.delete(t); } };

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

    /* Applies a run's settings to a sample company (PROJECT_OVERVIEW.md section 7).
       The sample data is the default-settings result. */
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
      selectedId: null,                // null = Run overview
      f: { verdict: '', validated: false, patents: false, q: '' },
      collapsed: { queued: true },
      menuOpen: false, menuEnter: false,
      drawer: null,
      drafts: {},                      // runId:companyId -> { choice, note }
      undo: [],                        // stack of { runId, id }
      pin: null,                       // { runId, id }
      docKey: '', paneSig: '',
    };
    const engines = {};
    const runById = (id) => S.runs.find((r) => r.id === id);
    const activeRun = () => runById(S.activeId);

    function rowView(run, id) {
      const c = C_BY_ID[id];
      const r = run.results[id] || null;
      const dec = run.decisions[id] || null;
      const idx = run.ids.indexOf(id) + 1;
      if (!r) return { c, r: null, dec: null, prog: run.progress[id] || null, idx };
      const flagged = r.risk !== 'Clear';
      const verdict = dec ? dec.verdict : r.verdict;
      const action = dec ? (verdict === 'deep tech' ? 'Approve' : 'Reject') : flagged ? 'Needs Review' : (verdict === 'deep tech' ? 'Approve' : 'Reject');
      return { c, r, dec, flagged, open: flagged && !dec, verdict, action, idx };
    }

    function counts(run) {
      if (run.kind === 'summary') {
        const s = run.summary;
        return { total: s.total, done: s.done, deep: s.deep, general: s.general, open: s.review, reviewed: 0, flagged: s.review, cost: s.cost, avg: null, risk: null, validated: 0, patents: 0 };
      }
      const out = { total: run.ids.length, done: 0, deep: 0, general: 0, open: 0, reviewed: 0, flagged: 0, cost: 0, avg: 0, risk: { Clear: 0, Uncertain: 0, Contested: 0, Escalate: 0 }, costUnknown: false, validated: 0, patents: 0, valCost: 0 };
      let sum = 0;
      run.ids.forEach((id) => {
        const v = rowView(run, id);
        if (!v.r) return;
        out.done++;
        if (v.verdict === 'deep tech') out.deep++; else out.general++;
        if (v.flagged) { out.flagged++; if (v.dec) out.reviewed++; else out.open++; }
        out.risk[v.r.risk]++;
        if (v.r.validated) out.validated++;
        if (v.r.patents.count > 0) out.patents++;
        if (v.r.cost == null) out.costUnknown = true; else { out.cost += v.r.cost; if (v.r.validated) out.valCost += v.r.cost; }
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
          steps.forEach((s) => ops.push({ id, dur: per, fn: () => { run.progress[id] = s; run.current = id; run.phase = s + ' · ' + C_BY_ID[id].name; } }));
          ops.push({ id, dur: 0, fn: land(id) });
        });
        return ops;
      }
      const gather = [];
      if (cfg.enrichment) gather.push('Enrichment');
      if (cfg.epo) gather.push('Patent lookup');
      if (!gather.length) gather.push('Reading input');
      pending.forEach((id) => {
        gather.forEach((s) => ops.push({ id, dur: 130 / gather.length, fn: () => { run.progress[id] = s; run.current = id; run.phase = 'Gather company data · ' + s + ' · ' + C_BY_ID[id].name; } }));
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
          run.phase = 'Read batch results · ' + C_BY_ID[id].name;
          if (pre[id].validated) { run.progress[id] = 'Validation queued'; run.current = id; } else land(id)();
        } });
        if (pre[id].validated) toValidate.push(id);
      });
      toValidate.forEach((id) => {
        ops.push({ id, dur: 340, fn: () => { run.progress[id] = 'Validation'; run.current = id; run.phase = 'Validate uncertain results · ' + C_BY_ID[id].name; } });
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
        if (engines[run.id] !== eng) return;
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
      toast('Run stopped', plural(n, 'finished result') + ' kept. Resume continues with the next unfinished company.');
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
      renderAll();
    }

    let tickScheduled = false;
    function onTick(run) {
      if (tickScheduled) return;
      tickScheduled = true;
      const rid = requestAnimationFrame(() => {
        rafs.delete(rid);
        tickScheduled = false;
        if (!root.isConnected) return;
        renderSwitch();
        if (run.id !== S.activeId) return;
        renderRunbar(); renderChips(); renderList();
        refreshPaneIfChanged(true);
      });
      rafs.add(rid);
    }

    /* The pane only re-renders when what it shows has changed. Overview re-renders
       on every tick (live numbers) but keeps its scroll position; a company's
       document re-renders only when that company's own state changes. */
    function paneSig() {
      const run = activeRun();
      const id = S.selectedId;
      if (run.kind !== 'rows' || !id) return 'ov';
      const v = rowView(run, id);
      if (!v.r) return id + ':p:' + (v.prog || '') + ':' + run.status;
      return id + ':r:' + (v.dec ? v.dec.choice + v.dec.t : 'o') + ':' + (S.pin ? S.pin.runId + S.pin.id : '');
    }
    function refreshPaneIfChanged(live) {
      const sig = paneSig();
      if (sig === 'ov') { renderDoc(); if (S.paneSig !== sig) renderDock(); S.paneSig = sig; return; }
      if (sig !== S.paneSig) { renderDock(); renderDoc(); S.paneSig = sig; return; }
      if (live) updateDecPos();
    }

    /* ---------- grouping + filtering ---------- */
    function anyFilter() { const f = S.f; return !!(f.verdict || f.validated || f.patents || f.q.trim()); }
    function passes(v) {
      const f = S.f; const q = f.q.trim().toLowerCase();
      if (q) {
        const c = v.c;
        if ((c.name + ' ' + c.uen + ' ' + c.domain + ' ' + c.description).toLowerCase().indexOf(q) < 0) return false;
      }
      const resF = f.verdict || f.validated || f.patents;
      if (!v.r) return !resF;
      if (f.verdict && v.verdict !== f.verdict) return false;
      if (f.validated && !v.r.validated) return false;
      if (f.patents && !(v.r.patents.count > 0)) return false;
      return true;
    }
    const bySeverity = (a, b) => (SEV[a.r.risk] - SEV[b.r.risk]) || (a.r.conf - b.r.conf) || (a.idx - b.idx);
    const byConf = (a, b) => (a.r.conf - b.r.conf) || (a.idx - b.idx);
    function groupKey(v) {
      if (!v.r) return v.prog ? 'proc' : 'queued';
      if (v.open) return 'open';
      if (v.flagged) return 'done';
      return v.verdict === 'deep tech' ? 'deep' : 'gen';
    }
    function groupsFor(run) {
      const views = run.ids.map((id) => rowView(run, id));
      const vis = views.filter(passes);
      const k = counts(run);
      const by = (key) => vis.filter((v) => groupKey(v) === key);
      const stopped = run.status !== 'running';
      const g = [
        { key: 'proc', label: 'Processing', sub: batchOn(run.cfg) ? 'batch' : 'one at a time', items: by('proc') },
        { key: 'queued', label: stopped ? 'Not started' : 'Queued', sub: stopped ? 'resume to classify' : '', items: by('queued') },
        { key: 'open', label: 'Needs review', sub: 'most severe first', items: by('open').sort(bySeverity), hint: k.done ? (k.open ? '' : 'Nothing left to review. Every flagged company has a decision.') : '' },
        { key: 'done', label: 'Reviewed by you', sub: '', items: by('done').sort(bySeverity), hint: k.done ? 'Decisions you record move here. Each stays editable with Undo.' : '' },
        { key: 'deep', label: 'Clear deep tech', sub: 'lowest confidence first', items: by('deep').sort(byConf) },
        { key: 'gen', label: 'Clear general tech', sub: 'lowest confidence first', items: by('gen').sort(byConf) },
      ];
      return g.filter((x) => x.items.length || (!anyFilter() && x.hint && (x.key === 'open' || x.key === 'done')));
    }
    function navIds(run) {
      if (run.kind !== 'rows') return [];
      const out = [];
      groupsFor(run).forEach((g) => { if (!S.collapsed[g.key]) g.items.forEach((v) => out.push(v.c.id)); });
      return out;
    }
    function openOrder(run) {
      const g = groupsFor(run).find((x) => x.key === 'open');
      const vis = g ? g.items.map((v) => v.c.id) : [];
      if (vis.length) return vis;
      return run.ids.map((id) => rowView(run, id)).filter((v) => v.r && v.open).sort(bySeverity).map((v) => v.c.id);
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
    function putKeepScroll(el, html) { const s = el.scrollTop; put(el, html); el.scrollTop = s; }
    function marksHtml(c) {
      const label = CRIT.map((x) => x[2] + (c.criteria[x[0]].met ? ' met' : ' not met')).join(', ');
      return '<span class="sp-mks" role="img" aria-label="' + label + '">' + CRIT.map((x) => {
        const m = c.criteria[x[0]].met;
        return '<span class="sp-mk ' + (m ? 'is-y' : 'is-n') + '" title="' + x[2] + ': ' + (m ? 'met' : 'not met') + '" aria-hidden="true">' + (m ? '✓' : x[1]) + '</span>';
      }).join('') + '</span>';
    }
    function runStatus(run) {
      if (run.kind === 'rows') {
        const k = counts(run);
        if (run.status === 'running') return { dot: 'is-running', pill: 'is-running', word: 'Running', text: 'Running · ' + k.done + '/' + k.total, bar: k.done / k.total };
        if (run.status === 'stopped') return { dot: 'is-stopped', pill: 'is-stopped', word: 'Stopped', text: 'Stopped · ' + k.done + '/' + k.total, bar: k.done / k.total };
        return { dot: 'is-complete', pill: 'is-complete', word: 'Complete', text: run.dateLabel + ' · ' + (k.open ? k.open + ' to review' : 'all reviewed') };
      }
      const s = run.summary;
      if (run.status === 'running') return { dot: 'is-running', pill: 'is-running', word: 'Resuming', text: 'Resuming · ' + s.done + '/' + s.total, bar: s.done / s.total };
      if (run.status === 'interrupted' || run.status === 'stopped') return { dot: 'is-stopped', pill: 'is-stopped', word: 'Interrupted', text: 'Interrupted · ' + s.done + '/' + s.total, bar: s.done / s.total };
      return { dot: 'is-complete', pill: 'is-complete', word: 'Complete', text: run.dateLabel + ' · ' + s.review + ' to review' };
    }

    /* ---------- run switcher ---------- */
    function renderSwitch() {
      const run = activeRun();
      const st = runStatus(run);
      let h = '<button class="sp-runsw" data-act="menu" data-fk="runsw" aria-haspopup="true" aria-expanded="' + S.menuOpen + '" aria-label="Switch run. Current run: ' + esc(run.file) + '">' +
        '<span class="sp-runsw-f">' + esc(run.file) + '</span>' +
        '<span class="sp-runsw-m"><span class="sp-dot ' + st.dot + '"></span><span class="sp-num">' + esc(st.text) + '</span></span>' +
        '<span class="sp-runsw-chev" aria-hidden="true">▾</span></button>';
      if (S.menuOpen) {
        const item = (r) => {
          const s = runStatus(r);
          return '<button class="sp-mi" role="menuitem" data-act="open-run" data-id="' + r.id + '" data-fk="mi-' + r.id + '" aria-current="' + (r.id === S.activeId) + '">' +
            '<span class="sp-mi-f">' + esc(r.file) + '</span>' +
            '<span class="sp-mi-m"><span class="sp-dot ' + s.dot + '"></span><span class="sp-num">' + esc(r.kind === 'rows' && r.status === 'complete' ? counts(r).total + ' companies · ' + (counts(r).open ? counts(r).open + ' to review' : 'all reviewed') : s.text) + '</span></span>' +
            '<span class="sp-mi-d">' + esc(r.dateLabel) + ' · ' + esc(r.model.replace(/^claude-/, '')) + '</span>' +
            (s.bar != null ? '<span class="sp-minibar ' + (s.dot === 'is-stopped' ? 'is-stopped' : '') + '"><span style="transform:scaleX(' + s.bar.toFixed(3) + ')"></span></span>' : '') +
            '</button>';
        };
        const fresh = S.runs.filter((r) => r.fresh);
        const older = S.runs.filter((r) => !r.fresh);
        h += '<div class="sp-menu' + (S.menuEnter ? ' is-enter' : '') + '" role="menu" aria-label="Runs">' +
          (fresh.length ? '<div class="sp-menu-h">This session</div>' + fresh.map(item).join('') : '') +
          '<div class="sp-menu-h">Recent runs</div>' + older.map(item).join('') + '</div>';
        S.menuEnter = false;
      }
      put(R('switch'), h);
    }
    function openMenu() {
      S.menuOpen = true; S.menuEnter = true;
      renderSwitch();
      const cur = R('switch').querySelector('.sp-mi[aria-current="true"]') || R('switch').querySelector('.sp-mi');
      if (cur) cur.focus();
    }
    function closeMenu(refocus) {
      if (!S.menuOpen) return;
      S.menuOpen = false;
      renderSwitch();
      if (refocus) { const b = R('switch').querySelector('[data-fk="runsw"]'); if (b) b.focus(); }
    }

    /* ---------- chips ---------- */
    function renderChips() {
      const run = activeRun();
      R('filter').hidden = run.kind !== 'rows';
      if (run.kind !== 'rows') return;
      const k = counts(run);
      const f = S.f;
      const chip = (act, val, label, n, on) => '<button class="sp-chip" data-act="' + act + '" data-v="' + val + '" data-fk="chip-' + val + '" aria-pressed="' + !!on + '">' + label + ' <span class="sp-chip-n">' + n + '</span></button>';
      let h = chip('chip', 'deep tech', 'Deep tech', k.deep, f.verdict === 'deep tech') +
        chip('chip', 'general tech', 'General tech', k.general, f.verdict === 'general tech') +
        chip('chip', 'validated', 'Validated', k.validated, f.validated) +
        chip('chip', 'patents', 'Has patents', k.patents, f.patents);
      if (anyFilter()) h += '<button class="sp-chip sp-chip-clear" data-act="clear-filters" data-fk="chip-clear">Clear</button>';
      put(R('chips'), h);
    }

    /* ---------- list ---------- */
    function itemHtml(run, v, t) {
      const id = v.c.id;
      const sel = id === S.selectedId;
      const pinned = S.pin && S.pin.runId === run.id && S.pin.id === id;
      const attrs = 'class="sp-item' + (v.r ? '' : ' is-pending') + '" data-act="select" data-id="' + id + '" data-fk="item-' + id + '" aria-current="' + sel + '"';
      if (!v.r) {
        const p = v.prog;
        const wait = p === 'Waiting for batch' || p === 'In batch job' || p === 'Validation queued';
        const st = p ? '<span class="sp-step ' + (wait ? 'is-wait' : '') + '">' + esc(p) + '</span>' : '<span class="sp-muted" style="font-size:11.5px">' + (run.status === 'running' ? 'Queued' : 'Not started') + '</span>';
        return '<button ' + attrs + '><span class="sp-i1"><span class="sp-i-name">' + esc(v.c.name) + '</span><span class="sp-muted sp-num" style="font-size:11.5px">#' + v.idx + '</span></span>' +
          '<span class="sp-i2"><span class="sp-i-sec">' + esc(v.c.domain) + '</span>' + st + '</span></button>';
      }
      const age = run.landed[id] ? t - run.landed[id] : 9999;
      const fresh = age < 240;
      const r = v.r;
      const low = r.conf < run.cfg.validatorThreshold;
      let right2 = '';
      if (pinned) right2 += '<span class="sp-pintag">Pinned</span>';
      if (v.dec) right2 += '<span class="sp-tick" title="Reviewed by you">✓ ' + (v.dec.choice === 'confirm' ? 'Confirmed' : 'Changed') + '</span>';
      else if (v.flagged) right2 += riskHtml(r.risk);
      const label = esc(v.c.name) + ', ' + vLabel(v.verdict) + ', confidence ' + r.conf + (v.flagged ? ', ' + r.risk : '') + (v.dec ? ', reviewed' : '');
      const landAttrs = fresh ? attrs.replace('class="sp-item', 'class="sp-item sp-land') + ' style="animation-delay:-' + age + 'ms"' : attrs;
      return '<button ' + landAttrs + ' aria-label="' + label + '"><span class="sp-i1"><span class="sp-i-name">' + esc(v.c.name) + '</span>' +
        '<span class="sp-i-v"><span class="sp-vm ' + vClass(v.verdict) + '">' + (v.verdict === 'deep tech' ? 'Deep' : 'General') + '</span></span>' +
        '<span class="sp-i-c ' + (low ? 'is-low' : '') + '">' + r.conf + '</span></span>' +
        '<span class="sp-i2"><span class="sp-i-sec">' + esc(v.c.domain) + '</span>' + right2 + '</span></button>';
    }
    function renderList() {
      const run = activeRun();
      const el = R('list');
      if (run.kind !== 'rows') {
        const s = run.summary;
        const st = runStatus(run);
        put(el, '<div class="sp-listnote"><b>' + esc(st.word) + ' · ' + s.done + ' of ' + s.total + ' companies</b>' +
          'Company rows for this run are not kept in this workspace; the workbook is the record. The run overview on the right has its numbers' + (run.status === 'complete' ? '.' : ' and lets you resume it.') +
          '<br><button class="sp-btn sp-btn-sm" data-act="open-run" data-id="' + initialRun.id + '" data-fk="back-sample">Back to ' + esc(initialRun.file) + '</button></div>');
        return;
      }
      const groups = groupsFor(run);
      if (!groups.length) {
        putKeepScroll(el, '<div class="sp-listnote"><b>No companies match</b>' + run.ids.length + ' companies in this run.<br><button class="sp-btn sp-btn-sm" data-act="clear-filters" data-fk="list-clear">Clear filters</button></div>');
        return;
      }
      const t = Date.now();
      const html = groups.map((g) => {
        const open = !S.collapsed[g.key];
        const hot = g.key === 'open' && g.items.length > 0;
        return '<section class="sp-grp" aria-label="' + g.label + '"><button class="sp-gh' + (hot ? ' is-hot' : '') + '" data-act="toggle-grp" data-g="' + g.key + '" data-fk="gh-' + g.key + '" aria-expanded="' + open + '">' +
          '<span class="sp-gh-chev" aria-hidden="true">▼</span><span>' + g.label + '</span>' + (g.sub ? '<span class="sp-gh-s">' + esc(g.sub) + '</span>' : '') +
          '<span class="sp-gh-n">' + g.items.length + '</span></button>' +
          (open ? (g.items.length ? g.items.map((v) => itemHtml(run, v, t)).join('') : (g.hint ? '<div class="sp-ghint">' + esc(g.hint) + '</div>' : '')) : '') +
          '</section>';
      }).join('');
      putKeepScroll(el, html + '<div class="sp-listpad"></div>');
    }

    /* ---------- run bar ---------- */
    function renderRunbar() {
      const run = activeRun();
      const st = runStatus(run);
      const k = counts(run);
      const stat = (label, val, cls, opt) => '<span class="sp-rb-stat' + (opt ? ' sp-rb-opt' : '') + '">' + label + '<b class="' + (cls || '') + '">' + val + '</b></span>';
      let stats = '<span class="sp-pill ' + st.pill + '">' + st.word + (run.status !== 'complete' ? ' <span class="sp-num">' + k.done + '/' + k.total + '</span>' : '') + '</span>';
      stats += stat('Deep tech', k.deep, 'is-deep') + stat('General tech', k.general) +
        stat('Needs review', k.open + (run.kind === 'rows' && k.reviewed ? '<small>' + k.reviewed + ' reviewed</small>' : ''), k.open ? 'is-review' : '');
      if (run.kind === 'rows') stats += stat('Avg conf.', k.avg == null ? '—' : k.avg, '', true);
      stats += stat(run.status === 'running' ? 'Cost so far' : 'Cost', k.cost == null ? '—' : k.costUnknown ? 'unknown' : money(k.cost), '', true);
      let acts = '';
      if (run.status === 'running') acts += '<button class="sp-btn sp-btn-stop" data-act="stop" data-fk="rb-stop">■ Stop</button>';
      if (run.status === 'stopped' || run.status === 'interrupted') acts += '<button class="sp-btn sp-btn-primary" data-act="resume" data-fk="rb-resume">Resume</button>';
      if (run.kind === 'rows') acts += '<button class="sp-btn" data-act="overview" data-fk="rb-overview" aria-pressed="' + (S.selectedId == null) + '">Run overview <kbd>O</kbd></button>';
      acts += '<button class="sp-btn" data-act="download" data-fk="rb-download">Download Excel</button>';
      const prog = st.bar != null ? '<span class="sp-rb-prog ' + (st.dot === 'is-stopped' ? 'is-stopped' : '') + '" aria-hidden="true"><span style="transform:scaleX(' + st.bar.toFixed(3) + ')"></span></span>' : '';
      put(R('runbar'), '<div class="sp-rb-stats" aria-label="Run summary">' + stats + '</div><div class="sp-rb-acts">' + acts + '</div>' + prog);
    }

    /* ---------- dock: decision bar + compare strip ---------- */
    function decPosText(run, v) {
      if (v.open) {
        const order = openOrder(run);
        const i = order.indexOf(v.c.id);
        return 'Needs review · <b>' + (i < 0 ? plural(counts(run).open, 'open') : (i + 1) + ' of ' + order.length) + '</b>';
      }
      if (v.dec) return 'Reviewed by you';
      return 'Clear · no review needed';
    }
    function updateDecPos() {
      const run = activeRun(); const id = S.selectedId;
      if (run.kind !== 'rows' || !id) return;
      const v = rowView(run, id); if (!v.r) return;
      const el = R('dock').querySelector('[data-r="decpos"]');
      if (el) el.innerHTML = decPosText(run, v);
    }
    function renderDock() {
      const run = activeRun();
      const el = R('dock');
      const id = S.selectedId;
      if (run.kind !== 'rows' || !id) { put(el, ''); return; }
      const v = rowView(run, id);
      const pinned = S.pin && S.pin.runId === run.id && S.pin.id === id;
      const pinBtn = '<button class="sp-btn" data-act="pin" data-fk="pin" aria-pressed="' + !!pinned + '" title="Keep this company’s header facts visible while you read another">' + (pinned ? 'Pinned' : 'Pin to compare') + ' <kbd>P</kbd></button>';
      let h = '<div class="sp-dock-in">';
      if (!v.r) {
        h += '<div class="sp-dec-k"><span>' + (v.prog ? 'Processing' : run.status === 'running' ? 'Queued' : 'Not started') + '</span><span class="sp-dec-k-r">Decisions open once the result lands</span></div>' +
          '<div class="sp-dec-row"><div class="sp-dec-msg sp-dim">' + (v.prog ? esc(v.prog) + ' for ' + esc(v.c.name) + '.' : run.status === 'running' ? 'Waiting for its turn in this run.' : 'This company had not finished when the run stopped. Resume the run to classify it.') + '</div></div>';
      } else {
        h += '<div class="sp-dec-k"><span data-r="decpos">' + decPosText(run, v) + '</span><span class="sp-dec-k-r">Recorded in the workbook’s reviewer columns</span></div><div class="sp-dec-row">';
        if (v.open) {
          const key = run.id + ':' + id;
          const d = S.drafts[key] || {};
          const orig = v.r.verdict;
          h += '<div class="sp-seg" role="group" aria-label="Decision">' +
            '<button class="sp-btn" data-act="choose" data-v="confirm" data-fk="dec-confirm" aria-pressed="' + (d.choice === 'confirm') + '">Confirm ' + vLabel(orig).toLowerCase() + ' <kbd>C</kbd></button>' +
            '<button class="sp-btn" data-act="choose" data-v="change" data-fk="dec-change" aria-pressed="' + (d.choice === 'change') + '">Change to ' + vLabel(flip(orig)).toLowerCase() + ' <kbd>X</kbd></button></div>' +
            '<label class="sp-note"><span class="sp-muted" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Reviewer note</span><input type="text" data-fk="note" placeholder="Note for the record (optional)" autocomplete="off" value="' + esc(d.note || '') + '"><kbd aria-hidden="true">N</kbd></label>' +
            '<button class="sp-btn sp-btn-primary" data-act="record" data-fk="record"' + (d.choice ? '' : ' disabled') + ' title="Record, then go to the next company that needs review">Record &amp; next <kbd>↵</kbd></button>';
        } else if (v.dec) {
          const same = v.dec.verdict === v.r.verdict;
          h += '<div class="sp-dec-msg"><b>' + (same ? '✓ Confirmed ' : '✓ Changed to ') + vLabel(v.dec.verdict).toLowerCase() + '</b> <span class="sp-dim">· ' + v.action + (v.dec.note ? ' · </span><q>' + esc(v.dec.note) + '</q>' : ' · no note</span>') + '</div>' +
            '<button class="sp-btn" data-act="undo-dec" data-fk="undo-dec">Undo <kbd>U</kbd></button>' +
            (counts(run).open ? '<button class="sp-btn" data-act="next-open" data-fk="next-open">Next to review →</button>' : '');
        } else {
          h += '<div class="sp-dec-msg"><b>' + v.action + '</b> <span class="sp-dim">· the action follows the verdict; nothing to decide.</span></div>' +
            (counts(run).open ? '<button class="sp-btn" data-act="next-open" data-fk="next-open">Next to review →</button>' : '');
        }
        h += '<span class="sp-dec-sep" aria-hidden="true"></span>' + pinBtn + '</div>';
      }
      h += '</div>';
      h += compareHtml(run, id);
      put(el, h);
    }
    function cmpRow(run, id, kind) {
      const v = rowView(run, id);
      const r = v.r;
      const name = kind === 'pin'
        ? '<button class="sp-cmp-n" data-act="select" data-id="' + id + '" data-fk="cmp-open" title="Read ' + esc(v.c.name) + '">' + esc(v.c.name) + '</button>'
        : '<span class="sp-cmp-n">' + esc(v.c.name) + '</span>';
      return '<div class="sp-cmp-row' + (kind === 'pin' ? ' is-pin' : '') + '">' +
        '<span class="sp-cmp-k">' + (kind === 'pin' ? 'Pinned' : 'Reading') + '</span>' + name +
        '<span>' + vmark(v.verdict) + '</span><span class="sp-cmp-c">' + r.conf + '</span><span>' + riskHtml(r.risk) + (v.dec ? ' <span class="sp-tick">✓</span>' : '') + '</span>' +
        '<span>' + marksHtml(v.c) + '</span>' +
        '<span class="sp-dim sp-num" title="EPO patents">' + (r.patents.status === 'disabled' ? 'no lookup' : plural(r.patents.count, 'patent')) + '</span>' +
        '<span class="sp-dim sp-cmp-o">' + (r.validated ? 'Validator ' + r.val.confidence : 'Not validated') + ' · ' + esc(BASIS[r.basis].toLowerCase()) + '</span>' +
        (kind === 'pin' ? '<button class="sp-btn sp-btn-ghost sp-btn-sm sp-cmp-x" data-act="unpin" data-fk="unpin">Unpin</button>' : '<span></span>') +
        '</div>';
    }
    function compareHtml(run, id) {
      if (!S.pin || S.pin.runId !== run.id || !run.results[S.pin.id]) return '';
      if (S.pin.id === id) {
        return '<div class="sp-cmp"><div class="sp-dock-in" style="padding-top:5px;padding-bottom:5px"><div class="sp-cmp-one"><span class="sp-pintag">Pinned</span><span>' + esc(C_BY_ID[id].name) + ' is pinned. Open another company and its facts line up against this one.</span></div></div></div>';
      }
      if (!run.results[id]) return '';
      return '<div class="sp-cmp" aria-label="Comparison with pinned company"><div class="sp-dock-in" style="padding-top:4px;padding-bottom:4px">' + cmpRow(run, S.pin.id, 'pin') + cmpRow(run, id, 'cur') + '</div></div>';
    }

    /* ---------- reading pane ---------- */
    function renderDoc() {
      const run = activeRun();
      const el = R('doc');
      const key = run.id + ':' + (run.kind === 'rows' && S.selectedId ? S.selectedId : 'ov');
      let html;
      if (run.kind !== 'rows') html = summaryOverviewHtml(run);
      else if (!S.selectedId) html = overviewHtml(run);
      else {
        const v = rowView(run, S.selectedId);
        html = v.r ? docHtml(run, v) : pendingHtml(run, v);
      }
      if (key === S.docKey) putKeepScroll(el, html);
      else { put(el, html); el.scrollTop = 0; S.docKey = key; }
    }

    function flagText(run, r) {
      const th = run.cfg.validatorThreshold;
      if (r.risk === 'Clear') {
        return { t: 'Clear', p: r.validated ? 'The validator checked the web and confirmed the verdict with enough confidence. The action follows the verdict.'
          : r.conf < th && !run.cfg.validator ? 'Confidence is below ' + th + ', but validation was off for this run, so nothing challenged the verdict. Treat it with care.'
            : 'Confidence reached ' + th + ' or more without needing a second opinion. The action follows the verdict.' };
      }
      if (r.risk === 'Uncertain') return { t: 'Uncertain: the evidence is thin', p: 'The validator searched the web, but confidence is still below ' + th + '. Nothing contradicts the verdict; there is just not enough to be sure.' };
      if (r.risk === 'Contested') return { t: 'Contested: the validator disagreed', p: 'A second pass argued for ' + vLabel(flip(r.verdict)).toLowerCase() + ' with confidence ' + r.val.confidence + ', short of the ' + run.cfg.overrideMinConfidence + ' needed to change the verdict. The original verdict stands with reduced confidence; both readings are plausible.' };
      return { t: 'Escalate: needs a human decision', p: 'The validator found the evidence contradictory or insufficient and handed the call to a reviewer.' };
    }

    function docHtml(run, v) {
      const c = v.c; const r = v.r; const cfg = run.cfg;
      const ft = flagText(run, r);
      const kicker = '<div class="sp-kicker"><span class="sp-num">Row ' + v.idx + ' of ' + run.ids.length + '</span><span>' + esc(c.domain) + '</span>' + (cfg.mapping.uen ? '<span class="sp-mono">UEN ' + esc(c.uen) + '</span>' : '') + '</div>';
      const dek = r.hasInputDesc ? '<p class="sp-dek">' + esc(c.description) + '</p>' : '';
      const vsub = v.dec ? 'Reviewed · ' + v.action + (v.dec.verdict !== r.verdict ? ' · pipeline said ' + vLabel(r.verdict).toLowerCase() : '') : 'Action: ' + v.action;
      const head = '<header>' + kicker + '<h1 class="sp-h1">' + esc(c.name) + '</h1>' + dek +
        '<div class="sp-vline">' +
        '<div class="sp-vcell"><span class="sp-vl">Verdict</span>' + vmark(v.verdict, 'sp-vbig') + '<span class="sp-vs">' + esc(vsub) + '</span></div>' +
        '<div class="sp-vcell"><span class="sp-vl">Confidence</span><span class="sp-cbig">' + r.conf + '<small>/100</small></span><span class="sp-vs">' + confWord(r.conf) + '</span></div>' +
        '<div class="sp-vcell"><span class="sp-vl">Risk flag</span><div class="sp-ft r-' + r.risk + '">' + esc(ft.t) + '</div><p class="sp-fp">' + esc(ft.p) + '</p></div>' +
        '</div></header>';
      const main = '<div class="sp-main">' + reasoningSec(c, r) + criteriaSec(c) + ledgerSec(run, r) + patentsSec(r) + validatorSec(run, r) + '</div>';
      return '<article class="sp-doc">' + head + '<div class="sp-body">' + main + factsHtml(run, v) + '</div></article>';
    }

    function reasoningSec(c, r) {
      let q = '';
      if (r.hasWeb) q += '<blockquote class="sp-quote">' + esc(c.webDescription) + '<cite>Web enrichment · ' + esc(c.webSource) + '</cite></blockquote>';
      if (r.hasInputDesc) q += '<blockquote class="sp-quote">' + esc(c.description) + '<cite>Input file, description column</cite></blockquote>';
      if (!q) q = '<p class="sp-prose sp-dim">No description in the input file' + (c.webStatus === 'not_found' ? ' and nothing reliable found on the web' : '') + '. The verdict rests on the company name' + (r.patents.count ? ' and patents' : '') + '.</p>';
      return '<section class="sp-sec" data-sec="reasoning"><h2>The classifier’s reasoning</h2><p class="sp-lead">' + esc(c.reasoning) + '</p>' +
        '<h3>What it read · ' + esc(BASIS[r.basis]) + '</h3>' + q + '</section>';
    }

    function criteriaSec(c) {
      const met = CRIT.filter((x) => c.criteria[x[0]].met).length;
      return '<section class="sp-sec" data-sec="criteria"><h2>The three criteria <span>' + met + ' of 3 met</span></h2><ol class="sp-crits">' + CRIT.map((x) => {
        const cr = c.criteria[x[0]];
        return '<li><span class="sp-mk ' + (cr.met ? 'is-y' : 'is-n') + '" aria-hidden="true">' + (cr.met ? '✓' : x[1]) + '</span><b>' + x[2] + '<small>' + (cr.met ? 'met' : 'not met') + '</small></b><p>' + esc(cr.reasoning) + '</p></li>';
      }).join('') + '</ol></section>';
    }

    function ledgerSec(run, r) {
      const cfg = run.cfg; const th = cfg.validatorThreshold;
      const rows = [];
      rows.push({ t: 'Classifier score', w: 'Agent 1’s own confidence in its verdict.', d: '', v: r.llm });
      const afterPat = clamp(r.llm + r.adj, 0, 100);
      const patWhy = !cfg.epo ? 'Patent lookup was off for this run.' : r.adj === 0 ? (r.patents.count ? 'The patents found are not deep tech, so no adjustment.' : 'No patents found, so no adjustment.') : r.patents.level + ' portfolio of ' + plural(r.patents.count, 'patent') + '; the adjustment is capped at ±' + cfg.epoAdjustMax + '.';
      rows.push({ t: 'Patent adjustment', w: patWhy, d: signed(r.adj), v: afterPat });
      if (r.pre < afterPat) rows.push({ t: 'Low-evidence cap', w: 'No description and no patents, so confidence cannot exceed ' + cfg.lowEvidenceCap + '.', d: '≤ ' + cfg.lowEvidenceCap, v: r.pre });
      const gate = !cfg.validator ? 'Validation was off for this run, so the score stands.'
        : r.validated ? r.pre + ' is below the validation threshold of ' + th + ', so the validator ran.'
          : r.pre < th ? r.pre + ' is below ' + th + ', but this company was not sent for validation.'
            : r.pre + ' is at or above the threshold of ' + th + ', so no second opinion was needed.';
      rows.push({ gate: true, t: 'Validation check', w: gate, d: '', v: r.pre });
      if (r.validated) {
        const val = r.val;
        let how = val.verdict === 'confirm' ? 'Confirmed the verdict, so confidence becomes the validator’s own (' + val.confidence + ').'
          : r.override === 'applied' ? 'Override applied: the verdict flips and takes the validator’s confidence (' + val.confidence + ').'
            : r.override === 'blocked' ? 'Override blocked: the validator’s ' + val.confidence + ' is short of the ' + cfg.overrideMinConfidence + ' needed, so the verdict stands and confidence drops to reflect the disagreement.'
              : 'Insufficient evidence: confidence can only go down.';
        if (r.capped && r.conf === cfg.lowEvidenceCap) how += ' Held at the low-evidence cap of ' + cfg.lowEvidenceCap + '.';
        rows.push({ t: 'Validator', w: how, d: signed(r.conf - r.pre), v: r.conf });
      }
      const lis = rows.map((x, i) => '<li class="' + (x.gate ? 'is-gate' : '') + '"><span class="sp-lg-i">' + (i + 1) + '</span><div><span class="sp-lg-t">' + x.t + '</span><span class="sp-lg-w">' + esc(x.w) + '</span></div><span class="sp-lg-d">' + x.d + '</span><span class="sp-lg-v">' + x.v + '</span></li>').join('') +
        '<li class="is-total"><span></span><div><span class="sp-lg-t">Final confidence</span><span class="sp-lg-w">' + confWord(r.conf) + ' · how likely the chosen verdict is to be correct</span></div><span></span><span class="sp-lg-v">' + r.conf + '</span></li>';
      const track = '<div class="sp-track" aria-hidden="true"><span class="sp-track-l"></span><span class="sp-track-th" style="left:' + th + '%"></span>' +
        (r.pre !== r.conf ? '<span class="sp-track-pre" style="left:' + r.pre + '%"></span>' : '') + '<span class="sp-track-fin" style="left:' + r.conf + '%"></span></div>' +
        '<div class="sp-track-ax"><span>0</span><span>' + (r.pre !== r.conf ? '○ before validation ' + r.pre + ' · ● final ' + r.conf + ' · ' : '● final ' + r.conf + ' · ') + 'dashed line: validation threshold ' + th + '</span><span>100</span></div>';
      return '<section class="sp-sec" data-sec="confidence"><h2>How the confidence was built <span>step by step</span></h2><ol class="sp-ledger">' + lis + '</ol>' + track + '</section>';
    }

    function patentsSec(r) {
      const p = r.patents;
      if (p.status === 'disabled') return '<section class="sp-sec" data-sec="patents"><h2>Patents and CPC codes</h2><p class="sp-prose sp-dim">Patent lookup was off for this run.</p></section>';
      let s;
      if (!p.count) s = 'No patents were found in the EPO database under this applicant name.';
      else s = plural(p.count, 'patent') + ' found in the EPO database. The portfolio rates <b>' + esc(p.level) + '</b> as a deep tech signal' + (p.domain ? ', concentrated in ' + esc(p.domain.toLowerCase()) : '') + (r.adj ? ', and it moved confidence by ' + signed(r.adj) + '.' : ', so it did not move confidence.');
      const cpc = p.cpc.length ? '<div class="sp-cpc">' + p.cpc.map((x) => '<code>' + esc(x.code) + '</code><span>' + esc(x.desc) + '</span>').join('') + '</div>' : '';
      return '<section class="sp-sec" data-sec="patents"><h2>Patents and CPC codes <span>' + plural(p.count, 'patent') + '</span></h2><p class="sp-prose">' + s + '</p>' + cpc + '</section>';
    }

    function validatorSec(run, r) {
      if (!r.validated) {
        const why = !run.cfg.validator ? 'Validation was off for this run.' : 'The validator did not run: confidence before validation was ' + r.pre + ', at or above the threshold of ' + run.cfg.validatorThreshold + ', so no second opinion was needed.';
        return '<section class="sp-sec" data-sec="validator"><h2>The validator’s finding <span>not run</span></h2><p class="sp-prose sp-dim">' + why + '</p></section>';
      }
      const V = { confirm: 'Confirmed the verdict', override: 'Argued for the other verdict', insufficient_evidence: 'Insufficient evidence' };
      const DEC = { AUTO_APPROVE: 'No escalation', ESCALATE_FOR_HUMAN_REVIEW: 'Escalated for human review' };
      const val = r.val;
      return '<section class="sp-sec" data-sec="validator"><h2>The validator’s finding <span>Agent 2 · confidence ' + val.confidence + '</span></h2>' +
        '<p class="sp-prose">' + esc(val.summary) + '</p>' +
        (val.escalationReason ? '<div class="sp-reason"><b>Why it was escalated:</b> ' + esc(val.escalationReason) + '</div>' : '') +
        '<dl class="sp-kv" style="margin-top:14px"><dt>Finding</dt><dd>' + V[val.verdict] + (r.override ? ' (override ' + r.override + ')' : '') + '</dd><dt>Decision</dt><dd>' + DEC[val.decision] + '</dd><dt>Web searches</dt><dd class="sp-num">up to ' + run.cfg.maxWebSearches + '</dd></dl>' +
        '<h3>Sources · ' + val.sources.length + '</h3><ul class="sp-srcs">' + val.sources.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ul></section>';
    }

    function factsHtml(run, v) {
      const c = v.c; const r = v.r; const cfg = run.cfg;
      const row = (k, val, cls) => '<dt>' + k + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + val + '</dd>';
      let dl = '';
      if (cfg.mapping.uen) dl += row('UEN', esc(c.uen), 'sp-mono');
      dl += row('Sector', esc(c.domain));
      dl += row('Basis', esc(BASIS[r.basis]));
      if (r.hasWeb) dl += row('Web source', esc(c.webSource), 'sp-mono');
      dl += row('Patents', r.patents.status === 'disabled' ? 'Lookup off' : r.patents.count + (r.patents.count ? ' · ' + esc(r.patents.level) : ''), 'sp-num');
      dl += row('Validator', r.validated ? 'Ran · ' + r.val.confidence : 'Not run', 'sp-num');
      dl += row('Action', v.action + (v.dec ? ' (reviewed)' : ''));
      dl += row('Cost', r.cost == null ? 'unknown' : money(r.cost, 3), 'sp-num');
      dl += row('Time', r.timeS.toFixed(1) + ' s', 'sp-num');
      dl += row('Model', esc(run.model), 'sp-mono');
      const toc = [['reasoning', 'Classifier’s reasoning'], ['criteria', 'The three criteria'], ['confidence', 'How confidence was built'], ['patents', 'Patents and CPC codes'], ['validator', 'Validator’s finding']];
      return '<aside class="sp-facts" aria-label="Facts"><div class="sp-facts-h">Facts</div><dl>' + dl + '</dl>' +
        '<nav class="sp-toc" aria-label="On this page"><div class="sp-facts-h">On this page</div>' + toc.map((x) => '<button data-act="goto" data-sec="' + x[0] + '" data-fk="toc-' + x[0] + '">' + x[1] + '</button>').join('') + '</nav></aside>';
    }

    function pendingHtml(run, v) {
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
        return '<li class="' + cls + '"><span class="sp-num">' + (i + 1) + '.</span><span>' + s + '</span><span>' + txt + '</span></li>';
      }).join('');
      return '<article class="sp-doc"><div class="sp-kicker"><span class="sp-num">Row ' + v.idx + ' of ' + run.ids.length + '</span><span>' + esc(v.c.domain) + '</span></div>' +
        '<h1 class="sp-h1">' + esc(v.c.name) + '</h1>' +
        '<section class="sp-sec" style="margin-top:20px;padding-top:18px;border-top:1px solid var(--border)"><h2>' + (p ? 'In progress' : run.status === 'running' ? 'Queued' : 'Not started') + ' <span>' + (batchOn(run.cfg) ? 'batch mode' : 'one company at a time') + '</span></h2><ul class="sp-steps">' + list + '</ul>' +
        '<p class="sp-prose sp-dim" style="margin-top:12px">' + (run.status === 'running' ? 'The reading pane fills in when this result lands. You can read other companies meanwhile; this page will not jump.' : 'This company had not finished when the run stopped. Resume to classify it.') + '</p></section>' +
        '<section class="sp-sec"><h2>From the input file</h2>' + (v.c.description ? '<blockquote class="sp-quote">' + esc(v.c.description) + '<cite>Description column</cite></blockquote>' : '<p class="sp-prose sp-dim">No description in the input file.</p>') + '</section></article>';
    }

    function cfgTags(cfg) {
      const t = (on, label) => '<span class="sp-cfgtag ' + (on ? '' : 'is-off') + '">' + label + '</span>';
      return '<div class="sp-cfg">' + t(cfg.enrichment, 'Web enrichment') + t(cfg.epo, 'Patent lookup') + t(cfg.validator, 'Validation &lt; ' + cfg.validatorThreshold) + t(batchOn(cfg), 'Batch mode') +
        '<span class="sp-cfgtag">Override ≥ ' + cfg.overrideMinConfidence + '</span><span class="sp-cfgtag">Patent adj. ±' + cfg.epoAdjustMax + '</span><span class="sp-cfgtag">Low-evidence cap ' + cfg.lowEvidenceCap + '</span></div>';
    }

    function histHtml(run) {
      const bins = Array.from({ length: 10 }, () => ({ d: 0, g: 0 }));
      run.ids.forEach((id) => {
        const v = rowView(run, id); if (!v.r) return;
        const b = bins[Math.min(9, Math.floor(v.r.conf / 10))];
        if (v.verdict === 'deep tech') b.d++; else b.g++;
      });
      const max = Math.max(1, ...bins.map((b) => b.d + b.g));
      const th = run.cfg.validatorThreshold;
      return '<figure class="sp-hist"><div class="sp-hist-bars" role="img" aria-label="Confidence distribution in bands of ten">' + bins.map((b, i) => {
        const n = b.d + b.g;
        const lo = i * 10; const hi = i === 9 ? 100 : i * 10 + 9;
        return '<span class="sp-bin" title="Confidence ' + lo + '–' + hi + ': ' + b.d + ' deep tech, ' + b.g + ' general tech">' + (n ? '<span class="sp-bin-n">' + n + '</span>' : '') +
          '<span class="sp-bin-g" style="height:' + Math.round(b.g / max * 78) + 'px"></span><span class="sp-bin-d" style="height:' + Math.round(b.d / max * 78) + 'px"></span></span>';
      }).join('') + '<span class="sp-hist-th" style="left:' + th + '%"></span></div>' +
        '<div class="sp-hist-ax"><span>0</span><span>50</span><span>100</span></div>' +
        '<div class="sp-hist-lg"><span><i class="sp-sw" style="background:var(--deep)"></i>Deep tech</span><span><i class="sp-sw" style="background:var(--border-strong)"></i>General tech</span><span><i class="sp-sw" style="border-left:1px dashed var(--escalate);border-radius:0;width:1px"></i>Validation threshold ' + th + '</span></div></figure>';
    }

    function overviewHtml(run) {
      const k = counts(run);
      const st = runStatus(run);
      let notice = '';
      if (run.status === 'running') notice = '<div class="sp-notice is-running"><p><b class="sp-num">' + k.done + ' of ' + k.total + '</b> · ' + (batchOn(run.cfg) ? 'Batch · ' : 'Sequential · ') + esc(run.phase) + '</p><button class="sp-btn sp-btn-stop" data-act="stop" data-fk="ov-stop">■ Stop</button></div>';
      else if (run.status === 'stopped') notice = '<div class="sp-notice"><p>Stopped after <b class="sp-num">' + k.done + ' of ' + k.total + '</b>. Finished results are kept and can be read now. Resume continues at the next unfinished company with <span class="sp-mono">' + esc(run.model) + '</span>, the model this run started with.</p><button class="sp-btn sp-btn-primary" data-act="resume" data-fk="ov-resume">Resume</button></div>';
      const stat = (l, v, cls) => '<div class="sp-stat"><span class="sp-vl">' + l + '</span><div class="sp-stat-v ' + (cls || '') + '">' + v + '</div></div>';
      const stats = '<div class="sp-stats">' + stat('Processed', k.done + '<small>/' + k.total + '</small>') + stat('Deep tech', k.deep, 'is-deep') + stat('General tech', k.general) +
        stat('Needs review', k.open + (k.reviewed ? '<small> · ' + k.reviewed + ' reviewed</small>' : ''), k.open ? 'is-review' : '') + stat('Avg confidence', k.avg == null ? '—' : k.avg) +
        stat(run.status === 'running' ? 'Cost so far' : 'Cost', k.costUnknown ? 'unknown' : money(k.cost)) + '</div>';
      const RISK_TXT = { Escalate: 'The validator handed the call to a person.', Contested: 'The validator disagreed but could not overturn the verdict.', Uncertain: 'Validated, but the evidence is still thin.', Clear: 'No open questions; the action follows the verdict.' };
      const risks = '<ul class="sp-risklist">' + ['Escalate', 'Contested', 'Uncertain', 'Clear'].map((x) => '<li>' + riskHtml(x) + '<span>' + RISK_TXT[x] + '</span><b>' + k.risk[x] + '</b></li>').join('') + '</ul>';
      const inflight = run.ids.filter((id) => run.progress[id]);
      const proc = run.status === 'running' && inflight.length ? '<section class="sp-sec"><h2>Processing now <span>' + inflight.length + '</span></h2><ul class="sp-steps">' + inflight.slice(0, 6).map((id) => '<li><span>' + esc(C_BY_ID[id].name) + '</span><span>' + esc(run.progress[id]) + '</span></li>').join('') + (inflight.length > 6 ? '<li><span class="sp-muted">and ' + (inflight.length - 6) + ' more</span><span></span></li>' : '') + '</ul></section>' : '';
      const first = openOrder(run)[0];
      const cta = k.open && first ? '<button class="sp-btn sp-btn-primary" data-act="select" data-id="' + first + '" data-fk="ov-start">Start reviewing · ' + plural(k.open, 'company', 'companies') + '</button>'
        : k.done ? '<p class="sp-dim" style="font-size:12.5px">' + (k.flagged ? 'Every flagged company has a decision.' : 'No companies were flagged in this run.') + '</p>' : '';
      const costLine = k.costUnknown || !k.done ? '' : '<dl class="sp-kv" style="grid-template-columns:110px 1fr;font-size:12.5px;margin-top:14px"><dt>Per company</dt><dd class="sp-num">' + money(k.cost / k.done, 3) + '</dd><dt>Validation share</dt><dd class="sp-num">' + money(k.valCost) + ' for ' + k.validated + ' validated</dd></dl>';
      const side = '<aside class="sp-facts"><div class="sp-facts-h">Run</div><dl>' +
        '<dt>Status</dt><dd>' + st.word + '</dd><dt>Started</dt><dd>' + esc(run.dateLabel) + '</dd><dt>Model</dt><dd class="sp-mono">' + esc(run.model) + '</dd><dt>Mode</dt><dd>' + (batchOn(run.cfg) ? 'Batch' : 'One at a time') + '</dd><dt>Run id</dt><dd class="sp-mono">' + esc(run.id) + '</dd></dl>' +
        costLine + '<div class="sp-ov-acts">' + cta + '<button class="sp-btn" data-act="rerun" data-fk="ov-rerun">New run with these settings…</button><button class="sp-btn" data-act="download" data-fk="ov-download">Download Excel</button></div></aside>';
      return '<article class="sp-doc"><div class="sp-kicker"><span>Run overview</span><span class="sp-num">' + k.total + ' companies</span></div><h1 class="sp-h1">' + esc(run.file) + '</h1>' + notice + stats +
        '<div class="sp-body"><div class="sp-main">' + proc +
        '<section class="sp-sec"><h2>Confidence distribution <span>' + k.done + ' classified</span></h2>' + (k.done ? histHtml(run) : '<p class="sp-prose sp-dim">Results appear here as companies finish.</p>') + '</section>' +
        '<section class="sp-sec"><h2>Risk flags</h2>' + risks + '<p class="sp-prose sp-dim" style="margin-top:10px;font-size:13.5px">Deep tech and General tech counts include flagged companies under their current verdict. Needs review counts flagged companies you have not decided yet.</p></section>' +
        '<section class="sp-sec"><h2>Settings used</h2>' + cfgTags(run.cfg) + '</section>' +
        '</div>' + side + '</div></article>';
    }

    function summaryOverviewHtml(run) {
      const s = run.summary;
      const st = runStatus(run);
      const running = run.status === 'running';
      const done = run.status === 'complete';
      let lead;
      if (done) lead = (run.resumed ? 'This run was resumed and finished today.' : 'This run finished on ' + esc(run.dateLabel) + '.') + ' Its rows were not kept in this workspace, so the Management View and Full Detail sheets are the record. Download the workbook to review its ' + plural(s.review, 'flagged company', 'flagged companies') + '.';
      else lead = 'Progress is checkpointed after every company. Resume continues at company ' + (s.done + 1) + ' with <span class="sp-mono">' + esc(run.model) + '</span>, the model this run started with, and retries any company that ended in an error. It needs the same input file, <b>' + esc(run.file) + '</b>, with its rows in the same order.';
      const stat = (l, v, cls) => '<div class="sp-stat"><span class="sp-vl">' + l + '</span><div class="sp-stat-v ' + (cls || '') + '">' + v + '</div></div>';
      const stats = '<div class="sp-stats">' + stat('Processed', s.done + '<small>/' + s.total + '</small>') + stat('Deep tech', s.deep, 'is-deep') + stat('General tech', s.general) + stat('Needs review', s.review, s.review ? 'is-review' : '') + stat('Errors', s.errors) + stat('Cost', s.cost != null ? money(s.cost) : '—') + '</div>';
      const acts = running ? '<button class="sp-btn sp-btn-stop" data-act="stop" data-fk="sum-stop">■ Stop</button>' : !done ? '<button class="sp-btn sp-btn-primary" data-act="resume" data-fk="sum-resume">Resume run</button>' : '';
      return '<article class="sp-doc"><div class="sp-kicker"><span>Run overview</span><span class="sp-mono">' + esc(run.id) + '</span></div><h1 class="sp-h1">' + esc(run.file) + '</h1>' +
        '<p class="sp-dek" style="margin-top:8px">' + lead + '</p>' + stats +
        '<div class="sp-bigbar ' + (running ? 'is-running' : done ? 'is-complete' : '') + '"><span style="transform:scaleX(' + (s.done / s.total).toFixed(3) + ')"></span></div>' +
        '<p class="sp-dim sp-num">' + (running ? esc(run.phase) : done ? s.total + ' of ' + s.total + ' classified' + (s.errors ? ' · ' + s.errors + ' ended in an error and will be retried on a re-run' : '') : (s.total - s.done) + ' companies left · about ' + fmtDur((s.total - s.done) * D.estSecondsPerCompany.sequential).slice(1) + ' at the usual pace') + '</p>' +
        '<div style="display:flex;gap:8px;margin-top:16px">' + acts + '<button class="sp-btn" data-act="download" data-fk="sum-download">' + (s.done < s.total ? 'Download partial Excel' : 'Download Excel') + '</button></div>' +
        '<section class="sp-sec" style="max-width:640px"><h2>Run facts</h2><dl class="sp-kv"><dt>Status</dt><dd>' + st.word + '</dd><dt>Date</dt><dd>' + esc(run.dateLabel) + '</dd><dt>Model</dt><dd class="sp-mono">' + esc(run.model) + '</dd>' +
        (done ? '' : '<dt>Resume rules</dt><dd>Same input file; checkpoints are keyed by row position and the run stops if the rows no longer match.</dd>') + '</dl></section></article>';
    }

    function renderAll() {
      renderSwitch(); renderChips(); renderList(); renderRunbar(); renderDock(); renderDoc();
      S.paneSig = paneSig();
    }

    /* ---------- selection + navigation ---------- */
    function select(id, opts) {
      const run = activeRun();
      if (run.kind !== 'rows') return;
      S.selectedId = id;
      if (id) {
        const g = groupKey(rowView(run, id));
        if (S.collapsed[g]) S.collapsed[g] = false;
      }
      renderList(); renderRunbar(); renderDock(); renderDoc();
      S.paneSig = paneSig();
      if (id) {
        const btn = R('list').querySelector('[data-fk="item-' + id + '"]');
        if (btn) {
          if (btn.scrollIntoView) btn.scrollIntoView({ block: 'nearest' });
          if (opts && opts.focus) btn.focus({ preventScroll: true });
        }
      }
    }
    function move(delta) {
      const run = activeRun(); if (run.kind !== 'rows') return;
      const ids = navIds(run); if (!ids.length) return;
      const i = ids.indexOf(S.selectedId);
      const next = i < 0 ? ids[delta > 0 ? 0 : ids.length - 1] : ids[clamp(i + delta, 0, ids.length - 1)];
      if (next === S.selectedId) return;
      select(next, { focus: R('list').contains(document.activeElement) });
    }
    function nextOpen() {
      const run = activeRun(); if (run.kind !== 'rows') return;
      const order = openOrder(run);
      if (!order.length) { toast('Nothing left to review', 'Every flagged company has a decision.'); return; }
      const i = order.indexOf(S.selectedId);
      select(order[(i + 1) % order.length], { focus: R('list').contains(document.activeElement) });
    }
    function showOverview() {
      const run = activeRun(); if (run.kind !== 'rows' || S.selectedId == null) return;
      S.selectedId = null;
      renderList(); renderRunbar(); renderDock(); renderDoc();
      S.paneSig = paneSig();
    }
    function openRun(id) {
      if (S.activeId === id) { closeMenu(true); return; }
      S.menuOpen = false;
      S.activeId = id;
      S.f = { verdict: '', validated: false, patents: false, q: '' };
      root.querySelector('[data-fk="search"]').value = '';
      const run = activeRun();
      S.selectedId = run.kind === 'rows' && run.status !== 'running' ? (openOrder(run)[0] || null) : null;
      renderAll();
      R('list').scrollTop = 0;
      const b = R('switch').querySelector('[data-fk="runsw"]'); if (b) b.focus();
    }

    /* ---------- decisions ---------- */
    function draftKey() { return S.activeId + ':' + S.selectedId; }
    function openSelected() {
      const run = activeRun();
      if (run.kind !== 'rows' || !S.selectedId) return null;
      const v = rowView(run, S.selectedId);
      return v.r && v.open ? v : null;
    }
    function choose(choice) {
      if (!openSelected()) return;
      const k = draftKey();
      S.drafts[k] = Object.assign({}, S.drafts[k], { choice });
      renderDock();
      focusNote();
    }
    function focusNote() {
      const n = R('dock').querySelector('[data-fk="note"]');
      if (n) { n.focus(); try { n.setSelectionRange(n.value.length, n.value.length); } catch (e) { /* ignore */ } }
    }
    function recordDecision() {
      const run = activeRun(); const v = openSelected();
      if (!v) return;
      const id = v.c.id;
      const key = draftKey();
      const d = S.drafts[key];
      if (!d || !d.choice) return;
      const order = openOrder(run);
      const i = order.indexOf(id);
      const verdict = d.choice === 'confirm' ? v.r.verdict : flip(v.r.verdict);
      run.decisions[id] = { choice: d.choice, verdict, note: (d.note || '').trim(), t: Date.now() };
      delete S.drafts[key];
      S.undo.push({ runId: run.id, id });
      const next = i >= 0 && i + 1 < order.length ? order[i + 1] : order.filter((x) => x !== id)[0] || null;
      toast('Recorded: ' + v.c.name, (d.choice === 'confirm' ? 'Confirmed as ' : 'Changed to ') + vLabel(verdict).toLowerCase() + ' · ' + (verdict === 'deep tech' ? 'Approve' : 'Reject'), { label: 'Undo', run: run.id, id });
      renderSwitch(); renderChips();
      if (next) select(next);
      else {
        renderList(); renderRunbar(); renderDock(); renderDoc(); S.paneSig = paneSig();
        toast('All flagged companies reviewed', 'Download Excel to export the decisions.');
      }
      const it = R('list').querySelector('[data-fk="item-' + S.selectedId + '"]');
      if (it) it.focus({ preventScroll: true });
    }
    function undoFor(runId, id, quiet) {
      const run = runById(runId);
      if (!run || !run.decisions[id]) return false;
      const dec = run.decisions[id];
      delete run.decisions[id];
      S.drafts[runId + ':' + id] = { choice: dec.choice, note: dec.note };
      S.undo = S.undo.filter((u) => !(u.runId === runId && u.id === id));
      if (S.activeId !== runId) { S.activeId = runId; S.f = { verdict: '', validated: false, patents: false, q: '' }; root.querySelector('[data-fk="search"]').value = ''; }
      S.selectedId = id;
      renderAll();
      select(id);
      if (!quiet) toast('Decision undone', C_BY_ID[id].name + ' is back in Needs review with your choice and note kept.');
      return true;
    }
    function undoLast() {
      const run = activeRun();
      if (run.kind !== 'rows') return;
      for (let i = S.undo.length - 1; i >= 0; i--) {
        const u = S.undo[i];
        if (u.runId === run.id && run.decisions[u.id]) { undoFor(u.runId, u.id); return; }
      }
      const v = S.selectedId ? rowView(run, S.selectedId) : null;
      if (v && v.dec) { undoFor(run.id, v.c.id); return; }
      toast('Nothing to undo', 'No reviewer decisions recorded in this run yet.');
    }
    function togglePin() {
      const run = activeRun(); const id = S.selectedId;
      if (run.kind !== 'rows' || !id || !run.results[id]) return;
      const on = S.pin && S.pin.runId === run.id && S.pin.id === id;
      S.pin = on ? null : { runId: run.id, id };
      renderList(); renderDock(); renderDoc(); S.paneSig = paneSig();
    }

    /* ---------- toasts ---------- */
    function toast(title, body, action) {
      const host = R('toasts');
      if (!host) return;
      const el = document.createElement('div');
      el.className = 'sp-toast';
      el.innerHTML = '<div><b>' + esc(title) + '</b>' + (body ? '<span>' + esc(body) + '</span>' : '') + '</div>' +
        (action ? '<button data-act="toast-undo" data-run="' + esc(action.run) + '" data-id="' + esc(action.id) + '">' + esc(action.label) + '</button>' : '');
      host.appendChild(el);
      while (host.children.length > 3) host.removeChild(host.firstChild);
      later(() => { el.classList.add('is-leaving'); later(() => el.remove(), 170); }, action ? 5200 : 3400);
    }
    function download() {
      const run = activeRun();
      const base = run.file.replace(/\.(xlsx|xls|csv)$/i, '');
      const name = base + '_classified_' + run.id.replace(/^run_/, '') + '.xlsx';
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

    /* ---------- New run drawer (ported from Workbench) ---------- */
    function openDrawer(fromRun) {
      if (S.drawer) return;
      if (S.menuOpen) closeMenu(false);
      const draft = fromRun && fromRun.cfg ? JSON.parse(JSON.stringify(fromRun.cfg)) : defaultCfg();
      draft.file = fromRun && fromRun.kind === 'rows' ? { name: D.file.name, rows: D.file.rows, note: '' } : null;
      S.drawer = { draft, returnFocus: document.activeElement, over: false };
      const ov = R('overlay');
      ov.innerHTML = '<div class="sp-scrim" data-act="close-drawer"></div>' +
        '<section class="sp-drawer" role="dialog" aria-modal="true" aria-labelledby="sp-dr-t">' +
        '<div class="sp-dr-head"><div class="sp-dr-title"><h2 id="sp-dr-t">' + (fromRun ? 'New run with the same settings' : 'New run') + '</h2><button class="sp-btn sp-btn-ghost sp-btn-sm" data-act="close-drawer" aria-label="Close" data-fk="dr-close">Close <kbd>Esc</kbd></button></div><div data-r="dr-est"></div></div>' +
        '<div class="sp-dr-body" data-r="dr-body"></div></section>';
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
      ov.querySelectorAll('.sp-scrim, .sp-drawer').forEach((n) => n.classList.add('is-leaving'));
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
      const ref = estimate(Object.assign({}, d, { file: { rows: D.file.rows } }));
      const shown = e.rows ? e.cost : ref.cost;
      const secs = e.rows ? e.secs : ref.secs;
      const html = '<div class="sp-est">' +
        '<div><div class="sp-est-l">Est. cost' + per + '</div><div class="sp-est-v">' + (e.known ? money(shown) : 'unknown') + '</div></div>' +
        '<div><div class="sp-est-l">Duration</div><div class="sp-est-v">' + fmtDur(secs) + '</div></div>' +
        '<div class="sp-est-split">' + (e.known ? '<div class="sp-est-bar" aria-hidden="true">' + seg(e.parts.classify, 'var(--accent)') + seg(e.parts.enrich, 'var(--deep)') + seg(e.parts.validate, 'var(--contested)') + '</div>' +
          '<div class="sp-est-lg"><span><i class="sp-sw" style="background:var(--accent)"></i>Classify ' + Math.round(e.parts.classify / tot * 100) + '%</span><span><i class="sp-sw" style="background:var(--deep)"></i>Enrich ' + Math.round(e.parts.enrich / tot * 100) + '%</span><span><i class="sp-sw" style="background:var(--contested)"></i>Validate ' + Math.round(e.parts.validate / tot * 100) + '%</span></div>' : '<div class="sp-est-lg">Pinned model is not priced in pipeline/models.py; token totals will be reported instead.</div>') + '</div>' +
        '<button class="sp-btn sp-btn-primary" data-act="start" data-fk="start" ' + (prob ? 'disabled' : '') + '>Start run</button>' +
        (prob ? '<div class="sp-est-why">' + esc(prob) + '</div>' : '') +
        '<div class="sp-est-note">' + esc(modelFor(d)) + ' · ' + (e.batch ? 'batch mode halves classifier cost; a real batch job can take up to an hour' : 'one company at a time') + ' · web searches are usually the largest part of the bill</div>' +
        '</div>';
      put(R('dr-est'), html);
    }
    function renderDrawerBody() {
      const d = S.drawer.draft;
      const f = D.file;
      let h = '<fieldset class="sp-fs"><legend>Input file</legend>';
      if (!d.file) {
        h += '<div class="sp-drop ' + (S.drawer.over ? 'is-over' : '') + '" data-dropzone><b>Drop an .xlsx, .xls or .csv file here</b>One row per company. Column headers are matched case-insensitively.<br><button class="sp-btn" data-act="use-sample" data-fk="use-sample">Use sample file · ' + esc(f.name) + '</button></div>';
      } else {
        h += '<div class="sp-file"><div><div class="sp-file-n">' + esc(d.file.name) + '</div><div class="sp-file-m sp-num">' + f.rows + ' rows · ' + f.skipped + ' skipped (empty name) · ' + f.headers.length + ' columns</div></div><button class="sp-btn sp-btn-sm" data-act="clear-file" data-fk="clear-file">Change file</button></div>';
        if (d.file.note) h += '<div class="sp-hint">' + esc(d.file.note) + '</div>';
        const used = {};
        FIELDS.forEach((fl) => { const col = d.mapping[fl.key]; if (col) used[col] = (used[col] || 0) + 1; });
        h += '<div class="sp-map">' + FIELDS.map((fl) => {
          const cur = d.mapping[fl.key] || '';
          const auto = cur && cur === f.mapping[fl.key];
          const opts = (fl.required ? '<option value="">Choose a column</option>' : '<option value="">Not mapped</option>') + f.headers.map((hd) => '<option value="' + esc(hd) + '"' + (hd === cur ? ' selected' : '') + '>' + esc(hd) + '</option>').join('');
          const tag = !cur ? (fl.required ? '<span class="sp-tag is-req">Required</span>' : '<span class="sp-tag">Skipped</span>') : auto ? '<span class="sp-tag is-auto">Detected</span>' : used[cur] > 1 ? '<span class="sp-tag is-req">Used twice</span>' : '<span class="sp-tag">Changed</span>';
          return '<label for="sp-map-' + fl.key + '">' + fl.label + '</label><select id="sp-map-' + fl.key + '" data-map="' + fl.key + '" data-fk="map-' + fl.key + '">' + opts + '</select>' + tag;
        }).join('') + '</div>';
        if (!d.mapping.description) h += '<div class="sp-warn">' + (d.enrichment ? 'No description column: classification will rely on web enrichment.' : 'No description and enrichment is off: companies without patents are capped at ' + d.lowEvidenceCap + ' confidence.') + '</div>';
        const extra = f.headers.filter((hd) => !Object.values(d.mapping).includes(hd));
        h += '<table class="sp-prev"><thead><tr>' + FIELDS.map((fl) => '<th>' + fl.label + '</th>').join('') + '</tr></thead><tbody>' + f.preview.map((row) => '<tr>' + FIELDS.map((fl) => {
          const col = d.mapping[fl.key];
          return col ? '<td title="' + esc(row[col] || '') + '">' + esc(row[col] != null ? row[col] : '') + '</td>' : '<td class="is-none">not mapped</td>';
        }).join('') + '</tr>').join('') + '</tbody></table>';
        h += '<div class="sp-hint">First ' + f.preview.length + ' of ' + f.rows + ' rows. Carried through to the output unchanged: ' + esc(extra.join(', ') || 'none') + '.</div>';
      }
      h += '</fieldset>';
      const prov = provById(d.provider);
      h += '<fieldset class="sp-fs"><legend>Model</legend><div class="sp-provs" role="radiogroup" aria-label="Provider">' + D.providers.map((p) =>
        '<label class="sp-opt"><input type="radio" name="sp-prov" value="' + p.id + '" data-fk="prov-' + p.id + '"' + (p.id === d.provider ? ' checked' : '') + '><span class="sp-opt-t">' + esc(p.label) + '</span><span class="sp-opt-s ' + (p.keySet ? 'is-ok' : 'is-miss') + '">' + (p.keySet ? 'Key set' : p.keyVar + ' missing') + '</span></label>').join('') + '</div>';
      if (!prov.keySet) h += '<div class="sp-warn">Add ' + prov.keyVar + ' to .env and reopen this panel to use ' + prov.label + '.</div>';
      h += '<div class="sp-tiers" role="radiogroup" aria-label="Tier">' + ['fast', 'balanced', 'best'].map((t) =>
        '<label class="sp-opt"><input type="radio" name="sp-tier" value="' + t + '" data-fk="tier-' + t + '"' + (t === d.tier ? ' checked' : '') + '><span class="sp-opt-t">' + t[0].toUpperCase() + t.slice(1) + ' · ' + esc(prov.tiers[t]) + '</span><span class="sp-opt-s sp-num">~' + money(D.estCostPerCompany[t], 2) + ' per company</span></label>').join('') + '</div>';
      h += '<div class="sp-row2"><label for="sp-pin">Pin exact model</label><input id="sp-pin" class="sp-input sp-mono" data-field="model" data-fk="pinmodel" placeholder="' + esc(MODEL_IDS[d.provider][d.tier]) + ' (from tier)" value="' + esc(d.model) + '" autocomplete="off" spellcheck="false"></div>';
      h += '<div class="sp-hint">Leave empty to use the tier. Pin a model for audits or runs you will compare over time.' + (d.model && !KNOWN_MODELS.has(d.model.trim()) ? ' This model is not listed in pipeline/models.py: it runs with the original request settings and its cost shows as unknown.' : '') + '</div>';
      h += '<div class="sp-hint">EPO patent keys: ' + (D.epoKeysSet ? 'set' : 'missing') + '.</div></fieldset>';
      const tg = (key, title, sub, disabled) => '<label class="sp-tg ' + (disabled ? 'is-disabled' : '') + '"><span class="sp-tg-t">' + title + '</span><span class="sp-tg-s">' + sub + '</span><input type="checkbox" class="sp-toggle" data-toggle="' + key + '" data-fk="tg-' + key + '"' + (d[key] && !disabled ? ' checked' : '') + (disabled ? ' disabled' : '') + '></label>';
      h += '<fieldset class="sp-fs"><legend>Steps</legend>' +
        tg('enrichment', 'Web enrichment', 'Search the web for a current description before classifying') +
        tg('epo', 'Patent lookup', 'EPO patent data adjusts confidence by up to ±' + d.epoAdjustMax + (D.epoKeysSet ? ' · EPO keys set' : ' · EPO keys missing; the run continues without patents')) +
        tg('validator', 'Validation', 'A second pass searches the web when confidence is below ' + d.validatorThreshold + ', then confirms, overrides or escalates') +
        tg('batch', 'Batch mode', prov.batch ? 'Classify all companies in one batch job: about half the classifier cost, but results can take an hour or more' : 'Only Anthropic supports batch jobs; ' + prov.label + ' processes companies one at a time', !prov.batch) +
        '</fieldset>';
      h += '<fieldset class="sp-fs"><legend>Thresholds</legend><div class="sp-th-grid">' + THRESHOLDS.map((t) => {
        const off = t.needs && !d[t.needs];
        return '<label class="sp-thf ' + (off ? 'is-off' : '') + '"><span>' + t.label + '</span><input type="number" class="sp-input" min="' + t.min + '" max="' + t.max + '" data-num="' + t.key + '" data-fk="num-' + t.key + '" value="' + d[t.key] + '"' + (off ? ' disabled' : '') + '><small>' + t.help + (off ? ' (step is off)' : '') + '</small></label>';
      }).join('') + '</div><div class="sp-fs-foot"><button class="sp-btn sp-btn-ghost sp-btn-sm" data-act="reset-th" data-fk="reset-th">Reset thresholds to defaults</button></div></fieldset>';
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
      S.f = { verdict: '', validated: false, patents: false, q: '' };
      root.querySelector('[data-fk="search"]').value = '';
      S.selectedId = null;
      startEngine(run);
      renderAll();
      R('list').scrollTop = 0;
      const stop = R('runbar').querySelector('[data-fk="rb-stop"]');
      if (stop) stop.focus();
    }

    /* ---------- events ---------- */
    function onClick(e) {
      if (S.menuOpen && !e.target.closest('.sp-swwrap')) closeMenu(false);
      const a = e.target.closest('[data-act]');
      if (!a || !root.contains(a)) return;
      const act = a.getAttribute('data-act');
      const run = activeRun();
      switch (act) {
        case 'menu': if (S.menuOpen) closeMenu(true); else openMenu(); break;
        case 'open-run': openRun(a.getAttribute('data-id')); break;
        case 'select': select(a.getAttribute('data-id'), { focus: true }); break;
        case 'toggle-grp': {
          const g = a.getAttribute('data-g');
          S.collapsed[g] = !S.collapsed[g];
          renderList(); break;
        }
        case 'chip': {
          const v = a.getAttribute('data-v');
          if (v === 'validated') S.f.validated = !S.f.validated;
          else if (v === 'patents') S.f.patents = !S.f.patents;
          else S.f.verdict = S.f.verdict === v ? '' : v;
          renderChips(); renderList(); updateDecPos(); break;
        }
        case 'clear-filters':
          S.f = { verdict: '', validated: false, patents: false, q: '' };
          root.querySelector('[data-fk="search"]').value = '';
          renderChips(); renderList(); updateDecPos(); break;
        case 'overview': if (S.selectedId == null) { const f = openOrder(run)[0] || navIds(run)[0]; if (f) select(f); } else showOverview(); break;
        case 'new-run': openDrawer(null); break;
        case 'rerun': openDrawer(run); break;
        case 'close-drawer': closeDrawer(); break;
        case 'stop': if (run.status === 'running') stopRun(run); break;
        case 'resume':
          if (run.status === 'stopped' || run.status === 'interrupted') {
            startEngine(run);
            toast('Resuming ' + run.file, 'Continuing with ' + run.model + ', the model this run started with.');
            renderAll();
            const s = root.querySelector('[data-fk="rb-stop"]'); if (s) s.focus();
          }
          break;
        case 'download': download(); break;
        case 'choose': choose(a.getAttribute('data-v')); break;
        case 'record': recordDecision(); break;
        case 'undo-dec': if (S.selectedId) undoFor(run.id, S.selectedId, false); { const c = R('dock').querySelector('[data-fk="dec-confirm"]'); if (c) c.focus(); } break;
        case 'toast-undo': {
          const ok = undoFor(a.getAttribute('data-run'), a.getAttribute('data-id'), false);
          const t = a.closest('.sp-toast'); if (t) t.remove();
          if (!ok) toast('Already undone', '');
          break;
        }
        case 'next-open': nextOpen(); break;
        case 'pin': togglePin(); break;
        case 'unpin': S.pin = null; renderList(); renderDock(); S.paneSig = paneSig(); break;
        case 'goto': {
          const sc = R('doc');
          const sec = sc.querySelector('[data-sec="' + a.getAttribute('data-sec') + '"]');
          if (sec) sc.scrollTop += sec.getBoundingClientRect().top - sc.getBoundingClientRect().top - 16;
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

    function onInput(e) {
      const t = e.target;
      const fk = t.getAttribute('data-fk');
      if (fk === 'search') { S.f.q = t.value; renderChips(); renderList(); updateDecPos(); return; }
      if (fk === 'note') {
        const k = draftKey();
        S.drafts[k] = Object.assign({}, S.drafts[k], { note: t.value });
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
      if (!S.drawer) return;
      const t = e.target;
      const d = S.drawer.draft;
      if (t.name === 'sp-prov') d.provider = t.value;
      else if (t.name === 'sp-tier') d.tier = t.value;
      else if (t.hasAttribute('data-map')) d.mapping[t.getAttribute('data-map')] = t.value;
      else if (t.hasAttribute('data-toggle')) d[t.getAttribute('data-toggle')] = t.checked;
      else if (t.hasAttribute('data-num')) {
        const k = t.getAttribute('data-num'); const meta = THRESHOLDS.find((x) => x.key === k);
        d[k] = t.value === '' || isNaN(+t.value) ? D.defaults[k] : clamp(Math.round(+t.value), meta.min, meta.max);
      } else if (t.getAttribute('data-field') === 'model') d.model = t.value;
      else return;
      renderDrawer();
    }

    function focusSelectedItem() {
      const it = S.selectedId && R('list').querySelector('[data-fk="item-' + S.selectedId + '"]');
      if (it) it.focus({ preventScroll: true }); else { const f = R('list').querySelector('.sp-item'); if (f) f.focus(); }
    }

    function onRootKey(e) {
      const t = e.target;
      if (S.drawer && R('overlay').contains(t)) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDrawer(); return; }
        if (e.key === 'Tab') {
          const dr = R('overlay').querySelector('.sp-drawer');
          const f = [...dr.querySelectorAll('button, input, select, textarea')].filter((n) => !n.disabled && n.offsetParent !== null);
          if (!f.length) return;
          const first = f[0]; const last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
        return;
      }
      const fk = t.getAttribute && t.getAttribute('data-fk');
      if (fk === 'search') {
        if (e.key === 'Escape') { e.preventDefault(); if (t.value) { t.value = ''; S.f.q = ''; renderChips(); renderList(); } else t.blur(); return; }
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
          e.preventDefault();
          const ids = navIds(activeRun());
          if (ids.length && ids.indexOf(S.selectedId) < 0) select(ids[0]);
          focusSelectedItem();
        }
        return;
      }
      if (fk === 'note') {
        if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          const d = S.drafts[draftKey()];
          if (d && d.choice) recordDecision();
          else toast('Choose first', 'Press C to confirm or X to change the verdict, then Enter to record.');
        } else if (e.key === 'Escape') { e.preventDefault(); focusSelectedItem(); }
      }
    }

    function onDocKey(e) {
      const t = e.target;
      if (isField(t)) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (!root.isConnected) return;
      if (S.drawer) { if (e.key === 'Escape') { e.preventDefault(); closeDrawer(); } return; }
      if (S.menuOpen) {
        if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const items = [...R('switch').querySelectorAll('.sp-mi')];
          const i = items.indexOf(document.activeElement);
          const n = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
          if (n) n.focus();
          return;
        }
        if (e.key === 'Tab') closeMenu(false);
        return;
      }
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      switch (k) {
        case 'j': case 'ArrowDown': e.preventDefault(); move(1); break;
        case 'k': case 'ArrowUp': e.preventDefault(); move(-1); break;
        case 'c': if (openSelected()) { e.preventDefault(); choose('confirm'); } break;
        case 'x': if (openSelected()) { e.preventDefault(); choose('change'); } break;
        case 'n': if (openSelected()) { e.preventDefault(); focusNote(); } break;
        case 'u': e.preventDefault(); undoLast(); break;
        case 'p': e.preventDefault(); togglePin(); break;
        case 'o': e.preventDefault(); if (S.selectedId == null) { const f = openOrder(activeRun())[0]; if (f) select(f); } else showOverview(); break;
        case '/': { const s = root.querySelector('[data-fk="search"]'); if (s && !R('filter').hidden) { e.preventDefault(); s.focus(); s.select(); } break; }
        case 'Escape': if (S.selectedId != null && activeRun().kind === 'rows') { e.preventDefault(); showOverview(); } break;
        default: break;
      }
    }

    function onDragOver(e) {
      if (!S.drawer) return;
      e.preventDefault();
      const z = e.target.closest && e.target.closest('[data-dropzone]');
      if (e.dataTransfer) e.dataTransfer.dropEffect = z ? 'copy' : 'none';
      if (z && !S.drawer.over) { S.drawer.over = true; z.classList.add('is-over'); }
    }
    function onDragLeave(e) {
      const z = e.target.closest && e.target.closest('[data-dropzone]');
      if (z && S.drawer && !z.contains(e.relatedTarget)) { S.drawer.over = false; z.classList.remove('is-over'); }
    }
    function onDrop(e) {
      if (!S.drawer) return;
      e.preventDefault();
      const z = e.target.closest && e.target.closest('[data-dropzone]');
      if (!z) return;
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
    document.addEventListener('keydown', onDocKey);

    /* ---------- first paint: completed sample run, first company needing review ---------- */
    S.selectedId = openOrder(initialRun)[0] || null;
    renderAll();

    return function cleanup() {
      Object.keys(engines).forEach((id) => { cancel(engines[id].timer); delete engines[id]; });
      timeouts.forEach((t) => clearTimeout(t)); timeouts.clear();
      rafs.forEach((r) => cancelAnimationFrame(r)); rafs.clear();
      document.removeEventListener('keydown', onDocKey);
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
  window.PROTO_VARIANTS.split = { css, render, init };
})();
