"""Q2: evaluate the 12 AI-predicted link bundles against the observed graph."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .common import BUNDLES, N_MONTHS, NODES, load_bundle

WEIGHTS = {  # reliability score weights (sum to 1)
    "plausibility": 0.30,   # hscodes/partners consistent with each source's real history
    "diversity": 0.20,      # links spread across many companies, not a few hubs
    "internal_uniqueness": 0.15,  # not the same predicted shipment repeated
    "completeness": 0.10,   # carries weight/volume like real edges
    "date_validity": 0.05,  # dates inside the 2028-2034 window
    "weight_realism": 0.10,  # predicted weights in line with the pair's history
    "novelty": 0.10,        # adds information not already in the graph
}
RELIABLE, QUESTIONABLE = 0.65, 0.45
MONTH_BINS = list(range(72, 87))  # 2034-01 .. 2035-03
WEIGHT_BINS = [0, 1, 2, 3, 4, 5, 6, 7, 10]


def _jsd(p: np.ndarray, q: np.ndarray) -> float:
    p = p / max(p.sum(), 1e-12)
    q = q / max(q.sum(), 1e-12)
    m = (p + q) / 2

    def kl(a, b):
        mask = a > 0
        return float((a[mask] * np.log2(a[mask] / b[mask])).sum())
    return 0.5 * kl(p, m) + 0.5 * kl(q, m)


def _entropy_norm(counts: pd.Series) -> float:
    p = counts.to_numpy(dtype=float)
    p = p / p.sum()
    if len(p) <= 1:
        return 0.0
    return float(-(p * np.log(p)).sum() / np.log(len(p)))


class Reference:
    """Indexes of the observed graph used to judge predicted links."""

    def __init__(self, e: pd.DataFrame):
        self.shippers = set(e["source"].unique())
        self.receivers = set(e["target"].unique())
        self.pairs = set(zip(e["source"], e["target"]))
        self.pair_hs = set(zip(e["source"], e["target"], e["hscode"]))
        self.src_hs = set(zip(e["source"], e["hscode"]))
        self.exact = set(zip(e["source"], e["target"], e["hscode"], e["m"].astype(int),
                             e["arrivaldate"].dt.day))
        self.src_fish = e.groupby("source")["fish"].mean()
        self.pair_w = e[e.weightkg > 0].groupby(["source", "target"])["weightkg"].median()
        self.src_hs4 = e.groupby(["source", "hs4"]).size()
        self.src_logw = e[e.weightkg > 0].assign(lw=np.log10(e.loc[e.weightkg > 0, "weightkg"]))
        e34 = e[e["m"] >= 72]
        self.month_ref = np.bincount(e34["m"] - 72, minlength=12).astype(float)
        self.omu_per_kg = (e.valueofgoods_omu / e.weightkg.replace(0, np.nan)).dropna()
        self.usd_per_kg = (e.valueofgoodsusd / e.weightkg.replace(0, np.nan)).dropna()
        nodes = pd.read_parquet(NODES).set_index("id")
        self.node_shp = nodes["shpcountry"].dropna().to_dict()
        self.node_rcv = nodes["rcvcountry"].dropna().to_dict()


def evaluate_bundle(name: str, ref: Reference) -> tuple[dict, pd.DataFrame]:
    b, bn = load_bundle(name)
    n = len(b)
    day = b["arrivaldate"].dt.day
    key = list(zip(b.source, b.target, b.hscode, b["m"].astype(int), day))
    exact = np.array([k in ref.exact for k in key])
    intra_dup = b.duplicated(["source", "target", "hscode", "arrivaldate"]).to_numpy()
    pair_known = np.array([(s, t) in ref.pairs for s, t in zip(b.source, b.target)])
    pair_hs_known = np.array([(s, t, h) in ref.pair_hs for s, t, h in zip(b.source, b.target, b.hscode)])
    src_hs_known = np.array([(s, h) in ref.src_hs for s, h in zip(b.source, b.hscode)])
    src_known = b.source.isin(ref.shippers).to_numpy()
    tgt_known = b.target.isin(ref.receivers).to_numpy()
    out_of_range = (b["m"] > N_MONTHS - 1).to_numpy()

    # hs4 distribution vs the same sources' real history (weighted by bundle usage)
    src_w = b.source.value_counts()
    hist = ref.src_hs4[ref.src_hs4.index.get_level_values(0).isin(src_w.index)]
    hist = hist.groupby(level=0, group_keys=False).apply(lambda s: s / s.sum())
    hist = (hist * src_w.reindex(hist.index.get_level_values(0)).to_numpy()).groupby(level=1).sum()
    bh = b.hs4.value_counts()
    allh = sorted(set(hist.index) | set(bh.index))
    hs_jsd = _jsd(bh.reindex(allh, fill_value=0).to_numpy(float), hist.reindex(allh, fill_value=0).to_numpy(float))
    fish_share = float(b.fish.mean())
    src_fish_hist = float(np.average(ref.src_fish.reindex(src_w.index).fillna(0), weights=src_w.to_numpy()))

    # weights vs pair history
    w = b.weightkg.astype(float)
    has_w = w.notna() & (w > 0)
    pw = pd.Series([ref.pair_w.get((s, t), np.nan) for s, t in zip(b.source, b.target)])
    lr = np.abs(np.log10(w[has_w].to_numpy() / pw[has_w.to_numpy()].to_numpy()))
    lr = lr[~np.isnan(lr)]
    weight_dev = float(np.median(lr)) if len(lr) else None
    # reference weight distribution for the same sources
    ref_lw = ref.src_logw[ref.src_logw.source.isin(src_w.index)]["lw"]
    b_lw = np.log10(w[has_w])

    months = np.bincount(np.clip(b["m"] - 72, 0, 14), minlength=15).astype(float)
    month_jsd = _jsd(months[:12] + 0, ref.month_ref) if months[:12].sum() else None

    # node country agreement
    agree, tot = 0, 0
    for _, r in bn.iterrows():
        for col, d in (("shpcountry", ref.node_shp), ("rcvcountry", ref.node_rcv)):
            v = r.get(col)
            if isinstance(v, str) and r["id"] in d:
                tot += 1
                agree += d[r["id"]] == v
    country_agree = agree / tot if tot else None

    omu_kg = (b.valueofgoods_omu.astype(float) / w.replace(0, np.nan)).dropna()

    # ---- score components (each in 0..1)
    plaus = float(np.mean([pair_hs_known.mean(), src_hs_known.mean(), 1 - hs_jsd]))
    diversity = float(min(1.0, b.source.nunique() / 50) * 0.5 + _entropy_norm(src_w) * 0.5
                      ) if b.source.nunique() > 1 else 0.0
    comp = {
        "plausibility": plaus,
        "diversity": diversity,
        "internal_uniqueness": float(1 - intra_dup.mean()),
        "completeness": float(np.mean([has_w.mean(), b.volumeteu.notna().mean()])),
        "date_validity": float(1 - out_of_range.mean()),
        "weight_realism": float(np.exp(-weight_dev)) if weight_dev is not None else 0.0,
        "novelty": float(1 - exact.mean()),
    }
    score = sum(WEIGHTS[k] * v for k, v in comp.items())
    verdict = "reliable" if score >= RELIABLE else ("questionable" if score >= QUESTIONABLE else "unreliable")

    top_hs = bh.head(8)
    metrics = {
        "links": n, "nodes": int(len(bn)),
        "sources": int(b.source.nunique()), "targets": int(b.target.nunique()),
        "links_per_source": round(n / b.source.nunique(), 2),
        "top_source_share": round(float(src_w.iloc[0] / n), 4),
        "intra_duplicate_rate": float(intra_dup.mean()),
        "exact_copy_of_graph_rate": float(exact.mean()),
        "known_pair_rate": float(pair_known.mean()),
        "known_pair_hscode_rate": float(pair_hs_known.mean()),
        "source_hscode_known_rate": float(src_hs_known.mean()),
        "source_in_graph_rate": float(src_known.mean()),
        "target_in_graph_rate": float(tgt_known.mean()),
        "new_pairs": int(len(set(zip(b.source[~pair_known], b.target[~pair_known])))),
        "new_nodes": int(len(set(b.target[~b.target.isin(ref.receivers | ref.shippers)])
                             | set(b.source[~b.source.isin(ref.shippers | ref.receivers)]))),
        "hs4_jsd_vs_source_history": hs_jsd,
        "fish_share": fish_share,
        "source_fish_share_history": src_fish_hist,
        "weight_present_rate": float(has_w.mean()),
        "volume_present_rate": float(b.volumeteu.notna().mean()),
        "value_omu_present_rate": float(b.valueofgoods_omu.notna().mean()),
        "median_abs_log10_weight_vs_pair": weight_dev,
        "median_value_omu_per_kg": float(omu_kg.median()) if len(omu_kg) else None,
        "out_of_range_date_rate": float(out_of_range.mean()),
        "date_min": b.arrivaldate.min().strftime("%Y-%m-%d"),
        "date_max": b.arrivaldate.max().strftime("%Y-%m-%d"),
        "month_jsd_vs_graph_2034": month_jsd,
        "node_country_agreement": country_agree,
    }
    hist_ref = hist / hist.sum()
    dists = {
        "hs4_top": [{"hs4": h, "bundle_share": round(float(v / n), 4),
                     "source_history_share": round(float(hist_ref.get(h, 0)), 4)} for h, v in top_hs.items()],
        "log10_weight": {"bins": WEIGHT_BINS,
                         "bundle": np.histogram(b_lw, bins=WEIGHT_BINS)[0].tolist(),
                         "source_history": (np.histogram(ref_lw, bins=WEIGHT_BINS)[0]
                                            / max(len(ref_lw), 1)).round(4).tolist()},
        "month": {"labels": [f"{2034 + i // 12}-{i % 12 + 1:02d}" for i in range(15)],
                  "bundle": months.astype(int).tolist(),
                  "graph_2034_share": (ref.month_ref / ref.month_ref.sum()).round(4).tolist()},
    }
    rec = {"bundle": name, "score": round(score, 4), "verdict": verdict,
           "components": {k: round(v, 4) for k, v in comp.items()},
           "metrics": metrics, "distributions": dists}
    b["_exact"] = exact
    b["_intra_dup"] = intra_dup
    b["_out_of_range"] = out_of_range
    return rec, b


def evaluate_all(e: pd.DataFrame) -> tuple[dict, dict[str, pd.DataFrame]]:
    ref = Reference(e)
    recs, frames = [], {}
    for name in BUNDLES:
        rec, b = evaluate_bundle(name, ref)
        recs.append(rec)
        frames[name] = b
    recs.sort(key=lambda r: -r["score"])
    for i, r in enumerate(recs):
        r["rank"] = i + 1
    # pairwise overlap between bundles (Jaccard of predicted pairs)
    psets = {k: set(zip(v.source, v.target)) for k, v in frames.items()}
    names = [r["bundle"] for r in recs]
    overlap = [[round(len(psets[a] & psets[b]) / max(len(psets[a] | psets[b]), 1), 4) for b in names]
               for a in names]
    out = {
        "score_weights": WEIGHTS,
        "thresholds": {"reliable": RELIABLE, "questionable": QUESTIONABLE},
        "component_definitions": {
            "plausibility": "mean of (pair+hscode seen in graph), (source shipped this hscode before), "
                            "and 1 - JSD between bundle HS-heading mix and the sources' historical mix",
            "diversity": "0.5*min(1, distinct sources/50) + 0.5*normalised entropy of links per source",
            "internal_uniqueness": "1 - share of links that repeat (source,target,hscode,date) inside the bundle",
            "completeness": "mean presence of weightkg and volumeteu (both present on real edges)",
            "date_validity": "1 - share of links dated after 2034-12 (outside the graph's window)",
            "weight_realism": "exp(-median |log10(predicted weight / pair's historical median weight)|)",
            "novelty": "1 - share of links that exactly copy an existing graph edge",
        },
        "bundles": recs,
        "pair_overlap": {"order": names, "jaccard": overlap},
        "caveat": "Graph edges carry USD values while bundles carry OMU values, so value comparisons are "
                  "only within bundles (median OMU/kg) and against the 281 graph edges that have OMU.",
        "graph_value_omu_per_kg_median": float(ref.omu_per_kg.median()),
        "graph_value_usd_per_kg_median": float(ref.usd_per_kg.median()),
    }
    return out, frames
