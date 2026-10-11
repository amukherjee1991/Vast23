import { useEffect, useState } from 'react'
import { loadJson, type Loadable } from '../../lib/useJson'

/* Types for app/public/data/mc2/*.json (see docs/data-contracts/mc2.md). */

export type BundleVerdict = 'Reliable' | 'Questionable' | 'Unreliable'
export type PairVerdict = 'Suspect' | 'Possible' | 'Insufficient evidence' | 'Unlikely'
export type Category = 'one_off' | 'short_burst' | 'seasonal' | 'abrupt_stop' | 'fading' | 'ramping' | 'steady' | 'intermittent'
export type Role = 'shipper' | 'receiver'

export interface Meta {
  months: string[]
  edges_raw: number
  edges_deduplicated: number
  exact_duplicates_removed: number
  shippers: number
  receivers: number
  companies: number
  both_roles: number
  pairs: number
  hscodes: number
  fish_edges: number
  fish_share: number
  headline: {
    bundle_verdicts: Record<string, BundleVerdict>
    reliable_links_added: number
    successor_pairs: Record<PairVerdict, number>
    suspect_companies: string[]
  }
  value_fields: { valueofgoodsusd_present: number; valueofgoods_omu_present: number; volumeteu_present: number }
}

export interface Timeline {
  months: string[]
  shipments: number[]
  fish_shipments: number[]
  fish_share: number[]
  calendar_profile: { months: string[]; all_index: number[]; fish_index: number[] }
}

export interface CompaniesTop {
  lifespan_histogram: {
    bins: number[]
    bin_labels: string[]
    shipper: number[]
    shipper_fish_majority: number[]
    receiver: number[]
    receiver_fish_majority: number[]
    shipper_median_span: number
    receiver_median_span: number
    shipper_single_month_share: number
    receiver_single_month_share: number
  }
  lifecycle_counts: Record<Role, Record<string, number>>
  lifecycle_counts_fish_majority: Record<Role, Record<string, number>>
}

export interface Exemplar {
  source: string
  target: string
  shipments: number
  first_month: number
  last_month: number
  fish_share: number
  monthly: number[]
}
export interface PatternCat {
  category: Category
  definition: string
  pairs: number
  shipments: number
  fish_pairs: number
  median_span_months: number | null
  median_shipments: number | null
  aggregate_monthly: number[]
  exemplars: Exemplar[]
}
export interface Patterns {
  n_pairs: number
  reciprocal_pairs: number
  categories: PatternCat[]
  fish_vs_all_share: Record<Category, { all: number; fish: number }>
  kmeans_check: { weighted_purity: number; n_pairs: number }
}

export type Component =
  | 'uniqueness'
  | 'novelty_balance'
  | 'schema'
  | 'date_validity'
  | 'month_fit'
  | 'endpoint_plausibility'
  | 'hs_mix_fit'
  | 'concentration_fit'
  | 'weight_realism'
  | 'value_realism'
  | 'node_consistency'

export interface BundleRec {
  bundle: string
  rank: number
  score: number
  verdict: BundleVerdict
  gates_failed: { metric: string; level: string; value: number; threshold: number; reason: string }[]
  components: Record<Component, number>
  metrics: {
    links: number
    distinct_links: number
    unique_rate: number
    exact_copy_rate: number
    new_links: number
    out_of_range_date_rate: number
    date_min: string
    date_max: string
    weight_present_rate: number
    hscode_5digit_rate: number
    fish_share: number
    top_target: string
    top_target_share: number
    node_country_agreement: number | null
    value_bias_dex: number | null
  }
  distributions: {
    hs4_top: { hs4: string; bundle_share: number; graph_2034_share: number }[]
    log10_weight: { bins: number[]; bundle: number[]; graph_2034_share: number[] }
    value_offset_dex: { bins: number[]; bundle: number[]; graph_omu_share: number[] }
    month: { labels: string[]; bundle: number[]; graph_2034_share: number[] }
  }
}
export interface Bundles {
  score_weights: Record<Component, number>
  thresholds: { Reliable: number; Questionable: number }
  component_definitions: Record<Component, string>
  bundles: BundleRec[]
  pair_overlap: { order: string[]; jaccard: number[][] }
}

export interface Impact {
  reliable_bundles: string[]
  links_added: number
  links_added_by_bundle: Record<string, number>
  links_added_new_pairs: number
  pair_patterns: {
    pairs_touched: number
    pairs_new: number
    category_changed: number
    transitions: { from: Category; to: Category; pairs: number }[]
    examples: { source: string; target: string; before: Category; after: Category; monthly_before: number[]; monthly_after: number[] }[]
  }
  months_2034: string[]
  monthly_2034_before: number[]
  monthly_2034_added: number[]
  fish_share_2034_before: number
  fish_share_2034_after: number
  revived_stoppers: { id: string; role: string; last_month_before: string; last_month_after: string; shipments: number }[]
  successor_verdicts_before: Record<PairVerdict, number>
  successor_verdicts_after_redetect: Record<PairVerdict, number>
  flagged_pair_status_after: { role: string; predecessor: string; successor: string; verdict_before: PairVerdict; verdict_after: string }[]
  top_targets_of_added_links: { id: string; links: number }[]
  sensitivity_with_questionable: { bundles: string[]; links_added: number; flagged_pairs_changed: unknown[]; verdict_counts: Record<PairVerdict, number> }
}

export interface Pair {
  rank: number
  role: Role
  predecessor: string
  successor: string
  verdict: PairVerdict
  confidence: 'High' | 'Medium' | 'Low'
  reason: string
  score: number
  mutual_best: boolean
  gap_months: number
  stop_month: string
  start_month: string
  metrics: Record<string, number>
  shared_partner_count: number
  fish_related: boolean
  pred: { shipments: number; first_month: number; last_month: number; active_months: number; fish_share: number }
  succ: { shipments: number; first_month: number; last_month: number; active_months: number; fish_share: number }
  evidence: {
    pred_monthly: number[]
    succ_monthly: number[]
    shared_partners: { id: string; pred_shipments: number; succ_shipments: number; pred_last_month: number; succ_first_month: number }[]
    pred_top_hs4: { hs4: string; shipments: number }[]
    succ_top_hs4: { hs4: string; shipments: number }[]
    pred_partner_count: number
    succ_partner_count: number
  }
}
export interface Suspects {
  population: Record<Role, { stoppers: number; starters: number; candidate_pairs_in_window: number }>
  gap_profile: Record<Role, { bins: number[]; pairs: number[]; pairs_per_gap_month: number[]; criteria: string }>
  pair_counts: { total: number; by_verdict: Record<PairVerdict, number> }
  pairs: Pair[]
  companies: {
    id: string
    role: string
    verdict: PairVerdict
    confidence: string
    links: { type: string; other: string; pair_rank: number; score: number; verdict: PairVerdict; confidence: string }[]
  }[]
  chains: { role: string; chain: string[] }[]
  score_histogram: { bins: number[]; counts: number[] }
}

export interface MC2 {
  meta: Meta
  tl: Timeline
  co: CompaniesTop
  pat: Patterns
  bun: Bundles
  imp: Impact
  sus: Suspects
}

export function useMC2(): Loadable<MC2> {
  const [state, setState] = useState<Loadable<MC2>>({ status: 'loading' })
  useEffect(() => {
    let live = true
    Promise.all([
      loadJson<Meta>('mc2/meta.json'),
      loadJson<Timeline>('mc2/timeline_overview.json'),
      loadJson<CompaniesTop>('mc2/companies_top.json'),
      loadJson<Patterns>('mc2/patterns.json'),
      loadJson<Bundles>('mc2/bundles.json'),
      loadJson<Impact>('mc2/bundle_impact.json'),
      loadJson<Suspects>('mc2/suspects.json'),
    ])
      .then(([meta, tl, co, pat, bun, imp, sus]) => live && setState({ status: 'ready', data: { meta, tl, co, pat, bun, imp, sus } }))
      .catch((e: Error) => live && setState({ status: 'error', error: e.message }))
    return () => {
      live = false
    }
  }, [])
  return state
}

/* ───────── vocabulary ───────── */

export const CAT_LABEL: Record<Category, string> = {
  one_off: 'One-off',
  short_burst: 'Short burst',
  seasonal: 'Seasonal',
  abrupt_stop: 'Abrupt stop',
  fading: 'Fading',
  ramping: 'Ramping',
  steady: 'Steady',
  intermittent: 'Intermittent',
}
/** Display order of the taxonomy: core first, fringe last. */
export const CAT_ORDER: Category[] = ['steady', 'fading', 'ramping', 'intermittent', 'abrupt_stop', 'seasonal', 'short_burst', 'one_off']

export const COMPONENT_LABEL: Record<Component, string> = {
  uniqueness: 'Distinct',
  novelty_balance: 'Novelty',
  schema: 'Schema',
  date_validity: 'Dates',
  month_fit: 'Month mix',
  endpoint_plausibility: 'History',
  hs_mix_fit: 'HS mix',
  concentration_fit: 'Spread',
  weight_realism: 'Weight',
  value_realism: 'Price',
  node_consistency: 'Countries',
}
export const COMPONENTS = Object.keys(COMPONENT_LABEL) as Component[]

/* Night-sea palette, fixed for the whole page (and the scroll story's canvases).
   Roles take the blue and rose lamps; teal and amber are reserved for goods. */
export const ROLE_COLOR: Record<Role, string> = { shipper: 'var(--series-4)', receiver: 'var(--series-3)' }
export const ROLE_LABEL: Record<Role, string> = { shipper: 'Shippers', receiver: 'Receivers' }
/** Fish vs all goods: fish burns amber everywhere; all goods are bioluminescent teal. */
export const FISH_COLOR = 'var(--series-2)'
export const ALL_COLOR = 'var(--series-1)'
/** Old vs new company in a handover. The old company is a moonlight outline
    over a faint fill (PRED_COLOR + PRED_STROKE); as a line it is moonlight,
    dashed (PRED_DASH). The new company is lit amber, solid. */
export const PRED_COLOR = 'color-mix(in oklab, var(--moon) 12%, transparent)'
export const PRED_STROKE = 'var(--moon)'
export const PRED_DASH = '4 3'
export const SUCC_COLOR = 'var(--lit-2)'
/** Wash behind a pressed claim's span (moonlight, low). */
export const CLAIM_WASH = 'var(--moon)'

export const BUNDLE_COLOR: Record<BundleVerdict, string> = {
  Reliable: 'var(--series-4)',
  Questionable: 'var(--series-2)',
  Unreliable: 'var(--series-3)',
}

export const HS_LABEL: Record<string, string> = {
  '0301': 'live fish',
  '0302': 'fresh fish',
  '0303': 'frozen fish',
  '0304': 'fillets',
  '0305': 'dried fish',
  '0306': 'crustaceans',
  '0307': 'molluscs',
  '0308': 'other invertebrates',
  '0309': 'fish meal',
  '1604': 'prepared fish',
  '1605': 'prepared crustaceans',
}

/** "2032-12" → "Dec 2032" */
export function monthName(s: string) {
  const [y, m] = s.split('-')
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1]} ${y}`
}
export const mIdx = (s: string) => {
  const [y, m] = s.split('-')
  return (+y - 2028) * 12 + (+m - 1)
}
/** Company ids that are bare negative numbers are anonymised receivers. */
export const nice = (id: string) => (/^-\d+$/.test(id) ? `receiver \u2212${id.slice(1)}` : id.replace(/\s{2,}/g, ' '))
export const short = (id: string, n = 26) => {
  const s = nice(id)
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
