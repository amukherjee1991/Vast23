import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

/* One tooltip for the whole app, positioned in viewport coordinates.
   Emil: delay only the first one; once open, neighbours switch instantly. */

interface Tip {
  x: number
  y: number
  content: ReactNode
}
interface TipApi {
  show: (e: { clientX: number; clientY: number }, content: ReactNode) => void
  hide: () => void
}

const Ctx = createContext<TipApi>({ show: () => {}, hide: () => {} })
export const useTooltip = () => useContext(Ctx)

export function TooltipProvider({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const [instant, setInstant] = useState(false)
  const hideTimer = useRef<number | undefined>(undefined)

  const show = useCallback<TipApi['show']>((e, content) => {
    window.clearTimeout(hideTimer.current)
    setTip((prev) => {
      setInstant(prev !== null)
      return { x: e.clientX, y: e.clientY, content }
    })
  }, [])
  const hide = useCallback(() => {
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setTip(null), 80)
  }, [])

  let left = 0
  let top = 0
  let flipX = false
  if (tip) {
    flipX = tip.x > window.innerWidth - 300
    left = flipX ? tip.x - 14 : tip.x + 14
    top = Math.min(tip.y + 14, window.innerHeight - 40)
  }

  return (
    <Ctx.Provider value={{ show, hide }}>
      {children}
      {tip && (
        <div
          className={`tooltip${instant ? ' tooltip--instant' : ''}`}
          style={{ left, top, transform: flipX ? 'translateX(-100%)' : undefined }}
          role="status"
        >
          {tip.content}
        </div>
      )}
    </Ctx.Provider>
  )
}
