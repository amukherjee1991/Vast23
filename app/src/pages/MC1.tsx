import * as d3 from 'd3'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChallengeBand, ChallengePage, Question, type HalyardStop } from '../components/Layout'
import { Await, Figure } from '../components/Figure'
import { HeroHoist } from '../components/HeroHoist'
import { Flag } from '../components/Flag'
import { BarList, EntityLegend, NetworkGraph, type GLink, type GNode } from '../charts'
import { useWidth } from '../charts/useSize'
import { VERDICT_COLOR, VERDICT_FLAG, toConfidence, toVerdict } from '../lib/signals'
import {
  EDGE_COLOR,
  EDGE_LABEL,
  FISHEYE,
  SHORT,
  SUSPECT_COLOR,
  SUSPECT_ORDER,
  between,
  FAMILY_WEAK_DASH,
  WEAK_DASH,
  edgeColor,
  edgeDash,
  label,
  useMC1,
  type MC1,
  type NodeRec,
} from './mc1/data'
import {
  CLASS_SEGMENTS,
  ChainStrip,
  ContribBar,
  DistanceNull,
  Dumbbells,
  FEATURE_GROUPS,
  LineSwatch,
  NullStrip,
  PercentileDots,
  RubricGrid,
  RubricLegend,
  Swatch,
  TypeClassBars,
  WeightHist,
  type ChainEdge,
  type ChainHop,
} from './mc1/charts'
import { Bridge } from '../components/Story'
import { MC1Story, OpenerSky } from './mc1/Story'
import { useSky } from './mc1/sky'
import './mc1/mc1.css'

const STOPS: HalyardStop[] = [
  { id: 'verdicts', flag: 'L', label: 'Verdicts' },
  { id: 'story', flag: 'S', label: 'The weak layer' },
  { id: 'q1', flag: 'C', label: 'Q1 Context' },
  { id: 'q2', flag: 'D', label: 'Q2 Compare' },
  { id: 'q3', flag: 'T', label: 'Q3 Who else' },
  { id: 'q4', flag: 'R', label: 'Q4 Reflection' },
]

const REASON: Record<string, string> = {
  '#8327': 'Owned through one of the weakest edges in the graph (0.12); heads an ownership chain to two other suspects.',
  '#979893388': 'A hub at the 99.8th percentile that owns Oceanfront Oasis through a strong 0.84 edge.',
  'Mar de la Vida OJSC': 'Mostly people and memberships, tied to the layer only by a weak FishEye tag (0.46).',
  'Oceanfront Oasis Inc Carriers': 'Four incoming edges: a weak FishEye tag (0.45) and ownership by 979893388.',
}

/* ───────── small helpers ───────── */

function Claim({ on, onClick, controls, children }: { on: boolean; onClick: () => void; controls: string; children: ReactNode }) {
  return (
    <button type="button" className="claim" aria-pressed={on} aria-controls={controls} onClick={onClick}>
      {children}
    </button>
  )
}

const ClaimCtx = createContext<{ claim: string | null; press: (id: string) => void }>({ claim: null, press: () => {} })

/** A claim bound to the question's evidence state (provided by ClaimCtx). */
function C({ id, to, children }: { id: string; to: string; children: ReactNode }) {
  const { claim, press } = useContext(ClaimCtx)
  return (
    <Claim on={claim === id} onClick={() => press(id)} controls={to}>
      {children}
    </Claim>
  )
}

function useMedia(q: string) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [q])
  return m
}

/** Shape type for a node: raw type, with untyped corporate names drawn as companies. */
const shapeType = (r: NodeRec | undefined) => r?.type ?? (r?.cls === 'company_like' ? 'company' : r?.cls === 'junk' ? 'other' : null)

const suspectVerdict = (d: MC1, k: string) => d.suspects.suspects.find((s) => s.k === k)

function nodeTip(d: MC1, k: string): ReactNode {
  const r = d.node.get(k)
  const s = suspectVerdict(d, k)
  return (
    <>
      <strong>{label(d, k)}</strong>
      <span className="tt-row">
        <span>Type</span>
        <span>{r?.type ?? 'none'}</span>
      </span>
      <span className="tt-row">
        <span>Neighbours</span>
        <span>{r?.deg ?? '—'}</span>
      </span>
      <span className="tt-row">
        <span>Low-weight rows</span>
        <span>{r?.low ?? '—'}</span>
      </span>
      {s && <span>Suspect · {s.verdict}</span>}
    </>
  )
}

function gnode(d: MC1, k: string, extra?: Partial<GNode>): GNode {
  const s = suspectVerdict(d, k)
  return {
    id: k,
    label: label(d, k),
    type: shapeType(d.node.get(k)),
    emph: !!s || k === FISHEYE,
    ring: s ? VERDICT_COLOR[toVerdict(s.verdict)] : k === FISHEYE ? 'var(--ink)' : undefined,
    tip: nodeTip(d, k),
    ...extra,
  }
}

/** Edge-type key. `weak` adds the weight key; `allWeak` draws every type in
    its weak dash, for figures where every edge weighs under 0.8. */
function EdgeLegend({ weak = true, allWeak = false, familyWeak = weak }: { weak?: boolean; allWeak?: boolean; familyWeak?: boolean }) {
  return (
    <>
      {Object.keys(EDGE_COLOR).map((t) => (
        <LineSwatch key={t} color={EDGE_COLOR[t]} dash={edgeDash(t, allWeak)}>
          {EDGE_LABEL[t]}
        </LineSwatch>
      ))}
      {weak && (
        <LineSwatch color="var(--ink-3)" dash={WEAK_DASH}>
          Weight below 0.8
        </LineSwatch>
      )}
      {familyWeak && (
        <LineSwatch color="var(--ink)" dash={FAMILY_WEAK_DASH}>
          Family below 0.8
        </LineSwatch>
      )}
    </>
  )
}

const ENTITY_TYPES = ['company', 'organization', 'person', 'vessel', 'location', 'other']

/* ───────── page ───────── */

export default function MC1() {
  const state = useMC1()
  const sky = useSky(state.status === 'ready' ? state.data.lowconf.links : null)
  const [egoSuspect, setEgoSuspect] = useState<string>('#8327')
  const [q1Claim, setQ1Claim] = useState<string | null>(null)

  const openSuspect = (k: string) => {
    setEgoSuspect(k)
    setQ1Claim(null)
    document.getElementById('fig-ego')?.scrollIntoView({ block: 'start' })
  }

  return (
    <main className="mc1">
      <div id="verdicts">
        <ChallengeBand
          pennant="P1"
          tone="red"
          mc="Mini-challenge 1"
          title="A hidden layer of weak links ties the tips together"
          kicker="Eighty-eight faint threads in FishEye’s graph, and the suspects caught in them"
          stage={state.status === 'ready' && sky.status === 'ready' ? <OpenerSky sky={sky.data} d={state.data} /> : undefined}
          lede={
            <>
              Of 11,069 relations in FishEye’s knowledge graph, 88 carry a weight below 0.8. They form one 79-node component that random edges never produce, two-thirds of
              it ownership. Three of the four suspects sit inside it and the fourth is one hop away.
            </>
          }
          aside={
            <Await state={state} height={320}>
              {(d) => <SuspectHoist d={d} onOpen={openSuspect} />}
            </Await>
          }
        />
      </div>
      <ChallengePage stops={STOPS}>
        {state.status === 'ready' && sky.status === 'ready' ? (
          <MC1Story sky={sky.data} d={state.data} onSuspect={openSuspect} />
        ) : (
          <div id="story" className="mc1-story mc1-story--wait" aria-busy="true" />
        )}
        <Q1 state={state} suspect={egoSuspect} setSuspect={setEgoSuspect} claim={q1Claim} setClaim={setQ1Claim} />
        <Q2 state={state} />
        <Q3 state={state} />
        <Q4 state={state} />
      </ChallengePage>
      <Bridge
        takeaway="Three of the four suspects sit in a 79-node web of the graph’s weakest links, a structure random edges never form."
        lead="That web is a lead, not a verdict. Next, the trade records: who ships with whom, month by month, and which of the AI’s suggested links hold up."
        next="/mc2"
      />
    </main>
  )
}

function SuspectHoist({ d, onOpen }: { d: MC1; onOpen: (k: string) => void }) {
  return (
    <HeroHoist
      label="Verdicts on the four suspects"
      onSelect={onOpen}
      items={SUSPECT_ORDER.map((k) => {
        const s = suspectVerdict(d, k)!
        return {
          key: k,
          name: label(d, k),
          verdict: toVerdict(s.verdict),
          confidence: toConfidence(s.confidence),
          reason: REASON[k],
          action: `${s.rubric.points} rubric points, open its network`,
        }
      })}
    />
  )
}

/* ═════════ Q1 ═════════ */

type Q1ClaimSpec = { ego?: string; hops?: 1 | 2; path?: (d: MC1) => string[]; floor?: boolean }
const Q1_CLAIMS: Record<string, Q1ClaimSpec> = {
  floor: { floor: true },
  seabreeze: { ego: '#8327', hops: 2, path: () => [FISHEYE, 'Seabreeze Foods Ltd. Corporation United', '#8327'] },
  holding: { ego: '#8327', hops: 2, path: () => ['#8327', '#40213337', 'Sea Harvest'] },
  illegal: {
    ego: '#8327',
    hops: 1,
    path: (d) => ['#8327', suspectVerdict(d, '#8327')!.neighbors_1hop.find((n) => /illegal/i.test(n.k))?.k ?? ''],
  },
  oceanfront: { ego: '#979893388', hops: 1, path: () => ['#979893388', 'Oceanfront Oasis Inc Carriers'] },
  marfish: { ego: 'Mar de la Vida OJSC', hops: 1, path: () => [FISHEYE, 'Mar de la Vida OJSC'] },
  ocean4: {
    ego: 'Oceanfront Oasis Inc Carriers',
    hops: 1,
    path: (d) => suspectVerdict(d, 'Oceanfront Oasis Inc Carriers')!.neighbors_1hop.flatMap((n) => [n.k, 'Oceanfront Oasis Inc Carriers']),
  },
}

function Q1({
  state,
  suspect,
  setSuspect,
  claim,
  setClaim,
}: {
  state: ReturnType<typeof useMC1>
  suspect: string
  setSuspect: (k: string) => void
  claim: string | null
  setClaim: (c: string | null) => void
}) {
  const [hops, setHops] = useState<1 | 2>(1)
  const spec = claim ? Q1_CLAIMS[claim] : null
  const press = (id: string) => {
    if (claim === id) return setClaim(null)
    const c = Q1_CLAIMS[id]
    if (c.ego) setSuspect(c.ego)
    if (c.hops) setHops(c.hops)
    setClaim(id)
  }
  return (
    <ClaimCtx.Provider value={{ claim, press }}>
    <Question
      id="q1"
      n="Q1"
      prompt="Use visual analytics to explore the context around each suspect entity and assess whether it is connected to illegal fishing; state your confidence."
      title="Three suspects sit in a layer of weak links that random edges never form"
      answer={
        <>
          <p>
            The story above is the context all four verdicts share. Its evidence is the weight distribution:{' '}
            <C id="floor" to="fig-weight">
              weights stop at 0.8
            </C>
            , and the 88 rows below the floor join into one component that random edges never produce. Two-thirds of the layer is ownership, against 18% of the whole
            graph (p&nbsp;=&nbsp;2e-23). Each suspect in turn:
          </p>
          <h3>8327: Suspect, low confidence</h3>
          <p>
            A nameless organization with 13 neighbours.{' '}
            Seabreeze Foods Ltd. Corporation United{' '}<C id="seabreeze" to="fig-ego">owns it through a 0.12 edge</C>
            , one of the ten weakest in the graph, and FishEye tags Seabreeze at 0.13.{' '}
            <C id="holding" to="fig-ego">8327 owns 40213337</C>
            , which has six low-weight ownership rows and owns Sea Harvest, Sea Products and 58623386. It also has a 0.82 membership edge to{' '}
            <C id="illegal" to="fig-ego">
              the garbled fragment “Illegal
            </C>
            , and a directed ownership chain runs from it to two other suspects (Q2). It has the strongest structural signature of the four (5.0 rubric points), but almost
            every signal rests on edges below 0.8.
          </p>
          <h3>979893388: Suspect, medium confidence</h3>
          <p>
            A nameless hub: 177 neighbours and betweenness 0.096, both at the 99.8th percentile. It sits in a dense core of 10 hubs (density 0.84), owns 10 entities, is
            owned by 12, and its upstream ownership tree reaches 307 entities within six hops.{' '}
            It{' '}<C id="oceanfront" to="fig-ego">owns Oceanfront Oasis</C>{' '}
            through a strong 0.84 edge, and two hops out lie the fragments “ipoa-iuu” and “poached”. It is outside the layer but borders two of its hubs, Mar del Oeste Pic and 903311212: a holding
            layer, or a much-mentioned entity the extractor over-linked.
          </p>
          <h3>Mar de la Vida OJSC: Possible, low confidence</h3>
          <p>
            Untyped, with 15 neighbours, mostly memberships, 6 of them people.{' '}
            Its only low-weight edge is{' '}<C id="marfish" to="fig-ego">a FishEye membership at 0.46</C>
            . It owns one person, Jon White, and no ownership chain leaves it. Betweenness is at the 95th percentile, and two hops out it reaches “Officer Pleads Guilty”.
            The FishEye tag is the main evidence, and it is weak.
          </p>
          <h3>Oceanfront Oasis Inc Carriers: Possible, low confidence</h3>
          <p>
            <C id="ocean4" to="fig-ego">
              Four edges, all incoming
            </C>
            : a FishEye membership (0.45), ownership by 979893388 (0.84), and two family edges from nameless organizations that are probably extraction noise. A thin
            subsidiary of a suspect.
          </p>
          <p>
            <strong>Caveat.</strong> The data notes define neither weight nor ownership direction. Reading weight as extraction confidence is an assumption, so every
            verdict records the weight of the edges it rests on.
          </p>
        </>
      }
    >
      <Await state={state} height={480}>
        {(d) => (
          <>
            <EgoFigure
              d={d}
              suspect={suspect}
              setSuspect={(k) => (setSuspect(k), setClaim(null))}
              hops={hops}
              setHops={(h) => (setHops(h), setClaim(null))}
              path={spec?.path ? spec.path(d) : null}
            />
            <WeightFigure d={d} focus={!!spec?.floor} />
          </>
        )}
      </Await>
    </Question>
    </ClaimCtx.Provider>
  )
}

function EgoFigure({
  d,
  suspect,
  setSuspect,
  hops,
  setHops,
  path,
}: {
  d: MC1
  suspect: string
  setSuspect: (k: string) => void
  hops: 1 | 2
  setHops: (h: 1 | 2) => void
  path: string[] | null
}) {
  const narrow = useMedia('(max-width: 720px)')
  const ego = d.egos.egos.find((e) => e.suspect === suspect)!
  const s = suspectVerdict(d, suspect)!
  const pathKey = path?.join('|') ?? ''
  const { nodes, links, shown, total2 } = useMemo(() => {
    const keep = new Set(pathKey ? pathKey.split('|') : [])
    let members = ego.members.filter((m) => m.d <= hops)
    const total2 = ego.members.filter((m) => m.d === 2).length
    if (hops === 2) {
      // Hub control: keep the most connected 2-hop nodes so the hub's ball stays legible.
      const one = members.filter((m) => m.d <= 1)
      const set1 = new Set(one.map((m) => m.k))
      const score = new Map<string, number>()
      ego.links.forEach((l) => {
        for (const [a, b] of [
          [l.s, l.t],
          [l.t, l.s],
        ])
          if (set1.has(a) && !set1.has(b)) score.set(b, (score.get(b) ?? 0) + 1 + (l.wmin < 0.8 ? 5 : 0))
      })
      const cap = Math.max(40, 230 - one.length)
      const two = members
        .filter((m) => m.d === 2)
        .sort((a, b) => (keep.has(b.k) ? 1e6 : 0) + (score.get(b.k) ?? 0) - ((keep.has(a.k) ? 1e6 : 0) + (score.get(a.k) ?? 0)))
        .slice(0, cap)
      members = [...one, ...two]
    }
    const set = new Set(members.map((m) => m.k))
    const byPair = new Map<string, GLink>()
    ego.links.forEach((l) => {
      if (!set.has(l.s) || !set.has(l.t)) return
      const key = l.s < l.t ? `${l.s}\u0000${l.t}` : `${l.t}\u0000${l.s}`
      const prev = byPair.get(key)
      if (!prev || (prev.weight ?? 1) > l.wmin) byPair.set(key, { source: l.s, target: l.t, type: l.type, weight: l.wmin, dashed: l.wmin < 0.8 })
    })
    const nodes = members.map((m) => gnode(d, m.k, m.k === suspect ? { size: 10 } : m.d === 2 ? { size: 3.5 } : {}))
    return { nodes, links: [...byPair.values()], shown: members.length, total2 }
  }, [d, ego, hops, suspect, pathKey])

  return (
    <Figure
      id="fig-ego"
      wide
      title={`${label(d, suspect)}: ${s.verdict}, ${s.confidence.toLowerCase()} confidence, ${s.rubric.points} rubric points`}
      subtitle={
        <>
          {ego.hops_counts.undirected[0]} neighbours at one hop, {ego.hops_counts.undirected[1].toLocaleString('en-US')} at two.{' '}
          {hops === 2 && shown < ego.hops_counts.undirected[0] + total2 + 1
            ? `Showing the ${shown - ego.hops_counts.undirected[0] - 1} best-connected of ${total2} kept two-hop nodes.`
            : 'Hover a node to isolate its neighbours; drag to pan.'}
        </>
      }
      controls={
        <>
          <div className="seg" role="group" aria-label="Suspect">
            {SUSPECT_ORDER.map((k) => (
              <button key={k} type="button" className="chip" aria-pressed={k === suspect} onClick={() => setSuspect(k)}>
                <Flag code={VERDICT_FLAG[toVerdict(suspectVerdict(d, k)!.verdict)]} size={16} decorative />
                {SHORT[k]}
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Neighbourhood depth">
            {([1, 2] as const).map((h) => (
              <button key={h} type="button" className="chip" aria-pressed={hops === h} onClick={() => setHops(h)}>
                {h} hop{h > 1 ? 's' : ''}
              </button>
            ))}
          </div>
        </>
      }
      legend={
        <>
          <EntityLegend types={ENTITY_TYPES} />
          <EdgeLegend />
        </>
      }
      caption={
        <>
          Source: <code>egos.json</code> (members and relations among them; duplicate rows collapsed to the weakest). Ring colour is the suspect’s verdict; FishEye is
          ringed in ink. Untyped entities with a corporate name are drawn as companies.
        </>
      }
      table={{
        columns: ['Entity', 'Hop', 'Type', 'Class', 'Relation to suspect'],
        rows: ego.members
          .filter((m) => m.d <= hops)
          .map((m) => [label(d, m.k), m.d, d.node.get(m.k)?.type ?? null, d.node.get(m.k)?.cls ?? null, m.role]),
      }}
    >
      <NetworkGraph nodes={nodes} links={links} height={nodes.length <= 40 ? (narrow ? 340 : 400) : narrow ? 440 : 580} linkColor={edgeColor} linkDash={edgeDash} path={path} />
    </Figure>
  )
}

function WeightFigure({ d, focus }: { d: MC1; focus: boolean }) {
  const lc = d.lowconf
  const h = lc.weight_hist
  return (
    <Figure
      id="fig-weight"
      title="Weights stop at 0.8, and the few rows below it cluster in a way chance never does"
      legend={
        <>
          <Swatch color="var(--ink)">Below 0.8: the low-weight layer</Swatch>
          <Swatch color="var(--series-other)">0.8 and above</Swatch>
        </>
      }
      caption={
        <>
          Source: <code>lowconf.json</code> (weight_hist, null_lcc_nodes). Lower panel: largest connected component of {lc.null_lcc_nodes.draws.toLocaleString('en-US')} random
          draws of {lc.n_edges} edges (dark band = 95% of draws, light = up to the maximum) against the observed {lc.n_nodes}.
        </>
      }
      table={{
        columns: ['Weight from', 'to', 'Edge rows'],
        rows: h.all.map((c, i) => [h.bins[i], h.bins[i + 1], c]),
      }}
    >
      <WeightHist bins={h.bins} counts={h.all} threshold={lc.threshold} focus={focus ? 'low' : null} />
      <p className="mc1-panel-label">Largest component formed by {lc.n_edges} edges (nodes)</p>
      <NullStrip domain={[0, 80]} mean={lc.null_lcc_nodes.mean} p95={lc.null_lcc_nodes.p95} max={lc.null_lcc_nodes.max} observed={lc.n_nodes} unit="nodes" />
    </Figure>
  )
}

/* ═════════ Q2 ═════════ */

const METRICS = [
  { id: 'deg', label: 'Neighbours' },
  { id: 'btw', label: 'Betweenness' },
  { id: 'pr', label: 'PageRank' },
  { id: 'own_out', label: 'Owns' },
  { id: 'own_in', label: 'Owned by' },
  { id: 'low', label: 'Weak rows' },
  { id: 'max_par', label: 'Repeat edges' },
]

const Q2_CLAIMS: Record<string, { focus?: string[]; chain?: 'directed' | 'shortest'; edge?: number; dist?: string }> = {
  tagged: { focus: ['Mar de la Vida OJSC', 'Oceanfront Oasis Inc Carriers'] },
  shells: { focus: ['#8327', '#979893388'] },
  chain: { chain: 'directed' },
  amanda: { chain: 'directed', edge: 2 },
  short: { chain: 'shortest', edge: 1 },
  obs: { dist: 'obs' },
  matched: { dist: 'matched' },
  weak: { focus: ['#8327'] },
}

function Q2({ state }: { state: ReturnType<typeof useMC1> }) {
  const [claim, setClaim] = useState<string | null>(null)
  const [chainMode, setChainMode] = useState<'directed' | 'shortest'>('directed')
  const spec = claim ? Q2_CLAIMS[claim] : null
  const press = (id: string) => {
    if (claim === id) return setClaim(null)
    const c = Q2_CLAIMS[id]
    if (c.chain) setChainMode(c.chain)
    setClaim(id)
  }
  return (
    <ClaimCtx.Provider value={{ claim, press }}>
    <Question
      id="q2"
      n="Q2"
      prompt="Compare and contrast the suspects; which patterns might indicate illegal activity, and how certain are you?"
      title="Two pairs: small firms FishEye tagged, and nameless ownership intermediaries"
      answer={
        <>
          <p>
            <C id="tagged" to="fig-pct">
              Mar de la Vida and Oceanfront Oasis
            </C>{' '}
            are named, untyped and small (15 and 4 neighbours). Each touches the layer only through one weak FishEye membership (0.46 and 0.45), and FishEye is the only
            neighbour they share.{' '}
            <C id="shells" to="fig-pct">
              8327 and 979893388
            </C>{' '}
            are nameless numeric organizations that both own and are owned (3 and 2; 10 and 12), and only they fire the rubric’s shell marker. They differ in scale:
            979893388 is at the 99.8th percentile of degree, 8327 at the 91st.
          </p>
          <p>
            <strong>Patterns that point to illegal activity.</strong>
          </p>
          <ul>
            <li>Ownership dominates the weak layer (the loops in the story above), and it holds a five-hop chain.</li>
            <li>
              One directed ownership chain{' '}<C id="chain" to="fig-chain">runs through three suspects</C>
              , from 8327 to 979893388 to Oceanfront Oasis. Mar de la Vida has no ownership path to any of them.
            </li>
            <li>FishEye tags two suspects directly, 8327 through its owner and 979893388 through a neighbour.</li>
            <li>34 of the layer’s 79 nodes are nameless numeric organizations.</li>
          </ul>
          <p>
            <strong>What stays uncertain.</strong>
          </p>
          <ul>
            <li>
              The suspects sit{' '}<C id="obs" to="fig-dist">2.17 hops apart</C>{' '}
              on average, against 3.84 for random pairs, but{' '}
              <C id="matched" to="fig-dist">8% of degree-matched sets</C>{' '}
              are as close. Their closeness is mostly what their degrees predict.
            </li>
            <li>
              Louvain puts them in three communities (modularity 0.69), and the split is unstable: across five seeds only 0.33–0.63 of each suspect’s community-mates stay
              with it.
            </li>
            <li>
              Ownership direction is unreliable.{' '}
              Read literally, the chain has the company Sea Harvest{' '}<C id="amanda" to="fig-chain">owning the person Amanda Mckenzie</C>
              . Undirected,{' '}
              8327 is{' '}<C id="short" to="fig-chain">three hops from 979893388</C>{' '}
              through a 0.26 edge.
            </li>
            <li>
              979893388’s verdict rests on edges above 0.8 and on structure;{' '}
              8327’s rests on{' '}<C id="weak" to="fig-rubric">edges from 0.12 to 0.32</C>
              .
            </li>
          </ul>
        </>
      }
    >
      <Await state={state} height={420}>
        {(d) => (
          <>
            <PercentileFigure d={d} focus={spec?.focus ?? null} />
            <RubricFigure d={d} focus={spec?.focus ?? null} />
            <ChainFigure d={d} mode={chainMode} setMode={(m) => (setChainMode(m), setClaim(null))} focusEdge={spec?.edge ?? null} />
            <DistanceFigure d={d} focus={spec?.dist ?? null} />
          </>
        )}
      </Await>
    </Question>
    </ClaimCtx.Provider>
  )
}

function SuspectLegend() {
  return (
    <>
      {SUSPECT_ORDER.map((k) => (
        <span key={k} className="legend-item">
          <span className="legend-swatch legend-swatch--circle" style={{ background: SUSPECT_COLOR[k] }} aria-hidden />
          {SHORT[k]}
        </span>
      ))}
    </>
  )
}

function PercentileFigure({ d, focus }: { d: MC1; focus: string[] | null }) {
  const sus = SUSPECT_ORDER.map((k) => suspectVerdict(d, k)!)
  return (
    <Figure
      id="fig-pct"
      title="The two nameless suspects rank high on ownership; the tagged pair rank high only on weak rows"
      subtitle="Percentile among all 3,428 entities (100 = most)."
      legend={<SuspectLegend />}
      caption={
        <>
          Source: <code>suspects.json</code> → <code>percentiles</code>.
        </>
      }
      table={{
        columns: ['Measure', ...sus.map((s) => SHORT[s.k])],
        rows: METRICS.map((m) => [m.label, ...sus.map((s) => Math.round((s.percentiles[m.id] ?? 0) * 1000) / 10)]),
      }}
    >
      <PercentileDots suspects={sus} metrics={METRICS} focus={focus} />
    </Figure>
  )
}

function RubricFigure({ d, focus }: { d: MC1; focus: string[] | null }) {
  const sus = SUSPECT_ORDER.map((k) => suspectVerdict(d, k)!)
  const sig = d.suspects.rubric.signals
  return (
    <Figure
      id="fig-rubric"
      title="8327 scores highest, but four of its five full points rest on weak edges"
      subtitle="Seven published signals; 4+ points is Suspect, 2.5–3.5 Possible."
      legend={<RubricLegend />}
      caption={
        <>
          Source: <code>suspects.json</code> → <code>rubric</code>, <code>suspects[].rubric.signals</code> (basis_w = weakest edge a signal rests on).
        </>
      }
      table={{
        columns: ['Suspect', ...sig.map((s) => s.id), 'Points', 'Verdict', 'Confidence'],
        rows: sus.map((s) => [
          SHORT[s.k],
          ...sig.map((g) => s.rubric.signals.find((x) => x.id === g.id)?.points ?? 0),
          s.rubric.points,
          s.verdict,
          s.confidence,
        ]),
      }}
    >
      <RubricGrid rows={sus.map((s) => ({ k: s.k, verdict: s.verdict, points: s.rubric.points, signals: s.rubric.signals }))} signals={sig} focus={focus} />
    </Figure>
  )
}

function ChainFigure({
  d,
  mode,
  setMode,
  focusEdge,
}: {
  d: MC1
  mode: 'directed' | 'shortest'
  setMode: (m: 'directed' | 'shortest') => void
  focusEdge: number | null
}) {
  const s8327 = suspectVerdict(d, '#8327')!
  const to = s8327.ownership_chains.to_suspects.find((t) => t.to === 'Oceanfront Oasis Inc Carriers')!
  const chain = (mode === 'directed' ? to.directed : to.undirected)!
  const hops: ChainHop[] = chain.path.map((k) => ({
    k,
    label: label(d, k),
    type: shapeType(d.node.get(k)),
    verdict: suspectVerdict(d, k)?.verdict,
  }))
  const edges: ChainEdge[] = chain.path.slice(1).map((b, i) => {
    const a = chain.path[i]
    const all = between(d, a, b)
    const own = all.filter((e) => e.type === 'ownership')
    const pick = (mode === 'directed' ? own.find((e) => e.s === a) : own[0]) ?? all[0]
    return { type: pick?.type ?? 'ownership', w: pick?.w ?? 0, forward: pick ? pick.s === a : true, others: Math.max(0, all.length - 1) }
  })
  return (
    <Figure
      id="fig-chain"
      wide
      title={
        mode === 'directed'
          ? 'Following ownership as recorded, 8327 reaches 979893388 and then Oceanfront Oasis in six hops'
          : 'Ignoring direction, 8327 is four hops from Oceanfront Oasis, through a single 0.26 edge'
      }
      subtitle={`Weakest link ${chain.min_w.toFixed(2)}; ${chain.n_shortest} path${chain.n_shortest > 1 ? 's' : ''} of this length.`}
      controls={
        <div className="seg" role="group" aria-label="Chain">
          <button type="button" className="chip" aria-pressed={mode === 'directed'} onClick={() => setMode('directed')}>
            Directed ownership
          </button>
          <button type="button" className="chip" aria-pressed={mode === 'shortest'} onClick={() => setMode('shortest')}>
            Shortest, any direction
          </button>
        </div>
      }
      legend={<EdgeLegend familyWeak={false} />}
      caption={
        <>
          Source: <code>suspects.json</code> → <code>ownership_chains.to_suspects</code>; edge weights from <code>egos.json</code> and <code>candidates.json</code>. Where a pair
          carries several relation types the weakest ownership row is shown.
        </>
      }
      table={{
        columns: ['From', 'To', 'Relation', 'Weight', 'Recorded direction'],
        rows: edges.map((e, i) => [hops[i].label, hops[i + 1].label, EDGE_LABEL[e.type], e.w, e.forward ? 'as drawn' : 'reversed']),
      }}
    >
      <ChainStrip hops={hops} edges={edges} focusEdge={focusEdge} />
    </Figure>
  )
}

function DistanceFigure({ d, focus }: { d: MC1; focus: string | null }) {
  const n = d.paths.null
  const dm = n.degree_matched_4set_mean_distance
  return (
    <Figure
      id="fig-dist"
      wide
      title="The suspects are closer than random pairs, but not much closer than random sets with the same degrees"
      legend={
        <>
          <Swatch color="var(--series-other)">Random node pairs</Swatch>
          <LineSwatch color="var(--lit-3)">Suspects’ mean</LineSwatch>
          <LineSwatch color="var(--ink)" dashed>
            Baseline means
          </LineSwatch>
        </>
      }
      caption={
        <>
          Source: <code>paths.json</code> → <code>null</code>. Degree-matched: {dm.draws} random sets of four with the suspects’ degrees; {Math.round(dm.frac_le_observed * 100)}% are
          at least as close as the suspects.
        </>
      }
      table={{
        columns: ['Measure', 'Mean hops'],
        rows: [
          ['Suspect pairs', n.suspect_mean_pair_distance],
          ['Degree-matched sets of four', dm.mean],
          ['Degree-matched, 5th percentile', dm.p05],
          ['Random pairs', n.random_pair_distance.mean],
        ],
      }}
    >
      <DistanceNull
        hist={n.random_pair_distance.hist}
        focus={focus}
        markers={[
          { id: 'obs', x: n.suspect_mean_pair_distance, label: `Suspects ${n.suspect_mean_pair_distance.toFixed(2)}`, strong: true },
          { id: 'matched', x: dm.mean, label: `Degree-matched ${dm.mean.toFixed(2)}` },
          { id: 'random', x: n.random_pair_distance.mean, label: `Random ${n.random_pair_distance.mean.toFixed(2)}` },
        ]}
      />
    </Figure>
  )
}

/* ═════════ Q3 ═════════ */

const Q3_CLAIMS: Record<string, { cand?: string; loo?: 'tool' | 'base'; abl?: boolean }> = {
  loo: { loo: 'tool' },
  base: { loo: 'base' },
  abl: { abl: true },
  c903: { cand: '#903311212' },
  c48: { cand: '#48' },
  c402: { cand: '#40213337' },
  c83: { cand: '#83' },
}

function Q3({ state }: { state: ReturnType<typeof useMC1> }) {
  const [claim, setClaim] = useState<string | null>(null)
  const [cand, setCand] = useState('#903311212')
  const [showPath, setShowPath] = useState(false)
  const spec = claim ? Q3_CLAIMS[claim] : null
  const press = (id: string) => {
    if (claim === id) return setClaim(null)
    const c = Q3_CLAIMS[id]
    if (c.cand) {
      setCand(c.cand)
      setShowPath(true)
    }
    setClaim(id)
  }
  return (
    <ClaimCtx.Provider value={{ claim, press }}>
    <Question
      id="q3"
      n="Q3"
      prompt="What other companies should FishEye investigate, and how does your approach surface them?"
      title="Score every company on how much it resembles the suspects, then test the score"
      answer={
        <>
          <p>
            The tool scores all 1,209 companies and organizations on seven structural features: low-weight edges (weight 0.25), proximity to suspects (0.20), shared
            neighbours (0.15), ownership counterparties (0.15), relation-type profile (0.10), repeated or mixed-type edges (0.10) and a FishEye tag (0.05). Each feature
            becomes a percentile before weighting. Every candidate comes with its contributions, an evidence subgraph of at most 22 nodes, and the rubric used on the
            suspects.
          </p>
          <p>
            Does it find suspects?{' '}
            Held out one at a time, the suspects{' '}<C id="loo" to="fig-loo">rank 11th, 51st, 41st and 35th</C>{' '}
            of 1,210{' '}
            (top 1–4%), where{' '}
            ranking by degree puts them at{' '}<C id="base" to="fig-loo">96th, 7th, 528th and 128th</C>
            . Across 300 random reweightings the order keeps a mean Spearman correlation of 0.98 (minimum 0.89). The caveat:{' '}
            without the low-weight feature{' '}<C id="abl" to="fig-abl">only 8 of the top 25 survive</C>
            , so the list is mainly a ranking of the layer. All 25 sit in it, and 4 are hubs.
          </p>
          <h3>Investigate first</h3>
          <ul>
            <li>
              <C id="c903" to="fig-evidence">903311212</C>{' '}
              (rank 1, score 0.97): a hub with 234 neighbours that owns 43 and is owned by 42. FishEye tags it, it has a low-weight ownership edge and a link to
              “poached”, and it reaches 979893388 through Mar del Oeste Pic.
            </li>
            <li>
              <C id="c48" to="fig-evidence">48</C>{' '}
              (rank 18), the only High-confidence result: FishEye tags it with a 0.95 edge, it owns 5 and is owned by 4, and it chains to 979893388 through png xi Line
              and Ocean Fisheries Llc.
            </li>
            <li>
              <C id="c402" to="fig-evidence">40213337</C>{' '}
              (rank 7), the holding 8327 owns, with six low-weight ownership rows; it owns Sea Harvest, Sea Products and 196159 (rank 11).
            </li>
            <li>
              <C id="c83" to="fig-evidence">83</C>{' '}
              (rank 2), tagged by FishEye with a chain to 979893388, and the core hubs Mar del Oeste Pic (5) and png xi Line (6).
            </li>
          </ul>
          <p>
            Next tier: Seabreeze Foods (8327’s owner), Yu gan BV Investment, 1560, 8814 and 923825740. Structures matter as much as names: the two ownership loops, the
            five-hop chain from Darin Torres to 4942, and nine people tied by weak family edges who own companies in the layer and may be its beneficial owners.
          </p>
          <p>
            <strong>Confidence.</strong> Medium for the layer as a whole, which is statistically clear. Low to medium for each company, because its strongest evidence is also
            its least reliable.
          </p>
        </>
      }
    >
      <Await state={state} height={420}>
        {(d) => (
          <>
            <CandidateFigure d={d} selected={cand} onSelect={(k) => (setCand(k), setClaim(null))} />
            <EvidenceFigure d={d} k={cand} showPath={showPath} setShowPath={setShowPath} />
            <LooFigure d={d} emphasise={spec?.loo ?? null} />
            <AblationFigure d={d} on={!!spec?.abl} />
          </>
        )}
      </Await>
    </Question>
    </ClaimCtx.Provider>
  )
}

function FeatureLegend() {
  return (
    <>
      {FEATURE_GROUPS.map((g) => (
        <Swatch key={g.id} color={g.color}>
          {g.label}
        </Swatch>
      ))}
    </>
  )
}

function CandidateFigure({ d, selected, onSelect }: { d: MC1; selected: string; onSelect: (k: string) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const stacked = width < 460
  const barW = stacked ? Math.max(120, width - 48) : Math.max(90, Math.min(200, width - 330))
  return (
    <Figure
      id="fig-cands"
      title="Twenty-five companies outrank the held-out suspects, all of them inside the weak layer"
      subtitle="Select a company to see the evidence behind it. Flag = rubric verdict."
      legend={<FeatureLegend />}
      caption={
        <>
          Source: <code>candidates.json</code> → <code>candidates[].contrib</code>, <code>rubric</code>. Bar length = score (0–1), split by feature contribution.
        </>
      }
      table={{
        columns: ['Rank', 'Company', 'Score', 'Verdict', 'Confidence', 'Stability', 'Top features'],
        rows: d.cands.candidates.map((c) => [c.rank, label(d, c.k), c.score, c.rubric.verdict, c.rubric.confidence, c.stability, c.why.join(', ')]),
      }}
    >
      <div ref={ref}>
        <ol className={`cands${stacked ? ' cands--stacked' : ''}`}>
          {d.cands.candidates.map((c) => {
            const v = toVerdict(c.rubric.verdict)
            return (
              <li key={c.k}>
                <button type="button" className="cand" aria-pressed={selected === c.k} onClick={() => onSelect(c.k)}>
                  <span className="cand__rank tnum">{c.rank}</span>
                  <span className="cand__name">{label(d, c.k)}</span>
                  <span className="cand__flag">
                    <Flag code={VERDICT_FLAG[v]} size={18} label={`Rubric: ${v}, ${c.rubric.confidence} confidence`} />
                  </span>
                  <span className="cand__bar">
                    <ContribBar contrib={c.contrib} width={barW} />
                  </span>
                  <span className="cand__score tnum">{c.score.toFixed(2)}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </Figure>
  )
}

function EvidenceFigure({ d, k, showPath, setShowPath }: { d: MC1; k: string; showPath: boolean; setShowPath: (b: boolean) => void }) {
  const c = d.cands.candidates.find((x) => x.k === k)!
  const { nodes, links } = useMemo(() => {
    const nodes = c.evidence.nodes.map((n) => gnode(d, n, n === k ? { emph: true, size: 10, ring: 'var(--ink)' } : {}))
    const links: GLink[] = c.evidence.links.map((l) => ({ source: l.s, target: l.t, type: l.type, weight: l.w, dashed: l.w < 0.8 }))
    return { nodes, links }
  }, [d, c, k])
  const v = toVerdict(c.rubric.verdict)
  const pathTxt = c.evidence.path_to_suspect?.map((p) => label(d, p)).join(' → ')
  return (
    <Figure
      id="fig-evidence"
      title={`${label(d, k)}: rank ${c.rank}, rubric ${v.toLowerCase()} (${c.rubric.confidence.toLowerCase()} confidence)`}
      subtitle={
        <>
          {c.deg} neighbours{c.is_hub ? ' (hub)' : ''}; in the top 25 in {Math.round(c.stability * 100)}% of 300 reweightings. Path to a suspect: {pathTxt ?? 'none'}.
        </>
      }
      controls={
        <button type="button" className="chip" aria-pressed={showPath} onClick={() => setShowPath(!showPath)}>
          Trace path to suspect
        </button>
      }
      legend={
        <>
          <EntityLegend types={['company', 'organization', 'person', 'other']} />
          <EdgeLegend />
        </>
      }
      caption={
        <>
          Source: <code>candidates.json</code> → <code>evidence</code>, <code>rubric.signals</code>. The candidate is ringed in ink, suspects in their verdict colour.
        </>
      }
      table={{
        columns: ['Source', 'Target', 'Relation', 'Weight (min)', 'Rows'],
        rows: c.evidence.links.map((l) => [label(d, l.s), label(d, l.t), EDGE_LABEL[l.type], l.w, l.n]),
      }}
    >
      <div className="mc1-signals" aria-label="Rubric signals">
        {c.rubric.signals.map((s) => (
          <span key={s.id} className="mc1-signal" data-weak={s.basis_w != null && s.basis_w < 0.8}>
            {s.id.replace(/_/g, ' ')} <b className="tnum">{s.points}</b>
          </span>
        ))}
      </div>
      <NetworkGraph nodes={nodes} links={links} height={380} linkColor={edgeColor} linkDash={edgeDash} path={showPath ? c.evidence.path_to_suspect : null} />
    </Figure>
  )
}

function LooFigure({ d, emphasise }: { d: MC1; emphasise: 'tool' | 'base' | null }) {
  const loo = d.cands.leave_one_out
  const order = SUSPECT_ORDER.map((k) => loo.find((l) => l.held_out === k)!).filter(Boolean)
  return (
    <Figure
      id="fig-loo"
      title="Held out, every suspect lands in the top 4%; degree alone misses three of them"
      legend={
        <>
          <span className="legend-item">
            <span className="legend-swatch legend-swatch--circle" style={{ background: 'var(--series-1)' }} aria-hidden />
            Our score
          </span>
          <span className="legend-item">
            <span className="legend-swatch legend-swatch--circle" style={{ background: 'var(--ground)', boxShadow: 'inset 0 0 0 2px var(--ink-2)' }} aria-hidden />
            Degree baseline
          </span>
        </>
      }
      caption={
        <>
          Source: <code>candidates.json</code> → <code>leave_one_out</code>. Each suspect is removed from the seeds and ranked by the other three.
        </>
      }
      table={{
        columns: ['Held out', 'Our rank', 'Degree rank', 'Pool'],
        rows: order.map((l) => [SHORT[l.held_out], l.rank, l.degree_baseline_rank, l.pool]),
      }}
    >
      <Dumbbells rows={order.map((l) => ({ k: l.held_out, rank: l.rank, base: l.degree_baseline_rank }))} pool={order[0]?.pool ?? 1210} emphasise={emphasise} />
    </Figure>
  )
}

function AblationFigure({ d, on }: { d: MC1; on: boolean }) {
  const ab = d.cands.ablation_top25_overlap
  const color = (f: string) => FEATURE_GROUPS.find((g) => g.members.includes(f as never))?.color ?? 'var(--series-other)'
  const name: Record<string, string> = {
    low_conf: 'Low-weight edges',
    proximity: 'Near suspects',
    shared_nbrs: 'Shared neighbours',
    ownership: 'Ownership ties',
    profile_sim: 'Relation profile',
    redundancy: 'Repeated edges',
    fisheye_flag: 'FishEye tag',
  }
  const bars = Object.entries(ab)
    .sort((a, b) => a[1] - b[1])
    .map(([f, v]) => ({ key: f, label: name[f] ?? f, value: v, color: color(f), highlight: on && f === 'low_conf' }))
  return (
    <Figure
      id="fig-abl"
      title="Drop the low-weight feature and only 8 of the top 25 survive; every other feature is optional"
      subtitle="Companies still in the top 25 after removing one feature."
      caption={
        <>
          Source: <code>candidates.json</code> → <code>ablation_top25_overlap</code>, <code>weight_perturbation</code>.
        </>
      }
      table={{ columns: ['Feature removed', 'Top 25 kept'], rows: bars.map((b) => [b.label, b.value]) }}
    >
      <BarList bars={bars} max={25} labelWidth={150} format={(n) => `${n} of 25`} selected={on ? 'low_conf' : null} />
    </Figure>
  )
}

/* ═════════ Q4 ═════════ */

const Q4_CLAIMS: Record<string, { seg?: string[]; declared?: boolean }> = {
  junk: { seg: ['junk'] },
  untyped: { seg: ['company_like', 'untyped_other', 'junk'] },
  declared: { declared: true },
}

function Q4({ state }: { state: ReturnType<typeof useMC1> }) {
  const [claim, setClaim] = useState<string | null>(null)
  const spec = claim ? Q4_CLAIMS[claim] : null
  const press = (id: string) => setClaim(claim === id ? null : id)
  return (
    <ClaimCtx.Provider value={{ claim, press }}>
    <Question
      id="q4"
      n="Q4"
      prompt="What was the most difficult aspect of this knowledge graph?"
      title="Deciding which parts of the graph to trust"
      answer={
        <>
          <p>
            The extraction errors are not random; they form structure that can look like evidence.{' '}
            <C id="junk" to="fig-types">
              About 10% of nodes are NLP debris
            </C>
            , garbled text or words like “weeks” labelled as vessels, and{' '}
            <C id="untyped" to="fig-types">
              605 nodes have no type at all
            </C>
            . Family edges join two non-people 46% of the time. 322 rows repeat the same source, target and type, 124 pairs carry several relation types, and integer and
            string ids collide 11 times (<code>77</code> and <code>"77"</code>), so every id needs a type-aware key. And{' '}
            the data notes promise{' '}<C id="declared" to="fig-declared">3,721 nodes and 7,422 edges</C>{' '}
            where the file holds 3,428 and 11,069 rows.
          </p>
          <p>
            The most important signal, edge weight, is undocumented, and so is ownership direction. So the low-weight layer was treated as a hypothesis: tested against a
            random-edge baseline, checked for predicting held-out suspects better than degree, and recorded with every verdict. Hubs hide structure too, so paths are compared
            with and without hubs, and Louvain runs over several seeds instead of trusting one partition.
          </p>
        </>
      }
    >
      <Await state={state} height={300}>
        {(d) => (
          <>
            <TypesFigure d={d} focus={spec?.seg ?? null} />
            <DeclaredFigure d={d} on={!!spec?.declared} />
          </>
        )}
      </Await>
    </Question>
    </ClaimCtx.Provider>
  )
}

function TypesFigure({ d, focus }: { d: MC1; focus: string[] | null }) {
  const rows = useMemo(() => {
    const by = new Map<string, Record<string, number>>()
    Object.entries(d.meta.type_class_crosstab).forEach(([key, n]) => {
      const [type, cls] = key.split('|')
      const seg = ['company_like', 'untyped_other', 'junk'].includes(cls) ? cls : 'consistent'
      const r = by.get(type) ?? {}
      r[seg] = (r[seg] ?? 0) + n
      by.set(type, r)
    })
    return [...by.entries()]
      .map(([type, parts]) => ({ type, parts }))
      .sort((a, b) => d3.sum(Object.values(b.parts)) - d3.sum(Object.values(a.parts)))
  }, [d])
  const junk = d.meta.classes.junk
  return (
    <Figure
      id="fig-types"
      title={`${junk} nodes are NLP debris, and most of them hide among the 605 with no type`}
      legend={
        <>
          {CLASS_SEGMENTS.map((s) => (
            <Swatch key={s.id} color={s.color}>
              {s.label}
            </Swatch>
          ))}
        </>
      }
      caption={
        <>
          Source: <code>meta.json</code> → <code>type_class_crosstab</code>. Rows are the raw <code>type</code> field; colour is the class the pipeline inferred from the
          name.
        </>
      }
      table={{
        columns: ['Raw type', ...CLASS_SEGMENTS.map((s) => s.label)],
        rows: rows.map((r) => [r.type, ...CLASS_SEGMENTS.map((s) => r.parts[s.id] ?? 0)]),
      }}
    >
      <TypeClassBars rows={rows} focus={focus} />
    </Figure>
  )
}

function DeclaredFigure({ d, on }: { d: MC1; on: boolean }) {
  const q = d.meta.quirks.declared_vs_actual
  const bars = [
    { key: 'nn', label: 'Nodes, data notes', value: q.notes_nodes, color: 'var(--series-other)', highlight: on },
    { key: 'fn', label: 'Nodes, in the file', value: q.file_nodes, color: 'var(--series-1)', highlight: on },
    { key: 'ne', label: 'Edges, data notes', value: q.notes_edges, color: 'var(--series-other)', highlight: on },
    { key: 'fe', label: 'Edge rows, in the file', value: q.file_edges, color: 'var(--series-1)', highlight: on },
    { key: 'fu', label: 'Distinct linked pairs', value: d.meta.counts.undirected_simple, color: 'var(--series-1)' },
  ]
  return (
    <Figure
      id="fig-declared"
      title="The file has 8% fewer nodes and 49% more edge rows than its notes declare"
      legend={
        <>
          <Swatch color="var(--series-other)">Declared in the data notes</Swatch>
          <Swatch color="var(--series-1)">Counted in MC1.json</Swatch>
        </>
      }
      caption={
        <>
          Source: <code>meta.json</code> → <code>quirks.declared_vs_actual</code>, <code>counts</code>. Also: {d.meta.quirks.duplicate_rows_same_s_t_type} duplicate rows,{' '}
          {d.meta.quirks.directed_pairs_multi_type} multi-type pairs, {d.meta.quirks.id_string_collisions.length} id collisions, one misspelled weight field.
        </>
      }
      table={{ columns: ['Count', 'Value'], rows: bars.map((b) => [b.label, b.value]) }}
    >
      <BarList bars={bars} labelWidth={170} />
    </Figure>
  )
}
