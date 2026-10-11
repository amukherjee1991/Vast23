import type { ReactNode } from 'react'
import { Flag } from './Flag'
import { CONFIDENCE_LEVEL, VERDICT_FLAG, type Confidence, type Verdict } from '../lib/signals'

export interface HoistPosition {
  key: string
  /** The entity, set as the position's heading. */
  name: ReactNode
  verdict: Verdict
  confidence: Confidence
  /** One line: why this verdict. */
  reason: ReactNode
  /** What a click opens, read by assistive tech after the name. */
  action: string
}

/** The verdict hoist: one flag per finding, strung on a halyard. Each
    position hangs its verdict flag from the line, names the entity, states
    verdict and confidence in a sentence, and gives the one-line reason. The
    name opens the evidence; the whole position is the hit area.

    `compact` (chapter openers) is a quiet single-column halyard list: one
    real button per finding with a small flag, the name and one verdict line.
    The reason is read to assistive tech only; the stage names the lamps. */
export function HeroHoist({
  label,
  items,
  onSelect,
  compact = false,
}: {
  label: string
  items: HoistPosition[]
  onSelect: (key: string) => void
  /** Chapter openers: a single-column list of buttons (flag, name, verdict). */
  compact?: boolean
}) {
  if (compact)
    return (
      <nav className="hoist hoist--compact" aria-label={label}>
        <ol className="hoist__list">
          {items.map((it, i) => (
            <li key={it.key} className="hoist__pos" style={{ ['--i' as string]: i }}>
              <button type="button" className="hoist__row" onClick={() => onSelect(it.key)}>
                <span className="hoist__flag" aria-hidden>
                  <Flag code={VERDICT_FLAG[it.verdict]} size={24} decorative />
                </span>
                <span className="hoist__name">{it.name}</span>
                <span className="hoist__verdict">
                  <span className="hoist__phrase">
                    {it.verdict}, {it.confidence.toLowerCase()} confidence
                  </span>
                </span>
                <span className="visually-hidden">
                  . {it.reason} Select to {it.action}.
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
    )
  return (
    <div className="hoist">
      <span className="hoist__rope" aria-hidden />
      <ol className="hoist__list" aria-label={label}>
        {items.map((it, i) => {
          const n = CONFIDENCE_LEVEL[it.confidence]
          return (
            <li key={it.key} className="hoist__pos" style={{ ['--i' as string]: i }}>
              <span className="hoist__flag" aria-hidden>
                <Flag code={VERDICT_FLAG[it.verdict]} size={48} decorative />
              </span>
              <div className="hoist__body">
                <h2 className="hoist__name">
                  <button type="button" className="hoist__btn" onClick={() => onSelect(it.key)}>
                    {it.name}
                    <span className="visually-hidden">: {it.action}</span>
                  </button>
                </h2>
                <p className="hoist__verdict">
                  <span className="hoist__phrase">
                    {it.verdict},{' '}
                    <span className="hoist__pennants" aria-hidden>
                      {(['P1', 'P2', 'P3'] as const).map((p, j) => (
                        <Flag key={p} code={p} size={14} decorative muted={j >= n} />
                      ))}
                    </span>{' '}
                    {it.confidence.toLowerCase()} confidence
                  </span>
                </p>
                <p className="hoist__reason">{it.reason}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
