import type { FetchServerResponseResult } from './fetch-server-response'
import type { FlightSegmentPath } from '../../../server/app-render/types'
import type { CacheNode } from '../../../shared/lib/app-router-context.shared-runtime'
import { createRouterCacheKey } from './create-router-cache-key'

/**
 * Kick off fetch based on the common layout between two routes. Fill cache with data property holding the in-progress fetch.
 */
export function fillCacheWithDataProperty(
  newCache: CacheNode,
  existingCache: CacheNode,
  flightSegmentPath: FlightSegmentPath,
  fetchResponse: () => Promise<FetchServerResponseResult>
): void {
  const isLastEntry = flightSegmentPath.length <= 2

  const [parallelRouteKey, segment] = flightSegmentPath
  const cacheKey = createRouterCacheKey(segment)

  const existingChildSegmentMap =
    existingCache.parallelRoutes.get(parallelRouteKey)

  let childSegmentMap = newCache.parallelRoutes.get(parallelRouteKey)

  if (!childSegmentMap || childSegmentMap === existingChildSegmentMap) {
    childSegmentMap = new Map(existingChildSegmentMap)
    newCache.parallelRoutes.set(parallelRouteKey, childSegmentMap)
  }

  const existingChildCacheNode = existingChildSegmentMap?.get(cacheKey)
  let childCacheNode = childSegmentMap.get(cacheKey)

  // In case of last segment start off the fetch at this level and don't copy further down.
  if (isLastEntry) {
    if (
      !childCacheNode ||
      !childCacheNode.lazyData ||
      childCacheNode === existingChildCacheNode
    ) {
      childSegmentMap.set(cacheKey, {
        lazyData: fetchResponse(),
        rsc: null,
        prefetchRsc: null,
        parallelRoutes: new Map(),
      })
    }
    return
  }

  if (!childCacheNode || !existingChildCacheNode) {
    // Start fetch in the place where the existing cache doesn't have the data yet.
    if (!childCacheNode) {
      childSegmentMap.set(cacheKey, {
        lazyData: fetchResponse(),
        rsc: null,
        prefetchRsc: null,
        parallelRoutes: new Map(),
      })
    }
    return
  }

  if (childCacheNode === existingChildCacheNode) {
    childCacheNode = {
      lazyData: childCacheNode.lazyData,
      rsc: childCacheNode.rsc,
      prefetchRsc: childCacheNode.prefetchRsc,
      parallelRoutes: new Map(childCacheNode.parallelRoutes),
    } as CacheNode
    childSegmentMap.set(cacheKey, childCacheNode)
  }

  return fillCacheWithDataProperty(
    childCacheNode,
    existingChildCacheNode,
    flightSegmentPath.slice(2),
    fetchResponse
  )
}
