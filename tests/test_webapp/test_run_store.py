"""Tests for the run store:  python -m unittest tests.test_webapp.test_run_store"""

import json
import sys
import tempfile
import threading
import unittest
from datetime import datetime
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from webapp import run_store  # noqa: E402
from webapp.run_store import RunStore  # noqa: E402
from webapp.settings_map import clean_settings  # noqa: E402

CSV = "Company,About,Sector,UEN\nAlpha,Quantum sensors,Hardware,U1\nBeta,,Biotech,U2\n"
MAPPING = {"company_name": "Company", "description": "About", "domain": "Sector", "uen": "UEN"}


def _template() -> dict:
    with open(ROOT / "config.template.json", "r", encoding="utf-8") as f:
        return json.load(f)


class RunStoreTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)
        self.source = self.tmp / "upload" / "companies.csv"
        self.source.parent.mkdir()
        self.source.write_text(CSV, encoding="utf-8")
        self.store = RunStore(self.tmp / "runs", ROOT)
        self.settings = clean_settings({"mapping": MAPPING})

    def _create(self) -> dict:
        return self.store.create(self.source, self.settings, _template())

    def _write_run_state(self, run_id: str, pipeline_run_id: str = "R1", model=None) -> Path:
        path = self.store.run_dir(run_id) / "checkpoints" / "run_state.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"run_id": pipeline_run_id, "model": model or {}}), encoding="utf-8")
        return path

    def _checkpoint(self, run_id: str, pipeline_run_id: str = "R1") -> Path:
        path = self.store.run_dir(run_id) / "checkpoints" / "llm" / f"llm_progress_{pipeline_run_id}.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    @staticmethod
    def _line(index: int, classification: str, name: str = "") -> str:
        return json.dumps({"index": index, "result": {"company_name": name, "classification": classification}}) + "\n"

    def test_create_lays_out_folder_and_meta(self):
        meta = self._create()
        folder = self.store.run_dir(meta["id"])
        self.assertEqual(folder.parent, (self.tmp / "runs").resolve())
        self.assertRegex(meta["id"], r"^run_\d{8}_\d{6}$")

        self.assertEqual((folder / "input" / "companies.csv").read_text(encoding="utf-8"), CSV)
        for sub in ("checkpoints", "logs", "output"):
            self.assertTrue((folder / sub).is_dir(), sub)

        config = json.loads((folder / "config.json").read_text(encoding="utf-8"))
        self.assertTrue(Path(config["epo"]["epo_package_dir"]).is_absolute())
        self.assertEqual(config["pipeline"]["company_name_column"], "Company")
        self.assertEqual(config["pipeline"]["description_column"], "About")
        self.assertEqual(config["pipeline"]["domain_column"], "Sector")
        self.assertEqual(config["pipeline"]["uen_column"], "UEN")

        on_disk = json.loads((folder / "meta.json").read_text(encoding="utf-8"))
        self.assertEqual(on_disk, meta)
        self.assertEqual(self.store.get_meta(meta["id"]), meta)
        self.assertEqual(set(meta), {"id", "file", "rows", "createdAt", "endedAt", "status",
                                     "error", "settings", "model", "pid"})
        self.assertEqual(meta["status"], "running")
        self.assertEqual(meta["file"], "companies.csv")
        self.assertEqual(meta["rows"], 2)
        self.assertEqual(meta["settings"], self.settings)
        self.assertIsNone(meta["endedAt"])
        self.assertIsNone(meta["pid"])
        self.assertEqual(meta["error"], "")

        companies = self.store.companies(meta["id"])
        self.assertEqual([c["company_name"] for c in companies], ["Alpha", "Beta"])
        self.assertEqual(companies[0]["description"], "Quantum sensors")

    def test_id_collision_gets_suffix(self):
        fixed = datetime(2026, 11, 13, 14, 22, 33)
        with mock.patch.object(run_store, "_now", return_value=fixed):
            ids = [self._create()["id"] for _ in range(3)]
        self.assertEqual(ids, ["run_20261113_142233", "run_20261113_142233_2", "run_20261113_142233_3"])
        # Newest first; the numeric suffix orders runs created in the same second.
        self.assertEqual([m["id"] for m in self.store.list_runs()], list(reversed(ids)))

    def test_list_runs_newest_first(self):
        times = [datetime(2026, 11, 13, 9, 0, 0), datetime(2026, 11, 14, 8, 0, 0), datetime(2026, 11, 13, 10, 0, 0)]
        for t in times:
            with mock.patch.object(run_store, "_now", return_value=t):
                self._create()
        (self.tmp / "runs" / "not_a_run").mkdir()
        self.assertEqual([m["id"] for m in self.store.list_runs()],
                         ["run_20261114_080000", "run_20261113_100000", "run_20261113_090000"])
        self.assertEqual(RunStore(self.tmp / "missing", ROOT).list_runs(), [])

    def test_run_dir_rejects_traversal(self):
        meta = self._create()
        self.assertTrue(self.store.run_dir(meta["id"]).is_dir())
        (self.tmp / "runs" / "elsewhere").mkdir()
        for bad in ("../x", "..", "", "run_", "elsewhere", meta["id"] + "/..", meta["id"] + "\n",
                    "run_1/../" + meta["id"], "run_99999999_999999", "Run" + meta["id"][3:], None, 5):
            with self.subTest(run_id=bad):
                with self.assertRaises(KeyError):
                    self.store.run_dir(bad)

    def test_read_results_empty_before_pipeline_writes(self):
        run_id = self._create()["id"]
        self.assertEqual(self.store.read_results(run_id), ({}, 0))
        self.assertEqual(self.store.model_info(run_id), {})
        # run_state.json present but no checkpoint yet.
        self._write_run_state(run_id)
        self.assertEqual(self.store.read_results(run_id), ({}, 0))
        # run_state.json mid-write.
        (self.store.run_dir(run_id) / "checkpoints" / "run_state.json").write_text('{"run_id": "R', encoding="utf-8")
        self.assertEqual(self.store.read_results(run_id), ({}, 0))
        self.assertEqual(self.store.model_info(run_id), {})

    def test_read_results_last_write_wins_and_keeps_errors(self):
        run_id = self._create()["id"]
        model = {"provider": "anthropic", "id": "m"}
        self._write_run_state(run_id, model=model)
        path = self._checkpoint(run_id)
        path.write_text(
            self._line(0, "error", "Alpha")
            + self._line(1, "error", "Beta")
            + "not json\n"
            + self._line(0, "deep tech", "Alpha"),
            encoding="utf-8",
        )
        results, consumed = self.store.read_results(run_id)
        self.assertEqual(consumed, 4)
        self.assertEqual(sorted(results), [0, 1])
        self.assertEqual(results[0]["classification"], "deep tech")
        self.assertEqual(results[1]["classification"], "error")
        self.assertEqual(self.store.model_info(run_id), model)

    def test_torn_last_line_is_skipped_and_file_untouched(self):
        run_id = self._create()["id"]
        self._write_run_state(run_id)
        path = self._checkpoint(run_id)
        path.write_text(self._line(0, "deep tech") + self._line(1, "general tech"), encoding="utf-8")
        with open(path, "a", encoding="utf-8") as f:
            f.write('{"index": 2, "resu')
        before = path.read_bytes()
        results, consumed = self.store.read_results(run_id)
        self.assertEqual(sorted(results), [0, 1])
        self.assertEqual(consumed, 2)
        self.assertEqual(path.read_bytes(), before)

    def test_read_progress_latest_step_per_index(self):
        run_id = self._create()["id"]
        self.assertEqual(self.store.read_progress(run_id), ({}, ""))

        def event(kind, index=None, step=None, phase=None):
            return json.dumps({"kind": kind, "index": index, "step": step, "phase": phase,
                               "at": "2026-11-13T14:22:40"}) + "\n"

        path = self.store.run_dir(run_id) / "progress.jsonl"
        path.write_text(
            event("step", 0, "Enrichment")
            + event("phase", phase="Gather company data")
            + event("step", 0, "Patent lookup")
            + event("step", 1, "Classification")
            + "garbage\n"
            + event("phase", phase="Batch job · 2 of 5")
            + event("phase", phase="Batch job · 2 of 5")
            + '{"kind": "step", "index": 1, "st',
            encoding="utf-8",
        )
        before = path.read_bytes()
        steps, phase = self.store.read_progress(run_id)
        self.assertEqual(steps, {0: "Patent lookup", 1: "Classification"})
        self.assertEqual(phase, "Batch job · 2 of 5")
        self.assertEqual(path.read_bytes(), before)

    def test_read_results_survives_run_state_rewrite(self):
        run_id = self._create()["id"]
        self._write_run_state(run_id)
        self._checkpoint(run_id).write_text(self._line(0, "deep tech", "Alpha"), encoding="utf-8")
        self.assertEqual(sorted(self.store.read_results(run_id)[0]), [0])
        # The pipeline rewrites run_state.json in place: momentarily empty or torn.
        state = self.store.run_dir(run_id) / "checkpoints" / "run_state.json"
        for torn in ("", '{"run_id": "R'):
            with self.subTest(torn=torn):
                state.write_text(torn, encoding="utf-8")
                results, consumed = self.store.read_results(run_id)
                self.assertEqual((sorted(results), consumed), ([0], 1))
        # A readable state naming a new pipeline run switches to it.
        self._write_run_state(run_id, "R2")
        self.assertEqual(self.store.read_results(run_id), ({}, 0))
        # Another run never borrows this run's pipeline id.
        other = self._create()["id"]
        (self.store.run_dir(other) / "checkpoints" / "run_state.json").write_text("", encoding="utf-8")
        self.assertEqual(self.store.read_results(other), ({}, 0))

    def test_meta_write_retries_while_a_reader_holds_the_file(self):
        meta = self._create()
        real_replace = run_store.os.replace
        calls = []

        def flaky_replace(src, dst):
            calls.append(dst)
            if len(calls) <= 2:
                raise PermissionError(13, "The process cannot access the file")
            real_replace(src, dst)

        with mock.patch.object(run_store.os, "replace", side_effect=flaky_replace):
            self.store.update_meta(meta["id"], status="stopped")
        self.assertEqual(len(calls), 3)
        self.assertEqual(self.store.get_meta(meta["id"])["status"], "stopped")

        # A file that stays locked still fails, without leaving a temp file behind.
        folder = self.store.run_dir(meta["id"])
        listing = sorted(p.name for p in folder.iterdir())
        with mock.patch.object(run_store.os, "replace", side_effect=PermissionError(13, "locked")), \
                mock.patch.object(run_store.time, "sleep"):
            with self.assertRaises(PermissionError):
                self.store.update_meta(meta["id"], status="failed")
        self.assertEqual(sorted(p.name for p in folder.iterdir()), listing)
        self.assertEqual(self.store.get_meta(meta["id"])["status"], "stopped")

    def test_meta_writes_and_reads_concurrently(self):
        run_id = self._create()["id"]
        errors = []
        done = threading.Event()

        def read():
            while not done.is_set():
                try:
                    self.store.get_meta(run_id)
                except Exception as exc:  # noqa: BLE001 - collected for the assertion
                    errors.append(exc)

        readers = [threading.Thread(target=read) for _ in range(3)]
        for t in readers:
            t.start()
        try:
            for n in range(50):
                self.store.update_meta(run_id, pid=n)
        finally:
            done.set()
            for t in readers:
                t.join()
        self.assertEqual(errors, [])
        self.assertEqual(self.store.get_meta(run_id)["pid"], 49)

    def test_update_meta_is_atomic_replace(self):
        meta = self._create()
        folder = self.store.run_dir(meta["id"])
        updated = self.store.update_meta(meta["id"], status="complete", pid=123)
        self.assertEqual(updated["status"], "complete")
        self.assertEqual(updated["pid"], 123)
        self.assertEqual(self.store.get_meta(meta["id"]), updated)

        before = (folder / "meta.json").read_bytes()
        listing = sorted(p.name for p in folder.iterdir())
        with mock.patch.object(run_store.json, "dump", side_effect=RuntimeError("disk full")):
            with self.assertRaises(RuntimeError):
                self.store.update_meta(meta["id"], status="failed")
        self.assertEqual((folder / "meta.json").read_bytes(), before)
        self.assertEqual(sorted(p.name for p in folder.iterdir()), listing)


if __name__ == "__main__":
    unittest.main()
