"""
Choose the model for a run: a pinned llm.model, or the first tested candidate
for llm.tier that the provider still serves.

Resolution happens once at startup. The orchestrator stores the result in the
run state so a resumed run keeps the same model.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Callable, Iterable, List, Optional

from pipeline import models

logger = logging.getLogger(__name__)


class ModelSetupError(Exception):
    """The run cannot start, or cannot continue, with a usable model."""


@dataclass(frozen=True)
class ResolvedModel:
    model: str
    source: str               # "pinned", "tier" or "checkpoint"
    tier: Optional[str] = None

    def describe(self) -> str:
        if self.source == "tier":
            return f"tier '{self.tier}'"
        if self.source == "checkpoint":
            return "run checkpoint"
        return "pinned in config"


def _is_served(candidate: str, served: Iterable[str]) -> bool:
    """A candidate is served under its own ID or as a dated snapshot of it."""
    served = set(served)
    return candidate in served or candidate in {models.base_model_id(s) for s in served}


def _list_served(provider: str, list_models: Callable[[], List[str]]) -> List[str]:
    try:
        return list(list_models())
    except Exception as e:
        raise ModelSetupError(
            f"Could not list the models available from {provider}: {e}. "
            "Set llm.model to pin a model and skip this check."
        ) from e


def resolve_model(
    provider: str,
    tier: Optional[str],
    pinned: Optional[str],
    need_batch: bool,
    list_models: Callable[[], List[str]],
) -> ResolvedModel:
    """
    Args:
        list_models: returns the model IDs the provider serves. Only called
                     when a tier has to be resolved against that list.
    """
    if pinned:
        if not models.has_profile(pinned):
            logger.warning(
                f"Model '{pinned}' is pinned but has no profile in pipeline/models.py. "
                "It will be called with the original request settings and its cost "
                "will be estimated with default rates."
            )
        return ResolvedModel(pinned, "pinned")

    tier = tier or models.DEFAULT_TIER
    if tier not in models.TIERS:
        raise ModelSetupError(
            f"Unknown llm.tier {tier!r}. Supported values: {', '.join(models.TIERS)}."
        )
    candidates = models.CANDIDATES.get(provider, {}).get(tier, [])
    if not candidates:
        raise ModelSetupError(
            f"No tested {provider} model is defined for tier '{tier}'. "
            "Set llm.model to pin one."
        )

    # Gemini tiers map to moving aliases, which are not checked against a list.
    if provider not in models.LISTED_PROVIDERS:
        return ResolvedModel(candidates[0], "tier", tier)

    served = _list_served(provider, list_models)
    for candidate in candidates:
        if need_batch and not models.get_profile(candidate).batch:
            continue
        if _is_served(candidate, served):
            return ResolvedModel(candidate, "tier", tier)

    batch_note = " that supports batch" if need_batch else ""
    raise ModelSetupError(
        f"No tested {provider} model{batch_note} is available for tier '{tier}'. "
        f"Tried: {', '.join(candidates)}. "
        f"The API serves: {', '.join(sorted(served)) or '(none)'}. "
        "Set llm.model to pin one."
    )


def resolve_openai_search_model(list_models: Callable[[], List[str]]) -> str:
    """First OpenAI search candidate the API still serves."""
    served = _list_served("openai", list_models)
    for candidate in models.OPENAI_SEARCH_CANDIDATES:
        if _is_served(candidate, served):
            return candidate
    raise ModelSetupError(
        "No tested OpenAI web-search model is available. "
        f"Tried: {', '.join(models.OPENAI_SEARCH_CANDIDATES)}. "
        f"The API serves: {', '.join(sorted(served)) or '(none)'}."
    )
