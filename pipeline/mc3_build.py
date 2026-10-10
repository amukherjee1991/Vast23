"""MC3 pipeline: anomalous business structures and similar-business grouping.

Run from repo root:  .venv/bin/python pipeline/mc3_build.py

Reads  data/raw/mc3/MC3.json
Writes app/public/data/mc3/{meta,groups_overview,anomalies,clusters,owners_top,investigate}.json

Data model (established by inspecting the raw file, see docs/data-contracts/mc3.md):
  * Every link is company (source) -> person (target), typed "Beneficial Owner" or
    "Company Contacts". Link targets (21,265 people) never appear in the node list.
  * `source` is a list; 2,169 links list >1 source (mostly the same company repeated,
    sometimes 2-7 distinct companies). Each distinct source becomes its own edge.
  * Node records are attribute records keyed by name. Only type=="Company" records carry
    product_services / revenue. Records typed "Beneficial Owner"/"Company Contacts" have
    company-style names, no attributes, and ~91% of them never appear in a link.
  * One name can have several Company records (different country / revenue / product).
    Links reference names only, so we resolve duplicates by name and keep the record
    multiplicity as an anomaly signal.
"""
from __future__ import annotations

import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

import networkx as nx
import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import TruncatedSVD
from sklearn.ensemble import IsolationForest
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.manifold import TSNE
from sklearn.metrics import silhouette_samples, silhouette_score
from sklearn.preprocessing import normalize

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw/mc3/MC3.json"
OUT = ROOT / "app/public/data/mc3"
SEED = 42
GIANT_SPLIT_MIN = 500  # components larger than this are split with Louvain

BO, CC = "Beneficial Owner", "Company Contacts"

# --------------------------------------------------------------------------- helpers

def first(v, default=None):
    if isinstance(v, list):
        return v[0] if v else default
    return v if v is not None else default


def r(x, nd=3):
    """Round + make JSON safe (NaN/inf -> None)."""
    if x is None:
        return None
    if isinstance(x, (np.integer,)):
        return int(x)
    x = float(x)
    if math.isnan(x) or math.isinf(x):
        return None
    if nd == 0:
        return int(round(x))
    return round(x, nd)


def dump(name, obj):
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / name
    with open(p, "w") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    return p.stat().st_size


# Faker-style generic names ("Jones LLC", "Davis-Page", "Black, Barrett and Hall").
GENERIC_NAME = re.compile(
    r"^([A-Z][a-z]+( (LLC|Inc|PLC|Group|Ltd|and Sons))|[A-Z][a-z]+-[A-Z][a-z]+|"
    r"[A-Z][a-z]+, [A-Z][a-z]+ and [A-Z][a-z]+)$"
)

FISH_CORE = [
    "fish*", "seafood*", "sea food*", "tuna", "salmon", "shrimp", "prawn", "crab", "lobster",
    "squid", "octopus", "oyster", "clam", "mussel", "scallop", "shellfish", "mollus*",
    "crustacea*", "cod", "pollock", "hake", "sardine", "anchov*", "mackerel",
    "herring", "tilapia", "catfish", "trout", "roe", "caviar", "surimi", "fillet",
    "aquaculture", "trawl*", "aquatic", "sea cucumber", "seaweed", "sea vegetable",
    "krill", "eel", "abalone", "swordfish", "halibut", "flounder", "snapper", "grouper",
    "cephalopod", "bass", "marine product", "sashimi", "sushi", "pangasius", "carp",
    "seabass", "sea bass", "plaice", "haddock", "whitefish", "pollack",
]
FISH_ADJ = [
    "frozen", "cold storage", "refrigerat*", "freezing", "cannery", "canned", "canning",
    "vessel", "boat", "ship", "shipping", "port", "harbo*", "maritime", "marine", "ocean*",
    "freight", "logistic*", "cargo", "net", "ice", "processing", "wholesale", "import*",
    "export*", "deli", "meat", "poultry", "food*",
]
# word-boundary regexes (avoid "cod" in "code", "eel" in "steel", "roe" in "heroes")
def _kw_regex(words):
    """Terms ending in '*' are prefixes (fish* -> fishing, fisheries); the rest must
    match a whole word, optionally plural ("cod" must not hit "code")."""
    parts = []
    for w in words:
        w = w.strip()
        if w.endswith("*"):
            parts.append(rf"\b{re.escape(w[:-1])}")
        else:
            parts.append(rf"\b{re.escape(w)}(?:s|es)?\b")
    return re.compile("|".join(parts), re.I)

FISH_CORE_RE = _kw_regex(FISH_CORE)
FISH_ADJ_RE = _kw_regex(FISH_ADJ)
NAME_FISH_RE = _kw_regex([
    "fish*", "seafood*", "tuna", "salmon", "shrimp", "crab", "lobster", "oyster", "clam",
    "trout", "snapper", "seabass", "marine life", "catch*", "harvest*", "angler*",
    "trawl*", "mackerel", "sardine", "squid", "cod", "pollock", "anchov*", "scallop",
    "mussel", "eel", "perch", "pike", "carp", "tilapia", "haddock", "herring", "plaice",
    "halibut", "barracuda", "marlin", "swordfish", "octopus", "krill", "abalone", "bonito",
])
UNINFORMATIVE = {"", "unknown", "n/a", "na", "none", "-", "0"}


def fish_label(text: str | None):
    """-> (label, core_hits, adj_hits).  label in {fishing, adjacent, other, unknown}."""
    if text is None or text.strip().lower() in UNINFORMATIVE:
        return "unknown", 0, 0
    core = len(FISH_CORE_RE.findall(text))
    adj = len(FISH_ADJ_RE.findall(text))
    if core:
        return "fishing", core, adj
    if adj:
        return "adjacent", 0, adj
    return "other", 0, 0


# --------------------------------------------------------------------------- load + clean

def load():
    d = json.load(open(RAW))
    return d["nodes"], d["links"]


def build_entities(nodes, links):
    rec = defaultdict(lambda: {"company_records": [], "role_records": Counter()})
    for n in nodes:
        nid = first(n["id"])
        t = first(n["type"])
        country = first(n.get("country"))
        if t == "Company":
            rev = first(n.get("revenue_omu"))
            if isinstance(rev, str) or rev is None or (isinstance(rev, float) and math.isnan(rev)):
                rev = None
            rec[nid]["company_records"].append({
                "country": country,
                "product": first(n.get("product_services")),
                "revenue": rev,
            })
        else:
            rec[nid]["role_records"][t] += 1
            rec[nid].setdefault("role_countries", set()).add(country)

    edges = {}  # (company, person) -> set(types)
    multi_src_links = 0
    multi_distinct = 0
    for l in links:
        srcs = list(dict.fromkeys(l["source"]))
        if len(l["source"]) > 1:
            multi_src_links += 1
        if len(srcs) > 1:
            multi_distinct += 1
        tgt = first(l["target"])
        t = first(l["type"])
        for s in srcs:
            edges.setdefault((s, tgt), set()).add(t)

    linked_companies = {c for c, _ in edges}
    persons = {p for _, p in edges}

    companies = {}
    for name in sorted(set(linked_companies) | {k for k, v in rec.items() if v["company_records"]}):
        v = rec.get(name, {"company_records": [], "role_records": Counter()})
        crs = v["company_records"]
        countries = sorted({c["country"] for c in crs if c["country"]} |
                           ({c for c in v.get("role_countries", set()) if c} if not crs else set()))
        revs = [c["revenue"] for c in crs if c["revenue"] is not None]
        prods = [c["product"] for c in crs if c["product"] and c["product"].strip().lower() not in UNINFORMATIVE]
        prod_text = " | ".join(dict.fromkeys(prods)) if prods else None
        lab, core, adj = fish_label(prod_text)
        companies[name] = {
            "name": name,
            "n_records": len(crs),
            "registered": len(crs) > 0,
            "countries": countries,
            "revenue": float(sum(revs)) if revs else None,
            "revenue_values": revs,
            "product": prod_text,
            "product_unknown": prod_text is None,
            "fish_label": lab,
            "fish_core_hits": core,
            "name_fish": bool(NAME_FISH_RE.search(name)),
            "generic_name": bool(GENERIC_NAME.match(name)),
            "role_records": sum(v["role_records"].values()),
        }

    orphan_role_records = sum(
        sum(v["role_records"].values()) for k, v in rec.items()
        if not v["company_records"] and k not in linked_companies
    )
    stats = {
        "multi_source_links": multi_src_links,
        "multi_distinct_source_links": multi_distinct,
        "orphan_role_record_names": sum(1 for k, v in rec.items() if not v["company_records"] and v["role_records"] and k not in linked_companies),
        "orphan_role_records": orphan_role_records,
        "dup_company_names": sum(1 for v in rec.values() if len(v["company_records"]) > 1),
        "dup_company_multi_country": sum(1 for v in rec.values() if len({c["country"] for c in v["company_records"]}) > 1),
        "company_records": sum(len(v["company_records"]) for v in rec.values()),
        "revenue_unknown_records": sum(1 for v in rec.values() for c in v["company_records"] if c["revenue"] is None),
        "dual_type_pairs": sum(1 for t in edges.values() if len(t) > 1),
    }
    return companies, persons, edges, stats


def build_graph(companies, persons, edges):
    G = nx.Graph()
    for c in sorted(companies):
        G.add_node("C|" + c, kind="company")
    for p in sorted(persons):
        G.add_node("P|" + p, kind="person")
    for (c, p), types in edges.items():
        G.add_edge("C|" + c, "P|" + p, bo=BO in types, cc=CC in types)
    return G


# --------------------------------------------------------------------------- groups

def person_profiles(G, companies):
    prof = {}
    for n in G.nodes:
        if not n.startswith("P|"):
            continue
        cos_bo, cos_cc = [], []
        for nb in G.neighbors(n):
            e = G.edges[n, nb]
            if e["bo"]:
                cos_bo.append(nb[2:])
            if e["cc"]:
                cos_cc.append(nb[2:])
        allc = set(cos_bo) | set(cos_cc)
        ctry = {c for co in allc for c in companies[co]["countries"]}
        prof[n[2:]] = {"bo": cos_bo, "cc": cos_cc, "n_companies": len(allc), "countries": sorted(ctry)}
    return prof


def group_features(nodeset, G, companies, pprof):
    cos = [n[2:] for n in nodeset if n.startswith("C|")]
    ppl = [n[2:] for n in nodeset if n.startswith("P|")]
    sub = G.subgraph(nodeset)
    n_bo = sum(1 for _, _, e in sub.edges(data=True) if e["bo"])
    n_cc = sum(1 for _, _, e in sub.edges(data=True) if e["cc"])
    owners = [p for p in ppl if pprof[p]["bo"]]
    contacts = [p for p in ppl if pprof[p]["cc"]]
    dual = [p for p in ppl if pprof[p]["bo"] and pprof[p]["cc"]]
    ctry = Counter(c for co in cos for c in companies[co]["countries"])
    revs = [companies[c]["revenue"] for c in cos if companies[c]["revenue"] is not None]
    informative = [c for c in cos if not companies[c]["product_unknown"]]
    fish = [c for c in informative if companies[c]["fish_label"] == "fishing"]
    owners_per_co = [sum(1 for nb in sub.neighbors("C|" + c) if sub.edges["C|" + c, nb]["bo"]) for c in cos]
    contacts_per_co = [sum(1 for nb in sub.neighbors("C|" + c) if sub.edges["C|" + c, nb]["cc"]) for c in cos]
    cos_per_person = [sub.degree("P|" + p) for p in ppl]
    # Multi-company persons are disproportionately common names (name collisions), so the
    # serial / cross-border signals only count persons whose surname is NOT in the top 50.
    rare = [p for p in ppl if not pprof[p]["common_name"]]
    cos_per_rare = [sub.degree("P|" + p) for p in rare]
    serial_raw = [p for p in ppl if len(set(pprof[p]["bo"])) >= 3]
    serial = [p for p in serial_raw if not pprof[p]["common_name"]]
    xborder = [p for p in rare if pprof[p]["bo"] and pprof[p]["n_companies"] >= 2 and len(pprof[p]["countries"]) >= 2]
    shell = [c for c in cos if companies[c]["product_unknown"] and companies[c]["revenue"] is None]
    nc = max(len(cos), 1)
    f = {
        "n_nodes": len(nodeset),
        "n_companies": len(cos),
        "n_persons": len(ppl),
        "n_owners": len(owners),
        "n_contacts": len(contacts),
        "n_bo_edges": n_bo,
        "n_cc_edges": n_cc,
        "bo_share": n_bo / max(n_bo + n_cc, 1),
        "n_countries": len(ctry),
        "revenue_total": float(sum(revs)) if revs else None,
        "revenue_median": float(np.median(revs)) if revs else None,
        "revenue_missing_share": 1 - len(revs) / nc,
        "unknown_product_share": 1 - len(informative) / nc,
        "fish_share": len(fish) / len(informative) if informative else None,
        "fish_name_share": sum(companies[c]["name_fish"] for c in cos) / nc,
        "unregistered_share": sum(not companies[c]["registered"] for c in cos) / nc,
        "generic_name_share": sum(companies[c]["generic_name"] for c in cos) / nc,
        "dup_record_companies": sum(companies[c]["n_records"] > 1 for c in cos),
        "multi_country_companies": sum(len(companies[c]["countries"]) > 1 for c in cos),
        "max_owners_per_company": max(owners_per_co) if owners_per_co else 0,
        "max_contacts_per_company": max(contacts_per_co) if contacts_per_co else 0,
        "max_companies_per_person": max(cos_per_rare) if cos_per_rare else 0,
        "max_companies_per_person_raw": max(cos_per_person) if cos_per_person else 0,
        "serial_owners_raw": len(serial_raw),
        "serial_owners": len(serial),
        "cross_border_owners": len(xborder),
        "dual_role_persons": len(dual),
        "shell_like_companies": len(shell),
        "density": nx.density(sub) if len(nodeset) > 1 else 0.0,
        # size-normalised ratios used by the anomaly model
        "persons_per_company": len(ppl) / nc,
        "countries_per_company": len(ctry) / nc,
        "serial_owner_share": len(serial) / max(len(owners), 1),
        "cross_border_share": len(xborder) / max(len(owners), 1),
        "dual_role_share": len(dual) / max(len(ppl), 1),
        "shell_share": len(shell) / nc,
        "multi_country_share": sum(len(companies[c]["countries"]) > 1 for c in cos) / nc,
        "log_revenue_per_company": math.log10(sum(revs) / len(revs)) if revs else 0.0,
        "top_countries": [c for c, _ in ctry.most_common(4)],
    }
    return f


# --------------------------------------------------------------------------- main

def main():
    nodes, links = load()
    companies, persons, edges, clean_stats = build_entities(nodes, links)
    G = build_graph(companies, persons, edges)
    pprof = person_profiles(G, companies)
    _suf = {"MD", "DDS", "PhD", "DVM", "Jr.", "Sr.", "II", "III", "IV", "V"}
    _sn = lambda p: ([t for t in p.split() if t not in _suf] or [p])[-1]
    sur_all = Counter(_sn(p) for p in persons)
    COMMON = {s_ for s_, _ in sur_all.most_common(50)}
    for p_, pr_ in pprof.items():
        pr_["common_name"] = _sn(p_) in COMMON
    multi_all = [p_ for p_, pr_ in pprof.items() if pr_["n_companies"] > 1]
    collision_by_degree = {}
    for k_ in (1, 2, 3, 4, 5):
        ps_ = [pr_ for pr_ in pprof.values() if (pr_["n_companies"] >= k_ if k_ == 5 else pr_["n_companies"] == k_)]
        collision_by_degree[f"{k_}{'+' if k_ == 5 else ''}"] = {"persons": len(ps_), "common_surname_share": r(np.mean([x["common_name"] for x in ps_]))}
    print(f"companies={len(companies)} persons={len(persons)} edges={len(edges)}")

    # ---- connected components -> business groups (giant split by Louvain)
    comps = sorted(nx.connected_components(G), key=lambda c: (-len(c), min(c)))
    size_hist = Counter(len(c) for c in comps)
    giant = comps[0]
    units = []  # analysis units
    comp_meta = []
    for i, c in enumerate(comps):
        cid = f"BG{i + 1:05d}"
        comp_meta.append((cid, c))
        if len(c) >= GIANT_SPLIT_MIN:
            parts = nx.community.louvain_communities(G.subgraph(c), seed=SEED, resolution=1.0)
            parts = sorted(parts, key=lambda c: (-len(c), min(c)))
            for j, p in enumerate(parts):
                units.append({"id": f"{cid}.{j + 1:03d}", "parent": cid, "nodes": p})
        else:
            units.append({"id": cid, "parent": None, "nodes": c})
    giant_parts = [u for u in units if u["parent"]]
    giant_sub = G.subgraph(giant)
    part_of = {n: u["id"] for u in giant_parts for n in u["nodes"]}
    cut_edges = sum(1 for a, b in giant_sub.edges() if part_of[a] != part_of[b])
    modularity = nx.community.modularity(giant_sub, [u["nodes"] for u in giant_parts])
    giant_art = [n for n in nx.articulation_points(giant_sub)]
    giant_person_bridges = [n[2:] for n in giant_art if n.startswith("P|")]
    print(f"components={len(comps)} giant={len(giant)} giant_parts={len(giant_parts)} Q={modularity:.3f}")
    # name-collision robustness: if the giant only exists because "John Smith" is many people,
    # removing multi-company persons with very common surnames should shatter it.
    robust = {"collision_by_companies_linked": collision_by_degree}
    multi_g = [n for n in giant if n.startswith("P|") and G.degree(n) > 1]
    for topn in (10, 50):
        common = {s_ for s_, _ in sur_all.most_common(topn)}
        drop = [n for n in giant if n.startswith("P|") and G.degree(n) > 1 and _sn(n[2:]) in common]
        H_ = giant_sub.copy()
        H_.remove_nodes_from(drop)
        cc_ = sorted((len(c) for c in nx.connected_components(H_)), reverse=True)
        ctrl = []
        rs_ = np.random.default_rng(SEED)
        for _ in range(10):
            rd = rs_.choice(len(multi_g), size=len(drop), replace=False)
            H2 = giant_sub.copy()
            H2.remove_nodes_from([multi_g[i] for i in rd])
            ctrl.append(max(len(c) for c in nx.connected_components(H2)))
        robust[f"drop_top{topn}_surnames"] = {"persons_removed": len(drop), "largest_remaining": cc_[0] if cc_ else 0,
                                             "second_remaining": cc_[1] if len(cc_) > 1 else 0,
                                             "random_control_largest": sorted(int(x) for x in ctrl)}
    # a stricter test: remove every bridging person (degree>1) -> giant must vanish
    print("robustness", robust)

    for u in units:
        u["f"] = group_features(u["nodes"], G, companies, pprof)

    # ---- anomaly scoring on units with >=3 nodes
    # size enters once (n_companies); everything else is a ratio or a max, so the model
    # does not simply rank the biggest groups first.
    FEATS = [
        ("n_companies", "log"), ("persons_per_company", "log"), ("countries_per_company", "lin"),
        ("bo_share", "lin"), ("revenue_missing_share", "lin"), ("unknown_product_share", "lin"),
        ("unregistered_share", "lin"), ("multi_country_share", "lin"),
        ("max_owners_per_company", "log"), ("max_contacts_per_company", "log"),
        ("max_companies_per_person", "log"), ("serial_owner_share", "lin"),
        ("cross_border_share", "lin"), ("dual_role_share", "lin"), ("shell_share", "lin"),
        ("log_revenue_per_company", "lin"),
    ]
    scored = [u for u in units if u["f"]["n_nodes"] >= 3]
    X = []
    for u in scored:
        f = u["f"]
        X.append([math.log1p(f[k]) if t == "log" else f[k] for k, t in FEATS])
    X = np.array(X, dtype=float)
    med = np.median(X, axis=0)
    mad = np.median(np.abs(X - med), axis=0) * 1.4826
    sd = X.std(axis=0)
    scale = np.where(mad > 1e-9, mad, np.where(sd > 1e-9, sd, 1.0))
    Z = (X - med) / scale
    iso = IsolationForest(n_estimators=400, contamination="auto", random_state=SEED).fit(X)
    raw = -iso.score_samples(X)
    pct = raw.argsort().argsort() / (len(raw) - 1)
    for k, u in enumerate(scored):
        u["iso_raw"] = float(raw[k])
        u["anomaly_pct"] = float(pct[k])
        u["z"] = {FEATS[j][0]: float(Z[k, j]) for j in range(len(FEATS))}
    for u in units:
        u.setdefault("anomaly_pct", None)

    # ---- rule flags (domain heuristics for IUU-style structures)
    def flags(f):
        fl = []
        if f["max_owners_per_company"] >= 20:
            fl.append(("ownership_fragmentation", f"a company has {f['max_owners_per_company']} beneficial owners"))
        if f["serial_owners"] >= 1 and f["max_companies_per_person"] >= 4:
            fl.append(("serial_owner", f"a person with an uncommon name is linked to {f['max_companies_per_person']} companies"))
        if f["cross_border_owners"] >= 1:
            fl.append(("cross_border_control", f"{f['cross_border_owners']} owner(s) control companies in 2+ countries"))
        if f["multi_country_companies"] >= 1:
            fl.append(("multi_jurisdiction_duplicate", f"{f['multi_country_companies']} company name(s) registered in several countries"))
        if f["n_companies"] >= 3 and f["shell_like_companies"] / f["n_companies"] >= 0.5:
            fl.append(("shell_like", f"{f['shell_like_companies']}/{f['n_companies']} companies have unknown products and no revenue"))
        if f["n_companies"] >= 3 and f["unregistered_share"] >= 0.6:
            fl.append(("unregistered_entities", f"{round(100 * f['unregistered_share'])}% of companies have no registry record"))
        if f["dual_role_persons"] >= 2:
            fl.append(("dual_roles", f"{f['dual_role_persons']} persons are both owner and contact"))
        return fl

    for u in units:
        u["flags"] = flags(u["f"])

    FEAT_TEXT = {
        "n_companies": "companies", "persons_per_company": "persons per company",
        "countries_per_company": "countries per company", "multi_country_share": "share of companies registered in several countries",
        "serial_owner_share": "share of owners holding 3+ companies", "cross_border_share": "share of owners controlling companies in 2+ countries",
        "dual_role_share": "share of persons who are both owner and contact", "shell_share": "share of shell-like companies",
        "log_revenue_per_company": "log10 mean revenue per company",
        "bo_share": "share of ownership links", "revenue_missing_share": "share of companies without revenue",
        "unknown_product_share": "share of companies with unknown products",
        "unregistered_share": "share of companies without registry record",
        "dup_record_companies": "companies with duplicate records",
        "multi_country_companies": "companies registered in several countries",
        "max_owners_per_company": "max owners on one company",
        "max_contacts_per_company": "max contacts on one company",
        "max_companies_per_person": "max companies per (uncommon-name) person",
        "serial_owners": "persons owning 3+ companies",
        "cross_border_owners": "owners spanning 2+ countries",
        "dual_role_persons": "persons both owner and contact",
        "shell_like_companies": "shell-like companies", "density": "link density",
        "log_revenue_total": "log10 total revenue",
    }
    med_raw = {FEATS[j][0]: float(np.median([u["f"][FEATS[j][0]] for u in scored])) for j in range(len(FEATS))}

    def reasons(u, k=4):
        if "z" not in u:
            return []
        items = sorted(u["z"].items(), key=lambda kv: -abs(kv[1]))
        out = []
        for name, z in items[:k]:
            if abs(z) < 2:
                continue
            out.append({"feature": name, "label": FEAT_TEXT[name], "value": r(u["f"][name]),
                        "median": r(med_raw[name]), "robust_z": r(z, 2),
                        "direction": "high" if z > 0 else "low"})
        return out

    # ---- group feature vectors for similarity between groups (Q3)
    Zn = normalize(np.clip(Z, -10, 10))
    idx_of = {u["id"]: k for k, u in enumerate(scored)}

    def similar_groups(uid, k=5):
        i = idx_of[uid]
        sims = Zn @ Zn[i]
        order = np.argsort(-sims)
        out = []
        for j in order:
            if j == i:
                continue
            out.append({"id": scored[j]["id"], "cosine": r(sims[j], 3), "anomaly_pct": r(scored[j]["anomaly_pct"], 3)})
            if len(out) >= k:
                break
        return out

    # ---- IUU relevance + investigate score
    for u in scored:
        f = u["f"]
        fish = f["fish_share"] if f["fish_share"] is not None else 0.0
        u["iuu_relevance"] = min(1.0, 0.75 * fish + 0.5 * f["fish_name_share"])
        flag_w = {"ownership_fragmentation": 1.0, "serial_owner": 0.8, "cross_border_control": 1.0,
                  "multi_jurisdiction_duplicate": 0.8, "shell_like": 1.0, "unregistered_entities": 0.5,
                  "dual_roles": 0.4}
        fs = sum(flag_w[k] for k, _ in u["flags"])
        u["flag_score"] = min(1.0, fs / 3.0)
        u["investigate_score"] = 0.45 * u["anomaly_pct"] + 0.30 * u["flag_score"] + 0.25 * u["iuu_relevance"]

    # =========================================================== product text: topics
    co_names = sorted(companies)
    texts = [companies[c]["product"] for c in co_names]
    has_text = np.array([t is not None for t in texts])
    text_idx = np.where(has_text)[0]
    tfidf = TfidfVectorizer(stop_words="english", min_df=3, max_df=0.4, ngram_range=(1, 2),
                            token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z]+\b", sublinear_tf=True)
    T = tfidf.fit_transform([texts[i] for i in text_idx])
    vocab = np.array(tfidf.get_feature_names_out())
    svd = TruncatedSVD(n_components=60, random_state=SEED)
    Ts = normalize(svd.fit_transform(T))
    best_k, best_s, topic_sil = None, -1, {}
    rng = np.random.default_rng(SEED)
    samp = rng.choice(len(Ts), size=min(3000, len(Ts)), replace=False)
    for k in range(8, 21, 2):
        km = KMeans(n_clusters=k, n_init=5, random_state=SEED).fit(Ts)
        s = silhouette_score(Ts[samp], km.labels_[samp], metric="cosine")
        topic_sil[k] = s
        if s > best_s:
            best_k, best_s = k, s
    km_t = KMeans(n_clusters=best_k, n_init=10, random_state=SEED).fit(Ts)
    topic_lab = km_t.labels_
    Tn = normalize(T)
    topics = []
    for t in range(best_k):
        m = topic_lab == t
        cen = np.asarray(T[m].mean(axis=0)).ravel()
        terms = vocab[np.argsort(-cen)[:8]].tolist()
        fish_rate = np.mean([companies[co_names[text_idx[i]]]["fish_label"] == "fishing" for i in np.where(m)[0]])
        topics.append({"topic": int(t), "size": int(m.sum()), "top_terms": terms, "fishing_rate": r(fish_rate)})
    topic_of = {co_names[text_idx[i]]: int(topic_lab[i]) for i in range(len(text_idx))}

    # =========================================================== Q2 company similarity clustering
    STRUCT = ["log_owners", "log_contacts", "log_revenue", "revenue_missing", "product_unknown",
              "n_countries", "dup_records", "unregistered", "generic_name", "owner_reuse", "fish_core"]
    deg_bo = {c: 0 for c in companies}
    deg_cc = {c: 0 for c in companies}
    owner_reuse = {c: 0 for c in companies}
    for (c, p), t in edges.items():
        if BO in t:
            deg_bo[c] += 1
        if CC in t:
            deg_cc[c] += 1
    for c in companies:
        nbrs = list(G.neighbors("C|" + c))
        owner_reuse[c] = max([pprof[n[2:]]["n_companies"] - 1 for n in nbrs], default=0)
    S = []
    for c in co_names:
        co = companies[c]
        S.append([
            math.log1p(deg_bo[c]), math.log1p(deg_cc[c]),
            math.log10(co["revenue"]) if co["revenue"] else 0.0,
            float(co["revenue"] is None), float(co["product_unknown"]),
            float(len(co["countries"])), float(co["n_records"] > 1), float(not co["registered"]),
            float(co["generic_name"]), math.log1p(owner_reuse[c]), float(co["fish_label"] == "fishing"),
        ])
    S = np.array(S)
    S_mu, S_sd = S.mean(0), S.std(0)
    S_sd[S_sd < 1e-9] = 1
    Sz = (S - S_mu) / S_sd
    Tfull = np.zeros((len(co_names), Ts.shape[1]))
    Tfull[text_idx] = Ts
    W_TEXT, W_STRUCT = 0.6, 0.4
    H = np.hstack([W_TEXT * Tfull, W_STRUCT * normalize(Sz)])
    samp2 = rng.choice(len(H), size=min(4000, len(H)), replace=False)
    best_k2, best_s2, sil_curve = None, -1, {}
    for k in range(6, 19, 2):
        km = KMeans(n_clusters=k, n_init=5, random_state=SEED).fit(H)
        s = silhouette_score(H[samp2], km.labels_[samp2])
        sil_curve[k] = s
        if s > best_s2:
            best_k2, best_s2 = k, s
    km2 = KMeans(n_clusters=best_k2, n_init=10, random_state=SEED).fit(H)
    lab2 = km2.labels_
    sil_s = silhouette_samples(H[samp2], lab2[samp2])
    sil_by_idx = dict(zip(samp2.tolist(), sil_s.tolist()))
    Hn = normalize(H)
    cent_n = normalize(km2.cluster_centers_)
    cos_to_cent = np.einsum("ij,ij->i", Hn, cent_n[lab2])
    # 2nd-nearest centroid margin -> membership confidence for all points
    dists = km2.transform(H)
    sd_ = np.sort(dists, axis=1)
    margin = (sd_[:, 1] - sd_[:, 0]) / (sd_[:, 1] + 1e-9)

    clusters = []
    for k in range(best_k2):
        m = lab2 == k
        mi = np.where(m)[0]
        tmask = m[text_idx]
        if tmask.sum():
            cen = np.asarray(T[tmask].mean(axis=0)).ravel()
            terms = vocab[np.argsort(-cen)[:8]].tolist()
        else:
            terms = []
        zc = Sz[m].mean(0)
        feats = sorted([(STRUCT[j], float(zc[j])) for j in range(len(STRUCT))], key=lambda x: -abs(x[1]))[:4]
        sils = [sil_by_idx[i] for i in mi if i in sil_by_idx]
        # pairwise cosine within (sample)
        ss = mi if len(mi) <= 400 else rng.choice(mi, 400, replace=False)
        P = Hn[ss] @ Hn[ss].T
        within = (P.sum() - len(ss)) / max(len(ss) * (len(ss) - 1), 1)
        fish_rate = float(np.mean([companies[co_names[i]]["fish_label"] == "fishing" for i in mi]))
        unk_rate = float(np.mean([companies[co_names[i]]["product_unknown"] for i in mi]))
        mean_sil = float(np.mean(sils)) if sils else None
        conf = "High" if (mean_sil or 0) >= 0.35 else "Medium" if (mean_sil or 0) >= 0.15 else "Low"
        # label
        if unk_rate > 0.8:
            base = "Unknown-product"
        elif terms:
            base = " / ".join(terms[:3])
        else:
            base = "mixed"
        sig = [f"{'high' if v > 0 else 'low'} {n}" for n, v in feats[:2]]
        top_members = sorted(mi, key=lambda i: -cos_to_cent[i])[:12]
        clusters.append({
            "cluster": int(k), "label": f"{base} ({', '.join(sig)})", "size": int(m.sum()),
            "top_terms": terms,
            "key_features": [{"feature": n, "mean_z": r(v, 2)} for n, v in feats],
            "fishing_rate": r(fish_rate), "unknown_product_rate": r(unk_rate),
            "mean_silhouette": r(mean_sil), "within_cosine": r(within), "confidence": conf,
            "members_sample": [{"name": co_names[i], "cos_to_centroid": r(cos_to_cent[i]),
                                "countries": companies[co_names[i]]["countries"],
                                "product": (companies[co_names[i]]["product"] or "Unknown")[:140]} for i in top_members],
        })

    # 2-D embedding of a stratified sample
    emb_n = 3000
    emb_idx = []
    for k in range(best_k2):
        mi = np.where(lab2 == k)[0]
        take = max(20, int(round(emb_n * len(mi) / len(H))))
        emb_idx.extend(rng.choice(mi, size=min(take, len(mi)), replace=False).tolist())
    emb_idx = np.array(sorted(set(emb_idx)))
    pre = TruncatedSVD(n_components=30, random_state=SEED).fit_transform(H[emb_idx])
    XY = TSNE(n_components=2, perplexity=35, init="pca", random_state=SEED).fit_transform(pre)
    XY = (XY - XY.min(0)) / (XY.max(0) - XY.min(0))
    company_unit = {}
    for u in units:
        for n in u["nodes"]:
            if n.startswith("C|"):
                company_unit[n[2:]] = u["id"]
    emb_points = {
        "columns": ["name", "x", "y", "cluster", "confidence", "fish_label", "topic", "group"],
        "rows": [[co_names[i], r(XY[j, 0]), r(XY[j, 1]), int(lab2[i]), r(margin[i]),
                  companies[co_names[i]]["fish_label"], topic_of.get(co_names[i]),
                  company_unit.get(co_names[i])] for j, i in enumerate(emb_idx)],
    }
    cluster_of = {co_names[i]: int(lab2[i]) for i in range(len(co_names))}

    # =========================================================== outputs
    unit_by_id = {u["id"]: u for u in units}

    def unit_cluster_mix(u):
        cs = Counter(cluster_of[n[2:]] for n in u["nodes"] if n.startswith("C|"))
        tot = sum(cs.values()) or 1
        return [{"cluster": k, "share": r(v / tot)} for k, v in cs.most_common(3)]

    # groups_overview (columnar)
    cols = ["id", "parent", "n_nodes", "n_companies", "n_persons", "n_countries", "revenue_total",
            "unknown_product_share", "fish_share", "max_owners_per_company", "max_companies_per_person",
            "cross_border_owners", "shell_like_companies", "anomaly_pct", "investigate_score", "flags"]
    rows = []
    for u in units:
        f = u["f"]
        rows.append([u["id"], u["parent"], f["n_nodes"], f["n_companies"], f["n_persons"], f["n_countries"],
                     r(f["revenue_total"], 0), r(f["unknown_product_share"], 2), r(f["fish_share"], 2),
                     f["max_owners_per_company"], f["max_companies_per_person"], f["cross_border_owners"],
                     f["shell_like_companies"], r(u["anomaly_pct"], 3), r(u.get("investigate_score"), 3),
                     [k for k, _ in u["flags"]]])
    groups_overview = {
        "component_size_histogram": [{"size": s, "count": c} for s, c in sorted(size_hist.items())],
        "giant_component": {
            "id": comp_meta[0][0], "n_nodes": len(giant),
            "n_companies": sum(1 for n in giant if n.startswith("C|")),
            "n_persons": sum(1 for n in giant if n.startswith("P|")),
            "louvain_parts": len(giant_parts), "modularity": r(modularity), "cut_edges": cut_edges,
            "person_articulation_points": len(giant_person_bridges),
            "articulation_points": len(giant_art),
            "name_collision_robustness": robust,
        },
        "feature_medians": {k: r(v) for k, v in med_raw.items()},
        "units": {"columns": cols, "rows": rows},
    }

    # anomalies: top 30 by anomaly_pct (ties broken by iso_raw)
    top = sorted(scored, key=lambda u: -u["iso_raw"])[:30]

    def subgraph_payload(u, cap=260):
        ns = list(u["nodes"])
        if len(ns) > cap:  # keep highest-degree nodes + their links
            ns = sorted(ns, key=lambda n: -G.degree(n))[:cap]
        nsset = set(ns)
        out_nodes = []
        for n in ns:
            if n.startswith("C|"):
                c = companies[n[2:]]
                out_nodes.append({"id": n, "label": n[2:], "kind": "company", "countries": c["countries"],
                                  "revenue": r(c["revenue"], 0), "fish_label": c["fish_label"],
                                  "product": (c["product"] or "Unknown")[:160], "n_records": c["n_records"],
                                  "registered": c["registered"], "cluster": cluster_of[n[2:]],
                                  "degree": G.degree(n)})
            else:
                p = pprof[n[2:]]
                out_nodes.append({"id": n, "label": n[2:], "kind": "person", "n_companies": p["n_companies"],
                                  "owner_of": len(p["bo"]), "contact_of": len(p["cc"]), "degree": G.degree(n)})
        out_links = []
        for a, b, e in G.subgraph(nsset).edges(data=True):
            s, t = (a, b) if a.startswith("C|") else (b, a)
            typ = "both" if e["bo"] and e["cc"] else ("owner" if e["bo"] else "contact")
            out_links.append({"source": s, "target": t, "type": typ})
        return out_nodes, out_links, len(ns) < len(u["nodes"])

    anomalies = []
    for rank, u in enumerate(top, 1):
        nds, lks, trunc = subgraph_payload(u)
        anomalies.append({
            "rank": rank, "id": u["id"], "parent": u["parent"], "anomaly_pct": r(u["anomaly_pct"], 4),
            "iso_score": r(u["iso_raw"], 4), "investigate_score": r(u["investigate_score"], 3),
            "features": {k: (r(v) if not isinstance(v, list) else v) for k, v in u["f"].items()},
            "reasons": reasons(u), "flags": [{"flag": k, "text": t} for k, t in u["flags"]],
            "similar_groups": similar_groups(u["id"]), "cluster_mix": unit_cluster_mix(u),
            "truncated": trunc, "nodes": nds, "links": lks,
        })

    # owners_top
    SUFFIX = {"MD", "DDS", "PhD", "DVM", "Jr.", "Sr.", "II", "III", "IV", "V", "Jr", "Sr"}

    def surname(p):
        toks = [t for t in p.split() if t not in SUFFIX]
        return toks[-1] if toks else p
    sur_freq = Counter(surname(p) for p in persons)
    full_freq_first = Counter(p.split()[0] for p in persons if p.split())
    sur_rank = {s: i for i, (s, _) in enumerate(sur_freq.most_common())}
    persons_sorted = sorted(pprof.items(), key=lambda kv: (-kv[1]["n_companies"], -len(kv[1]["bo"])))
    owners_top = []
    for p, pr in persons_sorted[:60]:
        cos_all = sorted(set(pr["bo"]) | set(pr["cc"]))
        owners_top.append({
            "person": p, "n_companies": pr["n_companies"], "owner_of": len(set(pr["bo"])),
            "contact_of": len(set(pr["cc"])), "countries": pr["countries"],
            "group": company_unit.get(cos_all[0]) if cos_all else None,
            "common_surname": pr["common_name"],
            "name_collision_risk": "High" if sur_rank.get(surname(p), 999) < 15 else "Medium" if sur_rank.get(surname(p), 999) < 60 else "Low",
            "surname_frequency": sur_freq[surname(p)],
            "companies": [{"name": c, "role": ("both" if c in pr["bo"] and c in pr["cc"] else "owner" if c in pr["bo"] else "contact"),
                           "countries": companies[c]["countries"], "fish_label": companies[c]["fish_label"],
                           "revenue": r(companies[c]["revenue"], 0), "registered": companies[c]["registered"]}
                          for c in cos_all],
        })
    owner_hist = Counter(min(len(set(pr["bo"])), 10) for pr in pprof.values() if pr["bo"])
    co_owner_sorted = sorted(companies, key=lambda c: -deg_bo[c])[:40]
    companies_top_owners = [{
        "company": c, "n_owners": deg_bo[c], "n_contacts": deg_cc[c], "countries": companies[c]["countries"],
        "revenue": r(companies[c]["revenue"], 0), "fish_label": companies[c]["fish_label"],
        "product": (companies[c]["product"] or "Unknown")[:140], "registered": companies[c]["registered"],
        "group": company_unit.get(c),
        "owners_with_other_companies": sum(1 for n in G.neighbors("C|" + c) if pprof[n[2:]]["n_companies"] > 1),
    } for c in co_owner_sorted]
    owners_per_company_hist = Counter(min(deg_bo[c], 30) for c in companies)

    # investigate
    inv = sorted(scored, key=lambda u: -u["investigate_score"])[:25]
    investigate = []
    for rank, u in enumerate(inv, 1):
        f = u["f"]
        strong = u["anomaly_pct"] >= 0.98 and len(u["flags"]) >= 2 and u["iuu_relevance"] >= 0.3
        medium = u["anomaly_pct"] >= 0.95 and len(u["flags"]) >= 1
        conf = "High" if strong else "Medium" if medium else "Low"
        key_cos = sorted([n[2:] for n in u["nodes"] if n.startswith("C|")], key=lambda c: -G.degree("C|" + c))[:5]
        investigate.append({
            "rank": rank, "id": u["id"], "parent": u["parent"], "investigate_score": r(u["investigate_score"], 3),
            "anomaly_pct": r(u["anomaly_pct"], 4), "flag_score": r(u["flag_score"], 2),
            "iuu_relevance": r(u["iuu_relevance"], 2), "confidence": conf,
            "n_companies": f["n_companies"], "n_persons": f["n_persons"], "countries": f["top_countries"],
            "fish_share": r(f["fish_share"], 2), "revenue_total": r(f["revenue_total"], 0),
            "key_companies": key_cos,
            "evidence": [t for _, t in u["flags"]] + [f"{x['label']}: {x['value']} vs median {x['median']}" for x in reasons(u, 3)],
            "in_anomalies": any(a["id"] == u["id"] for a in anomalies),
        })

    # meta
    fish_counts = Counter(c["fish_label"] for c in companies.values())
    meta = {
        "source": "VAST Challenge 2023 MC3 (MC3.json)",
        "raw": {"nodes": len(nodes), "links": len(links),
                "node_types": dict(Counter(first(n["type"]) for n in nodes)),
                "link_types": dict(Counter(first(l["type"]) for l in links))},
        "cleaning": {**clean_stats,
                     "company_entities": len(companies),
                     "registered_companies": sum(c["registered"] for c in companies.values()),
                     "linked_companies": len({c for c, _ in edges}),
                     "unregistered_linked_companies": sum(1 for c in companies.values() if not c["registered"]),
                     "persons": len(persons), "edges": len(edges),
                     "edges_owner": sum(1 for t in edges.values() if BO in t),
                     "edges_contact": sum(1 for t in edges.values() if CC in t),
                     "generic_name_companies": sum(c["generic_name"] for c in companies.values()),
                     "generic_name_country_ZH_share": r(np.mean(["ZH" in c["countries"] for c in companies.values() if c["generic_name"] and c["countries"]]))},
        "components": {"n": len(comps), "isolated_companies": sum(1 for c in comps if len(c) == 1),
                       "giant_size": len(giant), "size2": size_hist.get(2, 0),
                       "analysis_units": len(units), "scored_units": len(scored)},
        "products": {"fish_label_counts": dict(fish_counts),
                     "informative_texts": int(has_text.sum()),
                     "topic_k": best_k, "topic_silhouette_cosine": r(best_s),
                     "topic_silhouette_curve": {str(k): r(v) for k, v in topic_sil.items()}, "topics": topics},
        "similarity": {"k": best_k2, "silhouette": r(best_s2), "silhouette_curve": {str(k): r(v) for k, v in sil_curve.items()},
                       "weights": {"text": W_TEXT, "structure": W_STRUCT}, "structural_features": STRUCT},
        "anomaly_model": {"method": "IsolationForest(n_estimators=400) on log/ratio group features + robust z (median/MAD) for explanations",
                          "features": [k for k, _ in FEATS], "units_scored": len(scored), "min_nodes": 3},
        "persons": {"owners_by_companies_owned": {str(k): v for k, v in sorted(owner_hist.items())},
                    "owners_per_company_hist": {str(k): v for k, v in sorted(owners_per_company_hist.items())},
                    "top_surnames": sur_freq.most_common(10), "top_first_names": full_freq_first.most_common(5),
                    "giant_person_bridges_sample": giant_person_bridges[:20]},
        "investigate_confidence_counts": dict(Counter(x["confidence"] for x in investigate)),
    }

    sizes = {}
    sizes["meta.json"] = dump("meta.json", meta)
    sizes["groups_overview.json"] = dump("groups_overview.json", groups_overview)
    sizes["anomalies.json"] = dump("anomalies.json", {"anomalies": anomalies})
    sizes["clusters.json"] = dump("clusters.json", {"k": best_k2, "silhouette": r(best_s2),
                                                     "silhouette_curve": {str(k): r(v) for k, v in sil_curve.items()},
                                                     "clusters": clusters, "topics": topics, "embedding": emb_points})
    sizes["owners_top.json"] = dump("owners_top.json", {"persons": owners_top, "companies_most_owners": companies_top_owners})
    sizes["investigate.json"] = dump("investigate.json", {"weights": {"anomaly_pct": 0.45, "flag_score": 0.30, "iuu_relevance": 0.25},
                                                           "groups": investigate})
    for k, v in sizes.items():
        print(f"{k:24s} {v / 1024:8.1f} KB")
    print(f"total {sum(sizes.values()) / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
