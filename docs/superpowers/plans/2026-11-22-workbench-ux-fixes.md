# Workbench UX Fixes Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the problems found in a click-through of the web workbench on 2026-11-22. The first batch covers the two issues that confuse a reviewer or lose their work (#2, #4). #1 turned out not to be a bug.

**Source:** A Playwright walk-through of every page and control at 1440, 1024 and 390px wide, using the saved run `run_20261116_213044`. No API keys were set, so a live run was not exercised. Screenshots are in `.playwright-mcp/ux-*.png`. The browser console showed no errors.

**Tech Stack:** Plain ES modules and CSS in `web/`, with no build step. Pure rules live in `web/js/model.js` and are tested with `node --test "web/tests/**/*.test.js"`.

## Global Constraints

- Keep the split the code already has: pure rules in `model.js` with unit tests, and DOM wiring in `events.js`, `commands.js`, `setup.js` and `render/*`.
- No new dependencies.
- `node --test "web/tests/**/*.test.js"` passes at the end of every task.
- Keyboard-triggered UI does not gain animation.

## Findings

Status: **Batch 1** means this plan fixes it now, **Later** means it is not yet scheduled, and **Not a bug** means checking showed the finding was wrong.

| # | Finding | Where | Status |
|---|---|---|---|
| 1 | The modal backdrop seemed to leave the evidence panel undimmed | `.wb-mscrim` | **Not a bug.** Pixel sampling shows the panel dims from 255 to 203, the same as the table. The white panel only looked brighter at a glance. |
| 2 | A filter can hide the selected company while the evidence panel keeps showing it | `commands.js` `refreshFilters` | **Batch 1**, Task 1 |
| 3 | The estimate ignores Batch mode: cost and duration stay the same when it is toggled | Analyst settings, `/api/estimate` | **Batch 3**, Task 7. The estimate was right; the toggle text was wrong. |
| 4 | Esc discards a set-up run (uploaded file and mappings) with no confirmation and no undo | `events.js` `setupEscape` | **Batch 1**, Task 2 |
| 5 | Setup rows say "Queued" before the run has started | `render/setup.js` | **Batch 2**, Task 3 |
| 6 | The Reclassify form shows "A note is required…" in red before anything is typed | `render/detail.js` form hint | **Batch 2**, Task 4 |
| 7 | The quick Settings popover enables Patent lookup with no warning when the EPO keys are missing | Settings popover | **Batch 2**, Task 5 |
| 8 | Messages say "Ask your admin to add …", but this is a one-person local app. They also say to reload, but the server reads `.env` only at startup | `startProblem`, `render/analyst.js` | **Batch 2**, Task 6 |
| 9 | Unusable below about 900px: the three columns never collapse | `styles.css` grid | Later |
| 10 | At 1024px the filter chips clip, the Criteria and Pat. columns disappear, and the Ctrl K hint clips | `styles.css` | Later |
| 11 | "Also in your file …" prints every unused column name in one long paragraph | `render/setup.js` | Later |
| 12 | The table moves down about 30px when a search or filter turns on the "Showing N of M" line | Tools row | Later |
| 13 | Every command menu row carries an "ACTION" label | `render/modal.js` | Later |
| 14 | The Reasoning text in the evidence panel is larger than every other section | `styles.css` detail | Later |
| 15 | The empty New run screen shows placeholder rows that read as "loading", and one overlaps the upload icon | `render/setup.js` | Later |

Design suggestions from the same review, not yet scheduled:
- Open and close the command menu and shortcuts sheet instantly, because they are opened from the keyboard.
- Under `prefers-reduced-motion`, keep opacity transitions and remove only movement.
- Use transitions rather than one-shot keyframes for the Analyst sheet, so it can be interrupted.
- Make "Same settings…" offer the same file first.

---

## Task 1 (#2): Keep the selection inside the filtered view

**Files:** `web/js/model.js`, `web/js/commands.js`, `web/tests/model.test.js`

Rule: after the user changes filters, search or sort, the selected row stays selected if it is still visible. Otherwise the first visible row is selected. When no row is visible, nothing is selected and the evidence panel shows its empty message. This runs only after a user action (`refreshFilters`), never on a poll, so a live run never moves the selection by itself.

- [x] **Step 1:** Add tests for `keptSelection(selected, ids)` in `model.test.js`: it keeps a visible id, falls back to `ids[0]`, returns `null` for an empty view, and picks `ids[0]` when nothing was selected.
- [x] **Step 2:** Run the tests and confirm they fail.
- [x] **Step 3:** Add `keptSelection` to `model.js`. In `refreshFilters`, when the selection changes, set `S.selected` and render the detail panel with `{ reset: true }`.
- [x] **Step 4:** Run the tests and confirm they pass. In the browser: select LIONSBOT, filter on Escalate, and check that the panel shows PREFER. Search "zzz" and check that the panel shows its empty message. Clear the filters and check that a row is selected again.

## Task 2 (#4): Esc parks a draft instead of discarding it

**Files:** `web/js/model.js`, `web/js/setup.js`, `web/js/events.js`, `web/js/commands.js`, `web/js/render/setup.js`, `web/tests/model.test.js`

Rule: while a new run is being set up, Esc first closes an open popover, as it does today. Otherwise:
- **No file loaded:** Esc discards the empty draft, as it does today, because there is nothing to lose.
- **File loaded:** Esc *parks* the draft, using the existing parked-draft mechanism (`hideSetup`). The open run is shown again, the draft stays in the sidebar under "Setting up", and a toast says "New run kept · Press O or pick it in the sidebar to return".
- **Start in flight:** Esc does nothing, as it does today.

The **Cancel** button still discards. Its `Esc` hint is shown only when Esc would also discard (no file loaded), so the hint never promises something Esc does not do. The shortcuts list reads "Leave the new run setup (or close its menu)".

- [x] **Step 1:** Add tests for `setupEscapeAction(draft)` (`'none'`, `'discard'` or `'park'`) and `cancelHintsEsc(draft)`.
- [x] **Step 2:** Run the tests and confirm they fail.
- [x] **Step 3:** Implement both in `model.js`. Add `parkSetup()` to `setup.js`. Route `setupEscape` in `events.js` through `setupEscapeAction`. Show the Cancel button's Esc hint only when `cancelHintsEsc(dr)` is true. Update the label in `commands.js`.
- [x] **Step 4:** Run the tests and confirm they pass. In the browser: upload `companies.xlsx`, press Esc, and check that the run view shows, the sidebar shows the parked draft and the toast appears. Press O and check that the draft is back with its rows and mappings. Press Cancel and check that the draft is gone. Open a new run with no file, press Esc, and check that the draft is discarded.

## Task 3 (#5): No "Queued" before Start

**Files:** `web/js/model.js`, `web/js/render/setup.js`, `web/tests/model.test.js`

Rule: before Start, a setup row's Status cell is empty. Only a row the user has unticked says "Left out". "Queued" appears only once a run is actually running, as it does today in `render/table.js` and `render/detail.js`.

- [x] Test `setupRowStatus(out)`, implement it, and use it in `render/setup.js`.
- [x] Browser check: ticked rows are blank, and an unticked row says "Left out".

## Task 4 (#6): The note hint turns red only after an attempt

**Files:** `web/js/model.js`, `web/js/render/detail.js`, `web/js/events.js`, `web/styles.css`, `web/tests/model.test.js`

Rule: while the form is incomplete, the hint is a grey instruction: "Add a note to change a Clear verdict…" or "Choose an outcome." It becomes the red message only after Record is tried (`form.tried`, set by `recordFromForm`). Record uses `aria-disabled` instead of `disabled`, so it still looks unavailable but a click counts as an attempt. The faded style is limited to `.wb-form-acts`, so the setup bar's Start button keeps its own style.

- [x] Test `formHint(view, form)` (`ok`, `pending` or `error`), implement it, and wire it into `formHtml`, `syncForm` and `recordFromForm`.
- [x] Browser check: on opening Reclassify on a Clear row the hint is grey. Clicking Record turns it red. Typing a note clears it and enables Record. Cancel leaves `decisions.json` untouched.

## Task 5 (#7): Patent lookup warns about missing EPO keys in quick Settings

**Files:** `web/js/model.js`, `web/js/render/setup.js`, `web/styles.css`, `web/tests/model.test.js`

- [x] Test `quickStepNote(key, setup)`, implement it, and when the keys are missing show "EPO keys missing, so the run continues without patents." in the warning colour.
- [x] Browser check: with no EPO keys, the "Check patent records" row shows the warning.

## Task 6 (#8): Tell the user what to do about a missing key

**Files:** `web/js/model.js`, `web/js/render/analyst.js`, `web/tests/model.test.js`

The server loads `.env` once, in `serve.py`, and `/api/setup` reads `os.environ`. A page reload therefore never picks up a new key, so the old "then reload" advice was wrong.

- [x] Test `missingKeyText(keyVar)`: "Add X to the .env file in the project folder, then restart the app (python serve.py)." Use it in `startProblem` and in the Analyst settings warning.
- [x] Browser check: the setup bar and Analyst settings both show the new wording, and neither mentions an admin.

## Task 7 (#3): Explain why Batch mode changes nothing on a small run

**Files:** `webapp/settings_map.py`, `webapp/estimate.py`, `webapp/app.py`, `web/js/model.js`, `web/js/render/setup.js`, `web/js/render/analyst.js`, `tests/test_webapp/test_estimate.py`, `tests/test_webapp/test_api.py`, `web/tests/model.test.js`

**Cause:** the pipeline uses a batch job only from `batch.min_companies` companies (100 by default; `pipeline/orchestrator.py`, `pipeline/parallel.py`). Below that it classifies directly, whatever the toggle says. The estimate already followed this rule, so for 4 companies it was right not to change. The toggle text was wrong: it promised half the classifier cost and an hour-plus wait that never apply to such a run. A second, smaller mismatch: the estimate used the hard-coded default, while a run reads `batch.min_companies` from `config.json`.

- [x] `settings_map.batch_min_companies(config)` reads `batch.min_companies` as the pipeline does, falling back to the default when it is missing or not a whole number of at least 1. `app.py` passes the value from the run's base config to `estimate_request` and to `setup_info`. The response gains `batchMin` and `/api/setup` gains `batchMinCompanies`.
- [x] `model.batchSmallRunText(rows, batchMin)` gives "Batch jobs start at 100 companies. This run has 4, so it runs directly and this setting changes nothing." It returns null at or above the threshold, or when no company is ticked. Both the quick Settings toggle and the Analyst settings toggle show it.
- [x] Tests: Python (threshold read from config, passed through `estimate_request`, reported by setup and estimate, and the same value in both API answers) and Node (`batchSmallRunText`).
- [x] Browser check, after restarting the server: with `companies.xlsx` (4 rows), both toggles show the explanation, and `/api/setup` reports `batchMinCompanies: 100`.

Not changed: the estimate note says "one company at a time" when not batching, but per-company steps run on `DEFAULT_WORKERS` workers. This is worth rewording in the copy batch.

## Next batches (proposed order)

1. ~~Copy and states: #5, #6, #8 and #7.~~ Done in Batch 2.
2. ~~Estimate correctness: #3.~~ Done in Batch 3.
3. Layout: #10, #12, #11, #14, #15 and #13.
4. Small screens: #9.
