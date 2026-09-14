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
    if (Array.isArray(parsed) && parsed.length >= 3) {
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
