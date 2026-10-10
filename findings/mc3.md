# MC3 findings: anomalous business structures

All numbers come from `pipeline/mc3_build.py` (deterministic: the output is byte-identical across runs and `PYTHONHASHSEED` values). JSON files are in `app/public/data/mc3/`. Bracketed names such as `[meta.cleaning]` point to the backing field.

**How the data is modelled.** Every link joins a company (source) to a person (target). We resolve the raw records into 16,697 company entities, 21,265 persons and 24,931 distinct company–person edges `[meta.cleaning]`. Before that we split 807 links that list several distinct source companies, and merge 374 company names that have duplicate records (145 of them in more than one country). 8,568 linked company names have no registry record at all `[meta.cleaning.unregistered_linked_companies]`. A *business group* is a connected component. There are 13,587 components, and the one giant component is split with seeded Louvain into 86 slices `[groups_overview.giant_component]`.

---

## Q1: Anomalies in the business groups (≤400 words)

**1. Name collisions create the giant component.** Persons are identified only by name. Among persons linked to one company, 21.9% have one of the 50 most common surnames; among persons linked to 5+ companies, 92.6% do. The giant component holds 7,093 nodes (1,506 companies). Removing the 651 multi-company persons with common surnames shrinks it to 306 nodes. Removing the same number of random multi-company persons leaves 495–1,918 nodes (10 trials) `[groups_overview.giant_component.name_collision_robustness]`. "John Smith" with 12 companies is most likely several people `[owners_top.persons]`. Confidence: **High**.

**2. Ownership fragmentation.** Most companies have 0–2 beneficial owners, but 107 have 20 or more and 38 have 30 or more `[meta.persons.owners_per_company_hist]`. The largest are *Vespuci Sandbar Sp Brothers* (119 owners), *Dutch Oyster Sagl Cruise ship* (90) and *Niger Bend AS Express* (71) `[owners_top.companies_most_owners]`. 82 groups carry this flag `[groups_overview.flag_counts]`. Confidence: **High**.

**3. Serial owners with uncommon names.** These are the person links least likely to be collisions. *Anna Wheeler* owns 7 companies, and *Jason Carrillo* is the contact for 6 of them (BG00148). Every one of the 7 is unregistered or declares no product. BG00148 has the highest anomaly score of the 2,347 scored groups `[anomalies[0]]`. Confidence: **Medium**, because two people with the same uncommon name remain possible.

**4. Registry inconsistencies.**
- 112 groups contain a distinctive (non-Faker) company name that is registered in several countries.
- 166 groups contain a fishing-named firm that declares an unrelated product, 274 companies in all. One example is *Dutch Oyster … Cruise ship*, which sells textiles.
- *Adriatic Squid* has one record for "Footwear" and another for "Seafood" `[investigate BG00177]`.

Confidence: **Medium**.

**5. Data-generation artefacts.** These are anomalies of the data, not of the businesses, and they should not be read as IUU signals `[meta.cleaning]`:
- 1,391 names contain a double space, which looks like a stripped word ("Greek ermen", "Gujarat ers").
- 113 product texts end in "source: freelance researcher".
- 11,420 Faker-style names ("Smith LLC", up to 40 records) all sit in country "ZH".

**Method.** We score each group with ≥3 nodes using an Isolation Forest over 16 size-normalised features. Each score is explained by robust z-scores (median/MAD), and each group also gets 8 rule flags `[anomalies.reasons, anomalies.flags]`.

---

## Q2: Finding and grouping similar businesses (≤400 words)

**Process.**
1. **Clean and resolve** records by name, as described above.
2. **Classify product text** with keyword rules into *fishing* (1,043), *adjacent*, meaning food, cold-chain or shipping (623), *other* (2,209) and *unknown* (12,822) `[meta.products]`. Spot checks look right: "Exotic Coldwater Prawns" is fishing, "Freight forwarding" is adjacent, "Gasket" is other. Fishing-related words in company names are a second, independent signal. 1,201 names have one, including pinyin such as *yú* (fish) and *diao yu* (angling) `[meta.cleaning.fish_name_companies]`.
3. **Use two similarity spaces.** 77% of companies have no product text. Putting them in one space with the rest lets the binary "no text" columns dominate the clustering and inflates the silhouette. So:
   - **Text space** (3,875 companies): LSA of TF-IDF on 1–2 word terms (60 dimensions) with weight 0.8, plus structural features with weight 0.2.
   - **Structure space** (12,822 companies): structural features only.
4. **Choose k** by silhouette × bootstrap stability. Silhouette alone keeps rising with k on sparse text. This gives k = 20 for text and k = 13 for structure `[clusters.spaces]`.

**Most important features.**
- **Product terms.** These drive the text clusters. Four of them are seafood segments: species (T09: salmon/tuna/shrimp), processed seafood (T12), generic fish products (T16) and frozen seafood (T20). Together they hold 861 companies, and at least 84% of each is labelled fishing `[clusters.clusters]`.
- **Ownership structure.** This means log owners, log contacts and *owner_reuse*, the most other companies held by any of a company's persons. It separates ownership-hub clusters such as S10 (high owners, high reuse) from single-contact shells such as S01.
- **Registry status and countries.** Unregistered, number of countries and duplicate records give S07 (96 companies with duplicate records in several countries).
- **Fishing or maritime words in names.** These give S09 and S12, fishing-named firms with no product text, and they are the only fishing signal for unregistered companies.
- **Revenue.** Revenue presence and level separate S03 and S13, high-revenue firms with no product.

Business groups are compared with the same idea: each group gets a feature vector of 16 robust z-scores, and cosine similarity finds its nearest groups `[anomalies.similar_groups]`.

---

## Q3: Measuring similarity within groupings and showing confidence (≤400 words)

We measure similarity inside a grouping in three ways, and none of them depends on the others:

1. **Cohesion:** the mean pairwise cosine between members (`within_cosine`) and the mean silhouette per cluster `[clusters.clusters]`.
2. **Stability:** clusterwise Jaccard (Hennig). We refit k-means on ten 80% subsamples and record how well each cluster is recovered (`stability_jaccard`).
3. **Membership certainty for each company:** `margin` = (d₂ − d₁) / d₂, where d₁ and d₂ are the distances to the nearest and second-nearest centroid. 0 means the company sits on a boundary. Margin is stored for every point on the map `[clusters.embedding]` and for every member sample.

**Confidence rule.** *High* = stability ≥ 0.85 and silhouette ≥ 0.25. *Medium* = stability ≥ 0.6 and silhouette ≥ 0.05. Otherwise *Low*.
- **Text space:** 2 High, 10 Medium, 8 Low (mean stability 0.60). The text-based segmentation is only moderately reliable. The seafood-products cluster T12 (silhouette 0.49, stability 0.83) is solid. Generic "fish products" (T16, stability 0.47) blurs into the other seafood clusters.
- **Structure space:** 8 High, 2 Medium, 3 Low (silhouette 0.63, mean stability 0.82). It is tighter, but much of that comes from binary features: it is easy to cluster, not rich.

**How we show confidence visually.**
- A t-SNE map per space (3,327 sampled companies). Points are coloured by cluster, and opacity (or a halo) encodes margin, so boundary companies fade.
- A cluster table with bullet bars for silhouette, stability and within-cosine, plus a confidence badge.
- A k-selection chart from the silhouette, stability and score curves `[clusters.spaces.*.k_curve]`, which shows why k was chosen.
- For groups, the investigation view shows confidence as a badge, and its stated reasons explain the badge `[investigate.verdict_reasons]`.

Confidence that the clusters are useful for segmentation: **Medium**. Confidence in fine-grained text clusters: **Low**.

---

## Q4: Are anomalous companies involved in illegal fishing? Which groups to investigate? (≤600 words)

**Short answer.** Structural anomalies and fishing activity overlap, but the overlap is moderate. The data cannot prove IUU fishing; it can only rank where to look. The ranking score is 0.45 × anomaly percentile + 0.30 × flag score + 0.25 × fishing relevance `[investigate.weights]`. Fishing relevance combines the fishing share of product text with fishing words in names. The product share is shrunk towards the corpus rate of 26.9% (a prior worth 2 companies), so that "1 of 1 informative companies is fishing" does not count as 100%. We list 30 groups, with at most 15 Louvain slices of the giant component `[investigate.selection]`. Each one gets a rule-based verdict:

| Verdict | Count |
|---|---|
| Suspect | 2 |
| Possible | 20 |
| Insufficient evidence | 7 |
| Unlikely | 1 |

`[investigate.verdict_counts]`

**Investigate first:**

1. **BG00177: Suspect, Medium confidence.** A whole component of 3 fishing-named companies (*Adriatic Squid*, *Brisa del Este Cargo Bonito*, *Sea Harvest Marine*).
   - One owner (*Angelica Wheeler*) and one contact (*Shelly Strong*) are shared across all three.
   - *Adriatic Squid* is registered in both Marebak and Oceanus, with conflicting "Footwear" and "Seafood" records.
   - Two of the three companies are unregistered.
   - Anomaly in the top 0.2% of groups, fishing relevance 0.91, no name-collision exposure.
2. **BG00001.061: Suspect, Medium confidence.** A 16-company slice around *Fisher Marine conservation CJSC* and *Adriatic Tuna Seabass BV*.
   - One company has 26 beneficial owners.
   - A person with an uncommon name links 4 companies.
   - 62% of the companies are unregistered.
   - It is a Louvain slice, so its boundary depends on community detection.
3. **BG00148: Possible, Medium confidence.** The highest-anomaly group in the data. The *Anna Wheeler* / *Jason Carrillo* pair controls 7 companies across Oceanus and Coralmarica (*Baltic Sprat*, *jīn qiāng yú AG*, *Náutica del Mar*…). None of the 7 declares a product, so the fishing link comes from names only.
4. **BG00069 and BG00071: Possible, Low confidence.** Small multi-jurisdiction clusters around *Yenisei Eel GmbH* (3 countries) and *Diao yu BV Logistics*. BG00069 would be Suspect, but half of the persons tying each group together have very common surnames.
5. **Single firms registered in several countries:** BG00861 *Diao yu bi sai SRL* and BG00386 *Delhi ers AS Holdings*, both Possible with Medium confidence.

**Where we can't conclude.** Several large groups have strong structure but no fishing link we can verify. BG00003 has 23 companies and 113 persons, its top company has 27 owners, and it is *Insufficient evidence* with **High** confidence. The ownership-hub slices (BG00001.001 around *Vespuci Sandbar*, 119 owners) sell wind-power equipment, textiles or beer. They look like shell or nominee structures, but not fishing ones. BG00016 is *Unlikely*: its fishing relevance is 0.20.

**Caveats.**
- 77% of companies have no product text, so most fishing relevance is inferred from names.
- Person identity is name-only, so collisions make shared control look larger than it is.
- The weights and thresholds are judgement calls. They are published in `investigate.json` and the data contract so that a reviewer can re-weight them.

Overall confidence that the Suspect and Possible groups are a better-than-random IUU lead list: **Medium**. Confidence that any single group is engaged in IUU fishing: **Low**.

---

## Q5: Reflection (≤300 words)

The hardest problem was identity, not anomaly detection. Persons are bare names, so a naïve connected-component analysis produces one 7,093-node "business group". That group is mostly a product of common names such as "Michael Johnson". The surname-removal test against a random control turned this suspicion into a measured result. Every later signal (serial owners, cross-border control) then had to be restricted to uncommon names, and confidence goes down when a group depends on collision-prone links.

The second lesson was about clustering mixed data. A single feature space reported a reassuring silhouette of 0.49, but that came from 77% of rows having an all-zero text vector. Splitting the data into a text space and a structure space, and choosing k by silhouette × bootstrap stability, gave lower but more honest numbers.

Reproducibility needed explicit work. `Graph.subgraph(set)` iterates in hash order, so Louvain returned 85 or 87 communities depending on the run. Rebuilding every graph with sorted insertion and breaking all ties by id made the outputs byte-identical.

Limits:
- The fishing classifier uses keywords, so it misses euphemisms.
- Names with stripped words ("Greek ermen") show that the data generator removed tokens. We only partly recover them, through fragment rules.
- The verdict rules are transparent but hand-set.

With more time, we would resolve persons using co-occurrence (two "John Smith"s who share no company are probably different people), validate the fishing labels against a hand-labelled sample, and run a sensitivity analysis of the investigation ranking under different weights.
