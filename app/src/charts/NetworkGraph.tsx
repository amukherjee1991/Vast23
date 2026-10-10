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
}

type SimNode = GNode & d3.SimulationNodeDatum
type SimLink = d3.SimulationLinkDatum<SimNode> & { type?: string | null; weight?: number }

/** Node-link view laid out once (static force run), then pan/zoom + hover.
    Shape and colour both encode entity type; hovering isolates neighbours. */
export function NetworkGraph({
  nodes,
  links,
  height = 520,
  linkColor,
  dashedTypes,
  onSelect,
  selected,
  showAllLabels,
}: {
  nodes: GNode[]
  links: GLink[]
  height?: number
  linkColor?: (type: string | null | undefined) => string
  dashedTypes?: string[]
  onSelect?: (id: string) => void
  selected?: string | null
  showAllLabels?: boolean
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
  const k = Math.min(2.2, sx, sy)
  const cx = (layout.xe[0] + layout.xe[1]) / 2
  const cy = (layout.ye[0] + layout.ye[1]) / 2
  const px = (x: number) => width / 2 + (x - cx) * k
  const py = (y: number) => height / 2 + (y - cy) * k

  useEffect(() => {
    if (!svgRef.current) return
    const z = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 6])
      .filter((e) => e.type !== 'wheel' || e.ctrlKey || e.metaKey)
      .on('zoom', (e) => setTransform(e.transform))
    d3.select(svgRef.current).call(z)
    return () => {
      d3.select(svgRef.current!).on('.zoom', null)
    }
  }, [])

  const focus = hover ?? selected ?? null
  const near = focus ? layout.adj.get(focus) ?? new Set<string>() : null
  const isOn = (id: string) => !near || id === focus || near.has(id)
  const lc = linkColor ?? (() => 'var(--rule-strong)')

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        className="chart"
        width={width}
        height={height}
        role="img"
        aria-label={`Network of ${nodes.length} entities and ${links.length} relations. Drag to pan; hold Ctrl or ⌘ and scroll to zoom.`}
        style={{ touchAction: 'none', cursor: 'grab' }}
      >
        <g transform={transform.toString()}>
          <g>
            {layout.sl.map((l, i) => {
              const s = l.source as SimNode
              const t = l.target as SimNode
              const on = !near || ((s.id === focus || t.id === focus) && true)
              return (
                <line
                  key={i}
                  x1={px(s.x!)}
                  y1={py(s.y!)}
                  x2={px(t.x!)}
                  y2={py(t.y!)}
                  stroke={on && near ? 'var(--ink)' : lc(l.type)}
                  strokeWidth={on && near ? 1.5 : 1}
                  strokeOpacity={on ? 0.9 : 0.12}
                  strokeDasharray={dashedTypes?.includes(l.type ?? '') ? '3 3' : undefined}
                />
              )
            })}
          </g>
          {layout.sn.map((n) => {
            const st = entityStyle(n.type)
            const r = n.size ?? (n.emph ? 9 : 5)
            const on = isOn(n.id)
            const showLabel = n.emph || showAllLabels || n.id === focus || (near && near.has(n.id) && (near.size ?? 0) <= 16)
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
                <path d={shapePath(st.shape, r)} fill={st.color} stroke="var(--ink)" strokeWidth={n.emph ? 1.5 : 0.75} />
                {showLabel && (
                  <text x={r + 6} dy="0.32em" className="label-strong" style={{ paintOrder: 'stroke', stroke: 'var(--cloth)', strokeWidth: 3 }}>
                    {(n.label ?? n.id).length > 28 ? (n.label ?? n.id).slice(0, 27) + '…' : n.label ?? n.id}
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

/** Legend of entity shapes, shared by every node-link view. */
export function EntityLegend({ types }: { types: string[] }) {
  return (
    <>
      {types.map((t) => {
        const st = entityStyle(t)
        return (
          <span key={t} className="legend-item">
            <svg width={14} height={14} viewBox="-7 -7 14 14" aria-hidden>
              <path d={shapePath(st.shape, 5)} fill={st.color} stroke="var(--ink)" strokeWidth={0.75} />
            </svg>
            {st.label}
          </span>
        )
      })}
    </>
  )
}
