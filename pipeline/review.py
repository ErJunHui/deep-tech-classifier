"""Review rules shared by the Excel writer and the web app: confidence tier, risk flag, action."""

from typing import Any, Dict


def confidence_tier(confidence: int) -> str:
    """Bucket a 0-100 confidence score into High (>=75), Medium (>=50) or Low."""
    if confidence >= 75:
        return "High"
    if confidence >= 50:
        return "Medium"
    return "Low"


def risk_flag(result: Dict[str, Any]) -> str:
    """
    Flag how much a result needs a human, in priority order.

    Escalate (validator asked for human review) > Contested (classification
    disputed) > Uncertain (validator triggered and confidence below 70) > Clear.
    Missing or None confidence counts as 0.
    """
    confidence = result.get("confidence", 0) or 0
    validation_decision = result.get("validation_decision", "") or ""

    if validation_decision == "ESCALATE_FOR_HUMAN_REVIEW":
        return "Escalate"
    if result.get("classification_disputed", False):
        return "Contested"
    if result.get("validator_triggered", False) and confidence < 70:
        return "Uncertain"
    return "Clear"


def action_required(verdict: str, risk: str) -> str:
    """Approve clear deep tech, reject clear general tech; everything else needs review."""
    if risk == "Clear":
        if verdict == "deep tech":
            return "Approve"
        if verdict == "general tech":
            return "Reject"
    return "Needs Review"
