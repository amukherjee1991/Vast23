import * as d3 from 'd3'
import type { ReactNode } from 'react'
import { useWidth } from '../../charts/useSize'
import { NetworkGraph, type GLink, type GNode } from '../../charts/NetworkGraph'
import { useTooltip } from '../../components/Tooltip'
import { ConfidencePennants } from '../../components/Signals'
import { entityStyle, fmt, shapePath, toConfidence } from '../../lib/signals'
import type { CollisionTest, MLink, MNode, Reason } from './types'

const nf = fmt.int

/* ───────── Component sizes: log–log dot plot with the giant annotated ───────── */

export function SizeHistogram({
  hist,
  giantNow,
  giantLabel,
}: {
  hist: { size: number; count: number }[]
  /** Size the largest component would have under the current ablation. */
  giantNow: number
  giantLabel: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()
  const height = 260
  const m = { t: 30, r: 20, b: 40, l: 48 }
  const iw = width - m.l - m.r
  const ih = height - m.t - m.b
  const maxSize = d3.max(hist, (d) => d.size) ?? 10000
  const x = d3.scaleLog().domain([1, 10000]).range([0, iw])
  const y = d3.scaleLog().domain([0.8, 10000]).range([ih, 0])
  const giant = hist.find((d) => d.size === maxSize)!
  const dx = x(giantNow) - x(giant.size)
  const moved = giantNow !== giant.size
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label="Number of business groups at each size, both axes logarithmic">
        <g transform={`translate(${m.l},${m.t})`}>
          <g className="grid">
            {[1, 10, 100, 1000, 10000].map((t) => (
              <line key={t} x1={0} x2={iw} y1={y(t)} y2={y(t)} />
            ))}
          </g>
          {[1, 10, 100, 1000, 10000].map((t) => (
            <text key={t} x={-8} y={y(t)} dy="0.32em" textAnchor="end">
              {d3.format('~s')(t)}
            </text>
          ))}
          {[1, 10, 100, 1000, 10000].map((t) => (
            <text key={t} x={x(t)} y={ih + 18} textAnchor="middle">
              {d3.format('~s')(t)}
            </text>
          ))}
          <line x1={0} x2={iw} y1={ih} y2={ih} stroke="var(--ink)" />
          <text x={-m.l + 2} y={-14} className="label-strong">
            Groups of this size
          </text>
          <text x={iw} y={ih + 34} textAnchor="end" className="label-strong">
            Nodes in the group (log)
          </text>
          {hist
            .filter((d) => d !== giant)
            .map((d) => (
              <g
                key={d.size}
                transform={`translate(${x(d.size)},${y(d.count)})`}
                onPointerMove={(e) =>
                  tip.show(
                    e,
                    <>
                      <strong>{nf.format(d.size)}-node groups</strong>
                      <span className="tt-row">
                        <span>Count</span>
                        <span>{nf.format(d.count)}</span>
                      </span>
                    </>,
                  )
                }
                onPointerLeave={tip.hide}
              >
                <circle r={9} fill="transparent" />
                <circle r={3.5} fill="var(--series-1)" stroke="var(--cloth)" strokeWidth={0.75} />
              </g>
            ))}
          {/* ghost of the giant as found */}
          {moved && (
            <circle cx={x(giant.size)} cy={y(1)} r={6} fill="none" stroke="var(--ink-3)" strokeDasharray="2 2" />
          )}
          <g transform={`translate(${x(giant.size)},${y(1)})`}>
            <g className="mc3-move" style={{ transform: `translateX(${dx}px)` }}>
              <circle r={6} fill="var(--series-3)" stroke="var(--ink)" strokeWidth={1.5} />
              <line y1={-8} y2={-36} stroke="var(--ink)" />
              <text y={-42} textAnchor={moved ? 'middle' : 'end'} x={moved ? 0 : 6} className="label-strong">
                {giantLabel}
              </text>
            </g>
          </g>
        </g>
      </svg>
    </div>
  )
}

/* ───────── Collision test: surname removal against a random control ───────── */

export function AblationChart({
  asFound,
  tests,
  step,
}: {
  asFound: number
  tests: { label: string; test: CollisionTest }[]
  step: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const tip = useTooltip()
  const narrow = width < 520
  const lw = narrow ? 0 : 190
  const rowH = narrow ? 64 : 52
  const m = { t: 8, r: 56, b: 30 }
  const iw = width - lw - m.r
  const x = d3.scaleLinear().domain([0, asFound]).range([0, iw])
  const rows = [{ label: 'As found', removed: 0, largest: asFound, control: [] as number[] }, ...tests.map((t) => ({ label: t.label, removed: t.test.persons_removed, largest: t.test.largest_remaining, control: t.test.random_control_largest }))]
  const height = rows.length * rowH + m.t + m.b
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={height} role="img" aria-label="Largest remaining component after removing common-surname persons, against removing the same number of random persons">
        <g transform={`translate(${lw},${m.t})`}>
          <g className="grid">
            {x.ticks(4).map((t) => (
              <line key={t} x1={x(t)} x2={x(t)} y1={0} y2={rows.length * rowH} />
            ))}
          </g>
          {x.ticks(4).map((t) => (
            <text key={t} x={x(t)} y={rows.length * rowH + 16} textAnchor="middle">
              {d3.format('~s')(t)}
            </text>
          ))}
          {rows.map((r, i) => {
            const y0 = i * rowH + (narrow ? 18 : 0)
            const bh = 14
            const by = y0 + (narrow ? 4 : rowH / 2 - bh / 2 - 6)
            const cy = by + bh + 8
            const [lo, hi] = r.control.length ? (d3.extent(r.control) as [number, number]) : [0, 0]
            return (
              <g key={r.label} className="mark">
                <text x={narrow ? 0 : -10} y={narrow ? i * rowH + 10 : by + bh / 2} dy="0.32em" textAnchor={narrow ? 'start' : 'end'} className={i === step ? 'label-strong' : undefined}>
                  {r.label}
                </text>
                <rect
                  x={0}
                  y={by}
                  width={Math.max(2, x(r.largest))}
                  height={bh}
                  rx={2}
                  fill={i === 0 ? 'var(--ink-3)' : i === step ? 'var(--seq-700)' : 'var(--seq-500)'}
                  stroke={i === step ? 'var(--ink)' : 'none'}
                  strokeWidth={1.5}
                  onPointerMove={(e) =>
                    tip.show(
                      e,
                      <>
                        <strong>{r.label}</strong>
                        <span className="tt-row">
                          <span>Largest component</span>
                          <span>{nf.format(r.largest)} nodes</span>
                        </span>
                        {r.removed > 0 && (
                          <span className="tt-row">
                            <span>Persons removed</span>
                            <span>{nf.format(r.removed)}</span>
                          </span>
                        )}
                      </>,
                    )
                  }
                  onPointerLeave={tip.hide}
                />
                <text x={x(r.largest) + 6} y={by + bh / 2} dy="0.32em" className="label-strong">
                  {nf.format(r.largest)}
                </text>
                {r.control.length > 0 && (
                  <g
                    onPointerMove={(e) =>
                      tip.show(
                        e,
                        <>
                          <strong>Random control, 10 trials</strong>
                          <span>
                            Removing {nf.format(r.removed)} random multi-company persons leaves {nf.format(lo)}–{nf.format(hi)} nodes.
                          </span>
                        </>,
                      )
                    }
                    onPointerLeave={tip.hide}
                  >
                    <rect x={x(lo) - 4} y={cy - 8} width={x(hi) - x(lo) + 8} height={16} fill="transparent" />
                    <line x1={x(lo)} x2={x(hi)} y1={cy} y2={cy} stroke="var(--ink-3)" strokeWidth={1.5} />
                    {r.control.map((c, j) => (
                      <circle key={j} cx={x(c)} cy={cy} r={3} fill="var(--cloth)" stroke="var(--ink)" strokeWidth={1.25} />
                    ))}
                  </g>
                )}
              </g>
            )
          })}
          <line x1={0} x2={0} y1={0} y2={rows.length * rowH} stroke="var(--ink)" />
        </g>
      </svg>
    </div>
  )
}

/* ───────── Robust-z reasons ───────── */

export function ReasonBars({ reasons }: { reasons: Reason[] }) {
  const max = Math.max(4, ...reasons.map((r) => Math.abs(r.robust_z)))
  const v = (n: number) => (Math.abs(n) >= 100 ? nf.format(Math.round(n)) : fmt.dec2.format(n))
  return (
    <ul className="mc3-reasons">
      {reasons.map((r) => (
        <li key={r.feature}>
          <span className="mc3-reasons__label">{r.label}</span>
          <span className="mc3-reasons__val tnum">
            {v(r.value)} <span>vs median {v(r.median)}</span>
          </span>
          <span className="mc3-reasons__track" aria-hidden>
            <span className="mc3-reasons__bar" style={{ transform: `scaleX(${Math.min(1, Math.abs(r.robust_z) / max)})` }} />
          </span>
          <span className="mc3-reasons__z tnum">
            {r.robust_z > 0 ? '+' : '−'}
            {fmt.dec2.format(Math.abs(r.robust_z))} z
          </span>
        </li>
      ))}
    </ul>
  )
}

/* ───────── Weighted score split into its three parts ───────── */

export const SCORE_PARTS = [
  { key: 'anomaly_pct', label: 'Anomaly percentile', color: 'var(--series-1)' },
  { key: 'flag_score', label: 'Structural flags', color: 'var(--series-2)' },
  { key: 'iuu_relevance', label: 'Fishing relevance', color: 'var(--series-3)' },
] as const

export function ScoreBar({ parts, weights }: { parts: Record<string, number>; weights: Record<string, number> }) {
  let acc = 0
  return (
    <svg className="mc3-score" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden>
      <rect width={100} height={8} fill="var(--ground)" />
      {SCORE_PARTS.map((p) => {
        const w = (parts[p.key] ?? 0) * (weights[p.key] ?? 0) * 100
        const x = acc
        acc += w
        return <rect key={p.key} x={x} width={w} height={8} fill={p.color} stroke="var(--ink)" strokeWidth={0.4} vectorEffect="non-scaling-stroke" />
      })}
    </svg>
  )
}

/* ───────── Evidence subgraph of one business group ───────── */

const isFishCo = (n: MNode) => n.kind === 'company' && (n.fish_label === 'fishing' || n.name_fish)

export function GroupGraph({ nodes, links, keyCompanies, height = 440 }: { nodes: MNode[]; links: MLink[]; keyCompanies?: string[]; height?: number }) {
  const keys = new Set((keyCompanies ?? []).map((k) => `C|${k}`))
  const gn: GNode[] = nodes.map((n) => {
    if (n.kind === 'company') {
      return {
        id: n.id,
        label: n.label,
        type: 'Company',
        emph: keys.has(n.id),
        ring: isFishCo(n) ? 'var(--flag-red)' : undefined,
        size: keys.has(n.id) ? 8 : 6,
        tip: (
          <>
            <strong>{n.label}</strong>
            <span>Company · {n.countries.length ? n.countries.join(', ') : 'no registry record'}</span>
            <span className="tt-row">
              <span>Product</span>
              <span>{n.product.length > 48 ? n.product.slice(0, 47) + '…' : n.product}</span>
            </span>
            <span className="tt-row">
              <span>Fishing label</span>
              <span>{n.fish_label}{n.name_fish ? ' · fishing name' : ''}</span>
            </span>
            {n.revenue != null && (
              <span className="tt-row">
                <span>Revenue</span>
                <span>{fmt.compact.format(n.revenue)}</span>
              </span>
            )}
          </>
        ),
      }
    }
    return {
      id: n.id,
      label: n.label,
      type: n.owner_of > 0 ? 'Beneficial Owner' : 'Company Contacts',
      ring: n.common_surname ? 'var(--ink-3)' : undefined,
      size: n.n_companies >= 3 ? 6 : 4,
      emph: n.n_companies >= 3 && !n.common_surname,
      tip: (
        <>
          <strong>{n.label}</strong>
          <span>
            Person · owner of {n.owner_of}, contact for {n.contact_of}
          </span>
          <span className="tt-row">
            <span>Companies in the whole graph</span>
            <span>{n.n_companies}</span>
          </span>
          {n.common_surname && <span>Common surname: links may be name collisions.</span>}
        </>
      ),
    }
  })
  const gl: GLink[] = links.map((l) => ({ source: l.source, target: l.target, type: l.type }))
  return (
    <div className="mc3-graph">
      <NetworkGraph nodes={gn} links={gl} height={height} dashedTypes={['contact']} />
    </div>
  )
}

export function GraphLegend() {
  const co = entityStyle('Company')
  const pe = entityStyle('Beneficial Owner')
  const glyph = (shape: typeof co.shape, color: string, ring?: string) => (
    <svg width={20} height={20} viewBox="-10 -10 20 20" aria-hidden>
      {ring && <path d={shapePath(shape, 8)} fill="none" stroke={ring} strokeWidth={2.5} />}
      <path d={shapePath(shape, 5)} fill={color} stroke="var(--ink)" strokeWidth={0.75} />
    </svg>
  )
  return (
    <>
      <span className="legend-item">
        {glyph(co.shape, co.color)}
        Company
      </span>
      <span className="legend-item">
        {glyph(pe.shape, pe.color)}
        Person (owner or contact)
      </span>
      <span className="legend-item">
        {glyph(co.shape, co.color, 'var(--flag-red)')}
        Fishing product or name
      </span>
      <span className="legend-item">
        {glyph(pe.shape, pe.color, 'var(--ink-3)')}
        Common surname
      </span>
      <span className="legend-item">
        <svg width={22} height={10} aria-hidden>
          <line x1={1} x2={21} y1={5} y2={5} stroke="var(--ink-3)" strokeWidth={1.5} />
        </svg>
        Owner
      </span>
      <span className="legend-item">
        <svg width={22} height={10} aria-hidden>
          <line x1={1} x2={21} y1={5} y2={5} stroke="var(--ink-3)" strokeWidth={1.5} strokeDasharray="3 3" />
        </svg>
        Contact
      </span>
    </>
  )
}

/* ───────── Small helpers ───────── */

export function Conf({ level, size = 12 }: { level: string; size?: number }) {
  return <ConfidencePennants level={toConfidence(level)} size={size} />
}

export function Claim({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="claim" aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  )
}

/** Scroll a figure into view after a claim drives it, unless it is already visible. */
export function reveal(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const r = el.getBoundingClientRect()
  if (r.top >= 0 && r.top < window.innerHeight * 0.6) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
}
