import { Link } from 'react-router-dom'
import { Flag } from '../components/Flag'
import { ConfidencePennants, VerdictKey } from '../components/Signals'
import { useJson } from '../lib/useJson'
import { DriftField, type DriftSeed } from '../charts/DriftField'
import { useEffect, useMemo, useRef, useState } from 'react'
import { withMinus } from '../components/Minus'
import { VERDICT_FLAG, toConfidence, toVerdict, type Confidence, type Verdict } from '../lib/signals'

/* summary.json is baked by pipeline/build_summary.py from the three
   challenge pipelines. Until it exists the hoist shows the four tips
   FishEye received, flagged "watch for my signals". */
interface HoistEntry {
  name: string
  mc: string
  verdict: string
  confidence: string
  note: string
  href: string
}
/* drift.json (pipeline/stages_build.py): sampled real shipments for the sea of lights. */
interface Drift {
  months: [string, string] // first and last month
  monthly: { all: number[]; fish: number[] }
  samples: number[][] // [monthIndex, fish 0/1, logWeight]
}

interface Summary {
  hoist: HoistEntry[]
  challenges: { mc: string; headline: string }[]
}

const FALLBACK: HoistEntry[] = [
  { name: 'Mar de la Vida OJSC', mc: 'MC1', verdict: 'Insufficient evidence', confidence: 'Low', note: 'Tip received', href: '/mc1' },
  { name: '979893388', mc: 'MC1', verdict: 'Insufficient evidence', confidence: 'Low', note: 'Tip received', href: '/mc1' },
  { name: 'Oceanfront Oasis Inc Carriers', mc: 'MC1', verdict: 'Insufficient evidence', confidence: 'Low', note: 'Tip received', href: '/mc1' },
  { name: '8327', mc: 'MC1', verdict: 'Insufficient evidence', confidence: 'Low', note: 'Tip received', href: '/mc1' },
]

const PENNANT: Record<string, 'P1' | 'P2' | 'P3'> = { MC1: 'P1', MC2: 'P2', MC3: 'P3' }

/** Display name on the mast: a group named after its lead company drops the
    company's legal form ("Adriatic Squid Ltd. Liability Co group" becomes
    "Adriatic Squid group") so the name holds on two lines. */
const LEGAL = /\s+(?:Ltd\.?\s+Liability\s+Co\.?|Limited\s+Liability\s+Company|LLC|Inc\.?|Corp(?:oration)?\.?|S\.A\.(?:\s+de\s+C\.V\.)?|GmbH|OJSC|CJSC|AG|BV|N\.V\.|Ltd\.?)(?=\s+group$)/i
const mastName = (name: string) => name.replace(LEGAL, '')

const PHONE = '(max-width: 720px)'
function usePhone() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(PHONE).matches)
  useEffect(() => {
    const mq = window.matchMedia(PHONE)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}

const CHALLENGES = [
  {
    to: '/mc1',
    pennant: 'P1' as const,
    mc: 'MC1',
    title: 'Contextualise the tips',
    body: 'A knowledge graph extracted from news articles. Four entities were reported to FishEye. Who surrounds them, and who else deserves a look?',
    data: '3,428 entities · 11,069 relations',
  },
  {
    to: '/mc2',
    pennant: 'P2' as const,
    mc: 'MC2',
    title: 'Read the trade patterns',
    body: 'Five million shipment records from Oceanus customs, plus twelve sets of AI-predicted links. Which links can be trusted, and which companies vanish only to reappear?',
    data: '5.46M shipments · 12 link bundles',
  },
  {
    to: '/mc3',
    pennant: 'P3' as const,
    mc: 'MC3',
    title: 'Find the odd structures',
    body: 'A finance corporation’s register of fishing-related companies, owners and contacts. Which business groups are shaped unlike the rest?',
    data: '27,622 nodes · 24,038 links',
  },
]

export default function Home() {
  const summary = useJson<Summary>('summary.json')
  const hoist = summary.status === 'ready' ? summary.data.hoist : FALLBACK
  const headlines = summary.status === 'ready' ? summary.data.challenges : []
  const drift = useJson<Drift>('home/drift.json')
  const seeds = useMemo<DriftSeed[]>(() => {
    if (drift.status !== 'ready') return []
    const { monthly, samples } = drift.data
    const n = monthly.all.length
    const maxW = Math.max(...samples.map((d) => d[2]), 1)
    return samples.map(([m, f, lw]) => ({ t: m / Math.max(1, n - 1), fish: f === 1, w: lw / maxW }))
  }, [drift])
  const phone = usePhone()
  // a narrow band holds fewer lights: every other shipment keeps it legible
  const phoneSeeds = useMemo(() => seeds.filter((_, i) => i % 2 === 0), [seeds])
  const mastRef = useRef<HTMLElement>(null)
  const driftLabel = `${seeds.length} sampled shipments from the Oceanus customs records drifting as lights; amber lights carry fish.`

  return (
    <main>
      <section className="hero">
        {/* wide screens: the currents run below the horizon behind everything,
            fading out behind the mast; phones: a band of sea right under the
            title, inside the first viewport */}
        <div className="hero__stage" aria-hidden={seeds.length === 0 || phone}>
          {seeds.length > 0 && !phone && <DriftField seeds={seeds} ariaLabel={driftLabel} avoid={mastRef} />}
        </div>
        <div className="hero__copy">
          <h1 className="hero__title">Reading the signals of illegal fishing</h1>
          {phone ? (
            <p className="hero__lede">
              Three knowledge graphs from the VAST Challenge 2023. Each drifting light is a real shipment; the amber ones carry fish.
            </p>
          ) : (
            <p className="hero__lede">
              Three knowledge graphs from the IEEE VAST Challenge 2023 cover news, customs records, and corporate filings from the fictional
              nation of Oceanus. Each drifting light is a real shipment, and the amber ones carry fish. Each lamp on the mast is a verdict, hoisted
              beside the evidence that supports it.
            </p>
          )}
          {phone && (
            <div className="hero__sea" aria-hidden={seeds.length === 0}>
              {seeds.length > 0 && <DriftField seeds={phoneSeeds} ariaLabel={driftLabel} lanes={[0.14, 0.86]} />}
            </div>
          )}
          <dl className="hero__stats">
            {[
              ['3,428', 'news entities'],
              ['5.46M', 'shipments'],
              ['27,622', 'register records'],
              ['12', 'predicted-link sets'],
            ].map(([n, l]) => (
              <div key={l}>
                <dt className="visually-hidden">{l}</dt>
                <dd>
                  <span className="hero__stat-n">{n}</span>
                  <span className="hero__stat-l">{l}</span>
                </dd>
              </div>
            ))}
          </dl>
          <nav className="hero__paths" aria-label="Start with a mini-challenge">
            {CHALLENGES.map((c) => (
              <Link key={c.mc} to={c.to} className="hero__path">
                <Flag code={c.pennant} size={26} decorative />
                <span className="hero__path-t">{c.title}</span>
                <span className="visually-hidden"> ({c.mc})</span>
              </Link>
            ))}
          </nav>
          <Link to="/method" className="hero__method">
            How the evidence was made
          </Link>
        </div>

        <figure ref={mastRef} className="mast" aria-label="Verdict hoist: one flag per investigated entity">
          <ol className="mast__flags">
            {hoist.map((h, i) => {
              const v: Verdict = toVerdict(h.verdict)
              const c: Confidence = toConfidence(h.confidence)
              return (
                <li key={h.name} style={{ ['--i' as string]: i }}>
                  <Link to={h.href} className="mast__flag">
                    <span className="mast__cloth" aria-hidden>
                      <Flag code={PENNANT[h.mc] ?? 'P1'} size={34} decorative />
                      <Flag code={VERDICT_FLAG[v]} size={76} decorative />
                    </span>
                    <span className="mast__tag">
                      <span className="mast__name">{withMinus(mastName(h.name))}</span>
                      <span className="mast__verdict">
                        {h.mc} ·{' '}
                        <span className="nowrap">
                          {v}, {c.toLowerCase()} confidence
                        </span>
                      </span>
                      <ConfidencePennants level={c} size={20} />
                      <span className="mast__note">{h.note}</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ol>
          <figcaption className="mast__cap">
            {summary.status === 'ready'
              ? 'The strongest finding from each challenge, hoisted. Select one to see its evidence.'
              : 'Tips as received, before analysis.'}
          </figcaption>
        </figure>
      </section>

      <section className="routes" aria-label="The three mini-challenges">
        {CHALLENGES.map((c) => {
          const head = headlines.find((h) => h.mc === c.mc)?.headline
          return (
            <Link key={c.mc} to={c.to} className="route">
              <Flag code={c.pennant} size={72} decorative />
              <div className="route__text">
                <h2 className="route__title">
                  {c.title} <span className="route__mc">{c.mc}</span>
                </h2>
                <p className="route__body">{head ?? c.body}</p>
                <p className="route__data tnum">{c.data}</p>
              </div>
              <svg className="route__go" width="40" height="24" viewBox="0 0 40 24" aria-hidden>
                <path d="M0 12H37M27 2l10 10-10 10" fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
            </Link>
          )
        })}
      </section>

      <section className="code-sheet" aria-labelledby="code-sheet-h">
        <div className="code-sheet__intro">
          <h2 id="code-sheet-h">The signal code</h2>
          <p>
            Verdicts borrow four flags whose meanings at sea match the finding. Numeral pennants show confidence: one hoisted means low, three means high. Each flag
            pairs a pattern with a color, so it reads in grayscale and for colorblind readers.
          </p>
        </div>
        <VerdictKey />
        <div className="code-sheet__conf">
          <ConfidencePennants level="Low" />
          <ConfidencePennants level="Medium" />
          <ConfidencePennants level="High" />
        </div>
      </section>
    </main>
  )
}
