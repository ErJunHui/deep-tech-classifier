"""
Turn a pipeline result into the row JSON the frontend renders, and count rows.

Risk and confidence tier come from pipeline.review, so the web app and the
Excel output always agree.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

from pipeline import review

_CPC_DESCRIPTIONS = Path(__file__).resolve().parent.parent / "lib" / "epo_patent" / "config" / "cpc_descriptions.json"
_MAX_CPC = 12
# Default of confidence.low_evidence_cap in pipeline/confidence.py.
_DEFAULT_LOW_EVIDENCE_CAP = 60


@lru_cache(maxsize=1)
def _cpc_descriptions() -> Dict[str, str]:
    """CPC code -> description; {} when the file is missing or unreadable."""
    try:
        with open(_CPC_DESCRIPTIONS, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {k: v for k, v in data.items() if not k.startswith("_") and isinstance(v, str)}


def _cpc_desc(code: str) -> str:
    """Description of the exact code, else of the part before "/", else ""."""
    descriptions = _cpc_descriptions()
    code = str(code).strip()
    if code in descriptions:
        return descriptions[code]
    return descriptions.get(code.split("/", 1)[0].strip(), "")


def _usable(text: Any) -> bool:
    """The orchestrator's has_description test (pipeline/orchestrator.py, before compute_final_confidence)."""
    return bool(text and str(text).strip() not in ("nan", "None", ""))


def _patent_status(r: Dict[str, Any]) -> str:
    status = r.get("epo_validation_status") or ""
    if status in ("EPO Disabled", "Not Run"):
        return "disabled"
    if (r.get("patent_count") or 0) > 0:
        return "success"
    if "Error" in status:
        return "error"
    return "no_results"


def _override(r: Dict[str, Any]) -> str:
    if r.get("classification_disputed"):
        return "blocked"
    if r.get("validator_verdict") == "override":
        return "applied"
    return ""


def _result_view(company: Dict[str, Any], r: Dict[str, Any], config: Dict[str, Any]) -> Dict[str, Any]:
    error = r.get("classification") == "error"
    conf = r.get("confidence", 0) or 0
    llm = r.get("signal_score_llm", 0) or 0
    adj = r.get("signal_score_epo", 0) or 0
    patent_count = r.get("patent_count", 0) or 0
    validated = bool(r.get("validator_triggered"))

    # The orchestrator resolves the description as web_description or the
    # dataset description, then caps confidence when neither is usable and
    # there are no patents.
    cap = (config.get("confidence") or {}).get("low_evidence_cap", _DEFAULT_LOW_EVIDENCE_CAP)
    has_description = _usable(r.get("web_description") or company.get("description"))
    capped = not has_description and patent_count == 0 and llm + adj > cap

    domain = r.get("epo_primary_domain") or ""
    web_description = r.get("web_description") or ""

    return {
        "error": error,
        "errorMessage": (r.get("processing_errors") or r.get("reasoning") or "") if error else "",
        "verdict": r.get("classification", ""),
        "conf": conf,
        "risk": review.risk_flag(r),
        "tier": review.confidence_tier(conf),
        "llm": llm,
        "adj": adj,
        "pre": conf - (r.get("signal_score_validator", 0) or 0),
        "capped": capped,
        "validated": validated,
        "override": _override(r),
        "val": {
            "verdict": r.get("validator_verdict", ""),
            "decision": r.get("validation_decision", ""),
            "confidence": r.get("validator_updated_confidence", ""),
            "summary": r.get("web_evidence_summary", ""),
            "sources": r.get("sources_checked", []),
            "escalationReason": r.get("escalation_reason", ""),
        } if validated else None,
        "patents": {
            "count": patent_count,
            "level": r.get("epo_deeptech_level", ""),
            "domain": "" if domain == "N/A" else domain,
            "status": _patent_status(r),
            "cpc": [{"code": code, "desc": _cpc_desc(code)} for code in (r.get("cpc_codes") or [])[:_MAX_CPC]],
        },
        "basis": r.get("classification_basis", ""),
        "reasoning": r.get("reasoning", ""),
        "criteria": r.get("criteria", {}),
        "hasInputDesc": bool(company.get("description")),
        "hasWeb": bool(web_description),
        "webDescription": web_description,
        "webSource": r.get("web_description_source") or "",
        "webStatus": r.get("web_fetch_status", ""),
        "cost": r.get("total_cost_usd"),
        "timeS": r.get("processing_time_s"),
        "model": r.get("model", ""),
    }


def to_row(
    index: int,
    company: Dict[str, Any],
    result: Optional[Dict[str, Any]],
    step: Optional[str],
    history: List[Dict[str, Any]],
    config: Dict[str, Any],
) -> Dict[str, Any]:
    """
    One row as the frontend renders it.

    step is kept only while the row has no result. history is the reviewer's
    decision history for the row.
    """
    return {
        "index": index,
        "name": company.get("company_name", ""),
        "uen": company.get("uen", ""),
        "domain": company.get("domain", ""),
        "description": company.get("description", ""),
        "step": None if result is not None else step,
        "result": _result_view(company, result, config) if result is not None else None,
        "history": list(history),
    }


def _current_decision(history: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """The last history entry, unless it is a restore (then there is none)."""
    if not history or history[-1].get("type") == "restore":
        return None
    return history[-1]


def counts(rows: List[Dict[str, Any]]) -> Dict[str, int]:
    """
    done, deep, general, errors, open over rows that have a result.

    A row's verdict is its current decision's, if any. A row is open when its
    risk is not Clear and it has no current decision. Error rows count only
    under done and errors.
    """
    out = {"done": 0, "deep": 0, "general": 0, "errors": 0, "open": 0}
    for row in rows:
        res = row.get("result")
        if res is None:
            continue
        out["done"] += 1
        if res["error"]:
            out["errors"] += 1
            continue
        decision = _current_decision(row.get("history") or [])
        verdict = decision.get("verdict") if decision else res["verdict"]
        if verdict == "deep tech":
            out["deep"] += 1
        elif verdict == "general tech":
            out["general"] += 1
        if res["risk"] != "Clear" and decision is None:
            out["open"] += 1
    return out
