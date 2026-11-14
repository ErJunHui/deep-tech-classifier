"""Tests for the web app's settings mapping:  python -m unittest tests.test_webapp.test_settings_map"""

import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from pipeline import models  # noqa: E402
from webapp.settings_map import (  # noqa: E402
    DEFAULT_SETTINGS,
    clean_settings,
    setup_info,
    to_pipeline_config,
)


def _template() -> dict:
    with open(ROOT / "config.template.json", "r", encoding="utf-8") as f:
        return json.load(f)


class SettingsMapTest(unittest.TestCase):
    def test_defaults_match_template(self):
        d = DEFAULT_SETTINGS
        self.assertEqual(d["validatorThreshold"], 70)
        self.assertEqual(d["overrideMinConfidence"], 65)
        self.assertEqual(d["epoAdjustMax"], 15)
        self.assertEqual(d["lowEvidenceCap"], 60)
        self.assertEqual(d["maxWebSearches"], 3)
        self.assertEqual(d["enrichmentMaxSearches"], 2)
        self.assertEqual(d["tier"], "fast")
        self.assertEqual(d["provider"], "anthropic")
        self.assertEqual(d["model"], "")
        self.assertEqual(d["mapping"], {})
        for flag in ("enrichment", "epo", "validator", "batch"):
            self.assertIs(d[flag], True)

    def test_clean_clamps_and_defaults(self):
        s = clean_settings({"epoAdjustMax": 99, "validatorThreshold": -5, "maxWebSearches": "x"})
        self.assertEqual(s["epoAdjustMax"], 30)
        self.assertEqual(s["validatorThreshold"], 0)
        self.assertEqual(s["maxWebSearches"], 3)
        # Missing keys come from the defaults.
        self.assertEqual(s["lowEvidenceCap"], 60)
        self.assertEqual(s["provider"], "anthropic")
        # A boolean is not a number here.
        self.assertEqual(clean_settings({"lowEvidenceCap": True})["lowEvidenceCap"], 60)
        self.assertEqual(clean_settings({"enrichmentMaxSearches": 50})["enrichmentMaxSearches"], 10)
        # A non-dict mapping is treated as empty.
        self.assertEqual(clean_settings({"mapping": "Company"})["mapping"], {})
        # model is trimmed.
        self.assertEqual(clean_settings({"model": "  my-model \n"})["model"], "my-model")

    def test_clean_rejects_unknown_provider(self):
        with self.assertRaises(ValueError):
            clean_settings({"provider": "nonesuch"})
        with self.assertRaises(ValueError):
            clean_settings({"tier": "turbo"})
        # A browser can send any JSON value; each non-string is a ValueError, not a TypeError.
        for bad in (["x"], {"a": 1}, 1, 1.5, True, None):
            for key in ("provider", "tier"):
                with self.subTest(key=key, value=bad):
                    with self.assertRaises(ValueError):
                        clean_settings({key: bad})
        # A missing key is not malformed: it falls back to the default.
        s = clean_settings({})
        self.assertEqual((s["provider"], s["tier"]), (DEFAULT_SETTINGS["provider"], DEFAULT_SETTINGS["tier"]))

    def test_blank_model_becomes_none(self):
        cfg = to_pipeline_config(clean_settings({"model": "  "}), _template(), ROOT)
        self.assertIsNone(cfg["llm"]["model"])

    def test_mapping_written_to_columns(self):
        settings = clean_settings({"mapping": {"company_name": "Company", "description": "About"}})
        cfg = to_pipeline_config(settings, _template(), ROOT)
        self.assertEqual(cfg["pipeline"]["company_name_column"], "Company")
        self.assertEqual(cfg["pipeline"]["description_column"], "About")
        self.assertEqual(cfg["pipeline"]["uen_column"], "")
        self.assertEqual(cfg["pipeline"]["domain_column"], "")

    def test_all_settings_written(self):
        settings = clean_settings({
            "provider": "openai", "tier": "best", "model": "m",
            "enrichment": False, "epo": False, "validator": False, "batch": False,
            "validatorThreshold": 80, "overrideMinConfidence": 55, "epoAdjustMax": 20,
            "lowEvidenceCap": 50, "maxWebSearches": 5, "enrichmentMaxSearches": 4,
        })
        cfg = to_pipeline_config(settings, _template(), ROOT)
        self.assertEqual((cfg["llm"]["provider"], cfg["llm"]["tier"], cfg["llm"]["model"]), ("openai", "best", "m"))
        self.assertEqual(cfg["enrichment"]["enabled"], False)
        self.assertEqual(cfg["enrichment"]["max_searches"], 4)
        self.assertEqual(cfg["epo"]["enabled"], False)
        self.assertEqual(cfg["validation"], {
            "validator_enabled": False, "validator_threshold": 80,
            "override_min_confidence": 55, "max_web_searches": 5,
        })
        self.assertEqual(cfg["confidence"], {"epo_adjust_max": 20, "low_evidence_cap": 50})
        self.assertEqual(cfg["batch"]["enabled"], False)
        # Settings the browser does not control are kept from base.
        self.assertEqual(cfg["batch"]["batch_poll_interval_s"], 30)
        self.assertEqual(cfg["llm"]["temperature"], 0.1)

    def test_epo_dir_is_absolute(self):
        cfg = to_pipeline_config(clean_settings({}), _template(), ROOT)
        epo_dir = Path(cfg["epo"]["epo_package_dir"])
        self.assertTrue(epo_dir.is_absolute())
        self.assertEqual(epo_dir, (ROOT / "lib" / "epo_patent").resolve())

    def test_base_config_not_mutated(self):
        base = _template()
        before = copy.deepcopy(base)
        cfg = to_pipeline_config(
            clean_settings({"provider": "gemini", "mapping": {"company_name": "Co"}}), base, ROOT
        )
        self.assertEqual(base, before)
        self.assertIsNot(cfg["llm"], base["llm"])

    def test_setup_reports_key_presence_not_values(self):
        info = setup_info({"ANTHROPIC_API_KEY": "sk-secret"})
        self.assertNotIn("sk-secret", json.dumps(info))
        providers = {p["id"]: p for p in info["providers"]}
        self.assertTrue(providers["anthropic"]["keySet"])
        self.assertFalse(providers["gemini"]["keySet"])
        self.assertFalse(providers["openai"]["keySet"])
        self.assertFalse(info["epoKeysSet"])
        self.assertEqual(providers["anthropic"]["keyVar"], "ANTHROPIC_API_KEY")
        self.assertTrue(providers["anthropic"]["batch"])
        self.assertFalse(providers["gemini"]["batch"])
        self.assertFalse(providers["openai"]["batch"])

    def test_setup_tiers_and_epo(self):
        info = setup_info({"EPO_KEY": "k", "EPO_SECRET": "s"})
        self.assertTrue(info["epoKeysSet"])
        self.assertFalse(setup_info({"EPO_KEY": "k"})["epoKeysSet"])
        for p in info["providers"]:
            self.assertEqual(p["tiers"], {t: models.CANDIDATES[p["id"]][t][0] for t in models.TIERS})
        self.assertEqual(info["pricedModels"], sorted(models.COST_RATES))
        self.assertEqual(info["defaults"], DEFAULT_SETTINGS)

    def test_provider_key_vars_match_pipeline(self):
        # pipeline/settings.py checks each key in if/elif code, so the table to
        # compare against is llm_provider._PROVIDERS (id -> (key var, class)); it
        # imports no provider SDK and needs no network or keys.
        from pipeline import llm_provider

        web = {p["id"]: p["keyVar"] for p in setup_info({})["providers"]}
        self.assertEqual(set(web), set(models.CANDIDATES))
        self.assertEqual(web, {pid: entry[0] for pid, entry in llm_provider._PROVIDERS.items()})


if __name__ == "__main__":
    unittest.main()
