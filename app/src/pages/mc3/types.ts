/* Shapes of the baked MC3 files (docs/data-contracts/mc3.md). */

export interface Table<C extends string = string> {
  columns: C[]
  rows: (string | number | null | string[])[][]
}

export interface CompanyNode {
  id: string
  label: string
  kind: 'company'
  countries: string[]
  revenue: number | null
  fish_label: string
  product: string
  n_records: number
  registered: boolean
  cluster: string
  name_fish: boolean
  name_product_mismatch: boolean
  degree: number
}
export interface PersonNode {
  id: string
  label: string
  kind: 'person'
  n_companies: number
  owner_of: number
  contact_of: number
  degree: number
  common_surname: boolean
}
export type MNode = CompanyNode | PersonNode
export interface MLink {
  source: string
  target: string
  type: 'owner' | 'contact' | 'both'
}

export interface SpaceSummary {
  name: string
  n_companies: number
  k: number
  silhouette: number
  k_curve: Record<string, { silhouette: number; stability: number; score: number }>
  mean_stability: number
}

export interface Meta {
  raw: { nodes: number; links: number }
  cleaning: Record<string, number | string>
  components: Record<string, number>
  products: { fish_label_counts: Record<string, number>; informative_texts: number; fishing_share_of_informative: number }
  similarity: { spaces: { T: SpaceSummary; S: SpaceSummary } }
  persons: { owners_by_companies_owned: Record<string, number>; owners_per_company_hist: Record<string, number> }
}

export interface CollisionTest {
  persons_removed: number
  largest_remaining: number
  second_remaining: number
  random_control_largest: number[]
}
export interface GroupsOverview {
  component_size_histogram: { size: number; count: number }[]
  giant_component: {
    id: string
    n_nodes: number
    n_companies: number
    n_persons: number
    louvain_parts: number
    name_collision_robustness: {
      collision_by_companies_linked: Record<string, { persons: number; common_surname_share: number }>
      drop_top10_surnames: CollisionTest
      drop_top50_surnames: CollisionTest
    }
  }
  flag_counts: Record<string, number>
  units: Table
}

export interface Reason {
  feature: string
  label: string
  value: number
  median: number
  robust_z: number
  direction: 'high' | 'low'
}
export interface Anomaly {
  rank: number
  id: string
  parent: string | null
  anomaly_pct: number
  investigate_score: number
  features: Record<string, number | string[] | null>
  reasons: Reason[]
  flags: { flag: string; text: string }[]
  similar_groups: { id: string; cosine: number; anomaly_pct: number }[]
  truncated: boolean
  nodes: MNode[]
  links: MLink[]
}

export interface Cluster {
  cluster: string
  space: 'text' | 'structure'
  label: string
  size: number
  top_terms: string[]
  key_features: { feature: string; mean_z: number }[]
  fishing_rate: number
  adjacent_rate: number
  mean_silhouette: number
  within_cosine: number
  stability_jaccard: number
  mean_margin: number
  confidence: string
  members_sample: { name: string; cos_to_centroid: number; margin: number; countries: string[]; product: string }[]
}
export interface Clusters {
  spaces: { T: SpaceSummary; S: SpaceSummary }
  clusters: Cluster[]
  embedding: Table
}

export interface OwnerRow {
  person: string
  n_companies: number
  owner_of: number
  contact_of: number
  countries: string[]
  groups: string[]
  list: string
  common_surname: boolean
  name_collision_risk: string
  surname_frequency: number
}
export interface OwnersTop {
  persons: OwnerRow[]
  companies_most_owners: {
    company: string
    n_owners: number
    n_contacts: number
    countries: string[]
    fish_label: string
    product: string
    group: string
    owners_with_other_companies: number
  }[]
}

export interface InvestGroup {
  rank: number
  id: string
  parent: string | null
  investigate_score: number
  verdict: string
  confidence: string
  verdict_reasons: string[]
  strong_flags: string[]
  anomaly_pct: number
  flag_score: number
  iuu_relevance: number
  n_companies: number
  n_persons: number
  countries: string[]
  fish_share: number | null
  unknown_product_share: number
  collision_share: number
  key_companies: string[]
  evidence: string[]
  similar_groups: { id: string; cosine: number; anomaly_pct: number }[]
  subgraph: { truncated: boolean; n_total_nodes: number; nodes: MNode[]; links: MLink[] }
}
export interface Investigate {
  weights: { anomaly_pct: number; flag_score: number; iuu_relevance: number }
  verdict_counts: Record<string, number>
  groups: InvestGroup[]
}

/** Turn a columnar table into row objects. */
export function rowsOf<T>(t: Table): T[] {
  return t.rows.map((r) => Object.fromEntries(t.columns.map((c, i) => [c, r[i]])) as T)
}

export interface UnitRow {
  id: string
  parent: string | null
  n_nodes: number
  n_companies: number
  n_persons: number
  n_countries: number
  revenue_total: number | null
  unknown_product_share: number
  fish_share: number | null
  max_owners_per_company: number
  max_companies_per_person: number
  cross_border_owners: number
  shell_like_companies: number
  iuu_relevance: number
  anomaly_pct: number
  investigate_score: number
  flags: string[]
}

export const FLAG_LABEL: Record<string, string> = {
  ownership_fragmentation: 'Ownership fragmentation',
  serial_owner: 'Serial owner',
  cross_border_control: 'Cross-border control',
  multi_jurisdiction_duplicate: 'Registered in several countries',
  shell_like: 'Shell-like',
  unregistered_entities: 'Unregistered companies',
  dual_roles: 'Owner is also contact',
  name_product_mismatch: 'Name and product disagree',
}
