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

/** The verdict hoist: one flag per finding, strung on a halyard (vertical, or
    in the compact opener form a hairline above each position). Each
    position hangs its verdict flag from the line, names the entity, states
    verdict and confidence in a sentence, and gives the one-line reason. The
    name opens the evidence; the whole position is the hit area. */
export function HeroHoist({
  label,
  items,
  onSelect,
  compact = false,
}: {
  label: string
  items: HoistPosition[]
  onSelect: (key: string) => void
  /** Chapter openers: positions in two columns, each flag hanging from a
      hairline halyard, 36px flags and smaller names. */
  compact?: boolean
}) {
  return (
    <div className={compact ? 'hoist hoist--compact' : 'hoist'}>
      {!compact && <span className="hoist__rope" aria-hidden />}
      <ol className="hoist__list" aria-label={label}>
        {items.map((it, i) => {
          const n = CONFIDENCE_LEVEL[it.confidence]
          return (
            <li key={it.key} className="hoist__pos" style={{ ['--i' as string]: i }}>
              <span className="hoist__flag" aria-hidden>
                <Flag code={VERDICT_FLAG[it.verdict]} size={compact ? 36 : 48} decorative />
              </span>
              <div className="hoist__body">
                <h2 className="hoist__name">
                  <button type="button" className="hoist__btn" onClick={() => onSelect(it.key)}>
                    {it.name}
                    <span className="visually-hidden">: {it.action}</span>
                  </button>
                </h2>
                <p className="hoist__verdict">
                  <span>{it.verdict},</span>
                  <span className="hoist__pennants" aria-hidden>
                    {(['P1', 'P2', 'P3'] as const).map((p, j) => (
                      <Flag key={p} code={p} size={compact ? 11 : 14} decorative muted={j >= n} />
                    ))}
                  </span>
                  <span>{it.confidence.toLowerCase()} confidence</span>
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
