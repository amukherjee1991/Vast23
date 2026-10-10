# MC2 data contract

`.venv/bin/python pipeline/mc2_build.py` (run from the repo root) builds every file below. It takes about 85 s, and two runs produce byte-identical output. Files go to `app/public/data/mc2/`, about 530 KB in total.

General rules:

- JSON is compact, and missing or undefined numbers are `null`; NaN and Infinity never appear.
- Floats are rounded to 4 significant digits, so a whole-number float is written as an integer (`1.0` becomes `1`).
- **Month index** `m` runs from 0 to 83 and maps to `meta.months[m]`, where 0 = `"2028-01"` and 83 = `"2034-12"`. Every 84-element series is indexed by month.
- **HS heading** `hs4` is a 4-character string with the chapter-03 leading zero restored (`"0304"`). "Fish" means headings 0301–0309 plus 1604 and 1605.
- **Company ids** are strings shown exactly as they appear in the data. 22,004 of them are bare negative numbers such as `"-811"`, which are anonymised receivers.
- **Verdicts** use exactly these values:
  - Bundles: `"Reliable" | "Questionable" | "Unreliable"`.
  - Successor pairs and companies: `"Suspect" | "Possible" | "Insufficient evidence" | "Unlikely"`.
  - Confidence: `"High" | "Medium" | "Low"`.
  - The verdict code in `PLAN.md` maps as follows: Suspect = L, Possible = U, Insufficient evidence = X, Unlikely = N.

| File | Size | Purpose |
|---|---|---|
| `meta.json` | 3 KB | dataset facts, data notes, headline numbers |
| `timeline_overview.json` | 9 KB | Q1 monthly totals, fish share, entries and exits, seasonality |
| `companies_top.json` | 196 KB | Q1 company lifespans and lifecycle counts, plus 150 company series |
| `patterns.json` | 21 KB | Q1 taxonomy of pair relationships, with exemplars |
| `bundles.json` | 36 KB | Q2 bundle metrics, scores, verdicts and comparison histograms |
| `bundle_impact.json` | 24 KB | Q3 effect of adding the reliable bundles |
| `suspects.json` | 248 KB | Q4 successor pairs and companies, with evidence timelines |

---

## meta.json

```ts
{
  challenge: string; months: string[84]; window: {start: "2028-01", end: "2034-12"};
  edges_raw: number; edges_deduplicated: number; exact_duplicates_removed: number;
  shippers: number; receivers: number; companies: number; both_roles: number;
  pairs: number; hscodes: number; fish_edges: number; fish_share: number;
  fish_definition: string; hscode_note: string; duplicates_note: string;
  headline: {
    bundle_verdicts: Record<BundleName, BundleVerdict>;
    reliable_links_added: number;
    successor_pairs: Record<PairVerdict, number>;
    suspect_companies: string[];          // ids whose verdict is "Suspect"
  };
  value_fields: {valueofgoodsusd_present: number; valueofgoods_omu_present: number; volumeteu_present: number};
  files: Record<string, number>;          // bytes per file, written before meta itself
  generated_by: string;
}
```
Example: `{"edges_raw":5464378,"edges_deduplicated":5309087,"fish_share":0.1393,"headline":{"bundle_verdicts":{"carp":"Reliable",...},"reliable_links_added":347,...}}`

## timeline_overview.json

```ts
{
  months: string[84];
  shipments, fish_shipments, weight_kg, fish_weight_kg: number[84];
  fish_share: number[84];                       // fish_shipments / shipments
  active_shippers, active_receivers, active_fish_shippers: number[84];  // distinct ids active that month
  shipper_entrants, shipper_exits, fish_shipper_entrants, fish_shipper_exits: number[84];
                                                // first and last month per shipper; month 0 and 83 are censored
  fish_mix_by_year: {years: number[7]; headings: {hs4: string; label: string; counts: number[7]}[]};
  top_hs_chapters: {chapter: string; shipments: number}[15];
  calendar_profile: {months: string[12]; all_index: number[12]; fish_index: number[12]};  // 1 = average month
  notes: string;
}
```
Example: `{"shipments":[60194,60523,...],"fish_share":[0.1274,0.1139,...],"calendar_profile":{"fish_index":[1.042,0.8945,...]}}`

## companies_top.json

```ts
{
  months: string[84];
  lifespan_histogram: {
    bins: number[11]; bin_labels: string[10];   // span in months: 1, 2-3, ... 73-84
    shipper, shipper_fish_majority, receiver, receiver_fish_majority: number[10];
    shipper_median_span, receiver_median_span, shipper_single_month_share, receiver_single_month_share: number;
  };
  lifecycle_counts, lifecycle_counts_fish_majority:
    Record<"shipper"|"receiver", Record<"persistent"|"entrant"|"exited"|"transient", number>>;
  lifecycle_definitions: Record<Lifecycle, string>;
  companies: {                                   // 150 rows: top 100 by volume plus top 50 fish shippers
    id: string; role: "shipper"|"receiver"; selection: "top_volume"|"top_fish_shipper";
    shipments: number; fish_share: number; first_month: number; last_month: number;
    active_months: number; lifecycle: Lifecycle; partners: number; hs_codes: number;
    top_partner_share: number; weight_kg: number;
    monthly: number[84]; monthly_fish: number[84];
    top_partners: {id: string; shipments: number}[≤5]; top_hs4: {hs4: string; shipments: number}[≤5];
  }[];
}
```
Example: `{"id":"hǎi dǎn Corporation Wharf","role":"receiver","shipments":448746,"lifecycle":"persistent","monthly":[5074,5051,...]}`

## patterns.json

```ts
{
  months: string[84]; n_pairs: number; n_recurring_pairs: number; reciprocal_pairs: number;
  categories: {                                  // in rule order; the first matching rule wins
    category: "one_off"|"short_burst"|"seasonal"|"abrupt_stop"|"fading"|"ramping"|"steady"|"intermittent";
    definition: string; pairs: number; shipments: number;
    fish_pairs: number;                          // pairs with fish share >= 0.5
    median_span_months: number|null; median_shipments: number|null;
    aggregate_monthly: number[84];               // all pairs in the category, summed
    exemplars: {source: string; target: string; shipments: number; first_month: number;
                last_month: number; fish_share: number; monthly: number[84]}[≤4];
  }[8];
  fish_vs_all_share: Record<Category, {all: number; fish: number}>;   // share of pairs in each category
  feature_histograms: {span_months: number[10]; span_bins: number[11]; coverage: number[10]};
  kmeans_check: {k: 8; n_pairs: number; weighted_purity: number;
                 clusters: {cluster: number; size: number; centroid: Record<string, number>;
                            rule_category_counts: Record<Category, number>;
                            dominant_rule_category: Category; purity: number}[8]};
}
```
Example: `{"category":"steady","pairs":4634,"shipments":1732548,"exemplars":[{"source":"Mizoram  GmbH & Co. ...","monthly":[...]}]}`

## bundles.json

```ts
{
  score_weights: Record<Component, number>;     // the weights sum to 1
  thresholds: {Reliable: 0.75; Questionable: 0.5};
  gates: Record<GateMetric, {level: "critical"|"major"; op: "<"|">"; threshold: number; reason: string}>;
  verdict_rule: string; component_definitions: Record<Component, string>;
  baselines_real_2034: {pair_known_before_2034, source_hscode_known_before_2034,
    median_abs_log10_weight_vs_pair_history, graph_unique_rate, graph_omu_value_offset_median_dex,
    graph_omu_value_offset_median_se_dex, graph_omu_edges_with_weight, null_samples: number};
  bundles: {                                     // sorted by verdict, then score
    bundle: BundleName; rank: number; score: number; verdict: BundleVerdict;
    gates_failed: {metric: string; level: string; value: number; threshold: number; reason: string}[];
    components: Record<Component, number>;       // each 0..1
    metrics: {links, distinct_links, nodes, sources, targets, links_per_source: number;
      top_source: string; top_source_share: number; top_target: string; top_target_share: number;
      unique_rate, exact_copy_rate: number; new_links: number; out_of_range_date_rate: number;
      date_min: string; date_max: string; weight_present_rate, volume_present_rate,
      value_omu_present_rate, hscode_5digit_rate, fish_share, pair_known_before_2034_rate,
      pair_in_graph_rate, source_hscode_known_rate, source_in_graph_rate, target_in_graph_rate: number;
      new_nodes, new_pairs: number;
      hs4_jsd_vs_source_history, hs4_jsd_null_p95, concentration_entropy, concentration_null_p05,
      month_jsd_vs_2034, month_jsd_null_p95, median_abs_log10_weight_vs_pair_history,
      median_value_offset_dex, value_bias_dex, node_country_agreement: number|null};
    distributions: {
      hs4_top: {hs4: string; bundle_share: number; graph_2034_share: number}[≤8];
      log10_weight: {bins: number[9]; bundle: number[8] /*counts*/; graph_2034_share: number[8]};
      value_offset_dex: {bins: number[11]; bundle: number[10]; graph_omu_share: number[10]};
      month: {labels: string[17] /*"<2034", 2034-01..2035-04*/; bundle: number[17]; graph_2034_share: number[17]};
    };
  }[12];
  pair_overlap: {order: BundleName[12]; jaccard: number[12][12]};
  caveat: string;
}
```
Component = `uniqueness | novelty_balance | schema | date_validity | month_fit | endpoint_plausibility | hs_mix_fit | concentration_fit | weight_realism | value_realism | node_consistency`.

Example: `{"bundle":"cod2","score":0.7467,"verdict":"Unreliable","gates_failed":[{"metric":"unique_rate","level":"critical","value":0.0207,...}],"metrics":{"links":193,"distinct_links":4,"top_target":"-53",...}}`

## bundle_impact.json

```ts
{
  reliable_bundles: BundleName[]; links_added: number;    // distinct, not in the graph, inside the window
  links_added_by_bundle: Record<BundleName, number>; links_added_fish_share: number|null;
  links_added_new_pairs: number;
  pair_patterns: {pairs_touched: number; pairs_new: number; category_changed: number;
    transitions: {from: Category; to: Category; pairs: number}[];   // includes from === to
    examples: {source, target: string; before, after: Category; monthly_before, monthly_after: number[84]}[≤12]};
  months_2034: string[12]; monthly_2034_before: number[12]; monthly_2034_added: number[12];
  fish_share_2034_before: number; fish_share_2034_after: number;
  revived_stoppers: {id: string; role: string; last_month_before: string; last_month_after: string; shipments: number}[];
  successor_pairs_before: number; successor_pairs_after: number;
  successor_verdicts_before, successor_verdicts_after_redetect: Record<PairVerdict, number>;
  flagged_pair_status_after: {role, predecessor, successor: string; verdict_before: PairVerdict;
    score_before: number; verdict_after: PairVerdict|"Not detected"; score_after: number|null}[];
  new_flagged_pairs_after: {role, predecessor, successor: string; verdict: PairVerdict; score: number}[];
  top_targets_of_added_links, top_sources_of_added_links: {id: string; links: number}[≤10];
  per_bundle_whatif: {bundle: BundleName; verdict: BundleVerdict; links: number; usable_links: number;
    fish_share_usable: number|null; top_target: string; top_target_links: number}[12];
  sensitivity_with_questionable: {bundles: BundleName[]; links_added: number;
    flagged_pairs_changed: {role, predecessor, successor: string; verdict_before, verdict_after: string}[];
    verdict_counts: Record<PairVerdict, number>};
}
```
Example: `{"links_added":347,"revived_stoppers":[{"id":"Bahía Azul Ltd Holdings","role":"shipper","last_month_before":"2034-05","last_month_after":"2034-12","shipments":24}],...}`

## suspects.json

```ts
{
  method: {stopper, starter, window, similarity, filters: string; score_weights: Record<string, number>;
           verdicts: Record<PairVerdict, string>; confidence: Record<"High"|"Medium"|"Low", string>};
  population: Record<"shipper"|"receiver", {stoppers: number; starters: number; candidate_pairs_in_window: number}>;
  gap_profile: Record<"shipper"|"receiver", {bins: number[12]; pairs: number[11];
                                             pairs_per_gap_month: number[11]; criteria: string}>;
  pair_counts: {total: number; by_verdict: Record<PairVerdict, number>;
                by_verdict_confidence: Record<"Verdict|Confidence", number>; by_role_verdict: Record<"role|Verdict", number>};
  pairs: {                                       // top 100: sorted by verdict, then score
    rank: number; role: "shipper"|"receiver"; predecessor: string; successor: string;
    verdict: PairVerdict; confidence: "High"|"Medium"|"Low"; reason: string;
    score: number; mutual_best: boolean; gap_months: number; stop_month: string; start_month: string;
    metrics: {partner_cosine, partner_jaccard, hs_cosine, hs_jaccard, volume_similarity, gap_score,
              handover_alignment, inherited_share, name_similarity: number};
    shared_partner_count: number; revived_links: number; fish_related: boolean;
    pred, succ: {shipments, first_month, last_month, active_months: number; fish_share: number};
    evidence: {pred_monthly: number[84]; succ_monthly: number[84];
               shared_partners: {id: string; pred_shipments: number; succ_shipments: number;
                                 pred_last_month: number; succ_first_month: number}[≤8];
               pred_top_hs4, succ_top_hs4: {hs4: string; shipments: number}[≤5];
               pred_partner_count: number; succ_partner_count: number};
  }[];
  companies: {                                   // every company in `pairs`; takes the verdict of its strongest pair
    rank: number; id: string; role: string; verdict: PairVerdict; confidence: string;
    best_score: number; fish_related: boolean;
    links: {type: "reappeared_as_successor_of"|"disappeared_succeeded_by"; other: string;
            pair_rank: number; score: number; verdict: PairVerdict; confidence: string}[];
  }[];
  chains: {role: string; chain: string[]}[];     // A→B→C sequences made of Suspect and Possible links
  score_histogram: {bins: number[8]; counts: number[7]};   // all 872 candidate pairs
}
```
Example: `{"rank":8,"role":"receiver","predecessor":"-811","successor":"-206","verdict":"Suspect","confidence":"High","stop_month":"2032-12","start_month":"2033-01","shared_partner_count":5,"metrics":{"inherited_share":0.7755,...},"evidence":{"pred_monthly":[...],"succ_monthly":[...]}}`

---

## Recommended views

### Q1: Temporal patterns
1. **Market timeline.** Monthly shipments as an area chart with the fish share as a line on a second scale. Source: `timeline_overview.shipments`, `fish_share`.
2. **Seasonality strip.** Twelve calendar months showing `calendar_profile.fish_index` against `all_index`.
3. **Lifespan histogram.** Shippers against receivers, with the fish-majority subset overlaid (`companies_top.lifespan_histogram`). Add the lifecycle counts as a stacked bar.
4. **Pattern taxonomy small multiples.** One panel per category: the aggregate monthly series plus 4 exemplar sparklines, with pair and shipment counts (`patterns.categories`). Add a "pairs vs shipments" bar showing that steady pairs are 2% of pairs but 33% of shipments.
5. **Company explorer.** Pick one of the 150 companies to see its monthly series, fish series, top partners and top HS headings (`companies_top.companies`).
6. **Gap profile.** A bar chart of `suspects.gap_profile.*.pairs_per_gap_month` that separates "twins" (negative gaps) from "restarts" (0–6).

### Q2: Bundle reliability
1. **Scorecard.** Twelve rows sorted by `rank`, with a verdict tag, a score bar and failed gates as chips (`bundles[]`).
2. **Component heatmap.** Twelve bundles by 11 components, each cell 0–1 (`components`). Tooltip text comes from `component_definitions`.
3. **Comparison histograms.** Per bundle, show weight, value offset and month as bundle counts against the graph's reference share (`distributions`), plus the top HS headings in a paired bar.
4. **Repetition against novelty scatter.** x = `unique_rate`, y = `exact_copy_rate`, sized by `links`. It shows three groups: fabricated, replayed and anchored bundles.
5. **Overlap matrix.** Pair-set Jaccard between bundles (`pair_overlap`).

### Q3: After adding the reliable links
1. **2034 before and after.** Monthly bars with the added links stacked on top. Use a log scale or an inset, because the additions are under 0.1% (`monthly_2034_before`, `monthly_2034_added`).
2. **Pattern transitions.** A Sankey or matrix of `pair_patterns.transitions` with `from !== to`, and before/after sparklines from `examples`.
3. **Revived stoppers.** A list of timelines showing the real last month and the predicted last month (`revived_stoppers`).
4. **Stability check.** A table of `flagged_pair_status_after` and `sensitivity_with_questionable`, showing that no Suspect or Possible pair changes.

### Q4: Companies that fit the illegal-fishing pattern
1. **Ranked suspect list.** `suspects.companies` with a verdict tag and confidence pennants, filterable by role and by fish trade.
2. **Pair evidence card.** Mirrored predecessor and successor monthly bars on one time axis (`evidence.pred_monthly`, `succ_monthly`). Add a shared-partner table showing each partner's last month with the old company and first month with the new one, the metrics bars, and `reason`.
3. **Consolidation view.** A small network for *Karelians Limited Liability Company International* and its six predecessors (`companies[].links`), and the 3-step `chains`.
4. **Score distribution.** `score_histogram` with the verdict thresholds marked, to put the 8 Suspect pairs in the context of all 872 candidates.
