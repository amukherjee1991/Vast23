import { useMemo, useState } from 'react'
import * as d3 from 'd3'
import { Question } from '../../components/Layout'
import { Await, Figure, LegendItem } from '../../components/Figure'
import { BarList } from '../../charts/BarList'
import { useJson } from '../../lib/useJson'
import { fmt, plural } from '../../lib/signals'
import { CanvasPlot, type AxisType, type CPoint } from './CanvasPlot'
import { Claim, GraphLegend, GroupGraph, ReasonBars, SizeHistogram, reveal } from './parts'
import { FLAG_LABEL, rowsOf, type Anomaly, type GroupsOverview, type OwnersTop, type UnitRow } from './types'

const nf = fmt.int

const X_FEATURES: { key: keyof UnitRow; label: string; type: AxisType }[] = [
  { key: 'n_companies', label: 'Companies in the group', type: 'log' },
  { key: 'max_owners_per_company', label: 'Most owners on one company', type: 'symlog' },
  { key: 'max_companies_per_person', label: 'Most companies per uncommon-name person', type: 'symlog' },
  { key: 'n_countries', label: 'Countries', type: 'linear' },
]

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function Q1() {
  const overview = useJson<GroupsOverview>('mc3/groups_overview.json')
  const anomalies = useJson<{ anomalies: Anomaly[] }>('mc3/anomalies.json')
  const owners = useJson<OwnersTop>('mc3/owners_top.json')

  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState('BG00148')
  const [xf, setXf] = useState(0)
  const [ownerView, setOwnerView] = useState<'persons' | 'companies'>('persons')
  const [ownerFocus, setOwnerFocus] = useState<string | null>(null)

  const toggleStep = (s: number) => {
    setStep((cur) => (cur === s ? 0 : s))
    reveal('mc3-ablation')
  }
  const pickAnomaly = (id: string) => {
    setSelected(id)
    reveal('mc3-anomaly')
  }
  const focusOwner = (view: 'persons' | 'companies', key: string) => {
    const on = ownerView === view && ownerFocus === key
    setOwnerView(view)
    setOwnerFocus(on ? null : key)
    reveal('mc3-owners')
  }

  const answer = (
    <>
      <p>
        Read naively, the register holds one huge business group: a connected component of <strong>7,093 nodes</strong> (1,506 companies and 5,587 people).
        But people are identified only by name. Of the people linked to one company, 21.9% have one of the 50 most common surnames. Of those linked to five or
        more, 92.6% do. Removing those 651 people{' '}
        <Claim pressed={step === 2} onClick={() => toggleStep(2)}>
          shrinks the giant to 306 nodes
        </Claim>
        , while removing the same number of random people leaves 495 to 1,918 (10 trials). The giant is mostly a name-collision artefact.{' '}
        <Claim pressed={ownerView === 'persons' && ownerFocus === 'John Smith'} onClick={() => focusOwner('persons', 'John Smith')}>
          “John Smith”
        </Claim>
        , with 12 companies, is most likely several people. Confidence: <strong>High</strong>.
      </p>
      <p>Beneath that artefact, three kinds of anomaly hold up:</p>
      <ul>
        <li>
          <strong>Ownership fragmentation.</strong> Most companies have 0 to 2 beneficial owners, but 107 have 20 or more, and{' '}
          <Claim pressed={ownerView === 'companies' && ownerFocus === 'Vespuci Sandbar Sp Brothers'} onClick={() => focusOwner('companies', 'Vespuci Sandbar Sp Brothers')}>
            Vespuci Sandbar
          </Claim>{' '}
          has 119. 82 groups carry this flag. Confidence: <strong>High</strong>.
        </li>
        <li>
          <strong>Serial owners with uncommon names</strong>, the links least likely to be collisions.{' '}
          <Claim pressed={selected === 'BG00148'} onClick={() => pickAnomaly('BG00148')}>
            Anna Wheeler
          </Claim>{' '}
          owns 7 companies and Jason Carrillo is the contact for 6 of them. None of the 7 declares a product, and the group (BG00148) has the highest anomaly score of all 2,347 scored groups. Confidence: <strong>Medium</strong>,
          since two people can still share an uncommon name.
        </li>
        <li>
          <strong>Registry inconsistencies.</strong> 112 groups contain a distinctive company name registered in several countries, and 274 fishing-named firms declare
          an unrelated product: <em>Dutch Oyster Sagl Cruise ship</em> sells textiles.{' '}
          <Claim pressed={selected === 'BG00177'} onClick={() => pickAnomaly('BG00177')}>
            Adriatic Squid
          </Claim>{' '}
          has one record for footwear and another for seafood. Confidence: <strong>Medium</strong>.
        </li>
      </ul>
      <p>
        Each group with three or more nodes is scored by an Isolation Forest over 16 size-normalised features. Robust z-scores explain each score, and 8 rule flags
        name the pattern. Stripped words and generated names are anomalies of the data, not the businesses; Q5 covers them.
      </p>
    </>
  )

  return (
    <Question
      id="q1"
      n="Q1"
      prompt="Use visual analytics to identify anomalies in the business groups present in the knowledge graph."
      title="The biggest anomaly is an artefact. The real ones are small."
      answer={answer}
    >
      <Await state={overview} height={300}>
        {(ov) => {
          const nc = ov.giant_component.name_collision_robustness
          const tests = [
            { label: 'Drop 306 top-10 surnames', test: nc.drop_top10_surnames },
            { label: 'Drop 651 top-50 surnames', test: nc.drop_top50_surnames },
          ]
          const giantNow = step === 0 ? ov.giant_component.n_nodes : tests[step - 1].test.largest_remaining
          const second = ov.component_size_histogram.filter((d) => d.size < ov.giant_component.n_nodes).at(-1)?.size ?? 0
          const stepChips = (
            <>
              {['As found', 'Drop top-10 surnames', 'Drop top-50 surnames'].map((l, i) => (
                <button key={l} type="button" className="chip" aria-pressed={step === i} onClick={() => setStep(i)}>
                  {l}
                </button>
              ))}
            </>
          )
          return (
            <>
              <Await state={owners} height={300}>
                {(ot) => <OwnersFigure data={ot} view={ownerView} setView={(v) => (setOwnerView(v), setOwnerFocus(null))} focus={ownerFocus} />}
              </Await>
              <Await state={anomalies} height={360}>
                {(an) => (
                  <AnomalyViews
                    overview={ov}
                    anomalies={an.anomalies}
                    selected={selected}
                    setSelected={setSelected}
                    xf={xf}
                    setXf={setXf}
                  />
                )}
              </Await>
              <Figure
                id="mc3-ablation"
                title={`One group holds ${nf.format(ov.giant_component.n_nodes)} nodes; the next largest holds ${second}`}
                subtitle={
                  step === 0
                    ? 'Every connected component of companies and people. Remove common-surname people to move the giant.'
                    : `The rose lamp shows where the giant lands; removing the same number of random people leaves ${nf.format(d3.min(tests[step - 1].test.random_control_largest)!)}–${nf.format(d3.max(tests[step - 1].test.random_control_largest)!)}.`
                }
                controls={stepChips}
                legend={
                  <>
                    <LegendItem color="var(--series-1)" label="Components of that size" shape="circle" />
                    <LegendItem color="var(--series-3)" label={step === 0 ? 'Largest component' : 'Largest left after the removal'} shape="circle" />
                  </>
                }
                caption={
                  <>
                    Source: groups_overview.json, component_size_histogram and giant_component.name_collision_robustness. 3,540 companies stand alone and 7,785 groups
                    have two nodes. Only people linked to two or more companies are removed.
                  </>
                }
                table={{
                  columns: ['Scenario', 'People removed', 'Largest remaining', 'Random control min', 'Random control max'],
                  rows: [
                    ['As found', 0, ov.giant_component.n_nodes, null, null],
                    ...tests.map((t) => [t.label, t.test.persons_removed, t.test.largest_remaining, d3.min(t.test.random_control_largest)!, d3.max(t.test.random_control_largest)!]),
                  ],
                }}
              >
                <SizeHistogram
                  hist={ov.component_size_histogram}
                  giantNow={giantNow}
                  giantLabel={step === 0 ? `BG00001 · ${nf.format(giantNow)} nodes` : `After removal · ${nf.format(giantNow)}`}
                />
              </Figure>
            </>
          )
        }}
      </Await>
    </Question>
  )
}

function AnomalyViews({
  overview,
  anomalies,
  selected,
  setSelected,
  xf,
  setXf,
}: {
  overview: GroupsOverview
  anomalies: Anomaly[]
  selected: string
  setSelected: (id: string) => void
  xf: number
  setXf: (i: number) => void
}) {
  const units = useMemo(() => rowsOf<UnitRow>(overview.units), [overview])
  const top = useMemo(() => new Map(anomalies.map((a) => [a.id, a])), [anomalies])
  const feat = X_FEATURES[xf]
  const points: CPoint[] = useMemo(
    () =>
      units.map((u) => {
        const a = top.get(u.id)
        return {
          id: u.id,
          x: Number(u[feat.key]) || 0,
          y: u.anomaly_pct,
          color: a ? 'var(--series-1)' : 'var(--series-other)',
          alpha: a ? 1 : 0.7,
          r: a ? 4 : 2.5,
          emph: a ? a.rank <= 3 : false,
          label: a && a.rank <= 3 ? u.id : undefined,
          selectable: !!a,
          tip: (
            <>
              <strong>{u.id}</strong>
              <span className="tt-row">
                <span>Anomaly percentile</span>
                <span>{fmt.pct1.format(u.anomaly_pct)}</span>
              </span>
              <span className="tt-row">
                <span>{feat.label}</span>
                <span>{nf.format(Number(u[feat.key]) || 0)}</span>
              </span>
              <span className="tt-row">
                <span>Companies · people</span>
                <span>
                  {u.n_companies} · {u.n_persons}
                </span>
              </span>
              {a ? <span>Top-30 anomaly. Select to see its evidence.</span> : null}
            </>
          ),
        }
      }),
    [units, top, feat],
  )
  const sel = top.get(selected) ?? anomalies[0]
  const xMax = d3.max(points, (p) => p.x) ?? 1

  return (
    <>
      <Figure
        title="The 30 most anomalous groups are small; size alone does not make a group odd"
        subtitle="Each dot is one of 2,347 scored groups. Select a teal dot to open its evidence."
        controls={
          <>
            {X_FEATURES.map((f, i) => (
              <button key={f.key} type="button" className="chip" aria-pressed={xf === i} onClick={() => setXf(i)}>
                {f.label}
              </button>
            ))}
          </>
        }
        legend={
          <>
            <LegendItem color="var(--series-other)" label="Scored group" shape="circle" />
            <LegendItem color="var(--series-1)" label="Top-30 anomaly, explained" shape="circle" />
          </>
        }
        caption={<>Source: groups_overview.json (units) and anomalies.json. Anomaly percentile ranks the Isolation Forest score over all scored groups.</>}
        table={{
          columns: ['Group', 'Anomaly percentile', 'Companies', 'People', 'Most owners on one company', 'Countries', 'Flags'],
          rows: [...units]
            .sort((a, b) => b.anomaly_pct - a.anomaly_pct)
            .map((u) => [u.id, u.anomaly_pct, u.n_companies, u.n_persons, u.max_owners_per_company, u.n_countries, u.flags.map((f) => FLAG_LABEL[f] ?? f).join(', ')]),
        }}
      >
        <CanvasPlot
          points={points}
          height={340}
          xType={feat.type}
          xDomain={[feat.type === 'log' ? 1 : 0, xMax]}
          yDomain={[0, 1]}
          xLabel={feat.label}
          yLabel="Anomaly percentile"
          yFormat={(n) => fmt.pct.format(n)}
          xFormat={d3.format('~s')}
          onSelect={setSelected}
          selected={sel.id}
          ariaLabel={`Scatter of 2,347 business groups: anomaly percentile against ${feat.label.toLowerCase()}`}
        />
      </Figure>
      <Figure
        id="mc3-anomaly"
        title={`${sel.id}: ${cap(plural(sel.flags[0]?.text ?? 'unusual feature mix'))}`}
        subtitle={
          <>
            Rank {sel.rank} of 30 · anomaly percentile {fmt.pct1.format(sel.anomaly_pct)} · {String(sel.features.n_companies)} companies,{' '}
            {String(sel.features.n_persons)} people
            {sel.truncated ? ' · evidence trimmed to 80 nodes' : ''}
          </>
        }
        controls={
          <label className="mc3-select">
            <span>Group</span>
            <select className="select" value={sel.id} onChange={(e) => setSelected(e.target.value)}>
              {anomalies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.rank}. {a.id}
                </option>
              ))}
            </select>
          </label>
        }
        legend={<GraphLegend />}
        caption={<>Source: anomalies.json. Reasons are robust z-scores (median and MAD over scored groups); only |z| ≥ 2 is listed.</>}
        table={{
          columns: ['Node', 'Kind', 'Countries / companies', 'Product / roles'],
          rows: sel.nodes.map((n) =>
            n.kind === 'company'
              ? [n.label, 'Company', n.countries.join(', ') || 'unregistered', n.product]
              : [n.label, 'Person', `${n.n_companies} companies`, `owner ${n.owner_of}, contact ${n.contact_of}${n.common_surname ? ', common surname' : ''}`],
          ),
        }}
      >
        <div className="mc3-detail">
          <ul className="mc3-flags" aria-label="Rule flags">
            {sel.flags.map((f) => (
              <li key={f.flag} className="mc3-flag">
                <strong>{FLAG_LABEL[f.flag] ?? f.flag}</strong> {plural(f.text)}
              </li>
            ))}
          </ul>
          <ReasonBars reasons={sel.reasons} />
          <GroupGraph nodes={sel.nodes} links={sel.links} height={300} />
        </div>
      </Figure>
    </>
  )
}

function OwnersFigure({
  data,
  view,
  setView,
  focus,
}: {
  data: OwnersTop
  view: 'persons' | 'companies'
  setView: (v: 'persons' | 'companies') => void
  focus: string | null
}) {
  const persons = data.persons.filter((p) => p.list === 'top_by_companies').slice(0, 14)
  const companies = data.companies_most_owners.slice(0, 14)
  const commonShare = persons.filter((p) => p.common_surname).length
  return (
    <Figure
      id="mc3-owners"
      title={
        view === 'persons'
          ? `${commonShare} of the ${persons.length} people with the most companies have a top-50 surname`
          : `107 companies have 20 or more owners; ${companies[0].company} has ${companies[0].n_owners}`
      }
      controls={
        <>
          <button type="button" className="chip" aria-pressed={view === 'persons'} onClick={() => setView('persons')}>
            Companies per person
          </button>
          <button type="button" className="chip" aria-pressed={view === 'companies'} onClick={() => setView('companies')}>
            Owners per company
          </button>
        </>
      }
      legend={
        view === 'persons' ? (
          <>
            <LegendItem color="var(--series-other)" label="Common surname (collision-prone)" />
            <LegendItem color="var(--series-1)" label="Uncommon surname" />
          </>
        ) : (
          <LegendItem color="var(--series-1)" label="Beneficial owners" />
        )
      }
      caption={<>Source: owners_top.json (persons, companies_most_owners).</>}
      table={
        view === 'persons'
          ? {
              columns: ['Person', 'Companies', 'Owner of', 'Contact for', 'Surname frequency', 'Collision risk'],
              rows: data.persons.map((p) => [p.person, p.n_companies, p.owner_of, p.contact_of, p.surname_frequency, p.name_collision_risk]),
            }
          : {
              columns: ['Company', 'Owners', 'Contacts', 'Countries', 'Product', 'Group'],
              rows: data.companies_most_owners.map((c) => [c.company, c.n_owners, c.n_contacts, c.countries.join(', '), c.product, c.group]),
            }
      }
    >
      {view === 'persons' ? (
        <BarList
          bars={persons.map((p) => ({
            key: p.person,
            label: p.person,
            value: p.n_companies,
            color: p.common_surname ? 'var(--series-other)' : 'var(--series-1)',
            highlight: p.person === focus,
            note: `${p.surname_frequency} people share the surname · collision risk ${p.name_collision_risk.toLowerCase()}`,
          }))}
          selected={focus}
          labelWidth={170}
          rowHeight={24}
        />
      ) : (
        <BarList
          bars={companies.map((c) => ({
            key: c.company,
            label: c.company,
            value: c.n_owners,
            highlight: c.company === focus,
            note: `${c.product.slice(0, 60)} · ${c.countries.join(', ')}`,
          }))}
          selected={focus}
          labelWidth={210}
          rowHeight={24}
        />
      )}
    </Figure>
  )
}
