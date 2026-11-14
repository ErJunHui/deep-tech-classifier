"""
A rough cost and duration estimate for a run, shown before it starts.

Prices come from pipeline/models.py through get_cost_rates. The token counts
and timings below are ASSUMPTIONS, not measurements: recalibrate them from the
token columns in the Full Detail sheet of a real run.
"""

from __future__ import annotations

import math
from typing import Any, Dict, Tuple

from pipeline import models
from pipeline.llm_provider import BATCH_DISCOUNT, cost_known, get_cost_rates
from webapp.settings_map import BATCH_PROVIDERS, clean_settings

# Assumptions, to be recalibrated from a real run's Full Detail token columns.
CLASSIFIER_TOKENS = (3000, 600)        # input, output per company
ENRICH_TOKENS_PER_SEARCH = (4000, 300) # per company, per allowed search
VALIDATOR_TOKENS_PER_SEARCH = (5000, 400)
VALIDATED_SHARE_AT_70 = 0.25           # share of companies validated at threshold 70; scales linearly with the threshold, capped at 1.0
SECONDS_PER_COMPANY = {"sequential": 18, "batch": 6}

# Duration multipliers when a step is switched off.
_NO_ENRICHMENT_TIME = 0.75
_NO_VALIDATION_TIME = 0.85


def _token_cost(tokens: Tuple[int, int], rates: Dict[str, Any]) -> float:
    tokens_in, tokens_out = tokens
    return tokens_in * rates["input"] + tokens_out * rates["output"]


def _search_step_cost(tokens_per_search: Tuple[int, int], searches: int, rates: Dict[str, Any]) -> float:
    """
    USD per company for a step allowed `searches` web searches.

    A step allowed no searches is costed as one: it still makes its call, and
    the Anthropic provider allows at least one search.
    """
    searches = max(searches, 1)
    return searches * (_token_cost(tokens_per_search, rates) + rates.get("web_search", 0.0))


def estimate(settings: Dict[str, Any], rows: int) -> Dict[str, Any]:
    """
    Estimated cost (USD) and duration (seconds) of classifying `rows` companies.

    Args:
        settings: Output of settings_map.clean_settings.
        rows: Number of companies in the run.

    Returns:
        known: False when the model has no listed price; cost is then None.
        model: The pinned model (by the pipeline's rule, models.pinned_model),
            or the tier's first candidate.
        pricedAs: The model whose prices were used when that is not `model`
            (a tier's moving alias priced as the version it points to today,
            models.ESTIMATE_PRICE_AS), else None. A pinned model is never
            mapped: a pin names an exact model.
        pinned: True when `model` came from the pin.
        batch: True when the run would use a batch job.
        cost: Sum of parts, or None when not known.
        secs: Estimated duration.
        parts: USD per run for classify, enrich and validate.
    """
    rows = max(int(rows), 0)
    provider = settings["provider"]
    pinned = models.pinned_model({"llm": {"model": settings["model"]}})
    model = pinned or models.CANDIDATES[provider][settings["tier"]][0]
    # warn=False: this runs on every settings change, including each keystroke
    # of a half-typed pinned model.
    rates = get_cost_rates(model, warn=False)
    priced_as = None
    if not pinned and not cost_known(rates) and model in models.ESTIMATE_PRICE_AS:
        priced_as = models.ESTIMATE_PRICE_AS[model]
        rates = get_cost_rates(priced_as, warn=False)
    known = cost_known(rates)
    batch = bool(settings["batch"]) and provider in BATCH_PROVIDERS

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
        "pricedAs": priced_as,
        "pinned": pinned is not None,
        "batch": batch,
        "cost": sum(parts.values()) if known else None,
        "secs": secs,
        "parts": parts,
    }


class EstimateError(ValueError):
    """An estimate request that cannot be answered; the message says why."""


def _whole_rows(rows: Any) -> int:
    """rows as a non-negative int; a float is accepted only when it is whole."""
    if isinstance(rows, bool) or not isinstance(rows, (int, float)):
        raise EstimateError(f"rows must be a whole number, not {rows!r}")
    if isinstance(rows, float):
        if not math.isfinite(rows) or not rows.is_integer():
            raise EstimateError(f"rows must be a whole number, not {rows!r}")
        rows = int(rows)
    if rows < 0:
        raise EstimateError(f"rows must not be negative, not {rows!r}")
    try:
        float(rows)  # the estimate multiplies prices by rows
    except OverflowError:
        raise EstimateError("rows is too large") from None
    return rows


def estimate_request(body: Any) -> Dict[str, Any]:
    """
    The estimate for the raw JSON body of POST /api/estimate.

    body["settings"] goes through clean_settings (missing means defaults);
    body["rows"] is required.

    Raises:
        EstimateError: body is not an object, the provider or tier is unknown,
            or rows is not a non-negative whole number.
    """
    if not isinstance(body, dict):
        raise EstimateError("The request body must be a JSON object")
    if "rows" not in body:
        raise EstimateError("rows is required")
    rows = _whole_rows(body["rows"])
    try:
        settings = clean_settings(body.get("settings", {}))
    except ValueError as exc:
        raise EstimateError(str(exc)) from exc
    return estimate(settings, rows)
