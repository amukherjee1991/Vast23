import type { FlagCode } from '../components/Flag'

/* The site's signal vocabulary. Verdicts and confidence are hoisted as real
   International Code of Signals flags, chosen for their meaning at sea. */

export type Verdict = 'Suspect' | 'Possible' | 'Insufficient evidence' | 'Unlikely'
export type Confidence = 'High' | 'Medium' | 'Low'

export const VERDICT_FLAG: Record<Verdict, FlagCode> = {
  Suspect: 'L', // "Stop your vessel instantly"
  Possible: 'U', // "You are running into danger"
  'Insufficient evidence': 'X', // "Stop and watch for my signals"
  Unlikely: 'N', // "Negative"
}

export const VERDICT_COLOR: Record<Verdict, string> = {
  Suspect: 'var(--verdict-suspect)',
  Possible: 'var(--verdict-possible)',
  'Insufficient evidence': 'var(--verdict-insufficient)',
  Unlikely: 'var(--verdict-unlikely)',
}

export const CONFIDENCE_LEVEL: Record<Confidence, number> = { Low: 1, Medium: 2, High: 3 }

/** Normalise free-text verdicts / confidence coming from the pipelines. */
export function toVerdict(v: string | null | undefined): Verdict {
  const s = (v ?? '').toLowerCase()
  if (s.startsWith('suspect')) return 'Suspect'
  if (s.startsWith('possib')) return 'Possible'
  if (s.startsWith('unlikely')) return 'Unlikely'
  return 'Insufficient evidence'
}
export function toConfidence(v: string | number | null | undefined): Confidence {
  if (typeof v === 'number') return v >= 0.67 ? 'High' : v >= 0.34 ? 'Medium' : 'Low'
  const s = (v ?? '').toLowerCase()
  if (s.startsWith('high')) return 'High'
  if (s.startsWith('med')) return 'Medium'
  return 'Low'
}

/** Categorical slots in validated order. Color follows the entity, never its rank. */
export const SERIES = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
] as const
export const SERIES_HEX = ['#1747c4', '#e3a008', '#d42a2a', '#111318', '#ffffff'] as const
export const OTHER = 'var(--series-other)'

/** Entity-type encoding shared by every node-link view: color + shape, never color alone. */
export type Shape = 'square' | 'circle' | 'diamond' | 'triangle' | 'hex' | 'cross'
export const ENTITY_STYLE: Record<string, { color: string; shape: Shape; label: string }> = {
  company: { color: SERIES[0], shape: 'square', label: 'Company' },
  person: { color: SERIES[1], shape: 'circle', label: 'Person' },
  organization: { color: SERIES[2], shape: 'diamond', label: 'Organization' },
  vessel: { color: SERIES[3], shape: 'triangle', label: 'Vessel' },
  location: { color: SERIES[4], shape: 'hex', label: 'Location' },
  other: { color: OTHER, shape: 'cross', label: 'Other / unknown' },
}
export function entityStyle(type: string | null | undefined) {
  const t = (type ?? '').toLowerCase()
  if (t.includes('compan')) return ENTITY_STYLE.company
  if (t.includes('person') || t.includes('owner') || t.includes('contact')) return ENTITY_STYLE.person
  if (t.includes('organi')) return ENTITY_STYLE.organization
  if (t.includes('vessel')) return ENTITY_STYLE.vessel
  if (t.includes('location')) return ENTITY_STYLE.location
  return ENTITY_STYLE.other
}

/** SVG path for a node symbol of radius r centred on 0,0. */
export function shapePath(shape: Shape, r: number): string {
  switch (shape) {
    case 'square':
      return `M${-r} ${-r}h${2 * r}v${2 * r}h${-2 * r}Z`
    case 'circle':
      return `M${-r} 0a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`
    case 'diamond':
      return `M0 ${-r * 1.3}L${r * 1.3} 0L0 ${r * 1.3}L${-r * 1.3} 0Z`
    case 'triangle':
      return `M0 ${-r * 1.3}L${r * 1.2} ${r}L${-r * 1.2} ${r}Z`
    case 'hex': {
      const p = d3Hex(r * 1.15)
      return p
    }
    case 'cross': {
      const a = r * 0.45
      return `M${-a} ${-r}h${2 * a}v${r - a}h${r - a}v${2 * a}h${a - r}v${r - a}h${-2 * a}v${a - r}h${a - r}v${-2 * a}h${r - a}Z`
    }
  }
}
function d3Hex(r: number) {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6
    return `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`
  })
  return `M${pts.join('L')}Z`
}

export const fmt = {
  int: new Intl.NumberFormat('en-US'),
  compact: new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }),
  pct: new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 }),
  pct1: new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 }),
  dec2: new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }),
}

/** Pipeline text writes counts as "1 owner(s)"; read the number and say it
    properly: "1 owner", "3 owners", "2 strong flags". */
export function plural(text: string): string {
  return text.replace(/\b(\d[\d,]*(?:\.\d+)?)((?:\s+[A-Za-z][\w-]*)*?\s+)([A-Za-z][\w-]*)\(s\)/g, (_, n: string, mid: string, w: string) =>
    `${n}${mid}${w}${Number(n.replace(/,/g, '')) === 1 ? '' : 's'}`,
  ).replace(/\b1 owner control\b/g, '1 owner controls')
}
