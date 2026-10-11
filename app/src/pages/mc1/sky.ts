import type { GlowEdge, GlowLabel, GlowNode, GlowRing, GlowState } from '../../charts/GlowStage'
import { useJson, type Loadable } from '../../lib/useJson'
import { useMemo } from 'react'

/* The MC1 night sky: constellation.json (docs/data-contracts/stages.md) turned
   into GlowStage nodes and edges, plus one memoised GlowState per story beat.
   Canvas colours are the lit / series hex from tokens.css (canvas cannot read
   CSS variables). */

export const HEX = {
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

/** Verdict lamps on the canvas: ring (series) and core (lit). */
export const VERDICT_HEX: Record<string, { ring: string; core: string }> = {
  Suspect: { ring: HEX.rose, core: HEX.roseLit },
  Possible: { ring: HEX.amber, core: HEX.amberLit },
  'Insufficient evidence': { ring: HEX.dim, core: HEX.moon },
  Unlikely: { ring: HEX.blue, core: HEX.blueLit },
}

interface RawSky {
  aspect: number
  cls: string[]
  types: string[]
  nodes: [string, number, number, number, number, 0 | 1, number][]
  edges: [number, number, number, number][]
  suspects: number[]
  fisheye: number
  lowLayer: number[]
  cycles: number[][]
  candidates: number[]
  lcc: { size: number; components: number }
}

export interface SkyEdge extends GlowEdge {
  /** 0 = relation, 1 = weak relation (in lowconf), 2 = loop trace overlay */
  kind: 0 | 1 | 2
  type: string
  /** loop index and step along it, for the trace overlay */
  loop?: number
  step?: number
}

export interface Sky {
  raw: RawSky
  nodes: GlowNode[]
  edges: SkyEdge[]
  keys: string[]
  index: Map<string, number>
  cls: string[]
  deg: number[]
  inLayer: Uint8Array
  inLcc: Uint8Array
  /** undirected neighbours */
  nbrs: number[][]
  fragments: number
  fragmentNodes: number
  /** whole-sky camera */
  full: [number, number, number, number]
  /** 0..1 brightness damping for stars in crowded parts of the sky, so the
      core keeps its hue instead of summing to white under additive light */
  crowd: Float32Array
}

const ORG = new Set(['company', 'company_like', 'org_numeric', 'org_named', 'political_org'])
export const CLASS_NAME: Record<string, string> = {
  company: 'company',
  company_like: 'untyped, corporate name',
  org_numeric: 'nameless organization',
  org_named: 'organization',
  political_org: 'political organization',
  person: 'person',
  location: 'location',
  vessel: 'vessel',
  event: 'event',
  movement: 'movement',
  untyped_other: 'untyped',
  junk: 'extraction debris',
}

/** Base hue of a star: organizations teal, people blue, the rest dim. */
export const classHue = (cls: string) => (ORG.has(cls) ? HEX.teal : cls === 'person' ? HEX.blue : HEX.dim)

export function buildSky(raw: RawSky, weakKeys: Set<string>): Sky {
  const keys = raw.nodes.map((n) => n[0])
  const index = new Map(keys.map((k, i) => [k, i]))
  const n = keys.length
  const nodes: GlowNode[] = raw.nodes.map(([, x, y, c, deg]) => ({
    x,
    y: 1 - y,
    r: 0.75 + Math.sqrt(deg) * 0.3,
    color: classHue(raw.cls[c]),
  }))
  const inLayer = new Uint8Array(n)
  raw.nodes.forEach((r, i) => (inLayer[i] = r[5]))
  const nbrs: number[][] = Array.from({ length: n }, () => [])
  const edges: SkyEdge[] = raw.edges.map(([s, t, ty, w]) => {
    const type = raw.types[ty]
    nbrs[s].push(t)
    nbrs[t].push(s)
    const weak = weakKeys.has(`${keys[s]}\u0000${keys[t]}\u0000${type}`)
    return weak
      ? { s, t, color: HEX.roseLit, width: 1.1, kind: 1, type, w }
      : { s, t, color: classHue(raw.cls[raw.nodes[s][3]]), width: 0.6, kind: 0, type, w }
  })
  // loop trace overlays: one moonlight edge per step around each cycle
  raw.cycles.forEach((cyc, li) =>
    cyc.forEach((a, si) => {
      const b = cyc[(si + 1) % cyc.length]
      edges.push({ s: a, t: b, color: HEX.moon, width: 1.8, kind: 2, type: 'ownership', loop: li, step: si / cyc.length })
    }),
  )
  // components: which stars belong to the largest one
  const comp = new Int32Array(n).fill(-1)
  const sizes: number[] = []
  for (let i = 0; i < n; i++) {
    if (comp[i] >= 0) continue
    const c = sizes.length
    let size = 0
    const stack = [i]
    comp[i] = c
    while (stack.length) {
      const v = stack.pop()!
      size++
      for (const u of nbrs[v]) if (comp[u] < 0) ((comp[u] = c), stack.push(u))
    }
    sizes.push(size)
  }
  const big = sizes.indexOf(Math.max(...sizes))
  const inLcc = new Uint8Array(n)
  for (let i = 0; i < n; i++) inLcc[i] = comp[i] === big ? 1 : 0
  // Rim fragments are small cliques the layout packs onto almost one point, so
  // their stars summed into white blobs. Spread each one deterministically on
  // a sunflower spiral round its centre (in index order), and size its stars
  // as ordinary ones: degree inside a clique says nothing about reach.
  const members = new Map<number, number[]>()
  for (let i = 0; i < n; i++) if (comp[i] !== big) (members.get(comp[i]) ?? members.set(comp[i], []).get(comp[i])!).push(i)
  const STEP = 0.0042
  const GOLDEN = Math.PI * (3 - Math.sqrt(5))
  members.forEach((ids) => {
    if (ids.length < 3) return
    let cx = 0,
      cy = 0
    ids.forEach((i) => ((cx += nodes[i].x), (cy += nodes[i].y)))
    cx /= ids.length
    cy /= ids.length
    const spread = Math.max(...ids.map((i) => Math.hypot(nodes[i].x - cx, nodes[i].y - cy)))
    if (spread > STEP * Math.sqrt(ids.length)) return
    ids.forEach((i, k) => {
      const r = STEP * Math.sqrt(k + 0.5)
      nodes[i].x = cx + r * Math.cos(k * GOLDEN)
      nodes[i].y = cy + r * Math.sin(k * GOLDEN)
      nodes[i].r = Math.min(nodes[i].r, 1.2)
    })
  })
  const full = bbox(nodes.map((_, i) => i), nodes, 0.02, 0)
  // crowding: neighbours within a 3×3 block of a 90-cell grid
  const G = 90
  const cell = (v: number) => Math.max(0, Math.min(G - 1, Math.floor(v * G)))
  const grid = new Uint16Array(G * G)
  nodes.forEach((d) => grid[cell(d.y) * G + cell(d.x)]++)
  const crowd = new Float32Array(n)
  nodes.forEach((d, i) => {
    const cx = cell(d.x)
    const cy = cell(d.y)
    let c = 0
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx
        const y = cy + dy
        if (x >= 0 && y >= 0 && x < G && y < G) c += grid[y * G + x]
      }
    crowd[i] = Math.max(0.3, Math.min(1, Math.sqrt(14 / Math.max(1, c))))
  })
  return {
    crowd,
    raw,
    nodes,
    edges,
    keys,
    index,
    cls: raw.nodes.map((r) => raw.cls[r[3]]),
    deg: raw.nodes.map((r) => r[4]),
    inLayer,
    inLcc,
    nbrs,
    fragments: sizes.length - 1,
    fragmentNodes: n - sizes[big],
    full,
  }
}

/** Bounding box of some nodes, padded by `pad` of its size and at least `min` wide. */
export function bbox(ids: number[], nodes: GlowNode[], pad = 0.18, min = 0.08): [number, number, number, number] {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity
  for (const i of ids) {
    const d = nodes[i]
    x0 = Math.min(x0, d.x)
    x1 = Math.max(x1, d.x)
    y0 = Math.min(y0, d.y)
    y1 = Math.max(y1, d.y)
  }
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const w = Math.max(min, (x1 - x0) * (1 + pad * 2))
  const h = Math.max(min, (y1 - y0) * (1 + pad * 2))
  return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]
}

export function useSky(weakLinks: { s: string; t: string; type: string }[] | null): Loadable<Sky> {
  const raw = useJson<RawSky>('mc1/constellation.json')
  return useMemo<Loadable<Sky>>(() => {
    if (raw.status !== 'ready') return raw
    if (!weakLinks) return { status: 'loading' }
    const weak = new Set<string>()
    for (const l of weakLinks) {
      weak.add(`${l.s}\u0000${l.t}\u0000${l.type}`)
      weak.add(`${l.t}\u0000${l.s}\u0000${l.type}`)
    }
    return { status: 'ready', data: buildSky(raw.data, weak) }
  }, [raw, weakLinks])
}

/* ───────── Story states ───────── */

export interface SuspectLamp {
  i: number
  short: string
  verdict: string
  confidence?: string
}

export type BeatId =
  | 'opener'
  | 'sky'
  | 'fragments'
  | 'layer'
  | 'ownership'
  | 'fisheye'
  | 'fetag'
  | 'suspects'
  | `suspect:${number}`
  | 'loops'
  | 'loop:0'
  | 'loop:1'
  | 'candidates'
  | 'cand:0'

/** Base brightness of a star: small ones fainter, hubs brighter. */
const baseA = (deg: number) => 0.2 + 0.4 * Math.min(1, Math.sqrt(deg) / 6)

export function buildBeats(sky: Sky, lamps: SuspectLamp[], candLabel: (rank: number, i: number) => string): Record<string, GlowState> {
  const { nodes, inLayer, inLcc, deg, nbrs, raw } = sky
  const n = nodes.length
  const layerIds = raw.lowLayer
  const fe = raw.fisheye
  const sus = new Map(lamps.map((l) => [l.i, l]))
  const susColor = (i: number) => {
    const l = sus.get(i)
    return l ? (VERDICT_HEX[l.verdict] ?? VERDICT_HEX.Possible).core : undefined
  }
  const rings = (r = 11): GlowRing[] => lamps.map((l) => ({ i: l.i, color: (VERDICT_HEX[l.verdict] ?? VERDICT_HEX.Possible).ring, r }))
  const lampLabels = (): GlowLabel[] => lamps.map((l) => ({ i: l.i, text: `${l.short} · ${l.verdict}`, lamp: true }))
  const ba = deg.map((g, i) => baseA(g) * sky.crowd[i])
  const centroid = (ids: number[]) => {
    let x = 0,
      y = 0
    ids.forEach((i) => ((x += nodes[i].x), (y += nodes[i].y)))
    return [x / ids.length, y / ids.length]
  }
  // layer camera without the one far-west straggler
  const [lcx, lcy] = centroid(layerIds)
  const dist = (i: number, cx: number, cy: number) => Math.hypot(nodes[i].x - cx, nodes[i].y - cy)
  const core = layerIds.filter((i) => dist(i, lcx, lcy) < 0.25)
  const layerCam = bbox(core, nodes, 0.12)
  const maxLayerD = Math.max(...core.map((i) => dist(i, lcx, lcy)))
  const ripple = (i: number) => Math.min(0.6, (dist(i, lcx, lcy) / maxLayerD) * 0.6)
  const feNbrs = new Set(nbrs[fe])
  const cycles = raw.cycles
  const inCycle = new Map<number, number>()
  cycles.forEach((c, li) => c.forEach((i) => inCycle.set(i, li)))
  const candRank = new Map(raw.candidates.map((i, r) => [i, r]))
  const susNbr = new Set<number>()
  lamps.forEach((l) => nbrs[l.i].forEach((u) => susNbr.add(u)))
  const lampI = lamps.map((l) => l.i)
  const noLoop = (e: SkyEdge) => e.kind === 2

  const mk = (s: Partial<GlowState> & Pick<GlowState, 'nodeAlpha' | 'edgeAlpha'>): GlowState => s as GlowState
  const E = (f: (e: SkyEdge, j: number) => number) => (e: GlowEdge, j: number) => f(e as SkyEdge, j)

  const beats: Record<string, GlowState> = {}

  // Opener: the whole sky dim, the weak layer glowing rose, suspects as lamps.
  beats.opener = mk({
    nodeAlpha: (i) => (sus.has(i) ? 1 : inLayer[i] ? 0.9 : ba[i] * 0.7),
    nodeScale: (i) => (sus.has(i) ? 2 : inLayer[i] ? 1.35 : 1),
    nodeColor: (i) => susColor(i) ?? (inLayer[i] ? HEX.roseLit : nodes[i].color),
    edgeAlpha: E((e) => (e.kind === 1 ? 0.7 : e.kind === 2 ? 0 : 0.05)),
    camera: openerCam(sky.full),
    rings: rings(10),
    // each suspect named in serif beside its lamp, the four set in one callout
    // column so the names never stack on the knot of the layer
    labels: lamps.map(
      (l) =>
        ({
          i: l.i,
          text: l.short,
          sub: l.confidence ? `${l.verdict} · ${l.confidence.toLowerCase()} confidence` : l.verdict,
          serif: true,
          color: (VERDICT_HEX[l.verdict] ?? VERDICT_HEX.Possible).core,
          column: true,
        }) satisfies GlowLabel,
    ),
  })

  // 1 · the whole graph
  beats.sky = mk({
    nodeAlpha: (i) => ba[i],
    edgeAlpha: E((e) => (e.kind === 2 ? 0 : 0.1)),
    camera: sky.full,
  })
  beats.fragments = mk({
    nodeAlpha: (i) => (inLcc[i] ? ba[i] * 0.3 : 0.7),
    nodeScale: (i) => (inLcc[i] ? 1 : Math.min(1.4, 3 / nodes[i].r)),
    nodeColor: (i) => (inLcc[i] ? undefined : HEX.moon) ?? nodes[i].color,
    edgeAlpha: E((e) => (e.kind === 2 ? 0 : inLcc[e.s] ? 0.03 : 0.8)),
    camera: sky.full,
  })

  // 2 · the weak edges ignite: one 79-node web
  const layerBase = {
    nodeAlpha: (i: number) => (inLayer[i] ? 1 : ba[i] * 0.22),
    nodeScale: (i: number) => (inLayer[i] ? 1.5 : 1),
    nodeColor: (i: number) => (inLayer[i] ? HEX.roseLit : nodes[i].color),
    camera: layerCam,
    nodeDelay: (i: number) => (inLayer[i] ? ripple(i) : 0),
  }
  beats.layer = mk({
    ...layerBase,
    edgeAlpha: E((e) => (e.kind === 1 ? 0.95 : e.kind === 2 ? 0 : 0.025)),
    edgeDelay: E((e) => (e.kind === 1 ? Math.min(ripple(e.s), ripple(e.t)) : 0)),
  })
  beats.ownership = mk({
    ...layerBase,
    nodeDelay: undefined,
    edgeAlpha: E((e) => (e.kind === 1 ? (e.type === 'ownership' ? 1 : 0.12) : e.kind === 2 ? 0 : 0.02)),
  })

  // 3 · FishEye at the centre of the layer
  const feIds = [fe, ...feNbrs]
  const feReach = Math.max(...feIds.map((i) => dist(i, nodes[fe].x, nodes[fe].y)), 1e-6)
  beats.fisheye = mk({
    nodeAlpha: (i) => (i === fe ? 1 : feNbrs.has(i) ? 1 : inLayer[i] ? 0.4 : ba[i] * 0.18),
    nodeScale: (i) => (i === fe ? 3.2 : feNbrs.has(i) ? 1.6 : inLayer[i] ? 1.2 : 1),
    nodeColor: (i) => (i === fe ? HEX.moon : inLayer[i] ? HEX.roseLit : nodes[i].color),
    edgeAlpha: E((e) => (noLoop(e) ? 0 : e.s === fe || e.t === fe ? 1 : e.kind === 1 ? 0.2 : 0.02)),
    edgeDelay: E((e) => (e.s === fe || e.t === fe ? 0.1 + 0.5 * Math.min(1, dist(e.s === fe ? e.t : e.s, nodes[fe].x, nodes[fe].y) / feReach) : 0)),
    camera: bbox(feIds, nodes, 0.12),
    labels: [{ i: fe, text: 'FishEye International' }],
  })
  const tagged = lamps.filter((l) => feNbrs.has(l.i)).map((l) => l.i)
  beats.fetag = mk({
    nodeAlpha: (i) => (i === fe || tagged.includes(i) ? 1 : feNbrs.has(i) ? 0.35 : inLayer[i] ? 0.25 : ba[i] * 0.15),
    nodeScale: (i) => (i === fe ? 3.2 : tagged.includes(i) ? 2.2 : 1.2),
    nodeColor: (i) => (i === fe ? HEX.moon : susColor(i) ?? (inLayer[i] ? HEX.roseLit : nodes[i].color)),
    edgeAlpha: E((e) => (noLoop(e) ? 0 : (e.s === fe && tagged.includes(e.t)) || (e.t === fe && tagged.includes(e.s)) ? 1 : e.s === fe || e.t === fe ? 0.15 : 0.02)),
    camera: bbox(feIds, nodes, 0.12),
    labels: [{ i: fe, text: 'FishEye International' }, ...lampLabels().filter((l) => tagged.includes(l.i))],
    rings: rings().filter((r) => tagged.includes(r.i)),
  })

  // 4 · the suspects: three inside, one a hop out
  const susCam = bbox([...lampI, ...core], nodes, 0.06)
  beats.suspects = mk({
    nodeAlpha: (i) => (sus.has(i) ? 1 : inLayer[i] ? 0.45 : susNbr.has(i) ? 0.55 : ba[i] * 0.16),
    nodeScale: (i) => (sus.has(i) ? 2.4 : inLayer[i] ? 1.2 : 1),
    nodeColor: (i) => susColor(i) ?? (inLayer[i] ? HEX.roseLit : nodes[i].color),
    edgeAlpha: E((e) => (noLoop(e) ? 0 : sus.has(e.s) || sus.has(e.t) ? 0.55 : e.kind === 1 ? 0.25 : 0.015)),
    camera: susCam,
    labels: lampLabels(),
    rings: rings(),
  })
  lamps.forEach((l, li) => {
    const own = new Set(nbrs[l.i])
    beats[`suspect:${li}`] = mk({
      nodeAlpha: (i) => (i === l.i ? 1 : own.has(i) ? 0.95 : sus.has(i) ? 0.6 : inLayer[i] ? 0.3 : ba[i] * 0.12),
      nodeScale: (i) => (i === l.i ? 2.8 : own.has(i) ? 1.4 : sus.has(i) ? 1.8 : 1),
      nodeColor: (i) => susColor(i) ?? (inLayer[i] ? HEX.roseLit : nodes[i].color),
      edgeAlpha: E((e) => (noLoop(e) ? 0 : e.s === l.i || e.t === l.i ? 1 : 0.015)),
      camera: bbox([l.i, ...own], nodes, 0.1, 0.1),
      labels: lampLabels(),
      rings: rings(),
    })
  })

  // 5 · the two ownership loops, traced
  const loopState = (only: number | null) =>
    mk({
      nodeAlpha: (i) => (inCycle.has(i) && (only == null || inCycle.get(i) === only) ? 1 : inLayer[i] ? 0.28 : ba[i] * 0.12),
      nodeScale: (i) => (inCycle.has(i) && (only == null || inCycle.get(i) === only) ? 2 : 1),
      nodeColor: (i) => (inCycle.has(i) ? HEX.moon : inLayer[i] ? HEX.roseLit : nodes[i].color),
      edgeAlpha: E((e) => (e.kind === 2 ? (only == null || e.loop === only ? 1 : 0.1) : e.kind === 1 ? 0.18 : 0.012)),
      edgeDelay: E((e) => (e.kind === 2 ? 0.1 + (e.step ?? 0) * 0.7 : 0)),
      camera: bbox(only == null ? cycles.flat() : cycles[only], nodes, 0.25, 0.06),
      labels:
        only == null
          ? cycles.map((c) => ({ i: c[0], text: `Loop of ${c.length}` }))
          : cycles[only].map((i) => ({ i, text: sky.keys[i].replace(/^#/, '') })),
    })
  beats.loops = loopState(null)
  beats['loop:0'] = loopState(0)
  beats['loop:1'] = loopState(1)

  // 6 · twenty-five candidates, lit in rank order
  const top = raw.candidates
  beats.candidates = mk({
    nodeAlpha: (i) => (candRank.has(i) ? 1 : sus.has(i) ? 0.75 : inLayer[i] ? 0.25 : ba[i] * 0.12),
    nodeScale: (i) => (candRank.has(i) ? Math.min(1.9, 4.2 / nodes[i].r) : sus.has(i) ? 1.8 : 1),
    nodeColor: (i) => (candRank.has(i) ? HEX.tealLit : susColor(i) ?? (inLayer[i] ? HEX.roseLit : nodes[i].color)),
    nodeDelay: (i) => (candRank.has(i) ? (candRank.get(i)! / 25) * 0.6 : 0),
    edgeAlpha: E((e) => (e.kind === 1 ? 0.22 : 0.012)),
    camera: bbox([...top, ...lampI, ...core], nodes, 0.04),
    labels: top.slice(0, 4).map((i, r) => ({ i, text: candLabel(r + 1, i) })),
    rings: rings(),
  })
  const c0 = top[0]
  const c0n = new Set(nbrs[c0])
  beats['cand:0'] = mk({
    nodeAlpha: (i) => (i === c0 ? 1 : c0n.has(i) ? 0.9 : candRank.has(i) ? 0.5 : sus.has(i) ? 0.75 : ba[i] * 0.1),
    nodeScale: (i) => (i === c0 ? 1.6 : c0n.has(i) ? 1.3 : sus.has(i) ? 1.8 : 1),
    nodeColor: (i) => (candRank.has(i) ? HEX.tealLit : susColor(i) ?? (inLayer[i] ? HEX.roseLit : nodes[i].color)),
    edgeAlpha: E((e) => (noLoop(e) ? 0 : e.s === c0 || e.t === c0 ? 0.9 : 0.012)),
    camera: bbox([c0, ...c0n], nodes, 0.08),
    labels: [{ i: c0, text: candLabel(1, c0) }, ...lampLabels().filter((l) => l.i === lamps.find((x) => x.short === '979893388')?.i)],
    rings: rings(),
  })
  void n
  return beats
}

/** The opener has a region of its own: the whole sky, trimmed a little at
    the far rim so the core fills it. */
function openerCam(full: [number, number, number, number]): [number, number, number, number] {
  const [x0, y0, x1, y1] = full
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const k = 0.8
  return [cx - ((x1 - x0) * k) / 2, cy - ((y1 - y0) * k) / 2, cx + ((x1 - x0) * k) / 2, cy + ((y1 - y0) * k) / 2]
}
