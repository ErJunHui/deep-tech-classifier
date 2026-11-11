"""
Bridge to the existing EPO patent lookup package.

Imports the EPO package via sys.path and wraps its output into EPOResult.
EPO failures are non-fatal — returns a zeroed EPOResult with status="EPO Error".
"""

import os
import re
import sys
import logging
import time
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class EPOResult:
    patent_count: int = 0
    cpc_codes: List[str] = field(default_factory=list)
    epo_is_deeptech: bool = False
    epo_deeptech_level: str = "Not Deep-tech"
    epo_primary_domain: str = "N/A"
    validation_status: str = "Not Validated"
    patent_titles: List[str] = field(default_factory=list)
    patent_abstracts: List[str] = field(default_factory=list)
    raw_status: str = "Not Run"


_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _resolve_package_dir(epo_package_dir: str) -> str:
    """Relative paths are relative to the project root, not the working directory."""
    path = epo_package_dir or "lib/epo_patent"
    if not os.path.isabs(path):
        path = os.path.join(_PROJECT_ROOT, path)
    return os.path.normpath(path)


def _import_epo_package(epo_package_dir: str) -> bool:
    """Insert EPO package dir at front of sys.path if not already present."""
    if epo_package_dir not in sys.path:
        sys.path.insert(0, epo_package_dir)
    return True


def _build_epo_config(epo_key: str, epo_secret: str, epo_package_dir: str) -> Dict[str, Any]:
    """Build the config dict expected by EPOClient."""
    return {
        "api": {
            "epo_key": epo_key,
            "epo_secret": epo_secret,
            "max_results_per_company": 10,
            "search_delay_seconds": 4,
            "detail_delay_seconds": 2,
            "timeout": 60,
            "throttle_by_header": True,
        },
        "retry": {
            "max_attempts": 3,
            "backoff_factor": 2.0,
            "retry_status_codes": [429, 500, 502, 503, 504],
            "max_delay_seconds": 60,
        },
        "cache": {
            "enabled": True,
            "cache_dir": str(epo_package_dir + "/cache"),
            "expiry_days": 7,
            "cache_search_results": True,
            "cache_biblio_details": True,
            "cache_family_data": True,
        },
        "checkpoint": {
            "enabled": False,
            "checkpoint_dir": "./checkpoints/epo",
            "checkpoint_interval": 5,
            "auto_resume": False,
        },
        "logging": {
            "level": "WARNING",
            "log_to_file": False,
            "log_file_path": "./logs/epo.log",
        },
        "deeptech": {
            "enabled": True,
            "config_file": os.path.join(epo_package_dir, "config", "deeptech_config.json"),
        },
        "name_normalization": {
            "enabled": False,
        },
        "legal_data": {
            "enabled": False,
            "legal_delay_seconds": 2,
            "cache_legal_data": True,
        },
        "search_validation": {
            "enabled": True,
            "validation_mode": "fuzzy",
            "min_similarity_score": 70,
            "uncertain_threshold": 50,
            "fuzzy_matching_algorithm": "token_sort_ratio",
        },
    }


def run_epo_lookup(
    company_name: str,
    epo_key: Optional[str],
    epo_secret: Optional[str],
    epo_package_dir: str,
    description: str = "",
    domain: str = "",
) -> EPOResult:
    """
    Run EPO patent lookup for a single company.

    Args:
        company_name: Original company name.
        epo_key: EPO OPS API key (None → skip EPO).
        epo_secret: EPO OPS API secret (None → skip EPO).
        epo_package_dir: Path to the EPO package root (relative = from project root).
        description: Company description (used for domain coherence check).
        domain: Company domain/sector (used for domain coherence check).

    Returns:
        EPOResult populated from patent data, or a zeroed result on failure.
    """
    if not epo_key or not epo_secret:
        logger.warning("EPO credentials missing — skipping EPO lookup.")
        return EPOResult(raw_status="EPO Credentials Missing")

    epo_package_dir = _resolve_package_dir(epo_package_dir)
    if not os.path.isdir(epo_package_dir):
        logger.error(f"EPO package directory not found: {epo_package_dir} (check epo.epo_package_dir)")
        return EPOResult(raw_status="EPO Import Error")

    try:
        _import_epo_package(epo_package_dir)

        from core.api_client import EPOClient  # type: ignore
        from processors.company_processor import (  # type: ignore
            clean_company_name_for_epo,
            search_and_process_company,
        )
        from utils.namespaces import BIBLIO_NAMESPACES  # type: ignore
        from utils.country_codes import COUNTRY_CODE_MAP  # type: ignore
        from processors.deeptech_classifier import DeepTechClassifier  # type: ignore

    except ImportError as e:
        logger.error(f"Failed to import EPO package from {epo_package_dir}: {e}")
        return EPOResult(raw_status="EPO Import Error")

    try:
        epo_config = _build_epo_config(epo_key, epo_secret, epo_package_dir)
        epo_client = EPOClient(epo_config)
        cleaned_name = clean_company_name_for_epo(company_name)

        mapping_file = os.path.join(epo_package_dir, "config", "deeptech_mapping.json")
        deeptech_classifier = DeepTechClassifier(mapping_file, epo_config["deeptech"])

        logger.info(f"EPO lookup for '{company_name}' (cleaned: '{cleaned_name}')")

        final_status, _err_msg, _total_str, patent_details = search_and_process_company(
            original_name=company_name,
            cleaned_name=cleaned_name,
            epo_client=epo_client,
            namespaces=BIBLIO_NAMESPACES,
            country_code_map=COUNTRY_CODE_MAP,
            max_results=epo_config["api"]["max_results_per_company"],
            search_delay_seconds=epo_config["api"]["search_delay_seconds"],
            detail_delay_seconds=epo_config["api"]["detail_delay_seconds"],
            deeptech_classifier=deeptech_classifier,
            config=epo_config,
        )

        # Small delay to respect EPO rate limits
        time.sleep(epo_config["api"]["search_delay_seconds"])

        result = _build_result_from_details(patent_details, final_status)
        result = _check_domain_coherence(result, description, domain)
        return result

    except Exception as e:
        logger.error(f"EPO lookup failed for '{company_name}': {type(e).__name__}: {e}")
        logger.debug("EPO lookup traceback", exc_info=True)
        return EPOResult(raw_status="EPO Error")


def _build_result_from_details(
    patent_details: List[Dict[str, Any]],
    final_status: str,
) -> EPOResult:
    """Convert list of patent detail dicts into an EPOResult."""
    patent_count = len(patent_details)

    # Collect CPC codes across all patents
    all_cpc_codes: List[str] = []
    titles: List[str] = []
    abstracts: List[str] = []
    validation_statuses: List[str] = []

    for p in patent_details:
        # CPC codes can be stored as list or semicolon-separated string
        raw_cpc = p.get("cpc_codes", [])
        if isinstance(raw_cpc, list):
            all_cpc_codes.extend(raw_cpc)
        elif isinstance(raw_cpc, str) and raw_cpc:
            all_cpc_codes.extend([c.strip() for c in raw_cpc.split(";") if c.strip()])

        title = p.get("title", "") or ""
        if title and title not in ("N/A", ""):
            titles.append(title)

        abstract = p.get("abstract", "") or ""
        if abstract and abstract not in ("N/A", ""):
            abstracts.append(abstract)

        vs = p.get("validation_status", "Not Validated")
        if vs:
            validation_statuses.append(vs)

    # Deduplicate CPC codes while preserving order
    seen: set = set()
    unique_cpcs: List[str] = []
    for c in all_cpc_codes:
        if c not in seen:
            seen.add(c)
            unique_cpcs.append(c)

    # Aggregate DeepTechClassifier output from patent dicts
    best = max(
        (p.get("deeptech_classification", {}) for p in patent_details if p.get("deeptech_classification")),
        key=lambda x: x.get("overall_score", 0),
        default={}
    )
    is_deeptech = any(p.get("deeptech_classification", {}).get("is_deeptech", False) for p in patent_details)
    deeptech_level = best.get("deeptech_level", "Not Deep-tech")
    primary_domain = best.get("primary_domain", "N/A")

    # Aggregate validation status
    if not validation_statuses:
        agg_validation = "Not Validated"
    elif all(v == "Validated" for v in validation_statuses):
        agg_validation = "Validated"
    else:
        agg_validation = validation_statuses[0]

    return EPOResult(
        patent_count=patent_count,
        cpc_codes=unique_cpcs,
        epo_is_deeptech=is_deeptech,
        epo_deeptech_level=deeptech_level,
        epo_primary_domain=primary_domain,
        validation_status=agg_validation,
        patent_titles=titles[:5],
        patent_abstracts=abstracts[:3],
        raw_status=final_status,
    )


# Tech keyword signals for domain coherence check
_TECH_KEYWORDS = {
    'software', 'digital', 'ai', 'ml', 'machine learning', 'artificial intelligence',
    'fintech', 'tech', 'platform', 'cloud', 'saas', 'mobile', 'app', 'data',
    'gaming', 'game', 'e-commerce', 'ecommerce', 'marketplace', 'payment',
    'internet', 'semiconductor', 'biotech', 'medtech', 'deeptech',
    'blockchain', 'robotics', 'autonomous', 'drone', 'iot', 'cyber',
    'quantum', 'nanotech', 'healthtech', 'cleantech', 'edtech',
    'proptech', 'insurtech', 'agritech', 'spacetech', 'space',
    'genomics', 'bioinformatics', 'cybersecurity',
}

_TECH_PATTERNS = list(zip(
    sorted(_TECH_KEYWORDS),
    [re.compile(r'\b' + re.escape(kw) + r'\b', re.IGNORECASE)
     for kw in sorted(_TECH_KEYWORDS)]
))

# CPC sections that clearly indicate non-tech (construction, textiles, mechanics)
_INDUSTRIAL_SECTIONS = {'D', 'E', 'F'}


def _check_domain_coherence(
    result: EPOResult,
    description: str,
    domain: str,
) -> EPOResult:
    """
    Returns a zeroed EPOResult if patents are clearly from a wrong company.

    Detects cases where the searched company appears to be in tech/digital
    but the returned EPO patents are entirely in non-tech industrial sectors
    (CPC sections D, E, F), indicating a name collision with an industrial company.
    """
    if result.patent_count < 2 or not result.cpc_codes:
        return result

    # Only check when we have description/domain context
    text = (description + ' ' + domain).lower()
    if not text.strip():
        return result  # No context to compare against; skip check

    matched_kw = next((kw for kw, p in _TECH_PATTERNS if p.search(text)), None)
    is_tech_company = matched_kw is not None
    if not is_tech_company:
        return result  # Company doesn't appear to be in tech; no mismatch to detect
    logger.debug(f"Tech keyword '{matched_kw}' matched in company text — domain coherence check active")

    # Check if all CPC codes fall in clearly industrial sections
    sections_found = set()
    for code in result.cpc_codes:
        code = code.strip().upper()
        if code:
            sections_found.add(code[0])

    all_industrial = bool(sections_found) and sections_found.issubset(_INDUSTRIAL_SECTIONS)
    if not all_industrial:
        return result  # At least some tech-sector codes present; accept the result

    # Mismatch detected: tech company description but all-industrial CPC codes
    logger.warning(
        f"EPO domain mismatch: description suggests tech company but all patents are "
        f"in section(s) {sorted(sections_found)} (industrial). Likely wrong company "
        f"matched. Zeroing EPO data."
    )
    return EPOResult(
        raw_status=(
            f"EPO Mismatch: patents in section(s) {sorted(sections_found)} "
            f"(industrial) inconsistent with tech company description"
        )
    )


