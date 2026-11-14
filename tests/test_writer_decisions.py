"""Reviewer decisions written into the Excel workbook (data/writer.py)."""

import os
import shutil
import tempfile
import unittest

from openpyxl import load_workbook

from data import writer

DETAIL_REVIEW_COLUMNS = ["reviewer_decision", "reviewer_verdict", "reviewer_note", "reviewed_at"]


def _company(name, uen):
    return {"company_name": name, "uen": uen, "_original_row": {"Company Name": name, "UEN": uen}}


def _companies_and_results():
    """Three companies; the Management View sort puts them in a different order."""
    companies = [_company("Alpha", "U1"), _company("Beta", "U2"), _company("Gamma", "U3")]
    results = [
        # Clear general tech, confidence 60 -> sorted last
        {"classification": "general tech", "confidence": 60},
        # Clear deep tech, confidence 90 -> sorted second
        {"classification": "deep tech", "confidence": 90},
        # Escalated deep tech -> sorted first
        {"classification": "deep tech", "confidence": 40, "validator_triggered": True,
         "validation_decision": "ESCALATE_FOR_HUMAN_REVIEW"},
    ]
    return companies, results


def _decision(verdict, note, reclassified):
    return {"verdict": verdict, "note": note, "at": "2026-11-14T10:00:00Z", "reclassified": reclassified}


def _rows(ws):
    """Sheet rows as dicts keyed by the header row."""
    values = list(ws.iter_rows(values_only=True))
    header = values[0]
    return [dict(zip(header, row)) for row in values[1:]]


def _by_company(ws, name):
    return next(r for r in _rows(ws) if r["Company Name"] == name)


def _overview(ws):
    return {row[0]: row[1] for row in ws.iter_rows(values_only=True) if row[0] is not None}


class WriterDecisionsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.path = os.path.join(self.tmp, "out.xlsx")
        self.companies, self.results = _companies_and_results()

    def _write(self, decisions):
        writer.write_results(self.path, self.companies, self.results, {}, decisions=decisions)
        return load_workbook(self.path)

    def test_no_decisions_argument_leaves_columns_unchanged(self):
        writer.write_results(self.path, self.companies, self.results, {})
        wb = load_workbook(self.path)
        self.assertEqual(wb.sheetnames, ["Overview", "Management View", "Full Detail", "Legend"])
        header = [c.value for c in wb["Management View"][1]]
        self.assertEqual(header, writer.MANAGEMENT_COLUMNS)
        detail = [c.value for c in wb["Full Detail"][1]]
        self.assertEqual(detail, ["Company Name", "UEN"] + writer.RESULT_COLUMNS)
        overview = _overview(wb["Overview"])
        self.assertNotIn("Review", overview)
        self.assertNotIn("Verdicts Confirmed", overview)
        legend = [r[0] for r in wb["Legend"].iter_rows(values_only=True)]
        self.assertNotIn("Final Verdict", legend)
        self.assertNotIn("Reviewer Decision", legend)

    def test_empty_decisions_adds_columns(self):
        wb = self._write({})
        header = [c.value for c in wb["Management View"][1]]
        i = header.index("Action Required")
        self.assertEqual(header[i + 1:i + 5],
                         ["Final Verdict", "Reviewer Decision", "Reviewer Note", "Reviewed At"])
        detail = [c.value for c in wb["Full Detail"][1]]
        self.assertEqual(detail[-4:], DETAIL_REVIEW_COLUMNS)
        legend = [r[0] for r in wb["Legend"].iter_rows(values_only=True)]
        self.assertIn("Final Verdict", legend)
        self.assertIn("Reviewer Decision", legend)
        # Undecided rows: Final Verdict is the pipeline verdict, reviewer cells blank
        alpha = _by_company(wb["Management View"], "Alpha")
        self.assertEqual(alpha["Final Verdict"], "general tech")
        self.assertEqual(alpha["Action Required"], "Reject")
        self.assertIn(alpha["Reviewer Decision"], (None, ""))
        self.assertIn(alpha["Reviewer Note"], (None, ""))
        self.assertIn(alpha["Reviewed At"], (None, ""))

    def test_reclassified_row(self):
        wb = self._write({0: _decision("deep tech", "Has a materials patent", True)})
        alpha = _by_company(wb["Management View"], "Alpha")
        self.assertEqual(alpha["Verdict"], "general tech")
        self.assertEqual(alpha["Final Verdict"], "deep tech")
        self.assertEqual(alpha["Reviewer Decision"], "Reclassified")
        self.assertEqual(alpha["Reviewer Note"], "Has a materials patent")
        self.assertEqual(alpha["Reviewed At"], "2026-11-14T10:00:00Z")
        self.assertEqual(alpha["Action Required"], "Approve")
        detail = next(r for r in _rows(wb["Full Detail"]) if r["Company Name"] == "Alpha")
        self.assertEqual(detail["reviewer_decision"], "Reclassified")
        self.assertEqual(detail["reviewer_verdict"], "deep tech")
        self.assertEqual(detail["reviewer_note"], "Has a materials patent")
        self.assertEqual(detail["reviewed_at"], "2026-11-14T10:00:00Z")
        beta = next(r for r in _rows(wb["Full Detail"]) if r["Company Name"] == "Beta")
        for col in DETAIL_REVIEW_COLUMNS:
            self.assertIn(beta[col], (None, ""))

    def test_confirmed_flagged_row(self):
        wb = self._write({2: _decision("deep tech", "", False)})
        gamma = _by_company(wb["Management View"], "Gamma")
        self.assertEqual(gamma["Risk Flag"], "Escalate")
        self.assertEqual(gamma["Action Required"], "Approve")
        self.assertEqual(gamma["Reviewer Decision"], "Confirmed")
        self.assertEqual(gamma["Final Verdict"], "deep tech")

    def test_decisions_follow_rows_through_the_sort(self):
        wb = self._write({
            0: _decision("general tech", "note for Alpha", False),
            1: _decision("deep tech", "note for Beta", False),
        })
        rows = _rows(wb["Management View"])
        self.assertEqual([r["Company Name"] for r in rows], ["Gamma", "Beta", "Alpha"])
        notes = {r["Company Name"]: r["Reviewer Note"] for r in rows}
        self.assertEqual(notes["Alpha"], "note for Alpha")
        self.assertEqual(notes["Beta"], "note for Beta")
        self.assertIn(notes["Gamma"], (None, ""))

    def test_overview_review_counts(self):
        wb = self._write({
            0: _decision("deep tech", "", True),
            1: _decision("deep tech", "", False),
        })
        overview = _overview(wb["Overview"])
        self.assertIn("Review", overview)
        self.assertEqual(overview["Verdicts Confirmed"], 1)
        self.assertEqual(overview["Reclassified"], 1)
        # Gamma is escalated and undecided
        self.assertEqual(overview["Still Need Review"], 1)

        wb = self._write({2: _decision("deep tech", "", False)})
        overview = _overview(wb["Overview"])
        self.assertEqual(overview["Verdicts Confirmed"], 1)
        self.assertEqual(overview["Reclassified"], 0)
        self.assertEqual(overview["Still Need Review"], 0)

    def test_incremental_write_carries_decisions(self):
        writer.write_incremental(self.path, self.companies, self.results,
                                 decisions={0: _decision("deep tech", "late call", True)})
        wb = load_workbook(self.path)
        self.assertEqual(wb.sheetnames, ["Management View", "Full Detail", "Legend"])
        alpha = _by_company(wb["Management View"], "Alpha")
        self.assertEqual(alpha["Reviewer Decision"], "Reclassified")
        self.assertEqual(alpha["Reviewer Note"], "late call")
        detail = [c.value for c in wb["Full Detail"][1]]
        self.assertEqual(detail[-4:], DETAIL_REVIEW_COLUMNS)
        legend = [r[0] for r in wb["Legend"].iter_rows(values_only=True)]
        self.assertIn("Reviewer Decision", legend)

    def test_incremental_write_without_decisions_unchanged(self):
        writer.write_incremental(self.path, self.companies, self.results)
        wb = load_workbook(self.path)
        self.assertEqual([c.value for c in wb["Management View"][1]], writer.MANAGEMENT_COLUMNS)
        self.assertEqual([c.value for c in wb["Full Detail"][1]][-4:], writer.RESULT_COLUMNS[-4:])

    def test_note_that_looks_like_a_formula_is_written_as_text(self):
        notes = {0: "=HYPERLINK(\"http://x\",\"y\")", 1: "+1", 2: "@SUM(A1)"}
        wb = self._write({i: _decision("deep tech", n, False) for i, n in notes.items()})
        names = {0: "Alpha", 1: "Beta", 2: "Gamma"}
        mgmt_header = [c.value for c in wb["Management View"][1]]
        note_col = mgmt_header.index("Reviewer Note")
        for row in wb["Management View"].iter_rows(min_row=2):
            i = next(k for k, v in names.items() if v == row[0].value)
            self.assertEqual(row[note_col].value, notes[i])
            self.assertEqual(row[note_col].data_type, "s")
        detail_header = [c.value for c in wb["Full Detail"][1]]
        note_col = detail_header.index("reviewer_note")
        for i, row in enumerate(wb["Full Detail"].iter_rows(min_row=2)):
            self.assertEqual(row[note_col].value, notes[i])
            self.assertEqual(row[note_col].data_type, "s")


if __name__ == "__main__":
    unittest.main()
