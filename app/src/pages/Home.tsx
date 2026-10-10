import { Link } from 'react-router-dom'
import { Flag } from '../components/Flag'
import { ConfidencePennants, VerdictKey } from '../components/Signals'
import { useJson } from '../lib/useJson'
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

  return (
    <main>
      <section className="hero">
        <div className="hero__copy">
          <h1 className="hero__title">Reading the signals of illegal fishing</h1>
          <p className="hero__lede">
            Three knowledge graphs from the IEEE VAST Challenge 2023 cover news, customs records, and corporate filings from the fictional
            nation of Oceanus. Each verdict on this page is hoisted as a maritime signal flag, next to the interactive evidence that supports it.
          </p>
          <nav className="hero__paths" aria-label="Start with a mini-challenge">
            {CHALLENGES.map((c) => (
              <Link key={c.mc} to={c.to} className="hero__path">
                <Flag code={c.pennant} size={56} decorative />
                <span className="hero__path-mc">{c.mc}</span>
                <span className="hero__path-t">{c.title}</span>
              </Link>
            ))}
          </nav>
          <Link to="/method" className="hero__method">
            How the evidence was made
          </Link>
        </div>

        <figure className="mast" aria-label="Verdict hoist: one flag per investigated entity">
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
                      <span className="mast__name">{h.name}</span>
                      <span className="mast__verdict">
                        {h.mc} · {v}, {c.toLowerCase()} confidence
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
                  <span className="route__mc">{c.mc}</span> {c.title}
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
