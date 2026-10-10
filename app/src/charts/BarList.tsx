import * as d3 from 'd3'
import { useWidth } from './useSize'
import { useTooltip } from '../components/Tooltip'

export interface Bar {
  key: string
  label: string
  value: number
  color?: string
  note?: string
  highlight?: boolean
}

/** Ranked horizontal bars with labels on the left and values at the end. */
export function BarList({
  bars,
  format = d3.format(',.0f'),
  rowHeight = 26,
  labelWidth = 200,
  onSelect,
  selected,
  max,
}: {
  bars: Bar[]
  format?: (n: number) => string
  rowHeight?: number
  labelWidth?: number
  onSelect?: (key: string) => void
  selected?: string | null
  max?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()
  const lw = Math.min(labelWidth, width * 0.42)
  const iw = width - lw - 56
  const x = d3.scaleLinear().domain([0, max ?? d3.max(bars, (b) => b.value) ?? 1]).range([0, Math.max(10, iw)])
  const h = bars.length * rowHeight + 4
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={h} role="img" aria-label="Ranked bar chart">
        {bars.map((b, i) => {
          const y = i * rowHeight
          const dim = selected != null && selected !== b.key
          const label = b.label.length * 6.4 > lw ? b.label.slice(0, Math.floor(lw / 6.4) - 1) + '…' : b.label
          return (
            <g
              key={b.key}
              transform={`translate(0,${y})`}
              className="mark"
              data-dim={dim}
              style={{ cursor: onSelect ? 'pointer' : undefined }}
              onClick={() => onSelect?.(b.key)}
              onPointerMove={(e) =>
                tip.show(
                  e,
                  <>
                    <strong>{b.label}</strong>
                    <span className="tt-row">
                      <span>Value</span>
                      <span>{format(b.value)}</span>
                    </span>
                    {b.note && <span>{b.note}</span>}
                  </>,
                )
              }
              onPointerLeave={tip.hide}
            >
              <rect x={0} y={0} width={width} height={rowHeight} fill="transparent" />
              <text x={lw - 8} y={rowHeight / 2} dy="0.32em" textAnchor="end" className={b.highlight ? 'label-strong' : undefined}>
                {label}
              </text>
              <rect
                x={lw}
                y={5}
                width={Math.max(2, x(b.value))}
                height={rowHeight - 10}
                rx={2}
                fill={b.color ?? 'var(--series-1)'}
                stroke={b.highlight ? 'var(--ink)' : 'none'}
                strokeWidth={1.5}
              />
              <text x={lw + Math.max(2, x(b.value)) + 6} y={rowHeight / 2} dy="0.32em">
                {format(b.value)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
