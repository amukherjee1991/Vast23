import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { GlowStage, type GlowState } from '../../charts/GlowStage'
import { Scrolly } from '../../components/Scrolly'
import { useTooltip } from '../../components/Tooltip'
import { label, SHORT, SUSPECT_ORDER, type MC1 } from './data'
import { CLASS_NAME, HEX, VERDICT_HEX, buildBeats, type Sky, type SuspectLamp } from './sky'

/* The MC1 signature scroll story: the whole knowledge graph as a night sky on a
   sticky stage. Each step relights it; claims inside a step light a variant. */

const canHover = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches

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

export function useBeats(sky: Sky, d: MC1) {
  return useMemo(() => {
    const lamps: SuspectLamp[] = SUSPECT_ORDER.map((k) => ({
      i: sky.index.get(k)!,
      short: SHORT[k],
      verdict: d.suspects.suspects.find((s) => s.k === k)!.verdict,
    }))
    return { lamps, beats: buildBeats(sky, lamps, (r, i) => `${r} · ${label(d, sky.keys[i])}`) }
  }, [sky, d])
}

/** One GlowStage over the sky, with a tooltip on hover and suspect selection. */
export function SkyStage({
  sky,
  d,
  state,
  ariaLabel,
  onSuspect,
  intro,
}: {
  sky: Sky
  d: MC1
  state: GlowState
  ariaLabel: string
  onSuspect?: (k: string) => void
  intro?: 'fade' | 'bloom'
}) {
  const tip = useTooltip()
  const onHover = useCallback(
    (i: number | null, e?: PointerEvent) => {
      if (i == null || !e || !canHover()) return tip.hide()
      const k = sky.keys[i]
      const rec = d.node.get(k)
      const s = d.suspects.suspects.find((x) => x.k === k)
      tip.show(
        e,
        <>
          <strong>{label(d, k)}</strong>
          <span className="tt-row">
            <span>Type</span>
            <span>{rec?.type ?? CLASS_NAME[sky.cls[i]] ?? 'none'}</span>
          </span>
          <span className="tt-row">
            <span>Degree</span>
            <span>{sky.deg[i]}</span>
          </span>
          {sky.inLayer[i] ? <span>In the weak layer</span> : null}
          {s && (
            <span>
              {s.verdict}, {s.confidence.toLowerCase()} confidence · click to open its network
            </span>
          )}
        </>,
      )
    },
    [sky, d, tip],
  )
  const onSelect = useCallback(
    (i: number) => {
      const k = sky.keys[i]
      if (onSuspect && (SUSPECT_ORDER as readonly string[]).includes(k)) {
        tip.hide()
        onSuspect(k)
      }
    },
    [sky, onSuspect, tip],
  )
  return (
    <GlowStage
      nodes={sky.nodes}
      edges={sky.edges}
      state={state}
      ariaLabel={ariaLabel}
      onHover={onHover}
      onSelect={onSuspect ? onSelect : undefined}
      bloom={3}
      intro={intro}
    />
  )
}

/* ───────── Claims inside the story ───────── */

const StoryClaim = createContext<{ claim: string | null; press: (id: string) => void }>({ claim: null, press: () => {} })

function SC({ id, children }: { id: string; children: ReactNode }) {
  const { claim, press } = useContext(StoryClaim)
  return (
    <button type="button" className="claim" aria-pressed={claim === id} aria-controls="mc1-sky" onClick={() => press(id)}>
      {children}
    </button>
  )
}

/** Small lit key in the stage corner: colour + label, never colour alone. */
function Key({ items }: { items: { color: string; label: string; ring?: boolean; line?: boolean }[] }) {
  return (
    <ul className="sky-key" aria-hidden>
      {items.map((it) => (
        <li key={it.label}>
          <svg width={14} height={14} viewBox="-7 -7 14 14">
            {it.line ? (
              <line x1={-6} x2={6} stroke={it.color} strokeWidth={2} />
            ) : it.ring ? (
              <>
                <circle r={2.5} fill={it.color} />
                <circle r={5.5} fill="none" stroke={it.color} strokeWidth={1.5} />
              </>
            ) : (
              <circle r={3.5} fill={it.color} />
            )}
          </svg>
          {it.label}
        </li>
      ))}
    </ul>
  )
}

const KEY_BASE = [
  { color: HEX.teal, label: 'Organizations' },
  { color: HEX.blue, label: 'People' },
  { color: HEX.dim, label: 'Other or untyped' },
]
const KEY_LAYER = { color: HEX.roseLit, label: 'Weak layer (weight < 0.8)' }

export function MC1Story({ sky, d, onSuspect }: { sky: Sky; d: MC1; onSuspect: (k: string) => void }) {
  const { lamps, beats } = useBeats(sky, d)
  const [step, setStep] = useState(0)
  // On phones the stage pins over the top half, so a step activates lower down.
  const narrow = useMedia('(max-width: 960px)')
  const [claim, setClaim] = useState<string | null>(null)
  const press = (id: string) => setClaim((c) => (c === id ? null : id))
  const lc = d.lowconf
  const feLow = lc.fisheye_node.edges_low_conf
  const feAll = lc.fisheye_node.edges_total
  const verdictKey = [
    { color: VERDICT_HEX.Suspect.ring, label: 'Suspect', ring: true },
    { color: VERDICT_HEX.Possible.ring, label: 'Possible', ring: true },
  ]

  const STEPS: { id: string; beat: string; title: string; body: ReactNode; key: Parameters<typeof Key>[0]['items']; count: string }[] = [
    {
      id: 'sky',
      beat: 'sky',
      title: 'Every entity is a star',
      count: `${sky.nodes.length.toLocaleString('en-US')} entities · ${d.meta.counts.links.toLocaleString('en-US')} relations`,
      key: KEY_BASE,
      body: (
        <p>
          FishEye’s knowledge graph holds {sky.nodes.length.toLocaleString('en-US')} entities and {d.meta.counts.links.toLocaleString('en-US')} relations, extracted from
          text by NLP. Almost every relation is weighted 0.80 to 0.99: 99.2% of rows. Most stars sit in one connected sky;{' '}
          <SC id="fragments">{sky.fragments} small fragments</SC> drift around its rim.
        </p>
      ),
    },
    {
      id: 'layer',
      beat: 'layer',
      title: 'Eighty-eight weak edges ignite',
      count: `${lc.n_edges} weak edges · ${lc.n_nodes} entities`,
      key: [KEY_LAYER, ...KEY_BASE.slice(0, 2)],
      body: (
        <p>
          Only {lc.n_edges} rows weigh less than 0.8. They are not scattered: they join into one web of {lc.n_nodes} entities, knotted inside the core. Random draws of{' '}
          {lc.n_edges} edges average a largest component of {lc.null_lcc_nodes.mean.toFixed(1)} nodes and never exceed {lc.null_lcc_nodes.max} (p&nbsp;=&nbsp;0.001).{' '}
          <SC id="ownership">Two-thirds of the web is ownership</SC>, against 18% of the whole graph.
        </p>
      ),
    },
    {
      id: 'fisheye',
      beat: 'fisheye',
      title: 'FishEye sits at its centre',
      count: `${feLow} of ${feAll} FishEye edges are weak`,
      key: [{ color: HEX.moon, label: 'FishEye International' }, KEY_LAYER],
      body: (
        <p>
          FishEye International has {feLow} of its {feAll} edges in the layer, so the layer may record FishEye’s own reporting: its tips, written into the graph with low
          confidence. Two of the suspects are{' '}
          <SC id="fetag">tagged by FishEye directly</SC>.
        </p>
      ),
    },
    {
      id: 'suspects',
      beat: 'suspects',
      title: 'Three suspects inside, one a hop out',
      count: '4 suspects · p = 5e-5 for three inside',
      key: [...verdictKey, KEY_LAYER],
      body: (
        <p>
          <SC id="suspect:0">8327</SC>, <SC id="suspect:2">Mar de la Vida</SC> and <SC id="suspect:3">Oceanfront Oasis</SC> sit inside the layer (p&nbsp;=&nbsp;5e-5).{' '}
          <SC id="suspect:1">979893388</SC>, a hub with 177 neighbours, is one hop out and owns Oceanfront Oasis. Each ring is its verdict lamp; click a suspect to open its
          network.
        </p>
      ),
    },
    {
      id: 'loops',
      beat: 'loops',
      title: 'Ownership runs in circles',
      count: `${lc.ownership_cycles.length} loops · ${lc.ownership_cycles.map((c) => c.length).join(' and ')} entities`,
      key: [{ color: HEX.moon, label: 'Ownership loop', line: true }, KEY_LAYER],
      body: (
        <p>
          The layer holds two circular-ownership loops, a pattern that can hide who really owns a company: <SC id="loop:0">a loop of four</SC> nameless organizations, and{' '}
          <SC id="loop:1">a loop of five</SC> that runs through l y S.A. de C.V. International.
        </p>
      ),
    },
    {
      id: 'candidates',
      beat: 'candidates',
      title: 'Twenty-five more lights to follow',
      count: '25 candidates · all inside the layer',
      key: [{ color: HEX.tealLit, label: 'Candidate to investigate' }, ...verdictKey],
      body: (
        <p>
          Scoring all 1,209 companies on how much they resemble the suspects puts 25 above the held-out suspects, and every one of them sits in the layer. The first,{' '}
          <SC id="cand:0">903311212</SC>, is a hub of 234 neighbours that FishEye tags. Question 3 tests the list.
        </p>
      ),
    },
  ]

  const cur = STEPS[step]
  const state = (claim && beats[claim]) || beats[cur.beat]
  void lamps

  return (
    <StoryClaim.Provider value={{ claim, press }}>
      <div className="mc1-story" id="story">
        <Scrolly
          label="The weak layer, step by step"
          rootMargin={narrow ? '-76% 0px -20% 0px' : undefined}
          onStep={(i) => {
            setStep(i)
            setClaim(null)
          }}
          steps={STEPS.map((s) => ({ id: s.id, title: s.title, body: s.body }))}
          stage={() => (
            <div className="sky" id="mc1-sky">
              <SkyStage
                sky={sky}
                d={d}
                state={state}
                onSuspect={onSuspect}
                ariaLabel={`The MC1 knowledge graph as a night sky. ${cur.title}. ${cur.count}.`}
              />
              <div className="sky__foot">
                <Key items={cur.key} />
                <p className="sky__count">{cur.count}</p>
              </div>
            </div>
          )}
        />
      </div>
    </StoryClaim.Provider>
  )
}

/** The opener's backdrop: the sky dim, the layer rose, the suspects lit. */
export function OpenerSky({ sky, d }: { sky: Sky; d: MC1 }) {
  const { beats } = useBeats(sky, d)
  const narrow = useMedia('(max-width: 720px)')
  return (
    <SkyStage
      sky={sky}
      d={d}
      state={narrow ? beats['opener-narrow'] : beats.opener}
      intro="bloom"
      ariaLabel="The whole knowledge graph drawn as a dim night sky; the 79-entity weak layer glows rose near its centre, with the four suspects lit inside and beside it."
    />
  )
}
