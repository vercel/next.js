import type { SegmentVaryPath } from './vary-path'
import {
  setInCacheMap,
  getFromCacheMap,
  type UnknownMapEntry,
  type CacheMap,
  createCacheMap,
} from './cache-map'
import { DYNAMIC_STALETIME_MS } from '../router-reducer/reducers/navigate-reducer'

export type BFCacheEntry = {
  rsc: React.ReactNode | null
  prefetchRsc: React.ReactNode | null
  head: React.ReactNode | null
  prefetchHead: React.ReactNode | null

  ref: UnknownMapEntry | null
  size: number
  staleAt: number
  version: number
}

const bfcacheMap: CacheMap<BFCacheEntry> = createCacheMap()

let currentBfCacheVersion = 0

export function invalidateBfCache(): void {
  currentBfCacheVersion++
}

export function writeToBFCache(
  now: number,
  varyPath: SegmentVaryPath,
  rsc: React.ReactNode,
  prefetchRsc: React.ReactNode,
  head: React.ReactNode,
  prefetchHead: React.ReactNode
): void {
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

    // A back/forward navigation will disregard the stale time. This field is
    // only relevant when staleTimes.dynamic is enabled.
    staleAt: now + DYNAMIC_STALETIME_MS,
    version: currentBfCacheVersion,
  }
  const isRevalidation = false
  setInCacheMap(bfcacheMap, varyPath, entry, isRevalidation)
}

export function writeHeadToBFCache(
  now: number,
  varyPath: SegmentVaryPath,
  head: React.ReactNode,
  prefetchHead: React.ReactNode
): void {
  // Read the special "segment" that represents the head data.
  writeToBFCache(now, varyPath, head, prefetchHead, null, null)
}

export function readFromBFCache(
  varyPath: SegmentVaryPath
): BFCacheEntry | null {
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
  const isRevalidation = false
  return getFromCacheMap(
    now,
    currentBfCacheVersion,
    bfcacheMap,
    varyPath,
    isRevalidation
  )
}
