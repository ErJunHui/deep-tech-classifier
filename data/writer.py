"""Write classification results to Excel with three purpose-built sheets."""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

import pandas as pd
from openpyxl import load_workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

from pipeline import models as _models
from pipeline import review as _review

logger = logging.getLogger(__name__)


def _format_criterion(criterion: dict | None) -> str:
    """Format a criteria dict as 'Yes — <reasoning>' or 'No — <reasoning>'."""
    if not criterion or not isinstance(criterion, dict):
        return "N/A — criteria not assessed"
    met = criterion.get("met")
    reasoning = criterion.get("reasoning", "").strip()
    label = "Yes" if met else "No"
    return f"{label} — {reasoning}" if reasoning else label


# Columns appended to original data
RESULT_COLUMNS = [
    "web_description",
    "web_description_source",
    "web_fetch_status",
    "classification",
    "confidence",
    "reasoning",
    "patent_count",
    "epo_is_deeptech",
    "epo_deeptech_level",
    "epo_primary_domain",
    "cpc_codes",
    "epo_validation_status",
    "validator_triggered",
    "validator_verdict",
    "validator_updated_confidence",
    "classification_disputed",
    "validator_flags",
    "web_evidence_summary",
    "sources_checked",
    "signal_score_epo",
    "signal_score_llm",
    "signal_score_validator",
    "processing_time_s",
    "processing_errors",
    "classifier_flags",
    "flags",
    "classification_basis",
    "criteria",
    "cpc_analysis",
    "self_audit",
    "validation_decision",
    "escalation_reason",
    "checks",
    "classifier_input_tokens",
    "classifier_output_tokens",
    "validator_input_tokens",
    "validator_output_tokens",
    "enrichment_input_tokens",
    "enrichment_output_tokens",
    "total_cost_usd",
    "model",
]

MANAGEMENT_COLUMNS = [
    "Company Name",
    "UEN",
    "Verdict",
    "Criteria 1: Innovation",
    "Criteria 2: Scientific Foundation",
    "Criteria 3: Proprietary IP",
    "Confidence Score",
    "Confidence Tier",
    "Risk Flag",
    "Action Required",
    "Key Reason",
    "Full Reasoning",
    "Patents Found",
]

# Fill colours
FILL_GREEN = PatternFill("solid", fgColor="A7FC92")
FILL_RED = PatternFill("solid", fgColor="FF9999")
FILL_GREY = PatternFill("solid", fgColor="CCCCCC")
FILL_AMBER = PatternFill("solid", fgColor="FFB347")
FILL_ORANGE = PatternFill("solid", fgColor="FFCC99")
FILL_YELLOW = PatternFill("solid", fgColor="FFFF99")
FILL_HEADER = PatternFill("solid", fgColor="BDD7EE")
FILL_AMBER_LIGHT = PatternFill("solid", fgColor="FFE5B4")  # for overview amber


def make_output_path(input_file: str, output_dir: Optional[str] = None) -> str:
    """Build output file path: {stem}_classified_{timestamp}.xlsx"""
    stem = Path(input_file).stem
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{stem}_classified_{ts}.xlsx"
    if output_dir:
        return str(Path(output_dir) / filename)
    return str(Path(input_file).parent / filename)


def write_results(
    output_path: str,
    companies: List[Dict[str, Any]],
    results: List[Dict[str, Any]],
    run_stats: Dict[str, Any],
) -> None:
    """
    Write results to an Excel file with three sheets:
      Sheet 1: Overview — vertical metrics dashboard.
      Sheet 2: Management View — 10-col decision sheet with colour coding.
      Sheet 3: Full Detail — every result column.
    """
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    rows = _build_flat_rows(companies, results)
    results_df = pd.DataFrame(rows)

    # Write all sheets via pandas first (gives us a workbook to open with openpyxl)
    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        # Placeholder sheets — content applied via openpyxl below
        pd.DataFrame().to_excel(writer, sheet_name="Overview", index=False)
        pd.DataFrame().to_excel(writer, sheet_name="Management View", index=False)
        results_df.to_excel(writer, sheet_name="Full Detail", index=False)
        pd.DataFrame().to_excel(writer, sheet_name="Legend", index=False)

    # Now re-open with openpyxl and apply all styling/content
    wb = load_workbook(output_path)
    _write_overview_sheet(wb, results, run_stats)
    _write_management_sheet(wb, results, companies)
    _write_detail_sheet(wb, results_df)
    _write_legend_sheet(wb, run_stats.get("model"))
    wb.save(output_path)

    logger.info(f"Results written to {output_path}")


def write_incremental(
    output_path: str,
    all_companies: List[Dict[str, Any]],
    all_results: List[Dict[str, Any]],
) -> None:
    """
    Overwrite output file with current completed results (called after each checkpoint).
    Writes Management View and Full Detail sheets (no Overview — run not yet complete).
    """
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    rows = _build_flat_rows(all_companies, all_results)
    df = pd.DataFrame(rows)

    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        pd.DataFrame().to_excel(writer, sheet_name="Management View", index=False)
        df.to_excel(writer, sheet_name="Full Detail", index=False)
        pd.DataFrame().to_excel(writer, sheet_name="Legend", index=False)

    wb = load_workbook(output_path)
    _write_management_sheet(wb, all_results, all_companies)
    _write_detail_sheet(wb, df)
    _write_legend_sheet(wb)
    wb.save(output_path)

    logger.debug(f"Incremental write: {len(rows)} rows to {output_path}")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

# Columns that contain dict values and should use human-readable formatting
_DICT_COLUMNS = {"key_signals", "criteria", "cpc_analysis", "self_audit", "checks"}


def _dict_to_readable(d: dict) -> str:
    """Convert a dict to a human-readable multi-line string for Excel display."""
    lines = []
    for k, v in d.items():
        if isinstance(v, dict):
            lines.append(f"{k}:")
            for sk, sv in v.items():
                lines.append(f"  {sk}: {sv}")
        elif isinstance(v, list):
            lines.append(f"{k}: {'; '.join(str(x) for x in v)}")
        else:
            lines.append(f"{k}: {v}")
    return "\n".join(lines)


def _build_flat_rows(
    companies: List[Dict[str, Any]],
    results: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Merge original company rows with result columns."""
    rows = []
    for company, result in zip(companies, results):
        row = dict(company.get("_original_row", {}))
        for col in RESULT_COLUMNS:
            val = result.get(col, "")
            if isinstance(val, list):
                val = "; ".join(str(v) for v in val)
            elif isinstance(val, dict):
                val = _dict_to_readable(val) if col in _DICT_COLUMNS else json.dumps(val)
            row[col] = val
        rows.append(row)
    return rows


def _build_management_row(
    company: Dict[str, Any],
    result: Dict[str, Any],
) -> Dict[str, Any]:
    """Synthesize a single Management View row from a company + result pair."""
    original = company.get("_original_row", {})
    # Use the values the reader resolved from the configured columns; fall back
    # to common header spellings for callers that only pass the original row.
    company_name = (
        company.get("company_name")
        or result.get("company_name")
        or original.get("company_name", original.get("Company Name", ""))
    )
    uen = company.get("uen") or original.get("uen", original.get("UEN", ""))

    verdict = result.get("classification", "")
    confidence = result.get("confidence", 0) or 0
    reasoning = result.get("reasoning", "") or ""
    patent_count = result.get("patent_count", 0) or 0

    tier = _review.confidence_tier(confidence)
    risk_flag = _review.risk_flag(result)
    action = _review.action_required(verdict, risk_flag)

    # Key Reason — first ~200 chars
    key_reason = reasoning[:200] + "…" if len(reasoning) > 200 else reasoning

    criteria = result.get("criteria") or {}
    if isinstance(criteria, str):
        try:
            criteria = json.loads(criteria)
        except (json.JSONDecodeError, TypeError):
            criteria = {}

    return {
        "Company Name": company_name,
        "UEN": uen,
        "Verdict": verdict,
        "Criteria 1: Innovation": _format_criterion(criteria.get("innovation")),
        "Criteria 2: Scientific Foundation": _format_criterion(criteria.get("scientific_foundation")),
        "Criteria 3: Proprietary IP": _format_criterion(criteria.get("proprietary_ip")),
        "Confidence Score": confidence,
        "Confidence Tier": tier,
        "Risk Flag": risk_flag,
        "Action Required": action,
        "Key Reason": key_reason,
        "Full Reasoning": reasoning,
        "Patents Found": patent_count,
        # Internal metadata for sorting
        "_escalate": 1 if risk_flag == "Escalate" else 0,
        "_confidence": confidence,
    }


def _write_overview_sheet(
    wb,
    results: List[Dict[str, Any]],
    run_stats: Dict[str, Any],
) -> None:
    """Populate the Overview sheet with a vertical metrics dashboard."""
    ws = wb["Overview"]

    # Clear placeholder content
    for row in ws.iter_rows():
        for cell in row:
            cell.value = None

    total = len(results)
    deep_tech = sum(1 for r in results if r.get("classification") == "deep tech")
    general_tech = sum(1 for r in results if r.get("classification") == "general tech")
    errors = sum(1 for r in results if r.get("classification") == "error")
    non_error = max(1, total - errors)

    confidences = [r.get("confidence", 0) or 0 for r in results if r.get("classification") != "error"]
    high_conf = sum(1 for c in confidences if c >= 75)
    med_conf = sum(1 for c in confidences if 50 <= c < 75)
    low_conf = sum(1 for c in confidences if c < 50)
    escalations = sum(1 for r in results if r.get("validation_decision") == "ESCALATE_FOR_HUMAN_REVIEW")
    disputed = sum(1 for r in results if r.get("classification_disputed"))

    def pct(n, d):
        return f"{100 * n / d:.1f}%" if d else "0.0%"

    sections = [
        # (group_label, [(metric_label, value), ...])
        ("Batch Summary", [
            ("Total Companies Processed", total),
            ("Deep Tech", f"{deep_tech} ({pct(deep_tech, non_error)})"),
            ("General Tech", f"{general_tech} ({pct(general_tech, non_error)})"),
            ("Error", errors),
        ]),
        ("Decision Quality", [
            ("High Confidence (≥75)", f"{high_conf} ({pct(high_conf, total)})"),
            ("Medium Confidence (50–74)", f"{med_conf} ({pct(med_conf, total)})"),
            ("Low Confidence (<50)", f"{low_conf} ({pct(low_conf, total)})"),
            ("Escalations Pending", escalations),
            ("Contested Classifications", disputed),
        ]),
        ("Run Info", [
            ("Run ID", run_stats.get("run_id", "N/A")),
            ("Start Time", run_stats.get("start_time", "N/A")),
            ("End Time", run_stats.get("end_time", "N/A")),
            ("Total Runtime", run_stats.get("total_runtime_s", "N/A")),
        ]),
        ("Model", _model_metrics(run_stats.get("model") or {})),
        ("Cost", _cost_metrics(results, run_stats.get("model") or {})),
    ]

    style_group_header = Font(bold=True, size=12)
    style_metric = Font(size=11)
    style_value = Font(size=11)
    fill_group = PatternFill("solid", fgColor="D9E1F2")

    row_idx = 1
    for group_label, metrics in sections:
        # Group header
        cell = ws.cell(row=row_idx, column=1, value=group_label)
        cell.font = style_group_header
        cell.fill = fill_group
        ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=2)
        row_idx += 1

        for metric_label, value in metrics:
            lbl_cell = ws.cell(row=row_idx, column=1, value=metric_label)
            lbl_cell.font = style_metric
            val_cell = ws.cell(row=row_idx, column=2, value=value)
            val_cell.font = style_value

            # Amber highlight if escalations > 0
            if metric_label == "Escalations Pending" and escalations > 0:
                val_cell.fill = FILL_AMBER

            row_idx += 1

        row_idx += 1  # blank row between groups

    # Column widths
    ws.column_dimensions["A"].width = 36
    ws.column_dimensions["B"].width = 28


def _model_metrics(model: Dict[str, Any]) -> List[tuple]:
    """Overview rows naming the model that produced this file."""
    source = model.get("source")
    if source == "tier":
        selected = f"tier '{model.get('tier')}'"
    elif source == "pinned":
        selected = "pinned in config"
    else:
        selected = "N/A"
    metrics = [
        ("Provider", model.get("provider") or "N/A"),
        ("Model Requested", model.get("requested") or "N/A"),
        ("Model Reported by API", model.get("reported") or "N/A"),
        ("Selected By", selected),
    ]
    if model.get("search_model"):
        metrics.append(("Web-Search Model", model["search_model"]))
    return metrics


_TOKEN_COLUMNS = [
    "classifier_input_tokens", "validator_input_tokens", "enrichment_input_tokens",
    "classifier_output_tokens", "validator_output_tokens", "enrichment_output_tokens",
]


def _cost_metrics(results: List[Dict[str, Any]], model: Dict[str, Any]) -> List[tuple]:
    """Overview rows for token totals and the cost estimate."""
    def total(columns):
        return sum((r.get(c) or 0) for r in results for c in columns)

    costs = [r.get("total_cost_usd", 0.0) for r in results]
    if any(c is None for c in costs):
        name = model.get("reported") or model.get("requested") or "this model"
        cost = f"unknown (no price for {name})"
    else:
        cost = f"${sum(costs):.4f}"
    return [
        ("Total Input Tokens", total(_TOKEN_COLUMNS[:3])),
        ("Total Output Tokens", total(_TOKEN_COLUMNS[3:])),
        ("Estimated Cost (USD)", cost),
    ]


def _cost_legend(model: Optional[Dict[str, Any]]) -> str:
    """Describe how total_cost_usd was computed for the model that produced the file."""
    base = "Estimated cost for all three agents (Agent 0 enrichment + Agent 1 classifier + Agent 2 validator): "
    model = model or {}
    requested = model.get("requested")
    rates = None
    for name in (requested, model.get("reported")):
        if name:
            rates = _models.COST_RATES.get(name) or _models.COST_RATES.get(_models.base_model_id(name))
        if rates:
            break
    if rates:
        search = rates.get("web_search")
        search_text = f" + ${search:.3f} per web search" if search else ""
        return (
            f"{base}input tokens × ${rates['input'] * 1e6:.2f}/1M + output tokens × "
            f"${rates['output'] * 1e6:.2f}/1M ({name} rates){search_text}. "
            "Batch classifier calls are billed at half the token rates"
        )
    if requested:
        return (
            f"{base}blank because no price is listed for {model.get('reported') or requested} "
            "in pipeline/models.py. Use the token columns to work the cost out"
        )
    return (
        f"{base}tokens × the model's listed per-token rates + the provider's fee per web search "
        "(rates are in pipeline/models.py); blank when the model has no listed price"
    )


def _write_management_sheet(
    wb,
    results: List[Dict[str, Any]],
    companies: List[Dict[str, Any]],
) -> None:
    """Populate the Management View sheet with styled 10-column layout."""
    ws = wb["Management View"]

    # Clear placeholder content
    for row in ws.iter_rows():
        for cell in row:
            cell.value = None

    # Build management rows
    mgmt_rows = [
        _build_management_row(company, result)
        for company, result in zip(companies, results)
    ]

    # Sort: Escalations first, then by confidence descending
    mgmt_rows.sort(key=lambda r: (-r["_escalate"], -r["_confidence"]))

    # Write header
    header_font = Font(bold=True)
    for col_idx, col_name in enumerate(MANAGEMENT_COLUMNS, start=1):
        cell = ws.cell(row=1, column=col_idx, value=col_name)
        cell.font = header_font
        cell.fill = FILL_HEADER
        cell.alignment = Alignment(wrap_text=False)

    # Freeze header row
    ws.freeze_panes = "A2"

    # Write data rows
    for row_idx, mgmt_row in enumerate(mgmt_rows, start=2):
        verdict = mgmt_row["Verdict"]
        risk_flag = mgmt_row["Risk Flag"]
        tier = mgmt_row["Confidence Tier"]

        for col_idx, col_name in enumerate(MANAGEMENT_COLUMNS, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=mgmt_row[col_name])

            # Verdict colour (column 3)
            if col_name == "Verdict":
                if verdict == "deep tech":
                    cell.fill = FILL_GREEN
                elif verdict == "general tech":
                    cell.fill = FILL_RED
                elif verdict == "error":
                    cell.fill = FILL_GREY

            # Risk Flag colour (column 6)
            elif col_name == "Risk Flag":
                if risk_flag == "Escalate":
                    cell.fill = FILL_AMBER
                elif risk_flag == "Contested":
                    cell.fill = FILL_ORANGE
                elif risk_flag == "Uncertain":
                    cell.fill = FILL_YELLOW

            # Confidence Tier style (column 5)
            elif col_name == "Confidence Tier":
                if tier == "High":
                    cell.font = Font(bold=True)
                elif tier == "Low":
                    cell.font = Font(italic=True)

            # Full Reasoning wrap text (column 9)
            elif col_name == "Full Reasoning":
                cell.alignment = Alignment(wrap_text=True)

    # Auto-filter
    ws.auto_filter.ref = f"A1:{get_column_letter(len(MANAGEMENT_COLUMNS))}1"

    # Column widths
    col_widths = {
        "Company Name": 30,
        "UEN": 15,
        "Verdict": 14,
        "Criteria 1: Innovation": 50,
        "Criteria 2: Scientific Foundation": 50,
        "Criteria 3: Proprietary IP": 50,
        "Confidence Score": 17,
        "Confidence Tier": 16,
        "Risk Flag": 12,
        "Action Required": 16,
        "Key Reason": 50,
        "Full Reasoning": 60,
        "Patents Found": 14,
    }
    for col_idx, col_name in enumerate(MANAGEMENT_COLUMNS, start=1):
        ws.column_dimensions[get_column_letter(col_idx)].width = col_widths.get(col_name, 15)


def _write_detail_sheet(wb, results_df: pd.DataFrame) -> None:
    """Style the Full Detail sheet: frozen header, auto-filter, bold header, wrap dict columns."""
    ws = wb["Full Detail"]

    # Header styling
    header_font = Font(bold=True)
    header_fill = FILL_HEADER
    for cell in ws[1]:
        cell.font = header_font
        cell.fill = header_fill

    # Freeze header row
    ws.freeze_panes = "A2"

    # Auto-filter across all columns
    last_col = get_column_letter(ws.max_column)
    ws.auto_filter.ref = f"A1:{last_col}1"

    # Find dict column indices and enable wrap text
    col_names = [cell.value for cell in ws[1]]
    wrap_col_indices = {
        idx + 1 for idx, name in enumerate(col_names) if name in _DICT_COLUMNS
    }
    if wrap_col_indices:
        for row in ws.iter_rows(min_row=2):
            for cell in row:
                if cell.column in wrap_col_indices:
                    cell.alignment = Alignment(wrap_text=True, vertical="top")


def _write_legend_sheet(wb, model: Optional[Dict[str, Any]] = None) -> None:
    """Add a Legend sheet explaining column values."""
    if "Legend" not in wb.sheetnames:
        wb.create_sheet("Legend")
    ws = wb["Legend"]
    ws.sheet_properties.tabColor = "808080"

    # Clear any existing content
    for row in ws.iter_rows():
        for cell in row:
            cell.value = None

    headers = ["Column", "Sheet", "Possible Values", "Meaning"]
    legend_rows = [
        # --- Management View ---
        ("risk_flag", "Management View",
         "Escalate / Contested / Uncertain / Clear",
         "Escalate = validator recommended human review; "
         "Contested = LLM and validator disagreed; "
         "Uncertain = validator triggered AND confidence < 70; "
         "Clear = no red flags, normal result"),
        ("Verdict", "Management View",
         "deep tech / general tech / error",
         "Agent 1 classification, possibly overridden by Agent 2"),
        ("Confidence Tier", "Management View",
         "High / Medium / Low",
         "High = confidence ≥75; Medium = 50–74; Low = <50"),
        ("Action Required", "Management View",
         "Approve / Reject / Needs Review",
         "Approve = Verdict is 'deep tech' AND Risk Flag is 'Clear'; "
         "Reject = Verdict is 'general tech' AND Risk Flag is 'Clear'; "
         "Needs Review = processing error OR Risk Flag is Escalate / Contested / Uncertain"),
        ("Criteria 1: Innovation", "Management View",
         "Yes — <reasoning> / No — <reasoning> / N/A — criteria not assessed",
         "Whether Agent 1 found novel technology innovation beyond current industry practice; "
         "N/A when the criteria was not assessed (e.g. on error or missing description)"),
        ("Criteria 2: Scientific Foundation", "Management View",
         "Yes — <reasoning> / No — <reasoning> / N/A — criteria not assessed",
         "Whether the company's technology has hard-science grounding "
         "(physics, chemistry, biology, materials science, etc.) rather than being purely software or a business-model innovation; "
         "N/A when the criteria was not assessed"),
        ("Criteria 3: Proprietary IP", "Management View",
         "Yes — <reasoning> / No — <reasoning> / N/A — criteria not assessed",
         "Whether the company has meaningful intellectual-property barriers "
         "(granted patents, trade secrets, or defensible proprietary know-how); "
         "N/A when the criteria was not assessed"),
        # --- Full Detail — booleans / enums ---
        ("validator_triggered", "Full Detail",
         "True / False",
         "True = Agent 2 ran web search validation; False = only Agent 1 used"),
        ("classification_disputed", "Full Detail",
         "True / False",
         "True = Agent 2 attempted override but it was blocked (its confidence was below override_min_confidence)"),
        ("validation_decision", "Full Detail",
         "AUTO_APPROVE / ESCALATE_FOR_HUMAN_REVIEW / (empty)",
         "AUTO_APPROVE = Agent 2 confident in result; "
         "ESCALATE = contradictory or insufficient evidence; "
         "empty = validator not triggered"),
        ("epo_validation_status", "Full Detail",
         "success / no_results / EPO Error / EPO Disabled",
         "Status returned by the EPO patent lookup step"),
        ("classification_basis", "Full Detail",
         "PATENT_CPC / DESCRIPTION_ONLY / WEB_DESCRIPTION / COMBINED",
         "What evidence Agent 1 primarily relied on for its classification"),
        ("web_fetch_status", "Full Detail",
         "found / not_found / error",
         "found = Agent 0 successfully retrieved a web description for the company; "
         "not_found = web search returned no usable result; "
         "error = the fetch attempt raised an exception"),
        ("epo_is_deeptech", "Full Detail",
         "True / False",
         "EPO's own deep tech determination based on CPC code analysis of the company's patent portfolio; "
         "False also appears when the company has no EPO patents"),
        ("epo_deeptech_level", "Full Detail",
         "Very Strong / Strong / Moderate / Not Deep-tech",
         "Granular deep tech strength derived from heuristic scoring of EPO CPC codes; "
         "Very Strong = highest CPC concentration in frontier tech domains; "
         "Not Deep-tech = portfolio is absent or composed of non-frontier codes"),
        ("validator_verdict", "Full Detail",
         "confirm / override / insufficient_evidence / (empty)",
         "confirm = Agent 2 agreed with Agent 1's verdict after web search; "
         "override = Agent 2 disagreed with the verdict (applied unless classification_disputed is True); "
         "insufficient_evidence = Agent 2 could not find enough web evidence to reach a verdict; "
         "empty = validator was not triggered (final_confidence ≥ 70)"),
        # --- Full Detail — token counts & cost ---
        ("classifier_input_tokens", "Full Detail",
         "integer ≥ 0",
         "Token count sent to Agent 1 (classifier) — 0 on error"),
        ("classifier_output_tokens", "Full Detail",
         "integer ≥ 0",
         "Token count returned by Agent 1 — 0 on error"),
        ("validator_input_tokens", "Full Detail",
         "integer ≥ 0",
         "Token count sent to Agent 2 across all turns; 0 if validator not triggered"),
        ("validator_output_tokens", "Full Detail",
         "integer ≥ 0",
         "Token count returned by Agent 2 across all turns; 0 if validator not triggered"),
        ("enrichment_input_tokens", "Full Detail",
         "integer ≥ 0",
         "Token count sent to Agent 0 (web enrichment) across all API turns including web search result content"),
        ("enrichment_output_tokens", "Full Detail",
         "integer ≥ 0",
         "Token count returned by Agent 0 across all turns"),
        ("total_cost_usd", "Full Detail",
         "float (USD)",
         _cost_legend(model)),
        ("model", "Full Detail",
         "string",
         "Model ID the API reported for this company's classifier call; empty on error. "
         "The Overview sheet shows the model requested and how it was selected"),
    ]

    # Header row
    header_fill = PatternFill("solid", fgColor="2E75B6")
    header_font = Font(bold=True, color="FFFFFF")
    for col_idx, h in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(wrap_text=False)

    # Data rows
    for row_idx, (col, sheet, values, meaning) in enumerate(legend_rows, start=2):
        ws.cell(row=row_idx, column=1, value=col)
        ws.cell(row=row_idx, column=2, value=sheet)
        ws.cell(row=row_idx, column=3, value=values)
        meaning_cell = ws.cell(row=row_idx, column=4, value=meaning)
        meaning_cell.alignment = Alignment(wrap_text=True, vertical="top")

        # Alternate row shading
        if row_idx % 2 == 0:
            fill = PatternFill("solid", fgColor="F2F2F2")
            for col_idx in range(1, 5):
                ws.cell(row=row_idx, column=col_idx).fill = fill

    # Column widths
    ws.column_dimensions["A"].width = 28
    ws.column_dimensions["B"].width = 18
    ws.column_dimensions["C"].width = 38
    ws.column_dimensions["D"].width = 65

    # Freeze header
    ws.freeze_panes = "A2"


def _build_summary_df(results: List[Dict[str, Any]], run_stats: Dict[str, Any]) -> pd.DataFrame:
    """Legacy helper kept for backwards compatibility (not used by write_results)."""
    total = len(results)
    deep_tech = sum(1 for r in results if r.get("classification") == "deep tech")
    general_tech = sum(1 for r in results if r.get("classification") == "general tech")
    errors = sum(1 for r in results if r.get("classification") == "error")
    validator_triggered = sum(1 for r in results if r.get("validator_triggered"))
    overrides = sum(
        1 for r in results
        if r.get("validator_triggered") and r.get("validator_verdict") == "override"
    )
    disputed = sum(1 for r in results if r.get("classification_disputed"))
    has_flags = sum(1 for r in results if r.get("flags") or r.get("validator_flags"))
    escalated = sum(1 for r in results if r.get("validation_decision") == "ESCALATE_FOR_HUMAN_REVIEW")
    avg_confidence = (
        sum(r.get("confidence", 0) for r in results if r.get("classification") != "error") /
        max(1, total - errors)
    )
    total_patents = sum(r.get("patent_count", 0) for r in results)

    rows = [
        ("Total companies processed", total),
        ("Deep tech", deep_tech),
        ("General tech", general_tech),
        ("Errors", errors),
        ("Deep tech rate (%)", f"{100 * deep_tech / max(1, total - errors):.1f}"),
        ("Average confidence", f"{avg_confidence:.1f}"),
        ("Validator triggered", validator_triggered),
        ("Validator overrides", overrides),
        ("Classification disputed (override blocked)", disputed),
        ("Has validator flags", has_flags),
        ("Escalated for human review", escalated),
        ("Total patents found (EPO)", total_patents),
        ("Total runtime (s)", run_stats.get("total_runtime_s", "N/A")),
        ("Run ID", run_stats.get("run_id", "N/A")),
        ("Start time", run_stats.get("start_time", "N/A")),
        ("End time", run_stats.get("end_time", "N/A")),
    ]

    return pd.DataFrame(rows, columns=["Metric", "Value"])
