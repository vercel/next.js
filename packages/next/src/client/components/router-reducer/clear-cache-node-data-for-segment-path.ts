import type {
  FlightSegmentPath,
  CacheNode,
} from '../../../shared/lib/app-router-types'
import { getNextFlightSegmentPath } from '../../flight-data-helpers'
import { createRouterCacheKey } from './create-router-cache-key'

/**
 * This will clear the CacheNode data for a particular segment path. This will cause a lazy-fetch in layout router to fill in new data.
 */
export function clearCacheNodeDataForSegmentPath(
  newCache: CacheNode,
  existingCache: CacheNode,
  flightSegmentPath: FlightSegmentPath
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
        lazyData: null,
        rsc: null,
        prefetchRsc: null,
        head: null,
        prefetchHead: null,
        parallelRoutes: new Map(),
        loading: null,
        navigatedAt: -1,
      })
    }
    return
  }

  if (!childCacheNode || !existingChildCacheNode) {
    // Start fetch in the place where the existing cache doesn't have the data yet.
    if (!childCacheNode) {
      childSegmentMap.set(cacheKey, {
        lazyData: null,
        rsc: null,
        prefetchRsc: null,
        head: null,
        prefetchHead: null,
        parallelRoutes: new Map(),
        loading: null,
        navigatedAt: -1,
      })
    }
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
      loading: childCacheNode.loading,
    } as CacheNode
    childSegmentMap.set(cacheKey, childCacheNode)
  }

  return clearCacheNodeDataForSegmentPath(
    childCacheNode,
    existingChildCacheNode,
    getNextFlightSegmentPath(flightSegmentPath)
  )
}
