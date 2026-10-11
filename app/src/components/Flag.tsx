import { useId, type ReactNode } from 'react'

/* International Code of Signals flags, drawn flat on a 60×45 grid
   (pennants on 90×36). Colors are the flag cloth tokens; every flag
   carries the one even ink outline so yellow and white read on white. */

export type FlagCode =
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M'
  | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z'
  | 'P1' | 'P2' | 'P3'

/** What each flag means at sea — used for accessible names and tooltips. */
export const FLAG_MEANING: Record<FlagCode, string> = {
  A: 'Diver down', B: 'Dangerous cargo', C: 'Affirmative', D: 'Keep clear',
  E: 'Altering course to starboard', F: 'I am disabled', G: 'I require a pilot',
  H: 'Pilot on board', I: 'Altering course to port', J: 'On fire, keep clear',
  K: 'I wish to communicate', L: 'Stop your vessel instantly', M: 'My vessel is stopped',
  N: 'Negative', O: 'Man overboard', P: 'About to sail', Q: 'Request free pratique',
  R: 'Received', S: 'Engines going astern', T: 'Keep clear, pair trawling',
  U: 'You are running into danger', V: 'I require assistance', W: 'I require medical assistance',
  X: 'Stop and watch for my signals', Y: 'I am dragging my anchor', Z: 'I require a tug',
  P1: 'Numeral pennant one', P2: 'Numeral pennant two', P3: 'Numeral pennant three',
}

const R = 'var(--flag-red)'
const B = 'var(--flag-blue)'
const Y = 'var(--flag-yellow)'
const K = 'var(--flag-black)'
const W = 'var(--flag-white)'

const W0 = 60
const H0 = 45

function hStripes(colors: string[]): ReactNode {
  const h = H0 / colors.length
  return colors.map((c, i) => <rect key={i} x={0} y={i * h} width={W0} height={h + 0.2} fill={c} />)
}
function vStripes(colors: string[]): ReactNode {
  const w = W0 / colors.length
  return colors.map((c, i) => <rect key={i} x={i * w} y={0} width={w + 0.2} height={H0} fill={c} />)
}
function quarters(a: string, b: string): ReactNode {
  return (
    <>
      <rect width={W0} height={H0} fill={b} />
      <rect width={W0 / 2} height={H0 / 2} fill={a} />
      <rect x={W0 / 2} y={H0 / 2} width={W0 / 2} height={H0 / 2} fill={a} />
    </>
  )
}

function body(code: FlagCode): ReactNode {
  switch (code) {
    case 'A':
      return (
        <>
          <rect width={W0 / 2} height={H0} fill={W} />
          <path d={`M30 0H60L45 22.5L60 45H30Z`} fill={B} />
        </>
      )
    case 'B':
      return <path d="M0 0H60L45 22.5L60 45H0Z" fill={R} />
    case 'C':
      return hStripes([B, W, R, W, B])
    case 'D':
      return (
        <>
          <rect width={W0} height={H0} fill={Y} />
          <rect y={H0 / 4} width={W0} height={H0 / 2} fill={B} />
        </>
      )
    case 'E':
      return hStripes([B, R])
    case 'F':
      return (
        <>
          <rect width={W0} height={H0} fill={W} />
          <path d="M30 2L58 22.5L30 43L2 22.5Z" fill={R} />
        </>
      )
    case 'G':
      return vStripes([Y, B, Y, B, Y, B])
    case 'H':
      return vStripes([W, R])
    case 'I':
      return (
        <>
          <rect width={W0} height={H0} fill={Y} />
          <circle cx={30} cy={22.5} r={11} fill={K} />
        </>
      )
    case 'J':
      return hStripes([B, W, B])
    case 'K':
      return vStripes([Y, B])
    case 'L':
      return quarters(Y, K)
    case 'M':
      return (
        <>
          <rect width={W0} height={H0} fill={B} />
          <path d="M0 0L60 45M60 0L0 45" stroke={W} strokeWidth={9} />
        </>
      )
    case 'N': {
      const cells: ReactNode[] = []
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++)
          cells.push(
            <rect key={`${r}${c}`} x={c * 15} y={r * 11.25} width={15.2} height={11.45} fill={(r + c) % 2 ? W : B} />,
          )
      return cells
    }
    case 'O':
      return (
        <>
          <rect width={W0} height={H0} fill={Y} />
          <path d="M0 0H60V45Z" fill={R} />
        </>
      )
    case 'P':
      return (
        <>
          <rect width={W0} height={H0} fill={B} />
          <rect x={20} y={15} width={20} height={15} fill={W} />
        </>
      )
    case 'Q':
      return <rect width={W0} height={H0} fill={Y} />
    case 'R':
      return (
        <>
          <rect width={W0} height={H0} fill={R} />
          <rect x={25.5} width={9} height={H0} fill={Y} />
          <rect y={18} width={W0} height={9} fill={Y} />
        </>
      )
    case 'S':
      return (
        <>
          <rect width={W0} height={H0} fill={W} />
          <rect x={20} y={15} width={20} height={15} fill={B} />
        </>
      )
    case 'T':
      return vStripes([R, W, B])
    case 'U':
      return quarters(R, W)
    case 'V':
      return (
        <>
          <rect width={W0} height={H0} fill={W} />
          <path d="M0 0L60 45M60 0L0 45" stroke={R} strokeWidth={9} />
        </>
      )
    case 'W':
      return (
        <>
          <rect width={W0} height={H0} fill={B} />
          <rect x={9} y={7} width={42} height={31} fill={W} />
          <rect x={20} y={15} width={20} height={15} fill={R} />
        </>
      )
    case 'X':
      return (
        <>
          <rect width={W0} height={H0} fill={W} />
          <rect x={25.5} width={9} height={H0} fill={B} />
          <rect y={18} width={W0} height={9} fill={B} />
        </>
      )
    case 'Y': {
      const bands: ReactNode[] = [<rect key="bg" width={W0} height={H0} fill={Y} />]
      for (let i = -5; i < 7; i++)
        if (i % 2 === 0) bands.push(<path key={i} d={`M${i * 10} 0h10l45 45h-10Z`} fill={R} />)
      return bands
    }
    case 'Z':
      return (
        <>
          <path d="M0 0H60L30 22.5Z" fill={K} />
          <path d="M60 0V45L30 22.5Z" fill={R} />
          <path d="M0 45H60L30 22.5Z" fill={B} />
          <path d="M0 0V45L30 22.5Z" fill={Y} />
        </>
      )
    default:
      return null
  }
}

function pennant(code: 'P1' | 'P2' | 'P3'): ReactNode {
  if (code === 'P1')
    return (
      <>
        <rect width={90} height={36} fill={W} />
        <circle cx={22} cy={18} r={8} fill={R} />
      </>
    )
  if (code === 'P2')
    return (
      <>
        <rect width={90} height={36} fill={B} />
        <circle cx={22} cy={18} r={8} fill={W} />
      </>
    )
  return (
    <>
      <rect width={30} height={36} fill={R} />
      <rect x={30} width={30} height={36} fill={W} />
      <rect x={60} width={30} height={36} fill={B} />
    </>
  )
}

export interface FlagProps {
  code: FlagCode
  size?: number
  /** Accessible label; defaults to the flag's sea meaning. */
  label?: string
  className?: string
  /** Decorative flags are hidden from assistive tech. */
  decorative?: boolean
  muted?: boolean
}

export function Flag({ code, size = 28, label, className, decorative, muted }: FlagProps) {
  const clipId = useId()
  const isPennant = code.startsWith('P') && code.length === 2
  const vbW = isPennant ? 90 : W0
  const vbH = isPennant ? 36 : H0
  const h = isPennant ? size * 0.8 : size * (H0 / W0)
  const w = isPennant ? size * 2 : size
  const swallow = code === 'A' || code === 'B'
  const outlinePath = isPennant
    ? 'M0 0L90 18L0 36Z'
    : swallow
      ? 'M0 0H60L45 22.5L60 45H0Z'
      : `M0 0H${W0}V${H0}H0Z`
  const a11y = decorative
    ? { 'aria-hidden': true as const }
    : { role: 'img' as const, 'aria-label': label ?? `Flag ${code}: ${FLAG_MEANING[code]}` }
  return (
    <svg
      className={className}
      width={w}
      height={h}
      viewBox={`-1 -1 ${vbW + 2} ${vbH + 2}`}
      style={{ display: 'block', flex: 'none', filter: muted ? 'saturate(0.15) opacity(0.55)' : undefined, transition: 'filter var(--t-ui) var(--ease-out)' }}
      {...a11y}
    >
      <clipPath id={clipId}>
        <path d={outlinePath} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>{isPennant ? pennant(code as 'P1' | 'P2' | 'P3') : body(code)}</g>
      <path d={outlinePath} fill="none" stroke="var(--flag-edge)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
