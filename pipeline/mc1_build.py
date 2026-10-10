"""MC1 analysis pipeline: FishEye knowledge graph around the four suspect entities.

Run from the repo root:
    .venv/bin/python pipeline/mc1_build.py

Reads  data/raw/mc1/MC1.json
Writes app/public/data/mc1/{meta,egos,suspects,paths,candidates,communities,lowconf}.json

Everything is deterministic: graphs are built in sorted node/edge order, every
set is sorted before it is emitted, and all randomness uses fixed seeds, so the
output is byte-identical across runs and PYTHONHASHSEED values. No external
data is used.

Key conventions used in every output file
-----------------------------------------
* Node key ``k``: the raw id as a string; integer ids get a ``#`` prefix
  (int 8327 -> "#8327", string "8327" would stay "8327"). Raw ids collide
  when stringified (e.g. int 77 and str "77" both exist), so the prefix is
  needed. ``label`` is the raw id as written in the data.
* ``cls`` is an inferred entity class (see ``classify``): the raw ``type``
  is missing for 605 nodes and much of the vocabulary is NLP noise.
* "Low-confidence layer" = edges with weight < 0.8. Background weights are
  ~uniform on [0.8, 1.0); the 88 edges below 0.8 form one connected
  structure that contains three of the four suspects (see lowconf.json).
  The data notes do not define ``weight``; reading it as extraction
  confidence is an interpretation, stated as such in the findings.
"""
from __future__ import annotations

import itertools
import json
import math
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import networkx as nx
import numpy as np
from scipy import stats

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data/raw/mc1/MC1.json"
NOTES = ROOT / "data/raw/mc1/data_notes.docx"
OUT = ROOT / "app/public/data/mc1"

SUSPECT_IDS = ["Mar de la Vida OJSC", 979893388, "Oceanfront Oasis Inc Carriers", 8327]
FISHEYE_ID = "FishEye International"
LOW_W = 0.8          # weight threshold for the low-confidence layer
HUB_DEG = 100        # undirected simple degree above which a node counts as a hub
EGO_HOPS = 2
EGO_CAP2 = 250       # max 2-hop nodes kept per ego view (hub control)
EVID_MAX = 40        # hard cap on nodes in a candidate evidence subgraph
N_CANDIDATES = 25
SEED = 42

EDGE_TYPES = ["ownership", "partnership", "membership", "family_relationship"]
NODE_TYPES = ["company", "organization", "person", "location", "vessel", "event",
              "movement", "political_organization", None]
CLASSES = ["company", "company_like", "org_numeric", "org_named", "political_org", "person",
           "location", "vessel", "event", "movement", "untyped_other", "junk"]

MOJIBAKE = re.compile(r"[âÃœïÂ]|�")
BIZ = re.compile(
    r"\b(ltd|llc|inc|corp|corporation|company|co|gmbh|kg|ag|sa|s\.a\.|bv|nv|n\.v\.|srl|s\.p\.a\.|oyj|"
    r"ojsc|cjsc|plc|pic|pvt|kga|as|ab|a/s|sp|sagl|ges\.m\.b\.h\.|"
    r"liability|holdings|logistics|carriers|shipping|fisheries|foods|export|freight|transport|"
    r"transportation|delivery|express|line|investment|consulting|consultants|enterprises|"
    r"trawlers|seafood|market|brothers|worldwide|international|united|solutions|distribution|"
    r"merchants|navigation|harvest|products)\b", re.I)
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-")


def key(raw) -> str:
    return f"#{raw}" if isinstance(raw, int) else str(raw)


def r4(x):
    if x is None:
        return None
    x = float(x)
    if math.isnan(x) or math.isinf(x):
        return None
    return round(x, 4)


def classify(raw, ntype) -> str:
    s = str(raw)
    if ntype == "company":
        return "company"
    if ntype == "organization":
        return "org_numeric" if isinstance(raw, int) else "org_named"
    if ntype == "political_organization":
        return "political_org"
    if ntype in ("person", "location", "vessel", "event", "movement"):
        if MOJIBAKE.search(s):
            return "junk"
        return ntype
    # untyped
    if MOJIBAKE.search(s) or len(s.strip()) <= 2:
        return "junk"
    if BIZ.search(s) and len(s.split()) >= 2:
        return "company_like"
    if s.islower() or s.strip().isdigit() or re.fullmatch(r"[\d/.\-]+", s.strip()):
        return "junk"
    return "untyped_other"


# ----------------------------------------------------------------------------
# Load + clean
# ----------------------------------------------------------------------------

def load():
    d = json.load(open(SRC))
    quirks = {}
    nodes = {}
    for n in d["nodes"]:
        k = key(n["id"])
        nodes[k] = {"k": k, "label": str(n["id"]), "raw_int": isinstance(n["id"], int),
                    "type": n.get("type"), "country": n.get("country"),
                    "cls": classify(n["id"], n.get("type"))}
    as_str = Counter(str(n["id"]) for n in d["nodes"])
    quirks["id_string_collisions"] = sorted(s for s, c in as_str.items() if c > 1)
    quirks["numeric_string_ids"] = sorted(str(n["id"]) for n in d["nodes"]
                                          if isinstance(n["id"], str) and n["id"].strip().isdigit())
    links = []
    misspelled = []
    for l in d["links"]:
        w = l.get("weight")
        if w is None and "weightlcoat" in l:
            w = l["weightlcoat"]
            misspelled.append({"source": key(l["source"]), "target": key(l["target"]),
                               "type": l.get("type"), "weight": r4(w)})
        links.append({"s": key(l["source"]), "t": key(l["target"]), "type": l.get("type"),
                      "w": float(w), "key": l.get("key", 0)})
    quirks["misspelled_weight_field"] = misspelled
    nn, ne = notes_counts()
    quirks["declared_vs_actual"] = {"notes_nodes": nn, "notes_edges": ne,
                                    "file_nodes": len(nodes), "file_edges": len(links)}
    links.sort(key=lambda l: (l["s"], l["t"], l["type"] or "", l["w"], l["key"]))
    nodes = {k: nodes[k] for k in sorted(nodes)}
    return nodes, links, quirks


def notes_counts():
    """Node/edge counts declared in the official data notes (they differ from the file)."""
    try:
        import docx
        txt = "\n".join(p.text for p in docx.Document(str(NOTES)).paragraphs)
        n = re.search(r"(\d+)\s+nodes", txt)
        e = re.search(r"(\d+)\s+edges", txt)
        return (int(n.group(1)) if n else None), (int(e.group(1)) if e else None)
    except Exception:  # python-docx missing or notes absent: keep going
        return None, None


def collapse(links):
    """Directed (s,t,type) -> aggregated edge with multiplicity."""
    agg = defaultdict(list)
    for l in links:
        agg[(l["s"], l["t"], l["type"])].append(l["w"])
    out = []
    for (s, t, ty), ws in sorted(agg.items(), key=lambda kv: (kv[0][0], kv[0][1], kv[0][2] or "")):
        out.append({"s": s, "t": t, "type": ty, "n": len(ws), "w": max(ws), "wmin": min(ws),
                    "wmean": float(np.mean(ws))})
    return out


def build_graphs(nodes, links, cedges):
    M = nx.MultiDiGraph()
    M.add_nodes_from(sorted(nodes))
    for l in links:
        M.add_edge(l["s"], l["t"], type=l["type"], w=l["w"])
    D = nx.DiGraph()
    D.add_nodes_from(sorted(nodes))
    for e in cedges:
        if D.has_edge(e["s"], e["t"]):
            D[e["s"]][e["t"]]["n"] += e["n"]
            D[e["s"]][e["t"]]["types"].add(e["type"])
            D[e["s"]][e["t"]]["w"] = max(D[e["s"]][e["t"]]["w"], e["w"])
            D[e["s"]][e["t"]]["wmin"] = min(D[e["s"]][e["t"]]["wmin"], e["wmin"])
        else:
            D.add_edge(e["s"], e["t"], n=e["n"], types={e["type"]}, w=e["w"], wmin=e["wmin"])
    U = nx.Graph()
    U.add_nodes_from(sorted(nodes))
    for s, t, a in sorted(D.edges(data=True), key=lambda e: (e[0], e[1])):
        if U.has_edge(s, t):
            U[s][t]["n"] += a["n"]
            U[s][t]["types"] |= a["types"]
            U[s][t]["wmin"] = min(U[s][t]["wmin"], a["wmin"])
        else:
            U.add_edge(s, t, n=a["n"], types=set(a["types"]), wmin=a["wmin"])
    return M, D, U


def induced(G, keep):
    """Induced subgraph as a fresh graph in sorted node/edge order.

    networkx subgraph *views* iterate their node filter (a Python set), so their
    order follows string hashing and changes between processes. Copies don't.
    """
    keep = set(keep)
    H = G.__class__()
    H.add_nodes_from(sorted(n for n in G if n in keep))
    if G.is_multigraph():
        es = [(u, v, a) for u, v, a in G.edges(data=True) if u in keep and v in keep]
        es.sort(key=lambda e: (e[0], e[1], e[2].get("type") or "", e[2].get("w", 0)))
    else:
        es = sorted(((u, v, a) for u, v, a in G.edges(data=True) if u in keep and v in keep),
                    key=lambda e: (e[0], e[1]))
    H.add_edges_from(es)
    return H


def canon_comms(comms):
    """Communities as sorted lists, ordered by size desc then first member."""
    cs = [sorted(c) for c in comms]
    return sorted(cs, key=lambda c: (-len(c), c[0]))


# ----------------------------------------------------------------------------
# Global metrics
# ----------------------------------------------------------------------------

def global_metrics(nodes, M, D, U):
    comps = canon_comms(nx.connected_components(U))
    lcc = induced(U, comps[0])
    print("betweenness on LCC", lcc.number_of_nodes(), file=sys.stderr)
    btw = nx.betweenness_centrality(lcc, normalized=True)
    pr = nx.pagerank(D, alpha=0.85)
    pr_u = nx.pagerank(U, alpha=0.85)
    comm_runs = []
    for seed in range(5):
        comm_runs.append(canon_comms(nx.community.louvain_communities(U, seed=SEED + seed, resolution=1.0)))
    comms = comm_runs[0]
    comm_of = {}
    for i, c in enumerate(comms):
        for n in c:
            comm_of[n] = i
    other_maps = []
    for run in comm_runs[1:]:
        m = {}
        for i, c in enumerate(run):
            for n in c:
                m[n] = i
        other_maps.append(m)
    comp_of = {}
    for i, c in enumerate(comps):
        for n in c:
            comp_of[n] = i
    lowdeg = Counter()
    lowown = Counter()
    for s, t, a in M.edges(data=True):
        if a["w"] < LOW_W:
            lowdeg[s] += 1
            lowdeg[t] += 1
            if a["type"] == "ownership":
                lowown[s] += 1
                lowown[t] += 1
    for k, nd in nodes.items():
        et_out = Counter(a["type"] for _, _, a in M.out_edges(k, data=True))
        et_in = Counter(a["type"] for _, _, a in M.in_edges(k, data=True))
        nd.update({
            "deg": U.degree(k), "mdeg": M.degree(k), "out": M.out_degree(k), "in": M.in_degree(k),
            "own_out": et_out["ownership"], "own_in": et_in["ownership"],
            "et_out": dict(et_out), "et_in": dict(et_in),
            "btw": btw.get(k, 0.0), "pr": pr[k], "pr_u": pr_u[k],
            "comm": comm_of[k], "comp": comp_of[k],
            "low": lowdeg[k], "low_own": lowown[k],
            "max_par": max([U[k][v]["n"] for v in U[k]] or [0]),
            "mixed_pairs": sum(1 for v in U[k] if len(U[k][v]["types"]) > 1),
        })
    return comms, comm_runs, other_maps, comps


def pct_rank(values):
    """Percentile rank in [0,1] (average ties)."""
    arr = np.asarray(values, dtype=float)
    if len(arr) <= 1:
        return np.zeros_like(arr)
    return (stats.rankdata(arr, method="average") - 1) / (len(arr) - 1)


# ----------------------------------------------------------------------------
# Low-confidence layer
# ----------------------------------------------------------------------------

def lowconf_layer(nodes, links, suspects):
    low = [l for l in links if l["w"] < LOW_W]
    G = nx.Graph()
    for l in low:
        G.add_edge(l["s"], l["t"])
    comps = sorted(nx.connected_components(G), key=len, reverse=True)
    # Null model: draw the same number of edges uniformly at random from all links.
    rng = np.random.default_rng(SEED)
    sizes = []
    arr = [(l["s"], l["t"]) for l in links]
    for _ in range(1000):
        idx = rng.choice(len(arr), size=len(low), replace=False)
        H = nx.Graph()
        H.add_edges_from(arr[i] for i in idx)
        sizes.append(max(len(c) for c in nx.connected_components(H)))
    sizes = np.array(sizes)
    tcount = Counter(l["type"] for l in low)
    all_t = Counter(l["type"] for l in links)
    hyper_p = stats.hypergeom.sf(tcount["ownership"] - 1, len(links), all_t["ownership"], len(low))
    # suspects' distance into the layer in the full graph is computed by caller
    hist_bins = np.round(np.arange(0, 1.0001, 0.05), 2)
    h, _ = np.histogram([l["w"] for l in links], bins=hist_bins)
    hist_by_type = {}
    for t in EDGE_TYPES:
        ht, _ = np.histogram([l["w"] for l in links if l["type"] == t], bins=hist_bins)
        hist_by_type[t] = ht.tolist()
    layer_nodes = sorted(comps[0]) if comps else []
    # ownership structure inside the layer: circular ownership + longest chain
    LO = nx.DiGraph()
    for l in low:
        if l["type"] == "ownership" and l["s"] != l["t"]:
            LO.add_edge(l["s"], l["t"])
    cycles = []
    for c in nx.simple_cycles(LO):
        i = c.index(min(c))           # rotate to a canonical start
        cycles.append(c[i:] + c[:i])
    cycles.sort(key=lambda c: (len(c), c))
    cond = nx.condensation(LO)
    longest = nx.dag_longest_path(cond)
    longest_nodes = [sorted(cond.nodes[x]["members"])[0] for x in longest]
    out = {
        "threshold": LOW_W,
        "n_edges": len(low),
        "n_nodes": G.number_of_nodes(),
        "component_sizes": [len(c) for c in comps],
        "edge_types": dict(tcount),
        "edge_types_all": dict(all_t),
        "ownership_share": r4(tcount["ownership"] / len(low)),
        "ownership_share_all": r4(all_t["ownership"] / len(links)),
        "ownership_enrichment_p": float(f"{hyper_p:.3g}"),
        "null_lcc_nodes": {"mean": r4(sizes.mean()), "p95": r4(np.percentile(sizes, 95)),
                           "max": int(sizes.max()), "draws": 1000},
        "null_p_value": r4((np.sum(sizes >= len(layer_nodes)) + 1) / (len(sizes) + 1)),
        "weight_hist": {"bins": hist_bins.tolist(), "all": h.tolist(), "by_type": hist_by_type},
        "suspects_in_layer": [s for s in suspects if s in G],
        "ownership_cycles": cycles,
        "ownership_longest_chain": {"length": len(longest) - 1, "nodes": longest_nodes,
                                    "note": "longest directed chain of low-weight ownership edges "
                                            "after collapsing cycles (one representative per cycle)"},
        "class_counts": {k: v for k, v in sorted(Counter(nodes[n]["cls"] for n in layer_nodes).items())},
        "nodes": [{"k": n, "low": G.degree(n), "cls": nodes[n]["cls"]} for n in layer_nodes],
        "links": [{"s": l["s"], "t": l["t"], "type": l["type"], "w": r4(l["w"])} for l in low],
    }
    return out, set(G.nodes())


# ----------------------------------------------------------------------------
# Ego networks
# ----------------------------------------------------------------------------

def bfs_layers(adj_fn, src, hops):
    dist = {src: 0}
    frontier = [src]
    for h in range(1, hops + 1):
        nxt = []
        for u in frontier:
            for v in adj_fn(u):
                if v not in dist:
                    dist[v] = h
                    nxt.append(v)
        frontier = nxt
    return dist


def ego_stats(nodes, M, D, U, s):
    res = {}
    for mode, fn in (("undirected", U.neighbors), ("out", D.successors), ("in", D.predecessors)):
        dist = bfs_layers(fn, s, 3)
        res[mode] = [sum(1 for v in dist.values() if v == h) for h in (1, 2, 3)]
    return res


def composition(nodes, M, members, center):
    ms = set(members)
    ntypes = Counter(nodes[n]["type"] or "unknown" for n in ms if n != center)
    ncls = Counter(nodes[n]["cls"] for n in ms if n != center)
    etypes = Counter()
    ws = []
    nlow = 0
    for u, v, a in M.subgraph(ms).edges(data=True):
        etypes[a["type"]] += 1
        ws.append(a["w"])
        nlow += a["w"] < LOW_W
    return {"node_types": dict(ntypes), "node_classes": dict(ncls), "edge_types": dict(etypes),
            "n_edges": len(ws), "weight_mean": r4(np.mean(ws)) if ws else None,
            "weight_min": r4(min(ws)) if ws else None, "low_conf_edges": int(nlow)}


def build_egos(nodes, M, D, U, suspects):
    node_table = {}
    egos = []
    for s in suspects:
        dist = bfs_layers(U.neighbors, s, EGO_HOPS)
        # Hub control: the 2-hop shell of a hub is huge. Keep all 1-hop nodes and,
        # at hop 2, nodes reached through >=2 hop-1 nodes, or via low-conf edges,
        # or company-like classes; cap at 400 by (support, -deg).
        h1 = [v for v, d in dist.items() if d == 1]
        h2 = [v for v, d in dist.items() if d == 2]
        support = Counter()
        for v in h1:
            for x in U.neighbors(v):
                if dist.get(x) == 2:
                    support[x] += 1
        keep2 = []
        for x in h2:
            lowtouch = any(U[x][y]["wmin"] < LOW_W for y in U.neighbors(x) if dist.get(y, 9) <= 1)
            pri = (support[x] >= 2) * 2 + lowtouch * 3 + (nodes[x]["cls"] in ("company", "company_like")) * 1
            keep2.append((pri, support[x], -nodes[x]["deg"], x))
        keep2.sort(reverse=True)
        kept2 = [x for p, sup, nd, x in keep2 if p > 0][:EGO_CAP2]
        members = [s] + h1 + kept2
        mset = set(members)
        for n in members:
            node_table[n] = True
        links = []
        for u, v, a in induced(M, mset).edges(data=True):
            links.append([u, v, a["type"], r4(a["w"])])
        # collapse identical parallel duplicates into one row with count
        agg = defaultdict(list)
        for u, v, t, w in links:
            agg[(u, v, t)].append(w)
        links_c = [{"s": u, "t": v, "type": t, "w": max(ws), "wmin": min(ws), "n": len(ws)}
                   for (u, v, t), ws in sorted(agg.items())]
        roles = {}
        for n in members:
            if n == s:
                roles[n] = "suspect"
                continue
            parts = []
            if U.has_edge(s, n):
                if D.has_edge(s, n):
                    parts.append("out:" + "|".join(sorted(D[s][n]["types"])))
                if D.has_edge(n, s):
                    parts.append("in:" + "|".join(sorted(D[n][s]["types"])))
            roles[n] = ";".join(parts) if parts else "2-hop"
        egos.append({
            "suspect": s,
            "hops_counts": ego_stats(nodes, M, D, U, s),
            "full_2hop_size": len(dist) - 1,
            "kept_2hop": len(kept2), "total_2hop": len(h2),
            "composition_1hop": composition(nodes, M, [s] + h1, s),
            "composition_2hop_full": composition(nodes, M, list(dist), s),
            "members": [{"k": n, "d": dist[n], "role": roles[n]} for n in members],
            "links": links_c,
        })
    return egos, list(node_table)


# ----------------------------------------------------------------------------
# Paths among suspects
# ----------------------------------------------------------------------------

def paths_between(nodes, U, D, suspects, low_nodes):
    hubs = {n for n in U if U.degree(n) > HUB_DEG}
    junk = {n for n in U if nodes[n]["cls"] in NOISE_CLASSES}
    clean = induced(U, [n for n in U if n not in junk or n in suspects])
    nohub = induced(U, [n for n in U if (n not in hubs and n not in junk) or n in suspects])
    lowG = nx.Graph()
    for u, v, a in sorted(U.edges(data=True), key=lambda e: (e[0], e[1])):
        if a["wmin"] < LOW_W:
            lowG.add_edge(u, v)
    O = nx.DiGraph(sorted((u, v) for u, v, a in D.edges(data=True)
                          if "ownership" in a["types"] and u not in junk and v not in junk))

    def sp(G, a, b, cap=25):
        """Up to `cap` shortest paths (enumerate <=500, sort, keep first `cap`)."""
        try:
            ps = sorted(itertools.islice(nx.all_shortest_paths(G, a, b), 500))
            return {"length": len(ps[0]) - 1, "paths": ps[:cap], "n_listed": min(len(ps), cap),
                    "n_found": len(ps)}
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return {"length": None, "paths": [], "n_listed": 0, "n_found": 0}

    pairs = []
    for a, b in itertools.combinations(suspects, 2):
        na, nb = set(U[a]), set(U[b])
        n2a = set(bfs_layers(U.neighbors, a, 2)) - {a}
        n2b = set(bfs_layers(U.neighbors, b, 2)) - {b}
        pairs.append({
            "a": a, "b": b,
            "any": sp(U, a, b),
            "no_junk": sp(clean, a, b),
            "no_hubs_no_junk": sp(nohub, a, b),
            "low_conf_only": sp(lowG, a, b) if a in lowG and b in lowG else {"length": None, "paths": [], "n_listed": 0, "n_found": 0},
            "ownership_directed": sp(O, a, b) if a in O and b in O else {"length": None, "paths": [], "n_listed": 0, "n_found": 0},
            "ownership_directed_rev": sp(O, b, a) if a in O and b in O else {"length": None, "paths": [], "n_listed": 0, "n_found": 0},
            "shared_1hop": sorted(na & nb),
            "shared_2hop_count": len(n2a & n2b),
            "jaccard_1hop": r4(len(na & nb) / len(na | nb)) if na | nb else 0.0,
        })
    # null: distances between random node pairs in the LCC, and between random
    # 4-sets matched on degree bucket
    rng = np.random.default_rng(SEED)
    lcc = max(nx.connected_components(U), key=len)
    lccl = sorted(lcc)
    dd = []
    for _ in range(400):
        a, b = rng.choice(len(lccl), 2, replace=False)
        dd.append(nx.shortest_path_length(U, lccl[a], lccl[b]))
    dd = np.array(dd)
    obs = np.mean([p["any"]["length"] for p in pairs])
    # degree-matched 4-sets
    degs = {n: U.degree(n) for n in lccl}
    buckets = defaultdict(list)
    def bucket(x):
        return int(np.digitize(x, [3, 6, 12, 25, 60, 120]))
    for n in lccl:
        buckets[bucket(degs[n])].append(n)
    means = []
    for _ in range(200):
        pick = [buckets[bucket(degs[s])][rng.integers(len(buckets[bucket(degs[s])]))] for s in suspects]
        if len(set(pick)) < 4:
            continue
        means.append(np.mean([nx.shortest_path_length(U, x, y) for x, y in itertools.combinations(pick, 2)]))
    means = np.array(means)
    null = {
        "random_pair_distance": {"mean": r4(dd.mean()), "hist": {str(k): int(v) for k, v in sorted(Counter(dd.tolist()).items())}},
        "suspect_mean_pair_distance": r4(obs),
        "degree_matched_4set_mean_distance": {"mean": r4(means.mean()), "p05": r4(np.percentile(means, 5)),
                                              "frac_le_observed": r4(np.mean(means <= obs)), "draws": int(len(means))},
        "hubs": sorted(hubs, key=lambda n: (-U.degree(n), n)),
        "hub_threshold": HUB_DEG,
    }
    return pairs, null


# ----------------------------------------------------------------------------
# Suspicion score for candidates
# ----------------------------------------------------------------------------

FEATURES = [
    ("low_conf", 0.25, "Edges in the low-confidence layer (weight < 0.8) touching the node; 3 of 4 suspects sit in this layer (see lowconf.json)"),
    ("proximity", 0.20, "How many suspects are within 2 hops (undirected), plus 1/min-distance to nearest suspect"),
    ("shared_nbrs", 0.15, "Max cosine overlap of the node's neighbour set with any suspect's (hub-normalised)"),
    ("ownership", 0.15, "Ownership fan-in + fan-out (distinct counterparties), the shell-company signal"),
    ("profile_sim", 0.10, "Cosine similarity of the node's relation-type profile to the suspect centroid"),
    ("redundancy", 0.10, "Repeated / mixed-type edges to the same counterparty (e.g. 5 edges of 3 types to one entity)"),
    ("fisheye_flag", 0.05, "Directly linked from the 'FishEye International' node"),
]
POOL_CLASSES = {"company", "company_like", "org_numeric", "org_named"}
NOISE_CLASSES = {"junk", "movement"}


def profile_vec(nd):
    v = []
    tot_out = sum(nd["et_out"].values()) or 1
    tot_in = sum(nd["et_in"].values()) or 1
    for t in EDGE_TYPES:
        v.append(nd["et_out"].get(t, 0) / tot_out)
    for t in EDGE_TYPES:
        v.append(nd["et_in"].get(t, 0) / tot_in)
    v.append(nd["out"] / max(nd["mdeg"], 1))
    v.append(nd["low"] / max(nd["mdeg"], 1))
    return np.array(v)


def raw_features(nodes, U, seeds, pool, fisheye_nbrs):
    seed_d = {s: nx.single_source_shortest_path_length(U, s, cutoff=4) for s in seeds}
    seed_n = {s: set(U[s]) for s in seeds}
    cent = np.mean([profile_vec(nodes[s]) for s in seeds], axis=0)
    rows = {}
    for n in pool:
        nd = nodes[n]
        ds = [seed_d[s].get(n) for s in seeds]
        ds = [d for d in ds if d is not None and d > 0]
        within2 = sum(1 for d in ds if d <= 2)
        mind = min(ds) if ds else None
        prox = within2 + (1.0 / mind if mind else 0.0)
        nb = set(U[n])
        sh = 0.0
        sh_cnt = 0
        for s in seeds:
            inter = len(nb & seed_n[s])
            sh_cnt += inter
            if nb and seed_n[s]:
                sh = max(sh, inter / math.sqrt(len(nb) * len(seed_n[s])))
        pv = profile_vec(nd)
        denom = np.linalg.norm(pv) * np.linalg.norm(cent)
        psim = float(pv @ cent / denom) if denom else 0.0
        own = len({v for v in U[n] if "ownership" in U[n][v]["types"]})
        red = (nd["max_par"] - 1) + nd["mixed_pairs"]
        rows[n] = {"low_conf": nd["low"], "proximity": prox, "shared_nbrs": sh,
                   "ownership": own, "profile_sim": psim, "redundancy": red,
                   "fisheye_flag": 1.0 if n in fisheye_nbrs else 0.0,
                   "_min_dist": mind, "_within2": within2, "_shared_count": sh_cnt}
    return rows


def score_rows(rows, weights=None):
    keys = list(rows)
    w = dict((f, wt) for f, wt, _ in FEATURES) if weights is None else weights
    norm = {}
    for f, _, _ in FEATURES:
        vals = np.array([rows[k][f] for k in keys], dtype=float)
        if f == "fisheye_flag":
            norm[f] = vals
        else:
            # percentile rank, but zero stays zero (no signal -> no credit)
            pr = pct_rank(vals)
            pr[vals <= 0] = 0.0
            norm[f] = pr
    scores = {}
    parts = {}
    for i, k in enumerate(keys):
        p = {f: norm[f][i] for f, _, _ in FEATURES}
        parts[k] = p
        scores[k] = sum(w[f] * p[f] for f, _, _ in FEATURES)
    return scores, parts


def candidates(nodes, M, U, suspects, low_nodes):
    fisheye_nbrs = set(U[FISHEYE_ID]) if FISHEYE_ID in U else set()
    pool = [n for n, nd in nodes.items()
            if nd["cls"] in POOL_CLASSES and n not in suspects and n != FISHEYE_ID and nd["deg"] > 0]
    rows = raw_features(nodes, U, suspects, pool, fisheye_nbrs)
    scores, parts = score_rows(rows)
    ranked = sorted(pool, key=lambda k: (-scores[k], k))

    # --- validation 1: leave-one-suspect-out
    loo = []
    for s in suspects:
        seeds = [x for x in suspects if x != s]
        p2 = pool + [s]
        r2 = raw_features(nodes, U, seeds, p2, fisheye_nbrs)
        sc2, _ = score_rows(r2)
        order = sorted(p2, key=lambda k: (-sc2[k], k))
        rank = order.index(s) + 1
        deg_order = sorted(p2, key=lambda k: (-nodes[k]["deg"], k))
        loo.append({"held_out": s, "rank": rank, "pool": len(p2),
                    "percentile": r4(1 - (rank - 1) / (len(p2) - 1)),
                    "degree_baseline_rank": deg_order.index(s) + 1})
    # --- validation 2: weight-perturbation stability (Dirichlet around the defaults)
    rng = np.random.default_rng(SEED)
    base = np.array([wt for _, wt, _ in FEATURES])
    top_hits = Counter()
    rhos = []
    base_vec = np.array([scores[k] for k in pool])
    for _ in range(300):
        wv = rng.dirichlet(base * 40)
        sc, _ = score_rows(rows, {f: wv[i] for i, (f, _, _) in enumerate(FEATURES)})
        vec = np.array([sc[k] for k in pool])
        rhos.append(stats.spearmanr(base_vec, vec).correlation)
        for k in sorted(pool, key=lambda k: (-sc[k], k))[:N_CANDIDATES]:
            top_hits[k] += 1
    # --- validation 3: ablation (drop each feature; overlap of top-25)
    top_base = set(ranked[:N_CANDIDATES])
    ablation = {}
    for f, _, _ in FEATURES:
        wd = {g: (0.0 if g == f else wt) for g, wt, _ in FEATURES}
        sc, _ = score_rows(rows, wd)
        top = set(sorted(pool, key=lambda k: (-sc[k], k))[:N_CANDIDATES])
        ablation[f] = len(top & top_base)
    # --- correlation with plain degree (is it just a hub detector?)
    rho_deg = stats.spearmanr(base_vec, [nodes[k]["deg"] for k in pool]).correlation

    # suspects' own scores for reference (scored with the other three as seeds)
    out = []
    for rank, k in enumerate(ranked[:N_CANDIDATES], 1):
        out.append({
            "rank": rank, "k": k, "score": r4(scores[k]),
            "stability": r4(top_hits[k] / 300),
            "features_raw": {f: r4(rows[k][f]) for f, _, _ in FEATURES},
            "features_norm": {f: r4(parts[k][f]) for f, _, _ in FEATURES},
            "contrib": {f: r4(parts[k][f] * wt) for f, wt, _ in FEATURES},
            "why": [f for f, _ in sorted(((f, parts[k][f] * wt) for f, wt, _ in FEATURES),
                                         key=lambda x: (-x[1], x[0]))[:3] if parts[k][f] > 0],
            "min_dist_to_suspect": rows[k]["_min_dist"],
            "in_low_layer": k in low_nodes,
            "is_hub": nodes[k]["deg"] > HUB_DEG,
            "deg": nodes[k]["deg"],
            "suspects_within_2": rows[k]["_within2"],
            "evidence": evidence_subgraph(nodes, M, U, k, suspects, low_nodes),
        })
    score_hist, edges = np.histogram([scores[k] for k in pool], bins=20, range=(0, 1))
    meta = {
        "pool_size": len(pool), "pool_classes": sorted(POOL_CLASSES),
        "features": [{"name": f, "weight": wt, "desc": d} for f, wt, d in FEATURES],
        "leave_one_out": loo,
        "weight_perturbation": {"draws": 300, "spearman_mean": r4(np.mean(rhos)),
                                "spearman_min": r4(np.min(rhos))},
        "ablation_top25_overlap": ablation,
        "spearman_vs_degree": r4(rho_deg),
        "top25_in_low_layer": sum(1 for k in ranked[:N_CANDIDATES] if k in low_nodes),
        "top25_hubs": sum(1 for k in ranked[:N_CANDIDATES] if nodes[k]["deg"] > HUB_DEG),
        "score_hist": {"bins": np.round(edges, 3).tolist(), "counts": score_hist.tolist()},
        "all_scores_top200": [{"k": k, "score": r4(scores[k])} for k in ranked[:200]],
    }
    return out, meta


def evidence_subgraph(nodes, M, U, c, suspects, low_nodes, max_nodes=22):
    """Small explanation graph: candidate, path to nearest suspect, low-weight and
    ownership counterparties. Hard-capped at EVID_MAX nodes."""
    keep = {c}
    # shortest path to the nearest suspect
    best = None
    for s in suspects:
        try:
            p = nx.shortest_path(U, c, s)
        except nx.NetworkXNoPath:
            continue
        if best is None or len(p) < len(best):
            best = p
    if best:
        keep |= set(best)
    # low-confidence neighbours
    for v in sorted(U[c], key=lambda v: (U[c][v]["wmin"], v)):
        if U[c][v]["wmin"] < LOW_W and len(keep) < EVID_MAX:
            keep.add(v)
    # ownership counterparties, then others by degree
    own = sorted([v for v in U[c] if "ownership" in U[c][v]["types"]], key=lambda v: (-nodes[v]["deg"], v))
    for v in own:
        if len(keep) >= max_nodes:
            break
        keep.add(v)
    for s in suspects:
        if U.has_edge(c, s):
            keep.add(s)
    assert len(keep) <= EVID_MAX + len(suspects), (c, len(keep))
    links = []
    agg = defaultdict(list)
    for u, v, a in induced(M, keep).edges(data=True):
        agg[(u, v, a["type"])].append(a["w"])
    for (u, v, t), ws in sorted(agg.items()):
        links.append({"s": u, "t": v, "type": t, "w": r4(min(ws)), "n": len(ws)})
    return {"nodes": sorted(keep), "path_to_suspect": best, "links": links}


# ----------------------------------------------------------------------------
# Suspect profiles
# ----------------------------------------------------------------------------

def name_lookalikes(nodes, s, limit=5):
    import difflib
    lab = nodes[s]["label"]
    if nodes[s]["raw_int"]:
        return []
    labels = [nd["label"] for k, nd in nodes.items() if k != s and not nd["raw_int"]]
    m = difflib.get_close_matches(lab, labels, n=limit, cutoff=0.6)
    return [{"label": x, "ratio": r4(difflib.SequenceMatcher(None, lab, x).ratio())} for x in m]


def percentiles(nodes):
    allk = list(nodes)
    pct = {}
    for f in ("deg", "mdeg", "btw", "pr", "own_out", "own_in", "low", "max_par"):
        pr = pct_rank([nodes[k][f] for k in allk])
        pct[f] = dict(zip(allk, pr))
    return pct


def suspect_profiles(nodes, M, D, U, O, suspects, low_nodes, comm_runs, fisheye_nbrs, pct):
    out = []
    for s in suspects:
        rb = rubric(nodes, U, D, O, s, [x for x in suspects if x != s], low_nodes, fisheye_nbrs, pct["btw"])
        nd = nodes[s]
        nb = list(U[s])
        nbc = Counter(nodes[v]["cls"] for v in nb)
        hub_nbrs = [v for v in nb if U.degree(v) > HUB_DEG]
        same_comm_runs = []
        for run in comm_runs:
            m = {n: i for i, c in enumerate(run) for n in c}
            same_comm_runs.append([x for x in suspects if m[x] == m[s] and x != s])
        out.append({
            "k": s, "label": nd["label"], "type": nd["type"], "cls": nd["cls"], "country": nd["country"],
            "verdict": rb["verdict"], "confidence": rb["confidence"], "rubric": rb,
            "deg": nd["deg"], "mdeg": nd["mdeg"], "out": nd["out"], "in": nd["in"],
            "own_out": nd["own_out"], "own_in": nd["own_in"],
            "et_out": nd["et_out"], "et_in": nd["et_in"],
            "btw": r4(nd["btw"]), "pr": r4(nd["pr"] * 1e4), "comm": nd["comm"], "comp": nd["comp"],
            "low_conf_edges": nd["low"], "low_conf_ownership": nd["low_own"], "in_low_layer": s in low_nodes,
            "fisheye_linked": s in fisheye_nbrs,
            "max_parallel": nd["max_par"], "mixed_type_pairs": nd["mixed_pairs"],
            "percentiles": {f: r4(pct[f][s]) for f in pct},
            "neighbor_classes": dict(nbc),
            "junk_neighbor_share": r4(nbc["junk"] / len(nb)) if nb else None,
            "hub_neighbors": hub_nbrs,
            "profile_vector": [r4(x) for x in profile_vec(nd)],
            "profile_axes": [f"out_{t}" for t in EDGE_TYPES] + [f"in_{t}" for t in EDGE_TYPES] + ["out_share", "low_conf_share"],
            "louvain_cosuspects_by_seed": same_comm_runs,
            "name_lookalikes": name_lookalikes(nodes, s),
            "ownership_chains": ownership_chains(nodes, O, s, suspects),
            "keyword_context_2hop": keyword_context(nodes, U, s),
            "neighbors_1hop": [{"k": v, "dir": ("out" if D.has_edge(s, v) else "") + ("in" if D.has_edge(v, s) else ""),
                                "types": sorted(U[s][v]["types"]), "n": U[s][v]["n"], "wmin": r4(U[s][v]["wmin"])}
                               for v in sorted(nb, key=lambda v: (U[s][v]["wmin"], v))],
        })
    return out


# ----------------------------------------------------------------------------
# Ownership chains, keyword context, verdict rubric
# ----------------------------------------------------------------------------

KW_ILLEGAL = re.compile(r"illegal|iuu|poach|smuggl|guilty|crime|criminal|arrest|fraud|launder|contraband|bribe",
                        re.I)
CHAIN_HOPS = 6


def ownership_graph(nodes, cedges, suspects):
    """Directed ownership graph as recorded (source -> target), junk removed.

    Edge attribute w = the highest weight among the ownership rows of that pair.
    The data notes do not say whether source owns target or the reverse, so
    chains are reported in the recorded direction and also undirected.
    """
    O = nx.DiGraph()
    keep = sorted(n for n in nodes if nodes[n]["cls"] not in NOISE_CLASSES or n in suspects)
    O.add_nodes_from(keep)
    ks = set(keep)
    for e in cedges:
        if e["type"] == "ownership" and e["s"] in ks and e["t"] in ks and e["s"] != e["t"]:
            if O.has_edge(e["s"], e["t"]):
                O[e["s"]][e["t"]]["w"] = max(O[e["s"]][e["t"]]["w"], e["w"])
            else:
                O.add_edge(e["s"], e["t"], w=e["w"])
    return O


def widest_shortest(G, a, b, wfn):
    """Among shortest a->b paths, the one whose weakest edge is strongest."""
    try:
        ps = list(itertools.islice(nx.all_shortest_paths(G, a, b), 2000))
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return None
    best = max(sorted(ps), key=lambda p: min(wfn(u, v) for u, v in zip(p, p[1:])))
    return {"path": best, "length": len(best) - 1,
            "min_w": r4(min(wfn(u, v) for u, v in zip(best, best[1:]))),
            "n_shortest": len(ps)}


def ownership_chains(nodes, O, s, suspects, cap=40):
    def layer(fn):
        dist = bfs_layers(fn, s, CHAIN_HOPS)
        rows = sorted(((d, v) for v, d in dist.items() if d > 0))
        by = Counter(d for d, _ in rows)
        return {"by_depth": [by.get(h, 0) for h in range(1, CHAIN_HOPS + 1)], "total": len(rows),
                "nodes": [{"k": v, "d": d} for d, v in rows[:cap]]}
    Ou = O.to_undirected(as_view=False)
    links = []
    for t in suspects:
        if t == s:
            continue
        fwd = widest_shortest(O, s, t, lambda u, v: O[u][v]["w"])
        und = widest_shortest(Ou, s, t, lambda u, v: Ou[u][v]["w"])
        links.append({"to": t, "directed": fwd, "undirected": und})
    return {"downstream": layer(O.successors), "upstream": layer(O.predecessors),
            "to_suspects": links}


def keyword_context(nodes, U, s, hops=2):
    dist = bfs_layers(U.neighbors, s, hops)
    hits = sorted((d, v) for v, d in dist.items() if d > 0 and KW_ILLEGAL.search(nodes[v]["label"]))
    return [{"k": v, "d": d} for d, v in hits]


VERDICTS = ["Suspect", "Possible", "Insufficient evidence", "Unlikely"]
CONFIDENCE = ["High", "Medium", "Low"]
RUBRIC = [
    # id, max points, description
    ("low_layer", 1.0, "In the anomalous low-weight layer (1) or one hop from it (0.5)"),
    ("fisheye_tag", 1.0, "Direct edge from the 'FishEye International' node (1) or via one intermediary (0.5)"),
    ("low_ownership", 1.0, "Has a low-weight (< 0.8) ownership edge, the layer's dominant relation"),
    ("chain_to_suspect", 1.0, "Directed ownership chain (<= 6 hops) to or from another suspect"),
    ("broker", 1.0, "Betweenness in the top 5% of all nodes (structural broker)"),
    ("shell_marker", 1.0, "Nameless numeric id that both owns and is owned (intermediary layer)"),
    ("illegal_keyword", 0.5, "A one-hop neighbour is an NLP fragment about illegality (e.g. '“Illegal')"),
]
SUSPECT_AT, POSSIBLE_AT, INSUFF_AT = 4.0, 2.5, 1.0


def rubric(nodes, U, D, O, k, others, low_nodes, fisheye_nbrs, btw_pct):
    """Score one entity on the transparent verdict rubric.

    Each signal records its points and the weight of the weakest data edge it
    rests on ('basis_w', None for purely structural signals). Confidence counts
    signals that rest on edges with weight >= LOW_W (or on structure alone).
    """
    nd = nodes[k]
    sig = {}
    nb = set(U[k])
    # 1 layer
    if k in low_nodes:
        sig["low_layer"] = (1.0, r4(min(U[k][v]["wmin"] for v in nb)), "member of the layer")
    elif nb & low_nodes:
        v = sorted(nb & low_nodes)[0]
        sig["low_layer"] = (0.5, None, f"adjacent to layer node {v}")
    # 2 FishEye
    if FISHEYE_ID in nb:
        sig["fisheye_tag"] = (1.0, r4(U[k][FISHEYE_ID]["wmin"]), "direct FishEye edge")
    else:
        via = sorted(v for v in nb if v in fisheye_nbrs)
        if via:
            sig["fisheye_tag"] = (0.5, r4(U[k][via[0]]["wmin"]), f"via {via[0]}")
    # 3 low-weight ownership
    if nd["low_own"] > 0:
        lw = min(U[k][v]["wmin"] for v in nb if "ownership" in U[k][v]["types"])
        sig["low_ownership"] = (1.0, r4(lw), f"{nd['low_own']} low-weight ownership row(s)")
    # 4 ownership chain
    best = None
    for t in others:
        for a, b in ((k, t), (t, k)):
            r = widest_shortest(O, a, b, lambda u, v: O[u][v]["w"])
            if r and r["length"] <= CHAIN_HOPS and (best is None or (r["length"], -r["min_w"]) < (best["length"], -best["min_w"])):
                best = r
    if best:
        sig["chain_to_suspect"] = (1.0, best["min_w"], " -> ".join(best["path"]))
    # 5 broker
    if btw_pct[k] >= 0.95:
        sig["broker"] = (1.0, None, f"betweenness percentile {btw_pct[k]:.3f}")
    # 6 shell marker
    if nd["raw_int"] and nd["own_in"] > 0 and nd["own_out"] > 0:
        ws = [U[k][v]["wmin"] for v in nb if "ownership" in U[k][v]["types"]]
        sig["shell_marker"] = (1.0, r4(max(ws)), f"owns {nd['own_out']}, owned by {nd['own_in']}")
    # 7 keyword
    kws = sorted(v for v in nb if KW_ILLEGAL.search(nodes[v]["label"]))
    if kws:
        sig["illegal_keyword"] = (0.5, r4(U[k][kws[0]]["wmin"]), kws[0])
    pts = sum(p for p, _, _ in sig.values())
    solid = sum(1 for p, w, _ in sig.values() if p >= 1.0 and (w is None or w >= LOW_W))
    verdict = ("Suspect" if pts >= SUSPECT_AT else "Possible" if pts >= POSSIBLE_AT
               else "Insufficient evidence" if pts >= INSUFF_AT else "Unlikely")
    conf = "High" if solid >= 4 else "Medium" if solid >= 2 else "Low"
    return {"points": r4(pts), "solid_signals": solid, "verdict": verdict, "confidence": conf,
            "signals": [{"id": i, "points": sig[i][0], "basis_w": sig[i][1], "detail": sig[i][2]}
                        for i, _, _ in RUBRIC if i in sig]}


# ----------------------------------------------------------------------------
# Communities + anomalies
# ----------------------------------------------------------------------------

def community_summary(nodes, U, comms, other_maps, suspects, cand_keys, low_nodes, max_comms=40):
    comm_of = {n: i for i, c in enumerate(comms) for n in c}
    out = []
    for i, c in enumerate(comms[:max_comms]):
        cl = Counter(nodes[n]["cls"] for n in c)
        top = sorted(c, key=lambda n: (-U.degree(n), n))[:8]
        internal = induced(U, c).number_of_edges()
        out.append({"id": i, "size": len(c), "classes": dict(cl), "top_nodes": top,
                    "internal_edges": internal,
                    "suspects": [s for s in suspects if s in c],
                    "candidates": [k for k in cand_keys if k in c],
                    "low_layer_nodes": len(set(c) & low_nodes)})
    # inter-community edge matrix among the first max_comms
    mat = defaultdict(int)
    for u, v in U.edges():
        a, b = comm_of[u], comm_of[v]
        if a != b and a < max_comms and b < max_comms:
            mat[(min(a, b), max(a, b))] += 1
    # stability: for each suspect, fraction of other seeds keeping the suspect with its run-0 comm-mates
    stab = {}
    for s in suspects:
        mates = [n for n in comms[comm_of[s]] if n != s]
        if not mates:
            stab[s] = None
            continue
        fr = [np.mean([m[n] == m[s] for n in mates]) for m in other_maps]
        stab[s] = r4(np.mean(fr))
    mod = nx.community.modularity(U, comms)
    return {"n_communities": len(comms), "modularity": r4(mod), "sizes": [len(c) for c in comms],
            "communities": out,
            "inter_edges": [{"a": a, "b": b, "n": n} for (a, b), n in sorted(mat.items())],
            "suspect_comm_stability": stab}


def anomalies(nodes, U, D, M):
    O = nx.DiGraph([(u, v) for u, v, a in D.edges(data=True) if "ownership" in a["types"]])
    mutual = [(u, v) for u, v in O.edges() if O.has_edge(v, u) and str(u) < str(v)]
    cyc = list(itertools.islice(nx.simple_cycles(O, length_bound=4), 5000))
    cyc_len = Counter(len(c) for c in cyc)
    par = sorted(((U[u][v]["n"], u, v, sorted(U[u][v]["types"])) for u, v in U.edges() if U[u][v]["n"] >= 4),
                 reverse=True)[:30]
    pool = [k for k in nodes if nodes[k]["cls"] in POOL_CLASSES]
    fan_out = sorted(pool, key=lambda k: (-nodes[k]["own_out"], k))[:15]
    fan_in = sorted(pool, key=lambda k: (-nodes[k]["own_in"], k))[:15]
    hubs = sorted(nodes, key=lambda k: (-nodes[k]["deg"], k))[:20]
    hub_set = [k for k in nodes if nodes[k]["deg"] > HUB_DEG]
    H = induced(U, hub_set)
    hub_core = {"nodes": sorted(hub_set, key=lambda k: -nodes[k]["deg"]),
                "edges": [{"a": u, "b": v, "n": a["n"], "types": sorted(a["types"])} for u, v, a in H.edges(data=True)],
                "density": r4(nx.density(H)),
                "share_of_all_rows": r4(sum(a["n"] for _, _, a in H.edges(data=True)) / M.number_of_edges())}
    tp = {k: nodes[k]["type"] for k in nodes}
    fam = [(u, v) for u, v, a in M.edges(data=True) if a["type"] == "family_relationship"]
    own = [(u, v) for u, v, a in M.edges(data=True) if a["type"] == "ownership"]
    semantics = {
        "family_rel_both_person_share": r4(sum(1 for u, v in fam if tp[u] == "person" and tp[v] == "person") / len(fam)),
        "family_rel_no_person_share": r4(sum(1 for u, v in fam if tp[u] != "person" and tp[v] != "person") / len(fam)),
        "ownership_target_person_share": r4(sum(1 for u, v in own if tp[v] == "person") / len(own)),
        "ownership_source_person_share": r4(sum(1 for u, v in own if tp[u] == "person") / len(own)),
    }
    # company-ish nodes with ownership edges to persons in both directions etc.
    return {
        "hubs": [{"k": k, "deg": nodes[k]["deg"], "cls": nodes[k]["cls"]} for k in hubs],
        "hub_core": hub_core,
        "relation_semantics": semantics,
        "ownership_fan_out": [{"k": k, "n": nodes[k]["own_out"]} for k in fan_out],
        "ownership_fan_in": [{"k": k, "n": nodes[k]["own_in"]} for k in fan_in],
        "mutual_ownership_pairs": len(mutual),
        "ownership_cycles_le4": {str(k): v for k, v in sorted(cyc_len.items())},
        "max_parallel_pairs": [{"a": u, "b": v, "n": n, "types": t} for n, u, v, t in par],
        "class_counts": dict(Counter(nd["cls"] for nd in nodes.values())),
        "untyped": sum(1 for nd in nodes.values() if nd["type"] is None),
    }


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------

def node_record(nd):
    return {"k": nd["k"], "label": nd["label"], "type": nd["type"], "cls": nd["cls"],
            "country": nd["country"], "deg": nd["deg"], "comm": nd["comm"],
            "low": nd["low"], "pr": r4(nd["pr"] * 1e4), "btw": r4(nd["btw"])}


def dump(name, obj):
    p = OUT / name
    s = json.dumps(obj, separators=(",", ":"), ensure_ascii=False, allow_nan=False, sort_keys=True)
    p.write_text(s, encoding="utf-8")
    print(f"wrote {p.relative_to(ROOT)} {len(s.encode()) / 1024:.1f} KB", file=sys.stderr)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    nodes, links, quirks = load()
    cedges = collapse(links)
    M, D, U = build_graphs(nodes, links, cedges)
    suspects = [key(s) for s in SUSPECT_IDS]
    dup_rows = len(links) - len(cedges)
    quirks["duplicate_rows_same_s_t_type"] = dup_rows
    quirks["directed_pairs_multi_type"] = sum(1 for _, _, a in D.edges(data=True) if len(a["types"]) > 1)
    quirks["undirected_simple_edges"] = U.number_of_edges()
    quirks["self_loops"] = sum(1 for l in links if l["s"] == l["t"])

    comms, comm_runs, other_maps, comps = global_metrics(nodes, M, D, U)
    lowc, low_nodes = lowconf_layer(nodes, links, suspects)
    n_in = len(set(suspects) & low_nodes)
    lowc["suspect_enrichment"] = {
        "suspects_in_layer": n_in, "layer_share_of_nodes": r4(len(low_nodes) / len(nodes)),
        "p_value": float(f"{stats.hypergeom.sf(n_in - 1, len(nodes), len(low_nodes), len(suspects)):.3g}"),
        "note": "hypergeometric P(>= observed suspects in layer) if 4 nodes were drawn at random"}
    fe = set(U[FISHEYE_ID])
    lowc["fisheye_node"] = {"degree": len(fe), "suspects_adjacent": [s for s in suspects if s in fe],
                            "edges_low_conf": sum(1 for l in links if FISHEYE_ID in (l["s"], l["t"]) and l["w"] < LOW_W),
                            "edges_total": sum(1 for l in links if FISHEYE_ID in (l["s"], l["t"])),
                            "neighbors": sorted(fe)}
    lowc["suspect_distance_to_layer"] = {
        s: (0 if s in low_nodes else min(nx.single_source_shortest_path_length(U, s, cutoff=4).get(n, 99)
                                         for n in low_nodes)) for s in suspects}
    fisheye_nbrs = set(U[FISHEYE_ID])

    egos, ego_nodes = build_egos(nodes, M, D, U, suspects)
    pairs, path_null = paths_between(nodes, U, D, suspects, low_nodes)
    O = ownership_graph(nodes, cedges, suspects)
    pct = percentiles(nodes)
    sus = suspect_profiles(nodes, M, D, U, O, suspects, low_nodes, comm_runs, fisheye_nbrs, pct)
    cands, cand_meta = candidates(nodes, M, U, suspects, low_nodes)
    for c in cands:
        c["rubric"] = rubric(nodes, U, D, O, c["k"], suspects, low_nodes, fisheye_nbrs, pct["btw"])
    cand_meta["features"] = [{"name": f, "weight": wt,
                              "desc": d.replace("this layer", f"this {lowc['n_nodes']}-node layer")}
                             for f, wt, d in FEATURES]
    comm = community_summary(nodes, U, comms, other_maps, suspects, [c["k"] for c in cands], low_nodes)
    anom = anomalies(nodes, U, D, M)

    # Node tables: each file carries the records it references so files are independent.
    def table(keys):
        return [node_record(nodes[k]) for k in sorted(set(keys))]

    dump("meta.json", {
        "counts": {"nodes": len(nodes), "links": len(links), "collapsed_directed": len(cedges),
                   "undirected_simple": U.number_of_edges(), "components": len(comps),
                   "lcc_nodes": len(comps[0])},
        "node_types": dict(Counter(nd["type"] or "unknown" for nd in nodes.values())),
        "edge_types": dict(Counter(l["type"] for l in links)),
        "classes": anom["class_counts"],
        "class_desc": {
            "company": "type=company", "company_like": "untyped, name has a corporate suffix/keyword",
            "org_numeric": "type=organization with a numeric id (nameless)", "org_named": "type=organization with a name",
            "political_org": "type=political_organization", "junk": "NLP noise: mojibake, temporal words, lowercase fragments",
            "untyped_other": "untyped, not obviously a business or noise"},
        "type_class_crosstab": {f"{t or 'unknown'}|{c}": n for (t, c), n in
                                Counter((nd["type"], nd["cls"]) for nd in nodes.values()).items()},
        "weight_by_type": {t: {"p05": r4(np.percentile([l["w"] for l in links if l["type"] == t], 5)),
                               "median": r4(np.median([l["w"] for l in links if l["type"] == t])),
                               "min": r4(min(l["w"] for l in links if l["type"] == t))} for t in EDGE_TYPES},
        "quirks": quirks,
        "suspects": suspects,
        "fisheye_node": FISHEYE_ID,
        "anomalies": anom,
        "params": {"low_conf_threshold": LOW_W, "hub_degree": HUB_DEG, "ego_hops": EGO_HOPS, "seed": SEED,
                   "ego_cap_2hop": EGO_CAP2, "evidence_max_nodes": EVID_MAX, "chain_hops": CHAIN_HOPS,
                   "n_candidates": N_CANDIDATES},
        "generated_by": "pipeline/mc1_build.py",
    })
    dump("lowconf.json", {**lowc, "node_table": table([n["k"] for n in lowc["nodes"]])})
    dump("egos.json", {"egos": egos, "node_table": table(ego_nodes)})
    sus_nodes = ([n["k"] for s in sus for n in s["neighbors_1hop"]] + suspects
                 + [n["k"] for s in sus for n in s["keyword_context_2hop"]]
                 + [n["k"] for s in sus for side in ("downstream", "upstream")
                    for n in s["ownership_chains"][side]["nodes"]]
                 + [v for s in sus for l in s["ownership_chains"]["to_suspects"]
                    for kind in ("directed", "undirected") if l[kind] for v in l[kind]["path"]]
                 + [n for s in sus for n in s["hub_neighbors"]])
    dump("suspects.json", {
        "suspects": sus,
        "verdict_scale": VERDICTS, "confidence_scale": CONFIDENCE,
        "rubric": {"signals": [{"id": i, "max": m, "desc": d} for i, m, d in RUBRIC],
                   "thresholds": {"Suspect": SUSPECT_AT, "Possible": POSSIBLE_AT,
                                  "Insufficient evidence": INSUFF_AT, "Unlikely": 0.0},
                   "confidence_rule": "High if >= 4 full-point signals rest on edges with weight >= 0.8 "
                                      "(or on structure alone); Medium if 2-3; Low if 0-1",
                   "chain_hops": CHAIN_HOPS},
        "node_table": table(sus_nodes)})
    path_nodes = [n for p in pairs for kind in ("any", "no_junk", "no_hubs_no_junk", "low_conf_only",
                                                "ownership_directed", "ownership_directed_rev")
                  for path in p[kind]["paths"] for n in path] + [n for p in pairs for n in p["shared_1hop"]]
    dump("paths.json", {"pairs": pairs, "null": path_null, "node_table": table(path_nodes + suspects)})
    cand_nodes = [n for c in cands for n in c["evidence"]["nodes"]] + suspects
    dump("candidates.json", {"candidates": cands, **cand_meta, "node_table": table(cand_nodes)})
    comm_nodes = [n for c in comm["communities"] for n in c["top_nodes"]] + suspects
    dump("communities.json", {**comm, "node_table": table(comm_nodes)})

    total = sum(p.stat().st_size for p in OUT.glob("*.json"))
    print(f"total {total / 1024:.1f} KB", file=sys.stderr)


if __name__ == "__main__":
    main()
