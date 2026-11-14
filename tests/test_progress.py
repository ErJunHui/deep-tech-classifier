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


del ProgressTestCase  # base class only

if __name__ == "__main__":
    unittest.main()
