"""Q1: temporal patterns for companies and company pairs."""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

from .common import N_MONTHS, FISH_HEADINGS, month_labels

EDGE_MARGIN = 3  # months from the window edge that count as "present at start/end"


# ---------------------------------------------------------------- overview
def timeline_overview(e: pd.DataFrame) -> dict:
    m = e["m"].to_numpy()
    tot = np.bincount(m, minlength=N_MONTHS)
    fish = np.bincount(m[e["fish"].to_numpy()], minlength=N_MONTHS)
    w = np.bincount(m, weights=e["weightkg"].to_numpy(dtype=float), minlength=N_MONTHS)
    fw = np.bincount(m[e["fish"].to_numpy()], weights=e.loc[e["fish"], "weightkg"].to_numpy(dtype=float),
                     minlength=N_MONTHS)

    act_s = e.groupby("m")["source"].nunique().reindex(range(N_MONTHS), fill_value=0)
    act_r = e.groupby("m")["target"].nunique().reindex(range(N_MONTHS), fill_value=0)
    fs = e[e["fish"]]
    act_fs = fs.groupby("m")["source"].nunique().reindex(range(N_MONTHS), fill_value=0)

    first = e.groupby("source")["m"].min()
    last = e.groupby("source")["m"].max()
    entrants = np.bincount(first.to_numpy(), minlength=N_MONTHS)
    exits = np.bincount(last.to_numpy(), minlength=N_MONTHS)
    ffirst = fs.groupby("source")["m"].min()
    flast = fs.groupby("source")["m"].max()

    # fish product mix by year
    yr = e["arrivaldate"].dt.year
    mix = (fs.assign(year=yr[e["fish"]]).groupby(["year", "hs4"]).size().unstack(fill_value=0))
    fish_mix = {
        "years": [int(y) for y in mix.index],
        "headings": [{"hs4": h, "label": FISH_HEADINGS[h], "counts": [int(v) for v in mix[h]]}
                     for h in mix.columns],
    }
    # top chapters (chapter 03 is restored; other 01-09 chapters cannot be told apart from 10-99)
    ch = e["hs4"].str[:2]
    top_ch = ch.value_counts().head(15)
    # seasonality: mean shipments per calendar month relative to the overall monthly mean
    cal = np.array([tot[k::12].mean() for k in range(12)])
    fcal = np.array([fish[k::12].mean() for k in range(12)])

    return {
        "months": month_labels(),
        "shipments": tot.tolist(),
        "fish_shipments": fish.tolist(),
        "fish_share": (fish / np.maximum(tot, 1)).round(4).tolist(),
        "weight_kg": w.round(0).tolist(),
        "fish_weight_kg": fw.round(0).tolist(),
        "active_shippers": act_s.tolist(),
        "active_receivers": act_r.tolist(),
        "active_fish_shippers": act_fs.tolist(),
        "shipper_entrants": entrants.tolist(),
        "shipper_exits": exits.tolist(),
        "fish_shipper_entrants": np.bincount(ffirst.to_numpy(), minlength=N_MONTHS).tolist(),
        "fish_shipper_exits": np.bincount(flast.to_numpy(), minlength=N_MONTHS).tolist(),
        "fish_mix_by_year": fish_mix,
        "top_hs_chapters": [{"chapter": c, "shipments": int(v)} for c, v in top_ch.items()],
        "calendar_profile": {"months": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep",
                                        "Oct", "Nov", "Dec"],
                             "all_index": (cal / cal.mean()).round(4).tolist(),
                             "fish_index": (fcal / fcal.mean()).round(4).tolist()},
        "notes": "Entrants/exits at the first and last months are censored by the data window "
                 "(2028-01..2034-12) and should be visually de-emphasised.",
    }


# ---------------------------------------------------------------- companies
def company_lifecycle(first: int, last: int) -> str:
    start_edge = first <= EDGE_MARGIN - 1
    end_edge = last >= N_MONTHS - EDGE_MARGIN
    if start_edge and end_edge:
        return "persistent"
    if start_edge:
        return "exited"
    if end_edge:
        return "entrant"
    return "transient"


def company_table(e: pd.DataFrame) -> pd.DataFrame:
    """One row per company per role (shipper/receiver)."""
    rows = []
    for role, col, pcol in [("shipper", "source", "target"), ("receiver", "target", "source")]:
        g = e.groupby(col)
        t = pd.DataFrame({
            "shipments": g.size(),
            "first": g["m"].min(),
            "last": g["m"].max(),
            "active_months": g["m"].nunique(),
            "partners": g[pcol].nunique(),
            "fish_shipments": g["fish"].sum(),
            "hs_codes": g["hscode"].nunique(),
            "weight_kg": g["weightkg"].sum(),
        })
        top = e.groupby([col, pcol]).size().groupby(level=0).max()
        t["top_partner_share"] = top / t["shipments"]
        t["role"] = role
        t.index.name = "id"
        rows.append(t.reset_index())
    ct = pd.concat(rows, ignore_index=True)
    ct["fish_share"] = ct["fish_shipments"] / ct["shipments"]
    ct["span"] = ct["last"] - ct["first"] + 1
    ct["lifecycle"] = [company_lifecycle(f, l) for f, l in zip(ct["first"], ct["last"])]
    return ct


def companies_top(e: pd.DataFrame, ct: pd.DataFrame, n_total=100, n_fish=50) -> dict:
    shp = ct[ct.role == "shipper"].sort_values("shipments", ascending=False)
    rcv = ct[ct.role == "receiver"].sort_values("shipments", ascending=False)
    allc = pd.concat([shp, rcv]).sort_values("shipments", ascending=False)
    pick = allc.head(n_total).assign(selection="top_volume")
    fish = (ct[(ct.role == "shipper")].sort_values("fish_shipments", ascending=False))
    fish = fish[~fish.set_index(["id", "role"]).index.isin(pick.set_index(["id", "role"]).index)]
    pick = pd.concat([pick, fish.head(n_fish).assign(selection="top_fish_shipper")])

    groups = {}
    for role, col in [("shipper", "source"), ("receiver", "target")]:
        ids = set(pick.loc[pick.role == role, "id"])
        groups[role] = dict(tuple(e[e[col].isin(ids)].groupby(col)))
    out = []
    for _, r in pick.iterrows():
        col = "source" if r.role == "shipper" else "target"
        pcol = "target" if col == "source" else "source"
        sub = groups[r.role][r.id]
        s = np.bincount(sub["m"], minlength=N_MONTHS)
        sf = np.bincount(sub.loc[sub["fish"], "m"], minlength=N_MONTHS)
        tp = sub[pcol].value_counts().head(5)
        th = sub["hs4"].value_counts().head(5)
        out.append({
            "id": r.id, "role": r.role, "selection": r.selection,
            "shipments": int(r.shipments), "fish_share": round(float(r.fish_share), 4),
            "first_month": int(r["first"]), "last_month": int(r["last"]),
            "active_months": int(r.active_months), "lifecycle": r.lifecycle,
            "partners": int(r.partners), "hs_codes": int(r.hs_codes),
            "top_partner_share": round(float(r.top_partner_share), 4),
            "weight_kg": float(r.weight_kg),
            "monthly": s.tolist(), "monthly_fish": sf.tolist(),
            "top_partners": [{"id": k, "shipments": int(v)} for k, v in tp.items()],
            "top_hs4": [{"hs4": k, "shipments": int(v)} for k, v in th.items()],
        })
    bins = [1, 2, 4, 7, 13, 25, 37, 49, 61, 73, 85]
    life = {"bins": bins, "bin_labels": ["1", "2-3", "4-6", "7-12", "13-24", "25-36", "37-48", "49-60",
                                         "61-72", "73-84"]}
    for role in ("shipper", "receiver"):
        sub = ct[ct.role == role]
        life[role] = np.histogram(sub.span, bins=bins)[0].tolist()
        life[f"{role}_fish_majority"] = np.histogram(sub[sub.fish_share >= 0.5].span, bins=bins)[0].tolist()
        life[f"{role}_median_span"] = float(sub.span.median())
        life[f"{role}_single_month_share"] = float((sub.span == 1).mean())
    lc = ct.groupby(["role", "lifecycle"]).size().unstack(fill_value=0)
    lc_fish = ct[(ct.fish_share >= 0.5)].groupby(["role", "lifecycle"]).size().unstack(fill_value=0)
    return {
        "months": month_labels(),
        "lifespan_histogram": life,
        "lifecycle_counts": {role: {k: int(v) for k, v in lc.loc[role].items()} for role in lc.index},
        "lifecycle_counts_fish_majority": {role: {k: int(v) for k, v in lc_fish.loc[role].items()}
                                           for role in lc_fish.index},
        "lifecycle_definitions": {
            "persistent": "active in first 3 and last 3 months of the window",
            "entrant": "first seen after 2028-03, still active in the last 3 months",
            "exited": "present from the start, last seen before 2034-10",
            "transient": "appears after the start and disappears before the end",
        },
        "companies": out,
    }


# ---------------------------------------------------------------- pair patterns
PATTERN_INFO = {
    "one_off": "A single month of trade between the pair.",
    "short_burst": "Several shipments packed into <= 6 months, then nothing.",
    "seasonal": ">= 2 years of trade with >= 75% of shipments in the same 3 calendar months.",
    "abrupt_stop": "Regular trade (>= 12-month span, >= 50% of months active) that stops "
                   "at full strength >= 12 months before the data ends.",
    "fading": "Volume in the second half of the relationship <= 50% of the first half.",
    "ramping": "Volume in the second half of the relationship >= 2x the first half.",
    "steady": "Long-term (>= 24-month span), active in >= 60% of months, no strong trend.",
    "intermittent": "Recurring but irregular trade that fits none of the above.",
}
PATTERN_ORDER = list(PATTERN_INFO)


def pair_matrix(e: pd.DataFrame):
    pc = e.groupby(["source", "target", "m"]).size().rename("n").reset_index()
    keys = pc[["source", "target"]].drop_duplicates().reset_index(drop=True)
    keys["pid"] = np.arange(len(keys))
    pc = pc.merge(keys, on=["source", "target"])
    M = np.zeros((len(keys), N_MONTHS), dtype=np.int32)
    M[pc["pid"].to_numpy(), pc["m"].to_numpy()] = pc["n"].to_numpy()
    return keys, M


def pair_features(M: np.ndarray) -> pd.DataFrame:
    n = M.sum(1)
    act = M > 0
    active = act.sum(1)
    idx = np.arange(N_MONTHS)
    first = np.where(act, idx, N_MONTHS).min(1)
    last = np.where(act, idx, -1).max(1)
    span = last - first + 1
    coverage = active / span
    # trend: second half vs first half of the pair's own span
    mid = (first + last + 1) / 2.0
    left = (M * (idx[None, :] < mid[:, None])).sum(1)
    right = (M * (idx[None, :] >= mid[:, None])).sum(1)
    trend = np.log2((right + 1) / (left + 1))
    # seasonality: best circular 3-calendar-month window share
    cal = np.zeros((len(M), 12))
    for k in range(12):
        cal[:, k] = M[:, k::12].sum(1)
    win = cal + np.roll(cal, -1, 1) + np.roll(cal, -2, 1)
    season_share = win.max(1) / np.maximum(n, 1)
    years = np.zeros(len(M), dtype=int)
    for y in range(N_MONTHS // 12):
        years += act[:, y * 12:(y + 1) * 12].any(1)
    # strength over last 6 months of span relative to average
    tail_mask = (idx[None, :] > (last[:, None] - 6)) & (idx[None, :] <= last[:, None])
    tail_rate = (M * tail_mask).sum(1) / np.minimum(6, span)
    avg_rate = n / span
    tail_ratio = tail_rate / np.maximum(avg_rate, 1e-9)
    mean_act = n / np.maximum(active, 1)
    sd = np.sqrt(((M - avg_rate[:, None]) ** 2 * (idx[None, :] >= first[:, None])
                  * (idx[None, :] <= last[:, None])).sum(1) / span)
    cv = sd / np.maximum(avg_rate, 1e-9)
    return pd.DataFrame(dict(n=n, active=active, first=first, last=last, span=span,
                             coverage=coverage, trend=trend, season_share=season_share,
                             years=years, tail_ratio=tail_ratio, mean_active=mean_act, cv=cv))


def classify(f: pd.DataFrame) -> np.ndarray:
    cat = np.full(len(f), "intermittent", dtype=object)
    rules = [
        ("one_off", f.active == 1),
        ("short_burst", (f.active >= 2) & (f.span <= 6)),
        ("seasonal", (f.span >= 24) & (f.years >= 2) & (f.active >= 4) & (f.season_share >= 0.75)),
        ("abrupt_stop", (f["last"] <= N_MONTHS - 13) & (f.span >= 12) & (f.coverage >= 0.5)
         & (f.tail_ratio >= 0.75)),
        ("fading", (f.span >= 12) & (f.trend <= -1)),
        ("ramping", (f.span >= 12) & (f.trend >= 1)),
        ("steady", (f.span >= 24) & (f.coverage >= 0.6)),
    ]
    done = np.zeros(len(f), dtype=bool)
    for name, mask in rules:
        mk = mask.to_numpy() & ~done
        cat[mk] = name
        done |= mk
    return cat


def kmeans_check(f: pd.DataFrame, cats: np.ndarray, k=8) -> dict:
    """Unsupervised cross-check on recurring pairs (>= 3 active months)."""
    sel = (f.active >= 3).to_numpy()
    X = np.column_stack([np.log1p(f.n), f.coverage, f.span / N_MONTHS, f["first"] / N_MONTHS,
                         f["last"] / N_MONTHS, f.trend.clip(-4, 4), f.season_share, np.log1p(f.cv)])[sel]
    Xs = StandardScaler().fit_transform(X)
    km = KMeans(n_clusters=k, n_init=5, random_state=0).fit(Xs)
    lab = km.labels_
    names = ["log_n", "coverage", "span_frac", "first_frac", "last_frac", "trend", "season_share", "log_cv"]
    cents = StandardScaler().fit(X).inverse_transform(km.cluster_centers_)
    ct = pd.crosstab(lab, cats[sel])
    clusters = []
    for c in range(k):
        row = ct.loc[c]
        clusters.append({
            "cluster": c, "size": int((lab == c).sum()),
            "centroid": {nm: round(float(v), 3) for nm, v in zip(names, cents[c])},
            "rule_category_counts": {kk: int(v) for kk, v in row.items() if v > 0},
            "dominant_rule_category": row.idxmax(),
            "purity": round(float(row.max() / row.sum()), 3),
        })
    purity = float(sum(ct.max(1)) / ct.values.sum())
    return {"k": k, "n_pairs": int(sel.sum()), "weighted_purity": round(purity, 3), "clusters": clusters}


def patterns(e: pd.DataFrame) -> tuple[dict, pd.DataFrame, np.ndarray]:
    keys, M = pair_matrix(e)
    f = pair_features(M)
    cats = classify(f)
    f["category"] = cats
    fish_pairs = e.groupby(["source", "target"])["fish"].mean().rename("fish_share").reset_index()
    keys = keys.merge(fish_pairs, on=["source", "target"], how="left")
    f["fish_share"] = keys["fish_share"].to_numpy()
    f["source"] = keys["source"].to_numpy()
    f["target"] = keys["target"].to_numpy()

    cats_out = []
    for c in PATTERN_ORDER:
        sub = f[f.category == c]
        ex = []
        cand = sub[sub.n >= 6] if (sub.n >= 6).any() else sub
        # exemplars: most typical among the busier pairs (closest to category median features)
        if len(cand):
            cand = cand.sort_values("n", ascending=False).head(400)
            z = cand[["coverage", "span", "trend", "season_share"]]
            d = ((z - z.median()) / (z.std() + 1e-9)).abs().sum(1)
            for i in d.sort_values().index[:4]:
                r = f.loc[i]
                ex.append({"source": r.source, "target": r.target, "shipments": int(r.n),
                           "first_month": int(r["first"]), "last_month": int(r["last"]),
                           "fish_share": round(float(r.fish_share), 3),
                           "monthly": M[i].tolist()})
        agg = M[(f.category == c).to_numpy()].sum(0)
        cats_out.append({
            "category": c, "definition": PATTERN_INFO[c],
            "pairs": int(len(sub)), "shipments": int(sub.n.sum()),
            "fish_pairs": int((sub.fish_share >= 0.5).sum()),
            "median_span_months": float(sub.span.median()) if len(sub) else None,
            "median_shipments": float(sub.n.median()) if len(sub) else None,
            "aggregate_monthly": agg.tolist(),
            "exemplars": ex,
        })
    fish_ct = f[f.fish_share >= 0.5].category.value_counts()
    all_ct = f.category.value_counts()
    # reciprocity: pairs trading both directions
    pairs = set(zip(f.source, f.target))
    recip = sum((t, s) in pairs for s, t in pairs) // 2
    out = {
        "months": month_labels(),
        "n_pairs": int(len(f)),
        "n_recurring_pairs": int((f.active >= 3).sum()),
        "reciprocal_pairs": int(recip),
        "categories": cats_out,
        "fish_vs_all_share": {c: {"all": round(float(all_ct.get(c, 0) / len(f)), 4),
                                  "fish": round(float(fish_ct.get(c, 0) / max(fish_ct.sum(), 1)), 4)}
                              for c in PATTERN_ORDER},
        "feature_histograms": {
            "span_months": np.histogram(f.span, bins=[1, 2, 4, 7, 13, 25, 37, 49, 61, 73, 85])[0].tolist(),
            "span_bins": [1, 2, 4, 7, 13, 25, 37, 49, 61, 73, 85],
            "coverage": np.histogram(f.coverage, bins=10, range=(0, 1))[0].tolist(),
        },
        "kmeans_check": kmeans_check(f, cats),
    }
    return out, f, M
