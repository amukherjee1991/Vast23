"""Q2: evaluate the 12 AI-predicted link bundles against the observed graph.

Every bundle predicts 2034 links. Each one is judged against the real graph in two ways:
* history  = graph edges before 2034 (what a company/pair had done before), and
* baseline = real, de-duplicated 2034 graph edges (what genuine 2034 links look like).
Distribution statistics are compared with a null distribution built from random samples of
real 2034 edges of the same size as the bundle, so small bundles are not punished for noise.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .common import BUNDLES, N_MONTHS, NODES, load_bundle

YEAR_M0 = 72                      # first month of 2034
N_NULL = 200                      # null samples per bundle
SEED = 2023
VALUE_SCALE = 0.25                # dex of systematic price bias that costs a factor e^-1
WEIGHTS = {                       # reliability score weights (sum to 1)
    "uniqueness": 0.15,           # links are distinct records, not one record repeated
    "novelty_balance": 0.15,      # some links match real records (anchored), most add new ones
    "schema": 0.10,               # carries weightkg / volumeteu like real edges
    "date_validity": 0.05,        # dates fall inside the graph window (2028-01..2034-12)
    "month_fit": 0.05,            # 2034 month mix looks like real 2034 traffic
    "endpoint_plausibility": 0.10,  # pairs/products have history like real 2034 links
    "hs_mix_fit": 0.05,           # product mix matches what these shippers historically ship
    "concentration_fit": 0.10,    # links are spread over companies like real traffic
    "weight_realism": 0.05,       # weights in line with each pair's history
    "value_realism": 0.10,        # OMU/kg in line with typical price for the HS code
    "node_consistency": 0.10,     # bundle node countries agree with the graph's node records
}
RELIABLE, QUESTIONABLE = 0.75, 0.50
NOVELTY_BAND = 0.20               # copy rates within [0.2, 0.8] score 1; 0 and 1 score 0
# Critical gates force "Unreliable"; major gates cap the verdict at "Questionable".
GATES = {
    "unique_rate": ("critical", "<", 0.25, "over 75% of links repeat another link in the bundle"),
    "distinct_links": ("critical", "<", 20, "fewer than 20 distinct links"),
    "exact_copy_rate": ("critical", ">", 0.95, "almost every distinct link already exists in the graph"),
    "weight_present_rate": ("major", "<", 0.5, "most links have no weightkg, so weight and value cannot be verified"),
    "out_of_range_date_rate": ("major", ">", 0.05, "more than 5% of links are dated outside the graph window"),
}
WEIGHT_BINS = [0, 1, 2, 3, 4, 5, 6, 7, 10]
OFFSET_BINS = [-3, -1.5, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 1.5, 3]


def _jsd(p: np.ndarray, q: np.ndarray) -> float:
    p = p / max(p.sum(), 1e-12)
    q = q / max(q.sum(), 1e-12)
    m = (p + q) / 2

    def kl(a, b):
        mask = a > 0
        return float((a[mask] * np.log2(a[mask] / b[mask])).sum())
    return 0.5 * kl(p, m) + 0.5 * kl(q, m)


def _entropy_norm(values: pd.Series) -> float:
    """Entropy of the link distribution over companies, normalised by log(#links)."""
    n = len(values)
    if n <= 1:
        return 0.0
    p = values.value_counts().to_numpy(dtype=float) / n
    return float(-(p * np.log(p)).sum() / np.log(n))


def _ratio_score(good: float, observed: float, higher_is_better: bool) -> float:
    """1 when observed is at least as good as the reference, else the proportional shortfall."""
    if observed is None or good is None or np.isnan(observed):
        return 0.0
    if higher_is_better:
        return float(min(1.0, observed / good)) if good > 0 else 1.0
    return float(min(1.0, good / observed)) if observed > 0 else 1.0


class Reference:
    """Indexes of the observed graph used to judge predicted links."""

    def __init__(self, e: pd.DataFrame):
        hist = e[e["m"] < YEAR_M0]
        self.real34 = e[e["m"] >= YEAR_M0].reset_index(drop=True)
        self.n_raw = int(e.attrs.get("n_raw", len(e)))
        self.graph_unique_rate = len(e) / self.n_raw
        self.shippers = set(e["source"].unique())
        self.receivers = set(e["target"].unique())
        self.nodes_all = self.shippers | self.receivers
        self.pairs_all = set(zip(e["source"], e["target"]))
        self.exact = set(zip(e["source"], e["target"], e["hscode"], e["arrivaldate"]))
        # pre-2034 history
        self.h_pairs = set(zip(hist["source"], hist["target"]))
        self.h_src_hs = set(zip(hist["source"], hist["hscode"]))
        sh = hist.groupby(["source", "hs4"]).size()
        self.src_hs4_share = (sh / sh.groupby(level=0).transform("sum")).rename("share")
        hw = hist[hist.weightkg > 0]
        self.pair_logw = np.log10(hw.groupby(["source", "target"])["weightkg"].median())
        # month mix of real 2034 traffic
        self.month_ref = np.bincount(self.real34["m"] - YEAR_M0, minlength=12).astype(float)
        # price reference: median log10(USD/kg) per HS code over the whole graph
        pv = e[(e["weightkg"] > 0) & (e["valueofgoodsusd"] > 0)]
        self.hs_log_usd_kg = np.log10(pv["valueofgoodsusd"] / pv["weightkg"]).groupby(pv["hscode"]).median()
        om = e[e.valueofgoods_omu.notna() & (e.weightkg > 0)]
        self.graph_omu_offset = (np.log10(om.valueofgoods_omu / om.weightkg)
                                 - om.hscode.map(self.hs_log_usd_kg)).dropna()
        self.omu_offset_ref = float(self.graph_omu_offset.median())
        # standard error of the reference median (1.2533 * sd / sqrt(n)); biases within 2 SE are free
        self.omu_offset_se = float(1.2533 * self.graph_omu_offset.std() / np.sqrt(len(self.graph_omu_offset)))
        nodes = pd.read_parquet(NODES).set_index("id")
        self.node_shp = nodes["shpcountry"].dropna().to_dict()
        # baselines measured on real 2034 links
        r = self.real34
        self.base_pair_known = float(np.mean([p in self.h_pairs for p in zip(r.source, r.target)]))
        self.base_src_hs_known = float(np.mean([p in self.h_src_hs for p in zip(r.source, r.hscode)]))
        self.base_weight_dev = self.weight_dev(r)
        self.base_vol_present = float(e.volumeteu.notna().mean())
        self.base_weight_present = float((e.weightkg > 0).mean())

    # ---- statistics shared by bundles and null samples
    def hs_jsd(self, b: pd.DataFrame) -> float | None:
        """JSD between a link set's HS-heading mix and the mix its sources shipped before 2034."""
        src_w = b.source.value_counts()
        h = self.src_hs4_share[self.src_hs4_share.index.get_level_values(0).isin(src_w.index)]
        if h.empty:
            return None
        sub = b[b.source.isin(h.index.get_level_values(0).unique())]
        exp = (h * src_w.reindex(h.index.get_level_values(0)).to_numpy()).groupby(level=1).sum()
        obs = sub.hs4.value_counts()
        keys = sorted(set(exp.index) | set(obs.index))
        return _jsd(obs.reindex(keys, fill_value=0).to_numpy(float), exp.reindex(keys, fill_value=0).to_numpy(float))

    def concentration(self, b: pd.DataFrame) -> float:
        return float(np.mean([_entropy_norm(b.source), _entropy_norm(b.target)]))

    def month_jsd(self, b: pd.DataFrame) -> float | None:
        m = b["m"].to_numpy()
        m = m[(m >= YEAR_M0) & (m < N_MONTHS)] - YEAR_M0
        if len(m) == 0:
            return None
        return _jsd(np.bincount(m, minlength=12).astype(float), self.month_ref)

    def weight_dev(self, b: pd.DataFrame) -> float | None:
        w = b.weightkg.astype(float)
        ok = (w > 0).to_numpy()
        if not ok.any():
            return None
        idx = pd.MultiIndex.from_arrays([b.source[ok], b.target[ok]])
        ref = self.pair_logw.reindex(idx).to_numpy()
        d = np.abs(np.log10(w[ok].to_numpy()) - ref)
        d = d[~np.isnan(d)]
        return float(np.median(d)) if len(d) else None

    def null(self, n: int, rng) -> dict:
        stats = {"hs_jsd": [], "concentration": [], "month_jsd": []}
        for _ in range(N_NULL):
            s = self.real34.iloc[rng.choice(len(self.real34), size=n, replace=False)]
            stats["hs_jsd"].append(self.hs_jsd(s))
            stats["concentration"].append(self.concentration(s))
            stats["month_jsd"].append(self.month_jsd(s))
        return {k: np.array([x for x in v if x is not None]) for k, v in stats.items()}


def evaluate_bundle(name: str, ref: Reference, rng) -> tuple[dict, pd.DataFrame]:
    b, bn = load_bundle(name)
    n = len(b)
    b["weightkg"] = pd.to_numeric(b["weightkg"], errors="coerce")
    rec_key = ["source", "target", "hscode", "arrivaldate", "weightkg", "valueofgoods_omu"]
    intra_dup = b.duplicated(rec_key).to_numpy()
    u = b[~intra_dup].copy()                      # distinct records; all distribution stats use these
    nu = len(u)
    exact = np.array([k in ref.exact for k in zip(u.source, u.target, u.hscode, u.arrivaldate)])
    out_of_range = ((u["m"] < 0) | (u["m"] > N_MONTHS - 1)).to_numpy()
    pair_known_hist = np.array([p in ref.h_pairs for p in zip(u.source, u.target)])
    src_hs_known = np.array([p in ref.h_src_hs for p in zip(u.source, u.hscode)])
    pair_known_any = np.array([p in ref.pairs_all for p in zip(u.source, u.target)])
    w = u.weightkg
    has_w = (w > 0).to_numpy()

    # value per kg: log10(OMU/kg) minus the graph's median log10(USD/kg) for the same HS code
    vk = u[has_w & u.valueofgoods_omu.notna().to_numpy()]
    offset = (np.log10(vk.valueofgoods_omu.astype(float) / vk.weightkg) - vk.hscode.map(ref.hs_log_usd_kg)).dropna()
    value_bias = float(offset.median() - ref.omu_offset_ref) if len(offset) else None

    hs_jsd = ref.hs_jsd(u)
    conc = ref.concentration(u)
    mj = ref.month_jsd(u)
    wdev = ref.weight_dev(u)
    nul = ref.null(nu, rng)
    null_hs95 = float(np.quantile(nul["hs_jsd"], 0.95))
    null_conc05 = float(np.quantile(nul["concentration"], 0.05))
    null_m95 = float(np.quantile(nul["month_jsd"], 0.95))

    # node checks
    agree = tot = 0
    for r in bn.itertuples():
        v = getattr(r, "shpcountry", None)
        if isinstance(v, str) and r.id in ref.node_shp:
            tot += 1
            agree += ref.node_shp[r.id] == v
    new_nodes = (set(u.source) | set(u.target)) - ref.nodes_all

    comp = {
        "uniqueness": _ratio_score(ref.graph_unique_rate, nu / n, True),
        "novelty_balance": float(max(0.0, min(1.0, exact.mean() / NOVELTY_BAND, (1 - exact.mean()) / NOVELTY_BAND))),
        "schema": float(np.mean([min(1.0, has_w.mean() / ref.base_weight_present),
                                 min(1.0, u.volumeteu.notna().mean() / ref.base_vol_present)])),
        "date_validity": float(1 - out_of_range.mean()),
        "month_fit": _ratio_score(null_m95, mj, False) if mj is not None else 0.0,
        "endpoint_plausibility": float(np.mean([
            _ratio_score(ref.base_pair_known, pair_known_hist.mean(), True),
            _ratio_score(ref.base_src_hs_known, src_hs_known.mean(), True)])),
        "hs_mix_fit": _ratio_score(null_hs95, hs_jsd, False) if hs_jsd is not None else 0.0,
        "concentration_fit": _ratio_score(null_conc05, conc, True),
        "weight_realism": _ratio_score(ref.base_weight_dev, wdev, False) if wdev is not None else 0.0,
        "value_realism": (float(np.exp(-max(0.0, abs(value_bias) - 2 * ref.omu_offset_se) / VALUE_SCALE))
                          if value_bias is not None else 0.0),
        "node_consistency": agree / tot if tot else 0.0,
    }
    score = float(sum(WEIGHTS[k] * v for k, v in comp.items()))

    metrics = {
        "links": n, "distinct_links": nu, "nodes": int(len(bn)),
        "sources": int(u.source.nunique()), "targets": int(u.target.nunique()),
        "links_per_source": round(nu / max(u.source.nunique(), 1), 2),
        "top_source": u.source.value_counts().index[0],
        "top_source_share": float(u.source.value_counts().iloc[0] / nu),
        "top_target": u.target.value_counts().index[0],
        "top_target_share": float(u.target.value_counts().iloc[0] / nu),
        "unique_rate": nu / n,
        "exact_copy_rate": float(exact.mean()),
        "new_links": int((~exact & ~out_of_range).sum()),
        "out_of_range_date_rate": float(out_of_range.mean()),
        "date_min": b.arrivaldate.min().strftime("%Y-%m-%d"),
        "date_max": b.arrivaldate.max().strftime("%Y-%m-%d"),
        "weight_present_rate": float(has_w.mean()),
        "volume_present_rate": float(u.volumeteu.notna().mean()),
        "value_omu_present_rate": float(u.valueofgoods_omu.notna().mean()),
        "hscode_5digit_rate": float(u.hscode_5digit.mean()),
        "fish_share": float(u.fish.mean()),
        "pair_known_before_2034_rate": float(pair_known_hist.mean()),
        "pair_in_graph_rate": float(pair_known_any.mean()),
        "source_hscode_known_rate": float(src_hs_known.mean()),
        "source_in_graph_rate": float(u.source.isin(ref.nodes_all).mean()),
        "target_in_graph_rate": float(u.target.isin(ref.nodes_all).mean()),
        "new_nodes": int(len(new_nodes)),
        "new_pairs": int(len(set(zip(u.source[~pair_known_any], u.target[~pair_known_any])))),
        "hs4_jsd_vs_source_history": hs_jsd, "hs4_jsd_null_p95": null_hs95,
        "concentration_entropy": conc, "concentration_null_p05": null_conc05,
        "month_jsd_vs_2034": mj, "month_jsd_null_p95": null_m95,
        "median_abs_log10_weight_vs_pair_history": wdev,
        "median_value_offset_dex": float(offset.median()) if len(offset) else None,
        "value_bias_dex": value_bias,
        "node_country_agreement": agree / tot if tot else None,
    }
    gates_failed = []
    for k, (level, op, thr, why) in GATES.items():
        v = metrics[k]
        if (v < thr) if op == "<" else (v > thr):
            gates_failed.append({"metric": k, "level": level, "value": round(float(v), 4),
                                 "threshold": thr, "reason": why})
    levels = {g["level"] for g in gates_failed}
    if "critical" in levels or score < QUESTIONABLE:
        verdict = "Unreliable"
    elif score >= RELIABLE and not levels:
        verdict = "Reliable"
    else:
        verdict = "Questionable"

    bh = u.hs4.value_counts()
    real_h = ref.real34.hs4.value_counts(normalize=True)
    real_lw = np.log10(ref.real34.weightkg[ref.real34.weightkg > 0])
    months = np.bincount(np.clip(b["m"] - YEAR_M0 + 1, 0, 16), minlength=17)  # [<2034, 2034-01..2035-04+]
    dists = {
        "hs4_top": [{"hs4": h, "bundle_share": round(float(v / nu), 4),
                     "graph_2034_share": round(float(real_h.get(h, 0)), 4)} for h, v in bh.head(8).items()],
        "log10_weight": {"bins": WEIGHT_BINS,
                         "bundle": np.histogram(np.log10(w[has_w]), bins=WEIGHT_BINS)[0].tolist(),
                         "graph_2034_share": (np.histogram(real_lw, bins=WEIGHT_BINS)[0] / len(real_lw)).round(4).tolist()},
        "value_offset_dex": {"bins": OFFSET_BINS,
                             "bundle": np.histogram(offset.clip(-2.99, 2.99), bins=OFFSET_BINS)[0].tolist(),
                             "graph_omu_share": (np.histogram(ref.graph_omu_offset.clip(-2.99, 2.99), bins=OFFSET_BINS)[0]
                                                 / len(ref.graph_omu_offset)).round(4).tolist()},
        "month": {"labels": ["<2034"] + [f"{2034 + i // 12}-{i % 12 + 1:02d}" for i in range(16)],
                  "bundle": months.tolist(),
                  "graph_2034_share": [0] + (ref.month_ref / ref.month_ref.sum()).round(4).tolist() + [0] * 4},
    }
    rec = {"bundle": name, "score": round(score, 4), "verdict": verdict, "gates_failed": gates_failed,
           "components": {k: round(v, 4) for k, v in comp.items()},
           "metrics": metrics, "distributions": dists}
    b["_intra_dup"] = intra_dup
    b["_exact"] = False
    b.loc[~intra_dup, "_exact"] = exact
    b["_out_of_range"] = ((b["m"] < 0) | (b["m"] > N_MONTHS - 1)).to_numpy()
    return rec, b


def evaluate_all(e: pd.DataFrame) -> tuple[dict, dict[str, pd.DataFrame]]:
    ref = Reference(e)
    recs, frames = [], {}
    for name in BUNDLES:
        rng = np.random.default_rng(SEED)
        rec, b = evaluate_bundle(name, ref, rng)
        recs.append(rec)
        frames[name] = b
    order = {"Reliable": 0, "Questionable": 1, "Unreliable": 2}
    recs.sort(key=lambda r: (order[r["verdict"]], -r["score"]))
    for i, r in enumerate(recs):
        r["rank"] = i + 1
    psets = {k: set(zip(v.source, v.target)) for k, v in frames.items()}
    names = [r["bundle"] for r in recs]
    overlap = [[round(len(psets[a] & psets[b]) / max(len(psets[a] | psets[b]), 1), 4) for b in names]
               for a in names]
    out = {
        "score_weights": WEIGHTS,
        "thresholds": {"Reliable": RELIABLE, "Questionable": QUESTIONABLE},
        "gates": {k: {"level": lv, "op": op, "threshold": t, "reason": why} for k, (lv, op, t, why) in GATES.items()},
        "verdict_rule": "Unreliable if any critical gate fails or score < 0.50; Reliable if score >= 0.75 and "
                        "no gate fails; otherwise Questionable.",
        "component_definitions": {
            "uniqueness": "distinct records / links, relative to the graph's own rate "
                          f"({ref.graph_unique_rate:.4f}; 2.8% of graph edges are exact duplicates)",
            "novelty_balance": "min(1, c/0.2, (1-c)/0.2) where c = share of distinct links that exactly match a "
                               "graph edge (source, target, hscode, date). A chance match is near impossible, so "
                               "c > 0 shows the generator is anchored to real records; c near 1 means it adds "
                               "nothing new. The five diverse bundles converge on c = 0.42-0.59.",
            "schema": "presence of weightkg and volumeteu relative to the graph (100% and 90.5%)",
            "date_validity": "share of links dated inside 2028-01..2034-12",
            "month_fit": "JSD of the 2034 month mix vs real 2034 traffic; 1 if within the 95th percentile "
                         "of same-size random samples of real 2034 edges, else null_p95 / JSD",
            "endpoint_plausibility": "mean of (pair traded before 2034) and (source shipped this HS code "
                                     "before 2034), each relative to the rate for real 2034 edges "
                                     f"({ref.base_pair_known:.3f} and {ref.base_src_hs_known:.3f})",
            "hs_mix_fit": "JSD between the bundle's HS-heading mix and its sources' pre-2034 mix; "
                          "1 if within the null 95th percentile, else null_p95 / JSD",
            "concentration_fit": "normalised entropy of links over sources and targets; 1 if above the "
                                 "null 5th percentile, else entropy / null_p05",
            "weight_realism": "median |log10(weight / pair's pre-2034 median weight)| compared with real "
                              f"2034 edges ({ref.base_weight_dev:.3f}); 0 when no weights",
            "node_consistency": "share of bundle nodes whose shpcountry matches the graph's node record",
            "value_realism": "exp(-max(0, |bias| - 2 SE) / 0.25) where bias is the median log10(OMU/kg) minus the graph's "
                             "median log10(USD/kg) for the same HS code, relative to the graph's own OMU "
                             f"edges (median offset {ref.omu_offset_ref:.3f} dex); 0 when not computable",
        },
        "baselines_real_2034": {
            "pair_known_before_2034": ref.base_pair_known,
            "source_hscode_known_before_2034": ref.base_src_hs_known,
            "median_abs_log10_weight_vs_pair_history": ref.base_weight_dev,
            "graph_unique_rate": ref.graph_unique_rate,
            "graph_omu_value_offset_median_dex": ref.omu_offset_ref,
            "graph_omu_edges_with_weight": int(len(ref.graph_omu_offset)),
            "graph_omu_value_offset_median_se_dex": ref.omu_offset_se,
            "null_samples": N_NULL,
        },
        "bundles": recs,
        "pair_overlap": {"order": names, "jaccard": overlap},
        "caveat": "Graph edges carry USD values (45% of edges) while bundles carry OMU values; only 281 graph "
                  "edges carry OMU. Value realism therefore compares price offsets per HS code, using the "
                  "graph's own OMU edges as the reference offset.",
    }
    return out, frames
