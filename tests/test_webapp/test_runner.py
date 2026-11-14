"""Tests for the runner:  python -m unittest tests.test_webapp.test_runner"""

import json
import os
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest import mock

from openpyxl import Workbook

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from webapp.rows import to_row  # noqa: E402
from webapp.run_store import RunStore  # noqa: E402
from webapp.runner import Runner, RunnerError  # noqa: E402
from webapp.settings_map import clean_settings  # noqa: E402

FAKE = str(Path(__file__).resolve().parent / "fake_classify.py")
# A live process that writes nothing, for tests that only need a run to be running.
SLEEPER = [sys.executable, "-c", "import time; time.sleep(60)"]
# A pipeline that succeeds at once, for tests of status only (the fake takes
# about a second to start because it loads pandas).
SUCCEEDS = [sys.executable, "-c", "pass"]
MAPPING = {"company_name": "Company", "description": "About", "domain": "Sector", "uen": "UEN"}
DEADLINE_S = 30


def _template() -> dict:
    with open(ROOT / "config.template.json", "r", encoding="utf-8") as f:
        return json.load(f)


class RunnerTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)
        self.store = RunStore(self.tmp / "runs", ROOT)
        self.runner = self._runner([sys.executable, FAKE])
        env = mock.patch.dict(os.environ)
        env.start()
        self.addCleanup(env.stop)
        os.environ.pop("FAKE_FATAL", None)
        os.environ.pop("FAKE_DELAY_S", None)

    def _runner(self, command) -> Runner:
        runner = Runner(self.store, ROOT, command=command)
        self.addCleanup(runner.shutdown)  # runs before the temp dir is removed
        return runner

    def _create(self, rows: int) -> str:
        wb = Workbook()
        ws = wb.active
        ws.append(["Company", "About", "Sector", "UEN"])
        for i in range(rows):
            ws.append([f"Company {i}", f"Makes thing {i}", "Hardware", f"U{i}"])
        source = self.tmp / "upload" / f"companies_{rows}.xlsx"
        source.parent.mkdir(exist_ok=True)
        wb.save(source)
        return self.store.create(source, clean_settings({"mapping": MAPPING}), _template())["id"]

    def _wait(self, predicate, runner=None):
        runner = runner or self.runner
        deadline = time.monotonic() + DEADLINE_S
        while time.monotonic() < deadline:
            runner.poll()
            if predicate():
                return
            time.sleep(0.02)
        self.fail(f"timed out; meta is {self.store.list_runs()}")

    def _wait_status(self, run_id, status, runner=None):
        self._wait_ended(run_id, runner)
        meta = self.store.get_meta(run_id)
        self.assertEqual(meta["status"], status, meta["error"])

    def _wait_ended(self, run_id, runner=None):
        self._wait(lambda: self.store.get_meta(run_id)["status"] != "running", runner)

    def _checkpoint_indices(self, run_id) -> list:
        path = self.store.run_dir(run_id) / "checkpoints" / "llm" / "llm_progress_fake.jsonl"
        return [json.loads(line)["index"] for line in path.read_text(encoding="utf-8").splitlines()]

    def _row(self, run_id, index, results) -> dict:
        config = json.loads((self.store.run_dir(run_id) / "config.json").read_text(encoding="utf-8"))
        return to_row(index, self.store.companies(run_id)[index], results.get(index), None, [], config)

    def test_run_completes_and_results_are_readable(self):
        run_id = self._create(8)
        self.runner.start(run_id)
        meta = self.store.get_meta(run_id)
        self.assertEqual(meta["status"], "running")
        self.assertIsInstance(meta["pid"], int)
        self.assertIsNone(meta["endedAt"])

        self._wait_status(run_id, "complete")
        meta = self.store.get_meta(run_id)
        self.assertTrue(meta["endedAt"])
        self.assertEqual(meta["error"], "")
        self.assertEqual(meta["model"], "fake-model-1")

        results, _ = self.store.read_results(run_id)
        self.assertEqual(sorted(results), list(range(8)))
        self.assertEqual(self._row(run_id, 0, results)["result"]["verdict"], "deep tech")
        self.assertEqual(self._row(run_id, 1, results)["result"]["verdict"], "general tech")
        self.assertEqual(self._row(run_id, 4, results)["result"]["risk"], "Escalate")
        self.assertEqual(self._row(run_id, 0, results)["result"]["risk"], "Clear")
        self.assertTrue(self._row(run_id, 6, results)["result"]["error"])
        self.assertIn("CLASSIFICATION COMPLETE",
                      (self.store.run_dir(run_id) / "process.log").read_text(encoding="utf-8"))
        steps, phase = self.store.read_progress(run_id)
        self.assertEqual(steps, {i: "Validation" for i in range(8)})
        self.assertEqual(phase, "Classify companies")

    def test_stop_keeps_finished_rows_and_resume_finishes(self):
        os.environ["FAKE_DELAY_S"] = "0.3"
        run_id = self._create(5)
        self.runner.start(run_id)
        self._wait(lambda: len(self.store.read_results(run_id)[0]) >= 1)
        self.runner.stop(run_id)
        self.assertEqual(self.store.get_meta(run_id)["status"], "stopped")
        kept, _ = self.store.read_results(run_id)
        self.assertGreaterEqual(len(kept), 1)
        self.assertLess(len(kept), 5)
        # Polling later does not turn the kill's exit code into "failed".
        self.runner.poll()
        self.assertEqual(self.store.get_meta(run_id)["status"], "stopped")
        with self.assertRaises(RunnerError) as ctx:
            self.runner.stop(run_id)
        self.assertEqual(ctx.exception.status, 409)

        os.environ["FAKE_DELAY_S"] = "0.01"
        self.runner.resume(run_id)
        self.assertEqual(self.store.get_meta(run_id)["status"], "running")
        self._wait_status(run_id, "complete")
        results, _ = self.store.read_results(run_id)
        self.assertEqual(sorted(results), list(range(5)))
        for index, result in kept.items():
            self.assertEqual(results[index], result)
        self.assertEqual(sorted(self._checkpoint_indices(run_id)), list(range(5)))  # none lost or duplicated

    def test_fatal_before_first_row_marks_failed_with_message(self):
        os.environ["FAKE_FATAL"] = "1"
        run_id = self._create(3)
        self.runner.start(run_id)
        self._wait_ended(run_id)
        meta = self.store.get_meta(run_id)
        self.assertEqual(meta["status"], "failed")
        self.assertEqual(meta["error"], "Model problem: fake failure")
        self.assertEqual(self.store.read_results(run_id), ({}, 0))

        # A failed run can be resumed; a clean resume clears the error.
        succeeds = self._runner(SUCCEEDS)
        succeeds.resume(run_id)
        self.assertEqual(self.store.get_meta(run_id)["error"], "")
        self._wait_status(run_id, "complete", succeeds)
        self.assertEqual(self.store.get_meta(run_id)["error"], "")

    def test_failure_message_reads_only_this_attempts_log_tail(self):
        run_id = self._create(3)
        log = self.store.run_dir(run_id) / "process.log"
        # An earlier attempt's fatal line, a large log and bytes that are not UTF-8.
        log.write_bytes(b"[FATAL] stale failure\n" + b"x" * 2_000_000 + b"\n\xff\xfe\x80 bad bytes\n")
        runner = self._runner([sys.executable, "-c", "import sys; print('last words \\xe9'); print(); sys.exit(3)"])
        runner.start(run_id)
        self._wait_ended(run_id, runner)
        meta = self.store.get_meta(run_id)
        self.assertEqual(meta["status"], "failed")
        self.assertEqual(meta["error"], "last words é")

        # Nothing printed this time: the earlier attempt's lines are not used.
        silent = self._runner([sys.executable, "-c", "import sys; sys.exit(3)"])
        silent.resume(run_id)
        self.assertEqual(self.store.get_meta(run_id)["error"], "")
        self._wait_ended(run_id, silent)
        self.assertEqual(self.store.get_meta(run_id)["error"], "The pipeline exited with code 3.")

        # A command that cannot be launched at all fails the run straight away.
        missing = self._runner([str(self.tmp / "no_such_program.exe")])
        missing.resume(run_id)
        meta = self.store.get_meta(run_id)
        self.assertEqual(meta["status"], "failed")
        self.assertTrue(meta["error"].startswith("Could not start the pipeline:"), meta["error"])

    def test_resume_rejected_while_running_and_when_clean_complete(self):
        sleeper = self._runner(SLEEPER)
        live = self._create(3)
        sleeper.start(live)
        for call in (sleeper.resume, sleeper.start):
            with self.subTest(call=call.__name__):
                with self.assertRaises(RunnerError) as ctx:
                    call(live)
                self.assertEqual(ctx.exception.status, 409)
        sleeper.stop(live)
        self.assertEqual(self.store.get_meta(live)["status"], "stopped")

        clean = self._create(3)
        self.runner.start(clean)
        self._wait_status(clean, "complete")
        with self.assertRaises(RunnerError) as ctx:
            self.runner.resume(clean)
        self.assertEqual(ctx.exception.status, 409)
        self.assertEqual(self.store.get_meta(clean)["status"], "complete")

        with self.assertRaises(KeyError):
            self.runner.resume("run_99999999_999999")
        with self.assertRaises(KeyError):
            self.runner.stop("../x")

    def test_resume_allowed_on_complete_run_with_error_rows(self):
        run_id = self._create(7)
        self.runner.start(run_id)
        self._wait_status(run_id, "complete")
        results, _ = self.store.read_results(run_id)
        self.assertEqual(results[6]["classification"], "error")

        self.runner.resume(run_id)
        self._wait_status(run_id, "complete")
        results, _ = self.store.read_results(run_id)
        self.assertEqual(sorted(results), list(range(7)))
        self.assertNotEqual(results[6]["classification"], "error")
        # Only the error row was redone.
        self.assertEqual(self._checkpoint_indices(run_id), [0, 1, 2, 3, 4, 5, 6, 6])

    def test_reconcile_marks_orphans_interrupted(self):
        orphan = self._create(3)        # meta says running; no process
        done = self._create(3)
        self.store.update_meta(done, status="complete")
        sleeper = self._runner(SLEEPER)
        live = self._create(3)
        sleeper.start(live)

        sleeper.reconcile()
        self.assertEqual(self.store.get_meta(orphan)["status"], "interrupted")
        self.assertEqual(self.store.get_meta(done)["status"], "complete")
        self.assertEqual(self.store.get_meta(live)["status"], "running")

        fresh = Runner(self.store, ROOT, command=[sys.executable, FAKE])
        self.store.update_meta(orphan, status="running")
        fresh.reconcile()
        self.assertEqual(self.store.get_meta(orphan)["status"], "interrupted")
        self.assertEqual(self.store.get_meta(live)["status"], "interrupted")

        # An interrupted run resumes.
        sleeper.stop(live)
        sleeper.command = SUCCEEDS
        sleeper.resume(orphan)
        self._wait_status(orphan, "complete", sleeper)

    def test_progress_file_is_written_into_the_run_folder(self):
        # A probe in place of the pipeline records how it was launched.
        probe = ("import json, os, sys; "
                 "open(os.environ['DTC_PROGRESS_FILE'], 'a').write('{}\\n'); "
                 "json.dump({'cwd': os.getcwd(), 'progress': os.environ['DTC_PROGRESS_FILE'], "
                 "'io': os.environ['PYTHONIOENCODING'], 'argv': sys.argv[1:]}, open('probe.json', 'w'))")
        runner = self._runner([sys.executable, "-c", probe])
        run_id = self._create(3)
        folder = self.store.run_dir(run_id)
        runner.start(run_id)
        self._wait_status(run_id, "complete", runner)
        seen = json.loads((folder / "probe.json").read_text(encoding="utf-8"))
        self.assertEqual(Path(seen["cwd"]).resolve(), folder)
        self.assertEqual(Path(seen["progress"]), folder / "progress.jsonl")
        self.assertTrue((folder / "progress.jsonl").is_file())
        self.assertEqual(seen["io"], "utf-8")
        expected = ["--input", str(folder / "input" / "companies_3.xlsx"), "--output", str(folder / "output"),
                    "--config", str(folder / "config.json"), "--env", str(ROOT / ".env")]
        self.assertEqual(seen["argv"], expected)

        self.store.update_meta(run_id, status="stopped")
        runner.resume(run_id)
        self._wait_status(run_id, "complete", runner)
        seen = json.loads((folder / "probe.json").read_text(encoding="utf-8"))
        self.assertEqual(seen["argv"], expected + ["--resume"])

    def test_shutdown_interrupts_live_runs(self):
        os.environ["FAKE_DELAY_S"] = "0.3"
        run_id = self._create(5)
        self.runner.start(run_id)
        self.runner.shutdown()
        self.assertEqual(self.store.get_meta(run_id)["status"], "interrupted")
        # The process is gone and the log handle closed: the folder can be removed.
        os.replace(self.store.run_dir(run_id), self.tmp / "moved")
        self.runner.poll()

    def test_calls_from_many_threads(self):
        # As under the HTTP layer: polls from a thread pool while other
        # requests start, stop and resume runs.
        runner = self._runner(SLEEPER)
        run_ids = [self._create(3) for _ in range(3)]
        errors = []
        done = threading.Event()

        def hammer():
            while not done.is_set():
                try:
                    runner.poll()
                    for run_id in run_ids:
                        self.store.get_meta(run_id)
                except Exception as exc:  # noqa: BLE001 - collected for the assertion
                    errors.append(exc)

        threads = [threading.Thread(target=hammer) for _ in range(4)]
        for t in threads:
            t.start()
        try:
            stoppers = []
            for run_id in run_ids:
                runner.start(run_id)
                stoppers.append(threading.Thread(target=runner.stop, args=(run_id,)))
            for t in stoppers:
                t.start()
            for t in stoppers:
                t.join()
            self.assertEqual([self.store.get_meta(r)["status"] for r in run_ids], ["stopped"] * 3)
            runner.command = SUCCEEDS
            for run_id in run_ids:
                runner.resume(run_id)
            self._wait(lambda: all(self.store.get_meta(r)["status"] == "complete" for r in run_ids), runner)
        finally:
            done.set()
            for t in threads:
                t.join()
        self.assertEqual(errors, [])

if __name__ == "__main__":
    unittest.main()
