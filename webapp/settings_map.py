"""
Translate the browser's settings into the pipeline's config dict, and report
setup information (providers, which API keys are set, defaults).

API keys never leave this module: setup_info reports only whether each is set.
Model names come from pipeline/models.py.
"""

from __future__ import annotations

import copy
import json
import math
from pathlib import Path
from typing import Any, Dict, Mapping, Tuple

from pipeline import models

_PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Provider id -> (label, API-key environment variable). The variable names are
# the ones pipeline/llm_provider.py and pipeline/settings.py read.
_PROVIDERS: Dict[str, Tuple[str, str]] = {
    "anthropic": ("Anthropic", "ANTHROPIC_API_KEY"),
    "gemini": ("Google Gemini", "GEMINI_API_KEY"),
    "openai": ("OpenAI", "OPENAI_API_KEY"),
}

# Only Anthropic runs through the Message Batches API.
_BATCH_PROVIDERS = {"anthropic"}

# Numeric setting -> (low, high), inclusive.
_BOUNDS: Dict[str, Tuple[int, int]] = {
    "validatorThreshold": (0, 100),
    "overrideMinConfidence": (0, 100),
    "lowEvidenceCap": (0, 100),
    "epoAdjustMax": (0, 30),
    "maxWebSearches": (0, 10),
    "enrichmentMaxSearches": (0, 10),
}

_FLAGS = ("enrichment", "epo", "validator", "batch")

# Mapping key -> pipeline column setting.
_COLUMNS = ("company_name", "description", "domain", "uen")


def _load_template() -> Dict[str, Any]:
    with open(_PROJECT_ROOT / "config.template.json", "r", encoding="utf-8") as f:
        return json.load(f)


def _defaults_from(template: Dict[str, Any]) -> Dict[str, Any]:
    llm = template["llm"]
    validation = template["validation"]
    confidence = template["confidence"]
    return {
        "provider": llm["provider"],
        "tier": llm.get("tier") or models.DEFAULT_TIER,
        "model": models.pinned_model(template) or "",
        "enrichment": template["enrichment"]["enabled"],
        "epo": template["epo"]["enabled"],
        "validator": validation["validator_enabled"],
        "batch": template["batch"]["enabled"],
        "validatorThreshold": validation["validator_threshold"],
        "overrideMinConfidence": validation["override_min_confidence"],
        "epoAdjustMax": confidence["epo_adjust_max"],
        "lowEvidenceCap": confidence["low_evidence_cap"],
        "maxWebSearches": validation["max_web_searches"],
        "enrichmentMaxSearches": template["enrichment"]["max_searches"],
        "mapping": {},
    }


DEFAULT_SETTINGS: Dict[str, Any] = _defaults_from(_load_template())


def _clamp(value: Any, default: int, low: int, high: int) -> int:
    """value clamped to [low, high]; the default when value is not a number."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return default
    if isinstance(value, float):
        if not math.isfinite(value):
            return default
        value = round(value)
    return max(low, min(high, int(value)))


def clean_settings(raw: Dict[str, Any]) -> Dict[str, Any]:
    """
    Settings from the browser, completed and made safe.

    Missing keys come from DEFAULT_SETTINGS, numbers are clamped to their
    bounds (a non-number falls back to the default) and model is trimmed.

    Raises:
        ValueError: unknown provider or tier.
    """
    raw = raw if isinstance(raw, dict) else {}
    settings = copy.deepcopy(DEFAULT_SETTINGS)

    # A non-string (list, dict, number, explicit None) is unknown too; checking
    # the type first keeps an unhashable value from raising TypeError.
    provider = raw.get("provider", settings["provider"])
    if not isinstance(provider, str) or provider not in _PROVIDERS:
        raise ValueError(f"Unknown provider: {provider!r}")
    tier = raw.get("tier", settings["tier"])
    if not isinstance(tier, str) or tier not in models.TIERS:
        raise ValueError(f"Unknown tier: {tier!r}")
    settings["provider"] = provider
    settings["tier"] = tier

    model = raw.get("model", settings["model"])
    settings["model"] = model.strip() if isinstance(model, str) else ""

    for flag in _FLAGS:
        if isinstance(raw.get(flag), bool):
            settings[flag] = raw[flag]

    for key, (low, high) in _BOUNDS.items():
        settings[key] = _clamp(raw.get(key), DEFAULT_SETTINGS[key], low, high)

    mapping = raw.get("mapping")
    if isinstance(mapping, dict):
        settings["mapping"] = {
            col: mapping[col].strip()
            for col in _COLUMNS
            if isinstance(mapping.get(col), str) and mapping[col].strip()
        }
    return settings


def to_pipeline_config(settings: Dict[str, Any], base: Dict[str, Any], project_root: Path) -> Dict[str, Any]:
    """
    The pipeline config for a run: a deep copy of base with the settings applied.

    Args:
        settings: Output of clean_settings.
        base: The loaded config.json (or the template when there is none).
            Not modified.
        project_root: Directory a relative epo.epo_package_dir is resolved against.
    """
    config = copy.deepcopy(base)

    llm = config.setdefault("llm", {})
    llm["provider"] = settings["provider"]
    llm["tier"] = settings["tier"]
    llm["model"] = settings["model"].strip() or None

    enrichment = config.setdefault("enrichment", {})
    enrichment["enabled"] = settings["enrichment"]
    enrichment["max_searches"] = settings["enrichmentMaxSearches"]

    epo = config.setdefault("epo", {})
    epo["enabled"] = settings["epo"]
    epo_dir = Path(epo.get("epo_package_dir") or "./lib/epo_patent")
    if not epo_dir.is_absolute():
        epo_dir = (Path(project_root) / epo_dir).resolve()
    epo["epo_package_dir"] = str(epo_dir)

    validation = config.setdefault("validation", {})
    validation["validator_enabled"] = settings["validator"]
    validation["validator_threshold"] = settings["validatorThreshold"]
    validation["override_min_confidence"] = settings["overrideMinConfidence"]
    validation["max_web_searches"] = settings["maxWebSearches"]

    confidence = config.setdefault("confidence", {})
    confidence["epo_adjust_max"] = settings["epoAdjustMax"]
    confidence["low_evidence_cap"] = settings["lowEvidenceCap"]

    config.setdefault("batch", {})["enabled"] = settings["batch"]

    pipeline = config.setdefault("pipeline", {})
    mapping = settings.get("mapping") or {}
    for col in _COLUMNS:
        # An unmapped column is "": the reader finds no such header and yields "".
        pipeline[f"{col}_column"] = mapping.get(col, "")

    return config


def setup_info(env: Mapping[str, str]) -> Dict[str, Any]:
    """
    What the browser needs to show the settings form.

    Reports whether each API key is set, never its value.
    """
    providers = [
        {
            "id": pid,
            "label": label,
            "keyVar": key_var,
            "keySet": bool(env.get(key_var)),
            "batch": pid in _BATCH_PROVIDERS,
            "tiers": {tier: models.CANDIDATES[pid][tier][0] for tier in models.TIERS},
        }
        for pid, (label, key_var) in _PROVIDERS.items()
    ]
    return {
        "providers": providers,
        "epoKeysSet": bool(env.get("EPO_KEY")) and bool(env.get("EPO_SECRET")),
        "defaults": copy.deepcopy(DEFAULT_SETTINGS),
        "pricedModels": sorted(models.COST_RATES),
    }
