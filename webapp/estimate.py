"""
A rough cost and duration estimate for a run, shown before it starts.

Prices come from pipeline/models.py through get_cost_rates. The token counts
and timings below are ASSUMPTIONS, not measurements: recalibrate them from the
token columns in the Full Detail sheet of a real run.
"""

from __future__ import annotations

from typing import Any, Dict, Tuple

from pipeline import models
from pipeline.llm_provider import BATCH_DISCOUNT, cost_known, get_cost_rates

# Assumptions, to be recalibrated from a real run's Full Detail token columns.
CLASSIFIER_TOKENS = (3000, 600)        # input, output per company
ENRICH_TOKENS_PER_SEARCH = (4000, 300) # per company, per allowed search
VALIDATOR_TOKENS_PER_SEARCH = (5000, 400)
VALIDATED_SHARE_AT_70 = 0.25           # share of companies validated at threshold 70; scales linearly with the threshold, capped at 1.0
SECONDS_PER_COMPANY = {"sequential": 18, "batch": 6}

# Duration multipliers when a step is switched off.
_NO_ENRICHMENT_TIME = 0.75
_NO_VALIDATION_TIME = 0.85

# Only Anthropic runs through the Message Batches API.
_BATCH_PROVIDERS = {"anthropic"}


def _token_cost(tokens: Tuple[int, int], rates: Dict[str, Any]) -> float:
    tokens_in, tokens_out = tokens
    return tokens_in * rates["input"] + tokens_out * rates["output"]


def _search_step_cost(tokens_per_search: Tuple[int, int], searches: int, rates: Dict[str, Any]) -> float:
    """USD per company for a step that makes `searches` web searches."""
    return searches * (_token_cost(tokens_per_search, rates) + rates.get("web_search", 0.0))


def estimate(settings: Dict[str, Any], rows: int) -> Dict[str, Any]:
    """
    Estimated cost (USD) and duration (seconds) of classifying `rows` companies.

    Args:
        settings: Output of settings_map.clean_settings.
        rows: Number of companies in the run.

    Returns:
        known: False when the model has no listed price; cost is then None.
        model: The pinned model, or the tier's first candidate.
        batch: True when the run would use a batch job.
        cost: Sum of parts, or None when not known.
        secs: Estimated duration.
        parts: USD per run for classify, enrich and validate.
    """
    rows = max(int(rows), 0)
    provider = settings["provider"]
    model = settings["model"].strip() or models.CANDIDATES[provider][settings["tier"]][0]
    rates = get_cost_rates(model)
    known = cost_known(rates)
    batch = bool(settings["batch"]) and provider in _BATCH_PROVIDERS

    classify = rows * _token_cost(CLASSIFIER_TOKENS, rates)
    if batch:
        classify *= BATCH_DISCOUNT

    enrich = 0.0
    if settings["enrichment"]:
        enrich = rows * _search_step_cost(
            ENRICH_TOKENS_PER_SEARCH, settings["enrichmentMaxSearches"], rates
        )

    validate = 0.0
    if settings["validator"]:
        share = min(VALIDATED_SHARE_AT_70 * settings["validatorThreshold"] / 70, 1.0)
        validate = rows * share * _search_step_cost(
            VALIDATOR_TOKENS_PER_SEARCH, settings["maxWebSearches"], rates
        )

    secs = float(rows * SECONDS_PER_COMPANY["batch" if batch else "sequential"])
    if not settings["enrichment"]:
        secs *= _NO_ENRICHMENT_TIME
    if not settings["validator"]:
        secs *= _NO_VALIDATION_TIME

    parts = {"classify": classify, "enrich": enrich, "validate": validate}
    return {
        "known": known,
        "model": model,
        "batch": batch,
        "cost": sum(parts.values()) if known else None,
        "secs": secs,
        "parts": parts,
    }
