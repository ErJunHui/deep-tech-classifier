"""
Single source of truth for model names, per-model request settings and prices.

No other module should name a model or a tool version. To support a new model:
add its profile to PROFILES (with its price), then add it to a candidate list.

pipeline/model_resolver.py turns llm.tier into the first candidate the provider
still serves. A model goes into a candidate list only after it has been run
through this pipeline.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Candidates: ordered, most preferred first
# ---------------------------------------------------------------------------

CANDIDATES: Dict[str, Dict[str, List[str]]] = {
    "anthropic": {
        "fast":     ["claude-haiku-5-5", "claude-haiku-4-5"],
        "balanced": ["claude-sonnet-5-5", "claude-sonnet-4-6"],
        "best":     ["claude-opus-5-5"],
    },
    # Gemini tiers are moving aliases; Google repoints them to newer versions.
    # The version actually used is recorded from each response.
    "gemini": {
        "fast":     ["gemini-flash-lite-latest"],
        "balanced": ["gemini-flash-latest"],
        "best":     ["gemini-pro-latest"],
    },
    "openai": {
        "fast":     ["gpt-4o-mini"],
        "balanced": ["gpt-4o"],
        "best":     ["gpt-4o"],
    },
}

TIERS = ("fast", "balanced", "best")
DEFAULT_TIER = "fast"

# Providers whose candidates are checked against the API's model list.
LISTED_PROVIDERS = {"anthropic", "openai"}

# OpenAI runs web search on a dedicated model, not on the main one.
OPENAI_SEARCH_CANDIDATES = ["gpt-4o-search-preview"]

_ANTHROPIC_WEB_SEARCH_BASIC = "web_search_20250305"

# ---------------------------------------------------------------------------
# Profiles: what each model needs in a request, and what it costs
# ---------------------------------------------------------------------------

_M = 1_000_000


def _rates(input_: float, output: float, cache_write: float = 0.0,
           cache_read: float = 0.0, web_search_per_1k: Optional[float] = None) -> Dict[str, float]:
    """Prices in USD per million tokens, returned as USD per token."""
    rates = {
        "input": input_ / _M,
        "output": output / _M,
        "cache_write": cache_write / _M,
        "cache_read": cache_read / _M,
    }
    if web_search_per_1k is not None:
        rates["web_search"] = web_search_per_1k / 1_000
    return rates


@dataclass(frozen=True)
class ModelProfile:
    # False for models that reject a non-default temperature.
    send_temperature: bool = True
    # Added to the configured max_tokens. Models that think by default spend
    # part of max_tokens on thinking before they write the answer.
    extra_max_tokens: int = 0
    # Anthropic server-side web search tool version.
    web_search_tool: str = _ANTHROPIC_WEB_SEARCH_BASIC
    # False for models that cannot be used with the Message Batches API.
    batch: bool = True
    # USD per token; None when the price is unknown.
    rates: Optional[Dict[str, float]] = field(default=None)


# Used for a pinned model that has no profile: the request shape this pipeline
# has always sent.
LEGACY_PROFILE = ModelProfile()

PROFILES: Dict[str, ModelProfile] = {
    # The 5.5 models reject a non-default temperature (Opus 5.5 rejects the
    # parameter outright) and think by default. Haiku 5.5 prices are for
    # prompts up to 100K tokens.
    # Sonnet 5.5 and Opus 5.5 also accept web_search_20260209; the basic version
    # is kept because it is the one the response parsing has been run against.
    "claude-opus-5-5": ModelProfile(
        send_temperature=False,
        extra_max_tokens=4000,
        rates=_rates(4.00, 20.00, cache_write=5.00, cache_read=0.20, web_search_per_1k=10.00),
    ),
    "claude-haiku-5-5": ModelProfile(
        send_temperature=False,
        extra_max_tokens=4000,
        rates=_rates(0.10, 0.50, cache_write=0.125, cache_read=0.01, web_search_per_1k=10.00),
    ),
    "claude-sonnet-5-5": ModelProfile(
        send_temperature=False,
        extra_max_tokens=4000,
        rates=_rates(2.00, 10.00, cache_write=2.50, cache_read=0.10, web_search_per_1k=10.00),
    ),
    "claude-haiku-4-5": ModelProfile(
        rates=_rates(1.00, 5.00, cache_write=1.25, cache_read=0.10, web_search_per_1k=10.00),
    ),
    "claude-sonnet-4-6": ModelProfile(
        rates=_rates(3.00, 15.00, cache_write=3.75, cache_read=0.30, web_search_per_1k=10.00),
    ),
    # Gemini web_search is the price of a Google Search grounding request.
    "gemini-2.5-flash": ModelProfile(rates=_rates(0.15, 0.60, web_search_per_1k=35.00)),
    "gemini-2.5-pro": ModelProfile(rates=_rates(1.25, 10.00, web_search_per_1k=35.00)),
    "gemini-2.0-flash": ModelProfile(rates=_rates(0.10, 0.40, web_search_per_1k=35.00)),
    "gpt-4o-mini": ModelProfile(rates=_rates(0.15, 0.60)),
    "gpt-4o": ModelProfile(rates=_rates(2.50, 10.00)),
    "gpt-4o-search-preview": ModelProfile(rates=_rates(2.50, 10.00)),
}

# Returned for a model with no listed price. Costs computed from it are zero,
# and "known": False tells callers to show the cost as unknown instead.
UNKNOWN_RATES: Dict[str, Any] = {**_rates(0.0, 0.0, web_search_per_1k=0.0), "known": False}

# Kept in the shape llm_provider.get_cost_rates has always used.
COST_RATES: Dict[str, Dict[str, float]] = {
    name: profile.rates for name, profile in PROFILES.items() if profile.rates is not None
}

# Anthropic snapshots end in -YYYYMMDD, OpenAI snapshots in -YYYY-MM-DD.
_DATED_SNAPSHOT = re.compile(r"-(\d{8}|\d{4}-\d{2}-\d{2})$")


# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------

def pinned_model(config: Dict[str, Any]) -> Optional[str]:
    """
    The model a config pins, or None when llm.model is missing, null or empty.

    The quoted strings "null" and "none" also count as unset: they are an easy
    slip when editing JSON by hand and are never real model names.
    """
    model = config.get("llm", {}).get("model")
    if isinstance(model, str):
        model = model.strip()
        if model.lower() in ("", "null", "none"):
            return None
    return model or None


def base_model_id(model: str) -> str:
    """A dated snapshot ID (…-20251001, …-2024-08-06) without its date."""
    return _DATED_SNAPSHOT.sub("", model or "")


def has_profile(model: str) -> bool:
    return model in PROFILES or base_model_id(model) in PROFILES


def get_profile(model: str) -> ModelProfile:
    """Profile for a model; a dated snapshot (…-20251001) uses its base model's profile."""
    if model in PROFILES:
        return PROFILES[model]
    return PROFILES.get(base_model_id(model), LEGACY_PROFILE)


def request_params(model: str, max_tokens: int, temperature: float) -> Dict[str, Any]:
    """max_tokens / temperature keyword arguments shaped for the given model."""
    profile = get_profile(model)
    params: Dict[str, Any] = {"max_tokens": max_tokens + profile.extra_max_tokens}
    if profile.send_temperature:
        params["temperature"] = temperature
    return params


def anthropic_web_search_tool(model: str, max_uses: int) -> Dict[str, Any]:
    """The server-side web search tool definition for an Anthropic model."""
    return {"type": get_profile(model).web_search_tool, "name": "web_search", "max_uses": max_uses}
