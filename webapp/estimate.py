"""
A rough cost and duration estimate for a run, shown before it starts.

Prices come from pipeline/models.py through get_cost_rates. The token counts
are ASSUMPTIONS, not measurements: recalibrate them from the token columns in
the Full Detail sheet of a real run.

Timings: ENRICH_SECS, VALIDATE_SECS, EPO_SECS and BATCH_OVERHEAD_SECS were
measured (BATCH_OVERHEAD_SECS once, on a 4-request batch); CLASSIFY_DIRECT_SECS
is an assumption. Per-company LLM steps run on DEFAULT_WORKERS workers; EPO
lookups are capped by EPO's search quota whatever the worker count, so they
set the floor for large runs.
"""

from __future__ import annotations

import math
from typing import Any, Dict, Tuple

from pipeline import models
from pipeline.llm_provider import BATCH_DISCOUNT, cost_known, get_cost_rates
from pipeline.parallel import DEFAULT_BATCH_MIN_COMPANIES, DEFAULT_WORKERS
from webapp.settings_map import BATCH_PROVIDERS, clean_settings

# Assumptions, to be recalibrated from a real run's Full Detail token columns.
CLASSIFIER_TOKENS = (3000, 600)        # input, output per company
ENRICH_TOKENS_PER_SEARCH = (4000, 300) # per company, per allowed search
VALIDATOR_TOKENS_PER_SEARCH = (5000, 400)
VALIDATED_SHARE_AT_70 = 0.25           # share of companies validated at threshold 70; scales linearly with the threshold, capped at 1.0

# Seconds per company for one worker, except BATCH_OVERHEAD_SECS (per run).
ENRICH_SECS = 7            # measured, run_20261116_213044
VALIDATE_SECS = 21         # measured
CLASSIFY_DIRECT_SECS = 20  # assumption, not yet measured
EPO_SECS = 17              # measured at EPO's 5-searches-per-minute limit
BATCH_OVERHEAD_SECS = 360  # measured once, for 4 requests


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


def estimate(settings: Dict[str, Any], rows: int, batch_min: int = DEFAULT_BATCH_MIN_COMPANIES) -> Dict[str, Any]:
    """
    Estimated cost (USD) and duration (seconds) of classifying `rows` companies.

    Args:
        settings: Output of settings_map.clean_settings.
        rows: Number of companies in the run.
        batch_min: The fewest companies that use a batch job
            (settings_map.batch_min_companies of the run's base config).

    Returns:
        known: False when the model has no listed price; cost is then None.
        model: The pinned model (by the pipeline's rule, models.pinned_model),
            or the tier's first candidate.
        pricedAs: The model whose prices were used when that is not `model`
            (a tier's moving alias priced as the version it points to today,
            models.ESTIMATE_PRICE_AS), else None. A pinned model is never
            mapped: a pin names an exact model.
        pinned: True when `model` came from the pin.
        batch: True when the run would use a batch job: batching is on, the
            provider supports it and rows is at least batch_min.
        batchMin: batch_min, so the page can say why batch mode has no effect.
        cost: Sum of parts, or None when not known.
        secs: Estimated duration, with DEFAULT_WORKERS workers.
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
    batch = (
        bool(settings["batch"])
        and provider in BATCH_PROVIDERS
        and rows >= batch_min
    )

    classify = rows * _token_cost(CLASSIFIER_TOKENS, rates)
    if batch:
        classify *= BATCH_DISCOUNT

    enrich = 0.0
    if settings["enrichment"]:
        enrich = rows * _search_step_cost(
            ENRICH_TOKENS_PER_SEARCH, settings["enrichmentMaxSearches"], rates
        )

    validate = 0.0
    share = min(VALIDATED_SHARE_AT_70 * settings["validatorThreshold"] / 70, 1.0)
    if settings["validator"]:
        validate = rows * share * _search_step_cost(
            VALIDATOR_TOKENS_PER_SEARCH, settings["maxWebSearches"], rates
        )

    # Patent lookups and enrichment run side by side; the slower one sets the time.
    workers = DEFAULT_WORKERS
    gather_secs = max(
        rows * EPO_SECS if settings["epo"] else 0,
        rows * ENRICH_SECS / workers if settings["enrichment"] else 0,
    )
    classify_secs = BATCH_OVERHEAD_SECS if batch else rows * CLASSIFY_DIRECT_SECS / workers
    validate_secs = rows * share * VALIDATE_SECS / workers if settings["validator"] else 0
    secs = float(gather_secs + classify_secs + validate_secs)

    parts = {"classify": classify, "enrich": enrich, "validate": validate}
    return {
        "known": known,
        "model": model,
        "pricedAs": priced_as,
        "pinned": pinned is not None,
        "batch": batch,
        "batchMin": batch_min,
        "cost": sum(parts.values()) if known else None,
        "secs": secs,
        "parts": parts,
    }


class EstimateError(ValueError):
    """An estimate request that cannot be answered; the message says why."""


# More than any spreadsheet the app takes; a huge finite count can make the
# cost overflow to infinity, which is not valid JSON.
MAX_ROWS = 1_000_000


def _whole_rows(rows: Any) -> int:
    """rows as an int from 0 to MAX_ROWS; a float is accepted only when it is whole."""
    if isinstance(rows, bool) or not isinstance(rows, (int, float)):
        raise EstimateError(f"rows must be a whole number, not {rows!r}")
    if isinstance(rows, float):
        if not math.isfinite(rows) or not rows.is_integer():
            raise EstimateError(f"rows must be a whole number, not {rows!r}")
        rows = int(rows)
    if rows < 0:
        raise EstimateError(f"rows must not be negative, not {rows!r}")
    if rows > MAX_ROWS:
        raise EstimateError(f"rows must be at most {MAX_ROWS:,}")
    return rows


def estimate_request(body: Any, batch_min: int = DEFAULT_BATCH_MIN_COMPANIES) -> Dict[str, Any]:
    """
    The estimate for the raw JSON body of POST /api/estimate.

    body["settings"] goes through clean_settings (missing means defaults);
    body["rows"] is required. batch_min as for estimate.

    Raises:
        EstimateError: body is not an object, the provider or tier is unknown,
            or rows is not a whole number from 0 to MAX_ROWS.
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
    return estimate(settings, rows, batch_min)
