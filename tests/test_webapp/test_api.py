"""Tests for the HTTP API:  python -m unittest tests.test_webapp.test_api"""

import io
import json
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient
from openpyxl import Workbook, load_workbook

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tests.test_webapp import fake_classify  # noqa: E402
from webapp import files  # noqa: E402
from webapp.app import create_app  # noqa: E402
from webapp.estimate import estimate_request  # noqa: E402
from webapp.decisions import CLEAR_NOTE_REQUIRED  # noqa: E402

FAKE = [sys.executable, str(Path(__file__).resolve().parent / "fake_classify.py")]
# A live process that writes nothing: the run stays running with no results.
SLEEPER = [sys.executable, "-c", "import time; time.sleep(60)"]
MAPPING = {"company_name": "Company", "description": "About", "domain": "Sector", "uen": "UEN"}
SETTINGS = {"mapping": MAPPING}
SECRET = "sk-test-not-a-real-key-4242"
XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
DEADLINE_S = 30


def _xlsx(rows: int) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.append(["Company", "About", "Sector", "UEN"])
    for i in range(rows):
        ws.append([f"Company {i}", f"Makes thing {i}", "Hardware", f"U{i}"])
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def _sheet(content: bytes, name: str):
    wb = load_workbook(io.BytesIO(content))
    return wb, [[c.value for c in row] for row in wb[name].iter_rows()]


class ApiTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name)
        env = mock.patch.dict(os.environ)
        env.start()
        self.addCleanup(env.stop)
        for var in ("FAKE_FATAL", "FAKE_DELAY_S"):
            os.environ.pop(var, None)
        os.environ["ANTHROPIC_API_KEY"] = SECRET
        self.client = self._client(FAKE)

    def _client(self, command) -> TestClient:
        """A client over its own data folder; the app shuts down (killing its processes) at cleanup."""
        data_root = Path(tempfile.mkdtemp(dir=self.tmp))
        client = TestClient(create_app(ROOT, data_root, runner_command=command))
        client.__enter__()
        self.addCleanup(client.__exit__, None, None, None)
        return client

    # --- helpers ---

    def _upload(self, rows=8, client=None, name="companies.xlsx") -> dict:
        r = (client or self.client).post("/api/files", files={"file": (name, _xlsx(rows), XLSX_TYPE)})
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def _start(self, rows=8, client=None, **body) -> dict:
        client = client or self.client
        upload = self._upload(rows, client)
        r = client.post("/api/runs", json={"fileId": upload["fileId"], "settings": SETTINGS, **body})
        self.assertEqual(r.status_code, 201, r.text)
        return r.json()

    def _get(self, run_id, client=None) -> dict:
        r = (client or self.client).get(f"/api/runs/{run_id}")
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def _wait_ended(self, run_id, client=None) -> dict:
        deadline = time.monotonic() + DEADLINE_S
        while time.monotonic() < deadline:
            data = self._get(run_id, client)
            if data["run"]["status"] != "running":
                return data
            time.sleep(0.05)
        self.fail(f"run {run_id} did not end")

    def _complete_run(self, rows=8) -> dict:
        run = self._start(rows)
        data = self._wait_ended(run["id"])
        self.assertEqual(data["run"]["status"], "complete", data["run"]["error"])
        return data

    def _decide(self, run_id, index, choice, note="", client=None):
        return (client or self.client).put(f"/api/runs/{run_id}/rows/{index}/decision",
                                           json={"choice": choice, "note": note})

    def _sleeping_run_with_results(self, rows, indexes) -> tuple:
        """A running run whose checkpoint holds fake results for the given indexes only."""
        client = self._client(SLEEPER)
        run = self._start(rows, client)
        folder = Path(client.app.state.store.run_dir(run["id"]))
        (folder / "checkpoints" / "run_state.json").write_text(json.dumps({"run_id": "fake"}), encoding="utf-8")
        checkpoint = folder / "checkpoints" / "llm" / "llm_progress_fake.jsonl"
        checkpoint.parent.mkdir(parents=True, exist_ok=True)
        checkpoint.write_text("".join(
            json.dumps({"index": i, "result": fake_classify._result(i, f"Company {i}", first_pass=False)}) + "\n"
            for i in indexes), encoding="utf-8")
        return client, run["id"]

    # --- setup, files, estimate ---

    def test_setup_has_three_providers_and_no_secrets(self):
        r = self.client.get("/api/setup")
        self.assertEqual(r.status_code, 200)
        providers = {p["id"]: p for p in r.json()["providers"]}
        self.assertEqual(set(providers), {"anthropic", "gemini", "openai"})
        self.assertTrue(providers["anthropic"]["keySet"])
        self.assertNotIn(SECRET, r.text)

    def test_upload_reports_the_file_and_rejects_bad_ones(self):
        upload = self._upload(3)
        self.assertEqual(upload["rows"], 3)
        self.assertEqual(upload["mapping"]["company_name"], "Company")
        self.assertRegex(upload["fileId"], r"^[0-9a-f]{32}$")

        r = self.client.post("/api/files", files={"file": ("notes.txt", b"hello", "text/plain")})
        self.assertEqual(r.status_code, 400)
        self.assertIn(".xlsx", r.json()["detail"])
        r = self.client.post("/api/files", data={"other": "x"})
        self.assertEqual(r.status_code, 400)

        with mock.patch.object(files, "MAX_UPLOAD_BYTES", 1000):
            r = self.client.post("/api/files", files={"file": ("big.csv", b"Company\n" + b"x" * 5000, "text/csv")})
        self.assertEqual(r.status_code, 400)
        with mock.patch.object(files, "MAX_UPLOAD_BYTES", 1000):
            self.assertEqual(r.json()["detail"], files.too_large_message())
        # Refused by its Content-Length, before the body is parsed, with the
        # message save_upload gives for too many bytes.
        with mock.patch.object(files, "MAX_UPLOAD_BYTES", 10), \
                mock.patch("starlette.requests.Request.form", side_effect=AssertionError("body was parsed")):
            r = self.client.post("/api/files", files={"file": ("big.csv", b"x" * 70_000, "text/csv")})
            with self.assertRaises(files.UploadError) as ctx:
                files.save_upload(self.tmp / "unused", "big.csv", b"x" * 11)
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["detail"], str(ctx.exception))
        # Only the first, good upload was kept.
        uploads = Path(self.client.app.state.store.root).parent / "uploads"
        self.assertEqual([p.name for p in uploads.iterdir()], [upload["fileId"]])

    def test_estimate(self):
        r = self.client.post("/api/estimate", json={"settings": {}, "rows": 10})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIn("secs", r.json())
        for body in ({"settings": {}}, {"rows": -1}, {"rows": 2_000_000}, [1]):
            with self.subTest(body=body):
                r = self.client.post("/api/estimate", json=body)
                self.assertEqual(r.status_code, 400)
                self.assertTrue(r.json()["detail"])
        r = self.client.post("/api/estimate", content=b"{not json", headers={"content-type": "application/json"})
        self.assertIn(r.status_code, (400, 422))

    def test_setup_and_estimate_use_the_same_batch_threshold(self):
        threshold = self.client.get("/api/setup").json()["batchMinCompanies"]
        r = self.client.post("/api/estimate", json={"settings": {"batch": True}, "rows": 4})
        self.assertEqual(r.json()["batchMin"], threshold)

    def test_setup_reports_the_configured_workers(self):
        project = Path(tempfile.mkdtemp(dir=self.tmp))
        (project / "config.json").write_text(json.dumps({"concurrency": {"workers": 3}}), encoding="utf-8")
        (project / "web").mkdir()  # the app serves it
        client = TestClient(create_app(project, Path(tempfile.mkdtemp(dir=self.tmp)), runner_command=FAKE))
        with client:
            self.assertEqual(client.get("/api/setup").json()["workers"], 3)
            # The estimate's run time uses the same worker count.
            body = {"settings": {"epo": False, "batch": False}, "rows": 100}
            secs = client.post("/api/estimate", json=body).json()["secs"]
            self.assertAlmostEqual(secs, estimate_request(body, workers=3)["secs"])

    # --- runs ---

    def test_upload_then_start_then_poll_to_complete(self):
        run = self._start(8)
        self.assertEqual(run["total"], 8)
        self.assertEqual(run["file"], "companies.xlsx")
        self.assertEqual(run["status"], "running")
        self.assertEqual(run["settings"]["mapping"], MAPPING)

        seen = []
        cursor = 0
        deadline = time.monotonic() + DEADLINE_S
        while True:
            self.assertLess(time.monotonic(), deadline, "run did not complete")
            r = self.client.get(f"/api/runs/{run['id']}/changes", params={"cursor": cursor})
            self.assertEqual(r.status_code, 200, r.text)
            data = r.json()
            seen += [row["index"] for row in data["rows"]]
            self.assertTrue(all(row["result"] is not None for row in data["rows"]))
            self.assertTrue(all(isinstance(k, str) for k in data["steps"]))
            cursor = data["cursor"]
            if data["run"]["status"] != "running":
                break
            time.sleep(0.05)
        self.assertEqual(data["run"]["status"], "complete", data["run"]["error"])
        self.assertEqual(sorted(seen), list(range(8)))
        self.assertEqual(len(seen), 8)

        full = self._get(run["id"])
        self.assertEqual(full["cursor"], cursor)
        self.assertEqual([row["index"] for row in full["rows"]], list(range(8)))
        self.assertEqual(full["rows"][3]["name"], "Company 3")
        self.assertEqual(full["run"]["counts"]["done"], 8)
        self.assertEqual(full["run"]["counts"]["errors"], 1)
        self.assertEqual(full["run"]["model"], "fake-model-1")
        self.assertEqual(full["run"]["phase"], "Classify companies")

        runs = self.client.get("/api/runs").json()
        self.assertEqual([r["id"] for r in runs], [run["id"]])
        self.assertEqual(runs[0]["counts"], full["run"]["counts"])

    def test_runs_are_listed_newest_first(self):
        client = self._client(SLEEPER)
        first = self._start(2, client)["id"]
        second = self._start(2, client)["id"]
        self.assertEqual([r["id"] for r in client.get("/api/runs").json()], [second, first])

    def test_a_damaged_run_is_left_out_of_the_list(self):
        client = self._client(SLEEPER)
        damaged = self._start(2, client)["id"]
        healthy = self._start(2, client)["id"]
        store = client.app.state.store
        # Not an HTTPException: decisions.json that cannot be read is a DecisionError.
        (store.run_dir(damaged) / "decisions.json").write_text("{not json", encoding="utf-8")
        with self.assertLogs("webapp.app", "WARNING") as logs:
            for _ in range(2):
                r = client.get("/api/runs")
                self.assertEqual(r.status_code, 200, r.text)
                self.assertEqual([run["id"] for run in r.json()], [healthy])
        self.assertEqual(len(logs.records), 1)
        self.assertIn(damaged, logs.output[0])

    def test_start_rejects_missing_name_mapping_and_missing_key(self):
        upload = self._upload(3)

        def start(**overrides):
            return self.client.post("/api/runs", json={"fileId": upload["fileId"], "settings": SETTINGS, **overrides})

        r = start(settings={"mapping": {"description": "About"}})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["detail"], "Choose the column that holds the company name.")
        r = start(settings={"mapping": {"company_name": "Nope"}})
        self.assertEqual(r.status_code, 400)
        self.assertIn("'Nope'", r.json()["detail"])
        r = start(settings={"provider": "nope", "mapping": MAPPING})
        self.assertEqual(r.status_code, 400)

        del os.environ["ANTHROPIC_API_KEY"]
        r = start()
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["detail"], "ANTHROPIC_API_KEY is not set in .env")
        os.environ["ANTHROPIC_API_KEY"] = SECRET

        r = start(exclude=[0, 1, 2])
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["detail"], "Tick at least one company to start")
        for exclude in ([3], ["1"], "1"):
            with self.subTest(exclude=exclude):
                r = start(exclude=exclude)
                self.assertEqual(r.status_code, 400)
                self.assertTrue(r.json()["detail"])

        r = start(fileId="0" * 32)
        self.assertEqual(r.status_code, 400)
        for bad in ([], "x", {"settings": SETTINGS}):
            with self.subTest(body=bad):
                self.assertEqual(self.client.post("/api/runs", json=bad).status_code, 400)
        r = self.client.post("/api/runs", content=b"{", headers={"content-type": "application/json"})
        self.assertIn(r.status_code, (400, 422))

        self.assertEqual(self.client.get("/api/runs").json(), [])

    def test_start_leaves_out_excluded_rows(self):
        run = self._start(5, exclude=[1, 3])
        self.assertEqual(run["total"], 3)
        data = self._wait_ended(run["id"])
        self.assertEqual([row["name"] for row in data["rows"]], ["Company 0", "Company 2", "Company 4"])

    def test_run_file_is_offered_again_as_a_new_upload(self):
        # "Same settings…": the run's own input (its ticked rows only) becomes a new upload.
        run = self._start(5, exclude=[1, 3])
        self._wait_ended(run["id"])
        r = self.client.post(f"/api/runs/{run['id']}/file")
        self.assertEqual(r.status_code, 200, r.text)
        info = r.json()
        self.assertEqual(info["name"], "companies.xlsx")
        self.assertEqual(info["rows"], 3)
        self.assertEqual([row[0] for row in info["table"]], ["Company 0", "Company 2", "Company 4"])
        self.assertEqual(info["mapping"]["company_name"], "Company")
        again = self.client.post("/api/runs", json={"fileId": info["fileId"], "settings": SETTINGS})
        self.assertEqual(again.status_code, 201, again.text)
        self.assertEqual(again.json()["total"], 3)

    def test_run_file_is_404_for_an_unknown_run_or_a_missing_input(self):
        self.assertEqual(self.client.post("/api/runs/run_19990101_000000/file").status_code, 404)
        run = self._start(2)
        self._wait_ended(run["id"])
        folder = Path(self.client.app.state.store.run_dir(run["id"]))
        (folder / "input" / "companies.xlsx").unlink()
        r = self.client.post(f"/api/runs/{run['id']}/file")
        self.assertEqual(r.status_code, 404)
        self.assertEqual(r.json()["detail"], "This run's file is no longer available. Please choose the file again.")

    def test_stop_and_resume_roundtrip(self):
        os.environ["FAKE_DELAY_S"] = "0.5"
        run = self._start(5)
        r = self.client.post(f"/api/runs/{run['id']}/stop")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["status"], "stopped")
        self.assertEqual(r.json()["id"], run["id"])
        r = self.client.post(f"/api/runs/{run['id']}/stop")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["detail"], "This run is not running.")

        os.environ["FAKE_DELAY_S"] = "0.01"
        r = self.client.post(f"/api/runs/{run['id']}/resume")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["status"], "running")
        self.assertEqual(self.client.post(f"/api/runs/{run['id']}/resume").status_code, 409)
        data = self._wait_ended(run["id"])
        self.assertEqual(data["run"]["status"], "complete", data["run"]["error"])
        self.assertTrue(all(row["result"] for row in data["rows"]))

    def test_failed_run_reports_error(self):
        os.environ["FAKE_FATAL"] = "1"
        run = self._start(3)
        data = self._wait_ended(run["id"])
        self.assertEqual(data["run"]["status"], "failed")
        self.assertEqual(data["run"]["error"], "Model problem: fake failure")

    # --- decisions ---

    def test_decision_endpoints(self):
        data = self._complete_run(8)
        run_id = data["run"]["id"]
        self.assertEqual(data["rows"][4]["result"]["risk"], "Escalate")
        open_before = data["run"]["counts"]["open"]

        r = self._decide(run_id, 4, "confirm")
        self.assertEqual(r.status_code, 200, r.text)
        row = r.json()
        self.assertEqual(row["index"], 4)
        self.assertEqual(len(row["history"]), 1)
        self.assertEqual(row["history"][0]["type"], "confirm")
        self.assertEqual(self._get(run_id)["run"]["counts"]["open"], open_before - 1)

        r = self.client.post(f"/api/runs/{run_id}/rows/4/restore")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual([e["type"] for e in r.json()["history"]], ["confirm", "restore"])
        self.assertEqual(self._get(run_id)["run"]["counts"]["open"], open_before)

        r = self.client.post(f"/api/runs/{run_id}/rows/4/undo")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual([e["type"] for e in r.json()["history"]], ["confirm"])
        self.assertEqual(self._get(run_id)["rows"][4]["history"], r.json()["history"])

        r = self.client.post(f"/api/runs/{run_id}/rows/0/restore")
        self.assertEqual(r.status_code, 409)
        r = self.client.post(f"/api/runs/{run_id}/rows/0/undo")
        self.assertEqual(r.status_code, 409)
        # Row 6 ended in an error.
        self.assertEqual(self._decide(run_id, 6, "confirm").status_code, 409)
        for body in ([], "confirm", None):
            with self.subTest(body=body):
                r = self.client.put(f"/api/runs/{run_id}/rows/4/decision", json=body)
                self.assertEqual(r.status_code, 400)

    def test_change_on_clear_without_note_is_409(self):
        data = self._complete_run(3)
        run_id = data["run"]["id"]
        self.assertEqual(data["rows"][0]["result"]["risk"], "Clear")
        r = self._decide(run_id, 0, "change")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["detail"], CLEAR_NOTE_REQUIRED)
        r = self._decide(run_id, 0, "change", note="Not deep tech: resells hardware.")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["history"][-1]["verdict"], "general tech")

    def test_decision_on_pending_row_is_409_and_bad_index_404(self):
        client = self._client(SLEEPER)
        run_id = self._start(3, client)["id"]
        r = self._decide(run_id, 1, "confirm", client=client)
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["detail"], "This row has no result yet.")
        for index in (3, 99, -1):
            with self.subTest(index=index):
                self.assertEqual(self._decide(run_id, index, "confirm", client=client).status_code, 404)
                self.assertEqual(client.post(f"/api/runs/{run_id}/rows/{index}/restore").status_code, 404)
                self.assertEqual(client.post(f"/api/runs/{run_id}/rows/{index}/undo").status_code, 404)
        self.assertEqual(client.post(f"/api/runs/{run_id}/rows/x/undo").status_code, 422)

    # --- export ---

    def test_export_contains_reviewer_columns(self):
        data = self._complete_run(8)
        run_id = data["run"]["id"]
        self.assertEqual(self._decide(run_id, 4, "change", note="Checked").status_code, 200)

        r = self.client.get(f"/api/runs/{run_id}/export.xlsx")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.headers["content-type"], XLSX_TYPE)
        self.assertIn(f'filename="companies_classified_{run_id[len("run_"):]}.xlsx"',
                      r.headers["content-disposition"])
        wb, cells = _sheet(r.content, "Management View")
        self.assertIn("Overview", wb.sheetnames)
        header = cells[0]
        self.assertIn("Final Verdict", header)
        by_name = {row[header.index("Company Name")]: row for row in cells[1:] if row[0] is not None}
        self.assertEqual(len(by_name), 8)
        self.assertEqual(by_name["Company 4"][header.index("Final Verdict")], "general tech")
        self.assertEqual(by_name["Company 4"][header.index("Reviewer Note")], "Checked")
        self.assertEqual(by_name["Company 2"][header.index("Final Verdict")], "deep tech")

    def test_export_partial_run(self):
        # Results for rows 1 and 3 only: in the workbook they are positions 0 and 1.
        client, run_id = self._sleeping_run_with_results(5, [1, 3])
        r = self._decide(run_id, 3, "change", note="Checked", client=client)
        self.assertEqual(r.status_code, 200, r.text)
        r = client.post(f"/api/runs/{run_id}/stop")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["status"], "stopped")
        self.assertEqual(self._get(run_id, client)["run"]["status"], "stopped")

        r = client.get(f"/api/runs/{run_id}/export.xlsx")
        self.assertEqual(r.status_code, 200, r.text)
        wb, cells = _sheet(r.content, "Management View")
        self.assertNotIn("Overview", wb.sheetnames)
        header = cells[0]
        rows = [row for row in cells[1:] if row[0] is not None]
        names = [row[header.index("Company Name")] for row in rows]
        self.assertEqual(sorted(names), ["Company 1", "Company 3"])
        by_name = dict(zip(names, rows))
        self.assertEqual(by_name["Company 3"][header.index("Final Verdict")], "deep tech")
        self.assertEqual(by_name["Company 3"][header.index("Reviewer Note")], "Checked")
        self.assertEqual(by_name["Company 1"][header.index("Final Verdict")], "general tech")
        self.assertIn(by_name["Company 1"][header.index("Reviewer Note")], (None, ""))

    def test_export_before_any_result_is_409(self):
        client = self._client(SLEEPER)
        run_id = self._start(3, client)["id"]
        r = client.get(f"/api/runs/{run_id}/export.xlsx")
        self.assertEqual(r.status_code, 409)
        self.assertTrue(r.json()["detail"])

    def test_changes_after_a_cursor_returns_only_new_rows(self):
        client, run_id = self._sleeping_run_with_results(5, [0, 2])
        data = client.get(f"/api/runs/{run_id}/changes", params={"cursor": 1}).json()
        self.assertEqual([row["index"] for row in data["rows"]], [2])
        self.assertEqual(data["cursor"], 2)
        self.assertEqual(data["run"]["counts"]["done"], 2)
        self.assertEqual(client.get(f"/api/runs/{run_id}/changes", params={"cursor": "x"}).status_code, 422)

    # --- errors and static files ---

    def test_unknown_run_is_404(self):
        for run_id in ("run_19990101_000000", "nope", "run_x"):
            with self.subTest(run_id=run_id):
                base = f"/api/runs/{run_id}"
                self.assertEqual(self.client.get(base).status_code, 404)
                self.assertEqual(self.client.get(f"{base}/changes", params={"cursor": 0}).status_code, 404)
                self.assertEqual(self.client.post(f"{base}/stop").status_code, 404)
                self.assertEqual(self.client.post(f"{base}/resume").status_code, 404)
                self.assertEqual(self._decide(run_id, 0, "confirm").status_code, 404)
                self.assertEqual(self.client.post(f"{base}/rows/0/restore").status_code, 404)
                self.assertEqual(self.client.post(f"{base}/rows/0/undo").status_code, 404)
                self.assertEqual(self.client.get(f"{base}/export.xlsx").status_code, 404)

    def test_index_page_served(self):
        r = self.client.get("/")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.headers["content-type"].startswith("text/html"))


if __name__ == "__main__":
    unittest.main()
