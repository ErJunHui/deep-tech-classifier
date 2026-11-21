#!/usr/bin/env python3
"""
A stand-in for classify.py, for the runner tests: same arguments, same
checkpoint and progress files, canned results, no API calls.

Runs with cwd = the run folder, like the real pipeline under the web app, and
writes checkpoints/run_state.json (run id "fake") and
checkpoints/llm/llm_progress_fake.jsonl relative to it.

Rows: the verdict cycles deep tech / general tech, every 5th row is
escalated, and every 7th row is an error the first time it is processed.
With --resume, rows already checkpointed are skipped unless their result is
an error, as in the real pipeline.

Environment: FAKE_DELAY_S (default 0.05) seconds per row; FAKE_FATAL=1 prints
"[FATAL] Model problem: fake failure" to stderr and exits 1 before any row.

Not a test module: unittest discovery collects only test*.py files.
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

RUN_ID = "fake"
STATE_FILE = Path("checkpoints") / "run_state.json"
CHECKPOINT = Path("checkpoints") / "llm" / f"llm_progress_{RUN_ID}.jsonl"
MODEL = {"provider": "fake", "requested": "fake-model", "reported": "fake-model-1",
         "search_model": None, "source": "pinned", "tier": None}


def _result(index: int, name: str, first_pass: bool) -> dict:
    if first_pass and (index + 1) % 7 == 0:
        return {"company_name": name, "classification": "error", "confidence": 0,
                "reasoning": "Processing error", "processing_errors": "Fake error",
                "epo_validation_status": "Not Run", "patent_count": 0, "cpc_codes": [],
                "validator_triggered": False, "classification_disputed": False,
                "validation_decision": "", "model": ""}
    escalated = (index + 1) % 5 == 0
    return {
        "company_name": name,
        "classification": "deep tech" if index % 2 == 0 else "general tech",
        "confidence": 58 if escalated else 80,
        "reasoning": "Canned result.",
        "web_description": "",
        "patent_count": 0,
        "cpc_codes": [],
        "epo_validation_status": "Not Validated",
        "validator_triggered": escalated,
        "validator_verdict": "insufficient_evidence" if escalated else "",
        "validation_decision": "ESCALATE_FOR_HUMAN_REVIEW" if escalated else "",
        "escalation_reason": "Thin evidence" if escalated else "",
        "classification_disputed": False,
        "signal_score_llm": 80,
        "signal_score_epo": 0,
        "signal_score_validator": -22 if escalated else 0,
        "processing_time_s": 0.1,
        "processing_errors": "",
        "total_cost_usd": 0.0,
        "model": MODEL["reported"],
    }


def _checkpointed() -> dict:
    """{index: result} from the checkpoint, last write wins."""
    done = {}
    if CHECKPOINT.exists():
        for line in CHECKPOINT.read_text(encoding="utf-8").splitlines():
            if line.strip():
                entry = json.loads(line)
                done[entry["index"]] = entry["result"]
    return done


def _append(index: int, result: dict) -> None:
    with open(CHECKPOINT, "a", encoding="utf-8") as f:
        f.write(json.dumps({"index": index, "result": result}) + "\n")
        f.flush()
        os.fsync(f.fileno())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output")
    parser.add_argument("--config", required=True)
    parser.add_argument("--env")
    parser.add_argument("--resume", action="store_true")
    args = parser.parse_args()

    if os.environ.get("FAKE_FATAL") == "1":
        print("[FATAL] Model problem: fake failure", file=sys.stderr)
        sys.exit(1)

    # Imported only now: pandas takes most of a second to load.
    from data.reader import read_companies
    from pipeline import progress

    with open(args.config, "r", encoding="utf-8") as f:
        config = json.load(f)
    companies = read_companies(args.input, config)
    delay = float(os.environ.get("FAKE_DELAY_S", "0.05"))

    CHECKPOINT.parent.mkdir(parents=True, exist_ok=True)
    if not args.resume and CHECKPOINT.exists():
        CHECKPOINT.unlink()
    previous = _checkpointed()
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump({"run_id": RUN_ID, "batch_phase": "complete", "model": MODEL}, f, indent=2)

    progress.emit("phase", phase="Classify companies")
    for i, company in enumerate(companies):
        earlier = previous.get(i)
        if earlier is not None and earlier.get("classification") != "error":
            print(f"[{i + 1}/{len(companies)}] Skipping (already done): {company['company_name']}", flush=True)
            continue
        print(f"[{i + 1}/{len(companies)}] Processing: {company['company_name']}", flush=True)
        for step in ("Enrichment", "Classification", "Validation"):
            progress.emit("step", index=i, step=step)
        time.sleep(delay)
        _append(i, _result(i, company["company_name"], first_pass=earlier is None))
    print("CLASSIFICATION COMPLETE", flush=True)


if __name__ == "__main__":
    main()
