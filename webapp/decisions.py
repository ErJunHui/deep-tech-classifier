"""
A reviewer's decisions on a run's rows: runs/<run_id>/decisions.json holds
{"<row index>": [history entries]}, each entry
{"type": "confirm|change|restore", "verdict": ..., "note": ..., "at": ...}.

A row's current decision is its last entry, unless that is a restore. The
rules match the frontend's formProblem (workbench.js).
"""

from __future__ import annotations

import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from webapp.run_store import _read_json, _write_json_atomic

_FILE = "decisions.json"
_MAX_NOTE = 2000
_OTHER_VERDICT = {"deep tech": "general tech", "general tech": "deep tech"}
CLEAR_NOTE_REQUIRED = "A note is required to overturn a Clear verdict. It is written to the workbook."

# The API calls in from a thread pool; every read-modify-write holds this.
_lock = threading.Lock()


class DecisionError(ValueError):
    """A decision that cannot be made; status is 404 (no such row) or 409."""

    def __init__(self, message: str, status: int = 409):
        super().__init__(message)
        self.status = status


def current(history: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """The last history entry, unless it is a restore (then there is none)."""
    if not history or history[-1].get("type") == "restore":
        return None
    return history[-1]


def _load(run_dir: Path) -> Dict[int, List[Dict[str, Any]]]:
    """
    The file's histories by int index; {} when there is no file. A file that
    exists but cannot be read is a 409, never treated as empty, so it is not
    overwritten and the reviewer's work is kept.
    """
    path = Path(run_dir) / _FILE
    if not path.exists():
        return {}
    data = _read_json(path)
    try:
        if not isinstance(data, dict):
            raise ValueError
        out = {}
        for key, history in data.items():
            if not isinstance(history, list) or not all(isinstance(e, dict) for e in history):
                raise ValueError
            # Only canonical keys ("0", "12"): "01" or "1_0" would land on
            # the same index as another key and one history would be lost.
            index = int(key)
            if index < 0 or str(index) != key:
                raise ValueError
            out[index] = history
        return out
    except ValueError:
        raise DecisionError(f"{_FILE} in this run cannot be read; fix or remove it before deciding rows.") from None


def _save(run_dir: Path, all_history: Dict[int, List[Dict[str, Any]]]) -> None:
    data = {str(i): h for i, h in sorted(all_history.items()) if h}
    _write_json_atomic(Path(run_dir) / _FILE, data)


def _append(run_dir: Path, index: int, entry: Dict[str, Any], must_have_decision: bool = False) -> List[Dict[str, Any]]:
    with _lock:
        all_history = _load(run_dir)
        history = all_history.get(index, [])
        if must_have_decision and current(history) is None:
            raise DecisionError("This row has no decision to restore.")
        history = history + [entry]
        all_history[index] = history
        _save(run_dir, all_history)
        return history


def _decidable_result(row: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """The row's result, or a DecisionError: 404 for no row, 409 for no or an error result."""
    if row is None:
        raise DecisionError("No such row.", status=404)
    result = row.get("result")
    if result is None:
        raise DecisionError("This row has no result yet.")
    if result.get("error"):
        raise DecisionError("This row ended in an error and cannot be decided.")
    return result


def _entry(kind: str, verdict: str, note: str, now: datetime) -> Dict[str, Any]:
    return {"type": kind, "verdict": verdict, "note": note, "at": now.isoformat(timespec="seconds")}


def load(run_dir: Path) -> Dict[int, List[Dict[str, Any]]]:
    """Every row's decision history by row index; {} when there are none."""
    with _lock:
        return _load(run_dir)


def record(run_dir: Path, index: int, choice: str, note: str, row: Optional[Dict[str, Any]],
           now: datetime) -> List[Dict[str, Any]]:
    """
    Confirm the pipeline's verdict or change it to the other one; returns the
    row's new history. A change on a Clear row needs a non-blank note.
    """
    result = _decidable_result(row)
    if choice not in ("confirm", "change"):
        raise DecisionError(f"Unknown choice: {choice!r}.")
    if note is None:
        note = ""
    if not isinstance(note, str):
        raise DecisionError("The note must be text.")
    note = note.strip()[:_MAX_NOTE]
    verdict = result.get("verdict")
    if choice == "change":
        if verdict not in _OTHER_VERDICT:
            raise DecisionError(f"The verdict {verdict!r} cannot be changed.")
        if result.get("risk") == "Clear" and not note:
            raise DecisionError(CLEAR_NOTE_REQUIRED)
        verdict = _OTHER_VERDICT[verdict]
    return _append(run_dir, index, _entry(choice, verdict, note, now))


def restore(run_dir: Path, index: int, row: Optional[Dict[str, Any]], now: datetime) -> List[Dict[str, Any]]:
    """Go back to the pipeline's verdict; only valid when the row has a current decision."""
    result = _decidable_result(row)
    return _append(run_dir, index, _entry("restore", result.get("verdict"), "", now), must_have_decision=True)


def undo(run_dir: Path, index: int) -> List[Dict[str, Any]]:
    """Remove the row's last history entry and return what is left."""
    with _lock:
        all_history = _load(run_dir)
        history = all_history.get(index, [])
        if not history:
            raise DecisionError("This row has nothing to undo.")
        history = history[:-1]
        all_history[index] = history
        _save(run_dir, all_history)
        return history
