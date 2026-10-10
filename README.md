# Signal Hoist: VAST Challenge 2023

An interactive visual-analytics response to the [IEEE VAST Challenge 2023](https://vast-challenge.github.io/2023/). The challenge is set in the fictional nation of Oceanus, where the NGO FishEye International investigates illegal, unreported and unregulated (IUU) fishing. The data comes as three knowledge graphs: news extractions, customs records, and a corporate register. Every finding sits beside the interactive evidence that produced it.

**Live site:** https://amukherjee1991.github.io/Vast23/

**VAST answer sheets:** [submission/](submission/) ([combined PDF](submission/VAST2023-Signal-Hoist.pdf))

| | Challenge | What the evidence shows |
|---|---|---|
| MC1 | Contextualise four tipped entities in a news-extracted graph | 88 low-weight links form a 79-node layer that random edges never produce (p = 0.001). Three of the four tips sit inside it. |
| MC2 | Find temporal patterns, judge 12 sets of AI-predicted links, flag suspicious companies | 5 of 12 link bundles hold up against the real trade records. 8 company pairs look like a firm shutting down and reopening under a new name. |
| MC3 | Find anomalous business structures in a corporate register | The 7,093-node "giant network" is mostly a common-name collision. The real anomalies are small fishing-named groups that share owners. |

Each verdict is hoisted as an International Code of Signals flag: **L** Suspect, **U** Possible, **X** Insufficient evidence, **N** Unlikely. Numeral pennants show confidence (one hoisted = low, three = high).

## Repository

```
app/          Vite + React + D3 site (static build, GitHub Pages)
pipeline/     Python pipelines that bake compact JSON into app/public/data/
findings/     Written answers to each challenge question
docs/         Plan and the JSON data contracts for each challenge
submission/   VAST answer-sheet version of the findings
scripts/      Data fetch
```

## Run it

Requires Node 24 and Python 3.12.

```bash
scripts/fetch_data.sh                               # downloads the challenge data into data/raw (not committed)
python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt
cd app && npm ci
npm run data                                        # rebuilds every dataset (~2 min)
npm run dev
```

The baked JSON is committed, so `npm ci && npm run dev` alone is enough to explore the site. The pipelines are deterministic: rebuilding gives byte-identical files.

## Notes

- Oceanus, FishEye and every entity named here are fictional and come from the challenge data. This is an independent response, not an official submission.
- The official data is distributed through a request form. `scripts/fetch_data.sh` pulls a public mirror of it.
- Verdicts come from written rubrics checked against null models. There is no ground truth, so every finding carries a confidence level.
- Design: [PRODUCT.md](PRODUCT.md) (product brief) and [DESIGN.md](DESIGN.md) (the visual system).
