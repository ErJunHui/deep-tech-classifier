"""
The web app's run folders: runs/<run_id>/ with meta.json, config.json and a
copy of the input, plus read-only readers for what the pipeline writes there.

The pipeline may be appending to its checkpoint and progress files while they
are read here, so the readers open them read-only, skip a torn last line and
never write. A missing or half-written file reads as empty.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Set, Tuple

import pandas as pd
from openpyxl import Workbook

from data.reader import read_companies
from webapp.settings_map import to_pipeline_config

_RUN_ID = re.compile(r"run_[0-9_]+")
# The pipeline's own run id becomes part of a file name; accept only plain ids.
_PIPELINE_RUN_ID = re.compile(r"[A-Za-z0-9_-]+")

_SUBFOLDERS = ("input", "checkpoints", "logs", "output")

# On Windows os.replace fails while the target is open for reading. Readers of
# meta.json in this process take RunStore's lock; this retry is for anything
# else holding a file briefly (another process, a virus scanner).
_REPLACE_ATTEMPTS = 50
_REPLACE_WAIT_S = 0.02


def _now() -> datetime:
    return datetime.now()


def _iter_complete_lines(path: Path) -> Iterator[Optional[Any]]:
    """
    Each newline-terminated line of a JSONL file, parsed; None for one that is
    not valid JSON. A final line without a newline is still being written and
    is not yielded. A missing file yields nothing.
    """
    try:
        with open(path, "rb") as f:
            data = f.read()
    except OSError:
        return
    lines = data.split(b"\n")
    for raw in lines[:-1]:  # the last piece is "" or a torn line
        try:
            yield json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            yield None


def _read_json(path: Path) -> Optional[Any]:
    """The parsed file, or None if it is missing, unreadable or mid-write."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _write_json_atomic(path: Path, value: Any) -> None:
    """Write to a temp file beside path, then os.replace it into place."""
    fd, tmp_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(value, f, indent=2, ensure_ascii=False)
        for attempt in range(_REPLACE_ATTEMPTS):
            try:
                os.replace(tmp_name, path)
                break
            except PermissionError:
                if attempt == _REPLACE_ATTEMPTS - 1:
                    raise
                time.sleep(_REPLACE_WAIT_S)
    except BaseException:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def _check_exclude(exclude: Any) -> List[int]:
    """exclude as sorted distinct ints; ValueError when it is not a list of ints."""
    if exclude is None:
        return []
    if not isinstance(exclude, list):
        raise ValueError("exclude must be a list of row numbers.")
    for entry in exclude:
        if isinstance(entry, bool) or not isinstance(entry, int):
            raise ValueError(f"exclude must list row numbers, not {entry!r}.")
    return sorted(set(exclude))


def _copy_without(source: Path, dest: Path, exclude: List[int]) -> None:
    """
    Write source to dest without the data rows in exclude, in the same format
    and with the headers as pandas reads them (the names the mapping uses).
    """
    suffix = source.suffix.lower()
    if suffix == ".xls":
        raise ValueError(f"Rows cannot be left out of an .xls file. Save {source.name} as .xlsx "
                         "and upload it again, or tick every row.")
    # The same pandas calls as data/reader.py and webapp/files.py.
    df = pd.read_csv(source, dtype=str) if suffix == ".csv" else pd.read_excel(source, dtype=str)
    for index in exclude:
        if not 0 <= index < len(df):
            raise ValueError(f"Row {index} is not in {source.name}, which has {len(df)} rows (0 to {len(df) - 1}).")
    if len(exclude) >= len(df):
        raise ValueError("Tick at least one company to start")
    kept = df.drop(index=df.index[exclude])
    if suffix == ".csv":
        kept.to_csv(dest, index=False)
        return
    wb = Workbook()
    ws = wb.active
    ws.append(list(kept.columns))
    for row in kept.itertuples(index=False, name=None):
        ws.append([None if pd.isna(value) else value for value in row])
    # openpyxl takes a string starting with "=" for a formula; keep it text.
    for row in ws.iter_rows():
        for cell in row:
            if cell.data_type == "f":
                cell.data_type = "s"
    wb.save(dest)


def _sort_key(run_id: str) -> Tuple[int, ...]:
    """run_20261113_142233_2 -> (20261113, 142233, 2); no suffix counts as 1."""
    parts = [int(p) for p in run_id[len("run_"):].split("_") if p]
    if len(parts) == 2:
        parts.append(1)
    return tuple(parts)


class RunStore:
    """Creates and reads run folders under root."""

    def __init__(self, root: Path, project_root: Path):
        self.root = Path(root)
        self.project_root = Path(project_root)
        # Held by meta writers and readers: on Windows a reader with meta.json
        # open makes the writer's os.replace fail, and a read during the
        # replace fails too. Re-entrant because update_meta reads the meta.
        self._lock = threading.RLock()
        self._companies: Dict[str, List[Dict[str, Any]]] = {}
        # Last pipeline run id read from each run's run_state.json, for when
        # the pipeline is rewriting that file in place and it reads as empty.
        self._pipeline_run_ids: Dict[str, str] = {}

    # --- folders and meta ---

    def create(self, source_file: Path, settings: Dict[str, Any], base_config: Dict[str, Any],
               exclude: Optional[List[int]] = None) -> Dict[str, Any]:
        """
        Lay out a new run folder for source_file and return its meta.

        Copies the input, writes config.json (the pipeline config for these
        settings) and meta.json with status "running". If the input cannot be
        read with that config, the folder is removed and the error re-raised.

        exclude lists 0-based data rows of source_file to leave out of the
        run's copy (same format and headers). ValueError, with a message fit
        to show the user, when it is not a list of row numbers in range, it
        leaves no row, or the file is .xls (which cannot be written).
        """
        source_file = Path(source_file)
        exclude = _check_exclude(exclude)
        config = to_pipeline_config(settings, base_config, self.project_root)
        self.root.mkdir(parents=True, exist_ok=True)
        run_id, folder = self._new_folder()
        try:
            for sub in _SUBFOLDERS:
                (folder / sub).mkdir()
            input_path = folder / "input" / source_file.name
            if exclude:
                _copy_without(source_file, input_path, exclude)
            else:
                shutil.copyfile(source_file, input_path)
            _write_json_atomic(folder / "config.json", config)
            companies = read_companies(str(input_path), config)
            meta = {
                "id": run_id,
                "file": source_file.name,
                "rows": len(companies),
                "createdAt": _now().isoformat(timespec="seconds"),
                "endedAt": None,
                "status": "running",
                "error": "",
                "settings": settings,
                "model": "",
                "pid": None,
            }
            _write_json_atomic(folder / "meta.json", meta)
        except BaseException:
            shutil.rmtree(folder, ignore_errors=True)
            raise
        self._companies[run_id] = companies
        return meta

    def _new_folder(self) -> Tuple[str, Path]:
        """Make an empty folder named run_%Y%m%d_%H%M%S, suffixed _2, _3... on collision."""
        base = _now().strftime("run_%Y%m%d_%H%M%S")
        n = 1
        while True:
            run_id = base if n == 1 else f"{base}_{n}"
            folder = self.root / run_id
            try:
                folder.mkdir()
                return run_id, folder.resolve()
            except FileExistsError:
                n += 1

    def run_dir(self, run_id: str) -> Path:
        """
        The folder of an existing run.

        Raises:
            KeyError: run_id is not of the form run_<digits and underscores>,
                or there is no such run.
        """
        if not isinstance(run_id, str) or not _RUN_ID.fullmatch(run_id):
            raise KeyError(run_id)
        folder = (self.root / run_id).resolve()
        if folder.parent != self.root.resolve() or not folder.is_dir():
            raise KeyError(run_id)
        return folder

    def get_meta(self, run_id: str) -> Dict[str, Any]:
        """The run's meta.json. Raises KeyError for an unknown or unreadable run."""
        with self._lock:
            meta = _read_json(self.run_dir(run_id) / "meta.json")
        if not isinstance(meta, dict):
            raise KeyError(run_id)
        return meta

    def update_meta(self, run_id: str, **fields: Any) -> Dict[str, Any]:
        """Merge fields into meta.json and return the new meta; the file is replaced atomically."""
        with self._lock:
            meta = self.get_meta(run_id)
            meta.update(fields)
            _write_json_atomic(self.run_dir(run_id) / "meta.json", meta)
            return meta

    def list_runs(self) -> List[Dict[str, Any]]:
        """The meta of every readable run, newest first."""
        if not self.root.is_dir():
            return []
        metas = []
        for entry in self.root.iterdir():
            try:
                metas.append(self.get_meta(entry.name))
            except KeyError:
                continue
        metas.sort(key=lambda m: _sort_key(m["id"]) if _RUN_ID.fullmatch(str(m.get("id", ""))) else (),
                   reverse=True)
        return metas

    # --- input ---

    def companies(self, run_id: str) -> List[Dict[str, Any]]:
        """The run's input rows as data.reader reads them with the run's config; cached."""
        if run_id not in self._companies:
            folder = self.run_dir(run_id)
            meta = self.get_meta(run_id)
            config = _read_json(folder / "config.json") or {}
            self._companies[run_id] = read_companies(str(folder / "input" / meta["file"]), config)
        return self._companies[run_id]

    # --- what the pipeline writes (read-only) ---

    def _run_state(self, run_id: str) -> Dict[str, Any]:
        state = _read_json(self.run_dir(run_id) / "checkpoints" / "run_state.json")
        return state if isinstance(state, dict) else {}

    def read_results(self, run_id: str) -> Tuple[Dict[int, Dict[str, Any]], int]:
        """
        ({row index: pipeline result}, lines consumed) from the pipeline's LLM checkpoint.

        Last write wins and rows that ended in an error are kept. Lines that do
        not parse are skipped but counted; a torn last line is neither. While
        run_state.json is unreadable (the pipeline rewrites it in place), the
        pipeline run id last read for this run is used.
        """
        results, consumed, _ = self.read_results_since(run_id, 0)
        return results, consumed

    def read_results_since(self, run_id: str, cursor: int) -> Tuple[Dict[int, Dict[str, Any]], int, Set[int]]:
        """
        read_results plus the row indexes written on lines from cursor on (a
        cursor is a line count read_results returned). A cursor past the end
        means the checkpoint was replaced, and every row counts as written.
        """
        pipeline_run_id = self._run_state(run_id).get("run_id")
        if isinstance(pipeline_run_id, str) and _PIPELINE_RUN_ID.fullmatch(pipeline_run_id):
            self._pipeline_run_ids[run_id] = pipeline_run_id
        else:
            pipeline_run_id = self._pipeline_run_ids.get(run_id)
            if pipeline_run_id is None:
                return {}, 0, set()
        path = self.run_dir(run_id) / "checkpoints" / "llm" / f"llm_progress_{pipeline_run_id}.jsonl"
        results: Dict[int, Dict[str, Any]] = {}
        changed: Set[int] = set()
        consumed = 0
        for entry in _iter_complete_lines(path):
            consumed += 1
            if not isinstance(entry, dict):
                continue
            index, result = entry.get("index"), entry.get("result")
            if isinstance(index, int) and not isinstance(index, bool) and isinstance(result, dict):
                results[index] = result
                if consumed > cursor:
                    changed.add(index)
        if cursor > consumed:
            changed = set(results)
        return results, consumed, changed

    def read_progress(self, run_id: str) -> Tuple[Dict[int, str], str]:
        """({row index: latest step}, latest phase text) from progress.jsonl."""
        steps: Dict[int, str] = {}
        phase = ""
        for event in _iter_complete_lines(self.run_dir(run_id) / "progress.jsonl"):
            if not isinstance(event, dict):
                continue
            index, step = event.get("index"), event.get("step")
            if isinstance(index, int) and not isinstance(index, bool) and isinstance(step, str):
                steps[index] = step
            if isinstance(event.get("phase"), str):
                phase = event["phase"]
        return steps, phase

    def model_info(self, run_id: str) -> Dict[str, Any]:
        """The model object the pipeline recorded in run_state.json, or {}."""
        model = self._run_state(run_id).get("model")
        return model if isinstance(model, dict) else {}
