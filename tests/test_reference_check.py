"""Reference check: pass rule, validation record, startup warning, cost labelling."""

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from data import writer  # noqa: E402
from pipeline import llm_provider, validation_record  # noqa: E402
from pipeline import orchestrator as orch  # noqa: E402
from tests.reference import check  # noqa: E402


def _expected(*cases):
    return [{"company_name": f"C{i}", "expected_verdict": v, "case_type": t}
            for i, (v, t) in enumerate(cases)]


def _results(*verdicts):
    return [{"classification": v} for v in verdicts]


class ReferenceSetTests(unittest.TestCase):
    def test_reference_file_is_well_formed(self):
        rows = check.load_expected()
        self.assertTrue(15 <= len(rows) <= 20, len(rows))
        self.assertEqual(len({r["company_name"] for r in rows}), len(rows))
        certain = [r["expected_verdict"] for r in rows if r["case_type"] == "certain"]
        self.assertGreaterEqual(certain.count("deep tech"), 5)
        self.assertGreaterEqual(certain.count("general tech"), 5)
        self.assertTrue(any(r["case_type"] == "borderline" for r in rows))


class PassRuleTests(unittest.TestCase):
    expected = _expected(("deep tech", "certain"), ("general tech", "certain"),
                         ("general tech", "borderline"), ("deep tech", "borderline"))

    def test_full_agreement_passes(self):
        report = check.compare(self.expected, _results("deep tech", "general tech", "general tech", "deep tech"))
        self.assertTrue(report["passed"])
        self.assertEqual(report["agreed"], 4)

    def test_one_borderline_miss_still_passes(self):
        report = check.compare(self.expected, _results("deep tech", "general tech", "deep tech", "deep tech"))
        self.assertTrue(report["passed"])
        self.assertEqual(report["borderline_misses"], 1)

    def test_two_borderline_misses_fail(self):
        report = check.compare(self.expected, _results("deep tech", "general tech", "deep tech", "general tech"))
        self.assertFalse(report["passed"])

    def test_a_certain_miss_fails(self):
        report = check.compare(self.expected, _results("general tech", "general tech", "general tech", "deep tech"))
        self.assertFalse(report["passed"])
        self.assertEqual(report["misses"][0]["actual"], "general tech")

    def test_an_error_row_fails_even_on_a_borderline_company(self):
        report = check.compare(self.expected, _results("deep tech", "general tech", "error", "deep tech"))
        self.assertFalse(report["passed"])
        self.assertEqual(report["errors"], 1)


class ValidationRecordTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.path = Path(tmp.name) / "last_validated.json"

    def test_warns_until_the_model_has_passed(self):
        warn = validation_record.warning_for
        self.assertIn("No anthropic model has passed", warn("anthropic", "claude-haiku-5-5", self.path))

        validation_record.record("anthropic", "claude-haiku-5-5", "claude-haiku-5-5", "20/20", self.path)
        self.assertIsNone(warn("anthropic", "claude-haiku-5-5", self.path))
        self.assertIn("differs from the last one", warn("anthropic", "claude-haiku-6", self.path))
        # Entries are per provider.
        self.assertIn("No gemini model", warn("gemini", "gemini-x", self.path))

    def test_recording_one_provider_keeps_the_others(self):
        validation_record.record("anthropic", "a", "a", "ok", self.path)
        validation_record.record("gemini", "g-001", "gemini-flash-latest", "ok", self.path)
        data = validation_record.load(self.path)
        self.assertEqual(data["anthropic"]["model"], "a")
        self.assertEqual(data["gemini"]["requested"], "gemini-flash-latest")

    def test_startup_warning_uses_the_reported_model(self):
        info = {"provider": "anthropic", "requested": "alias", "reported": "concrete-v2"}
        with self.assertLogs(orch.logger, level="WARNING") as logs:
            orch._warn_if_unvalidated(info)
        self.assertIn("concrete-v2", logs.output[0])


class CostLabelTests(unittest.TestCase):
    def test_unlisted_model_has_no_borrowed_price(self):
        for model in ("claude-haiku-9", "gemini-2.5-flash-lite", "gpt-4o-mini-audio"):
            rates = llm_provider.get_cost_rates(model)
            self.assertFalse(llm_provider.cost_known(rates), model)
            self.assertEqual(rates["input"], 0.0)

    def test_dated_snapshots_use_their_base_price(self):
        self.assertTrue(llm_provider.cost_known(llm_provider.get_cost_rates("claude-haiku-4-5-20251001")))
        rates = llm_provider.get_cost_rates("gpt-4o-mini-2024-07-18")
        self.assertAlmostEqual(rates["input"] * 1e6, 0.15)

    def test_overview_says_unknown_and_still_totals_tokens(self):
        results = [{"total_cost_usd": None, "classifier_input_tokens": 100, "validator_output_tokens": 7},
                   {"total_cost_usd": None, "enrichment_input_tokens": 50}]
        metrics = dict(writer._cost_metrics(results, {"requested": "alias", "reported": "new-model"}))
        self.assertEqual(metrics["Estimated Cost (USD)"], "unknown (no price for new-model)")
        self.assertEqual(metrics["Total Input Tokens"], 150)
        self.assertEqual(metrics["Total Output Tokens"], 7)

    def test_overview_sums_known_costs(self):
        metrics = dict(writer._cost_metrics([{"total_cost_usd": 0.5}, {"total_cost_usd": 0.25}], {}))
        self.assertEqual(metrics["Estimated Cost (USD)"], "$0.7500")

    def test_legend_quotes_the_run_models_rates(self):
        text = writer._cost_legend({"requested": "claude-haiku-5-5"})
        self.assertIn("$0.10/1M", text)
        self.assertIn("$0.50/1M", text)
        self.assertIn("blank because no price", writer._cost_legend({"requested": "claude-haiku-9"}))


if __name__ == "__main__":
    unittest.main()
