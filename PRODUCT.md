# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite + React + D3, built as a static site. A Python pipeline (`pipeline/`) reads the raw VAST data and bakes compact JSON into `app/public/data/`, so the browser never loads the 1.5 GB MC2 graph. The deploy target is undecided; any static host works.

## Users

The primary audience is portfolio visitors: recruiters, hiring managers, and peers in data visualization or visual analytics. They arrive from a link and have a few minutes. They want to see how the author reasons with messy graph data and builds bespoke visual analytics. VAST Challenge reviewers and visual-analytics practitioners are a secondary audience. They know the challenge and judge whether each answer is backed by evidence.

## Product Purpose

The site is a complete, interactive response to the IEEE VAST Challenge 2023 (the Oceanus / FishEye International scenario about illegal, unreported, and unregulated fishing). It covers MC1 (contextualizing an NLP-extracted knowledge graph around four suspect entities), MC2 (temporal trade patterns, judging 12 AI-suggested link bundles, and flagging suspicious companies), and MC3 (anomalous business structures and grouping similar businesses). The site succeeds if a visitor leaves understanding the findings and believing they came from the data, and if a VAST reviewer can trace every answer back to a view.

## Positioning

Every claim sits beside the interactive view that produced it, computed from the real challenge data. The site is not a static report with screenshots, and it is not a generic graph explorer with no conclusions.

## Operating Context

The site is read on a desktop browser after a click from a portfolio or a résumé, and on phones as a fallback. Each mini-challenge's question list sets its structure: Q1…Qn, word and image limits, and a confidence level on findings.

## Capabilities and Constraints

- The data comes only from the VAST 2023 MC1/MC2/MC3 datasets. The challenge discourages external data.
- The raw data is not committed to the public repo. `scripts/fetch_data.sh` re-downloads it from a public mirror.
- Entity names are fictional, and some contain unresolved unicode. Show them as they appear in the data.
- Findings must state confidence and uncertainty, as the challenge requires.

## Evidence on Hand

- `data/raw/mc1/MC1.json`: 3,428 nodes and 11,069 links, plus the data notes.
- `data/raw/mc2/`: 34k nodes, 5.46M shipment edges, and 12 predicted-link bundles.
- `data/raw/mc3/MC3.json`: 27,622 nodes and 24,038 links.
- There are no testimonials or official results. Do not imply the work won an award or was an official submission.

## Product Principles

1. Claims stay next to their evidence.
2. Every finding states its confidence.
3. Show the reasoning path, not just the answer.
4. The site must stay fast: precompute heavy work and ship small payloads.
