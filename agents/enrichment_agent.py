"""
Agent 0 — Web Enrichment.

Fetches a fresh company description from the web using Claude Haiku + web_search_20250305.
Returns web_description, web_description_source, and web_fetch_status.
"""

import json
import logging
import re
from typing import Dict, Any, Optional, List

from pipeline.llm_provider import LLMProvider, LLMProviderError

logger = logging.getLogger(__name__)

_FORCE_JSON_PROMPT = (
    "Based on your research, output ONLY the JSON:\n"
    '{"found": true/false, "description": "...", '
    '"source_domain": "...", "confirmed_same_company": true/false, '
    '"confirmation_reasoning": "..."}'
)

_SYSTEM_PROMPT = """You are a research assistant. Your task is to find a concise, factual description of a Singapore company's technology and business.

Search for the company and extract:
1. What the company does (their core product/service)
2. Their technology or scientific approach
3. Their industry/domain

After searching, confirm the result is about the SAME company (matching name and Singapore context). If you cannot confirm it's the same company, report that you could not find it.

Respond ONLY with JSON in this exact format:
{
  "found": true or false,
  "description": "<factual description of what the company does, max 500 chars>",
  "source_domain": "<domain of main source, e.g. linkedin.com, crunchbase.com>",
  "confirmed_same_company": true or false,
  "confirmation_reasoning": "<brief note on how you confirmed or why you couldn't>"
}"""


def enrich(
    company_name: str,
    uen: Optional[str],
    domain: Optional[str],
    location: Optional[str],
    config: Dict[str, Any],
    provider: LLMProvider,
) -> Dict[str, Any]:
    """
    Fetch a web description for a company using Claude Haiku + web_search.

    Returns:
        {
            "web_description": str | None,
            "web_description_source": str | None,
            "web_fetch_status": "found" | "not_found" | "error"
        }
    """
    try:
        enrichment_cfg = config.get("enrichment", {})
        llm_cfg = config.get("llm", {})

        model = llm_cfg.get("model", "claude-haiku-4-5-20251001")
        max_tokens = enrichment_cfg.get("max_tokens", 1000)
        max_searches = enrichment_cfg.get("max_searches", 2)
        temperature = llm_cfg.get("temperature", 0.1)

        loc_str = location if location and str(location).strip() not in ("nan", "None", "") else "Singapore"
        uen_str = uen if uen and str(uen).strip() not in ("nan", "None", "") else ""
        domain_str = domain if domain and str(domain).strip() not in ("nan", "None", "") else ""

        # Build search queries
        query1 = f'"{company_name}" Singapore company technology'
        fallback_hint = uen_str or domain_str or ""
        query2 = f'"{company_name}" {fallback_hint} company'.strip()

        user_message = f"""Find information about this Singapore company: {company_name}

Additional identifiers:
- UEN: {uen_str or "Not provided"}
- Industry/domain: {domain_str or "Not provided"}
- Location: {loc_str}

Suggested search queries (use up to {max_searches} searches):
1. {query1}
2. {query2}

After finding information, verify it is about THIS specific company (same name, Singapore context).
If you cannot confirm it's the same company, set "found": false and "confirmed_same_company": false.

Respond ONLY with the JSON object as specified."""

        messages = [{"role": "user", "content": user_message}]

        llm_resp, source_urls = provider.complete_with_search(
            messages=messages,
            system=_SYSTEM_PROMPT,
            max_tokens=max_tokens,
            temperature=temperature,
            max_searches=max_searches,
            force_json_prompt=_FORCE_JSON_PROMPT,
        )
        result_text = llm_resp.text
        enrich_in_tok = llm_resp.input_tokens
        enrich_out_tok = llm_resp.output_tokens
        enrich_searches = llm_resp.searches
        # Extract domain from first real URL in sources
        source_domain = None
        for url in source_urls:
            d = _domain_from_url(url)
            if d:
                source_domain = d
                break

        if not result_text:
            result = _not_found_result()
            result["enrichment_input_tokens"] = enrich_in_tok
            result["enrichment_output_tokens"] = enrich_out_tok
            result["enrichment_searches"] = enrich_searches
            return result

        parsed = _parse_json(result_text)

        if not parsed.get("found") or not parsed.get("confirmed_same_company"):
            result = _not_found_result()
            result["enrichment_input_tokens"] = enrich_in_tok
            result["enrichment_output_tokens"] = enrich_out_tok
            result["enrichment_searches"] = enrich_searches
            return result

        description = parsed.get("description", "")
        if not description or not str(description).strip():
            result = _not_found_result()
            result["enrichment_input_tokens"] = enrich_in_tok
            result["enrichment_output_tokens"] = enrich_out_tok
            result["enrichment_searches"] = enrich_searches
            return result

        # Truncate to 500 chars
        description = str(description)[:500]
        source = parsed.get("source_domain") or source_domain or None

        logger.debug(f"Agent 0 enriched '{company_name}': source={source}")
        return {
            "web_description": description,
            "web_description_source": source,
            "web_fetch_status": "found",
            "enrichment_input_tokens": enrich_in_tok,
            "enrichment_output_tokens": enrich_out_tok,
            "enrichment_searches": enrich_searches,
        }

    except Exception as exc:
        logger.warning(f"Agent 0 enrichment failed for '{company_name}': {exc}")
        return {
            "web_description": None,
            "web_description_source": None,
            "web_fetch_status": "error",
            "enrichment_input_tokens": 0,
            "enrichment_output_tokens": 0,
            "enrichment_searches": 0,
        }


def _domain_from_url(url: str) -> Optional[str]:
    match = re.match(r'https?://(?:www\.)?([^/]+)', url)
    return match.group(1) if match else None


def _extract_json_str(text: str) -> str:
    if not text or not text.strip():
        return ""
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.split("\n")
        inner = lines[1:-1] if lines[-1].strip() == "```" else lines[1:]
        stripped = "\n".join(inner).strip()
    try:
        json.loads(stripped)
        return stripped
    except (json.JSONDecodeError, ValueError):
        pass
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        candidate = match.group(0)
        try:
            json.loads(candidate)
            return candidate
        except (json.JSONDecodeError, ValueError):
            pass
    return ""


def _parse_json(raw_text: str) -> Dict[str, Any]:
    text = raw_text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    return json.loads(text)


def _not_found_result() -> Dict[str, Any]:
    return {
        "web_description": None,
        "web_description_source": None,
        "web_fetch_status": "not_found",
    }
