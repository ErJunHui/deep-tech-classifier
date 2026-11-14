"""
The web app's HTTP API, and the frontend in web/ as static files.

The routes translate between HTTP and the webapp modules; the rules live in
those modules. Every /api/runs handler first lets the runner record runs whose
process has ended. Handlers are sync, so FastAPI runs them in a thread pool;
the store, runner and decisions modules lock what they share.
"""

from __future__ import annotations

import json
import os
import tempfile
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile

from data.writer import write_incremental, write_results
from webapp import decisions, files, rows as row_view, settings_map
from webapp.decisions import DecisionError
from webapp.estimate import EstimateError, estimate_request
from webapp.files import UploadError
from webapp.run_store import RunStore, _read_json
from webapp.runner import Runner, RunnerError

XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
# Room for the multipart boundaries and part headers around the file itself.
_MULTIPART_OVERHEAD = 64 * 1024


def _attachment(filename: str) -> str:
    """A Content-Disposition value; RFC 5987 encoding when the name is not plain ASCII."""
    quoted = quote(filename)
    if quoted != filename:
        return f"attachment; filename*=utf-8''{quoted}"
    return f'attachment; filename="{filename}"'


def _bad_request(message: str) -> HTTPException:
    return HTTPException(status_code=400, detail=message)


def create_app(project_root: Path, data_root: Path, runner_command: Optional[List[str]] = None) -> FastAPI:
    """
    The app for one project.

    Args:
        project_root: Holds classify.py, config.json (or config.template.json),
            .env and web/.
        data_root: Holds runs/ and uploads/.
        runner_command: The pipeline command; classify.py when None.
    """
    project_root = Path(project_root)
    data_root = Path(data_root)
    uploads_dir = data_root / "uploads"
    store = RunStore(data_root / "runs", project_root)
    runner = Runner(store, project_root, command=runner_command)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        runner.reconcile()
        try:
            yield
        finally:
            runner.shutdown()

    app = FastAPI(lifespan=lifespan)
    app.state.store = store
    app.state.runner = runner

    def _detail(status: int, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=status, content={"detail": str(exc)})

    @app.exception_handler(UploadError)
    async def _upload_error(request: Request, exc: UploadError) -> JSONResponse:
        return _detail(400, exc)

    @app.exception_handler(EstimateError)
    async def _estimate_error(request: Request, exc: EstimateError) -> JSONResponse:
        return _detail(400, exc)

    @app.exception_handler(DecisionError)
    async def _decision_error(request: Request, exc: DecisionError) -> JSONResponse:
        return _detail(exc.status, exc)

    @app.exception_handler(RunnerError)
    async def _runner_error(request: Request, exc: RunnerError) -> JSONResponse:
        return _detail(exc.status, exc)

    # --- helpers ---

    def _base_config() -> Dict[str, Any]:
        """config.json as the CLI reads it, or the template when there is none."""
        path = project_root / "config.json"
        if not path.exists():
            path = project_root / "config.template.json"
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError) as exc:
            raise HTTPException(status_code=500, detail=f"{path.name} could not be read: {exc}") from None

    def _meta(run_id: str) -> Dict[str, Any]:
        try:
            return store.get_meta(run_id)
        except KeyError:
            raise HTTPException(status_code=404, detail="No such run.") from None

    def _config(run_id: str) -> Dict[str, Any]:
        config = _read_json(store.run_dir(run_id) / "config.json")
        return config if isinstance(config, dict) else {}

    def _snapshot(run_id: str, cursor: int = 0) -> Tuple[Dict[str, Any], List[Dict[str, Any]], int, set]:
        """(RunSummary, every Row, checkpoint lines read, indexes whose result landed after cursor)."""
        meta = _meta(run_id)
        companies = store.companies(run_id)
        results, consumed, changed = store.read_results_since(run_id, cursor)
        steps, phase = store.read_progress(run_id)
        history = decisions.load(store.run_dir(run_id))
        config = _config(run_id)
        rows = [row_view.to_row(i, company, results.get(i), steps.get(i), history.get(i, []), config)
                for i, company in enumerate(companies)]
        settings = meta.get("settings") or {}
        summary = {
            "id": meta["id"],
            "file": meta["file"],
            "total": meta["rows"],
            "createdAt": meta["createdAt"],
            "status": meta["status"],
            "error": meta.get("error", ""),
            "model": meta.get("model", ""),
            "batch": bool(settings.get("batch")) and settings.get("provider") in settings_map.BATCH_PROVIDERS,
            "phase": phase,
            "settings": settings,
            "counts": row_view.counts(rows),
        }
        return summary, rows, consumed, changed

    def _row(run_id: str, index: int) -> Optional[Dict[str, Any]]:
        """The Row at index, or None when the run has no such row."""
        companies = store.companies(run_id)
        if not 0 <= index < len(companies):
            return None
        results, _ = store.read_results(run_id)
        steps, _ = store.read_progress(run_id)
        history = decisions.load(store.run_dir(run_id)).get(index, [])
        return row_view.to_row(index, companies[index], results.get(index), steps.get(index), history,
                               _config(run_id))

    def _existing_row(run_id: str, index: int) -> Dict[str, Any]:
        row = _row(run_id, index)
        if row is None:
            raise HTTPException(status_code=404, detail="No such row.")
        return row

    # --- setup, files, estimate ---

    @app.get("/api/setup")
    def get_setup() -> Dict[str, Any]:
        return settings_map.setup_info(os.environ)

    @app.post("/api/files")
    async def post_file(request: Request) -> Dict[str, Any]:
        limit = files.MAX_UPLOAD_BYTES
        length = request.headers.get("content-length", "")
        if length.isdigit() and int(length) > limit + _MULTIPART_OVERHEAD:
            raise UploadError(f"The file is larger than {limit // (1024 * 1024)} MB. "
                              "Please upload a smaller spreadsheet.")
        form = await request.form(max_files=1, max_fields=10)
        try:
            upload = form.get("file")
            if not isinstance(upload, UploadFile):
                raise UploadError("Choose a spreadsheet to upload.")
            # One byte over the limit is enough for save_upload to reject it.
            data = await upload.read(limit + 1)
            return await run_in_threadpool(files.save_upload, uploads_dir, upload.filename or "", data)
        finally:
            await form.close()

    @app.post("/api/estimate")
    def post_estimate(body: Any = Body(None)) -> Dict[str, Any]:
        return estimate_request(body)

    # --- runs ---

    @app.get("/api/runs")
    def list_runs() -> List[Dict[str, Any]]:
        runner.poll()
        summaries = []
        for meta in store.list_runs():
            try:
                summaries.append(_snapshot(meta["id"])[0])
            except HTTPException:  # removed since it was listed
                continue
        return summaries

    @app.post("/api/runs", status_code=201)
    def post_run(body: Any = Body(None)) -> Dict[str, Any]:
        runner.poll()
        if not isinstance(body, dict):
            raise _bad_request("The request body must be a JSON object with fileId and settings.")
        try:
            settings = settings_map.clean_settings(body.get("settings"))
        except ValueError as exc:
            raise _bad_request(str(exc)) from None
        if not settings["mapping"].get("company_name"):
            raise _bad_request("Choose the column that holds the company name.")
        provider = next(p for p in settings_map.setup_info(os.environ)["providers"]
                        if p["id"] == settings["provider"])
        if not provider["keySet"]:
            raise _bad_request(f"{provider['keyVar']} is not set in .env")
        try:
            source = files.resolve(uploads_dir, body.get("fileId"))
        except FileNotFoundError:
            raise _bad_request("This file is no longer available. Please upload it again.") from None
        try:
            meta = store.create(source, settings, _base_config(), exclude=body.get("exclude"))
        except ValueError as exc:
            raise _bad_request(str(exc)) from None
        runner.start(meta["id"])
        return _snapshot(meta["id"])[0]

    @app.get("/api/runs/{run_id}")
    def get_run(run_id: str) -> Dict[str, Any]:
        runner.poll()
        summary, rows, consumed, _ = _snapshot(run_id)
        return {"run": summary, "rows": rows, "cursor": consumed}

    @app.get("/api/runs/{run_id}/changes")
    def get_changes(run_id: str, cursor: int = 0) -> Dict[str, Any]:
        runner.poll()
        summary, rows, consumed, changed = _snapshot(run_id, cursor)
        return {
            "run": summary,
            "steps": {str(row["index"]): row["step"] for row in rows if row["step"] is not None},
            "rows": [rows[i] for i in sorted(changed) if 0 <= i < len(rows)],
            "cursor": consumed,
        }

    @app.post("/api/runs/{run_id}/stop")
    def stop_run(run_id: str) -> Dict[str, Any]:
        runner.poll()
        _meta(run_id)
        runner.stop(run_id)
        return _snapshot(run_id)[0]

    @app.post("/api/runs/{run_id}/resume")
    def resume_run(run_id: str) -> Dict[str, Any]:
        runner.poll()
        _meta(run_id)
        runner.resume(run_id)
        return _snapshot(run_id)[0]

    # --- decisions ---

    @app.put("/api/runs/{run_id}/rows/{index}/decision")
    def put_decision(run_id: str, index: int, body: Any = Body(None)) -> Dict[str, Any]:
        runner.poll()
        _meta(run_id)
        if not isinstance(body, dict):
            raise _bad_request("The request body must be a JSON object with choice and note.")
        decisions.record(store.run_dir(run_id), index, body.get("choice"), body.get("note"),
                         _row(run_id, index), datetime.now())
        return _existing_row(run_id, index)

    @app.post("/api/runs/{run_id}/rows/{index}/restore")
    def post_restore(run_id: str, index: int) -> Dict[str, Any]:
        runner.poll()
        _meta(run_id)
        decisions.restore(store.run_dir(run_id), index, _row(run_id, index), datetime.now())
        return _existing_row(run_id, index)

    @app.post("/api/runs/{run_id}/rows/{index}/undo")
    def post_undo(run_id: str, index: int) -> Dict[str, Any]:
        runner.poll()
        _meta(run_id)
        _existing_row(run_id, index)
        decisions.undo(store.run_dir(run_id), index)
        return _existing_row(run_id, index)

    # --- export ---

    @app.get("/api/runs/{run_id}/export.xlsx")
    def get_export(run_id: str) -> Response:
        runner.poll()
        meta = _meta(run_id)
        companies = store.companies(run_id)
        results, _ = store.read_results(run_id)
        history = decisions.load(store.run_dir(run_id))
        done = [i for i in range(len(companies)) if i in results]
        if not done:
            raise HTTPException(status_code=409, detail="No company has a result yet, so there is nothing to export.")

        # The writer keys decisions by position in the companies it is given.
        review: Dict[int, Dict[str, Any]] = {}
        for position, index in enumerate(done):
            decision = decisions.current(history.get(index, []))
            if decision is not None:
                review[position] = {
                    "verdict": decision["verdict"],
                    "note": decision.get("note", ""),
                    "at": decision.get("at", ""),
                    "reclassified": decision.get("type") == "change",
                }
        done_companies = [companies[i] for i in done]
        done_results = [results[i] for i in done]

        with tempfile.TemporaryDirectory() as tmp:
            path = str(Path(tmp) / "export.xlsx")
            if meta["status"] == "complete":
                run_stats = {
                    "run_id": run_id,
                    "model": store.model_info(run_id),
                    "start_time": meta.get("createdAt") or "N/A",
                    "end_time": meta.get("endedAt") or "N/A",
                }
                write_results(path, done_companies, done_results, run_stats, review)
            else:
                write_incremental(path, done_companies, done_results, review)
            content = Path(path).read_bytes()

        filename = f"{Path(meta['file']).stem}_classified_{run_id[len('run_'):]}.xlsx"
        return Response(content, media_type=XLSX_TYPE, headers={"Content-Disposition": _attachment(filename)})

    # --- frontend ---

    app.mount("/", StaticFiles(directory=project_root / "web", html=True), name="web")
    return app
