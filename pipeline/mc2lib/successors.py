"""Q4: 'disappear and reappear' detection - a company stops trading and a new company
with near-identical partners, products and volumes starts shortly after."""
from __future__ import annotations

from difflib import SequenceMatcher

import numpy as np
import pandas as pd
from scipy import sparse
from sklearn.preprocessing import normalize

from .common import N_MONTHS

STOP_BEFORE = N_MONTHS - 7   # last activity <= 2034-05: silent for >= 7 months at the end
START_AFTER = 6              # first activity >= 2028-07: not present at window start
GAP_MIN, GAP_MAX = -3, 12    # successor may overlap 3 months or start up to 12 months later
MIN_STOP_SHIP, MIN_STOP_ACTIVE = 10, 3
MIN_START_SHIP = 5
SCORE_W = {"partner_cosine": 0.30, "partner_jaccard": 0.15, "hs_cosine": 0.25,
           "volume_similarity": 0.10, "weight_similarity": 0.05, "gap_score": 0.15}
ROLES = [("shipper", "source", "target"), ("receiver", "target", "source")]


def _confidence(r) -> str:
    if r.score >= 0.70 and r.shared_partners >= 3 and r.hs_cosine >= 0.6 and abs(r.gap) <= 3:
        return "High"
    if r.score >= 0.55 and r.shared_partners >= 2:
        return "Medium"
    return "Low"


def _profiles(e: pd.DataFrame, col: str, pcol: str):
    comp = pd.Index(e[col].unique())
    ci = comp.get_indexer(e[col])
    part = pd.Index(e[pcol].unique())
    pi = part.get_indexer(e[pcol])
    hs = pd.Index(e["hscode"].unique())
    hi = hs.get_indexer(e["hscode"])
    P = sparse.csr_matrix((np.ones(len(e)), (ci, pi)), shape=(len(comp), len(part)))
    H = sparse.csr_matrix((np.ones(len(e)), (ci, hi)), shape=(len(comp), len(hs)))
    P.sum_duplicates()
    H.sum_duplicates()
    g = e.groupby(ci)
    prof = pd.DataFrame({
        "n": g.size(), "first": g["m"].min(), "last": g["m"].max(),
        "active": g["m"].nunique(), "fish_share": g["fish"].mean(),
        "med_w": g["weightkg"].median(),
    }).reindex(range(len(comp)))
    prof["id"] = comp
    prof["rate"] = prof.n / prof.active
    return comp, part, hs, P, H, prof


def detect(e: pd.DataFrame, role: str, col: str, pcol: str) -> tuple[pd.DataFrame, dict]:
    comp, part, hs, P, H, prof = _profiles(e, col, pcol)
    stop = np.where((prof["last"] <= STOP_BEFORE) & (prof.n >= MIN_STOP_SHIP)
                    & (prof.active >= MIN_STOP_ACTIVE))[0]
    start = np.where((prof["first"] >= START_AFTER) & (prof.n >= MIN_START_SHIP))[0]
    Pn = normalize(P, norm="l2")
    Hn = normalize(H, norm="l2")
    Pb = (P > 0).astype(np.float64)
    C = (Pn[stop] @ Pn[start].T).tocoo()
    a = stop[C.row]
    b = start[C.col]
    cos = C.data
    gap = prof["first"].to_numpy()[b] - prof["last"].to_numpy()[a]
    keep = (gap >= GAP_MIN) & (gap <= GAP_MAX) & (a != b)
    a, b, cos, gap = a[keep], b[keep], cos[keep], gap[keep]
    if len(a) == 0:
        return pd.DataFrame(), {"stoppers": int(len(stop)), "starters": int(len(start))}
    inter = np.asarray(Pb[a].multiply(Pb[b]).sum(1)).ravel()
    deg = np.asarray(Pb.sum(1)).ravel()
    jac = inter / (deg[a] + deg[b] - inter)
    hcos = np.asarray(Hn[a].multiply(Hn[b]).sum(1)).ravel()
    rate = prof.rate.to_numpy()
    vol = np.minimum(rate[a], rate[b]) / np.maximum(rate[a], rate[b])
    mw = prof.med_w.to_numpy().astype(float)
    wsim = np.minimum(mw[a], mw[b]) / np.maximum(np.maximum(mw[a], mw[b]), 1)
    gscore = np.clip(1 - (np.abs(gap) - 1).clip(0) / 11, 0, 1)
    df = pd.DataFrame({"a": a, "b": b, "partner_cosine": cos, "partner_jaccard": jac,
                       "shared_partners": inter.astype(int), "hs_cosine": hcos,
                       "volume_similarity": vol, "weight_similarity": wsim,
                       "gap": gap, "gap_score": gscore})
    df["score"] = sum(SCORE_W[k] * df[k] for k in SCORE_W)
    # keep best successor of each stopper and best predecessor of each starter
    best_b = df.groupby("a")["score"].transform("max") == df["score"]
    best_a = df.groupby("b")["score"].transform("max") == df["score"]
    df = df[(best_b | best_a) & (df.score >= 0.4) & (df.shared_partners >= 2)].copy()
    df["mutual_best"] = (best_b & best_a).reindex(df.index)
    df["predecessor"] = comp[df.a.to_numpy()]
    df["successor"] = comp[df.b.to_numpy()]
    df["role"] = role
    df["confidence"] = [_confidence(r) for r in df.itertuples()]
    for side, idx in (("pred", "a"), ("succ", "b")):
        p = prof.iloc[df[idx].to_numpy()]
        for c in ["n", "first", "last", "active", "fish_share"]:
            df[f"{side}_{c}"] = p[c].to_numpy()
    df["name_similarity"] = [SequenceMatcher(None, x.lower(), y.lower()).ratio()
                             for x, y in zip(df.predecessor, df.successor)]
    df = df.sort_values("score", ascending=False).reset_index(drop=True)
    info = {"stoppers": int(len(stop)), "starters": int(len(start)),
            "candidate_pairs_in_window": int(keep.sum())}
    return df, info


def detect_all(e: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    frames, info = [], {}
    for role, col, pcol in ROLES:
        df, inf = detect(e, role, col, pcol)
        frames.append(df)
        info[role] = inf
    return pd.concat(frames, ignore_index=True).sort_values("score", ascending=False).reset_index(drop=True), info


def _evidence(e: pd.DataFrame, r) -> dict:
    col, pcol = ("source", "target") if r.role == "shipper" else ("target", "source")
    A = e[e[col] == r.predecessor]
    B = e[e[col] == r.successor]
    pa, pb = A[pcol].value_counts(), B[pcol].value_counts()
    shared = sorted(set(pa.index) & set(pb.index), key=lambda x: -(pa[x] + pb[x]))
    ha, hb = A["hs4"].value_counts(), B["hs4"].value_counts()
    return {
        "pred_monthly": np.bincount(A["m"], minlength=N_MONTHS)[:N_MONTHS].tolist(),
        "succ_monthly": np.bincount(B["m"], minlength=N_MONTHS)[:N_MONTHS].tolist(),
        "shared_partners": [{"id": p, "pred_shipments": int(pa[p]), "succ_shipments": int(pb[p])}
                            for p in shared[:10]],
        "pred_top_hs4": [{"hs4": k, "shipments": int(v)} for k, v in ha.head(5).items()],
        "succ_top_hs4": [{"hs4": k, "shipments": int(v)} for k, v in hb.head(5).items()],
        "pred_partner_count": int(len(pa)), "succ_partner_count": int(len(pb)),
    }


def chains(df: pd.DataFrame) -> list[list[str]]:
    """Follow predecessor -> successor links (Medium+ confidence) into multi-hop chains."""
    ok = df[df.confidence.isin(["High", "Medium"])]
    nxt = {}
    for r in ok.itertuples():
        key = (r.role, r.predecessor)
        if key not in nxt or nxt[key][1] < r.score:
            nxt[key] = (r.successor, r.score)
    has_pred = {(r.role, r.successor) for r in ok.itertuples()}
    out = []
    for (role, start) in nxt:
        if (role, start) in has_pred:
            continue
        path, cur, seen = [start], start, {start}
        while (role, cur) in nxt and nxt[(role, cur)][0] not in seen:
            cur = nxt[(role, cur)][0]
            seen.add(cur)
            path.append(cur)
        if len(path) >= 3:
            out.append({"role": role, "chain": path})
    return out


def suspects_json(e: pd.DataFrame, df: pd.DataFrame, info: dict, top_n=80) -> dict:
    pairs = []
    for r in df.head(top_n).itertuples():
        rec = {
            "rank": len(pairs) + 1, "role": r.role,
            "predecessor": r.predecessor, "successor": r.successor,
            "score": round(float(r.score), 4), "confidence": r.confidence,
            "mutual_best": bool(r.mutual_best),
            "gap_months": int(r.gap),
            "metrics": {k: round(float(getattr(r, k)), 4) for k in
                        ["partner_cosine", "partner_jaccard", "hs_cosine", "volume_similarity",
                         "weight_similarity", "gap_score", "name_similarity"]},
            "shared_partner_count": int(r.shared_partners),
            "pred": {"shipments": int(r.pred_n), "first_month": int(r.pred_first), "last_month": int(r.pred_last),
                     "active_months": int(r.pred_active), "fish_share": round(float(r.pred_fish_share), 4)},
            "succ": {"shipments": int(r.succ_n), "first_month": int(r.succ_first), "last_month": int(r.succ_last),
                     "active_months": int(r.succ_active), "fish_share": round(float(r.succ_fish_share), 4)},
            "fish_related": bool(max(r.pred_fish_share, r.succ_fish_share) >= 0.5),
        }
        rec["evidence"] = _evidence(e, r)
        pairs.append(rec)
    # company-level suspect ranking
    comp = {}
    for p in pairs:
        for side, other, lab in (("successor", "predecessor", "reappeared_as_successor_of"),
                                 ("predecessor", "successor", "disappeared_succeeded_by")):
            key = (p[side], p["role"])
            c = comp.setdefault(key, {"id": p[side], "role": p["role"], "best_score": 0,
                                      "confidence": "Low", "links": []})
            c["links"].append({"type": lab, "other": p[other], "score": p["score"],
                               "confidence": p["confidence"], "rank": p["rank"]})
            if p["score"] > c["best_score"]:
                c["best_score"] = p["score"]
                c["confidence"] = p["confidence"]
            c["fish_related"] = c.get("fish_related", False) or p["fish_related"]
    order = {"High": 0, "Medium": 1, "Low": 2}
    companies = sorted(comp.values(), key=lambda c: (order[c["confidence"]], -c["best_score"]))
    counts = df.confidence.value_counts().to_dict()
    return {
        "method": {
            "stopper": f"last activity <= month {STOP_BEFORE} (2034-05), >= {MIN_STOP_SHIP} shipments, "
                       f">= {MIN_STOP_ACTIVE} active months",
            "starter": f"first activity >= month {START_AFTER} (2028-07), >= {MIN_START_SHIP} shipments",
            "window": f"successor starts between {GAP_MIN} and +{GAP_MAX} months after predecessor's last month",
            "score_weights": SCORE_W,
            "filters": "best successor per stopper or best predecessor per starter; score >= 0.4; "
                       ">= 2 shared partners",
            "confidence": {"High": "score>=0.70, >=3 shared partners, hs_cosine>=0.6, |gap|<=3",
                           "Medium": "score>=0.55, >=2 shared partners", "Low": "otherwise"},
        },
        "population": info,
        "pair_counts_by_confidence": {k: int(v) for k, v in counts.items()},
        "pair_counts_by_role_confidence": {f"{a}|{b}": int(v) for (a, b), v in
                                           df.groupby(["role", "confidence"]).size().items()},
        "pairs": pairs,
        "companies": companies,
        "chains": chains(df),
        "score_histogram": {"bins": [0.4, 0.5, 0.55, 0.6, 0.7, 0.8, 0.9, 1.0],
                            "counts": np.histogram(df.score, bins=[0.4, 0.5, 0.55, 0.6, 0.7, 0.8, 0.9, 1.0])[0].tolist()},
    }
