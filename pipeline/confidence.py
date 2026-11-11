"""
Confidence scoring.

`confidence` always means: how likely is the *chosen* classification to be
correct (0–100). It is built in two steps.

1. Before validation (compute_final_confidence)
     start from Agent 1's own confidence, then adjust for patent evidence:
       + up to epo_adjust_max  if the patents agree with the classification
       - up to epo_adjust_max  if the patents contradict it
     and cap at low_evidence_cap when there is no description and no patents.

2. After validation (apply_validator), if Agent 2 ran
       confirm              → Agent 2's confidence replaces ours (up or down)
       override, accepted   → Agent 2's classification and confidence
       override, blocked    → keep ours, but no more confident than
                              100 - Agent 2's confidence in the opposite answer
       insufficient/escalate→ confidence can only go down
"""

import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# How strongly each EPO level points towards "deep tech" (0 = no signal).
_LEVEL_STRENGTH = {
    "Very Strong": 1.0,
    "Strong": 0.80,
    "Moderate": 0.55,
    "Not Deep-tech": 0.0,
}
_PATENT_COUNT_SATURATION = 5

_LEGACY_CONFIDENCE_KEYS = ("epo_weight_max", "llm_weight_max", "validator_weight_max")
_warned_legacy = False


def _clamp(value: Any, low: int = 0, high: int = 100) -> int:
    try:
        return int(max(low, min(high, round(float(value)))))
    except (TypeError, ValueError):
        return low


def _warn_legacy_keys(config: Dict[str, Any]) -> None:
    global _warned_legacy
    if _warned_legacy:
        return
    legacy = [f"confidence.{k}" for k in _LEGACY_CONFIDENCE_KEYS if k in config.get("confidence", {})]
    if "override_requires_delta" in config.get("validation", {}):
        legacy.append("validation.override_requires_delta")
    if legacy:
        _warned_legacy = True
        logger.warning(
            f"Ignoring config keys from the old confidence model: {', '.join(legacy)}. "
            "See confidence.epo_adjust_max / confidence.low_evidence_cap in config.template.json."
        )


def epo_deeptech_strength(patent_count: int, epo_deeptech_level: str) -> float:
    """
    How strongly the patent portfolio points towards deep tech, 0.0–1.0.

    Zero when there are no patents or EPO rates them "Not Deep-tech". Otherwise
    the level sets the ceiling and the patent count (saturating at 5) fills
    between half of it and all of it.
    """
    if not patent_count or patent_count <= 0:
        return 0.0
    level = _LEVEL_STRENGTH.get(epo_deeptech_level, 0.0)
    count_factor = min(patent_count, _PATENT_COUNT_SATURATION) / _PATENT_COUNT_SATURATION
    return level * (0.5 + 0.5 * count_factor)


def compute_final_confidence(
    classification: str,
    patent_count: int,
    epo_deeptech_level: str,
    llm_confidence: Any,
    has_description: bool,
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, int]:
    """
    Pre-validation confidence in `classification`.

    Returns:
        {
          "signal_score_llm": Agent 1 confidence, 0–100,
          "signal_score_epo": signed patent adjustment (+ agrees, - contradicts),
          "signal_score_validator": 0 (filled in by apply_validator),
          "final_confidence": 0–100,
        }
    """
    config = config or {}
    _warn_legacy_keys(config)
    cfg = config.get("confidence", {})
    epo_adjust_max = cfg.get("epo_adjust_max", 15)
    low_evidence_cap = cfg.get("low_evidence_cap", 60)

    llm_score = _clamp(llm_confidence)

    strength = epo_deeptech_strength(patent_count, epo_deeptech_level)
    if classification == "deep tech":
        epo_adjustment = round(strength * epo_adjust_max)
    elif classification == "general tech":
        epo_adjustment = -round(strength * epo_adjust_max)
    else:
        epo_adjustment = 0

    final = _clamp(llm_score + epo_adjustment)
    if not has_description and not patent_count:
        final = min(final, low_evidence_cap)

    return {
        "signal_score_llm": llm_score,
        "signal_score_epo": epo_adjustment,
        "signal_score_validator": 0,
        "final_confidence": final,
    }


def apply_validator(
    classification: str,
    scores: Dict[str, int],
    agent2: Optional[Dict[str, Any]],
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Fold Agent 2's verdict into the classification and confidence.

    Returns {"classification", "confidence", "classification_disputed", "scores"},
    where scores["signal_score_validator"] is the signed change Agent 2 caused.
    """
    pre = scores["final_confidence"]
    scores = dict(scores)
    disputed = False

    if not agent2:
        return {"classification": classification, "confidence": pre,
                "classification_disputed": False, "scores": scores}

    override_min = (config or {}).get("validation", {}).get("override_min_confidence", 65)
    verdict = agent2.get("validator_verdict")
    val_class = agent2.get("final_classification")
    val_conf = _clamp(agent2.get("updated_confidence", 0))
    agrees = val_class == classification

    if verdict == "confirm":
        confidence = val_conf
    elif verdict == "override" and val_conf >= override_min:
        classification = val_class
        confidence = val_conf
    elif verdict == "override":
        disputed = True
        confidence = min(pre, 100 - val_conf)
    elif agrees:
        # Escalated / validation failed: not corroboration, so never raise.
        confidence = min(pre, val_conf)
    else:
        confidence = min(pre, 100 - val_conf)

    scores["signal_score_validator"] = confidence - pre
    scores["final_confidence"] = confidence
    return {"classification": classification, "confidence": confidence,
            "classification_disputed": disputed, "scores": scores}
