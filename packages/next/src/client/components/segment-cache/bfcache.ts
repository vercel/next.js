import { DYNAMIC_STALETIME_MS } from '../router-reducer/reducers/navigate-reducer'
import type { SegmentVaryPath } from './vary-path'

/**
 * Sentinel value indicating that no per-page dynamic stale time was provided.
 * When this is the dynamicStaleTime, the default DYNAMIC_STALETIME_MS is used.
 */
export const UnknownDynamicStaleTime = -1

/**
 * Converts a dynamic stale time (in seconds, as sent by the server in the `d`
 * field of the Flight response) to an absolute staleAt timestamp. When the
 * value is unknown, falls back to the global DYNAMIC_STALETIME_MS.
 */
export function computeDynamicStaleAt(
  now: number,
  dynamicStaleTimeSeconds: number
): number {
  return dynamicStaleTimeSeconds !== UnknownDynamicStaleTime
    ? now + dynamicStaleTimeSeconds * 1000
    : now + DYNAMIC_STALETIME_MS
}
import {
  setInCacheMap,
  getFromCacheMap,
  type UnknownMapEntry,
  type CacheMap,
  createCacheMap,
} from './cache-map'

export type BFCacheEntry = {
  rsc: React.ReactNode | null
  prefetchRsc: React.ReactNode | null
  head: React.ReactNode | null
  prefetchHead: React.ReactNode | null

  ref: UnknownMapEntry | null
  size: number
  // The time at which this data was received. Used to compute the stale time
  // for dynamic prefetches (which use STATIC_STALETIME_MS instead of
  // DYNAMIC_STALETIME_MS). Stored explicitly because staleAt may be
  // overridden by a per-page unstable_dynamicStaleTime, which would break
  // any reverse calculation from staleAt.
  navigatedAt: number
  staleAt: number
  version: number
}

const bfcacheMap: CacheMap<BFCacheEntry> = createCacheMap()

let currentBfCacheVersion = 0

export function invalidateBfCache(): void {
  if (typeof window === 'undefined') {
    return
  }
  currentBfCacheVersion++
}

export function writeToBFCache(
  now: number,
  varyPath: SegmentVaryPath,
  rsc: React.ReactNode,
  prefetchRsc: React.ReactNode,
  head: React.ReactNode,
  prefetchHead: React.ReactNode,
  dynamicStaleAt: number
): void {
  if (typeof window === 'undefined') {
    return
  }

  const entry: BFCacheEntry = {
    rsc,
    prefetchRsc,

    // TODO: These fields will be removed from both BFCacheEntry and
    // SegmentCacheEntry. The head has its own separate cache entry.
    head,
    prefetchHead,

    ref: null,
    // TODO: This is just a heuristic. Getting the actual size of the segment
    // isn't feasible because it's part of a larger streaming response. The
    // LRU will still evict it, we just won't have a fully accurate total
    // LRU size. However, we'll probably remove the size tracking from the LRU
    // entirely and use memory pressure events instead.
    size: 100,

    navigatedAt: now,

    // A back/forward navigation will disregard the stale time. This field is
    // only relevant when staleTimes.dynamic is enabled or unstable_dynamicStaleTime
    // is exported by a page.
    staleAt: dynamicStaleAt,
    version: currentBfCacheVersion,
  }
  const isRevalidation = false
  setInCacheMap(bfcacheMap, varyPath, entry, isRevalidation)
}

export function writeHeadToBFCache(
  now: number,
  varyPath: SegmentVaryPath,
  head: React.ReactNode,
  prefetchHead: React.ReactNode,
  dynamicStaleAt: number
): void {
  // Read the special "segment" that represents the head data.
  writeToBFCache(now, varyPath, head, prefetchHead, null, null, dynamicStaleAt)
}

/**
 * Update the staleAt of an existing BFCache entry. Used after a dynamic
 * response arrives with a per-page stale time from `unstable_dynamicStaleTime`.
 * The per-page value is authoritative — it overrides whatever staleAt was set
 * by the default DYNAMIC_STALETIME_MS.
 */
export function updateBFCacheEntryStaleAt(
  varyPath: SegmentVaryPath,
  newStaleAt: number
): void {
  if (typeof window === 'undefined') {
    return
  }
  const isRevalidation = false
  // Read with staleness bypass (-1) so we can update even stale entries
  const entry = getFromCacheMap(
    -1,
    currentBfCacheVersion,
    bfcacheMap,
    varyPath,
    isRevalidation
  )
  if (entry !== null) {
    entry.staleAt = newStaleAt
  }
}

export function readFromBFCache(
  varyPath: SegmentVaryPath
): BFCacheEntry | null {
  if (typeof window === 'undefined') {
    return null
  }
  const isRevalidation = false
  return getFromCacheMap(
    // During a back/forward navigation, it doesn't matter how stale the data
    // might be. Pass -1 instead of the actual current time to bypass
    // staleness checks.
    -1,
    currentBfCacheVersion,
    bfcacheMap,
    varyPath,
    isRevalidation
  )
}

export function readFromBFCacheDuringRegularNavigation(
  now: number,
  varyPath: SegmentVaryPath
): BFCacheEntry | null {
  if (typeof window === 'undefined') {
    return null
  }
  const isRevalidation = false
  return getFromCacheMap(
    now,
    currentBfCacheVersion,
    bfcacheMap,
    varyPath,
    isRevalidation
  )
}
