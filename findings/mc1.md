# MC1 findings: the FishEye knowledge graph

Every number below comes from `pipeline/mc1_build.py`, which writes JSON to `app/public/data/mc1/`. Each claim names the file that backs it. Node keys follow the pipeline convention: `#8327` is the integer id 8327.

**Verdicts** (`suspects.json` → `suspects[].verdict`, `.confidence`, `.rubric`)

| Entity | Verdict | Confidence | Rubric points |
|---|---|---|---|
| 8327 | Suspect | Low | 5.0 |
| 979893388 | Suspect | Medium | 4.0 |
| Mar de la Vida OJSC | Possible | Low | 3.0 |
| Oceanfront Oasis Inc Carriers | Possible | Low | 3.0 |

The verdicts come from a published rubric of seven signals (`suspects.json` → `rubric`):

- Score bands: 4 or more points is Suspect, 2.5 to 3.5 is Possible, 1 to 2 is Insufficient evidence, and below 1 is Unlikely.
- Confidence counts the full-point signals that rest on edges with weight ≥ 0.8 or on graph structure alone: 4 or more is High, 2–3 is Medium, and 0–1 is Low.

---

## Q1: Context around each suspect (≤ 600 words)

The key structure is a low-weight layer. 99.2% of the 11,069 edge rows have a weight between 0.80 and 0.99. The other 88 rows, with weights from 0.03 to 0.77, form one connected component of 79 nodes (`lowconf.json`). This is not chance:

- **Size.** In 1,000 random draws of 88 edges, the largest component averaged 10.6 nodes and never went above 29 (p = 0.001).
- **Ownership.** 66% of the layer's edges are ownership, against 18% of all edges (p = 2e-23).
- **Cycles.** The layer has two circular-ownership loops.
- **FishEye.** The "FishEye International" node has 24 edges, and 19 of them are in this layer. It may encode FishEye's own reporting.
- **Suspects.** Three of the four suspects are inside the layer (p = 5e-5), and the fourth is one hop away.

**8327 (Suspect, Low confidence).** 8327 is a nameless organization with 13 neighbours (`suspects.json`).

- **Owners.** "Seabreeze Foods Ltd. Corporation United" owns it through one of the ten weakest edges in the graph (w = 0.12). FishEye in turn tags Seabreeze (w = 0.13).
- **Holdings.** 8327 owns #40213337, which has six low-weight ownership rows. #40213337 owns Sea Harvest, Sea Products and #58623386.
- **Link to "Illegal".** 8327 has a membership edge (w = 0.82) to the garbled NLP fragment “Illegal".
- **Chain to two suspects.** A directed ownership chain runs from 8327 through #40213337, Sea Harvest, Amanda Mckenzie and Mar del Oeste Pic to 979893388, and from there to Oceanfront Oasis. That is six hops, and its weakest edge is 0.32 (`suspects.json` → `ownership_chains.to_suspects`).

8327 has the strongest structural signature of the four suspects (5.0 points). Confidence is Low because almost every signal rests on edges with weight below 0.8.

**979893388 (Suspect, Medium).** This nameless organization is a hub. Its degree is 177 and its betweenness is 0.096, both at the 99.8th percentile.

- **Hub core.** It is one of 10 hubs that form a dense core (density 0.84) joined by repeated mixed-type edges (`meta.json` → `anomalies.hub_core`).
- **Ownership.** It owns 10 entities and is owned by 12. Its recorded upstream ownership tree reaches 307 entities within six hops.
- **Oceanfront Oasis.** It owns Oceanfront Oasis directly, through a high-weight edge (w = 0.84).
- **Two hops out.** Its two-hop neighbourhood holds the fragments "ipoa-iuu" and "poached".

It is not in the layer, but it sits next to two layer hubs, Mar del Oeste Pic and #903311212. It reads as a holding layer, or as an often-mentioned entity the extractor over-linked.

**Mar de la Vida OJSC (Possible, Low).** This entity has no type and 15 neighbours. Most of its edges are memberships, and 6 of its neighbours are people.

- **Layer link.** Its only low-weight edge is a membership edge from FishEye (w = 0.46).
- **Ownership.** It owns one person, Jon White, and has no ownership chain.
- **Two hops out.** It reaches "Officer Pleads Guilty" (through FishEye) and "Special Action Group Combat Organized Crime" (through a fragment).
- **Betweenness.** Its betweenness is at the 95th percentile.

The FishEye tag is the main evidence, and it is weak.

**Oceanfront Oasis Inc Carriers (Possible, Low).** This entity has 4 edges, all incoming:

- a FishEye membership edge (w = 0.45)
- ownership by 979893388 (w = 0.84)
- two family-relationship edges from nameless organizations, which are probably extraction noise

A thin subsidiary of a suspect.

**Caveats.**

- The data notes do not define `weight`, so reading it as extraction confidence is an assumption.
- Ownership direction is also undefined.
- 356 nodes (10%) are NLP debris such as garbled text or words like "weeks".

---

## Q2: Comparing the suspects (≤ 400 words)

The suspects fall into two pairs (`suspects.json` → `percentiles`, `rubric`).

**Tagged small entities: Mar de la Vida and Oceanfront Oasis.**

- Both have names and no type.
- They have 15 and 4 neighbours.
- Each is linked to the layer only by a single low-weight FishEye membership edge (w = 0.46 and 0.45).
- Their only shared neighbour is FishEye (`paths.json` → `pairs[].shared_1hop`).

**Ownership intermediaries: 979893388 and 8327.**

- Both are nameless numeric organizations.
- Both own other entities and are owned by others. 8327 owns 3 and is owned by 2. 979893388 owns 10 and is owned by 12.
- The rubric's "shell marker" signal fires only for these two.
- They differ in scale. 979893388 is a hub at the 99.8th percentile of degree. 8327 is at the 91st.

**Patterns that point to illegal activity:**

1. **Ownership in the low-weight layer.** Two-thirds of the layer's edges are ownership. It contains two circular-ownership loops (4 and 5 entities) and a directed chain five hops long (`lowconf.json` → `ownership_cycles`, `ownership_longest_chain`).
2. **One chain through three suspects.** The six-hop chain links 8327, 979893388 and Oceanfront Oasis. Mar de la Vida has no ownership path to any other suspect.
3. **FishEye tags.** Two suspects are tagged directly. 8327 is tagged through its owner, and 979893388 through a neighbour.
4. **Nameless intermediaries.** 34 of the layer's 79 nodes are nameless numeric organizations (`lowconf.json` → `class_counts`).

**What is uncertain:**

- **Distances.** The mean shortest path between suspects is 2.17 hops, against 3.84 for random pairs. Against random sets of four with the same degrees, though, 8% are as close (`paths.json` → `null`). Their closeness is mostly what their degrees predict.
- **Communities.** Louvain puts the suspects in three different communities (modularity 0.69), and those assignments are unstable. Across five seeds, the share of each suspect's community neighbours that stay with it is only 0.33–0.63. Only Mar de la Vida and 8327 ever share a community, in 2 of 5 runs (`communities.json` → `suspect_comm_stability`, `suspects.json` → `louvain_cosuspects_by_seed`).
- **Ownership direction.** Read literally, the chain says the company Sea Harvest owns the person Amanda Mckenzie. The direction cannot be trusted.
- **Edge weights.** The two Suspect verdicts differ in confidence. 979893388's evidence rests on high-weight edges and on structure. 8327's rests on edges between 0.12 and 0.32.

---

## Q3: Other companies FishEye should investigate (≤ 600 words)

**How the tool surfaces them.** The tool scores every company or organization (1,209 of them) on seven structural features (`candidates.json` → `features`):

| Feature | Weight |
|---|---|
| Low-weight edges | 0.25 |
| Proximity to suspects | 0.20 |
| Shared neighbours | 0.15 |
| Ownership counterparties | 0.15 |
| Relation-type profile similarity | 0.10 |
| Repeated or mixed-type edges | 0.10 |
| FishEye tag | 0.05 |

Each feature is converted to a percentile rank before weighting. Each candidate comes with its feature contributions, a subgraph of at most 22 nodes in this run that explains it, and the verdict rubric used for the suspects.

**Validation** (`candidates.json` → `leave_one_out`, `weight_perturbation`, `ablation_top25_overlap`):

- **Held-out suspects.** When each suspect is held out and the other three are used as seeds, the held-out one ranks 11th, 51st, 41st and 35th out of 1,210 (top 1–4%). Ranking by degree places them at 96th, 7th, 528th and 128th.
- **Weight changes.** Across 300 random reweightings, the ranking keeps a mean Spearman correlation of 0.98 with the original (minimum 0.89).
- **Ablation.** Without the low-weight feature, only 8 of the top 25 stay in the top 25. The list is mainly a way to rank the layer.

All 25 top candidates sit in the low-weight layer, and 4 of them are hubs.

**Investigate first: Suspect on the rubric with Medium or High confidence** (`candidates.json` → `candidates[].rubric`)

- **#903311212** (rank 1, score 0.97). A hub with 234 neighbours and 43 owned / 42 owners. FishEye tags it, it has a low-weight ownership edge, it links to the "poached" fragment, and it reaches 979893388 through Mar del Oeste Pic.
- **#48** (rank 18, the only High-confidence result). FishEye tags it with a high-weight edge (0.95). It owns 5 and is owned by 4. Its chain reaches 979893388 through png xi Line and Ocean Fisheries Llc.
- **#40213337** (rank 7). The holding that 8327 owns, with six low-weight ownership rows. It owns Sea Harvest, Sea Products and #196159.
- **#196159** (rank 11). It is owned through #40213337 and is next to a FishEye-tagged entity.
- **#83** (rank 2). FishEye tags it. It owns 4 and is owned by 1, with a chain to 979893388.
- **Mar del Oeste Pic** (rank 5), **png xi Line** (rank 6) and **sh rn y Corporation** (rank 8). Mar del Oeste Pic and png xi Line are hubs in the hub core that own 979893388 or connect to it. sh rn y Corporation has six ownership ties and shares neighbours with the suspects.

**Next tier: Suspect with Low confidence, or Possible.**

- Seabreeze Foods Ltd. Corporation United, the owner of 8327, which FishEye tags.
- Yu gan BV Investment.
- #1560, #8814 and #923825740.
- Ocean Fisheries Llc, Sea Harvest, Sea Products and #55674.

**Structures, not just entities** (`lowconf.json`):

- **Two circular-ownership loops** (`ownership_cycles`):
  - #21538 → #52193 → #958085 → #55674 → #21538
  - American → #5421 → #81 → "l y S.A. de C.V. International" → #59 → American
- **A five-hop chain**: Darin Torres → Federated → #1354 → Ht Shipping → Yu gan BV Investment → #4942.
- **Nine people in the layer**, including Daniel Henderson, Traci Shields and Joseph Smith. Low-weight family edges tie them together, and several of them own companies in the layer, so they may be the beneficial owners.

**Confidence.** Medium for the layer as a whole, which is statistically clear. Low to Medium for each individual company, because the strongest edges in that evidence are also the least reliable ones.

---

## Q4: Reflection (≤ 300 words)

The hardest part was deciding which parts of the graph to trust. The extraction errors are not random. They form structure that can look like evidence:

- **Noise nodes.** About 10% of nodes are NLP debris: garbled text, words like "weeks" or "water" labelled as vessels, and 605 nodes with no type.
- **Ownership edges between non-people.** Family-relationship edges connect two non-people 46% of the time.
- **Duplicates.** 322 edge rows repeat the same source, target and type, and 124 pairs carry several relation types at once.
- **Hubs.** The hub core of 10 nodes holds 3.4% of all edge rows. Pairs such as Ocean Fisheries Llc and SeaSpray Wave SRL Solutions are joined by 40 edges of all four types (`meta.json` → `anomalies`).
- **Ids.** Integer and string ids collide (`77` vs `"77"`, 11 cases), so every id needs a type-aware key.
- **Data notes.** The notes declare 3,721 nodes and 7,422 edges. The file has 3,428 nodes and 11,069 edge rows, and one row misspells its weight field.

The most important signal, the edge weight, is not documented. Ownership direction is not documented either. That meant treating the low-weight layer as a hypothesis:

- I tested it against a random-edge baseline.
- I checked that it predicts held-out suspects better than degree does.
- I recorded every verdict with the weight of the edges it rests on.

A hub-heavy graph also hides structure in two ways. Many shortest paths run through the same hubs, and community detection is unstable. So the tool compares paths with and without hubs, and runs Louvain with several seeds instead of trusting one partition.
