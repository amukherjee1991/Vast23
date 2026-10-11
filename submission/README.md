# Signal Hoist: VAST Challenge 2023 submission

**Entry Name:** Signal Hoist

This folder holds a written report and answer sheets in the VAST Challenge 2023 submission format, covering the three mini-challenges of the Oceanus / FishEye International scenario (illegal, unreported and unregulated fishing). It is an independent portfolio response written after the challenge, not an official 2023 entry.

- **Live interactive site:** <https://amukherjee1991.github.io/Vast23/>
- **Repository:** <https://github.com/amukherjee1991/Vast23>
- **Combined PDF:** [VAST2023-Signal-Hoist.pdf](VAST2023-Signal-Hoist.pdf) (the report, then the three answer sheets)

## Contents

| File | What it is |
|---|---|
| [REPORT.md](REPORT.md) | One combined narrative report: approach, data and pipeline, MC1–MC3 findings with figures, verdict summary tables, validation, limits and reflection. Not bound by the per-question limits. |
| [MC1.md](MC1.md) | Answer sheet: contextualising an NLP-extracted knowledge graph around four suspect entities (Q1–Q4) |
| [MC2.md](MC2.md) | Answer sheet: temporal trade patterns, judging 12 predicted-link bundles, companies that restart under new names (Q1–Q5) |
| [MC3.md](MC3.md) | Answer sheet: anomalous business groups, grouping similar businesses, an investigation list (Q1–Q5) |
| [images/](images/) | Figures for the sheets and the report |
| `build_pdf.sh`, `build_pdf.py` | Rebuilds the PDF: `submission/build_pdf.sh` |
| `check_limits.py` | Counts words and images per answer against the official limits |

## Answer sheets

Each answer keeps the official question text and stays within the challenge's word and image limits, figure captions included (run `python3 submission/check_limits.py`). It states a confidence level for every finding and cites its figures inline: Figure 1.3 is the third figure in Question 1's answer.

The figures are screenshots of the live site in its night-sea design, taken at 1440 × 900 and 2× pixel density by [`scripts/capture_screenshots.mjs`](../scripts/capture_screenshots.mjs). Two kinds appear:

- **Story steps** are full-viewport captures of a chapter's scroll story, taken after its stage has finished animating.
- **Evidence views** are element captures of the interactive charts in the question sections.

The numbers come from the analysis pipelines in `pipeline/` and the findings in `findings/`.

## Rebuilding

```bash
# 1. with the dev server on http://127.0.0.1:5174
node scripts/capture_screenshots.mjs          # refreshes docs/screenshots/ and submission/images/
# 2. render the PDF (uses .venv's `markdown` and the app's Playwright)
submission/build_pdf.sh
```

## To complete before submitting

The answer sheets and the report contain placeholders for the author to fill:

- `[Name]` and `[Affiliation]`: the team member's name and affiliation.
- `[AUTHOR TO FILL: hours]`: the hours spent.
- `[AUTHOR TO FILL: Yes / No]`: permission to post in the Visual Analytics Benchmark Repository.
