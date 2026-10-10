# MC2 findings: trade patterns, predicted links, and companies that restart under new names

All numbers come from `pipeline/mc2_build.py`, which writes the JSON in `app/public/data/mc2/`. Each claim names the file and field that backs it. The analysis uses only the MC2 graph and its 12 bundles.

**Data preparation** (`meta.json`). The graph has 5,464,378 edges. Of those, 155,291 (2.8%) exactly duplicate another edge, and we drop them as double-recorded shipments, leaving 5,309,087. There are 34,576 companies, 245,807 shipper→receiver pairs, and 84 months (2028-01 to 2034-12). HS codes for chapters 01–09 lost their leading zero, so 306170 is 0306.17 (frozen shrimp). "Fish" means HS headings 0301–0309 plus 1604/1605: 13.9% of edges. In the bundles, chapter 01–09 codes are stored with 5 digits (30729). Appending a "0" matches the graph's codes 100% of the time. Without that fix, every chapter-03 link in the bundles would be misread.

---

## Q1: Temporal patterns (about 545 words)

**The market as a whole** (`timeline_overview.json`). Yearly volume peaks in 2030 at 831k shipments and falls to 688k in 2034. Fish volume holds steady at about 96k–116k a year, so the fish share rises from 12.7% (2028) to 15.6% (2034) (`fish_share`). Fish is mildly seasonal. The calendar index is 0.84–0.89 in Feb–Apr and 1.05–1.08 in Jul–Dec. For all goods it is 0.91–1.09 (`calendar_profile`).

**Individual companies** (`companies_top.json`). The two roles behave very differently:

- **Shippers are durable.** Their median span is 59 months, and 4,875 of 12,217 are active for 73–84 months.
- **Receivers are mostly fleeting.** Their median span is 3 months, and 44% appear in a single month (`lifespan_histogram`).
- **Fish shippers churn more.** Among fish-majority shippers, 2,139 of 4,299 are *transient* (they appear after the start of the data and disappear before its end). Among all shippers the figure is 4,740 of 12,217 (`lifecycle_counts_fish_majority`).

The 150 per-company series (`companies[].monthly`) show flat persistent hubs, step-ups, step-downs and bursts.

**Relationships between companies** (`patterns.json`). We classify every pair's monthly series by span, coverage, trend (second half vs first half), seasonality (share of trade in the best 3 calendar months), and how strongly it ends. The rules apply in order:

| Pattern | Pairs | Share of shipments | Signature |
|---|---|---|---|
| One-off | 108,067 (44%) | 2.6% | a single month |
| Intermittent | 60,968 | 14.5% | recurring but irregular |
| Short burst | 31,604 | 3.0% | ≤ 6 months, then nothing |
| Fading | 16,729 | 21.9% | second half ≤ ½ of the first |
| Ramping | 13,385 | 16.0% | second half ≥ 2× the first |
| Abrupt stop | 5,994 | 8.3% | regular trade that stops at full strength ≥ 12 months before the data ends |
| Steady | 4,634 (1.9%) | 32.6% | ≥ 24 months, ≥ 60% of months active |
| Seasonal | 4,426 | 1.2% | ≥ 75% of trade in the same 3 calendar months |

The trade network is a small core of steady pairs that carry a third of all shipments, surrounded by a large fringe of one-off links. Only 737 pairs trade in both directions (`reciprocal_pairs`), so relationships run one way. Fish pairs follow almost the same mix (`fish_vs_all_share`). Abrupt stops are slightly *rarer* among fish pairs (1.7% vs 2.4%), so an abrupt stop on its own is not a sign of illegal fishing.

As a cross-check, k-means clustering (k = 8) on 101,115 recurring pairs agrees with the rules at a weighted purity of 0.57 (`kmeans_check`). Steady, fading and ramping separate cleanly; the catch-all "intermittent" does not.

**Between entities: successors** (`suspects.json → gap_profile`). We took company pairs with very similar partner and product profiles (partner and HS cosine ≥ 0.7, ≥ 3 shared partners) and counted them by the gap between the earlier company's last month and the later company's first month:

- **Twins.** Most such pairs *coexisted* for 12–36 months: 31 shipper pairs fall in −36..−6. These are parallel or sister firms, not replacements.
- **Restarts.** There is a second, narrower peak at gaps of 0–6 months: 1.7 pairs per gap-month, against 0.3 in the −6..0 window just before.

That excess is the signature of a company stopping and a look-alike starting straight afterwards. It is real but small, so successor pairs are rare and specific, not a market-wide pattern.

**Confidence:** High for the aggregate patterns, because they are counts over the full graph. The category boundaries are analyst choices, documented in `patterns.json → categories[].definition`.

---

## Q2: Reliability of the predicted-link bundles (about 480 words)

`bundles.json` scores every bundle against the real graph on 11 components, each 0–1 (`component_definitions`). They cover repetition, novelty, schema, dates, month mix, pair and product history, HS mix, concentration, weight, value per kg, and node countries. Distribution tests compare the bundle with **200 same-size random samples of real 2034 edges**, so small bundles are not punished for noise. Gates override the score:

- **Critical gates force "Unreliable":** under 25% of links are distinct, fewer than 20 distinct links, or over 95% exact copies of graph edges.
- **Major gates cap the verdict at "Questionable":** under 50% of links carry a weight, or over 5% fall outside the graph's date window.

**Novelty is two-sided.** An exact match with a real edge (same shipper, receiver, HS code and day) is almost impossible by chance. Some matches show a bundle is anchored to real records; all matches mean it adds nothing. The five diverse bundles independently converge on 42–59% matches.

| Bundle | Score | Verdict | Decisive evidence |
|---|---|---|---|
| carp | 0.99 | **Reliable** | 165 distinct links, 44% anchored, value bias +0.09 dex, 95% country match |
| herring | 0.95 | **Reliable** | clean; the month mix is slightly off (JSD 0.068 vs null p95 0.026) |
| chub_mackerel | 0.90 | **Reliable** | 52% of rows repeat, but the 155 distinct links pass every realism test |
| pollock | 0.88 | **Reliable** | 34% repeats, somewhat concentrated (top target 17%) |
| salmon_wgl | 0.87 | **Reliable** | 57% repeats; 92 distinct links are realistic |
| catfish | 0.56 | **Questionable** | no weight or volume at all, 8.7% of dates in 2035, only 49% country match, 8% anchored |
| mackerel | 0.52 | **Questionable** | the same problems; 32% of dates fall in 2035 |
| salmon | 0.78* | **Unreliable** | 132 links are 13 records (9.8% distinct) |
| cod2 | 0.75* | **Unreliable** | 193 links are **4** records; the top target "-53" never receives anything in the graph |
| shark | 0.62 | **Unreliable** | 19 distinct records, all exact copies of graph edges |
| lichen | 0.61 | **Unreliable** | 23 distinct records, all copies; value bias +0.26 dex |
| tuna | 0.34 | **Unreliable** | no weights, 0% anchored, 18% distinct, 22% country match, 33% of links to one receiver |

\*Gate overrides the score; on 4–13 distinct records the distribution tests have almost no power.

Three findings back the verdicts:

1. **Repetition separates the bundles most sharply** (`metrics.unique_rate`). Real data repeats 2.8% of records; the Unreliable bundles repeat 82–98%.
2. **Missing schema identifies the fabricated bundles.** catfish, mackerel and tuna have no weightkg (100% in the graph). They also disagree on node countries (22–49% vs 93–97%) and rarely match a real record.
3. **Prices.** Reliable bundles' OMU/kg sits within 0.12 dex of the graph's typical price per HS code; lichen and cod2 run high (`metrics.value_bias_dex`, `distributions.value_offset_dex`).

The bundles' pair sets barely overlap (Jaccard ≤ 0.05, `pair_overlap`), so corroboration across bundles is impossible.

**Confidence:** High for the five Unreliable bundles and for carp and herring. Medium for chub_mackerel, pollock and salmon_wgl (realistic distinct links, unexplained repetition) and for catfish and mackerel (weight and value unverifiable).

---

## Q3: What changes with the reliable links added (about 260 words)

From `bundle_impact.json`:

- **The links add little.** The five Reliable bundles contain 1,015 links. Only **347** are usable: distinct, not already in the graph, and inside the window. That is under 0.1% of 2034 volume (`monthly_2034_added`), and the 2034 fish share stays at 15.6%.
- **Pair patterns barely move.** 261 existing pairs gain links and 58 new pairs appear. Only 15 pairs change pattern, mostly one-off or short burst → intermittent, and fading or ramping → steady (`pair_patterns.transitions`, `examples`).
- **Three apparent stops are data gaps.** Predicted links keep three "stopped" companies trading (`revived_stoppers`): *Chhattisgarh Salt spray ОАО United* (receiver, 174 shipments; last real month 2034-03, predicted to 2034-11), *Bahía Azul Ltd Holdings* (shipper, 2034-05 → 2034-12) and *Okavango River S.A. de C.V. Solutions*. So stops late in 2034 are partly missing data. The successor detector requires 6 silent months, and it marks a pair "Unlikely" when predicted links revive the predecessor.
- **The flags are stable.** All 68 flagged successor pairs (8 Suspect, 60 Possible) keep their verdicts when we rerun detection on the augmented graph. They also survive adding the two Questionable bundles (701 links, `sensitivity_with_questionable.flagged_pairs_changed = []`). That robustness is the most useful result of Q3.
- **Hubs get richer.** Predicted links go mostly to existing hubs: *hǎi dǎn Corporation Wharf* (33), *Sailors and Surfers Incorporated Enterprises* and *Mar del Este CJSC* (11 each) (`top_targets_of_added_links`). The predictions make the core denser rather than revealing hidden companies.

**Confidence:** High that the impact is small. Medium on the revivals: three cases, each from a single bundle.

---

## Q4: Companies that fit the illegal-fishing pattern (about 255 words)

`suspects.json` matches 2,780 shippers and 3,888 receivers that stop ≥ 6 months before the data ends with companies starting −6..+12 months from the stop. Similarity is TF-IDF cosine plus Jaccard on partners and HS codes, so shared hubs count little. Extra evidence: whether shared partners switch over, and how much of the newcomer's trade they make up. Of 872 candidate pairs: 8 Suspect, 60 Possible, 572 Insufficient evidence, 232 Unlikely (`pair_counts`).

**Suspect pairs** (all trade fish on both sides):

| Predecessor → successor | Confidence | Evidence |
|---|---|---|
| receiver **-811 → -206** | High | fillets (0304); 2032-12 → 2033-01; 5 shared shippers supply 78% of -206's trade |
| **Beachcomber's Bounty S.A. de C.V. Express → Karelians Limited Liability Company International** | Medium | Karelians (from 2030-11) also succeeds **five more fish shippers** that stopped 2030-06..12 (Possible, `companies[].links`): consolidation under one new name |
| **Saltwater Surf Club Sp → Chhattisgarh GmbH & Co. KG Sea spray** | Medium | dried fish (0305) only; 2028-12 → 2029-02; all 3 shared partners switch |
| **Asveja Limited Liability Company → Marine Mavericks Marine biology** | Medium | molluscs (0307); 2032-07 → 2032-08; 95% of the successor's trade is inherited |
| receiver **-812 → -556** | Medium | prepared crustaceans (1605); 5 shared shippers |
| receiver **-513 → -690** | Medium | identical partner set |
| **The Salty Dog Corporation → Gulf of Guinea Sp** | Low | small predecessor (13 shipments) |
| **Estrella del Sol CJSC → Mandalore S.A. de C.V. Logistics** | Low | small predecessor (12 shipments) |

**Confidence:** Medium overall: only 3–5 shared partners per pair, no ground truth, and 24 high-similarity pairs proved *Unlikely* because partners did not switch over.

---

## Q5: Reflection (about 260 words)

**The data needed the most care.**

- **HS codes:** the two code formats would have silently zeroed out chapter-03 fish links in every bundle.
- **Duplicates:** 2.8% of graph edges are exact duplicates.
- **Values:** the graph's values are in USD, the bundles' in OMU, and only 281 graph edges carry OMU. We compared prices as per-HS-code offsets, using those 281 edges as the reference.
- **Names:** 22,004 company ids are bare negative numbers, so name similarity is useless as evidence.

**Null models changed the conclusions.** A first pass scored successors by raw cosine and rated catfish and mackerel "reliable". Weighting partners by rarity and comparing with same-size random samples of real 2034 edges reversed both. The gap profile showed that most look-alike companies coexist, so treating similarity alone as evidence of a restart would flood the list with false positives.

**Some evidence is ambiguous.** An exact copy of a real edge looked like a defect until five independent bundles each showed 42–59% exact matches. It is better read as evidence that a tool is anchored to real data.

**Limitations:**

- The scoring weights and thresholds are judgement calls. The components and gates are published so they can be challenged.
- Detection needs ≥ 2 shared partners, so very small companies cannot be judged.
- Stops near the end of 2034 cannot be told apart from missing data.

**Next steps:** compare against the MC1 and MC3 knowledge graphs (outside MC2 scope), and build interactive views where an analyst can confirm or reject each pair and see the scores update.
