import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'

/* Story chrome shared by every chapter: a reading-progress line on the top
   edge, the closing bridge of each chapter, and n / p keyboard navigation. */

export const CHAPTERS = [
  { to: '/', num: '0', title: 'Prologue' },
  { to: '/mc1', num: '1', title: 'The weak layer' },
  { to: '/mc2', num: '2', title: 'Currents' },
  { to: '/mc3', num: '3', title: 'The broken galaxy' },
  { to: '/method', num: '4', title: 'How it was made' },
] as const

/** A 2px moonlight line along the top edge that fills as the chapter is read. */
export function StoryProgress() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const max = document.documentElement.scrollHeight - window.innerHeight
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
      ref.current?.style.setProperty('--p', String(p))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])
  return (
    <div className="story-progress" aria-hidden>
      <span ref={ref} className="story-progress__fill" />
    </div>
  )
}

/** n / p (and 0–4) move between chapters; ignored while typing. */
export function useChapterKeys() {
  const nav = useNavigate()
  const { pathname } = useLocation()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      const i = CHAPTERS.findIndex((c) => c.to === pathname)
      if (e.key === 'n' && i < CHAPTERS.length - 1) nav(CHAPTERS[i + 1].to)
      else if (e.key === 'p' && i > 0) nav(CHAPTERS[i - 1].to)
      else if (/^[0-4]$/.test(e.key)) nav(CHAPTERS[Number(e.key)].to)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav, pathname])
}

/** The closing beat of a chapter: one takeaway sentence, a lead-in, and a
    real button to the next chapter. The takeaway lights as it is reached. */
export function Bridge({ takeaway, lead, next }: { takeaway: string; lead: string; next: string }) {
  const ref = useRef<HTMLElement>(null)
  const [lit, setLit] = useState(false)
  const target = CHAPTERS.find((c) => c.to === next)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setLit(e.isIntersecting), { rootMargin: '-30% 0px -30% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <section ref={ref} className="bridge" data-lit={lit} aria-label="Chapter takeaway">
      <div className="bridge__inner">
        <p className="bridge__takeaway">{takeaway}</p>
        <p className="bridge__lead">{lead}</p>
        {target && (
          <Link to={target.to} className="bridge__next">
            <span className="bridge__num">{target.num}</span>
            <span className="bridge__title">{target.title}</span>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        )}
      </div>
    </section>
  )
}

export interface StageKeyItem {
  color: string
  label: ReactNode
  /** A lamp ring around the dot (verdicts). */
  ring?: boolean
  /** A short stroke instead of a dot (lines, loops, trails). */
  line?: boolean
}

/** The lit key in a stage corner: colour plus label, never colour alone.
    Decorative to assistive tech (the canvas carries the full description). */
export function StageKey({ items, column = false }: { items: StageKeyItem[]; column?: boolean }) {
  return (
    <ul className={column ? 'stage-key stage-key--col' : 'stage-key'} aria-hidden>
      {items.map((it, i) => (
        <li key={i}>
          <svg width={14} height={14} viewBox="-7 -7 14 14">
            {it.line ? (
              <line x1={-6} x2={6} stroke={it.color} strokeWidth={2} strokeLinecap="round" />
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
