import * as d3 from 'd3'
import { useId, type ReactNode } from 'react'
import { useWidth } from '../../charts/useSize'
import { useTooltip } from '../../components/Tooltip'
import { Flag } from '../../components/Flag'
import { VERDICT_COLOR, VERDICT_FLAG, entityStyle, plural, shapePath, toVerdict } from '../../lib/signals'
import { EDGE_COLOR, EDGE_LABEL, SUSPECT_COLOR, SHORT, type Feature } from './data'

const f2 = d3.format('.2f')
const fint = d3.format(',')

/* ───────── Weight histogram with the 0.8 cliff ───────── */
export function WeightHist({ bins, counts, threshold, focus = null }: { bins: number[]; counts: number[]; threshold: number; focus?: 'low' | null }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()
  const height = 230
  const m = { t: 30, r: 12, b: 30, l: 44 }
  const iw = width - m.l - m.r
  const ih = height - m.t - m.b
  const x = d3.scaleLinear().domain([0, 1]).range([0, iw])
  const max = d3.max(counts) ?? 1
  const y = d3.scaleSymlog().domain([0, max]).range([ih, 0])
  const yt = [0, 1, 10, 100, 1000].filter((t) => t <= max * 1.2)
  const low = d3.sum(counts.filter((_, i) => bins[i] < threshold))
  const high = d3.sum(counts) - low
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label={`Histogram of edge weights: ${low} rows below ${threshold}, ${high} at or above`}>
        <g transform={`translate(${m.l},${m.t})`}>
          <g className="grid">
            {yt.map((t) => (
              <line key={t} x1={0} x2={iw} y1={y(t)} y2={y(t)} />
            ))}
          </g>
          {yt.map((t) => (
            <text key={t} x={-8} y={y(t)} dy="0.32em" textAnchor="end">
              {fint(t)}
            </text>
          ))}
          <text x={-m.l + 2} y={-14}>
            Edge rows (log scale)
          </text>
          {counts.map((c, i) => {
            const isLow = bins[i] < threshold
            const x0 = x(bins[i]) + 1
            const w = Math.max(1, x(bins[i + 1]) - x(bins[i]) - 2)
            return (
              <g
                key={i}
                className="mark"
                data-dim={focus === 'low' && !isLow}
                onPointerMove={(e) =>
                  tip.show(
                    e,
                    <>
                      <strong>
                        Weight {f2(bins[i])}–{f2(bins[i + 1])}
                      </strong>
                      <span className="tt-row">
                        <span>Edge rows</span>
                        <span>{fint(c)}</span>
                      </span>
                    </>,
                  )
                }
                onPointerLeave={tip.hide}
              >
                <rect x={x0} y={0} width={w} height={ih} fill="transparent" />
                <rect x={x0} y={y(c)} width={w} height={Math.max(0, ih - y(c))} rx={1} fill={isLow ? 'var(--ink)' : 'var(--series-other)'} />
              </g>
            )
          })}
          <line x1={x(threshold)} x2={x(threshold)} y1={-8} y2={ih} stroke="var(--lit-3)" strokeWidth={1.5} strokeDasharray="4 3" />
          <text x={x(threshold) - 6} y={-14} textAnchor="end" className="label-strong">
            {threshold} floor
          </text>
          <text x={x(0.4)} y={y(12) - 8} textAnchor="middle" className="label-strong">
            {low} rows
          </text>
          <text x={x(0.9)} y={y(max) - 8} textAnchor="middle" className="label-strong">
            {fint(high)} rows
          </text>
          <line x1={0} x2={iw} y1={ih} y2={ih} stroke="var(--ink)" />
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => (
            <text key={t} x={x(t)} y={ih + 18} textAnchor="middle">
              {t}
            </text>
          ))}
        </g>
      </svg>
    </div>
  )
}

/* ───────── Null model strip: observed value against a random baseline ───────── */
export function NullStrip({
  domain,
  mean,
  p95,
  max,
  observed,
  unit,
}: {
  domain: [number, number]
  mean: number
  p95: number
  max: number
  observed: number
  unit: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const height = 86
  const m = { t: 30, r: 24, b: 24, l: 16 }
  const iw = width - m.l - m.r
  const x = d3.scaleLinear().domain(domain).range([0, iw])
  const cy = 18
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label={`Random draws reach at most ${max} ${unit}; observed ${observed}`}>
        <g transform={`translate(${m.l},${m.t})`}>
          <line x1={0} x2={iw} y1={cy} y2={cy} stroke="var(--rule-strong)" />
          <rect x={x(domain[0])} y={cy - 7} width={x(max) - x(domain[0])} height={14} fill="var(--series-other)" opacity={0.35} />
          <rect x={x(domain[0])} y={cy - 7} width={x(p95) - x(domain[0])} height={14} fill="var(--series-other)" opacity={0.6} />
          <line x1={x(mean)} x2={x(mean)} y1={cy - 11} y2={cy + 11} stroke="var(--ink)" strokeWidth={1.5} />
          <text x={x(mean)} y={cy - 16} textAnchor="middle">
            mean {d3.format('.1f')(mean)}
          </text>
          <text x={x(max)} y={cy + 26} textAnchor="middle">
            max {max}
          </text>
          <circle cx={x(observed)} cy={cy} r={7} fill="var(--lit-3)" stroke="var(--ground)" strokeWidth={1.5} />
          <text x={x(observed)} y={cy - 16} textAnchor="end" className="label-strong">
            observed {observed}
          </text>
          {[domain[0], domain[1]].map((t) => (
            <text key={t} x={x(t)} y={cy + 26} textAnchor="middle">
              {t}
            </text>
          ))}
        </g>
      </svg>
    </div>
  )
}

/* ───────── Percentile dot matrix (suspects × metrics) ───────── */
export function PercentileDots({
  suspects,
  metrics,
  focus,
}: {
  suspects: { k: string; percentiles: Record<string, number> }[]
  metrics: { id: string; label: string }[]
  focus: string[] | null
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()
  const lw = Math.min(130, width * 0.34)
  const rowH = 34
  const m = { t: 8, r: 16, b: 28 }
  const iw = width - lw - m.r
  const height = metrics.length * rowH + m.t + m.b
  const x = d3.scaleLinear().domain([0, 1]).range([0, iw])
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label="Percentile of each suspect on seven structural measures">
        <g transform={`translate(${lw},${m.t})`}>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line className="grid-line" x1={x(t)} x2={x(t)} y1={0} y2={metrics.length * rowH} stroke="var(--rule)" strokeDasharray="2 3" />
              <text x={x(t)} y={metrics.length * rowH + 18} textAnchor="middle">
                {t * 100}
              </text>
            </g>
          ))}
          {metrics.map((mt, i) => (
            <g key={mt.id} transform={`translate(0,${i * rowH + rowH / 2})`}>
              <text x={-10} dy="0.32em" textAnchor="end" className="label-strong">
                {mt.label}
              </text>
              <line x1={0} x2={iw} stroke="var(--rule)" />
              {suspects.map((s, j) => {
                const v = s.percentiles[mt.id] ?? 0
                const dim = focus != null && !focus.includes(s.k)
                return (
                  <g
                    key={s.k}
                    className="mark"
                    data-dim={dim}
                    transform={`translate(${x(v)},${(j - 1.5) * 5})`}
                    onPointerMove={(e) =>
                      tip.show(
                        e,
                        <>
                          <strong>{SHORT[s.k] ?? s.k}</strong>
                          <span className="tt-row">
                            <span>{mt.label}</span>
                            <span>{d3.format('.1f')(v * 100)}th pct</span>
                          </span>
                        </>,
                      )
                    }
                    onPointerLeave={tip.hide}
                  >
                    <circle r={10} fill="transparent" />
                    <circle r={5.5} fill={SUSPECT_COLOR[s.k]} stroke="var(--ground)" strokeWidth={1.5} />
                  </g>
                )
              })}
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}

/* ───────── Rubric grid (suspects × signals) ───────── */
const SIGNAL_SHORT: Record<string, string> = {
  low_layer: 'In layer',
  fisheye_tag: 'FishEye tag',
  low_ownership: 'Weak owner',
  chain_to_suspect: 'Chain',
  broker: 'Broker',
  shell_marker: 'Shell',
  illegal_keyword: 'Keyword',
}
export function RubricGrid({
  rows,
  signals,
  focus,
}: {
  rows: { k: string; verdict: string; points: number; signals: { id: string; points: number; basis_w: number | null; detail: string }[] }[]
  signals: { id: string; max: number; desc: string }[]
  focus: string[] | null
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()
  const pid = useId().replace(/:/g, '')
  const lw = Math.min(124, width * 0.3)
  const totalW = 132
  const cw = Math.max(26, Math.min(64, (width - lw - totalW - 4) / signals.length))
  const ch = 40
  const head = 74
  const height = head + rows.length * ch + 4
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label="Rubric points per suspect and signal">
        <defs>
          <pattern id={`${pid}-hatch`} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={6} stroke="var(--ground)" strokeWidth={2} />
          </pattern>
        </defs>
        {signals.map((s, j) => (
          <text
            key={s.id}
            transform={`translate(${lw + j * cw + cw / 2 + 3},${head - 8}) rotate(-50)`}
            className="label-strong"
          >
            {SIGNAL_SHORT[s.id] ?? s.id}
          </text>
        ))}
        <text x={lw + signals.length * cw + 12} y={head - 8} className="label-strong">
          Points
        </text>
        {rows.map((r, i) => {
          const dim = focus != null && !focus.includes(r.k)
          const v = toVerdict(r.verdict)
          return (
            <g key={r.k} transform={`translate(0,${head + i * ch})`} className="mark" data-dim={dim}>
              <text x={lw - 10} y={ch / 2} dy="0.32em" textAnchor="end" className="label-strong">
                {SHORT[r.k] ?? r.k}
              </text>
              {signals.map((s, j) => {
                const hit = r.signals.find((x) => x.id === s.id)
                const pts = hit?.points ?? 0
                const weak = hit && hit.basis_w != null && hit.basis_w < 0.8
                const fill = pts >= 1 ? 'var(--seq-600)' : pts > 0 ? 'var(--seq-300)' : 'var(--cloth)'
                return (
                  <g
                    key={s.id}
                    transform={`translate(${lw + j * cw},2)`}
                    onPointerMove={(e) =>
                      tip.show(
                        e,
                        <>
                          <strong>
                            {SHORT[r.k]} · {SIGNAL_SHORT[s.id]}
                          </strong>
                          <span className="tt-row">
                            <span>Points</span>
                            <span>
                              {pts} of {s.max}
                            </span>
                          </span>
                          {hit && (
                            <span className="tt-row">
                              <span>Weakest edge</span>
                              <span>{hit.basis_w == null ? 'structure only' : f2(hit.basis_w)}</span>
                            </span>
                          )}
                          <span>{hit ? plural(hit.detail) : s.desc}</span>
                        </>,
                      )
                    }
                    onPointerLeave={tip.hide}
                  >
                    <rect width={cw - 3} height={ch - 4} fill={fill} stroke="var(--rule-strong)" />
                    {weak && <rect width={cw - 3} height={ch - 4} fill={`url(#${pid}-hatch)`} opacity={0.7} />}
                    {weak && <rect x={0.75} y={0.75} width={cw - 4.5} height={ch - 5.5} fill="none" stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="4 3" />}
                  </g>
                )
              })}
              <g transform={`translate(${lw + signals.length * cw + 10},${ch / 2})`}>
                <text dy="0.32em" className="label-strong" style={{ fontSize: 13 }}>
                  {r.points}
                </text>
                <circle cx={32} r={6} fill={VERDICT_COLOR[v]} />
                <text x={44} dy="0.32em">
                  {v}
                </text>
              </g>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
export function RubricLegend() {
  const pid = useId().replace(/:/g, '')
  return (
    <>
      <span className="legend-item">
        <span className="legend-swatch" style={{ background: 'var(--seq-600)' }} aria-hidden />
        Full point
      </span>
      <span className="legend-item">
        <span className="legend-swatch" style={{ background: 'var(--seq-300)' }} aria-hidden />
        Half point
      </span>
      <span className="legend-item">
        <svg width={14} height={14} aria-hidden>
          <defs>
            <pattern id={`${pid}-h`} width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1={0} y1={0} x2={0} y2={5} stroke="var(--ground)" strokeWidth={2} />
            </pattern>
          </defs>
          <rect x={0.5} y={0.5} width={13} height={13} fill="var(--seq-600)" />
          <rect x={0.5} y={0.5} width={13} height={13} fill={`url(#${pid}-h)`} opacity={0.7} />
          <rect x={1.25} y={1.25} width={11.5} height={11.5} fill="none" stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="4 3" />
        </svg>
        Rests on an edge below 0.8
      </span>
      <span className="legend-item">
        <span className="legend-swatch legend-swatch--circle" style={{ background: 'var(--verdict-suspect)' }} aria-hidden />
        Suspect (4+)
      </span>
      <span className="legend-item">
        <span className="legend-swatch legend-swatch--circle" style={{ background: 'var(--verdict-possible)' }} aria-hidden />
        Possible (2.5–3.5)
      </span>
    </>
  )
}

/* ───────── Ownership chain strip ───────── */
export interface ChainHop {
  k: string
  label: string
  type: string | null
  verdict?: string
}
export interface ChainEdge {
  type: string
  w: number
  /** true when the recorded direction runs left → right */
  forward: boolean
  others?: number
}
export function ChainStrip({ hops, edges, focusEdge }: { hops: ChainHop[]; edges: ChainEdge[]; focusEdge: number | null }) {
  return (
    <ol className="chain" aria-label="Ownership chain">
      {hops.map((h, i) => {
        const st = entityStyle(h.type)
        const v = h.verdict ? toVerdict(h.verdict) : null
        const e = edges[i]
        return (
          <li key={h.k} className="chain__item">
            <span className={`chain__node${v ? ' chain__node--suspect' : ''}`} style={v ? { borderColor: VERDICT_COLOR[v] } : undefined}>
              <svg width={14} height={14} viewBox="-7 -7 14 14" aria-hidden>
                <path d={shapePath(st.shape, 5)} fill={st.color} stroke="var(--ground)" strokeWidth={0.75} />
              </svg>
              <span className="chain__label">{h.label}</span>
              {v && <Flag code={VERDICT_FLAG[v]} size={18} label={v} />}
            </span>
            {e && (
              <span className="chain__edge" data-focus={focusEdge === i} data-weak={e.w < 0.8}>
                <span
                  className="chain__line"
                  style={{ borderColor: EDGE_COLOR[e.type], borderStyle: e.type === 'family_relationship' ? 'dotted' : e.w < 0.8 ? 'dashed' : 'solid' }}
                  aria-hidden
                />
                <span className="chain__w tnum">
                  {EDGE_LABEL[e.type]} {f2(e.w)}
                  {!e.forward && <span className="chain__rev"> recorded reversed</span>}
                  {e.others ? <span className="chain__rev"> +{e.others} other type{e.others > 1 ? 's' : ''}</span> : null}
                </span>
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/* ───────── Distance histogram against the null ───────── */
export function DistanceNull({
  hist,
  markers,
  focus,
}: {
  hist: Record<string, number>
  markers: { id: string; x: number; label: string; strong?: boolean }[]
  focus: string | null
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()
  const height = 240
  const m = { t: 72, r: 16, b: 34, l: 44 }
  const iw = width - m.l - m.r
  const ih = height - m.t - m.b
  const keys = Object.keys(hist).map(Number).sort((a, b) => a - b)
  const total = d3.sum(keys, (k) => hist[k])
  const x = d3.scaleLinear().domain([1.5, keys[keys.length - 1] + 0.5]).range([0, iw])
  const y = d3.scaleLinear().domain([0, d3.max(keys, (k) => hist[k] / total) ?? 1]).nice().range([ih, 0])
  const bw = Math.max(4, x(1) - x(0) - 6)
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label="Shortest-path length between random node pairs, with suspect and degree-matched means marked">
        <g transform={`translate(${m.l},${m.t})`}>
          <g className="grid">
            {y.ticks(4).map((t) => (
              <line key={t} x1={0} x2={iw} y1={y(t)} y2={y(t)} />
            ))}
          </g>
          {y.ticks(4).map((t) => (
            <text key={t} x={-8} y={y(t)} dy="0.32em" textAnchor="end">
              {d3.format('.0%')(t)}
            </text>
          ))}
          <text x={-m.l + 2} y={-58}>
            Share of random pairs
          </text>
          {keys.map((k) => (
            <g
              key={k}
              onPointerMove={(e) =>
                tip.show(
                  e,
                  <>
                    <strong>{k} hops</strong>
                    <span className="tt-row">
                      <span>Random pairs</span>
                      <span>
                        {hist[k]} of {total}
                      </span>
                    </span>
                  </>,
                )
              }
              onPointerLeave={tip.hide}
            >
              <rect x={x(k) - bw / 2} y={y(hist[k] / total)} width={bw} height={ih - y(hist[k] / total)} rx={1} fill="var(--series-other)" />
            </g>
          ))}
          <line x1={0} x2={iw} y1={ih} y2={ih} stroke="var(--ink)" />
          {keys.map((k) => (
            <text key={k} x={x(k)} y={ih + 18} textAnchor="middle">
              {k}
            </text>
          ))}
          <text x={iw} y={ih + 32} textAnchor="end">
            hops between the pair
          </text>
          {markers.map((mk, i) => {
            const dim = focus != null && focus !== mk.id
            return (
              <g key={mk.id} className="mark" data-dim={dim} transform={`translate(${x(mk.x)},0)`}>
                <line y1={-(i % 2 ? 12 : 30)} y2={ih} stroke={mk.strong ? 'var(--lit-3)' : 'var(--ink)'} strokeWidth={1.5} strokeDasharray={mk.strong ? undefined : '4 3'} />
                <text y={-(i % 2 ? 16 : 34)} textAnchor={x(mk.x) > iw - 90 ? 'end' : x(mk.x) < 90 ? 'start' : 'middle'} className="label-strong">
                  {mk.label}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}

/* ───────── Candidate ranking: stacked feature contributions ───────── */
export const FEATURE_GROUPS: { id: string; label: string; color: string; members: Feature[] }[] = [
  { id: 'low_conf', label: 'Low-weight edges', color: 'var(--series-1)', members: ['low_conf'] },
  { id: 'proximity', label: 'Near suspects', color: 'var(--series-2)', members: ['proximity'] },
  { id: 'ownership', label: 'Ownership ties', color: 'var(--series-3)', members: ['ownership'] },
  { id: 'shared_nbrs', label: 'Shared neighbours', color: 'var(--ink)', members: ['shared_nbrs'] },
  { id: 'rest', label: 'Profile, repeats, FishEye tag', color: 'var(--series-other)', members: ['profile_sim', 'redundancy', 'fisheye_flag'] },
]
export function ContribBar({ contrib, width, height = 14 }: { contrib: Record<Feature, number>; width: number; height?: number }) {
  const x = d3.scaleLinear().domain([0, 1]).range([0, width])
  let acc = 0
  return (
    <svg width={width} height={height} aria-hidden style={{ display: 'block', overflow: 'visible' }}>
      <rect width={width} height={height} fill="var(--rule)" />
      {FEATURE_GROUPS.map((g) => {
        const v = d3.sum(g.members, (f) => contrib[f] ?? 0)
        const r = <rect key={g.id} x={x(acc)} width={Math.max(0, x(v) - 1)} height={height} fill={g.color} />
        acc += v
        return r
      })}
    </svg>
  )
}

/* ───────── Leave-one-out dumbbells ───────── */
export function Dumbbells({
  rows,
  pool,
  emphasise,
}: {
  rows: { k: string; rank: number; base: number }[]
  pool: number
  emphasise: 'tool' | 'base' | null
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()
  const lw = Math.min(124, width * 0.32)
  const rowH = 40
  const m = { t: 10, r: 24, b: 34 }
  const iw = width - lw - m.r
  const height = rows.length * rowH + m.t + m.b
  const x = d3.scaleLog().domain([1, pool]).range([0, iw])
  const ticks = [1, 10, 100, 1000].filter((t) => t <= pool)
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label="Rank of each held-out suspect: our score against a degree baseline">
        <g transform={`translate(${lw},${m.t})`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={0} y2={rows.length * rowH} stroke="var(--rule)" strokeDasharray="2 3" />
              <text x={x(t)} y={rows.length * rowH + 16} textAnchor="middle">
                {fint(t)}
              </text>
            </g>
          ))}
          <text x={0} y={rows.length * rowH + 30}>
            rank out of {fint(pool)} (log scale, 1 = top)
          </text>
          {rows.map((r, i) => (
            <g
              key={r.k}
              transform={`translate(0,${i * rowH + rowH / 2})`}
              onPointerMove={(e) =>
                tip.show(
                  e,
                  <>
                    <strong>{SHORT[r.k] ?? r.k} held out</strong>
                    <span className="tt-row">
                      <span>Our rank</span>
                      <span>{r.rank}</span>
                    </span>
                    <span className="tt-row">
                      <span>Degree rank</span>
                      <span>{r.base}</span>
                    </span>
                  </>,
                )
              }
              onPointerLeave={tip.hide}
            >
              <rect x={-lw} y={-rowH / 2} width={lw + iw} height={rowH} fill="transparent" />
              <text x={-10} dy="0.32em" textAnchor="end" className="label-strong">
                {SHORT[r.k] ?? r.k}
              </text>
              <line x1={x(r.rank)} x2={x(r.base)} stroke="var(--rule-strong)" strokeWidth={2} />
              <g className="mark" data-dim={emphasise === 'tool'}>
                <circle cx={x(r.base)} r={6} fill="var(--ground)" stroke="var(--ink-2)" strokeWidth={2} />
                <text x={x(r.base)} y={-11} textAnchor="middle">
                  {r.base}
                </text>
              </g>
              <g className="mark" data-dim={emphasise === 'base'}>
                <circle cx={x(r.rank)} r={6} fill="var(--series-1)" stroke="var(--ground)" strokeWidth={1.5} />
                <text x={x(r.rank)} y={-11} textAnchor="middle" className="label-strong">
                  {r.rank}
                </text>
              </g>
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}

/* ───────── Type × class stacked bars (how much of each type is noise) ───────── */
export const CLASS_SEGMENTS: { id: string; label: string; color: string }[] = [
  { id: 'consistent', label: 'Clean, matches its type', color: 'var(--series-other)' },
  { id: 'company_like', label: 'Untyped, corporate name', color: 'var(--series-1)' },
  { id: 'untyped_other', label: 'Untyped, other', color: 'var(--series-2)' },
  { id: 'junk', label: 'NLP debris', color: 'var(--series-3)' },
]
export function TypeClassBars({ rows, focus }: { rows: { type: string; parts: Record<string, number> }[]; focus: string[] | null }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()
  const lw = Math.min(140, width * 0.34)
  const rowH = 28
  const m = { t: 4, r: 48, b: 24 }
  const iw = width - lw - m.r
  const height = rows.length * rowH + m.t + m.b
  const max = d3.max(rows, (r) => d3.sum(Object.values(r.parts))) ?? 1
  const x = d3.scaleLinear().domain([0, max]).nice().range([0, iw])
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label="Nodes per raw type, split by inferred class">
        <g transform={`translate(${lw},${m.t})`}>
          {x.ticks(4).map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={0} y2={rows.length * rowH} stroke="var(--rule)" strokeDasharray="2 3" />
              <text x={x(t)} y={rows.length * rowH + 16} textAnchor="middle">
                {fint(t)}
              </text>
            </g>
          ))}
          {rows.map((r, i) => {
            let acc = 0
            const total = d3.sum(Object.values(r.parts))
            return (
              <g key={r.type} transform={`translate(0,${i * rowH})`}>
                <text x={-10} y={rowH / 2} dy="0.32em" textAnchor="end" className="label-strong">
                  {r.type}
                </text>
                {CLASS_SEGMENTS.map((s) => {
                  const v = r.parts[s.id] ?? 0
                  if (!v) return null
                  const x0 = acc
                  acc += v
                  const dim = focus != null && !focus.includes(s.id)
                  return (
                    <rect
                      key={s.id}
                      className="mark"
                      data-dim={dim}
                      x={x(x0)}
                      y={5}
                      width={Math.max(1, x(v) - x(0) - 1)}
                      height={rowH - 10}
                      fill={s.color}
                      onPointerMove={(e) =>
                        tip.show(
                          e,
                          <>
                            <strong>type = {r.type}</strong>
                            <span className="tt-row">
                              <span>{s.label}</span>
                              <span>{fint(v)}</span>
                            </span>
                          </>,
                        )
                      }
                      onPointerLeave={tip.hide}
                    />
                  )
                })}
                <text x={x(total) + 6} y={rowH / 2} dy="0.32em">
                  {fint(total)}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}

export function Swatch({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="legend-item">
      <span className="legend-swatch" style={{ background: color }} aria-hidden />
      {children}
    </span>
  )
}
export function LineSwatch({ color, dashed, dash, children }: { color: string; dashed?: boolean; dash?: string; children: ReactNode }) {
  const da = dash ?? (dashed ? '4 3' : undefined)
  const dotted = !!da && parseFloat(da) <= 1.5
  return (
    <span className="legend-item">
      <svg width={22} height={10} aria-hidden>
        <line x1={2} x2={21} y1={5} y2={5} stroke={color} strokeWidth={2.5} strokeDasharray={da} strokeLinecap={dotted ? 'round' : undefined} />
      </svg>
      {children}
    </span>
  )
}
