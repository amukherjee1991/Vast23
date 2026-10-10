import * as d3 from 'd3'
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { ChallengeBand, ChallengePage, Question, type HalyardStop } from '../components/Layout'
import { Await, Figure } from '../components/Figure'
import { VerdictTag } from '../components/Signals'
import { Flag } from '../components/Flag'
import { VERDICT_FLAG, toConfidence } from '../lib/signals'
import {
  ALL_COLOR,
  BUNDLE_COLOR,
  CAT_LABEL,
  CAT_ORDER,
  COMPONENTS,
  COMPONENT_LABEL,
  FISH_COLOR,
  HS_LABEL,
  PRED_COLOR,
  ROLE_COLOR,
  ROLE_LABEL,
  SUCC_COLOR,
  mIdx,
  nice,
  short,
  useMC2,
  type Category,
  type Component,
  type MC2 as Data,
  type Pair,
  type PairVerdict,
  type Role,
} from './mc2/data'
import {
  AddedColumns,
  BundleKey,
  BundleTag,
  Consolidation,
  DistPanel,
  GapColumns,
  Handover,
  IndexChart,
  LifespanBars,
  LineSwatch,
  MonthChart,
  PartnerSwitch,
  RevivedRows,
  Scorecard,
  SeqLegend,
  ShareRows,
  Swatch,
  Taxonomy,
  TransitionGrid,
  mLabel,
} from './mc2/charts'
import './mc2/mc2.css'

const STOPS: HalyardStop[] = [
  { id: 'successors', flag: 'L', label: 'Successors' },
  { id: 'q1', flag: 'T', label: 'Q1 Patterns' },
  { id: 'q2', flag: 'C', label: 'Q2 Bundles' },
  { id: 'q3', flag: 'R', label: 'Q3 Impact' },
  { id: 'q4', flag: 'U', label: 'Q4 Suspects' },
  { id: 'q5', flag: 'K', label: 'Q5 Reflection' },
]

/** The four pairs hoisted in the band, with the one-line reason from findings/mc2.md. */
const HOIST: { rank: number; note: string }[] = [
  { rank: 8, note: 'Fillet buyer stops Dec 2032; a new id starts Jan 2033 and 5 shared shippers supply 78% of its trade.' },
  { rank: 2, note: 'Karelians also succeeds five more fish shippers that stopped in 2030: consolidation under one name.' },
  { rank: 3, note: 'Dried fish only; a two-month gap, and all three shared partners switch over.' },
  { rank: 7, note: 'Molluscs; the successor starts the next month and inherits 95% of its trade.' },
]

const f1 = d3.format('.1%')
const fint = d3.format(',')

/* ───────── claims ───────── */

const ClaimCtx = createContext<{ claim: string | null; press: (id: string) => void }>({ claim: null, press: () => {} })

/** A claim bound to the question's evidence state. */
function C({ id, to, children }: { id: string; to: string; children: ReactNode }) {
  const { claim, press } = useContext(ClaimCtx)
  return (
    <button type="button" className="claim" aria-pressed={claim === id} aria-controls={to} onClick={() => press(id)}>
      {children}
    </button>
  )
}

function useClaim<T>(specs: Record<string, T>, apply?: (s: T) => void) {
  const [claim, setClaim] = useState<string | null>(null)
  const press = (id: string) => {
    if (claim === id) return setClaim(null)
    apply?.(specs[id])
    setClaim(id)
  }
  return { claim, setClaim, spec: claim ? specs[claim] : null, press }
}

const pairName = (p: Pair) => `${nice(p.predecessor)} → ${nice(p.successor)}`

/* ───────── page ───────── */

export default function MC2() {
  const state = useMC2()
  const [pairRank, setPairRank] = useState(8)
  const [q4Claim, setQ4Claim] = useState<string | null>(null)
  const openPair = (rank: number) => {
    setPairRank(rank)
    setQ4Claim(null)
    document.getElementById('fig-handover')?.scrollIntoView({ block: 'start' })
  }
  return (
    <main className="mc2">
      <div id="successors">
        <ChallengeBand
          pennant="P2"
          tone="blue"
          mc="Mini-challenge 2"
          title="Eight fish traders stop, then return under a new name"
          lede={
            <>
              Across 5.3 million shipments, 6,668 companies go silent before mid-2034. We matched each with look-alikes that start within a year and kept 872 candidate
              handovers. Eight fit the illegal-fishing pattern: fish on both sides, a gap of three months or less, and partners that follow the new name. The clearest is
              receiver −811, replaced by −206 the next month. Only five of FishEye’s twelve predicted-link bundles can be trusted, and adding them changes none of
              these verdicts.
            </>
          }
        >
          <Await state={state} height={200}>
            {(d) => <SummaryStrip d={d} onOpen={openPair} />}
          </Await>
        </ChallengeBand>
      </div>
      <ChallengePage stops={STOPS}>
        <Q1 state={state} />
        <Q2 state={state} />
        <Q3 state={state} />
        <Q4 state={state} rank={pairRank} setRank={setPairRank} claim={q4Claim} setClaim={setQ4Claim} />
        <Q5 state={state} />
      </ChallengePage>
    </main>
  )
}

function SummaryStrip({ d, onOpen }: { d: Data; onOpen: (rank: number) => void }) {
  return (
    <ul className="summary-strip mc2-strip" aria-label="The strongest successor pairs">
      {HOIST.map((h) => {
        const p = d.sus.pairs.find((x) => x.rank === h.rank)!
        return (
          <li key={h.rank}>
            <button type="button" className="mc2-strip__btn" onClick={() => onOpen(h.rank)}>
              <VerdictTag verdict={p.verdict} confidence={toConfidence(p.confidence)} size={30} />
              <span className="summary-strip__name">
                {nice(p.predecessor)}
                <span className="mc2-arrow" aria-label="succeeded by">
                  {' '}
                  →{' '}
                </span>
                {nice(p.successor)}
              </span>
              <span className="summary-strip__note">{h.note}</span>
              <span className="mc2-strip__go">See the handover</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/* ═════════ Q1 ═════════ */

type Q1Spec = {
  ship?: { m0: number; m1: number; label: string }[]
  share?: { m0: number; m1: number; label: string }[]
  season?: [number, number]
  role?: Role
  subset?: 'all' | 'fish'
  cats?: Category[]
  gap?: 'twins' | 'restarts'
}
const Q1_CLAIMS: Record<string, Q1Spec> = {
  peak: { ship: [{ m0: 24, m1: 35, label: '2030: 831k' }] },
  share: {
    share: [
      { m0: 0, m1: 11, label: '12.7%' },
      { m0: 72, m1: 83, label: '15.6%' },
    ],
  },
  season: { season: [1, 3] },
  shippers: { role: 'shipper', subset: 'all' },
  receivers: { role: 'receiver', subset: 'all' },
  fishchurn: { role: 'shipper', subset: 'fish' },
  core: { cats: ['steady'] },
  fringe: { cats: ['one_off'] },
  abrupt: { cats: ['abrupt_stop'] },
  twins: { gap: 'twins' },
  restarts: { gap: 'restarts' },
}

function Q1({ state }: { state: ReturnType<typeof useMC2> }) {
  const [subset, setSubset] = useState<'all' | 'fish'>('all')
  const { claim, setClaim, spec, press } = useClaim(Q1_CLAIMS, (s) => s.subset && setSubset(s.subset))
  return (
    <ClaimCtx.Provider value={{ claim, press }}>
      <Question
        id="q1"
        n="Q1"
        prompt="Use visual analytics to identify temporal patterns for individual entities and between entities in the knowledge graph; categorize the types of business relationship patterns you find."
        title="A durable core of shippers and steady pairs, ringed by fleeting receivers and one-off links"
        answer={
          <>
            <p>
              <strong>The market.</strong> Yearly volume <C id="peak" to="fig-market">peaks in 2030 at 831k shipments</C> and falls to 688k in 2034. Fish holds at
              96k–116k a year, so <C id="share" to="fig-market">its share rises from 12.7% to 15.6%</C>. Fish is mildly seasonal:{' '}
              <C id="season" to="fig-market">an index of 0.84–0.89 in February to April</C> and 1.05–1.08 from July to December, against 0.91–1.09 for all goods.
            </p>
            <p>
              <strong>Companies.</strong> The two roles behave differently. <C id="shippers" to="fig-life">Shippers are durable</C>: a median span of 59 months, and
              4,875 of 12,217 trade for 73–84 months. <C id="receivers" to="fig-life">Receivers are fleeting</C>: a median span of 3 months, and 44% appear in a single
              month. <C id="fishchurn" to="fig-life">Fish shippers churn more</C>: 2,139 of 4,299 fish-majority shippers are transient (they start after the data
              begins and stop before it ends), against 4,740 of all 12,217.
            </p>
            <p>
              <strong>Relationships.</strong> We classify each shipper→receiver pair’s monthly series by span, coverage, trend, seasonality and how it ends, applying
              eight rules in order. The network is <C id="core" to="fig-tax">a small core of steady pairs</C>, 1.9% of pairs carrying 32.6% of shipments, inside{' '}
              <C id="fringe" to="fig-tax">a fringe of one-off links</C> (44% of pairs, 2.6% of shipments). Only 737 pairs trade both ways, so relationships run one way.
              Fish pairs follow almost the same mix, and <C id="abrupt" to="fig-tax">abrupt stops are slightly rarer among fish pairs</C> (1.7% against 2.4%), so a stop
              on its own is no sign of illegal fishing. As a cross-check, k-means (k&nbsp;=&nbsp;8) on 101,115 recurring pairs agrees with the rules at a weighted
              purity of 0.57: steady, fading and ramping separate cleanly; intermittent does not.
            </p>
            <p>
              <strong>Between companies.</strong> We took look-alike pairs (partner and HS-code cosine ≥ 0.7, at least three shared partners) and counted them by the
              gap between the earlier company’s last month and the later one’s first. <C id="twins" to="fig-gap">Most coexisted for 12–36 months</C>: sister firms,
              not replacements. <C id="restarts" to="fig-gap">A second, narrower peak at gaps of 0–6 months</C> (1.7 pairs per gap-month against 0.3 just before) is
              the signature of a company stopping and a look-alike starting straight after. It is real but small: successors are rare and specific (Q4).
            </p>
            <p>
              <strong>Confidence: high</strong> for the aggregate patterns, which are counts over the full graph. The category boundaries are analyst choices; each
              rule is shown on hover.
            </p>
          </>
        }
      >
        <Await state={state} height={480}>
          {(d) => (
            <>
              <MarketFigure d={d} spec={spec} />
              <LifespanFigure d={d} focus={spec?.role ?? null} subset={subset} setSubset={(s) => (setSubset(s), setClaim(null))} />
              <TaxonomyFigure d={d} focus={spec?.cats ?? null} />
              <GapFigure d={d} band={spec?.gap ?? null} />
            </>
          )}
        </Await>
      </Question>
    </ClaimCtx.Provider>
  )
}

function MarketFigure({ d, spec }: { d: Data; spec: Q1Spec | null }) {
  const tl = d.tl
  const cp = tl.calendar_profile
  const years = d3.range(7).map((y) => ({
    y: 2028 + y,
    all: d3.sum(tl.shipments.slice(y * 12, y * 12 + 12)),
    fish: d3.sum(tl.fish_shipments.slice(y * 12, y * 12 + 12)),
  }))
  return (
    <Figure
      id="fig-market"
      title="Trade peaks in 2030 and declines; fish holds steady, so its share climbs to 15.6%, and it runs high from July to December"
      legend={
        <>
          <LineSwatch color={ALL_COLOR}>All goods</LineSwatch>
          <LineSwatch color={FISH_COLOR}>Fish (HS 0301–0309, 1604, 1605)</LineSwatch>
        </>
      }
      caption={
        <>
          Source: <code>timeline_overview.json</code> → <code>shipments</code>, <code>fish_share</code>, <code>calendar_profile</code>.{' '}
          {fint(d.meta.edges_deduplicated)} shipments after removing {fint(d.meta.exact_duplicates_removed)} exact duplicates. Calendar index = a month’s shipments
          over the average month, 2028–2034.
        </>
      }
      table={{
        columns: ['Period', 'Shipments', 'Fish shipments', 'Fish share', 'Fish index', 'All-goods index'],
        rows: [
          ...years.map((r) => [String(r.y), r.all, r.fish, f1(r.fish / r.all), null, null]),
          ...cp.months.map((m, i) => [`${m} (all years)`, null, null, null, cp.fish_index[i], cp.all_index[i]]),
        ],
      }}
    >
      <MonthChart values={tl.shipments} color={ALL_COLOR} area yLabel="Shipments per month" tipLabel="Shipments" height={140} bands={spec?.ship} />
      <MonthChart
        values={tl.fish_share}
        color={FISH_COLOR}
        yLabel="Fish share of shipments"
        tipLabel="Fish share"
        yFormat={d3.format('.0%')}
        yDomain={[0.1, 0.18]}
        height={124}
        bands={spec?.share}
      />
      <p className="mc2-panel-label">Calendar profile: each month against the average month</p>
      <IndexChart all={cp.all_index} fish={cp.fish_index} months={cp.months} band={spec?.season ?? null} />
    </Figure>
  )
}

function LifespanFigure({ d, focus, subset, setSubset }: { d: Data; focus: Role | null; subset: 'all' | 'fish'; setSubset: (s: 'all' | 'fish') => void }) {
  const h = d.co.lifespan_histogram
  const lc = subset === 'fish' ? d.co.lifecycle_counts_fish_majority : d.co.lifecycle_counts
  const ship = subset === 'fish' ? h.shipper_fish_majority : h.shipper
  const rec = subset === 'fish' ? h.receiver_fish_majority : h.receiver
  const tr = (r: Role) => lc[r].transient / d3.sum(Object.values(lc[r]))
  return (
    <Figure
      id="fig-life"
      title={`Most shippers trade for years; most receivers vanish within ${h.receiver_median_span} months`}
      subtitle={
        <>
          Median span: shippers {h.shipper_median_span} months, receivers {h.receiver_median_span}. Transient{subset === 'fish' ? ' among fish-majority companies' : ''}:{' '}
          {f1(tr('shipper'))} of shippers, {f1(tr('receiver'))} of receivers.
        </>
      }
      controls={
        <div className="mc2-seg" role="group" aria-label="Companies shown">
          <button type="button" className="chip" aria-pressed={subset === 'all'} onClick={() => setSubset('all')}>
            All companies
          </button>
          <button type="button" className="chip" aria-pressed={subset === 'fish'} onClick={() => setSubset('fish')}>
            Fish-majority only
          </button>
        </div>
      }
      legend={
        <>
          <Swatch color={ROLE_COLOR.shipper}>
            {ROLE_LABEL.shipper} ({fint(d3.sum(ship))})
          </Swatch>
          <Swatch color={ROLE_COLOR.receiver}>
            {ROLE_LABEL.receiver} ({fint(d3.sum(rec))})
          </Swatch>
        </>
      }
      caption={
        <>
          Source: <code>companies_top.json</code> → <code>lifespan_histogram</code>, <code>lifecycle_counts</code>. Span = months from first to last shipment, each
          role as a share of its own companies.
        </>
      }
      table={{
        columns: ['Months active', 'Shippers', 'Receivers'],
        rows: h.bin_labels.map((l, i) => [l, ship[i], rec[i]]),
      }}
    >
      <LifespanBars labels={h.bin_labels} shipper={ship} receiver={rec} focus={focus} />
    </Figure>
  )
}

function TaxonomyFigure({ d, focus }: { d: Data; focus: Category[] | null }) {
  const p = d.pat
  const totalShip = d3.sum(p.categories, (c) => c.shipments)
  return (
    <Figure
      id="fig-tax"
      title="Steady pairs are 1.9% of relationships but carry a third of all shipments"
      subtitle="Eight patterns, applied in rule order. Right: one exemplar pair (line) over the category’s total (grey), each scaled to its own peak."
      legend={
        <>
          <Swatch color="var(--series-other)">Share of pairs</Swatch>
          <Swatch color="var(--ink)">Share of shipments</Swatch>
          <LineSwatch color="var(--ink)">Exemplar pair, 2028–2034</LineSwatch>
          <Swatch color="var(--series-other)" outline={false}>
            Category total
          </Swatch>
        </>
      }
      caption={
        <>
          Source: <code>patterns.json</code> → <code>categories</code> ({fint(p.n_pairs)} pairs). Hover a row for its rule.
        </>
      }
      table={{
        columns: ['Pattern', 'Pairs', 'Share of pairs', 'Shipments', 'Share of shipments', 'Fish pairs', 'Rule'],
        rows: CAT_ORDER.map((c) => {
          const k = p.categories.find((x) => x.category === c)!
          return [CAT_LABEL[c], k.pairs, f1(k.pairs / p.n_pairs), k.shipments, f1(k.shipments / totalShip), k.fish_pairs, k.definition]
        }),
      }}
    >
      <Taxonomy cats={p.categories} order={CAT_ORDER} totalPairs={p.n_pairs} totalShip={totalShip} focus={focus} />
    </Figure>
  )
}

function GapFigure({ d, band }: { d: Data; band: 'twins' | 'restarts' | null }) {
  const g = d.sus.gap_profile
  return (
    <Figure
      id="fig-gap"
      title="Look-alikes mostly coexist; a second peak starts within six months of a stop"
      subtitle="Gap = later company’s first month minus earlier company’s last. Negative = they overlapped."
      legend={
        <>
          <Swatch color={ROLE_COLOR.shipper}>Shipper pairs</Swatch>
          <Swatch color={ROLE_COLOR.receiver}>Receiver pairs</Swatch>
        </>
      }
      caption={
        <>
          Source: <code>suspects.json</code> → <code>gap_profile</code>. Bins are uneven, so each bar is pairs divided by the bin’s width in months. Pairs need partner
          and HS cosine ≥ 0.7 and three shared partners.
        </>
      }
      table={{
        columns: ['Gap from', 'to', 'Shipper pairs', 'Receiver pairs', 'Shipper per month', 'Receiver per month'],
        rows: g.shipper.pairs.map((_, i) => [g.shipper.bins[i], g.shipper.bins[i + 1], g.shipper.pairs[i], g.receiver.pairs[i], g.shipper.pairs_per_gap_month[i], g.receiver.pairs_per_gap_month[i]]),
      }}
    >
      <GapColumns bins={g.shipper.bins} shipper={g.shipper.pairs_per_gap_month} receiver={g.receiver.pairs_per_gap_month} band={band} />
    </Figure>
  )
}

/* ═════════ Q2 ═════════ */

type Q2Spec = { bundle?: string; cols?: Component[] }
const Q2_CLAIMS: Record<string, Q2Spec> = {
  anchored: { cols: ['novelty_balance'] },
  carp: { bundle: 'carp' },
  herring: { bundle: 'herring', cols: ['month_fit'] },
  repeaters: { bundle: 'chub_mackerel', cols: ['uniqueness'] },
  catfish: { bundle: 'catfish', cols: ['schema', 'date_validity', 'weight_realism', 'value_realism', 'node_consistency'] },
  salmon: { bundle: 'salmon', cols: ['uniqueness'] },
  cod2: { bundle: 'cod2', cols: ['uniqueness'] },
  shark: { bundle: 'shark', cols: ['novelty_balance'] },
  tuna: { bundle: 'tuna', cols: ['schema', 'novelty_balance', 'node_consistency', 'concentration_fit'] },
  repeat: { bundle: 'cod2', cols: ['uniqueness'] },
  schema: { bundle: 'mackerel', cols: ['schema', 'weight_realism', 'node_consistency'] },
  price: { bundle: 'lichen', cols: ['value_realism'] },
}

function Q2({ state }: { state: ReturnType<typeof useMC2> }) {
  const [bundle, setBundle] = useState('carp')
  const { claim, setClaim, spec, press } = useClaim(Q2_CLAIMS, (s) => s.bundle && setBundle(s.bundle))
  const pick = (b: string) => (setBundle(b), setClaim(null))
  return (
    <ClaimCtx.Provider value={{ claim, press }}>
      <Question
        id="q2"
        n="Q2"
        prompt="Evaluate the sets of predicted knowledge-graph links FishEye provided; which sets are most reliable for completing the graph?"
        title="Five of the twelve bundles look like the real graph; seven are repeated, copied or missing fields"
        answer={
          <>
            <p>
              We score each bundle against the real graph on eleven components, each 0–1: repetition, novelty, schema, dates, month mix, pair and product history, HS
              mix, concentration, weight, price and node countries. Distribution tests compare it with 200 same-size random samples of real 2034 edges, so a small
              bundle is not punished for noise. Gates override the score: under 25% distinct links, fewer than 20 of them, or over 95% exact copies force{' '}
              <strong>Unreliable</strong>; under half the links carrying a weight, or over 5% dated outside the window, cap it at <strong>Questionable</strong>.
            </p>
            <p>
              Novelty cuts both ways. An exact match with a real edge (same shipper, receiver, HS code and day) almost never happens by chance, so some matches show a
              bundle is anchored to real records, while all matches mean it adds nothing. <C id="anchored" to="fig-score">The five diverse bundles converge on 42–59% matches</C>.
            </p>
            <p>
              <strong>Reliable.</strong> <C id="carp" to="fig-score">carp</C> (0.99: 165 distinct links, 95% country match), <C id="herring" to="fig-score">herring</C>{' '}
              (0.95, month mix slightly off), then chub_mackerel, pollock and salmon_wgl (0.87–0.90). <C id="repeaters" to="fig-score">Those three repeat 34–57% of rows</C>,
              but their distinct links pass every realism test.
            </p>
            <p>
              <strong>Questionable.</strong> <C id="catfish" to="fig-score">catfish</C> and mackerel (0.56, 0.52) carry no weights at all, put 9% and 32% of dates in
              2035, and agree with the graph on node countries only 47–49% of the time.
            </p>
            <p>
              <strong>Unreliable.</strong> <C id="salmon" to="fig-score">salmon</C> is 132 links built from 13 records; <C id="cod2" to="fig-score">cod2</C> is 193
              built from 4, and its top target, −53, never receives anything in the graph. <C id="shark" to="fig-score">shark</C> and lichen are entirely exact copies.{' '}
              <C id="tuna" to="fig-score">tuna</C> has no weights, no anchoring and 22% country agreement, and sends a third of its links to one receiver.
            </p>
            <p>Three findings carry the verdicts:</p>
            <ul>
              <li>
                <C id="repeat" to="fig-score">Repetition separates the bundles most sharply</C>. Real data repeats 2.8% of records; the Unreliable bundles repeat
                82–98%.
              </li>
              <li>
                <C id="schema" to="fig-score">Missing fields mark the fabricated bundles</C>. catfish, mackerel and tuna lack <code>weightkg</code>, which every graph
                edge has, and rarely match a real record.
              </li>
              <li>
                <C id="price" to="fig-score">Prices</C>: reliable bundles sit within 0.12 dex of the graph’s typical price per HS code; lichen and cod2 run high.
              </li>
            </ul>
            <p>The bundles’ pair sets barely overlap (Jaccard ≤ 0.05), so they cannot corroborate each other.</p>
            <p>
              <strong>Confidence: high</strong> for the five Unreliable bundles and for carp and herring; <strong>medium</strong> for chub_mackerel, pollock and
              salmon_wgl (unexplained repetition) and for catfish and mackerel (weight and price cannot be checked).
            </p>
          </>
        }
      >
        <Await state={state} height={480}>
          {(d) => (
            <>
              <ScoreFigure d={d} bundle={bundle} onSelect={pick} cols={spec?.cols ?? null} />
              <BundleDetailFigure d={d} bundle={bundle} />
            </>
          )}
        </Await>
      </Question>
    </ClaimCtx.Provider>
  )
}

function ScoreFigure({ d, bundle, onSelect, cols }: { d: Data; bundle: string; onSelect: (b: string) => void; cols: Component[] | null }) {
  const b = d.bun
  return (
    <Figure
      id="fig-score"
      title="carp and herring pass every test; the gated bundles fail on repetition or missing fields"
      subtitle="Select a bundle to compare it with the real graph. Score bar tick = 0.75, the Reliable threshold. * = a gate overrides the score."
      legend={
        <>
          <BundleKey />
          <SeqLegend />
        </>
      }
      caption={
        <>
          Source: <code>bundles.json</code> → <code>bundles[].components</code>, <code>score</code>, <code>gates_failed</code>. Hover a cell for its definition.
        </>
      }
      table={{
        columns: ['Bundle', 'Verdict', 'Score', ...COMPONENTS.map((c) => COMPONENT_LABEL[c]), 'Gates failed'],
        rows: b.bundles.map((x) => [x.bundle, x.verdict, x.score, ...COMPONENTS.map((c) => x.components[c]), x.gates_failed.map((g) => g.reason).join('; ') || null]),
      }}
    >
      <Scorecard bundles={b.bundles} selected={bundle} onSelect={onSelect} colFocus={cols} defs={b.component_definitions} thresholds={b.thresholds} />
    </Figure>
  )
}

function BundleDetailFigure({ d, bundle }: { d: Data; bundle: string }) {
  const b = d.bun.bundles.find((x) => x.bundle === bundle)!
  const dist = b.distributions
  const mt = b.metrics
  const color = BUNDLE_COLOR[b.verdict]
  const wLabels = dist.log10_weight.bins.slice(0, -1).map((v) => (v === 0 ? '<10' : `1e${v}`))
  const vLabels = dist.value_offset_dex.bins.slice(0, -1).map((v) => (v > 0 ? `+${v}` : `${v}`))
  const mLabels = dist.month.labels.map((l) => (l === '<2034' ? '<34' : l.slice(2, 4) === '35' ? `’35-${+l.slice(5)}` : `${+l.slice(5)}`))
  const hasWeight = d3.sum(dist.log10_weight.bundle) > 0
  const hasValue = d3.sum(dist.value_offset_dex.bundle) > 0
  const facts: [string, string][] = [
    ['Links', fint(mt.links)],
    ['Distinct', `${fint(mt.distinct_links)} (${d3.format('.0%')(mt.unique_rate)})`],
    ['Exact copies', d3.format('.0%')(mt.exact_copy_rate)],
    ['With weight', d3.format('.0%')(mt.weight_present_rate)],
    ['Outside window', d3.format('.0%')(mt.out_of_range_date_rate)],
    ['Country match', mt.node_country_agreement == null ? '—' : d3.format('.0%')(mt.node_country_agreement)],
  ]
  return (
    <Figure
      id="fig-bundle"
      title={`${b.bundle}: ${b.verdict.toLowerCase()}, score ${b.score.toFixed(2)}${b.gates_failed.length ? `, ${b.gates_failed.length} gate${b.gates_failed.length > 1 ? 's' : ''} failed` : ''}`}
      subtitle={b.gates_failed.length ? b.gates_failed.map((g) => g.reason).join('; ') + '.' : 'No gate failed.'}
      legend={
        <>
          <Swatch color={color}>{b.bundle}, share of its links</Swatch>
          <LineSwatch color="var(--ink)">Real graph, share of edges</LineSwatch>
        </>
      }
      caption={
        <>
          Source: <code>bundles.json</code> → <code>bundles[].distributions</code>, <code>metrics</code>. Reference: real 2034 edges (months, weights, HS mix) and the{' '}
          {Math.round(d.meta.value_fields.valueofgoods_omu_present * d.meta.edges_deduplicated)} graph edges valued in OMU (price offset, dex = log10 units against the
          graph’s median price for the same HS code).
        </>
      }
      table={{
        columns: ['Panel', 'Bin', 'Bundle (links; HS as share)', 'Real graph share'],
        rows: [
          ...dist.month.labels.map((l, i) => ['Month', l, dist.month.bundle[i], dist.month.graph_2034_share[i]]),
          ...wLabels.map((l, i) => ['Weight kg', l, dist.log10_weight.bundle[i], dist.log10_weight.graph_2034_share[i]]),
          ...vLabels.map((l, i) => ['Price offset (dex)', l, dist.value_offset_dex.bundle[i], dist.value_offset_dex.graph_omu_share[i]]),
          ...dist.hs4_top.map((h) => ['HS heading', h.hs4, h.bundle_share, h.graph_2034_share]),
        ] as (string | number)[][],
      }}
    >
      <dl className="mc2-facts">
        <div>
          <dt>Verdict</dt>
          <dd>
            <BundleTag verdict={b.verdict} />
          </dd>
        </div>
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="tnum">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mc2-dists">
        <DistPanel title="Month (2034 unless marked)" labels={mLabels} bundle={dist.month.bundle} ref_={dist.month.graph_2034_share} color={color} every={2} />
        {hasWeight ? (
          <DistPanel title="Weight per link (kg)" labels={wLabels} bundle={dist.log10_weight.bundle} ref_={dist.log10_weight.graph_2034_share} color={color} />
        ) : (
          <p className="mc2-empty">No link in {b.bundle} carries a weight, so weight cannot be compared.</p>
        )}
        {hasValue ? (
          <DistPanel title="Price offset (dex)" labels={vLabels} bundle={dist.value_offset_dex.bundle} ref_={dist.value_offset_dex.graph_omu_share} color={color} every={2} />
        ) : (
          <p className="mc2-empty">No usable value in OMU, so price cannot be compared.</p>
        )}
        <DistPanel
          title="Top HS headings"
          labels={dist.hs4_top.map((h) => h.hs4)}
          bundle={dist.hs4_top.map((h) => h.bundle_share)}
          ref_={dist.hs4_top.map((h) => h.graph_2034_share)}
          shares
          color={color}
        />
      </div>
    </Figure>
  )
}

/* ═════════ Q3 ═════════ */

const Q3_CLAIMS: Record<string, { fig: 'add' | 'tr' | 'rev' }> = {
  small: { fig: 'add' },
  changed: { fig: 'tr' },
  revived: { fig: 'rev' },
}

function Q3({ state }: { state: ReturnType<typeof useMC2> }) {
  const { claim, spec, press } = useClaim(Q3_CLAIMS)
  return (
    <ClaimCtx.Provider value={{ claim, press }}>
      <Question
        id="q3"
        n="Q3"
        prompt="Using your visualizations, show how your approach can reveal new patterns or anomalies once the reliable links are added."
        title="The reliable links barely move the graph, but they show three stops were missing data"
        answer={
          <>
            <p>
              The five Reliable bundles hold 1,015 links, but <C id="small" to="fig-added">only 347 are usable</C> (distinct, new and inside the window): under 0.1% of
              2034 volume. The 2034 fish share stays at 15.6%. 261 existing pairs gain links and 58 new pairs appear, yet{' '}
              <C id="changed" to="fig-trans">only 15 pairs change pattern</C>, mostly one-off or short burst to intermittent, and fading or ramping to steady.
            </p>
            <p>
              The anomaly they reveal: <C id="revived" to="fig-revived">three apparent stops are data gaps</C>. Predicted links keep Chhattisgarh Salt spray ОАО United
              (a receiver with 174 shipments, last real month March 2034) trading until November, and do the same for Bahía Azul Ltd Holdings and Okavango River
              S.A. de C.V. Solutions. So stops late in 2034 are partly missing data. The successor detector requires six silent months, and marks a pair Unlikely when
              predicted links revive the predecessor.
            </p>
            <p>
              The flags are stable. All 68 flagged successor pairs (8 Suspect, 60 Possible) keep their verdicts when detection reruns on the augmented graph, and again
              with the two Questionable bundles added (701 links). The links mostly feed existing hubs (hǎi dǎn Corporation Wharf gains 33), making the core denser
              rather than revealing hidden companies.
            </p>
            <p>
              <strong>Confidence: high</strong> that the impact is small; <strong>medium</strong> on the revivals, three cases each resting on one bundle.
            </p>
          </>
        }
      >
        <Await state={state} height={360}>
          {(d) => (
            <>
              <AddedFigure d={d} focus={spec?.fig === 'add'} />
              <RevivedFigure d={d} focus={spec?.fig === 'rev'} />
              <TransFigure d={d} focus={spec?.fig === 'tr'} />
            </>
          )}
        </Await>
      </Question>
    </ClaimCtx.Provider>
  )
}

function AddedFigure({ d, focus }: { d: Data; focus: boolean }) {
  const i = d.imp
  const share = d3.sum(i.monthly_2034_added) / d3.sum(i.monthly_2034_before)
  return (
    <Figure
      id="fig-added"
      title={`347 usable links add ${d3.format('.2%')(share)} to 2034, too few to show on the same scale`}
      subtitle={`By bundle: ${Object.entries(i.links_added_by_bundle)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ')}.`}
      legend={
        <>
          <Swatch color="var(--series-other)">Real shipments</Swatch>
          <Swatch color={BUNDLE_COLOR.Reliable}>Links added from Reliable bundles</Swatch>
        </>
      }
      caption={
        <>
          Source: <code>bundle_impact.json</code> → <code>monthly_2034_before</code>, <code>monthly_2034_added</code>. The two panels use separate scales; the lower
          one is about 1,000 times larger.
        </>
      }
      table={{ columns: ['Month', 'Real shipments', 'Links added'], rows: i.months_2034.map((m, k) => [m, i.monthly_2034_before[k], i.monthly_2034_added[k]]) }}
    >
      <AddedColumns months={i.months_2034} before={i.monthly_2034_before} added={i.monthly_2034_added} focus={focus} />
    </Figure>
  )
}

function RevivedFigure({ d, focus }: { d: Data; focus: boolean }) {
  const rows = d.imp.revived_stoppers
  return (
    <Figure
      id="fig-revived"
      title="Predicted links keep three ‘stopped’ companies trading for five to eight more months"
      legend={
        <>
          <LineSwatch color="var(--ink)">Real trade in 2034</LineSwatch>
          <LineSwatch color={BUNDLE_COLOR.Reliable} dashed>
            Extended by predicted links
          </LineSwatch>
        </>
      }
      caption={
        <>
          Source: <code>bundle_impact.json</code> → <code>revived_stoppers</code>.
        </>
      }
      table={{
        columns: ['Company', 'Role', 'Shipments', 'Last real month', 'Last month with predicted links'],
        rows: rows.map((r) => [r.id, r.role, r.shipments, r.last_month_before, r.last_month_after]),
      }}
    >
      <RevivedRows rows={rows} focus={focus} />
    </Figure>
  )
}

function TransFigure({ d, focus }: { d: Data; focus: boolean }) {
  const pp = d.imp.pair_patterns
  return (
    <Figure
      id="fig-trans"
      title={`Of ${pp.pairs_touched} existing pairs that gain links, ${pp.category_changed} change pattern`}
      subtitle="Rows: pattern before; columns: pattern after. Grey = unchanged."
      legend={
        <>
          <Swatch color={BUNDLE_COLOR.Reliable}>Pattern changed</Swatch>
          <Swatch color="var(--series-other)">Unchanged</Swatch>
        </>
      }
      caption={
        <>
          Source: <code>bundle_impact.json</code> → <code>pair_patterns.transitions</code>. Plus {pp.pairs_new} pairs that exist only in the predicted links.
        </>
      }
      table={{ columns: ['Before', 'After', 'Pairs'], rows: pp.transitions.map((t) => [CAT_LABEL[t.from], CAT_LABEL[t.to], t.pairs]) }}
    >
      <TransitionGrid transitions={pp.transitions} focus={focus} />
    </Figure>
  )
}

/* ═════════ Q4 ═════════ */

const Q4_CLAIMS: Record<string, { rank: number }> = {
  p8: { rank: 8 },
  p2: { rank: 2 },
  karelians: { rank: 2 },
  p3: { rank: 3 },
  p7: { rank: 7 },
  p6: { rank: 6 },
  p1: { rank: 1 },
  p4: { rank: 4 },
  p5: { rank: 5 },
}

function Q4({
  state,
  rank,
  setRank,
  claim,
  setClaim,
}: {
  state: ReturnType<typeof useMC2>
  rank: number
  setRank: (r: number) => void
  claim: string | null
  setClaim: (c: string | null) => void
}) {
  const [filter, setFilter] = useState<PairVerdict>('Suspect')
  const press = (id: string) => {
    if (claim === id) return setClaim(null)
    setRank(Q4_CLAIMS[id].rank)
    setFilter('Suspect')
    setClaim(id)
  }
  return (
    <ClaimCtx.Provider value={{ claim, press }}>
      <Question
        id="q4"
        n="Q4"
        prompt="Identify companies that fit a pattern of illegal fishing; give your confidence."
        title="Eight fish pairs where one company stops and a look-alike takes over its partners"
        answer={
          <>
            <p>
              We matched 2,780 shippers and 3,888 receivers that go silent at least six months before the data ends with companies that start −6 to +12 months from the
              stop. Similarity weights partners and HS codes by rarity, so shared hubs count little, and the shared partners must switch over. Of 872 candidate pairs,
              8 are Suspect, 60 Possible, 572 Insufficient evidence and 232 Unlikely. All eight Suspects trade fish on both sides.
            </p>
            <ul>
              <li>
                <C id="p8" to="fig-handover">Receiver −811 → −206</C>, <strong>high</strong>: fillets; stops December 2032, the successor starts January 2033, and 5
                shared shippers supply 78% of its trade.
              </li>
              <li>
                <C id="p2" to="fig-handover">Beachcomber’s Bounty → Karelians</C>, <strong>medium</strong>:{' '}
                <C id="karelians" to="fig-consol">Karelians also succeeds five more fish shippers</C> that stopped in 2030, a consolidation under one new name.
              </li>
              <li>
                <C id="p3" to="fig-handover">Saltwater Surf Club → Chhattisgarh GmbH &amp; Co. KG Sea spray</C>, <strong>medium</strong>: dried fish only; all three
                shared partners switch.
              </li>
              <li>
                <C id="p7" to="fig-handover">Asveja → Marine Mavericks</C>, <strong>medium</strong>: molluscs; 95% of the successor’s trade is inherited.
              </li>
              <li>
                <C id="p6" to="fig-handover">−812 → −556</C> (prepared crustaceans, 5 shared shippers) and <C id="p1" to="fig-handover">−513 → −690</C> (identical
                partner set), <strong>medium</strong>.
              </li>
              <li>
                <C id="p4" to="fig-handover">The Salty Dog → Gulf of Guinea</C> and <C id="p5" to="fig-handover">Estrella del Sol → Mandalore</C>,{' '}
                <strong>low</strong>: predecessors with only 12–13 shipments.
              </li>
            </ul>
            <p>
              <strong>Confidence: medium</strong> overall: only 3–5 shared partners per pair, no ground truth, and 24 high-similarity pairs proved Unlikely because
              their partners did not switch over.
            </p>
          </>
        }
      >
        <Await state={state} height={480}>
          {(d) => (
            <>
              <HandoverFigure d={d} rank={rank} />
              <PairListFigure d={d} rank={rank} setRank={(r) => (setRank(r), setClaim(null))} filter={filter} setFilter={setFilter} />
              <ConsolidationFigure d={d} on={claim === 'karelians'} />
            </>
          )}
        </Await>
      </Question>
    </ClaimCtx.Provider>
  )
}

function HandoverFigure({ d, rank }: { d: Data; rank: number }) {
  const p = d.sus.pairs.find((x) => x.rank === rank)!
  const ev = p.evidence
  const stop = mIdx(p.stop_month)
  const start = mIdx(p.start_month)
  const act = [p.pred.first_month, p.succ.last_month, ...ev.shared_partners.flatMap((s) => [s.pred_last_month, s.succ_first_month])]
  const m0 = Math.max(0, Math.min(...act) - 3)
  const m1 = Math.min(83, Math.max(...act) + 3)
  const hs = (l: { hs4: string; shipments: number }[]) =>
    l
      .slice(0, 2)
      .map((h) => `${h.hs4}${HS_LABEL[h.hs4] ? ` ${HS_LABEL[h.hs4]}` : ''}`)
      .join(', ')
  return (
    <Figure
      id="fig-handover"
      title={`${pairName(p)}: ${p.verdict.toLowerCase()}, ${p.confidence.toLowerCase()} confidence. ${
        p.gap_months <= 0 ? `The new company starts ${-p.gap_months || 'in the same'} month${p.gap_months === 0 ? '' : 's before the stop'}` : `The new company starts ${p.gap_months} month${p.gap_months > 1 ? 's' : ''} after the stop`
      }`}
      subtitle={
        <>
          {p.role === 'receiver' ? 'Receivers' : 'Shippers'}. Old: {p.pred.shipments} shipments, {d3.format('.0%')(p.pred.fish_share)} fish ({hs(ev.pred_top_hs4)}). New: {p.succ.shipments}{' '}
          shipments, {d3.format('.0%')(p.succ.fish_share)} fish ({hs(ev.succ_top_hs4)}). Score {p.score.toFixed(2)}.
        </>
      }
      legend={
        <>
          <Swatch color={PRED_COLOR}>Old company (above the axis)</Swatch>
          <Swatch color={SUCC_COLOR}>New company (below)</Swatch>
          <Swatch color="var(--flag-yellow)">Gap between stop and start</Swatch>
        </>
      }
      caption={
        <>
          Source: <code>suspects.json</code> → <code>pairs[].evidence</code>. {p.reason}.
        </>
      }
      table={{
        columns: ['Shared partner', 'Shipments with old', 'Last month with old', 'Shipments with new', 'First month with new'],
        rows: ev.shared_partners.map((s) => [nice(s.id), s.pred_shipments, d.meta.months[s.pred_last_month], s.succ_shipments, d.meta.months[s.succ_first_month]]),
      }}
    >
      <Handover pred={ev.pred_monthly} succ={ev.succ_monthly} stop={stop} start={start} predName={nice(p.predecessor)} succName={nice(p.successor)} />
      <p className="mc2-panel-label">
        {ev.shared_partners.length} shared partner{ev.shared_partners.length > 1 ? 's' : ''}: last shipment with the old company{' '}
        <svg width={10} height={10} aria-hidden>
          <circle cx={5} cy={5} r={4} fill={PRED_COLOR} />
        </svg>{' '}
        and first with the new{' '}
        <svg width={10} height={10} aria-hidden>
          <rect x={1} y={1} width={8} height={8} fill={SUCC_COLOR} />
        </svg>
      </p>
      <PartnerSwitch partners={ev.shared_partners} m0={m0} m1={m1} />
    </Figure>
  )
}

function PairListFigure({
  d,
  rank,
  setRank,
  filter,
  setFilter,
}: {
  d: Data
  rank: number
  setRank: (r: number) => void
  filter: PairVerdict
  setFilter: (v: PairVerdict) => void
}) {
  const counts = d.sus.pair_counts.by_verdict
  const rows = d.sus.pairs.filter((p) => p.verdict === filter)
  const x = d3.scaleLinear().domain([0.45, 1]).range([0, 1])
  return (
    <Figure
      id="fig-pairs"
      title={`${counts.Suspect} Suspect and ${counts.Possible} Possible pairs out of ${fint(d.sus.pair_counts.total)} candidates`}
      subtitle="Select a pair to see its handover. Bar = similarity score (0.45–1)."
      controls={
        <div className="mc2-seg" role="group" aria-label="Verdict shown">
          {(['Suspect', 'Possible'] as PairVerdict[]).map((v) => (
            <button key={v} type="button" className="chip" aria-pressed={filter === v} onClick={() => setFilter(v)}>
              <Flag code={VERDICT_FLAG[v]} size={16} decorative />
              {v} ({counts[v]})
            </button>
          ))}
        </div>
      }
      caption={
        <>
          Source: <code>suspects.json</code> → <code>pairs</code> (top 100 by verdict, then score), <code>pair_counts</code>. Suspect requires score ≥ 0.70, three or
          more shared partners, a gap of −3 to +6 months, at least half the partners switching over, a mutual best match and fish on both sides.
        </>
      }
      table={{
        columns: ['Rank', 'Role', 'Old company', 'New company', 'Verdict', 'Confidence', 'Score', 'Gap (months)', 'Shared partners'],
        rows: rows.map((p) => [p.rank, p.role, nice(p.predecessor), nice(p.successor), p.verdict, p.confidence, p.score, p.gap_months, p.shared_partner_count]),
      }}
    >
      <ol className="mc2-pairs">
        {rows.map((p) => (
          <li key={p.rank}>
            <button type="button" className="mc2-pair" aria-pressed={p.rank === rank} onClick={() => setRank(p.rank)}>
              <VerdictTag verdict={p.verdict} confidence={toConfidence(p.confidence)} size={18} />
              <span className="mc2-pair__names">
                <span>{short(p.predecessor, 34)}</span>
                <span className="mc2-pair__to">
                  <span className="visually-hidden">succeeded by </span>
                  <span aria-hidden>→ </span>
                  {short(p.successor, 34)}
                </span>
              </span>
              <span className="mc2-pair__meta">
                <span className="mc2-pair__role">{p.role}</span>
                <span className="mc2-pair__score" aria-hidden>
                  <span style={{ transform: `scaleX(${x(p.score)})` }} />
                </span>
                <span className="tnum">{p.score.toFixed(2)}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </Figure>
  )
}

function ConsolidationFigure({ d, on }: { d: Data; on: boolean }) {
  const KAR = 'Karelians Limited Liability Company International'
  const preds = useMemo(() => d.sus.pairs.filter((p) => p.successor === KAR).sort((a, b) => a.pred.last_month - b.pred.last_month), [d])
  const succ = preds[0]?.evidence.succ_monthly ?? []
  return (
    <Figure
      id="fig-consol"
      title="Six fish shippers stop in 2030 and Karelians starts in November, trading with their partners"
      subtitle={on ? 'Karelians and the six companies it is matched to as successor.' : 'One new name matched as successor to six stopped shippers.'}
      legend={
        <>
          <Swatch color={PRED_COLOR}>Stopped shipper (verdict of its pair)</Swatch>
          <Swatch color={SUCC_COLOR}>Karelians</Swatch>
        </>
      }
      caption={
        <>
          Source: <code>suspects.json</code> → <code>companies[].links</code>, <code>pairs[].evidence</code>. Each row is scaled to its own peak month.
        </>
      }
      table={{
        columns: ['Stopped shipper', 'Verdict', 'Confidence', 'Last month', 'Score'],
        rows: preds.map((p) => [nice(p.predecessor), p.verdict, p.confidence, mLabel(p.pred.last_month), p.score]),
      }}
    >
      <div className="mc2-ring" data-on={on}>
        <Consolidation rows={preds.map((p) => ({ name: nice(p.predecessor), monthly: p.evidence.pred_monthly, verdict: p.verdict }))} succ={succ} succName="Karelians" />
      </div>
    </Figure>
  )
}

/* ═════════ Q5 ═════════ */

function Q5({ state }: { state: ReturnType<typeof useMC2> }) {
  const { claim, press } = useClaim<null>({ hs: null, dups: null, ids: null, omu: null })
  return (
    <ClaimCtx.Provider value={{ claim, press }}>
      <Question
        id="q5"
        n="Q5"
        prompt="What was the most difficult aspect of working with this knowledge graph?"
        title="Data defects that would silently change the answers"
        answer={
          <>
            <ul>
              <li>
                <C id="hs" to="fig-quality">HS codes</C>: chapter 01–09 codes lost their leading zero, and the bundles store them with five digits (30729). Appending a 0 matches the
                graph every time; without it every chapter-03 fish link in the bundles is misread.
              </li>
              <li>
                <C id="dups" to="fig-quality">Duplicates</C>: 155,291 edges (2.8%) exactly repeat another, and we drop them as double-recorded shipments.
              </li>
              <li>
                <C id="ids" to="fig-quality">Names</C>: 22,004 company ids are bare negative numbers, so name similarity cannot count as evidence.
              </li>
              <li>
                <C id="omu" to="fig-quality">Values</C>: the graph is in USD and the bundles in OMU, and only 281 graph edges carry OMU, so prices are compared as
                offsets per HS code.
              </li>
            </ul>
            <p>
              Null models changed conclusions. Raw cosine first rated catfish and mackerel reliable; weighting partners by rarity and comparing with random samples of
              real 2034 edges reversed both. An exact copy of a real edge looked like a defect until five independent bundles each showed 42–59% of them.
            </p>
            <p>
              <strong>Limitations.</strong> Weights and thresholds are judgement calls, published so they can be challenged; detection needs two shared partners; and stops
              near the end of 2034 cannot be told apart from missing data.
            </p>
          </>
        }
      >
        <Await state={state} height={200}>{(d) => <QualityFigure d={d} focus={claim} />}</Await>
      </Question>
    </ClaimCtx.Provider>
  )
}

function QualityFigure({ d, focus }: { d: Data; focus: string | null }) {
  const m = d.meta
  const omu = Math.round(m.value_fields.valueofgoods_omu_present * m.edges_deduplicated)
  const links = d3.sum(d.bun.bundles, (b) => b.metrics.links)
  const five = d3.sum(d.bun.bundles, (b) => b.metrics.links * b.metrics.hscode_5digit_rate)
  const rows = [
    { key: 'hs', label: 'Bundle links with 5-digit HS codes', part: five, whole: links, note: 'chapter 01–09 codes that need a 0 appended' },
    { key: 'dups', label: 'Exact duplicate edges', part: m.exact_duplicates_removed, whole: m.edges_raw, note: `${fint(m.exact_duplicates_removed)} of ${fint(m.edges_raw)} edges` },
    { key: 'ids', label: 'Companies with numeric ids', part: 22004, whole: m.companies, note: `22,004 of ${fint(m.companies)} companies` },
    { key: 'usd', label: 'Edges with a USD value', part: m.value_fields.valueofgoodsusd_present * m.edges_deduplicated, whole: m.edges_deduplicated, note: 'valueofgoodsusd present' },
    { key: 'omu', label: 'Edges with an OMU value', part: omu, whole: m.edges_deduplicated, note: `${omu} edges` },
  ]
  return (
    <Figure
      id="fig-quality"
      title="Duplicates, anonymous ids and mixed currencies each needed handling before any pattern was trusted"
      caption={
        <>
          Source: <code>meta.json</code> → <code>exact_duplicates_removed</code>, <code>companies</code>, <code>value_fields</code>; <code>bundles.json</code> →{' '}
          <code>metrics.hscode_5digit_rate</code>; the count of numeric ids comes from the
          pipeline notes in <code>docs/data-contracts/mc2.md</code>.
        </>
      }
      table={{ columns: ['Issue', 'Affected', 'Out of', 'Share'], rows: rows.map((r) => [r.label, Math.round(r.part), r.whole, d3.format('.3%')(r.part / r.whole)]) }}
    >
      <ShareRows rows={rows} focus={focus} />
    </Figure>
  )
}
