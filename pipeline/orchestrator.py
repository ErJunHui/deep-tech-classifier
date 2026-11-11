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
from pipeline.llm_provider import build_provider, get_cost_rates, BATCH_DISCOUNT
from agents.classifier_agent import classify as agent1_classify, build_batch_request
from agents.validator_agent import validate as agent2_validate
from agents.enrichment_agent import enrich as agent0_enrich
from data.writer import write_incremental

logger = logging.getLogger(__name__)

RUN_STATE_FILE = "checkpoints/run_state.json"


class ResumeError(Exception):
    """Checkpoint data does not match the input file being resumed."""


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

    if batch_enabled:
        return _run_pipeline_batch(companies, config, output_path, resume_run_id)
    else:
        return _run_pipeline_sequential(companies, config, output_path, resume_run_id)


# ---------------------------------------------------------------------------
# Batch pipeline (4-phase)
# ---------------------------------------------------------------------------

def _run_pipeline_batch(
    companies: List[Dict[str, Any]],
    config: Dict[str, Any],
    output_path: str,
    resume_run_id: Optional[str],
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
    model = llm_cfg.get("model", "claude-haiku-4-5-20251001")
    max_tokens = llm_cfg.get("max_tokens_classifier", 2000)
    temperature = llm_cfg.get("temperature", 0.1)

    epo_key = os.getenv("EPO_KEY")
    epo_secret = os.getenv("EPO_SECRET")

    provider = build_provider(config)
    if not provider.supports_batching:
        logger.warning(
            f"Provider '{provider.provider_name}' does not support batching. "
            "Falling back to sequential pipeline."
        )
        return _run_pipeline_sequential(companies, config, output_path, resume_run_id)
    _rates = get_cost_rates(provider.model_name)

    # Load or create run state
    run_state = None
    if resume_run_id:
        run_state = load_run_state()
        if run_state is None or run_state.get("run_id") != resume_run_id:
            logger.warning(f"run_state.json mismatch. Creating fresh state for {resume_run_id}.")
            run_state = None

    if run_state is None:
        run_id = resume_run_id or _generate_run_id()
        run_state = {
            "run_id": run_id,
            "created_at": datetime.now().isoformat(),
            "batch_id": None,
            "batch_phase": "pending",
            "batch_results_path": None,
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
        if batch_phase == "submitted" and run_state.get("batch_id"):
            logger.info(f"=== Phase 2: Resuming poll for batch {run_state['batch_id']} ===")
            batch_id = run_state["batch_id"]
        else:
            logger.info("=== Phase 2: Submitting Agent 1 batch ===")
            batch_requests = [
                build_batch_request(
                    custom_id=str(i),
                    company_data={**cd, "model": model, "max_tokens": max_tokens, "temperature": temperature},
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

        # Poll
        _raw = provider.raw_client
        while True:
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
            result = _phase4_process_one(
                cd=cd,
                agent1=agent1_outputs.get(str(i)),
                config=config,
                validator_enabled=validator_enabled,
                validator_threshold=validator_threshold,
                provider=provider,
                rates=_rates,
            )
        except Exception as exc:
            logger.error(f"Unhandled error in Phase 4 for '{name}': {exc}", exc_info=True)
            result = _error_result(name)

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

def _phase1_gather(
    companies, config, epo_enabled, epo_package_dir, epo_key, epo_secret,
    enrichment_enabled, provider, gathered, gathered_path,
) -> List[Dict[str, Any]]:
    """
    Run Agent 0 + EPO for every company not yet in `gathered`.

    Each company is appended to gathered_path as soon as it is done, so an
    interrupted run resumes from the next company instead of starting over.
    Returns the full list of company_data dicts (existing + new).
    """
    total = len(companies)
    result = list(gathered)

    for i, company in enumerate(companies):
        if i < len(result):
            continue
        name = company["company_name"]
        uen = company.get("uen", "")
        domain = company.get("domain", "")
        dataset_description = company.get("description", "")
        location = company.get("location", "")
        funding_rounds = company.get("funding_rounds", "")
        funding_amount = company.get("funding_amount", "")

        logger.info(f"[{i+1}/{total}] Phase 1: {name}")

        # Agent 0 — enrichment
        if enrichment_enabled:
            enrich_result = agent0_enrich(
                company_name=name, uen=uen, domain=domain, location=location,
                config=config, provider=provider,
            )
        else:
            enrich_result = {
                "web_description": None, "web_description_source": None,
                "web_fetch_status": "not_found",
                "enrichment_input_tokens": 0, "enrichment_output_tokens": 0,
            }

        if enrich_result["web_description"]:
            resolved_description = enrich_result["web_description"]
            web_sourced = True
        else:
            resolved_description = dataset_description
            web_sourced = False

        # EPO lookup
        if epo_enabled and epo_key and epo_secret:
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
            "funding_rounds": funding_rounds,
            "funding_amount": funding_amount,
            "web_sourced": web_sourced,
            "web_description": enrich_result.get("web_description"),
            "web_description_source": enrich_result.get("web_description_source"),
            "web_fetch_status": enrich_result.get("web_fetch_status", "not_found"),
            "enrichment_input_tokens": enrich_result.get("enrichment_input_tokens", 0),
            "enrichment_output_tokens": enrich_result.get("enrichment_output_tokens", 0),
            "enrichment_searches": enrich_result.get("enrichment_searches", 0),
            "epo": asdict(epo_result),
        }
        # Round-trip through JSON so fresh and resumed runs see identical data.
        record = json.loads(json.dumps(record, default=str))
        _append_jsonl(record, gathered_path)
        result.append(record)

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
    llm_cfg = config.get("llm", {})
    model = llm_cfg.get("model", "claude-haiku-4-5-20251001")
    max_tokens = llm_cfg.get("max_tokens_classifier", 2000)
    temperature = llm_cfg.get("temperature", 0.1)

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
                parsed = _parse_json(text)
                _validate_classification_result(parsed)
                # Extract usage from batch result
                usage = message.get("usage", {})
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
        from pipeline.epo_bridge import EPOResult as _EPOResult
        epo = _EPOResult(**cd["epo"])
        agent1_result = agent1_classify(
            company_name=cd["company_name"],
            uen=cd.get("uen"),
            domain=cd.get("domain"),
            description=cd.get("resolved_description"),
            location=cd.get("location"),
            funding_rounds=cd.get("funding_rounds"),
            funding_amount=cd.get("funding_amount"),
            epo_result=epo,
            config=config,
            provider=provider,
            web_sourced=cd.get("web_sourced", False),
        )
        agent1_outputs[custom_id] = agent1_result
        logger.info(f"Online retry succeeded for custom_id={custom_id} ({cd['company_name']})")

    return agent1_outputs


def _phase4_process_one(
    cd: Dict[str, Any],
    agent1: Optional[Dict[str, Any]],
    config: Dict[str, Any],
    validator_enabled: bool,
    validator_threshold: int,
    provider,
    rates: Dict[str, float],
) -> Dict[str, Any]:
    """Run confidence + Agent 2 for one company using pre-computed agent1 result."""
    from pipeline.epo_bridge import EPOResult as _EPOResult

    name = cd["company_name"]
    domain = cd.get("domain", "")
    resolved_description = cd.get("resolved_description", "")
    epo = _EPOResult(**cd["epo"])

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
    }


# ---------------------------------------------------------------------------
# Sequential pipeline (original flow, batch_enabled=false)
# ---------------------------------------------------------------------------

def _run_pipeline_sequential(
    companies: List[Dict[str, Any]],
    config: Dict[str, Any],
    output_path: str,
    resume_run_id: Optional[str],
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

    provider = build_provider(config)
    _rates = get_cost_rates(provider.model_name)

    run_id = resume_run_id or _generate_run_id()
    done: Dict[int, Dict[str, Any]] = {}

    if resume_run_id:
        done = _load_llm_checkpoint(resume_run_id, companies)
        logger.info(f"Resuming sequential run {resume_run_id}: {len(done)} done.")
    else:
        run_state = {
            "run_id": run_id,
            "created_at": datetime.now().isoformat(),
            "batch_id": None,
            "batch_phase": "complete",  # sequential runs skip batch phases
            "batch_results_path": None,
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
            )
            result["processing_errors"] = ""
        except Exception as exc:
            logger.error(f"Unhandled error processing '{name}': {exc}", exc_info=True)
            result = _error_result(name)

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
) -> Dict[str, Any]:
    name = company["company_name"]
    uen = company.get("uen", "")
    domain = company.get("domain", "")
    dataset_description = company.get("description", "")
    location = company.get("location", "")
    funding_rounds = company.get("funding_rounds", "")
    funding_amount = company.get("funding_amount", "")

    if enrichment_enabled:
        enrich_result = agent0_enrich(
            company_name=name, uen=uen, domain=domain, location=location,
            config=config, provider=provider,
        )
    else:
        enrich_result = {
            "web_description": None, "web_description_source": None,
            "web_fetch_status": "not_found",
            "enrichment_input_tokens": 0, "enrichment_output_tokens": 0,
        }

    if enrich_result["web_description"]:
        resolved_description = enrich_result["web_description"]
        web_sourced = True
    else:
        resolved_description = dataset_description
        web_sourced = False

    if epo_enabled and epo_key and epo_secret:
        epo_result = run_epo_lookup(
            name, epo_key, epo_secret, epo_package_dir,
            description=resolved_description, domain=domain,
        )
    else:
        epo_result = EPOResult(raw_status="EPO Disabled")

    agent1 = agent1_classify(
        company_name=name, uen=uen, domain=domain,
        description=resolved_description, location=location,
        funding_rounds=funding_rounds, funding_amount=funding_amount,
        epo_result=epo_result, config=config,
        provider=provider, web_sourced=web_sourced,
    )

    has_description = bool(
        resolved_description and str(resolved_description).strip() not in ("nan", "None", "")
    )
    classification = agent1.get("classification", "error")
    scores = compute_final_confidence(
        classification=classification,
        patent_count=epo_result.patent_count,
        epo_deeptech_level=epo_result.epo_deeptech_level,
        llm_confidence=agent1.get("confidence", 0),
        has_description=has_description,
        config=config,
    )

    validator_triggered = False
    agent2: Optional[Dict[str, Any]] = None

    if validator_enabled and scores["final_confidence"] < validator_threshold:
        validator_triggered = True
        agent2 = agent2_validate(
            company_name=name, domain=domain, description=resolved_description,
            agent1_result=agent1, epo_patent_count=epo_result.patent_count,
            config=config, provider=provider,
            web_description_source=enrich_result.get("web_description_source"),
            web_fetch_status=enrich_result.get("web_fetch_status", "not_found"),
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
    enrichment_input_tokens = enrich_result.get("enrichment_input_tokens", 0)
    enrichment_output_tokens = enrich_result.get("enrichment_output_tokens", 0)
    enrichment_searches = enrich_result.get("enrichment_searches", 0)

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

    agent2_flags = agent2.get("flags", []) if agent2 else []
    classifier_flags = agent1.get("classifier_flags", [])
    merged_flags = list({*classifier_flags, *agent2_flags})

    return {
        "classification": classification,
        "confidence": confidence,
        "reasoning": agent1.get("reasoning", ""),
        "web_description": enrich_result.get("web_description"),
        "web_description_source": enrich_result.get("web_description_source"),
        "web_fetch_status": enrich_result.get("web_fetch_status", "error"),
        "patent_count": epo_result.patent_count,
        "epo_is_deeptech": epo_result.epo_is_deeptech,
        "epo_deeptech_level": epo_result.epo_deeptech_level,
        "epo_primary_domain": epo_result.epo_primary_domain,
        "cpc_codes": epo_result.cpc_codes,
        "epo_validation_status": epo_result.validation_status,
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
    }


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


def _parse_json(raw_text: str) -> Dict[str, Any]:
    text = raw_text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    return json.loads(text)


def _validate_classification_result(result: Dict[str, Any]) -> None:
    if result.get("classification") not in ("deep tech", "general tech"):
        raise ValueError(f"classification must be 'deep tech' or 'general tech', got: {result.get('classification')!r}")
    if not isinstance(result.get("confidence"), (int, float)):
        raise ValueError("confidence must be a number")
    result["confidence"] = int(result["confidence"])


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
    total_cost = sum(r.get("total_cost_usd", 0.0) for r in results)
    logger.info("=== Run Summary ===")
    logger.info(f"Companies processed:        {len(results)}")
    logger.info(f"Total input tokens:         {total_in}")
    logger.info(f"Total output tokens:        {total_out}")
    logger.info(f"Cache read tokens:          {total_cache_read}")
    logger.info(f"Cache creation tokens:      {total_cache_creation}")
    logger.info(f"Estimated cost:             ${total_cost:.4f}")


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
    }
