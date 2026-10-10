import { Flag } from './Flag'
import {
  CONFIDENCE_LEVEL,
  VERDICT_FLAG,
  type Confidence,
  type Verdict,
} from '../lib/signals'

/** Three numeral pennants; the hoisted ones (full colour) state confidence. */
export function ConfidencePennants({ level, size = 16 }: { level: Confidence; size?: number }) {
  const n = CONFIDENCE_LEVEL[level]
  return (
    <span className="pennants" role="img" aria-label={`${level} confidence`}>
      {(['P1', 'P2', 'P3'] as const).map((p, i) => (
        <Flag key={p} code={p} size={size} decorative muted={i >= n} />
      ))}
      <span className="pennants__label">{level}</span>
    </span>
  )
}

/** A verdict as hoisted at sea: flag + plain-language label + confidence. */
export function VerdictTag({
  verdict,
  confidence,
  size = 30,
  compact,
}: {
  verdict: Verdict
  confidence?: Confidence
  size?: number
  compact?: boolean
}) {
  return (
    <span className={`verdict verdict--${verdict.split(' ')[0].toLowerCase()}${compact ? ' verdict--compact' : ''}`}>
      <Flag code={VERDICT_FLAG[verdict]} size={size} decorative />
      <span className="verdict__text">
        <span className="verdict__label">{verdict}</span>
        {confidence && !compact && <ConfidencePennants level={confidence} size={13} />}
      </span>
    </span>
  )
}

/** Legend of the verdict code, used once per page. */
export function VerdictKey() {
  const rows: [Verdict, string][] = [
    ['Suspect', 'L · “Stop your vessel instantly”'],
    ['Possible', 'U · “You are running into danger”'],
    ['Insufficient evidence', 'X · “Watch for my signals”'],
    ['Unlikely', 'N · “Negative”'],
  ]
  return (
    <dl className="verdict-key">
      {rows.map(([v, m]) => (
        <div key={v} className="verdict-key__row">
          <dt>
            <Flag code={VERDICT_FLAG[v]} size={26} decorative />
            <span>{v}</span>
          </dt>
          <dd>{m}</dd>
        </div>
      ))}
    </dl>
  )
}
