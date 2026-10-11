# Stages data contract (night-sea scroll stories)

Producer: `.venv/bin/python pipeline/stages_build.py`, run from the repo root. It takes about 25 s and runs in `pipeline/build_all.py` after the MC builds and before Summary, because it reads `mc1/candidates.json` and `mc3/groups_overview.json` (it asserts the MC3 ablation numbers against the latter).
Inputs: `data/raw/mc1/MC1.json`, `data/raw/mc3/MC3.json`, `data/processed/mc2_{edges,nodes}.parquet`.
Dependencies: `python-igraph` (pinned in `pipeline/requirements.txt`) for Fruchterman–Reingold layouts.

| File | Size | Stage |
|---|---|---|
| `app/public/data/mc1/constellation.json` | 333 KB | The whole MC1 graph as a night sky |
| `app/public/data/mc3/galaxy.json` | 505 KB | The MC3 giant component BG00001 and its name-collision break-up |
| `app/public/data/mc2/currents.json` | 34 KB | Country-to-country trade as ocean currents |
| `app/public/data/home/drift.json` | 8 KB | Monthly totals and sampled shipments for the home page's drifting lights |

## Shared conventions

- **Compact rows.** Records are arrays of arrays. Columns are listed per file below. Indices refer to positions in that file's `nodes` (or `countries`) array, starting at 0.
- **Coordinates** `x, y` are rounded to 4 dp. Each layout is rotated onto its principal axes (long axis horizontal), then scaled uniformly so the **longer side spans [0, 1]**. The shorter side is centred inside [0, 1]. `aspect` is width / height of the drawing's bounding box (> 1 means wide). To draw without distortion, map `x * S` and `y * S` with the same `S` and offset the shorter axis, or crop the shorter axis to `[0.5 - 0.5/aspect, 0.5 + 0.5/aspect]` (for `aspect > 1`). `y` grows upwards in layout space; flip it for a canvas if you care about orientation (nothing depends on it).
- **No `NaN` or `Infinity`.** A missing value is `null`.
- **Determinism.** Every graph is built in sorted order, igraph's RNG is reseeded (`SEED = 42`) before every layout, and every layout starts from explicit seeded positions. Two runs, with different `PYTHONHASHSEED` values, produce byte-identical files.
- **Ids are the MC pipelines' ids.** MC1 keys come from `mc1_build.key` (integer ids get a `#` prefix). MC3 ids are `"C|<company>"` / `"P|<person>"` as in `mc3_build`.
- `generated_by` and `params` are provenance strings, not for display logic.

---

## `mc1/constellation.json`

Every MC1 node gets a star. The largest component (3,151 nodes) is laid out with igraph Fruchterman–Reingold (exact, not grid; 1,500 iterations). The edge weight is the maximum raw `weight` over all rows between the pair, in either direction and of any type. The 82 small components are each laid out separately, scaled so their edges are about two star-spacings long (spacing is the median nearest-neighbour distance in the largest component), and packed just outside its rim. They go in golden-angle order, biggest first, on three staggered rings, with a collision check.

```jsonc
{
  "aspect": 1.3509,                 // width / height
  "cls":   ["company", "company_like", "org_numeric", "org_named", "political_org", "person",
            "location", "vessel", "event", "movement", "untyped_other", "junk"],   // = mc1_build.CLASSES
  "types": ["ownership", "partnership", "membership", "family_relationship"],    // = mc1_build.EDGE_TYPES
  "nodes": [[k, x, y, clsIndex, deg, inLowLayer, comm], ...],   // 3,428 rows, sorted by k
  "edges": [[sourceIndex, targetIndex, typeIndex, w], ...],     // 10,747 rows
  "suspects":   [i, i, i, i],      // Mar de la Vida OJSC, #979893388, Oceanfront Oasis Inc Carriers, #8327
  "fisheye":    i,                 // "FishEye International"
  "lowLayer":   [i, ...],          // the 79 nodes of the low-weight layer (sorted indices)
  "lowLayerPlacement": {...},      // where the layer lands, see below
  "cycles":     [[i, ...], [i, ...]],   // the 2 low-weight ownership cycles, in lowconf.json order
  "candidates": [i, ...],          // top-25 candidates, in rank order (from candidates.json)
  "lcc": {"size": 3151, "components": 83},
  "params": {...}, "generated_by": "pipeline/stages_build.py"
}
```

| Node column | Type | Meaning |
|---|---|---|
| `k` | str | Node key (`#` prefix for integer raw ids), identical to `k` in every other `mc1/*.json` file |
| `x`, `y` | float | Position in [0, 1] |
| `clsIndex` | int | Index into `cls`: the inferred class from `mc1_build.classify` |
| `deg` | int | Undirected simple degree (= `deg` in the MC1 node tables) |
| `inLowLayer` | 0/1 | 1 if the node touches a raw edge with weight < 0.8 (the 79-node layer in `lowconf.json`) |
| `comm` | int | Louvain community (seed 42, run 0), identical to `comm` in the MC1 node tables |

| Edge column | Type | Meaning |
|---|---|---|
| `sourceIndex`, `targetIndex` | int | Direction as recorded (source → target) |
| `typeIndex` | int | Index into `types` |
| `w` | float | Maximum weight over the duplicate rows of this (source, target, type), rounded to 2 dp. Rows are collapsed with `mc1_build.collapse`, so 11,069 raw rows become 10,747 edges. **Caution:** with 2 dp, a weight of 0.795 rounds to 0.8. Use `inLowLayer` or `lowLayer`, not `w < 0.8`, to pick out the layer |

`lowLayerPlacement` records where the layer lands in this layout:

| Field | Meaning |
|---|---|
| `centroid`, `bbox` | Layer centroid `[x, y]` and bounding box `[x0, y0, x1, y1]`, in [0, 1] coordinates |
| `rg` | Radius of gyration of the 79 layer positions |
| `rg_random79_mean` | Mean `rg` of 200 random 79-node samples from the largest component |
| `rg_ratio` | `rg / rg_random79_mean`. Below 1 means more compact than chance |
| `centroid_dist_from_lcc_centre_pct` | Share of largest-component nodes closer to its centre than the layer centroid is |
| `in_inner_half_of_lcc` | Share of layer nodes within the median radius of the largest component |
| `outliers_beyond_3rg` | Layer nodes more than 3 `rg` from the layer centroid |

The current build gives `rg_ratio` 0.69, `centroid_dist_from_lcc_centre_pct` 0.17, `in_inner_half_of_lcc` 0.73 and 1 outlier. The layer is a loose knot just west of the core's centre: compact, but woven through the dense core rather than a separate island. One degree-1 member hangs on a single long low-weight edge, out at the far west rim, x ≈ 0.08. Weighted FR weakens exactly the edges that define the layer (w < 0.8), so to make the layer read as a region, the stage should highlight it (colour, or dim everything else) rather than rely on position alone.

---

## `mc3/galaxy.json`

The giant component BG00001 (7,093 nodes, 7,387 edges) and the top-50-surname ablation, as an animatable before/after.

- **Before:** igraph FR (grid variant, 1,200 iterations, unweighted) on the giant.
- **After:** the 651 ablated persons are removed. The remaining 6,442 nodes are relaxed with FR seeded from their before positions (300 iterations, `start_temp` 0.5), so nothing reshuffles. The remaining giant (306 nodes) is recentred: its Louvain communities keep their relaxed shapes while their centroids contract to 0.3 × the before radius. Every other component (fragment) keeps its bearing and relaxed shape, and its centroid moves to radius `R_giant + 0.12·R_before + 1.1·r`, where `r` is its relaxed centroid radius. This mapping is monotone, so radial order is kept and a gap opens around the centre. Finally the after state is scaled so its 95th-percentile radius is 1.3 × the before galaxy's.
- **One frame:** `x, y` and `x2, y2` share one normalisation and one `aspect`, so a node can be tweened from `(x, y)` to `(x2, y2)` directly. The before galaxy fills about 75% of the frame.

```jsonc
{
  "aspect": 1.0393,
  "nodes": [[id, x, y, kind, commonSurname, removed, x2, y2, sliceIndex], ...],  // 7,093 rows, sorted by id
  "edges": [[s, t, kind], ...],                                               // 7,387 rows
  "slices": [{"id": "BG00001.001", "size": 444}, ...],   // 86 Louvain slices; slices[sliceIndex-1]
  "before": {"giant": 7093, "edges": 7387},
  "after":  {"giant": 306, "second": 288, "removed": 651, "remaining": 6442,
             "components": 1083, "fragments": 1082, "fragments_singletons": 529,
             "fragments_2plus": 553, "fragment_sizes_top10": [288, 189, 140, ...]},
  "focus":  {
    "BG00001.061": {"inside": true, "nodes": [i, ...], "removed": 5, "in_after_giant": 30},
    "BG00177": {"inside": false, "nodes": [], "size": 8, "note": "..."},
    "BG00148": {"inside": false, "nodes": [], "size": 9, "note": "..."}
  },
  "params": {...}, "generated_by": "pipeline/stages_build.py"
}
```

| Node column | Type | Meaning |
|---|---|---|
| `id` | str | `"C|<company>"` or `"P|<person>"`, as in `mc3_build` subgraphs |
| `x`, `y` | float | Before position |
| `kind` | 0/1 | 0 = company, 1 = person |
| `commonSurname` | 0/1 | Person whose surname (suffixes such as `Jr.` and `PhD` stripped) is among the 50 most common in MC3. Always 0 for companies. 1,676 nodes |
| `removed` | 0/1 | Person in BG00001 linked to 2+ companies with a top-50 surname: the `drop_top50_surnames` scenario in `groups_overview.json → giant_component.name_collision_robustness`. 651 nodes. The build asserts this count and the after sizes (306 and 288) against that file |
| `x2`, `y2` | float \| null | After position. `null` when `removed = 1` |
| `sliceIndex` | int | 1-based Louvain slice of BG00001 (seed 42, as in `mc3_build`). `sliceIndex = 61` is `BG00001.061`. All 86 slice sizes match `groups_overview.json` |

| Edge column | Type | Meaning |
|---|---|---|
| `s`, `t` | int | Node indices, `s < t`, sorted. MC3 links run company → person; read the direction from `kind` |
| `kind` | 0/1 | 0 = Beneficial Owner, 1 = Company Contacts. No pair carries both types (`dual_type_pairs = 0`); if one ever did, it would be 0 |

`focus`: BG00177 and BG00148 are separate components of 8 and 9 nodes, **not inside BG00001**, so their `nodes` lists are empty. BG00001.061 (63 nodes) is inside. The ablation removes 5 of its persons, and 30 of its nodes stay in the remaining 306-node giant.

---

## `mc2/currents.json`

Built from `data/processed/mc2_edges.parquet`, loaded with `mc2lib.common.load_edges` (exact duplicate rows dropped: 5,464,378 → 5,309,087; all fall within 2028-01..2034-12). A shipment's **origin** is the `shpcountry` of its source company and its **destination** is the `rcvcountry` of its target company (`mc2_nodes.parquet`). Missing values are pooled into the node `"Unknown"`. 0 shipments have an unknown origin and 286 have an unknown destination (286 in total). None of them is in the top 80 flows.

Countries: the largest trader (Oceanus) sits at the centre. Every other country is evenly spaced around it, in the bearing order of a weighted igraph FR layout of the country graph (edge weight `log1p(shipments)/log1p(max)`, self flows excluded, 2,000 iterations), so trading partners stay neighbours. Radius = `0.3 + 0.7 × (1 − normalised log1p(total trade))`, so big traders sit nearer the hub.

```jsonc
{
  "aspect": 1.0259,
  "months": ["2028-01", "2034-12"],          // monthly arrays have 84 entries, index 0 = 2028-01
  "countries": [[name, x, y, shipmentsOut, shipmentsIn, domestic], ...],  // 165 rows, sorted by name
  "unknown": 144,                             // index of "Unknown" in countries
  "flows": [[o, d, shipments, fishShare, monthly[84]], ...],               // top 80, by shipments desc
  "monthly": {"all": [84 ints], "fish": [84 ints]},
  "counts": {"edges_raw", "edges_dedup", "countries", "country_pairs", "international_pairs",
             "domestic_shipments", "top_flows_share_of_international",
             "edges_unknown_origin", "edges_unknown_destination", "edges_unknown_either",
             "edges_unknown_both", "note"},
  "params": {...}, "generated_by": "pipeline/stages_build.py"
}
```

| Country column | Meaning |
|---|---|
| `name` | Country name as in the data, or `"Unknown"` |
| `x`, `y` | Position in [0, 1] |
| `shipmentsOut` / `shipmentsIn` | Shipments with this origin / destination (domestic shipments counted in both) |
| `domestic` | Shipments with origin = destination. Oceanus → Oceanus is 396,850 of the 400,770 total |

| Flow column | Meaning |
|---|---|
| `o`, `d` | Origin and destination country indices. Directed, and `o ≠ d`: self flows are excluded from the ranking because they cannot be drawn as currents (see `domestic`) |
| `shipments` | Shipments over 2028-01..2034-12 |
| `fishShare` | Share of those shipments with a fish HS heading (`mc2lib.common.FISH_HEADINGS`), 3 dp |
| `monthly` | 84 monthly shipment counts |

The top 80 flows carry 97.5% of international shipments, and 62 of them end or start in Oceanus. The biggest is Marebak → Oceanus with 1.86 M shipments. `monthly.all` / `monthly.fish` count all shipments, domestic and Unknown included.

---

## `home/drift.json`

```jsonc
{
  "months": ["2028-01", "2034-12"],
  "monthly": {"all": [84 ints], "fish": [84 ints]},   // same series as currents.json
  "samples": [[monthIndex, fish, logWeight], ...],    // 600 rows, sorted
  "params": {"n_samples": 600, "seed": 42, "weight": "log10(max(weightkg, 1))"},
  "generated_by": "pipeline/stages_build.py"
}
```

`samples` are 600 real shipments drawn uniformly without replacement (`numpy.random.default_rng(42)`) from the deduplicated edge table. `monthIndex` is 0..83, `fish` is 0/1, and `logWeight` is `log10(weightkg)` rounded to 2 dp (0 when the weight is 0). 82 of the 600 are fish, which roughly matches the overall fish share.
