import { useEffect, useRef, type RefObject } from 'react'

/* DriftField: the home page's sea of trade lights. Each particle is one real
   sampled shipment from the customs graph, drifting east along slow currents;
   fish cargo burns amber, everything else bioluminescent teal. It only runs
   while on screen and holds a still frame under reduced motion. */

export interface DriftSeed {
  /** 0..1 position along the period (month index / months). */
  t: number
  fish: boolean
  /** 0..1 relative size (log weight). */
  w: number
}

const TEAL = [23, 169, 156]
const AMBER = [255, 201, 90]

export function DriftField({
  seeds,
  ariaLabel,
  lanes = [0.6, 0.92],
  avoid,
}: {
  seeds: DriftSeed[]
  ariaLabel: string
  /** Vertical extent of the currents, as fractions of the canvas height. */
  lanes?: [number, number]
  /** An element the lights must not cross (e.g. text over the field): lights
      fade almost out behind it, with a soft falloff at its edges. */
  avoid?: RefObject<HTMLElement | null>
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv || seeds.length === 0) return
    const g = cv.getContext('2d')!
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0
    let h = 0
    let dpr = 1
    let raf = 0
    let running = false
    let last = performance.now()

    // Deterministic pseudo-random so the sea looks the same on every visit.
    let s = 7
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    // Shipments travel in a few currents (bands) that curve with a long swell.
    const [l0, l1] = lanes
    const BANDS = [0, 1, 2, 3, 4].map((k) => l0 + ((l1 - l0) * k) / 4)
    const parts = seeds.map((d) => {
      const b = Math.floor(rnd() * BANDS.length)
      return {
        x: (d.t + rnd() * 0.08) % 1,
        lane: BANDS[b] + (rnd() - 0.5) * 0.045 * ((l1 - l0) / 0.32),
        band: b,
        phase: b * 1.7,
        speed: 0.014 + rnd() * 0.012 + (d.fish ? 0.004 : 0),
        fish: d.fish,
        r: 1 + d.w * 2.6,
        tw: rnd() * Math.PI * 2,
      }
    })

    // Pre-render one glow sprite per hue.
    const sprite = (rgb: number[]) => {
      const c = document.createElement('canvas')
      c.width = c.height = 48
      const sg = c.getContext('2d')!
      const gr = sg.createRadialGradient(24, 24, 0, 24, 24, 24)
      gr.addColorStop(0, 'rgba(255,255,255,0.95)')
      gr.addColorStop(0.15, `rgba(${rgb.join(',')},0.9)`)
      gr.addColorStop(0.4, `rgba(${rgb.join(',')},0.25)`)
      gr.addColorStop(1, `rgba(${rgb.join(',')},0)`)
      sg.fillStyle = gr
      sg.fillRect(0, 0, 48, 48)
      return c
    }
    const sTeal = sprite(TEAL)
    const sAmber = sprite(AMBER)

    // the quiet rect (canvas px) the lights fade out behind
    let quiet: { x0: number; y0: number; x1: number; y1: number } | null = null
    const FALL = 48
    const measureQuiet = () => {
      const el = avoid?.current
      if (!el) return (quiet = null)
      const a = el.getBoundingClientRect()
      const c = cv.getBoundingClientRect()
      quiet = { x0: a.left - c.left - 16, y0: a.top - c.top - 16, x1: a.right - c.left + 16, y1: a.bottom - c.top + 16 }
    }
    const hush = (x: number, y: number) => {
      if (!quiet) return 1
      const dx = Math.max(quiet.x0 - x, 0, x - quiet.x1)
      const dy = Math.max(quiet.y0 - y, 0, y - quiet.y1)
      const d = Math.hypot(dx, dy)
      return d >= FALL ? 1 : 0.06 + 0.94 * (d / FALL) ** 2
    }

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      w = cv.clientWidth
      h = cv.clientHeight
      measureQuiet()
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      frame(0)
    }

    function frame(dt: number) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (dt === 0) g.clearRect(0, 0, w, h)
      else {
        // fade the previous frame so each light leaves a short wake
        g.globalCompositeOperation = 'destination-out'
        g.globalAlpha = 1
        g.fillStyle = 'rgba(0,0,0,0.16)'
        g.fillRect(0, 0, w, h)
      }
      g.globalCompositeOperation = 'lighter'
      const now = performance.now() / 1000
      for (const p of parts) {
        p.x += p.speed * dt
        if (p.x > 1.05) p.x -= 1.1
        // currents: lanes bend gently with a long swell
        const y = p.lane * h + Math.sin(p.x * 5.2 + p.phase) * h * 0.03 + Math.sin(p.x * 13 + p.band) * h * 0.008
        const x = p.x * w
        const twinkle = 0.65 + 0.35 * Math.sin(now * 1.3 + p.tw)
        const R = p.r * (p.fish ? 3.6 : 2.6)
        g.globalAlpha = (p.fish ? 0.95 : 0.6) * twinkle * hush(x, y)
        g.drawImage(p.fish ? sAmber : sTeal, x - R, y - R, R * 2, R * 2)
      }
    }

    const loop = (t: number) => {
      const dt = Math.max(0, Math.min(0.05, (t - last) / 1000))
      last = t
      frame(dt)
      if (running) raf = requestAnimationFrame(loop)
    }
    const start = () => {
      if (running || reduce) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(loop)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(raf)
    }

    const ro = new ResizeObserver(resize)
    ro.observe(cv)
    if (avoid?.current) ro.observe(avoid.current)
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()))
    io.observe(cv)
    const vis = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', vis)
    resize()
    return () => {
      stop()
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', vis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seeds, lanes[0], lanes[1]])

  return <canvas ref={ref} role="img" aria-label={ariaLabel} style={{ display: 'block', width: '100%', height: '100%' }} />
}
