import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { Flag, type FlagCode } from './Flag'

export interface HalyardStop {
  id: string
  flag: FlagCode
  label: string
}

/** The halyard: a rope with one flag per section. The section in view is
    hoisted in full colour; the rest hang muted. Desktop rail, mobile strip. */
export function Halyard({ stops }: { stops: HalyardStop[] }) {
  const [active, setActive] = useState(stops[0]?.id)
  useEffect(() => {
    const els = stops.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[]
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (vis[0]) setActive(vis[0].target.id)
      },
      { rootMargin: '-35% 0px -55% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [stops])
  return (
    <nav className="halyard" aria-label="Sections on this page">
      <span className="halyard__rope" aria-hidden />
      <ol>
        {stops.map((s, i) => (
          <li key={s.id} style={{ ['--i' as string]: i }}>
            <a
              href={`#${s.id}`}
              aria-current={active === s.id ? 'true' : undefined}
              className="halyard__stop"
              onClick={(e) => {
                // Under HashRouter a bare #id would be read as a route: scroll instead.
                const el = document.getElementById(s.id)
                if (!el) return
                e.preventDefault()
                el.scrollIntoView({ block: 'start' })
                setActive(s.id)
              }}
            >
              <Flag code={s.flag} size={30} decorative muted={active !== s.id} />
              <span className="halyard__label">{s.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

const NAV: { to: string; code: FlagCode; label: string }[] = [
  { to: '/mc1', code: 'P1', label: 'Contextualise' },
  { to: '/mc2', code: 'P2', label: 'Patterns' },
  { to: '/mc3', code: 'P3', label: 'Anomalies' },
]

export function SiteHeader() {
  return (
    <header className="site-head">
      <Link to="/" className="wordmark" aria-label="Signal Hoist, home">
        <Flag code="L" size={26} decorative />
        <span>Signal&nbsp;Hoist</span>
      </Link>
      <nav className="site-nav" aria-label="Mini-challenges">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} className="site-nav__link">
            <Flag code={n.code} size={22} decorative />
            <span>
              <span className="site-nav__mc">MC{n.code[1]}</span> <span className="site-nav__label">{n.label}</span>
            </span>
          </NavLink>
        ))}
        <NavLink to="/method" className="site-nav__link site-nav__link--plain">
          Method
        </NavLink>
      </nav>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="site-foot__hoist" aria-hidden>
        {(['V', 'A', 'S', 'T'] as const).map((c) => (
          <Flag key={c} code={c} size={34} decorative />
        ))}
      </div>
      <p>
        An independent response to the{' '}
        <a href="https://vast-challenge.github.io/2023/" target="_blank" rel="noreferrer">
          IEEE VAST Challenge 2023
        </a>
        . Oceanus, FishEye and every entity named here are fictional and come from the challenge data. This is not an official submission.
      </p>
      <p className="site-foot__meta">
        Built with React, D3 and a Python pipeline ·{' '}
        <a href="https://github.com/amukherjee1991/Vast23" target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
      </p>
    </footer>
  )
}

/** Opening band of a mini-challenge page: a full field of its pennant colour. */
export function ChallengeBand({
  pennant,
  mc,
  title,
  lede,
  tone,
  children,
}: {
  pennant: 'P1' | 'P2' | 'P3'
  mc: string
  title: string
  lede: ReactNode
  tone: 'red' | 'blue' | 'yellow'
  children?: ReactNode
}) {
  return (
    <section className={`band band--${tone}`}>
      <div className="band__inner">
        <div className="band__mark">
          <Flag code={pennant} size={64} label={mc} />
        </div>
        <h1 className="band__title">{title}</h1>
        <p className="band__lede">{lede}</p>
        {children}
      </div>
    </section>
  )
}

/** One challenge question: the brief, our answer, and its evidence. */
export function Question({
  id,
  n,
  prompt,
  title,
  answer,
  children,
}: {
  id: string
  n: string
  prompt: string
  title: string
  answer: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="q" id={id} aria-labelledby={`${id}-h`}>
      <header className="q__head">
        <span className="q__n">{n}</span>
        <div>
          <h2 className="q__title" id={`${id}-h`}>
            {title}
          </h2>
          <p className="q__prompt">
            <span className="visually-hidden">Challenge question: </span>
            {prompt}
          </p>
        </div>
      </header>
      <div className="q__answer prose">{answer}</div>
      {children && <div className="q__evidence">{children}</div>}
    </section>
  )
}

/** Page frame for a challenge: halyard rail + content column. */
export function ChallengePage({ stops, children }: { stops: HalyardStop[]; children: ReactNode }) {
  return (
    <div className="cp">
      <Halyard stops={stops} />
      <div className="cp__main">{children}</div>
    </div>
  )
}
