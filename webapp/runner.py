"""
Run the pipeline for a web run: classify.py as a subprocess whose working
directory is the run folder, so its cwd-relative checkpoints/ and logs/ stay
inside that run. Stop kills the process; every finished company is already
checkpointed, and resume continues with --resume.

The HTTP layer calls poll() at the top of every request, from a thread pool,
and start/stop/resume from other requests, so every method is safe to call
concurrently: one lock guards the tracked processes and the meta updates made
for them. stop() releases it while it waits for the process to die.
"""

from __future__ import annotations

import os
import subprocess
import sys
import threading
from datetime import datetime
from pathlib import Path
from typing import IO, Dict, List, Optional

from webapp.run_store import RunStore

_FATAL = "[FATAL]"
_STOP_WAIT_S = 10
_LOG_TAIL_BYTES = 64 * 1024
_RESUMABLE = ("stopped", "interrupted", "failed")


class RunnerError(Exception):
    """A start, stop or resume that the run's state does not allow; status is 409."""

    def __init__(self, message: str, status: int = 409):
        super().__init__(message)
        self.status = status


class _Tracked:
    """A launched pipeline process and what the runner remembers about it."""

    def __init__(self, popen: subprocess.Popen, log: IO[bytes], log_start: int):
        self.popen = popen
        self.log = log
        self.log_start = log_start  # where this attempt's output begins in process.log
        self.stopping = False       # stop() killed it: the exit code cannot tell us
        self.model_known = False


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _failure_message(log_path: Path, start: int, code: int) -> str:
    """
    From this attempt's part of process.log: the text after the last [FATAL]
    marker, else the last non-empty line, else a message naming the exit code.
    Only the tail of the file is read.
    """
    lines: List[str] = []
    try:
        with open(log_path, "rb") as f:
            size = f.seek(0, os.SEEK_END)
            begin = max(start, size - _LOG_TAIL_BYTES)
            f.seek(begin)
            text = f.read().decode("utf-8", errors="replace")
        lines = text.splitlines()
        if begin > start and lines:
            lines = lines[1:]  # probably cut mid-line
    except OSError:
        pass
    for line in reversed(lines):
        if _FATAL in line:
            message = line.split(_FATAL, 1)[1].strip()
            if message:
                return message
    for line in reversed(lines):
        if line.strip():
            return line.strip()
    return f"The pipeline exited with code {code}."


class Runner:
    """Starts, stops and resumes each run's pipeline process and keeps meta.json in step."""

    def __init__(self, store: RunStore, project_root: Path, command: Optional[List[str]] = None):
        self.store = store
        self.project_root = Path(project_root)
        self.command = list(command) if command else [sys.executable, str(self.project_root / "classify.py")]
        self._lock = threading.Lock()
        self._procs: Dict[str, _Tracked] = {}

    # --- launching ---

    def start(self, run_id: str) -> None:
        """Launch the pipeline for a run. Raises RunnerError if it is already live."""
        with self._lock:
            self.store.run_dir(run_id)  # KeyError for an unknown run
            self._poll_locked()
            if run_id in self._procs:
                raise RunnerError("This run is already running.")
            self._launch(run_id, resume=False)

    def resume(self, run_id: str) -> None:
        """
        Relaunch with --resume: finished rows are kept, rows that ended in an
        error are redone. Allowed from stopped, interrupted and failed, and
        from complete when the run has error rows.
        """
        with self._lock:
            self.store.run_dir(run_id)
            self._poll_locked()
            if run_id in self._procs:
                raise RunnerError("This run is already running.")
            status = self.store.get_meta(run_id).get("status")
            if status == "complete":
                results, _ = self.store.read_results(run_id)
                if not any(r.get("classification") == "error" for r in results.values()):
                    raise RunnerError("This run is complete with no error rows; there is nothing to resume.")
            elif status not in _RESUMABLE:
                raise RunnerError(f"A {status} run cannot be resumed.")
            self._launch(run_id, resume=True)

    def _launch(self, run_id: str, resume: bool) -> None:
        """Start the process and mark the run running. Caller holds the lock."""
        folder = self.store.run_dir(run_id)
        meta = self.store.get_meta(run_id)
        args = self.command + [
            "--input", str(folder / "input" / meta["file"]),
            "--output", str(folder / "output"),
            "--config", str(folder / "config.json"),
            "--env", str(self.project_root / ".env"),
        ]
        if resume:
            args.append("--resume")
        env = dict(os.environ)
        env["DTC_PROGRESS_FILE"] = str(folder / "progress.jsonl")
        env["PYTHONIOENCODING"] = "utf-8"
        flags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0

        log = open(folder / "process.log", "ab")
        try:
            log_start = log.seek(0, os.SEEK_END)
            popen = subprocess.Popen(args, cwd=folder, env=env, stdin=subprocess.DEVNULL,
                                     stdout=log, stderr=subprocess.STDOUT, creationflags=flags)
        except OSError as exc:
            log.close()
            self.store.update_meta(run_id, status="failed", error=f"Could not start the pipeline: {exc}")
            return
        except BaseException:
            log.close()
            raise
        tracked = _Tracked(popen, log, log_start)
        self._procs[run_id] = tracked
        try:
            self.store.update_meta(run_id, status="running", error="", endedAt=None, pid=popen.pid)
        except BaseException:
            del self._procs[run_id]
            self._kill(tracked)
            log.close()
            raise

    # --- stopping ---

    def stop(self, run_id: str) -> None:
        """Kill the run's process, wait up to 10 s for it to exit and mark the run stopped."""
        with self._lock:
            self.store.run_dir(run_id)
            self._poll_locked()
            tracked = self._procs.get(run_id)
            if tracked is None:
                raise RunnerError("This run is not running.")
            tracked.stopping = True
            tracked.popen.terminate()

        # Not under the lock: other requests keep being served while it dies.
        # Whoever takes the lock next and sees it exited reaps it as stopped;
        # if that is a poll() in between, the run may even have been resumed,
        # so only the same tracked process is touched below.
        try:
            tracked.popen.wait(timeout=_STOP_WAIT_S)
        except subprocess.TimeoutExpired:
            tracked.popen.kill()

        with self._lock:
            if self._procs.get(run_id) is tracked:
                if tracked.popen.poll() is not None:
                    self._reap(run_id, tracked)
                else:  # still dying; poll() reaps it later as stopped
                    self.store.update_meta(run_id, status="stopped")

    # --- status ---

    def poll(self) -> None:
        """Update meta for every tracked process that has exited, and fill in the run's model."""
        with self._lock:
            self._poll_locked()

    def _poll_locked(self) -> None:
        for run_id, tracked in list(self._procs.items()):
            if tracked.popen.poll() is not None:
                self._reap(run_id, tracked)
            else:
                self._note_model(run_id, tracked)

    def _note_model(self, run_id: str, tracked: _Tracked) -> None:
        """Copy the model id the pipeline recorded into meta.model, once."""
        if tracked.model_known:
            return
        if self.store.get_meta(run_id).get("model"):
            tracked.model_known = True
            return
        info = self.store.model_info(run_id)
        name = info.get("reported") or info.get("requested")
        if isinstance(name, str) and name:
            self.store.update_meta(run_id, model=name)
            tracked.model_known = True

    def _reap(self, run_id: str, tracked: _Tracked, status: Optional[str] = None) -> None:
        """Forget an exited process, close its log and record how it ended. Caller holds the lock."""
        del self._procs[run_id]
        tracked.log.close()
        self._note_model(run_id, tracked)
        code = tracked.popen.returncode
        if status is not None:
            self.store.update_meta(run_id, status=status)
        elif code == 0:
            self.store.update_meta(run_id, status="complete", endedAt=_now())
        elif tracked.stopping:
            self.store.update_meta(run_id, status="stopped")
        else:
            message = _failure_message(self.store.run_dir(run_id) / "process.log", tracked.log_start, code)
            self.store.update_meta(run_id, status="failed", error=message)

    def reconcile(self) -> None:
        """At server start: a run whose meta says running but that has no process here was interrupted."""
        with self._lock:
            for meta in self.store.list_runs():
                if meta.get("status") == "running" and meta.get("id") not in self._procs:
                    self.store.update_meta(meta["id"], status="interrupted")

    def shutdown(self) -> None:
        """Kill every tracked process and mark its run interrupted (stopped, if a stop was under way)."""
        with self._lock:
            self._poll_locked()  # runs that already ended keep their real outcome
            for tracked in self._procs.values():  # every process dies even if a meta write fails below
                self._kill(tracked)
            for run_id, tracked in list(self._procs.items()):
                self._reap(run_id, tracked, status="stopped" if tracked.stopping else "interrupted")

    @staticmethod
    def _kill(tracked: _Tracked) -> None:
        """Terminate and wait for the process, so its files are released."""
        tracked.popen.terminate()
        try:
            tracked.popen.wait(timeout=_STOP_WAIT_S)
        except subprocess.TimeoutExpired:
            tracked.popen.kill()
            tracked.popen.wait()
