# Workbench Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Workbench prototype into a working local web app that starts, watches, stops and resumes real classification runs, lets a reviewer confirm or reclassify verdicts, and exports the Excel workbook with those decisions in it.

**Architecture:** A small FastAPI server (`serve.py`, bound to 127.0.0.1) serves a no-build vanilla-JS frontend from `web/` and a JSON API. Each run lives in its own folder `runs/<run_id>/` and is executed by launching the existing `classify.py` as a subprocess with that folder as its working directory, so the pipeline's cwd-relative `checkpoints/` and `logs/` are isolated per run and Stop is a process kill (every company is already checkpointed with fsync). The server reads the pipeline's checkpoint file read-only to build rows, reads a new `progress.jsonl` for per-row steps, and the browser polls for changes once a second while a run is active.

**Tech Stack:** Python 3.11, FastAPI + uvicorn + python-multipart (new), httpx (tests only), existing pandas/openpyxl pipeline; frontend is plain ES modules and CSS, no bundler, with one vendored library (NumberFlow, for animated counters); tests are `unittest` (project convention) and `node --test` (Node 22) for pure frontend logic.

**Spec:** `prototypes/frontend/index.html` loading `prototypes/frontend/variants/workbench.js` and `prototypes/frontend/data.js`. `index.html` wires in only the Workbench variant; `board.js`, `grid.js`, `guided.js`, `queue.js` and `split.js` are not loaded and are out of scope. Line references below (`workbench.js:NNN`) are to the prototype as it stands today.

## Global Constraints

- The CLI keeps working exactly as today: `python classify.py --input … [--resume]` must behave the same with no web server involved. Pipeline changes are additive and off by default.
- One model per run, never changed on resume (existing rule). The UI never offers to change settings of an existing run; "Same settings…" opens a new run.
- Risk flag, action and confidence tier have one implementation shared by the Excel writer and the web app (Task 1). Thresholds: tier High ≥ 75, Medium ≥ 50; Uncertain = validator triggered and confidence < 70.
- Server binds to `127.0.0.1` only, default port `8765`. No authentication. API keys stay in `.env` and are never sent to the browser; the browser only learns whether each key is set.
- New runtime folders `runs/` and `uploads/`, and the test output folder `tests/webapp/out/`, are git-ignored.
- No model names outside `pipeline/models.py`, `config.template.json`, tests and docs (existing rule from `NEXT_STEPS.md`). The frontend gets model IDs from `GET /api/setup`.
- Visual design, copy, keyboard shortcuts and layout are taken from the prototype unchanged, except the four deviations listed under "Deviations from the prototype".
- Tests: `python -m unittest discover tests` and `node --test web/tests/` both pass at the end of every task.
- Third-party frontend code: only NumberFlow, vendored as one committed file under `web/vendor/` at a pinned version. The app never loads code from a CDN at runtime; it is a local tool and must work offline. Every screen must still work if the vendored file fails to load (counters fall back to plain text).
- Tables stay fast at 5,000 rows: the results table and the setup table render at most a window of rows (Task 12, "Long tables"), never the whole run at once.
- Commit after every task. Commit messages follow the repo's existing sentence style ("Add …", "Record …").

## Deviations from the prototype

The prototype simulates things the real app has to do differently. These are decided here so tasks don't have to guess.

1. **No "summary" runs.** The prototype's `kind: 'summary'` runs ("rows were not kept in this workspace", `archiveHtml`, `runDetailHtml`, `buildSummaryOps`) are not built. Every run the app lists has its rows. Runs started from the CLI are not listed.
2. **"Use sample file" becomes "Choose file…".** The drop zone uploads the real file; the button opens a file picker.
3. **Two statuses the prototype lacks.** `interrupted` (the server restarted or the pipeline process died while running) behaves like `stopped`. `failed` (the pipeline exited with a fatal error such as a bad key or a resume mismatch) shows the status pill "Failed", the pipeline's `[FATAL]` message in the `wb-notice` block, and a Resume button.
4. **Error rows.** A company whose `classification` is `error` shows "Error" in the verdict cell, `—` for confidence, criteria and risk, action "Needs Review", and cannot be decided. It is counted in a new `errors` count (shown as a sub-line under "Processed": `N errors · retried on resume`), not in deep/general. Resume is offered on a complete run that has error rows.

## Review Focus

Each line names the task whose tests pin it.

1. Reading the checkpoint while the pipeline is appending to it: a torn last line must be skipped, never raised, and the server must never rewrite the file (`orchestrator._load_jsonl` rewrites on a torn line, so the server must not call it). → Task 5.
2. Uploaded filenames such as `..\..\evil.xlsx`, names with spaces or non-ASCII characters, a 0-row file, a file with duplicate or blank headers, and a non-spreadsheet renamed to `.xlsx`: saved under a safe name inside `uploads/`, rejected with a 400 and a readable message where unreadable. → Task 4.
3. A pipeline that fails before processing any company (missing API key, model startup check fails): the run shows `failed` with the message, not an eternal "Running". → Task 8.
4. Decisions arriving for a row that has no result yet, an error row, or an index out of range; a "change" on a Clear row with an empty or whitespace-only note. → Task 6.
5. Company names, descriptions, validator summaries and reviewer notes containing `<script>`, quotes or `&`: rendered as text everywhere, including `title` attributes and the command menu. → Task 11 (`esc`) and Task 13.

## File Structure

```
serve.py                       entry point: parse --port, start uvicorn
pipeline/review.py             risk_flag / action_required / confidence_tier (moved out of writer)
pipeline/progress.py           emit(): append per-row step events to $DTC_PROGRESS_FILE
webapp/__init__.py
webapp/settings_map.py         UI settings <-> pipeline config; setup info (providers, keys, defaults)
webapp/files.py                save + inspect an uploaded spreadsheet
webapp/run_store.py            runs/<id>/ layout, meta.json, read-only checkpoint + progress readers
webapp/rows.py                 pipeline result -> row JSON the frontend renders
webapp/decisions.py            reviewer history per row, rules, undo
webapp/runner.py               start / stop / resume the classify.py subprocess, reconcile status
webapp/estimate.py             pre-run cost and duration estimate
webapp/app.py                  FastAPI app factory and routes
web/index.html                 shell markup (prototype render())
web/styles.css                 tokens from prototype index.html + CSS from workbench.js
web/js/model.js                pure logic: rowView, counts, computeIds, formProblem, formatters
web/js/api.js                  fetch wrappers
web/js/state.js                the S store, run cache, polling
web/js/render/*.js             rail, head, strip, chips, table, detail, setup, analyst sheet, modal, toast
web/js/events.js               click / input / change / key handlers
web/js/main.js                 boot
web/js/render/counter.js       counterHtml / setCounter: NumberFlow with a plain-text fallback
web/vendor/number-flow/        number-flow.js (single ESM file), LICENSE, VERSION, README.md (how it was built)
web/tests/model.test.js        node --test
tests/webapp/                  unittest modules + fake_classify.py
```

Run folder layout (created by `run_store`, written to by the subprocess):

```
runs/run_20261113_142233/
  meta.json            {id, file, rows, createdAt, endedAt, status, error, settings, model, pid}
  config.json          pipeline config for this run (absolute epo_package_dir)
  input/<file>         copy of the uploaded file
  decisions.json       {"<index>": [history entries]}
  progress.jsonl       step events from pipeline/progress.py
  process.log          subprocess stdout + stderr
  checkpoints/         written by the pipeline (run_state.json, llm/*.jsonl)
  logs/                written by the pipeline
  output/              written by the pipeline
```

## Shared contracts

These shapes are used across tasks. Field names are final.

**Settings** (browser ⇄ server; the prototype's `cfg`):

```json
{"provider": "anthropic", "tier": "fast", "model": "",
 "enrichment": true, "epo": true, "validator": true, "batch": true,
 "validatorThreshold": 70, "overrideMinConfidence": 65, "epoAdjustMax": 15,
 "lowEvidenceCap": 60, "maxWebSearches": 3, "enrichmentMaxSearches": 2,
 "mapping": {"company_name": "Company", "description": "About", "domain": "Sector", "uen": "UEN"}}
```

Bounds (from `THRESHOLDS`, `workbench.js:533`): the four confidence values 0–100, `epoAdjustMax` 0–30, both search counts 0–10. Out-of-range numbers are clamped; a non-number falls back to the default.

**Run** (`RunSummary`):

```json
{"id": "run_20261113_142233", "file": "sg_startups_q4.xlsx", "total": 20,
 "createdAt": "2026-11-13T14:22:33", "status": "running|stopped|interrupted|failed|complete",
 "error": "", "model": "claude-haiku-5-5", "batch": true, "phase": "Gather company data · Enrichment — Lumora",
 "settings": { ...Settings }, "counts": {"done": 12, "deep": 4, "general": 7, "errors": 1, "open": 2}}
```

**Row:**

```json
{"index": 0, "name": "", "uen": "", "domain": "", "description": "",
 "step": null,
 "result": null,
 "history": []}
```

`step` is the latest progress step for a row without a result, one of `Enrichment`, `Patent lookup`, `Classification`, `Confidence scoring`, `Validation`, `Waiting for batch`, `In batch job`, `Validation queued`, or `null` (queued). `result`, when present:

```json
{"error": false, "errorMessage": "",
 "verdict": "deep tech", "conf": 58, "risk": "Escalate", "tier": "Medium",
 "llm": 61, "adj": 3, "pre": 64, "capped": false,
 "validated": true, "override": "",
 "val": {"verdict": "insufficient_evidence", "decision": "ESCALATE_FOR_HUMAN_REVIEW",
         "confidence": 58, "summary": "", "sources": [], "escalationReason": ""},
 "patents": {"count": 1, "level": "Moderate", "domain": "", "status": "success", "cpc": [{"code": "G01N21/95", "desc": ""}]},
 "basis": "COMBINED", "reasoning": "",
 "criteria": {"innovation": {"met": true, "reasoning": ""}, "scientific_foundation": {}, "proprietary_ip": {}},
 "hasInputDesc": true, "hasWeb": true, "webDescription": "", "webSource": "", "webStatus": "found",
 "cost": 0.052, "timeS": 38.2, "model": ""}
```

`override` is `""`, `"applied"` or `"blocked"`. `val` is `null` when the validator did not run. `patents.status` is `success`, `no_results`, `error` or `disabled`. `cost` is `null` when the model has no listed price.

**History entry:** `{"type": "confirm|change|restore", "verdict": "deep tech", "note": "", "at": "2026-11-13T14:40:02"}`. The current decision of a row is its last history entry unless that entry is a `restore` (then there is none).

---

## Part A — Backend

### Task 1: One implementation of risk, action and tier

**Files:**
- Create: `pipeline/review.py`
- Modify: `data/writer.py:232-267` (`_build_management_row` calls the new functions)
- Test: `tests/test_review.py`
- Also commit: `prototypes/frontend/index.html`, `data.js`, `variants/workbench.js` (the spec; currently untracked), and add `runs/` and `uploads/` to `.gitignore`

**Interfaces:**
- Produces: `confidence_tier(confidence: int) -> str`, `risk_flag(result: dict) -> str`, `action_required(verdict: str, risk: str) -> str` in `pipeline.review`.

- [ ] **Step 1: Write the failing tests**

```python
class ReviewRulesTest(unittest.TestCase):
    def test_tier_boundaries(self):
        self.assertEqual([confidence_tier(c) for c in (75, 74, 50, 49)], ["High", "Medium", "Medium", "Low"])

    def test_risk_priority(self):
        self.assertEqual(risk_flag({"validation_decision": "ESCALATE_FOR_HUMAN_REVIEW", "classification_disputed": True}), "Escalate")
        self.assertEqual(risk_flag({"classification_disputed": True, "validator_triggered": True, "confidence": 40}), "Contested")
        self.assertEqual(risk_flag({"validator_triggered": True, "confidence": 69}), "Uncertain")
        self.assertEqual(risk_flag({"validator_triggered": True, "confidence": 70}), "Clear")
        self.assertEqual(risk_flag({"confidence": 10}), "Clear")

    def test_action(self):
        self.assertEqual(action_required("deep tech", "Clear"), "Approve")
        self.assertEqual(action_required("general tech", "Clear"), "Reject")
        self.assertEqual(action_required("deep tech", "Uncertain"), "Needs Review")
        self.assertEqual(action_required("error", "Clear"), "Needs Review")
```

- [ ] **Step 2: Run** `python -m unittest tests.test_review -v` — expected: import error.
- [ ] **Step 3: Implement the three functions** by moving the logic from `_build_management_row`, then replace that inline logic with calls. No behaviour change.
- [ ] **Step 4: Run** `python -m unittest discover tests` — expected: all pass, including the existing writer tests in `tests/test_fixes.py`.
- [ ] **Step 5: Commit** — "Move risk, action and tier rules into pipeline/review.py".

### Task 2: Progress events from the pipeline

**Files:**
- Create: `pipeline/progress.py`
- Modify: `pipeline/orchestrator.py` (`_gather_one`, `_phase1_gather`, the batch submit/poll block, `_finalize_one`, both per-company loops)
- Test: `tests/test_progress.py`

**Interfaces:**
- Produces: `progress.emit(kind: str, index: int | None = None, step: str | None = None, phase: str | None = None) -> None`. No-op unless the environment variable `DTC_PROGRESS_FILE` is set; otherwise appends one JSON line `{"kind", "index", "step", "phase", "at"}` and flushes. Never raises (a failed write is logged at debug level).
- `kind` values: `"step"` (a row entered a step), `"phase"` (run-level text only).

Where to emit (index is the row position `i` the loops already have; add an optional `index: Optional[int] = None` keyword to `_gather_one` and `_finalize_one`, and to `_process_one_sequential`, passing it through):

| Place | Emit |
|---|---|
| `_gather_one`, before `agent0_enrich` when enrichment is on | `step` `Enrichment` |
| `_gather_one`, before `run_epo_lookup` when EPO runs | `step` `Patent lookup` |
| `_phase1_gather`, after a row is appended | `step` `Waiting for batch` |
| batch submitted, and each poll | `phase` `Classify in one batch job · N companies submitted`; on submit also `step` `In batch job` for every index |
| `_process_one_sequential`, before `_classify_online` | `step` `Classification` |
| `_finalize_one`, on entry | `step` `Confidence scoring` |
| `_finalize_one`, before `agent2_validate` | `step` `Validation` |

- [ ] **Step 1: Write the failing tests**

```python
def test_emit_is_silent_without_env(self):          # no file created, no exception
def test_emit_appends_one_json_line_per_call(self): # two emits -> two parseable lines with kind/index/step
def test_emit_never_raises_on_unwritable_path(self): # DTC_PROGRESS_FILE points into a missing drive/dir
def test_sequential_run_emits_steps_in_order(self):
    # run _process_one_sequential with agent0_enrich, run_epo_lookup, agent1_classify and
    # agent2_validate patched (same patching style as tests/test_resume.py), index=3,
    # validator forced to trigger; assert the step sequence for index 3 is
    # ["Enrichment", "Patent lookup", "Classification", "Confidence scoring", "Validation"]
```

- [ ] **Step 2: Run** `python -m unittest tests.test_progress -v` — expected: fail.
- [ ] **Step 3: Implement `pipeline/progress.py` and add the emit calls from the table.**
- [ ] **Step 4: Run** `python -m unittest discover tests` — expected: all pass (existing resume tests prove the default-off path is unchanged).
- [ ] **Step 5: Commit** — "Emit per-company progress events when DTC_PROGRESS_FILE is set".

### Task 3: Settings mapping and setup info

**Files:**
- Create: `webapp/__init__.py`, `webapp/settings_map.py`
- Modify: `requirements.txt` (add `fastapi>=0.110`, `uvicorn>=0.29`, `python-multipart>=0.0.9`, `httpx>=0.27`)
- Test: `tests/webapp/__init__.py`, `tests/webapp/test_settings_map.py`

**Interfaces:**
- Produces:
  - `DEFAULT_SETTINGS: dict` — built from `config.template.json` values, in the Settings shape with an empty mapping.
  - `clean_settings(raw: dict) -> dict` — fills missing keys from defaults, clamps numbers to the bounds above, strips `model`, raises `ValueError` for an unknown provider or tier.
  - `to_pipeline_config(settings: dict, base: dict, project_root: Path) -> dict` — deep-copies `base` (the loaded `config.json`, or the template if absent) and sets: `llm.provider`, `llm.tier`, `llm.model` (`None` when blank), `enrichment.enabled`, `enrichment.max_searches`, `epo.enabled`, `epo.epo_package_dir` (made absolute against `project_root`), `validation.validator_enabled`, `validation.validator_threshold`, `validation.override_min_confidence`, `validation.max_web_searches`, `confidence.epo_adjust_max`, `confidence.low_evidence_cap`, `batch.enabled`, and `pipeline.{company_name,description,domain,uen}_column` from the mapping. An unmapped optional column is written as `""` (the reader then finds no such header and yields an empty value).
  - `setup_info(env: Mapping[str, str]) -> dict` — `{"providers": [{"id", "label", "keyVar", "keySet", "batch", "tiers": {"fast": "<model id>", ...}}], "epoKeysSet": bool, "defaults": DEFAULT_SETTINGS, "pricedModels": [...]}`. Tier model IDs are the first candidate per tier from `pipeline/models.py`; `batch` is true only for `anthropic`; `epoKeysSet` needs both `EPO_KEY` and `EPO_SECRET`; `pricedModels` is `sorted(models.COST_RATES)`.

- [ ] **Step 1: Write the failing tests**

```python
def test_defaults_match_template(self):       # validatorThreshold 70, overrideMinConfidence 65, epoAdjustMax 15, lowEvidenceCap 60, maxWebSearches 3, enrichmentMaxSearches 2, tier "fast"
def test_clean_clamps_and_defaults(self):     # {"epoAdjustMax": 99, "validatorThreshold": -5, "maxWebSearches": "x"} -> 30, 0, 3
def test_clean_rejects_unknown_provider(self) # ValueError
def test_blank_model_becomes_none(self):      # to_pipeline_config(... model "  ")["llm"]["model"] is None
def test_mapping_written_to_columns(self):    # company_name "Company" -> pipeline.company_name_column == "Company"; unmapped uen -> ""
def test_epo_dir_is_absolute(self)
def test_base_config_not_mutated(self)
def test_setup_reports_key_presence_not_values(self):
    info = setup_info({"ANTHROPIC_API_KEY": "sk-secret"})
    self.assertNotIn("sk-secret", json.dumps(info))
    # anthropic keySet True, gemini and openai False, epoKeysSet False
```

- [ ] **Step 2: Run** `python -m unittest tests.webapp.test_settings_map -v` — expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command — expected: pass. Then `pip install -r requirements.txt`.
- [ ] **Step 5: Commit** — "Add the web app's settings mapping and setup info".

### Task 4: Upload and inspect an input file

**Files:**
- Create: `webapp/files.py`
- Test: `tests/webapp/test_files.py`

**Interfaces:**
- Produces:
  - `save_upload(uploads_dir: Path, filename: str, data: bytes) -> dict` — stores the file as `uploads/<file_id>/<safe name>` where `file_id` is `uuid4().hex` and the safe name is the basename with path separators and control characters removed (falls back to `input<ext>`); allowed extensions `.xlsx`, `.xls`, `.csv`; maximum size 20 MB; returns `inspect(...)`.
  - `inspect(path: Path) -> dict` — `{"fileId", "name", "rows", "headers", "mapping", "preview", "emptyCounts"}`. `rows` is the data-row count; `preview` is the first 4 rows as `{header: string}`; `table` is every data row as a list of strings in `headers` order (cells longer than 300 characters are cut to 300, blanks are `""`), which the setup table renders before the run starts; `emptyCounts[header]` is the number of rows where that column is blank (the UI shows it as "skipped (empty name)" for whichever column is mapped to the company name).
  - `detect_mapping(headers: list[str]) -> dict` — case-insensitive match, first hit wins, against: `company_name`: `company_name`, `company name`, `company`, `name`; `description`: `description`, `about`, `desc`, `summary`; `domain`: `domain`, `sector`, `industry`; `uen`: `uen`. No match → key absent.
  - `resolve(uploads_dir: Path, file_id: str) -> Path` — raises `FileNotFoundError` unless `file_id` is 32 hex characters and the folder holds exactly one file.
  - `UploadError(ValueError)` for every rejection, with a message fit to show the user.

- [ ] **Step 1: Write the failing tests**

```python
def test_detects_prototype_sample_mapping(self):
    self.assertEqual(detect_mapping(["Company", "UEN", "About", "Sector", "location"]),
                     {"company_name": "Company", "description": "About", "domain": "Sector", "uen": "UEN"})
def test_inspect_counts_rows_preview_and_empties(self)   # 6-row xlsx with 1 blank name -> rows 6, len(preview) 4, len(table) 6, emptyCounts["Company"] == 1
def test_csv_supported(self)
def test_traversal_name_is_contained(self):              # filename "..\\..\\evil.xlsx" -> saved path is inside uploads_dir, name == "evil.xlsx"
def test_unicode_and_space_names_kept(self)              # "初创 公司 list.xlsx"
def test_rejects_wrong_extension(self)                   # "a.exe" -> UploadError
def test_rejects_unreadable_spreadsheet(self)            # text bytes named a.xlsx -> UploadError, message mentions the file could not be read
def test_rejects_header_only_file(self)                  # UploadError "no rows"
def test_rejects_oversize(self)
def test_blank_and_duplicate_headers_survive(self)       # headers come back as pandas names them; no exception
def test_resolve_rejects_bad_id(self)                    # "../x" -> FileNotFoundError
```

- [ ] **Step 2: Run** `python -m unittest tests.webapp.test_files -v` — expected: fail.
- [ ] **Step 3: Implement**, reading with the same pandas calls as `data/reader.py` (`dtype=str`).
- [ ] **Step 4: Run** — expected: pass.
- [ ] **Step 5: Commit** — "Add upload inspection with column detection".

### Task 5: Run store and row view

**Files:**
- Create: `webapp/run_store.py`, `webapp/rows.py`
- Test: `tests/webapp/test_run_store.py`, `tests/webapp/test_rows.py`

**Interfaces:**
- Consumes: `to_pipeline_config` (Task 3), `pipeline.review` (Task 1), `data.reader.read_companies`.
- Produces in `run_store`:
  - `RunStore(root: Path, project_root: Path)` with `create(source_file: Path, settings: dict, base_config: dict) -> dict` (creates the folder layout above, copies the input, writes `config.json` and `meta.json` with status `"running"`; id is `run_%Y%m%d_%H%M%S`, with `_2`, `_3`… appended on collision), `get_meta(run_id) -> dict`, `update_meta(run_id, **fields) -> dict` (atomic: write temp file then `os.replace`), `list_runs() -> list[dict]` newest first, `run_dir(run_id) -> Path` (raises `KeyError` unless the id matches `^run_[0-9_]+$` and the folder exists).
  - `companies(run_id) -> list[dict]` — `read_companies` on the run's input with the run's config; cached per run.
  - `read_results(run_id) -> tuple[dict[int, dict], int]` — `{index: result}` (last write wins, **error rows kept**) and the count of lines consumed, read from `checkpoints/llm/llm_progress_<pipeline run id>.jsonl`, where the pipeline run id comes from `checkpoints/run_state.json`. Missing files → `({}, 0)`. An unparsable line is skipped. Opens read-only; never writes.
  - `read_progress(run_id) -> tuple[dict[int, str], str]` — latest step per index and the latest phase text from `progress.jsonl`; same tolerance.
  - `model_info(run_id) -> dict` — the `model` object from `run_state.json`, or `{}`.
- Produces in `rows`:
  - `to_row(index: int, company: dict, result: dict | None, step: str | None, history: list, config: dict) -> dict` in the Row shape.
  - `counts(rows: list[dict]) -> dict` — `done`, `deep`, `general`, `errors`, `open`; verdicts and `open` take the current decision into account (a flagged row with a decision is not open; a reclassified row counts under its new verdict).

Field derivation in `to_row` (`r` is the pipeline result):

| Row field | Source |
|---|---|
| `error`, `errorMessage` | `r["classification"] == "error"`; `r.get("processing_errors") or r.get("reasoning")` |
| `verdict`, `conf`, `reasoning`, `criteria`, `basis` | `classification`, `confidence`, `reasoning`, `criteria`, `classification_basis` |
| `risk`, `tier` | `review.risk_flag(r)`, `review.confidence_tier(conf)` |
| `llm`, `adj` | `signal_score_llm`, `signal_score_epo` |
| `pre` | `conf - signal_score_validator` |
| `capped` | no usable description, `patent_count == 0`, and `llm + adj > confidence.low_evidence_cap` |
| `validated` | `validator_triggered` |
| `override` | `"blocked"` if `classification_disputed`; `"applied"` if `validator_verdict == "override"` and not disputed; else `""` |
| `val` | `None` unless validated; `verdict`=`validator_verdict`, `decision`=`validation_decision`, `confidence`=`validator_updated_confidence`, `summary`=`web_evidence_summary`, `sources`=`sources_checked`, `escalationReason`=`escalation_reason` |
| `patents.status` | `"disabled"` if `epo_validation_status` is `EPO Disabled` or `Not Run`; `"success"` if `patent_count > 0`; `"error"` if the status contains `Error`; else `"no_results"` |
| `patents.cpc` | each code in `cpc_codes` with `desc` looked up in `lib/epo_patent/config/cpc_descriptions.json` (exact code, then the part before `/`), `""` if absent; at most 12 |
| `patents.level`, `.domain`, `.count` | `epo_deeptech_level`, `epo_primary_domain` (`"N/A"` → `""`), `patent_count` |
| `hasInputDesc`, `hasWeb`, `webDescription`, `webSource`, `webStatus` | company `description` non-empty; `web_description` non-empty; `web_description`, `web_description_source`, `web_fetch_status` |
| `cost`, `timeS`, `model` | `total_cost_usd` (may be `None`), `processing_time_s`, `model` |

- [ ] **Step 1: Write the failing tests** — `test_run_store.py`:

```python
def test_create_lays_out_folder_and_meta(self)          # input copied, config.json has absolute epo dir and mapped columns, meta status "running"
def test_id_collision_gets_suffix(self)
def test_run_dir_rejects_traversal(self)                # run_dir("../x") -> KeyError
def test_read_results_empty_before_pipeline_writes(self)# ({}, 0)
def test_read_results_last_write_wins_and_keeps_errors(self)
def test_torn_last_line_is_skipped_and_file_untouched(self):
    # append '{"index": 2, "resu' to the checkpoint; read_results returns rows 0 and 1;
    # file bytes are identical before and after the call
def test_read_progress_latest_step_per_index(self)
def test_update_meta_is_atomic_replace(self)            # no partial file left when json.dump is patched to raise
```

`test_rows.py`, using result dicts built from `orchestrator._error_result("X")` and a hand-written success result:

```python
def test_pending_row_has_no_result_and_carries_step(self)
def test_escalated_row(self)          # risk "Escalate", validated True, val["decision"] == "ESCALATE_FOR_HUMAN_REVIEW"
def test_override_blocked_and_applied(self)
def test_pre_is_confidence_minus_validator_delta(self)  # confidence 55, signal_score_validator -11 -> pre 66
def test_capped_only_without_description_and_patents(self)
def test_epo_disabled_maps_to_disabled(self)
def test_unknown_cost_stays_none(self)
def test_error_row(self)              # error True, counts()["errors"] == 1, not in deep/general, not open
def test_counts_follow_decisions(self)# flagged row with a "change" history entry: open 0, counted under the new verdict
```

- [ ] **Step 2: Run** `python -m unittest tests.webapp.test_run_store tests.webapp.test_rows -v` — expected: fail.
- [ ] **Step 3: Implement both modules.**
- [ ] **Step 4: Run** — expected: pass.
- [ ] **Step 5: Commit** — "Add the run store and the row view".

### Task 6: Reviewer decisions

**Files:**
- Create: `webapp/decisions.py`
- Test: `tests/webapp/test_decisions.py`

**Interfaces:**
- Produces:
  - `load(run_dir: Path) -> dict[int, list[dict]]`
  - `record(run_dir, index: int, choice: str, note: str, row: dict, now: datetime) -> list[dict]` — `choice` is `"confirm"` or `"change"`; the verdict stored is the pipeline verdict for confirm and the other verdict for change; returns the row's new history.
  - `restore(run_dir, index, row, now) -> list[dict]` — appends a `restore` entry; only valid when the row has a current decision.
  - `undo(run_dir, index) -> list[dict]` — removes the row's last history entry.
  - `current(history: list[dict]) -> dict | None`
  - `DecisionError(ValueError)` with `.status` 404 (index out of range) or 409 (everything else).
- Rules (from `formProblem`, `workbench.js:1205`): a row with no result or an error result cannot be decided; `"change"` on a row whose pipeline risk is `Clear` needs a non-blank note (message: `A note is required to overturn a Clear verdict. It is written to the workbook.`); notes are trimmed and capped at 2000 characters; an unknown `choice` is rejected. `decisions.json` is written atomically.

- [ ] **Step 1: Write the failing tests**

```python
def test_confirm_flagged_row(self)                 # history [{"type": "confirm", "verdict": "deep tech", ...}]
def test_change_flips_verdict(self)
def test_change_on_clear_requires_note(self)       # "" and "   " -> DecisionError 409 with the exact message
def test_change_on_flagged_needs_no_note(self)
def test_pending_and_error_rows_rejected(self)     # 409
def test_restore_requires_a_decision(self)         # 409 on a row with empty history
def test_current_is_none_after_restore(self)
def test_undo_pops_last_entry_and_revives_previous(self)  # confirm, change, undo -> current is the confirm
def test_undo_on_empty_history_rejected(self)
def test_survives_reload(self)                     # load() after record() returns the same history
```

- [ ] **Step 2: Run** `python -m unittest tests.webapp.test_decisions -v` — expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — expected: pass.
- [ ] **Step 5: Commit** — "Add reviewer decisions with history and undo".

### Task 7: Reviewer decisions in the workbook

**Files:**
- Modify: `data/writer.py` (`write_results`, `write_incremental`, `_build_flat_rows`, `_build_management_row`, `_write_management_sheet`, `_write_overview_sheet`, `_write_legend_sheet`)
- Test: `tests/test_writer_decisions.py`

**Interfaces:**
- Produces: `write_results(output_path, companies, results, run_stats, decisions=None)` and `write_incremental(output_path, all_companies, all_results, decisions=None)`. `decisions` is `{position in the companies list: {"verdict", "note", "at", "reclassified": bool}}`. With `decisions=None` the output is byte-for-byte what it is today (same sheets, same columns).
- When `decisions` is given (even if empty):
  - Management View gains four columns after "Action Required": `Final Verdict`, `Reviewer Decision` (`Confirmed`, `Reclassified` or blank), `Reviewer Note`, `Reviewed At`. `Action Required` becomes `Approve`/`Reject` from the final verdict for decided rows. `Verdict` stays the pipeline verdict.
  - Full Detail gains `reviewer_decision`, `reviewer_verdict`, `reviewer_note`, `reviewed_at` at the end.
  - Overview gains a "Review" group: `Verdicts Confirmed`, `Reclassified`, `Still Need Review`.
  - Legend gains one row each for `Final Verdict` and `Reviewer Decision`.

- [ ] **Step 1: Write the failing tests** (load the written workbook with openpyxl)

```python
def test_no_decisions_argument_leaves_columns_unchanged(self)   # header row of both sheets equals MANAGEMENT_COLUMNS / today's detail columns
def test_reclassified_row(self)        # Verdict "general tech", Final Verdict "deep tech", Reviewer Decision "Reclassified", note present, Action Required "Approve"
def test_confirmed_flagged_row(self)   # Risk Flag "Escalate", Action Required "Approve", Reviewer Decision "Confirmed"
def test_decisions_follow_rows_through_the_sort(self)  # Management View is sorted; the note lands on the right company
def test_overview_review_counts(self)
def test_incremental_write_carries_decisions(self)
```

- [ ] **Step 2: Run** `python -m unittest tests.test_writer_decisions -v` — expected: fail.
- [ ] **Step 3: Implement.** Attach each decision to its management row before the sort.
- [ ] **Step 4: Run** `python -m unittest discover tests` — expected: all pass.
- [ ] **Step 5: Commit** — "Write reviewer decisions to the workbook".

### Task 8: Runner

**Files:**
- Create: `webapp/runner.py`, `tests/webapp/fake_classify.py`
- Test: `tests/webapp/test_runner.py`

**Interfaces:**
- Consumes: `RunStore` (Task 5).
- Produces: `Runner(store: RunStore, project_root: Path, command: list[str] | None = None)` with:
  - `start(run_id) -> None` and `resume(run_id) -> None` — launch `command` (default `[sys.executable, "<project_root>/classify.py"]`) plus `--input <run>/input/<file> --output <run>/output --config <run>/config.json --env <project_root>/.env`, and `--resume` for resume; `cwd` is the run folder; environment adds `DTC_PROGRESS_FILE=<run>/progress.jsonl` and `PYTHONIOENCODING=utf-8`; stdout and stderr append to `process.log`. Sets meta `status="running"`, `error=""`, `pid`. `resume` is allowed from `stopped`, `interrupted`, `failed`, and from `complete` when the run has error rows; otherwise raises `RunnerError` (409). Starting a run that is already live raises `RunnerError`.
  - `stop(run_id) -> None` — terminates the process, waits up to 10 s, sets `status="stopped"`. Not running → `RunnerError`.
  - `poll() -> None` — for every tracked process that has exited: exit code 0 → `complete` with `endedAt`; stopped by us → `stopped`; anything else → `failed` with `error` set to the last `process.log` line containing `[FATAL]` (text after the marker), else the last non-empty line, else `The pipeline exited with code N.`
  - `reconcile() -> None` — called once at server start: every run whose meta says `running` but that this Runner is not tracking becomes `interrupted`.
  - `shutdown() -> None` — terminates all tracked processes and marks them `interrupted`.
- `tests/webapp/fake_classify.py` accepts the same arguments, reads the per-run `config.json` and the input with `read_companies`, and for each row not already in the checkpoint writes progress lines and appends a canned result to `checkpoints/llm/llm_progress_fake.jsonl` (with `checkpoints/run_state.json` naming run id `fake`), sleeping `FAKE_DELAY_S` (default `0.05`) per row. Verdict cycles deep/general; every 5th row is escalated, every 7th is an error row on the first pass only. `FAKE_FATAL=1` makes it print `[FATAL] Model problem: fake failure` to stderr and exit 1 before any row.

- [ ] **Step 1: Write the failing tests** (all use `command=[sys.executable, fake_classify_path]` and a 3–8 row xlsx)

```python
def test_run_completes_and_results_are_readable(self)   # poll until complete; read_results has every index
def test_stop_keeps_finished_rows_and_resume_finishes(self)  # FAKE_DELAY_S=0.3; stop after first result; status "stopped"; resume; complete; no row lost or duplicated
def test_fatal_before_first_row_marks_failed_with_message(self)  # status "failed", error == "Model problem: fake failure"
def test_resume_rejected_while_running_and_when_clean_complete(self)
def test_resume_allowed_on_complete_run_with_error_rows(self)
def test_reconcile_marks_orphans_interrupted(self)      # meta says running, fresh Runner -> interrupted
def test_progress_file_is_written_into_the_run_folder(self)
```

- [ ] **Step 2: Run** `python -m unittest tests.webapp.test_runner -v` — expected: fail.
- [ ] **Step 3: Implement the runner and the fake.** On Windows use `subprocess.Popen(..., creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)` and `terminate()`.
- [ ] **Step 4: Run** — expected: pass.
- [ ] **Step 5: Commit** — "Run the pipeline as a subprocess per run, with stop and resume".

### Task 9: Estimate

**Files:**
- Create: `webapp/estimate.py`
- Test: `tests/webapp/test_estimate.py`

**Interfaces:**
- Produces: `estimate(settings: dict, rows: int) -> dict` → `{"known": bool, "model": str, "batch": bool, "cost": float | None, "secs": float, "parts": {"classify": float, "enrich": float, "validate": float}}`. `model` is the pinned model or the tier's first candidate; `known` is `cost_known(get_cost_rates(model))`; `batch` is `settings["batch"] and provider == "anthropic"`; `parts` are USD per run; `cost` is their sum, `None` when not known.
- The token assumptions are module constants with a comment saying they are assumptions to be recalibrated from a real run's Full Detail token columns:

```python
CLASSIFIER_TOKENS = (3000, 600)        # input, output per company
ENRICH_TOKENS_PER_SEARCH = (4000, 300) # per company, per allowed search
VALIDATOR_TOKENS_PER_SEARCH = (5000, 400)
VALIDATED_SHARE_AT_70 = 0.25           # share of companies validated at threshold 70; scales linearly with the threshold, capped at 1.0
SECONDS_PER_COMPANY = {"sequential": 18, "batch": 6}
```

Classifier cost is multiplied by `BATCH_DISCOUNT` in batch mode. Enrichment and validation add `searches × rates["web_search"]`. Duration is `rows × SECONDS_PER_COMPANY[mode]`, × 0.75 with enrichment off, × 0.85 with validation off.

- [ ] **Step 1: Write the failing tests**

```python
def test_zero_rows_costs_nothing(self)
def test_batch_halves_only_the_classifier_part(self)
def test_enrichment_off_zeroes_its_part(self)
def test_higher_threshold_raises_validation_part(self)
def test_unpriced_pinned_model_is_unknown(self)   # model "my-finetune" -> known False, cost None, secs still a number
def test_batch_false_for_non_anthropic(self)
```

- [ ] **Step 2: Run** `python -m unittest tests.webapp.test_estimate -v` — expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — expected: pass.
- [ ] **Step 5: Commit** — "Add the pre-run cost and duration estimate".

### Task 10: HTTP API and entry point

**Files:**
- Create: `webapp/app.py`, `serve.py`
- Test: `tests/webapp/test_api.py`

**Interfaces:**
- Consumes: everything from Tasks 3–9.
- Produces: `create_app(project_root: Path, data_root: Path, runner_command: list[str] | None = None) -> FastAPI`. `data_root` holds `runs/` and `uploads/`. The app calls `runner.reconcile()` on startup and `runner.shutdown()` on shutdown, and calls `runner.poll()` at the top of every `/api/runs…` handler. `serve.py` accepts `--port` (default 8765), loads `.env`, honours `DTC_PIPELINE_CMD` (a JSON list) as `runner_command`, prints the URL and runs uvicorn on `127.0.0.1`.

| Method and path | Body → response |
|---|---|
| `GET /api/setup` | → `setup_info(os.environ)` |
| `POST /api/files` | multipart `file` → inspect dict; `UploadError` → 400 `{"detail": message}` |
| `POST /api/estimate` | `{"settings", "rows"}` → estimate dict |
| `GET /api/runs` | → `[RunSummary]`, newest first |
| `POST /api/runs` | `{"fileId", "settings", "exclude": [int]}` → 201 RunSummary. `exclude` lists 0-based data-row indexes the reviewer unticked in the setup table (optional, default `[]`); `RunStore.create` writes `input/<file>` without those rows (same format, same headers), so the pipeline, resume and `total` see only the ticked companies. 400 when the company-name mapping is missing or not a header of the file, the provider's key is not set (`<KEYVAR> is not set in .env`), an index is out of range, or every row is excluded (`Tick at least one company to start`) |
| `GET /api/runs/{id}` | → `{"run": RunSummary, "rows": [Row], "cursor": int}` |
| `GET /api/runs/{id}/changes?cursor=N` | → `{"run": RunSummary, "steps": {"<index>": step}, "rows": [Row whose result landed after N], "cursor": int}` |
| `POST /api/runs/{id}/stop`, `/resume` | → RunSummary; `RunnerError` → 409 |
| `PUT /api/runs/{id}/rows/{index}/decision` | `{"choice", "note"}` → Row |
| `POST /api/runs/{id}/rows/{index}/restore`, `/undo` | → Row; `DecisionError` → its status |
| `GET /api/runs/{id}/export.xlsx` | workbook download, filename `<input stem>_classified_<id without "run_">.xlsx`. Uses `write_results` when status is `complete`, else `write_incremental`, with decisions from Task 6; rows without a result are left out. 409 when no row has a result. |
| `GET /` and static files | `web/` |

Unknown run id → 404. `cursor` is the line count from `read_results`.

- [ ] **Step 1: Write the failing tests** with `fastapi.testclient.TestClient` and the fake pipeline

```python
def test_setup_has_three_providers_and_no_secrets(self)
def test_upload_then_start_then_poll_to_complete(self):
    # POST /api/files -> POST /api/runs -> loop GET changes until status complete;
    # every index appears exactly once across the rows returned by successive cursors
def test_start_rejects_missing_name_mapping_and_missing_key(self)  # 400 with the messages above
def test_stop_and_resume_roundtrip(self)
def test_decision_endpoints(self)        # confirm an escalated row -> row.history length 1, run.counts.open drops by 1; restore; undo
def test_change_on_clear_without_note_is_409(self)
def test_decision_on_pending_row_is_409_and_bad_index_404(self)
def test_export_contains_reviewer_columns(self)   # open the response bytes with openpyxl; "Final Verdict" in the Management View header
def test_export_partial_run(self)        # stopped run: workbook has only finished rows and no Overview sheet
def test_export_before_any_result_is_409(self)
def test_unknown_run_is_404(self)
def test_failed_run_reports_error(self)  # FAKE_FATAL=1 -> run.status "failed", run.error set
def test_index_page_served(self)         # GET / is 200 text/html (add web/index.html placeholder in this task)
```

- [ ] **Step 2: Run** `python -m unittest tests.webapp.test_api -v` — expected: fail.
- [ ] **Step 3: Implement `webapp/app.py`, `serve.py`, and a one-line `web/index.html` placeholder.**
- [ ] **Step 4: Run** `python -m unittest discover tests` — expected: all pass.
- [ ] **Step 5: Commit** — "Add the web API and serve.py".

Part A is complete and usable on its own here: the whole flow can be driven with `curl`.

---

## Part B — Frontend

The frontend is a port of `workbench.js` into modules, with the simulation removed. What goes away: `derive`, `estimate`, `buildOps`, `buildSummaryOps`, `startEngine` and the `engines` map, `MODEL_IDS`/`KNOWN_MODELS`, `loadSample`, `archiveHtml`, `runDetailHtml`, the picker harness in `index.html`. What replaces `C_BY_ID[id]` + `run.results[id]` is the Row object: company fields come from the row, result fields from `row.result`. Row ids in the DOM are the row index.

### Task 11: Shell, styles and the pure model

**Files:**
- Create: `web/index.html` (replace placeholder), `web/styles.css`, `web/js/model.js`, `web/tests/model.test.js`

**Interfaces:**
- Produces from `web/js/model.js` (ES module, no DOM access):
  - Formatters, copied in behaviour from `workbench.js:550-570`: `esc`, `clamp`, `pad`, `money`, `fmtDur`, `confWord`, `signed`, `flip`, `vLabel`, `vLow`, `actionFor`, `hhmm(date)`, `dateLabel(iso, now)` (`Today, 08:42` for today, otherwise `2 Nov 2026`).
  - `currentDecision(history)` — same rule as the server.
  - `rowView(row, total, decisionOverride?) -> {row, r, idx, dec, error, flagged, open, verdict, reclassified, confirmed, action}` — `workbench.js:690`, plus `error: true` rows: `flagged false`, `open false`, `action 'Needs Review'`, `verdict null`.
  - `counts(rows) -> {total, done, deep, general, errors, open, confirmed, reclassified, cost, costUnknown, avg, risk}` — `workbench.js:703`; error rows add to `done` and `errors` only.
  - `newFilters()`, `anyFilter(f)`, `computeIds(rows, {filters, sortKey, sortDir, running, snapshot}) -> number[]` — `workbench.js:863`, including the rule that priority sort falls back to input order while running, and that sorting uses the decision snapshot. Error rows sort after flagged rows and before clear rows in priority order, and match no risk/verdict/status/bin filter.
  - `formProblem(view, form)`, `needsNote(view, choice)` — `workbench.js:1205`.
  - `startProblem(draft, setup)` — the setup bar's blocked-start check in `workbench.js`: `Choose an input file to start`, `Map the company name column to start`, `Tick at least one company to start`, `<KEYVAR> is not set in .env`.
  - `skippedCount(file, mapping)` — `file.emptyCounts[mapping.company_name] || 0`.
- `web/index.html`: the markup returned by `render()` (`workbench.js:480-509`) inside `<div id="stage">`, `<link rel="stylesheet" href="styles.css">`, `<script type="module" src="js/main.js">`, title `Deep Tech Classifier`. No picker nav.
- `web/styles.css`: the `:root` tokens and base rules from prototype `index.html:9-45`, followed by the full CSS string from `workbench.js` (the `css` constant above `render()`), with the `compact(P)` template expanded as the prototype does. Add `.wb-status.is-failed` and `.wb-verdict.is-error` using `--error` / `--error-soft`.

- [ ] **Step 1: Write the failing tests** in `web/tests/model.test.js` (`node:test`, `node:assert/strict`), with small row fixtures in the Row shape

```js
test('esc neutralises markup', () => assert.equal(esc(`<img src=x onerror="a">&'`), '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;'));
test('fmtDur', () => assert.deepEqual([fmtDur(40), fmtDur(600), fmtDur(5400)], ['~40 s', '~10 min', '~1 h 30 min']));
test('confWord boundaries', …);            // 90 Near-definitive, 75 Strong, 60 Moderate, 45 Borderline, 30 Weak, 29 Minimal
test('rowView: flagged undecided row is open and Needs Review', …);
test('rowView: change decision reclassifies and sets action from the new verdict', …);
test('rowView: restore clears the decision', …);
test('rowView: error row is never open and has no verdict', …);
test('counts: reclassified row counts under its new verdict; errors counted apart', …);
test('computeIds: priority puts open rows first, then by severity Escalate<Contested<Uncertain, then lowest confidence', …);
test('computeIds: input order while running', …);
test('computeIds: a row decided after the snapshot keeps its place', …);
test('computeIds: search matches name, UEN, domain and description, case-insensitively', …);
test('computeIds: pending rows are hidden by any result filter but not by search', …);
test('computeIds: confidence bin 9 includes 100', …);
test('formProblem: change on Clear needs a note; change on flagged does not', …);
test('startProblem: file, then mapping, then ticked rows, then key', …);
```

- [ ] **Step 2: Run** `node --test web/tests/` — expected: fail (module missing).
- [ ] **Step 3: Implement `model.js`; write `index.html` and `styles.css`.**
- [ ] **Step 4: Run** `node --test web/tests/` — expected: pass. Run `python serve.py`, open `http://127.0.0.1:8765/` — expected: the empty three-column shell with prototype styling and no console errors.
- [ ] **Step 5: Commit** — "Add the workbench shell, styles and view model".

### Task 12: Runs, live table and summary

**Files:**
- Create: `web/js/api.js`, `web/js/state.js`, `web/js/render/util.js` (`put`, `kbd`, `verdictHtml`, `riskHtml`, `marksHtml`, `revTag`), `web/js/render/rail.js`, `head.js`, `strip.js`, `chips.js`, `table.js`, `toast.js`, `counter.js`, `web/js/events.js`, `web/js/main.js`, `web/vendor/number-flow/*`
- Test: `web/tests/model.test.js` (`visibleRows`: 200 by default, grows by 200, never cuts off the selected row, back to 200 when the view changes), `tests/webapp/make_big_input.py` (writes a large input file for the manual check)

**Interfaces:**
- Consumes: `model.js` (Task 11), the API (Task 10).
- Produces:
  - `api.js`: `getSetup()`, `uploadFile(file)`, `postEstimate(settings, rows)`, `listRuns()`, `createRun(fileId, settings, exclude)`, `getRun(id)`, `getChanges(id, cursor)`, `stopRun(id)`, `resumeRun(id)`, `putDecision(id, index, choice, note)`, `restoreDecision(id, index)`, `undoDecision(id, index)`, `exportUrl(id)`. Each rejects with `Error(detail)` on a non-2xx response, using the server's `detail` text.
  - `state.js`: `S` (the prototype's fields minus `engines`: `setup`, `runs` (summaries), `active` (`{run, rows, cursor}` or `null`), `selected` (row index or `null`), `sortKey`, `sortDir`, `f`, `viewIds`, `snap`, `draft` (the new run being set up, or `null`), `analyst` (analyst-settings sheet open), `modal`, `forms`, `collapsed`, `reading`, `detailW`, `filtersOpen`, `sessionRunIds`, `landed`), `openRun(id)`, `refreshView(explicit)`, `startPolling()`.
  - Polling: while the active run is `running`, call `getChanges` every 1000 ms; merge returned rows by index, set `landed[index] = Date.now()` for rows whose result is new (drives the `wb-land` animation), replace steps, update the run summary; then re-render rail, head, strip, chips, table, and the detail panel only when its signature changed (`detailSig`, `workbench.js:1163`). When no run is running, refresh `listRuns()` every 5000 ms so the rail stays current. A failed poll shows one toast `Lost contact with the server` and keeps retrying; the next success shows `Reconnected`.
  - On a status transition seen by polling, show the prototype's toasts: complete → `Run complete: <file>` / `<done> companies · <deep> deep tech · <open> need review`; failed → `Run failed: <file>` / the error.
- Rendering is ported from: rail `workbench.js:945-980` (headings "This session" for ids in `sessionRunIds`, "Recent runs" for the rest; the key list comes from `S.setup`), head `:983-1014`, strip and histogram `:1017-1056`, chips `:1060-1081`, table `:1084-1144`, toasts `:1471-1493`. Additions: head shows `Failed`/`Interrupted` pills and the `wb-notice` text for them (failed: the error; interrupted: the stopped text); the "Processed" stat gets the errors sub-line; error rows render per Deviation 4; pending rows show `row.step`, or `Queued`, or `Not started` when the run is not running.
- Events in this task (`workbench.js:1883-1956`, `:2060-2105`): `open-run`, `select`, row click, `sort`, `sort-priority`, `chip`, `stat`, `bin`, `clear-bin`, `clear-filters`, `filters-toggle`, `stop`, `resume`, search input, and keys `J K ↑ ↓ Home End N ⇧N A F / S`. Stop and Resume call the API, then toast as the prototype does (`Run stopped`, `Resuming <file>`); an API error is shown as a toast with the server's message.
- Empty state (the prototype always has a run): with no runs, the table area shows `<h2>No runs yet</h2><p>Start a run to classify a spreadsheet of companies.</p>` and a `+ New run` button; head, strip and tools are hidden.

- **Animated counters (NumberFlow).**
  - Vendoring: pick the latest `number-flow` release on npm that is at least two weeks old and pin it. Build it once into a single self-contained ES module with `npx esbuild node_modules/number-flow/dist/index.mjs --bundle --format=esm --minify --outfile=web/vendor/number-flow/number-flow.js` (adjust the entry path to the package's `exports`), copy its `LICENSE`, write the version to `VERSION`, and record the exact commands in `README.md`. Nothing in `node_modules` is committed; this is a one-off step, repeated only to upgrade. `main.js` imports it with a dynamic `import()` wrapped in try/catch, so a missing or broken file only loses the animation.
  - `counter.js`: `counterHtml(key, value, format)` returns `<number-flow data-counter="key">` once `customElements.get('number-flow')` is defined, else a `<span data-counter="key">` with the formatted text. `setCounter(el, value, {animate})` calls the element's `update(value)` when animating and otherwise sets the value without a transition (or sets `textContent` on the fallback). Formats: whole numbers with thousands separators; cost as USD with 2 decimals (`US$4.31`). Check the method and property names against the vendored version's docs before use.
  - Where: the strip's Processed, Deep tech, General tech, Needs review and Cost so far values, and the run header's "12 of 20". Not in table rows, the rail, histogram bars or the setup action bar. Those change too often or in too many places for the motion to help.
  - When: animate only when the same run's value changes during polling or after a decision. Opening a different run, first load, and filter changes set values without animation. NumberFlow's default respect for `prefers-reduced-motion` stays on. Counters use `font-variant-numeric: tabular-nums` so neighbours don't shift.
- **Long tables.** Runs can have thousands of companies, and a full re-render of every row each second would freeze the page. The table shows a window of the current view instead of all of it:
  - `model.js`: `visibleRows(viewIds, limit, selectedId) -> {ids, hidden}` returns the first `limit` ids, extended so the selected row is always included. `S.limit` starts at 200 and goes back to 200 whenever the sort, filters, search or active run change.
  - When rows are hidden, the table ends with a footer row: `Showing 200 of 5,000 · Show 200 more · Show all`. "Show all" is offered only up to 5,000 rows. Counts, the strip, chips, histogram, search and the command menu always use the whole run, not the window.
  - Keyboard: `J`/`↓`, `N`, `End` and selecting from the command menu extend `S.limit` as needed, then scroll the selected row into view. `Home` does not shrink the window.
  - Polling patches rows in place. When the view order and window haven't changed, rows whose data changed are replaced by `data-i` (`tr.outerHTML`), and the rest of the table body is left alone. A full table re-render happens only when the order or window changes. In input order while running, that is when a new row first gets a result.
  - The setup table (Task 14) uses the same window and footer. Its header checkbox acts on all rows, not just the visible ones.
  - Browser find (Ctrl+F) only sees rendered rows. The search box covers the whole run, so its placeholder reads `Search all <n> companies`.
  - `tests/webapp/make_big_input.py <n>` writes `tests/webapp/out/big_<n>.xlsx` (git-ignored) with `n` made-up companies (names, sectors, short descriptions) for the manual check.

- [ ] **Step 1: Start the app against the fake pipeline**

Run (PowerShell): `$env:DTC_PIPELINE_CMD = '["python", "tests/webapp/fake_classify.py"]'; $env:FAKE_DELAY_S = '0.4'; python serve.py`
Create a run with `curl` (upload `tests/reference/companies.xlsx`, then `POST /api/runs`).

- [ ] **Step 2: Implement the modules above.**
- [ ] **Step 3: Verify in the browser** — expected: the run appears in the rail with a moving mini progress bar; rows land one at a time with the landing animation; the strip counts and histogram update; Stop turns the pill to "Stopped" and unfinished rows read "Not started"; Resume finishes the run and the table re-sorts into review-priority order; sorting, every chip, the stat buttons, histogram bins and search filter the table as in the prototype; the keys listed above work; no console errors. Counters: during a run the Processed, Deep tech, General tech, Needs review and Cost so far numbers roll to their new values; switching runs in the rail changes them without rolling; with the OS set to reduce motion they change instantly; after renaming `web/vendor/number-flow/number-flow.js` and reloading, the same numbers show as plain text and nothing else breaks. Long tables: run `python tests/webapp/make_big_input.py 5000` and start a run on its output with `FAKE_DELAY_S=0.01`; the table shows `Showing 200 of 5,000` with `Show 200 more` and `Show all`; `End` selects the last row and scrolls to it; scrolling stays smooth and a poll that lands rows takes under 50 ms in the browser's Performance panel; search finds a company in row 4,800.
- [ ] **Step 4: Run** `node --test web/tests/` and `python -m unittest discover tests` — expected: pass.
- [ ] **Step 5: Commit** — "Show runs and live results in the workbench".

### Task 13: Evidence panel and decisions

**Files:**
- Create: `web/js/render/detail.js`
- Modify: `web/js/events.js`, `web/js/state.js`
- Test: `web/tests/model.test.js` (add `undoStack` tests)

**Interfaces:**
- Consumes: decision endpoints (Task 10), `rowView`, `formProblem` (Task 11).
- Produces:
  - `renderDetail(opts)` porting `workbench.js:1172-1400`: `detailTop`, `decisionArea`, `formHtml`, `syncForm`, `sec`, `docHtml`, `factsHtml`, `reclassHtml`, `flagHtml`, `criteriaHtml`, `buildHtml`, `evidenceHtml`, `patentsHtml`, `validatorHtml`, `historyHtml`, `pendingDetail`. Field sources change from `c.*`/`derive` to `row.*`/`row.result.*`; `r.lowEvidence` uses are replaced by `r.capped`.
  - `pendingDetail` no longer predicts whether validation will run: the step list is Enrichment (if on), Patent lookup (if on), Classification, Confidence scoring, and `Validation (if needed)` when validation is on.
  - Error rows: the panel shows the `wb-flag` block titled `Error: this company was not classified` with `errorMessage`, the input description, and `Resume the run to retry it.` No decision controls.
  - The first history line's time is the run's `createdAt` formatted with `hhmm`.
  - In `model.js`: `pushUndo(stack, {runId, index, label})`, `popUndo(stack)`.
  - Decision flow: `record`, `restore`, `undo`, `openForm`, `keyConfirm`, `keyChange`, `focusNote`, `recordFromForm`, `leaveNote` from `workbench.js:1510-1596`, each calling the API and replacing the row with the response before re-rendering rail, strip, chips, table and detail. The table order does not change on a decision (the snapshot rule). `undo` calls `undoDecision` for the top stack entry; an entry for a run that is not active is undone through the API and only the rail is refreshed. An API error leaves the form open and shows the message in `form-why`.
  - Events: `quick-confirm`, `open-change`, `open-note`, `change-dec`, `restore`, `record`, `cancel-form`, `toggle-sec`, `undo`, note input, `wb-dec` radio change, keys `C X M U`, `Ctrl/⌘+Enter` and `Esc` in the note.

- [ ] **Step 1: Write the failing tests** — `pushUndo`/`popUndo` are last-in-first-out and `popUndo` on an empty stack returns `null`.
- [ ] **Step 2: Run** `node --test web/tests/` — expected: fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify in the browser against the fake pipeline** — expected: selecting a row shows every section with real data; `C` on an escalated row confirms it, moves to the next open row, and the "Needs review" count drops; `X` on a Clear row opens the form with Record disabled until a note is typed; Record shows the reclassified banner and the `↺ was …` marker in the table; Restore and `U` reverse it; reloading the page keeps every decision and the history list. Upload a file containing a company named `<img src=x onerror=alert(1)>` and a note with the same text — expected: shown as literal text in the table, the panel, the toast and the tooltip; no alert.
- [ ] **Step 5: Run** both test suites, then **commit** — "Add the evidence panel and reviewer decisions".

### Task 14: New-run setup in the table

The design was chosen in a prototype round on 2026-11-13 ("In the table"; see `docs/ux/workbench-ux.md` §4b). There is no drawer: setting up a run happens in the main column, in the same table the run then fills.

**Files:**
- Create: `web/js/render/setup.js` (setup table, header column menus, action bar, settings popover), `web/js/render/analyst.js` (analyst-settings side sheet)
- Modify: `web/js/events.js`, `web/js/state.js`, `web/js/render/rail.js` (draft item), `web/js/render/table.js` (shared row markup)

**Interfaces:**
- Consumes: `getSetup`, `uploadFile`, `postEstimate`, `createRun` (Task 12), `startProblem`, `skippedCount` (Task 11).
- Produces: `openSetup(fromRun)`, `cancelSetup()`, `renderSetup()`, `openAnalyst()` / `closeAnalyst()`, porting the setup code in `workbench.js`, with:
  - `S.draft` = `S.setup.defaults` or a copy of `fromRun.settings`, plus `file` (the inspect response or `null`) and `excluded` (a `Set` of row indexes). While `S.draft` is set the main column shows setup instead of a run, the detail panel is empty, the rail shows the draft at the top ("New run · not started"), and global run shortcuts are off. "Same settings…" opens setup with the settings but no file; the mapping is kept and re-checked against the new file's headers (keys whose column is absent are cleared and re-detected).
  - **No file yet:** the table's empty state is the drop target (ghost rows, `Drop a spreadsheet here to start`, a `Choose file…` button over a hidden `<input type="file" accept=".xlsx,.xls,.csv">`). The whole main column accepts a drop and shows a drop-over state. While uploading: `Reading <name>…`. An upload error is shown under the drop target with the server's message.
  - **File loaded:** every row of `file.table` is a table row with status `Queued`. The file line reads `<rows> rows · <skippedCount> skipped (empty name) · <headers.length> columns` with `Change file`. Each input column header carries a `from: <column> ▾` chip that opens a column menu (arrow keys, Enter, Esc, an example value per column); chip states mirror the old tags `Detected` / `Changed` / `Used twice`; an unmapped Company name header is highlighted with `Choose column`. Row checkboxes and a tri-state header checkbox fill `S.draft.excluded`. Notes list the columns `kept unchanged in your output` and the no-description warning (wording depends on enrichment).
  - **Action bar**, right-aligned under the table: `Classify <n> companies · ~US$<cost> · about <m> min` and the batch note. When `startProblem` returns text the button keeps its place, shows the reason, and clicking it focuses the fix (column chip, header checkbox, or the provider in the analyst sheet). `Cancel` (and `Esc` when no menu is open) returns to the previously open run.
  - **Settings popover** (`Settings: <level> ▾`): three quality levels in plain words, mapped to tiers, with the model id as secondary text from `S.setup`; the four steps as switches with one plain sentence each; an `Analyst settings` link.
  - **Analyst sheet**: provider with key status and `Ask your admin to add <KEYVAR> to .env`, tier, pinned model with the `S.setup.pricedModels` hint, batch, the six thresholds with reset, and the estimate. It traps focus and closes on `Esc`, returning focus to the link.
  - Estimate from `postEstimate(draft, ticked rows or 20)`, debounced 250 ms after any change; while a request is in flight the previous numbers stay; the note says `rough estimate`.
  - Start: `createRun(file.fileId, settings, [...excluded])`, adds the id to `sessionRunIds`, clears `S.draft`, opens the run (the same table now shows live rows) and focuses Stop. A 400 is shown in the action bar.
  - Events: `new-run`, `rerun`, `cancel-setup`, `clear-file`, `col-menu`, `map`, `tick-row`, `tick-all`, `settings-pop`, `analyst-open`, `analyst-close`, `reset-th`, `start`, provider/tier/toggle/number/model inputs, drag-over/leave/drop, key `O`.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify in the browser against the fake pipeline** — expected: dropping `tests/reference/companies.xlsx` lists all its rows as `Queued` with the detected columns; choosing `Not mapped` for Company name highlights the header and the button reads `Map the company name column to start`, and clicking it opens that column menu; unticking two rows updates the count and estimate, unticking all reads `Tick at least one company to start`; dropping a `.txt` shows the server's rejection; a provider with no key blocks Start and points to the analyst sheet; Start creates a run whose `total` is the ticked count, and its rows go from Queued to steps to verdicts in place; "Same settings…" opens setup with those settings and no file; `Cancel` returns to the previous run; the analyst sheet traps Tab and `Esc` closes it, returning focus.
- [ ] **Step 3: Run** both test suites — expected: pass.
- [ ] **Step 4: Commit** — "Add new-run setup in the results table".

### Task 15: Command menu, shortcuts sheet, reading view, divider, download

**Files:**
- Create: `web/js/render/modal.js`
- Modify: `web/js/events.js`, `web/js/render/detail.js`, `web/js/state.js`

**Interfaces:**
- Produces, ported from the prototype: `CMDS` and `openHelp` (`workbench.js:1657-1693`); `paletteItems`, `goToCompany`, `openPalette`, `renderPalette`, `runPalette`, `closeModal` (`:1695-1747`); `toggleReading`, `toggleNeeds`, `focusChips`, `focusSearch`, `stopOrResume` (`:1599-1624`); the divider drag and keyboard resize (`:1626-1654`, `:2036-2041`); `onRootKey` modal handling (`:2011-2023`); keys `E D ? Esc` and `Ctrl/⌘+K`.
  - `download()`: navigates a hidden `<a download>` to `exportUrl(run.id)`, then shows the prototype's toast (`Saved <name>` or `Saved partial workbook <name>`, with the confirmed / reclassified / still-need-review counts). When no row has a result, it shows the toast `Nothing to download yet` / `The workbook is available once the first company finishes.` instead of requesting.
  - `detailW`, `reading` and `collapsed` persist in `localStorage` under `dtc.ui`, read inside try/catch.
  - The harness comment about reserved keys (`1-9`, `←`, `→`, `R`) no longer applies; no new bindings are added for them.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify in the browser** — expected: `Ctrl+K` opens the menu, typing a company name and Enter selects it even when a filter was hiding it (filters clear), typing a file name switches run; `?` shows the four shortcut groups; `E` toggles reading view; dragging the divider resizes the panel within the prototype's limits and double-click resets it; `D` downloads a workbook whose Management View has the reviewer columns and matches the decisions made on screen; on a stopped run the download is the partial workbook.
- [ ] **Step 3: Run** both test suites — expected: pass.
- [ ] **Step 4: Commit** — "Add the command menu, shortcuts, reading view and download".

### Task 16: Real run, docs

**Files:**
- Modify: `README.md` (new "Web app" section: install, `python serve.py`, what `runs/` and `uploads/` hold, that it is local and single-user, that CLI usage is unchanged), `PROJECT_OVERVIEW.md` (one paragraph and the reviewer columns in the output description), `NEXT_STEPS.md` (record the live check)

- [ ] **Step 1: Run the real pipeline through the app.** Unset `DTC_PIPELINE_CMD`, start `python serve.py`, upload `tests/reference/companies.xlsx`, run it once in batch mode and once sequentially with the fast tier. Expected: both complete; per-row steps appear while running; Stop and Resume work mid-run on the sequential one; the model shown in the head matches the Overview sheet's "Model Reported by API".
- [ ] **Step 2: Compare** the estimate shown before the batch run with the run's actual cost in the strip. If they differ by more than 2×, adjust the constants in `webapp/estimate.py` from the Full Detail token columns and re-run `tests.webapp.test_estimate`.
- [ ] **Step 3: Confirm the CLI is unchanged:** `python classify.py --input tests/reference/companies.xlsx` writes no `progress.jsonl` and its workbook has no reviewer columns.
- [ ] **Step 4: Write the docs.**
- [ ] **Step 5: Run** `python -m unittest discover tests` and `node --test web/tests/` — expected: pass. **Commit** — "Document the web app and record the live check".

---

## Open decisions for review

These are choices this plan makes that you may want to overrule before work starts.

1. **Subprocess per run, not threads.** It isolates the pipeline's working-directory state and makes Stop trivial, at the cost of progress arriving through files. Several runs can be active at once; nothing limits how many.
2. **Polling, not server-sent events.** One request a second while a run is active. Simpler to build and test; fine for one local user.
3. **FastAPI is a new dependency** (plus uvicorn, python-multipart, httpx). The alternative is the standard library's `http.server` with hand-written multipart parsing.
4. **No build step and no framework on the frontend.** The prototype is plain JS and ports directly. The cost is hand-written DOM rendering staying as string templates. Of the libraries considered (Emil Kowalski's curated list), only NumberFlow is used, because it works as a web component without a framework. base-ui (popovers, menus, sheets), cmdk (command menu), Sonner (toasts) and Virtuoso (long tables) are React-only; adopting them means moving Tasks 11–15 to React with Vite. The long-table window in Task 12 stands in for Virtuoso.
5. **Estimate constants are assumptions** until Task 16 calibrates them against a real run.
6. **CLI runs are not shown in the app**, and the prototype's "results are in the workbook" archive view is dropped with them.
