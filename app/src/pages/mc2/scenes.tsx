import { useEffect, useMemo, useRef } from 'react'
import { Flag } from '../../components/Flag'
import { VERDICT_FLAG } from '../../lib/signals'
import { BUNDLE_FLAG } from './charts'
import { nice, type BundleRec, type CompaniesTop, type Pair, type PairVerdict } from './data'
import { FONT_MONO, FONT_UI, HEX, glowSprite, haloText, monthLabel, prefersReducedMotion, prng, runLoop, type Loop } from './stage'

/* The other scenes of the MC2 scroll story. Each one is a lit view of one
   claim; the stage crossfades between them. */

/* ═════════ Lifespans: shippers stay lit, receivers flicker out ═════════ */

/** Companies represented by one light. */
const PER_CO = 50
const LIFE_MONTH_S = 0.14

type Hist = CompaniesTop['lifespan_histogram']

function spans(hist: Hist, counts: number[], seed: number) {
  const total = counts.reduce((a, b) => a + b, 0)
  const nLights = Math.max(1, Math.round(total / PER_CO))
  const rnd = prng(seed)
  const out: { L: number; b: number; x: number; y: number; tw: number }[] = []
  let cum = 0
  let bin = 0
  for (let k = 0; k < nLights; k++) {
    const q = (k + 0.5) / nLights
    while (bin < counts.length - 1 && q > (cum + counts[bin]) / total) cum += counts[bin++]
    const lo = hist.bins[bin]
    const hi = hist.bins[bin + 1]
    const frac = (q - cum / total) / (counts[bin] / total || 1)
    const L = Math.max(1, lo + frac * (hi - lo))
    out.push({ L, b: rnd() * (84 - L), x: rnd(), y: rnd(), tw: rnd() * 6.28 })
  }
  return out
}

export function LifeScene({ hist, fishOnly, labels, active }: { hist: Hist; fishOnly: boolean; labels: { shipper: [string, string]; receiver: [string, string] }; active: boolean }) {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const loopRef = useRef<Loop | null>(null)
  const lights = useMemo(
    () => ({
      shipper: spans(hist, fishOnly ? hist.shipper_fish_majority : hist.shipper, 3),
      receiver: spans(hist, fishOnly ? hist.receiver_fish_majority : hist.receiver, 5),
    }),
    [hist, fishOnly],
  )
  const labelRef = useRef(labels)
  labelRef.current = labels

  useEffect(() => loopRef.current?.setActive(active), [active])

  useEffect(() => {
    const cv = cvRef.current
    if (!cv) return
    const sBlue = glowSprite(HEX.litBlue, 0.85)
    const sRose = glowSprite(HEX.litRose, 0.85)
    let T = 0
    const draw = ({ g, w, h, dt, still }: { g: CanvasRenderingContext2D; w: number; h: number; dt: number; still: boolean }) => {
      if (!still) T = (T + dt / LIFE_MONTH_S) % 90
      const now = Math.min(T, 84)
      const x0 = 16
      const x1 = w - 16
      const bands: [typeof lights.shipper, number, number, HTMLCanvasElement, [string, string]][] = [
        [lights.shipper, h * 0.11, h * 0.43, sBlue, labelRef.current.shipper],
        [lights.receiver, h * 0.53, h * 0.85, sRose, labelRef.current.receiver],
      ]
      const size = Math.max(2.4, Math.min(4.2, w / 260))
      for (const [ls, y0, y1, spr, [name, sub]] of bands) {
        g.globalCompositeOperation = 'lighter'
        for (const p of ls) {
          let a: number
          if (still) a = 0.1 + 0.9 * (p.L / 84)
          else {
            const t = now - p.b
            if (t < 0 || t > p.L) continue
            const ramp = Math.min(0.5, p.L / 3)
            a = Math.min(1, t / ramp, (p.L - t) / ramp) * (0.85 + 0.15 * Math.sin(T * 2 + p.tw))
          }
          const x = x0 + p.x * (x1 - x0)
          const y = y0 + 22 + p.y * (y1 - y0 - 22)
          const R = size * 2.6
          g.globalAlpha = a
          g.drawImage(spr, x - R, y - R, R * 2, R * 2)
        }
        haloText(g, name, x0, y0, HEX.ink, `600 14px ${FONT_UI}`)
        g.font = `600 14px ${FONT_UI}`
        const nw = g.measureText(name).width
        haloText(g, sub, x0 + nw + 10, y0, HEX.ink2, `400 12px ${FONT_MONO}`)
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
        const x = x0 + ((y * 12) / 84) * (x1 - x0)
        g.beginPath()
        g.moveTo(x, ya - 3)
        g.lineTo(x, ya + 3)
        g.stroke()
        if (y < 7 && (w > 480 || y % 2 === 0)) haloText(g, String(2028 + y), x + 4, ya + 12, HEX.ink3, `400 12px ${FONT_UI}`)
      }
      if (still) {
        haloText(g, 'Brightness = share of the 84 months the company trades', x1, ya - 12, HEX.ink3, `400 12px ${FONT_UI}`, 'right')
      } else {
        const px = x0 + (now / 84) * (x1 - x0)
        g.strokeStyle = HEX.moon
        g.globalAlpha = 0.8
        g.beginPath()
        g.moveTo(px, ya - 8)
        g.lineTo(px, ya + 2)
        g.stroke()
        haloText(g, monthLabel(Math.min(83, Math.floor(now))), Math.min(Math.max(px, x0 + 40), x1 - 40), ya - 16, HEX.moon, `400 12px ${FONT_MONO}`, 'center')
      }
    }
    const loop = runLoop(cv, draw)
    loop.setActive(active)
    loopRef.current = loop
    return () => loop.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lights])

  return (
    <canvas
      ref={cvRef}
      className="mc2-scene__cv"
      role="img"
      aria-label={`Each light is about ${PER_CO} companies, lit for as many months as it trades. ${labels.shipper.join(', ')}. ${labels.receiver.join(', ')}.`}
    />
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
                <span className="mc2-hold__lamps" aria-hidden>
                  {Array.from({ length: c.counts[r] }, (_, i) => (
                    <i key={i} />
                  ))}
                </span>
              </div>
            ))}
          </section>
        ))}
      </div>
      <p className="mc2-hold__foot">{footnote}</p>
    </div>
  )
}

