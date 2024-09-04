import type { CacheNode } from '../../../shared/lib/app-router-context.shared-runtime'
import type { FlightSegmentPath } from '../../../server/app-render/types'
import { createRouterCacheKey } from './create-router-cache-key'
import { getNextFlightSegmentPath } from '../../flight-data-helpers'

/**
 * Fill cache up to the end of the flightSegmentPath, invalidating anything below it.
 */
export function invalidateCacheBelowFlightSegmentPath(
  newCache: CacheNode,
  existingCache: CacheNode,
  flightSegmentPath: FlightSegmentPath
): void {
  const isLastEntry = flightSegmentPath.length <= 2
  const [parallelRouteKey, segment] = flightSegmentPath

  const cacheKey = createRouterCacheKey(segment)

  const existingChildSegmentMap =
    existingCache.parallelRoutes.get(parallelRouteKey)

  if (!existingChildSegmentMap) {
    // Bailout because the existing cache does not have the path to the leaf node
    // Will trigger lazy fetch in layout-router because of missing segment
    return
  }

  let childSegmentMap = newCache.parallelRoutes.get(parallelRouteKey)
  if (!childSegmentMap || childSegmentMap === existingChildSegmentMap) {
    childSegmentMap = new Map(existingChildSegmentMap)
    newCache.parallelRoutes.set(parallelRouteKey, childSegmentMap)
  }

  // In case of last entry don't copy further down.
  if (isLastEntry) {
    childSegmentMap.delete(cacheKey)
    return
  }

  const existingChildCacheNode = existingChildSegmentMap.get(cacheKey)
  let childCacheNode = childSegmentMap.get(cacheKey)

  if (!childCacheNode || !existingChildCacheNode) {
    // Bailout because the existing cache does not have the path to the leaf node
    // Will trigger lazy fetch in layout-router because of missing segment
    return
  }

  if (childCacheNode === existingChildCacheNode) {
    childCacheNode = {
      lazyData: childCacheNode.lazyData,
      rsc: childCacheNode.rsc,
      prefetchRsc: childCacheNode.prefetchRsc,
      head: childCacheNode.head,
      prefetchHead: childCacheNode.prefetchHead,
      parallelRoutes: new Map(childCacheNode.parallelRoutes),
    } as CacheNode
    childSegmentMap.set(cacheKey, childCacheNode)
  }

  invalidateCacheBelowFlightSegmentPath(
    childCacheNode,
    existingChildCacheNode,
    getNextFlightSegmentPath(flightSegmentPath)
  )
}
