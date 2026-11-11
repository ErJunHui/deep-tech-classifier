"""
Agent 1 — Classifier (Research Agent).

Sends company + EPO data to AI Model (e.g. Claude Haiku and parses a structured JSON classification.
Retries up to max_retries_on_parse_error times on JSON parse failures.
"""

import json
import logging
import time
from typing import Dict, Any, Optional

from pipeline.epo_bridge import EPOResult
from pipeline.json_utils import parse_json as _parse_json
from pipeline.llm_provider import LLMProvider, LLMProviderError, ProviderRateLimitError, get_cost_rates

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are an expert technology analyst specializing in deep tech classification for Singapore startups.

## DEEP TECH CRITERIA

A company qualifies as "deep tech" ONLY if it meets ALL THREE of the following criteria:

1. **INNOVATION**: The company creates novel innovations or proprietary technology at the frontier of science or engineering — not merely applying existing technology in new markets. This means original R&D, not off-the-shelf tools or platforms.

2. **SCIENTIFIC FOUNDATION**: The company's core product or process is grounded in a hard science or deep engineering discipline: e.g., biology, chemistry, materials science, photonics, semiconductors, quantum computing, advanced robotics, aerospace engineering, novel AI/ML research (not AI applications). SaaS tools, mobile apps, and digital platforms do NOT qualify regardless of domain.

3. **PROPRIETARY IP**: The company has meaningful barriers to replication — patents, trade secrets, proprietary datasets, or highly specialised know-how that competitors cannot easily replicate. Patent absence is acceptable ONLY if criteria 1 and 2 are strongly met and there is a clear alternative IP protection mechanism.

## CRITICAL GREY AREA RULES

Apply these rules strictly to avoid common misclassifications:

**Rule 1 — AI/ML Scrutiny**: AI/ML companies are "deep tech" ONLY if they conduct original AI research (novel architectures, novel training methods, new theoretical contributions) OR apply AI to a hard-science domain (e.g., drug discovery, materials simulation, computational chemistry, genomics). AI-powered SaaS, AI analytics tools, AI chatbots, and AI-enabled workflows are "general tech" regardless of how sophisticated they appear.

  **Rule 1a — Domain Expertise Test (apply when Rule 1 is ambiguous)**: When it is unclear whether an AI company meets the hard-science criterion, apply this test: *Would building the company's core AI system require deep domain scientific expertise — such as materials chemistry, molecular biology, or condensed matter physics — or could a generalist ML engineer build it without that expertise?* If the answer is "a generalist ML engineer could build it," classify as general tech. If domain expertise is genuinely load-bearing (i.e., the AI model cannot be built or validated without it), this is a strong positive signal for deep tech.

  **Rule 1b — Delivery Model Does Not Override Scientific Grounding**: SaaS delivery, subscription pricing, and cloud deployment do NOT disqualify a company from being deep tech. A company that has built scientifically-grounded AI (applying genuine materials science, biology, or physics) and delivers it as a SaaS platform remains "deep tech" — the question is what the underlying AI does, not how it is packaged. Conversely, wrapping a commodity LLM or standard ML model in a SaaS interface does not make it deep tech regardless of the scientific domain of the customers.

**Rule 2 — Patent-Domain Mismatch**: If a company has patents but those patents are in a domain unrelated to its stated business (e.g., a logistics company with a few software patents), do not use the patents as deep tech evidence. CPC codes must align with the claimed deep tech domain.

**Rule 3 — Description Inflation**: Many startups describe themselves using deep tech vocabulary ("cutting-edge", "breakthrough", "AI-powered", "next-generation") without underlying scientific novelty. Evaluate the actual technical substance, not the marketing language.

**Rule 4 — Domain Alone Is Not Sufficient**: Operating in a deep tech sector (healthcare, biotech, cleantech, semiconductors) does not automatically make a company "deep tech". A healthcare app, a biotech marketplace, or a cleantech consulting firm is "general tech". The company must be doing the deep tech work itself.

**Rule 5 — Hardware Does Not Automatically Mean Deep Tech**:
Companies that manufacture or integrate hardware are NOT automatically "deep tech". A company assembling IoT devices from off-the-shelf components, producing custom PCBs using standard fabrication, or building hardware products using commercially available chips does not meet the scientific foundation criterion. Hardware is only "deep tech" if the company invented a novel physical mechanism, material, or process at the component level — e.g., a new semiconductor fabrication method, a novel sensor physics principle, or a proprietary materials formulation. Ask: "Is the novelty in integration/design, or in the underlying physics/chemistry/materials?"

**Rule 6 — Consumer Medical Hardware Is Not Deep Tech**:
Companies that manufacture consumer-facing physical medical products — heat patches,
bandages, splints, orthopaedic supports, massage devices — are NOT "deep tech" unless
their core product involves a novel pharmaceutical formulation (A61K), a novel biological
mechanism (C12N), or scientifically novel materials. Ask: "Is the novelty in the
chemistry/biology of what the product *delivers*, or in the physical form factor and
packaging?" Form factor and ergonomic design are not deep tech.

  **Rule 6a — Heat/cold therapy products**: Activatable heat cells, air-activated warmers,
  and chemical heat packs are general tech regardless of patents. The underlying chemistry
  (iron oxidation, sodium acetate) is publicly known; patents protect manufacturing geometry,
  not novel science.

  **Rule 6b — A61F vs. A61K/A61B distinction**: If a company has CPC codes in A61F but NOT
  in A61K/A61P/A61B/C12N, treat the EPO deep tech signal with significant scepticism. A61F
  covers physical devices/patches; A61K covers pharmaceutical preparations. A transdermal
  patch delivering a novel API (A61K) may qualify; a heat patch that delivers no
  pharmaceutical agent (A61F only) does not.

## CPC CODE REFERENCE

Use these CPC code families to evaluate patent alignment:

| Deep Tech CPC codes | Domain |
|---------------------|--------|
| A61K, A61P, A61B | Pharma, medical devices, diagnostics |
| C12N, C12Q, C40B | Biotechnology, genomics, combinatorial chemistry |
| H01L, H01S, H01J | Semiconductors, lasers, electron devices |
| G16B, G16H | Bioinformatics, health informatics |
| B82Y, B81B | Nanotechnology, MEMS |
| H04B, H04W, H04L (novel) | Advanced communications, novel protocols |
| F03D, H02J (novel) | Renewable energy systems |
| G06N (novel architectures) | Novel AI/ML research |
| C07, C08, C09 | Advanced chemistry, materials |
| B64, B64G | Aerospace, space technology |
| G01N, G01R, G01S | Scientific instrumentation |

| General Tech CPC codes | Domain |
|------------------------|--------|
| G06F, G06Q | Software, business methods |
| H04L (standard networking) | Standard networking software |
| G06K, G06T (standard) | Standard image/data processing |
| G16Y | IoT platforms (standard) |
| A61F | Physical therapeutic devices (patches, bandages, splints, orthopaedic) — consumer medical hardware, NOT deep tech |
| A61G | Patient transport, hospital beds — NOT deep tech |
| A61H | Physical therapy apparatus (massage, exercise) — NOT deep tech |
| A61J | Medical containers/dispensers — NOT deep tech |

## WORKED EXAMPLES

**Example 1 — Clear Deep Tech:**
- Company: "NovaBiotech" — develops novel CRISPR-based gene editing tools for rare disease treatment
- Patents: 12 patents in C12N (gene editing), A61K (pharma)
- Description: "We develop proprietary gene editing platforms using a novel base-editing approach we invented."
- Analysis: Meets all 3 criteria. Novel scientific method (CRISPR variant), hard science foundation (molecular biology), strong IP (12 patents in correct domain).
- Classification: "deep tech", confidence: 92

**Example 2 — Grey Area (AI SaaS, no patents):**
- Company: "SmartHR" — uses "AI and ML" to automate HR workflows
- Patents: 0
- Description: "Our AI platform automates performance reviews and talent matching using NLP."
- Analysis: Fails Rule 1 (AI application, not AI research). NLP for HR is a software application of existing models. No novel science. No IP barriers.
- Flags: ["NO_PATENTS_BUT_INNOVATIVE"]
- Classification: "general tech", confidence: 82

**Example 3 — Domain Inflation (cleantech marketplace):**
- Company: "GreenConnect" — connects renewable energy buyers and sellers on a digital marketplace
- Patents: 0
- Description: "We're building the future of clean energy trading through our digital platform."
- Analysis: Cleantech domain but general tech execution. Digital marketplace with no novel science or engineering. Rule 4 applies.
- Classification: "general tech", confidence: 88

**Example 4 — Grey Area (Custom Hardware, No Novel Science):**
- Company: "SmartEdge" — designs IoT edge devices for industrial monitoring
- Patents: 2 patents in G16Y (IoT platforms)
- Description: "We build ruggedized IoT sensors and gateways that connect industrial equipment to the cloud."
- Analysis: Hardware company, but the novelty is in integration — not in inventing new sensor physics, materials, or semiconductor processes. CPC G16Y is a general tech code. Rule 5 applies.
- Classification: "general tech", confidence: 78

**Example 5 — Grey Area (Scientifically-Grounded AI SaaS, No Patents):**
- Company: "PolymerAI" — AI platform for materials discovery; predicts polymer properties and accelerates formulation R&D for chemical manufacturers
- Patents: 0
- Description: "We use machine learning trained on proprietary experimental materials datasets to predict mechanical, thermal, and chemical properties of novel polymer formulations, reducing lab iteration cycles from months to days."
- Analysis: Rule 1 applies — this is AI applied to materials science. Apply Rule 1a (Domain Expertise Test): building and validating an ML model over polymer property datasets requires materials chemistry expertise to define the feature space (molecular descriptors, synthesis conditions), curate training labels, and verify that predictions are physically meaningful. A generalist ML engineer without materials science knowledge could not build this system reliably. Rule 1b applies: SaaS delivery does not disqualify the company. The proprietary experimental dataset constitutes an IP barrier under criterion 3. No patents, but criteria 1 and 2 are strongly met and dataset-as-IP is a recognised alternative protection mechanism. Compare to SmartHR (Example 2): SmartHR applies NLP to HR text — a task any ML engineer can build from commodity embeddings, requiring no domain science. PolymerAI's AI cannot be built without materials chemistry expertise. That distinction is decisive.
- Flags: ["NO_PATENTS_BUT_INNOVATIVE", "DOMAIN_EXPERTISE_REQUIRED"]
- Classification: "deep tech", confidence: 67

## SELF-AUDIT INSTRUCTIONS

Before finalising your classification, you MUST:

1. State the strongest counterargument to your classification (e.g., if classifying as "deep tech", what is the strongest reason it might be "general tech"? And vice versa.)
2. Rebut that counterargument or explain why it does not change your conclusion.
3. Adjust confidence if the counterargument reveals genuine uncertainty.

## CLASSIFICATION RULES SUMMARY

| Signal | Deep Tech | General Tech |
|--------|-----------|--------------|
| Novel scientific method invented by company | Strong positive | N/A |
| Applies existing science to new market | Weak positive | Moderate positive |
| AI/ML research (novel architectures, training) | Positive | N/A |
| AI/ML application (tools, SaaS, workflows) | N/A | Strong positive |
| Patents in aligned CPC domain | Strong positive | N/A |
| Patents in unrelated domain | Neutral | Neutral |
| SaaS platform, marketplace, app (see Rule 1b) | N/A | Strong positive |
| Healthcare/biotech/cleantech domain alone | Weak positive | N/A |
| No description available | Neutral | Neutral |

## CONFIDENCE CALIBRATION

| Range | Meaning |
|-------|---------|
| 90–100 | Near-definitive. Multiple aligned deep tech patents AND clearly technical description. No meaningful counterargument. |
| 75–89 | Strong evidence. Clear signals in at least 2 of 3 criteria. Minor uncertainties do not change the conclusion. |
| 60–74 | Moderate evidence. One strong signal, others missing or ambiguous. Classification likely correct but not certain. |
| 45–59 | Borderline. Meaningful evidence on both sides. Judgment call. |
| 30–44 | Weak evidence. Sparse or inflated description. No patents. |
| Below 30 | Near-absence of usable information. Classification by name/domain inference only. |

Do NOT use confidence > 74 when classification_basis is DESCRIPTION_ONLY or WEB_DESCRIPTION (no patents) unless the description is exceptionally detailed and technically specific.

## OUTPUT STYLE REQUIREMENTS

All text in reasoning, criteria reasoning, self_audit, and domain_alignment fields must read as independent expert analytical judgment. Follow these rules strictly:

- NEVER cite rule numbers or rule names in any output field (no "Rule 1", "Rule 6a", "per Rule 5", etc.)
- NEVER use phrases like "my instructions", "my criteria", "as instructed", "as defined", "I am instructed to", or any reference to internal guidelines or criteria documents
- NEVER acknowledge that a classification framework or ruleset exists
- Express all assessments as observations about the company's actual technology, patents, and evidence
- Ground reasoning in concrete signals: what patents describe, what scientific discipline the work requires, whether the technology involves established vs. frontier science
- Write as a senior technology analyst who arrived at these conclusions through independent technical judgment, not rule application
- For self_audit counterarguments: frame as "one could argue..." or "a case could be made that..." — not "my criteria state..."

Output ONLY valid JSON — no markdown fences, no explanation outside JSON."""


def _build_user_message(
    company_name: str,
    uen: Optional[str],
    domain: Optional[str],
    description: Optional[str],
    location: Optional[str],
    funding_rounds: Optional[Any],
    funding_amount: Optional[Any],
    epo: EPOResult,
    web_sourced: bool = False,
) -> str:
    desc_text = description.strip() if description and str(description).strip() not in ("nan", "None", "") else "Not provided"
    domain_text = domain if domain and str(domain).strip() not in ("nan", "None", "") else "Not provided"
    desc_label = "Description (web-sourced)" if web_sourced else "Description (dataset)"

    epo_section = f"""EPO Patent Data:
- Patents found: {epo.patent_count}
- EPO deep tech classification: {"Yes" if epo.epo_is_deeptech else "No"}
- EPO deep tech level: {epo.epo_deeptech_level}
- Primary technology domain: {epo.epo_primary_domain}
- CPC codes: {", ".join(epo.cpc_codes[:10]) if epo.cpc_codes else "None"}
- EPO lookup status: {epo.raw_status}"""

    if epo.patent_titles:
        epo_section += f"\n- Patent titles (sample): {' | '.join(epo.patent_titles[:3])}"
    if epo.patent_abstracts:
        epo_section += f"\n- Patent abstracts (sample): {epo.patent_abstracts[0][:300]}"

    return f"""Classify the following Singapore startup company as "deep tech" or "general tech".

## INPUT

You will receive structured data per company:
Company Information:
- Name: {company_name}
- UEN: {uen or "Not provided"}
- Domain/Industry: {domain_text}
- {desc_label}: {desc_text}
- Location: {location or "Not provided"}
- Funding rounds: {funding_rounds or "Not provided"}
- Funding amount: {funding_amount or "Not provided"}

{epo_section}

## OUTPUT FORMAT

Respond with ONLY this JSON object (no markdown fences, no explanation outside JSON):
{{
  "classification": "deep tech" or "general tech",
  "confidence": <integer 0-100>,
  "reasoning": "<2-4 sentences explaining key classification signals>",
  "key_signals": {{
    "has_patents": <true or false>,
    "epo_deeptech_flag": <true, false, or null>,
    "description_indicates_deeptech": <true or false>,
    "domain_alignment": "<brief note>"
  }},
  "criteria": {{
    "innovation": {{ "met": <true or false>, "reasoning": "<string>" }},
    "scientific_foundation": {{ "met": <true or false>, "reasoning": "<string>" }},
    "proprietary_ip": {{ "met": <true or false>, "reasoning": "<string>" }}
  }},
  "cpc_analysis": {{
    "deep_tech_codes": ["list of relevant deep tech CPC codes found"],
    "general_tech_codes": ["list of general tech CPC codes found"],
    "cpc_verdict": "SUPPORTS_DEEP_TECH" or "SUPPORTS_GENERAL_TECH" or "INCONCLUSIVE" or "NO_PATENTS"
  }},
  "classifier_flags": ["flag1", "flag2"],
  "self_audit": {{
    "strongest_counterargument": "<string>",
    "counterargument_rebuttal": "<string>",
    "confidence_adjustment": "<string>"
  }},
  "classification_basis": "PATENT_CPC" or "DESCRIPTION_ONLY" or "WEB_DESCRIPTION" or "COMBINED"
}}"""


def classify(
    company_name: str,
    uen: Optional[str],
    domain: Optional[str],
    description: Optional[str],
    location: Optional[str],
    funding_rounds: Optional[Any],
    funding_amount: Optional[Any],
    epo_result: EPOResult,
    config: Dict[str, Any],
    provider: LLMProvider,
    web_sourced: bool = False,
) -> Dict[str, Any]:
    """
    Call Agent 1 to classify a company.

    Returns dict with keys:
      classification, confidence, reasoning, key_signals
    On persistent failure returns error sentinel.
    """
    llm_cfg = config.get("llm", {})
    model = llm_cfg.get("model", "claude-haiku-4-5-20251001")
    max_tokens = llm_cfg.get("max_tokens_classifier", 3000)
    temperature = llm_cfg.get("temperature", 0.1)
    max_retries = llm_cfg.get("max_retries_on_parse_error", 2)

    user_msg = _build_user_message(
        company_name, uen, domain, description, location,
        funding_rounds, funding_amount, epo_result,
        web_sourced=web_sourced,
    )

    messages = [{"role": "user", "content": user_msg}]

    classifier_input_tokens = 0
    classifier_output_tokens = 0
    classifier_cache_read_tokens = 0
    classifier_cache_creation_tokens = 0

    for attempt in range(max_retries + 1):
        try:
            response = _call_api(provider, max_tokens, temperature, messages)
            classifier_input_tokens += response.input_tokens
            classifier_output_tokens += response.output_tokens
            classifier_cache_read_tokens += response.cache_read_tokens
            classifier_cache_creation_tokens += response.cache_write_tokens
            raw_text = response.text.strip()

            try:
                result = _parse_json(raw_text)
                validate_classification_result(result)
                logger.debug(
                    f"Agent 1 classified '{company_name}' as "
                    f"{result['classification']} (confidence={result['confidence']})"
                )
                result["classifier_input_tokens"] = classifier_input_tokens
                result["classifier_output_tokens"] = classifier_output_tokens
                result["classifier_cache_read_tokens"] = classifier_cache_read_tokens
                result["classifier_cache_creation_tokens"] = classifier_cache_creation_tokens
                _rates = get_cost_rates(model)
                result["classifier_cost_usd"] = (
                    classifier_input_tokens * _rates["input"]
                    + classifier_cache_creation_tokens * _rates["cache_write"]
                    + classifier_cache_read_tokens * _rates["cache_read"]
                    + classifier_output_tokens * _rates["output"]
                )
                return result

            except (json.JSONDecodeError, KeyError, ValueError) as parse_err:
                if attempt < max_retries:
                    logger.warning(
                        f"JSON parse error for '{company_name}' (attempt {attempt+1}): {parse_err}. Retrying."
                    )
                    messages.append({"role": "assistant", "content": raw_text})
                    messages.append({
                        "role": "user",
                        "content": (
                            f"Your previous response had a JSON error: {parse_err}. "
                            "Please respond with ONLY valid JSON matching the schema exactly. "
                            "No markdown, no explanation — just the JSON object."
                        ),
                    })
                else:
                    logger.error(
                        f"Agent 1 failed to produce valid JSON for '{company_name}' after "
                        f"{max_retries + 1} attempts: {parse_err}"
                    )
                    err = _error_result(str(parse_err))
                    err["classifier_input_tokens"] = classifier_input_tokens
                    err["classifier_output_tokens"] = classifier_output_tokens
                    err["classifier_cache_read_tokens"] = classifier_cache_read_tokens
                    err["classifier_cache_creation_tokens"] = classifier_cache_creation_tokens
                    err["classifier_cost_usd"] = 0.0
                    return err

        except ProviderRateLimitError:
            logger.warning(f"Rate limit hit for '{company_name}' (provider handled retries).")
            err = _error_result("Rate limit exceeded")
            err["classifier_input_tokens"] = classifier_input_tokens
            err["classifier_output_tokens"] = classifier_output_tokens
            err["classifier_cache_read_tokens"] = classifier_cache_read_tokens
            err["classifier_cache_creation_tokens"] = classifier_cache_creation_tokens
            err["classifier_cost_usd"] = 0.0
            return err

        except LLMProviderError as api_err:
            logger.error(f"LLM provider error for '{company_name}': {api_err}")
            if attempt < max_retries:
                time.sleep(5)
            else:
                err = _error_result(str(api_err))
                err["classifier_input_tokens"] = classifier_input_tokens
                err["classifier_output_tokens"] = classifier_output_tokens
                err["classifier_cache_read_tokens"] = classifier_cache_read_tokens
                err["classifier_cache_creation_tokens"] = classifier_cache_creation_tokens
                err["classifier_cost_usd"] = 0.0
                return err

    err = _error_result("Max retries exhausted")
    err["classifier_input_tokens"] = classifier_input_tokens
    err["classifier_output_tokens"] = classifier_output_tokens
    err["classifier_cache_read_tokens"] = classifier_cache_read_tokens
    err["classifier_cache_creation_tokens"] = classifier_cache_creation_tokens
    err["classifier_cost_usd"] = 0.0
    return err


_CACHED_SYSTEM = [{"type": "text", "text": _SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}]


def _call_api(provider: LLMProvider, max_tokens: int, temperature: float, messages):
    return provider.complete(
        messages=messages,
        system=_CACHED_SYSTEM,
        max_tokens=max_tokens,
        temperature=temperature,
    )


def build_batch_request(custom_id: str, company_data: dict) -> dict:
    """
    Build an Anthropic Message Batches request dict for a single company.

    company_data must contain: company_name, uen, domain, resolved_description,
    location, funding_rounds, funding_amount, epo (EPOResult or dict), web_sourced,
    model, max_tokens, temperature.
    """
    from pipeline.epo_bridge import EPOResult as _EPOResult
    epo_raw = company_data["epo"]
    if isinstance(epo_raw, dict):
        epo = _EPOResult(**epo_raw)
    else:
        epo = epo_raw

    user_msg = _build_user_message(
        company_name=company_data["company_name"],
        uen=company_data.get("uen"),
        domain=company_data.get("domain"),
        description=company_data.get("resolved_description"),
        location=company_data.get("location"),
        funding_rounds=company_data.get("funding_rounds"),
        funding_amount=company_data.get("funding_amount"),
        epo=epo,
        web_sourced=company_data.get("web_sourced", False),
    )
    return {
        "custom_id": custom_id,
        "params": {
            "model": company_data.get("model", "claude-haiku-4-5-20251001"),
            "max_tokens": company_data.get("max_tokens", 2000),
            "temperature": company_data.get("temperature", 0.1),
            "system": _CACHED_SYSTEM,
            "messages": [{"role": "user", "content": user_msg}],
        },
    }


_VALID_CPC_VERDICTS = {"SUPPORTS_DEEP_TECH", "SUPPORTS_GENERAL_TECH", "INCONCLUSIVE", "NO_PATENTS"}


def validate_classification_result(result: Dict[str, Any]) -> None:
    if result.get("classification") not in ("deep tech", "general tech"):
        raise ValueError(
            f"classification must be 'deep tech' or 'general tech', got: {result.get('classification')!r}"
        )
    if not isinstance(result.get("confidence"), (int, float)):
        raise ValueError("confidence must be a number")
    result["confidence"] = int(result["confidence"])

    # Soft validation for new fields (non-blocking)
    if "classifier_flags" in result:
        if not isinstance(result["classifier_flags"], list):
            logger.warning("classifier_flags is not a list — coercing to []")
            result["classifier_flags"] = []

    cpc = result.get("cpc_analysis", {})
    if isinstance(cpc, dict) and "cpc_verdict" in cpc:
        if cpc["cpc_verdict"] not in _VALID_CPC_VERDICTS:
            logger.warning(f"cpc_verdict has unexpected value: {cpc['cpc_verdict']!r}")

    criteria = result.get("criteria", {})
    if isinstance(criteria, dict):
        for criterion_key in ("innovation", "scientific_foundation", "proprietary_ip"):
            criterion = criteria.get(criterion_key, {})
            if isinstance(criterion, dict):
                if "met" not in criterion:
                    logger.warning(f"criteria.{criterion_key} missing 'met' field")
                if "reasoning" not in criterion:
                    logger.warning(f"criteria.{criterion_key} missing 'reasoning' field")


def _error_result(reason: str) -> Dict[str, Any]:
    return {
        "classification": "error",
        "confidence": 0,
        "reasoning": f"Classification failed: {reason}",
        "key_signals": {
            "has_patents": False,
            "epo_deeptech_flag": None,
            "description_indicates_deeptech": False,
            "domain_alignment": "Error",
        },
        "criteria": {
            "innovation": {"met": False, "reasoning": "Classification failed"},
            "scientific_foundation": {"met": False, "reasoning": "Classification failed"},
            "proprietary_ip": {"met": False, "reasoning": "Classification failed"},
        },
        "cpc_analysis": {"deep_tech_codes": [], "general_tech_codes": [], "cpc_verdict": "NO_PATENTS"},
        "classifier_flags": [],
        "self_audit": {"strongest_counterargument": "", "counterargument_rebuttal": "", "confidence_adjustment": ""},
        "classification_basis": "DESCRIPTION_ONLY",
    }
