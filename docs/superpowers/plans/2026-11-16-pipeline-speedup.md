# Pipeline Speed-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut a 4–5 company run from about 10 minutes to about 2, and a 5,000-company run from about 3 days to under one day, without changing what the pipeline decides.

**Architecture:** The pipeline stays a set of phases, but each per-company loop runs through one small worker-pool helper: work happens in threads, while checkpoint writes and the model-drift check stay on the main thread. All EPO traffic goes through a single dedicated thread ("the EPO lane"), because EPO's limit is per API key and its client is not safe to share across threads. Small runs skip the Batch API and classify with direct calls; large runs keep the batch and its 50% discount.

**Tech Stack:** Python 3.11, `concurrent.futures.ThreadPoolExecutor` (standard library, no new dependencies), existing `anthropic` SDK and `python-epo-ops-client` 4.2.1, `unittest`.

**Spec:** The "Measured baseline" section below. It is the analysis this plan implements; there is no separate spec file.

## Measured baseline

Source: `runs/run_20261116_213044/process.log` (4 companies, Anthropic `fast` tier, enrichment + EPO + validator + batch all on). Total 614s.

| Stage | Time | Share | Cause |
|---|---|---|---|
| Batch classification wait | 366s | 60% | Batch API is asynchronous; 4 requests took 6 minutes |
| EPO patent lookup | 153s | 25% | See below |
| Validator (Agent 2) | 65s | 10% | 3 of 4 triggered, about 21s each, one at a time |
| Enrichment (Agent 0) | 27s | 4% | About 6.6s each, one at a time |
| Startup and output | 3s | <1% | |

EPO detail, from the log and from the client's throttle history (`C:\var\tmp\python-epo-ops-client\throttle_history.db`):

- EPO reported system status `overloaded`, search limit **5 per minute**, retrieval limit 50 per minute. The client library sleeps `60 / limit` before each request, so every search after the first waited 12s (searches took 4.5s, 16.8s, 16.8s, 16.8s).
- Fixed sleeps on top of that: 2s after every patent (`lib/epo_patent/processors/patent_fetcher.py:163`) and 4s after every company (`pipeline/epo_bridge.py:180`). 46s in this run.
- One search plus one detail request per patent, up to 10 patents. 15 detail requests at about 3.5s each.
- A new `EPOClient` (and a new login token) is built for every company (`pipeline/epo_bridge.py:158`).

Projection for the code as it stands: 27–45s per company to gather, plus about 16s to validate if 3 in 4 are validated. About 2.5–3.5 days for 5,000 companies.

**The floor after this plan:** EPO search quota. At 5 searches per minute, 5,000 companies is about 17 hours however the rest is arranged. The limit is higher when EPO is less busy; only one reading exists.

## Global Constraints

- Results do not change: same prompts, same model rules, same confidence maths. Output rows stay in input order.
- Existing resume guarantees hold: a finished company is never redone, an unfinished one is never skipped, a run started before this change can still be resumed.
- One model per run: once model drift is detected, no further row is saved (existing rule, `orchestrator._check_model_drift`).
- All EPO requests are made from one thread, and the `python-epo-ops-client` default `Throttler` stays the only EPO rate control. Do not pass custom middlewares and do not add a second EPO key.
- `concurrency.workers` set to `1` reproduces today's strictly sequential behaviour (no threads are created).
- No new dependencies.
- No model names outside `pipeline/models.py`, `config.template.json`, tests and docs (existing rule).
- Tests: `python -m unittest discover tests` passes at the end of every task. Tests need no network or API keys.
- Commit after every task, in the repo's sentence style ("Add …", "Run …").

## Review Focus

Each line names the task whose tests pin it.

1. **Stop or Ctrl-C while workers are busy.** Companies already checkpointed stay done; the rest are redone on resume; no row is duplicated or lost. → Tasks 2, 3.
2. **Companies finishing out of order.** A slow first company and a fast last one must still land on their own rows, including duplicate names. → Tasks 2, 3.
3. **Resuming a run started before this change.** The gathered file has no index keys and the run state has no mode; resume must read both. → Tasks 2, 4.
4. **Rate limits under 8 workers.** Enrichment that fails after retries currently yields a company with no web description and no warning. The run must say how many companies this happened to. → Task 2.
5. **An EPO search response that lacks details for a patent.** That patent falls back to the per-patent request; the company is not dropped. → Task 6.

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `pipeline/parallel.py` | Create | Worker-pool helper and concurrency defaults |
| `pipeline/progress.py` | Modify | Make `emit` safe from several threads |
| `pipeline/llm_provider.py` | Modify | Make `note_model` safe from several threads |
| `pipeline/orchestrator.py` | Modify | Use the helper in Phase 1, Phase 4 and the direct pipeline; index-keyed gathered file; run mode |
| `pipeline/epo_bridge.py` | Modify | EPO lane, client reuse, no fixed sleeps, search-with-details switch |
| `lib/epo_patent/core/api_client.py` | Modify | `search_patents` accepts constituents |
| `lib/epo_patent/processors/patent_fetcher.py` | Modify | Build a patent from an already-fetched document |
| `lib/epo_patent/processors/company_processor.py` | Modify | Use details from the search response when asked |
| `webapp/estimate.py` | Modify | Duration model that matches the new pipeline |
| `config.template.json` | Modify | `concurrency.workers`, `batch.min_companies`, `pipeline.excel_checkpoint_min_interval_s` |
| `tests/test_parallel.py` | Create | Helper tests |
| `tests/test_resume.py` | Modify | Pin `workers: 1` for existing tests; add parallel classes |
| `tests/test_fixes.py` | Modify | EPO bridge tests |
| `tests/test_epo_search_biblio.py`, `tests/fixtures/epo/search_biblio_lionsbot.xml` | Create | Search-with-details parsing |
| `README.md`, `PROJECT_OVERVIEW.md` | Modify | New settings and the EPO floor |

---

### Task 1: Worker-pool helper

**Files:**
- Create: `pipeline/parallel.py`, `tests/test_parallel.py`
- Modify: `pipeline/progress.py:20-45`, `pipeline/llm_provider.py:94-101`, `config.template.json`

**Interfaces:**
- Produces:
  - `DEFAULT_WORKERS = 8`, `MAX_WORKERS = 32`, `DEFAULT_BATCH_MIN_COMPANIES = 100`
  - `workers_from(config: Dict[str, Any]) -> int` — `config["concurrency"]["workers"]`, default `DEFAULT_WORKERS`, clamped to `1..MAX_WORKERS`; a non-integer value falls back to the default.
  - `run_indexed(indices: Iterable[int], work: Callable[[int], T], record: Callable[[int, T], None], workers: int) -> None`

`run_indexed` contract:
- `work(i)` runs in a worker thread. `record(i, result)` runs in the **calling** thread, once per finished index, in completion order.
- `workers <= 1`: no executor; a plain loop `record(i, work(i))` in the given order.
- If `work` or `record` raises anything (including `KeyboardInterrupt`): not-yet-started work is cancelled, running work is allowed to finish, its results are discarded without calling `record`, and the original exception is re-raised. Use `executor.shutdown(wait=True, cancel_futures=True)`.

**Status:** Done in `6ffa349`. Review approved with three minor points, which became Task 1b.

- [x] **Step 1: Write the failing tests** in `tests/test_parallel.py`

```python
class RunIndexedTests(unittest.TestCase):
    def test_every_index_is_recorded_once_with_its_own_result(self):
        # work sleeps (5 - i) * 0.01 so later indices finish first
        seen = {}
        run_indexed(range(5), lambda i: (time.sleep((5 - i) * 0.01), i * 10)[1], seen.__setitem__, workers=4)
        self.assertEqual(seen, {0: 0, 1: 10, 2: 20, 3: 30, 4: 40})

    def test_record_runs_on_the_calling_thread(self):
        threads = set()
        run_indexed(range(4), lambda i: i, lambda i, r: threads.add(threading.get_ident()), workers=4)
        self.assertEqual(threads, {threading.get_ident()})

    def test_one_worker_runs_inline_and_in_order(self):
        order, work_threads = [], set()
        run_indexed([2, 0, 1], lambda i: work_threads.add(threading.get_ident()) or i,
                    lambda i, r: order.append(i), workers=1)
        self.assertEqual(order, [2, 0, 1])
        self.assertEqual(work_threads, {threading.get_ident()})

    def test_error_in_work_stops_recording_and_is_raised(self):
        # index 0 raises immediately; 20 indices, 2 workers
        recorded = []
        def work(i):
            if i == 0:
                raise KeyboardInterrupt()
            time.sleep(0.02)
            return i
        with self.assertRaises(KeyboardInterrupt):
            run_indexed(range(20), work, lambda i, r: recorded.append(i), workers=2)
        self.assertLess(len(recorded), 20)

    def test_error_in_record_is_raised_and_nothing_is_recorded_after_it(self):
        recorded = []
        def record(i, r):
            recorded.append(i)
            raise RuntimeError("drift")
        with self.assertRaisesRegex(RuntimeError, "drift"):
            run_indexed(range(10), lambda i: i, record, workers=4)
        self.assertEqual(len(recorded), 1)


class WorkersFromTests(unittest.TestCase):
    def test_default_clamp_and_bad_values(self):
        self.assertEqual(workers_from({}), 8)
        self.assertEqual(workers_from({"concurrency": {"workers": 0}}), 1)
        self.assertEqual(workers_from({"concurrency": {"workers": 500}}), 32)
        self.assertEqual(workers_from({"concurrency": {"workers": "many"}}), 8)
```

- [x] **Step 2: Run them, expect failure**

Run: `python -m unittest tests.test_parallel -v`
Expected: `ModuleNotFoundError: No module named 'pipeline.parallel'`

- [x] **Step 3: Implement `pipeline/parallel.py`** to the contract above.

- [x] **Step 4: Make the two shared writers thread-safe**
  - `pipeline/progress.py`: one module-level `threading.Lock` held around the open/write in `emit`.
  - `pipeline/llm_provider.py`: one class-level `threading.Lock` on `LLMProvider` held inside `note_model`.

- [x] **Step 5: Add the setting** to `config.template.json`: top-level `"concurrency": {"workers": 8}`.

- [x] **Step 6: Run all tests**

Run: `python -m unittest discover tests`
Expected: OK

- [x] **Step 7: Commit** — `Add a worker-pool helper for per-company work`

---

### Task 1b: Tighten the worker-pool tests and document interrupts

The three minor points from the Task 1 review. The tests Task 1 copied from this plan are too weak to protect the stop and drift behaviour that Tasks 2–4 rely on.

**Status:** Done in `833db0b`. Review approved. Two minor points remain: a bypassed executor patch would pass, only 5s slower, and the mid-batch test cannot force several jobs to finish at once.

**Files:**
- Modify: `tests/test_parallel.py`, `pipeline/parallel.py` (docstring and, only if a new test demands it, `run_indexed`)

**Interfaces:**
- No change to `run_indexed` or `workers_from` signatures or contract.

Decisions:
- **Cancellation is pinned by tests.** After an error in `work` (20 indices, 2 workers, index 0 raises):
  - `work` was called far fewer than 20 times, so queued work was cancelled. Count the calls with a lock-protected counter and assert `calls <= 4`, a bound that allows for the workers already running.
  - Every `work` call that started had also finished before `run_indexed` raised. Track started and finished sets in `work`, and assert they are equal right after the `assertRaises` block. This pins `shutdown(wait=True)`.
  - `record` is never called after the error.
- **Work runs off the calling thread when `workers > 1`.** A new test collects `threading.get_ident()` inside `work` with `workers=4` and asserts the calling thread is not among them. This is the counterpart of `test_one_worker_runs_inline_and_in_order`.
- **Error mid-batch.** If several futures finish in the same `wait` call and one of them raised, the futures earlier in that set may already be recorded. This is allowed. The test asserts only that no index is recorded twice and that the error is raised. Callers must place results by index, never by the order of `record` calls. State this in the `run_indexed` docstring.
- **Ctrl-C is documented, not changed.** Add to the `run_indexed` docstring:
  - A Ctrl-C on the calling thread while it waits is handled like an error in `work`.
  - On Windows, the wait may not see the Ctrl-C until the next company finishes.
  - A second Ctrl-C during the cleanup wait leaves the running workers to finish in the background. Their results are discarded.

- [x] **Step 1: Write the new tests** in `tests/test_parallel.py` (cancellation count, started == finished, no record after error, work off the calling thread, no index recorded twice). Keep the six existing tests unchanged.
- [x] **Step 2: Run them.** Run: `python -m unittest tests.test_parallel -v`. They are expected to pass against the Task 1 code. If any fails, fix `run_indexed` to the existing contract.
- [x] **Step 3: Update the `run_indexed` docstring** with the ordering and Ctrl-C notes above.
- [x] **Step 4: Run all tests.** Run: `python -m unittest discover tests` — Expected: OK
- [x] **Step 5: Commit** — `Pin the worker-pool cancellation behaviour in tests`

---

### Task 2: Gather companies in parallel, with EPO in its own lane

**Files:**
- Modify: `pipeline/orchestrator.py:247-271` (Phase 1 call site), `:405-506` (`_gather_one`, `_phase1_gather`), `pipeline/epo_bridge.py`
- Test: `tests/test_resume.py`

**Interfaces:**
- Consumes: `run_indexed`, `workers_from` (Task 1)
- Produces:
  - `epo_bridge.lookup_in_lane(*args, **kwargs) -> EPOResult` — same arguments as `run_epo_lookup`; submits it to a module-level `ThreadPoolExecutor(max_workers=1, thread_name_prefix="epo")` and waits for the result. `_gather_one` calls this instead of `run_epo_lookup`.
  - Gathered file line format: `{"index": <int>, "record": {…company_data…}}`.
  - `orchestrator._load_gathered(path: str) -> Dict[int, Dict[str, Any]]` — a line without a `"record"` key is a legacy line and takes its line number as its index.
  - `orchestrator._phase1_gather(companies, gathered: Dict[int, Dict], gathered_path: str, workers: int, **gather_kwargs) -> List[Dict[str, Any]]` — returns records in index order.

Decisions:
- `record` (main thread) does, in this order: `_check_model_drift`, append the line, emit the `"Waiting for batch"` step.
- After Phase 1, if any record has `web_fetch_status == "error"` or an `epo.raw_status` starting with `"EPO Error"`, log one warning: `Phase 1: {n} companies have no web description because enrichment failed; {m} patent lookups failed.` Omit the half whose count is zero; log nothing when both are zero.
- Enrichment still runs before the EPO lookup for the same company (the lookup's coherence check needs the description). The lane stays busy because other workers keep feeding it.
- With `workers <= 1`, `_gather_one` calls `run_epo_lookup` directly and no lane thread starts (Global Constraint: one worker creates no threads). Added during the Task 2 work.

**Status:** Done in `9bb37dc` and `9b78054`. The review approved it with minor points only:
- The lane comment in `epo_bridge.py` still says every EPO request goes through it, which is now true only with more than one worker.
- The interrupt test does not check that index 3 is missing from the gathered file.
- No test covers the EPO half of the Phase 1 warning.
- The warning is logged again on every resume.
- After an error, workers waiting on the lane still wait for every queued lookup, so stopping can take up to about one throttled lookup per worker.
- `lookup_in_lane` is chosen with a boolean flag rather than by passing the lookup function, so tests must patch two modules.

- [x] **Step 1: Pin existing tests to one worker.** In `tests/test_resume.py`, add `"concurrency": {"workers": 1}` to `CONFIG`. Add a `workers` class attribute (default `1`) to `ResumeTestCase` and have `run_pipeline` set `config["concurrency"] = {"workers": self.workers}`. Add a helper `gathered_path(self) -> str` returning `f"checkpoints/llm/gathered_{orch.load_run_state()['run_id']}.jsonl"`.

- [x] **Step 2: Write the failing tests**

```python
class ParallelBatchTests(ResumeTestCase):
    batching = True
    workers = 4

    def test_out_of_order_gathering_keeps_rows_aligned(self):
        names = ["A", "Dup", "Dup", "D", "E", "F"]
        delays = dict(zip(range(6), (0.06, 0.05, 0.04, 0.03, 0.02, 0.01)))
        # enrich sleeps by position; description carries the position so alignment is checkable
        ...
        results = self.run_pipeline(_companies(names))
        self.assertEqual([r["company_name"] for r in results], names)
        self.assertEqual([r["web_description"] for r in results], [f"desc {i}" for i in range(6)])

    def test_interrupt_while_gathering_then_resume_gathers_only_the_rest(self):
        companies = _companies(list("ABCDEFGH"))
        # the enrich call for "D" raises KeyboardInterrupt
        with self.assertRaises(KeyboardInterrupt):
            self.run_pipeline(companies)
        gathered_before = len(orch._load_gathered(self.gathered_path()))
        self.assertLess(gathered_before, 8)
        self.enrich.reset_mock(side_effect=True); self.enrich.return_value = dict(ENRICH_OK)
        results = self.run_pipeline(companies, resume=True)
        self.assertEqual(self.enrich.call_count, 8 - gathered_before)
        self.assertEqual([r["company_name"] for r in results], list("ABCDEFGH"))

    def test_enrichment_failures_are_counted_in_one_warning(self):
        # enrich returns web_fetch_status "error" for 2 of 5 companies
        self.assertIn("Phase 1: 2 companies have no web description because enrichment failed.",
                      self.logged_messages())


class LegacyGatheredFileTests(ResumeTestCase):
    batching = True

    def test_positional_gathered_file_from_an_older_run_is_resumed(self):
        # interrupt after 2 of 3, rewrite the gathered file as bare records (old format), resume
        self.assertEqual(self.enrich.call_count, 1)  # only C
        self.assertEqual([r["company_name"] for r in results], ["A", "B", "C"])
```

- [x] **Step 3: Run them, expect failure**

Run: `python -m unittest tests.test_resume -v`
Expected: the four new tests fail; all existing tests pass.

- [x] **Step 4: Implement** `lookup_in_lane`, `_load_gathered`, the new `_phase1_gather`, and the summary warning. Read `workers_from(config)` once in `_run_pipeline_batch`.

- [x] **Step 5: Run all tests**

Run: `python -m unittest discover tests`
Expected: OK

- [x] **Step 6: Commit** — `Gather companies in parallel with one EPO lane`

---

### Task 2b: Tidy the Phase 1 review points

The six minor points from the Task 2 review.

**Status:** Done in `177707b`. Review approved. Three minor points remain: `EPOLaneTests` and the patent-lookup warning tests now patch only the lookup path they expect, so a wrongly routed lookup could reach the real EPO bridge before the test fails; and the warning is now logged before "Phase 1 complete" instead of after.

**Files:**
- Modify: `pipeline/orchestrator.py` (`_gather_one`, `_phase1_gather`, `_warn_gathering_failures` and its call sites), `pipeline/epo_bridge.py` (lane comment and `lookup_in_lane` docstring)
- Test: `tests/test_resume.py`

**Interfaces:**
- `_gather_one` takes `epo_lookup: Optional[Callable[..., EPOResult]] = None` in place of the `epo_in_lane` flag. `None` means the orchestrator's module-level `run_epo_lookup`, looked up when called rather than bound as a default value, so tests that patch `orch.run_epo_lookup` keep working.
- `_phase1_gather` passes `epo_bridge.lookup_in_lane` when `workers > 1` and nothing otherwise.
- `lookup_in_lane` keeps its signature.

Decisions:
- **Lane comment.** The comment above the lane executor says the lane carries every EPO request while companies are gathered with more than one worker. With one worker, and in the sequential pipeline, the lookup runs on the calling thread.
- **Interrupt test.** `test_interrupt_while_gathering_then_resume_gathers_only_the_rest` also asserts that index 3 ("D") is not in `orch._load_gathered(...)` after the interrupt.
- **EPO half of the warning.** New tests: one where 1 of 4 EPO lookups returns an `EPOResult` whose `raw_status` starts with `"EPO Error"` and enrichment succeeds. It asserts `Phase 1: 1 patent lookups failed.` One where both kinds fail. It asserts `Phase 1: 2 companies have no web description because enrichment failed; 1 patent lookups failed.` Keep the existing message wording; do not change it to the singular.
- **Warning on resume.** Log the warning only when this run gathered at least one company in Phase 1. When Phase 1 is loaded entirely from disk, it was already logged by the run that gathered it. When a resume gathers only some companies, the counts still cover every gathered record. Pin both cases with tests.
- **Slow stop is documented, not changed.** Cancelling queued lane lookups would need a hook in `run_indexed`, which would change Task 1's contract. Add to the `lookup_in_lane` docstring: after an error or Ctrl-C, workers already waiting on the lane still wait for their lookups, so stopping can take up to about one throttled EPO lookup per worker. A second Ctrl-C leaves them to finish in the background.
- **Flag becomes a callable.** As in Interfaces above. Simplify `EPOLaneTests` to patch only what each case actually reaches.

- [x] **Step 1: Write the new and changed tests** in `tests/test_resume.py`: index 3 absent after the interrupt, the two EPO-warning tests, and warning-on-resume (logged when the resume gathers something, not logged when Phase 1 is loaded entirely from disk).
- [x] **Step 2: Run them, expect failure** for the resume-without-gathering test only. Run: `python -m unittest tests.test_resume -v`
- [x] **Step 3: Implement** the warning condition, the `epo_lookup` parameter, the comment and the docstring.
- [x] **Step 4: Run all tests.** Run: `python -m unittest discover tests` — Expected: OK
- [x] **Step 5: Commit** — `Tidy the Phase 1 gathering after review`

---

### Task 3: Validate in parallel

**Status:** Done in `68bad7c`. Review approved. Minor points remain: no test has a duplicate name finishing out of order; the interrupt test raises Ctrl-C in a worker, not the main thread; the drift test only checks that fewer than six rows were saved, not that the drifting company is absent.

**Files:**
- Modify: `pipeline/orchestrator.py:348-398` (Phase 4 loop)
- Test: `tests/test_resume.py`

**Interfaces:**
- Consumes: `run_indexed`, `workers_from`

Decisions:
- `work(i)`: time the call, run `_finalize_one`, turn any `Exception` into `_error_result(name)` with the existing error log line, set `processing_time_s` and `company_name`.
- `record(i, result)`: `_check_model_drift` **first** (so a row is never saved after drift), then `done[i] = result`, append the checkpoint line, and write the Excel checkpoint when `len(done) % checkpoint_interval == 0` or every company is done. The trigger is the count finished, not the row number.
- Log `[{finished}/{total}] Phase 4 done: {name}` from `record`, replacing the per-row start line.

- [x] **Step 1: Write the failing tests**

```python
class ParallelValidationTests(ResumeTestCase):
    batching = True
    workers = 4
    # setUp patches orch.agent2_validate with self.validate; CONFIG override turns the validator on
    # with validator_threshold 101 so every company is validated

    def test_out_of_order_validation_keeps_rows_aligned(self):
        # validate sleeps longest for the first company and returns updated_confidence = 50 + position
        self.assertEqual([r["confidence"] for r in results], [50, 51, 52, 53, 54, 55])

    def test_model_drift_during_validation_stops_the_run_and_resume_finishes_it(self):
        # the 3rd validate call sets provider.model_drift
        with self.assertRaises(ModelChangedError):
            self.run_pipeline(companies)
        _, partial = load_partial_results(companies)
        self.assertLess(len(partial), 6)

    def test_interrupt_during_validation_then_resume_validates_only_the_rest(self):
        done_before = len(load_partial_results(companies)[1])
        ...
        self.assertEqual(self.validate.call_count, 6 - done_before)
        self.assertEqual(self.enrich.call_count, 0)        # Phase 1 not redone
        self.assertEqual(len(self.batches.created), 1)     # batch not resubmitted
```

- [x] **Step 2: Run them, expect failure.** Run: `python -m unittest tests.test_resume.ParallelValidationTests -v`

- [x] **Step 3: Implement** the Phase 4 loop with `run_indexed` over the indices not in `done`.

- [x] **Step 4: Run all tests.** Run: `python -m unittest discover tests` — Expected: OK

- [x] **Step 5: Commit** — `Validate companies in parallel`

---

### Task 4: Direct classification for small runs

**Status:** Done in `d1b22af`. Review approved. Parallel direct runs send patent lookups through the EPO lane; `tests/reference/check.py` now sets `batch.min_companies` to 0 so the reference check stays on the batch path. Minor points remain: a collapsed line continuation in `tests/test_resume.py`; the resume log still says "sequential" rather than "direct"; the drift test only bounds the rows saved. `build_provider` still picks a batch-capable model from `batch.enabled` alone; leave it, since changing it would change the model a small run gets.

**Files:**
- Modify: `pipeline/orchestrator.py:56-84` (`run_pipeline`), `:749-879` (direct pipeline), `config.template.json`
- Test: `tests/test_resume.py`

**Interfaces:**
- Consumes: `run_indexed`, `workers_from`, `DEFAULT_BATCH_MIN_COMPANIES`
- Produces: `run_state["mode"]`, either `"batch"` or `"direct"`.

Decisions:
- New setting `batch.min_companies`, default `100`, added to `config.template.json`.
- Mode for a fresh run: `"batch"` when `batch.enabled`, the provider supports batching, and `len(companies) >= batch.min_companies`; otherwise `"direct"`.
- Mode for a resumed run: the stored `run_state["mode"]`. For a run state without one: `"direct"` when `batch_phase == "complete"` and `batch_id is None`, otherwise `"batch"`. The current config never changes the mode of an existing run.
- When batching is enabled but the run is too small, log: `Classifying {n} companies with direct calls (batch jobs are used from {min} companies).`
- `_run_pipeline_sequential` keeps its name and uses `run_indexed` with the same `work` / `record` split as Task 3 (`work` = `_process_one_sequential` with timing and error handling; `record` = drift check, checkpoint, Excel checkpoint by count).

- [x] **Step 1: Keep existing batch tests on the batch path.** In `ResumeTestCase.run_pipeline`, add `"min_companies": 0` to the `batch` config, overridable by a `batch_min` argument.

- [x] **Step 2: Write the failing tests**

```python
class RunModeTests(ResumeTestCase):
    batching = True

    def test_small_run_classifies_directly_without_a_batch_job(self):
        results = self.run_pipeline(_companies(["A", "B", "C"]), batch_min=100)
        self.assertEqual(self.batches.created, [])
        self.assertEqual(self.classify.call_count, 3)
        self.assertEqual(orch.load_run_state()["mode"], "direct")

    def test_run_at_the_threshold_uses_a_batch_job(self):
        self.run_pipeline(_companies(["A", "B", "C"]), batch_min=3)
        self.assertEqual(len(self.batches.created), 1)
        self.assertEqual(orch.load_run_state()["mode"], "batch")

    def test_resume_keeps_the_mode_the_run_started_with(self):
        # start in batch mode (batch_min=0), interrupt in Phase 1, resume with batch_min=100
        self.assertEqual(len(self.batches.created), 1)
        self.assertEqual(self.classify.call_count, 0)

    def test_run_state_without_a_mode_is_read_as_before(self):
        # delete "mode" from run_state.json of an interrupted direct run, resume: no batch is created


class ParallelDirectTests(ResumeTestCase):
    workers = 4

    def test_out_of_order_direct_run_keeps_rows_aligned(self):
        # classify sleeps longest for the first company and returns confidence = 60 + position
        self.assertEqual([r["signal_score_llm"] for r in results], [60, 61, 62, 63, 64, 65])
```

- [x] **Step 3: Run them, expect failure.** Run: `python -m unittest tests.test_resume -v`

- [x] **Step 4: Implement** the mode decision and the parallel direct pipeline.

- [x] **Step 5: Run all tests.** Run: `python -m unittest discover tests` — Expected: OK

- [x] **Step 6: Commit** — `Classify small runs with direct calls`

---

### Task 5: Reuse the EPO client and drop the fixed sleeps

**Files:**
- Modify: `pipeline/epo_bridge.py:50-106`, `:156-184`
- Test: `tests/test_fixes.py` (`EpoBridgeTests`)

**Interfaces:**
- Produces: `epo_bridge._epo_runtime(epo_key: str, epo_secret: str, epo_package_dir: str) -> Tuple[EPOClient, DeepTechClassifier, Dict[str, Any]]` — built once per `(epo_key, epo_package_dir)` and cached in a module-level dict. Only ever called from the EPO lane thread (Task 2), so it needs no lock.

Decisions:
- `_build_epo_config`: `"search_delay_seconds": 0`, `"detail_delay_seconds": 0`.
- Delete the `time.sleep(epo_config["api"]["search_delay_seconds"])` at `epo_bridge.py:180` and its comment. The library's `Throttler` already waits `60 / limit` before each request.
- `lib/epo_patent/processors/patent_fetcher.py` is not edited here; it sleeps for `detail_delay_seconds`, which is now `0`.

- [ ] **Step 1: Write the failing tests**

```python
def test_no_fixed_delays_are_configured(self):
    api = epo_bridge._build_epo_config("k", "s", "/pkg")["api"]
    self.assertEqual((api["search_delay_seconds"], api["detail_delay_seconds"]), (0, 0))

def test_client_is_built_once_and_lookup_does_not_sleep(self):
    # inject fake core.api_client / processors.* / utils.* modules with mock.patch.dict(sys.modules, …);
    # the fake search_and_process_company returns ("No Results Found", "", "0", [])
    with mock.patch.object(epo_bridge.time, "sleep") as sleep:
        epo_bridge.run_epo_lookup("A", "k", "s", pkg_dir)
        epo_bridge.run_epo_lookup("B", "k", "s", pkg_dir)
    self.assertEqual(fake_client_class.call_count, 1)
    sleep.assert_not_called()
```

- [ ] **Step 2: Run them, expect failure.** Run: `python -m unittest tests.test_fixes.EpoBridgeTests -v`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run all tests.** Run: `python -m unittest discover tests` — Expected: OK
- [ ] **Step 5: Commit** — `Reuse the EPO client and remove fixed delays`

---

### Task 6: Read patent details from the search response

One request per company instead of one plus one per patent. **This task starts with a check against the live EPO service; if the check fails, stop and report rather than build the rest.**

**Files:**
- Create: `tests/fixtures/epo/search_biblio_lionsbot.xml`, `tests/test_epo_search_biblio.py`
- Modify: `lib/epo_patent/core/api_client.py:52-107`, `lib/epo_patent/processors/patent_fetcher.py`, `lib/epo_patent/processors/company_processor.py:135-333`, `pipeline/epo_bridge.py` (`_build_epo_config`)

**Interfaces:**
- Produces:
  - `EPOClient.search_patents(cql_query: str, range_begin: int = 1, range_end: int = 10, constituents: Optional[List[str]] = None) -> str` — passes `constituents` to `published_data_search`. The cache key adds `constituents=",".join(constituents)` only when constituents are given, so existing cached plain searches stay valid.
  - `patent_fetcher.build_patent_from_document(doc_element: ET.Element, original_search_name: str, namespaces: Dict[str, str], country_code_map: Dict[str, str], deeptech_classifier=None) -> Dict[str, Any]` — same dict shape as `fetch_patent_details` returns, `biblio_status` `"Success"`. `fetch_patent_details` calls it for its own parsing so there is one parser.
  - Config switch `api.search_with_biblio` (bool). `_build_epo_config` sets it to `True`. When absent or false, `search_and_process_company` behaves exactly as today.

Decisions:
- With the switch on, `search_and_process_company` searches with `constituents=["biblio"]` and builds each patent from its `exchange:exchange-document` element in the response.
- A search hit whose document has no `exchange:bibliographic-data` falls back to `fetch_patent_details` for that publication.
- Search validation (`SearchValidator`) runs on the resulting list unchanged.

- [ ] **Step 1: Capture a real response (needs `EPO_KEY` / `EPO_SECRET`, uses one search).** Call `Client.published_data_search(cql='pa="LIONSBOT INTERNATIONAL PTE. LTD."', range_begin=1, range_end=10, constituents=["biblio"])` and save `response.text` to `tests/fixtures/epo/search_biblio_lionsbot.xml`.

  Check by eye that the file has ten `exchange-document` elements, each with `bibliographic-data` containing classification data. **If it does not, stop here**: record what the response contains in this plan and skip to Task 7.

- [ ] **Step 2: Write the failing tests** in `tests/test_epo_search_biblio.py`. Expected values come from the per-patent run in `runs/run_20261116_213044/process.log`; if EPO has published newer LionsBot patents since, take the expected values for the same checks from the fixture's own publications.

```python
def test_patents_are_built_from_the_search_response_without_detail_requests(self):
    # epo_client.search_patents returns the fixture; get_biblio_data is a Mock
    status, _, total, patents = search_and_process_company(…, config={"api": {"search_with_biblio": True}, …})
    self.assertEqual(status, "Found - Success")
    self.assertEqual(len(patents), 10)
    epo_client.get_biblio_data.assert_not_called()
    by_number = {p["publication_number"]: p for p in patents}
    self.assertEqual(by_number["WO2024218728A1"]["cpc_codes"], [
        "G05D 1/2297", "G05D 1/242", "G05D 1/2446", "G05D 1/246", "G05D 1/6484",
        "G05D 2105/10", "G05D 2107/60", "G05D 2109/10", "G05D 2111/10", "G05D 2111/17"])
    self.assertEqual(by_number["USD1057335S"]["cpc_codes"], [])
    self.assertEqual(by_number["WO2023219564A1"]["deeptech_classification"]["deeptech_level"], "Very Strong")

def test_a_hit_without_details_falls_back_to_the_detail_request(self):
    # fixture with bibliographic-data removed from one exchange-document
    self.assertEqual(epo_client.get_biblio_data.call_count, 1)
    self.assertEqual(len(patents), 10)

def test_switch_off_keeps_the_per_patent_requests(self):
    self.assertEqual(epo_client.get_biblio_data.call_count, 10)

def test_search_cache_key_differs_with_and_without_constituents(self): ...
```

- [ ] **Step 3: Run them, expect failure.** Run: `python -m unittest tests.test_epo_search_biblio -v`
- [ ] **Step 4: Implement** in the order: `build_patent_from_document` (extracted from `fetch_patent_details`), `search_patents` constituents, the `company_processor` branch, the config switch.
- [ ] **Step 5: Run all tests.** Run: `python -m unittest discover tests` — Expected: OK
- [ ] **Step 6: Commit** — `Read patent details from the EPO search response`

---

### Task 7: Stop rewriting the Excel checkpoint every ten companies

The whole workbook is rewritten every `checkpoint_interval` (10) companies: 500 rewrites over a 5,000-company run, each larger than the last. The cost has not been measured, so measure first.

**Files:**
- Modify: `pipeline/orchestrator.py` (the two `record` functions from Tasks 3 and 4), `config.template.json`
- Test: `tests/test_resume.py`

- [ ] **Step 1: Measure.** Time one `data.writer.write_incremental` call for 5,000 rows built with `_error_result`-shaped results. **If it takes under 0.5s, skip this task** and note the figure here.

- [ ] **Step 2: Write the failing test**

```python
def test_excel_checkpoints_are_rate_limited_but_the_last_one_is_always_written(self):
    # 6 companies, checkpoint_interval 2, pipeline.excel_checkpoint_min_interval_s 3600; orch.write_incremental patched
    self.assertEqual(write.call_count, 1)

def test_zero_interval_writes_at_every_checkpoint(self):
    # same run with excel_checkpoint_min_interval_s 0
    self.assertEqual(write.call_count, 3)
```

- [ ] **Step 3: Implement.** New setting `pipeline.excel_checkpoint_min_interval_s`, default `60` in code and in `config.template.json`. A checkpoint that is due is skipped when the previous one (or the start of the phase) was less than that many seconds ago. The write after the last company always happens. The JSONL checkpoint, which is what resume and the web app read, is unaffected.

- [ ] **Step 4: Run all tests.** Run: `python -m unittest discover tests` — Expected: OK
- [ ] **Step 5: Commit** — `Rate-limit Excel checkpoints`

---

### Task 8: Estimate, documentation and a measured run

**Files:**
- Modify: `webapp/estimate.py:18-27`, `:80-103`, `tests/test_webapp/test_estimate.py`, `README.md`, `PROJECT_OVERVIEW.md`

**Interfaces:**
- Consumes: `DEFAULT_WORKERS`, `DEFAULT_BATCH_MIN_COMPANIES` from `pipeline/parallel.py`

Decisions for `estimate()`:
- `batch` is true only when the batch setting is on, the provider supports it, **and** `rows >= DEFAULT_BATCH_MIN_COMPANIES`. The classifier discount follows `batch`.
- Replace `SECONDS_PER_COMPANY`, `_NO_ENRICHMENT_TIME` and `_NO_VALIDATION_TIME` with:

```python
ENRICH_SECS = 7            # measured, run_20261116_213044
VALIDATE_SECS = 21         # measured
CLASSIFY_DIRECT_SECS = 20  # assumption, not yet measured
EPO_SECS = 17              # measured at EPO's 5-searches-per-minute limit
BATCH_OVERHEAD_SECS = 360  # measured once, for 4 requests

gather   = max(rows * EPO_SECS if epo else 0, rows * ENRICH_SECS / workers if enrichment else 0)
classify = BATCH_OVERHEAD_SECS if batch else rows * CLASSIFY_DIRECT_SECS / workers
validate = rows * share * VALIDATE_SECS / workers if validator else 0
secs     = gather + classify + validate          # workers = DEFAULT_WORKERS
```

- Token and validated-share constants are left alone (see Out of scope).

- [ ] **Step 1: Update `tests/test_webapp/test_estimate.py`** for the new duration model. Add:

```python
def test_small_run_is_not_estimated_as_a_batch(self):
    self.assertFalse(estimate(settings(batch=True), rows=99)["batch"])
    self.assertTrue(estimate(settings(batch=True), rows=100)["batch"])

def test_epo_sets_the_floor_for_large_runs(self):
    self.assertGreaterEqual(estimate(settings(epo=True), rows=5000)["secs"], 5000 * 17)
```

- [ ] **Step 2: Run, expect failure; implement; run all tests.** Run: `python -m unittest discover tests` — Expected: OK

- [ ] **Step 3: Document** in `README.md` and `PROJECT_OVERVIEW.md`: `concurrency.workers` (and that `1` is fully sequential), `batch.min_companies`, `pipeline.excel_checkpoint_min_interval_s`, and that EPO's search quota is the floor for large runs.

- [ ] **Step 4: Measured run, small.** Run the same input as the baseline (`runs/run_20261116_213044/input/companies.xlsx`) with a clean EPO cache (`lib/epo_patent/cache/`).
  Expected: about 2 minutes (baseline 614s); all four classified `general tech` as in the baseline; no `Rate limit` lines in the log. Record the phase timings in this plan.

- [ ] **Step 5: Measured run, 50 companies** from the real dataset, direct mode.
  Expected: no `Rate limit` warnings. If there are any, lower `concurrency.workers` to 4, rerun, and record which value was clean. Replace `CLASSIFY_DIRECT_SECS` with the measured figure.

- [ ] **Step 6: Accuracy check.** Run: `python -m tests.reference.check`. Expected: same pass result as before this plan.

- [ ] **Step 7: Commit** — `Update the run estimate and document concurrency settings`

---

## Out of scope

- **Validator threshold.** 3 of 4 companies were validated at threshold 70. Lowering it would save more time and money than any task here, but it changes results; it is a quality decision, and four companies are too few to base it on.
- **Cost estimate constants** in `webapp/estimate.py`. The baseline run cost $0.048 per company, well above what the current constants predict. Recalibrate from the 50-company run in Task 8.
- **Running the validator through the Batch API.** Would halve its cost; needs a check that web search works inside batch jobs.
- **Parallel online retries** for failed batch items (`orchestrator.py:568`). Normally a handful of companies.
- **A worker-count control in the web app.** `config.json` is enough until someone asks.
