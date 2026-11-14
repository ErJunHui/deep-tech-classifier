"""
Per-company orchestration loop.

Batch flow (batch_enabled=true, default):
  Phase 1: Agent 0 (enrichment) + EPO lookup for all companies → gathered.jsonl
  Phase 2: Agent 1 batch submit + poll → batch_results.jsonl
  Phase 3: Parse batch results; online retry for failures
  Phase 4: Confidence + Agent 2 (validate) per company → write checkpoints

Sequential fallback (batch_enabled=false):
  Original per-company flow unchanged.
"""

import json
import logging
import os
import time
import uuid
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional

from pipeline.epo_bridge import run_epo_lookup, EPOResult
from pipeline.confidence import compute_final_confidence, apply_validator
from pipeline.json_utils import parse_json
from pipeline import models, progress, validation_record
from pipeline.llm_provider import build_provider, get_cost_rates, cost_known, BATCH_DISCOUNT
from pipeline.model_resolver import ModelSetupError
from agents.classifier_agent import (
    classify as agent1_classify,
    build_batch_request,
    validate_classification_result,
)
from agents.validator_agent import validate as agent2_validate
from agents.enrichment_agent import enrich as agent0_enrich
from data.writer import write_incremental

logger = logging.getLogger(__name__)

RUN_STATE_FILE = "checkpoints/run_state.json"


class ResumeError(Exception):
    """Checkpoint data does not match the input file or config being resumed."""


class ModelChangedError(ModelSetupError):
    """The API answered with a different model than the one this run started with."""


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def run_pipeline(
    companies: List[Dict[str, Any]],
    config: Dict[str, Any],
    output_path: str,
    resume_run_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    batch_cfg = config.get("batch", {})
    batch_enabled = batch_cfg.get("enabled", True)

    # The model is chosen once, here, before any company is processed. A
    # resumed run reuses the model recorded in its run state.
    run_state = _load_matching_run_state(resume_run_id)
    provider = _start_provider(config, run_state)
    model_info = _model_info(provider, run_state)
    _warn_if_unvalidated(model_info)
    if run_state is not None:
        run_state["model"] = model_info
        _save_run_state(run_state)

    if batch_enabled and provider.supports_batching:
        return _run_pipeline_batch(
            companies, config, output_path, resume_run_id, provider, run_state, model_info)
    if batch_enabled:
        logger.warning(
            f"Provider '{provider.provider_name}' does not support batching. "
            "Falling back to sequential pipeline."
        )
    return _run_pipeline_sequential(
        companies, config, output_path, resume_run_id, provider, run_state, model_info)


# ---------------------------------------------------------------------------
# Model selection and locking
# ---------------------------------------------------------------------------

def _load_matching_run_state(resume_run_id: Optional[str]) -> Optional[Dict[str, Any]]:
    if not resume_run_id:
        return None
    run_state = load_run_state()
    if run_state is None or run_state.get("run_id") != resume_run_id:
        logger.warning(f"run_state.json mismatch. Creating fresh state for {resume_run_id}.")
        return None
    return run_state


def _start_provider(config: Dict[str, Any], run_state: Optional[Dict[str, Any]]):
    """Build the provider with the run's model and check that the model answers."""
    llm_cfg = config.get("llm", {})
    locked = (run_state or {}).get("model") or {}

    if locked:
        provider_name = llm_cfg.get("provider", "anthropic")
        if locked.get("provider") != provider_name:
            raise ResumeError(
                f"this run was started with provider '{locked.get('provider')}', but the "
                f"config now says '{provider_name}'. Restore the provider to resume, "
                "or start a fresh run without --resume."
            )
        pinned = models.pinned_model(config)
        if pinned and pinned != locked.get("requested"):
            raise ResumeError(
                f"this run was started with model '{locked.get('requested')}', but the "
                f"config now pins '{pinned}'. Mixing models in one output is not allowed. "
                f"Set llm.model back to '{locked.get('requested')}' (or remove it) to resume, "
                "or start a fresh run without --resume."
            )

    provider = build_provider(
        config, model=locked.get("requested"), search_model=locked.get("search_model"))

    try:
        reported = provider.smoke_test(llm_cfg.get("temperature", 0.1))
    except Exception as e:
        raise ModelSetupError(
            f"model '{provider.model_name}' failed its startup check: {e}"
        ) from e

    expected = locked.get("reported")
    if expected and reported and reported != expected:
        raise ModelChangedError(
            f"this run was started with model '{expected}', but '{provider.model_name}' "
            f"now answers as '{reported}'. Resuming would mix two models in one output. "
            f"Set llm.model to '{expected}' if it is still available, "
            "or start a fresh run without --resume."
        )
    return provider


def _model_info(provider, run_state: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """What the run state and the output record about the run's model."""
    locked = (run_state or {}).get("model") or {}
    reported = getattr(provider, "reported_model", None)
    if locked:
        return {**locked, "reported": locked.get("reported") or reported}
    resolution = getattr(provider, "resolution", None)
    return {
        "provider": provider.provider_name,
        "requested": provider.model_name,
        "reported": reported,
        "search_model": getattr(provider, "search_model_name", None),
        "source": getattr(resolution, "source", "pinned"),
        "tier": getattr(resolution, "tier", None),
    }


def _warn_if_unvalidated(model_info: Dict[str, Any]) -> None:
    """Warn when the run's model is not the one that last passed the reference check."""
    warning = validation_record.warning_for(
        model_info.get("provider"), model_info.get("reported") or model_info.get("requested"))
    if warning:
        logger.warning(warning)


def _check_model_drift(provider) -> None:
    """Stop the run if a response came from a different model than the first one."""
    drift = getattr(provider, "model_drift", None)
    if drift:
        raise ModelChangedError(
            f"the API began answering as '{drift[1]}' after this run started with "
            f"'{drift[0]}'. The run has stopped so the output does not mix two models; "
            "companies finished so far are checkpointed. Set llm.model to a fixed "
            "version and start a fresh run."
        )


def _rates_for(provider) -> Dict[str, float]:
    """Price by the configured model; for an unlisted alias, by the version the API reported."""
    name = provider.model_name
    if not models.has_profile(name):
        name = getattr(provider, "reported_model", None) or name
    return get_cost_rates(name)


# ---------------------------------------------------------------------------
# Batch pipeline (4-phase)
# ---------------------------------------------------------------------------

def _run_pipeline_batch(
    companies: List[Dict[str, Any]],
    config: Dict[str, Any],
    output_path: str,
    resume_run_id: Optional[str],
    provider,
    run_state: Optional[Dict[str, Any]],
    model_info: Dict[str, Any],
) -> List[Dict[str, Any]]:
    pipeline_cfg = config.get("pipeline", {})
    val_cfg = config.get("validation", {})
    epo_cfg = config.get("epo", {})
    batch_cfg = config.get("batch", {})

    checkpoint_interval = pipeline_cfg.get("checkpoint_interval", 10)
    validator_threshold = val_cfg.get("validator_threshold", 70)
    validator_enabled = val_cfg.get("validator_enabled", True)
    epo_enabled = epo_cfg.get("enabled", True)
    epo_package_dir = epo_cfg.get("epo_package_dir", "")
    batch_poll_interval = batch_cfg.get("batch_poll_interval_s", 30)

    enrichment_cfg = config.get("enrichment", {})
    enrichment_enabled = enrichment_cfg.get("enabled", True)

    llm_cfg = config.get("llm", {})
    max_tokens = llm_cfg.get("max_tokens_classifier", 2000)
    temperature = llm_cfg.get("temperature", 0.1)

    epo_key = os.getenv("EPO_KEY")
    epo_secret = os.getenv("EPO_SECRET")

    _rates = _rates_for(provider)

    if run_state is None:
        run_id = resume_run_id or _generate_run_id()
        run_state = {
            "run_id": run_id,
            "created_at": datetime.now().isoformat(),
            "batch_id": None,
            "batch_phase": "pending",
            "batch_results_path": None,
            "model": model_info,
        }
        _save_run_state(run_state)
    else:
        run_id = run_state["run_id"]

    gathered_path = f"checkpoints/llm/gathered_{run_id}.jsonl"
    batch_results_path = f"checkpoints/llm/batch_{run_id}_results.jsonl"
    run_state.setdefault("batch_results_path", batch_results_path)

    # ------------------------------------------------------------------
    # Phase 1: Data gathering (enrichment + EPO)
    # ------------------------------------------------------------------
    company_data_list = _load_jsonl(gathered_path) if Path(gathered_path).exists() else []
    _check_alignment(
        {i: cd.get("company_name") for i, cd in enumerate(company_data_list)},
        companies, gathered_path,
    )
    if len(company_data_list) < len(companies):
        logger.info(
            f"=== Phase 1: Data Gathering (enrichment + EPO) — "
            f"{len(company_data_list)}/{len(companies)} already gathered ==="
        )
        company_data_list = _phase1_gather(
            companies=companies,
            config=config,
            epo_enabled=epo_enabled,
            epo_package_dir=epo_package_dir,
            epo_key=epo_key,
            epo_secret=epo_secret,
            enrichment_enabled=enrichment_enabled,
            provider=provider,
            gathered=company_data_list,
            gathered_path=gathered_path,
        )
        logger.info(f"Phase 1 complete. Gathered {len(company_data_list)} companies → {gathered_path}")
    else:
        logger.info(f"Phase 1: Loaded {len(company_data_list)} companies from {gathered_path}")

    # ------------------------------------------------------------------
    # Phase 2: Agent 1 batch submission + polling
    # ------------------------------------------------------------------
    batch_phase = run_state.get("batch_phase", "pending")

    if not _batch_results_ready(run_state, batch_results_path):
        batch_phase_text = (
            f"Classify in one batch job · {len(company_data_list)} companies submitted"
        )
        if batch_phase == "submitted" and run_state.get("batch_id"):
            logger.info(f"=== Phase 2: Resuming poll for batch {run_state['batch_id']} ===")
            batch_id = run_state["batch_id"]
        else:
            logger.info("=== Phase 2: Submitting Agent 1 batch ===")
            batch_requests = [
                build_batch_request(
                    custom_id=str(i),
                    company_data={**cd, "model": provider.model_name, "max_tokens": max_tokens, "temperature": temperature},
                )
                for i, cd in enumerate(company_data_list)
            ]
            _raw = provider.raw_client
            batch = _raw.beta.messages.batches.create(requests=batch_requests)
            batch_id = batch.id
            run_state["batch_id"] = batch_id
            run_state["batch_phase"] = "submitted"
            run_state["batch_results_path"] = batch_results_path
            _save_run_state(run_state)
            logger.info(f"Batch submitted: {batch_id} ({len(batch_requests)} requests)")
            progress.emit("phase", phase=batch_phase_text)
            for i in range(len(company_data_list)):
                progress.emit("step", index=i, step="In batch job")

        # Poll
        _raw = provider.raw_client
        while True:
            progress.emit("phase", phase=batch_phase_text)
            status = _raw.beta.messages.batches.retrieve(batch_id)
            logger.info(
                f"Batch {batch_id}: {status.processing_status} "
                f"(req_counts={status.request_counts})"
            )
            if status.processing_status == "ended":
                break
            time.sleep(batch_poll_interval)

        # Save results
        results_iter = _raw.beta.messages.batches.results(batch_id)
        results_list = [r.model_dump() for r in results_iter]
        _save_jsonl(results_list, batch_results_path)
        run_state["batch_phase"] = "results_saved"
        run_state["batch_results_path"] = batch_results_path
        _save_run_state(run_state)
        logger.info(f"Phase 2 complete. Results → {batch_results_path}")
    else:
        logger.info(f"Phase 2: Skipped (phase={batch_phase}, results exist)")

    # ------------------------------------------------------------------
    # Phase 3: Parse batch results; online retry for failures
    # ------------------------------------------------------------------
    logger.info("=== Phase 3: Parse batch results ===")
    batch_results_raw = _load_jsonl(batch_results_path)
    agent1_outputs = _phase3_parse(
        batch_results_raw=batch_results_raw,
        company_data_list=company_data_list,
        config=config,
        provider=provider,
        rates=_rates,
    )
    _check_model_drift(provider)
    logger.info(f"Phase 3 complete. {len(agent1_outputs)} Agent 1 results ready.")

    # ------------------------------------------------------------------
    # Phase 4: Confidence + Agent 2 + checkpointing
    # ------------------------------------------------------------------
    logger.info("=== Phase 4: Agent 2 validation + checkpointing ===")

    # Load any existing Phase 4 checkpoint (resume support within Phase 4)
    done = _load_llm_checkpoint(run_id, companies)
    if done:
        logger.info(f"Phase 4 resume: {len(done)} companies already checkpointed.")
    total = len(company_data_list)

    for i, cd in enumerate(company_data_list):
        name = cd["company_name"]

        if i in done:
            logger.info(f"[{i+1}/{total}] Skipping (done): {name}")
            continue

        logger.info(f"[{i+1}/{total}] Phase 4: {name}")
        t_start = time.time()

        try:
            result = _finalize_one(
                cd=cd,
                agent1=agent1_outputs.get(str(i)),
                config=config,
                validator_enabled=validator_enabled,
                validator_threshold=validator_threshold,
                provider=provider,
                rates=_rates,
                index=i,
            )
        except Exception as exc:
            logger.error(f"Unhandled error in Phase 4 for '{name}': {exc}", exc_info=True)
            result = _error_result(name)
        _check_model_drift(provider)

        t_end = time.time()
        result["processing_time_s"] = round(t_end - t_start, 2)
        result["company_name"] = name

        done[i] = result
        _append_llm_checkpoint(run_id, i, result)

        if (i + 1) % checkpoint_interval == 0 or (i + 1) == total:
            _write_excel_checkpoint(output_path, companies, done)
            logger.info(f"Excel checkpoint written at {i+1}/{total}")

    run_state["batch_phase"] = "complete"
    _save_run_state(run_state)

    results = [done[i] for i in range(total)]
    _log_run_summary(results)
    return results


# ---------------------------------------------------------------------------
# Phase helpers
# ---------------------------------------------------------------------------

def _gather_one(
    company: Dict[str, Any],
    config: Dict[str, Any],
    epo_enabled: bool,
    epo_package_dir: str,
    epo_key: Optional[str],
    epo_secret: Optional[str],
    enrichment_enabled: bool,
    provider,
    index: Optional[int] = None,
) -> Dict[str, Any]:
    """Run Agent 0 (web enrichment) + EPO lookup for one company → company_data dict."""
    name = company["company_name"]
    uen = company.get("uen", "")
    domain = company.get("domain", "")
    dataset_description = company.get("description", "")
    location = company.get("location", "")

    if enrichment_enabled:
        progress.emit("step", index=index, step="Enrichment")
        enrich_result = agent0_enrich(
            company_name=name, uen=uen, domain=domain, location=location,
            config=config, provider=provider,
        )
    else:
        enrich_result = {"web_description": None, "web_fetch_status": "not_found"}

    web_description = enrich_result.get("web_description")
    resolved_description = web_description or dataset_description

    if epo_enabled and epo_key and epo_secret:
        progress.emit("step", index=index, step="Patent lookup")
        epo_result = run_epo_lookup(
            name, epo_key, epo_secret, epo_package_dir,
            description=resolved_description, domain=domain,
        )
    else:
        epo_result = EPOResult(raw_status="EPO Disabled")

    record = {
        "company_name": name,
        "uen": uen,
        "domain": domain,
        "dataset_description": dataset_description,
        "resolved_description": resolved_description,
        "location": location,
        "funding_rounds": company.get("funding_rounds", ""),
        "funding_amount": company.get("funding_amount", ""),
        "web_sourced": bool(web_description),
        "web_description": web_description,
        "web_description_source": enrich_result.get("web_description_source"),
        "web_fetch_status": enrich_result.get("web_fetch_status", "not_found"),
        "enrichment_input_tokens": enrich_result.get("enrichment_input_tokens", 0),
        "enrichment_output_tokens": enrich_result.get("enrichment_output_tokens", 0),
        "enrichment_searches": enrich_result.get("enrichment_searches", 0),
        "epo": asdict(epo_result),
    }
    # Round-trip through JSON so fresh and resumed runs see identical data.
    return json.loads(json.dumps(record, default=str))


def _classify_online(cd: Dict[str, Any], config: Dict[str, Any], provider) -> Dict[str, Any]:
    """Run Agent 1 for one gathered company with a direct (non-batch) call."""
    return agent1_classify(
        company_name=cd["company_name"],
        uen=cd.get("uen"),
        domain=cd.get("domain"),
        description=cd.get("resolved_description"),
        location=cd.get("location"),
        funding_rounds=cd.get("funding_rounds"),
        funding_amount=cd.get("funding_amount"),
        epo_result=EPOResult(**cd["epo"]),
        config=config,
        provider=provider,
        web_sourced=cd.get("web_sourced", False),
    )


def _phase1_gather(
    companies, gathered, gathered_path, **gather_kwargs,
) -> List[Dict[str, Any]]:
    """
    Gather every company not yet in `gathered`.

    Each company is appended to gathered_path as soon as it is done, so an
    interrupted run resumes from the next company instead of starting over.
    Returns the full list of company_data dicts (existing + new).
    """
    total = len(companies)
    result = list(gathered)

    for i, company in enumerate(companies):
        if i < len(result):
            continue
        logger.info(f"[{i+1}/{total}] Phase 1: {company['company_name']}")
        record = _gather_one(company, index=i, **gather_kwargs)
        _check_model_drift(gather_kwargs.get("provider"))
        _append_jsonl(record, gathered_path)
        result.append(record)
        progress.emit("step", index=i, step="Waiting for batch")

    return result


def _phase3_parse(
    batch_results_raw: List[Dict],
    company_data_list: List[Dict],
    config: Dict[str, Any],
    provider,
    rates: Dict[str, float],
) -> Dict[str, Dict]:
    """
    Parse batch results and online-retry failures.
    Returns dict {custom_id_str: agent1_result_dict}.
    """
    agent1_outputs: Dict[str, Dict] = {}
    retry_online: List[str] = []

    for raw in batch_results_raw:
        custom_id = str(raw.get("custom_id", ""))
        result_block = raw.get("result", {})
        result_type = result_block.get("type", "")

        if result_type == "succeeded":
            message = result_block.get("message", {})
            content = message.get("content", [])
            text = ""
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    text = block.get("text", "")
                    break
                elif hasattr(block, "type") and block.type == "text":
                    text = block.text
                    break
            try:
                parsed = parse_json(text)
                validate_classification_result(parsed)
                # Extract usage from batch result
                usage = message.get("usage", {})
                parsed["model"] = message.get("model") or ""
                if provider is not None and parsed["model"]:
                    provider.note_model(parsed["model"])
                parsed["classifier_input_tokens"] = usage.get("input_tokens", 0)
                parsed["classifier_output_tokens"] = usage.get("output_tokens", 0)
                parsed["classifier_cache_read_tokens"] = usage.get("cache_read_input_tokens", 0)
                parsed["classifier_cache_creation_tokens"] = usage.get("cache_creation_input_tokens", 0)
                parsed["classifier_cost_usd"] = BATCH_DISCOUNT * (
                    parsed["classifier_input_tokens"] * rates["input"]
                    + parsed["classifier_cache_creation_tokens"] * rates["cache_write"]
                    + parsed["classifier_cache_read_tokens"] * rates["cache_read"]
                    + parsed["classifier_output_tokens"] * rates["output"]
                )
                agent1_outputs[custom_id] = parsed
            except (json.JSONDecodeError, KeyError, ValueError) as e:
                logger.warning(f"Batch result parse error for custom_id={custom_id}: {e}. Will retry online.")
                retry_online.append(custom_id)
        else:
            logger.warning(f"Batch result type={result_type} for custom_id={custom_id}. Will retry online.")
            retry_online.append(custom_id)

    # Online retries for failures
    if retry_online:
        logger.info(f"Online retry for {len(retry_online)} failed batch items.")
    for custom_id in retry_online:
        idx = int(custom_id)
        if idx >= len(company_data_list):
            logger.error(f"custom_id={custom_id} out of range ({len(company_data_list)} companies).")
            continue
        cd = company_data_list[idx]
        progress.emit("step", index=idx, step="Classification")
        agent1_result = _classify_online(cd, config, provider)
        agent1_outputs[custom_id] = agent1_result
        outcome = "failed" if agent1_result.get("classification") == "error" else "succeeded"
        logger.info(f"Online retry {outcome} for custom_id={custom_id} ({cd['company_name']})")

    return agent1_outputs


def _finalize_one(
    cd: Dict[str, Any],
    agent1: Optional[Dict[str, Any]],
    config: Dict[str, Any],
    validator_enabled: bool,
    validator_threshold: int,
    provider,
    rates: Dict[str, float],
    index: Optional[int] = None,
) -> Dict[str, Any]:
    """Confidence scoring + Agent 2 for one company, given its Agent 1 result."""
    progress.emit("step", index=index, step="Confidence scoring")

    name = cd["company_name"]
    domain = cd.get("domain", "")
    resolved_description = cd.get("resolved_description", "")
    epo = EPOResult(**cd["epo"])

    # Fallback if agent1 is missing
    if agent1 is None:
        from agents.classifier_agent import _error_result as _cls_err
        agent1 = _cls_err(f"No batch result for {name}")
        agent1["classifier_input_tokens"] = 0
        agent1["classifier_output_tokens"] = 0
        agent1["classifier_cache_read_tokens"] = 0
        agent1["classifier_cache_creation_tokens"] = 0
        agent1["classifier_cost_usd"] = 0.0

    has_description = bool(
        resolved_description and str(resolved_description).strip() not in ("nan", "None", "")
    )
    classification = agent1.get("classification", "error")
    scores = compute_final_confidence(
        classification=classification,
        patent_count=epo.patent_count,
        epo_deeptech_level=epo.epo_deeptech_level,
        llm_confidence=agent1.get("confidence", 0),
        has_description=has_description,
        config=config,
    )

    validator_triggered = False
    agent2: Optional[Dict[str, Any]] = None

    if validator_enabled and scores["final_confidence"] < validator_threshold:
        validator_triggered = True
        progress.emit("step", index=index, step="Validation")
        agent2 = agent2_validate(
            company_name=name,
            domain=domain,
            description=resolved_description,
            agent1_result=agent1,
            epo_patent_count=epo.patent_count,
            config=config,
            provider=provider,
            web_description_source=cd.get("web_description_source"),
            web_fetch_status=cd.get("web_fetch_status", "not_found"),
        )

    outcome = apply_validator(classification, scores, agent2, config)
    classification = outcome["classification"]
    confidence = outcome["confidence"]
    classification_disputed = outcome["classification_disputed"]
    scores = outcome["scores"]

    if agent2 and agent2.get("validator_verdict") == "override":
        logger.info(
            f"Override {'BLOCKED' if classification_disputed else 'accepted'} for '{name}': "
            f"validator confidence={agent2.get('updated_confidence')}, "
            f"pre-validation confidence={scores['final_confidence'] - scores['signal_score_validator']}"
        )

    classifier_input_tokens = agent1.get("classifier_input_tokens", 0)
    classifier_output_tokens = agent1.get("classifier_output_tokens", 0)
    classifier_cache_read_tokens = agent1.get("classifier_cache_read_tokens", 0)
    classifier_cache_creation_tokens = agent1.get("classifier_cache_creation_tokens", 0)
    validator_input_tokens = agent2.get("validator_input_tokens", 0) if agent2 else 0
    validator_output_tokens = agent2.get("validator_output_tokens", 0) if agent2 else 0
    validator_cache_read_tokens = agent2.get("validator_cache_read_tokens", 0) if agent2 else 0
    validator_cache_creation_tokens = agent2.get("validator_cache_creation_tokens", 0) if agent2 else 0
    validator_searches = agent2.get("validator_searches", 0) if agent2 else 0
    enrichment_input_tokens = cd.get("enrichment_input_tokens", 0)
    enrichment_output_tokens = cd.get("enrichment_output_tokens", 0)
    enrichment_searches = cd.get("enrichment_searches", 0)

    classifier_cost = agent1.get("classifier_cost_usd", (
        classifier_input_tokens * rates["input"]
        + classifier_cache_creation_tokens * rates["cache_write"]
        + classifier_cache_read_tokens * rates["cache_read"]
        + classifier_output_tokens * rates["output"]
    ))
    web_search_rate = rates.get("web_search", 0.0)
    total_cost_usd = classifier_cost + (
        validator_input_tokens * rates["input"]
        + validator_cache_creation_tokens * rates["cache_write"]
        + validator_cache_read_tokens * rates["cache_read"]
        + validator_output_tokens * rates["output"]
        + enrichment_input_tokens * rates["input"]
        + enrichment_output_tokens * rates["output"]
        + (validator_searches + enrichment_searches) * web_search_rate
    )

    if not cost_known(rates):
        total_cost_usd = None  # no listed price: shown as unknown, never guessed

    agent2_flags = agent2.get("flags", []) if agent2 else []
    classifier_flags = agent1.get("classifier_flags", [])
    merged_flags = list({*classifier_flags, *agent2_flags})

    return {
        "classification": classification,
        "confidence": confidence,
        "reasoning": agent1.get("reasoning", ""),
        "web_description": cd.get("web_description"),
        "web_description_source": cd.get("web_description_source"),
        "web_fetch_status": cd.get("web_fetch_status", "error"),
        "patent_count": epo.patent_count,
        "epo_is_deeptech": epo.epo_is_deeptech,
        "epo_deeptech_level": epo.epo_deeptech_level,
        "epo_primary_domain": epo.epo_primary_domain,
        "cpc_codes": epo.cpc_codes,
        "epo_validation_status": epo.validation_status,
        "validator_triggered": validator_triggered,
        "validator_verdict": agent2.get("validator_verdict", "") if agent2 else "",
        "validator_updated_confidence": agent2.get("updated_confidence", "") if agent2 else "",
        "web_evidence_summary": agent2.get("web_evidence_summary", "") if agent2 else "",
        "sources_checked": agent2.get("sources_checked", []) if agent2 else [],
        "classification_disputed": classification_disputed,
        "validator_flags": agent2_flags,
        "validation_decision": agent2.get("validation_decision", "") if agent2 else "",
        "escalation_reason": agent2.get("escalation_reason", "") if agent2 else "",
        "checks": agent2.get("checks", {}) if agent2 else {},
        "signal_score_epo": scores["signal_score_epo"],
        "signal_score_llm": scores["signal_score_llm"],
        "signal_score_validator": scores["signal_score_validator"],
        "key_signals": agent1.get("key_signals", {}),
        "classifier_flags": classifier_flags,
        "criteria": agent1.get("criteria", {}),
        "cpc_analysis": agent1.get("cpc_analysis", {}),
        "self_audit": agent1.get("self_audit", {}),
        "classification_basis": agent1.get("classification_basis", ""),
        "flags": merged_flags,
        "classifier_input_tokens": classifier_input_tokens,
        "classifier_output_tokens": classifier_output_tokens,
        "classifier_cache_read_tokens": classifier_cache_read_tokens,
        "classifier_cache_creation_tokens": classifier_cache_creation_tokens,
        "validator_input_tokens": validator_input_tokens,
        "validator_output_tokens": validator_output_tokens,
        "validator_cache_read_tokens": validator_cache_read_tokens,
        "validator_cache_creation_tokens": validator_cache_creation_tokens,
        "enrichment_input_tokens": enrichment_input_tokens,
        "enrichment_output_tokens": enrichment_output_tokens,
        "total_cost_usd": total_cost_usd,
        # The model the API reported for the classifier call.
        "model": (
            agent1.get("model")
            or getattr(provider, "reported_model", None)
            or getattr(provider, "model_name", "")
        ),
    }


# ---------------------------------------------------------------------------
# Sequential pipeline (original flow, batch_enabled=false)
# ---------------------------------------------------------------------------

def _run_pipeline_sequential(
    companies: List[Dict[str, Any]],
    config: Dict[str, Any],
    output_path: str,
    resume_run_id: Optional[str],
    provider,
    run_state: Optional[Dict[str, Any]],
    model_info: Dict[str, Any],
) -> List[Dict[str, Any]]:
    pipeline_cfg = config.get("pipeline", {})
    val_cfg = config.get("validation", {})
    epo_cfg = config.get("epo", {})

    checkpoint_interval = pipeline_cfg.get("checkpoint_interval", 10)
    validator_threshold = val_cfg.get("validator_threshold", 70)
    validator_enabled = val_cfg.get("validator_enabled", True)
    epo_enabled = epo_cfg.get("enabled", True)
    epo_package_dir = epo_cfg.get("epo_package_dir", "")

    enrichment_cfg = config.get("enrichment", {})
    enrichment_enabled = enrichment_cfg.get("enabled", True)

    epo_key = os.getenv("EPO_KEY")
    epo_secret = os.getenv("EPO_SECRET")

    _rates = _rates_for(provider)

    run_id = resume_run_id or _generate_run_id()
    done: Dict[int, Dict[str, Any]] = {}

    if resume_run_id:
        done = _load_llm_checkpoint(resume_run_id, companies)
        logger.info(f"Resuming sequential run {resume_run_id}: {len(done)} done.")
    if run_state is None:
        run_state = {
            "run_id": run_id,
            "created_at": datetime.now().isoformat(),
            "batch_id": None,
            "batch_phase": "complete",  # sequential runs skip batch phases
            "batch_results_path": None,
            "model": model_info,
        }
        _save_run_state(run_state)

    total = len(companies)

    for i, company in enumerate(companies):
        name = company["company_name"]

        if i in done:
            logger.info(f"[{i+1}/{total}] Skipping (already done): {name}")
            continue

        logger.info(f"[{i+1}/{total}] Processing: {name}")
        t_start = time.time()

        try:
            result = _process_one_sequential(
                company=company,
                config=config,
                epo_enabled=epo_enabled,
                epo_package_dir=epo_package_dir,
                epo_key=epo_key,
                epo_secret=epo_secret,
                validator_enabled=validator_enabled,
                validator_threshold=validator_threshold,
                provider=provider,
                rates=_rates,
                enrichment_enabled=enrichment_enabled,
                index=i,
            )
            result["processing_errors"] = ""
        except Exception as exc:
            logger.error(f"Unhandled error processing '{name}': {exc}", exc_info=True)
            result = _error_result(name)
        _check_model_drift(provider)

        t_end = time.time()
        result["processing_time_s"] = round(t_end - t_start, 2)
        result["company_name"] = name

        done[i] = result
        _append_llm_checkpoint(run_id, i, result)

        if (i + 1) % checkpoint_interval == 0 or (i + 1) == total:
            _write_excel_checkpoint(output_path, companies, done)
            logger.info(f"Checkpoint written at company {i+1}/{total}")

    results = [done[i] for i in range(total)]
    _log_run_summary(results)
    return results


def _process_one_sequential(
    company: Dict[str, Any],
    config: Dict[str, Any],
    epo_enabled: bool,
    epo_package_dir: str,
    epo_key: Optional[str],
    epo_secret: Optional[str],
    validator_enabled: bool,
    validator_threshold: int,
    provider,
    rates: Dict[str, float],
    enrichment_enabled: bool = True,
    index: Optional[int] = None,
) -> Dict[str, Any]:
    """Gather → classify → validate for one company, all with direct API calls."""
    cd = _gather_one(
        company,
        config=config,
        epo_enabled=epo_enabled,
        epo_package_dir=epo_package_dir,
        epo_key=epo_key,
        epo_secret=epo_secret,
        enrichment_enabled=enrichment_enabled,
        provider=provider,
        index=index,
    )
    progress.emit("step", index=index, step="Classification")
    agent1 = _classify_online(cd, config, provider)
    return _finalize_one(
        cd=cd,
        agent1=agent1,
        config=config,
        validator_enabled=validator_enabled,
        validator_threshold=validator_threshold,
        provider=provider,
        rates=rates,
        index=index,
    )


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _batch_results_ready(run_state: Dict, batch_results_path: str) -> bool:
    phase = run_state.get("batch_phase", "pending")
    return phase in ("results_saved", "complete") and Path(batch_results_path).exists()


def _save_jsonl(data: List[Any], path: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for item in data:
            f.write(json.dumps(item, default=str) + "\n")


def _append_jsonl(item: Any, path: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(item, default=str) + "\n")
        f.flush()
        os.fsync(f.fileno())


def _load_jsonl(path: str) -> List[Dict]:
    """Load a JSONL file. A torn final line (crash mid-write) is dropped and removed."""
    with open(path, "r", encoding="utf-8") as f:
        lines = [ln for ln in (raw.strip() for raw in f) if ln]
    results = []
    for n, line in enumerate(lines):
        try:
            results.append(json.loads(line))
        except json.JSONDecodeError:
            if n != len(lines) - 1:
                raise
            logger.warning(f"Dropping incomplete last line of {path} (interrupted write).")
            with open(path, "w", encoding="utf-8") as f:
                f.write("".join(ln + "\n" for ln in lines[:-1]))
    return results


def _check_alignment(
    names_by_index: Dict[int, Any],
    companies: List[Dict[str, Any]],
    source: str,
) -> None:
    """Checkpoints are keyed by row position; refuse to resume against a different input."""
    for idx, name in names_by_index.items():
        if idx >= len(companies) or companies[idx]["company_name"] != name:
            expected = companies[idx]["company_name"] if idx < len(companies) else "<no such row>"
            raise ResumeError(
                f"{source} does not match the input file: row {idx + 1} is {expected!r} "
                f"but the checkpoint has {name!r}. Resume with the original input file, "
                "or start a fresh run without --resume."
            )


def _write_excel_checkpoint(
    output_path: str,
    companies: List[Dict[str, Any]],
    done: Dict[int, Dict[str, Any]],
) -> None:
    indices = [i for i in range(len(companies)) if i in done]
    write_incremental(output_path, [companies[i] for i in indices], [done[i] for i in indices])


def _generate_run_id() -> str:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    uid = str(uuid.uuid4())[:8]
    return f"{ts}_{uid}"


def _save_run_state(run_state: Dict[str, Any]) -> None:
    Path(RUN_STATE_FILE).parent.mkdir(parents=True, exist_ok=True)
    with open(RUN_STATE_FILE, "w") as f:
        json.dump(run_state, f, indent=2)


def load_run_state() -> Optional[Dict[str, Any]]:
    if not Path(RUN_STATE_FILE).exists():
        return None
    with open(RUN_STATE_FILE, "r") as f:
        return json.load(f)


def _llm_checkpoint_path(run_id: str) -> str:
    return f"checkpoints/llm/llm_progress_{run_id}.jsonl"


def _append_llm_checkpoint(run_id: str, index: int, result: Dict[str, Any]) -> None:
    """Append one finished company, keyed by its row position in the input."""
    _append_jsonl({"index": index, "result": result}, _llm_checkpoint_path(run_id))


def _load_llm_checkpoint(
    run_id: str,
    companies: List[Dict[str, Any]],
) -> Dict[int, Dict[str, Any]]:
    """
    Load finished results as {row position: result}.

    Rows that ended in an error are left out so that a resume retries them.
    """
    path = _llm_checkpoint_path(run_id)
    if not Path(path).exists():
        if Path(path).with_suffix(".csv").exists():
            logger.warning(
                f"Found an old-format CSV checkpoint for run {run_id}; it cannot be "
                "resumed reliably and is ignored."
            )
        else:
            logger.warning(f"LLM checkpoint not found: {path}")
        return {}

    done: Dict[int, Dict[str, Any]] = {}
    for entry in _load_jsonl(path):
        done[int(entry["index"])] = entry["result"]  # last write wins

    _check_alignment({i: r.get("company_name") for i, r in done.items()}, companies, path)

    errored = [i for i, r in done.items() if r.get("classification") == "error"]
    for i in errored:
        del done[i]
    if errored:
        logger.info(f"{len(errored)} checkpointed companies ended in an error and will be retried.")
    return done


def load_partial_results(companies: List[Dict[str, Any]]):
    """Return (companies, results) finished so far in the current run, in input order."""
    state = load_run_state()
    if not state:
        return [], []
    done = _load_llm_checkpoint(state["run_id"], companies)
    indices = sorted(done)
    return [companies[i] for i in indices], [done[i] for i in indices]


def _log_run_summary(results: List[Dict[str, Any]]) -> None:
    total_in = sum(
        r.get("classifier_input_tokens", 0) + r.get("validator_input_tokens", 0) + r.get("enrichment_input_tokens", 0)
        for r in results
    )
    total_out = sum(
        r.get("classifier_output_tokens", 0) + r.get("validator_output_tokens", 0) + r.get("enrichment_output_tokens", 0)
        for r in results
    )
    total_cache_read = sum(
        r.get("classifier_cache_read_tokens", 0) + r.get("validator_cache_read_tokens", 0)
        for r in results
    )
    total_cache_creation = sum(
        r.get("classifier_cache_creation_tokens", 0) + r.get("validator_cache_creation_tokens", 0)
        for r in results
    )
    costs = [r.get("total_cost_usd", 0.0) for r in results]
    cost_text = (
        "unknown (no price listed for this model; see token counts above)"
        if any(c is None for c in costs) else f"${sum(costs):.4f}"
    )
    logger.info("=== Run Summary ===")
    logger.info(f"Companies processed:        {len(results)}")
    logger.info(f"Total input tokens:         {total_in}")
    logger.info(f"Total output tokens:        {total_out}")
    logger.info(f"Cache read tokens:          {total_cache_read}")
    logger.info(f"Cache creation tokens:      {total_cache_creation}")
    logger.info(f"Estimated cost:             {cost_text}")


def _error_result(company_name: str) -> Dict[str, Any]:
    return {
        "company_name": company_name,
        "classification": "error",
        "confidence": 0,
        "reasoning": "Processing error",
        "web_description": None,
        "web_description_source": None,
        "web_fetch_status": "error",
        "patent_count": 0,
        "epo_is_deeptech": False,
        "epo_deeptech_level": "Not Deep-tech",
        "epo_primary_domain": "N/A",
        "cpc_codes": [],
        "epo_validation_status": "Not Run",
        "validator_triggered": False,
        "validator_verdict": "",
        "validator_updated_confidence": "",
        "web_evidence_summary": "",
        "sources_checked": [],
        "classification_disputed": False,
        "validator_flags": [],
        "signal_score_epo": 0,
        "signal_score_llm": 0,
        "signal_score_validator": 0,
        "processing_time_s": 0,
        "processing_errors": "Unknown error",
        "key_signals": {},
        "classifier_flags": [],
        "criteria": {},
        "cpc_analysis": {},
        "self_audit": {},
        "classification_basis": "",
        "flags": [],
        "validation_decision": "",
        "escalation_reason": "",
        "checks": {},
        "classifier_input_tokens": 0,
        "classifier_output_tokens": 0,
        "classifier_cache_read_tokens": 0,
        "classifier_cache_creation_tokens": 0,
        "validator_input_tokens": 0,
        "validator_output_tokens": 0,
        "validator_cache_read_tokens": 0,
        "validator_cache_creation_tokens": 0,
        "enrichment_input_tokens": 0,
        "enrichment_output_tokens": 0,
        "total_cost_usd": 0.0,
        "model": "",
    }
