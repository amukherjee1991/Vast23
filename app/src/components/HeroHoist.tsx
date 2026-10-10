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

/** The verdict hoist: one flag per finding, strung on a vertical halyard in
    the band's right column (stacked under the lede on narrow screens). Each
    position hangs its verdict flag from the line, names the entity, states
    verdict and confidence in a sentence, and gives the one-line reason. The
    name opens the evidence; the whole position is the hit area. */
export function HeroHoist({ label, items, onSelect }: { label: string; items: HoistPosition[]; onSelect: (key: string) => void }) {
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
                  <span>{it.verdict},</span>
                  <span className="hoist__pennants" aria-hidden>
                    {(['P1', 'P2', 'P3'] as const).map((p, j) => (
                      <Flag key={p} code={p} size={14} decorative muted={j >= n} />
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
