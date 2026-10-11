import * as d3 from 'd3'
import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react'

/* GlowStage: a canvas that draws thousands of marks as light on the night sea.
   Marks are drawn additively from cached glow sprites, so dense regions bloom.
   Callers describe a target state (per-node alpha / scale / colour, per-edge
   alpha, which position set, a camera box, labels); the stage eases every value
   toward it over --t-story and then stops drawing. Reduced motion snaps. */

export interface GlowNode {
  /** Position set A, normalised 0..1. */
  x: number
  y: number
  /** Optional position set B for morphs (null = node leaves in B). */
  x2?: number | null
  y2?: number | null
  r: number
  color: string
}
export interface GlowEdge {
  s: number
  t: number
  color: string
  width?: number
  dash?: boolean
}
export interface GlowLabel {
  i: number
  text: string
  /** Draw in the lamp colour of the node instead of moonlight. */
  lamp?: boolean
  /** Which side of the node the text sits on (default 'right'). */
  align?: 'left' | 'right'
  /** Story lettering: Bodoni Moda italic (weight 500, 17px) instead of the
      12px Archivo data label, for naming structures in the stage. */
  serif?: boolean
  /** A second, smaller line under a serif label (Archivo 12px, secondary ink). */
  sub?: string
  /** Offset of the text from the node in CSS px. Past 14px a hairline leader
      runs from the node to the text. */
  dx?: number
  dy?: number
  /** Text colour override (hex). */
  color?: string
  /** The label shows while its node is at least this bright (default 0.3). */
  minAlpha?: number
  /** Callout column: every label with this flag is set in one column just
      past the right-most of their lights, in the lights' top-to-bottom order
      and spaced so they never touch, each with a leader to its light. */
  column?: boolean
}
/** A thin lamp-coloured ring around node i (e.g. a verdict), drawn over the
    glow without additive blending; it fades with the node. */
export interface GlowRing {
  i: number
  color: string
  /** Ring radius in CSS px (defaults to 9). */
  r?: number
}
export interface GlowState {
  nodeAlpha: (i: number) => number
  nodeScale?: (i: number) => number
  nodeColor?: (i: number) => string
  edgeAlpha: (e: GlowEdge, j: number) => number
  /** Which position set to show; 'b' morphs to x2/y2 and fades nodes without one. */
  positions?: 'a' | 'b'
  /** Normalised box to frame: [x0, y0, x1, y1]. Defaults to the whole sky. */
  camera?: [number, number, number, number]
  labels?: GlowLabel[]
  /** Transition length in ms (defaults to the story duration). */
  duration?: number
  /** Rings around nodes, drawn over the glow (optional). */
  rings?: GlowRing[]
  /** Optional per-edge start delay as a fraction (0..0.9) of the duration, so
      a path can be traced edge by edge. Defaults to 0. */
  edgeDelay?: (e: GlowEdge, j: number) => number
  /** Optional per-node start delay as a fraction (0..0.9) of the duration, so
      a change can ripple (e.g. outward from the centre). Defaults to 0. */
  nodeDelay?: (i: number) => number
  /** Easing of this transition: 'inOut' (default) for camera moves and
      relights, 'out' when the motion should start the moment the step lands
      (e.g. a morph the reader is waiting for). */
  ease?: 'inOut' | 'out'
}
export interface GlowStageHandle {
  /** Screen position of node i in CSS pixels relative to the canvas, if visible. */
  project: (i: number) => { x: number; y: number } | null
}

const sprites = new Map<string, HTMLCanvasElement>()
function sprite(color: string): HTMLCanvasElement {
  const key = color
  let c = sprites.get(key)
  if (c) return c
  c = document.createElement('canvas')
  const S = 64
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.12, color)
  grad.addColorStop(0.32, withAlpha(color, 0.42))
  grad.addColorStop(1, withAlpha(color, 0))
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  sprites.set(key, c)
  return c
}
function withAlpha(hex: string, a: number) {
  const c = d3.color(hex)
  if (!c) return hex
  c.opacity = a
  return c.formatRgb()
}

const labelKey = (L: GlowLabel) => `${L.i}|${L.text}`

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const EASE = { inOut: d3.easeCubicInOut, out: d3.easeCubicOut } as const

export const GlowStage = forwardRef<
  GlowStageHandle,
  {
    nodes: GlowNode[]
    edges: GlowEdge[]
    state: GlowState
    ariaLabel: string
    onHover?: (i: number | null, e?: PointerEvent) => void
    onSelect?: (i: number) => void
    /** Sprite radius multiplier: how far each light blooms. */
    bloom?: number
    className?: string
    /** First paint: 'fade' (default) fades in place; 'bloom' also grows the
        sky out of the camera centre over 1.6 s. Reduced motion snaps. */
    intro?: 'fade' | 'bloom'
  }
>(function GlowStage({ nodes, edges, state, ariaLabel, onHover, onSelect, bloom = 3.2, className, intro = 'fade' }, ref) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const anim = useRef({
    n: 0,
    from: { a: new Float32Array(0), s: new Float32Array(0), x: new Float32Array(0), y: new Float32Array(0) },
    to: { a: new Float32Array(0), s: new Float32Array(0), x: new Float32Array(0), y: new Float32Array(0) },
    cur: { a: new Float32Array(0), s: new Float32Array(0), x: new Float32Array(0), y: new Float32Array(0) },
    eFrom: new Float32Array(0),
    eTo: new Float32Array(0),
    eCur: new Float32Array(0),
    delay: new Float32Array(0),
    colors: [] as string[],
    cam: [0, 0, 1, 1] as number[],
    camFrom: [0, 0, 1, 1] as number[],
    camTo: [0, 0, 1, 1] as number[],
    t0: 0,
    dur: 1200,
    ease: EASE.inOut as (t: number) => number,
    raf: 0,
    w: 0,
    h: 0,
    dpr: 1,
    labels: [] as GlowLabel[],
    labelsFrom: new Set<string>(),
    rings: [] as GlowRing[],
    ringsFrom: [] as GlowRing[],
    eDelay: new Float32Array(0),
    colorsFrom: [] as string[],
    k: 1,
    tree: null as d3.Quadtree<number> | null,
  })
  const cb = useRef({ onHover, onSelect })
  cb.current = { onHover, onSelect }

  const toScreen = (x: number, y: number) => {
    const A = anim.current
    const [x0, y0, x1, y1] = A.cam
    const pad = 28
    const sw = (A.w - pad * 2) / Math.max(1e-6, x1 - x0)
    const sh = (A.h - pad * 2) / Math.max(1e-6, y1 - y0)
    const k = Math.min(sw, sh)
    const ox = (A.w - (x1 - x0) * k) / 2
    const oy = (A.h - (y1 - y0) * k) / 2
    return [ox + (x - x0) * k, oy + (y - y0) * k, k] as const
  }

  useImperativeHandle(ref, () => ({
    project: (i) => {
      const A = anim.current
      if (i < 0 || i >= A.n || A.cur.a[i] < 0.05) return null
      const [x, y] = toScreen(A.cur.x[i], A.cur.y[i])
      return { x, y }
    },
  }))

  function draw() {
    const A = anim.current
    const cv = canvas.current
    if (!cv) return
    const g = cv.getContext('2d')!
    g.setTransform(A.dpr, 0, 0, A.dpr, 0, 0)
    g.clearRect(0, 0, A.w, A.h)
    g.globalCompositeOperation = 'lighter'
    const [, , kk] = toScreen(0, 0)
    // edges
    g.lineCap = 'round'
    for (let j = 0; j < edges.length; j++) {
      const a = A.eCur[j]
      if (a < 0.01) continue
      const e = edges[j]
      const sa = A.cur.a[e.s]
      const ta = A.cur.a[e.t]
      if (sa < 0.02 || ta < 0.02) continue
      const [x1, y1] = toScreen(A.cur.x[e.s], A.cur.y[e.s])
      const [x2, y2] = toScreen(A.cur.x[e.t], A.cur.y[e.t])
      g.globalAlpha = a * Math.min(sa, ta)
      g.strokeStyle = e.color
      g.lineWidth = e.width ?? 0.8
      g.setLineDash(e.dash ? [3, 3] : [])
      g.beginPath()
      g.moveTo(x1, y1)
      g.lineTo(x2, y2)
      g.stroke()
    }
    g.setLineDash([])
    // nodes
    const zoom = Math.max(0.6, Math.min(2.4, kk / 600))
    for (let i = 0; i < A.n; i++) {
      const a = A.cur.a[i]
      if (a < 0.01) continue
      const [x, y] = toScreen(A.cur.x[i], A.cur.y[i])
      if (x < -40 || y < -40 || x > A.w + 40 || y > A.h + 40) continue
      const r = nodes[i].r * A.cur.s[i] * zoom
      const R = r * bloom
      const c0 = A.colorsFrom[i]
      if (A.k < 1 && c0 && c0 !== A.colors[i]) {
        // colour change: cross-fade the two lights
        g.globalAlpha = a * (1 - A.k)
        g.drawImage(sprite(c0), x - R, y - R, R * 2, R * 2)
        g.globalAlpha = a * A.k
      } else g.globalAlpha = a
      g.drawImage(sprite(A.colors[i]), x - R, y - R, R * 2, R * 2)
    }
    // rings: thin lamp circles over the glow, cross-faded between states
    if (A.rings.length || A.ringsFrom.length) {
      g.globalCompositeOperation = 'source-over'
      g.lineWidth = 1.5
      const drawRing = (R: GlowRing, f: number) => {
        const a = A.cur.a[R.i] * f
        if (!(a > 0.02)) return
        const [x, y] = toScreen(A.cur.x[R.i], A.cur.y[R.i])
        g.globalAlpha = a
        g.strokeStyle = R.color
        g.beginPath()
        g.arc(x, y, R.r ?? 9, 0, Math.PI * 2)
        g.stroke()
      }
      const now = new Set(A.rings.map((R) => R.i))
      const was = new Set(A.ringsFrom.map((R) => R.i))
      for (const R of A.ringsFrom) if (!now.has(R.i)) drawRing(R, 1 - A.k)
      for (const R of A.rings) drawRing(R, was.has(R.i) ? 1 : A.k)
    }
    // labels: moonlight text with a water halo; new ones fade in with the move
    g.globalCompositeOperation = 'source-over'
    g.textBaseline = 'middle'
    g.lineJoin = 'round'
    const SERIF = 'italic 500 17px "Bodoni Moda", Didot, Georgia, serif'
    const SANS = '500 12px Archivo, ui-sans-serif, system-ui, sans-serif'
    // lay out the callout column first (screen space, so it holds at any size)
    const colPos = new Map<GlowLabel, [number, number, boolean]>()
    const col = A.labels.filter((L) => L.column && A.cur.a[L.i] >= (L.minAlpha ?? 0.3))
    if (col.length) {
      const pts = col.map((L) => ({ L, p: toScreen(A.cur.x[L.i], A.cur.y[L.i]) })).sort((a, b) => a.p[1] - b.p[1])
      const gap = A.w < 560 ? 26 : 44
      g.font = SERIF
      const tw = Math.max(...col.map((L) => g.measureText(L.text).width))
      // the column sits right of the lights, or left of them if it would leave the stage
      const flip = Math.max(...pts.map((d) => d.p[0])) + gap + tw > A.w - 8
      const cx = flip ? Math.min(...pts.map((d) => d.p[0])) - gap : Math.max(...pts.map((d) => d.p[0])) + gap
      const step = A.w < 480 ? 24 : 38
      const ys = pts.map((d) => d.p[1])
      // centre the stack on the lights, then push apart top to bottom
      for (let k = 1; k < ys.length; k++) ys[k] = Math.max(ys[k], ys[k - 1] + step)
      const shift = (pts.reduce((t, d) => t + d.p[1], 0) - ys.reduce((t, y) => t + y, 0)) / ys.length
      pts.forEach((d, k) => colPos.set(d.L, [cx, ys[k] + shift - (A.w < 480 ? 0 : 6), flip]))
    }
    for (const L of A.labels) {
      if (A.cur.a[L.i] < (L.minAlpha ?? 0.3)) continue
      const fade = A.labelsFrom.has(labelKey(L)) ? 1 : A.k
      if (fade < 0.02) continue
      const [x, y] = toScreen(A.cur.x[L.i], A.cur.y[L.i])
      g.font = L.serif ? SERIF : SANS
      const tw = g.measureText(L.text).width
      const cp = colPos.get(L)
      const off = cp != null || L.dx != null || L.dy != null
      const ox = cp ? cp[0] - x : L.dx ?? 0
      const oy = cp ? cp[1] - y : L.dy ?? 0
      // flip left when asked, or when the label would run off the right edge
      let left = (cp ? cp[2] : L.align === 'left') || (L.align == null && !off && x + 10 + tw > A.w - 4)
      let tx = off ? x + ox : left ? x - 10 : x + 10
      if (off && !cp) {
        // an offset label that would leave the stage swings to the other side
        const wide = Math.max(tw, L.sub && A.w >= 480 ? g.measureText(L.sub).width * 0.8 : 0)
        if (!left && tx + wide > A.w - 8) {
          left = true
          tx = x - Math.abs(ox)
        } else if (left && tx - wide < 8) {
          left = false
          tx = x + Math.abs(ox)
        }
      }
      const ty = y + oy
      if (off && Math.hypot(ox, oy) > 14) {
        // a hairline leader from the light to the lettering
        g.globalAlpha = 0.55 * fade
        g.strokeStyle = '#7d95a8'
        g.lineWidth = 1
        g.beginPath()
        g.moveTo(x + Math.sign(ox) * 4, y + Math.sign(oy) * 4)
        g.lineTo(tx - (left ? -4 : 4), ty)
        g.stroke()
      }
      g.globalAlpha = fade
      g.textAlign = left ? 'end' : 'start'
      g.strokeStyle = 'rgba(5,12,20,0.92)'
      g.lineWidth = 4
      g.strokeText(L.text, tx, ty)
      g.fillStyle = L.color ?? (L.lamp ? A.colors[L.i] : '#e7eff6')
      g.fillText(L.text, tx, ty)
      if (L.sub && A.w >= 480) {
        g.font = '400 12px Archivo, ui-sans-serif, system-ui, sans-serif'
        const sy = ty + 16
        g.strokeText(L.sub, tx, sy)
        g.fillStyle = '#a8bccc'
        g.fillText(L.sub, tx, sy)
      }
    }
    g.globalAlpha = 1
  }

  function rebuildTree() {
    const A = anim.current
    const idx: number[] = []
    for (let i = 0; i < A.n; i++) if (A.cur.a[i] > 0.2) idx.push(i)
    A.tree = d3
      .quadtree<number>()
      .x((i) => toScreen(A.cur.x[i], A.cur.y[i])[0])
      .y((i) => toScreen(A.cur.x[i], A.cur.y[i])[1])
      .addAll(idx)
  }

  function tick(now: number) {
    const A = anim.current
    const p = A.dur <= 0 ? 1 : Math.min(1, (now - A.t0) / A.dur)
    const ease = A.ease
    const k = ease(p)
    A.k = k
    for (let i = 0; i < A.n; i++) {
      const d = A.delay[i]
      const ki = d > 0 ? ease(Math.max(0, Math.min(1, (p - d) / (1 - d)))) : k
      A.cur.a[i] = A.from.a[i] + (A.to.a[i] - A.from.a[i]) * ki
      A.cur.s[i] = A.from.s[i] + (A.to.s[i] - A.from.s[i]) * ki
      A.cur.x[i] = A.from.x[i] + (A.to.x[i] - A.from.x[i]) * ki
      A.cur.y[i] = A.from.y[i] + (A.to.y[i] - A.from.y[i]) * ki
    }
    for (let j = 0; j < A.eCur.length; j++) {
      const d = A.eDelay[j] ?? 0
      const kj = d > 0 ? ease(Math.max(0, Math.min(1, (p - d) / (1 - d)))) : k
      A.eCur[j] = A.eFrom[j] + (A.eTo[j] - A.eFrom[j]) * kj
    }
    for (let c = 0; c < 4; c++) A.cam[c] = A.camFrom[c] + (A.camTo[c] - A.camFrom[c]) * k
    draw()
    if (p < 1) A.raf = requestAnimationFrame(tick)
    else {
      A.raf = 0
      rebuildTree()
    }
  }

  // (Re)target whenever the data or the requested state changes.
  useEffect(() => {
    const A = anim.current
    const n = nodes.length
    const fresh = A.n !== n
    if (fresh) {
      A.n = n
      for (const set of [A.from, A.to, A.cur]) {
        set.a = new Float32Array(n)
        set.s = new Float32Array(n).fill(1)
        set.x = new Float32Array(n)
        set.y = new Float32Array(n)
      }
      A.delay = new Float32Array(n)
      nodes.forEach((d, i) => {
        A.cur.x[i] = d.x
        A.cur.y[i] = d.y
      })
    }
    if (A.eCur.length !== edges.length) {
      A.eFrom = new Float32Array(edges.length)
      A.eTo = new Float32Array(edges.length)
      A.eCur = new Float32Array(edges.length)
    }
    const useB = state.positions === 'b'
    A.colorsFrom = fresh ? [] : A.colors
    A.colors = nodes.map((d, i) => state.nodeColor?.(i) ?? d.color)
    for (let i = 0; i < n; i++) {
      A.from.a[i] = A.cur.a[i]
      A.from.s[i] = A.cur.s[i]
      A.from.x[i] = A.cur.x[i]
      A.from.y[i] = A.cur.y[i]
      const d = nodes[i]
      const gone = useB && (d.x2 == null || d.y2 == null)
      A.to.a[i] = gone ? 0 : Math.max(0, Math.min(1, state.nodeAlpha(i)))
      A.to.s[i] = state.nodeScale?.(i) ?? 1
      A.to.x[i] = useB && !gone ? (d.x2 as number) : d.x
      A.to.y[i] = useB && !gone ? (d.y2 as number) : d.y
      A.delay[i] = fresh || !state.nodeDelay ? 0 : Math.max(0, Math.min(0.9, state.nodeDelay(i)))
    }
    for (let j = 0; j < edges.length; j++) {
      A.eFrom[j] = A.eCur[j]
      A.eTo[j] = Math.max(0, Math.min(1, state.edgeAlpha(edges[j], j)))
    }
    if (A.eDelay.length !== edges.length) A.eDelay = new Float32Array(edges.length)
    for (let j = 0; j < edges.length; j++) A.eDelay[j] = fresh || !state.edgeDelay ? 0 : Math.max(0, Math.min(0.9, state.edgeDelay(edges[j], j)))
    A.ringsFrom = fresh ? [] : A.rings
    A.rings = state.rings ?? []
    A.camFrom = [...A.cam]
    A.camTo = state.camera ? [...state.camera] : [0, 0, 1, 1]
    A.labelsFrom = fresh ? new Set() : new Set(A.labels.map(labelKey))
    A.labels = state.labels ?? []
    A.dur = reduceMotion() || fresh ? 0 : state.duration ?? 1200
    A.ease = EASE[state.ease ?? 'inOut']
    A.t0 = performance.now()
    if (fresh) {
      // first paint: fade in quickly from darkness
      A.from.a.fill(0)
      A.eFrom.fill(0)
      A.dur = reduceMotion() ? 0 : 900
      A.camFrom = [...A.camTo]
      A.ease = EASE.inOut
      if (intro === 'bloom' && !reduceMotion()) {
        // grow out of the centre of the framed box
        const cx = (A.camTo[0] + A.camTo[2]) / 2
        const cy = (A.camTo[1] + A.camTo[3]) / 2
        for (let i = 0; i < n; i++) {
          A.from.x[i] = cx + (A.to.x[i] - cx) * 0.04
          A.from.y[i] = cy + (A.to.y[i] - cy) * 0.04
        }
        A.dur = 1600
      }
    }
    cancelAnimationFrame(A.raf)
    A.raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(A.raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, state])

  // Size to the wrapper, crisp on retina.
  useEffect(() => {
    const el = wrap.current
    const cv = canvas.current
    if (!el || !cv) return
    const ro = new ResizeObserver(() => {
      const A = anim.current
      A.dpr = Math.min(2, window.devicePixelRatio || 1)
      A.w = el.clientWidth
      A.h = el.clientHeight
      cv.width = Math.round(A.w * A.dpr)
      cv.height = Math.round(A.h * A.dpr)
      cv.style.width = `${A.w}px`
      cv.style.height = `${A.h}px`
      draw()
      rebuildTree()
    })
    ro.observe(el)
    // serif labels: redraw once the italic face has arrived
    let live = true
    document.fonts?.load('italic 500 17px "Bodoni Moda"').then(() => live && draw(), () => {})
    return () => {
      live = false
      ro.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const A = anim.current
    if (!A.tree || !cb.current.onHover) return
    const r = e.currentTarget.getBoundingClientRect()
    const hit = A.tree.find(e.clientX - r.left, e.clientY - r.top, 14)
    cb.current.onHover(hit ?? null, e.nativeEvent)
  }
  function onClick(e: React.PointerEvent<HTMLCanvasElement>) {
    const A = anim.current
    if (!A.tree || !cb.current.onSelect) return
    const r = e.currentTarget.getBoundingClientRect()
    const hit = A.tree.find(e.clientX - r.left, e.clientY - r.top, 16)
    if (hit != null) cb.current.onSelect(hit)
  }

  return (
    <div ref={wrap} className={className} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvas}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onMove}
        onPointerLeave={() => cb.current.onHover?.(null)}
        onClick={onClick}
        style={{ display: 'block', cursor: onSelect ? 'pointer' : 'default' }}
      />
    </div>
  )
})
