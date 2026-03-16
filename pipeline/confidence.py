"""
Confidence score combination logic.

Weights:
  EPO signal:       0–40 pts
  LLM confidence:   0–50 pts
  Validator bonus:  0–10 pts (added later if triggered)

Cap at 60 if no description AND no patents.
"""

from typing import Dict, Any, Optional


def compute_epo_score(
    patent_count: int,
    epo_deeptech_level: str,
    epo_weight_max: int = 40,
) -> int:
    """
    Convert EPO data to a 0–epo_weight_max score.

    Scoring:
      - Base: patent_count contribution (up to half of weight)
      - Level multiplier applied to full weight
    """
    if patent_count == 0:
        return 0

    # Patent count contribution (caps at half the max weight)
    count_score = min(patent_count * 4, epo_weight_max // 2)

    # Deep tech level multiplier
    level_multipliers = {
        "Very Strong": 1.0,
        "Strong": 0.80,
        "Moderate": 0.55,
        "Not Deep-tech": 0.25,
    }
    multiplier = level_multipliers.get(epo_deeptech_level, 0.25)

    level_score = int(epo_weight_max * multiplier)

    return min(count_score + level_score, epo_weight_max)


def compute_llm_score(
    llm_confidence: int,
    llm_weight_max: int = 50,
) -> int:
    """Scale LLM confidence (0–100) to 0–llm_weight_max."""
    return int(min(llm_confidence, 100) * llm_weight_max / 100)


def compute_final_confidence(
    patent_count: int,
    epo_deeptech_level: str,
    llm_confidence: int,
    has_description: bool,
    validator_bonus: int = 0,
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, int]:
    """
    Combine EPO + LLM + optional validator bonus into final confidence.

    Args:
        patent_count: Number of patents found via EPO.
        epo_deeptech_level: EPO deep tech level string.
        llm_confidence: Agent 1 confidence (0–100).
        has_description: Whether company has a non-empty description.
        validator_bonus: Points added by Agent 2 (0–10).
        config: Pipeline config dict (reads confidence section).

    Returns:
        {
          "signal_score_epo": int,
          "signal_score_llm": int,
          "signal_score_validator": int,
          "final_confidence": int,
        }
    """
    cfg = (config or {}).get("confidence", {})
    epo_max = cfg.get("epo_weight_max", 40)
    llm_max = cfg.get("llm_weight_max", 50)
    validator_max = cfg.get("validator_weight_max", 10)
    low_evidence_cap = cfg.get("low_evidence_cap", 60)

    epo_score = compute_epo_score(patent_count, epo_deeptech_level, epo_max)
    llm_score = compute_llm_score(llm_confidence, llm_max)
    val_score = min(max(validator_bonus, 0), validator_max)

    raw = epo_score + llm_score + val_score
    final = min(raw, 100)

    # Cap if low evidence
    if not has_description and patent_count == 0:
        final = min(final, low_evidence_cap)

    return {
        "signal_score_epo": epo_score,
        "signal_score_llm": llm_score,
        "signal_score_validator": val_score,
        "final_confidence": final,
    }
