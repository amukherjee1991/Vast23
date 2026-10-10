import { useMemo } from 'react'
import { useJson, type Loadable } from '../../lib/useJson'

/* Shapes of the MC1 JSON files (docs/data-contracts/mc1.md), trimmed to the
   fields this page reads. Node keys: integer ids carry a '#' prefix. */

export type EdgeType = 'ownership' | 'partnership' | 'membership' | 'family_relationship'

export interface NodeRec {
  k: string
  label: string
  type: string | null
  cls: string
  country: string | null
  deg: number
  comm: number
  low: number
  pr: number
  btw: number
}

export interface RubricSignal {
  id: string
  points: number
  basis_w: number | null
  detail: string
}
export interface Rubric {
  points: number
  solid_signals: number
  verdict: string
  confidence: string
  signals: RubricSignal[]
}
export interface Chain {
  path: string[]
  length: number
  min_w: number
  n_shortest: number
}
export interface Suspect {
  k: string
  label: string
  type: string | null
  cls: string
  verdict: string
  confidence: string
  rubric: Rubric
  deg: number
  own_out: number
  own_in: number
  btw: number
  in_low_layer: boolean
  percentiles: Record<string, number>
  ownership_chains: {
    upstream: { total: number }
    downstream: { total: number }
    to_suspects: { to: string; directed: Chain | null; undirected: Chain | null }[]
  }
  neighbors_1hop: { k: string; dir: string; types: string[]; n: number; wmin: number }[]
  keyword_context_2hop: { k: string; d: number }[]
}
export interface SuspectsFile {
  suspects: Suspect[]
  rubric: { signals: { id: string; max: number; desc: string }[]; thresholds: Record<string, number>; confidence_rule: string }
  node_table: NodeRec[]
}

export interface RawLink {
  s: string
  t: string
  type: EdgeType
  w: number
}
export interface LowconfFile {
  threshold: number
  n_edges: number
  n_nodes: number
  edge_types: Record<string, number>
  edge_types_all: Record<string, number>
  ownership_share: number
  ownership_share_all: number
  ownership_enrichment_p: number
  null_lcc_nodes: { mean: number; p95: number; max: number; draws: number }
  null_p_value: number
  weight_hist: { bins: number[]; all: number[]; by_type: Record<string, number[]> }
  suspects_in_layer: string[]
  suspect_distance_to_layer: Record<string, number>
  fisheye_node: { degree: number; edges_low_conf: number; edges_total: number; neighbors: string[] }
  ownership_cycles: string[][]
  ownership_longest_chain: { length: number; nodes: string[] }
  class_counts: Record<string, number>
  nodes: { k: string; low: number; cls: string }[]
  links: RawLink[]
  node_table: NodeRec[]
}

export interface EgoLink extends RawLink {
  wmin: number
  n: number
}
export interface Ego {
  suspect: string
  hops_counts: { undirected: number[]; out: number[]; in: number[] }
  full_2hop_size: number
  kept_2hop: number
  members: { k: string; d: number; role: string }[]
  links: EgoLink[]
}
export interface EgosFile {
  egos: Ego[]
  node_table: NodeRec[]
}

export interface PathsFile {
  pairs: { a: string; b: string; any: { length: number | null }; shared_1hop: string[] }[]
  null: {
    random_pair_distance: { mean: number; hist: Record<string, number> }
    suspect_mean_pair_distance: number
    degree_matched_4set_mean_distance: { mean: number; p05: number; frac_le_observed: number; draws: number }
  }
  node_table: NodeRec[]
}

export type Feature = 'low_conf' | 'proximity' | 'shared_nbrs' | 'ownership' | 'profile_sim' | 'redundancy' | 'fisheye_flag'
export interface Candidate {
  rank: number
  k: string
  score: number
  stability: number
  contrib: Record<Feature, number>
  why: Feature[]
  is_hub: boolean
  deg: number
  rubric: Rubric
  evidence: { nodes: string[]; path_to_suspect: string[] | null; links: { s: string; t: string; type: EdgeType; w: number; n: number }[] }
}
export interface CandidatesFile {
  candidates: Candidate[]
  features: { name: Feature; weight: number; desc: string }[]
  pool_size: number
  leave_one_out: { held_out: string; rank: number; pool: number; percentile: number; degree_baseline_rank: number }[]
  weight_perturbation: { draws: number; spearman_mean: number; spearman_min: number }
  ablation_top25_overlap: Record<Feature, number>
  node_table: NodeRec[]
}

export interface MetaFile {
  counts: { nodes: number; links: number; undirected_simple: number }
  node_types: Record<string, number>
  classes: Record<string, number>
  type_class_crosstab: Record<string, number>
  quirks: {
    declared_vs_actual: { notes_nodes: number; notes_edges: number; file_nodes: number; file_edges: number }
    duplicate_rows_same_s_t_type: number
    directed_pairs_multi_type: number
    id_string_collisions: string[]
  }
  suspects: string[]
  fisheye_node: string
}

export interface MC1 {
  suspects: SuspectsFile
  lowconf: LowconfFile
  egos: EgosFile
  paths: PathsFile
  cands: CandidatesFile
  meta: MetaFile
  /** Every node any file references, by key. */
  node: Map<string, NodeRec>
  /** Every relation any file carries, keyed "a\u0000b" in recorded direction. */
  edges: Map<string, { type: EdgeType; w: number }[]>
}

export const label = (d: MC1, k: string) => d.node.get(k)?.label ?? k.replace(/^#/, '')

/** All recorded relations between a and b, either direction, weakest first. */
export function between(d: MC1, a: string, b: string) {
  const fw = (d.edges.get(`${a}\u0000${b}`) ?? []).map((e) => ({ ...e, s: a, t: b }))
  const bw = (d.edges.get(`${b}\u0000${a}`) ?? []).map((e) => ({ ...e, s: b, t: a }))
  return [...fw, ...bw].sort((x, y) => x.w - y.w)
}

/** Load the six MC1 files the page uses and merge their node tables. */
export function useMC1(): Loadable<MC1> {
  const suspects = useJson<SuspectsFile>('mc1/suspects.json')
  const lowconf = useJson<LowconfFile>('mc1/lowconf.json')
  const egos = useJson<EgosFile>('mc1/egos.json')
  const paths = useJson<PathsFile>('mc1/paths.json')
  const cands = useJson<CandidatesFile>('mc1/candidates.json')
  const meta = useJson<MetaFile>('mc1/meta.json')
  return useMemo<Loadable<MC1>>(() => {
    const all = [suspects, lowconf, egos, paths, cands, meta]
    const err = all.find((s) => s.status === 'error')
    if (err && err.status === 'error') return err
    if (
      suspects.status !== 'ready' ||
      lowconf.status !== 'ready' ||
      egos.status !== 'ready' ||
      paths.status !== 'ready' ||
      cands.status !== 'ready' ||
      meta.status !== 'ready'
    )
      return { status: 'loading' }
    const node = new Map<string, NodeRec>()
    for (const f of [suspects.data, lowconf.data, egos.data, paths.data, cands.data]) for (const n of f.node_table) node.set(n.k, n)
    const edges = new Map<string, { type: EdgeType; w: number }[]>()
    const add = (s: string, t: string, type: EdgeType, w: number) => {
      const key = `${s}\u0000${t}`
      const list = edges.get(key) ?? []
      if (!list.some((e) => e.type === type)) list.push({ type, w })
      else list.forEach((e) => e.type === type && (e.w = Math.min(e.w, w)))
      edges.set(key, list)
    }
    egos.data.egos.forEach((g) => g.links.forEach((l) => add(l.s, l.t, l.type, l.wmin)))
    lowconf.data.links.forEach((l) => add(l.s, l.t, l.type, l.w))
    cands.data.candidates.forEach((c) => c.evidence.links.forEach((l) => add(l.s, l.t, l.type, l.w)))
    return {
      status: 'ready',
      data: {
        suspects: suspects.data,
        lowconf: lowconf.data,
        egos: egos.data,
        paths: paths.data,
        cands: cands.data,
        meta: meta.data,
        node,
        edges,
      },
    }
  }, [suspects, lowconf, egos, paths, cands, meta])
}

/** Edge-type colours, fixed across the page. */
export const EDGE_COLOR: Record<string, string> = {
  ownership: 'var(--series-3)',
  partnership: 'var(--series-1)',
  membership: 'var(--series-2)',
  family_relationship: 'var(--series-4)',
}
export const EDGE_LABEL: Record<string, string> = {
  ownership: 'Ownership',
  partnership: 'Partnership',
  membership: 'Membership',
  family_relationship: 'Family',
}
export const edgeColor = (t: string | null | undefined) => EDGE_COLOR[t ?? ''] ?? 'var(--rule-strong)'

/** Suspects in reading order, each with a fixed identity colour. */
export const SUSPECT_ORDER = ['#8327', '#979893388', 'Mar de la Vida OJSC', 'Oceanfront Oasis Inc Carriers'] as const
export const SUSPECT_COLOR: Record<string, string> = {
  '#8327': 'var(--series-1)',
  '#979893388': 'var(--series-2)',
  'Mar de la Vida OJSC': 'var(--series-3)',
  'Oceanfront Oasis Inc Carriers': 'var(--series-4)',
}
export const SHORT: Record<string, string> = {
  '#8327': '8327',
  '#979893388': '979893388',
  'Mar de la Vida OJSC': 'Mar de la Vida',
  'Oceanfront Oasis Inc Carriers': 'Oceanfront Oasis',
}
export const FISHEYE = 'FishEye International'
