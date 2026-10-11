import { useEffect, useMemo, useRef, useState } from 'react'
import { StageKey } from '../../components/Story'
import { HEX, FONT_DISPLAY, FONT_UI, glowSprite, haloText, monthLabel, prefersReducedMotion, prng, runLoop, type Loop } from './stage'

/* Currents: Oceanus's trade as an ocean gyre. Countries ring the hub (bearing
   and radius from currents.json); each of the 80 largest country flows is a
   curved current, and lights travel along it at a rate proportional to that
   flow's shipments in the current month. Fish burns amber, all other goods
   bioluminescent teal. Drawn additively on one canvas, sprites cached. */

export interface CurrentsData {
  aspect: number
  months: [string, string]
  countries: [string, number, number, number, number, number][]
  unknown: number
  flows: [number, number, number, number, number[]][]
  monthly: { all: number[]; fish: number[] }
  counts: { edges_dedup: number; top_flows_share_of_international: number; domestic_shipments: number }
}

/** Shipments represented by one travelling light. */
export const PER_LIGHT = 200
const MONTH_SECONDS = 0.6
const MAX_PARTS = 4000

interface Geo {
  cx: number
  cy: number
  nodes: { x: number; y: number; r: number; name: string; total: number; label: boolean; ang: number }[]
  curves: { x0: number; y0: number; cx: number; cy: number; x1: number; y1: number; len: number; width: number; nx: number; ny: number; path: Path2D }[]
  hubR: number
}

export function Currents({
  data,
  variant,
  fish = false,
  active = true,
  ariaLabel,
}: {
  data: CurrentsData
  variant: 'hero' | 'stage'
  /** Light fish in amber and dim everything else. */
  fish?: boolean
  /** Inactive scenes stop their loop (the stage crossfades between scenes). */
  active?: boolean
  ariaLabel: string
}) {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const loopRef = useRef<Loop | null>(null)
  const fishRef = useRef(fish)
  const monthRef = useRef(0)
  const playRef = useRef(true)
  const [playing, setPlaying] = useState(true)
  const rewarmRef = useRef<() => void>(() => {})
  const ui = useRef<{ month?: HTMLElement | null; ship?: HTMLElement | null; share?: HTMLElement | null; range?: HTMLInputElement | null; head?: SVGLineElement | null; per?: HTMLElement | null }>({})

  const hub = useMemo(() => {
    let best = 0
    data.countries.forEach((c, i) => {
      if (c[3] + c[4] > data.countries[best][3] + data.countries[best][4]) best = i
    })
    return best
  }, [data])

  const share = useMemo(() => data.monthly.fish.map((f, i) => f / data.monthly.all[i]), [data])

  useEffect(() => {
    fishRef.current = fish
    loopRef.current?.redraw()
  }, [fish])

  useEffect(() => {
    loopRef.current?.setActive(active)
  }, [active])

  useEffect(() => {
    const cv = cvRef.current
    if (!cv) return
    const reduce = prefersReducedMotion()
    const rnd = prng(11)
    const flows = data.flows
    const F = flows.length
    const maxShip = Math.max(...flows.map((f) => f[2]))
    const avgShare = data.monthly.fish.reduce((a, b) => a + b, 0) / data.monthly.all.reduce((a, b) => a + b, 0)
    const used = new Set<number>([hub])
    flows.forEach((f) => (used.add(f[0]), used.add(f[1])))
    const H = data.countries[hub]
    const radii = [...used].filter((i) => i !== hub).map((i) => Math.hypot(data.countries[i][1] - H[1], data.countries[i][2] - H[2]))
    const rMin = Math.min(...radii)
    const rMax = Math.max(...radii)
    const byTrade = [...used].filter((i) => i !== hub).sort((a, b) => data.countries[b][3] + data.countries[b][4] - (data.countries[a][3] + data.countries[a][4]))
    const candidates = byTrade.slice(0, 8)
    let placed: { x: number; y: number; right: boolean; name: string }[] | null = null

    const sTeal = glowSprite(HEX.litTeal, 0.7)
    const sAmber = glowSprite(HEX.litAmber, 0.9)
    const sMoon = glowSprite(HEX.moon, 0.9)
    const sNode = glowSprite(HEX.ink3, 0.4)

    // particle pool (struct of arrays)
    const pf = new Uint16Array(MAX_PARTS)
    const pt = new Float32Array(MAX_PARTS)
    const pv = new Float32Array(MAX_PARTS)
    const ps = new Float32Array(MAX_PARTS)
    const pl = new Float32Array(MAX_PARTS)
    const pk = new Uint8Array(MAX_PARTS)
    let n = 0
    const acc = new Float32Array(F)
    let geo: Geo | null = null
    let fishMix = fishRef.current ? 1 : 0
    let shown = -1
    let per = PER_LIGHT

    const fishProb = (f: number, m: number) => Math.min(1, flows[f][3] * (share[m] / avgShare))
    const spawn = (f: number, m: number, t: number) => {
      if (n >= MAX_PARTS || !geo) return
      const c = geo.curves[f]
      pf[n] = f
      pt[n] = t
      pv[n] = (variant === 'hero' ? 46 : 62) * (0.75 + rnd() * 0.5) / c.len
      ps[n] = 0.8 + rnd() * 0.7
      pl[n] = (rnd() - 0.5) * 2
      pk[n] = rnd() < fishProb(f, m) ? 1 : 0
      n++
    }
    /** Fill the currents as they would be after running for a while. */
    const warm = () => {
      n = 0
      if (!geo) return
      const m = Math.floor(monthRef.current)
      for (let f = 0; f < F; f++) {
        const c = geo.curves[f]
        const rate = flows[f][4][m] / per / MONTH_SECONDS
        const life = c.len / ((variant === 'hero' ? 46 : 62))
        const k = Math.round(rate * life)
        for (let i = 0; i < k; i++) spawn(f, m, rnd())
      }
    }

    const layout = (w: number, h: number) => {
      // the hero has no stated scale, so a small phone scene can run denser
      per = variant === 'stage' ? (w < 720 ? PER_LIGHT * 2 : PER_LIGHT) : w < 720 ? PER_LIGHT / 2 : PER_LIGHT
      let cx: number, cy: number, R: number, sx: number
      if (variant === 'hero') {
        // the band gives the gyre a region of its own: centre it and fill it
        cx = w * 0.52
        cy = h * 0.47
        sx = w > h * 1.2 ? 1.35 : 1
        R = Math.min((w * 0.4) / sx, h * 0.36)
      } else {
        cx = w / 2
        cy = h * 0.47
        R = Math.min(w * 0.36, h * 0.36)
        sx = w > h * 1.25 ? 1.3 : 1
      }
      const pos = new Map<number, { x: number; y: number }>()
      pos.set(hub, { x: cx, y: cy })
      const nodes: Geo['nodes'] = [{ x: cx, y: cy, r: 0, name: H[0], total: H[3] + H[4], label: true, ang: 0 }]
      for (const i of used) {
        if (i === hub) continue
        const c = data.countries[i]
        const dx = c[1] - H[1]
        const dy = c[2] - H[2]
        const ang = Math.atan2(dy, dx)
        const rn = (Math.hypot(dx, dy) - rMin) / (rMax - rMin || 1)
        const rr = R * (0.6 + 0.4 * rn)
        const p = { x: cx + Math.cos(ang) * rr * sx, y: cy - Math.sin(ang) * rr }
        pos.set(i, p)
        nodes.push({ ...p, r: 1 + Math.sqrt((c[3] + c[4]) / 2e6) * 7, name: c[0], total: c[3] + c[4], label: candidates.includes(i), ang })
      }
      const curves = flows.map((f) => {
        const a = pos.get(f[0])!
        const b = pos.get(f[1])!
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d = Math.hypot(dx, dy) || 1
        // every current bends the same way round the hub: a gyre
        const nx = -dy / d
        const ny = dx / d
        const k = d * 0.32
        const ccx = (a.x + b.x) / 2 + nx * k
        const ccy = (a.y + b.y) / 2 + ny * k
        const path = new Path2D()
        path.moveTo(a.x, a.y)
        path.quadraticCurveTo(ccx, ccy, b.x, b.y)
        return { x0: a.x, y0: a.y, cx: ccx, cy: ccy, x1: b.x, y1: b.y, len: d * 1.12, width: 0.6 + 7 * Math.sqrt(f[2] / maxShip), nx, ny, path }
      })
      geo = { cx, cy, nodes, curves, hubR: Math.max(10, R * 0.07) }
      if (ui.current.per) ui.current.per.textContent = String(per)
      placed = null
      warm()
    }

    const draw = ({ g, w, h, dt, still }: { g: CanvasRenderingContext2D; w: number; h: number; dt: number; still: boolean }) => {
      if (!geo) layout(w, h)
      const G = geo!
      // advance time
      if (!still && playRef.current) monthRef.current = (monthRef.current + dt / MONTH_SECONDS) % 84
      const m = Math.floor(monthRef.current)
      const target = fishRef.current ? 1 : 0
      fishMix = still ? target : fishMix + (target - fishMix) * Math.min(1, dt * 2.6)

      // spawn by this month's volume
      if (!still) {
        for (let f = 0; f < F; f++) {
          acc[f] += (flows[f][4][m] / per / MONTH_SECONDS) * dt
          while (acc[f] >= 1) {
            acc[f] -= 1
            spawn(f, m, 0)
          }
        }
      }

      g.globalCompositeOperation = 'lighter'
      g.lineCap = 'round'
      // the currents themselves
      for (let f = 0; f < F; f++) {
        const c = G.curves[f]
        const fs = flows[f][3]
        const base = 0.05 + 0.1 * Math.sqrt(flows[f][2] / maxShip)
        g.globalAlpha = base * (1 - 0.55 * fishMix)
        g.strokeStyle = HEX.teal
        g.lineWidth = c.width
        g.stroke(c.path)
        if (fishMix > 0.01) {
          g.globalAlpha = fishMix * (0.05 + 0.45 * fs)
          g.strokeStyle = HEX.amber
          g.lineWidth = Math.max(0.8, c.width * Math.sqrt(fs))
          g.stroke(c.path)
        }
      }
      // countries
      for (const nd of G.nodes) {
        if (nd.r === 0) continue
        const R = nd.r * 3.2
        g.globalAlpha = 0.7
        g.drawImage(sNode, nd.x - R, nd.y - R, R * 2, R * 2)
      }
      // travelling lights
      const tealA = 0.62 * (1 - 0.72 * fishMix)
      const amberA = 0.8 + 0.2 * fishMix
      const amberS = 1 + 0.55 * fishMix
      for (let i = n - 1; i >= 0; i--) {
        if (!still) pt[i] += pv[i] * dt
        const t = pt[i]
        if (t >= 1) {
          n--
          pf[i] = pf[n]
          pt[i] = pt[n]
          pv[i] = pv[n]
          ps[i] = ps[n]
          pl[i] = pl[n]
          pk[i] = pk[n]
          continue
        }
        const c = G.curves[pf[i]]
        const u = 1 - t
        const off = pl[i] * c.width * 0.6
        const x = u * u * c.x0 + 2 * u * t * c.cx + t * t * c.x1 + c.nx * off
        const y = u * u * c.y0 + 2 * u * t * c.cy + t * t * c.y1 + c.ny * off
        const edge = Math.min(1, t * 10, u * 6)
        const fishy = pk[i] === 1
        const R = ps[i] * (fishy ? 5.5 * amberS : 4.6)
        g.globalAlpha = (fishy ? amberA : tealA) * edge
        g.drawImage(fishy ? sAmber : sTeal, x - R, y - R, R * 2, R * 2)
      }
      // the hub
      const hr = G.hubR
      g.globalAlpha = 0.55
      g.drawImage(sMoon, G.cx - hr * 3, G.cy - hr * 3, hr * 6, hr * 6)
      g.globalAlpha = 0.9
      g.drawImage(sMoon, G.cx - hr, G.cy - hr, hr * 2, hr * 2)

      // labels
      haloText(g, 'Oceanus', G.cx, G.cy + hr * 2.4 + 6, HEX.ink, `italic 500 ${variant === 'hero' ? 20 : 18}px ${FONT_DISPLAY}`, 'center')
      if (!placed) {
        // greedy: biggest traders first, skip any label that would collide
        placed = []
        const max = w < 560 ? 3 : variant === 'hero' ? 5 : 6
        const boxes: [number, number, number, number][] = [[G.cx - 44, G.cy + G.hubR * 2.4 - 6, G.cx + 44, G.cy + G.hubR * 2.4 + 20]]
        g.font = `500 12px ${FONT_UI}`
        for (const nd of G.nodes) {
          if (placed.length >= max) break
          if (!nd.label || nd.r === 0) continue
          const right = Math.cos(nd.ang) >= 0
          const tw = g.measureText(nd.name).width
          const x = nd.x + (right ? nd.r * 2 + 8 : -(nd.r * 2 + 8))
          const b: [number, number, number, number] = right ? [x - 2, nd.y - 9, x + tw + 2, nd.y + 9] : [x - tw - 2, nd.y - 9, x + 2, nd.y + 9]
          if (b[0] < 4 || b[2] > w - 4) continue
          if (boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) continue
          boxes.push(b)
          placed.push({ x, y: nd.y, right, name: nd.name })
        }
      }
      for (const l of placed) haloText(g, l.name, l.x, l.y, HEX.ink2, `500 12px ${FONT_UI}`, l.right ? 'left' : 'right')

      // readout: DOM writes only when the month changes
      if (m !== shown) {
        shown = m
        const u = ui.current
        if (u.month) u.month.textContent = monthLabel(m)
        if (u.ship) u.ship.textContent = data.monthly.all[m].toLocaleString('en-US')
        if (u.share) u.share.textContent = `${(share[m] * 100).toFixed(1)}%`
        if (u.range && document.activeElement !== u.range) u.range.value = String(m)
        if (u.head) u.head.setAttribute('transform', `translate(${(m / 83) * 100} 0)`)
      }
    }

    rewarmRef.current = warm
    const loop = runLoop(cv, draw, (w, h) => layout(w, h))
    loop.setActive(active)
    loopRef.current = loop
    if (reduce) {
      playRef.current = false
      setPlaying(false)
    }
    return () => {
      loop.destroy()
      loopRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, hub, share, variant])

  const scrub = (v: number) => {
    monthRef.current = v
    playRef.current = false
    setPlaying(false)
    if (prefersReducedMotion()) rewarmRef.current()
    loopRef.current?.redraw()
  }
  const toggle = () => {
    playRef.current = !playRef.current
    setPlaying(playRef.current)
  }

  // fish-share sparkline (static), 0..100 wide, 0..24 tall
  const spark = useMemo(() => {
    const lo = Math.min(...share)
    const hi = Math.max(...share)
    return share.map((s, i) => `${i ? 'L' : 'M'}${((i / 83) * 100).toFixed(2)} ${(22 - ((s - lo) / (hi - lo)) * 20).toFixed(2)}`).join('')
  }, [share])

  return (
    <div className={`mc2-cur mc2-cur--${variant}`} data-fish={fish}>
      <canvas ref={cvRef} className="mc2-cur__cv" role="img" aria-label={ariaLabel} />
      {variant === 'stage' && (
        <div className="stage-head">
          <StageKey
            items={[
              { color: HEX.litTeal, label: 'All goods' },
              { color: HEX.litAmber, label: 'Fish' },
            ]}
          />
          <p className="stage-count">
            one light ≈ <b ref={(el) => void (ui.current.per = el)}>{PER_LIGHT}</b> shipments
          </p>
        </div>
      )}
      {variant === 'stage' && (
        <div className="mc2-cur__ui">
          <div className="mc2-cur__read" aria-live="off">
            <span className="mc2-cur__month" ref={(el) => void (ui.current.month = el)}>
              Jan 2028
            </span>
            <span className="mc2-cur__sub">
              <span>
                <b ref={(el) => void (ui.current.ship = el)}>60,194</b> shipments
              </span>
              <span className="mc2-cur__fish">
                fish <b ref={(el) => void (ui.current.share = el)}>12.7%</b>
              </span>
            </span>
          </div>
          <div className="mc2-cur__scrub">
            <button type="button" className="mc2-cur__play" onClick={toggle} aria-label={playing ? 'Pause the months' : 'Play the months'}>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                {playing ? <path d="M3.5 2.5v9M10.5 2.5v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : <path d="M4 2.2v9.6L11.5 7z" fill="currentColor" />}
              </svg>
            </button>
            <div className="mc2-cur__track">
              <svg className="mc2-cur__spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden>
                <path d={spark} vectorEffect="non-scaling-stroke" />
                <line ref={(el) => void (ui.current.head = el)} x1={0} x2={0} y1={0} y2={24} vectorEffect="non-scaling-stroke" />
              </svg>
              <input
                ref={(el) => void (ui.current.range = el)}
                type="range"
                min={0}
                max={83}
                step={1}
                defaultValue={0}
                aria-label="Month shown, January 2028 to December 2034"
                onInput={(e) => scrub(Number((e.target as HTMLInputElement).value))}
              />
              <span className="mc2-cur__ends" aria-hidden>
                <span>2028</span>
                <span>fish share of shipments</span>
                <span>2034</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
