import * as d3 from 'd3'
import { useWidth } from './useSize'
import { useTooltip } from '../components/Tooltip'

export interface Column {
  key: string
  label: string
  value: number
  color?: string
}

/** Vertical columns for histograms and binned distributions. */
export function Columns({
  cols,
  height = 220,
  format = d3.format(',.0f'),
  yLabel,
  logY,
  everyNthLabel,
}: {
  cols: Column[]
  height?: number
  format?: (n: number) => string
  yLabel?: string
  logY?: boolean
  everyNthLabel?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()
  const m = { t: 18, r: 8, b: 30, l: 44 }
  const iw = width - m.l - m.r
  const ih = height - m.t - m.b
  const x = d3.scaleBand().domain(cols.map((c) => c.key)).range([0, iw]).paddingInner(cols.length > 40 ? 0.08 : 0.2)
  const maxV = d3.max(cols, (c) => c.value) ?? 1
  const y = logY ? d3.scaleSymlog().domain([0, maxV]).range([ih, 0]) : d3.scaleLinear().domain([0, maxV]).nice().range([ih, 0])
  const nth = everyNthLabel ?? Math.max(1, Math.ceil(cols.length / Math.max(2, iw / 56)))
  const ticks = logY ? [0, ...d3.range(0, Math.ceil(Math.log10(maxV)) + 1).map((p) => 10 ** p).filter((t) => t <= maxV)] : (y as d3.ScaleLinear<number, number>).ticks(4)
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label={`Column chart${yLabel ? ` of ${yLabel}` : ''}`}>
        <g transform={`translate(${m.l},${m.t})`}>
          <g className="grid">
            {ticks.map((t) => (
              <line key={t} x1={0} x2={iw} y1={y(t)} y2={y(t)} />
            ))}
          </g>
          {ticks.map((t) => (
            <text key={t} x={-8} y={y(t)} dy="0.32em" textAnchor="end">
              {format(t)}
            </text>
          ))}
          {yLabel && (
            <text x={-m.l + 2} y={-6}>
              {yLabel}
            </text>
          )}
          {cols.map((c, i) => (
            <g key={c.key} onPointerMove={(e) => tip.show(e, <><strong>{c.label}</strong><span className="tt-row"><span>Count</span><span>{format(c.value)}</span></span></>)} onPointerLeave={tip.hide}>
              <rect x={x(c.key)} y={0} width={x.bandwidth()} height={ih} fill="transparent" />
              <rect x={x(c.key)} y={y(c.value)} width={x.bandwidth()} height={Math.max(0, ih - y(c.value))} rx={Math.min(2, x.bandwidth() / 3)} fill={c.color ?? 'var(--series-1)'} />
              {i % nth === 0 && (
                <text x={(x(c.key) ?? 0) + x.bandwidth() / 2} y={ih + 18} textAnchor="middle">
                  {c.label}
                </text>
              )}
            </g>
          ))}
          <line x1={0} x2={iw} y1={ih} y2={ih} stroke="var(--rule-strong)" />
        </g>
      </svg>
    </div>
  )
}
