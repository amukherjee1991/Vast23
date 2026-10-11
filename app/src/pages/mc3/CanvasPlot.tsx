import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useWidth } from '../../charts/useSize'
import { useTooltip } from '../../components/Tooltip'

/* A scatter for thousands of points: the cloud is painted on a canvas (one
   element, not 3,000), while axes, emphasised points, the selection and the
   hover ring stay in SVG on top. Hover and click find the nearest point with
   a Delaunay index, so small marks are still easy to hit. */

export interface CPoint {
  id: string
  x: number
  y: number
  color: string
  /** 0..1 fill opacity (e.g. cluster margin). */
  alpha?: number
  /** Outline colour, drawn over the glow (e.g. to set a moonlight point apart). */
  stroke?: string
  r?: number
  emph?: boolean
  label?: string
  tip?: ReactNode
  /** Whether a click on this point can select it. Defaults to true when onSelect is set. */
  selectable?: boolean
}
export type AxisType = 'linear' | 'symlog' | 'log'
export interface RefLine {
  axis: 'x' | 'y'
  value: number
  label: string
}

function makeScale(type: AxisType, dom: [number, number], range: [number, number]) {
  if (type === 'log') return d3.scaleLog().domain([Math.max(1, dom[0]), Math.max(2, dom[1])]).range(range).clamp(true)
  if (type === 'symlog') return d3.scaleSymlog().domain(dom).range(range)
  return d3.scaleLinear().domain(dom).range(range)
}
function ticksFor(type: AxisType, dom: [number, number], n: number): number[] {
  if (type === 'linear') return d3.scaleLinear().domain(dom).ticks(n)
  const cands = [0, 1, 2, 3, 5, 10, 20, 30, 50, 100, 200, 300, 500, 1000, 2000, 5000, 10000]
  const inDom = cands.filter((t) => t >= (type === 'log' ? Math.max(1, dom[0]) : dom[0]) && t <= dom[1])
  // thin to roughly n ticks, keeping the decades
  if (inDom.length <= n + 1) return inDom
  const decades = inDom.filter((t) => t === 0 || Math.log10(t) % 1 === 0)
  return decades.length >= 2 ? decades : inDom.filter((_, i) => i % 2 === 0)
}

/** Resolve CSS colours such as `var(--series-1)` to values canvas can paint. */
function colorResolver(el: HTMLElement) {
  const cache = new Map<string, string>()
  const cs = getComputedStyle(el)
  return (c: string) => {
    if (!c.startsWith('var(')) return c
    let v = cache.get(c)
    if (v === undefined) {
      const name = c.slice(4, -1).split(',')[0].trim()
      v = cs.getPropertyValue(name).trim() || 'gray'
      cache.set(c, v)
    }
    return v
  }
}

export function CanvasPlot({
  points,
  height = 360,
  xType = 'linear',
  yType = 'linear',
  xDomain,
  yDomain,
  xLabel,
  yLabel,
  xFormat = d3.format('~s'),
  yFormat = d3.format('~s'),
  hideAxes,
  onSelect,
  selected,
  refLines,
  ariaLabel,
}: {
  points: CPoint[]
  height?: number
  xType?: AxisType
  yType?: AxisType
  xDomain?: [number, number]
  yDomain?: [number, number]
  xLabel?: string
  yLabel?: string
  xFormat?: (n: number) => string
  yFormat?: (n: number) => string
  hideAxes?: boolean
  onSelect?: (id: string) => void
  selected?: string | null
  refLines?: RefLine[]
  ariaLabel: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tip = useTooltip()
  const [hover, setHover] = useState<string | null>(null)

  const m = hideAxes ? { t: 10, r: 10, b: 10, l: 10 } : { t: 22, r: 16, b: 40, l: 48 }
  const iw = Math.max(10, width - m.l - m.r)
  const ih = Math.max(10, height - m.t - m.b)
  const xd = xDomain ?? (d3.extent(points, (p) => p.x) as [number, number])
  const yd = yDomain ?? (d3.extent(points, (p) => p.y) as [number, number])
  const xs = makeScale(xType, [xd[0] ?? 0, xd[1] ?? 1], [0, iw])
  const ys = makeScale(yType, [yd[0] ?? 0, yd[1] ?? 1], [ih, 0])

  const px = useMemo(() => points.map((p) => [xs(p.x), ys(p.y)] as [number, number]), [points, xs, ys])
  const delaunay = useMemo(() => d3.Delaunay.from(px), [px])
  const byId = useMemo(() => new Map(points.map((p, i) => [p.id, i])), [points])

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const dpr = window.devicePixelRatio || 1
    cv.width = Math.round(width * dpr)
    cv.height = Math.round(height * dpr)
    const ctx = cv.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.save()
    const resolve = colorResolver(cv)
    ctx.translate(hideAxes ? 10 : 48, hideAxes ? 10 : 22)
    points.forEach((p, i) => {
      if (p.emph) return
      const [x, y] = px[i]
      ctx.globalAlpha = p.alpha ?? 0.6
      ctx.fillStyle = resolve(p.color)
      ctx.beginPath()
      ctx.arc(x, y, p.r ?? 2.5, 0, Math.PI * 2)
      ctx.fill()
      if (p.stroke) {
        ctx.globalAlpha = Math.max(0.5, p.alpha ?? 0.6)
        ctx.strokeStyle = resolve(p.stroke)
        ctx.lineWidth = 1.25
        ctx.stroke()
      }
    })
    ctx.restore()
  }, [points, px, width, height, hideAxes])

  function nearest(e: React.MouseEvent<SVGRectElement>) {
    const [x, y] = d3.pointer(e)
    const i = delaunay.find(x, y)
    if (i < 0 || !px[i]) return null
    const d = Math.hypot(px[i][0] - x, px[i][1] - y)
    return d <= 18 ? i : null
  }

  const emph = points.filter((p) => p.emph)
  const sel = selected != null && byId.has(selected) ? points[byId.get(selected)!] : null
  const hov = hover != null && byId.has(hover) ? points[byId.get(hover)!] : null
  const xTicks = hideAxes ? [] : ticksFor(xType, xs.domain() as [number, number], Math.max(2, Math.floor(iw / 80)))
  const yTicks = hideAxes ? [] : ticksFor(yType, ys.domain() as [number, number], 5)
  const lbl = (s: string) => (s.length > 26 ? s.slice(0, 25) + '…' : s)
  const P = (p: CPoint) => [xs(p.x), ys(p.y)] as const

  return (
    <div ref={ref} className="cplot" style={{ height }}>
      <canvas ref={canvasRef} className="cplot__canvas" style={{ width, height }} aria-hidden />
      <svg className="chart cplot__svg" width={width} height={height} role="img" aria-label={ariaLabel}>
        <g transform={`translate(${m.l},${m.t})`}>
          {!hideAxes && (
            <>
              <g className="grid">
                {yTicks.map((t) => (
                  <line key={t} x1={0} x2={iw} y1={ys(t)} y2={ys(t)} />
                ))}
              </g>
              {yTicks.map((t) => (
                <text key={t} x={-8} y={ys(t)} dy="0.32em" textAnchor="end">
                  {yFormat(t)}
                </text>
              ))}
              {xTicks.map((t) => (
                <text key={t} x={xs(t)} y={ih + 18} textAnchor="middle">
                  {xFormat(t)}
                </text>
              ))}
              <line x1={0} x2={iw} y1={ih} y2={ih} stroke="var(--rule-strong)" />
              {xLabel && (
                <text x={iw} y={ih + 34} textAnchor="end" className="label-strong">
                  {xLabel}
                </text>
              )}
              {yLabel && (
                <text x={-m.l + 2} y={-10} className="label-strong">
                  {yLabel}
                </text>
              )}
            </>
          )}
          {refLines?.map((r) =>
            r.axis === 'x' ? (
              <g key={`x${r.value}`} transform={`translate(${xs(r.value)},0)`}>
                <line y1={0} y2={ih} stroke="var(--ink-3)" strokeDasharray="3 3" />
                <text x={-4} y={8} textAnchor="end" className="label-strong">
                  {r.label}
                </text>
              </g>
            ) : (
              <g key={`y${r.value}`} transform={`translate(0,${ys(r.value)})`}>
                <line x1={0} x2={iw} stroke="var(--ink-3)" strokeDasharray="3 3" />
                <text x={4} y={-5} className="label-strong">
                  {r.label}
                </text>
              </g>
            ),
          )}
          {emph.map((p) => {
            const [x, y] = P(p)
            const left = x > iw - 150
            return (
              <g key={p.id} transform={`translate(${x},${y})`} pointerEvents="none">
                <circle r={(p.r ?? 4) + 4} fill={p.color} opacity={0.18} />
                <circle r={p.r ?? 4} fill={p.color} stroke="var(--moon)" strokeWidth={1.25} />
                {p.label && (
                  <text
                    x={left ? -(p.r ?? 4) - 5 : (p.r ?? 4) + 5}
                    dy="0.32em"
                    textAnchor={left ? 'end' : 'start'}
                    className="label-strong cplot__label"
                  >
                    {lbl(p.label)}
                  </text>
                )}
              </g>
            )
          })}
          {sel && (
            <g transform={`translate(${P(sel)[0]},${P(sel)[1]})`} pointerEvents="none">
              <circle r={(sel.r ?? 4) + 9} fill="none" stroke="var(--moon)" strokeOpacity={0.3} strokeWidth={1} />
              <circle r={(sel.r ?? 4) + 5} fill="none" stroke="var(--moon)" strokeWidth={2} />
              {!sel.emph && (
                <circle r={sel.r ?? 4} fill={sel.color} stroke="var(--moon)" strokeWidth={1.25} />
              )}
            </g>
          )}
          {hov && hov.id !== sel?.id && (
            <circle
              transform={`translate(${P(hov)[0]},${P(hov)[1]})`}
              r={(hov.r ?? 3) + 3}
              fill="none"
              stroke="var(--ink-2)"
              strokeWidth={1.5}
              pointerEvents="none"
            />
          )}
          <rect
            className="hit"
            x={-6}
            y={-6}
            width={iw + 12}
            height={ih + 12}
            style={{ cursor: onSelect && hov && hov.selectable !== false ? 'pointer' : 'crosshair' }}
            onPointerMove={(e) => {
              const i = nearest(e)
              if (i == null) {
                setHover(null)
                tip.hide()
                return
              }
              const p = points[i]
              setHover(p.id)
              tip.show(e, p.tip ?? <strong>{p.label ?? p.id}</strong>)
            }}
            onPointerLeave={() => {
              setHover(null)
              tip.hide()
            }}
            onClick={(e) => {
              const i = nearest(e)
              if (i == null || !onSelect) return
              if (points[i].selectable === false) return
              onSelect(points[i].id)
            }}
          />
        </g>
      </svg>
    </div>
  )
}
