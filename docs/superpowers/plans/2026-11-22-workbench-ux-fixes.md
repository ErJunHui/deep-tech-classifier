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
| 3 | The estimate ignores Batch mode: cost and duration stay the same when it is toggled | Analyst settings, `/api/estimate` | Later |
| 4 | Esc discards a set-up run (uploaded file and mappings) with no confirmation and no undo | `events.js` `setupEscape` | **Batch 1**, Task 2 |
| 5 | Setup rows say "Queued" before the run has started | `render/setup.js` | Later |
| 6 | The Reclassify form shows "A note is required…" in red before anything is typed | `render/detail.js` form hint | Later |
| 7 | The quick Settings popover enables Patent lookup with no warning when the EPO keys are missing | Settings popover | Later |
| 8 | Messages say "Ask your admin to add …", but this is a one-person local app | `startProblem` / setup bar | Later |
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

## Next batches (proposed order)

1. Copy and states: #5, #6, #8 and #7.
2. Estimate correctness: #3. This needs a look at `webapp/estimate.py`.
3. Layout: #10, #12, #11, #14, #15 and #13.
4. Small screens: #9.
