"""
Reference check: run the pipeline on companies with known verdicts and report
whether the current model still classifies them as expected.

    python -m tests.reference.check              # one run
    python -m tests.reference.check --runs 3     # repeat, to see run-to-run variation
    python -m tests.reference.check --sequential # skip batch mode (faster, full price)

This makes real API calls and costs money. It uses config.json and .env like a
normal run. On a pass, the model is stored in tests/reference/last_validated.json.

Pass rule: every "certain" company gets its expected verdict with no errors,
and at most MAX_BORDERLINE_MISSES "borderline" companies differ, in every run.
"""

from __future__ import annotations

import argparse
import copy
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List
from unittest import mock

import pandas as pd

REFERENCE_FILE = Path(__file__).parent / "companies.xlsx"
MAX_BORDERLINE_MISSES = 1
VERDICTS = ("deep tech", "general tech")
CASE_TYPES = ("certain", "borderline")


def load_expected(path: Path = REFERENCE_FILE) -> List[Dict[str, str]]:
    """company_name, expected_verdict and case_type for each reference company."""
    df = pd.read_excel(path)
    rows = []
    for _, row in df.iterrows():
        verdict = str(row["expected_verdict"]).strip().lower()
        case_type = str(row.get("case_type", "certain")).strip().lower()
        if verdict not in VERDICTS:
            raise ValueError(f"{row['company_name']}: expected_verdict must be one of {VERDICTS}")
        if case_type not in CASE_TYPES:
            raise ValueError(f"{row['company_name']}: case_type must be one of {CASE_TYPES}")
        rows.append({
            "company_name": str(row["company_name"]).strip(),
            "expected_verdict": verdict,
            "case_type": case_type,
        })
    return rows


def compare(expected: List[Dict[str, str]], results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Agreement between expected verdicts and one run's results."""
    misses = []
    for exp, res in zip(expected, results):
        actual = res.get("classification")
        if actual != exp["expected_verdict"]:
            misses.append({**exp, "actual": actual})
    certain = [m for m in misses if m["case_type"] == "certain"]
    borderline = [m for m in misses if m["case_type"] == "borderline"]
    errors = [m for m in misses if m["actual"] not in VERDICTS]
    return {
        "total": len(expected),
        "agreed": len(expected) - len(misses),
        "misses": misses,
        "certain_misses": len(certain),
        "borderline_misses": len(borderline),
        "errors": len(errors),
        "passed": not certain and not errors and len(borderline) <= MAX_BORDERLINE_MISSES,
    }


def summarize(report: Dict[str, Any]) -> str:
    return (
        f"{report['agreed']}/{report['total']} agreed "
        f"({report['certain_misses']} certain missed, "
        f"{report['borderline_misses']} borderline missed, {report['errors']} errors)"
    )


def _run_once(companies, config, run_number: int) -> tuple:
    from pipeline import orchestrator as orch

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = f"checkpoints/reference/reference_{stamp}_run{run_number}.xlsx"
    # Keep the check's run state apart from a real run that may be resumed later,
    # and skip the "not validated" warning: validating is what this is doing.
    with mock.patch.object(orch, "RUN_STATE_FILE", "checkpoints/reference/run_state.json"), \
            mock.patch.object(orch, "_warn_if_unvalidated", lambda model_info: None):
        results = orch.run_pipeline(companies, config, output_path)
        model_info = (orch.load_run_state() or {}).get("model") or {}
    return results, model_info


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--runs", type=int, default=1, help="number of repeat runs (default 1)")
    parser.add_argument("--sequential", action="store_true", help="do not use batch mode")
    parser.add_argument("--config", default=None, help="path to config.json")
    args = parser.parse_args(argv)

    from data.reader import read_companies
    from pipeline import validation_record
    from pipeline.settings import load_settings

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    config = copy.deepcopy(load_settings(args.config))
    # The reference file uses the default column names, whatever config.json maps.
    for key in ("company_name_column", "description_column", "domain_column", "uen_column"):
        config.setdefault("pipeline", {}).pop(key, None)
    if args.sequential:
        config.setdefault("batch", {})["enabled"] = False

    expected = load_expected()
    companies = read_companies(str(REFERENCE_FILE), config)
    for company in companies:  # the answers are never part of what a run sees or writes
        for column in ("expected_verdict", "case_type"):
            company.get("_original_row", {}).pop(column, None)

    reports, verdicts, model_info = [], [], {}
    for run in range(1, args.runs + 1):
        results, model_info = _run_once(companies, config, run)
        report = compare(expected, results)
        reports.append(report)
        verdicts.append([r.get("classification") for r in results])
        print(f"\nRun {run}/{args.runs}: {summarize(report)}")
        for miss in report["misses"]:
            print(f"  [{miss['case_type']}] {miss['company_name']}: "
                  f"expected {miss['expected_verdict']}, got {miss['actual']}")

    if args.runs > 1:
        unstable = [
            exp["company_name"] for i, exp in enumerate(expected)
            if len({run[i] for run in verdicts}) > 1
        ]
        print(f"\nVerdict changed between runs for {len(unstable)} of {len(expected)} companies"
              + (f": {', '.join(unstable)}" if unstable else "."))

    provider = model_info.get("provider") or config.get("llm", {}).get("provider", "anthropic")
    model = model_info.get("reported") or model_info.get("requested")
    passed = all(r["passed"] for r in reports)
    print(f"\nModel: {model} ({provider})")
    if passed:
        summary = "; ".join(summarize(r) for r in reports)
        validation_record.record(provider, model, model_info.get("requested"), summary)
        print(f"PASS. Recorded in {validation_record.RECORD_FILE.name}; commit that file.")
        return 0
    print("FAIL. This model's verdicts differ from the reference set; "
          "review the misses above before using it.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
