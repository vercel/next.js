import type { FlightRouterState } from './app-router-types'

export type InstantNavCookieData =
  | { state: 'pending' }
  | { state: 'mpa' }
  | {
      state: 'spa'
      fromTree: FlightRouterState
      toTree: FlightRouterState | null
    }

export function parseInstantNavCookieValue(raw: string): InstantNavCookieData {
  try {
    const parsed = JSON.parse(raw)
    // Captured values have 1 as their first element; a pending value starts
    // with 0 and may carry an options object (see InstantCookieOptions), so
    // the array length alone can't distinguish the two.
    if (Array.isArray(parsed) && parsed[0] === 1 && parsed.length >= 3) {
      const rawState = parsed[2]
      if (rawState === null) {
        return { state: 'mpa' }
      }
      // SPA capture: rawState is { from, to }
      if (typeof rawState === 'object' && rawState !== null) {
        const fromTree: FlightRouterState = rawState.from ?? ['', {}]
        const toTree: FlightRouterState | null = rawState.to ?? null
        return { state: 'spa', fromTree, toTree }
      }
      return { state: 'spa', fromTree: ['', {}], toTree: null }
    }
  } catch {}
  return { state: 'pending' }
}
