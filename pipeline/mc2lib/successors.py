"""Q4: 'disappear and reappear' detection.

A company stops trading and a new company with near-identical partners, products and
volumes starts shortly after. Similarity uses IDF-weighted profiles so that sharing a giant
hub partner (or the most common HS code) counts for little, and Jaccard overlaps are reported
alongside. A gap-profile null (similar pairs by start/stop gap) shows how much of the signal
is just companies that coexist in the same market.
"""
from __future__ import annotations

from difflib import SequenceMatcher

import numpy as np
import pandas as pd
from scipy import sparse
from sklearn.preprocessing import normalize

from .common import N_MONTHS, month_labels

LABELS = month_labels()
STOP_LAST = N_MONTHS - 7          # last activity <= 2034-06: silent for the final 6+ months
START_FIRST = 6                   # first activity >= 2028-07: absent for the first 6 months
GAP_MIN, GAP_MAX = -6, 12         # successor may start up to 6 months before, or 12 after, the stop
MIN_STOP_SHIP, MIN_STOP_ACTIVE = 10, 3
MIN_START_SHIP, MIN_START_ACTIVE = 5, 2
MIN_SHARED, MIN_SCORE = 2, 0.45
SCORE_W = {"partner_cosine": 0.30, "partner_jaccard": 0.15, "hs_cosine": 0.20, "hs_jaccard": 0.10,
           "volume_similarity": 0.10, "gap_score": 0.15}
ROLES = [("shipper", "source", "target"), ("receiver", "target", "source")]
VERDICT_ORDER = {"Suspect": 0, "Possible": 1, "Insufficient evidence": 2, "Unlikely": 3}
CONF_ORDER = {"High": 0, "Medium": 1, "Low": 2}
GAP_BINS = [-84, -36, -24, -12, -6, -3, 0, 3, 6, 12, 24, 84]


def _gap_score(gap: np.ndarray) -> np.ndarray:
    """1 for a stop->start gap of -1..3 months, falling linearly to 0 at -7 and +13."""
    g = gap.astype(float)
    return np.clip(np.where(g < -1, 1 - (-1 - g) / 6, np.where(g > 3, 1 - (g - 3) / 10, 1.0)), 0, 1)


def _profiles(e: pd.DataFrame, col: str, pcol: str):
    comp = pd.Index(np.sort(e[col].unique()))
    ci = comp.get_indexer(e[col])
    part = pd.Index(np.sort(e[pcol].unique()))
    pi = part.get_indexer(e[pcol])
    hs = pd.Index(np.sort(e["hscode"].unique()))
    hi = hs.get_indexer(e["hscode"])
    P = sparse.csr_matrix((np.ones(len(e)), (ci, pi)), shape=(len(comp), len(part)))
    H = sparse.csr_matrix((np.ones(len(e)), (ci, hi)), shape=(len(comp), len(hs)))
    P.sum_duplicates()
    H.sum_duplicates()
    g = pd.DataFrame({"ci": ci, "m": e["m"].to_numpy(), "fish": e["fish"].to_numpy(),
                      "w": e["weightkg"].to_numpy(dtype=float)}).groupby("ci")
    prof = pd.DataFrame({"n": g.size(), "first": g["m"].min(), "last": g["m"].max(),
                         "active": g["m"].nunique(), "fish_share": g["fish"].mean(),
                         "med_w": g["w"].median()}).reindex(range(len(comp)))
    prof["id"] = comp
    prof["rate"] = prof.n / prof.active

    def tfidf(M):
        df = np.asarray((M > 0).sum(0)).ravel()
        idf = np.log(M.shape[0] / np.maximum(df, 1))
        return normalize(M.log1p().multiply(idf[None, :]).tocsr(), norm="l2")
    return comp, P, H, tfidf(P), tfidf(H), prof


def _pair_feats(a, b, Pw, Hw, Pb, Hb, prof):
    inter = np.asarray(Pb[a].multiply(Pb[b]).sum(1)).ravel()
    pdeg = np.asarray(Pb.sum(1)).ravel()
    hinter = np.asarray(Hb[a].multiply(Hb[b]).sum(1)).ravel()
    hdeg = np.asarray(Hb.sum(1)).ravel()
    rate = prof.rate.to_numpy()
    return {
        "partner_cosine": np.asarray(Pw[a].multiply(Pw[b]).sum(1)).ravel(),
        "partner_jaccard": inter / (pdeg[a] + pdeg[b] - inter),
        "shared_partners": inter.astype(int),
        "hs_cosine": np.asarray(Hw[a].multiply(Hw[b]).sum(1)).ravel(),
        "hs_jaccard": hinter / (hdeg[a] + hdeg[b] - hinter),
        "volume_similarity": np.minimum(rate[a], rate[b]) / np.maximum(rate[a], rate[b]),
    }


def gap_profile(Pw, Hw, Pb, prof) -> dict:
    """Counts of strongly similar company pairs by gap (later company's first month minus the
    earlier company's last month). Negative gaps = the two coexisted; a restart-under-a-new-name
    mechanism would show up as an excess at small positive gaps."""
    big = np.where((prof.n >= 10) & (prof.active >= 3))[0]
    C = (Pw[big] @ Pw[big].T).tocoo()
    a, b = big[C.row], big[C.col]
    first, last = prof["first"].to_numpy(), prof["last"].to_numpy()
    keep = (C.data >= 0.7) & (first[b] > first[a]) & (last[b] > last[a])
    a, b, pc = a[keep], b[keep], C.data[keep]
    hc = np.asarray(Hw[a].multiply(Hw[b]).sum(1)).ravel()
    inter = np.asarray(Pb[a].multiply(Pb[b]).sum(1)).ravel()
    strong = (hc >= 0.7) & (inter >= 3)
    gap = first[b] - last[a]
    counts = np.histogram(np.clip(gap[strong], -83, 83), bins=GAP_BINS)[0]
    widths = np.diff(GAP_BINS)
    return {"bins": GAP_BINS, "pairs": counts.tolist(),
            "pairs_per_gap_month": (counts / widths).round(3).tolist(),
            "criteria": "partner cosine >= 0.7, HS cosine >= 0.7, >= 3 shared partners, both companies "
                        ">= 10 shipments in >= 3 months, later company starts and ends after the earlier one"}


def detect(e: pd.DataFrame, role: str, col: str, pcol: str):
    comp, P, H, Pw, Hw, prof = _profiles(e, col, pcol)
    Pb = (P > 0).astype(np.float64).tocsr()
    Hb = (H > 0).astype(np.float64).tocsr()
    stop = np.where((prof["last"] <= STOP_LAST) & (prof.n >= MIN_STOP_SHIP) & (prof.active >= MIN_STOP_ACTIVE))[0]
    start = np.where((prof["first"] >= START_FIRST) & (prof.n >= MIN_START_SHIP)
                     & (prof.active >= MIN_START_ACTIVE))[0]
    C = (Pw[stop] @ Pw[start].T).tocoo()
    a, b = stop[C.row], start[C.col]
    first, last = prof["first"].to_numpy(), prof["last"].to_numpy()
    gap = first[b] - last[a]
    keep = (gap >= GAP_MIN) & (gap <= GAP_MAX) & (a != b) & (first[b] > first[a]) & (last[b] > last[a])
    a, b, gap = a[keep], b[keep], gap[keep]
    info = {"stoppers": int(len(stop)), "starters": int(len(start)),
            "candidate_pairs_in_window": int(len(a)), "gap_profile": gap_profile(Pw, Hw, Pb, prof)}
    if len(a) == 0:
        return pd.DataFrame(), info
    df = pd.DataFrame({"a": a, "b": b, "gap": gap, **_pair_feats(a, b, Pw, Hw, Pb, Hb, prof)})
    df["gap_score"] = _gap_score(df.gap.to_numpy())
    df["score"] = sum(SCORE_W[k] * df[k] for k in SCORE_W)
    df = df[(df.shared_partners >= MIN_SHARED)].copy()
    best_b = df.groupby("a")["score"].transform("max") == df["score"]
    best_a = df.groupby("b")["score"].transform("max") == df["score"]
    df["mutual_best"] = best_b & best_a
    df = df[(best_b | best_a) & (df.score >= MIN_SCORE)].copy()
    df["predecessor"] = comp[df.a.to_numpy()]
    df["successor"] = comp[df.b.to_numpy()]
    df["role"] = role
    for side, idx in (("pred", "a"), ("succ", "b")):
        p = prof.iloc[df[idx].to_numpy()]
        for c in ["n", "first", "last", "active", "fish_share"]:
            df[f"{side}_{c}"] = p[c].to_numpy()
    df = _handover(e, df, col, pcol)
    df["name_similarity"] = [SequenceMatcher(None, x.lower(), y.lower()).ratio()
                             for x, y in zip(df.predecessor, df.successor)]
    return df.sort_values(["score", "predecessor", "successor"], ascending=[False, True, True]).reset_index(drop=True), info


def _handover(e, df, col, pcol):
    """For shared partners: did they stop trading with the predecessor and start with the successor
    at about the same time (handover), and how much of the successor's trade goes to them?"""
    ids = set(df.predecessor) | set(df.successor)
    sub = e[e[col].isin(ids)]
    pp = sub.groupby([col, pcol])["m"].agg(["min", "max", "size"]).reset_index()
    pp.columns = ["cid", "partner", "pmin", "pmax", "pn"]
    A = df[["predecessor", "successor"]].reset_index().merge(
        pp.rename(columns={"cid": "predecessor", "pmax": "a_last", "pn": "a_n"})[["predecessor", "partner", "a_last", "a_n"]],
        on="predecessor")
    AB = A.merge(pp.rename(columns={"cid": "successor", "pmin": "b_first", "pn": "b_n"})[["successor", "partner", "b_first", "b_n"]],
                 on=["successor", "partner"])
    d = AB.b_first - AB.a_last
    AB["aligned"] = (d >= -3) & (d <= 12)
    g = AB.groupby("index")
    succ_tot = pp.groupby("cid")["pn"].sum()
    df["handover_alignment"] = g["aligned"].mean().reindex(df.index).fillna(0).to_numpy()
    df["inherited_share"] = (g["b_n"].sum().reindex(df.index).fillna(0)
                             / df.successor.map(succ_tot)).to_numpy()
    return df


def revival(df: pd.DataFrame, add: pd.DataFrame | None) -> np.ndarray:
    """Predicted (reliable-bundle) links that show the predecessor still trading after its stop."""
    if add is None or not len(df):
        return np.zeros(len(df), dtype=int)
    out = []
    for r in df.itertuples():
        col = "source" if r.role == "shipper" else "target"
        out.append(int(((add[col] == r.predecessor) & (add["m"] > r.pred_last)).sum()))
    return np.array(out)


def assign_verdicts(df: pd.DataFrame, add: pd.DataFrame | None) -> pd.DataFrame:
    if not len(df):
        return df
    df = df.copy()
    df["revived_links"] = revival(df, add)
    df["fish_related"] = np.minimum(df.pred_fish_share, df.succ_fish_share) >= 0.3
    strong = ((df.score >= 0.70) & (df.shared_partners >= 3) & (df.hs_cosine >= 0.6)
              & df.gap.between(-3, 6) & (df.handover_alignment >= 0.5))
    unlikely = ((df.revived_links > 0) | ((df.shared_partners >= 3) & (df.handover_alignment < 0.25))
                | (~df.mutual_best & (df.score < 0.55)))
    verdict = np.full(len(df), "Insufficient evidence", dtype=object)
    possible = (strong | ((df.score >= 0.60) & (df.handover_alignment >= 0.5) & df.fish_related))
    verdict[possible.to_numpy()] = "Possible"
    verdict[(strong & df.mutual_best & df.fish_related).to_numpy()] = "Suspect"
    verdict[unlikely.to_numpy()] = "Unlikely"
    df["verdict"] = verdict
    rich = (df.shared_partners >= 5) & (df.pred_n >= 30) & (df.succ_n >= 15)
    medium = (df.shared_partners >= 3) & (df.pred_n >= 15)
    conf = np.where(rich, "High", np.where(medium, "Medium", "Low")).astype(object)
    # a revival seen in reliable predicted links is direct evidence, whatever the profile size
    conf[(df.revived_links >= 3).to_numpy()] = "High"
    # a pair that is only "Insufficient evidence" cannot carry High confidence in anything
    conf[(df.verdict == "Insufficient evidence").to_numpy() & (conf == "High")] = "Medium"
    df["confidence"] = conf
    reasons = []
    for r in df.itertuples():
        bits = []
        if r.revived_links:
            bits.append(f"predecessor has {r.revived_links} reliable predicted links after it stopped")
        bits.append(f"{r.shared_partners} shared partners (partner cosine {r.partner_cosine:.2f}, "
                    f"Jaccard {r.partner_jaccard:.2f})")
        bits.append(f"HS cosine {r.hs_cosine:.2f}, Jaccard {r.hs_jaccard:.2f}")
        bits.append(f"successor starts {r.gap:+d} months after the stop")
        bits.append(f"{r.handover_alignment:.0%} of shared partners switch over within -3..+12 months")
        bits.append(f"{r.inherited_share:.0%} of the successor's shipments go to inherited partners")
        bits.append("fish trade on both sides" if r.fish_related else "not a fish trade on both sides")
        if not r.mutual_best:
            bits.append("not each other's best match")
        reasons.append("; ".join(bits))
    df["reason"] = reasons
    df["vrank"] = df.verdict.map(VERDICT_ORDER)
    return df.sort_values(["vrank", "score", "predecessor"], ascending=[True, False, True]).reset_index(drop=True)


def detect_all(e: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    frames, info = [], {}
    for role, col, pcol in ROLES:
        df, inf = detect(e, role, col, pcol)
        frames.append(df)
        info[role] = inf
    out = pd.concat(frames, ignore_index=True)
    return out.sort_values(["score", "predecessor"], ascending=[False, True]).reset_index(drop=True), info


def _evidence(e: pd.DataFrame, r) -> dict:
    col, pcol = ("source", "target") if r.role == "shipper" else ("target", "source")
    A = e[e[col] == r.predecessor]
    B = e[e[col] == r.successor]
    pa, pb = A[pcol].value_counts(), B[pcol].value_counts()
    shared = sorted(set(pa.index) & set(pb.index), key=lambda x: (-(pa[x] + pb[x]), x))
    ha, hb = A["hs4"].value_counts(), B["hs4"].value_counts()
    sh = []
    for p in shared[:8]:
        sh.append({"id": p, "pred_shipments": int(pa[p]), "succ_shipments": int(pb[p]),
                   "pred_last_month": int(A.loc[A[pcol] == p, "m"].max()),
                   "succ_first_month": int(B.loc[B[pcol] == p, "m"].min())})
    return {
        "pred_monthly": np.bincount(A["m"], minlength=N_MONTHS).tolist(),
        "succ_monthly": np.bincount(B["m"], minlength=N_MONTHS).tolist(),
        "shared_partners": sh,
        "pred_top_hs4": [{"hs4": k, "shipments": int(v)} for k, v in ha.head(5).items()],
        "succ_top_hs4": [{"hs4": k, "shipments": int(v)} for k, v in hb.head(5).items()],
        "pred_partner_count": int(len(pa)), "succ_partner_count": int(len(pb)),
    }


def chains(df: pd.DataFrame) -> list[dict]:
    """Follow predecessor -> successor links (Suspect/Possible) into multi-hop chains."""
    ok = df[df.verdict.isin(["Suspect", "Possible"])]
    nxt = {}
    for r in ok.itertuples():
        key = (r.role, r.predecessor)
        if key not in nxt or nxt[key][1] < r.score:
            nxt[key] = (r.successor, r.score)
    has_pred = {(r.role, r.successor) for r in ok.itertuples()}
    out = []
    for (role, start) in sorted(nxt):
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


def suspects_json(e: pd.DataFrame, df: pd.DataFrame, info: dict, top_n=100) -> dict:
    pairs = []
    for r in df.head(top_n).itertuples():
        rec = {
            "rank": len(pairs) + 1, "role": r.role,
            "predecessor": r.predecessor, "successor": r.successor,
            "verdict": r.verdict, "confidence": r.confidence, "reason": r.reason,
            "score": round(float(r.score), 4), "mutual_best": bool(r.mutual_best),
            "gap_months": int(r.gap), "stop_month": LABELS[int(r.pred_last)],
            "start_month": LABELS[int(r.succ_first)],
            "metrics": {k: round(float(getattr(r, k)), 4) for k in
                        ["partner_cosine", "partner_jaccard", "hs_cosine", "hs_jaccard", "volume_similarity",
                         "gap_score", "handover_alignment", "inherited_share", "name_similarity"]},
            "shared_partner_count": int(r.shared_partners),
            "revived_links": int(r.revived_links),
            "fish_related": bool(r.fish_related),
            "pred": {"shipments": int(r.pred_n), "first_month": int(r.pred_first), "last_month": int(r.pred_last),
                     "active_months": int(r.pred_active), "fish_share": round(float(r.pred_fish_share), 4)},
            "succ": {"shipments": int(r.succ_n), "first_month": int(r.succ_first), "last_month": int(r.succ_last),
                     "active_months": int(r.succ_active), "fish_share": round(float(r.succ_fish_share), 4)},
        }
        rec["evidence"] = _evidence(e, r)
        pairs.append(rec)
    # company-level list: each company takes the verdict of its strongest pair
    comp = {}
    for p in pairs:
        for side, other, lab in (("successor", "predecessor", "reappeared_as_successor_of"),
                                 ("predecessor", "successor", "disappeared_succeeded_by")):
            key = (p[side], p["role"])
            c = comp.setdefault(key, {"id": p[side], "role": p["role"], "verdict": None, "confidence": None,
                                      "best_score": 0, "fish_related": False, "links": []})
            c["links"].append({"type": lab, "other": p[other], "pair_rank": p["rank"], "score": p["score"],
                               "verdict": p["verdict"], "confidence": p["confidence"]})
            better = (c["verdict"] is None
                      or (VERDICT_ORDER[p["verdict"]], CONF_ORDER[p["confidence"]], -p["score"])
                      < (VERDICT_ORDER[c["verdict"]], CONF_ORDER[c["confidence"]], -c["best_score"]))
            if better:
                c.update(verdict=p["verdict"], confidence=p["confidence"], best_score=p["score"])
            c["fish_related"] = c["fish_related"] or p["fish_related"]
    companies = sorted(comp.values(), key=lambda c: (VERDICT_ORDER[c["verdict"]], CONF_ORDER[c["confidence"]],
                                                     -c["best_score"], c["id"]))
    for i, c in enumerate(companies):
        c["rank"] = i + 1
    vc = df.groupby(["verdict", "confidence"]).size()
    return {
        "method": {
            "stopper": f"last shipment <= {LABELS[STOP_LAST]} (silent for the final 6+ months), "
                       f">= {MIN_STOP_SHIP} shipments in >= {MIN_STOP_ACTIVE} months",
            "starter": f"first shipment >= {LABELS[START_FIRST]}, >= {MIN_START_SHIP} shipments in "
                       f">= {MIN_START_ACTIVE} months, starts and ends later than the predecessor",
            "window": f"successor's first month is {GAP_MIN}..+{GAP_MAX} months from the predecessor's last month",
            "similarity": "partner and HS profiles are log-count TF-IDF vectors (a shared hub or ubiquitous HS "
                          "code counts little); Jaccard overlaps of the raw sets are also used",
            "score_weights": SCORE_W,
            "filters": f">= {MIN_SHARED} shared partners; score >= {MIN_SCORE}; best successor of the stopper "
                       "or best predecessor of the starter",
            "verdicts": {
                "Suspect": "strong (score >= 0.70, >= 3 shared partners, HS cosine >= 0.6, gap -3..+6, >= 50% of "
                           "shared partners switch over) AND mutual best match AND both sides trade fish (>= 30%)",
                "Possible": "strong but not fish/mutual, or score >= 0.60 with partner switch-over and fish trade",
                "Insufficient evidence": "a candidate that meets the filters but not the bars above",
                "Unlikely": "predecessor keeps trading in reliable predicted links, or shared partners did "
                            "not switch over (< 25%), or a weak non-mutual match (score < 0.55)",
            },
            "confidence": {"High": ">= 5 shared partners, predecessor >= 30 and successor >= 15 shipments "
                                   "(or >= 3 reliable predicted links contradicting the stop)",
                           "Medium": ">= 3 shared partners and predecessor >= 15 shipments",
                           "Low": "otherwise"},
        },
        "population": {k: {kk: vv for kk, vv in v.items() if kk != "gap_profile"} for k, v in info.items()},
        "gap_profile": {k: v["gap_profile"] for k, v in info.items()},
        "pair_counts": {"total": int(len(df)),
                        "by_verdict": {k: int(v) for k, v in df.verdict.value_counts().items()},
                        "by_verdict_confidence": {f"{a}|{b}": int(v) for (a, b), v in vc.items()},
                        "by_role_verdict": {f"{a}|{b}": int(v) for (a, b), v in
                                            df.groupby(["role", "verdict"]).size().items()}},
        "pairs": pairs,
        "companies": companies,
        "chains": chains(df),
        "score_histogram": {"bins": [0.45, 0.5, 0.55, 0.6, 0.7, 0.8, 0.9, 1.0],
                            "counts": np.histogram(df.score, bins=[0.45, 0.5, 0.55, 0.6, 0.7, 0.8, 0.9, 1.0])[0].tolist()},
    }
