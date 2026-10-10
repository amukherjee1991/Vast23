import * as d3 from 'd3'
import { type ReactNode } from 'react'
import { useWidth } from '../../charts/useSize'
import { useTooltip } from '../../components/Tooltip'
import { Flag, type FlagCode } from '../../components/Flag'
import {
  ALL_COLOR,
  BUNDLE_COLOR,
  CAT_LABEL,
  COMPONENTS,
  COMPONENT_LABEL,
  FISH_COLOR,
  PRED_COLOR,
  PRED_DASH,
  PRED_STROKE,
  ROLE_COLOR,
  ROLE_LABEL,
  SUCC_COLOR,
  type BundleRec,
  type BundleVerdict,
  type Category,
  type Component,
  type PatternCat,
  type Role,
} from './data'

const fint = d3.format(',')
const fpct = d3.format('.0%')
const fpct1 = d3.format('.1%')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const mLabel = (m: number) => `${MONTHS[m % 12]} ${2028 + Math.floor(m / 12)}`

/* ───────── legend bits ───────── */

export function Swatch({ color, children, outline }: { color: string; children: ReactNode; outline?: boolean }) {
  return (
    <span className="legend-item">
      <span className="legend-swatch" style={{ background: color, borderColor: outline === false ? color : undefined }} aria-hidden />
      {children}
    </span>
  )
}
export function LineSwatch({ color, dashed, children }: { color: string; dashed?: boolean; children: ReactNode }) {
  return (
    <span className="legend-item">
      <svg width={22} height={10} aria-hidden>
        <line x1={1} x2={21} y1={5} y2={5} stroke={color} strokeWidth={2} strokeDasharray={dashed ? '4 3' : undefined} />
      </svg>
      {children}
    </span>
  )
}

/* ───────── bundle verdict tag (C / X / N) ───────── */

export const BUNDLE_FLAG: Record<BundleVerdict, FlagCode> = { Reliable: 'C', Questionable: 'X', Unreliable: 'N' }
export const BUNDLE_MEANING: Record<BundleVerdict, string> = {
  Reliable: 'C · “Affirmative”: use these links',
  Questionable: 'X · “Watch for my signals”: use with care',
  Unreliable: 'N · “Negative”: leave out',
}
export function BundleTag({ verdict, size = 18 }: { verdict: BundleVerdict; size?: number }) {
  return (
    <span className="mc2-btag">
      <Flag code={BUNDLE_FLAG[verdict]} size={size} decorative />
      <span>{verdict}</span>
    </span>
  )
}
export function BundleKey() {
  return (
    <dl className="mc2-bkey">
      {(['Reliable', 'Questionable', 'Unreliable'] as BundleVerdict[]).map((v) => (
        <div key={v}>
          <dt>
            <Flag code={BUNDLE_FLAG[v]} size={18} decorative />
            {v}
          </dt>
          <dd>
            {BUNDLE_FLAG[v]} · {BUNDLE_MEANING[v].split(': ')[1]}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/* ───────── shared month axis ───────── */

function YearAxis({ x, ih, m0, m1, w }: { x: (m: number) => number; ih: number; m0: number; m1: number; w: number }) {
  const years = d3.range(Math.ceil(m0 / 12) * 12, m1 + 1, 12)
  const every = w < 360 && years.length > 4 ? 2 : 1
  return (
    <g>
      <line x1={x(m0)} x2={x(m1 + 1)} y1={ih} y2={ih} stroke="var(--ink)" />
      {years.map((m, i) => (
        <g key={m} transform={`translate(${x(m)},${ih})`}>
          <line y2={4} stroke="var(--ink)" />
          {i % every === 0 && (
            <text x={3} y={16}>
              {2028 + m / 12}
            </text>
          )}
        </g>
      ))}
    </g>
  )
}

/* ───────── 84-month series (area or line), one y-axis ───────── */

export function MonthChart({
  values,
  color,
  height = 170,
  yLabel,
  yFormat = d3.format('~s'),
  yDomain,
  area,
  bands,
  marks,
  tipLabel,
}: {
  values: number[]
  color: string
  height?: number
  yLabel: string
  yFormat?: (n: number) => string
  yDomain?: [number, number]
  area?: boolean
  bands?: { m0: number; m1: number; label: string }[]
  marks?: { m: number; label: string }[]
  tipLabel: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()
  const m = { t: 22, r: 12, b: 24, l: 44 }
  const iw = width - m.l - m.r
  const ih = height - m.t - m.b
  const n = values.length
  const x = d3.scaleLinear().domain([0, n]).range([0, iw])
  const cx = (i: number) => x(i + 0.5)
  const y = d3
    .scaleLinear()
    .domain(yDomain ?? [0, d3.max(values) ?? 1])
    .nice()
    .range([ih, 0])
  const line = d3
    .line<number>()
    .x((_, i) => cx(i))
    .y((v) => y(v))
    .curve(d3.curveMonotoneX)
  const ar = d3
    .area<number>()
    .x((_, i) => cx(i))
    .y0(ih)
    .y1((v) => y(v))
    .curve(d3.curveMonotoneX)
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label={`${yLabel} by month, 2028 to 2034`}>
        <g transform={`translate(${m.l},${m.t})`}>
          {bands?.map((b) => (
            <g key={b.label} className="mc2-fade">
              <rect x={x(b.m0)} y={0} width={x(b.m1 + 1) - x(b.m0)} height={ih} fill="var(--flag-yellow)" opacity={0.35} />
              <text x={x(b.m0) + 4} y={10} className="label-strong">
                {b.label}
              </text>
            </g>
          ))}
          <g className="grid">
            {y.ticks(3).map((t) => (
              <line key={t} x1={0} x2={iw} y1={y(t)} y2={y(t)} />
            ))}
          </g>
          {y.ticks(3).map((t) => (
            <text key={t} x={-8} y={y(t)} dy="0.32em" textAnchor="end">
              {yFormat(t)}
            </text>
          ))}
          <text x={-m.l + 2} y={-10}>
            {yLabel}
          </text>
          {area && <path d={ar(values) ?? ''} fill={color} opacity={0.14} />}
          <path d={line(values) ?? ''} fill="none" stroke={color} strokeWidth={1.75} />
          {marks?.map((k) => (
            <g key={k.label} transform={`translate(${cx(k.m)},${y(values[k.m])})`} className="mc2-fade">
              <circle r={4} fill="var(--cloth)" stroke="var(--ink)" strokeWidth={1.5} />
              <text y={-9} textAnchor={k.m > n * 0.8 ? 'end' : 'middle'} className="label-strong">
                {k.label}
              </text>
            </g>
          ))}
          <YearAxis x={x} ih={ih} m0={0} m1={n - 1} w={iw} />
          <rect
            className="hit"
            width={iw}
            height={ih}
            onPointerMove={(e) => {
              const [px] = d3.pointer(e)
              const i = Math.max(0, Math.min(n - 1, Math.floor(x.invert(px))))
              tip.show(
                e,
                <>
                  <strong>{mLabel(i)}</strong>
                  <span className="tt-row">
                    <span>{tipLabel}</span>
                    <span>{yFormat(values[i])}</span>
                  </span>
                </>,
              )
            }}
            onPointerLeave={tip.hide}
          />
        </g>
      </svg>
    </div>
  )
}

/* ───────── lifespan: share of each role per span bin ───────── */

export function LifespanBars({
  labels,
  shipper,
  receiver,
  focus,
}: {
  labels: string[]
  shipper: number[]
  receiver: number[]
  focus: Role | null
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()
  const height = 220
  const m = { t: 22, r: 8, b: 40, l: 40 }
  const iw = width - m.l - m.r
  const ih = height - m.t - m.b
  const tot = { shipper: d3.sum(shipper), receiver: d3.sum(receiver) }
  const data = { shipper: shipper.map((v) => v / tot.shipper), receiver: receiver.map((v) => v / tot.receiver) }
  const x0 = d3.scaleBand().domain(labels).range([0, iw]).paddingInner(0.24)
  const x1 = d3.scaleBand<Role>().domain(['shipper', 'receiver']).range([0, x0.bandwidth()]).padding(0.06)
  const y = d3
    .scaleLinear()
    .domain([0, d3.max([...data.shipper, ...data.receiver]) ?? 1])
    .nice()
    .range([ih, 0])
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label="Share of shippers and receivers by months active">
        <g transform={`translate(${m.l},${m.t})`}>
          <g className="grid">
            {y.ticks(4).map((t) => (
              <line key={t} x1={0} x2={iw} y1={y(t)} y2={y(t)} />
            ))}
          </g>
          {y.ticks(4).map((t) => (
            <text key={t} x={-6} y={y(t)} dy="0.32em" textAnchor="end">
              {fpct(t)}
            </text>
          ))}
          <text x={-m.l + 2} y={-10}>
            Share of the role&rsquo;s companies
          </text>
          {labels.map((l, i) => (
            <g key={l} transform={`translate(${x0(l)},0)`}>
              {(['shipper', 'receiver'] as Role[]).map((r) => {
                const v = data[r][i]
                return (
                  <rect
                    key={r}
                    className="mark"
                    data-dim={focus != null && focus !== r}
                    x={x1(r)}
                    y={y(v)}
                    width={x1.bandwidth()}
                    height={ih - y(v)}
                    fill={ROLE_COLOR[r]}
                    stroke="var(--ink)"
                    strokeWidth={r === 'receiver' ? 1 : 0}
                    onPointerMove={(e) =>
                      tip.show(
                        e,
                        <>
                          <strong>
                            {ROLE_LABEL[r]}, active {l} month{l === '1' ? '' : 's'}
                          </strong>
                          <span className="tt-row">
                            <span>Companies</span>
                            <span>{fint((r === 'shipper' ? shipper : receiver)[i])}</span>
                          </span>
                          <span className="tt-row">
                            <span>Share</span>
                            <span>{fpct1(v)}</span>
                          </span>
                        </>,
                      )
                    }
                    onPointerLeave={tip.hide}
                  />
                )
              })}
              <text x={x0.bandwidth() / 2} y={ih + 16} textAnchor="middle">
                {l}
              </text>
            </g>
          ))}
          <line x1={0} x2={iw} y1={ih} y2={ih} stroke="var(--ink)" />
          <text x={iw} y={ih + 34} textAnchor="end">
            Months between first and last shipment
          </text>
        </g>
      </svg>
    </div>
  )
}

/* ───────── calendar index ───────── */

export function IndexChart({ all, fish, months, band }: { all: number[]; fish: number[]; months: string[]; band: [number, number] | null }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()
  const height = 150
  const m = { t: 22, r: 12, b: 24, l: 44 }
  const iw = width - m.l - m.r
  const ih = height - m.t - m.b
  const x = d3.scalePoint<number>().domain(d3.range(12)).range([0, iw]).padding(0.5)
  const y = d3.scaleLinear().domain([0.8, 1.12]).range([ih, 0])
  const step = x.step()
  const line = d3
    .line<number>()
    .x((_, i) => x(i) ?? 0)
    .y((v) => y(v))
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label="Seasonal index by calendar month, fish against all goods">
        <g transform={`translate(${m.l},${m.t})`}>
          {band && (
            <rect
              className="mc2-fade"
              x={(x(band[0]) ?? 0) - step / 2}
              width={step * (band[1] - band[0] + 1)}
              y={0}
              height={ih}
              fill="var(--flag-yellow)"
              opacity={0.35}
            />
          )}
          <g className="grid">
            {[0.85, 0.95, 1.05].map((t) => (
              <line key={t} x1={0} x2={iw} y1={y(t)} y2={y(t)} />
            ))}
          </g>
          {[0.85, 0.95, 1.05].map((t) => (
            <text key={t} x={-6} y={y(t)} dy="0.32em" textAnchor="end">
              {t.toFixed(2)}
            </text>
          ))}
          <line x1={0} x2={iw} y1={y(1)} y2={y(1)} stroke="var(--ink-3)" strokeDasharray="4 3" />
          <text x={-8} y={y(1)} dy="0.32em" textAnchor="end">
            1.00
          </text>
          <path d={line(all) ?? ''} fill="none" stroke={ALL_COLOR} strokeWidth={1.5} />
          <path d={line(fish) ?? ''} fill="none" stroke={FISH_COLOR} strokeWidth={2} />
          {fish.map((v, i) => (
            <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={FISH_COLOR} />
          ))}
          {months.map((mo, i) => (
            <text key={mo} x={x(i)} y={ih + 16} textAnchor="middle">
              {iw < 330 ? mo[0] : mo}
            </text>
          ))}
          <line x1={0} x2={iw} y1={ih} y2={ih} stroke="var(--ink)" />
          {months.map((mo, i) => (
            <rect
              key={mo}
              className="hit"
              x={(x(i) ?? 0) - step / 2}
              width={step}
              height={ih}
              onPointerMove={(e) =>
                tip.show(
                  e,
                  <>
                    <strong>{mo}</strong>
                    <span className="tt-row">
                      <span>Fish</span>
                      <span>{fish[i].toFixed(2)}</span>
                    </span>
                    <span className="tt-row">
                      <span>All goods</span>
                      <span>{all[i].toFixed(2)}</span>
                    </span>
                  </>,
                )
              }
              onPointerLeave={tip.hide}
            />
          ))}
        </g>
      </svg>
    </div>
  )
}

/* ───────── pattern taxonomy: share bars + exemplar small multiples ───────── */

function Mini({ cat, width, height = 28 }: { cat: PatternCat; width: number; height?: number }) {
  const x = d3.scaleLinear().domain([0, 83]).range([1, width - 1])
  const aggMax = d3.max(cat.aggregate_monthly) || 1
  const ya = d3.scaleLinear().domain([0, aggMax]).range([height - 1, 2])
  const area = d3
    .area<number>()
    .x((_, i) => x(i))
    .y0(height - 1)
    .y1((v) => ya(v))
    .curve(d3.curveMonotoneX)
  return (
    <svg className="chart" width={width} height={height} aria-hidden>
      <path d={area(cat.aggregate_monthly) ?? ''} fill="var(--series-other)" opacity={0.35} />
      {cat.exemplars.slice(0, 1).map((e, k) => {
        const mx = d3.max(e.monthly) || 1
        const y = d3.scaleLinear().domain([0, mx]).range([height - 1, 3])
        const line = d3
          .line<number>()
          .x((_, i) => x(i))
          .y((v) => y(v))
        return <path key={k} d={line(e.monthly) ?? ''} fill="none" stroke="var(--ink)" strokeWidth={1.25} />
      })}
      <line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} stroke="var(--rule-strong)" />
    </svg>
  )
}

export function Taxonomy({
  cats,
  order,
  totalPairs,
  totalShip,
  focus,
}: {
  cats: PatternCat[]
  order: Category[]
  totalPairs: number
  totalShip: number
  focus: Category[] | null
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()
  const stacked = width < 520
  const barW = stacked ? Math.max(80, width - 150) : Math.max(80, Math.min(170, (width - 150) * 0.45))
  const miniW = stacked ? width : Math.max(120, width - 150 - barW - 24)
  const sx = d3.scaleLinear().domain([0, 0.45]).range([0, barW - 40])
  return (
    <div ref={ref}>
      <ol className={`mc2-tax${stacked ? ' mc2-tax--stacked' : ''}`}>
        {order.map((c) => {
          const cat = cats.find((k) => k.category === c)!
          const sp = cat.pairs / totalPairs
          const ss = cat.shipments / totalShip
          const dim = focus != null && !focus.includes(c)
          return (
            <li
              key={c}
              className="mc2-tax__row mark"
              data-dim={dim}
              onPointerMove={(e) =>
                tip.show(
                  e,
                  <>
                    <strong>{CAT_LABEL[c]}</strong>
                    <span>{cat.definition}</span>
                    <span className="tt-row">
                      <span>Median span</span>
                      <span>{cat.median_span_months ?? '—'} months</span>
                    </span>
                    <span className="tt-row">
                      <span>Fish pairs</span>
                      <span>{fint(cat.fish_pairs)}</span>
                    </span>
                  </>,
                )
              }
              onPointerLeave={tip.hide}
            >
              <span className="mc2-tax__name">
                {CAT_LABEL[c]}
                <span className="mc2-tax__n tnum">{fint(cat.pairs)} pairs</span>
              </span>
              <svg className="chart mc2-tax__bars" width={barW} height={30} aria-label={`${fpct1(sp)} of pairs, ${fpct1(ss)} of shipments`}>
                <rect x={0} y={2} width={Math.max(1.5, sx(sp))} height={11} fill="var(--series-other)" />
                <text x={Math.max(1.5, sx(sp)) + 4} y={8} dy="0.32em">
                  {fpct1(sp)}
                </text>
                <rect x={0} y={17} width={Math.max(1.5, sx(ss))} height={11} fill="var(--ink)" />
                <text x={Math.max(1.5, sx(ss)) + 4} y={23} dy="0.32em" className="label-strong">
                  {fpct1(ss)}
                </text>
              </svg>
              <Mini cat={cat} width={miniW} />
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/* ───────── successor gap profile ───────── */

export function GapColumns({
  bins,
  shipper,
  receiver,
  band,
}: {
  bins: number[]
  shipper: number[]
  receiver: number[]
  band: 'twins' | 'restarts' | null
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()
  const height = 210
  const m = { t: 26, r: 22, b: 44, l: 34 }
  const iw = width - m.l - m.r
  const ih = height - m.t - m.b
  const labels = bins.slice(0, -1).map((b, i) => `${b > 0 ? '+' : ''}${b}…${bins[i + 1] > 0 ? '+' : ''}${bins[i + 1]}`)
  const x0 = d3.scaleBand<number>().domain(d3.range(labels.length)).range([0, iw]).paddingInner(0.22)
  const x1 = d3.scaleBand<Role>().domain(['shipper', 'receiver']).range([0, x0.bandwidth()]).padding(0.06)
  const y = d3
    .scaleLinear()
    .domain([0, d3.max([...shipper, ...receiver]) ?? 1])
    .nice()
    .range([ih, 0])
  const B = { twins: [1, 3, 'Coexisting twins'], restarts: [6, 7, 'Restarts'] } as const
  const zero = x0(6)! - (x0.step() - x0.bandwidth()) / 2
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label="Look-alike company pairs per month of gap">
        <g transform={`translate(${m.l},${m.t})`}>
          {band && (
            <g className="mc2-fade">
              <rect
                x={x0(B[band][0])! - 3}
                width={x0(B[band][1])! + x0.bandwidth() - x0(B[band][0])! + 6}
                y={0}
                height={ih}
                fill="var(--flag-yellow)"
                opacity={0.35}
              />
              <text x={x0(B[band][0])!} y={10} className="label-strong">
                {B[band][2]}
              </text>
            </g>
          )}
          <g className="grid">
            {y.ticks(4).map((t) => (
              <line key={t} x1={0} x2={iw} y1={y(t)} y2={y(t)} />
            ))}
          </g>
          {y.ticks(4).map((t) => (
            <text key={t} x={-6} y={y(t)} dy="0.32em" textAnchor="end">
              {t}
            </text>
          ))}
          <text x={-m.l + 2} y={-12}>
            Look-alike pairs per month of gap
          </text>
          {labels.map((l, i) => (
            <g key={l} transform={`translate(${x0(i)},0)`}>
              {(['shipper', 'receiver'] as Role[]).map((r) => {
                const v = (r === 'shipper' ? shipper : receiver)[i]
                return (
                  <rect
                    key={r}
                    x={x1(r)}
                    y={y(v)}
                    width={x1.bandwidth()}
                    height={ih - y(v)}
                    fill={ROLE_COLOR[r]}
                    stroke="var(--ink)"
                    strokeWidth={r === 'receiver' && v > 0 ? 1 : 0}
                    onPointerMove={(e) =>
                      tip.show(
                        e,
                        <>
                          <strong>
                            {ROLE_LABEL[r]}, gap {l} months
                          </strong>
                          <span className="tt-row">
                            <span>Pairs per gap-month</span>
                            <span>{v.toFixed(2)}</span>
                          </span>
                        </>,
                      )
                    }
                    onPointerLeave={tip.hide}
                  />
                )
              })}
              {(iw > 420 || i % 2 === 0) && (
                <text x={x0.bandwidth() / 2} y={ih + 14} textAnchor="middle" style={{ fontSize: 12 }}>
                  {l}
                </text>
              )}
            </g>
          ))}
          <line x1={zero} x2={zero} y1={-4} y2={ih} stroke="var(--ink)" strokeDasharray="3 3" />
          <line x1={0} x2={iw} y1={ih} y2={ih} stroke="var(--ink)" />
          <text x={zero - 6} y={ih + 32} textAnchor="end">
            {iw < 420 ? '← overlap' : '← the later company starts before the stop'}
          </text>
          <text x={zero + 6} y={ih + 32}>
            after →
          </text>
        </g>
      </svg>
    </div>
  )
}

/* ───────── Q2 scorecard ───────── */

const SEQ = ['var(--seq-100)', 'var(--seq-200)', 'var(--seq-300)', 'var(--seq-400)', 'var(--seq-500)', 'var(--seq-600)', 'var(--seq-700)', 'var(--seq-800)']
export const seqColor = (v: number) => SEQ[Math.min(SEQ.length - 1, Math.max(0, Math.floor(v * SEQ.length - 1e-9)))]
export function SeqLegend() {
  return (
    <span className="legend-item">
      <span>0</span>
      <span className="mc2-seq" aria-hidden>
        {SEQ.map((c) => (
          <span key={c} style={{ background: c }} />
        ))}
      </span>
      <span>1 = matches the real graph</span>
    </span>
  )
}

export function Scorecard({
  bundles,
  selected,
  onSelect,
  colFocus,
  defs,
  thresholds,
}: {
  bundles: BundleRec[]
  selected: string
  onSelect: (b: string) => void
  colFocus: Component[] | null
  defs: Record<Component, string>
  thresholds: { Reliable: number; Questionable: number }
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()
  const narrow = width < 560
  const nameW = narrow ? 92 : 116
  const scoreW = narrow ? 52 : 112
  const cell = Math.max(14, Math.min(30, Math.floor((width - nameW - scoreW - (narrow ? 26 : 30) - 16) / COMPONENTS.length)))
  return (
    <div ref={ref} className="mc2-score" style={{ ['--cell' as string]: `${cell}px`, ['--name' as string]: `${nameW}px`, ['--sc' as string]: `${scoreW}px` }}>
      <div className="mc2-score__head" aria-hidden>
        <span />
        <span />
        <span className="mc2-score__scorehead">Score</span>
        {COMPONENTS.map((c) => (
          <span key={c} className="mc2-score__col" data-on={colFocus?.includes(c) ?? false}>
            <span>{COMPONENT_LABEL[c]}</span>
          </span>
        ))}
      </div>
      <ol className="mc2-score__rows">
        {bundles.map((b) => {
          const gated = b.gates_failed.length > 0
          return (
            <li key={b.bundle}>
              <button
                type="button"
                className="mc2-score__row"
                aria-pressed={selected === b.bundle}
                aria-label={`${b.bundle}: ${b.verdict}, score ${b.score.toFixed(2)}${gated ? `, failed gates: ${b.gates_failed.map((g) => g.reason).join('; ')}` : ''}`}
                onClick={() => onSelect(b.bundle)}
              >
                <Flag code={BUNDLE_FLAG[b.verdict]} size={18} decorative />
                <span className="mc2-score__name">{b.bundle}</span>
                <span className="mc2-score__bar">
                  {!narrow && (
                    <svg width={scoreW - 54} height={10} aria-hidden>
                      <rect width={scoreW - 54} height={10} fill="var(--ground)" />
                      <rect width={(scoreW - 54) * b.score} height={10} fill={BUNDLE_COLOR[b.verdict]} />
                      <line x1={(scoreW - 54) * thresholds.Reliable} x2={(scoreW - 54) * thresholds.Reliable} y1={-1} y2={11} stroke="var(--ink)" />
                    </svg>
                  )}
                  <span className="tnum">
                    {b.score.toFixed(2)}
                    {gated && b.verdict === 'Unreliable' && b.score >= thresholds.Questionable ? '*' : ''}
                  </span>
                </span>
                {COMPONENTS.map((c) => {
                  const v = b.components[c]
                  return (
                    <span
                      key={c}
                      className="mc2-score__cell"
                      data-on={colFocus?.includes(c) ?? false}
                      data-dim={colFocus != null && !colFocus.includes(c)}
                      style={{ background: seqColor(v) }}
                      onPointerMove={(e) =>
                        tip.show(
                          e,
                          <>
                            <strong>
                              {b.bundle} · {COMPONENT_LABEL[c]} {v.toFixed(2)}
                            </strong>
                            <span>{defs[c]}</span>
                          </>,
                        )
                      }
                      onPointerLeave={tip.hide}
                    />
                  )
                })}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/* ───────── Q2 bundle vs real graph, one panel ───────── */

export function DistPanel({
  title,
  labels,
  bundle,
  ref_,
  color,
  height = 120,
  every = 1,
  shares,
}: {
  title: string
  labels: string[]
  bundle: number[]
  ref_: number[]
  color: string
  height?: number
  every?: number
  /** bundle values are already shares (not counts) */
  shares?: boolean
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()
  const m = { t: 30, r: 4, b: 20, l: 30 }
  const iw = width - m.l - m.r
  const ih = height - m.t - m.b
  const tot = shares ? 1 : d3.sum(bundle) || 1
  const share = bundle.map((v) => v / tot)
  const x = d3.scaleBand<number>().domain(d3.range(labels.length)).range([0, iw]).paddingInner(0.18)
  const y = d3
    .scaleLinear()
    .domain([0, Math.max(d3.max(share) ?? 0, d3.max(ref_) ?? 0) || 1])
    .nice(3)
    .range([ih, 0])
  return (
    <div ref={ref} className="mc2-dist">
      <svg className="chart" width={width} height={height} role="img" aria-label={`${title}: bundle share against the real graph`}>
        <g transform={`translate(${m.l},${m.t})`}>
          <text x={-m.l + 2} y={-18} className="label-strong">
            {title}
          </text>
          {y.ticks(2).map((t) => (
            <g key={t}>
              <line x1={0} x2={iw} y1={y(t)} y2={y(t)} stroke="var(--rule)" strokeDasharray="2 3" />
              <text x={-4} y={y(t)} dy="0.32em" textAnchor="end">
                {fpct(t)}
              </text>
            </g>
          ))}
          {share.map((v, i) => (
            <rect
              key={i}
              x={x(i)}
              y={y(v)}
              width={x.bandwidth()}
              height={ih - y(v)}
              fill={color}
              stroke="var(--ink)"
              strokeWidth={v > 0 ? 0.75 : 0}
            />
          ))}
          {ref_.map((v, i) => (
            <line
              key={i}
              x1={x(i)}
              x2={(x(i) ?? 0) + x.bandwidth()}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--ink)"
              strokeWidth={2}
            />
          ))}
          <line x1={0} x2={iw} y1={ih} y2={ih} stroke="var(--ink)" />
          {labels.map((l, i) =>
            i % every === 0 ? (
              <text key={i} x={(x(i) ?? 0) + x.bandwidth() / 2} y={ih + 13} textAnchor="middle" style={{ fontSize: 12 }}>
                {l}
              </text>
            ) : null,
          )}
          {labels.map((l, i) => (
            <rect
              key={`h${i}`}
              className="hit"
              x={(x(i) ?? 0) - (x.step() - x.bandwidth()) / 2}
              width={x.step()}
              height={ih}
              onPointerMove={(e) =>
                tip.show(
                  e,
                  <>
                    <strong>{l}</strong>
                    <span className="tt-row">
                      <span>Bundle</span>
                      <span>
                        {fpct1(share[i])}
                        {shares ? '' : ` (${bundle[i]})`}
                      </span>
                    </span>
                    <span className="tt-row">
                      <span>Real graph</span>
                      <span>{fpct1(ref_[i])}</span>
                    </span>
                  </>,
                )
              }
              onPointerLeave={tip.hide}
            />
          ))}
        </g>
      </svg>
    </div>
  )
}

/* ───────── Q3: 2034 volume with the added links ───────── */

export function AddedColumns({ months, before, added, focus }: { months: string[]; before: number[]; added: number[]; focus: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()
  const height = 176
  const m = { t: 22, r: 8, b: 22, l: 44 }
  const iw = width - m.l - m.r
  const ih = height - m.t - m.b
  const gap = 18
  const hTop = (ih - gap) * 0.6
  const hBot = ih - gap - hTop
  const x = d3.scaleBand<number>().domain(d3.range(12)).range([0, iw]).paddingInner(0.25)
  const yA = d3.scaleLinear().domain([0, d3.max(before) ?? 1]).nice(2).range([hTop, 0])
  const yB = d3.scaleLinear().domain([0, 50]).range([hBot, 0])
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label="Real 2034 shipments by month, and the predicted links added">
        <g transform={`translate(${m.l},${m.t})`}>
          <text x={-m.l + 2} y={-10}>
            Real shipments, 2034
          </text>
          {yA.ticks(2).map((t) => (
            <g key={t}>
              <line x1={0} x2={iw} y1={yA(t)} y2={yA(t)} stroke="var(--rule)" strokeDasharray="2 3" />
              <text x={-6} y={yA(t)} dy="0.32em" textAnchor="end">
                {d3.format('~s')(t)}
              </text>
            </g>
          ))}
          {before.map((v, i) => (
            <rect key={i} x={x(i)} y={yA(v)} width={x.bandwidth()} height={hTop - yA(v)} fill="var(--series-other)" />
          ))}
          <line x1={0} x2={iw} y1={hTop} y2={hTop} stroke="var(--ink)" />
          <g transform={`translate(0,${hTop + gap})`} className="mark" data-dim={false}>
            <text x={-m.l + 2} y={-4}>
              Predicted links added (scale ×1,000 larger)
            </text>
            {[0, 25, 50].map((t) => (
              <g key={t}>
                <line x1={0} x2={iw} y1={yB(t)} y2={yB(t)} stroke="var(--rule)" strokeDasharray="2 3" />
                <text x={-6} y={yB(t)} dy="0.32em" textAnchor="end">
                  {t}
                </text>
              </g>
            ))}
            {added.map((v, i) => (
              <rect
                key={i}
                x={x(i)}
                y={yB(v)}
                width={x.bandwidth()}
                height={hBot - yB(v)}
                fill={BUNDLE_COLOR.Reliable}
                stroke={focus ? 'var(--ink)' : 'none'}
                strokeWidth={1.5}
              />
            ))}
            <line x1={0} x2={iw} y1={hBot} y2={hBot} stroke="var(--ink)" />
            {months.map((mo, i) => (
              <text key={mo} x={(x(i) ?? 0) + x.bandwidth() / 2} y={hBot + 14} textAnchor="middle">
                {iw < 330 ? MONTHS[i][0] : MONTHS[i]}
              </text>
            ))}
          </g>
          {months.map((mo, i) => (
            <rect
              key={mo}
              className="hit"
              x={(x(i) ?? 0) - (x.step() - x.bandwidth()) / 2}
              width={x.step()}
              height={ih}
              onPointerMove={(e) =>
                tip.show(
                  e,
                  <>
                    <strong>{mo}</strong>
                    <span className="tt-row">
                      <span>Real shipments</span>
                      <span>{fint(before[i])}</span>
                    </span>
                    <span className="tt-row">
                      <span>Links added</span>
                      <span>
                        {added[i]} ({d3.format('.2%')(added[i] / before[i])})
                      </span>
                    </span>
                  </>,
                )
              }
              onPointerLeave={tip.hide}
            />
          ))}
        </g>
      </svg>
    </div>
  )
}

/* ───────── Q3: pattern transitions (only the changed ones) ───────── */

export function TransitionGrid({ transitions, focus }: { transitions: { from: Category; to: Category; pairs: number }[]; focus: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()
  const froms = [...new Set(transitions.map((t) => t.from))]
  const tos = [...new Set(transitions.map((t) => t.to))]
  const lw = 92
  const cw = Math.max(40, Math.min(86, (width - lw - 8) / tos.length))
  const ch = 28
  const height = froms.length * ch + 52
  const r = d3.scaleSqrt().domain([0, 83]).range([2, 12])
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label="Pair pattern before and after adding the reliable links">
        <text x={lw} y={10} className="label-strong">
          After →
        </text>
        {tos.map((t, j) => (
          <text key={t} x={lw + j * cw + cw / 2} y={30} textAnchor="middle" style={{ fontSize: 12 }}>
            {CAT_LABEL[t]}
          </text>
        ))}
        {froms.map((f, i) => (
          <g key={f} transform={`translate(0,${40 + i * ch})`}>
            <text x={lw - 8} y={ch / 2} dy="0.32em" textAnchor="end">
              {CAT_LABEL[f]}
            </text>
            <line x1={lw} x2={lw + tos.length * cw} y1={ch / 2} y2={ch / 2} stroke="var(--rule)" />
            {tos.map((t, j) => {
              const tr = transitions.find((x) => x.from === f && x.to === t)
              if (!tr) return null
              const same = f === t
              return (
                <g
                  key={t}
                  transform={`translate(${lw + j * cw + cw / 2},${ch / 2})`}
                  className="mark"
                  data-dim={focus && same}
                  onPointerMove={(e) =>
                    tip.show(
                      e,
                      <>
                        <strong>
                          {CAT_LABEL[f]} → {CAT_LABEL[t]}
                        </strong>
                        <span className="tt-row">
                          <span>Pairs</span>
                          <span>{tr.pairs}</span>
                        </span>
                      </>,
                    )
                  }
                  onPointerLeave={tip.hide}
                >
                  <circle r={r(tr.pairs)} fill={same ? 'var(--series-other)' : BUNDLE_COLOR.Reliable} fillOpacity={same ? 0.5 : 1} stroke="var(--ink)" strokeWidth={same ? 0.5 : 1} />
                  <text x={r(tr.pairs) + 3} y={0} dy="0.32em" className={same ? undefined : 'label-strong'} style={{ fontSize: 12 }}>
                    {tr.pairs}
                  </text>
                </g>
              )
            })}
          </g>
        ))}
      </svg>
    </div>
  )
}

/* ───────── Q3: revived stoppers on a 2034 axis ───────── */

export function RevivedRows({ rows, focus }: { rows: { id: string; role: string; last_month_before: string; last_month_after: string; shipments: number }[]; focus: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const lw = width < 480 ? 0 : 210
  const rowH = width < 480 ? 44 : 30
  const iw = width - lw - 12
  const x = d3.scaleLinear().domain([0, 12]).range([0, iw])
  const mo = (s: string) => +s.split('-')[1] - 1
  const height = rows.length * rowH + 26
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label="Last real month and last predicted month for three companies">
        {rows.map((r, i) => {
          const a = mo(r.last_month_before)
          const b = mo(r.last_month_after)
          const y0 = i * rowH + (lw ? rowH / 2 : rowH - 10)
          return (
            <g key={r.id}>
              <text x={lw ? lw - 8 : 0} y={lw ? y0 : y0 - 14} dy="0.32em" textAnchor={lw ? 'end' : 'start'} className="label-strong">
                {r.id.replace(/\s{2,}/g, ' ').length > 30 ? r.id.replace(/\s{2,}/g, ' ').slice(0, 29) + '…' : r.id.replace(/\s{2,}/g, ' ')}
              </text>
              <g transform={`translate(${lw},0)`}>
                <line x1={0} x2={x(a + 1)} y1={y0} y2={y0} stroke="var(--ink)" strokeWidth={4} />
                <line
                  className="mark"
                  data-dim={false}
                  x1={x(a + 1)}
                  x2={x(b + 1)}
                  y1={y0}
                  y2={y0}
                  stroke={BUNDLE_COLOR.Reliable}
                  strokeWidth={focus ? 4 : 3}
                  strokeDasharray="4 2"
                />
                <circle cx={x(a + 1)} cy={y0} r={4} fill="var(--cloth)" stroke="var(--ink)" strokeWidth={1.5} />
              </g>
            </g>
          )
        })}
        <g transform={`translate(${lw},${rows.length * rowH + 4})`}>
          <line x1={0} x2={iw} stroke="var(--ink)" />
          {d3.range(12).map((i) =>
            i % (iw < 300 ? 2 : 1) === 0 ? (
              <text key={i} x={x(i + 0.5)} y={14} textAnchor="middle">
                {iw < 330 ? MONTHS[i][0] : MONTHS[i]}
              </text>
            ) : null,
          )}
        </g>
      </svg>
    </div>
  )
}

/* ───────── Q4: handover timeline (old above, new below, one axis) ───────── */

export function Handover({
  pred,
  succ,
  stop,
  start,
  predName,
  succName,
}: {
  pred: number[]
  succ: number[]
  stop: number
  start: number
  predName: string
  succName: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()
  const nz = (a: number[]) => a.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0)
  const act = [...nz(pred), ...nz(succ)]
  let m0 = Math.max(0, (d3.min(act) ?? 0) - 4)
  let m1 = Math.min(83, (d3.max(act) ?? 83) + 4)
  if (m1 - m0 < 24) {
    const pad = Math.ceil((24 - (m1 - m0)) / 2)
    m0 = Math.max(0, m0 - pad)
    m1 = Math.min(83, m1 + pad)
  }
  const height = 230
  const m = { t: 24, r: 10, b: 24, l: 40 }
  const iw = width - m.l - m.r
  const ih = height - m.t - m.b
  const mid = ih / 2
  const x = d3.scaleLinear().domain([m0, m1 + 1]).range([0, iw])
  const bw = Math.max(1, x(1) - x(0) - 1)
  const max = Math.max(d3.max(pred.slice(m0, m1 + 1)) ?? 1, d3.max(succ.slice(m0, m1 + 1)) ?? 1, 1)
  const y = d3.scaleLinear().domain([0, max]).nice(2).range([0, mid - 6])
  const months = d3.range(m0, m1 + 1)
  const ticks = y.ticks(2).filter((t) => t > 0)
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label={`Monthly shipments of ${predName} (above the axis) and ${succName} (below)`}>
        <g transform={`translate(${m.l},${m.t})`}>
          <text x={-m.l + 2} y={-10}>
            Shipments per month
          </text>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={0} x2={iw} y1={mid - y(t)} y2={mid - y(t)} stroke="var(--rule)" strokeDasharray="2 3" />
              <line x1={0} x2={iw} y1={mid + y(t)} y2={mid + y(t)} stroke="var(--rule)" strokeDasharray="2 3" />
              <text x={-6} y={mid - y(t)} dy="0.32em" textAnchor="end">
                {t}
              </text>
              <text x={-6} y={mid + y(t)} dy="0.32em" textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          <rect
            className="mc2-fade"
            x={x(Math.min(stop, start) + (stop < start ? 1 : 0))}
            width={Math.max(2, Math.abs(x(start) - x(stop + 1)))}
            y={0}
            height={ih}
            fill="var(--flag-yellow)"
            opacity={0.4}
          />
          {months.map((i) => (
            <g key={i}>
              {pred[i] > 0 && <rect x={x(i) + 1} y={mid - y(pred[i]) + 0.5} width={Math.max(1, bw - 1)} height={Math.max(0, y(pred[i]) - 0.5)} fill={PRED_COLOR} stroke={PRED_STROKE} strokeWidth={1} />}
              {succ[i] > 0 && <rect x={x(i) + 0.5} y={mid} width={bw} height={y(succ[i])} fill={SUCC_COLOR} />}
            </g>
          ))}
          <line x1={0} x2={iw} y1={mid} y2={mid} stroke="var(--ink)" />
          <g transform={`translate(${x(stop + 1)},0)`}>
            <line y1={-2} y2={mid} stroke={PRED_STROKE} strokeWidth={1.5} strokeDasharray={PRED_DASH} />
            <text y={-4} textAnchor={x(stop + 1) > iw - 90 ? 'end' : 'middle'} className="label-strong">
              last {mLabel(stop)}
            </text>
          </g>
          <g transform={`translate(${x(start)},0)`}>
            <line y1={mid} y2={ih + 2} stroke={SUCC_COLOR} strokeWidth={1.5} />
            <text y={ih - 4} dx={4} textAnchor={x(start) > iw - 90 ? 'end' : 'start'} className="label-strong">
              first {mLabel(start)}
            </text>
          </g>
          <g transform={`translate(0,${ih})`}>
            {months
              .filter((i) => i % 12 === 0)
              .map((i) => (
                <g key={i} transform={`translate(${x(i)},0)`}>
                  <line y2={4} stroke="var(--ink)" />
                  <text x={2} y={16}>
                    {2028 + i / 12}
                  </text>
                </g>
              ))}
          </g>
          <rect
            className="hit"
            width={iw}
            height={ih}
            onPointerMove={(e) => {
              const [px] = d3.pointer(e)
              const i = Math.max(m0, Math.min(m1, Math.floor(x.invert(px))))
              tip.show(
                e,
                <>
                  <strong>{mLabel(i)}</strong>
                  <span className="tt-row">
                    <span>Old: {predName.length > 22 ? predName.slice(0, 21) + '…' : predName}</span>
                    <span>{pred[i]}</span>
                  </span>
                  <span className="tt-row">
                    <span>New: {succName.length > 22 ? succName.slice(0, 21) + '…' : succName}</span>
                    <span>{succ[i]}</span>
                  </span>
                </>,
              )
            }}
            onPointerLeave={tip.hide}
          />
        </g>
      </svg>
    </div>
  )
}

/* ───────── Q4: shared partners switching over ───────── */

export function PartnerSwitch({
  partners,
  m0,
  m1,
}: {
  partners: { id: string; pred_shipments: number; succ_shipments: number; pred_last_month: number; succ_first_month: number }[]
  m0: number
  m1: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()
  const stacked = width < 480
  const lw = stacked ? 0 : 190
  const rowH = stacked ? 40 : 26
  const iw = width - lw - 10
  const x = d3.scaleLinear().domain([m0, m1 + 1]).range([0, iw])
  const height = partners.length * rowH + 22
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label="Each shared partner's last month with the old company and first month with the new one">
        {partners.map((p, i) => {
          const y0 = i * rowH + (stacked ? rowH - 10 : rowH / 2)
          const a = x(p.pred_last_month + 0.5)
          const b = x(p.succ_first_month + 0.5)
          const name = p.id.replace(/\s{2,}/g, ' ')
          return (
            <g
              key={p.id}
              onPointerMove={(e) =>
                tip.show(
                  e,
                  <>
                    <strong>{name}</strong>
                    <span className="tt-row">
                      <span>With the old company</span>
                      <span>
                        {p.pred_shipments}, last {mLabel(p.pred_last_month)}
                      </span>
                    </span>
                    <span className="tt-row">
                      <span>With the new company</span>
                      <span>
                        {p.succ_shipments}, first {mLabel(p.succ_first_month)}
                      </span>
                    </span>
                  </>,
                )
              }
              onPointerLeave={tip.hide}
            >
              <rect x={0} y={i * rowH} width={width} height={rowH} fill="transparent" />
              <text x={stacked ? 0 : lw - 8} y={stacked ? y0 - 14 : y0} dy="0.32em" textAnchor={stacked ? 'start' : 'end'}>
                {name.length > 28 ? name.slice(0, 27) + '…' : name}
              </text>
              <g transform={`translate(${lw},0)`}>
                <line x1={0} x2={iw} y1={y0} y2={y0} stroke="var(--rule)" />
                <line x1={a} x2={b} y1={y0} y2={y0} stroke="var(--ink-3)" strokeWidth={1.5} />
                <circle cx={a} cy={y0} r={4.5} fill={PRED_COLOR} stroke="var(--ink)" strokeWidth={0.75} />
                <rect x={b - 4} y={y0 - 4} width={8} height={8} fill={SUCC_COLOR} />
              </g>
            </g>
          )
        })}
        <g transform={`translate(${lw},${partners.length * rowH + 4})`}>
          <line x1={0} x2={iw} stroke="var(--ink)" />
          {d3
            .range(m0, m1 + 1)
            .filter((i) => i % 12 === 0)
            .map((i) => (
              <text key={i} x={x(i) + 2} y={14}>
                {2028 + i / 12}
              </text>
            ))}
        </g>
      </svg>
    </div>
  )
}

/* ───────── Q4: consolidation, one successor and its predecessors ───────── */

export function Consolidation({ rows, succ, succName }: { rows: { name: string; monthly: number[]; verdict: string }[]; succ: number[]; succName: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const stacked = width < 480
  const lw = stacked ? 0 : 236
  const rowH = stacked ? 36 : 22
  const iw = width - lw - 8
  const m0 = 18
  const m1 = 83
  const x = d3.scaleLinear().domain([m0, m1 + 1]).range([0, iw])
  const all = [...rows.map((r) => ({ ...r, color: PRED_COLOR })), { name: succName, monthly: succ, verdict: 'new', color: SUCC_COLOR }]
  const height = all.length * rowH + 24
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label={`Active months of ${succName} and the shippers it succeeds`}>
        {all.map((r, i) => {
          const max = d3.max(r.monthly) || 1
          const top = i * rowH + (stacked ? 14 : 3)
          const h = rowH - (stacked ? 16 : 6)
          const isNew = r.verdict === 'new'
          return (
            <g key={r.name}>
              <text x={stacked ? 0 : lw - 8} y={stacked ? top - 5 : top + h / 2} dy={stacked ? 0 : '0.32em'} textAnchor={stacked ? 'start' : 'end'} className={isNew ? 'label-strong' : undefined}>
                {r.name.length > 24 ? r.name.slice(0, 23) + '…' : r.name}
                {!isNew && ` (${r.verdict})`}
              </text>
              <g transform={`translate(${lw},${top})`}>
                {d3.range(m0, m1 + 1).map((m) =>
                  r.monthly[m] > 0 ? (
                    <rect
                      key={m}
                      x={x(m) + (isNew ? 0 : 0.5)}
                      y={h - (h * r.monthly[m]) / max + (isNew ? 0 : 0.5)}
                      width={Math.max(1, x(m + 1) - x(m) - (isNew ? 0.5 : 1.5))}
                      height={Math.max(0, (h * r.monthly[m]) / max - (isNew ? 0 : 0.5))}
                      fill={r.color}
                      stroke={isNew ? undefined : PRED_STROKE}
                      strokeWidth={isNew ? undefined : 1}
                    />
                  ) : null,
                )}
                <line x1={0} x2={iw} y1={h} y2={h} stroke="var(--rule-strong)" />
              </g>
            </g>
          )
        })}
        <g transform={`translate(${lw},${all.length * rowH + 4})`}>
          <line x1={0} x2={iw} stroke="var(--ink)" />
          {d3
            .range(24, m1 + 1, 12)
            .map((i) => (
              <text key={i} x={x(i) + 2} y={14}>
                {2028 + i / 12}
              </text>
            ))}
        </g>
      </svg>
    </div>
  )
}

/* ───────── Q5: data-quality shares ───────── */

export function ShareRows({ rows, focus }: { rows: { key: string; label: string; part: number; whole: number; note: string }[]; focus: string | null }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const stacked = width < 480
  const lw = stacked ? 0 : 200
  const rowH = stacked ? 46 : 34
  const iw = width - lw - 60
  const height = rows.length * rowH
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label="Data quality issues as a share of the records they affect">
        {rows.map((r, i) => {
          const s = r.part / r.whole
          const top = i * rowH + (stacked ? 18 : 8)
          return (
            <g key={r.key} className="mark" data-dim={focus != null && focus !== r.key}>
              <text x={stacked ? 0 : lw - 8} y={stacked ? top - 6 : top + 8} dy={stacked ? 0 : '0.32em'} textAnchor={stacked ? 'start' : 'end'} className="label-strong">
                {r.label}
              </text>
              <g transform={`translate(${lw},${top})`}>
                <rect width={iw} height={16} fill="var(--ground)" stroke="var(--rule-strong)" />
                <rect width={Math.max(2, iw * s)} height={16} fill="var(--ink)" />
                <text x={iw + 6} y={8} dy="0.32em" className="label-strong">
                  {s < 0.01 ? d3.format('.3%')(s) : fpct1(s)}
                </text>
              </g>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
