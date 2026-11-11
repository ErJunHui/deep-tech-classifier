"""Regression tests for the smaller review fixes:  python -m unittest discover tests"""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from data import writer  # noqa: E402
from pipeline import epo_bridge, llm_provider, orchestrator as orch  # noqa: E402
from pipeline.settings import load_settings  # noqa: E402

try:
    import anthropic
    from anthropic.types import Message
except ImportError:  # pragma: no cover
    anthropic = None


class SettingsTests(unittest.TestCase):
    def test_config_and_env_paths_may_be_strings(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = Path(tmp) / "c.json"
            cfg.write_text(json.dumps({"llm": {"provider": "gemini"}}))
            env = Path(tmp) / "custom.env"
            env.write_text("GEMINI_API_KEY=from-env-file\n")
            with mock.patch.dict(os.environ, {}, clear=False):
                os.environ.pop("GEMINI_API_KEY", None)
                config = load_settings(config_path=str(cfg), env_path=str(env))
                self.assertEqual(os.environ["GEMINI_API_KEY"], "from-env-file")
            self.assertEqual(config["llm"]["provider"], "gemini")


class ManagementViewTests(unittest.TestCase):
    def test_name_and_uen_come_from_configured_columns(self):
        company = {"company_name": "Acme", "uen": "U1",
                   "_original_row": {"Coy Name": "Acme", "UEN No": "U1"}}
        row = writer._build_management_row(company, {"classification": "deep tech", "confidence": 80})
        self.assertEqual((row["Company Name"], row["UEN"]), ("Acme", "U1"))


class EpoBridgeTests(unittest.TestCase):
    def test_relative_package_dir_is_resolved_from_project_root(self):
        expected = str(ROOT / "lib" / "epo_patent")
        with tempfile.TemporaryDirectory() as tmp:
            cwd = os.getcwd()
            os.chdir(tmp)
            try:
                self.assertEqual(epo_bridge._resolve_package_dir("./lib/epo_patent"), expected)
            finally:
                os.chdir(cwd)
        self.assertEqual(epo_bridge._resolve_package_dir("/abs/epo"), "/abs/epo")

    def test_missing_package_dir_is_reported(self):
        with self.assertLogs(epo_bridge.logger, level="ERROR") as logs:
            result = epo_bridge.run_epo_lookup("Acme", "k", "s", "/no/such/dir")
        self.assertEqual(result.raw_status, "EPO Import Error")
        self.assertIn("/no/such/dir", logs.output[0])


class CostTests(unittest.TestCase):
    def test_haiku_45_rates(self):
        rates = llm_provider.get_cost_rates("claude-haiku-4-5-20251001")
        self.assertAlmostEqual(rates["input"] * 1e6, 1.00)
        self.assertAlmostEqual(rates["output"] * 1e6, 5.00)

    def test_batch_results_are_costed_at_half_price(self):
        rates = {"input": 1e-6, "output": 5e-6, "cache_write": 0, "cache_read": 0}
        raw = [{"custom_id": "0", "result": {"type": "succeeded", "message": {
            "content": [{"type": "text", "text": '{"classification": "deep tech", "confidence": 80}'}],
            "usage": {"input_tokens": 1_000_000, "output_tokens": 1_000_000},
        }}}]
        out = orch._phase3_parse(raw, [{}], {}, provider=None, rates=rates)
        self.assertAlmostEqual(out["0"]["classifier_cost_usd"], 3.00)

    def test_gemini_thinking_tokens_count_as_output(self):
        provider = llm_provider.GeminiProvider.__new__(llm_provider.GeminiProvider)
        usage = SimpleNamespace(prompt_token_count=10, candidates_token_count=20, thoughts_token_count=300)
        self.assertEqual(provider._get_usage(SimpleNamespace(usage_metadata=usage)), (10, 320))


def _message(content, stop_reason="end_turn", searches=0):
    return Message.model_validate({
        "id": "msg", "type": "message", "role": "assistant", "model": "m",
        "stop_reason": stop_reason, "stop_sequence": None, "content": content,
        "usage": {"input_tokens": 100, "output_tokens": 10,
                  "server_tool_use": {"web_search_requests": searches, "web_fetch_requests": 0}},
    })


def _search_blocks(query, url):
    return [
        {"type": "server_tool_use", "id": "srv_1", "name": "web_search", "input": {"query": query}},
        {"type": "web_search_tool_result", "tool_use_id": "srv_1", "content": [
            {"type": "web_search_result", "url": url, "title": "t",
             "encrypted_content": "x", "page_age": None}]},
    ]


@unittest.skipIf(anthropic is None, "anthropic SDK not installed")
class AnthropicSearchTests(unittest.TestCase):
    def provider(self, responses):
        p = llm_provider.AnthropicProvider(api_key="test", model="claude-haiku-4-5")
        p._client = mock.Mock()
        p._client.messages.create.side_effect = responses
        return p

    def search(self, provider, **kw):
        return provider.complete_with_search(
            messages=[{"role": "user", "content": "q"}], system="s",
            max_tokens=100, temperature=0, max_searches=2, **kw)

    def test_searches_are_capped_counted_and_sourced(self):
        content = _search_blocks("acme singapore", "https://acme.sg/about") + [
            {"type": "text", "text": '{"found": true, "descr'},
            {"type": "text", "text": 'iption": "x"}'},
        ]
        provider = self.provider([_message(content, searches=2)])
        resp, sources = self.search(provider)

        tools = provider._client.messages.create.call_args.kwargs["tools"]
        self.assertEqual(tools[0]["max_uses"], 2)
        self.assertEqual(resp.searches, 2)
        self.assertEqual(json.loads(resp.text), {"found": True, "description": "x"})
        self.assertEqual(sources, ["[search query] acme singapore", "https://acme.sg/about"])

    def test_pause_turn_is_continued(self):
        paused = _message(_search_blocks("q1", "https://a.sg"), stop_reason="pause_turn", searches=1)
        final = _message([{"type": "text", "text": '{"ok": 1}'}])
        provider = self.provider([paused, final])
        resp, _ = self.search(provider)

        self.assertEqual(provider._client.messages.create.call_count, 2)
        resumed = provider._client.messages.create.call_args.kwargs["messages"]
        self.assertEqual(resumed[-1]["role"], "assistant")
        self.assertEqual((resp.text, resp.searches, resp.input_tokens), ('{"ok": 1}', 1, 200))

    def test_non_json_answer_gets_one_forced_json_follow_up(self):
        provider = self.provider([
            _message([{"type": "text", "text": "I found the company."}], searches=1),
            _message([{"type": "text", "text": '{"ok": 1}'}]),
        ])
        resp, _ = self.search(provider, force_json_prompt="JSON only")
        self.assertEqual(resp.text, '{"ok": 1}')
        self.assertEqual(provider._client.messages.create.call_args.kwargs["messages"][-1]["content"], "JSON only")

    def test_search_errors_are_retried_and_surface_as_provider_errors(self):
        req = mock.Mock()
        err = anthropic.APIConnectionError(request=req)
        with mock.patch.object(llm_provider.time, "sleep"):
            ok = self.provider([err, _message([{"type": "text", "text": '{"ok": 1}'}])])
            self.assertEqual(self.search(ok)[0].text, '{"ok": 1}')
            bad = self.provider([err, err, err])
            with self.assertRaises(llm_provider.ProviderConnectionError):
                self.search(bad)


if __name__ == "__main__":
    unittest.main()
