"""Bake app/public/data/summary.json: the home page's verdict hoist.

Reads the three challenge outputs and hoists the strongest finding(s) from
each. Run after mc1/mc2/mc3 builds (pipeline/build_all.py does this).
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "app/public/data"

VERDICT_RANK = {"Suspect": 0, "Possible": 1, "Insufficient evidence": 2, "Unlikely": 3}
CONF_RANK = {"High": 0, "Medium": 1, "Low": 2}


def load(path):
    return json.loads((DATA / path).read_text())


def strength(v, c):
    return (VERDICT_RANK.get(v, 9), CONF_RANK.get(c, 9))


def main():
    hoist = []

    # MC1: the suspects judged Suspect, strongest first.
    mc1 = load("mc1/suspects.json")["suspects"]
    for s in sorted(mc1, key=lambda s: (*strength(s["verdict"], s["confidence"]), s["label"])):
        if s["verdict"] == "Suspect":
            hoist.append({
                "name": s["label"], "mc": "MC1", "verdict": s["verdict"],
                "confidence": s["confidence"], "note": "Tip entity", "href": "/mc1",
            })

    # MC2: the most certain predecessor → successor handover.
    pairs = load("mc2/suspects.json")["pairs"]
    best = min(pairs, key=lambda p: (*strength(p["verdict"], p["confidence"]), p["rank"]))
    hoist.append({
        "name": f"{best['predecessor']} → {best['successor']}", "mc": "MC2",
        "verdict": best["verdict"], "confidence": best["confidence"],
        "note": f"{best['role'].capitalize()} renamed {best['stop_month']} → {best['start_month']}",
        "href": "/mc2",
    })

    # MC3: the top-ranked business group to investigate.
    g = load("mc3/investigate.json")["groups"][0]
    lead = g["key_companies"][0] if g.get("key_companies") else g["id"]
    hoist.append({
        "name": f"{lead} group", "mc": "MC3", "verdict": g["verdict"],
        "confidence": g["confidence"], "note": f"{g['n_companies']} companies, {g['n_persons']} people",
        "href": "/mc3",
    })

    n_pairs_suspect = sum(p["verdict"] == "Suspect" for p in pairs)
    bundles = load("mc2/bundles.json")["bundles"]
    n_reliable = sum(b["verdict"] == "Reliable" for b in bundles)
    words = {i: w for i, w in enumerate("zero one two three four five six seven eight nine ten eleven twelve".split())}
    groups = load("mc3/investigate.json")
    summary = {
        "hoist": hoist,
        "challenges": [
            {"mc": "MC1", "headline": "Of 11,069 relations, 88 weak links form a 79-node layer that random edges never produce. Three of the four tipped entities sit inside it."},
            {"mc": "MC2", "headline": f"{words.get(n_reliable, n_reliable).capitalize()} of {words.get(len(bundles), len(bundles))} AI-predicted link bundles hold up against the real trade records. {n_pairs_suspect} company pairs look like a business shutting down and reopening under a new name."},
            {"mc": "MC3", "headline": f"The register's giant network is mostly people who happen to share common names. The real anomalies are small fishing-named groups with shared owners; {groups['verdict_counts'].get('Suspect', 0)} are flagged Suspect."},
        ],
    }
    (DATA / "summary.json").write_text(json.dumps(summary, indent=1, ensure_ascii=False, sort_keys=True))
    print(f"summary.json: {len(hoist)} hoisted findings")


if __name__ == "__main__":
    main()
