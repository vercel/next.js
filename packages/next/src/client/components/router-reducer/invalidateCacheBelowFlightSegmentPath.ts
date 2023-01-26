import { CacheNode } from '../../../shared/lib/app-router-context'
import { FlightSegmentPath } from '../../../server/app-render'

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

  const segmentForCache = Array.isArray(segment) ? segment[1] : segment

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
    childSegmentMap.delete(segmentForCache)
    return
  }

  const existingChildCacheNode = existingChildSegmentMap.get(segmentForCache)
  let childCacheNode = childSegmentMap.get(segmentForCache)

  if (!childCacheNode || !existingChildCacheNode) {
    // Bailout because the existing cache does not have the path to the leaf node
    // Will trigger lazy fetch in layout-router because of missing segment
    return
  }

  if (childCacheNode === existingChildCacheNode) {
    childCacheNode = {
      status: childCacheNode.status,
      data: childCacheNode.data,
      subTreeData: childCacheNode.subTreeData,
      parallelRoutes: new Map(childCacheNode.parallelRoutes),
    } as CacheNode
    childSegmentMap.set(segmentForCache, childCacheNode)
  }

  invalidateCacheBelowFlightSegmentPath(
    childCacheNode,
    existingChildCacheNode,
    flightSegmentPath.slice(2)
  )
}
