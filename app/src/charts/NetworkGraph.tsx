import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useWidth } from './useSize'
import { useTooltip } from '../components/Tooltip'
import { entityStyle, shapePath } from '../lib/signals'

export interface GNode {
  id: string
  label?: string
  type?: string | null
  /** Emphasised nodes (suspects, focus) get a heavier ring and a label. */
  emph?: boolean
  /** Optional ring colour, e.g. a verdict colour. */
  ring?: string
  size?: number
  tip?: ReactNode
}
export interface GLink {
  source: string
  target: string
  type?: string | null
  weight?: number
  /** Draw this link dashed (e.g. a low-weight edge), independent of its type. */
  dashed?: boolean
}

type SimNode = GNode & d3.SimulationNodeDatum
type SimLink = d3.SimulationLinkDatum<SimNode> & { type?: string | null; weight?: number; dashed?: boolean }

/** Node-link view laid out once (static force run), then pan/zoom + hover.
    Shape and colour both encode entity type; hovering isolates neighbours. */
export function NetworkGraph({
  nodes,
  links,
  height = 520,
  linkColor,
  linkDash,
  dashedTypes,
  onSelect,
  selected,
  showAllLabels,
  path,
}: {
  nodes: GNode[]
  links: GLink[]
  height?: number
  linkColor?: (type: string | null | undefined) => string
  /** Dash pattern per link type and weakness; overrides the default weak dash. */
  linkDash?: (type: string | null | undefined, weak: boolean) => string | undefined
  dashedTypes?: string[]
  onSelect?: (id: string) => void
  selected?: string | null
  showAllLabels?: boolean
  /** Highlight a walk through the graph (consecutive ids are joined by links);
      everything off the walk is dimmed until the pointer hovers a node. */
  path?: string[] | null
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [transform, setTransform] = useState(d3.zoomIdentity)

  const layout = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id))
    const sn: SimNode[] = nodes.map((n) => ({ ...n }))
    const sl: SimLink[] = links.filter((l) => ids.has(l.source) && ids.has(l.target)).map((l) => ({ ...l }))
    const sim = d3
      .forceSimulation(sn)
      .randomSource(d3.randomLcg(42))
      .force('link', d3.forceLink<SimNode, SimLink>(sl).id((d) => d.id).distance(36).strength(0.6))
      .force('charge', d3.forceManyBody().strength(-90).distanceMax(320))
      .force('collide', d3.forceCollide<SimNode>().radius((d) => (d.size ?? 5) + 4))
      .force('x', d3.forceX(0).strength(0.04))
      .force('y', d3.forceY(0).strength(0.06))
      .stop()
    for (let i = 0; i < 320; i++) sim.tick()
    const adj = new Map<string, Set<string>>()
    sl.forEach((l) => {
      const s = (l.source as SimNode).id
      const t = (l.target as SimNode).id
      if (!adj.has(s)) adj.set(s, new Set())
      if (!adj.has(t)) adj.set(t, new Set())
      adj.get(s)!.add(t)
      adj.get(t)!.add(s)
    })
    const xe = d3.extent(sn, (d) => d.x!) as [number, number]
    const ye = d3.extent(sn, (d) => d.y!) as [number, number]
    return { sn, sl, adj, xe, ye }
  }, [nodes, links])

  // Fit to the available box.
  const pad = 40
  const sx = (width - pad * 2) / Math.max(1, layout.xe[1] - layout.xe[0])
  const sy = (height - pad * 2) / Math.max(1, layout.ye[1] - layout.ye[0])
  const k = Math.min(3.2, sx, sy)
  const cx = (layout.xe[0] + layout.xe[1]) / 2
  const cy = (layout.ye[0] + layout.ye[1]) / 2
  const px = (x: number) => width / 2 + (x - cx) * k
  const py = (y: number) => height / 2 + (y - cy) * k

  useEffect(() => {
    if (!svgRef.current) return
    const z = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 6])
      // Wheel zooms only with a modifier; one finger scrolls the page, two fingers pan/zoom.
      .filter((e) => (e.type !== 'wheel' || e.ctrlKey || e.metaKey) && !(e.type === 'touchstart' && e.touches?.length < 2))
      .on('zoom', (e) => setTransform(e.transform))
    d3.select(svgRef.current).call(z)
    return () => {
      d3.select(svgRef.current!).on('.zoom', null)
    }
  }, [])

  const pathNodes = useMemo(() => (path && path.length ? new Set(path) : null), [path])
  const pathEdges = useMemo(() => {
    const s = new Set<string>()
    path?.forEach((p, i) => {
      if (i === 0) return
      s.add(`${path[i - 1]}\u0000${p}`)
      s.add(`${p}\u0000${path[i - 1]}`)
    })
    return s
  }, [path])
  const onPath = !hover && pathNodes
  const focus = hover ?? selected ?? null
  const near = !onPath && focus ? layout.adj.get(focus) ?? new Set<string>() : null
  const isOn = (id: string) => (onPath ? onPath.has(id) : !near || id === focus || near.has(id))
  const lc = linkColor ?? (() => 'var(--rule-strong)')

  // Which nodes want a label right now, and how badly.
  const wanted = layout.sn.filter(
    (n) => n.emph || showAllLabels || n.id === focus || (onPath && onPath.has(n.id)) || (near && near.has(n.id) && (near.size ?? 0) <= 16),
  )
  const wantedKey = wanted.map((n) => n.id).join('\u0000') + `|${focus ?? ''}|${width}|${height}`
  const labels = useMemo(
    () => placeLabels(wanted, layout.sn, (n) => n.emph || n.id === focus, (n) => (onPath && onPath.has(n.id) ? 2 : 1), cx, cy, px, py),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wantedKey, layout],
  )

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        className="chart"
        width={width}
        height={height}
        role="img"
        aria-label={`Network of ${nodes.length} entities and ${links.length} relations. Drag to pan; hold Ctrl or ⌘ and scroll to zoom.`}
        style={{ touchAction: 'pan-y', cursor: 'grab' }}
      >
        <g transform={transform.toString()}>
          <g>
            {layout.sl.map((l, i) => {
              const s = l.source as SimNode
              const t = l.target as SimNode
              const inPath = !!onPath && pathEdges.has(`${s.id}\u0000${t.id}`)
              const on = onPath ? inPath : !near || s.id === focus || t.id === focus
              const dashed = !!l.dashed || !!dashedTypes?.includes(l.type ?? '')
              const da = linkDash ? linkDash(l.type, dashed) : dashed ? (inPath ? '6 4' : '3 3') : undefined
              const dotted = !!da && parseFloat(da) <= 1.5
              return (
                <line
                  key={i}
                  x1={px(s.x!)}
                  y1={py(s.y!)}
                  x2={px(t.x!)}
                  y2={py(t.y!)}
                  stroke={on && near ? 'var(--ink)' : lc(l.type)}
                  strokeWidth={inPath ? 3 : on && near ? 1.5 : l.dashed || dotted ? 1.5 : 1}
                  strokeOpacity={on ? 0.9 : 0.12}
                  strokeDasharray={da}
                  strokeLinecap={dotted ? 'round' : undefined}
                />
              )
            })}
          </g>
          {layout.sn.map((n) => {
            const st = entityStyle(n.type)
            const r = n.size ?? (n.emph ? 9 : 5)
            const on = isOn(n.id)
            const lab = labels.get(n.id)
            return (
              <g
                key={n.id}
                transform={`translate(${px(n.x!)},${py(n.y!)})`}
                opacity={on ? 1 : 0.15}
                style={{ cursor: 'pointer', transition: 'opacity 160ms var(--ease-out)' }}
                onPointerEnter={() => setHover(n.id)}
                onPointerMove={(e) => tip.show(e, n.tip ?? <><strong>{n.label ?? n.id}</strong><span>{st.label}</span></>)}
                onPointerLeave={() => (setHover(null), tip.hide())}
                onClick={() => onSelect?.(n.id)}
              >
                <circle r={r + 6} fill="transparent" />
                {n.ring && <path d={shapePath(st.shape, r + 4)} fill="none" stroke={n.ring} strokeWidth={3} />}
                <path d={shapePath(st.shape, r)} fill={st.color} stroke={n.emph ? "var(--moon)" : "var(--ground)"} strokeWidth={n.emph ? 1.5 : 1} />
                {lab && (
                  <text
                    x={lab.dx}
                    y={lab.dy}
                    dy="0.32em"
                    textAnchor={lab.anchor}
                    className="label-strong net-label"
                    style={{ paintOrder: 'stroke', stroke: 'var(--cloth)', strokeWidth: 4, strokeLinejoin: 'round', pointerEvents: 'none' }}
                  >
                    {lab.text}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}

/* ───────── label placement ───────── */

const CHAR_W = 6.6 // px per character at 12px, semibold
const LABEL_H = 15
type Anchor = 'start' | 'middle' | 'end'
interface Placed {
  dx: number
  dy: number
  anchor: Anchor
  text: string
}
interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))
const nodeR = (n: SimNode) => n.size ?? (n.emph ? 9 : 5)
const labelText = (n: SimNode) => {
  const t = n.label ?? n.id
  return t.length > 28 ? t.slice(0, 27) + '…' : t
}

/** Place each wanted label away from the graph centre (radially), trying the
    other sides when that spot is taken. Priority labels (emphasised, focus)
    never yield: they take the least-crowded spot. The rest are dropped when
    every candidate spot collides with a label already placed. */
function placeLabels(
  wanted: SimNode[],
  all: SimNode[],
  keep: (n: SimNode) => boolean,
  rank: (n: SimNode) => number,
  cx: number,
  cy: number,
  px: (x: number) => number,
  py: (y: number) => number,
) {
  const out = new Map<string, Placed>()
  const placed: Box[] = []
  // Node marks are obstacles too, so a label does not sit on a neighbour.
  const marks: Box[] = all.map((n) => {
    const r = nodeR(n) + 2
    return { x0: px(n.x!) - r, y0: py(n.y!) - r, x1: px(n.x!) + r, y1: py(n.y!) + r }
  })
  const order = [...wanted].sort((a, b) => Number(keep(b)) - Number(keep(a)) || rank(b) - rank(a) || nodeR(b) - nodeR(a))
  for (const n of order) {
    const text = labelText(n)
    const w = text.length * CHAR_W
    const r = nodeR(n) + 5
    const x = px(n.x!)
    const y = py(n.y!)
    const ang = Math.atan2(n.y! - cy, n.x! - cx)
    const c = Math.cos(ang)
    const radial: Placed = Math.abs(c) >= 0.4 || (n.x! === cx && n.y! === cy)
      ? { dx: c >= 0 ? r : -r, dy: Math.sin(ang) * r * 0.6, anchor: c >= 0 ? 'start' : 'end', text }
      : { dx: 0, dy: Math.sin(ang) > 0 ? r + 6 : -r - 6, anchor: 'middle', text }
    const cands: Placed[] = [
      radial,
      { dx: r, dy: 0, anchor: 'start', text },
      { dx: -r, dy: 0, anchor: 'end', text },
      { dx: 0, dy: -r - 6, anchor: 'middle', text },
      { dx: 0, dy: r + 6, anchor: 'middle', text },
      { dx: r - 2, dy: -r, anchor: 'start', text },
      { dx: r - 2, dy: r, anchor: 'start', text },
      { dx: -r + 2, dy: -r, anchor: 'end', text },
      { dx: -r + 2, dy: r, anchor: 'end', text },
    ]
    const boxOf = (p: Placed): Box => {
      const x0 = x + p.dx - (p.anchor === 'start' ? 0 : p.anchor === 'middle' ? w / 2 : w)
      const y0 = y + p.dy - LABEL_H / 2
      return { x0, y0, x1: x0 + w, y1: y0 + LABEL_H }
    }
    let best: { p: Placed; b: Box; hit: number; score: number } | null = null
    for (const p of cands) {
      const b = boxOf(p)
      const hit = placed.reduce((s, q) => s + overlap(b, q), 0)
      const score = hit * 4 + marks.reduce((s, q) => s + overlap(b, q), 0)
      if (!best || score < best.score) best = { p, b, hit, score }
      if (score === 0) break
    }
    if (!best) continue
    if (best.hit > 0 && !keep(n)) continue
    out.set(n.id, best.p)
    placed.push(best.b)
  }
  return out
}

/** Legend of entity shapes, shared by every node-link view. */
export function EntityLegend({ types }: { types: string[] }) {
  return (
    <>
      {types.map((t) => {
        const st = entityStyle(t)
        return (
          <span key={t} className="legend-item">
            <svg width={14} height={14} viewBox="-7 -7 14 14" aria-hidden>
              <path d={shapePath(st.shape, 5)} fill={st.color} stroke="var(--ground)" strokeWidth={1} />
            </svg>
            {st.label}
          </span>
        )
      })}
    </>
  )
}
