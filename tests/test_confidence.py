"""Confidence model tests:  python -m unittest discover tests"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.confidence import apply_validator, compute_final_confidence  # noqa: E402


def pre(classification, llm, patents=0, level="Not Deep-tech", has_description=True, config=None):
    return compute_final_confidence(
        classification=classification, patent_count=patents, epo_deeptech_level=level,
        llm_confidence=llm, has_description=has_description, config=config,
    )


def agent2(verdict, classification, confidence):
    return {"validator_verdict": verdict, "final_classification": classification,
            "updated_confidence": confidence}


class PreValidationTests(unittest.TestCase):
    def test_no_patents_keeps_llm_confidence(self):
        self.assertEqual(pre("general tech", 90)["final_confidence"], 90)
        self.assertEqual(pre("deep tech", 72)["final_confidence"], 72)

    def test_patents_raise_confidence_only_when_they_agree(self):
        agree = pre("deep tech", 70, patents=5, level="Very Strong")
        contradict = pre("general tech", 90, patents=5, level="Very Strong")
        self.assertEqual((agree["signal_score_epo"], agree["final_confidence"]), (15, 85))
        self.assertEqual((contradict["signal_score_epo"], contradict["final_confidence"]), (-15, 75))

    def test_non_deeptech_patents_are_neutral(self):
        for cls in ("deep tech", "general tech"):
            self.assertEqual(pre(cls, 80, patents=8, level="Not Deep-tech")["final_confidence"], 80)

    def test_stronger_and_larger_portfolios_count_for_more(self):
        adj = lambda n, lvl: pre("deep tech", 50, patents=n, level=lvl)["signal_score_epo"]
        self.assertLess(adj(1, "Very Strong"), adj(5, "Very Strong"))
        self.assertLess(adj(5, "Moderate"), adj(5, "Strong"))
        self.assertEqual(adj(5, "Very Strong"), adj(50, "Very Strong"))

    def test_low_evidence_cap_binds(self):
        self.assertEqual(pre("general tech", 95, has_description=False)["final_confidence"], 60)
        self.assertEqual(pre("general tech", 95, has_description=True)["final_confidence"], 95)

    def test_result_is_clamped_and_tolerates_bad_input(self):
        self.assertEqual(pre("deep tech", 98, patents=5, level="Very Strong")["final_confidence"], 100)
        self.assertEqual(pre("general tech", 5, patents=5, level="Very Strong")["final_confidence"], 0)
        self.assertEqual(pre("error", None)["final_confidence"], 0)

    def test_adjustment_size_is_configurable(self):
        cfg = {"confidence": {"epo_adjust_max": 30}}
        self.assertEqual(pre("deep tech", 50, patents=5, level="Very Strong", config=cfg)["final_confidence"], 80)


class ValidatorTests(unittest.TestCase):
    def resolve(self, classification, llm, a2, config=None):
        return apply_validator(classification, pre(classification, llm), a2, config)

    def test_no_validator_leaves_everything_unchanged(self):
        out = self.resolve("deep tech", 80, None)
        self.assertEqual((out["classification"], out["confidence"], out["classification_disputed"]),
                         ("deep tech", 80, False))

    def test_confirm_can_raise_or_lower(self):
        self.assertEqual(self.resolve("deep tech", 60, agent2("confirm", "deep tech", 85))["confidence"], 85)
        out = self.resolve("deep tech", 60, agent2("confirm", "deep tech", 40))
        self.assertEqual((out["confidence"], out["scores"]["signal_score_validator"]), (40, -20))

    def test_override_accepted_even_against_a_confident_classifier(self):
        out = self.resolve("deep tech", 69, agent2("override", "general tech", 70))
        self.assertEqual((out["classification"], out["confidence"], out["classification_disputed"]),
                         ("general tech", 70, False))

    def test_weak_override_is_blocked_and_lowers_confidence(self):
        out = self.resolve("deep tech", 68, agent2("override", "general tech", 60))
        self.assertEqual((out["classification"], out["confidence"], out["classification_disputed"]),
                         ("deep tech", 40, True))

    def test_override_threshold_is_configurable(self):
        cfg = {"validation": {"override_min_confidence": 50}}
        out = self.resolve("deep tech", 68, agent2("override", "general tech", 60), cfg)
        self.assertEqual(out["classification"], "general tech")

    def test_escalation_never_raises_confidence(self):
        same = self.resolve("deep tech", 55, agent2("insufficient_evidence", "deep tech", 90))
        lower = self.resolve("deep tech", 55, agent2("insufficient_evidence", "deep tech", 30))
        opposite = self.resolve("deep tech", 55, agent2("insufficient_evidence", "general tech", 80))
        self.assertEqual([same["confidence"], lower["confidence"], opposite["confidence"]], [55, 30, 20])
        self.assertEqual(opposite["classification"], "deep tech")

    def test_validator_can_rescue_a_failed_classification(self):
        out = self.resolve("error", 0, agent2("override", "general tech", 75))
        self.assertEqual((out["classification"], out["confidence"]), ("general tech", 75))


if __name__ == "__main__":
    unittest.main()
