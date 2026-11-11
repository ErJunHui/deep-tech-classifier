"""
Resume / checkpoint regression tests. No network or API keys needed:
    python -m unittest discover tests
"""

import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline import orchestrator as orch  # noqa: E402
from pipeline.orchestrator import ResumeError, load_partial_results, run_pipeline  # noqa: E402

CONFIG = {
    "pipeline": {"checkpoint_interval": 2},
    "validation": {"validator_enabled": False},
    "epo": {"enabled": False},
    "enrichment": {"enabled": True},
}

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


class ResumeTestCase(unittest.TestCase):
    batching = False

    def setUp(self):
        self._cwd = os.getcwd()
        self._tmp = tempfile.TemporaryDirectory()
        os.chdir(self._tmp.name)
        self.batches = _FakeBatches()
        provider = SimpleNamespace(
            supports_batching=self.batching, provider_name="fake", model_name="fake",
            raw_client=SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(batches=self.batches))),
        )
        self.enrich = mock.Mock(return_value=dict(ENRICH_OK))
        self.classify = mock.Mock(side_effect=lambda **kw: _agent1())
        for target, repl in (
            ("build_provider", lambda config: provider),
            ("agent0_enrich", self.enrich),
            ("agent1_classify", self.classify),
        ):
            p = mock.patch.object(orch, target, repl)
            p.start()
            self.addCleanup(p.stop)

    def tearDown(self):
        os.chdir(self._cwd)
        self._tmp.cleanup()

    def run_pipeline(self, companies, resume=False):
        config = {**CONFIG, "batch": {"enabled": self.batching, "batch_poll_interval_s": 0}}
        run_id = orch.load_run_state()["run_id"] if resume else None
        return run_pipeline(companies, config, "out.xlsx", resume_run_id=run_id)


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
        self.assertEqual([r["signal_score_llm"] for r in results], [5, 11, 16, 22])

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


del ResumeTestCase  # base class only; keep unittest discovery from running it

if __name__ == "__main__":
    unittest.main()
