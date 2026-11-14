"""Tests for reviewer decisions:  python -m unittest tests.test_webapp.test_decisions"""

import sys
import tempfile
import threading
import unittest
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from webapp import decisions  # noqa: E402
from webapp.decisions import DecisionError  # noqa: E402

NOW = datetime(2026, 11, 13, 14, 40, 2, 123456)
LATER = datetime(2026, 11, 13, 14, 41, 0)
CLEAR_NOTE = "A note is required to overturn a Clear verdict. It is written to the workbook."


def _row(verdict="deep tech", risk="Escalate", error=False, index=0) -> dict:
    """The parts of a rows.to_row row that decisions read."""
    return {
        "index": index,
        "name": "Lumora",
        "step": None,
        "result": {"error": error, "verdict": "error" if error else verdict, "risk": risk},
        "history": [],
    }


class DecisionsTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.run_dir = Path(tmp.name)

    def assertRejected(self, status, fn, *args, message=None):
        with self.assertRaises(DecisionError) as ctx:
            fn(*args)
        self.assertEqual(ctx.exception.status, status)
        if message is not None:
            self.assertEqual(str(ctx.exception), message)
        return ctx.exception

    def test_confirm_flagged_row(self):
        history = decisions.record(self.run_dir, 0, "confirm", "", _row(), NOW)
        self.assertEqual(history, [{"type": "confirm", "verdict": "deep tech", "note": "", "at": "2026-11-13T14:40:02"}])

    def test_change_flips_verdict(self):
        history = decisions.record(self.run_dir, 0, "change", "web says software", _row(), NOW)
        self.assertEqual(history[-1]["type"], "change")
        self.assertEqual(history[-1]["verdict"], "general tech")
        history = decisions.record(self.run_dir, 1, "change", "", _row(verdict="general tech"), NOW)
        self.assertEqual(history[-1]["verdict"], "deep tech")

    def test_change_on_clear_requires_note(self):
        for note in ("", "   "):
            with self.subTest(note=note):
                self.assertRejected(409, decisions.record, self.run_dir, 0, "change", note,
                                    _row(risk="Clear"), NOW, message=CLEAR_NOTE)
        self.assertEqual(decisions.load(self.run_dir), {})
        history = decisions.record(self.run_dir, 0, "change", "  sells software  ", _row(risk="Clear"), NOW)
        self.assertEqual(history[-1]["note"], "sells software")

    def test_change_on_flagged_needs_no_note(self):
        history = decisions.record(self.run_dir, 0, "change", "   ", _row(risk="Escalate"), NOW)
        self.assertEqual(history[-1]["verdict"], "general tech")
        self.assertEqual(history[-1]["note"], "")

    def test_confirm_on_clear_needs_no_note(self):
        history = decisions.record(self.run_dir, 0, "confirm", "", _row(risk="Clear"), NOW)
        self.assertEqual(history[-1]["type"], "confirm")

    def test_note_is_capped(self):
        history = decisions.record(self.run_dir, 0, "confirm", "x" * 2500, _row(), NOW)
        self.assertEqual(len(history[-1]["note"]), 2000)

    def test_unknown_choice_rejected(self):
        self.assertRejected(409, decisions.record, self.run_dir, 0, "restore", "", _row(), NOW)
        self.assertEqual(decisions.load(self.run_dir), {})

    def test_pending_and_error_rows_rejected(self):
        pending = dict(_row(), result=None, step="classifying")
        for row in (pending, _row(error=True)):
            for choice in ("confirm", "change"):
                with self.subTest(row=row["result"], choice=choice):
                    self.assertRejected(409, decisions.record, self.run_dir, 0, choice, "note", row, NOW)
            with self.subTest(row=row["result"], action="restore"):
                self.assertRejected(409, decisions.restore, self.run_dir, 0, row, NOW)
        self.assertEqual(decisions.load(self.run_dir), {})

    def test_missing_row_is_404(self):
        self.assertRejected(404, decisions.record, self.run_dir, 99, "confirm", "", None, NOW)
        self.assertRejected(404, decisions.restore, self.run_dir, 99, None, NOW)
        self.assertEqual(decisions.load(self.run_dir), {})

    def test_restore_requires_a_decision(self):
        self.assertRejected(409, decisions.restore, self.run_dir, 0, _row(), NOW)
        decisions.record(self.run_dir, 0, "confirm", "", _row(), NOW)
        decisions.restore(self.run_dir, 0, _row(), NOW)
        self.assertRejected(409, decisions.restore, self.run_dir, 0, _row(), NOW)

    def test_current_is_none_after_restore(self):
        decisions.record(self.run_dir, 0, "change", "", _row(), NOW)
        history = decisions.restore(self.run_dir, 0, _row(), LATER)
        self.assertEqual(history[-1], {"type": "restore", "verdict": "deep tech", "note": "", "at": "2026-11-13T14:41:00"})
        self.assertIsNone(decisions.current(history))
        self.assertIsNone(decisions.current([]))

    def test_undo_pops_last_entry_and_revives_previous(self):
        decisions.record(self.run_dir, 0, "confirm", "looks right", _row(), NOW)
        decisions.record(self.run_dir, 0, "change", "", _row(), LATER)
        history = decisions.undo(self.run_dir, 0)
        self.assertEqual(len(history), 1)
        self.assertEqual(decisions.current(history)["type"], "confirm")
        self.assertEqual(decisions.load(self.run_dir), {0: history})

    def test_undo_on_empty_history_rejected(self):
        self.assertRejected(409, decisions.undo, self.run_dir, 0)
        decisions.record(self.run_dir, 0, "confirm", "", _row(), NOW)
        self.assertEqual(decisions.undo(self.run_dir, 0), [])
        self.assertRejected(409, decisions.undo, self.run_dir, 0)

    def test_survives_reload(self):
        history = decisions.record(self.run_dir, 3, "confirm", "", _row(index=3), NOW)
        self.assertEqual(decisions.load(self.run_dir), {3: history})

    def test_missing_file_loads_empty(self):
        self.assertEqual(decisions.load(self.run_dir), {})

    def assertCorruptFileKept(self, content):
        path = self.run_dir / "decisions.json"
        path.write_bytes(content.encode("utf-8"))
        self.assertRejected(409, decisions.load, self.run_dir)
        self.assertRejected(409, decisions.record, self.run_dir, 1, "confirm", "", _row(index=1), NOW)
        self.assertRejected(409, decisions.restore, self.run_dir, 1, _row(index=1), NOW)
        self.assertRejected(409, decisions.undo, self.run_dir, 1)
        self.assertEqual(path.read_bytes(), content.encode("utf-8"))

    def test_corrupt_file_is_not_overwritten(self):
        for content in ('{"0": [', '["not", "a", "dict"]', '{"zero": []}'):
            with self.subTest(content=content):
                self.assertCorruptFileKept(content)

    def test_history_that_is_not_a_list_of_dicts_is_corrupt(self):
        for content in ('{"0": "x"}', '{"0": ["x"]}'):
            with self.subTest(content=content):
                self.assertCorruptFileKept(content)

    def test_non_canonical_keys_are_corrupt(self):
        entry = '{"type": "confirm", "verdict": "deep tech", "note": "", "at": "2026-11-13T14:40:02"}'
        for content in (f'{{"01": [{entry}], "1": [{entry}]}}', f'{{"1_0": [{entry}]}}', f'{{"-1": [{entry}]}}'):
            with self.subTest(content=content):
                self.assertCorruptFileKept(content)

    def test_non_text_note_rejected(self):
        for note in (5, ["x"]):
            with self.subTest(note=note):
                self.assertRejected(409, decisions.record, self.run_dir, 0, "confirm", note, _row(), NOW)
        self.assertEqual(decisions.load(self.run_dir), {})
        history = decisions.record(self.run_dir, 0, "confirm", None, _row(), NOW)
        self.assertEqual(history[-1]["note"], "")

    def test_change_on_unknown_verdict_rejected(self):
        self.assertRejected(409, decisions.record, self.run_dir, 0, "change", "note", _row(verdict="unclear"), NOW)
        self.assertEqual(decisions.load(self.run_dir), {})

    def test_concurrent_writers_keep_every_decision(self):
        n = 8
        barrier = threading.Barrier(n)
        errors = []

        def decide(i):
            try:
                barrier.wait()
                decisions.record(self.run_dir, i, "confirm", "", _row(index=i), NOW)
            except Exception as exc:  # surfaced below
                errors.append(exc)

        threads = [threading.Thread(target=decide, args=(i,)) for i in range(n)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(errors, [])
        loaded = decisions.load(self.run_dir)
        self.assertEqual(sorted(loaded), list(range(n)))
        self.assertTrue(all(len(h) == 1 for h in loaded.values()))


if __name__ == "__main__":
    unittest.main()
