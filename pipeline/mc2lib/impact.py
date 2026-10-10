"""Q3: what changes when the reliable bundles are added to the graph."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .common import N_MONTHS, month_labels
from .successors import STOP_BEFORE, detect_all
from .temporal import classify, pair_features


def usable_links(b: pd.DataFrame) -> pd.DataFrame:
    """Links that add information: not an exact graph copy, not repeated, inside the window."""
    return b[~b._exact & ~b._intra_dup & ~b._out_of_range].copy()


def augment(e: pd.DataFrame, frames: dict[str, pd.DataFrame], names: list[str]) -> pd.DataFrame:
    add = pd.concat([usable_links(frames[n]).assign(bundle=n) for n in names], ignore_index=True)
    add = add.drop_duplicates(["source", "target", "hscode", "arrivaldate"])
    cols = ["source", "target", "arrivaldate", "hscode", "weightkg", "volumeteu", "m", "hs4", "fish"]
    add = add[cols + ["bundle"]].copy()
    add["m"] = add["m"].astype(np.int16)
    add["weightkg"] = add["weightkg"].astype(float)
    return add


def _pair_shift(keys, M, add) -> dict:
    idx = pd.MultiIndex.from_frame(keys[["source", "target"]])
    pid = idx.get_indexer(pd.MultiIndex.from_frame(add[["source", "target"]]))
    known = pid >= 0
    touched = np.unique(pid[known])
    before = classify(pair_features(M[touched]))
    M2 = M[touched].copy()
    np.add.at(M2, (np.searchsorted(touched, pid[known]), add["m"].to_numpy()[known]), 1)
    after = classify(pair_features(M2))
    ct = pd.crosstab(pd.Series(before, name="before"), pd.Series(after, name="after"))
    trans = [{"from": a, "to": b, "pairs": int(ct.loc[a, b])}
             for a in ct.index for b in ct.columns if ct.loc[a, b] > 0]
    return {"pairs_touched": int(len(touched)), "pairs_new": int(len(set(zip(add.source[~known], add.target[~known])))),
            "category_changed": int((before != after).sum()), "transitions": trans}


def impact(e: pd.DataFrame, frames: dict, bundle_eval: dict, keys, M, base_succ: pd.DataFrame) -> dict:
    reliable = [r["bundle"] for r in bundle_eval["bundles"] if r["verdict"] == "reliable"]
    add = augment(e, frames, reliable)
    e2 = pd.concat([e, add.drop(columns="bundle")], ignore_index=True)

    # stoppers revived: companies whose last month moves past the stop threshold
    revived = []
    for role, col in (("shipper", "source"), ("receiver", "target")):
        last0 = e.groupby(col)["m"].max()
        n0 = e.groupby(col).size()
        last1 = add.groupby(col)["m"].max()
        j = pd.concat([last0.rename("l0"), last1.rename("l1"), n0.rename("n")], axis=1).dropna()
        j = j[(j.l0 <= STOP_BEFORE) & (j.l1 > STOP_BEFORE) & (j.n >= 10)]
        for cid, r in j.iterrows():
            revived.append({"id": cid, "role": role, "last_month_before": int(r.l0),
                            "last_month_after": int(r.l1), "shipments": int(r.n)})

    succ2, info2 = detect_all(e2)
    k0 = {(r.role, r.predecessor, r.successor): r for r in base_succ.itertuples()}
    k1 = {(r.role, r.predecessor, r.successor): r for r in succ2.itertuples()}
    gained = [k for k in k1 if k not in k0]
    lost = [k for k in k0 if k not in k1]
    conf_change = [{"role": k[0], "predecessor": k[1], "successor": k[2],
                    "before": k0[k].confidence, "after": k1[k].confidence,
                    "score_before": round(k0[k].score, 4), "score_after": round(k1[k].score, 4)}
                   for k in k0 if k in k1 and k0[k].confidence != k1[k].confidence]

    def rows(ks, src, n=25):
        ks = sorted(ks, key=lambda k: -src[k].score)[:n]
        return [{"role": k[0], "predecessor": k[1], "successor": k[2], "score": round(src[k].score, 4),
                 "confidence": src[k].confidence} for k in ks]

    m = e["m"].to_numpy()
    base_month = np.bincount(m, minlength=N_MONTHS)[72:]
    add_month = np.bincount(add["m"].to_numpy(), minlength=N_MONTHS)[72:N_MONTHS]
    fish34 = e.loc[e.m >= 72, "fish"].mean()
    fish34b = pd.concat([e.loc[e.m >= 72, "fish"], add["fish"]]).mean()

    # per-bundle what-if (all bundles, even unreliable ones)
    per_bundle = []
    for r in bundle_eval["bundles"]:
        b = frames[r["bundle"]]
        u = usable_links(b)
        tgt_top = b.target.value_counts().head(1)
        per_bundle.append({
            "bundle": r["bundle"], "verdict": r["verdict"], "links": int(len(b)), "usable_links": int(len(u)),
            "top_target": tgt_top.index[0], "top_target_links": int(tgt_top.iloc[0]),
            "fish_share_usable": float(u.fish.mean()) if len(u) else None,
        })

    top_gain = add.groupby("source").size().sort_values(ascending=False).head(15)
    return {
        "reliable_bundles": reliable,
        "links_added": int(len(add)),
        "links_added_by_bundle": {k: int(v) for k, v in add.bundle.value_counts().items()},
        "links_added_fish_share": float(add.fish.mean()),
        "pair_patterns": _pair_shift(keys, M, add),
        "months_2034": month_labels()[72:],
        "monthly_2034_before": base_month.tolist(),
        "monthly_2034_added": add_month.tolist(),
        "fish_share_2034_before": float(fish34),
        "fish_share_2034_after": float(fish34b),
        "revived_stoppers": sorted(revived, key=lambda x: -x["shipments"]),
        "successor_pairs_before": int(len(base_succ)),
        "successor_pairs_after": int(len(succ2)),
        "successor_confidence_before": {k: int(v) for k, v in base_succ.confidence.value_counts().items()},
        "successor_confidence_after": {k: int(v) for k, v in succ2.confidence.value_counts().items()},
        "successor_pairs_gained": rows(gained, k1),
        "successor_pairs_lost": rows(lost, k0),
        "successor_confidence_changes": conf_change,
        "top_shippers_gaining_links": [{"id": k, "links": int(v)} for k, v in top_gain.items()],
        "per_bundle_whatif": per_bundle,
    }, succ2
