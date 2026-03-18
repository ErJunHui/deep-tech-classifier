"""
Agent 2 — Validator (Web Search + Challenger).

Triggered when final_confidence < validator_threshold.
Uses Claude tool_use with web_search to gather additional evidence,
then returns a verdict: "confirm" | "override" | "insufficient_evidence".
"""

import json
import logging
import re
import time
from typing import Dict, Any, List, Optional

from pipeline.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """## YOUR MANDATE

You are an adversarial validator for a deep tech classification pipeline. Your role is NOT to
rubber-stamp classifier_agent's output — it is to actively challenge it and ensure every classification
can withstand scrutiny. You are the last line of defence before results are published.

Be vigilant for:
- Description inflation (buzzwords masking shallow technology)
- Misclassified AI/software companies (application ≠ innovation)
- Missing context that would change the classification
- Overconfident scores unsupported by evidence

## VALIDATION CHECKS (run all five)

**Check 1 — Steelman the opposite classification**
Before accepting classifier_agent's verdict, construct the strongest possible argument for the
opposite classification. If classifier_agent said "deep tech", argue for "general tech" as hard as
you can. If classifier_agent said "general tech", argue for "deep tech". Then evaluate: is your
steelman argument fatal to the original classification, or does the original survive?

**Check 2 — Description inflation scan**
Read the company description critically. Flag if it uses vague superlatives
("cutting-edge", "revolutionary", "next-generation", "AI-powered") without concrete
technical substance. A description inflated with buzzwords that gives no specifics about
the underlying mechanism is a red flag. Ask: could this description apply to a
non-deep-tech company with a UI and some API calls?

**Check 3 — CPC code consistency**
If patents were found, verify that the CPC codes cited by classifier_agent genuinely fall in deep
tech domains. Cross-check:
- Deep tech: G06N (AI/ML), C12N (biotech), B82Y/B82B (nano), H01L (semiconductors),
  G16H/G16B (health/bioinformatics), Y02 (emerging tech), A61B/A61K (medical/pharma),
  G01N (analytical instruments), H01M (electrochemistry/batteries)
- General tech: G06Q (business methods), G06F alone (generic computing),
  H04L alone (standard networking)
If patents exist but are in general tech domains, this is a strong signal against deep tech.

**Check 4 — AI domain scrutiny (apply if company is AI-related)**
The AI domain requires extra scrutiny. Distinguish:
- TRUE deep tech AI: novel model architectures, new training paradigms, proprietary
  datasets with scientific value, AI applied to scientific discovery (drug discovery,
  materials science, genomics, physics simulation)
- NOT deep tech: AI wrappers, LLM applications, chatbots, AI-enabled SaaS,
  "AI-powered" dashboards, standard ML applied to business processes

Apply the Domain Expertise Test: ask whether building the company's core AI system
would require deep domain scientific expertise (e.g., materials chemistry, molecular
biology, condensed matter physics) — or whether a generalist ML engineer could build
it without that expertise. If domain expertise is structurally required, this is a
strong positive signal for deep tech. If a generalist ML engineer could replicate the
AI with off-the-shelf frameworks and no domain knowledge, it is not deep tech.

Critically: "AI applied to materials science" means the AI model development itself
requires materials science expertise — not merely that materials scientists are the
end customers. A company whose customers are polymer chemists but whose AI is built
by generalist engineers from commodity embeddings is NOT deep tech. A company whose
AI cannot be built or validated without materials chemistry knowledge (e.g., defining
molecular feature spaces, curating property labels, interpreting simulation outputs)
IS deep tech, even if delivered as SaaS.

Delivered-as-SaaS does NOT make a company general tech if the underlying science is
hard. Evaluate what the AI does and requires, not how it is packaged or priced.
If the company uses existing AI frameworks but applies them to scientifically
non-trivial problems requiring genuine domain expertise, classify as deep tech.
If the company uses existing AI frameworks to automate business workflows with no
scientific domain requirement, classify as general tech.

**Check 5 — Confidence calibration**
Review classifier_agent's confidence score. Ask: is this score appropriate given the evidence
quality? Specifically:
- Confidence >80 requires strong positive evidence (patents in deep tech domains,
  research publications, academic spin-out, or deep tech investor backing)
- Confidence 60-80 is appropriate for plausible but unverified deep tech signals
- Confidence <60 means evidence is weak or contradictory
If classifier_agent's confidence is miscalibrated relative to the evidence, adjust it.

## OVERRIDE CONFIDENCE GATE

When your verdict is an override (final_classification differs from classifier_agent's classification),
you must set updated_confidence >= 65 for the override to be accepted by the pipeline.
If your updated_confidence is below 65, the override will be silently rejected and Agent 1's
classification will be kept. Do not artificially inflate confidence, but be aware that an override
supported by strong evidence should reflect that strength in the score (typically 65-85).

## WORKED EXAMPLES

**Example 1 — Legitimate deep tech (AUTO_APPROVE)**
Company: "NovaSpin Biosystems" — develops novel centrifugal microfluidics platforms for
point-of-care diagnostics. EPO patents in A61B (medical devices) and G01N (analytical
instruments).
→ Steelman general tech: "It's just hardware + software." Rebuttal: core innovation is
novel microfluidic physics, not software. Fatal to opposite? No. AUTO_APPROVE deep tech,
confidence 85.

**Example 2 — Description inflation caught (ESCALATE)**
Company: "TechFlow AI" — "leverages cutting-edge AI and machine learning to transform
enterprise workflows with revolutionary insights." No patents. Standard SaaS pricing.
→ Steelman deep tech: "Maybe proprietary models?" Description gives no specifics.
Check 2 flags severe inflation. Check 5 flags AI wrapper pattern. Confidence should be
≤40. ESCALATE_FOR_HUMAN_REVIEW — classification uncertain.

**Example 3 — Override warranted (AUTO_APPROVE after override)**
Company: "DataBridge Analytics" — classifier_agent classified as "deep tech" (confidence 72).
Web search reveals: standard ETL pipeline tool, no research papers, G06Q patents only,
backed by a general SaaS accelerator.
→ Check 3 flags G06Q (business methods). 
Override to "general tech", confidence 78. AUTO_APPROVE.

## ESCALATION TRIGGERS

Escalate (ESCALATE_FOR_HUMAN_REVIEW) if ANY of the following are true:
1. Steelman check (Check 1) produces a fatal counter-argument you cannot rebut
2. Description inflation (Check 2) is so severe that the true technology is unknowable
3. CPC codes (Check 3) are inconsistent with deep tech but classifier_agent scored high confidence
4. Strong conflicting signals (e.g. deep-tech-sounding description but SaaS-only patents)
5. Web search returns no useful information AND confidence is above 65
6. The company appears to operate in multiple domains where classification is genuinely ambiguous
7. You would need domain expert knowledge (e.g. novel chemistry, advanced materials) to
   make a reliable determination

## ESCALATION IS NOT FAILURE

Escalating a case is a correct outcome when evidence is genuinely insufficient or
contradictory. Do not force AUTO_APPROVE just to avoid escalation. Human reviewers
handle escalated cases — your job is to escalate when you should, not to guess."""

_FORCE_JSON_PROMPT = (
    "Based on your research above, output ONLY the JSON verdict:\n"
    '{"validation_decision": "AUTO_APPROVE" or "ESCALATE_FOR_HUMAN_REVIEW", '
    '"final_classification": "deep tech" or "general tech", '
    '"updated_confidence": <integer 0-100>, '
    '"web_evidence_summary": "<2-3 sentences>", "sources_checked": [], "flags": [], '
    '"escalation_reason": null, "checks": {}}'
)


def validate(
    company_name: str,
    domain: Optional[str],
    description: Optional[str],
    agent1_result: Dict[str, Any],
    epo_patent_count: int,
    config: Dict[str, Any],
    provider: LLMProvider,
    web_description_source: Optional[str] = None,
    web_fetch_status: str = "not_found",
) -> Dict[str, Any]:
    """
    Run Agent 2 web-search validation.

    Returns dict with keys:
      validator_verdict, validation_decision, final_classification, updated_confidence,
      web_evidence_summary, sources_checked, escalation_reason, checks
    """
    llm_cfg = config.get("llm", {})
    val_cfg = config.get("validation", {})

    model = llm_cfg.get("model", "claude-haiku-4-5-20251001")
    max_tokens = llm_cfg.get("max_tokens_validator", 3000)
    temperature = llm_cfg.get("temperature", 0.1)
    max_searches = val_cfg.get("max_web_searches", 3)

    agent1_classification = agent1_result.get("classification", "general tech")
    agent1_confidence = agent1_result.get("confidence", 0)

    domain_label = str(domain).strip() if domain and str(domain).strip() not in ("nan", "None", "") else ""
    desc_keywords = ""
    if description and str(description).strip() not in ("nan", "None", ""):
        _stopwords = {"the", "a", "an", "and", "or", "is", "are", "in", "of",
                      "to", "for", "with", "that", "its", "uses", "using"}
        _words = [w.strip(".,;:()\"'") for w in str(description)[:200].split()]
        _keywords = [w for w in _words if len(w) > 3 and w.lower() not in _stopwords][:3]
        if _keywords:
            desc_keywords = " " + " ".join(_keywords)

    desc_display = description[:300] if description and str(description).strip() not in ("nan", "None", "") else "N/A"
    domain_display = domain if domain and str(domain).strip() not in ("nan", "None", "") else "N/A"
    agent1_flags = agent1_result.get("classifier_flags", [])

    # Build description provenance label
    if web_fetch_status == "found" and web_description_source:
        desc_label = f"Description (web-enriched from {web_description_source})"
    elif web_fetch_status == "found":
        desc_label = "Description (web-enriched)"
    else:
        desc_label = "Description (original dataset)"

    # Build search budget guidance
    if web_fetch_status == "found":
        search_note = "Company identity has been confirmed via web enrichment. Focus your searches on technology verification, patents, and research publications — not basic company identification."
    else:
        search_note = "Web enrichment did not find this company. Use your searches to identify the company and its technology."

    user_message = f"""Validate the deep tech classification for this Singapore startup.
Run all five checks from your system prompt before deciding.

## COMPANY DATA
Company: {company_name} ({domain_display})
{desc_label}: {desc_display}
{search_note}

## CLASSIFIER AGENT (AGENT 1) OUTPUT
{json.dumps(agent1_result, indent=2)}

## VALIDATION TASK
Current classification: {agent1_classification} (confidence: {agent1_confidence}/100)
Agent 1 flags: {agent1_flags}
Patents found via EPO: {epo_patent_count}

Search for evidence about this company's technology and research.
Suggested search queries (adapt as needed):
  1. "{company_name}" deep tech research innovation Singapore
  2. "{company_name}" {domain_label} technology{desc_keywords}
  3. "{company_name}" patent publication
You may perform up to {max_searches} searches. Choose queries that best
disambiguate this specific company from others with similar names.
For sources_checked: list any URLs you can cite from search results, or leave empty if none are directly citable.

After searching, respond with ONLY this JSON:
{{
  "validation_decision": "AUTO_APPROVE" or "ESCALATE_FOR_HUMAN_REVIEW",
  "final_classification": "deep tech" or "general tech",
  "updated_confidence": <integer 0-100>,
  "web_evidence_summary": "<2-3 sentences summarizing what you found>",
  "sources_checked": ["url1", "url2"],
  "flags": ["FLAG1", "FLAG2"],
  "escalation_reason": "<string if ESCALATE, null if AUTO_APPROVE>",
  "checks": {{
    "steelman_opposite": {{
      "argument": "<string>",
      "rebuttal": "<string>",
      "fatal_to_classification": true or false
    }},
    "description_inflation": {{
      "inflation_detected": true or false,
      "reasoning": "<string>"
    }},
    "cpc_consistency": {{
      "consistent": true or false,
      "reasoning": "<string>"
    }},
    "ai_domain_scrutiny": {{
      "applicable": true or false,
      "passed": true or false,
      "reasoning": "<string>"
    }},
    "confidence_calibration": {{
      "appropriate": true or false,
      "recommended_confidence": <integer 0-100>,
      "reasoning": "<string>"
    }}
  }}
}}

Applicable flags (include any that apply):
"NO_PATENTS_BUT_INNOVATIVE", "PATENTS_IN_GENERAL_TECH_DOMAIN", "AMBIGUOUS_AI_DOMAIN",
"WEAK_DESCRIPTION", "DEEP_TECH_INVESTOR_SIGNAL", "RESEARCH_INSTITUTION_LINK",
"NEEDS_HUMAN_REVIEW", "DOMAIN_EXPERTISE_REQUIRED"

Use AUTO_APPROVE when the classification is clear and defensible.
Use ESCALATE_FOR_HUMAN_REVIEW when evidence is contradictory, insufficient, or requires domain expertise."""

    messages = [{"role": "user", "content": user_message}]

    max_retries = val_cfg.get("validator_max_retries", 2)
    retry_delay = val_cfg.get("validator_retry_delay_s", 5)

    sources: List[str] = []
    val_input_tokens = 0
    val_output_tokens = 0
    val_cache_read_tokens = 0
    val_cache_creation_tokens = 0
    val_searches = 0
    for attempt in range(max_retries + 1):
        try:
            llm_resp, sources = provider.complete_with_search(
                messages=list(messages),  # fresh copy each attempt
                system=_CACHED_SYSTEM,
                max_tokens=max_tokens,
                temperature=temperature,
                max_searches=max_searches,
                force_json_prompt=_FORCE_JSON_PROMPT,
            )
            result_text = llm_resp.text
            val_input_tokens = llm_resp.input_tokens
            val_output_tokens = llm_resp.output_tokens
            val_cache_read_tokens = llm_resp.cache_read_tokens
            val_cache_creation_tokens = llm_resp.cache_write_tokens
            val_searches = llm_resp.searches

            if not result_text.strip():
                if attempt < max_retries:
                    wait = retry_delay * (attempt + 1)
                    logger.warning(
                        f"Agent 2 empty response for '{company_name}' "
                        f"(attempt {attempt + 1}/{max_retries + 1}), retrying in {wait}s"
                    )
                    time.sleep(wait)
                    continue
                logger.error(f"Agent 2 empty response for '{company_name}' after all retries.")
                return _insufficient_result(agent1_classification, agent1_confidence, sources,
                                            val_input_tokens, val_output_tokens,
                                            val_cache_read_tokens, val_cache_creation_tokens,
                                            val_searches)

            try:
                result = _parse_json(result_text)
                _validate_validator_result(result, agent1_classification)
                result["sources_checked"] = result.get("sources_checked", sources)
                result["validator_input_tokens"] = val_input_tokens
                result["validator_output_tokens"] = val_output_tokens
                result["validator_cache_read_tokens"] = val_cache_read_tokens
                result["validator_cache_creation_tokens"] = val_cache_creation_tokens
                result["validator_searches"] = val_searches
                logger.debug(
                    f"Agent 2 decision for '{company_name}': {result['validation_decision']} "
                    f"verdict={result['validator_verdict']} "
                    f"→ {result['final_classification']} ({result['updated_confidence']})"
                )
                return result

            except (json.JSONDecodeError, KeyError, ValueError) as e:
                if attempt < max_retries:
                    wait = retry_delay * (attempt + 1)
                    logger.warning(
                        f"Agent 2 JSON parse error for '{company_name}': {e} "
                        f"(attempt {attempt + 1}/{max_retries + 1}), retrying in {wait}s"
                    )
                    time.sleep(wait)
                    continue
                logger.error(f"Agent 2 JSON parse error for '{company_name}': {e}")
                return _insufficient_result(agent1_classification, agent1_confidence, sources,
                                            val_input_tokens, val_output_tokens,
                                            val_cache_read_tokens, val_cache_creation_tokens,
                                            val_searches)

        except LLMProviderError as e:
            if attempt < max_retries:
                wait = retry_delay * (attempt + 1)
                logger.warning(
                    f"Agent 2 provider error for '{company_name}': {e} "
                    f"(attempt {attempt + 1}/{max_retries + 1}), retrying in {wait}s"
                )
                time.sleep(wait)
                continue
            logger.error(f"Agent 2 provider error for '{company_name}' after all retries: {e}")
            return _insufficient_result(agent1_classification, agent1_confidence, sources,
                                        val_input_tokens, val_output_tokens,
                                        val_cache_read_tokens, val_cache_creation_tokens,
                                        val_searches)

        except Exception as e:
            logger.error(f"Agent 2 failed for '{company_name}': {e}", exc_info=True)
            return _insufficient_result(agent1_classification, agent1_confidence, sources,
                                        val_input_tokens, val_output_tokens,
                                        val_cache_read_tokens, val_cache_creation_tokens,
                                        val_searches)

    # Fallback (should not reach here)
    return _insufficient_result(agent1_classification, agent1_confidence, sources,
                                val_input_tokens, val_output_tokens, 0, 0, val_searches)


_CACHED_SYSTEM = [{"type": "text", "text": _SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}]


_URL_PATTERN = re.compile(r'https?://[^\s\'"<>]+')


def _extract_json_from_text(text: str) -> str:
    """
    Scan text for a JSON object. Returns the raw JSON string if found, else "".
    Handles ```json ... ``` fences and bare JSON objects.
    """
    if not text or not text.strip():
        return ""

    # Strip markdown fences
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.split("\n")
        inner_lines = lines[1:-1] if lines[-1].strip() == "```" else lines[1:]
        stripped = "\n".join(inner_lines).strip()

    # Try whole text first
    try:
        json.loads(stripped)
        return stripped
    except (json.JSONDecodeError, ValueError):
        pass

    # Extract first {...} block
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        candidate = match.group(0)
        try:
            json.loads(candidate)
            return candidate
        except (json.JSONDecodeError, ValueError):
            pass

    try:
        from json_repair import repair_json
        repaired = repair_json(text)
        if repaired and repaired not in ("null", ""):
            json.loads(repaired)  # validate the repair is parseable
            return repaired
    except Exception:
        pass

    return ""


def _parse_json(raw_text: str) -> Dict[str, Any]:
    text = raw_text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    try:
        from json_repair import repair_json
        repaired = repair_json(text, return_objects=True)
        if isinstance(repaired, dict):
            return repaired
    except Exception:
        pass
    return json.loads(text)  # re-raise original JSONDecodeError


def _validate_validator_result(result: Dict[str, Any], agent1_classification: str) -> None:
    valid_decisions = {"AUTO_APPROVE", "ESCALATE_FOR_HUMAN_REVIEW"}
    if result.get("validation_decision") not in valid_decisions:
        raise ValueError(f"Invalid validation_decision: {result.get('validation_decision')!r}")
    if result.get("final_classification") not in ("deep tech", "general tech"):
        raise ValueError(f"Invalid final_classification: {result.get('final_classification')!r}")
    if not isinstance(result.get("updated_confidence"), (int, float)):
        raise ValueError("updated_confidence must be a number")
    result["updated_confidence"] = int(result["updated_confidence"])

    # Derive validator_verdict from validation_decision + classification comparison
    decision = result["validation_decision"]
    agent2_class = result["final_classification"]
    if decision == "AUTO_APPROVE":
        result["validator_verdict"] = "confirm" if agent2_class == agent1_classification else "override"
    else:
        result["validator_verdict"] = "insufficient_evidence"

    # Soft validation
    if not isinstance(result.get("flags"), list):
        result["flags"] = []
    if not isinstance(result.get("checks"), dict):
        result["checks"] = {}
    if "escalation_reason" in result and result["escalation_reason"] is not None:
        result["escalation_reason"] = str(result["escalation_reason"])


def _insufficient_result(
    agent1_classification: str,
    agent1_confidence: int,
    sources: List[str],
    input_tokens: int = 0,
    output_tokens: int = 0,
    cache_read_tokens: int = 0,
    cache_creation_tokens: int = 0,
    searches: int = 0,
) -> Dict[str, Any]:
    return {
        "validator_verdict": "insufficient_evidence",
        "validation_decision": "ESCALATE_FOR_HUMAN_REVIEW",
        "final_classification": agent1_classification if agent1_classification != "error" else "general tech",
        "updated_confidence": agent1_confidence,
        "web_evidence_summary": "Web validation could not be completed.",
        "sources_checked": sources,
        "flags": [],
        "escalation_reason": "Web validation could not be completed.",
        "checks": {},
        "validator_input_tokens": input_tokens,
        "validator_output_tokens": output_tokens,
        "validator_cache_read_tokens": cache_read_tokens,
        "validator_cache_creation_tokens": cache_creation_tokens,
        "validator_searches": searches,
    }
