# MC3 data contract

Producer: `.venv/bin/python pipeline/mc3_build.py`, run from the repo root. It reads `data/raw/mc3/MC3.json` and takes about 15 s.
Output: `app/public/data/mc3/*.json`. The files are minified UTF-8 and total about 1.3 MB. They never contain `NaN` or `Infinity`; a missing value is `null`.
Determinism: the output is byte-identical across runs and `PYTHONHASHSEED` values. Graphs are built with sorted insertion order, every random step uses `SEED = 42`, and ties are broken by id.

## Shared conventions

| Concept | Format |
|---|---|
| Node id in subgraphs | `"C|<company name>"` or `"P|<person name>"`. Names are kept exactly as in the raw data, including double spaces and pinyin. |
| Unit / group id | A whole connected component is `BGnnnnn`, ranked by size, so `BG00001` is the giant. A Louvain slice of the giant is `BG00001.nnn`, and its `parent` is `"BG00001"`. |
| Cluster id | `Tnn` is a text-space cluster (the company has product text). `Snn` is a structure-space cluster (no product text). |
| `fish_label` | `"fishing"`, `"adjacent"` (food, cold-chain or shipping terms only), `"other"` or `"unknown"` (no product text). |
| `confidence` | `"High"`, `"Medium"` or `"Low"`. |
| `verdict` | `"Suspect"`, `"Possible"`, `"Insufficient evidence"` or `"Unlikely"`. |
| Link `type` | `"owner"` (Beneficial Owner), `"contact"` (Company Contacts) or `"both"`. |
| Percentiles | `anomaly_pct` runs from 0 to 1 over the 2,347 scored units (units with ≥3 nodes). Ties share the average rank. |

Columnar tables use `{ "columns": [...], "rows": [[...], ...] }`.

---

## `meta.json` (~5 KB)

Dataset, cleaning and model summary.

```jsonc
{
  "source": "VAST Challenge 2023 MC3 (MC3.json)",
  "raw": { "nodes": 27622, "links": 24038, "node_types": {"Company": 8639, ...}, "link_types": {...} },
  "cleaning": {
    "multi_source_links": 2169, "multi_distinct_source_links": 807,
    "orphan_role_record_names": int, "orphan_role_records": int,
    "dup_company_names": 374, "dup_company_multi_country": 145,
    "company_records": 8639, "revenue_unknown_records": 2556, "dual_type_pairs": 0,
    "company_entities": 16697, "registered_companies": 8129, "linked_companies": 13157,
    "unregistered_linked_companies": int, "persons": 21265, "edges": 24931,
    "edges_owner": 17303, "edges_contact": 7628,
    "generic_name_companies": 11420, "generic_name_country_ZH_share": 1.0,
    "fish_name_companies": 1201, "maritime_name_companies": 2257,
    "stripped_word_names": 1391, "role_attr_fallback_companies": 5,
    "freelance_source_companies": 113, "name_product_mismatch_companies": 274,
    "revenue_rule": "max over duplicate records of a name"
  },
  "components": { "n": 13587, "isolated_companies": 3540, "giant_size": 7093, "size2": 7785,
                  "analysis_units": 13672, "scored_units": 2347 },
  "products": { "fish_label_counts": {"adjacent": 623, "fishing": 1043, "other": 2209, "unknown": 12822},
                "informative_texts": 3875, "fishing_share_of_informative": 0.269, "classifier": str },
  "similarity": { "spaces": { "T": SpaceSummary, "S": SpaceSummary },
                  "text_weights": {"lsa_tfidf": 0.8, "structure": 0.2}, "structural_features": [str] },
  "anomaly_model": { "method": str, "features": [str], "units_scored": 2347, "min_nodes": 3 },
  "persons": { "owners_by_companies_owned": {"1": 13761, ..., "10": 1},   // the 10 bucket is 10+
               "owners_per_company_hist": {"0": 8138, ..., "30": 38},    // the 30 bucket is 30+
               "top_surnames": [["Smith", 279], ...], "top_first_names": [[str, int], ...],
               "giant_person_bridges_sample": [str] },
  "investigate_confidence_counts": {"High": n, ...}, "investigate_verdict_counts": {"Suspect": n, ...}
}
// SpaceSummary = { "name": "text"|"structure", "n_companies": int, "k": int, "silhouette": float,
//                  "k_curve": { "<k>": {"silhouette": f, "stability": f, "score": f} }, "mean_stability": float }
```

## `groups_overview.json` (~190 KB)

The component size distribution, a giant-component diagnosis, and one row per scored unit.

```jsonc
{
  "component_size_histogram": [ {"size": 1, "count": 3540}, {"size": 2, "count": 7785}, ..., {"size": 7093, "count": 1} ],
  "giant_component": {
    "id": "BG00001", "n_nodes": 7093, "n_companies": 1506, "n_persons": 5587,
    "louvain_parts": 86, "modularity": 0.969, "cut_edges": 130,
    "person_articulation_points": 861, "articulation_points": 1612,
    "name_collision_robustness": {
      "collision_by_companies_linked": { "1": {"persons": 18650, "common_surname_share": 0.219}, ..., "5+": {...} },
      "drop_top10_surnames": { "persons_removed": 306, "largest_remaining": 2963, "second_remaining": 395,
                               "random_control_largest": [10 ints] },
      "drop_top50_surnames": { "persons_removed": 651, "largest_remaining": 306, ... }
    }
  },
  "feature_medians": { "<anomaly feature>": float },
  "unit_counts": { "all": 13672, "scored_min3_nodes": 2347, "single_company": 3540, "two_nodes": 7785 },
  "flag_counts": { "cross_border_control": 193, "ownership_fragmentation": 82, ... },
  "units": {
    "columns": ["id","parent","n_nodes","n_companies","n_persons","n_countries","revenue_total",
                "unknown_product_share","fish_share","max_owners_per_company","max_companies_per_person",
                "cross_border_owners","shell_like_companies","fish_share_smoothed","iuu_relevance",
                "anomaly_pct","investigate_score","flags"],
    "rows": [["BG00001.001","BG00001",201,35,166,10,2125586,0.69,0.55,112,2,1,2,0.5,0.4,0.952,0.818,
              ["ownership_fragmentation","cross_border_control","name_product_mismatch","dual_roles"]], ...]
  }
}
```

Field notes:
- `fish_share` is `null` when no company in the unit has product text.
- `max_companies_per_person` counts only persons whose surname is outside the 50 most common, because those links are the least likely to be name collisions.
- `shell_like_companies` counts companies that have a registry record but declare neither a product nor revenue.

## `anomalies.json` (~200 KB)

The 30 units with the highest Isolation Forest score, each explained and with an evidence subgraph of at most 80 nodes.

```jsonc
{ "anomalies": [ {
  "rank": 1, "id": "BG00148", "parent": null, "anomaly_pct": 1.0, "iso_score": 0.6831, "investigate_score": 0.785,
  "features": { "n_nodes": 9, "n_companies": 7, "max_companies_per_person": 7, "serial_owner_share": 1.0,
                "fish_share": null, "fish_share_smoothed": 0.269, "top_countries": ["Oceanus","Coralmarica"], ... },
  "reasons": [ { "feature": "serial_owner_share", "label": "share of owners holding 3+ companies",
                 "value": 1.0, "median": 0.0, "robust_z": 17.05, "direction": "high" } ],   // |z| >= 2, top 4
  "flags": [ { "flag": "serial_owner", "text": "a person with an uncommon name is linked to 7 companies" } ],
  "similar_groups": [ { "id": "BG00378", "cosine": 0.974, "anomaly_pct": 0.996 } ],         // 5 nearest
  "cluster_mix": [ { "cluster": "S08", "share": 0.429 } ],                                  // top 3
  "truncated": false,
  "nodes": [ CompanyNode | PersonNode ], "links": [ Link ]
} ] }
```

Node and link shapes:

```jsonc
// CompanyNode
{ "id": "C|Adriatic Squid Ltd. Liability Co", "label": str, "kind": "company",
  "countries": [str], "revenue": int|null, "fish_label": str,
  "product": str /* ≤160 chars, "Unknown" if none */,
  "n_records": int, "registered": bool, "cluster": "T12", "name_fish": bool,
  "name_product_mismatch": bool, "degree": int /* in the full graph */ }

// PersonNode
{ "id": "P|Angelica Wheeler", "label": str, "kind": "person", "n_companies": int, "owner_of": int,
  "contact_of": int, "degree": int, "common_surname": bool }

// Link
{ "source": "C|…", "target": "P|…", "type": "owner"|"contact"|"both" }
```

Flags:

| Flag | Fires when |
|---|---|
| `ownership_fragmentation` | a company has ≥20 owners |
| `serial_owner` | a person with an uncommon surname is linked to ≥4 companies |
| `cross_border_control` | an owner with an uncommon surname controls companies in ≥2 countries |
| `multi_jurisdiction_duplicate` | a non-Faker company name is registered in several countries |
| `shell_like` | at least half of ≥3 companies are shell-like |
| `unregistered_entities` | at least 60% of ≥3 companies are unregistered |
| `dual_roles` | ≥2 persons are both owner and contact |
| `name_product_mismatch` | a fishing-named firm declares a product with no fishing, food or shipping term |

## `clusters.json` (~340 KB)

Similar-business clusters in two spaces, with cohesion and confidence, plus 2D maps.

```jsonc
{
  "spaces": { "T": SpaceSummary, "S": SpaceSummary },
  "structural_features": ["log_owners","log_contacts","log_revenue","revenue_missing","n_countries",
                          "dup_records","unregistered","generic_name","owner_reuse","name_fish","name_maritime"],
  "confidence_rule": "High: stability>=0.85 and silhouette>=0.25; Medium: stability>=0.6 and silhouette>=0.05; else Low",
  "fish_label_by_cluster_space": { "T": {"adjacent": 623, "fishing": 1043, "other": 2209}, "S": {"unknown": 12822} },
  "clusters": [ {
    "cluster": "T12", "space": "text", "label": "seafood / seafood products / fish seafood (low revenue_missing, high owner_reuse)",
    "size": 223, "top_terms": [8 str],
    "key_features": [ {"feature": "revenue_missing", "mean_z": -0.17} ],   // z relative to its own space
    "fishing_rate": 1.0, "adjacent_rate": 0.0,
    "mean_silhouette": 0.491, "within_cosine": 0.602, "stability_jaccard": 0.829, "mean_margin": 0.36,
    "confidence": "Medium",
    "members_sample": [ { "name": str, "cos_to_centroid": 0.937, "margin": 0.588, "countries": [str], "product": str } ]  // 12 most central
  } ],
  "embedding": {
    "columns": ["name","space","x","y","cluster","margin","fish_label","group"],
    "rows": [["Adams Group","text",0.953,0.845,"T12",0.178,"fishing","BG00001.048"], ...]   // 3,327 rows
  }
}
```

- `x` and `y` are t-SNE coordinates scaled to [0,1] *within each space*. Plot the T and S spaces as separate panels.
- `margin` is (d₂ − d₁) / d₂ from the nearest and second-nearest centroid: 0 means the company sits on a boundary, 1 means it sits at the centroid.
- `group` is the unit id, which links a map point to its business group.

## `owners_top.json` (~105 KB)

```jsonc
{
  "persons": [ {
    "person": "John Smith", "n_companies": 12, "owner_of": 11, "contact_of": 1,
    "countries": [str], "groups": ["BG00001.047", ...],
    "list": "top_by_companies" | "top_uncommon_surname",   // the 60 with most companies + up to 40 more with uncommon surnames
    "common_surname": true, "name_collision_risk": "High"|"Medium"|"Low", "surname_frequency": 279,
    "companies": [ { "name": str, "role": "owner"|"contact"|"both", "countries": [str], "fish_label": str,
                     "revenue": int|null, "registered": bool } ]
  } ],
  "companies_most_owners": [ {   // the 40 companies with the most beneficial owners
    "company": "Vespuci Sandbar Sp Brothers", "n_owners": 119, "n_contacts": 1, "countries": ["Nalakond"],
    "revenue": 1052072, "fish_label": "other", "product": str, "registered": true,
    "group": "BG00001.001", "owners_with_other_companies": 26 } ]
}
```

## `investigate.json` (~475 KB)

A ranked list of 30 units for FishEye. Each has a verdict, a confidence level and an evidence subgraph of at most 80 nodes.

```jsonc
{
  "weights": { "anomaly_pct": 0.45, "flag_score": 0.30, "iuu_relevance": 0.25 },
  "selection": "top 30 scored units by investigate_score, at most 15 Louvain slices of the giant component",
  "fish_prior": 0.269, "fish_prior_n": 2.0, "evidence_cap": 80,
  "verdict_counts": { "Insufficient evidence": 7, "Possible": 20, "Suspect": 2, "Unlikely": 1 },
  "groups": [ {
    "rank": 1, "id": "BG00177", "parent": null, "investigate_score": 0.906,
    "verdict": "Suspect", "confidence": "Medium",
    "verdict_reasons": ["top 0.2% anomaly score, 2 strong structural flags, fishing relevance 0.91"],
    "strong_flags": ["cross_border_control","multi_jurisdiction_duplicate"],
    "anomaly_pct": 0.9979, "flag_score": 0.77, "iuu_relevance": 0.91,
    "n_companies": 3, "n_persons": 5, "countries": ["Marebak","Oceanus"],
    "fish_share": 1.0, "fish_share_smoothed": 0.51, "fish_name_share": 1.0,
    "unknown_product_share": 0.67, "collision_share": 0.0, "revenue_total": 22981,
    "key_companies": [str ×≤5], "evidence": [str], "similar_groups": [...], "in_anomalies": true,
    "subgraph": { "truncated": false, "n_total_nodes": 8, "nodes": [CompanyNode|PersonNode], "links": [Link] }
  } ]
}
```

### Scoring

- **iuu_relevance** = min(1, 0.6·fish_share_smoothed + 0.6·fish_name_share + 0.2·maritime_name_share)
- **fish_share_smoothed** = (n_fish + 2·0.269) / (n_informative + 2)
- **flag_score** = min(1, Σ flag weights / 3). The weights are: fragmentation 1.0, cross-border 1.0, shell 1.0, serial 0.8, multi-jurisdiction 0.8, unregistered 0.5, mismatch 0.5, dual roles 0.4.

### Verdict rules

These are applied in order:

| Verdict | Condition |
|---|---|
| Suspect | anomaly_pct ≥ 0.95, ≥2 strong flags, iuu_relevance ≥ 0.5 and collision_share < 0.5 |
| Possible | the same, but collision_share ≥ 0.5 |
| Unlikely | iuu_relevance < 0.2 |
| Possible | anomaly_pct ≥ 0.9, ≥1 strong flag and iuu_relevance ≥ 0.35 |
| Insufficient evidence | everything else |

The strong flags are fragmentation, serial owner, cross-border, multi-jurisdiction and shell.

### Confidence points

Start at 0 and add:

| Signal | Points |
|---|---|
| Product coverage ≥ 0.4 | +1 |
| Product coverage < 0.2 | −1 |
| collision_share ≤ 0.2 | +1 |
| collision_share ≥ 0.5 | −1 |
| Whole component (not a Louvain slice) | +1 |
| 0 or ≥3 strong flags | +1 |
| Exactly 1 strong flag | −1 |

High = ≥3 points, Medium = ≥1, otherwise Low.

### Evidence subgraph

Units with more than 80 nodes keep, in this order:
1. persons linked to 2 or more of the unit's companies (at most 26), with their companies;
2. the highest-degree companies, up to half the cap;
3. persons attached to the kept companies.

`truncated` is true when nodes were dropped.

---

## Recommended views

**Q1: Anomalies in business groups**
1. A log-log histogram of component sizes, with the giant annotated (`groups_overview.component_size_histogram`).
2. The giant-component collision test: a bar chart of the largest remaining component after removing common-surname persons, against the random-control range (`giant_component.name_collision_robustness`).
3. A scatter of scored units, n_companies against max_owners_per_company, coloured by anomaly_pct with flag glyphs (`groups_overview.units`).
4. An anomaly card list: reasons drawn as robust-z bars against the median, with flags as chips (`anomalies[].reasons/flags`).
5. A node-link evidence graph per anomaly. Companies are squares coloured by fish_label, persons are circles, and common-surname persons get a dashed outline (`anomalies[].nodes/links`).
6. Histograms of owners per company and companies per owner (`meta.persons`).

**Q2: Grouping similar businesses**
1. A pipeline diagram: clean → classify → two spaces → k selection (built from `meta.cleaning`, `meta.products`, `meta.similarity`).
2. A stacked bar of fish_label by space (`clusters.fish_label_by_cluster_space`).
3. A cluster table with top terms, key structural features (signed z bars), size and fishing rate (`clusters.clusters`).
4. The t-SNE map, text panel, coloured by cluster, with fishing companies highlighted (`clusters.embedding`, space = "text").
5. The t-SNE map, structure panel (`clusters.embedding`, space = "structure").

**Q3: Similarity and confidence**
1. The k-selection chart: silhouette, stability and score against k for each space (`spaces.*.k_curve`).
2. Bullet bars for each cluster's silhouette, stability and within-cosine, with a confidence badge (`clusters.clusters`).
3. A t-SNE map where point opacity encodes `margin`, so boundary companies fade (`clusters.embedding`).
4. A member list sorted by `cos_to_centroid`, with margin sparkbars (`clusters.members_sample`).
5. Similar groups: for a selected unit, its 5 nearest groups by cosine (`anomalies[].similar_groups`, `investigate[].similar_groups`).

**Q4: IUU involvement and investigation list**
1. A ranked investigation table with verdict and confidence badges, score bars split into their three weighted parts, and countries (`investigate.groups`).
2. A detail panel showing the evidence subgraph, the verdict reasons and the evidence bullets (`investigate.groups[].subgraph`).
3. A scatter of anomaly_pct against iuu_relevance for all scored units, with the verdict thresholds drawn and the investigated units labelled (`groups_overview.units`).
4. A verdict × confidence matrix (`meta.investigate_verdict_counts`, `investigate.groups`).
5. A "Serial owners" table of uncommon-surname persons linked to the most companies, with links to their groups (`owners_top.persons`, list = "top_uncommon_surname").
6. A weight sensitivity control: the client re-ranks units from `groups_overview.units` using user-chosen weights.

**Q5: Reflection**
1. A before-and-after of the giant component: a raw size bar against the collision-test result (`giant_component`).
2. A clustering before-and-after: the single-space silhouette against the two-space silhouette × stability (`meta.similarity`).
3. A data-quirks panel: stripped-word names, freelance-source notes, Faker names in ZH, duplicate records (`meta.cleaning`).
