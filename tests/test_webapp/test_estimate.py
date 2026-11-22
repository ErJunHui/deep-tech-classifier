"""Tests for the pre-run estimate:  python -m unittest tests.test_webapp.test_estimate"""

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from pipeline import models  # noqa: E402
from pipeline import llm_provider  # noqa: E402
from pipeline.llm_provider import get_cost_rates  # noqa: E402
from pipeline.parallel import DEFAULT_BATCH_MIN_COMPANIES, DEFAULT_WORKERS  # noqa: E402
from webapp import estimate as est  # noqa: E402
from webapp.estimate import estimate  # noqa: E402
from webapp.settings_map import batch_min_companies, clean_settings, setup_info  # noqa: E402


def _settings(**overrides) -> dict:
    base = {
        "provider": "anthropic", "tier": "fast", "model": "",
        "enrichment": True, "epo": False, "validator": True, "batch": False,
        "validatorThreshold": 70, "maxWebSearches": 3, "enrichmentMaxSearches": 2,
    }
    base.update(overrides)
    return clean_settings(base)


# Duration parts at the _settings defaults (threshold 70, so share is VALIDATED_SHARE_AT_70).
def _enrich_secs(rows: int) -> float:
    return rows * est.ENRICH_SECS / DEFAULT_WORKERS


def _direct_classify_secs(rows: int) -> float:
    return rows * est.CLASSIFY_DIRECT_SECS / DEFAULT_WORKERS


def _validate_secs(rows: int) -> float:
    return rows * est.VALIDATED_SHARE_AT_70 * est.VALIDATE_SECS / DEFAULT_WORKERS


class EstimateTest(unittest.TestCase):
    def test_zero_rows_costs_nothing(self):
        e = estimate(_settings(), 0)
        self.assertTrue(e["known"])
        self.assertEqual(e["cost"], 0)
        self.assertEqual(e["secs"], 0)
        self.assertEqual(e["parts"], {"classify": 0, "enrich": 0, "validate": 0})

    def test_result_shape_and_tier_model(self):
        e = estimate(_settings(tier="balanced"), 10)
        self.assertEqual(
            set(e), {"known", "model", "pricedAs", "pinned", "batch", "batchMin", "cost", "secs", "parts"}
        )
        self.assertEqual(e["model"], models.CANDIDATES["anthropic"]["balanced"][0])
        self.assertAlmostEqual(e["cost"], sum(e["parts"].values()))
        self.assertAlmostEqual(
            e["secs"], _enrich_secs(10) + _direct_classify_secs(10) + _validate_secs(10)
        )

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
        self.assertAlmostEqual(
            batch["secs"], _enrich_secs(100) + est.BATCH_OVERHEAD_SECS + _validate_secs(100)
        )

    def test_small_run_is_not_estimated_as_a_batch(self):
        self.assertFalse(estimate(_settings(batch=True), rows=99)["batch"])
        self.assertTrue(estimate(_settings(batch=True), rows=100)["batch"])

    def test_batch_threshold_comes_from_the_run_config(self):
        # config.json may lower batch.min_companies; the estimate must agree with the pipeline.
        self.assertTrue(estimate(_settings(batch=True), rows=4, batch_min=3)["batch"])
        self.assertFalse(estimate(_settings(batch=True), rows=2, batch_min=3)["batch"])

    def test_estimate_reports_the_batch_threshold(self):
        self.assertEqual(estimate(_settings(), 4)["batchMin"], DEFAULT_BATCH_MIN_COMPANIES)
        self.assertEqual(estimate(_settings(), 4, batch_min=3)["batchMin"], 3)

    def test_small_run_is_costed_and_timed_as_direct(self):
        rows = DEFAULT_BATCH_MIN_COMPANIES - 1
        plain = estimate(_settings(batch=False), rows)
        batch = estimate(_settings(batch=True), rows)
        self.assertAlmostEqual(batch["parts"]["classify"], plain["parts"]["classify"])
        self.assertAlmostEqual(batch["secs"], plain["secs"])

    def test_epo_sets_the_floor_for_large_runs(self):
        self.assertGreaterEqual(estimate(_settings(epo=True), rows=5000)["secs"], 5000 * 17)

    def test_epo_and_enrichment_overlap(self):
        # Patent lookups and enrichment run side by side; the slower one sets the time.
        on = estimate(_settings(epo=True), 100)
        self.assertAlmostEqual(
            on["secs"], 100 * est.EPO_SECS + _direct_classify_secs(100) + _validate_secs(100)
        )
        alone = estimate(_settings(epo=True, enrichment=False), 100)
        self.assertAlmostEqual(alone["secs"], on["secs"])

    def test_more_workers_would_not_beat_epo(self):
        e = estimate(_settings(epo=True), 100, workers=1000)
        self.assertGreaterEqual(e["secs"], 100 * est.EPO_SECS)

    def test_fewer_workers_take_longer(self):
        s = _settings(epo=False, batch=False)
        eight = estimate(s, 100)
        two = estimate(s, 100, workers=2)
        self.assertAlmostEqual(eight["secs"], estimate(s, 100, workers=DEFAULT_WORKERS)["secs"])
        self.assertAlmostEqual(two["secs"], eight["secs"] * DEFAULT_WORKERS / 2)

    def test_enrichment_off_zeroes_its_part(self):
        on = estimate(_settings(enrichment=True), 100)
        off = estimate(_settings(enrichment=False), 100)
        self.assertGreater(on["parts"]["enrich"], 0)
        self.assertEqual(off["parts"]["enrich"], 0)
        self.assertAlmostEqual(off["parts"]["classify"], on["parts"]["classify"])
        self.assertAlmostEqual(off["secs"], on["secs"] - _enrich_secs(100))

    def test_validation_off_zeroes_its_part(self):
        on = estimate(_settings(validator=True), 100)
        off = estimate(_settings(validator=False), 100)
        self.assertGreater(on["parts"]["validate"], 0)
        self.assertEqual(off["parts"]["validate"], 0)
        self.assertAlmostEqual(off["secs"], on["secs"] - _validate_secs(100))

    def test_validation_time_follows_the_validated_share(self):
        low = estimate(_settings(validatorThreshold=35), 100)
        mid = estimate(_settings(validatorThreshold=70), 100)
        self.assertAlmostEqual(mid["secs"] - low["secs"], _validate_secs(100) / 2)

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
        self.assertAlmostEqual(e["secs"], estimate(_settings(), 100)["secs"])

    def test_priced_pinned_model_is_used(self):
        pinned = models.CANDIDATES["anthropic"]["best"][0]
        e = estimate(_settings(tier="fast", model=f"  {pinned} "), 100)
        self.assertEqual(e["model"], pinned)
        self.assertTrue(e["known"])

    def test_batch_false_for_non_anthropic(self):
        for provider in ("gemini", "openai"):
            e = estimate(_settings(provider=provider, batch=True), 100)
            self.assertFalse(e["batch"], provider)
            self.assertAlmostEqual(
                e["secs"], _enrich_secs(100) + _direct_classify_secs(100) + _validate_secs(100)
            )

    def test_validate_part_counts_share_tokens_and_search_fees(self):
        e = estimate(_settings(validatorThreshold=70, maxWebSearches=3, enrichmentMaxSearches=1), 100)
        rates = get_cost_rates(e["model"])
        tokens_in, tokens_out = est.VALIDATOR_TOKENS_PER_SEARCH
        expected = 100 * est.VALIDATED_SHARE_AT_70 * 3 * (
            tokens_in * rates["input"] + tokens_out * rates["output"] + rates["web_search"]
        )
        self.assertGreater(rates["web_search"], 0)
        self.assertAlmostEqual(e["parts"]["validate"], expected)

    def test_step_with_zero_searches_is_costed_as_one(self):
        # The step still makes its call, and the provider allows at least one search.
        zero = estimate(_settings(enrichmentMaxSearches=0, maxWebSearches=0), 100)
        one = estimate(_settings(enrichmentMaxSearches=1, maxWebSearches=1), 100)
        self.assertGreater(zero["parts"]["enrich"], 0)
        self.assertGreater(zero["parts"]["validate"], 0)
        self.assertAlmostEqual(zero["parts"]["enrich"], one["parts"]["enrich"])
        self.assertAlmostEqual(zero["parts"]["validate"], one["parts"]["validate"])

    def test_pin_of_null_or_none_means_the_tier_model(self):
        tier_model = models.CANDIDATES["anthropic"]["fast"][0]
        for pin in ("null", "None", " NULL "):
            e = estimate(_settings(model=pin), 100)
            self.assertEqual(e["model"], tier_model, pin)
            self.assertTrue(e["known"], pin)
            self.assertIsNotNone(e["cost"], pin)

    def test_unpriced_model_logs_no_warning(self):
        name = "typed-so-far-9b"
        with self.assertNoLogs(level="WARNING"):
            e = estimate(_settings(model=name), 100)
        self.assertFalse(e["known"])
        self.assertNotIn(name, llm_provider._warned_unpriced)

    def test_batch_agrees_with_setup_info_for_every_provider(self):
        for p in setup_info({})["providers"]:
            e = estimate(_settings(provider=p["id"], batch=True), DEFAULT_BATCH_MIN_COMPANIES)
            self.assertEqual(e["batch"], p["batch"], p["id"])

    def test_negative_rows_count_as_zero(self):
        e = estimate(_settings(), -5)
        self.assertEqual(e["cost"], 0)
        self.assertEqual(e["secs"], 0)


def _gemini_alias() -> str:
    """A Gemini tier's moving alias, which has no listed price."""
    return models.CANDIDATES["gemini"]["fast"][0]


# Any model with a listed price will do as the alias's target in a patched table.
_A_PRICED_MODEL = sorted(models.COST_RATES)[0]


class PricedAsTest(unittest.TestCase):
    def _check_alias_tiers(self):
        checked = 0
        for provider, tiers in models.CANDIDATES.items():
            for tier, candidates in tiers.items():
                alias = candidates[0]
                if alias not in models.ESTIMATE_PRICE_AS:
                    continue
                with self.subTest(provider=provider, tier=tier):
                    mapped = models.ESTIMATE_PRICE_AS[alias]
                    e = estimate(_settings(provider=provider, tier=tier), 100)
                    self.assertTrue(e["known"])
                    self.assertEqual(e["model"], alias)
                    self.assertEqual(e["pricedAs"], mapped)
                    self.assertFalse(e["pinned"])
                    self.assertIsNotNone(e["cost"])
                    rates = get_cost_rates(mapped)
                    tokens_in, tokens_out = est.CLASSIFIER_TOKENS
                    expected = 100 * (tokens_in * rates["input"] + tokens_out * rates["output"])
                    self.assertGreater(expected, 0)
                    self.assertAlmostEqual(e["parts"]["classify"], expected)
                checked += 1
        return checked

    def test_alias_tier_is_priced_as_its_current_version(self):
        # The real table (it may be empty when no alias target could be confirmed).
        self._check_alias_tiers()
        # And a patched entry, so this test always checks something.
        with patch.dict(models.ESTIMATE_PRICE_AS, {_gemini_alias(): _A_PRICED_MODEL}):
            self.assertGreaterEqual(self._check_alias_tiers(), 1)

    def test_unmapped_alias_tier_is_unknown(self):
        with patch.dict(models.ESTIMATE_PRICE_AS, clear=True):
            e = estimate(_settings(provider="gemini", tier="fast"), 100)
        self.assertFalse(e["known"])
        self.assertIsNone(e["cost"])
        self.assertIsNone(e["pricedAs"])

    def test_priced_model_has_no_priced_as(self):
        e = estimate(_settings(provider="anthropic", tier="fast"), 100)
        self.assertTrue(e["known"])
        self.assertIsNone(e["pricedAs"])
        self.assertFalse(e["pinned"])

    def test_pinned_alias_is_not_mapped(self):
        alias = _gemini_alias()
        with patch.dict(models.ESTIMATE_PRICE_AS, {alias: _A_PRICED_MODEL}):
            e = estimate(_settings(provider="gemini", model=alias), 100)
        self.assertEqual(e["model"], alias)
        self.assertFalse(e["known"])
        self.assertIsNone(e["cost"])
        self.assertIsNone(e["pricedAs"])
        self.assertTrue(e["pinned"])

    def test_pinned_flag(self):
        self.assertTrue(estimate(_settings(model="my-finetune"), 10)["pinned"])
        self.assertFalse(estimate(_settings(model="null"), 10)["pinned"])

    def test_get_cost_rates_still_does_not_price_an_alias(self):
        aliases = {_gemini_alias(), *models.ESTIMATE_PRICE_AS}
        for alias in aliases:
            with self.subTest(alias=alias):
                self.assertFalse(llm_provider.cost_known(get_cost_rates(alias, warn=False)))


class EstimateRequestTest(unittest.TestCase):
    def test_request_with_defaults_and_rows(self):
        self.assertEqual(est.estimate_request({"rows": 20}), estimate(clean_settings({}), 20))

    def test_request_cleans_settings(self):
        e = est.estimate_request({"settings": {"validatorThreshold": 999}, "rows": 5})
        expected = estimate(clean_settings({"validatorThreshold": 100}), 5)
        self.assertEqual(e, expected)

    def test_request_rejects_bad_rows(self):
        bad = [None, "5", "abc", True, False, -1, 2.7, float("inf"), float("-inf"),
               float("nan"), [], {}, 10 ** 400]
        for rows in bad:
            with self.subTest(rows=rows):
                with self.assertRaises(est.EstimateError):
                    est.estimate_request({"rows": rows})
        with self.assertRaises(est.EstimateError):
            est.estimate_request({"settings": {}})

    def test_request_rejects_more_than_a_million_rows(self):
        self.assertEqual(est.estimate_request({"rows": 1_000_000}), estimate(clean_settings({}), 1_000_000))
        for rows in (1_000_001, 1e300, 10 ** 300):
            with self.subTest(rows=rows):
                with self.assertRaises(est.EstimateError) as ctx:
                    est.estimate_request({"rows": rows})
                self.assertEqual(str(ctx.exception), "rows must be at most 1,000,000")

    def test_request_accepts_whole_float_rows(self):
        self.assertEqual(est.estimate_request({"rows": 12.0}), estimate(clean_settings({}), 12))
        self.assertEqual(est.estimate_request({"rows": 0}), estimate(clean_settings({}), 0))

    def test_request_rejects_unknown_provider_and_tier(self):
        for raw in ({"provider": "nope"}, {"tier": "nope"}):
            with self.subTest(raw=raw):
                with self.assertRaises(ValueError) as expected:
                    clean_settings(raw)
                with self.assertRaises(est.EstimateError) as ctx:
                    est.estimate_request({"settings": raw, "rows": 1})
                self.assertEqual(str(ctx.exception), str(expected.exception))

    def test_request_rejects_non_object_body(self):
        for body in (None, [], "x", 5):
            with self.subTest(body=body):
                with self.assertRaises(est.EstimateError):
                    est.estimate_request(body)

    def test_estimate_error_is_a_value_error(self):
        self.assertTrue(issubclass(est.EstimateError, ValueError))


if __name__ == "__main__":
    unittest.main()


class BatchMinCompaniesTest(unittest.TestCase):
    def test_reads_batch_min_companies_from_config(self):
        self.assertEqual(batch_min_companies({"batch": {"min_companies": 3}}), 3)

    def test_default_when_missing_or_not_a_positive_whole_number(self):
        for config in ({}, {"batch": {}}, {"batch": {"min_companies": 0}}, {"batch": {"min_companies": "x"}},
                       {"batch": {"min_companies": True}}, {"batch": None}):
            with self.subTest(config=config):
                self.assertEqual(batch_min_companies(config), DEFAULT_BATCH_MIN_COMPANIES)

    def test_setup_info_reports_the_threshold(self):
        self.assertEqual(setup_info({})["batchMinCompanies"], DEFAULT_BATCH_MIN_COMPANIES)
        self.assertEqual(setup_info({}, batch_min=5)["batchMinCompanies"], 5)

    def test_setup_info_reports_the_workers(self):
        self.assertEqual(setup_info({})["workers"], DEFAULT_WORKERS)
        self.assertEqual(setup_info({}, workers=3)["workers"], 3)

    def test_estimate_request_passes_the_workers_on(self):
        body = {"settings": {"epo": False, "batch": False}, "rows": 100}
        self.assertAlmostEqual(
            est.estimate_request(body, workers=2)["secs"], est.estimate_request(body)["secs"] * DEFAULT_WORKERS / 2
        )

    def test_estimate_request_passes_the_threshold_on(self):
        self.assertTrue(est.estimate_request({"settings": {"batch": True}, "rows": 4}, batch_min=3)["batch"])
