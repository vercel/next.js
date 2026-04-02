import type { FlightRouterState } from '../../../shared/lib/app-router-types'

// TypeScript trick to simulate opaque types, like in Flow.
type Opaque<K, T> = T & { __brand: K }

// Only functions in this module should be allowed to create CacheKeys.
export type NormalizedPathname = Opaque<'NormalizedPathname', string>
export type NormalizedSearch = Opaque<'NormalizedSearch', string>
export type NormalizedNextUrl = Opaque<'NormalizedNextUrl', string>
export type ParallelSlotKey = Opaque<'ParallelSlotKey', string>

export type RouteCacheKey = Opaque<
  'RouteCacheKey',
  {
    pathname: NormalizedPathname
    search: NormalizedSearch
    nextUrl: NormalizedNextUrl | null
    parallelSlot: ParallelSlotKey | null

    // TODO: Eventually the dynamic params will be added here, too.
  }
>

export function createCacheKey(
  originalHref: string,
  nextUrl: string | null,
  parallelSlot?: string | null
): RouteCacheKey {
  const originalUrl = new URL(originalHref)
  return {
    pathname: originalUrl.pathname as NormalizedPathname,
    search: originalUrl.search as NormalizedSearch,
    nextUrl: nextUrl as NormalizedNextUrl | null,
    parallelSlot: (parallelSlot ?? null) as ParallelSlotKey | null,
  } as RouteCacheKey
}

export function getParallelSlotKey(
  flightRouterState: FlightRouterState
): ParallelSlotKey | null {
  const parallelRoutes = flightRouterState[1]
  if (!parallelRoutes || Object.keys(parallelRoutes).length === 0) {
    return null
  }
  return Object.keys(parallelRoutes).sort().join('|') as ParallelSlotKey
}
