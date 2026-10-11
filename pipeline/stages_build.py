"""Stage layouts for the "night sea" scroll stories: precomputed positions for the
full-bleed canvas stage of every chapter.

Run from the repo root:
    .venv/bin/python pipeline/stages_build.py

Reads  data/raw/mc1/MC1.json, data/raw/mc3/MC3.json,
       data/processed/mc2_{edges,nodes}.parquet, app/public/data/mc1/candidates.json
Writes app/public/data/mc1/constellation.json   (MC1 graph as a night sky)
       app/public/data/mc3/galaxy.json          (MC3 giant component + name-collision ablation)
       app/public/data/mc2/currents.json        (country-to-country trade as ocean currents)
       app/public/data/home/drift.json          (monthly totals + sampled shipments)

Contract: docs/data-contracts/stages.md.

The graph logic is imported from the MC pipelines (mc1_build, mc3_build, mc2lib), so ids,
classes, the MC1 low-weight layer, the MC3 Louvain slices and the 651-person ablation set
are exactly the ones in the existing JSON. Layouts use igraph's Fruchterman-Reingold with
fixed seeds and explicit start positions; every node/edge list is sorted before it is laid
out or emitted, so the output is byte-identical across runs.

Coordinates: after layout each picture is rotated onto its principal axes (long axis
horizontal, signs fixed by skewness), then scaled uniformly so the longer side spans
[0, 1]; the shorter side is centred inside [0, 1]. `aspect` = width / height of the
drawing's bounding box, so a renderer can size the canvas without distortion.
"""
from __future__ import annotations

import json
import math
import random
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import igraph as ig
import networkx as nx
import numpy as np
import pandas as pd
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import mc1_build as m1  # noqa: E402
import mc3_build as m3  # noqa: E402
from mc2lib import common as m2c  # noqa: E402

DATA = ROOT / "app/public/data"
SEED = 42
DRIFT = 1.1        # MC3 after-state: radial stretch of fragment centroids
DRIFT_GAP = 0.12   # ... plus a gap (share of the before radius) outside the remaining giant
AFTER_EXTENT = 1.3  # after-state size relative to the before galaxy
GIANT_SPREAD = 0.3  # remaining giant: its community centroids spread to this x the before radius
GOLDEN = math.pi * (3 - math.sqrt(5))  # golden angle, spreads items evenly around a ring


# --------------------------------------------------------------------------- helpers

def log(*a):
    print(*a, file=sys.stderr, flush=True)


def dump(rel: str, obj) -> int:
    p = DATA / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    s = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    p.write_text(s, encoding="utf-8")
    n = len(s.encode("utf-8"))
    log(f"wrote {p.relative_to(ROOT)} {n / 1024:.1f} KB")
    return n


def q4(x):
    """Round to 4 dp; never -0.0, never NaN."""
    x = float(x)
    assert math.isfinite(x), x
    return round(x, 4) + 0.0


def fr_layout(n, edges, weights=None, seed_pos=None, niter=500, start_temp=None, grid="auto"):
    """Deterministic igraph Fruchterman-Reingold. Start positions come from a seeded
    numpy RNG unless given, and igraph's own RNG is reseeded on every call."""
    ig.set_random_number_generator(random.Random(SEED))
    g = ig.Graph(n=n, edges=list(edges))
    if seed_pos is None:
        rng = np.random.default_rng(SEED + n)
        seed_pos = rng.uniform(-1, 1, size=(n, 2)) * math.sqrt(max(n, 1))
    kw = {"niter": niter, "seed": [list(map(float, p)) for p in seed_pos], "grid": grid}
    if weights is not None:
        kw["weights"] = list(weights)
    if start_temp is not None:
        kw["start_temp"] = start_temp
    if n == 1:
        return np.zeros((1, 2))
    return np.array(g.layout_fruchterman_reingold(**kw).coords, dtype=float)


def principal_frame(P):
    """Centre + rotation that puts the long axis of point cloud P on x. Signs are fixed
    so the heavier tail of each axis points to +x / +y (stable against eigh sign flips)."""
    c = P.mean(axis=0)
    X = P - c
    w, V = np.linalg.eigh(np.cov(X.T))
    R = V[:, ::-1]  # columns: major, minor
    Y = X @ R
    for j in range(2):
        if np.mean(Y[:, j] ** 3) < 0:
            R[:, j] *= -1
    return c, R


def normaliser(P):
    """Uniform scale so the longer bbox side spans [0,1], shorter side centred."""
    lo = np.nanmin(P, axis=0)
    hi = np.nanmax(P, axis=0)
    w, h = hi - lo
    s = max(w, h)
    off = np.array([(s - w) / 2, (s - h) / 2])

    def f(Q):
        return (Q - lo + off) / s
    return f, float(w / h)


def rg(P):
    return float(np.sqrt(((P - P.mean(axis=0)) ** 2).sum(axis=1).mean()))


# --------------------------------------------------------------------------- MC1 constellation

def build_constellation():
    t0 = time.time()
    nodes, links, _ = m1.load()
    cedges = m1.collapse(links)
    M, D, U = m1.build_graphs(nodes, links, cedges)
    suspects = [m1.key(s) for s in m1.SUSPECT_IDS]
    # same Louvain run as mc1_build.global_metrics (run 0, seed 42) -> same `comm` ids
    comms = m1.canon_comms(nx.community.louvain_communities(U, seed=m1.SEED, resolution=1.0))
    comm_of = {n: i for i, c in enumerate(comms) for n in c}
    lowc, low_nodes = m1.lowconf_layer(nodes, links, suspects)
    comps = m1.canon_comms(nx.connected_components(U))

    keys = list(nodes)  # sorted by m1.load()
    idx = {k: i for i, k in enumerate(keys)}
    N = len(keys)

    # undirected pair weight = max weight over all raw rows of the pair (any type/direction)
    pair_w = {}
    for e in cedges:
        if e["s"] == e["t"]:
            continue
        a, b = sorted((e["s"], e["t"]))
        pair_w[(a, b)] = max(pair_w.get((a, b), 0.0), e["w"])

    def layout_comp(comp, niter, grid="nogrid"):
        loc = {k: i for i, k in enumerate(comp)}
        es = sorted((loc[a], loc[b]) for (a, b) in pair_w if a in loc and b in loc)
        ws = [pair_w[(comp[i], comp[j])] for i, j in es]
        return fr_layout(len(comp), es, ws, niter=niter, grid=grid)

    # 1. largest component, weighted FR, then principal-axis frame
    lcc = comps[0]
    P_lcc = layout_comp(lcc, niter=1500, grid="nogrid")
    c, R = principal_frame(P_lcc)
    P_lcc = (P_lcc - c) @ R
    pos = np.full((N, 2), np.nan)
    for k, p in zip(lcc, P_lcc):
        pos[idx[k]] = p
    # spacing unit for the rim: median nearest-neighbour distance between LCC stars
    dnn, _ = cKDTree(P_lcc).query(P_lcc, k=2)
    unit = float(np.median(dnn[:, 1]))

    # 2. small components packed around the LCC rim (golden-angle order, biggest first)
    ang_lcc = np.arctan2(P_lcc[:, 1], P_lcc[:, 0])
    rad_lcc = np.hypot(P_lcc[:, 0], P_lcc[:, 1])
    placed = []  # (centre, radius)
    for i, comp in enumerate(comps[1:]):
        if len(comp) == 1:
            Q = np.zeros((1, 2))
        else:
            Q = layout_comp(comp, niter=500)
            Q = Q - Q.mean(axis=0)
            # rescale so a small component's edges are ~2 star-spacings long
            cl = {k: j for j, k in enumerate(comp)}
            loc_e = [np.linalg.norm(Q[cl[a]] - Q[cl[b]]) for (a, b) in pair_w if a in cl and b in cl]
            Q = Q * (2.0 * unit / max(float(np.median(loc_e)), 1e-9))
        r_c = max(float(np.hypot(Q[:, 0], Q[:, 1]).max()), unit)
        th = (i * GOLDEN) % (2 * math.pi)
        # rim of the LCC in this direction: furthest LCC node within +-12 degrees
        d = np.abs((ang_lcc - th + math.pi) % (2 * math.pi) - math.pi)
        rim = float(rad_lcc[d < math.radians(12)].max()) if (d < math.radians(12)).any() else float(rad_lcc.max())
        r = rim + 4 * unit + r_c + (i % 3) * 3 * unit
        u = np.array([math.cos(th), math.sin(th)])
        cen = u * r
        while any(np.linalg.norm(cen - pc) < pr + r_c + 1.5 * unit for pc, pr in placed):
            r += unit
            cen = u * r
        placed.append((cen, r_c))
        for k, q in zip(comp, Q):
            pos[idx[k]] = cen + q

    assert not np.isnan(pos).any()
    f, aspect = normaliser(pos)
    xy = f(pos)

    # coherence of the 79-node low-weight layer
    L = np.array([idx[k] for k in sorted(low_nodes)])
    lcc_idx = np.array([idx[k] for k in lcc])
    lay = xy[L]
    rng = np.random.default_rng(SEED)
    null_rg = [rg(xy[rng.choice(lcc_idx, len(L), replace=False)]) for _ in range(200)]
    cen = lay.mean(axis=0)
    lcc_cen = xy[lcc_idx].mean(axis=0)
    d_all = np.linalg.norm(xy[lcc_idx] - lcc_cen, axis=1)
    layer_placement = {
        "centroid": [q4(cen[0]), q4(cen[1])],
        "bbox": [q4(lay[:, 0].min()), q4(lay[:, 1].min()), q4(lay[:, 0].max()), q4(lay[:, 1].max())],
        "rg": q4(rg(lay)),
        "rg_random79_mean": q4(np.mean(null_rg)),
        "rg_ratio": q4(rg(lay) / np.mean(null_rg)),
        "centroid_dist_from_lcc_centre_pct": q4(np.mean(d_all <= np.linalg.norm(cen - lcc_cen))),
        # share of the layer within the LCC's inner half (by distance from the LCC centre)
        "in_inner_half_of_lcc": q4(np.mean(np.linalg.norm(lay - lcc_cen, axis=1) <= np.median(d_all))),
        "outliers_beyond_3rg": int(np.sum(np.linalg.norm(lay - cen, axis=1) > 3 * rg(lay))),
        "note": "rg = radius of gyration of the layer's 79 positions; rg_random79_mean = the "
                "same for 200 random 79-node samples of the largest component. rg_ratio < 1 "
                "means the layer is more compact than chance.",
    }

    cls_vocab = m1.CLASSES
    type_vocab = m1.EDGE_TYPES
    out_nodes = []
    for i, k in enumerate(keys):
        nd = nodes[k]
        out_nodes.append([k, q4(xy[i, 0]), q4(xy[i, 1]), cls_vocab.index(nd["cls"]), U.degree(k),
                          int(k in low_nodes), comm_of[k]])
    out_edges = [[idx[e["s"]], idx[e["t"]], type_vocab.index(e["type"]), round(e["w"], 2) + 0.0]
                 for e in cedges]

    cand = json.load(open(DATA / "mc1/candidates.json"))
    top25 = [idx[c["k"]] for c in cand["candidates"]]
    obj = {
        "aspect": q4(aspect),
        "cls": cls_vocab,
        "types": type_vocab,
        "nodes": out_nodes,
        "edges": out_edges,
        "suspects": [idx[s] for s in suspects],
        "fisheye": idx[m1.FISHEYE_ID],
        "lowLayer": sorted(int(i) for i in L),
        "lowLayerPlacement": layer_placement,
        "cycles": [[idx[k] for k in cyc] for cyc in lowc["ownership_cycles"]],
        "candidates": top25,
        "lcc": {"size": len(lcc), "components": len(comps)},
        "params": {"seed": SEED, "layout": "igraph Fruchterman-Reingold, weighted by max edge weight per pair, "
                                          "1500 iterations on the largest component; small components laid out "
                                          "separately and packed on the rim in golden-angle order",
                   "low_w": m1.LOW_W},
        "generated_by": "pipeline/stages_build.py",
    }
    assert len(obj["lowLayer"]) == lowc["n_nodes"] == 79
    n = dump("mc1/constellation.json", obj)
    log(f"MC1 constellation: {time.time() - t0:.1f}s, low layer {layer_placement}")
    return {"bytes": n, "secs": time.time() - t0, "layer": layer_placement}


# --------------------------------------------------------------------------- MC3 galaxy

def build_galaxy():
    t0 = time.time()
    raw_nodes, raw_links = m3.load()
    companies, persons, edges, _ = m3.build_entities(raw_nodes, raw_links)
    G = m3.build_graph(companies, persons, edges)
    # surname rule exactly as in mc3_build.main
    suf = {"MD", "DDS", "PhD", "DVM", "Jr.", "Sr.", "II", "III", "IV", "V"}

    def sn(p):
        return ([t for t in p.split() if t not in suf] or [p])[-1]
    sur_all = Counter(sn(p) for p in persons)
    common50 = {s for s, _ in sur_all.most_common(50)}

    comps = sorted((sorted(c) for c in nx.connected_components(G)), key=lambda c: (-len(c), c[0]))
    giant = comps[0]
    gsub = m3.canon(G, giant)
    parts = nx.community.louvain_communities(gsub, seed=m3.SEED, resolution=1.0)
    parts = sorted((sorted(p) for p in parts), key=lambda c: (-len(c), c[0]))
    slice_of = {n: j + 1 for j, p in enumerate(parts) for n in p}  # 1-based: BG00001.<nnn>

    drop = {n for n in giant if n.startswith("P|") and G.degree(n) > 1 and sn(n[2:]) in common50}
    ids = list(giant)  # sorted
    idx = {n: i for i, n in enumerate(ids)}
    N = len(ids)
    E = sorted((idx[a], idx[b]) if idx[a] < idx[b] else (idx[b], idx[a]) for a, b in gsub.edges())

    # before: FR on the whole giant
    P = fr_layout(N, E, niter=1200, grid="grid")
    c, R = principal_frame(P)
    P = (P - c) @ R

    # after: remove the 651 persons, relax the rest seeded from the before positions
    keep = [i for i, n in enumerate(ids) if n not in drop]
    kloc = {i: j for j, i in enumerate(keep)}
    E2 = [(kloc[a], kloc[b]) for a, b in E if a in kloc and b in kloc]
    Q = fr_layout(len(keep), E2, seed_pos=P[keep], niter=300, start_temp=0.5, grid="grid")
    H = ig.Graph(n=len(keep), edges=E2)
    cl = sorted((sorted(m) for m in H.connected_components()), key=lambda m: (-len(m), m[0]))
    after_sizes = [len(m) for m in cl]
    gi = np.array(cl[0])
    Q0 = Q.copy()                              # relaxed, still in the before frame
    # The remaining giant is a sparse chain of former hub stars spread over the old
    # galaxy. Pull it together without reshuffling: split it into Louvain communities,
    # keep each community's relaxed local shape, and contract the community centroids
    # towards the centre so their spread is GIANT_SPREAD x the before radius.
    R_before = float(np.percentile(np.hypot(*P.T), 95))
    gl = {v: j for j, v in enumerate(cl[0])}
    Hg = ig.Graph(n=len(gi), edges=[(gl[a], gl[b]) for a, b in E2 if a in gl and b in gl])
    ig.set_random_number_generator(random.Random(SEED))
    memb = Hg.community_multilevel().membership
    Qg = Q0[gi] - Q0[gi].mean(axis=0)
    groups = defaultdict(list)
    for j, c_ in enumerate(memb):
        groups[c_].append(j)
    cents = {c_: Qg[js].mean(axis=0) for c_, js in groups.items()}
    rmax = max(float(np.hypot(*v)) for v in cents.values()) or 1.0
    k_ = GIANT_SPREAD * R_before / rmax
    for c_, js in groups.items():
        Qg[js] = Qg[js] - cents[c_] + cents[c_] * k_
    Q[gi] = Qg
    R_g = float(np.percentile(np.hypot(*Qg.T), 95))
    log(f"  galaxy rg before {rg(P[keep]):.1f}, relaxed {rg(Q0):.1f}; R_giant {R_g:.1f} R_before {R_before:.1f}")
    for fi, m in enumerate(cl[1:]):
        m = np.array(m)
        cen = Q0[m].mean(axis=0)
        r = float(np.hypot(*cen))
        if r < 1e-9:
            th = fi * GOLDEN
            u = np.array([math.cos(th), math.sin(th)])
        else:
            u = cen / r
        # monotone radial map: keeps each fragment's bearing and radial order, opens a
        # gap around the recentred giant so the break-up reads as outward drift
        r_new = R_g + DRIFT_GAP * R_before + DRIFT * r
        Q[m] = Q0[m] - cen + u * r_new
    # uniform rescale so the broken galaxy is AFTER_EXTENT x the before galaxy (95th pct
    # radius); keeps the before state large in the shared frame
    Q *= AFTER_EXTENT * R_before / float(np.percentile(np.hypot(*Q.T), 95))

    pos2 = np.full((N, 2), np.nan)
    pos2[keep] = Q
    f, aspect = normaliser(np.vstack([P, Q]))   # one frame for both states
    xy, xy2 = f(P), f(pos2)

    nodes_out = []
    for i, n in enumerate(ids):
        kind = 0 if n.startswith("C|") else 1
        common = int(kind == 1 and sn(n[2:]) in common50)
        rem = int(n in drop)
        x2 = None if rem else q4(xy2[i, 0])
        y2 = None if rem else q4(xy2[i, 1])
        nodes_out.append([n, q4(xy[i, 0]), q4(xy[i, 1]), kind, common, rem, x2, y2, slice_of[n]])
    edges_out = []
    for a, b in E:
        e = gsub.edges[ids[a], ids[b]]
        edges_out.append([a, b, 0 if e["bo"] else 1])

    # cross-check with groups_overview.json
    go = json.load(open(DATA / "mc3/groups_overview.json"))
    rob = go["giant_component"]["name_collision_robustness"]["drop_top50_surnames"]
    assert len(drop) == rob["persons_removed"] == 651, len(drop)
    assert after_sizes[0] == rob["largest_remaining"], (after_sizes[:3], rob)
    assert after_sizes[1] == rob["second_remaining"], (after_sizes[:3], rob)

    focus = {}
    for gid in ("BG00177", "BG00148", "BG00001.061"):
        if gid.startswith("BG00001."):
            j = int(gid.split(".")[1])
            mem = [i for i, n in enumerate(ids) if slice_of[n] == j]
            in_giant = {keep[v] for v in cl[0]}
            focus[gid] = {"inside": True, "nodes": mem,
                          "removed": sum(1 for i in mem if ids[i] in drop),
                          "in_after_giant": sum(1 for i in mem if i in in_giant)}
        else:
            k = int(gid[2:]) - 1
            focus[gid] = {"inside": False, "nodes": [], "size": len(comps[k]),
                          "note": f"{gid} is its own connected component ({len(comps[k])} nodes), "
                                  "not part of the giant BG00001"}
    slices = [{"id": f"BG00001.{j + 1:03d}", "size": len(p)} for j, p in enumerate(parts)]
    frag_n = len(cl) - 1
    obj = {
        "aspect": q4(aspect),
        "nodes": nodes_out,
        "edges": edges_out,
        "slices": slices,
        "before": {"giant": N, "edges": len(E)},
        "after": {"giant": after_sizes[0], "second": after_sizes[1], "removed": len(drop),
                  "remaining": len(keep), "components": len(cl), "fragments": frag_n,
                  "fragments_singletons": sum(1 for s in after_sizes[1:] if s == 1),
                  "fragments_2plus": sum(1 for s in after_sizes[1:] if s >= 2),
                  "fragment_sizes_top10": after_sizes[1:11]},
        "focus": focus,
        "params": {"seed": SEED, "before": "igraph Fruchterman-Reingold, 1200 iterations, unweighted",
                   "after": "FR seeded from the before positions (300 iterations, start_temp 0.5), "
                            "giant recentred; each fragment keeps its bearing and moves to radius "
                            "R_giant + 0.12 R_before + 1.1 r (r = its relaxed centroid radius); "
                            "the remaining giant keeps each Louvain community's relaxed shape while the "
                            "community centroids contract to 0.3 R_before; "
                            "finally the after state is scaled to 1.3x the before galaxy's 95th-pct radius",
                   "ablation": "persons in BG00001 linked to 2+ companies whose surname is among the "
                               "50 most common (mc3_build drop_top50_surnames)"},
        "generated_by": "pipeline/stages_build.py",
    }
    n = dump("mc3/galaxy.json", obj)
    log(f"MC3 galaxy: {time.time() - t0:.1f}s after={obj['after']}")
    return {"bytes": n, "secs": time.time() - t0, "after": obj["after"], "focus": focus}


# --------------------------------------------------------------------------- MC2 currents + home drift

N_FLOWS = 80
N_SAMPLES = 600
RING_IN = 0.3   # currents: radius of the biggest non-hub trader (outermost ring = 1)
UNKNOWN = "Unknown"


def build_mc2():
    t0 = time.time()
    e = m2c.load_edges()  # duplicates dropped exactly as mc2lib does
    n_raw = e.attrs["n_raw"]
    e = e[(e["m"] >= 0) & (e["m"] < m2c.N_MONTHS)].reset_index(drop=True)
    nodes = pd.read_parquet(m2c.NODES)
    shp = nodes.set_index("id")["shpcountry"]
    rcv = nodes.set_index("id")["rcvcountry"]
    o = e["source"].map(shp)
    d = e["target"].map(rcv)
    unk_o = o.isna()
    unk_d = d.isna()
    e["o"] = o.fillna(UNKNOWN).astype(str)
    e["d"] = d.fillna(UNKNOWN).astype(str)
    log(f"MC2 edges loaded {len(e)} in {time.time() - t0:.1f}s")

    # monthly totals
    tot_m = m2c.series(e.groupby("m").size())
    fish_m = m2c.series(e[e["fish"]].groupby("m").size())

    # country table
    out_c = e.groupby("o").size()
    in_c = e.groupby("d").size()
    dom = e[e["o"] == e["d"]].groupby("o").size()
    countries = sorted(set(out_c.index) | set(in_c.index))
    cidx = {c: i for i, c in enumerate(countries)}

    # flows (country pairs, both directions kept separate)
    pair = e.groupby(["o", "d"]).agg(n=("fish", "size"), f=("fish", "sum")).reset_index()
    inter = pair[pair["o"] != pair["d"]].sort_values(["n", "o", "d"], ascending=[False, True, True])
    top = inter.head(N_FLOWS)
    top_keys = set(zip(top["o"], top["d"]))
    sel = e[[k in top_keys for k in zip(e["o"], e["d"])]] if len(top_keys) else e.iloc[:0]
    monthly = sel.groupby(["o", "d", "m"]).size()
    flows = []
    for r in top.itertuples(index=False):
        s = monthly.loc[(r.o, r.d)] if (r.o, r.d) in top_keys else {}
        flows.append([cidx[r.o], cidx[r.d], int(r.n), round(float(r.f) / r.n, 3) + 0.0,
                      m2c.series(s)])

    # country positions: weighted FR on the country graph (self flows ignored)
    w_pair = defaultdict(float)
    for r in inter.itertuples(index=False):
        a, b = sorted((cidx[r.o], cidx[r.d]))
        w_pair[(a, b)] += r.n
    es = sorted(w_pair)
    wmax = max(w_pair.values())
    ws = [math.log1p(w_pair[k]) / math.log1p(wmax) for k in es]
    F = fr_layout(len(countries), es, ws, niter=2000, grid="nogrid")
    # Trade is hub-and-spoke (most flows end in Oceanus), so a raw force layout leaves the
    # small traders scattered. Hybrid: the biggest trader sits at the centre; every other
    # country keeps its FR bearing order around it (so trading partners stay neighbours)
    # but bearings are spaced evenly, and the radius shrinks with log total trade.
    tot = np.array([out_c.get(cn, 0) + in_c.get(cn, 0) for cn in countries], dtype=float)
    hub = int(np.argmax(tot))
    rest = [i for i in range(len(countries)) if i != hub]
    bearing = {i: math.atan2(*(F[i] - F[hub])[::-1]) for i in rest}
    order = sorted(rest, key=lambda i: (bearing[i], countries[i]))
    lt = np.log1p(tot)
    lo_t, hi_t = lt[rest].min(), lt[rest].max()
    P = np.zeros((len(countries), 2))
    for r_, i in enumerate(order):
        th = 2 * math.pi * r_ / len(order)
        rad = RING_IN + (1 - RING_IN) * (1 - (lt[i] - lo_t) / max(hi_t - lo_t, 1e-9))
        P[i] = [rad * math.cos(th), rad * math.sin(th)]
    f, aspect = normaliser(P)
    xy = f(P)
    ctab = []
    for i, cn in enumerate(countries):
        ctab.append([cn, q4(xy[i, 0]), q4(xy[i, 1]), int(out_c.get(cn, 0)), int(in_c.get(cn, 0)),
                     int(dom.get(cn, 0))])

    unknown = {
        "edges_unknown_origin": int(unk_o.sum()),
        "edges_unknown_destination": int(unk_d.sum()),
        "edges_unknown_either": int((unk_o | unk_d).sum()),
        "edges_unknown_both": int((unk_o & unk_d).sum()),
        "note": "origin = shpcountry of the shipping company, destination = rcvcountry of the "
                "receiving company (mc2_nodes.parquet); missing values are pooled in 'Unknown'",
    }
    top_share = float(top["n"].sum()) / float(inter["n"].sum()) if len(inter) else 0.0
    obj = {
        "aspect": q4(aspect),
        "months": [m2c.month_labels()[0], m2c.month_labels()[-1]],
        "countries": ctab,
        "unknown": cidx.get(UNKNOWN),
        "flows": flows,
        "monthly": {"all": tot_m, "fish": fish_m},
        "counts": {"edges_raw": int(n_raw), "edges_dedup": int(len(e)),
                   "countries": len(countries), "country_pairs": int(len(pair)),
                   "international_pairs": int(len(inter)),
                   "domestic_shipments": int(dom.sum()),
                   "top_flows_share_of_international": round(top_share, 4),
                   **unknown},
        "params": {"n_flows": N_FLOWS, "seed": SEED,
                   "layout": "hub (largest total trade) at the centre; other countries evenly spaced "
                             "around it in the bearing order of an igraph Fruchterman-Reingold layout "
                             "of the country graph (edge weight log1p(shipments)/log1p(max), self flows "
                             "excluded, 2000 iterations); radius = 0.3 + 0.7 x (1 - normalised "
                             "log1p(total trade)), so big traders sit nearer the hub"},
        "generated_by": "pipeline/stages_build.py",
    }
    n1 = dump("mc2/currents.json", obj)

    # home drift: totals + a fixed-seed sample of real shipments
    rng = np.random.default_rng(SEED)
    pick = np.sort(rng.choice(len(e), size=N_SAMPLES, replace=False))
    smp = e.iloc[pick]
    lw = np.log10(np.maximum(smp["weightkg"].to_numpy(dtype=float), 1.0))
    samples = sorted([int(m), int(fi), round(float(w), 2) + 0.0]
                     for m, fi, w in zip(smp["m"], smp["fish"], lw))
    drift = {
        "months": [m2c.month_labels()[0], m2c.month_labels()[-1]],
        "monthly": {"all": tot_m, "fish": fish_m},
        "samples": samples,
        "params": {"n_samples": N_SAMPLES, "seed": SEED, "weight": "log10(max(weightkg, 1))"},
        "generated_by": "pipeline/stages_build.py",
    }
    n2 = dump("home/drift.json", drift)
    log(f"MC2 currents + drift: {time.time() - t0:.1f}s unknown={unknown}")
    return {"bytes": (n1, n2), "secs": time.time() - t0, "unknown": unknown}


def main():
    t0 = time.time()
    r1 = build_constellation()
    r3 = build_galaxy()
    r2 = build_mc2()
    log(f"stages done in {time.time() - t0:.1f}s")
    return r1, r2, r3


if __name__ == "__main__":
    main()
