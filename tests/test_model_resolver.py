"""Model resolution: pinned models, tiers, retired candidates, refusals."""

import unittest
from unittest import mock

from pipeline import llm_provider, model_resolver, models
from pipeline.model_resolver import ModelSetupError, resolve_model

try:
    import anthropic
    from anthropic.types import Message
except ImportError:  # pragma: no cover
    anthropic = None

SERVED = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-haiku-4-5-20251001"]


def _never():
    raise AssertionError("the model list must not be fetched")


class ResolveModelTests(unittest.TestCase):
    def resolve(self, served=SERVED, provider="anthropic", tier="fast", pinned=None, need_batch=False):
        return resolve_model(provider, tier, pinned, need_batch, lambda: served)

    def test_pinned_model_is_used_as_is_without_listing(self):
        resolved = resolve_model("anthropic", "best", "claude-haiku-4-5-20251001", True, _never)
        self.assertEqual((resolved.model, resolved.source), ("claude-haiku-4-5-20251001", "pinned"))

    def test_pinned_model_without_a_profile_warns(self):
        with self.assertLogs(model_resolver.logger, level="WARNING") as logs:
            resolved = resolve_model("anthropic", None, "claude-new-9", False, _never)
        self.assertEqual(resolved.model, "claude-new-9")
        self.assertIn("no profile", logs.output[0])

    def test_each_anthropic_tier_takes_its_first_served_candidate(self):
        self.assertEqual(self.resolve(tier="fast").model, "claude-haiku-5-5")
        self.assertEqual(self.resolve(tier="balanced").model, "claude-sonnet-5-5")
        self.assertEqual(self.resolve(tier="best").model, "claude-opus-5-5")

    def test_missing_tier_defaults_to_fast(self):
        resolved = self.resolve(tier=None)
        self.assertEqual((resolved.model, resolved.tier), ("claude-haiku-5-5", "fast"))

    def test_retired_first_candidate_falls_through_to_a_dated_snapshot(self):
        served = ["claude-sonnet-5-5", "claude-haiku-4-5-20251001"]
        self.assertEqual(self.resolve(served=served).model, "claude-haiku-4-5")

    def test_no_candidate_available_lists_what_was_tried_and_served(self):
        with self.assertRaises(ModelSetupError) as ctx:
            self.resolve(served=["claude-sonnet-5-5"])
        message = str(ctx.exception)
        self.assertIn("claude-haiku-5-5, claude-haiku-4-5", message)
        self.assertIn("claude-sonnet-5-5", message)
        self.assertIn("llm.model", message)

    def test_batch_filter_skips_candidates_without_batch_support(self):
        no_batch = models.ModelProfile(batch=False)
        with mock.patch.dict(models.PROFILES, {"claude-haiku-5-5": no_batch}):
            self.assertEqual(self.resolve(need_batch=True).model, "claude-haiku-4-5")
            self.assertEqual(self.resolve(need_batch=False).model, "claude-haiku-5-5")

    def test_unknown_tier_is_rejected(self):
        with self.assertRaisesRegex(ModelSetupError, "Unknown llm.tier"):
            self.resolve(tier="cheapest")

    def test_gemini_tier_maps_to_an_alias_without_listing(self):
        resolved = resolve_model("gemini", "balanced", None, False, _never)
        self.assertEqual(resolved.model, "gemini-flash-latest")

    def test_openai_tier_and_search_model(self):
        served = ["gpt-4o", "gpt-4o-mini", "gpt-4o-search-preview"]
        self.assertEqual(self.resolve(served=served, provider="openai").model, "gpt-4o-mini")
        self.assertEqual(
            model_resolver.resolve_openai_search_model(lambda: served), "gpt-4o-search-preview")
        with self.assertRaisesRegex(ModelSetupError, "web-search model"):
            model_resolver.resolve_openai_search_model(lambda: ["gpt-4o"])

    def test_list_failure_is_reported_with_a_way_out(self):
        def boom():
            raise RuntimeError("401 unauthorized")
        with self.assertRaisesRegex(ModelSetupError, "401 unauthorized.*llm.model"):
            resolve_model("anthropic", "fast", None, False, boom)


@unittest.skipIf(anthropic is None, "anthropic SDK not installed")
class BuildProviderTests(unittest.TestCase):
    def build(self, llm, served=SERVED, **kw):
        with mock.patch.object(
            llm_provider.AnthropicProvider, "list_model_ids", return_value=served
        ) as listed:
            provider = llm_provider.build_provider(
                {"llm": llm}, api_keys={"anthropic": "test"}, **kw)
        return provider, listed

    def test_tier_is_resolved_against_the_served_list(self):
        provider, _ = self.build({"model": None, "tier": "balanced"})
        self.assertEqual(provider.model_name, "claude-sonnet-5-5")
        self.assertEqual(provider.resolution.source, "tier")

    def test_old_config_with_a_pinned_model_behaves_as_before(self):
        provider, listed = self.build({"provider": "anthropic", "model": "claude-haiku-4-5-20251001"})
        self.assertEqual(provider.model_name, "claude-haiku-4-5-20251001")
        listed.assert_not_called()

    def test_checkpointed_model_overrides_tier_resolution(self):
        provider, listed = self.build({"tier": "best"}, model="claude-haiku-4-5")
        self.assertEqual(provider.model_name, "claude-haiku-4-5")
        self.assertEqual(provider.resolution.source, "checkpoint")
        listed.assert_not_called()


def _message(stop_reason, model="claude-haiku-5-5"):
    return Message.model_validate({
        "id": "msg", "type": "message", "role": "assistant", "model": model,
        "stop_reason": stop_reason, "stop_sequence": None,
        "content": [{"type": "text", "text": "OK"}] if stop_reason != "refusal" else [],
        "usage": {"input_tokens": 1, "output_tokens": 1},
    })


@unittest.skipIf(anthropic is None, "anthropic SDK not installed")
class AnthropicResponseTests(unittest.TestCase):
    def provider(self, responses, model="claude-haiku-5-5"):
        p = llm_provider.AnthropicProvider(api_key="test", model=model)
        p._client = mock.Mock()
        p._client.messages.create.side_effect = responses
        return p

    def complete(self, provider):
        return provider.complete([{"role": "user", "content": "q"}], "s", 100, 0.1)

    def test_refusal_is_an_error_not_an_empty_answer(self):
        p = self.provider([_message("refusal")])
        with self.assertRaises(llm_provider.LLMRefusalError):
            self.complete(p)

    def test_smoke_test_returns_the_reported_model_and_follows_the_profile(self):
        p = self.provider([_message("end_turn")])
        self.assertEqual(p.smoke_test(0.1), "claude-haiku-5-5")
        self.assertNotIn("temperature", p._client.messages.create.call_args.kwargs)

    def test_a_different_reported_model_is_flagged_as_drift(self):
        p = self.provider([_message("end_turn", "v1"), _message("end_turn", "v1"),
                           _message("end_turn", "v2")])
        self.assertEqual(self.complete(p).model, "v1")
        self.complete(p)
        self.assertIsNone(p.model_drift)
        self.complete(p)
        self.assertEqual(p.model_drift, ("v1", "v2"))


if __name__ == "__main__":
    unittest.main()
