"""Read input Excel or CSV file into a list of company dicts."""

import logging
from pathlib import Path
from typing import List, Dict, Any

import pandas as pd

logger = logging.getLogger(__name__)


def read_companies(input_file: str, config: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Read companies from Excel (.xlsx/.xls) or CSV.

    Args:
        input_file: Path to input file.
        config: Pipeline config dict (reads pipeline section for column names).

    Returns:
        List of dicts, one per company, with standardised keys.

    Raises:
        FileNotFoundError: If the file does not exist.
        ValueError: If required name column is missing.
    """
    p = Path(input_file)
    if not p.exists():
        raise FileNotFoundError(f"Input file not found: {input_file}")

    suffix = p.suffix.lower()
    if suffix in (".xlsx", ".xls"):
        df = pd.read_excel(input_file, dtype=str)
    elif suffix == ".csv":
        df = pd.read_csv(input_file, dtype=str)
    else:
        raise ValueError(f"Unsupported input file type: {suffix}. Use .xlsx, .xls, or .csv.")

    df = df.where(pd.notna(df), None)

    pipeline_cfg = config.get("pipeline", {})
    name_col = pipeline_cfg.get("company_name_column", "company_name")
    desc_col = pipeline_cfg.get("description_column", "description")
    domain_col = pipeline_cfg.get("domain_column", "domain")
    uen_col = pipeline_cfg.get("uen_column", "uen")

    # Attempt case-insensitive match for required name column
    col_map = {c.lower(): c for c in df.columns}
    if name_col.lower() not in col_map:
        raise ValueError(
            f"Required column '{name_col}' not found in input file. "
            f"Available columns: {list(df.columns)}"
        )
    name_col_actual = col_map[name_col.lower()]

    def _find_col(target: str) -> str:
        return col_map.get(target.lower(), target)

    companies = []
    for idx, row in df.iterrows():
        company = {
            "row_index": idx,
            "company_name": _safe_str(row.get(name_col_actual)),
            "uen": _safe_str(row.get(_find_col(uen_col))),
            "domain": _safe_str(row.get(_find_col(domain_col))),
            "description": _safe_str(row.get(_find_col(desc_col))),
            "location": _safe_str(row.get(_find_col("location"))),
            "funding_rounds": _safe_str(row.get(_find_col("funding_rounds"))),
            "funding_amount": _safe_str(row.get(_find_col("funding_amount"))),
            "_original_row": {c: row.get(c) for c in df.columns},
        }
        if not company["company_name"]:
            logger.warning(f"Row {idx}: empty company name — skipping.")
            continue
        companies.append(company)

    logger.info(f"Read {len(companies)} companies from {input_file}")
    return companies


def _safe_str(value) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    s = str(value).strip()
    return "" if s.lower() in ("nan", "none", "null") else s
