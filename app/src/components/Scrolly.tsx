import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface ScrollyStep {
  id: string
  title?: string
  body: ReactNode
}

/** Where a step becomes active. Desktop: the viewport middle. Phones and
    tablets (≤960px): the stage pins under the header over roughly the top
    57% of the viewport, so the line sits just below it, where the reader's
    eye is. */
const LINE_WIDE = '-48% 0px -48% 0px'
const LINE_NARROW = '-68% 0px -31% 0px'
const NARROW = '(max-width: 960px)'

function useNarrow() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(NARROW).matches)
  useEffect(() => {
    const mq = window.matchMedia(NARROW)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}

/** A sticky stage with story steps scrolling past it. The step on the
    activation line is active; the stage renders for that step. Steps are real
    content (claims inside them stay buttons), the stage is the evidence. On
    phones the stage pins above the steps, never under them. */
export function Scrolly({
  steps,
  stage,
  label,
  onStep,
  rootMargin,
}: {
  steps: ScrollyStep[]
  stage: (active: number) => ReactNode
  label: string
  onStep?: (i: number) => void
  /** Override the activation line (IntersectionObserver rootMargin). */
  rootMargin?: string
}) {
  const narrow = useNarrow()
  const margin = rootMargin ?? (narrow ? LINE_NARROW : LINE_WIDE)
  const [active, setActive] = useState(0)
  const refs = useRef<(HTMLElement | null)[]>([])
  const onStepRef = useRef(onStep)
  onStepRef.current = onStep

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const i = Number((e.target as HTMLElement).dataset.step)
          setActive(i)
          onStepRef.current?.(i)
        }
      },
      { rootMargin: margin },
    )
    refs.current.forEach((el) => el && io.observe(el))
    return () => io.disconnect()
  }, [steps.length, margin])

  return (
    <section className="scrolly" aria-label={label}>
      <div className="scrolly__steps">
        {steps.map((s, i) => (
          <article
            key={s.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            data-step={i}
            data-active={active === i}
            className="step"
          >
            {s.title && <h3 className="step__title">{s.title}</h3>}
            <div className="step__body">{s.body}</div>
          </article>
        ))}
      </div>
      <div className="scrolly__stage">{stage(active)}</div>
    </section>
  )
}
