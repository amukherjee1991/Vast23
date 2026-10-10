# MC1 data contract

Producer: `pipeline/mc1_build.py` (run `.venv/bin/python pipeline/mc1_build.py` from repo root).
Output: `app/public/data/mc1/*.json` — compact JSON, keys sorted, no `NaN`/`Infinity` (missing = `null`), byte-identical across runs. Total ≈ 0.77 MB.

| File | Size | Purpose |
|---|---|---|
| `meta.json` | 13 KB | Counts, type/class vocab, data quirks, global anomalies, params |
| `lowconf.json` | 25 KB | The low-weight (< 0.8) layer: nodes, links, null-model tests, cycles |
| `suspects.json` | 74 KB | Per-suspect profile, verdict, rubric, ownership chains, 1-hop table |
| `egos.json` | 447 KB | 1–2 hop ego networks (hub-controlled) with composition |
| `paths.json` | 9 KB | Pairwise suspect paths under 6 graph filters + null distances |
| `candidates.json` | 140 KB | Ranked other companies, score breakdown, validation, evidence subgraphs |
| `communities.json` | 61 KB | Louvain partition (seed 42), top 40 communities, inter-community edges |

## Shared conventions

- **Node key `k`** (string): the raw id as a string; **integer ids get a `#` prefix** (`8327` → `"#8327"`). Needed because int `77` and string `"77"` are different nodes in the raw data. Display `label` (raw id text, mojibake kept as-is).
- **`node_table`** (present in every file except `meta.json`): every node a file references, so files are independent.
  `NodeRecord = {k: str, label: str, type: str|null, cls: Class, country: str|null, deg: int, comm: int, low: int, pr: float, btw: float}`
  - `type`: raw type (`null` for 605 untyped). `cls`: inferred class, one of `company, company_like, org_numeric, org_named, political_org, person, location, vessel, event, movement, untyped_other, junk` (see `meta.class_desc`).
  - `deg`: undirected simple degree. `comm`: Louvain community id (seed 42). `low`: # raw rows with weight < 0.8 touching the node. `pr`: PageRank × 10⁴. `btw`: normalised betweenness on the largest component (0 outside it).
- **Edge types**: `ownership | partnership | membership | family_relationship`. `w` = weight (max over duplicate rows unless noted), `wmin` = min, `n` = duplicate-row count. Weights are rounded to 4 dp.
- Ownership direction is as recorded (source → target); the data notes do not define it.

## `meta.json`

```ts
{
  counts: {nodes, links, collapsed_directed, undirected_simple, components, lcc_nodes: int},
  node_types: {[rawType|"unknown"]: int}, edge_types: {[EdgeType]: int},
  classes: {[Class]: int}, class_desc: {[Class]: str},
  type_class_crosstab: {"<type>|<cls>": int},
  weight_by_type: {[EdgeType]: {p05, median, min: float}},
  quirks: {
    id_string_collisions: str[],          // ids that exist both as int and str
    numeric_string_ids: str[],
    misspelled_weight_field: {source, target, type, weight}[],  // 'weightlcoat'
    declared_vs_actual: {notes_nodes, notes_edges, file_nodes, file_edges: int|null},
    duplicate_rows_same_s_t_type, directed_pairs_multi_type, undirected_simple_edges, self_loops: int
  },
  suspects: str[], fisheye_node: str,
  anomalies: {
    hubs: {k, deg, cls}[20],
    hub_core: {nodes: str[], edges: {a, b, n, types: str[]}[], density, share_of_all_rows: float},
    relation_semantics: {family_rel_both_person_share, family_rel_no_person_share,
                         ownership_target_person_share, ownership_source_person_share: float},
    ownership_fan_out: {k, n}[15], ownership_fan_in: {k, n}[15],
    mutual_ownership_pairs: int, ownership_cycles_le4: {"2"|"3"|"4": int},
    max_parallel_pairs: {a, b, n, types}[30], class_counts: {[Class]: int}, untyped: int
  },
  params: {low_conf_threshold, hub_degree, ego_hops, seed, ego_cap_2hop, evidence_max_nodes, chain_hops, n_candidates},
  generated_by: str
}
```
Example: `"counts":{"collapsed_directed":10747,"components":83,"lcc_nodes":3151,"links":11069,"nodes":3428,"undirected_simple":10178}`

## `lowconf.json`

```ts
{
  threshold: 0.8, n_edges: int, n_nodes: int, component_sizes: int[],
  edge_types: {[EdgeType]: int}, edge_types_all: {[EdgeType]: int},
  ownership_share, ownership_share_all: float, ownership_enrichment_p: float,   // hypergeometric
  null_lcc_nodes: {mean, p95: float, max, draws: int}, null_p_value: float,     // 1000 random 88-edge draws
  weight_hist: {bins: float[21], all: int[20], by_type: {[EdgeType]: int[20]}},
  suspects_in_layer: str[],
  suspect_enrichment: {suspects_in_layer: int, layer_share_of_nodes, p_value: float, note: str},
  suspect_distance_to_layer: {[suspectKey]: int},     // 0 = inside
  fisheye_node: {degree, edges_low_conf, edges_total: int, suspects_adjacent: str[], neighbors: str[]},
  ownership_cycles: str[][],                          // canonical rotation, start = min key
  ownership_longest_chain: {length: int, nodes: str[], note: str},
  class_counts: {[Class]: int},
  nodes: {k, low: int, cls}[], links: {s, t, type, w}[],   // raw rows, not collapsed
  node_table: NodeRecord[]
}
```
Example: `"links":[{"s":"#12","t":"#196159","type":"ownership","w":0.589}, …]`, `"ownership_cycles":[["#21538","#52193","#958085","#55674"],[…]]`

## `suspects.json`

```ts
{
  suspects: Suspect[4],
  verdict_scale: ["Suspect","Possible","Insufficient evidence","Unlikely"],
  confidence_scale: ["High","Medium","Low"],
  rubric: {signals: {id, max: float, desc}[], thresholds: {[Verdict]: float}, confidence_rule: str, chain_hops: int},
  node_table: NodeRecord[]
}
Suspect = {
  k, label, type, cls, country,
  verdict: Verdict, confidence: Confidence,
  rubric: Rubric,
  deg, mdeg, out, in, own_out, own_in: int,             // mdeg = raw-row degree
  et_out, et_in: {[EdgeType]: int},
  btw: float, pr: float, comm: int, comp: int,
  low_conf_edges, low_conf_ownership: int, in_low_layer, fisheye_linked: bool,
  max_parallel, mixed_type_pairs: int,
  percentiles: {deg, mdeg, btw, pr, own_out, own_in, low, max_par: float},   // vs all 3,428 nodes
  neighbor_classes: {[Class]: int}, junk_neighbor_share: float|null, hub_neighbors: str[],
  profile_vector: float[10], profile_axes: str[10],
  louvain_cosuspects_by_seed: str[][5],               // other suspects in same community, seeds 42..46
  name_lookalikes: {label, ratio}[],
  ownership_chains: {
    downstream, upstream: {by_depth: int[6], total: int, nodes: {k, d}[≤40]},
    to_suspects: {to, directed: Chain|null, undirected: Chain|null}[3]
  },
  keyword_context_2hop: {k, d}[],                     // illegal/IUU/poach/… fragments within 2 hops
  neighbors_1hop: {k, dir: "in"|"out"|"outin", types: str[], n: int, wmin: float}[]   // sorted by wmin
}
Chain  = {path: str[], length: int, min_w: float, n_shortest: int}   // widest of the shortest paths
Rubric = {points: float, solid_signals: int, verdict, confidence,
          signals: {id, points: float, basis_w: float|null, detail: str}[]}
```
Example: `{"k":"#8327","verdict":"Suspect","confidence":"Low","rubric":{"points":5.0,"signals":[{"id":"low_layer","points":1.0,"basis_w":0.1186,"detail":"member of the layer"}, …]}}`

## `egos.json`

```ts
{
  egos: {
    suspect: str,
    hops_counts: {undirected, out, in: int[3]},       // nodes at exactly 1/2/3 hops
    full_2hop_size, total_2hop, kept_2hop: int,
    composition_1hop, composition_2hop_full: {node_types, node_classes, edge_types: {[k]: int},
                                              n_edges: int, weight_mean, weight_min: float|null, low_conf_edges: int},
    members: {k, d: 0|1|2, role: "suspect"|"2-hop"|"out:<types>;in:<types>"}[],
    links: {s, t, type, w, wmin, n}[]                 // all rows among members, duplicates collapsed
  }[4],
  node_table: NodeRecord[]
}
```
Hub control: all 1-hop nodes are kept; 2-hop nodes are kept only if reached via ≥ 2 hop-1 nodes, via a low-weight edge, or are company-class, capped at 250 by priority. `composition_2hop_full` describes the uncapped 2-hop ball.
Example member: `{"d":1,"k":"#2262","role":"in:family_relationship"}`

## `paths.json`

```ts
{
  pairs: {
    a, b: str,
    any, no_junk, no_hubs_no_junk, low_conf_only, ownership_directed, ownership_directed_rev: PathSet,
    shared_1hop: str[], shared_2hop_count: int, jaccard_1hop: float
  }[6],
  null: {random_pair_distance: {mean, hist: {[len]: int}}, suspect_mean_pair_distance: float,
         degree_matched_4set_mean_distance: {mean, p05, frac_le_observed: float, draws: int},
         hubs: str[], hub_threshold: int},
  node_table: NodeRecord[]
}
PathSet = {length: int|null, paths: str[][≤25], n_listed: int, n_found: int}   // sorted, first 25
```
Example: `{"a":"#979893388","b":"Oceanfront Oasis Inc Carriers","any":{"length":1,"paths":[["#979893388","Oceanfront Oasis Inc Carriers"]],…}}`

## `candidates.json`

```ts
{
  candidates: {
    rank, k, score: float, stability: float,          // share of 300 reweightings keeping it in top 25
    features_raw, features_norm, contrib: {[Feature]: float},
    why: Feature[≤3],                                  // top contributors
    min_dist_to_suspect: int|null, suspects_within_2: int, in_low_layer, is_hub: bool, deg: int,
    rubric: Rubric,                                    // same rubric as suspects
    evidence: {nodes: str[] /* cap 40 + adjacent suspects; max 22 in this run */, path_to_suspect: str[]|null, links: {s, t, type, w /*min*/, n}[]}
  }[25],
  features: {name: Feature, weight: float, desc: str}[7],
  pool_size: int, pool_classes: str[],
  leave_one_out: {held_out, rank, pool, percentile, degree_baseline_rank}[4],
  weight_perturbation: {draws, spearman_mean, spearman_min},
  ablation_top25_overlap: {[Feature]: int},
  spearman_vs_degree: float, top25_in_low_layer: int, top25_hubs: int,
  score_hist: {bins: float[21], counts: int[20]},
  all_scores_top200: {k, score}[200],
  node_table: NodeRecord[]
}
Feature = "low_conf"|"proximity"|"shared_nbrs"|"ownership"|"profile_sim"|"redundancy"|"fisheye_flag"
```
Example: `{"rank":2,"k":"#83","score":0.9374,"stability":1.0,"why":["low_conf","proximity","ownership"],"deg":17,"in_low_layer":true,…}`

## `communities.json`

```ts
{
  n_communities: int, modularity: float, sizes: int[],
  communities: {id, size, internal_edges, low_layer_nodes: int, classes: {[Class]: int},
                top_nodes: str[8], suspects: str[], candidates: str[]}[40],
  inter_edges: {a, b, n: int}[],                       // among first 40 communities
  suspect_comm_stability: {[suspectKey]: float|null},  // mean co-assignment with seed-42 comm-mates over 4 other seeds
  node_table: NodeRecord[]
}
```
Example: `{"id":10,"size":138,"suspects":["Mar de la Vida OJSC","#8327"],"low_layer_nodes":10,…}`

---

## Recommended views

Colour key across views: edge type → categorical palette (ownership = red, partnership = blue, membership = yellow-outlined, family = green); low-weight edges (w < 0.8) dashed and heavier; node shape by `cls` group (company-ish square, person circle, other diamond, junk hollow/grey).

### Q1 — context around each suspect
1. **Ego network small-multiples** (`egos.json`): one force/radial layout per suspect; ring = hop distance `d`, node shape = `cls`, edge colour = type, dashed = low weight; toggle 1 vs 2 hops. Suspect at centre with its `verdict` flag.
2. **Composition bars** (`egos.json` `composition_1hop` / `composition_2hop_full`): stacked bars of neighbour classes and edge types per suspect — shows Mar de la Vida = people/membership, 8327 = ownership/vessel fragments.
3. **1-hop evidence table** (`suspects.json` `neighbors_1hop`): sorted by `wmin`, direction arrow, type chips, weight bar; low-weight rows highlighted.
4. **Low-weight layer map** (`lowconf.json`): the 79-node layer as its own node-link diagram; suspects ringed, FishEye node marked; inset histogram of `weight_hist` showing the 0.8 cliff and the null-model distribution vs observed 79.
5. **Rubric card** (`suspects.json` `rubric`): per-signal points as pips, `basis_w` as a weight gauge, verdict tag + confidence pennants.

### Q2 — compare / contrast
1. **Percentile parallel-coordinates or dot matrix** (`suspects.json` `percentiles`): 4 lines across deg, btw, pr, own_in, own_out, low.
2. **Rubric heatmap** (`suspects.json` `rubric.signals`): suspects × 7 signals, cell = points, hatch where `basis_w` < 0.8.
3. **Ownership-chain strip** (`suspects.json` `ownership_chains.to_suspects` + `paths.json`): the 8327 → … → 979893388 → Oceanfront Oasis chain as a linear path with edge-weight labels; dashed where weak.
4. **Pairwise distance matrix vs null** (`paths.json`): 4×4 matrix of `any`/`no_hubs_no_junk` lengths; side histogram of `degree_matched_4set_mean_distance` with the observed 2.17 marked.
5. **Louvain stability chart** (`suspects.json` `louvain_cosuspects_by_seed`, `communities.json` `suspect_comm_stability`): seeds × suspects grid coloured by community.

### Q3 — other companies to investigate
1. **Ranked candidate list** (`candidates.json`): horizontal stacked bars of `contrib` per feature, `stability` as a dot, rubric verdict tag; sort by score or by rubric.
2. **Evidence subgraph on select** (`candidates[].evidence`): small (≤ 22 nodes in this run) layout with `path_to_suspect` highlighted.
3. **Validation panel** (`leave_one_out`, `weight_perturbation`, `ablation_top25_overlap`): LOO rank vs degree-baseline rank dumbbells; ablation overlap bars (low_conf drop → 8/25 is the honest caveat).
4. **Layer structure view** (`lowconf.json` `ownership_cycles`, `ownership_longest_chain`): the two ownership loops and the 5-hop chain drawn as small directed diagrams.
5. **Community map** (`communities.json`): community bubbles sized by `size`, filled by `low_layer_nodes`, with suspects/candidates listed; chords from `inter_edges`.

### Q4 — reflection / data quality
1. **Weight histogram by type** (`lowconf.json` `weight_hist.by_type`, `meta.json` `weight_by_type`): the undocumented 0.8 floor.
2. **Class/type crosstab** (`meta.json` `type_class_crosstab`, `classes`): how much of the graph is noise.
3. **Hub-core matrix** (`meta.json` `anomalies.hub_core`, `max_parallel_pairs`): 10×10 adjacency, cell = duplicate-row count, showing 40-row mixed-type pairs.
4. **Quirks list** (`meta.json` `quirks`): declared vs actual counts, id collisions, misspelled field.
