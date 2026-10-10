import { useMemo, useState } from 'react'
import { Question } from '../../components/Layout'
import { Await, Figure, LegendItem } from '../../components/Figure'
import { Flag } from '../../components/Flag'
import { VerdictTag } from '../../components/Signals'
import { useJson } from '../../lib/useJson'
import { VERDICT_COLOR, VERDICT_FLAG, fmt, toConfidence, toVerdict, type Verdict } from '../../lib/signals'
import { CanvasPlot, type CPoint } from './CanvasPlot'
import { Claim, Conf, GraphLegend, GroupGraph, SCORE_PARTS, ScoreBar, reveal } from './parts'
import { FLAG_LABEL, rowsOf, type GroupsOverview, type InvestGroup, type Investigate, type UnitRow } from './types'

const VERDICTS: Verdict[] = ['Suspect', 'Possible', 'Insufficient evidence', 'Unlikely']

export function Q4({ selected, setSelected }: { selected: string; setSelected: (id: string) => void }) {
  const inv = useJson<Investigate>('mc3/investigate.json')
  const overview = useJson<GroupsOverview>('mc3/groups_overview.json')
  const [showTop, setShowTop] = useState(false)

  const pick = (id: string) => {
    setSelected(id)
    reveal('mc3-investigate')
  }
  const G = (id: string) => (
    <Claim pressed={selected === id} onClick={() => pick(id)}>
      {id}
    </Claim>
  )

  const answer = (
    <>
      <p>
        <strong>Short answer:</strong> structural anomalies and fishing overlap only moderately. The data cannot prove illegal fishing; it can rank where to look.{' '}
Of the{' '}
        <Claim
          pressed={showTop}
          onClick={() => {
            setShowTop((v) => !v)
            reveal('mc3-overlap')
          }}
        >
          119 most anomalous groups
        </Claim>{' '}
        (top 5%), 13% have fishing relevance of 0.5 or more, against 17% of the rest: anomaly alone does not point to fishing. So the ranking combines both: 0.45 × anomaly percentile + 0.30 × flag score + 0.25 × fishing relevance. Fishing
        relevance mixes product text with fishing words in names. The product share is shrunk towards the corpus rate of 26.9%, so one fishing company out of one
        does not count as 100%. Rule-based verdicts on the 30 top groups give 2 Suspect, 20 Possible, 7 Insufficient evidence and 1 Unlikely.
      </p>
      <h3>Investigate first</h3>
      <ol>
        <li>
          {G("BG00177")}, <strong>Suspect, Medium confidence.</strong> Three fishing-named companies (<em>Adriatic Squid</em>,{' '}
          <em>Brisa del Este Cargo Bonito</em>, <em>Sea Harvest Marine</em>) share one owner, Angelica Wheeler, and one contact, Shelly Strong. Adriatic Squid is
          registered in Marebak and Oceanus with conflicting footwear and seafood records; the other two are unregistered. Top 0.2% anomaly score, fishing relevance
          0.91, no common-name links.
        </li>
        <li>
          {G("BG00001.061")}, <strong>Suspect, Medium.</strong> A 16-company slice around <em>Fisher Marine conservation CJSC</em>: one company
          has 26 owners, an uncommon-name person ties 4 companies together, and 62% are unregistered. Its boundary depends on community detection.
        </li>
        <li>
          {G("BG00148")}, <strong>Possible, Medium.</strong> The most anomalous group overall: Anna Wheeler and Jason Carrillo control 7 companies
          across Oceanus and Coralmarica. None declares a product, so the fishing link rests on names such as <em>Baltic Sprat</em> and <em>jīn qiāng yú AG</em>.
        </li>
        <li>
          {G("BG00069")} and {G("BG00071")}, <strong>Possible, Low.</strong> Small multi-country clusters around{' '}
          <em>Yenisei Eel GmbH</em> and <em>Diao yu BV Logistics</em>. BG00069 would be Suspect, but half the people tying it together have very common surnames.
        </li>
        <li>
          Single firms registered in several countries: {G("BG00861")} <em>Diao yu bi sai SRL</em> and {G("BG00386")}{' '}
          <em>Delhi ers AS Holdings</em>, both Possible, Medium.
        </li>
      </ol>
      <h3>Where we can’t conclude</h3>
      <p>
        {G("BG00003")} has 23 companies, 113 people and a top company with 27 owners, yet no fishing link we can verify: Insufficient evidence, with
        High confidence. Ownership-hub slices such as {G("BG00001.001")} around <em>Vespuci Sandbar</em> (119 owners) sell wind-power equipment,
        textiles or beer: nominee-like, not fishing. {G("BG00016")} is Unlikely, with fishing relevance 0.20.
      </p>
      <p>
        <strong>Caveats.</strong> 77% of companies have no product text, so fishing relevance mostly comes from names. People are identified by name only. The
        weights and thresholds are judgement calls, published in <code>investigate.json</code> so a reviewer can re-weight them.
      </p>
      <p>
        Confidence that the Suspect and Possible groups are a better-than-random lead list: <strong>Medium</strong>. That any single group is fishing illegally:{' '}
        <strong>Low</strong>.
      </p>
    </>
  )

  return (
    <Question
      id="q4"
      n="Q4"
      prompt="Based on your visualizations, provide evidence for or against the case that anomalous companies are involved in illegal fishing. Which business groups should FishEye investigate?"
      title="Anomaly is not guilt. Two small groups earn a closer look."
      answer={answer}
    >
      <Await state={inv} height={520}>
        {(d) => <InvestigationFigure data={d} selected={selected} setSelected={setSelected} />}
      </Await>
      <Await state={overview} height={340}>
        {(ov) => (
          <Await state={inv} height={340}>
            {(d) => <OverlapFigure overview={ov} inv={d} selected={selected} setSelected={setSelected} showTop={showTop} setShowTop={setShowTop} />}
          </Await>
        )}
      </Await>
    </Question>
  )
}

function InvestigationFigure({ data, selected, setSelected }: { data: Investigate; selected: string; setSelected: (id: string) => void }) {
  const byId = useMemo(() => new Map(data.groups.map((g) => [g.id, g])), [data])
  const g = byId.get(selected) ?? data.groups[0]
  return (
    <Figure
      id="mc3-investigate"
      wide
      title="Thirty groups ranked for FishEye: 2 Suspect, 20 Possible, 7 Insufficient evidence, 1 Unlikely"
      subtitle="Select a group to see its evidence graph and the reasons behind its verdict."
      legend={
        <>
          {SCORE_PARTS.map((p) => (
            <LegendItem key={p.key} color={p.color} label={`${p.label} × ${data.weights[p.key]}`} />
          ))}
        </>
      }
      caption={<>Source: investigate.json. Verdict rules and confidence points are listed in the data contract; evidence graphs are capped at 80 nodes.</>}
      table={{
        columns: ['Rank', 'Group', 'Verdict', 'Confidence', 'Score', 'Anomaly pct', 'Flag score', 'Fishing relevance', 'Companies', 'People', 'Countries'],
        rows: data.groups.map((r) => [r.rank, r.id, r.verdict, r.confidence, r.investigate_score, r.anomaly_pct, r.flag_score, r.iuu_relevance, r.n_companies, r.n_persons, r.countries.join(', ')]),
      }}
    >
      <div className="mc3-invwrap">
      <div className="mc3-inv">
        <ol className="mc3-inv__list" aria-label="Investigation ranking">
          {data.groups.map((r) => (
            <li key={r.id}>
              <button type="button" className="mc3-inv__row" aria-pressed={r.id === g.id} onClick={() => setSelected(r.id)}>
                <span className="mc3-inv__rank tnum">{r.rank}</span>
                <span className="mc3-inv__main">
                  <span className="mc3-inv__id tnum">{r.id}</span>
                  <span className="mc3-inv__co">{r.key_companies[0]}</span>
                  <ScoreBar parts={r as unknown as Record<string, number>} weights={data.weights} />
                </span>
                <span className="mc3-inv__verdict">
                  <VerdictTag verdict={toVerdict(r.verdict)} size={20} compact />
                  <Conf level={r.confidence} size={9} />
                </span>
              </button>
            </li>
          ))}
        </ol>
        <GroupDetail g={g} byId={byId} setSelected={setSelected} />
      </div>
      </div>
    </Figure>
  )
}

function GroupDetail({ g, byId, setSelected }: { g: InvestGroup; byId: Map<string, InvestGroup>; setSelected: (id: string) => void }) {
  return (
    <div className="mc3-inv__detail" aria-live="polite">
      <div className="mc3-inv__head">
        <div>
          <h5 className="mc3-inv__title">
            {g.id}
            {g.parent ? <span> · slice of {g.parent}</span> : null}
          </h5>
          <p className="mc3-inv__sub">{g.key_companies.slice(0, 3).join(' · ')}</p>
        </div>
        <VerdictTag verdict={toVerdict(g.verdict)} confidence={toConfidence(g.confidence)} size={34} />
      </div>
      <ul className="facts mc3-inv__facts">
        <li>
          <b>{fmt.dec2.format(g.investigate_score)}</b>score
        </li>
        <li>
          <b>{fmt.pct1.format(g.anomaly_pct)}</b>anomaly pct
        </li>
        <li>
          <b>{fmt.dec2.format(g.iuu_relevance)}</b>fishing relevance
        </li>
        <li>
          <b>{g.n_companies}</b>companies
        </li>
        <li>
          <b>{g.n_persons}</b>people
        </li>
        <li>
          <b>{fmt.pct.format(g.collision_share)}</b>common-name links
        </li>
      </ul>
      <ul className="mc3-inv__reasons">
        {g.verdict_reasons.map((r) => (
          <li key={r}>{r.charAt(0).toUpperCase() + r.slice(1)}.</li>
        ))}
      </ul>
      <GroupGraph nodes={g.subgraph.nodes} links={g.subgraph.links} keyCompanies={g.key_companies} height={400} />
      <div className="fig__legend mc3-inv__legend">
        <GraphLegend />
      </div>
      {g.subgraph.truncated && (
        <p className="mc3-note">
          Showing {g.subgraph.nodes.length} of {g.subgraph.n_total_nodes} nodes: people who link two or more companies, then the best-connected companies.
        </p>
      )}
      <div className="mc3-inv__cols">
        <div>
          <h6>Evidence</h6>
          <ul>
            {g.evidence.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          {g.strong_flags.length > 0 && (
            <p className="mc3-note">Strong flags: {g.strong_flags.map((f) => FLAG_LABEL[f] ?? f).join(', ')}.</p>
          )}
        </div>
        <div>
          <h6>Most similar groups</h6>
          <ul className="mc3-sim">
            {g.similar_groups.map((s) => (
              <li key={s.id}>
                {byId.has(s.id) ? (
                  <button type="button" className="mc3-link" onClick={() => setSelected(s.id)}>
                    {s.id}
                  </button>
                ) : (
                  <span className="tnum">{s.id}</span>
                )}
                <span className="tnum">cosine {fmt.dec2.format(s.cosine)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function OverlapFigure({
  overview,
  inv,
  selected,
  setSelected,
  showTop,
  setShowTop,
}: {
  overview: GroupsOverview
  inv: Investigate
  selected: string
  setSelected: (id: string) => void
  showTop: boolean
  setShowTop: (v: boolean) => void
}) {
  const units = useMemo(() => rowsOf<UnitRow>(overview.units), [overview])
  const invById = useMemo(() => new Map(inv.groups.map((g) => [g.id, g])), [inv])
  const stats = useMemo(() => {
    const hi = units.filter((u) => u.anomaly_pct >= 0.95)
    const lo = units.filter((u) => u.anomaly_pct < 0.95)
    const share = (l: UnitRow[]) => l.filter((u) => u.iuu_relevance >= 0.5).length / Math.max(1, l.length)
    return { hi: hi.length, hiShare: share(hi), loShare: share(lo) }
  }, [units])
  const points: CPoint[] = useMemo(
    () =>
      units.map((u) => {
        const g = invById.get(u.id)
        const top = u.anomaly_pct >= 0.95
        const color = g ? VERDICT_COLOR[toVerdict(g.verdict)] : showTop && top ? 'var(--series-1)' : 'var(--series-other)'
        return {
          id: u.id,
          x: u.anomaly_pct,
          y: u.iuu_relevance,
          color,
          alpha: g ? 1 : showTop && top ? 0.8 : 0.4,
          r: g ? 4.5 : 2.4,
          emph: !!g && toVerdict(g.verdict) === 'Suspect',
          label: g && toVerdict(g.verdict) === 'Suspect' ? u.id : undefined,
          selectable: !!g,
          tip: (
            <>
              <strong>{u.id}</strong>
              {g && <span>{g.verdict} · {g.confidence} confidence</span>}
              <span className="tt-row">
                <span>Anomaly percentile</span>
                <span>{fmt.pct1.format(u.anomaly_pct)}</span>
              </span>
              <span className="tt-row">
                <span>Fishing relevance</span>
                <span>{fmt.dec2.format(u.iuu_relevance)}</span>
              </span>
            </>
          ),
        }
      }),
    [units, invById, showTop],
  )
  return (
    <Figure
      id="mc3-overlap"
      wide
      title={`Top-5% anomalies are no more fishing-related than the rest: ${fmt.pct.format(stats.hiShare)} vs ${fmt.pct.format(stats.loShare)} reach relevance 0.5`}
      subtitle="Every scored group. The 30 ranked groups are coloured by verdict; select one to open it above."
      controls={
        <button type="button" className="chip" aria-pressed={showTop} onClick={() => setShowTop(!showTop)}>
          Highlight top 5% anomaly ({stats.hi})
        </button>
      }
      legend={
        <>
          {VERDICTS.map((v) => (
            <span key={v} className="legend-item">
              <Flag code={VERDICT_FLAG[v]} size={18} decorative />
              <span className="mc3-dot" style={{ background: VERDICT_COLOR[v] }} aria-hidden />
              {v}
            </span>
          ))}
          {showTop && <LegendItem color="var(--series-1)" label="Top 5% anomaly, not ranked" shape="circle" />}
          <LegendItem color="var(--series-other)" label="Other scored group" shape="circle" />
        </>
      }
      caption={<>Source: groups_overview.json (units) and investigate.json. Dashed lines are verdict thresholds: Suspect needs anomaly ≥ 95th percentile and relevance ≥ 0.5; below 0.2 is Unlikely.</>}
      table={{
        columns: ['Group', 'Anomaly percentile', 'Fishing relevance', 'Verdict'],
        rows: [...units].sort((a, b) => b.anomaly_pct - a.anomaly_pct).map((u) => [u.id, u.anomaly_pct, u.iuu_relevance, invById.get(u.id)?.verdict ?? null]),
      }}
    >
      <CanvasPlot
        points={points}
        height={340}
        xDomain={[0, 1]}
        yDomain={[0, 1]}
        xLabel="Anomaly percentile"
        yLabel="Fishing relevance"
        xFormat={(n) => fmt.pct.format(n)}
        yFormat={(n) => fmt.dec2.format(n)}
        refLines={[
          { axis: 'x', value: 0.95, label: '95th pct' },
          { axis: 'y', value: 0.5, label: 'Suspect needs ≥ 0.5' },
          { axis: 'y', value: 0.2, label: 'Unlikely below 0.2' },
        ]}
        onSelect={(id) => {
          setSelected(id)
          reveal('mc3-investigate')
        }}
        selected={invById.has(selected) ? selected : null}
        ariaLabel="Scatter of 2,347 business groups: fishing relevance against anomaly percentile"
      />
    </Figure>
  )
}
