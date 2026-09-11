import { useEffect, useState } from 'react'
import { AnalyzeData } from './analyze-data'
import { totalsFromAnalyzeData, type RouteSizeTotals } from './diff'
import { fetchStrict } from './utils'

/**
 * Resolve the URL of an `analyze.data` file for a given route, parameterised
 * by base directory (`'data'` for the live build, `'history/<id>'` for a
 * historical snapshot).
 */
function analyzeDataUrl(route: string, baseDir: string): string {
  if (route === '/') return `${baseDir}/analyze.data`
  return `${baseDir}/${route.replace(/^\//, '')}/analyze.data`
}

/**
 * Result of loading route totals for one side. `totals` is keyed by route.
 * Routes whose `analyze.data` failed to load (e.g. deleted between builds)
 * are simply absent from the map; callers should treat absence as
 * "not present in this build".
 */
export interface RouteTotalsState {
  totals: ReadonlyMap<string, RouteSizeTotals> | null
  isLoading: boolean
}

/**
 * Loads `analyze.data` for every route in `routes` from `baseDir` and
 * reduces each to its size totals. Used to power the route-level diff so
 * that routes can be classified `changed`/`identical` by real bundle size,
 * not just name presence.
 *
 * The fetch fan-out is parallel; for projects with many routes this can be
 * heavy, but typical analyze runs have a small number of routes. Results
 * are stored in module-scoped state keyed by `baseDir` to avoid refetching
 * across re-renders.
 */
export function useRouteTotals(
  routes: string[] | null | undefined,
  baseDir: string | null
): RouteTotalsState {
  const [state, setState] = useState<RouteTotalsState>({
    totals: null,
    isLoading: false,
  })

  useEffect(() => {
    if (!routes || !baseDir) {
      setState({ totals: null, isLoading: false })
      return
    }

    let cancelled = false
    setState((prev) => ({ totals: prev.totals, isLoading: true }))

    Promise.all(
      routes.map(async (route) => {
        try {
          const resp = await fetchStrict(analyzeDataUrl(route, baseDir))
          const data = new AnalyzeData(await resp.arrayBuffer())
          return [route, totalsFromAnalyzeData(data)] as const
        } catch {
          return null
        }
      })
    ).then((results) => {
      if (cancelled) return
      const totals = new Map<string, RouteSizeTotals>()
      for (const result of results) {
        if (result) totals.set(result[0], result[1])
      }
      setState({ totals, isLoading: false })
    })

    return () => {
      cancelled = true
    }
  }, [routes, baseDir])

  return state
}
