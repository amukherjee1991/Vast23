"""Rebuild every baked dataset the app reads, then the home-page summary.

Run from the repo root:  .venv/bin/python pipeline/build_all.py
(or `npm run data` from app/). Needs data/raw (scripts/fetch_data.sh).
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PY = sys.executable

STEPS = [
    ("MC2 parquet", ["pipeline/mc2_to_parquet.py"], ROOT / "data/processed/mc2_edges.parquet"),
    ("MC1", ["pipeline/mc1_build.py"], None),
    ("MC2", ["pipeline/mc2_build.py"], None),
    ("MC3", ["pipeline/mc3_build.py"], None),
    ("Summary", ["pipeline/build_summary.py"], None),
]


def main():
    for name, args, skip_if in STEPS:
        if skip_if is not None and skip_if.exists():
            print(f"· {name}: up to date, skipped")
            continue
        print(f"→ {name}")
        subprocess.run([PY, *args], cwd=ROOT, check=True)
    print("All datasets rebuilt.")


if __name__ == "__main__":
    main()
