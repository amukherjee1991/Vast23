"""Q3: what changes when the reliable bundles are added to the graph."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .common import N_MONTHS, month_labels
from .successors import STOP_LAST, assign_verdicts, detect_all
from .temporal import PATTERN_ORDER, classify, pair_features

LABELS = month_labels()


def usable_links(b: pd.DataFrame) -> pd.DataFrame:
    """Links that add information: distinct, not an exact graph copy, inside the window."""
    return b[~b._exact.astype(bool) & ~b._intra_dup & ~b._out_of_range].copy()


def augment(frames: dict[str, pd.DataFrame], names: list[str]) -> pd.DataFrame:
    cols = ["source", "target", "arrivaldate", "hscode", "weightkg", "volumeteu", "valueofgoods_omu",
            "m", "hs4", "fish"]
    if not names:
        return pd.DataFrame(columns=cols + ["bundle"])
    add = pd.concat([usable_links(frames[n])[cols].assign(bundle=n) for n in names], ignore_index=True)
    add = add.drop_duplicates(["source", "target", "hscode", "arrivaldate", "weightkg"])
    add["m"] = add["m"].astype(np.int16)
    add["weightkg"] = add["weightkg"].astype(float)
    return add.sort_values(["arrivaldate", "source", "target", "hscode"]).reset_index(drop=True)


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
             for a in PATTERN_ORDER if a in ct.index for b in PATTERN_ORDER if b in ct.columns and ct.loc[a, b] > 0]
    changed = before != after
    examples = []
    # examples: pairs whose category changed, busiest first
    order = np.argsort(-M[touched].sum(1))
    for j in order:
        if changed[j] and len(examples) < 12:
            k = touched[j]
            examples.append({"source": keys.source.iat[k], "target": keys.target.iat[k],
                             "before": before[j], "after": after[j],
                             "monthly_before": M[k].tolist(), "monthly_after": M2[j].tolist()})
    new_pairs = add.loc[~known, ["source", "target"]].drop_duplicates()
    return {"pairs_touched": int(len(touched)), "pairs_new": int(len(new_pairs)),
            "category_changed": int(changed.sum()), "transitions": trans, "examples": examples}


def impact(e: pd.DataFrame, frames: dict, bundle_eval: dict, keys, M, base: pd.DataFrame,
           add: pd.DataFrame) -> dict:
    reliable = [r["bundle"] for r in bundle_eval["bundles"] if r["verdict"] == "Reliable"]
    e2 = pd.concat([e, add.drop(columns=["bundle"])], ignore_index=True)

    # companies that looked stopped but have reliable predicted links after their last real month
    revived = []
    for role, col in (("shipper", "source"), ("receiver", "target")):
        g = e.groupby(col)["m"]
        j = pd.concat([g.max().rename("l0"), g.size().rename("n"),
                       add.groupby(col)["m"].max().rename("l1")], axis=1).dropna()
        j = j[(j.l0 <= STOP_LAST) & (j.l1 > j.l0) & (j.n >= 10)]
        for cid, r in j.sort_index().iterrows():
            revived.append({"id": cid, "role": role, "last_month_before": LABELS[int(r.l0)],
                            "last_month_after": LABELS[int(r.l1)], "shipments": int(r.n)})

    after, _ = detect_all(e2)
    after = assign_verdicts(after, None)
    kb = {(r.role, r.predecessor, r.successor): r for r in base.itertuples()}
    ka = {(r.role, r.predecessor, r.successor): r for r in after.itertuples()}
    top = [k for k in kb if kb[k].verdict in ("Suspect", "Possible")]
    status = []
    for k in top:
        a = ka.get(k)
        status.append({"role": k[0], "predecessor": k[1], "successor": k[2],
                       "verdict_before": kb[k].verdict, "score_before": round(float(kb[k].score), 4),
                       "verdict_after": a.verdict if a is not None else "Not detected",
                       "score_after": round(float(a.score), 4) if a is not None else None})
    gained = sorted([k for k in ka if k not in kb and ka[k].verdict in ("Suspect", "Possible")],
                    key=lambda k: -ka[k].score)
    m = e["m"].to_numpy()
    base_month = np.bincount(m, minlength=N_MONTHS)[72:]
    add_month = np.bincount(add["m"].to_numpy(), minlength=N_MONTHS)[72:N_MONTHS]
    fish34 = float(e.loc[e.m >= 72, "fish"].mean())
    fish34b = float(pd.concat([e.loc[e.m >= 72, "fish"], add["fish"]]).mean())

    per_bundle = []
    for r in bundle_eval["bundles"]:
        b = frames[r["bundle"]]
        u = usable_links(b)
        per_bundle.append({
            "bundle": r["bundle"], "verdict": r["verdict"], "links": int(len(b)), "usable_links": int(len(u)),
            "fish_share_usable": float(u.fish.mean()) if len(u) else None,
            "top_target": b.target.value_counts().index[0], "top_target_links": int(b.target.value_counts().iloc[0]),
        })
    # sensitivity: also add the Questionable bundles
    quest = [r["bundle"] for r in bundle_eval["bundles"] if r["verdict"] == "Questionable"]
    addq = augment(frames, reliable + quest)
    after_q, _ = detect_all(pd.concat([e, addq.drop(columns=["bundle"])], ignore_index=True))
    after_q = assign_verdicts(after_q, None)
    kq = {(r.role, r.predecessor, r.successor): r.verdict for r in after_q.itertuples()}
    sensitivity = {
        "bundles": reliable + quest, "links_added": int(len(addq)),
        "flagged_pairs_changed": [{"role": k[0], "predecessor": k[1], "successor": k[2],
                                   "verdict_before": kb[k].verdict, "verdict_after": kq.get(k, "Not detected")}
                                  for k in top if kq.get(k, "Not detected") != kb[k].verdict],
        "verdict_counts": {k: int(v) for k, v in after_q.verdict.value_counts().items()},
    }
    hubs = add.groupby("target").size().sort_values(ascending=False).head(10)
    top_gain = add.groupby("source").size().sort_values(ascending=False).head(10)
    return {
        "reliable_bundles": reliable,
        "links_added": int(len(add)),
        "links_added_by_bundle": {k: int(v) for k, v in add.bundle.value_counts().sort_index().items()},
        "links_added_fish_share": float(add.fish.mean()) if len(add) else None,
        "links_added_new_pairs": int(len(set(zip(add.source, add.target)) - set(zip(e.source, e.target)))),
        "pair_patterns": _pair_shift(keys, M, add),
        "months_2034": LABELS[72:],
        "monthly_2034_before": base_month.tolist(),
        "monthly_2034_added": add_month.tolist(),
        "fish_share_2034_before": fish34,
        "fish_share_2034_after": fish34b,
        "revived_stoppers": revived,
        "successor_pairs_before": int(len(base)),
        "successor_pairs_after": int(len(after)),
        "successor_verdicts_before": {k: int(v) for k, v in base.verdict.value_counts().items()},
        "successor_verdicts_after_redetect": {k: int(v) for k, v in after.verdict.value_counts().items()},
        "flagged_pair_status_after": status,
        "new_flagged_pairs_after": [{"role": k[0], "predecessor": k[1], "successor": k[2],
                                     "verdict": ka[k].verdict, "score": round(float(ka[k].score), 4)}
                                    for k in gained[:20]],
        "top_targets_of_added_links": [{"id": k, "links": int(v)} for k, v in hubs.items()],
        "top_sources_of_added_links": [{"id": k, "links": int(v)} for k, v in top_gain.items()],
        "per_bundle_whatif": per_bundle,
        "sensitivity_with_questionable": sensitivity,
    }
