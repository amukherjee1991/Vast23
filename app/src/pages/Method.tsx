import { Link } from 'react-router-dom'
import { Flag, type FlagCode } from '../components/Flag'
import { VerdictKey } from '../components/Signals'

interface Stage {
  pennant: FlagCode
  mc: string
  to: string
  raw: string
  steps: string[]
  out: string
}

const STAGES: Stage[] = [
  {
    pennant: 'P1',
    mc: 'MC1',
    to: '/mc1',
    raw: 'News-extracted knowledge graph: 3,428 entities, 11,069 relations',
    steps: [
      'Separated integer ids from string ids, since 77 and "77" are different nodes',
      'Built one- and two-hop ego networks, paths between suspects, centrality, and Louvain communities',
      'Isolated the edges weighted below 0.8 and tested them against 1,000 random draws of the same size',
      'Scored suspects and candidates with a written rubric; checked the ranking by holding out each suspect',
    ],
    out: '7 files · 0.77 MB',
  },
  {
    pennant: 'P2',
    mc: 'MC2',
    to: '/mc2',
    raw: 'Customs graph: 5.46M shipment records, plus 12 bundles of AI-predicted links',
    steps: [
      'Streamed the 1.5 GB graph into Parquet and removed 155,291 exact duplicates',
      'Classified every trading pair into one of eight temporal patterns',
      'Scored each bundle on 11 tests against 200 random samples of real 2034 trade',
      'Looked for successor companies: a firm that stops trading and a new one that takes over its rare partners and products',
    ],
    out: '7 files · 0.54 MB',
  },
  {
    pennant: 'P3',
    mc: 'MC3',
    to: '/mc3',
    raw: 'Corporate register: 27,622 nodes and 24,038 links (companies, owners, contacts)',
    steps: [
      'Flattened list-wrapped fields and resolved duplicate company records',
      'Tested the giant component against name collisions by removing common-surname persons versus random persons',
      'Scored business groups for anomalies on structure, products, and missing data',
      'Clustered companies separately by product text and by structure, and measured each cluster’s stability',
    ],
    out: '6 files · 1.28 MB',
  },
]

export default function Method() {
  return (
    <main className="method">
      <header className="method__head">
        <h1 className="method__title">How the evidence was made</h1>
        <p className="method__lede">
          A Python pipeline reads the raw challenge data once. It writes small, deterministic JSON files that the browser loads, so the site
          never handles the 1.5 GB trade graph. Every chart on this site draws on those files.
        </p>
      </header>

      <section className="method__section" aria-labelledby="pipe-h">
        <h2 id="pipe-h">From raw graphs to hoisted findings</h2>
        <ol className="pipeline">
          {STAGES.map((s) => (
            <li key={s.mc} className="pipeline__row">
              <div className="pipeline__mc">
                <Flag code={s.pennant} size={44} decorative />
                <Link to={s.to}>{s.mc}</Link>
              </div>
              <p className="pipeline__raw">{s.raw}</p>
              <ul className="pipeline__steps">
                {s.steps.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              <p className="pipeline__out tnum">{s.out}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="method__section method__cols" aria-labelledby="judge-h">
        <div className="prose">
          <h2 id="judge-h">How verdicts are reached</h2>
          <p>
            There is no ground truth in this challenge. Every verdict comes from a rubric written down before it was applied: which signals
            count, how many points each is worth, and where the thresholds sit. The rubrics are published in the JSON files beside the scores, so
            anyone can change the weights and see what moves.
          </p>
          <p>
            Each structural claim is checked against a null model: random edge draws, degree-matched node sets, random samples of real trade,
            or removing the same number of random persons. A pattern counts as evidence only if chance rarely produces it.
          </p>
          <p>
            Confidence describes how solid the evidence is, not how bad the finding sounds. In MC1, entity 8327 has the strongest pattern of
            the four tips and still gets low confidence, because almost every edge behind it is one the extractor itself scored as uncertain.
          </p>
        </div>
        <VerdictKey />
      </section>

      <section className="method__section prose" aria-labelledby="design-h">
        <h2 id="design-h">Why signal flags</h2>
        <p>
          Investigations of illegal fishing happen at sea, and sea traffic already has a shared visual code for warnings: the International Code
          of Signals. The site uses that code. Verdicts are flags whose meanings at sea match the finding, confidence is shown with numeral pennants, and the section
          markers along the left rail are a halyard you read from top to bottom. Every flag pairs a pattern with a color, so the code still
          works in grayscale and for colorblind readers. Every chart also has a table view.
        </p>
      </section>

      <section className="method__section prose" aria-labelledby="repro-h">
        <h2 id="repro-h">Reproduce it</h2>
        <ol>
          <li>
            <code>scripts/fetch_data.sh</code> downloads the challenge data into <code>data/raw/</code>. It is not committed.
          </li>
          <li>
            <code>python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt</code>
          </li>
          <li>
            <code>cd app && npm ci && npm run data && npm run dev</code>
          </li>
        </ol>
        <p>
          Every pipeline run is deterministic: node order is sorted and seeds are fixed, so two runs produce byte-identical files. The written
          answers to each challenge question are in <code>findings/</code> in the{' '}
          <a href="https://github.com/amukherjee1991/Vast23" target="_blank" rel="noreferrer">
            repository
          </a>
          . They are also written up as VAST answer sheets, available as{' '}
          <a href="https://github.com/amukherjee1991/Vast23/blob/main/submission/VAST2023-Signal-Hoist.pdf" target="_blank" rel="noreferrer">
            one combined PDF
          </a>
          .
        </p>
      </section>
    </main>
  )
}
