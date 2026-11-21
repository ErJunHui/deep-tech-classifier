"""Tests for the row view:  python -m unittest tests.test_webapp.test_rows"""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from pipeline.orchestrator import _error_result  # noqa: E402
from webapp.rows import counts, to_row  # noqa: E402

CONFIG = {"confidence": {"low_evidence_cap": 60}}
COMPANY = {"company_name": "Lumora", "uen": "U1", "domain": "Optics", "description": "Wafer inspection optics"}


def _success(**overrides) -> dict:
    """A finished, unvalidated deep tech result as the orchestrator writes it."""
    result = {
        "company_name": "Lumora",
        "classification": "deep tech",
        "confidence": 64,
        "reasoning": "Builds proprietary optical inspection hardware.",
        "web_description": "Lumora makes inspection optics.",
        "web_description_source": "https://lumora.example",
        "web_fetch_status": "found",
        "patent_count": 1,
        "epo_is_deeptech": True,
        "epo_deeptech_level": "Moderate",
        "epo_primary_domain": "N/A",
        "cpc_codes": ["G06N 3/08", "G06N 3/99", "G06N", "Z99Z 1/00"],
        "epo_validation_status": "Validated",
        "validator_triggered": False,
        "validator_verdict": "",
        "validator_updated_confidence": "",
        "web_evidence_summary": "",
        "sources_checked": [],
        "classification_disputed": False,
        "validation_decision": "",
        "escalation_reason": "",
        "signal_score_epo": 3,
        "signal_score_llm": 61,
        "signal_score_validator": 0,
        "processing_time_s": 38.2,
        "processing_errors": "",
        "criteria": {"innovation": {"met": True, "reasoning": "Novel optics"}},
        "classification_basis": "COMBINED",
        "total_cost_usd": 0.052,
        "model": "test-model",
    }
    result.update(overrides)
    return result


def _escalated() -> dict:
    return _success(
        confidence=58,
        signal_score_validator=-6,
        validator_triggered=True,
        validator_verdict="insufficient_evidence",
        validator_updated_confidence=58,
        web_evidence_summary="Little public evidence.",
        sources_checked=["https://a.example"],
        validation_decision="ESCALATE_FOR_HUMAN_REVIEW",
        escalation_reason="Thin evidence",
    )


def _row(result, index=0, company=COMPANY, step=None, history=None, config=CONFIG) -> dict:
    return to_row(index, company, result, step, history or [], config)


class RowsTest(unittest.TestCase):
    def test_pending_row_has_no_result_and_carries_step(self):
        row = _row(None, index=3, step="Patent lookup")
        self.assertEqual(row, {"index": 3, "name": "Lumora", "uen": "U1", "domain": "Optics",
                               "description": "Wafer inspection optics", "step": "Patent lookup",
                               "result": None, "history": []})
        self.assertIsNone(_row(None)["step"])
        # A finished row has no step.
        self.assertIsNone(_row(_success(), step="Validation")["step"])

    def test_success_row_fields(self):
        r = _row(_success(), history=[{"type": "confirm", "verdict": "deep tech", "note": "", "at": "x"}])
        res = r["result"]
        self.assertEqual(set(res), {"error", "errorMessage", "verdict", "conf", "risk", "tier", "llm", "adj",
                                    "pre", "capped", "validated", "override", "val", "patents", "basis",
                                    "reasoning", "criteria", "hasInputDesc", "hasWeb", "webDescription",
                                    "webSource", "webStatus", "cost", "timeS", "model"})
        self.assertFalse(res["error"])
        self.assertEqual(res["errorMessage"], "")
        self.assertEqual((res["verdict"], res["conf"], res["risk"], res["tier"]), ("deep tech", 64, "Clear", "Medium"))
        self.assertEqual((res["llm"], res["adj"], res["pre"]), (61, 3, 64))
        self.assertFalse(res["validated"])
        self.assertIsNone(res["val"])
        self.assertEqual(res["override"], "")
        self.assertEqual(res["basis"], "COMBINED")
        self.assertEqual(res["criteria"], {"innovation": {"met": True, "reasoning": "Novel optics"}})
        self.assertEqual(res["patents"]["status"], "success")
        self.assertEqual(res["patents"]["count"], 1)
        self.assertEqual(res["patents"]["level"], "Moderate")
        self.assertEqual(res["patents"]["domain"], "")
        cpc = res["patents"]["cpc"]
        self.assertEqual([c["code"] for c in cpc], ["G06N 3/08", "G06N 3/99", "G06N", "Z99Z 1/00"])
        self.assertTrue(cpc[0]["desc"])                  # exact code
        self.assertTrue(cpc[1]["desc"])                  # falls back to "G06N 3"
        self.assertTrue(cpc[2]["desc"])
        self.assertEqual(cpc[3]["desc"], "")             # unknown
        self.assertNotEqual(cpc[0]["desc"], cpc[2]["desc"])
        self.assertTrue(res["hasInputDesc"])
        self.assertTrue(res["hasWeb"])
        self.assertEqual((res["webDescription"], res["webSource"], res["webStatus"]),
                         ("Lumora makes inspection optics.", "https://lumora.example", "found"))
        self.assertEqual((res["cost"], res["timeS"], res["model"]), (0.052, 38.2, "test-model"))
        self.assertEqual(r["history"], [{"type": "confirm", "verdict": "deep tech", "note": "", "at": "x"}])

    def test_cpc_list_is_capped_at_twelve(self):
        codes = [f"G06N 3/{i:02d}" for i in range(20)]
        self.assertEqual(len(_row(_success(cpc_codes=codes))["result"]["patents"]["cpc"]), 12)

    def test_escalated_row(self):
        res = _row(_escalated())["result"]
        self.assertEqual(res["risk"], "Escalate")
        self.assertTrue(res["validated"])
        self.assertEqual(res["val"], {"verdict": "insufficient_evidence", "decision": "ESCALATE_FOR_HUMAN_REVIEW",
                                      "confidence": 58, "summary": "Little public evidence.",
                                      "sources": ["https://a.example"], "escalationReason": "Thin evidence"})

    def test_override_blocked_and_applied(self):
        applied = _row(_success(validator_triggered=True, validator_verdict="override",
                                classification="general tech"))["result"]
        self.assertEqual(applied["override"], "applied")
        blocked = _row(_success(validator_triggered=True, validator_verdict="override",
                                classification_disputed=True))["result"]
        self.assertEqual(blocked["override"], "blocked")
        self.assertEqual(blocked["risk"], "Contested")
        confirmed = _row(_success(validator_triggered=True, validator_verdict="confirm"))["result"]
        self.assertEqual(confirmed["override"], "")

    def test_pre_is_confidence_minus_validator_delta(self):
        res = _row(_success(confidence=55, signal_score_validator=-11))["result"]
        self.assertEqual(res["pre"], 66)

    def test_capped_only_without_description_and_patents(self):
        bare = {**COMPANY, "description": ""}
        thin = dict(web_description=None, patent_count=0, signal_score_llm=70, signal_score_epo=0, confidence=60)
        self.assertTrue(_row(_success(**thin), company=bare)["result"]["capped"])
        # Placeholder text is not a usable description, as in the orchestrator.
        self.assertTrue(_row(_success(**{**thin, "web_description": " nan "}), company=bare)["result"]["capped"])
        # A dataset description, a web description or a patent each lift the cap.
        self.assertFalse(_row(_success(**thin), company=COMPANY)["result"]["capped"])
        self.assertFalse(_row(_success(**{**thin, "web_description": "Found online"}), company=bare)["result"]["capped"])
        self.assertFalse(_row(_success(**{**thin, "patent_count": 1}), company=bare)["result"]["capped"])
        # Below the cap there was nothing to cap.
        self.assertFalse(_row(_success(**{**thin, "signal_score_llm": 60}), company=bare)["result"]["capped"])
        # The cap comes from the run's config.
        self.assertFalse(_row(_success(**thin), company=bare,
                              config={"confidence": {"low_evidence_cap": 75}})["result"]["capped"])
        self.assertFalse(_row(_success(**thin), company=bare)["result"]["hasInputDesc"])
        self.assertFalse(_row(_success(**thin), company=bare)["result"]["hasWeb"])

    def test_epo_disabled_maps_to_disabled(self):
        for status, count, expected in (("EPO Disabled", 0, "disabled"), ("Not Run", 0, "disabled"),
                                        ("Validated", 2, "success"), ("EPO Error", 0, "error"),
                                        ("Not Validated", 0, "no_results")):
            with self.subTest(status=status):
                res = _row(_success(epo_validation_status=status, patent_count=count))["result"]
                self.assertEqual(res["patents"]["status"], expected)

    def test_epo_turned_off_in_run_config_maps_to_disabled(self):
        result = _success(epo_validation_status="Not Validated", patent_count=0, cpc_codes=[])
        off = {**CONFIG, "epo": {"enabled": False}}
        self.assertEqual(_row(result, config=off)["result"]["patents"]["status"], "disabled")
        on = {**CONFIG, "epo": {"enabled": True}}
        self.assertEqual(_row(result, config=on)["result"]["patents"]["status"], "no_results")
        # A missing key means enabled.
        self.assertEqual(_row(result, config=CONFIG)["result"]["patents"]["status"], "no_results")

    def test_unknown_cost_stays_none(self):
        self.assertIsNone(_row(_success(total_cost_usd=None))["result"]["cost"])

    def test_error_row(self):
        row = _row(_error_result("X"))
        res = row["result"]
        self.assertTrue(res["error"])
        self.assertEqual(res["errorMessage"], "Unknown error")
        self.assertEqual(res["verdict"], "error")
        self.assertEqual(res["patents"]["status"], "disabled")
        self.assertEqual(res["patents"]["domain"], "")
        no_detail = _row({**_error_result("X"), "processing_errors": ""})["result"]
        self.assertEqual(no_detail["errorMessage"], "Processing error")
        k = counts([row, _row(_success(), index=1)])
        self.assertEqual(k, {"done": 2, "deep": 1, "general": 0, "errors": 1, "open": 0})

    def test_counts_follow_decisions(self):
        change = {"type": "change", "verdict": "general tech", "note": "", "at": "2026-11-13T14:40:02"}
        restore = {"type": "restore", "verdict": "deep tech", "note": "", "at": "2026-11-13T14:41:00"}
        flagged = _escalated()
        self.assertEqual(counts([_row(flagged)]), {"done": 1, "deep": 1, "general": 0, "errors": 0, "open": 1})
        self.assertEqual(counts([_row(flagged, history=[change])]),
                         {"done": 1, "deep": 0, "general": 1, "errors": 0, "open": 0})
        # A restore undoes the decision: the row is open again under its pipeline verdict.
        self.assertEqual(counts([_row(flagged, history=[change, restore])]),
                         {"done": 1, "deep": 1, "general": 0, "errors": 0, "open": 1})
        # Pending rows count nowhere.
        self.assertEqual(counts([_row(None, step="Enrichment")]),
                         {"done": 0, "deep": 0, "general": 0, "errors": 0, "open": 0})


if __name__ == "__main__":
    unittest.main()
