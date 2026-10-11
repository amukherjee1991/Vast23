import * as d3 from 'd3'
import { useMemo, useState } from 'react'
import { useWidth } from './useSize'
import { useTooltip } from '../components/Tooltip'

export interface LineSeries {
  key: string
  label: string
  color: string
  values: { x: Date | number; y: number | null }[]
  dashed?: boolean
}

/** Multi-series line chart with a shared crosshair. One y-axis, always. */
export function LineChart({
  series,
  height = 280,
  yLabel,
  yFormat = d3.format('~s'),
  xFormat,
  area,
  markers,
  focus,
}: {
  series: LineSeries[]
  height?: number
  yLabel?: string
  yFormat?: (n: number) => string
  xFormat?: (d: Date | number) => string
  area?: boolean
  markers?: { x: Date | number; label: string }[]
  focus?: string | null
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()
  const [hoverX, setHoverX] = useState<number | null>(null)
  const m = { t: 16, r: series.length <= 4 ? 96 : 16, b: 28, l: 48 }
  const iw = width - m.l - m.r
  const ih = height - m.t - m.b

  const isDate = series[0]?.values[0]?.x instanceof Date
  const xs = useMemo(() => {
    const all = series.flatMap((s) => s.values.map((v) => +v.x))
    const dom = d3.extent(all) as [number, number]
    return isDate ? d3.scaleUtc().domain(dom.map((d) => new Date(d)) as [Date, Date]).range([0, iw]) : d3.scaleLinear().domain(dom).range([0, iw])
  }, [series, iw, isDate])
  const ys = useMemo(() => {
    const max = d3.max(series, (s) => d3.max(s.values, (v) => v.y ?? 0)) ?? 1
    return d3.scaleLinear().domain([0, max]).nice().range([ih, 0])
  }, [series, ih])

  const line = d3
    .line<{ x: Date | number; y: number | null }>()
    .defined((d) => d.y !== null)
    .x((d) => xs(d.x as never))
    .y((d) => ys(d.y ?? 0))
    .curve(d3.curveMonotoneX)
  const areaGen = d3
    .area<{ x: Date | number; y: number | null }>()
    .defined((d) => d.y !== null)
    .x((d) => xs(d.x as never))
    .y0(ih)
    .y1((d) => ys(d.y ?? 0))
    .curve(d3.curveMonotoneX)

  const xTicks = (xs as d3.ScaleLinear<number, number>).ticks(Math.max(2, Math.floor(iw / 110)))
  const fx = xFormat ?? ((d: Date | number) => (d instanceof Date ? d3.utcFormat('%b %Y')(d) : String(d)))
  const xValues = series[0]?.values.map((v) => v.x) ?? []

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const [px] = d3.pointer(e)
    const x0 = (xs as d3.ScaleLinear<number, number>).invert(px)
    const i = d3.bisectCenter(xValues.map((v) => +v), +x0)
    const xv = xValues[i]
    if (xv === undefined) return
    setHoverX(+xv)
    tip.show(
      e,
      <>
        <strong>{fx(xv)}</strong>
        {series.map((s) => {
          const v = s.values.find((p) => +p.x === +xv)
          return (
            <span className="tt-row" key={s.key}>
              <span>{s.label}</span>
              <span>{v?.y == null ? '—' : yFormat(v.y)}</span>
            </span>
          )
        })}
      </>,
    )
  }

  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label={`Line chart${yLabel ? ` of ${yLabel}` : ''}`}>
        <g transform={`translate(${m.l},${m.t})`}>
          <g className="grid">
            {ys.ticks(4).map((t) => (
              <line key={t} x1={0} x2={iw} y1={ys(t)} y2={ys(t)} />
            ))}
          </g>
          {ys.ticks(4).map((t) => (
            <text key={t} x={-8} y={ys(t)} dy="0.32em" textAnchor="end">
              {yFormat(t)}
            </text>
          ))}
          {yLabel && (
            <text x={-m.l + 2} y={-4} textAnchor="start">
              {yLabel}
            </text>
          )}
          <line x1={0} x2={iw} y1={ih} y2={ih} stroke="var(--rule-strong)" strokeWidth={1} />
          {xTicks.map((t) => (
            <text key={+t} x={xs(t as never)} y={ih + 18} textAnchor="middle">
              {fx(isDate ? new Date(+t) : +t)}
            </text>
          ))}
          {markers?.map((mk) => (
            <g key={mk.label} transform={`translate(${xs(mk.x as never)},0)`}>
              <line y1={0} y2={ih} stroke="var(--ink-3)" strokeDasharray="3 3" />
              <text y={-4} textAnchor="middle" className="label-strong">
                {mk.label}
              </text>
            </g>
          ))}
          {series.map((s) => {
            const dim = focus != null && focus !== s.key
            return (
              <g key={s.key} className="mark" data-dim={dim}>
                {area && <path d={areaGen(s.values) ?? ''} fill={s.color} opacity={0.12} />}
                <path d={line(s.values) ?? ''} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} />
              </g>
            )
          })}
          {series.length <= 4 &&
            series.map((s) => {
              const last = [...s.values].reverse().find((v) => v.y !== null)
              if (!last) return null
              return (
                <text key={s.key} x={iw + 6} y={ys(last.y ?? 0)} dy="0.32em" className="label-strong">
                  {s.label.length > 14 ? s.label.slice(0, 13) + '…' : s.label}
                </text>
              )
            })}
          {hoverX !== null && <line x1={xs(hoverX as never)} x2={xs(hoverX as never)} y1={0} y2={ih} stroke="var(--moon)" strokeOpacity={0.6} strokeWidth={1} />}
          <rect className="hit" width={iw} height={ih} onPointerMove={onMove} onPointerLeave={() => (setHoverX(null), tip.hide())} />
        </g>
      </svg>
    </div>
  )
}
