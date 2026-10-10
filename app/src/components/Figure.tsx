import { useState, type ReactNode } from 'react'
import type { Loadable } from '../lib/useJson'

export interface TableSpec {
  columns: string[]
  rows: (string | number | null)[][]
}

/** Every chart lives in a Figure: a title that states the finding, the plot,
    a legend, a caption with the source, and a table view of the same data. */
export function Figure({
  title,
  subtitle,
  legend,
  caption,
  table,
  controls,
  children,
  wide,
  id,
}: {
  title: string
  subtitle?: ReactNode
  legend?: ReactNode
  caption?: ReactNode
  table?: TableSpec
  controls?: ReactNode
  children: ReactNode
  wide?: boolean
  id?: string
}) {
  const [asTable, setAsTable] = useState(false)
  return (
    <figure className={`fig${wide ? ' fig--wide' : ''}`} id={id}>
      <header className="fig__head">
        <div>
          <h4 className="fig__title">{title}</h4>
          {subtitle && <p className="fig__sub">{subtitle}</p>}
        </div>
        {table && (
          <button
            type="button"
            className="chip"
            aria-pressed={asTable}
            onClick={() => setAsTable((v) => !v)}
          >
            {asTable ? 'Show chart' : 'Show table'}
          </button>
        )}
      </header>
      {controls && <div className="fig__controls">{controls}</div>}
      {legend && !asTable && <div className="fig__legend">{legend}</div>}
      <div className="fig__body">
        {asTable && table ? <DataTable spec={table} /> : children}
      </div>
      {caption && <figcaption className="fig__cap">{caption}</figcaption>}
    </figure>
  )
}

export function DataTable({ spec, max = 60 }: { spec: TableSpec; max?: number }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {spec.columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spec.rows.slice(0, max).map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j} className={typeof v === 'number' ? 'num' : undefined}>
                  {v === null ? '—' : typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 3 }) : v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {spec.rows.length > max && (
        <p className="table-more">Showing {max} of {spec.rows.length.toLocaleString('en-US')} rows.</p>
      )}
    </div>
  )
}

export function LegendItem({ color, label, shape }: { color: string; label: string; shape?: 'line' | 'square' | 'circle' }) {
  return (
    <span className="legend-item">
      <span
        className={`legend-swatch legend-swatch--${shape ?? 'square'}`}
        style={{ background: color }}
        aria-hidden
      />
      {label}
    </span>
  )
}

/** Loading / error / empty states for any data-backed block. */
export function Await<T>({
  state,
  children,
  height = 320,
}: {
  state: Loadable<T>
  children: (data: T) => ReactNode
  height?: number
}) {
  if (state.status === 'loading')
    return (
      <div className="state state--loading" style={{ minHeight: height }} aria-busy="true">
        <span className="state__halyard" aria-hidden />
        <span>Hoisting the evidence…</span>
      </div>
    )
  if (state.status === 'error')
    return (
      <div className="state state--error" style={{ minHeight: height }} role="alert">
        <strong>This view’s data didn’t load.</strong>
        <span>{state.error} Run <code>npm run data</code> to rebuild it, then reload.</span>
      </div>
    )
  return <>{children(state.data)}</>
}
