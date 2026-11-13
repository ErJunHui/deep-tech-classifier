# Workbench: user-experience specification

*Status: draft for review, 2026-11-13. Covers the local web frontend for the Deep Tech Classification Pipeline.*

**Sources.** This spec describes the behaviour of the chosen prototype, `prototypes/frontend/variants/workbench.js` (cited below as `wb:NNN`), with its sample data in `prototypes/frontend/data.js` and design tokens in `prototypes/frontend/index.html:9-39`. Where the build plan (`docs/superpowers/plans/2026-11-13-workbench-web-app.md`, cited as "plan") changes the prototype, the plan wins. Pipeline rules come from `PROJECT_OVERVIEW.md` and `README.md`.

**New-run setup.** Workbench's original side drawer was replaced on 2026-11-13 after a prototype round ("One drop", "Guided", "In the table"). "In the table" won and is now part of `workbench.js`; section 4b describes it. Line numbers cited from before that change (`wb:NNN`) may have shifted.

---

## 1. Purpose and design principles

The Workbench lets a team upload a spreadsheet of companies, run the classifier, review the uncertain verdicts, and download an Excel workbook that records both the pipeline's verdict and the reviewer's decision.

| Principle | What it means in the UI |
|---|---|
| **Easy for non-technical reviewers** | A grant evaluator can open a finished run, see how many companies need a decision, and act on each one without knowing what CPC, EPO or Agent 2 mean. Plain verdict words, plain actions ("Approve", "Reject", "Needs Review"). |
| **Defensible decisions** | Every verdict shows *why*: the three criteria, how the confidence number was built, what the classifier read, the patents and the validator's sources. Every reviewer change is logged with time and note, and written to the workbook. Overturning a Clear verdict needs a note (`wb:1205-1209`). |
| **Never hide uncertainty** | Risk flag, confidence and the validator's disagreement stay visible even after a reviewer decides. A reclassified row keeps the pipeline's verdict on screen as "was …" (`wb:1131`) and the panel says the reasoning supports the *original* verdict (`wb:1283-1288`). |
| **Keyboard-fast for analysts** | Every frequent action has a single-key shortcut, shown on the button that does it. A command menu (`Ctrl/⌘+K`) reaches every company, run and action. Confirming a flagged row moves straight to the next one (`wb:1575`). |
| **Calm while running** | Rows land one at a time without reordering under the reader (`wb:883`, `wb:858-862`). Motion is short and functional, and is off under reduced motion (`wb:473-476`). |

---

## 2. Users and jobs to be done

| User | Background | Jobs | Success looks like |
|---|---|---|---|
| **Programme manager / grant evaluator** (primary reviewer) | Non-technical. Knows the companies and the programme rules, not the pipeline. Uses the app a few times a quarter. | "Tell me which of these applicants are deep tech." "Show me the ones I must look at, and why." "Let me overrule a verdict and record my reason." "Give me a spreadsheet I can forward." | Opens a finished run and clears the Needs-review queue in one sitting. Can explain any decision to a committee using what the panel shows. Never has to read a log or a config file. |
| **Analyst** (operator) | Comfortable with spreadsheets and settings; knows the scoring rules. Runs most batches. | Prepare and start a run with the right column mapping and settings. Watch progress, stop and resume. Triage large batches fast. Audit why a verdict came out as it did. Re-run with the same settings on a new file. | Starts a run in under two minutes from a raw file. Knows the cost before starting. Never loses work to a stop, crash or restart. Can trace any confidence number to its inputs. |
| **Admin** | Owns `.env`, `config.json` and `pipeline/models.py`. Rarely in the UI. | Make sure API keys are set. Know which model each run used. Pin a model for audits. | Can see at a glance which keys are set (never their values). Every run names its model; a resumed run never changes model. |

Admins set keys outside the app. The UI only reports whether each key is set (`wb:974-980`, plan Global Constraints).

---

## 3. Information architecture

### 3.1 Layout

Three columns plus overlays (`wb:479-509`, grid at `wb:31`).

```
+------------+-------------------------------------------+----------------------+
| RUNS RAIL  | RUN HEADER  file . status pill  [Stop S]  | EVIDENCE PANEL       |
|            |  run id . date . model . N companies      |  Company name        |
| + New run O|  [config tags]   [Same settings] [Excel D]|  UEN . sector . row  |
|            |  progress bar  12 of 20  Batch . phase    |  Verdict . conf .risk|
| This sess. |-------------------------------------------|  [Confirm C][Change X]
|  run A *   | SUMMARY STRIP                             |  [Note M]  [Reading E]
| Recent runs|  Processed | Deep | General | Needs review|----------------------|
|  run B     |  Avg conf | Cost        [confidence hist] |  Flag box (why)      |
|  run C     |-------------------------------------------|  Reasoning           |
|            | TOOLS  [search /] [Review|Risk|Verdict    |  Criteria  2 of 3    |
|            |         chips]   Showing 4 of 20 . sort   |  How conf. was built |
|            |-------------------------------------------|  What classifier read|
|            | RESULTS TABLE (sticky header, sortable)   |  Patents (EPO)       |
|            |  # Company  Verdict Conf I.S.P Risk Action|  Validator (Agent 2) |
|            |    Patents Cost                           |  Decision history    |
|------------|                                           |  [Run facts sidebar] |
| API keys   |                                           |                      |
| [Shortcuts]|                                       divider (drag / [ ])   |
| [Cmd menu] |                                     toasts (bottom right)     |
+------------+-------------------------------------------+----------------------+
 Overlays: new-run setup (pending design) . command menu . shortcuts sheet
```

### 3.2 Regions

| Region | Role | Source |
|---|---|---|
| **Runs rail** | Lists runs: "This session" (started in this browser session) above "Recent runs". Each item: file name, status dot + text, date · model, mini progress bar while running or stopped. Foot: API key status per provider and EPO, Shortcuts and Command menu buttons. | `wb:957-980` |
| **Run header** | File name + status pill; run id, date, model, company count; config tags (struck through when a step is off); actions Stop/Resume, Same settings…, Download Excel; progress line while running; notice while stopped. | `wb:983-1014` |
| **Summary strip** | Processed (done/total), Deep tech, General tech, Needs review (with "N reviewed · N reclassified" sub-line), Avg conf., Cost / Cost so far, and a 10-bin confidence histogram with the validation threshold drawn as a dashed line. Deep, General, Needs review and each bin are filter buttons. | `wb:1017-1056` |
| **Tools: search and filter chips** | Search (name, UEN, sector, description). Chip groups Review (Needs review / Reviewed / Reclassified), Risk (Escalate / Contested / Uncertain / Clear), Verdict (Deep / General), each with a count. Right side: "Showing X of Y", Clear filters, and either "Sort: review priority" or the current order's name. | `wb:492-499`, `wb:1060-1081` |
| **Results table** | One row per company. Columns: #, Company (+ sector), Verdict (+ "was …" if reclassified), Conf. (bar + number, bar marked low below threshold), I · S · P criteria marks, Risk flag, Action (+ Reviewed / Reclassified tag), Patents, Cost. All except criteria sort. | `wb:1084-1144` |
| **Evidence panel** | Detail of the selected row: top block with verdict, confidence word, risk and decision controls, then collapsible sections, plus a facts sidebar when the panel is at least 700 px wide. Resizable via the divider. | `wb:1172-1400`, `wb:354-359` |
| **Reading view** | Toggle (`E`) that gives the panel 65% of the width and switches the table to its narrow list layout. | `wb:35`, `wb:1599-1606`, `wb:206` |
| **New-run setup** | Overlay or flow for starting a run. Design pending (Section 4b). | `wb:1750-1880` (current drawer) |
| **Command menu** | `Ctrl/⌘+K` dialog: actions, runs, companies, filtered by typed words. | `wb:1695-1747` |
| **Shortcuts sheet** | `?` dialog listing all shortcuts in four groups. | `wb:1683-1693` |
| **Toasts** | One at a time, bottom right, `aria-live="polite"`; decision toasts carry an Undo button. | `wb:508`, `wb:1472-1493` |

### 3.3 How the regions relate

- **Rail → everything.** Choosing a run resets filters, search and sort to review priority, selects the first row and scrolls both table and panel to the top (`openRun`, `wb:1454-1465`).
- **Strip and chips → table.** Both write the same filter state. Clicking "Needs review" in the strip is the same as pressing `A` or the "Needs review" chip (`wb:1607-1612`, `wb:1915-1922`).
- **Table → panel.** Selecting a row (click, `J`/`K`, command menu) renders the panel for it (`wb:1420-1428`).
- **Panel → table, strip, rail.** A decision re-renders counts everywhere but never reorders the table (`afterDecision`, `wb:1513-1515`; snapshot rule `wb:858-862`).

---

## 4. Core journeys

### 4a. First-time use (empty state)

| | |
|---|---|
| **Trigger** | User runs `python serve.py` and opens `http://127.0.0.1:8765/` with no runs yet. |
| **What they see** | Rail with "+ New run O" and the API key list (each provider "key set" or "no key"). The table area shows **"No runs yet"** / "Start a run to classify a spreadsheet of companies." and a **+ New run** button. Header, strip and tools are hidden (plan Task 12). Panel shows "Select a row to see its evidence." |
| **Steps** | 1. Read key status in the rail foot. 2. Click + New run (or `O`). 3. Continue with journey 4b. |
| **System feedback** | If the chosen provider has no key, setup blocks Start with "`<KEYVAR>` is not set in .env" (`wb:1780`). |
| **Exit / next** | A started run opens in the main area (4c). |

The prototype has no real empty state (it always loads a sample run). See P1 gap G2 for what should be added.

### 4b. Start a new run: set up in the table

**Design: "In the table"** (chosen 2026-11-13). The dropped file becomes the results table, and setup happens on that table: no form and no drawer. The same rows then fill in as the run proceeds, so setup and results are one surface. Plan Task 14 has the build detail.

**Trigger:** + New run, `O`, the empty-state button, or the command menu "New run".

| Step | What the user sees and does |
|---|---|
| 1. Empty setup | The main column switches to setup. The rail shows "New run · not started" at the top, and the evidence panel is empty. The table's empty state is the drop target: ghost rows, **"Drop a spreadsheet here to start"**, **Choose file…**. The whole main column accepts a drop. |
| 2. File lands | Every company appears at once as a row with status **Queued**, showing its real name, UEN, sector and description. A file line gives rows, rows skipped for an empty name and the column count, with **Change file**. |
| 3. Check columns | Each column header says where its data comes from ("from: About ▾"). Clicking it opens a menu of the file's columns with an example value from each. A missing Company name column is highlighted with **Choose column**. Notes list the columns kept unchanged in the output and warn when there is no description column. |
| 4. Choose companies | Untick rows to leave them out; the header checkbox selects all or none. The count, cost and time update. |
| 5. Settings (optional) | **Settings: Standard ▾** opens a popover with three quality levels in plain words and the four steps, each explained in one sentence. **Analyst settings** opens a side sheet with the provider, tier, exact model, batch mode, the six thresholds and the estimate. |
| 6. Start | A right-aligned bar shows **Classify 18 companies · ~US$0.45 · about 2 min**. If something blocks the start, the button says why, and clicking it takes the user to the fix. On Start the same rows come alive in place (Queued → step → verdict) and focus moves to Stop. **Cancel** or `Esc` returns to the run that was open before. |

It must meet all of the following. Items marked (R) are carried over from the old drawer and the plan; the rest are additions for non-technical users.

| # | Requirement |
|---|---|
| N1 (R) | Accept `.xlsx`, `.xls`, `.csv` by drag-and-drop and by a "Choose file…" picker (plan Deviation 2). While uploading show "Reading `<name>`…". Show server rejections (unreadable file, 0 rows, renamed non-spreadsheet) as readable text next to the file area, not as a toast. |
| N2 (R) | After upload show: rows, rows skipped for an empty name, column count (`wb:1809`), and a preview of the first rows as mapped (`wb:1822-1826`). |
| N3 (R) | Auto-detect the four fields (company name required; description, domain, UEN optional) and let the user change each. Tag each mapping Detected / Changed / Required / Skipped / Used twice (`wb:1817`). List the columns that are carried through unchanged (`wb:1826`). |
| N4 (R) | Warn when there is no description column: "No description column: classification will rely on web enrichment." or, with enrichment off, that companies without patents are capped at the low-evidence cap (`wb:1820`). |
| N5 | Default to sensible settings so a non-technical user can start with **file → Start** and nothing else. Provider, tier, steps and thresholds must not be required reading. Thresholds belong behind an "Advanced" disclosure. |
| N6 | Describe model choice in plain words first (e.g. "Fast and cheapest", "Balanced", "Most careful"), with the model id as secondary text. Never show model names that do not come from `GET /api/setup` (plan Global Constraints). |
| N7 (R) | Show each provider's key status ("Key set" / "`KEYVAR` missing") and say what to do: "Add `KEYVAR` to .env and reopen this panel" (`wb:1832`). Never show key values. |
| N8 (R) | Show a cost and duration estimate before Start that updates within ~250 ms of any change, labelled as a rough estimate; "Est. cost per 20 companies" before a file is chosen; "unknown" for an unpriced pinned model with the reason (`wb:1783-1801`, plan Task 14). Say in plain words that web searches are usually the biggest cost and that batch mode is cheaper but can take an hour or more (`wb:1799`, `wb:1842`). |
| N9 (R) | Disable Start and state the single blocking problem, in this order: "Choose an input file to start", "Map the company name column to start", "Tick at least one company to start", "`KEYVAR` is not set in .env" (`wb:1776-1782`). |
| N10 (R) | "Same settings…" from a run pre-fills every setting but **no file**; the mapping is re-checked against the new file's headers (plan Task 14). Title it so the user knows ("New run with the same settings", `wb:1759`). |
| N11 (R) | Settings of an existing run are never editable; a run's model never changes on resume (plan Global Constraints). |
| N12 (R) | On Start: create the run, add it to "This session", open it, and move focus to Stop (`wb:1859-1880`). |
| N13 (R) | The analyst sheet, popover and column menus are overlays: trap focus, close on `Esc`, return focus to the opener (`wb:2024-2035`, `wb:1766-1775`). Global shortcuts are off while it is open (`wb:2069`). |
| N14 | Work fully by keyboard and at 1024 px width. Every control has a visible label, not just a placeholder. |
| N15 | Explain each optional step in one sentence a programme manager would understand, without "Agent", "EPO OPS" or "CPC". |
| N16 | Show every input row before Start and let the user leave rows out. Unticked rows are not sent to the pipeline (plan Task 10 `exclude`), the count and estimate follow the ticked rows, and unticking every row blocks Start with "Tick at least one company to start". |
| N17 | A blocked Start never just greys out: it states the reason, and clicking it moves focus to the control that fixes it. |

**Exit:** the new run opens in the main area (4c). Cancel returns to the previous screen with nothing created.

### 4c. Watch a live run (sequential and batch)

| | |
|---|---|
| **Trigger** | A run starts, or the user selects a running run in the rail. |
| **What they see** | Header pill **Running** (blue). Progress line: bar, "12 of 20", then "Sequential · `<step>` — `<company>`" or "Batch · `<phase>`" (`wb:1007`). Rail item "Running · 12/20" with a pulsing dot and mini bar (`wb:948`). Strip counts grow; Cost reads **Cost so far** (`wb:1037`). |
| **Table while running** | Rows stay in **input order** and the tools say "Input order while running" (`wb:883`, `wb:1079`). Pending rows show their current step with a pulsing dot (Enrichment, Patent lookup, Classification, Confidence scoring, Validation) or a grey non-pulsing waiting step (Waiting for batch, In batch job, Validation queued), or "Queued" (`wb:1119-1123`). Finished rows fade in over 240 ms (`wb:1125-1128`, `wb:246`). |
| **Batch mode phases** | 1. "Gather company data · Enrichment — `<company>`" per company. 2. "Classify in one batch job · N companies submitted (a real batch can take up to an hour)". 3. "Read batch results — `<company>`". 4. "Validate uncertain results — `<company>`" (`wb:752-777`). Rows read "Waiting for batch", then "In batch job", then land or show "Validation queued". |
| **Panel on a pending row** | Numbered step list with done / in progress / waiting per step, "Batch mode" or "One at a time", and the input description. Plan change: the last step reads "Validation (if needed)" because the app cannot predict it (plan Task 13). Top line: "In progress: `<step>`. Decisions open when the result is in." (`wb:1200`). |
| **What the user can do** | Review any finished row now (decisions work mid-run). Sort or filter (an explicit sort overrides input order). Stop (`S`). Download a partial workbook (`D`). |
| **System feedback** | Polling once a second (plan Open decision 2). On completion: toast "Run complete: `<file>`" / "`<n>` companies · `<deep>` deep tech · `<open>` need review" (`wb:832`), and the table switches to review-priority order. On losing the server: one toast "Lost contact with the server", then "Reconnected" (plan Task 12). |
| **Exit / next** | Run completes → triage (4e). |

### 4d. Stop, resume, interrupted, failed

| Situation | Trigger | What the user sees | Next |
|---|---|---|---|
| **Stop** | ■ Stop or `S` on a running run. | Toast "Run stopped" / "`n` finished results kept. Resume continues with the next unfinished company." (`wb:814`). Pill **Stopped** (amber). Notice: "Stopped after **`n` of `N`**. Finished results are kept and can be reviewed now. Resume continues at the next unfinished company with `<model>`, the model this run started with." (`wb:1009`). Unfinished rows read "Not started" (`wb:1122`). Rail "Stopped · n/N" with amber bar. | Review what is done, or Resume. |
| **Resume** | Resume or `S`. | Toast "Resuming `<file>`" / "Continuing with `<model>`, the model this run started with." (`wb:822`). Focus moves to Stop (`wb:1901`). | Back to 4c. |
| **Interrupted** | Server restarted or the pipeline process died (plan Deviation 3). | Same as Stopped, pill **Interrupted**, same notice text and Resume button. | Resume. |
| **Failed** | Pipeline exited with a fatal error (bad key, model check failed, resume mismatch). | Pill **Failed** (red, `--error`). The `wb-notice` block shows the pipeline's `[FATAL]` message; Resume button shown. Toast "Run failed: `<file>`" / the error (plan Task 12). A run that fails before any company must show Failed, never an endless Running (plan Review Focus 3). | Fix the cause (often `.env`), then Resume. See G6 for plain-language error copy. |
| **Complete with error rows** | Some companies ended in an error. | Error rows read "Error" in Verdict, "—" for confidence, criteria and risk, action "Needs Review"; they cannot be decided. "Processed" shows a sub-line "`N` errors · retried on resume"; Resume is offered (plan Deviation 4). Panel: "Error: this company was not classified", the error message, the input description and "Resume the run to retry it." (plan Task 13). | Resume to retry. |
| **`S` with nothing to stop** | `S` on a complete run. | Toast "No run in progress" / "S stops a running run or resumes a stopped one." (`wb:1623`). | — |

Resume rule to state wherever Resume appears: it continues with the same model and the same input file in the same row order; error rows are retried (`README.md` "Resuming", `wb:1410`).

### 4e. Triage: work the Needs-review queue

| | |
|---|---|
| **Trigger** | A run completes, or the user opens a finished run. |
| **What they see** | Default order is **review priority**: undecided flagged rows first, then decided flagged rows, then Clear rows; within a group by severity Escalate → Contested → Uncertain, then lowest confidence first (`wb:901-906`). The "Needs review" stat is amber while above zero (`wb:1034`). Rail reads "`N` companies · `k` to review" or "all reviewed" (`wb:950`). |
| **Steps** | 1. Click **Needs review** in the strip, or press `A`, to show only open rows. 2. Press `N` (or `J`) to select the first. 3. Read the flag box and evidence (4f). 4. Press `C` to confirm, which records the decision and jumps to the next open row (`wb:1568-1576`); or `X` to change. 5. Repeat until the count is 0. |
| **Narrowing** | Chips by Risk, Verdict or Review state; histogram bins by confidence band (a "Confidence 40–49 ✕" chip appears, `wb:1075`); search. Chip groups combine (AND across groups, OR within a group, `wb:876-879`). "Showing X of Y" and Clear filters appear when anything is active. |
| **Stable order** | A row you just decided stays where it is until the next explicit sort, filter or search (`wb:858-862`, `wb:912-916`). This keeps `J`/`K` predictable. |
| **System feedback** | When the queue is empty, `N` toasts "Nothing left to review" / "Every flagged company has a decision."; when only filters hide open rows: "No company needing review in this view" / "Clear filters to see the rest." (`wb:1450-1451`). Empty filter result: "No companies match these filters" / "`N` companies in this run." + Clear filters (`wb:1110`). |
| **Exit / next** | Export (4g). |

### 4f. Review one company

**Trigger:** select a row.

**Top block** (`wb:1185-1203`): name; UEN (if mapped), sector, "Row i of N"; Reading view toggle; verdict, "**58** borderline confidence", risk flag, and the action ("Needs Review", "Approve · reviewed", …).

**Decision controls** (`wb:1211-1228`):

| Row state | Controls |
|---|---|
| Flagged, undecided | **✓ Confirm `<verdict>` C** (primary), **Change to `<other>` X**, **Note M** |
| Clear, undecided | "Approve · no review needed" (or Reject) + ghost **Reclassify X** |
| Decided | "✓ Confirmed `<verdict>` · 14:40 · "note"" or "↺ Reclassified to `<verdict>` …", **Change decision X**, ghost **Restore pipeline verdict** |
| Pending / error | No controls |

**Decision form** (`wb:1229-1240`): two radios ("Confirm/Keep `<verdict>` C", "Change to `<other>` X"), a note box, **Record Ctrl/⌘+↵**, Cancel. The note is required only when changing a Clear verdict; the placeholder then reads "Why the pipeline verdict is wrong (required, written to the workbook)" and Record stays disabled with "A note is required to overturn a Clear verdict. It is written to the workbook." Otherwise the hint reads "Esc leaves the note, the draft is kept". Drafts persist per row while you move around (`wb:1557-1566`).

**Evidence sections**, in order (`wb:1260-1267`); each collapses with its state remembered (`wb:1255-1258`):

| Section | Content | Source |
|---|---|---|
| Flag box | Title + plain explanation per risk (see Section 7.3); validator's escalation reason if any. On a reclassified row it is replaced by "Reclassified by reviewer: …", the note, and "The reasoning, criteria and confidence below are the pipeline's and support its original verdict, not the reviewer's." | `wb:1283-1310` |
| Reasoning | Classifier paragraph; aside names the basis ("Classifier, input and web descriptions"). | `wb:1263` |
| Criteria | "2 of 3 met"; per criterion ✓ or letter, "met/not met", one-line reason. | `wb:1312-1318` |
| How the pipeline's confidence was built | Table: Classifier score, Patent adjustment (with why), Low-evidence cap (if applied), Before validation (with why the validator did or did not run), Validator change, **Final confidence**; a 0–100 track with threshold, before (○) and final (●) markers. | `wb:1320-1340` |
| What the classifier read | Web description with source, input description, or "No description in the input file … The verdict rests on the company name." | `wb:1342-1348` |
| Patents (EPO) | Deep tech level, domain, lookup result ("Matched in EPO" / "No matching applicant"), CPC codes with descriptions; "Patent lookup was off for this run." when off. | `wb:1350-1355` |
| Validator (Agent 2) | Finding (Confirmed the verdict / Argued for the other verdict / Insufficient evidence, with "(override applied/blocked)"), Decision (No escalation / Escalated for human review), summary, sources list. Or "not run" with the reason. | `wb:1357-1367` |
| Decision history | First line is the pipeline's result with time; then each reviewer action with time and note. | `wb:1369-1381` |
| Run facts | UEN, Sector, Basis, Web source, Patents, Validator, Cost, Time, Model. Collapsed by default; shown as a sidebar at ≥ 700 px panel width. | `wb:1269-1281`, `wb:679` |

**Undo:** each decision toast has **Undo U** (`wb:1527`). `U` pops the last action of the session, re-selects that row if visible, and toasts "Undone: `<label>`" / "`n` more actions can be undone" (`wb:1540-1551`). With nothing left: "Nothing to undo" / "Reviewer actions in this session can be undone one at a time." Undo works across runs; for an inactive run only the rail refreshes (plan Task 13). After a page reload the undo stack is empty, but **Restore pipeline verdict** and the persisted history remain.

**Exit / next:** `N` to the next open row, or `C` which moves automatically.

### 4g. Export Excel with decisions

| | |
|---|---|
| **Trigger** | Download Excel button or `D`, any time a row has a result. |
| **What happens** | Browser downloads `<input>_classified_<run stamp>.xlsx` (`wb:1497-1498`). Toast "Saved `<name>`" (or "Saved partial workbook `<name>`" with "`n` of `N` companies ·") then "`c` verdicts confirmed · `r` reclassified · `o` still need review" (`wb:1502`). With no results: "Nothing to download yet" / "The workbook is available once the first company finishes." (plan Task 15). |
| **Workbook contents** | Management View gains Final Verdict, Reviewer Decision (Confirmed / Reclassified / blank), Reviewer Note, Reviewed At; Action Required follows the final verdict for decided rows; Verdict stays the pipeline's. Full Detail gains `reviewer_*` columns; Overview gains a Review group; Legend explains the new columns (plan Task 7). |
| **Exit** | User forwards the workbook. |

### 4h. Revisit a past run

| | |
|---|---|
| **Trigger** | Click a run in the rail, or `Ctrl/⌘+K` and type its file name. |
| **What they see** | Same screen as a finished run, in review-priority order, first row selected (`wb:1454-1465`). All decisions and history reload from the server. Rail date reads "Today, 08:42" or "2 Nov 2026" (plan Task 11 `dateLabel`). |
| **Not shown** | Runs started from the CLI (plan Deviation 1, Open decision 6). The prototype's "Results are in the workbook" archive view (`wb:1146-1160`) is not built. |

### 4i. New run with the same settings

| | |
|---|---|
| **Trigger** | **Same settings…** in the run header (`wb:999`). |
| **What happens** | Setup opens titled "New run with the same settings", all settings copied, no file (N10). After a file is chosen, the mapping is re-checked: columns that no longer exist are cleared and re-detected. |
| **Exit** | Start → new run in "This session"; the original run is untouched. |

---

## 5. States catalogue

Exact copy in quotes. "—" means the region does not change for that state.

### 5.1 Run-level states by region

| Region | Empty (no runs) | Running | Stopped / Interrupted | Failed | Complete |
|---|---|---|---|---|---|
| Rail item | Only headings and "+ New run" | Pulsing blue dot, "Running · 12/20", blue mini bar | Amber dot, "Stopped · 12/20" (plan: "Interrupted · …"), amber bar | Red dot, "Failed · 3/20" (new; style `is-failed`) | Green dot, "20 companies · 4 to review" or "all reviewed" |
| Header pill | hidden | "Running" | "Stopped" / "Interrupted" | "Failed" | "Complete" |
| Header actions | hidden | ■ Stop S, Same settings…, Download Excel D | Resume S (primary), Same settings…, Download Excel D | Resume S, Same settings…, Download Excel D | Same settings…, Download Excel D (+ Resume if error rows) |
| Header extra | hidden | Progress bar, "n of N", "Batch · …" / "Sequential · …" | Notice "Stopped after n of N. Finished results are kept…" | Notice with the `[FATAL]` message | Config tags only |
| Strip | hidden | Counts grow; "Cost so far" | Counts frozen; "Cost" | Counts frozen | Final counts; "Cost" |
| Tools | hidden | "Input order while running" | "Review priority order" | same | same |
| Table | "No runs yet" / "Start a run to classify a spreadsheet of companies." + New run | Mixed finished and pending rows | Pending rows read "Not started" | as Stopped | All rows finished |
| Panel | "Select a row to see its evidence." | Per row | Pending rows: "Not started" + "This company had not finished when the run stopped. Resume to classify it." (`wb:1398`) | as Stopped | Per row |

### 5.2 Row states

| State | Verdict cell | Conf. | I·S·P | Risk | Action | Patents / Cost | Panel |
|---|---|---|---|---|---|---|---|
| Queued | step cell "Queued" | blank | blank | blank | blank | — / — | "Queued. Decisions open when the result is in." |
| In progress | pulsing step name | blank | blank | blank | blank | — / — | "In progress: Enrichment." + step list |
| Waiting (batch) | grey "Waiting for batch" / "In batch job" / "Validation queued" | blank | blank | blank | blank | — / — | step list |
| Not started (stopped) | "Not started" | blank | blank | blank | blank | — / — | "Not started" + resume hint |
| Finished, Clear | Deep tech / General tech | bar + number | marks | "Clear" (grey text) | "Approve" / "Reject" | count / $0.021 | flag "Clear: no open questions" |
| Finished, flagged | as above | bar, low style below threshold (`wb:1130`) | marks | coloured pill | "Needs Review" (amber) | | flag box per risk |
| Confirmed | as above | | | | "Approve" + "✓ Reviewed" | | "✓ Confirmed …" |
| Reclassified | new verdict + "↺ was general tech" | muted, tooltip "Pipeline confidence in …, the verdict the reviewer overturned" | | original risk | action from new verdict + "↺ Reclassified" | | reclassified flag box |
| Error | "Error" (`is-error`) | — | — | — | "Needs Review" | — | "Error: this company was not classified" + message + "Resume the run to retry it." |
| Cost unknown | | | | | | "?" with tooltip "Pinned model has no listed price" (`wb:1139`) | Facts: "unknown (pinned model has no listed price)" |
| Patents off | | | | | | "—" | "Patent lookup was off for this run." |

### 5.3 Other states

| Where | State | Copy |
|---|---|---|
| Table | Filters match nothing | "No companies match these filters" / "`N` companies in this run." + Clear filters |
| Command menu | No matches | "No matches" (`wb:1730`) |
| Strip | No results yet | Avg conf. "—" |
| Strip | Any unpriced row | Cost "unknown" (`wb:1037`) |
| Histogram | Empty bin | Bin disabled (`wb:1050`) |
| Connection | Poll fails / recovers | "Lost contact with the server" / "Reconnected" |
| Any API error on an action | Stop, Resume, decision | Toast with the server's message; a failed decision keeps the form open and shows the message in the form hint (plan Task 13) |

---

## 6. Interaction details

### 6.1 Keyboard shortcuts

Shortcuts are off while typing in a field and while the shortcuts sheet, command menu or new-run setup is open (`wb:1691`, `wb:2068-2072`). Modifier combos other than `Ctrl/⌘+K` are ignored (`wb:2073`). Keys are case-insensitive.

| Group | Key | Action | Notes |
|---|---|---|---|
| Navigate | `J` / `↓` | Next row | From nothing selected, goes to the first (`wb:1430-1436`) |
| | `K` / `↑` | Previous row | |
| | `Home` / `End` | First / last row | |
| | `N` / `⇧N` | Next / previous company needing review | Wraps; toasts when none (`wb:1441-1452`) |
| | `/` | Focus search | In search: `Esc` clears, then blurs; `↓` or `Enter` jumps to the table (`wb:2048-2056`) |
| | `F` | Focus the filter chips | Opens the chip row in compact mode (`wb:1613-1617`) |
| | `Ctrl/⌘+K` | Open / close command menu | Works even in fields |
| Decide | `C` | Confirm the pipeline verdict (flagged row), then go to next open row | On a Clear row: toast "C confirms flagged companies" / "This one is Clear. Press X to reclassify it." Already confirmed: "`<name>` is already confirmed" / "Press N for the next company needing review." |
| | `X` | Open the form set to the other verdict, focus the note | |
| | `M` | Open the form and focus the note | |
| | `Ctrl/⌘+↵` | Record (in the note) | |
| | `U` | Undo last reviewer action | |
| View | `E` | Reading view | |
| | `A` | Needs review only (toggle) | |
| | `?` | Keyboard shortcuts sheet | `?` again closes it |
| | `Esc` | Leave the note; else exit reading view; else close the form; closes dialogs | Order at `wb:2094-2101` |
| | `↑ ↓ [ ]`, `Enter` (divider focused) | Widen / narrow panel by 24 px; reset | `wb:2036-2041` |
| | Double-click divider | Reset panel width | |
| Run | `O` | New run | |
| | `D` | Download Excel | |
| | `S` | Stop or resume the active run | |

Every button that has a shortcut shows it as a `<kbd>` hint. The plan reserves no extra keys (plan Task 15).

### 6.2 Command menu

Placeholder: "Jump to a company, switch run, or run an action…" (`wb:1718`). Groups and contents (`wb:1695-1705`):

- **Action**: every shortcut command except those that only make sense in context (command menu itself, Record, Esc, divider keys), plus "Reset the evidence panel width". Each shows its keys.
- **Run**: every run, with date and status text; the active one is marked "current".
- **Company**: every company in the active run, with UEN and sector.

Matching: all typed words must appear in group, label or sub-text (case-insensitive). Up to 80 results. `↑ ↓` move (wrap), `↵` runs, `Esc` closes, `Tab` is held inside (`wb:2014-2019`). Choosing a company hidden by filters clears the filters first (`wb:1706-1712`). The input is a combobox with `aria-activedescendant`.

### 6.3 Focus management

| Moment | Focus goes to |
|---|---|
| Any re-render | The same control if it still exists, with text selection kept (`put`, `wb:919-930`) |
| Table | One roving tab stop: only the selected row's name button is tabbable (`wb:1117`) |
| `J`/`K` | Moves focus only if focus was already in the table (`wb:1435`) |
| Open setup | Start if enabled, else the file control, else Close (`wb:1762-1763`); see N13 |
| Start run | Stop button (`wb:1878-1879`) |
| Resume | Stop button (`wb:1901`) |
| Record | "Change decision" button (`wb:1591`) |
| `Esc` in note | Selected row's name button (`wb:1593-1596`) |
| Close dialog | Element that opened it (`wb:1742-1747`) |
| Command menu → company | That row's name button |

### 6.4 Toasts

- One toast at a time; a new one replaces the text in place rather than stacking (`wb:1472-1487`).
- Visible 3.4 s, or 5.2 s when it has an Undo button (`wb:1492`).
- Title is the outcome; body is the consequence or next step. Untrusted text is escaped.
- Toasts are informational. Anything the user must act on (failed run, blocking setup problem) is also shown in place, not only in a toast.

### 6.5 Confirmation versus undo

| Action | Policy | Why |
|---|---|---|
| Confirm, change, restore a decision | **No confirmation; undo** via toast or `U` | Frequent and fully reversible; history keeps every step |
| Overturn a Clear verdict | **Required note**, no dialog | Raises the bar for the riskiest change and records the reason |
| Stop a run | **No confirmation**; Resume is one key away and loses nothing | Every company is checkpointed |
| Start a run | Explicit Start with estimate shown | Costs money; the estimate is the confirmation |
| Download | None | Harmless |
| Delete a run | Not offered | — |

### 6.6 Motion

| Element | Motion | Source |
|---|---|---|
| Row lands | 240 ms opacity fade on verdict and confidence cells only | `wb:246`, `wb:1125-1128` |
| Running dot / current step | 0.8–1 s opacity pulse | `wb:73`, `wb:241` |
| Progress bars | `scaleX` transition 200 ms | `wb:106` |
| Buttons | Scale to 0.97 on press, 120 ms | `wb:47-49` |
| Drawer / scrim | 240 ms slide-in from the right / 200 ms fade; 160–170 ms out | `wb:363`, `wb:470` |
| Toasts | 220 ms rise-in, 160 ms fade-out | `wb:455`, `wb:463` |

Rules: animate only opacity and transform; never move rows during a run; no motion on keyboard navigation; under `prefers-reduced-motion` all animations become 1 ms and the pulses stop (`wb:473-476`).

---

## 7. Content and language

### 7.1 Verdicts and actions

| Value | Label | Visual | Notes |
|---|---|---|---|
| `deep tech` | "Deep tech" | Green text, filled dot | `wb:211-216` |
| `general tech` | "General tech" | Neutral grey, hollow ring | Neutral, not "bad" (`index.html:22`) |
| error | "Error" | `--error` | plan Deviation 4 |
| Action | "Approve" (deep tech, Clear or decided), "Reject" (general tech, Clear or decided), "Needs Review" (flagged and undecided, or error) | Needs Review in amber | `wb:566`, `wb:699` |

Use sentence case in running text ("deep tech", "general tech"); capitalise only as a label.

### 7.2 Confidence

Confidence is "how likely the chosen verdict is correct", 0–100 (`PROJECT_OVERVIEW.md` §7). The panel says "**58** borderline confidence" using six words (`wb:560`):

| Score | Word | Plain meaning to show on hover or in help |
|---|---|---|
| 90–100 | Near-definitive | Several strong signals agree; no real counter-argument. |
| 75–89 | Strong | Clear signals on at least two of the three criteria. |
| 60–74 | Moderate | Probably right, but one or more signals are missing. |
| 45–59 | Borderline | Evidence on both sides. A person should look. |
| 30–44 | Weak | Little to go on: thin description, no patents. |
| 0–29 | Minimal | Almost no usable information. |

The workbook's Confidence Tier column uses High (≥ 75) / Medium (≥ 50) / Low (plan Task 1). The two scales disagree at 50–59 and 60–74; see open question Q1.

### 7.3 Risk flags and "what to do"

Risk is the pipeline's view of whether the verdict needs a person. Internal value and table label are "Escalate"; this is the "Escalated" flag. Order of severity: Escalate > Contested > Uncertain > Clear (`wb:524`).

| Flag | Panel title (prototype) | When | What to do (plain English, to show in the flag box) |
|---|---|---|---|
| **Clear** | "Clear: no open questions" | Confidence ≥ threshold, or the validator confirmed with enough confidence | Nothing required. Spot-check if you know the company. Reclassify only with a written reason. |
| **Uncertain** | "Uncertain: evidence is thin" | Validator ran; confidence still < 70 | Nothing contradicts the verdict; there is just not enough. Check "What the classifier read". If you know the company or can find its product or patents, confirm or change. |
| **Contested** | "Contested: the validator disagreed" | Validator argued for the other verdict but below the override minimum | Two readings are plausible. Compare the Reasoning with the Validator summary and its sources, then pick one. |
| **Escalate** | "Escalate: needs a human decision" | Validator found evidence contradictory or insufficient | The pipeline will not decide. Read the escalation reason and sources; decide, and add a note saying what settled it. |

Panel body copy per flag is at `wb:1293-1308`, including the important special case: Clear but below threshold because validation was off — "…nothing challenged the verdict. Treat it with care." (`wb:1296`).

### 7.4 Tone rules

- Say what happened, then what it means, then what to do. ("Stopped after 12 of 20. Finished results are kept… Resume continues…")
- Name the thing, not the mechanism: "Validation", "Patent lookup", "Web enrichment" — not "Agent 2", "EPO OPS", "Agent 0" in primary text. Technical names may appear as secondary labels for analysts.
- No blame, no exclamation marks, no "successfully".
- Every disabled control says why, next to it (Start, Record).
- Quote reviewer notes in curly quotes; show untrusted text exactly as written.

### 7.5 Numbers and dates

| Kind | Format | Source |
|---|---|---|
| Counts, confidence | Integers, tabular figures | `wb:37` |
| Progress | "12 of 20" (header), "12/20" (rail) | |
| Cost per company | `$0.021` (3 decimals) | `wb:1139` |
| Cost totals | `$4.31` (2 decimals); "unknown" if any row unpriced | `wb:1037` |
| Signed adjustments | "+12", "−3", "±0" with a true minus | `wb:561` |
| Duration estimate | "~40 s", "~10 min", "~1 h 30 min" | `wb:554-559` |
| Time | 24 h "14:40" | `wb:569` |
| Date | "Today, 08:42" or "2 Nov 2026" | plan Task 11 |
| Confidence bands | "Confidence 40–49", last band "90–100" | `wb:1075` |

---

## 8. Accessibility and responsiveness

### 8.1 Not colour alone

| Signal | Non-colour cue |
|---|---|
| Verdict | Text label; at narrow widths a filled dot (deep) vs hollow ring (general) plus a `title` (`wb:212-216`, `wb:931`) |
| Criteria | "✓" vs the criterion letter I/S/P; group has `aria-label` "Innovation met, Scientific foundation not met, …" (`wb:933-939`) |
| Risk | Always a text label ("Clear" plain, others in a pill) |
| Low confidence | Number is always shown next to the bar |
| Selected row | Accent background plus 3 px inset bar and `aria-selected` |
| Reclassified | "↺" glyph plus "was …" / "Reclassified" text at wider widths |
| Run status | Text in pill and rail as well as the dot |

### 8.2 Semantics and screen readers

- Landmarks: rail `aside` "Runs", `main`, strip `section` "Run summary", panel `aside` "Company evidence" (`wb:481-504`).
- Sortable headers are buttons with "Sort by …" labels; `th` carries `aria-sort` (`wb:1091-1103`).
- Strip stats, chips, histogram bins and toggles use `aria-pressed` (`wb:1025`, `wb:1071`, `wb:1050`); collapsible sections use `aria-expanded` (`wb:1257`).
- Divider is a focusable `separator` with an instructive label and `aria-valuenow` (`wb:503`, `wb:1634`).
- Dialogs are `role="dialog"` with `aria-modal` and a label; focus is trapped (`wb:1688`, `wb:1717`, `wb:1758`).
- Toasts are a polite live region (`wb:508`).
- **Required addition — live progress:** a separate visually hidden polite region that announces, at most every 10 seconds or 10 companies, "12 of 20 classified, 2 need review", plus immediate announcements for Stopped, Failed and Complete. Row landings must not each be announced. The prototype has none (gap G5).
- **Required addition:** the verdict dot's `title` is not read reliably; give the narrow-width verdict cell visually hidden text.

### 8.3 Responsiveness

Desktop-first. Three tiers of fixed widths (`wb:31-34`):

| Viewport | Rail | Panel default |
|---|---|---|
| ≥ 1600 px | 200 px | 540 px |
| 1300–1599 px | 200 px | 480 px |
| 1100–1299 px | 176 px | 380 px |
| < 1100 px | 160 px | 340 px |

The panel is capped at 60% of the space right of the rail; the divider's minimum is 340 px (`wb:1627-1635`).

**Table columns follow the table's own width** (container queries, `wb:166-204`):

| Table width | Columns |
|---|---|
| < 500 px ("list") | #, Company, verdict dot ("V"), Conf. number, Risk, action as ✓ header |
| ≥ 500 | + verdict text, confidence bar, action text, "was …" glyph |
| ≥ 560 | + I·S·P criteria |
| ≥ 620 | + Patents |
| ≥ 680 | + Cost |
| ≥ 800 | roomier padding, full header labels |
| ≥ 960 | sector under the name, "was general tech" in words, "Reviewed"/"Reclassified" words |

**Compact chrome** applies when the main column is under 520 px and always in reading view (`wb:9-28`, `wb:205-206`): header meta, config tags, the stopped notice, progress text, the Same settings button, the histogram, Avg conf. and Cost, stat sub-lines, chips and the right-hand tools are hidden; labels shorten ("Processed" → "Done", "Download Excel" → "Excel"); a **Filters** toggle appears showing "Filters · 2 active · 4 of 20 ▾" (`wb:1070`).

**Panel layout:** at ≥ 700 px panel width, Run facts move to a 220 px sidebar (`wb:354-359`).

**Not covered by the prototype:** below roughly 900 px the rail never collapses and the three columns crowd. See G9. Phones are out of scope; tablets in landscape (≥ 1024 px) must work.

### 8.4 Other

- Visible focus ring on every control: 2 px accent outline (`wb:41`).
- Dark mode: the tokens have no dark set. Not required for v1 (G14).
- Panel width, reading view and collapsed sections persist in `localStorage` under `dtc.ui`, inside try/catch (plan Task 15).

---

## 9. Trust and safety UX

| Concern | How the UI handles it |
|---|---|
| **Which model** | Model id in the run header and rail, in every row's Run facts, and in the Stop/Resume copy ("…with `<model>`, the model this run started with"). Resume never changes model. The model comes from the server; the frontend has no model list (plan Global Constraints). |
| **Cost** | Estimate before start, labelled rough (N8). "Cost so far" while running; per-row cost; "unknown" (never a guessed price) for unpriced models (`README.md` Cost). |
| **Why a verdict** | Reasoning, three criteria, how confidence was built step by step, what the classifier read with its source, patents, validator summary and sources (4f). |
| **Uncertainty** | Risk flag, confidence number and bar, validation threshold on the histogram and the confidence track, flag box in plain words; the pipeline verdict stays visible after reclassification. |
| **Audit trail** | Per-row Decision history with times and notes; persisted in `decisions.json`; written to the workbook (Reviewer Decision, Note, Reviewed At, Overview counts). Restore is itself logged, not a deletion. Undo removes the last entry (plan Task 6). |
| **Overruling safely** | Overturning a Clear verdict needs a note; notes are trimmed and capped at 2000 characters (plan Task 6). |
| **Untrusted text** | Company names, descriptions, web text, validator summaries, sources and notes are escaped everywhere, including `title` attributes, toasts and the command menu (`esc`, `wb:550`; plan Review Focus 5). Validator sources are shown as text, not live links (`wb:1366`); if they become links they must open in a new tab with `rel="noopener noreferrer"` and show the full domain. |
| **Secrets** | The browser never receives API keys, only "key set" / "no key". The server binds to 127.0.0.1 with no authentication; the UI should say "Local only" somewhere visible (open question Q5). |
| **Uploaded files** | Saved under a safe name; bad files rejected with a readable message (plan Review Focus 2). |

---

## 10. Ease-of-use gaps and recommendations

Priorities: **P1** blocks or misleads a non-technical reviewer; **P2** slows them down noticeably; **P3** polish.

| ID | P | Gap in the prototype | Recommendation |
|---|---|---|---|
| G1 | P1 | **Jargon in primary UI.** "Conf.", "I · S · P", "Patents (EPO)", "CPC" codes, "Validator (Agent 2)", "Agent 1 confidence" (`wb:1323`), config tags "Override ≥ 65", "Patent adj. ±15", "Low-evidence cap 60" (`wb:988-990`), "Basis", raw run ids in mono. A grant evaluator cannot tell what these mean. | Add a plain-language layer: rename visible labels ("Confidence", "Criteria met", "Patents", "Second opinion (web check)", "Classifier"); move config tags behind a "Run settings" disclosure; show CPC codes only inside Patents with their descriptions first; give every label an info tooltip drawn from one glossary that matches the workbook Legend sheet. Keep technical names as secondary text for analysts. |
| G2 | P1 | **No onboarding.** The prototype always opens on a sample run; the plan's empty state is one line. A first-time user does not learn what file to bring, what the output is or what "Needs review" means. | Empty state with three short steps (bring a spreadsheet with a company name column → we classify each company as deep or general tech → you review the uncertain ones and download Excel), a link to the criteria, a downloadable sample file, and the key status. On a user's first finished run, show a one-time dismissible tip pointing at "Needs review". |
| G3 | P1 | **The review queue is not the starting point.** A finished run opens on all rows (priority-sorted). The user must know to click "Needs review" or press `A`. | When a finished run has open rows, show a banner above the table: "4 companies need your decision · Start reviewing". It applies the Needs-review filter and selects the first. When the count reaches 0, replace with "All reviewed · Download Excel". |
| G4 | P1 | **Flag boxes explain but do not instruct.** E.g. Escalate says only "handed the call to a reviewer" (`wb:1306`). | Add the "What to do" line from Section 7.3 to every flag box, and for Escalate/Contested link directly to the Validator section and its sources. |
| G5 | P1 | **Live progress is silent to screen readers.** Only toasts are live (`wb:508`). | Add the throttled progress live region in 8.2. |
| G6 | P1 | **Raw failure text.** Failed runs show the pipeline's `[FATAL]` line verbatim (plan Task 8). | Map known causes to plain copy with a fix: missing key → "The Anthropic key is missing. Add ANTHROPIC_API_KEY to .env, then press Resume."; model unavailable → "None of the tested models for this tier is available. Ask an admin to pin a model."; resume mismatch → "The input file changed since this run started, so it can't resume. Start a new run with Same settings." Show the raw text under "Details". |
| G7 | P1 | **Hidden uncertainty when validation is off.** A low-confidence row is still "Clear" with action "Approve"; the warning only appears inside the flag box (`wb:1296`). | Show a distinct "Not checked" marker in the Risk column for rows below the threshold in runs with validation off, and count them in the strip. Do not change the pipeline's risk value; this is a display layer. |
| G8 | P1 | **Two vocabularies for the same thing.** Confidence: six words in the UI (`wb:560`) vs High/Medium/Low in the workbook (plan Task 1). Risk: "Escalate" (UI, README) vs "Escalated / Override / Confirmed" (`PROJECT_OVERVIEW.md` §6, out of date). Action: "Needs Review" vs chip "Needs review". | Choose one tier scale for both UI and workbook (Q1); update `PROJECT_OVERVIEW.md` §6 risk flags; use one capitalisation ("Needs review") everywhere. |
| G9 | P2 | **Narrow screens.** The rail never collapses; at ~1000 px the main column falls into compact mode and loses the histogram, chips and Same settings. | Collapse the rail to icons below 1200 px with a toggle; keep "Same settings…" in an overflow menu in compact mode; test at 1024 × 768. |
| G10 | P2 | **Density for occasional users.** Nine columns, a histogram and seven stats compete for attention. | Add a "Simple / Detailed" view toggle (persisted): Simple shows Company, Verdict, Confidence, Risk, Action and hides patents, cost, criteria marks and the histogram. Default to Simple until the user switches. |
| G11 | P2 | **Undo can disappear.** One toast at a time: a "Run complete" toast replaces an Undo toast (`wb:1472-1487`). `U` still works but users may not know. | Never replace a toast that has Undo with one that does not; queue the second. Mention `U` in the decision hint. |
| G12 | P2 | **Confirming needs no reason.** Defensible decisions often need one, but only overturning a Clear verdict requires a note. | Keep it optional, but prompt "Add a note (optional)" visibly under Confirm for Escalate and Contested rows; report the share of decisions with notes (metric M6). Decide via Q3. |
| G13 | P2 | **Shortcut discoverability for mouse users is fine, but `C` on a Clear row and `S` on a complete run answer with a toast.** Non-technical users rarely press keys; analysts learn quickly. | Keep. Add a one-line "Tip: press ? for shortcuts" to the empty panel only (already present, `wb:1179`). Low priority. |
| G14 | P3 | **No dark mode tokens.** | Add a dark token set guarded by `prefers-color-scheme`; check pill contrast. |
| G15 | P3 | **"?" for unknown cost** is cryptic in the table (`wb:1139`). | Show "n/a" with the same tooltip. |
| G16 | P3 | **Search placeholder says "sector"; the mapping says "Domain / industry".** | Use "Sector" consistently in UI and mapping. |
| G17 | P3 | **No pre-download summary.** The download toast reports what was saved after the fact. | Show "4 still need review" on the Download button (badge) so users know before exporting. |
| G18 | P3 | **Run ids as names.** Runs are identified by file name plus a mono id. Two runs on the same file look alike. | Allow an optional run name at setup (default: file name + date). |

**Top five, in order:** G1 plain-language layer and glossary; G3 "Start reviewing" banner as the entry to the queue; G4 + G6 "what to do" in every flag box and plain failure messages; G8 one vocabulary across UI, workbook and docs; G2 first-run onboarding with a sample file.

---

## 11. Success metrics and open questions

### 11.1 Metrics

Measured locally (the app is single-user; collect only counts and durations in the run folder, never company data).

| ID | Metric | Target (initial) |
|---|---|---|
| M1 | Time from opening setup to Start, first-time user | < 2 min (< 30 s for a repeat run with Same settings) |
| M2 | Time to first verdict on screen after Start (sequential) | < 30 s |
| M3 | Share of the Needs-review queue cleared before the first export | ≥ 90% |
| M4 | Median time per review decision | Escalate/Contested < 2 min; Uncertain < 1 min |
| M5 | Reclassification rate, overall and on Clear rows | Track; a Clear-row rate above ~5% suggests the threshold or prompts need recalibration |
| M6 | Share of decisions with a note (flagged rows) | ≥ 50% on Escalate/Contested |
| M7 | Undo rate | < 5% of decisions (higher suggests mis-clicks or unclear controls) |
| M8 | Estimate accuracy: actual cost ÷ estimate | Within 0.5–2× (plan Task 16) |
| M9 | Runs ending Failed; share resumed successfully | Failed < 5%; ≥ 90% of stopped/interrupted runs resumed to complete |
| M10 | Usability test: a programme manager explains one Escalate decision using only the panel | 4 of 5 participants succeed |

### 11.2 Open questions

| ID | Question |
|---|---|
| Q1 | Which confidence tier scale is canonical: six words (UI, `PROJECT_OVERVIEW.md` §7) or High/Medium/Low (workbook, plan Task 1)? |
| Q2 | Which new-run direction is chosen ("One drop", "Guided", "In the table")? Section 4b is the acceptance list. |
| Q3 | Should confirming an Escalate or Contested row require a note, for defensibility? |
| Q4 | Does the server re-read `.env` when the setup reopens, so "Add KEY to .env and reopen this panel" works without restarting `serve.py`? |
| Q5 | Should the UI state that it is local and single-user (no login), and warn if opened from another machine? |
| Q6 | Should the "Not checked" display (G7) also go into the workbook, or stay screen-only? |
| Q7 | Should the undo stack survive a reload (from server history), or is Restore enough? |
| Q8 | Are CLI runs ever listed (plan Open decision 6)? If not, the empty state should say runs from the command line are not shown. |
| Q9 | Is there a limit on concurrent runs (plan Open decision 1)? If several run at once, the rail and progress announcements need to say which. |
