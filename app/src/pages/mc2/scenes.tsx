import { useEffect, useMemo, useRef } from 'react'
import { Flag } from '../../components/Flag'
import { StageKey } from '../../components/Story'
import { VERDICT_FLAG } from '../../lib/signals'
import { BUNDLE_FLAG } from './charts'
import { nice, type BundleRec, type CompaniesTop, type Pair, type PairVerdict } from './data'
import { FONT_MONO, FONT_UI, HEX, glowSprite, haloText, monthLabel, prefersReducedMotion, prng, runLoop, type Loop } from './stage'

/* The other scenes of the MC2 scroll story. Each one is a lit view of one
   claim; the stage crossfades between them. */

/* ═════════ Lifespans: shippers burn long, receivers spark ═════════
   Each light is about 50 companies, drawn as a trail along the 84-month axis
   from its first month of trade to its last, in two bands: shippers above,
   receivers below, each trail at its own height in the band like a ship's
   light in a long exposure. At rest every trail is drawn at its full span, so
   the claim is visible at once: shippers draw long streaks across the years,
   receivers are mostly sparks. A one-month company is a spark only; the
   long-lived receiver minority is dimmed so the typical receiver dominates.
   The two median spans are marked on the time axis. A replay button sweeps
   the years month by month; it is never the default state.

   Trail length is the measured span (lifespan histogram); where a trail
   starts is modelled from the lifecycle counts (persistent and exited traders
   of a year or more start in the first month, entrants run to the last month,
   shorter-lived and transient traders sit in between). */

/** Companies represented by one trail. */
const PER_CO = 50
const LIFE_MONTH_S = 0.06
/** Receivers trading longer than this are the dimmed minority. */
const LONG_RECEIVER = 12

type Hist = CompaniesTop['lifespan_histogram']
type Cycle = Record<string, number>

function trails(hist: Hist, counts: number[], cycle: Cycle, seed: number) {
  const total = counts.reduce((a, b) => a + b, 0)
  const nLights = Math.max(1, Math.round(total / PER_CO))
  const rnd = prng(seed)
  const w = { early: (cycle.persistent ?? 0) + (cycle.exited ?? 0), entrant: cycle.entrant ?? 0, transient: cycle.transient ?? 0 }
  const out: { L: number; b: number; row: number }[] = []
  let cum = 0
  let bin = 0
  for (let k = 0; k < nLights; k++) {
    const q = (k + 0.5) / nLights
    while (bin < counts.length - 1 && q > (cum + counts[bin]) / total) cum += counts[bin++]
    const lo = hist.bins[bin]
    const hi = hist.bins[bin + 1]
    const frac = (q - cum / total) / (counts[bin] / total || 1)
    const L = Math.min(84, Math.max(1, Math.round(lo + frac * (hi - lo))))
    let b: number
    if (L >= 81) b = 0
    else {
      // spans that cannot touch both ends: pick a lifecycle by its share
      const t = rnd() * (w.early + w.entrant + w.transient || 1)
      const mid = 1 + Math.floor(rnd() * Math.max(1, 83 - L))
      b = t < w.early ? (L >= 12 ? 0 : mid) : t < w.early + w.entrant ? 84 - L : mid
    }
    out.push({ L, b, row: 0 })
  }
  // rows scattered through the band (deterministic), like long-exposure ship lights
  out.forEach((p) => (p.row = 0.02 + rnd() * 0.96))
  return out
}

export function LifeScene({
  hist,
  cycles,
  fishOnly,
  labels,
  medians,
  replay,
  active,
}: {
  hist: Hist
  cycles: { shipper: Cycle; receiver: Cycle }
  fishOnly: boolean
  labels: { shipper: [string, string]; receiver: [string, string] }
  /** Median spans in months, marked on the axis (null hides the marks). */
  medians: { shipper: number; receiver: number } | null
  /** Bump to sweep the years once from 2028; 0 = rest. */
  replay: number
  active: boolean
}) {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const loopRef = useRef<Loop | null>(null)
  const lights = useMemo(
    () => ({
      shipper: trails(hist, fishOnly ? hist.shipper_fish_majority : hist.shipper, cycles.shipper, 3),
      receiver: trails(hist, fishOnly ? hist.receiver_fish_majority : hist.receiver, cycles.receiver, 5),
    }),
    [hist, fishOnly, cycles],
  )
  const labelRef = useRef(labels)
  labelRef.current = labels
  const medRef = useRef(medians)
  medRef.current = medians
  const sweep = useRef({ on: false, T: 84 })

  // at rest the scene is a still frame; only a replay runs the loop
  useEffect(() => {
    if (!active) sweep.current = { on: false, T: 84 }
    loopRef.current?.setActive(active && sweep.current.on)
    loopRef.current?.redraw()
  }, [active, medians])

  useEffect(() => {
    if (!replay || !active || prefersReducedMotion()) return
    sweep.current = { on: true, T: 0 }
    loopRef.current?.setActive(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay])

  useEffect(() => {
    const cv = cvRef.current
    if (!cv) return
    const sBlue = glowSprite(HEX.litBlue, 0.85)
    const sRose = glowSprite(HEX.litRose, 0.85)
    const draw = ({ g, w, h, dt, still }: { g: CanvasRenderingContext2D; w: number; h: number; dt: number; still: boolean }) => {
      const S = sweep.current
      if (S.on && !still) {
        S.T = Math.min(84, S.T + dt / LIFE_MONTH_S)
        if (S.T >= 84) {
          S.on = false
          // the sweep is done: hold the full frame and stop the loop
          queueMicrotask(() => loopRef.current?.setActive(false))
        }
      }
      const now = S.on ? S.T : 84
      const x0 = 16
      const x1 = w - 16
      const X = (m: number) => x0 + (m / 84) * (x1 - x0)
      const bands: ['shipper' | 'receiver', typeof lights.shipper, number, number, string, HTMLCanvasElement, [string, string]][] = [
        ['shipper', lights.shipper, Math.max(h * 0.14, 68), h * 0.47, HEX.litBlue, sBlue, labelRef.current.shipper],
        ['receiver', lights.receiver, h * 0.53, h * 0.82, HEX.litRose, sRose, labelRef.current.receiver],
      ]
      const head = Math.max(1.8, Math.min(2.8, w / 360))
      for (const [role, ls, y0, y1, col, spr, [name, sub]] of bands) {
        const top = y0 + 20
        const span = y1 - top
        const rec = role === 'receiver'
        g.globalCompositeOperation = 'lighter'
        g.lineCap = 'round'
        g.strokeStyle = col
        // trails of more than a month, lit as far as the playhead has reached;
        // long-lived receivers are the dim minority
        const stroke = (keep: (L: number) => boolean, alpha: number, width: number) => {
          g.globalAlpha = alpha
          g.lineWidth = width
          g.beginPath()
          for (const p of ls) {
            if (p.L < 2 || !keep(p.L) || now <= p.b) continue
            const y = top + p.row * span
            g.moveTo(X(p.b), y)
            g.lineTo(X(Math.min(p.b + p.L, now)), y)
          }
          g.stroke()
        }
        if (rec) {
          // brightness falls with span: the typical (short) receiver dominates
          stroke((L) => L > LONG_RECEIVER, 0.06, 1)
          stroke((L) => L > 3 && L <= LONG_RECEIVER, 0.3, 1.2)
          stroke((L) => L <= 3, 0.75, 1.6)
        } else stroke(() => true, 0.34, 1.2)
        // a light at each trail's tip: one-month traders are a spark only
        for (const p of ls) {
          if (now <= p.b) continue
          if (rec && p.L > LONG_RECEIVER) continue
          const end = p.b + p.L
          const alive = S.on && now < end
          const spark = p.L === 1
          const x = spark ? X(p.b + 0.5) : X(Math.min(end, now))
          const y = top + p.row * span
          const R = head * (alive ? 2.6 : spark ? 2.6 : 1.7)
          g.globalAlpha = alive ? 0.85 : spark ? 0.95 : rec ? (p.L <= 3 ? 0.6 : 0.3) : 0.4
          g.drawImage(spr, x - R, y - R, R * 2, R * 2)
        }
        haloText(g, name, x0, y0, HEX.ink, `600 14px ${FONT_UI}`)
        g.font = `600 14px ${FONT_UI}`
        const nw = g.measureText(name).width
        if (w - x0 - nw - 10 > g.measureText(sub).width) haloText(g, sub, x0 + nw + 10, y0, HEX.ink2, `400 12px ${FONT_MONO}`)
      }
      // time axis
      const ya = h * 0.93
      g.globalCompositeOperation = 'source-over'
      g.globalAlpha = 1
      g.strokeStyle = HEX.ruleStrong
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(x0, ya)
      g.lineTo(x1, ya)
      g.stroke()
      for (let y = 0; y <= 7; y++) {
        const x = X(y * 12)
        g.beginPath()
        g.moveTo(x, ya - 3)
        g.lineTo(x, ya + 3)
        g.stroke()
        if (y < 7 && (w > 480 || y % 2 === 0)) haloText(g, String(2028 + y), x + 4, ya + 12, HEX.ink3, `400 12px ${FONT_UI}`)
      }
      // the two median spans, measured from the axis origin: 59 months vs 3
      const med = medRef.current
      if (med) {
        const mark = (m: number, y: number, c: string, text: string) => {
          g.globalAlpha = 1
          g.strokeStyle = c
          g.lineWidth = 2
          g.beginPath()
          g.moveTo(X(0), y)
          g.lineTo(X(m), y)
          g.stroke()
          g.lineWidth = 1
          g.beginPath()
          g.moveTo(X(0), y - 4)
          g.lineTo(X(0), y + 4)
          g.moveTo(X(m), y - 4)
          g.lineTo(X(m), y + 4)
          g.stroke()
          haloText(g, text, X(m) + 8, y, c, `500 12px ${FONT_UI}`)
        }
        const narrow = w < 480
        mark(med.shipper, ya - 30, HEX.litBlue, narrow ? `median ${med.shipper} mo` : `Shippers’ median span · ${med.shipper} months`)
        mark(med.receiver, ya - 14, HEX.litRose, narrow ? `median ${med.receiver} mo` : `Receivers’ median span · ${med.receiver} months`)
      }
      if (S.on && now < 84) {
        const px = X(now)
        g.strokeStyle = HEX.moon
        g.globalAlpha = 0.6
        g.lineWidth = 1
        g.beginPath()
        g.moveTo(px, Math.max(h * 0.14, 68) + 14)
        g.lineTo(px, ya + 2)
        g.stroke()
        haloText(g, monthLabel(Math.min(83, Math.floor(now))), Math.min(Math.max(px, x0 + 40), x1 - 40), ya - 46, HEX.moon, `400 12px ${FONT_MONO}`, 'center')
      }
    }
    const loop = runLoop(cv, draw)
    loop.setActive(active && sweep.current.on)
    loopRef.current = loop
    return () => loop.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lights])

  return (
    <>
      <canvas
        ref={cvRef}
        className="mc2-scene__cv"
        role="img"
        aria-label={`Each trail is about ${PER_CO} companies, drawn from its first month of trade to its last; length is the measured span, start month is modelled from the lifecycle counts. One-month companies are single sparks; receivers trading more than a year are dimmed. ${labels.shipper.join(', ')}. ${labels.receiver.join(', ')}.${medians ? ` Median span: shippers ${medians.shipper} months, receivers ${medians.receiver}.` : ''}`}
      />
      <div className="stage-head">
        <StageKey
          items={[
            { color: HEX.litBlue, label: 'Shipper trail', line: true },
            { color: HEX.litRose, label: 'Receiver trail', line: true },
            { color: HEX.litRose, label: 'One month only' },
          ]}
        />
        <p className="stage-count">
          one trail ≈ <b>{PER_CO}</b> companies
        </p>
      </div>
    </>
  )
}

/* ═════════ Handover: one buyer goes dark, another ignites ═════════ */

const PLAY_S = 6

export function HandoverScene({ pair, active }: { pair: Pair; active: boolean }) {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const loopRef = useRef<Loop | null>(null)
  const restart = useRef<() => void>(() => {})

  useEffect(() => {
    if (active) restart.current()
    loopRef.current?.setActive(active)
  }, [active])

  useEffect(() => {
    const cv = cvRef.current
    if (!cv) return
    const ev = pair.evidence
    const reduce = prefersReducedMotion()
    const act = [pair.pred.first_month, pair.succ.last_month, ...ev.shared_partners.flatMap((s) => [s.pred_last_month, s.succ_first_month])]
    const m0 = Math.max(0, Math.min(...act) - 3)
    const m1 = Math.min(84, Math.max(...act) + 4)
    const stop = pair.pred.last_month
    const start = pair.succ.first_month
    const rnd = prng(19)
    const dots = (monthly: number[]) =>
      monthly.flatMap((c, m) => Array.from({ length: c }, () => ({ m, fx: 0.15 + rnd() * 0.7, fy: (rnd() + rnd() + rnd()) / 1.5 - 1, tw: rnd() * 6.28 })))
    const oldDots = dots(ev.pred_monthly)
    const newDots = dots(ev.succ_monthly)
    const sMoon = glowSprite(HEX.moon, 0.8)
    const sAmber = glowSprite(HEX.litAmber, 0.95)
    let p = reduce ? m1 : m0
    let clock = 0
    restart.current = () => {
      p = reduce ? m1 : m0
    }

    const draw = ({ g, w, h, dt, still }: { g: CanvasRenderingContext2D; w: number; h: number; dt: number; still: boolean }) => {
      if (!still) {
        p = Math.min(m1, p + (dt * (m1 - m0)) / PLAY_S)
        clock += dt
      }
      const x0 = 16
      const x1 = w - 16
      const X = (m: number) => x0 + ((m - m0) / (m1 - m0)) * (x1 - x0)
      const cw = (x1 - x0) / (m1 - m0)
      const yOld = h * 0.34
      const yNew = h * 0.64
      const spread = Math.min(h * 0.075, 34)
      const dim = Math.min(1, Math.max(0, (p - (stop + 1)) / 3))
      const R = Math.max(2.4, Math.min(4, cw * 0.38))

      // lanes: a thread of light under each company's months of trade
      g.globalCompositeOperation = 'lighter'
      g.lineCap = 'round'
      const lane = (a: number, b: number, y: number, col: string, alpha: number) => {
        if (b < a) return
        g.globalAlpha = alpha
        g.strokeStyle = col
        g.lineWidth = 1.5
        g.beginPath()
        g.moveTo(X(a), y)
        g.lineTo(X(b + 1), y)
        g.stroke()
      }
      lane(pair.pred.first_month, Math.min(stop, p), yOld, HEX.moon, 0.4 * (1 - 0.6 * dim))
      if (p >= start) lane(start, Math.min(pair.succ.last_month, p), yNew, HEX.litAmber, 0.45)

      // shipments, one light each, ignited by the playhead
      const lightUp = (d: { m: number; fx: number; fy: number; tw: number }[], y: number, spr: HTMLCanvasElement, base: number) => {
        for (const s of d) {
          if (s.m < m0 || s.m >= m1) continue
          const since = p - s.m
          if (since < 0) continue
          const a = Math.min(1, since / 0.6) * base * (0.85 + 0.15 * Math.sin(clock * 2.2 + s.tw))
          const x = X(s.m) + s.fx * cw
          const yy = y + s.fy * spread
          g.globalAlpha = a
          g.drawImage(spr, x - R * 2.6, yy - R * 2.6, R * 5.2, R * 5.2)
        }
      }
      lightUp(oldDots, yOld, sMoon, 0.9 * (1 - 0.65 * dim))
      lightUp(newDots, yNew, sAmber, 1)

      // the shared shippers switch over: an arc from last-with-old to first-with-new
      ev.shared_partners.forEach((s, k) => {
        if (p < s.succ_first_month) return
        const ax = X(s.pred_last_month + 0.5)
        const bx = X(s.succ_first_month + 0.5)
        const ay = yOld + spread * 1.1
        const by = yNew - spread * 1.1
        // leave the old lane heading forward in time, then drop to the new one
        const cx = bx
        const cy = ay
        const a = Math.min(1, (p - s.succ_first_month) / 0.8)
        g.globalCompositeOperation = 'lighter'
        g.globalAlpha = 0.55 * a
        g.strokeStyle = HEX.moon
        g.lineWidth = 1.2
        g.beginPath()
        g.moveTo(ax, ay)
        g.quadraticCurveTo(cx, cy, bx, by)
        g.stroke()
        // a light carried along the arc
        const t = ((clock * 0.6 + k * 0.21) % 1 + 1) % 1
        const u = 1 - t
        const qx = u * u * ax + 2 * u * t * cx + t * t * bx
        const qy = u * u * ay + 2 * u * t * cy + t * t * by
        g.globalAlpha = a * Math.min(1, t * 6, u * 6)
        g.drawImage(sAmber, qx - 6, qy - 6, 12, 12)
        // ends: circle = last with the old company, square = first with the new
        g.globalCompositeOperation = 'source-over'
        g.globalAlpha = a
        g.strokeStyle = HEX.moon
        g.lineWidth = 1.5
        g.beginPath()
        g.arc(ax, ay, 3.5, 0, Math.PI * 2)
        g.stroke()
        g.fillStyle = HEX.litAmber
        g.fillRect(bx - 3.5, by - 3.5, 7, 7)
      })

      // stop / start marker
      g.globalCompositeOperation = 'source-over'
      const xs = X(stop + 1)
      if (p >= stop + 1) {
        g.globalAlpha = 0.7
        g.strokeStyle = HEX.moon
        g.setLineDash([3, 4])
        g.lineWidth = 1
        g.beginPath()
        g.moveTo(xs, yOld - spread - 14)
        g.lineTo(xs, yNew + spread + 14)
        g.stroke()
        g.setLineDash([])
        g.font = `400 12px ${FONT_MONO}`
        const right = xs + 6 + g.measureText(`last shipment ${monthLabel(stop)}`).width < w - 8
        // narrow: no room right of the line, so the label sits at the right edge, level with the lane name
        if (right) haloText(g, `last shipment ${monthLabel(stop)}`, xs + 6, yOld - spread - 8, HEX.ink2, `400 12px ${FONT_MONO}`, 'left')
        else haloText(g, `last ${monthLabel(stop)}`, x1, yOld - spread - 34, HEX.ink2, `400 12px ${FONT_MONO}`, 'right')
        if (p >= start) haloText(g, `first ${monthLabel(start)}`, xs + (right ? 6 : -6), yNew + spread + 8, HEX.litAmber, `400 12px ${FONT_MONO}`, right ? 'left' : 'right')
      }

      // lane labels
      haloText(g, nice(pair.predecessor), x0, yOld - spread - 34, dim > 0.5 ? HEX.ink2 : HEX.ink, `600 14px ${FONT_UI}`)
      haloText(g, `old · ${pair.pred.shipments} shipments`, x0, yOld - spread - 16, HEX.ink3, `400 12px ${FONT_MONO}`)
      haloText(g, nice(pair.successor), x0, yNew + spread + 22, p >= start ? HEX.litAmber : HEX.ink3, `600 14px ${FONT_UI}`)
      haloText(g, `new · ${pair.succ.shipments} shipments`, x0, yNew + spread + 40, HEX.ink3, `400 12px ${FONT_MONO}`)
      if (p >= start + 1) {
        const n = ev.shared_partners.length
        const lx = X(stop + 1) - 10
        haloText(g, `${n} shared shippers`, lx, (yOld + yNew) / 2 - 8, HEX.moon, `500 12px ${FONT_UI}`, 'right')
        haloText(g, 'switch to the new buyer', lx, (yOld + yNew) / 2 + 9, HEX.ink2, `400 12px ${FONT_UI}`, 'right')
      }

      // axis
      const ya = Math.min(h - 24, yNew + spread + 76)
      g.globalAlpha = 1
      g.strokeStyle = HEX.ruleStrong
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(x0, ya)
      g.lineTo(x1, ya)
      g.stroke()
      for (let m = Math.ceil(m0 / 12) * 12; m < m1; m += 12) {
        const x = X(m)
        g.beginPath()
        g.moveTo(x, ya - 3)
        g.lineTo(x, ya + 3)
        g.stroke()
        haloText(g, String(2028 + m / 12), x + 4, ya + 12, HEX.ink3, `400 12px ${FONT_UI}`)
      }
      if (p < m1) {
        const px = X(p)
        g.strokeStyle = HEX.moon
        g.globalAlpha = 0.5
        g.beginPath()
        g.moveTo(px, yOld - spread - 8)
        g.lineTo(px, ya)
        g.stroke()
        haloText(g, monthLabel(Math.floor(p)), Math.min(Math.max(px, x0 + 36), x1 - 36), ya - 12, HEX.moon, `400 12px ${FONT_MONO}`, 'center')
      }
    }
    const loop = runLoop(cv, draw)
    loop.setActive(active)
    loopRef.current = loop
    return () => loop.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair])

  return (
    <canvas
      ref={cvRef}
      className="mc2-scene__cv"
      role="img"
      aria-label={`${nice(pair.predecessor)} buys until ${monthLabel(pair.pred.last_month)}; ${nice(pair.successor)} starts ${monthLabel(pair.succ.first_month)}, supplied by ${pair.evidence.shared_partners.length} of the same shippers. One light per shipment.`}
    />
  )
}

/* ═════════ Bundles: twelve predictions, five lit ═════════ */

const BUNDLE_LIT: Record<BundleRec['verdict'], string> = { Reliable: HEX.litBlue, Questionable: HEX.litAmber, Unreliable: HEX.litRose }

function BundleDots({ b }: { b: BundleRec }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const paint = () => {
      const w = cv.clientWidth
      const h = cv.clientHeight
      if (!w || !h) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      const g = cv.getContext('2d')!
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, w, h)
      const N = b.metrics.links
      const D = b.metrics.distinct_links
      const s = Math.sqrt((w * h) / N)
      const cols = Math.max(1, Math.floor(w / s))
      const step = w / cols
      const spr = glowSprite(BUNDLE_LIT[b.verdict], 0.9)
      for (let i = 0; i < N; i++) {
        const x = (i % cols) * step + step / 2
        const y = Math.floor(i / cols) * step + step / 2
        if (i < D) {
          g.globalCompositeOperation = 'lighter'
          g.globalAlpha = 0.95
          const R = Math.max(2.5, step * 0.62)
          g.drawImage(spr, x - R, y - R, R * 2, R * 2)
        } else {
          g.globalCompositeOperation = 'source-over'
          g.globalAlpha = 0.6
          g.strokeStyle = HEX.ink3
          g.lineWidth = 1
          g.beginPath()
          g.arc(x, y, Math.max(1, step * 0.2), 0, Math.PI * 2)
          g.stroke()
        }
      }
    }
    const ro = new ResizeObserver(paint)
    ro.observe(cv)
    return () => ro.disconnect()
  }, [b])
  return <canvas ref={ref} className="mc2-bun__cv" aria-hidden />
}

export function BundleScene({ bundles, active }: { bundles: BundleRec[]; active: boolean }) {
  const order = [...bundles].sort((a, b) => a.rank - b.rank)
  let reliable = 0
  return (
    <div className="mc2-bun" data-on={active}>
      <ol className="mc2-bun__grid" aria-label="The twelve predicted-link bundles">
        {order.map((b) => {
          const rel = b.verdict === 'Reliable'
          const i = rel ? reliable++ : 0
          return (
            <li key={b.bundle} className="mc2-bun__cell" data-rel={rel} style={{ ['--i' as string]: i }}>
              <span className="mc2-bun__name">
                <Flag code={BUNDLE_FLAG[b.verdict]} size={14} decorative />
                <span>{b.bundle}</span>
              </span>
              <BundleDots b={b} />
              <span className="mc2-bun__meta">
                <span className="visually-hidden">{b.verdict}, score </span>
                {b.score.toFixed(2)}
                {b.gates_failed.length ? '*' : ''} · {b.metrics.distinct_links}/{b.metrics.links}
                <span className="visually-hidden"> distinct links</span>
              </span>
            </li>
          )
        })}
      </ol>
      <p className="mc2-bun__key">
        <span className="mc2-bun__k mc2-bun__k--lit" aria-hidden /> distinct link
        <span className="mc2-bun__k mc2-bun__k--ghost" aria-hidden /> repeated row
        <span className="mc2-bun__note">score · distinct / all links; * a gate overrides the score</span>
      </p>
    </div>
  )
}

/* ═════════ Verdicts hold: the flagged pairs survive the new links ═════════ */

/** One glowing lamp per flagged pair, ten to a row, drawn like every other
    light in the story (additive glow sprites on a canvas). */
function HoldLamps({ n, color }: { n: number; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const COLS = 10
    const paint = () => {
      const w = cv.clientWidth
      if (!w) return
      const cell = w / COLS
      const rows = Math.max(1, Math.ceil(n / COLS))
      const h = rows * cell
      cv.style.height = `${h}px`
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      const g = cv.getContext('2d')!
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, w, h)
      g.globalCompositeOperation = 'lighter'
      const spr = glowSprite(color, 0.95)
      const R = cell * 0.62
      for (let i = 0; i < n; i++) {
        const x = (i % COLS) * cell + cell / 2
        const y = Math.floor(i / COLS) * cell + cell / 2
        g.globalAlpha = 1
        g.drawImage(spr, x - R, y - R, R * 2, R * 2)
      }
    }
    const ro = new ResizeObserver(paint)
    ro.observe(cv)
    return () => ro.disconnect()
  }, [n, color])
  return <canvas ref={ref} className="mc2-hold__cv" aria-hidden />
}

export function VerdictScene({
  columns,
  footnote,
  active,
}: {
  columns: { label: string; sub: string; counts: Record<PairVerdict, number> }[]
  footnote: string
  active: boolean
}) {
  const rows: PairVerdict[] = ['Suspect', 'Possible']
  return (
    <div className="mc2-hold" data-on={active}>
      <div className="mc2-hold__cols">
        {columns.map((c, ci) => (
          <section key={c.label} className="mc2-hold__col" style={{ ['--c' as string]: ci }} aria-label={`${c.label}: ${rows.map((r) => `${c.counts[r]} ${r}`).join(', ')}`}>
            <h4 className="mc2-hold__h">{c.label}</h4>
            <p className="mc2-hold__sub">{c.sub}</p>
            {rows.map((r) => (
              <div key={r} className="mc2-hold__row" data-v={r}>
                <span className="mc2-hold__lab">
                  <Flag code={VERDICT_FLAG[r]} size={14} decorative />
                  {r} <b>{c.counts[r]}</b>
                </span>
                <HoldLamps n={c.counts[r]} color={r === 'Suspect' ? HEX.litRose : HEX.litAmber} />
              </div>
            ))}
          </section>
        ))}
      </div>
      <p className="mc2-hold__foot">{footnote}</p>
    </div>
  )
}

