import * as d3 from 'd3'
import { useWidth } from './useSize'
import { useTooltip } from '../components/Tooltip'

// Night-sea sequential teal (tokens.css --seq-*): dark water → lit
const SEQ = ['#0a1722', '#0d2230', '#0f3340', '#10494f', '#12625f', '#157c72', '#17a99c', '#4fd1c2', '#a6f0e6']

/** Rows × columns intensity grid on the single-hue teal ramp. */
export function Heatmap({
  rows,
  cols,
  values,
  format = d3.format(',.0f'),
  rowLabelWidth = 180,
  cell = 18,
  highlightRows,
  onSelectRow,
}: {
  rows: string[]
  cols: string[]
  values: (number | null)[][]
  format?: (n: number) => string
  rowLabelWidth?: number
  cell?: number
  highlightRows?: string[]
  onSelectRow?: (r: string) => void
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()
  const lw = Math.min(rowLabelWidth, width * 0.4)
  const cw = Math.max(4, Math.min(28, (width - lw - 8) / Math.max(1, cols.length)))
  const max = d3.max(values.flat(), (v) => v ?? 0) ?? 1
  const color = d3.scaleQuantize<string>().domain([0, Math.sqrt(max)]).range(SEQ.slice(1))
  const h = rows.length * cell + 28
  const nth = Math.max(1, Math.ceil(cols.length / ((width - lw) / 48)))
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={h} role="img" aria-label="Heatmap">
        {rows.map((r, i) => (
          <g key={r} transform={`translate(0,${i * cell})`} style={{ cursor: onSelectRow ? 'pointer' : undefined }} onClick={() => onSelectRow?.(r)}>
            <text x={lw - 8} y={cell / 2} dy="0.32em" textAnchor="end" className={highlightRows?.includes(r) ? 'label-strong' : undefined}>
              {r.length * 6.2 > lw ? r.slice(0, Math.floor(lw / 6.2) - 1) + '…' : r}
            </text>
            {cols.map((c, j) => {
              const v = values[i]?.[j]
              return (
                <rect
                  key={c}
                  x={lw + j * cw}
                  y={1}
                  width={Math.max(1, cw - 1)}
                  height={cell - 2}
                  fill={v == null || v === 0 ? SEQ[0] : color(Math.sqrt(v))}
                  onPointerMove={(e) =>
                    tip.show(
                      e,
                      <>
                        <strong>{r}</strong>
                        <span className="tt-row">
                          <span>{c}</span>
                          <span>{v == null ? '—' : format(v)}</span>
                        </span>
                      </>,
                    )
                  }
                  onPointerLeave={tip.hide}
                />
              )
            })}
          </g>
        ))}
        {cols.map((c, j) =>
          j % nth === 0 ? (
            <text key={c} x={lw + j * cw} y={rows.length * cell + 16}>
              {c}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  )
}

export function HeatLegend({ max, format = d3.format('~s') }: { max: number; format?: (n: number) => string }) {
  return (
    <span className="legend-item">
      <span>0</span>
      <span style={{ display: 'inline-flex' }} aria-hidden>
        {SEQ.slice(1).map((c) => (
          <span key={c} style={{ width: 14, height: 10, background: c }} />
        ))}
      </span>
      <span>{format(max)}</span>
    </span>
  )
}
