"""Model registry: defaults, per-model request settings and prices."""

import unittest

from agents import classifier_agent
from pipeline import llm_provider, models
from pipeline.epo_bridge import EPOResult


class RegistryTests(unittest.TestCase):
    def test_null_missing_or_empty_model_is_not_a_pin(self):
        for llm in ({}, {"model": None}, {"model": ""}):
            self.assertIsNone(models.pinned_model({"llm": llm}))
        self.assertEqual(
            models.pinned_model({"llm": {"model": "claude-haiku-4-5-20251001"}}),
            "claude-haiku-4-5-20251001",
        )

    def test_anthropic_tiers(self):
        tiers = models.CANDIDATES["anthropic"]
        self.assertEqual(tiers["fast"][0], "claude-haiku-5-5")
        self.assertEqual(tiers["balanced"][0], "claude-sonnet-5-5")
        self.assertEqual(tiers["best"][0], "claude-opus-5-5")

    def test_every_listed_candidate_has_a_profile_and_a_price(self):
        for provider in models.LISTED_PROVIDERS:
            for candidates in models.CANDIDATES[provider].values():
                for model in candidates:
                    self.assertIn(model, models.PROFILES)
                    self.assertIsNotNone(models.PROFILES[model].rates, model)


class RequestParamsTests(unittest.TestCase):
    def test_older_and_unknown_models_keep_the_original_request_shape(self):
        for model in ("claude-haiku-4-5", "claude-haiku-4-5-20251001", "some-future-model"):
            self.assertEqual(
                models.request_params(model, 2000, 0.1),
                {"max_tokens": 2000, "temperature": 0.1},
            )

    def test_55_models_omit_temperature_and_get_thinking_headroom(self):
        for model in ("claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"):
            params = models.request_params(model, 2000, 0.1)
            self.assertNotIn("temperature", params)
            self.assertGreater(params["max_tokens"], 2000)

    def test_batch_request_follows_the_model_profile(self):
        company = {"company_name": "Acme", "epo": EPOResult(raw_status="No Patents"),
                   "max_tokens": 2000, "temperature": 0.1}
        old = classifier_agent.build_batch_request("0", {**company, "model": "claude-haiku-4-5"})
        new = classifier_agent.build_batch_request("0", {**company, "model": "claude-haiku-5-5"})
        self.assertEqual(old["params"]["temperature"], 0.1)
        self.assertEqual(old["params"]["max_tokens"], 2000)
        self.assertNotIn("temperature", new["params"])
        self.assertEqual(new["params"]["model"], "claude-haiku-5-5")


class RatesTests(unittest.TestCase):
    def test_haiku_55_is_not_priced_as_haiku_45(self):
        rates = llm_provider.get_cost_rates("claude-haiku-5-5")
        self.assertAlmostEqual(rates["input"] * 1e6, 0.10)
        self.assertAlmostEqual(rates["output"] * 1e6, 0.50)

    def test_sonnet_55_rates(self):
        rates = llm_provider.get_cost_rates("claude-sonnet-5-5")
        self.assertAlmostEqual(rates["input"] * 1e6, 2.00)
        self.assertAlmostEqual(rates["output"] * 1e6, 10.00)


if __name__ == "__main__":
    unittest.main()
