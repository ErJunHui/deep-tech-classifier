#!/usr/bin/env python3
"""
Write a large made-up input spreadsheet for checking the workbench's long
tables by hand.

    python tests/test_webapp/make_big_input.py 5000

writes tests/test_webapp/out/big_5000.xlsx (git-ignored) with n companies:
company_name, description, domain and uen columns, the names the default
column mapping looks for. Not a test module: unittest discovery collects only
test*.py files.
"""

import argparse
import random
from pathlib import Path

import pandas as pd

OUT_DIR = Path(__file__).resolve().parent / "out"

_FIRST = ["Aurora", "Basalt", "Cobalt", "Delta", "Ember", "Fjord", "Granite", "Helix", "Iris", "Juniper",
          "Kestrel", "Lumen", "Meridian", "Nimbus", "Onyx", "Pioneer", "Quartz", "Rivet", "Summit", "Tidal"]
_SECOND = ["Labs", "Systems", "Robotics", "Analytics", "Bio", "Foods", "Logistics", "Energy", "Materials", "Health"]
_SECTORS = [
    ("Semiconductors", "Designs low-power chips for edge sensors."),
    ("Biotechnology", "Develops enzyme platforms for industrial fermentation."),
    ("Logistics software", "Sells route planning software to delivery fleets."),
    ("Food and beverage", "Runs a chain of cafes and a catering service."),
    ("Quantum computing", "Builds photonic components for quantum networks."),
    ("E-commerce", "Operates an online marketplace for home goods."),
    ("Advanced materials", "Manufactures graphene coatings for batteries."),
    ("Fintech", "Offers a payments app for small merchants."),
    ("Robotics", "Builds autonomous inspection robots for ship hulls."),
    ("Marketing services", "Provides social media marketing for retailers."),
]


def companies(n: int, seed: int = 7) -> pd.DataFrame:
    """n made-up companies with unique names."""
    rng = random.Random(seed)
    rows = []
    for i in range(n):
        sector, description = _SECTORS[rng.randrange(len(_SECTORS))]
        name = f"{_FIRST[i % len(_FIRST)]} {_SECOND[(i // len(_FIRST)) % len(_SECOND)]} {i + 1}"
        rows.append({
            "company_name": name,
            "description": description,
            "domain": sector,
            "uen": f"2026{i + 1:05d}K",
        })
    return pd.DataFrame(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Write a large made-up input spreadsheet.")
    parser.add_argument("n", type=int, help="Number of companies.")
    args = parser.parse_args()
    if args.n < 1:
        parser.error("n must be at least 1")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"big_{args.n}.xlsx"
    companies(args.n).to_excel(path, index=False)
    print(path)


if __name__ == "__main__":
    main()
