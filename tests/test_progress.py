"""
Progress-event tests (DTC_PROGRESS_FILE). No network or API keys needed:
    python -m unittest discover tests
"""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline import orchestrator as orch  # noqa: E402
from pipeline import progress  # noqa: E402
from pipeline.epo_bridge import EPOResult  # noqa: E402

ENV = "DTC_PROGRESS_FILE"

CONFIG = {
    "validation": {"validator_enabled": True},
    "epo": {"enabled": True},
    "enrichment": {"enabled": True},
}

ENRICH_OK = {
    "web_description": "desc", "web_description_source": "example.com",
    "web_fetch_status": "found", "enrichment_input_tokens": 5,
    "enrichment_output_tokens": 5, "enrichment_searches": 1,
}


def _agent1():
    return {
        "classification": "general tech", "confidence": 90, "reasoning": "r",
        "classifier_input_tokens": 10, "classifier_output_tokens": 10,
        "classifier_cache_read_tokens": 0, "classifier_cache_creation_tokens": 0,
        "classifier_cost_usd": 0.001,
    }


def _agent2():
    return {
        "validator_verdict": "confirm", "final_classification": "general tech",
        "updated_confidence": 80,
    }


class ProgressTestCase(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)
        self.path = self.tmp / "progress.jsonl"
        env = mock.patch.dict(os.environ)
        env.start()
        self.addCleanup(env.stop)
        os.environ.pop(ENV, None)

    def read_events(self):
        with open(self.path, encoding="utf-8") as f:
            return [json.loads(line) for line in f]


class EmitTests(ProgressTestCase):
    def test_emit_is_silent_without_env(self):
        progress.emit("step", index=0, step="Enrichment")
        self.assertEqual(list(self.tmp.iterdir()), [])

    def test_emit_appends_one_json_line_per_call(self):
        os.environ[ENV] = str(self.path)
        progress.emit("step", index=0, step="Enrichment")
        progress.emit("phase", phase="Classify in one batch job · 2 companies submitted")
        events = self.read_events()
        self.assertEqual(len(events), 2)
        self.assertEqual(
            (events[0]["kind"], events[0]["index"], events[0]["step"]),
            ("step", 0, "Enrichment"),
        )
        self.assertEqual(
            (events[1]["kind"], events[1]["index"], events[1]["phase"]),
            ("phase", None, "Classify in one batch job · 2 companies submitted"),
        )
        for e in events:
            self.assertEqual(set(e), {"kind", "index", "step", "phase", "at"})

    def test_emit_never_raises_on_unwritable_path(self):
        os.environ[ENV] = str(self.tmp / "missing" / "dir" / "progress.jsonl")
        progress.emit("step", index=0, step="Enrichment")  # must not raise
        self.assertFalse((self.tmp / "missing").exists())


class SequentialEmitTests(ProgressTestCase):
    def setUp(self):
        super().setUp()
        for target, repl in (
            ("agent0_enrich", mock.Mock(return_value=dict(ENRICH_OK))),
            ("run_epo_lookup", mock.Mock(return_value=EPOResult(raw_status="ok"))),
            ("agent1_classify", mock.Mock(side_effect=lambda **kw: _agent1())),
            ("agent2_validate", mock.Mock(side_effect=lambda **kw: _agent2())),
        ):
            p = mock.patch.object(orch, target, repl)
            p.start()
            self.addCleanup(p.stop)

    def test_sequential_run_emits_steps_in_order(self):
        os.environ[ENV] = str(self.path)
        provider = SimpleNamespace(model_name="fake", reported_model="fake-v1")
        result = orch._process_one_sequential(
            company={"company_name": "A", "description": "d"},
            config=CONFIG,
            epo_enabled=True,
            epo_package_dir="",
            epo_key="k",
            epo_secret="s",
            validator_enabled=True,
            validator_threshold=101,  # every score is below this: validator runs
            provider=provider,
            rates={"input": 0.0, "output": 0.0, "cache_write": 0.0, "cache_read": 0.0},
            enrichment_enabled=True,
            index=3,
        )
        self.assertTrue(result["validator_triggered"])
        steps = [e["step"] for e in self.read_events() if e["kind"] == "step" and e["index"] == 3]
        self.assertEqual(
            steps,
            ["Enrichment", "Patent lookup", "Classification", "Confidence scoring", "Validation"],
        )


_BATCH_TEXT = json.dumps({
    "classification": "deep tech", "confidence": 80, "reasoning": "r",
    "criteria": {
        k: {"met": True, "reasoning": "r"}
        for k in ("innovation", "scientific_foundation", "proprietary_ip")
    },
})


class _FakeBatches:
    """Stands in for client.beta.messages.batches; rows in `failed` come back errored."""

    def __init__(self, failed=()):
        self.created = []
        self.failed = {str(i) for i in failed}

    def create(self, requests):
        self.created.append(requests)
        return SimpleNamespace(id="batch_1")

    def retrieve(self, batch_id):
        return SimpleNamespace(processing_status="ended", request_counts={})

    def results(self, batch_id):
        for req in self.created[-1]:
            if req["custom_id"] in self.failed:
                result = {"type": "errored", "error": {"type": "server_error"}}
            else:
                result = {"type": "succeeded", "message": {
                    "content": [{"type": "text", "text": _BATCH_TEXT}],
                    "usage": {"input_tokens": 10, "output_tokens": 10},
                }}
            payload = {"custom_id": req["custom_id"], "result": result}
            yield SimpleNamespace(model_dump=lambda p=payload: p)


class BatchEmitTests(ProgressTestCase):
    """Drives run_pipeline down the batch path with the provider calls faked."""

    def setUp(self):
        super().setUp()
        work = tempfile.TemporaryDirectory()
        self.addCleanup(work.cleanup)
        cwd = os.getcwd()
        os.chdir(work.name)  # the pipeline writes checkpoints/ relative to cwd
        self.addCleanup(os.chdir, cwd)
        self.batches = _FakeBatches()
        provider = SimpleNamespace(
            supports_batching=True, provider_name="fake", model_name="fake",
            raw_client=SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(batches=self.batches))),
            reported_model="fake-v1", model_drift=None, search_model_name=None,
            resolution=SimpleNamespace(source="tier", tier="fast"),
            smoke_test=mock.Mock(return_value="fake-v1"),
            note_model=mock.Mock(),
        )
        self.classify = mock.Mock(side_effect=lambda **kw: _agent1())
        for target, repl in (
            ("build_provider", mock.Mock(return_value=provider)),
            ("_rates_for", lambda provider: {"input": 1e-6, "output": 5e-6,
                                             "cache_write": 0.0, "cache_read": 0.0}),
            ("agent0_enrich", mock.Mock(return_value=dict(ENRICH_OK))),
            ("agent1_classify", self.classify),
        ):
            p = mock.patch.object(orch, target, repl)
            p.start()
            self.addCleanup(p.stop)

    def run_batch(self, names):
        companies = [
            {"company_name": n, "description": "d", "_original_row": {"company_name": n}}
            for n in names
        ]
        config = {
            "pipeline": {"checkpoint_interval": 100},
            "validation": {"validator_enabled": False},
            "epo": {"enabled": False},
            "enrichment": {"enabled": True},
            "batch": {"enabled": True, "batch_poll_interval_s": 0},
            "llm": {"provider": "fake"},
        }
        os.environ[ENV] = str(self.path)
        # Capture the run's log output so the suite stays quiet; returned for assertions.
        with self.assertLogs(level="INFO") as logs:
            results = orch.run_pipeline(companies, config, "out.xlsx")
        return results, logs.output

    def steps_for(self, index):
        return [
            e["step"] for e in self.read_events()
            if e["kind"] == "step" and e["index"] == index
        ]

    def test_batch_run_emits_steps_in_order_per_row(self):
        names = ["A", "B", "C"]
        results, _ = self.run_batch(names)
        self.assertEqual([r["classification"] for r in results], ["deep tech"] * 3)
        self.assertEqual(self.classify.call_count, 0)
        for i in range(len(names)):
            self.assertEqual(
                self.steps_for(i),
                ["Enrichment", "Waiting for batch", "In batch job", "Confidence scoring"],
                f"row {i}",
            )
        phases = [e["phase"] for e in self.read_events() if e["kind"] == "phase"]
        self.assertIn("Classify in one batch job · 3 companies submitted", phases)

    def test_batch_row_retried_online_shows_classification(self):
        self.batches.failed = {"1"}
        results, logs = self.run_batch(["A", "B", "C"])
        self.assertEqual(self.classify.call_count, 1)  # only B is reclassified online
        self.assertEqual(
            [r["classification"] for r in results], ["deep tech", "general tech", "deep tech"],
        )
        self.assertTrue(any("Online retry succeeded for custom_id=1" in line for line in logs))
        self.assertEqual(
            self.steps_for(1),
            ["Enrichment", "Waiting for batch", "In batch job", "Classification", "Confidence scoring"],
        )
        for i in (0, 2):
            self.assertNotIn("Classification", self.steps_for(i), f"row {i}")


del ProgressTestCase  # base class only

if __name__ == "__main__":
    unittest.main()
