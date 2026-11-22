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
| 9 | Unusable below about 900px: the three columns never collapse | `styles.css` grid | **Batch 5**, Task 14 |
| 10 | At 1024px the filter chips clip, the Criteria and Pat. columns disappear, and the Ctrl K hint clips | `styles.css` | **Batch 4**, Task 8 |
| 11 | "Also in your file …" prints every unused column name in one long paragraph | `render/setup.js` | **Batch 4**, Task 10 |
| 12 | The table moves down about 30px when a search or filter turns on the "Showing N of M" line | Tools row | **Batch 4**, Task 9 |
| 13 | Every command menu row carries an "ACTION" label | `render/modal.js` | **Batch 4**, Task 13 |
| 14 | The Reasoning text in the evidence panel is larger than every other section | `styles.css` detail | **Batch 4**, Task 11 |
| 15 | The empty New run screen shows placeholder rows that read as "loading", and one overlaps the upload icon | `render/setup.js` | **Batch 4**, Task 12 |

Design suggestions from the same review:
- ~~Open and close the command menu and shortcuts sheet instantly, because they are opened from the keyboard.~~ Done in Batch 6, Task 15.
- ~~Under `prefers-reduced-motion`, keep opacity transitions and remove only movement.~~ Done in Batch 6, Task 16.
- Use transitions rather than one-shot keyframes for the Analyst sheet, so it can be interrupted. Batch 7, Task 18.
- Make "Same settings…" offer the same file first. Batch 7, Task 19.

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

Not changed here: the estimate note said "one company at a time" when not batching, but per-company steps run on several workers. Fixed in Batch 6, Task 17.

## Task 8 (#10): Nothing clips at 1024px

**Files:** `web/styles.css`, `web/js/render/table.js`, `web/js/render/rail.js`

- [x] Below 1100px the evidence panel is 330px (was 340), so the table is 534px wide at 1024. Criteria and Patents now show from a 520px table (were 560 and 620), with compact widths (Status 156, Conf. 56, Crit. 52, Pat. 52) and a short "Crit." header.
- [x] When the main column is under 640px, the filter chips fold behind the Filters button, as they already did under 520px. Open, they take a row of their own and each group wraps.
- [x] Below 1300px the rail's "Command menu" button reads "Commands", so the Ctrl K hint fits.
- [x] Browser check at 1024: Crit. and Pat. show, no chip clips, and the rail button fits.

## Task 9 (#12): The table stays put when a filter turns on

**Files:** `web/index.html`, `web/js/render/chips.js`, `web/styles.css`

- [x] The count line ("4 rows" or "Showing 1 of 4 · Clear filters") moved out of the chips into its own full-width row (`data-r="tools-r"`, 26px minimum), so a wider line never re-wraps the chips. The confidence-bin chip moved into that line too. The search box aligns with the first chip row.
- [x] Browser check: the table top does not move at 1440 (chip, bin) or at 1024 (open filters, chip, clear, search).

## Task 10 (#11): The extra-columns note stays short

- [x] `model.extraColumnsShort(extra, max)` names the first 3 columns and counts the rest (never "and 1 more"). The note reads "27 more columns in your file, kept unchanged in your output: A, B, C and 24 more." The full list is in the tooltip.

## Task 11 (#14): Reasoning at body size

- [x] Reasoning uses `.wb-body` (14px) like every other section. `.wb-lead` is gone.

## Task 12 (#15): No placeholder rows before a file is loaded

- [x] The empty New run screen shows only the column headers and the drop target. `.wb-ghost-bar` is gone.

## Task 13 (#13): Command menu groups get headings

- [x] `model.paletteHeading(items, i)` gives "Actions", "Runs" or "Companies" where a group starts. Rows no longer carry the group label, and search still matches the group name.

## Task 14 (#9): Small screens

**Files:** `web/js/model.js`, `web/js/store.js`, `web/js/state.js`, `web/js/commands.js`, `web/js/events.js`, `web/js/main.js`, `web/js/render/layout.js` (new), `web/js/render/util.js`, `web/js/render/head.js`, `web/js/render/setup.js`, `web/index.html`, `web/styles.css`, `web/tests/model.test.js`

Rule: below 900px (`@media (width < 900px)`, `model.NARROW_QUERY`) the workbench is one column. A range is used rather than `max-width: 899px`, because a zoomed window can be 899.5px wide and would match neither layout.
- **Run rail:** a drawer opened by a **Runs** button at the start of the head (also shown with no run open, and while setting up). It closes on Esc, on the scrim and on picking a run, + New run or the draft. While it is open the main column and panel are inert, and only Esc, ?, O and Ctrl K act. Focus goes to the current run on open and back to Runs on close.
- **Evidence panel:** opens over the table when a row is picked (click, Enter, or a company from the command menu), with a bar holding **Back** and Prev and Next. J, K and N update it in place, and moving in the list with the panel closed leaves it closed (`model.panelAfterSelect`). Esc closes the drawer, then the form, then the panel, and focus returns to the row (`model.escapeTarget`). In the note, Esc goes to Back. The selection rules of Task 1 are unchanged. / and F close the panel first, because the search and chips are under it.
- **Reading view and divider:** both are hidden. E shows or hides the panel instead (`model.readingKeyAction`), and the stored reading view is left as it was for wide windows.
- **Motion:** pointer-triggered opens and closes slide (180ms ease-out transform, `is-motion`). Keyboard-triggered ones (`click` with `detail` 0, Esc, E) switch at once. A render during a slide leaves it running, and `prefers-reduced-motion` turns it off.
- **Overlays:** the settings popover fits the action bar's width, the column menu fits the window, Analyst settings is full width, the shortcuts sheet has one column, and toasts stay inside the window.
- 900px and up are unchanged: 160/534/330 at 1024 and 200/760/480 at 1440.

- [x] **Step 1:** Add tests for `NARROW_QUERY`, `isNarrow`, `escapeTarget`, `panelAfterSelect` and `readingKeyAction`.
- [x] **Step 2:** Run the tests and confirm they fail.
- [x] **Step 3:** Implement the rules in `model.js`. Add `render/layout.js` (`syncLayout`: classes, `inert` and the Runs button's `aria-expanded`), the drawer and panel commands and `watchLayout` (matchMedia) in `commands.js`, and the wiring in `events.js`. Add the Runs button to both heads, the panel bar and scrim to `index.html`, and the narrow block to `styles.css`.
- [x] **Step 4:** Run the tests (152 pass). Browser check at 390x844, 768x1024 and 899x800: the drawer opens, closes on Esc, on the scrim and on a pick; a row opens the panel; J and K update it; Esc and Back return to the row; setup with `companies.xlsx`, the settings popover, the column menu, Analyst settings, the command menu and the shortcuts sheet fit, with no horizontal scroll. At 1024x768 and 1440x860 the columns and reading view are as before, also after resizing from 390 with the panel open. No console errors. Screenshots are in `.playwright-mcp/s9-*.png`.

## Task 15: The command menu and shortcuts sheet open at once

**Files:** `web/styles.css`

Both are opened from the keyboard (Ctrl K, ?), so under the Global Constraint they don't animate. They already closed at once.

- [x] `.wb-mscrim` and `.wb-modal` lose their animations, and the unused `workbench-pop` keyframes are gone.
- [x] Browser check: after Ctrl K or ?, the modal layer has no running animations, and the shortcuts sheet is still centred.

## Task 16: Reduced motion keeps fades

**Files:** `web/styles.css`

Rule: under `prefers-reduced-motion: reduce`, fades stay and movement goes. Before, every animation was cut to 1ms and every transition removed.
- Transitions keep only `opacity`. Hover colours were already instant, so only movement is lost.
- The keyframes that move or scale (`workbench-slide`, `-slide-out`, `-pop-in`, `-rise`, `-toast`) are redefined as plain fades inside the media query. They keep their names and durations, so the leave timers in `analyst.js` and `toast.js` still match.
- Buttons don't shrink when pressed, the drop target doesn't scale, and the looping pulses stay off.
- Below 900px the drawer and the evidence panel fade in place instead of sliding (pointer-triggered only, as before).

- [x] Browser check with reduced motion emulated: the setup bar, settings popover, Analyst sheet and its scrim each run one opacity-only animation at full length. Buttons and switches transition only opacity. At 390 the Runs drawer fades (opacity and visibility, no transform). With no preference, the drawer slides as before.

## Task 17: The direct-run note gives the real worker count

**Files:** `webapp/settings_map.py`, `webapp/app.py`, `web/js/model.js`, `web/js/render/setup.js`, `web/js/render/analyst.js`, `tests/test_webapp/test_estimate.py`, `tests/test_webapp/test_api.py`, `web/tests/model.test.js`

A run that doesn't batch processes `concurrency.workers` companies at once (8 by default, 1 to 32), not one.

- [x] `setup_info` takes `workers`, and `/api/setup` reports `workers_from(base config)` as `workers`.
- [x] `model.directRunText(workers)`: "up to 8 companies at a time", or "one company at a time" when workers is 1 (8 when unknown). The setup bar says "Classified directly, up to 8 companies at a time; results appear as each one finishes." The Analyst estimate note uses the same text.
- [x] `noBatchText` says "<provider> classifies each company directly" instead of "works one company at a time".
- [x] Tests: Python (`setup_info` reports workers; `/api/setup` reports a project's `concurrency.workers`) and Node (`directRunText`, `noBatchText`). 173 Python and 153 Node tests pass.
- [x] Browser check, on a fresh server: `/api/setup` reports `workers: 8`, and the Analyst note reads "claude-haiku-5-5 · up to 8 companies at a time · web searches are usually the largest part of the bill".

- [x] Follow-up: the time estimate uses the same count. `estimate()` and `estimate_request()` take `workers`, `/api/estimate` passes `workers_from(base config)`, and the README no longer says the estimate assumes 8. Tests: fewer workers take proportionally longer (EPO excluded), more workers never beat the EPO floor, and `/api/estimate` uses a project's `concurrency.workers`.

## Task 18: The Analyst sheet can be interrupted

**Files:** `web/js/render/analyst.js`, `web/styles.css`

The sheet and its scrim open with the one-shot keyframes `workbench-slide` and `workbench-fade`. Closing swaps in `workbench-slide-out` and `workbench-out`, and a 170ms timer then empties the overlay. Two problems follow. Closing during the open jumps the sheet to full opacity before it fades out. Reopening during the close rebuilds the overlay, so the sheet jumps back to its start position.

Rule: the sheet and scrim use transitions toward an `is-open` class. Opening adds the class one frame after the elements are inserted. Closing removes it. Reopening while a close is still running reuses the leaving elements: it cancels the timer and adds `is-open` again, so the sheet turns around from where it is. Durations stay the same: 240ms to open and 160ms to close for the sheet, 200ms and 160ms for the scrim. Under reduced motion the global rule keeps only `opacity`, so the sheet fades without moving.

- [ ] **Step 1:** In `styles.css`, give `.wb-sheet` and `.wb-scrim` their closed state (opacity 0, the sheet at `translateX(16px)`) and their `transition`, with the open state under `.is-open`. Remove `.is-leaving`, along with `workbench-slide`, `workbench-slide-out` and their reduced-motion copies once nothing uses them.
- [ ] **Step 2:** In `analyst.js`, `openAnalyst` reuses a leaving sheet or inserts a new one and adds `is-open` after a forced reflow. `closeAnalyst` removes `is-open` and empties the overlay after the close transition.
- [ ] **Step 3:** Run the tests. In the browser: opening slides in. Clicking Done halfway through the open slides back from the current position with no jump. Reopening during the close turns the sheet around without rebuilding it, and focus and the body content are still right. With reduced motion emulated, only opacity changes.

## Task 19: "Same settings…" offers the same file first

**Files:** `webapp/app.py`, `web/js/api.js`, `web/js/model.js`, `web/js/setup.js`, `web/js/events.js`, `web/js/render/setup.js`, `tests/test_webapp/test_api.py`, `web/tests/model.test.js`

A "Same settings…" draft starts with no file, although the user usually wants to run the same companies again. Every run keeps a copy of its input in `runs/<id>/input/<file>`, which holds only the rows that were ticked.

Rule: while a "Same settings…" draft has no file, the drop target's primary button is **Use <file> again**, and **Choose file…** becomes a secondary button next to it. Setup focuses the primary button. Clicking it copies the run's input into a new upload, and from then on it behaves exactly like an upload, with the mapping kept by `mappingForFile`. If the input is gone, the error appears under the buttons and Choose file still works. After **Change file** the offer comes back.

- [ ] **Step 1:** Tests. Python: `POST /api/runs/{id}/file` returns an upload (`fileId`, `name`, `rows`) of the run's input, with the run's rows only. It answers 404 for an unknown run and for a run whose input is missing, and the new `fileId` can start a run. Node: `reuseOffer(draft)` returns `{ name, runId }` for a "Same settings…" draft with no file that is not reading, and `null` otherwise.
- [ ] **Step 2:** Run them and confirm they fail.
- [ ] **Step 3:** Add the route (it reads the bytes and calls `files.save_upload`), `api.reuseRunFile`, `fromFile` on `newDraft`, `reuseOffer`, `reuseFile()` in `setup.js` (sharing `loadFile`'s upload handling), the `reuse-file` action, and the buttons and focus in `render/setup.js`.
- [ ] **Step 4:** Run the tests. In the browser, on the saved run: Same settings… shows "Use companies.xlsx again" focused. Clicking it loads the rows with the run's mapping. Change file brings the offer back. Choose file still works.

## Next batches (proposed order)

1. ~~Copy and states: #5, #6, #8 and #7.~~ Done in Batch 2.
2. ~~Estimate correctness: #3.~~ Done in Batch 3.
3. ~~Layout: #10, #12, #11, #14, #15 and #13.~~ Done in Batch 4.
4. ~~Small screens: #9.~~ Done in Batch 5.
5. ~~Motion and copy: keyboard modals, reduced motion, worker count.~~ Done in Batch 6.
6. Batch 7: the Analyst sheet can be interrupted (Task 18), and Same settings offers the same file (Task 19).
