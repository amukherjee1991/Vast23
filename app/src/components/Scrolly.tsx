import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface ScrollyStep {
  id: string
  title?: string
  body: ReactNode
}

/** A sticky stage with story steps scrolling past it. The step nearest the
    middle of the viewport is active; the stage renders for that step. Steps
    are real content (claims inside them stay buttons), the stage is the
    evidence. On phones the stage pins above the steps, never under them. */
export function Scrolly({
  steps,
  stage,
  label,
  onStep,
}: {
  steps: ScrollyStep[]
  stage: (active: number) => ReactNode
  label: string
  onStep?: (i: number) => void
}) {
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
      { rootMargin: '-48% 0px -48% 0px' },
    )
    refs.current.forEach((el) => el && io.observe(el))
    return () => io.disconnect()
  }, [steps.length])

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
