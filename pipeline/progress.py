"""
Per-company progress events for an outside watcher (the local web app).

Off unless the environment variable DTC_PROGRESS_FILE is set; then each call
appends one JSON line to that file. Never raises: progress reporting must not
be able to break a run.
"""

import json
import logging
import os
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

ENV_VAR = "DTC_PROGRESS_FILE"


def emit(
    kind: str,
    index: Optional[int] = None,
    step: Optional[str] = None,
    phase: Optional[str] = None,
) -> None:
    """Append {"kind", "index", "step", "phase", "at"} to $DTC_PROGRESS_FILE, if set."""
    try:
        path = os.environ.get(ENV_VAR)
        if not path:
            return
        line = json.dumps({
            "kind": kind,
            "index": index,
            "step": step,
            "phase": phase,
            "at": datetime.now().isoformat(),
        }, ensure_ascii=False)
        with open(path, "a", encoding="utf-8") as f:
            f.write(line + "\n")
            f.flush()
    except Exception as exc:
        try:
            logger.debug(f"Progress event not written: {exc}")
        except Exception:
            pass
