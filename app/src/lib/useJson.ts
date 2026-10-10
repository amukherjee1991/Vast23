import { useEffect, useState } from 'react'

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; data: T }

const cache = new Map<string, Promise<unknown>>()

/** Load a baked JSON file from public/data, memoised across components. */
export function loadJson<T>(path: string): Promise<T> {
  const url = `${import.meta.env.BASE_URL}data/${path}`
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`${path} could not be loaded (HTTP ${r.status}).`)
        return r.json()
      }),
    )
  }
  return cache.get(url) as Promise<T>
}

export function useJson<T>(path: string): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' })
  useEffect(() => {
    let live = true
    setState({ status: 'loading' })
    loadJson<T>(path)
      .then((data) => live && setState({ status: 'ready', data }))
      .catch((e: Error) => live && setState({ status: 'error', error: e.message }))
    return () => {
      live = false
    }
  }, [path])
  return state
}
