"""Stream the 1.5 GB MC2 graph into Parquet (nodes + edges) for fast analysis."""
import sys
from pathlib import Path

import ijson
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data/raw/mc2/mc2_challenge_graph/mc2_challenge_graph.json"
OUT = ROOT / "data/processed"

COLS = ["source", "target", "arrivaldate", "hscode", "valueofgoods_omu",
        "valueofgoodsusd", "volumeteu", "weightkg"]


def main():
    with open(SRC, "rb") as f:
        nodes = list(ijson.items(f, "nodes.item", use_float=True))
    pd.DataFrame(nodes).to_parquet(OUT / "mc2_nodes.parquet", index=False)
    print("nodes", len(nodes), file=sys.stderr)

    rows = {c: [] for c in COLS}
    with open(SRC, "rb") as f:
        for i, e in enumerate(ijson.items(f, "links.item", use_float=True)):
            for c in COLS:
                rows[c].append(e.get(c))
            if i % 1_000_000 == 0:
                print("edges", i, file=sys.stderr)
    df = pd.DataFrame(rows)
    df["source"] = df["source"].astype(str)
    df["target"] = df["target"].astype(str)
    df["hscode"] = df["hscode"].astype(str)
    df["arrivaldate"] = pd.to_datetime(df["arrivaldate"])
    df.to_parquet(OUT / "mc2_edges.parquet", index=False)
    print("edges total", len(df), file=sys.stderr)


if __name__ == "__main__":
    main()
