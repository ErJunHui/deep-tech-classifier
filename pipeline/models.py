"""
Single source of truth for model names, per-model request settings and prices.

No other module should name a model or a tool version. To support a new model:
add its profile to PROFILES (with its price), then add it to a candidate list.

Tiers are not selectable from config yet (see NEXT_STEPS.md, Step 3). For now the
first "fast" candidate of each provider is the default when llm.model is unset.
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
        "best":     [],  # no Opus model has been run through this pipeline yet
    },
    "gemini": {
        "fast":     ["gemini-2.5-flash"],
        "balanced": ["gemini-2.5-flash"],
        "best":     ["gemini-2.5-pro"],
    },
    "openai": {
        "fast":     ["gpt-4o-mini"],
        "balanced": ["gpt-4o"],
        "best":     ["gpt-4o"],
    },
}

# OpenAI runs web search on a dedicated model, not on the main one.
OPENAI_SEARCH_MODEL = "gpt-4o-search-preview"

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
    # USD per token; None when the price is unknown.
    rates: Optional[Dict[str, float]] = field(default=None)


# Used for a pinned model that has no profile: the request shape this pipeline
# has always sent.
LEGACY_PROFILE = ModelProfile()

PROFILES: Dict[str, ModelProfile] = {
    # Haiku 5.5 and Sonnet 5.5 reject a non-default temperature and think by
    # default. Haiku 5.5 prices are for prompts up to 100K tokens.
    # Sonnet 5.5 also accepts web_search_20260209; the basic version is kept
    # because it is the one the response parsing has been run against.
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

# Applied when a model has no price (see get_cost_rates in llm_provider).
DEFAULT_RATES: Dict[str, float] = _rates(1.00, 5.00)

# Kept in the shape llm_provider.get_cost_rates has always used.
COST_RATES: Dict[str, Dict[str, float]] = {
    name: profile.rates for name, profile in PROFILES.items() if profile.rates is not None
}

_DATED_SNAPSHOT = re.compile(r"-\d{8}$")


# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------

def default_model(provider: str = "anthropic") -> str:
    """The model used when llm.model is not set."""
    try:
        return CANDIDATES[provider]["fast"][0]
    except (KeyError, IndexError):
        raise ValueError(f"No default model is defined for provider {provider!r}.") from None


def configured_model(config: Dict[str, Any]) -> str:
    """The model a config asks for. A missing or null llm.model means the default."""
    llm_cfg = config.get("llm", {})
    return llm_cfg.get("model") or default_model(llm_cfg.get("provider", "anthropic"))


def get_profile(model: str) -> ModelProfile:
    """Profile for a model; a dated snapshot (…-20251001) uses its base model's profile."""
    if model in PROFILES:
        return PROFILES[model]
    return PROFILES.get(_DATED_SNAPSHOT.sub("", model or ""), LEGACY_PROFILE)


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
