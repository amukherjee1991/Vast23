"""Build the compact MC2 JSON payloads for the app.

Run from the repo root:  .venv/bin/python pipeline/mc2_build.py
Inputs : data/processed/mc2_edges.parquet, mc2_nodes.parquet, data/raw/mc2/bundles/*.json
Outputs: app/public/data/mc2/*.json
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from mc2lib.bundles import evaluate_all  # noqa: E402
from mc2lib.common import OUT, load_edges, month_labels, write_json  # noqa: E402
from mc2lib.impact import impact  # noqa: E402
from mc2lib.successors import detect_all, suspects_json  # noqa: E402
from mc2lib.temporal import (companies_top, company_table, patterns,  # noqa: E402
                             timeline_overview)


def log(msg, t0=[time.time()]):
    print(f"[{time.time() - t0[0]:6.1f}s] {msg}", file=sys.stderr)


def main():
    e = load_edges()
    log(f"edges {e.attrs['n_raw']:,} raw -> {len(e):,} after removing exact duplicates")
    sizes = {}
    sizes["timeline_overview.json"] = write_json("timeline_overview.json", timeline_overview(e))
    log("timeline")
    ct = company_table(e)
    sizes["companies_top.json"] = write_json("companies_top.json", companies_top(e, ct))
    log("companies")
    pat, feats, M = patterns(e)
    sizes["patterns.json"] = write_json("patterns.json", pat)
    keys = feats[["source", "target"]]
    log("patterns")
    bev, frames = evaluate_all(e)
    sizes["bundles.json"] = write_json("bundles.json", bev)
    log("bundles")
    succ, info = detect_all(e)
    sus = suspects_json(e, succ, info)
    log("successors")
    imp, succ2 = impact(e, frames, bev, keys, M, succ)
    # flag whether each suspect pair survives once reliable bundles are added
    k2 = {(r.role, r.predecessor, r.successor): r for r in succ2.itertuples()}
    for p in sus["pairs"]:
        r = k2.get((p["role"], p["predecessor"], p["successor"]))
        p["after_reliable_bundles"] = ({"score": round(float(r.score), 4), "confidence": r.confidence}
                                       if r is not None else None)
    sizes["suspects.json"] = write_json("suspects.json", sus)
    sizes["bundle_impact.json"] = write_json("bundle_impact.json", imp)
    log("impact")

    meta = {
        "challenge": "VAST Challenge 2023 MC2",
        "months": month_labels(),
        "window": {"start": "2028-01", "end": "2034-12"},
        "edges_raw": int(e.attrs["n_raw"]),
        "edges_deduplicated": int(len(e)),
        "exact_duplicates_removed": int(e.attrs["n_raw"] - len(e)),
        "shippers": int(e.source.nunique()),
        "receivers": int(e.target.nunique()),
        "companies": int(len(set(e.source) | set(e.target))),
        "both_roles": int(len(set(e.source) & set(e.target))),
        "pairs": int(len(keys)),
        "hscodes": int(e.hscode.nunique()),
        "fish_edges": int(e.fish.sum()),
        "fish_share": float(e.fish.mean()),
        "fish_definition": "HS headings 0301-0309 (stored without the leading zero, e.g. 306170) "
                           "plus 1604/1605; 300xxx codes are pharmaceuticals (chapter 30).",
        "value_fields": {"valueofgoodsusd_present": float(e.valueofgoodsusd.notna().mean()),
                         "valueofgoods_omu_present": float(e.valueofgoods_omu.notna().mean()),
                         "volumeteu_present": float(e.volumeteu.notna().mean())},
        "files": {k: v for k, v in sizes.items()},
        "generated_by": "pipeline/mc2_build.py",
    }
    sizes["meta.json"] = write_json("meta.json", meta)
    total = sum(sizes.values())
    for k, v in sizes.items():
        log(f"{k:28s} {v / 1024:8.1f} KB")
    log(f"total {total / 1024 / 1024:.2f} MB -> {OUT}")


if __name__ == "__main__":
    main()
