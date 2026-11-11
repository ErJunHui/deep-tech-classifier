"""Lenient parsing of JSON objects out of LLM responses (shared by all agents)."""

import json
import re
from typing import Any, Dict

_OBJECT_PATTERN = re.compile(r"\{.*\}", re.DOTALL)


def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:]).strip()
    return text


def parse_json(raw_text: str) -> Dict[str, Any]:
    """
    Parse a JSON object from model output.

    Tolerates markdown fences, text around the object, and minor syntax damage
    (via json_repair). Raises json.JSONDecodeError if no object can be recovered.
    """
    text = _strip_fences(raw_text or "")
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    match = _OBJECT_PATTERN.search(text)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

    if "{" in text:
        try:
            from json_repair import repair_json
            repaired = repair_json(text, return_objects=True)
            if isinstance(repaired, dict) and repaired:
                return repaired
        except Exception:
            pass

    raise json.JSONDecodeError("No JSON object found in model output", text, 0)


def extract_json(text: str) -> str:
    """Return the JSON object found in `text` as a string, or '' if there is none."""
    try:
        return json.dumps(parse_json(text))
    except json.JSONDecodeError:
        return ""
