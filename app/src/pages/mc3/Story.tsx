import * as d3 from 'd3'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { StageKey, type StageKeyItem } from '../../components/Story'
import { GlowStage, type GlowEdge, type GlowLabel, type GlowNode, type GlowState } from '../../charts/GlowStage'
import { Scrolly, type ScrollyStep } from '../../components/Scrolly'
import { VerdictTag } from '../../components/Signals'
import { useTooltip } from '../../components/Tooltip'
import { useJson } from '../../lib/useJson'
import { fmt, toConfidence, toVerdict } from '../../lib/signals'
import type { Clusters, GroupsOverview, InvestGroup, Investigate, MNode } from './types'

/* The MC3 chapter's scroll story: the 7,093-node giant lit as a galaxy, its
   common names ignited, the break-up when they are removed, the random
   control, the two small groups that stay anomalous, and the seafood sky. */

/* Canvas colours: hex copies of tokens.css (series / lit / moon / other). */
const C = {
  teal: '#17a99c',
  tealLit: '#5ff2e2',
  amber: '#c4880c',
  amberLit: '#ffc95a',
  rose: '#e04870',
  roseLit: '#ff7a9a',
  blue: '#5a80f0',
  blueLit: '#9cb6ff',
  moon: '#e7eff6',
  dim: '#4f6578',
} as const

/* ───────── Data ───────── */

type GalaxyRow = [string, number, number, 0 | 1, 0 | 1, 0 | 1, number | null, number | null, number]
export interface GalaxyJson {
  aspect: number
  nodes: GalaxyRow[]
  edges: [number, number, 0 | 1][]
  slices: { id: string; size: number }[]
  before: { giant: number; edges: number }
  after: { giant: number; second: number; removed: number; remaining: number; components: number; fragments: number; fragments_singletons: number }
}

interface GalaxyModel {
  nodes: GlowNode[]
  edges: GlowEdge[]
  rows: GalaxyRow[]
  slices: GalaxyJson['slices']
  /** In the 306-node giant that survives the ablation. */
  inGiant: Uint8Array
  /** Nodes that carry the in-stage names of the break. */
  survivorAnchor: number
  fragAnchor: number
  /** Normalised distance from the sky's centre (0 centre … 1 rim). */
  rim: Float32Array
  johnSmith: number
  meta: GalaxyJson
}

function buildGalaxy(g: GalaxyJson): GalaxyModel {
  const rows = g.nodes
  // layout y grows upwards; flip it for the canvas
  const nodes: GlowNode[] = rows.map((r) => ({
    x: r[1],
    y: 1 - r[2],
    x2: r[6],
    y2: r[7] == null ? null : 1 - r[7],
    r: r[3] === 0 ? 1.55 : 1.05,
    color: r[3] === 0 ? C.teal : C.moon,
  }))
  const edges: GlowEdge[] = g.edges.map(([s, t]) => ({ s, t, color: C.teal, width: 0.6 }))
  // the giant that survives: union-find over edges between kept nodes
  const n = rows.length
  const parent = Int32Array.from({ length: n }, (_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  for (const [s, t] of g.edges) {
    if (rows[s][5] || rows[t][5]) continue
    const a = find(s)
    const b = find(t)
    if (a !== b) parent[a] = b
  }
  const size = new Map<number, number>()
  for (let i = 0; i < n; i++) if (!rows[i][5]) size.set(find(i), (size.get(find(i)) ?? 0) + 1)
  let best = -1
  let bestN = 0
  size.forEach((v, k) => {
    if (v > bestN) {
      bestN = v
      best = k
    }
  })
  const inGiant = new Uint8Array(n)
  for (let i = 0; i < n; i++) if (!rows[i][5] && find(i) === best) inGiant[i] = 1
  // Position B pulls the break apart so it reads at a glance: the survivor is
  // re-centred and opened up a little, and every fragment moves as one rigid
  // piece out past a dark moat (its direction from the centre is kept, its
  // distance remapped into an outer ring). Removed people keep their old
  // place, where they burn out as embers.
  const comp = new Map<number, { sx: number; sy: number; k: number }>()
  for (let i = 0; i < n; i++) {
    if (rows[i][5]) continue
    const r = find(i)
    const c = comp.get(r) ?? { sx: 0, sy: 0, k: 0 }
    c.sx += nodes[i].x2 as number
    c.sy += nodes[i].y2 as number
    c.k++
    comp.set(r, c)
  }
  const g0 = comp.get(best)!
  const gcx = g0.sx / g0.k
  const gcy = g0.sy / g0.k
  let dMax = 0
  comp.forEach((c, r) => {
    if (r !== best) dMax = Math.max(dMax, Math.hypot(c.sx / c.k - 0.5, c.sy / c.k - 0.5))
  })
  const R0 = 0.27
  const R1 = 0.48
  const shift = new Map<number, [number, number]>()
  comp.forEach((c, r) => {
    if (r === best) return
    const cx = c.sx / c.k - 0.5
    const cy = c.sy / c.k - 0.5
    const d = Math.hypot(cx, cy) || 1e-6
    const d2 = R0 + (d / (dMax || 1)) * (R1 - R0)
    shift.set(r, [cx * (d2 / d) - cx, cy * (d2 / d) - cy])
  })
  for (let i = 0; i < n; i++) {
    const nd = nodes[i]
    if (rows[i][5]) {
      nd.x2 = nd.x
      nd.y2 = nd.y
    } else if (inGiant[i]) {
      nd.x2 = 0.5 + ((nd.x2 as number) - gcx) * 1.35
      nd.y2 = 0.5 + ((nd.y2 as number) - gcy) * 1.35
    } else {
      const [sx, sy] = shift.get(find(i))!
      nd.x2 = (nd.x2 as number) + sx
      nd.y2 = (nd.y2 as number) + sy
    }
  }
  // anchors for the in-stage names: the survivor's right-most light, a fragment
  // on the lower right of the ring, and the most-linked removed name
  let survivorAnchor = -1
  let fragAnchor = -1
  let fragBest = Infinity
  for (let i = 0; i < n; i++) {
    if (inGiant[i]) {
      if (survivorAnchor < 0 || (nodes[i].x2 as number) > (nodes[survivorAnchor].x2 as number)) survivorAnchor = i
    } else if (!rows[i][5]) {
      const dd = Math.hypot((nodes[i].x2 as number) - 0.84, (nodes[i].y2 as number) - 0.86)
      if (dd < fragBest) {
        fragBest = dd
        fragAnchor = i
      }
    }
  }
  const rim = new Float32Array(n)
  let maxR = 0
  for (let i = 0; i < n; i++) {
    rim[i] = Math.hypot(nodes[i].x - 0.5, nodes[i].y - 0.5)
    maxR = Math.max(maxR, rim[i])
  }
  for (let i = 0; i < n; i++) rim[i] /= maxR || 1
  return {
    nodes,
    edges,
    rows,
    slices: g.slices,
    inGiant,
    survivorAnchor,
    fragAnchor,
    rim,
    johnSmith: rows.findIndex((r) => r[0] === 'P|John Smith'),
    meta: g,
  }
}

/* Two evidence groups, each drawn as a fan: people in a column on the left
   (labels to their left), companies in a column on the right (labels to their
   right), so every tie runs left to right and no label crosses another. Set A
   puts the groups side by side (wide stages), set B stacks them (tall ones). */
interface EvidenceModel {
  nodes: GlowNode[]
  edges: GlowEdge[]
  info: ({ kind: 'node'; n: MNode; group: InvestGroup } | { kind: 'anchor'; group: InvestGroup })[]
  labels: GlowLabel[]
  groups: InvestGroup[]
}

const EVIDENCE = [
  { id: 'BG00177', color: C.rose, lit: C.roseLit },
  { id: 'BG00148', color: C.amber, lit: C.amberLit },
] as const

const short = (s: string, n = 24) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

function buildEvidence(inv: Investigate): EvidenceModel | null {
  const groups = EVIDENCE.map((e) => inv.groups.find((g) => g.id === e.id))
  if (groups.some((g) => !g)) return null
  const gs = groups as InvestGroup[]
  const nodes: GlowNode[] = []
  const edges: GlowEdge[] = []
  const info: EvidenceModel['info'] = []
  const labels: GlowLabel[] = []
  const COL = 0.16 // gap between the two columns
  const ROW = 0.05 // vertical step between companies
  gs.forEach((g, gi) => {
    const sub = g.subgraph
    const deg = new Map<string, number>()
    for (const l of sub.links) {
      deg.set(l.source, (deg.get(l.source) ?? 0) + 1)
      deg.set(l.target, (deg.get(l.target) ?? 0) + 1)
    }
    const people = sub.nodes.filter((n) => n.kind === 'person')
    const firms = sub.nodes.filter((n) => n.kind === 'company')
    // hubs first so the busiest people sit at the top and bottom of the column
    people.sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0) || a.label.localeCompare(b.label))
    const order = [...people.filter((_, i) => i % 2 === 0), ...people.filter((_, i) => i % 2 === 1).reverse()]
    const span = (firms.length - 1) * ROW
    // people get at least 0.04 apart so their labels never touch
    const pspan = Math.max(span, (order.length - 1) * 0.04)
    const py = new Map<string, number>()
    order.forEach((p, i) => py.set(p.id, order.length === 1 ? 0 : -pspan / 2 + (pspan * i) / (order.length - 1)))
    // companies sorted by the mean height of their people (barycentre)
    const bary = (f: MNode) => {
      const ys = sub.links.filter((l) => l.source === f.id || l.target === f.id).map((l) => py.get(l.source === f.id ? l.target : l.source) ?? 0)
      return ys.length ? d3.mean(ys)! : 0
    }
    firms.sort((a, b) => bary(a) - bary(b) || a.label.localeCompare(b.label))
    const pos = new Map<string, [number, number]>()
    order.forEach((p) => pos.set(p.id, [-COL / 2, py.get(p.id)!]))
    firms.forEach((f, i) => pos.set(f.id, [COL / 2, -span / 2 + i * ROW]))
    const ca = gi === 0 ? [0.25, 0.5] : [0.75, 0.5]
    const cb = gi === 0 ? [0.5, 0.3] : [0.5, 0.74]
    const idx = new Map<string, number>()
    for (const n of sub.nodes) {
      const [dx, dy] = pos.get(n.id)!
      const hub = n.kind === 'person' && n.n_companies >= 3
      idx.set(n.id, nodes.length)
      nodes.push({
        x: ca[0] + dx,
        y: ca[1] + dy,
        x2: cb[0] + dx,
        y2: cb[1] + dy,
        r: n.kind === 'company' ? 3.2 : hub ? 2.8 : 1.9,
        color: n.kind === 'company' ? EVIDENCE[gi].color : C.moon,
      })
      info.push({ kind: 'node', n, group: g })
      labels.push(
        n.kind === 'company'
          ? { i: nodes.length - 1, text: short(n.label, 22), lamp: true, align: 'right' }
          : { i: nodes.length - 1, text: short(n.label, 18), align: 'left' },
      )
    }
    for (const l of sub.links) {
      const a = idx.get(l.source)
      const b = idx.get(l.target)
      if (a == null || b == null) continue
      edges.push({ s: a, t: b, color: EVIDENCE[gi].lit, width: 1.2, dash: l.type === 'contact' })
    }
    // a lightless anchor above the group carries its name and verdict
    const top = -Math.max(span, pspan) / 2 - 0.075
    nodes.push({ x: ca[0] - COL / 2, y: ca[1] + top, x2: cb[0] - COL / 2, y2: cb[1] + top, r: 0, color: EVIDENCE[gi].lit })
    info.push({ kind: 'anchor', group: g })
    labels.push({ i: nodes.length - 1, text: `${g.id} · ${g.verdict}`, lamp: true })
  })
  return { nodes, edges, info, labels, groups: gs }
}

/* The text-space sky: sampled companies, the four seafood clusters lit. */
const SEAFOOD = [
  { id: 'T09', color: C.teal, lit: C.tealLit },
  { id: 'T12', color: C.amber, lit: C.amberLit },
  { id: 'T16', color: C.rose, lit: C.roseLit },
  { id: 'T20', color: C.blue, lit: C.blueLit },
] as const

interface SkyModel {
  nodes: GlowNode[]
  info: { name: string; cluster: string; fish: string }[]
  keys: { id: string; color: string; text: string; size: number }[]
  lens: Uint8Array
  seafood: number
}

function buildSky(c: Clusters): SkyModel {
  const cols = c.embedding.columns
  const ix = (k: string) => cols.indexOf(k)
  const rows = c.embedding.rows.filter((r) => r[ix('space')] === 'text')
  const lensIdx = new Map<string, number>(SEAFOOD.map((s, i) => [s.id, i]))
  const nodes: GlowNode[] = []
  const info: SkyModel['info'] = []
  const lens: number[] = []
  const acc = SEAFOOD.map(() => ({ xs: [] as number[], ys: [] as number[] }))
  for (const r of rows) {
    const cl = String(r[ix('cluster')])
    const li = lensIdx.get(cl)
    const x = 0.04 + Number(r[ix('x')]) * 0.92
    const y = 0.04 + (1 - Number(r[ix('y')])) * 0.92
    nodes.push({ x, y, r: li == null ? 1.1 : 1.6, color: li == null ? C.dim : SEAFOOD[li].color })
    info.push({ name: String(r[ix('name')]), cluster: cl, fish: String(r[ix('fish_label')]) })
    lens.push(li == null ? 0 : 1)
    if (li != null) {
      acc[li].xs.push(x)
      acc[li].ys.push(y)
    }
  }
  const byId = new Map(c.clusters.map((k) => [k.cluster, k]))
  const keys: SkyModel['keys'] = []
  SEAFOOD.forEach((s, li) => {
    const a = acc[li]
    if (!a.xs.length) return
    const cl = byId.get(s.id)
    // anchor just past the bulk of the island (robust to stray members)
    keys.push({ id: s.id, color: s.lit, text: cl ? cl.top_terms.slice(0, 3).join(' · ') : '', size: cl?.size ?? a.xs.length })
  })
  const seafood = SEAFOOD.reduce((t, s) => t + (byId.get(s.id)?.size ?? 0), 0)
  return { nodes, info, keys, lens: Uint8Array.from(lens), seafood }
}

/* ───────── Framing ───────── */

type Box = [number, number, number, number]
const PAD = 28 // GlowStage's own inset

/** Camera that maps the layout box `b` into the pixel region `r` of a w×h stage. */
function frame(b: Box, w: number, h: number, r: Box): Box {
  const bw = b[2] - b[0]
  const bh = b[3] - b[1]
  const rw = r[2] - r[0]
  const rh = r[3] - r[1]
  const k = Math.max(1e-6, Math.min(rw / bw, rh / bh))
  const sx = r[0] + (rw - bw * k) / 2
  const sy = r[1] + (rh - bh * k) / 2
  const cx0 = b[0] - (sx - PAD) / k
  const cy0 = b[1] - (sy - PAD) / k
  return [cx0, cy0, cx0 + (w - 2 * PAD) / k, cy0 + (h - 2 * PAD) / k]
}

function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const set = () => setBox((b) => (b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }))
    set()
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, box] as const
}

const nameOf = (id: string) => id.slice(2)

/* ───────── Opener: the galaxy behind the chapter title ───────── */

/** Lamps named in the opener's sky. Colours are hex copies of tokens.css. */
const OPENER_NAMES = [
  { id: 'P|John Smith', text: 'John Smith', sub: '12 companies, likely several people', color: C.amberLit, ring: C.amberLit, dx: -22, dy: -34, phone: true },
  { id: 'P|John Williams', text: 'John Williams', sub: '10 companies', color: C.amberLit, ring: C.amberLit, dx: -20, dy: 30, phone: false },
  { id: 'C|Fisher Marine conservation CJSC Transportation', text: 'Fisher Marine conservation', sub: 'Suspect · BG00001.061', color: C.roseLit, ring: C.rose, dx: 26, dy: 34, phone: true },
] as const

export function GalaxyBackdrop() {
  const data = useJson<GalaxyJson>('mc3/galaxy.json')
  const model = useMemo(() => (data.status === 'ready' ? buildGalaxy(data.data) : null), [data])
  const [ref, { w, h }] = useBox<HTMLDivElement>()
  const state = useMemo<GlowState | null>(() => {
    if (!model || !w) return null
    // the band gives the galaxy its own region: fill it, centred
    const region: Box = [8, 8, w - 8, h - 8]
    // name the structures in the sky: the borrowed names that hold it together
    // (amber lamps) and the one suspect slice inside it (a rose verdict ring)
    const idx = (name: string) => model.rows.findIndex((r) => r[0] === name)
    const names = OPENER_NAMES.map((o) => ({ ...o, i: idx(o.id) })).filter((o) => o.i >= 0)
    const lit = new Set(names.map((o) => o.i))
    const narrow = w < 560
    return {
      nodeAlpha: (i) => (lit.has(i) ? 1 : model.rows[i][3] === 0 ? 0.8 : 0.45),
      nodeScale: (i) => (lit.has(i) ? 2.4 : 1),
      nodeColor: (i) => names.find((o) => o.i === i)?.color ?? model.nodes[i].color,
      edgeAlpha: () => 0.2,
      camera: frame([0.02, 0.06, 0.98, 0.94], w, h, region),
      rings: names.map((o) => ({ i: o.i, color: o.ring, r: 10 })),
      labels: names
        .filter((o) => !narrow || o.phone)
        .map((o) => ({ i: o.i, text: o.text, sub: o.sub, serif: true, color: o.color, dx: o.dx, dy: o.dy, align: o.dx < 0 ? ('left' as const) : ('right' as const) })),
    }
  }, [model, w, h])
  return (
    <div ref={ref} className="mc3-backdrop">
      {model && state && (
        <GlowStage
          nodes={model.nodes}
          edges={model.edges}
          state={state}
          intro="bloom"
          bloom={3}
          ariaLabel={`The giant business group BG00001 drawn as a galaxy: ${fmt.int.format(model.rows.length)} lights, companies in teal and people in moonlight. Lit and named: John Smith and John Williams, common names that join many companies, and Fisher Marine conservation, a Suspect group inside it.`}
        />
      )}
    </div>
  )
}

/* ───────── The scroll story ───────── */

type Scene = 'galaxy' | 'evidence' | 'sky'
const SCENE_OF: Scene[] = ['galaxy', 'galaxy', 'galaxy', 'galaxy', 'evidence', 'sky']

export function MC3Story({ onOpen }: { onOpen: (id: string) => void }) {
  const gal = useJson<GalaxyJson>('mc3/galaxy.json')
  const ov = useJson<GroupsOverview>('mc3/groups_overview.json')
  const g = gal.status === 'ready' ? gal.data : null
  const nc = ov.status === 'ready' ? ov.data.giant_component.name_collision_robustness : null
  const random = nc?.drop_top50_surnames.random_control_largest ?? []
  const lo = random.length ? d3.min(random)! : 495
  const hi = random.length ? d3.max(random)! : 1918
  const n = (v: number | undefined, f: number) => fmt.int.format(v ?? f)

  const steps: ScrollyStep[] = [
    {
      id: 'giant',
      title: `One business group of ${n(g?.before.giant, 7093)}`,
      body: (
        <>
          <p>
            Joined naively, FishEye’s register forms one connected business group: <Swatch c="teal" /> 1,506 companies and{' '}
            <Swatch c="moon" /> 5,587 people, every one reachable from every other.
          </p>
          <p>Companies never link to companies here. Every thread runs through a person, so people hold the whole galaxy together.</p>
        </>
      ),
    },
    {
      id: 'names',
      title: 'People are known only by name',
      body: (
        <>
          <p>
            Of the people linked to one company, 21.9% carry one of the 50 most common surnames. Of those linked to five or more, <strong>92.6%</strong> do.
          </p>
          <p>
            The <Swatch c="amber" /> {n(g?.after.removed, 651)} multi-company people with a common surname are lit. “John Smith”, with 12 companies, is most likely
            several people.
          </p>
        </>
      ),
    },
    {
      id: 'break',
      title: 'Take them out and the galaxy breaks',
      body: (
        <>
          <p>
            Remove those {n(g?.after.removed, 651)} names and the giant falls into {n(g?.after.components, 1083)} pieces. What stays connected is{' '}
            <strong>{n(g?.after.giant, 306)} nodes</strong>; the next largest holds {n(g?.after.second, 288)}.
          </p>
          <p>Most of the biggest business group in Oceanus was name collisions.</p>
        </>
      ),
    },
    {
      id: 'random',
      title: 'Chance does not do this',
      body: (
        <>
          <p>
            Remove {n(g?.after.removed, 651)} <em>random</em> multi-company people instead, and the largest piece keeps {fmt.int.format(lo)} to {fmt.int.format(hi)} nodes
            across 10 trials.
          </p>
          <p>The collapse to {n(g?.after.giant, 306)} comes from the names, not from taking people out.</p>
        </>
      ),
    },
    {
      id: 'small',
      title: 'What stays anomalous is small',
      body: (
        <>
          <p>
            Two separate groups of under ten nodes each are the clearest leads. <Swatch c="rose" /> <strong>BG00177</strong>: Angelica Wheeler owns Adriatic Squid
            and two sister firms, all fishing-named, across Marebak and Oceanus. <Swatch c="amber" /> <strong>BG00148</strong>: Anna Wheeler owns seven companies and
            Jason Carrillo is the contact for six. None declares a product.
          </p>
          <p className="mc3-step__acts">
            <button type="button" className="chip" onClick={() => onOpen('BG00177')}>
              Open BG00177
            </button>
            <button type="button" className="chip" onClick={() => onOpen('BG00148')}>
              Open BG00148
            </button>
          </p>
        </>
      ),
    },
    {
      id: 'sky',
      title: 'Similar firms, by what they sell',
      body: (
        <>
          <p>
            Mapped by product text, seafood sellers form four neighbouring islands: species, processed, generic fish and frozen. 861 companies, each cluster at least
            84% fishing.
          </p>
          <p>The questions below test how firm those borders are, and which groups FishEye should open first.</p>
        </>
      ),
    },
  ]

  return (
    <div className="chapter-story mc3-story">
      <Scrolly steps={steps} label="The broken galaxy: how the giant business group falls apart" stage={(i) => <StoryStage step={i} lo={lo} hi={hi} />} />
    </div>
  )
}

function Swatch({ c }: { c: 'teal' | 'moon' | 'amber' | 'rose' }) {
  return <span className={`mc3-swatch mc3-swatch--${c}`} aria-hidden />
}

function StoryStage({ step, lo, hi }: { step: number; lo: number; hi: number }) {
  const gal = useJson<GalaxyJson>('mc3/galaxy.json')
  const inv = useJson<Investigate>('mc3/investigate.json')
  const clu = useJson<Clusters>('mc3/clusters.json')
  const galaxy = useMemo(() => (gal.status === 'ready' ? buildGalaxy(gal.data) : null), [gal])
  const evidence = useMemo(() => (inv.status === 'ready' ? buildEvidence(inv.data) : null), [inv])
  const sky = useMemo(() => (clu.status === 'ready' ? buildSky(clu.data) : null), [clu])
  const [ref, { w, h }] = useBox<HTMLDivElement>()
  const scene = SCENE_OF[step] ?? 'galaxy'
  const tip = useTooltip()
  useEffect(() => tip.hide(), [step, tip])
  // the stage has its own column; keep the corners clear for the key and count
  const region: Box = [8, 8, w - 8, h - (w > 560 ? 40 : 56)]

  return (
    <div ref={ref} className="mc3-stage">
      {w > 0 && galaxy && <GalaxyScene model={galaxy} step={Math.min(step, 3)} w={w} h={h} region={region} on={scene === 'galaxy'} />}
      {w > 0 && evidence && <EvidenceScene model={evidence} w={w} h={h} region={region} on={scene === 'evidence'} />}
      {w > 0 && sky && <SkyScene model={sky} w={w} h={h} region={region} on={scene === 'sky'} />}
      <ControlStrip on={step === 3} giant={galaxy?.meta.after.giant ?? 306} asFound={galaxy?.meta.before.giant ?? 7093} lo={lo} hi={hi} />
      {scene === 'evidence' && evidence && (
        <div className="stage-head mc3-verdicts">
          {evidence.groups.map((g) => (
            <VerdictTag key={g.id} verdict={toVerdict(g.verdict)} confidence={toConfidence(g.confidence)} size={26} compact={w < 640} />
          ))}
        </div>
      )}
      <div className="stage-foot">
        {scene === 'sky' && sky ? (
          <StageKey column items={sky.keys.map((k) => ({ color: k.color, label: <><b>{k.id}</b> {k.text}</> }))} />
        ) : (
          <StageKey items={KEYS[step] ?? []} />
        )}
        <p className="stage-count">{COUNTS(galaxy?.meta, sky?.seafood, lo, hi)[step]}</p>
      </div>
    </div>
  )
}

const KEYS: StageKeyItem[][] = [
  [
    { color: C.teal, label: 'Companies' },
    { color: C.moon, label: 'People' },
  ],
  [
    { color: C.amberLit, label: 'Common surname, 2+ companies' },
    { color: C.teal, label: 'Companies' },
    { color: C.moon, label: 'People' },
  ],
  [
    { color: C.tealLit, label: 'Still connected', ring: true },
    { color: C.dim, label: 'Fragments' },
    { color: C.amber, label: 'Removed, burning out' },
  ],
  [
    { color: C.tealLit, label: 'The surviving core', ring: true },
    { color: C.dim, label: 'Fragments' },
  ],
  [
    { color: C.rose, label: 'BG00177 companies' },
    { color: C.amber, label: 'BG00148 companies' },
    { color: C.moon, label: 'People' },
  ],
]

function COUNTS(m: GalaxyJson | undefined, seafood: number | undefined, lo: number, hi: number): ReactNode[] {
  const f = (v: number | undefined, d: number) => fmt.int.format(v ?? d)
  return [
    <><b>{f(m?.before.giant, 7093)}</b> nodes in one group</>,
    <><b>{f(m?.after.removed, 651)}</b> common names lit</>,
    <><b>{f(m?.after.components, 1083)}</b> pieces · largest <b>{f(m?.after.giant, 306)}</b></>,
    <><b>{f(m?.after.giant, 306)}</b> vs <b>{fmt.int.format(lo)}–{fmt.int.format(hi)}</b> at random</>,
    <><b>2</b> groups · under 10 nodes each</>,
    <><b>{f(seafood, 861)}</b> seafood companies</>,
  ]
}

function Layer({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <div className="mc3-scene" data-on={on} aria-hidden={!on}>
      {children}
    </div>
  )
}

function useHoverTip(content: (i: number) => ReactNode) {
  const tip = useTooltip()
  const fn = useRef(content)
  fn.current = content
  return useMemo(
    () => (i: number | null, e?: PointerEvent) => {
      if (i == null || !e || e.pointerType === 'touch') return tip.hide()
      tip.show(e, fn.current(i))
    },
    [tip],
  )
}

function GalaxyScene({ model, step, w, h, region, on }: { model: GalaxyModel; step: number; w: number; h: number; region: Box; on: boolean }) {
  const { rows, inGiant, rim, johnSmith } = model
  const cam = useMemo(() => frame([0, 0, 1, 1], w, h, region), [w, h, region[0], region[1], region[2], region[3]]) // eslint-disable-line react-hooks/exhaustive-deps
  const states = useMemo<GlowState[]>(() => {
    const co = (i: number) => rows[i][3] === 0
    const gone = (i: number) => rows[i][5] === 1
    const m = model.meta.after
    const narrow = w < 560
    // names in the stage: the survivor, the scattered pieces, the removed names
    const breakLabels = (embers: boolean): GlowLabel[] => [
      { i: model.survivorAnchor, text: `${fmt.int.format(m.giant)} still joined`, serif: true, color: C.tealLit, dx: narrow ? 10 : 18, dy: narrow ? -26 : -18 },
      { i: model.fragAnchor, text: `${fmt.int.format(m.components)} pieces`, serif: true, color: C.moon, sub: narrow ? undefined : `the largest holds ${fmt.int.format(m.second)}`, dx: -8, dy: -22, align: 'left', minAlpha: 0.05 },
      ...(embers && johnSmith >= 0
        ? [{ i: johnSmith, text: `${fmt.int.format(m.removed)} names removed`, serif: true, color: C.amberLit, dx: -14, dy: -30, align: 'left' as const, minAlpha: 0.1 }]
        : []),
    ]
    return [
      // 1 · the whole giant
      {
        nodeAlpha: (i) => (co(i) ? 0.85 : 0.5),
        edgeAlpha: () => 0.22,
        camera: cam,
      },
      // 2 · common names ignite
      {
        nodeAlpha: (i) => (gone(i) ? 1 : co(i) ? 0.3 : 0.16),
        nodeScale: (i) => (gone(i) ? 1.9 : 1),
        nodeColor: (i) => (gone(i) ? C.amberLit : co(i) ? C.teal : C.moon),
        edgeAlpha: () => 0.08,
        camera: cam,
        labels: johnSmith >= 0 ? [{ i: johnSmith, text: 'John Smith · 12 companies', lamp: true }] : [],
      },
      // 3 · removed: the galaxy breaks. The removed names hold as amber embers
      // while the survivor gathers bright at the centre and every fragment
      // drifts out past a dark moat, dimmed to slate; then the embers burn low.
      {
        positions: 'b',
        duration: 1700,
        // ease out: the pieces move the moment the step lands, the rim follows
        ease: 'out',
        nodeDelay: (i) => (gone(i) ? 0.28 : inGiant[i] ? 0 : 0.02 + rim[i] * 0.14),
        nodeAlpha: (i) => (gone(i) ? 0.34 : inGiant[i] ? (co(i) ? 1 : 0.85) : co(i) ? 0.3 : 0.18),
        nodeScale: (i) => (gone(i) ? 1.1 : inGiant[i] ? 1.45 : 0.85),
        nodeColor: (i) => (gone(i) ? C.amber : inGiant[i] ? (co(i) ? C.tealLit : C.moon) : C.dim),
        edgeAlpha: (e) => (gone(e.s) || gone(e.t) ? 0 : inGiant[e.s] && inGiant[e.t] ? 0.55 : 0.1),
        camera: cam,
        labels: breakLabels(true),
      },
      // 4 · the random control: only the surviving giant stays lit
      {
        positions: 'b',
        duration: 900,
        nodeAlpha: (i) => (gone(i) ? 0 : inGiant[i] ? (co(i) ? 1 : 0.8) : co(i) ? 0.22 : 0.14),
        nodeScale: (i) => (inGiant[i] ? 1.45 : 0.85),
        nodeColor: (i) => (gone(i) ? C.amber : inGiant[i] ? (co(i) ? C.tealLit : C.moon) : C.dim),
        edgeAlpha: (e) => (inGiant[e.s] && inGiant[e.t] ? 0.55 : 0.06),
        camera: cam,
        labels: breakLabels(false),
      },
    ]
  }, [rows, inGiant, rim, johnSmith, cam, model, w])
  const onHover = useHoverTip((i) => {
    const r = rows[i]
    const slice = model.slices[r[8] - 1]
    return (
      <>
        <strong>{nameOf(r[0])}</strong>
        <span>{r[3] === 0 ? 'Company' : 'Person'}{slice ? ` · slice ${slice.id}` : ''}</span>
        {r[3] === 1 && r[4] === 1 && <span>Top-50 surname: links may be name collisions.</span>}
        {step >= 2 && <span>{r[5] ? 'Removed in the ablation' : inGiant[i] ? 'Stays in the 306-node giant' : 'Left in a fragment'}</span>}
      </>
    )
  })
  return (
    <Layer on={on}>
      <GlowStage
        nodes={model.nodes}
        edges={model.edges}
        state={states[step]}
        bloom={3}
        onHover={on ? onHover : undefined}
        ariaLabel={
          [
            'The giant business group: 7,093 lights, companies teal and people moonlight.',
            'The 651 multi-company people with a top-50 surname lit amber.',
            'After removing them the galaxy breaks: a 306-node core stays lit at the centre, and 1,083 dim pieces drift out past a dark ring; the removed names burn out in amber.',
            'Only the 306-node core stays lit; removing random people would leave 495 to 1,918.',
          ][step]
        }
      />
    </Layer>
  )
}

function EvidenceScene({ model, w, h, region, on }: { model: EvidenceModel; w: number; h: number; region: Box; on: boolean }) {
  const rw = region[2] - region[0]
  const rh = region[3] - region[1]
  const stacked = rw < 700 || rw / Math.max(1, rh) < 1.3
  const state = useMemo<GlowState>(() => {
    // leave room on the right for the labels and on top for the lamps
    const box: Box = stacked ? [0.12, 0.06, 0.88, 0.96] : [0.0, 0.26, 1.0, 0.74]
    const top = 64
    return {
      positions: stacked ? 'b' : 'a',
      nodeAlpha: () => 1,
      edgeAlpha: () => 0.75,
      labels: model.labels,
      camera: frame(box, w, h, [region[0], region[1] + top, region[2], region[3]]),
      duration: 900,
    }
  }, [model, stacked, w, h, region[0], region[1], region[2], region[3]]) // eslint-disable-line react-hooks/exhaustive-deps
  const onHover = useHoverTip((i) => {
    const it = model.info[i]
    if (it.kind === 'anchor')
      return (
        <>
          <strong>{it.group.id}</strong>
          <span>
            {it.group.verdict} · {it.group.confidence} confidence
          </span>
        </>
      )
    const n = it.n
    return n.kind === 'company' ? (
      <>
        <strong>{n.label}</strong>
        <span>Company · {n.countries.length ? n.countries.join(', ') : 'no registry record'}</span>
        <span className="tt-row">
          <span>Product</span>
          <span>{short(n.product, 44)}</span>
        </span>
        <span className="tt-row">
          <span>Group</span>
          <span>{it.group.id}</span>
        </span>
      </>
    ) : (
      <>
        <strong>{n.label}</strong>
        <span>
          Person · owner of {n.owner_of}, contact for {n.contact_of}
        </span>
        <span className="tt-row">
          <span>Group</span>
          <span>{it.group.id}</span>
        </span>
      </>
    )
  })
  return (
    <Layer on={on}>
      <GlowStage
        nodes={model.nodes}
        edges={model.edges}
        state={state}
        bloom={3.4}
        onHover={on ? onHover : undefined}
        ariaLabel="Evidence networks of BG00177 (Suspect) and BG00148 (Possible): fishing-named companies tied together by one owner and one contact each."
      />
    </Layer>
  )
}

function SkyScene({ model, w, h, region, on }: { model: SkyModel; w: number; h: number; region: Box; on: boolean }) {
  const state = useMemo<GlowState>(
    () => ({
      nodeAlpha: (i) => (model.lens[i] ? 0.95 : 0.4),
      nodeScale: (i) => (model.lens[i] ? 1.15 : 1),
      edgeAlpha: () => 0,
      camera: frame([0, 0, 1, 1], w, h, [region[0], region[1], region[2], region[3] - 56]),
    }),
    [model, w, h, region[0], region[1], region[2], region[3]], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const onHover = useHoverTip((i) => {
    const it = model.info[i]
    return (
      <>
        <strong>{it.name}</strong>
        <span className="tt-row">
          <span>Cluster</span>
          <span>{it.cluster}</span>
        </span>
        <span className="tt-row">
          <span>Product label</span>
          <span>{it.fish}</span>
        </span>
      </>
    )
  })
  return (
    <Layer on={on}>
      <GlowStage
        nodes={model.nodes}
        edges={NO_EDGES}
        state={state}
        bloom={3}
        onHover={on ? onHover : undefined}
        ariaLabel={`Text-space map of ${fmt.int.format(model.nodes.length)} sampled companies; the four seafood clusters T09, T12, T16 and T20 lit, ${model.seafood} companies in all.`}
      />
    </Layer>
  )
}
const NO_EDGES: GlowEdge[] = []

/* The random control as a single lit strip under the broken galaxy. */
function ControlStrip({ on, giant, asFound, lo, hi }: { on: boolean; giant: number; asFound: number; lo: number; hi: number }) {
  const ov = useJson<GroupsOverview>('mc3/groups_overview.json')
  const random = ov.status === 'ready' ? ov.data.giant_component.name_collision_robustness.drop_top50_surnames.random_control_largest : []
  const [ref, { w }] = useBox<HTMLDivElement>()
  const iw = Math.max(0, w - 24)
  const x = d3.scaleLinear().domain([0, 2000]).range([12, 12 + iw])
  const ticks = [0, 500, 1000, 1500, 2000]
  return (
    <div ref={ref} className="mc3-strip" data-on={on} aria-hidden={!on}>
      <p className="mc3-strip__title">
        Largest piece left after removing {fmt.int.format(651)} people <span>(as found: {fmt.int.format(asFound)})</span>
      </p>
      {w > 0 && (
        <svg width={w} height={82} className="chart" role="img" aria-label={`Common names removed: ${giant} nodes left. Random people removed: ${lo} to ${hi}.`}>
          <line x1={x(0)} x2={x(2000)} y1={54} y2={54} stroke="var(--rule-strong)" />
          {ticks.map((t) => (
            <text key={t} x={x(t)} y={74} textAnchor={t === 0 ? 'start' : t === 2000 ? 'end' : 'middle'}>
              {fmt.int.format(t)}
            </text>
          ))}
          <text x={x(hi)} y={12} textAnchor="end" className="label-strong">
            Random people · {fmt.int.format(lo)}–{fmt.int.format(hi)}
          </text>
          <line x1={x(lo)} x2={x(hi)} y1={24} y2={24} stroke="var(--ink-3)" strokeWidth={1.5} />
          {random.map((r, i) => (
            <circle key={i} cx={x(r)} cy={24} r={4} fill="var(--ground)" stroke="var(--ink)" strokeWidth={1.25} />
          ))}
          <circle cx={x(giant)} cy={54} r={6} fill="var(--lit-1)" className="mc3-strip__lamp" />
          <text x={x(giant) + 10} y={42} className="label-strong mc3-strip__lit">
            Common names · {giant}
          </text>
        </svg>
      )}
    </div>
  )
}
