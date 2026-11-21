#!/usr/bin/env python3
"""
Start the workbench web app on this computer only.

    python serve.py [--port 8765]

Loads .env like classify.py does, keeps runs/ and uploads/ in the project
folder, and serves on 127.0.0.1. DTC_PIPELINE_CMD, a JSON list, replaces the
pipeline command (for testing).
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import List, Optional

import uvicorn
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))

from webapp.app import create_app  # noqa: E402

HOST = "127.0.0.1"


def _pipeline_command() -> Optional[List[str]]:
    """DTC_PIPELINE_CMD as a list of strings, or None when unset."""
    raw = os.environ.get("DTC_PIPELINE_CMD")
    if not raw:
        return None
    try:
        command = json.loads(raw)
    except ValueError:
        command = None
    if not isinstance(command, list) or not command or not all(isinstance(a, str) for a in command):
        sys.exit("DTC_PIPELINE_CMD must be a JSON list of strings, e.g. [\"python\", \"classify.py\"].")
    return command


def main() -> None:
    parser = argparse.ArgumentParser(description="Start the deep-tech classifier workbench.")
    parser.add_argument("--port", type=int, default=8765, help="Port to serve on (default: 8765).")
    args = parser.parse_args()

    env_path = PROJECT_ROOT / ".env"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        print(f".env not found at {env_path}. Expecting API keys in the environment.")

    app = create_app(PROJECT_ROOT, PROJECT_ROOT, runner_command=_pipeline_command())
    print(f"Workbench running at http://{HOST}:{args.port}/  (Ctrl+C to stop)")
    uvicorn.run(app, host=HOST, port=args.port)


if __name__ == "__main__":
    main()
