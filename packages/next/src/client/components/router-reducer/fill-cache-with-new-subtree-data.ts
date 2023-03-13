import { CacheNode, CacheStates } from '../../../shared/lib/app-router-context'
import { FlightDataPath } from '../../../server/app-render'
import { invalidateCacheByRouterState } from './invalidate-cache-by-router-state'
import { fillLazyItemsTillLeafWithHead } from './fill-lazy-items-till-leaf-with-head'

/**
 * Fill cache with subTreeData based on flightDataPath
 */
export function fillCacheWithNewSubTreeData(
  newCache: CacheNode,
  existingCache: CacheNode,
  flightDataPath: FlightDataPath
): void {
  const isLastEntry = flightDataPath.length <= 5
  const [parallelRouteKey, segment] = flightDataPath

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

  const existingChildCacheNode = existingChildSegmentMap.get(segmentForCache)
  let childCacheNode = childSegmentMap.get(segmentForCache)

  if (isLastEntry) {
    if (
      !childCacheNode ||
      !childCacheNode.data ||
      childCacheNode === existingChildCacheNode
    ) {
      childCacheNode = {
        status: CacheStates.READY,
        data: null,
        subTreeData: flightDataPath[3],
        // Ensure segments other than the one we got data for are preserved.
        parallelRoutes: existingChildCacheNode
          ? new Map(existingChildCacheNode.parallelRoutes)
          : new Map(),
      }

      if (existingChildCacheNode) {
        invalidateCacheByRouterState(
          childCacheNode,
          existingChildCacheNode,
          flightDataPath[2]
        )
      }

      fillLazyItemsTillLeafWithHead(
        childCacheNode,
        existingChildCacheNode,
        flightDataPath[2],
        flightDataPath[4]
      )

      childSegmentMap.set(segmentForCache, childCacheNode)
    }
    return
  }

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

  fillCacheWithNewSubTreeData(
    childCacheNode,
    existingChildCacheNode,
    flightDataPath.slice(2)
  )
}
