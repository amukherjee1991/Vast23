# Vast23 plan

This project is an interactive response to the [IEEE VAST Challenge 2023](https://vast-challenge.github.io/2023/overview.html), built as a portfolio piece. The scenario is the fictional island nation of Oceanus and the NGO FishEye International, which investigates illegal, unreported and unregulated (IUU) fishing.

**Status: paused on 2026-10-10. Work resumes the following week.**

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

## Next steps

1. **Analysis.** Rerun the MC1, MC2 and MC3 analysis. The earlier runs were stopped partway, so their output in `app/public/data/mc*/` is unverified. Each MC should produce:
   - `pipeline/mcN_build.py`
   - JSON in `app/public/data/mcN/`
   - `findings/mcN.md`: answers within the word limits, each with a confidence level
   - `docs/data-contracts/mcN.md`: the JSON schemas and the recommended views
   - Known issue: Louvain community detection gives different results between runs in MC3, so the node insertion order has to be sorted
2. **Orchestration.** `pipeline/build_all.py` (`npm run data`) runs the three pipelines, then `build_summary.py` writes `app/public/data/summary.json`, which feeds the home page.
3. **Challenge pages.** Build one page per question, with the claims linked to their evidence views:
   - MC1: ego networks around each suspect, a comparison of the suspects, and a ranked list of other candidates
   - MC2: timelines, the taxonomy of relationship patterns, a scorecard for the 12 link bundles, and pairs of companies that disappear and reappear under new names
   - MC3: anomalies in business groups, clusters of similar businesses with confidence shown, and a ranked investigation list
   - Method page: the pipeline, the data caveats, and the reflections
4. **Quality.** Before shipping, finish these checks:
   - Check the `ScrollToTop` crash fix in the browser.
   - Run `impeccable detect.mjs`.
   - Take desktop and mobile screenshots.
   - Run the finish reviewer.
   - Run the documenter, which writes `DESIGN.md`.
   - Check accessibility: keyboard use, contrast, and table views.
5. **Deploy.** Add a GitHub Actions workflow that builds with `setup-node` 24 and deploys to Pages.
6. **Submission.** Do issue #1: a VAST answer-sheet document in `submission/`, linked from the README and the Method page.
7. **Release.** Write the README and tag **v0.0.1**.

## Notes

- Port 5173 is used by a local Docker app, so Vite runs on 5174.
- Commits are authored by the repo owner, without AI attribution.
