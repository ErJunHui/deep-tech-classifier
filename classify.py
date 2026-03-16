#!/usr/bin/env python3
"""
Deep Tech / General Tech Classification Pipeline
Entry point: python classify.py --input companies.xlsx [--resume]
"""

import argparse
import logging
import os
import signal
import sys
import time
from datetime import datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path

# Ensure the package root is on the path when invoked directly
sys.path.insert(0, str(Path(__file__).parent))

from pipeline.settings import load_settings, ConfigError
from data.reader import read_companies
from data.writer import make_output_path, write_results
from pipeline.orchestrator import run_pipeline, load_run_state


def setup_logging(log_level: str = "INFO") -> None:
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)

    fmt = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    handlers = [
        logging.StreamHandler(sys.stdout),
        RotatingFileHandler(log_dir / "classify.log", maxBytes=10_000_000, backupCount=3, encoding="utf-8"),
    ]
    logging.basicConfig(level=getattr(logging, log_level.upper(), logging.INFO), format=fmt, handlers=handlers)

    # Quieten noisy third-party loggers
    for noisy in ("urllib3", "requests", "anthropic", "httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Classify Singapore startups as deep tech or general tech."
    )
    parser.add_argument(
        "--input", "-i",
        help="Path to input Excel/CSV file (overrides config.json pipeline.input_file).",
    )
    parser.add_argument(
        "--output", "-o",
        help="Output directory (default: same dir as input file).",
    )
    parser.add_argument(
        "--resume", "-r",
        action="store_true",
        help="Resume from last checkpoint.",
    )
    parser.add_argument(
        "--config", "-c",
        default=None,
        help="Path to config.json (default: deep_tech_classifier/config.json).",
    )
    parser.add_argument(
        "--env",
        default=None,
        help="Path to .env file (default: deep_tech_classifier/.env).",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
    )
    parser.add_argument(
        "--company-col",
        default=None,
        help="Override pipeline.company_name_column (column header in input file).",
    )
    parser.add_argument(
        "--desc-col",
        default=None,
        help="Override pipeline.description_column.",
    )
    parser.add_argument(
        "--domain-col",
        default=None,
        help="Override pipeline.domain_column.",
    )
    parser.add_argument(
        "--uen-col",
        default=None,
        help="Override pipeline.uen_column.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    setup_logging(args.log_level)
    logger = logging.getLogger("classify")

    # Load config
    try:
        config = load_settings(config_path=args.config, env_path=args.env)
    except ConfigError as e:
        print(f"[FATAL] Configuration error: {e}", file=sys.stderr)
        sys.exit(1)

    # Apply column-name overrides from CLI
    if args.company_col:
        config.setdefault("pipeline", {})["company_name_column"] = args.company_col
    if args.desc_col:
        config.setdefault("pipeline", {})["description_column"] = args.desc_col
    if args.domain_col:
        config.setdefault("pipeline", {})["domain_column"] = args.domain_col
    if args.uen_col:
        config.setdefault("pipeline", {})["uen_column"] = args.uen_col

    # Resolve input file
    input_file = args.input or config.get("pipeline", {}).get("input_file", "companies.xlsx")
    if not Path(input_file).is_absolute():
        input_file = str(Path.cwd() / input_file)

    if not Path(input_file).exists():
        print(f"[FATAL] Input file not found: {input_file}", file=sys.stderr)
        sys.exit(1)

    # Read companies
    try:
        companies = read_companies(input_file, config)
    except (FileNotFoundError, ValueError) as e:
        print(f"[FATAL] Could not read input file: {e}", file=sys.stderr)
        sys.exit(1)

    if not companies:
        print("[FATAL] No companies found in input file.", file=sys.stderr)
        sys.exit(1)

    # Resolve output path
    output_path = make_output_path(input_file, args.output)

    # Resume logic
    resume_run_id = None
    if args.resume:
        state = load_run_state()
        if state:
            resume_run_id = state.get("run_id")
            logger.info(f"Resuming run: {resume_run_id}")
        else:
            logger.warning("--resume specified but no run_state.json found. Starting fresh.")

    logger.info(f"Starting pipeline: {len(companies)} companies → {output_path}")
    start_time = datetime.now()
    t_start = time.time()

    # Graceful shutdown handler
    results_so_far: list = []

    def _handle_sigint(signum, frame):
        logger.warning("Interrupted! Writing partial results...")
        if results_so_far:
            done = [c for c in companies if c["company_name"] in {r.get("company_name") for r in results_so_far}]
            from data.writer import write_incremental
            write_incremental(output_path, done, results_so_far)
            logger.info(f"Partial results saved to {output_path}")
        sys.exit(0)

    signal.signal(signal.SIGINT, _handle_sigint)

    # Run pipeline
    results = run_pipeline(
        companies=companies,
        config=config,
        output_path=output_path,
        resume_run_id=resume_run_id,
    )
    results_so_far.extend(results)

    t_end = time.time()
    end_time = datetime.now()
    total_runtime = round(t_end - t_start, 1)

    # Final write with summary
    run_stats = {
        "run_id": resume_run_id or "new",
        "start_time": start_time.isoformat(),
        "end_time": end_time.isoformat(),
        "total_runtime_s": total_runtime,
    }

    write_results(output_path, companies, results, run_stats)

    # Print summary
    total = len(results)
    deep_tech = sum(1 for r in results if r.get("classification") == "deep tech")
    general_tech = sum(1 for r in results if r.get("classification") == "general tech")
    errors = sum(1 for r in results if r.get("classification") == "error")

    print("\n" + "=" * 60)
    print("CLASSIFICATION COMPLETE")
    print("=" * 60)
    print(f"  Total companies:  {total}")
    print(f"  Deep tech:        {deep_tech} ({100*deep_tech/max(1,total-errors):.1f}%)")
    print(f"  General tech:     {general_tech} ({100*general_tech/max(1,total-errors):.1f}%)")
    print(f"  Errors:           {errors}")
    print(f"  Runtime:          {total_runtime}s")
    print(f"  Output:           {output_path}")
    print("=" * 60)


if __name__ == "__main__":
    main()
