"""
Which model last passed the reference check (tests/reference/check.py).

The record is one entry per provider in tests/reference/last_validated.json.
At startup the pipeline compares the run's model with it and warns when they
differ, so a new model is not used unnoticed.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any, Dict, Optional

RECORD_FILE = Path(__file__).parent.parent / "tests" / "reference" / "last_validated.json"
CHECK_COMMAND = "python -m tests.reference.check"


def load(path: Path = RECORD_FILE) -> Dict[str, Dict[str, Any]]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def record(
    provider: str,
    model: str,
    requested: Optional[str],
    summary: str,
    path: Path = RECORD_FILE,
) -> None:
    """Store `model` as the one that last passed the check for `provider`."""
    data = load(path)
    data[provider] = {
        "model": model,
        "requested": requested,
        "validated_on": date.today().isoformat(),
        "result": summary,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def warning_for(provider: str, model: Optional[str], path: Path = RECORD_FILE) -> Optional[str]:
    """A warning when `model` is not the one last validated for `provider`; else None."""
    if not model:
        return None
    entry = load(path).get(provider)
    if not entry:
        return (
            f"No {provider} model has passed the reference check yet. "
            f"Run `{CHECK_COMMAND}` to confirm '{model}' classifies as expected."
        )
    if entry.get("model") != model:
        return (
            f"Model '{model}' differs from the last one that passed the reference check "
            f"('{entry.get('model')}', {entry.get('validated_on')}). "
            f"Run `{CHECK_COMMAND}` before relying on its verdicts."
        )
    return None
