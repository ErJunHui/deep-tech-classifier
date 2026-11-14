"""Tests for the shared risk, action and tier rules:  python -m unittest tests.test_review"""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from pipeline.review import action_required, confidence_tier, risk_flag  # noqa: E402


class ReviewRulesTest(unittest.TestCase):
    def test_tier_boundaries(self):
        self.assertEqual([confidence_tier(c) for c in (75, 74, 50, 49)], ["High", "Medium", "Medium", "Low"])

    def test_risk_priority(self):
        self.assertEqual(risk_flag({"validation_decision": "ESCALATE_FOR_HUMAN_REVIEW", "classification_disputed": True}), "Escalate")
        self.assertEqual(risk_flag({"classification_disputed": True, "validator_triggered": True, "confidence": 40}), "Contested")
        self.assertEqual(risk_flag({"validator_triggered": True, "confidence": 69}), "Uncertain")
        self.assertEqual(risk_flag({"validator_triggered": True, "confidence": 70}), "Clear")
        self.assertEqual(risk_flag({"confidence": 10}), "Clear")

    def test_risk_missing_confidence(self):
        # The writer treats missing or None confidence as 0; so must risk_flag.
        self.assertEqual(risk_flag({"validator_triggered": True}), "Uncertain")
        self.assertEqual(risk_flag({"validator_triggered": True, "confidence": None}), "Uncertain")

    def test_action(self):
        self.assertEqual(action_required("deep tech", "Clear"), "Approve")
        self.assertEqual(action_required("general tech", "Clear"), "Reject")
        self.assertEqual(action_required("deep tech", "Uncertain"), "Needs Review")
        self.assertEqual(action_required("error", "Clear"), "Needs Review")


if __name__ == "__main__":
    unittest.main()
