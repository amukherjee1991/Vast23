/* Canvas plumbing shared by the MC2 night-sea scenes (currents, lifespans,
   handover). One loop per canvas: DPR-aware, paused off screen, when the tab
   is hidden and when the scene is not the active one; under reduced motion it
   draws a single still frame. Nothing here renders React per frame. */

/** Canvas colours, copied from tokens.css (canvas cannot read CSS variables cheaply). */
export const HEX = {
  ground: '#07111b',
  abyss: '#050c14',
  ink: '#e7eff6',
  ink2: '#a8bccc',
  ink3: '#7d95a8',
  rule: '#1a2d40',
  ruleStrong: '#2a4157',
  moon: '#d6e4ff',
  teal: '#17a99c',
  amber: '#c4880c',
  rose: '#e04870',
  blue: '#5a80f0',
  litTeal: '#5ff2e2',
  litAmber: '#ffc95a',
  litRose: '#ff7a9a',
  litBlue: '#9cb6ff',
} as const

export const FONT_UI = '"Archivo", ui-sans-serif, system-ui, sans-serif'
export const FONT_MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace'
export const FONT_DISPLAY = '"Bodoni Moda", Didot, Georgia, serif'

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

const spriteCache = new Map<string, HTMLCanvasElement>()
/** A soft glow with a white-hot core, cached per colour. Drawn with 'lighter'. */
export function glowSprite(hex: string, core = 0.95): HTMLCanvasElement {
  const key = `${hex}|${core}`
  const hit = spriteCache.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const [r, gg, b] = rgb(hex)
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, `rgba(255,255,255,${core})`)
  gr.addColorStop(0.12, `rgba(${r},${gg},${b},0.95)`)
  gr.addColorStop(0.35, `rgba(${r},${gg},${b},0.32)`)
  gr.addColorStop(1, `rgba(${r},${gg},${b},0)`)
  g.fillStyle = gr
  g.fillRect(0, 0, 64, 64)
  spriteCache.set(key, c)
  return c
}

export const rgba = (hex: string, a: number) => {
  const [r, g, b] = rgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

/** Deterministic PRNG so each scene looks the same on every visit. */
export function prng(seed = 7) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export interface Frame {
  g: CanvasRenderingContext2D
  w: number
  h: number
  /** Seconds since the last frame (0 on a still frame). */
  dt: number
  /** True when drawing a single still frame (reduced motion, or paused redraw). */
  still: boolean
}

export interface Loop {
  setActive(on: boolean): void
  /** Redraw once now (after a data or mode change while paused). */
  redraw(): void
  destroy(): void
}

/** Run `draw` on `cv` while it is on screen, visible and active. `onResize`
    runs before the first frame and on every size change. */
export function runLoop(cv: HTMLCanvasElement, draw: (f: Frame) => void, onResize?: (w: number, h: number) => void): Loop {
  const g = cv.getContext('2d')!
  const reduce = prefersReducedMotion()
  let w = 0
  let h = 0
  let dpr = 1
  let raf = 0
  let running = false
  let onScreen = false
  let active = true
  let last = 0

  const paint = (dt: number, still: boolean) => {
    if (!w || !h) return
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = 1
    g.clearRect(0, 0, w, h)
    draw({ g, w, h, dt, still })
  }
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1)
    w = cv.clientWidth
    h = cv.clientHeight
    if (!w || !h) return
    cv.width = Math.round(w * dpr)
    cv.height = Math.round(h * dpr)
    onResize?.(w, h)
    paint(0, true)
  }
  const tick = (t: number) => {
    // rAF time can trail the performance.now() taken when the loop started:
    // never step backwards (a negative month would index off the data)
    const dt = Math.max(0, Math.min(0.05, (t - last) / 1000))
    last = t
    paint(dt, false)
    if (running) raf = requestAnimationFrame(tick)
  }
  const sync = () => {
    const go = onScreen && active && !document.hidden && !reduce
    if (go && !running) {
      running = true
      last = performance.now()
      raf = requestAnimationFrame(tick)
    } else if (!go && running) {
      running = false
      cancelAnimationFrame(raf)
    }
  }
  const ro = new ResizeObserver(resize)
  ro.observe(cv)
  const io = new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting
    sync()
  })
  io.observe(cv)
  document.addEventListener('visibilitychange', sync)
  resize()
  return {
    setActive(on) {
      active = on
      sync()
      if (!running) paint(0, true)
    },
    redraw() {
      if (!running) paint(0, true)
    },
    destroy() {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', sync)
    },
  }
}

/** Text with a dark halo so it reads over light. Font sizes are CSS px (≥ 12). */
export function haloText(g: CanvasRenderingContext2D, s: string, x: number, y: number, fill: string, font: string, align: CanvasTextAlign = 'left') {
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
  g.font = font
  g.textAlign = align
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  g.lineWidth = 4
  g.strokeStyle = 'rgba(5,12,20,0.9)'
  g.strokeText(s, x, y)
  g.fillStyle = fill
  g.fillText(s, x, y)
}

export const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthLabel = (m: number) => `${MONTH_ABBR[m % 12]} ${2028 + Math.floor(m / 12)}`
