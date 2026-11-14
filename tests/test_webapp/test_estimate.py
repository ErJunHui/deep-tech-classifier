"""Tests for the pre-run estimate:  python -m unittest tests.test_webapp.test_estimate"""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from pipeline import models  # noqa: E402
from pipeline.llm_provider import get_cost_rates  # noqa: E402
from webapp import estimate as est  # noqa: E402
from webapp.estimate import estimate  # noqa: E402
from webapp.settings_map import clean_settings  # noqa: E402


def _settings(**overrides) -> dict:
    base = {
        "provider": "anthropic", "tier": "fast", "model": "",
        "enrichment": True, "validator": True, "batch": False,
        "validatorThreshold": 70, "maxWebSearches": 3, "enrichmentMaxSearches": 2,
    }
    base.update(overrides)
    return clean_settings(base)


class EstimateTest(unittest.TestCase):
    def test_zero_rows_costs_nothing(self):
        e = estimate(_settings(), 0)
        self.assertTrue(e["known"])
        self.assertEqual(e["cost"], 0)
        self.assertEqual(e["secs"], 0)
        self.assertEqual(e["parts"], {"classify": 0, "enrich": 0, "validate": 0})

    def test_result_shape_and_tier_model(self):
        e = estimate(_settings(tier="balanced"), 10)
        self.assertEqual(set(e), {"known", "model", "batch", "cost", "secs", "parts"})
        self.assertEqual(e["model"], models.CANDIDATES["anthropic"]["balanced"][0])
        self.assertAlmostEqual(e["cost"], sum(e["parts"].values()))
        self.assertEqual(e["secs"], 10 * est.SECONDS_PER_COMPANY["sequential"])

    def test_classifier_part_uses_the_models_rates(self):
        e = estimate(_settings(), 100)
        rates = get_cost_rates(e["model"])
        tokens_in, tokens_out = est.CLASSIFIER_TOKENS
        expected = 100 * (tokens_in * rates["input"] + tokens_out * rates["output"])
        self.assertGreater(expected, 0)
        self.assertAlmostEqual(e["parts"]["classify"], expected)

    def test_enrich_part_counts_tokens_and_search_fees(self):
        e = estimate(_settings(enrichmentMaxSearches=2), 100)
        rates = get_cost_rates(e["model"])
        tokens_in, tokens_out = est.ENRICH_TOKENS_PER_SEARCH
        expected = 100 * 2 * (
            tokens_in * rates["input"] + tokens_out * rates["output"] + rates["web_search"]
        )
        self.assertAlmostEqual(e["parts"]["enrich"], expected)

    def test_batch_halves_only_the_classifier_part(self):
        plain = estimate(_settings(batch=False), 100)
        batch = estimate(_settings(batch=True), 100)
        self.assertTrue(batch["batch"])
        self.assertFalse(plain["batch"])
        self.assertAlmostEqual(batch["parts"]["classify"], plain["parts"]["classify"] * 0.5)
        self.assertAlmostEqual(batch["parts"]["enrich"], plain["parts"]["enrich"])
        self.assertAlmostEqual(batch["parts"]["validate"], plain["parts"]["validate"])
        self.assertEqual(batch["secs"], 100 * est.SECONDS_PER_COMPANY["batch"])

    def test_enrichment_off_zeroes_its_part(self):
        on = estimate(_settings(enrichment=True), 100)
        off = estimate(_settings(enrichment=False), 100)
        self.assertGreater(on["parts"]["enrich"], 0)
        self.assertEqual(off["parts"]["enrich"], 0)
        self.assertAlmostEqual(off["parts"]["classify"], on["parts"]["classify"])
        self.assertAlmostEqual(off["secs"], on["secs"] * 0.75)

    def test_validation_off_zeroes_its_part(self):
        on = estimate(_settings(validator=True), 100)
        off = estimate(_settings(validator=False), 100)
        self.assertGreater(on["parts"]["validate"], 0)
        self.assertEqual(off["parts"]["validate"], 0)
        self.assertAlmostEqual(off["secs"], on["secs"] * 0.85)

    def test_higher_threshold_raises_validation_part(self):
        low = estimate(_settings(validatorThreshold=35), 100)
        mid = estimate(_settings(validatorThreshold=70), 100)
        high = estimate(_settings(validatorThreshold=90), 100)
        self.assertLess(low["parts"]["validate"], mid["parts"]["validate"])
        self.assertLess(mid["parts"]["validate"], high["parts"]["validate"])
        self.assertAlmostEqual(low["parts"]["validate"], mid["parts"]["validate"] / 2)
        self.assertEqual(estimate(_settings(validatorThreshold=0), 100)["parts"]["validate"], 0)

    def test_validated_share_is_capped_at_every_company(self):
        original = est.VALIDATED_SHARE_AT_70
        est.VALIDATED_SHARE_AT_70 = 0.9
        try:
            capped = estimate(_settings(validatorThreshold=100), 100)
            at_cap = estimate(_settings(validatorThreshold=78), 100)  # 0.9 * 78/70 > 1
        finally:
            est.VALIDATED_SHARE_AT_70 = original
        self.assertAlmostEqual(capped["parts"]["validate"], at_cap["parts"]["validate"])

    def test_unpriced_pinned_model_is_unknown(self):
        e = estimate(_settings(model="my-finetune"), 100)
        self.assertEqual(e["model"], "my-finetune")
        self.assertFalse(e["known"])
        self.assertIsNone(e["cost"])
        self.assertEqual(e["secs"], 100 * est.SECONDS_PER_COMPANY["sequential"])

    def test_priced_pinned_model_is_used(self):
        pinned = models.CANDIDATES["anthropic"]["best"][0]
        e = estimate(_settings(tier="fast", model=f"  {pinned} "), 100)
        self.assertEqual(e["model"], pinned)
        self.assertTrue(e["known"])

    def test_batch_false_for_non_anthropic(self):
        for provider in ("gemini", "openai"):
            e = estimate(_settings(provider=provider, batch=True), 100)
            self.assertFalse(e["batch"], provider)
            self.assertEqual(e["secs"], 100 * est.SECONDS_PER_COMPANY["sequential"])

    def test_negative_rows_count_as_zero(self):
        e = estimate(_settings(), -5)
        self.assertEqual(e["cost"], 0)
        self.assertEqual(e["secs"], 0)


if __name__ == "__main__":
    unittest.main()
