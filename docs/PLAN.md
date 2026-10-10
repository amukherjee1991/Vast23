# Vast23 plan

This project is an interactive response to the [IEEE VAST Challenge 2023](https://vast-challenge.github.io/2023/overview.html), built as a portfolio piece. The scenario is the fictional island nation of Oceanus and the NGO FishEye International, which investigates illegal, unreported and unregulated (IUU) fishing.

**Status: v0.0.1 released on 2026-10-10.** Live at https://amukherjee1991.github.io/Vast23/

## Decisions

| Topic | Decision |
|---|---|
| Audience | Portfolio visitors first, VAST reviewers second (see `PRODUCT.md`) |
| Stack | Vite + React + D3 in `app/`. A Python pipeline in `pipeline/` bakes compact JSON into `app/public/data/` |
| Runtime | Node 24 (`.nvmrc`, `engines`) and Python 3.12 (`.venv`) |
| Data | Not committed. `scripts/fetch_data.sh` downloads it from a public mirror, because the official data is behind a request form |
| Visual world | "Signal Hoist": flags from the International Code of Signals, flat signal red, blue and yellow with ink on sail-white, and Archivo with its width axis. The direction contract is at the top of `app/index.html` |
| Verdict code | L = Suspect · U = Possible · X = Insufficient evidence · N = Unlikely. Numeral pennants 1–3 show confidence |
| Design skills | impeccable, ui-ux-pro-max, emil-design-eng, dataviz |
| Hosting | GitHub Pages (static build, `HashRouter`, `base: './'`) |

## Done

- [x] Repo created and pushed. Data fetch script written. MC2 graph converted to Parquet (`pipeline/mc2_to_parquet.py`)
- [x] `PRODUCT.md`
- [x] Design tokens and a categorical palette checked with the dataviz validator: blue, yellow, red, green, violet. Yellow marks always get an outline
- [x] UI kit: `Flag`, `VerdictTag`, `ConfidencePennants`, `Figure` (with a table view), `Tooltip`, `Halyard` section nav, `Question`, `ChallengeBand`
- [x] Home page: the verdict hoist, the three challenge routes, and the signal code
- [x] GitHub issue #1 (VAST submission document)

## Shipped in v0.0.1

- [x] MC1, MC2 and MC3 pipelines: deterministic, with findings and data contracts
- [x] Challenge pages with claim-driven evidence, the Method page and the home hoist
- [x] impeccable detector, an independent finish review (verdict: ship), and DESIGN.md
- [x] GitHub Pages deploy (Actions on Node 24)
- [x] VAST answer sheets in `submission/` (issue #1)

## Open

- Fill the author placeholders in `submission/MC*.md`: name, affiliation, hours, and repository permission.
- Check the "Tools and resources" paragraphs added to each reflection answer.

## Notes

- Port 5173 is used by a local Docker app, so Vite runs on 5174.
- Commits are authored by the repo owner, without AI attribution.
