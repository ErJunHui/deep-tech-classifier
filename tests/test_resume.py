"""
Resume / checkpoint regression tests. No network or API keys needed:
    python -m unittest discover tests
"""

import logging
import os
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline import epo_bridge, orchestrator as orch  # noqa: E402
from pipeline.epo_bridge import EPOResult  # noqa: E402
from pipeline.model_resolver import ModelSetupError  # noqa: E402
from pipeline.orchestrator import (  # noqa: E402
    ModelChangedError, ResumeError, load_partial_results, run_pipeline,
)

CONFIG = {
    "pipeline": {"checkpoint_interval": 2},
    "validation": {"validator_enabled": False},
    "epo": {"enabled": False},
    "enrichment": {"enabled": True},
    "concurrency": {"workers": 1},
}

ENRICH_FAILED = {"web_description": None, "web_fetch_status": "error"}

ENRICH_OK = {
    "web_description": "desc", "web_description_source": "example.com",
    "web_fetch_status": "found", "enrichment_input_tokens": 5,
    "enrichment_output_tokens": 5, "enrichment_searches": 1,
}


def _companies(names):
    return [
        {"company_name": n, "description": "d", "_original_row": {"company_name": n}}
        for n in names
    ]


def _agent1(confidence=90):
    return {
        "classification": "general tech", "confidence": confidence, "reasoning": "r",
        "classifier_input_tokens": 10, "classifier_output_tokens": 10,
        "classifier_cache_read_tokens": 0, "classifier_cache_creation_tokens": 0,
        "classifier_cost_usd": 0.001,
    }


class _FakeBatches:
    """Stands in for client.beta.messages.batches."""

    def __init__(self):
        self.created = []

    def create(self, requests):
        self.created.append(requests)
        return SimpleNamespace(id="batch_1")

    def retrieve(self, batch_id):
        return SimpleNamespace(processing_status="ended", request_counts={})

    def results(self, batch_id):
        text = '{"classification": "deep tech", "confidence": 80, "reasoning": "r"}'
        for req in self.created[-1]:
            payload = {
                "custom_id": req["custom_id"],
                "result": {"type": "succeeded", "message": {
                    "content": [{"type": "text", "text": text}],
                    "usage": {"input_tokens": 10, "output_tokens": 10},
                }},
            }
            yield SimpleNamespace(model_dump=lambda p=payload: p)


class _Records(logging.Handler):
    """Keeps the warnings and errors logged during a test."""

    def __init__(self):
        super().__init__(logging.WARNING)
        self.records = []

    def emit(self, record):
        self.records.append(record)


class ResumeTestCase(unittest.TestCase):
    batching = False
    workers = 1

    def setUp(self):
        # The pipeline's warnings (model not reference-checked, missing
        # criteria, checkpoint not found...) go here instead of stderr, for
        # the tests to assert on.
        self.logged = _Records()
        for name in ("pipeline", "agents"):
            parent = logging.getLogger(name)
            parent.addHandler(self.logged)
            self.addCleanup(parent.removeHandler, self.logged)
            quiet = mock.patch.object(parent, "propagate", False)
            quiet.start()
            self.addCleanup(quiet.stop)
        self._cwd = os.getcwd()
        self._tmp = tempfile.TemporaryDirectory()
        os.chdir(self._tmp.name)
        self.batches = _FakeBatches()
        provider = self.provider = SimpleNamespace(
            supports_batching=self.batching, provider_name="fake", model_name="fake",
            raw_client=SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(batches=self.batches))),
            reported_model="fake-v1", model_drift=None, search_model_name=None,
            resolution=SimpleNamespace(source="tier", tier="fast"),
            smoke_test=mock.Mock(side_effect=lambda temperature: provider.reported_model),
            note_model=mock.Mock(),
        )
        self.build = mock.Mock(return_value=provider)
        self.enrich = mock.Mock(return_value=dict(ENRICH_OK))
        self.classify = mock.Mock(side_effect=lambda **kw: _agent1())
        for target, repl in (
            ("build_provider", self.build),
            ("_rates_for", lambda provider: {"input": 1e-6, "output": 5e-6,
                                             "cache_write": 0.0, "cache_read": 0.0}),
            ("agent0_enrich", self.enrich),
            ("agent1_classify", self.classify),
        ):
            p = mock.patch.object(orch, target, repl)
            p.start()
            self.addCleanup(p.stop)

    def tearDown(self):
        os.chdir(self._cwd)
        self._tmp.cleanup()

    def logged_messages(self):
        return [record.getMessage() for record in self.logged.records]

    def gathered_path(self) -> str:
        return f"checkpoints/llm/gathered_{orch.load_run_state()['run_id']}.jsonl"

    def run_pipeline(self, companies, resume=False, llm=None, epo=False, batch_min=0):
        config = {**CONFIG, "batch": {"enabled": self.batching, "batch_poll_interval_s": 0,
                                      "min_companies": batch_min}}
        config["llm"] = {"provider": "fake", **(llm or {})}
        config["concurrency"] = {"workers": self.workers}
        run_id = orch.load_run_state()["run_id"] if resume else None
        if not epo:
            return run_pipeline(companies, config, "out.xlsx", resume_run_id=run_id)
        config["epo"] = {"enabled": True}
        with mock.patch.dict(os.environ, {"EPO_KEY": "k", "EPO_SECRET": "s"}):
            return run_pipeline(companies, config, "out.xlsx", resume_run_id=run_id)

    def phase1_warnings(self):
        return [m for m in self.logged_messages() if m.startswith("Phase 1:")]


class SequentialResumeTests(ResumeTestCase):
    def test_interrupt_then_resume_keeps_types_and_skips_done(self):
        companies = _companies(["A", "B", "C", "D"])
        self.classify.side_effect = [_agent1(), _agent1(), KeyboardInterrupt()]
        with self.assertRaises(KeyboardInterrupt):
            self.run_pipeline(companies)

        done_companies, done_results = load_partial_results(companies)
        self.assertEqual([c["company_name"] for c in done_companies], ["A", "B"])
        self.assertEqual(len(done_results), 2)

        self.classify.reset_mock(side_effect=True)
        self.classify.side_effect = lambda **kw: _agent1()
        results = self.run_pipeline(companies, resume=True)

        self.assertEqual(self.classify.call_count, 2)  # only C and D
        self.assertEqual([r["company_name"] for r in results], ["A", "B", "C", "D"])
        for r in results:
            self.assertIsInstance(r["confidence"], int)
            self.assertIs(r["validator_triggered"], False)
            self.assertIsInstance(r["total_cost_usd"], float)
        self.assertTrue(Path("out.xlsx").exists())

    def test_error_rows_are_retried_and_do_not_corrupt_other_rows(self):
        companies = _companies(["A", "B", "C"])
        self.classify.side_effect = [_agent1(), RuntimeError("boom"), _agent1()]
        results = self.run_pipeline(companies)
        self.assertEqual([r["classification"] for r in results], ["general tech", "error", "general tech"])
        self.assertIn("Unhandled error processing 'B': boom", self.logged_messages())

        self.classify.reset_mock(side_effect=True)
        self.classify.side_effect = lambda **kw: _agent1()
        results = self.run_pipeline(companies, resume=True)

        self.assertEqual(self.classify.call_count, 1)  # only B
        self.assertEqual([r["company_name"] for r in results], ["A", "B", "C"])
        self.assertEqual([r["classification"] for r in results], ["general tech"] * 3)

    def test_duplicate_names_are_each_processed_and_stay_aligned(self):
        companies = _companies(["A", "Dup", "Dup", "Z"])
        self.classify.side_effect = [_agent1(11), _agent1(22), KeyboardInterrupt()]
        with self.assertRaises(KeyboardInterrupt):
            self.run_pipeline(companies)

        self.classify.reset_mock(side_effect=True)
        self.classify.side_effect = [_agent1(33), _agent1(44)]
        results = self.run_pipeline(companies, resume=True)

        self.assertEqual([r["company_name"] for r in results], ["A", "Dup", "Dup", "Z"])
        self.assertEqual([r["signal_score_llm"] for r in results], [11, 22, 33, 44])

    def test_resume_against_a_different_input_is_refused(self):
        self.run_pipeline(_companies(["A", "B"]))
        with self.assertRaises(ResumeError):
            self.run_pipeline(_companies(["X", "B"]), resume=True)

    def test_torn_last_checkpoint_line_is_dropped(self):
        companies = _companies(["A", "B"])
        self.run_pipeline(companies)
        path = orch._llm_checkpoint_path(orch.load_run_state()["run_id"])
        with open(path, "a", encoding="utf-8") as f:
            f.write('{"index": 1, "result": {"compa')
        _, results = load_partial_results(companies)
        self.assertEqual(len(results), 2)
        self.assertIn(f"Dropping incomplete last line of {path} (interrupted write).", self.logged_messages())


class BatchResumeTests(ResumeTestCase):
    batching = True

    def test_phase1_interrupt_resumes_without_regathering(self):
        companies = _companies(["A", "B", "C"])
        self.enrich.side_effect = [dict(ENRICH_OK), dict(ENRICH_OK), KeyboardInterrupt()]
        with self.assertRaises(KeyboardInterrupt):
            self.run_pipeline(companies)
        self.assertEqual(self.batches.created, [])

        self.enrich.reset_mock(side_effect=True)
        self.enrich.return_value = dict(ENRICH_OK)
        results = self.run_pipeline(companies, resume=True)

        self.assertEqual(self.enrich.call_count, 1)  # only C
        self.assertEqual(len(self.batches.created), 1)
        self.assertEqual([r["company_name"] for r in results], ["A", "B", "C"])
        self.assertEqual([r["classification"] for r in results], ["deep tech"] * 3)

    def test_resume_of_finished_run_redoes_nothing(self):
        companies = _companies(["A", "Dup", "Dup"])
        first = self.run_pipeline(companies)
        self.enrich.reset_mock()
        second = self.run_pipeline(companies, resume=True)

        self.assertEqual(self.enrich.call_count, 0)
        self.assertEqual(len(self.batches.created), 1)
        self.assertEqual(first, second)


class ParallelBatchTests(ResumeTestCase):
    batching = True
    workers = 4

    def test_out_of_order_gathering_keeps_rows_aligned(self):
        names = ["A", "Dup", "Dup", "D", "E", "F"]
        delays = dict(zip(range(6), (0.06, 0.05, 0.04, 0.03, 0.02, 0.01)))
        companies = _companies(names)
        for i, company in enumerate(companies):
            company["uen"] = str(i)  # tells the two "Dup" rows apart

        lock, running, most_running = threading.Lock(), [0], [0]

        def enrich(**kw):
            i = int(kw["uen"])
            with lock:
                running[0] += 1
                most_running[0] = max(most_running[0], running[0])
            time.sleep(delays[i])  # later rows finish first
            with lock:
                running[0] -= 1
            return {**ENRICH_OK, "web_description": f"desc {i}"}

        self.enrich.side_effect = enrich
        results = self.run_pipeline(companies)
        self.assertGreater(most_running[0], 1)  # companies were gathered side by side
        self.assertEqual([r["company_name"] for r in results], names)
        self.assertEqual([r["web_description"] for r in results], [f"desc {i}" for i in range(6)])

    def test_interrupt_while_gathering_then_resume_gathers_only_the_rest(self):
        companies = _companies(list("ABCDEFGH"))

        def enrich(**kw):
            if kw["company_name"] == "D":
                time.sleep(0.05)  # other rows keep finishing meanwhile
                raise KeyboardInterrupt()
            return dict(ENRICH_OK)

        self.enrich.side_effect = enrich
        with self.assertRaises(KeyboardInterrupt):
            self.run_pipeline(companies)
        self.assertEqual(self.batches.created, [])
        gathered = orch._load_gathered(self.gathered_path())
        self.assertNotIn(3, gathered)  # D never finished
        gathered_before = len(gathered)
        self.assertLess(gathered_before, 8)

        self.enrich.reset_mock(side_effect=True)
        self.enrich.return_value = dict(ENRICH_OK)
        results = self.run_pipeline(companies, resume=True)
        self.assertEqual(self.enrich.call_count, 8 - gathered_before)
        self.assertEqual([r["company_name"] for r in results], list("ABCDEFGH"))

    def test_enrichment_failures_are_counted_in_one_warning(self):
        failed = {"B", "D"}
        self.enrich.side_effect = lambda **kw: (
            dict(ENRICH_FAILED) if kw["company_name"] in failed else dict(ENRICH_OK))
        self.run_pipeline(_companies(list("ABCDE")))
        self.assertIn("Phase 1: 2 companies have no web description because enrichment failed.",
                      self.logged_messages())


class ParallelValidationTests(ResumeTestCase):
    batching = True
    workers = 4
    names = list("ABCDEF")

    def setUp(self):
        super().setUp()
        self.validate = mock.Mock(side_effect=self.confirm)
        p = mock.patch.object(orch, "agent2_validate", self.validate)
        p.start()
        self.addCleanup(p.stop)
        # Threshold 101 sends every company to the validator.
        p = mock.patch.dict(CONFIG, {"validation": {
            "validator_enabled": True, "validator_threshold": 101}})
        p.start()
        self.addCleanup(p.stop)

    def confirm(self, **kw):
        return {"validator_verdict": "confirm", "final_classification": "deep tech",
                "updated_confidence": 50 + self.names.index(kw["company_name"])}

    def test_out_of_order_validation_keeps_rows_aligned(self):
        lock, running, most_running = threading.Lock(), [0], [0]

        def validate(**kw):
            with lock:
                running[0] += 1
                most_running[0] = max(most_running[0], running[0])
            time.sleep(0.06 - 0.01 * self.names.index(kw["company_name"]))  # later rows finish first
            with lock:
                running[0] -= 1
            return self.confirm(**kw)

        self.validate.side_effect = validate
        results = self.run_pipeline(_companies(self.names))
        self.assertGreater(most_running[0], 1)  # companies were validated side by side
        self.assertEqual([r["company_name"] for r in results], self.names)
        self.assertEqual([r["confidence"] for r in results], [50, 51, 52, 53, 54, 55])

    def test_model_drift_during_validation_stops_the_run_and_resume_finishes_it(self):
        companies = _companies(self.names)
        lock, calls = threading.Lock(), [0]

        def validate(**kw):
            with lock:
                calls[0] += 1
                if calls[0] == 3:
                    self.provider.model_drift = ("fake-v1", "fake-v2")
            return self.confirm(**kw)

        self.validate.side_effect = validate
        with self.assertRaises(ModelChangedError):
            self.run_pipeline(companies)
        _, partial = load_partial_results(companies)
        self.assertLess(len(partial), 6)

        self.provider.model_drift = None
        self.validate.reset_mock(side_effect=True)
        self.validate.side_effect = self.confirm
        results = self.run_pipeline(companies, resume=True)
        self.assertEqual(self.validate.call_count, 6 - len(partial))
        self.assertEqual([r["confidence"] for r in results], [50, 51, 52, 53, 54, 55])

    def test_interrupt_during_validation_then_resume_validates_only_the_rest(self):
        companies = _companies(self.names)

        def validate(**kw):
            if kw["company_name"] == "D":
                time.sleep(0.05)  # other rows keep finishing meanwhile
                raise KeyboardInterrupt()
            return self.confirm(**kw)

        self.validate.side_effect = validate
        with self.assertRaises(KeyboardInterrupt):
            self.run_pipeline(companies)
        done_companies, partial = load_partial_results(companies)
        self.assertNotIn("D", [c["company_name"] for c in done_companies])  # D never finished
        done_before = len(partial)

        self.enrich.reset_mock()
        self.validate.reset_mock(side_effect=True)
        self.validate.side_effect = self.confirm
        results = self.run_pipeline(companies, resume=True)
        self.assertEqual(self.validate.call_count, 6 - done_before)
        self.assertEqual(self.enrich.call_count, 0)        # Phase 1 not redone
        self.assertEqual(len(self.batches.created), 1)     # batch not resubmitted
        self.assertEqual([r["company_name"] for r in results], self.names)
        self.assertEqual([r["confidence"] for r in results], [50, 51, 52, 53, 54, 55])


class RunModeTests(ResumeTestCase):
    batching = True

    def interrupt_in_phase1(self, companies, batch_min):
        self.enrich.side_effect = [dict(ENRICH_OK), KeyboardInterrupt()]
        with self.assertRaises(KeyboardInterrupt):
            self.run_pipeline(companies, batch_min=batch_min)
        self.enrich.reset_mock(side_effect=True)
        self.enrich.return_value = dict(ENRICH_OK)

    def interrupt_while_classifying(self, companies, batch_min):
        self.classify.side_effect = [_agent1(), KeyboardInterrupt()]
        with self.assertRaises(KeyboardInterrupt):
            self.run_pipeline(companies, batch_min=batch_min)
        self.classify.reset_mock(side_effect=True)
        self.classify.side_effect = lambda **kw: _agent1()

    def forget_mode(self):
        """Make the run state look like one written before runs recorded their mode."""
        state = orch.load_run_state()
        del state["mode"]
        orch._save_run_state(state)

    def test_small_run_classifies_directly_without_a_batch_job(self):
        with self.assertLogs("pipeline.orchestrator", level="INFO") as logs:
            results = self.run_pipeline(_companies(["A", "B", "C"]), batch_min=100)
        self.assertEqual(self.batches.created, [])
        self.assertEqual(self.classify.call_count, 3)
        self.assertEqual(orch.load_run_state()["mode"], "direct")
        self.assertEqual([r["company_name"] for r in results], ["A", "B", "C"])
        self.assertIn(
            "INFO:pipeline.orchestrator:Classifying 3 companies with direct calls "
            "(batch jobs are used from 100 companies).", logs.output)

    def test_run_at_the_threshold_uses_a_batch_job(self):
        self.run_pipeline(_companies(["A", "B", "C"]), batch_min=3)
        self.assertEqual(len(self.batches.created), 1)
        self.assertEqual(self.classify.call_count, 0)
        self.assertEqual(orch.load_run_state()["mode"], "batch")

    def test_mode_is_recorded_before_any_company_is_processed(self):
        self.interrupt_in_phase1(_companies(["A", "B", "C"]), batch_min=0)
        self.assertEqual(orch.load_run_state()["mode"], "batch")

    def test_resume_keeps_the_mode_the_run_started_with(self):
        companies = _companies(["A", "B", "C"])
        self.interrupt_in_phase1(companies, batch_min=0)
        results = self.run_pipeline(companies, resume=True, batch_min=100)
        self.assertEqual(len(self.batches.created), 1)
        self.assertEqual(self.classify.call_count, 0)
        self.assertEqual(self.enrich.call_count, 2)  # only B and C
        self.assertEqual([r["classification"] for r in results], ["deep tech"] * 3)

    def test_resume_of_a_direct_run_stays_direct(self):
        companies = _companies(["A", "B", "C"])
        self.interrupt_while_classifying(companies, batch_min=100)
        self.run_pipeline(companies, resume=True, batch_min=0)
        self.assertEqual(self.batches.created, [])
        self.assertEqual(self.classify.call_count, 2)  # only B and C

    def test_run_state_without_a_mode_is_read_as_before(self):
        companies = _companies(["A", "B", "C"])
        self.interrupt_while_classifying(companies, batch_min=100)
        self.forget_mode()
        results = self.run_pipeline(companies, resume=True, batch_min=0)
        self.assertEqual(self.batches.created, [])
        self.assertEqual(self.classify.call_count, 2)  # only B and C
        self.assertEqual([r["company_name"] for r in results], ["A", "B", "C"])
        self.assertEqual(orch.load_run_state()["mode"], "direct")

    def test_batch_run_state_without_a_mode_is_resumed_as_a_batch(self):
        companies = _companies(["A", "B", "C"])
        self.interrupt_in_phase1(companies, batch_min=0)
        self.forget_mode()
        self.run_pipeline(companies, resume=True, batch_min=100)
        self.assertEqual(len(self.batches.created), 1)
        self.assertEqual(self.classify.call_count, 0)
        self.assertEqual(orch.load_run_state()["mode"], "batch")


class ParallelDirectTests(ResumeTestCase):
    workers = 4
    names = list("ABCDEF")

    def classify_as(self, **kw):
        return _agent1(60 + self.names.index(kw["company_name"]))

    def test_out_of_order_direct_run_keeps_rows_aligned(self):
        lock, running, most_running = threading.Lock(), [0], [0]

        def classify(**kw):
            with lock:
                running[0] += 1
                most_running[0] = max(most_running[0], running[0])
            time.sleep(0.06 - 0.01 * self.names.index(kw["company_name"]))  # later rows finish first
            with lock:
                running[0] -= 1
            return self.classify_as(**kw)

        self.classify.side_effect = classify
        results = self.run_pipeline(_companies(self.names))
        self.assertGreater(most_running[0], 1)  # companies were classified side by side
        self.assertEqual([r["company_name"] for r in results], self.names)
        self.assertEqual([r["signal_score_llm"] for r in results], [60, 61, 62, 63, 64, 65])
        self.assertTrue(Path("out.xlsx").exists())

    def test_interrupt_then_resume_classifies_only_the_rest(self):
        companies = _companies(self.names)

        def classify(**kw):
            if kw["company_name"] == "D":
                time.sleep(0.05)  # other rows keep finishing meanwhile
                raise KeyboardInterrupt()
            return self.classify_as(**kw)

        self.classify.side_effect = classify
        with self.assertRaises(KeyboardInterrupt):
            self.run_pipeline(companies)
        done_companies, partial = load_partial_results(companies)
        self.assertNotIn("D", [c["company_name"] for c in done_companies])  # D never finished
        done_before = len(partial)

        self.classify.reset_mock(side_effect=True)
        self.classify.side_effect = self.classify_as
        results = self.run_pipeline(companies, resume=True)
        self.assertEqual(self.classify.call_count, 6 - done_before)
        self.assertEqual([r["company_name"] for r in results], self.names)
        self.assertEqual([r["signal_score_llm"] for r in results], [60, 61, 62, 63, 64, 65])

    def test_model_drift_stops_the_run_without_saving_later_rows(self):
        companies = _companies(self.names)
        lock, calls = threading.Lock(), [0]

        def classify(**kw):
            with lock:
                calls[0] += 1
                if calls[0] == 3:
                    self.provider.model_drift = ("fake-v1", "fake-v2")
            return self.classify_as(**kw)

        self.classify.side_effect = classify
        with self.assertRaises(ModelChangedError):
            self.run_pipeline(companies)
        _, partial = load_partial_results(companies)
        self.assertLess(len(partial), 3)

    def test_patent_lookups_run_on_the_epo_thread(self):
        threads = []

        def lookup(*args, **kwargs):
            threads.append(threading.current_thread().name)
            return EPOResult(raw_status="ok")

        # Patch both: the EPO lane calls epo_bridge's, the calling thread calls the orchestrator's.
        with mock.patch.object(epo_bridge, "run_epo_lookup", side_effect=lookup),                 mock.patch.object(orch, "run_epo_lookup", side_effect=lookup):
            self.run_pipeline(_companies(list("ABC")), epo=True)
        self.assertEqual(len(threads), 3)
        self.assertTrue(all(name.startswith("epo") for name in threads), threads)


class PatentLookupWarningTests(ResumeTestCase):
    batching = True
    workers = 4

    def fail_lookups_for(self, failed):
        # With several workers the lookup runs on the EPO lane, which calls epo_bridge's.
        def lookup(company_name, *args, **kwargs):
            status = "EPO Error: 503" if company_name in failed else "ok"
            return EPOResult(raw_status=status)

        p = mock.patch.object(epo_bridge, "run_epo_lookup", side_effect=lookup)
        p.start()
        self.addCleanup(p.stop)

    def test_failed_patent_lookups_are_counted(self):
        self.fail_lookups_for({"C"})
        self.run_pipeline(_companies(list("ABCD")), epo=True)
        self.assertEqual(self.phase1_warnings(), ["Phase 1: 1 patent lookups failed."])

    def test_both_kinds_of_failure_share_one_warning(self):
        self.fail_lookups_for({"C"})
        self.enrich.side_effect = lambda **kw: (
            dict(ENRICH_FAILED) if kw["company_name"] in {"A", "B"} else dict(ENRICH_OK))
        self.run_pipeline(_companies(list("ABCD")), epo=True)
        self.assertEqual(self.phase1_warnings(), [
            "Phase 1: 2 companies have no web description because enrichment failed; "
            "1 patent lookups failed."])


class GatheringWarningOnResumeTests(ResumeTestCase):
    batching = True

    def enrich_fails_for_b(self, **kw):
        return dict(ENRICH_FAILED if kw["company_name"] == "B" else ENRICH_OK)

    def test_resume_that_gathers_counts_every_gathered_record(self):
        companies = _companies(["A", "B", "C"])
        self.enrich.side_effect = [dict(ENRICH_OK), dict(ENRICH_FAILED), KeyboardInterrupt()]
        with self.assertRaises(KeyboardInterrupt):
            self.run_pipeline(companies)
        self.logged.records.clear()

        self.enrich.reset_mock(side_effect=True)
        self.enrich.return_value = dict(ENRICH_OK)
        self.run_pipeline(companies, resume=True)
        self.assertEqual(self.enrich.call_count, 1)  # only C; B's failure is on disk
        self.assertEqual(self.phase1_warnings(), [
            "Phase 1: 1 companies have no web description because enrichment failed."])

    def test_resume_that_loads_phase1_from_disk_does_not_warn_again(self):
        companies = _companies(["A", "B", "C"])
        self.enrich.side_effect = self.enrich_fails_for_b
        self.run_pipeline(companies)
        self.assertEqual(len(self.phase1_warnings()), 1)
        self.logged.records.clear()

        self.run_pipeline(companies, resume=True)
        self.assertEqual(self.phase1_warnings(), [])


class EPOLaneTests(ResumeTestCase):
    """EPO lookups run on the shared "epo" thread only when gathering in parallel."""

    def gather_threads(self, workers, lookup_module):
        """Gather three companies; return the thread each patent lookup ran on.

        lookup_module holds the run_epo_lookup that this worker count reaches.
        """
        threads = []

        def lookup(*args, **kwargs):
            threads.append(threading.current_thread().name)
            return EPOResult(raw_status="ok")

        p = mock.patch.object(lookup_module, "run_epo_lookup", side_effect=lookup)
        p.start()
        self.addCleanup(p.stop)
        orch._phase1_gather(
            companies=_companies(list("ABC")), gathered={}, gathered_path="gathered.jsonl",
            workers=workers, config=CONFIG, epo_enabled=True, epo_package_dir="",
            epo_key="k", epo_secret="s", enrichment_enabled=True, provider=self.provider,
        )
        return threads

    def test_one_worker_looks_up_patents_on_the_calling_thread(self):
        threads = self.gather_threads(workers=1, lookup_module=orch)
        self.assertEqual(threads, [threading.current_thread().name] * 3)

    def test_several_workers_look_up_patents_on_the_epo_thread(self):
        threads = self.gather_threads(workers=4, lookup_module=epo_bridge)
        self.assertEqual(len(threads), 3)
        self.assertTrue(all(name.startswith("epo") for name in threads), threads)


class LegacyGatheredFileTests(ResumeTestCase):
    batching = True

    def test_positional_gathered_file_from_an_older_run_is_resumed(self):
        companies = _companies(["A", "B", "C"])
        self.enrich.side_effect = [dict(ENRICH_OK), dict(ENRICH_OK), KeyboardInterrupt()]
        with self.assertRaises(KeyboardInterrupt):
            self.run_pipeline(companies)

        # Older runs wrote one bare company record per line, in row order.
        path = self.gathered_path()
        lines = orch._load_jsonl(path)
        self.assertEqual(len(lines), 2)
        orch._save_jsonl([line["record"] for line in lines], path)

        self.enrich.reset_mock(side_effect=True)
        self.enrich.return_value = dict(ENRICH_OK)
        results = self.run_pipeline(companies, resume=True)
        self.assertEqual(self.enrich.call_count, 1)  # only C
        self.assertEqual([r["company_name"] for r in results], ["A", "B", "C"])


class ModelLockTests(ResumeTestCase):
    def interrupt_after(self, companies, n):
        self.classify.side_effect = [_agent1()] * n + [KeyboardInterrupt()]
        with self.assertRaises(KeyboardInterrupt):
            self.run_pipeline(companies)
        self.classify.reset_mock(side_effect=True)
        self.classify.side_effect = lambda **kw: _agent1()

    def test_run_state_and_rows_record_the_model(self):
        results = self.run_pipeline(_companies(["A", "B"]))
        self.assertEqual(orch.load_run_state()["model"], {
            "provider": "fake", "requested": "fake", "reported": "fake-v1",
            "search_model": None, "source": "tier", "tier": "fast",
        })
        self.assertEqual([r["model"] for r in results], ["fake-v1", "fake-v1"])
        self.assertIn("No fake model has passed the reference check yet. "
                      "Run `python -m tests.reference.check` to confirm 'fake-v1' classifies as expected.",
                      self.logged_messages())
        self.assertIsNone(self.build.call_args.kwargs["model"])  # fresh run resolves

    def test_resume_reuses_the_checkpointed_model(self):
        companies = _companies(["A", "B", "C"])
        self.interrupt_after(companies, 1)
        self.run_pipeline(companies, resume=True)
        self.assertEqual(self.build.call_args.kwargs["model"], "fake")
        self.assertEqual(orch.load_run_state()["model"]["source"], "tier")

    def test_resume_with_the_same_model_pinned_is_allowed(self):
        companies = _companies(["A", "B"])
        self.interrupt_after(companies, 1)
        results = self.run_pipeline(companies, resume=True, llm={"model": "fake"})
        self.assertEqual(len(results), 2)

    def test_resume_with_a_different_pinned_model_is_refused(self):
        companies = _companies(["A", "B"])
        self.interrupt_after(companies, 1)
        with self.assertRaisesRegex(ResumeError, "config now pins 'other'"):
            self.run_pipeline(companies, resume=True, llm={"model": "other"})
        self.assertEqual(self.classify.call_count, 0)

    def test_resume_with_a_different_provider_is_refused(self):
        companies = _companies(["A", "B"])
        self.interrupt_after(companies, 1)
        with self.assertRaisesRegex(ResumeError, "provider"):
            self.run_pipeline(companies, resume=True, llm={"provider": "gemini"})

    def test_resume_stops_when_the_alias_now_answers_as_another_version(self):
        companies = _companies(["A", "B"])
        self.interrupt_after(companies, 1)
        self.provider.reported_model = "fake-v2"
        with self.assertRaisesRegex(ModelChangedError, "fake-v1.*fake-v2"):
            self.run_pipeline(companies, resume=True)
        self.assertEqual(self.classify.call_count, 0)

    def test_model_change_mid_run_stops_without_saving_that_row(self):
        companies = _companies(["A", "B", "C"])

        def classify(**kw):
            if self.classify.call_count == 2:
                self.provider.model_drift = ("fake-v1", "fake-v2")
            return _agent1()

        self.classify.side_effect = classify
        with self.assertRaises(ModelChangedError):
            self.run_pipeline(companies)
        done_companies, _ = load_partial_results(companies)
        self.assertEqual([c["company_name"] for c in done_companies], ["A"])

    def test_failed_startup_check_stops_before_any_company(self):
        self.provider.smoke_test.side_effect = RuntimeError("404 model not found")
        with self.assertRaisesRegex(ModelSetupError, "startup check.*404"):
            self.run_pipeline(_companies(["A"]))
        self.assertEqual(self.enrich.call_count, 0)


class BatchModelLockTests(ResumeTestCase):
    batching = True

    def test_batch_requests_use_the_locked_model_after_resume(self):
        companies = _companies(["A", "B"])
        self.enrich.side_effect = [dict(ENRICH_OK), KeyboardInterrupt()]
        with self.assertRaises(KeyboardInterrupt):
            self.run_pipeline(companies)
        self.enrich.reset_mock(side_effect=True)
        self.enrich.return_value = dict(ENRICH_OK)
        self.run_pipeline(companies, resume=True)
        self.assertEqual(self.build.call_args.kwargs["model"], "fake")
        self.assertEqual(orch.load_run_state()["model"]["requested"], "fake")


del ResumeTestCase  # base class only; keep unittest discovery from running it

if __name__ == "__main__":
    unittest.main()
