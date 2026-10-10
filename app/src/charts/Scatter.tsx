import * as d3 from 'd3'
import type { ReactNode } from 'react'
import { useWidth } from './useSize'
import { useTooltip } from '../components/Tooltip'

export interface Point {
  id: string
  x: number
  y: number
  r?: number
  color?: string
  label?: string
  emph?: boolean
  tip?: ReactNode
}

/** Scatter / bubble plot. Emphasised points get an ink ring and a label. */
export function Scatter({
  points,
  height = 360,
  xLabel,
  yLabel,
  logX,
  logY,
  onSelect,
  selected,
  hideAxes,
}: {
  points: Point[]
  height?: number
  xLabel?: string
  yLabel?: string
  logX?: boolean
  logY?: boolean
  onSelect?: (id: string) => void
  selected?: string | null
  hideAxes?: boolean
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()
  const m = { t: 16, r: 16, b: hideAxes ? 12 : 40, l: hideAxes ? 12 : 52 }
  const iw = width - m.l - m.r
  const ih = height - m.t - m.b
  const mk = (log: boolean | undefined, dom: [number, number], range: [number, number]) =>
    log ? d3.scaleSymlog().domain(dom).range(range) : d3.scaleLinear().domain(dom).nice().range(range)
  const xs = mk(logX, d3.extent(points, (p) => p.x) as [number, number], [0, iw])
  const ys = mk(logY, d3.extent(points, (p) => p.y) as [number, number], [ih, 0])
  const fmt = d3.format('~s')
  const ordered = [...points].sort((a, b) => Number(!!a.emph) - Number(!!b.emph))
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label={`Scatter plot${xLabel ? ` of ${yLabel} against ${xLabel}` : ''}`}>
        <g transform={`translate(${m.l},${m.t})`}>
          {!hideAxes && (
            <>
              <g className="grid">
                {(ys as d3.ScaleLinear<number, number>).ticks(5).map((t) => (
                  <line key={t} x1={0} x2={iw} y1={ys(t)} y2={ys(t)} />
                ))}
              </g>
              {(ys as d3.ScaleLinear<number, number>).ticks(5).map((t) => (
                <text key={t} x={-8} y={ys(t)} dy="0.32em" textAnchor="end">
                  {fmt(t)}
                </text>
              ))}
              {(xs as d3.ScaleLinear<number, number>).ticks(Math.max(2, Math.floor(iw / 90))).map((t) => (
                <text key={t} x={xs(t)} y={ih + 18} textAnchor="middle">
                  {fmt(t)}
                </text>
              ))}
              <line x1={0} x2={iw} y1={ih} y2={ih} stroke="var(--ink)" />
              {xLabel && (
                <text x={iw} y={ih + 34} textAnchor="end" className="label-strong">
                  {xLabel} →
                </text>
              )}
              {yLabel && (
                <text x={-m.l + 2} y={-4} className="label-strong">
                  ↑ {yLabel}
                </text>
              )}
            </>
          )}
          {ordered.map((p) => {
            const dim = selected != null && selected !== p.id
            return (
              <g
                key={p.id}
                className="mark"
                data-dim={dim}
                transform={`translate(${xs(p.x)},${ys(p.y)})`}
                style={{ cursor: onSelect ? 'pointer' : undefined }}
                onClick={() => onSelect?.(p.id)}
                onPointerMove={(e) => tip.show(e, p.tip ?? <strong>{p.label ?? p.id}</strong>)}
                onPointerLeave={tip.hide}
              >
                <circle r={Math.max(8, (p.r ?? 4) + 4)} fill="transparent" />
                <circle
                  r={p.r ?? 4}
                  fill={p.color ?? 'var(--series-1)'}
                  fillOpacity={p.emph ? 1 : 0.55}
                  stroke={p.emph ? 'var(--ink)' : 'var(--cloth)'}
                  strokeWidth={p.emph ? 1.5 : 0.75}
                />
                {p.emph && p.label && (
                  <text x={(p.r ?? 4) + 5} dy="0.32em" className="label-strong">
                    {p.label.length > 26 ? p.label.slice(0, 25) + '…' : p.label}
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
