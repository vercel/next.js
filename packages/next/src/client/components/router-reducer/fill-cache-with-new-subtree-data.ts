import type { CacheNode, Segment } from '../../../shared/lib/app-router-types'
import { invalidateCacheByRouterState } from './invalidate-cache-by-router-state'
import { fillLazyItemsTillLeafWithHead } from './fill-lazy-items-till-leaf-with-head'
import { createRouterCacheKey } from './create-router-cache-key'
import { PAGE_SEGMENT_KEY } from '../../../shared/lib/segment'
import type { NormalizedFlightData } from '../../flight-data-helpers'

/**
 * Common logic for filling cache with new sub tree data.
 */
function fillCacheHelper(
  navigatedAt: number,
  newCache: CacheNode,
  existingCache: CacheNode,
  flightData: NormalizedFlightData,
  fillLazyItems: boolean
): void {
  const {
    segmentPath,
    seedData: cacheNodeSeedData,
    tree: treePatch,
    head,
  } = flightData
  let newCacheNode = newCache
  let existingCacheNode = existingCache

  for (let i = 0; i < segmentPath.length; i += 2) {
    const parallelRouteKey: string = segmentPath[i]
    const segment: Segment = segmentPath[i + 1]

    // segmentPath is a repeating tuple of parallelRouteKey and segment
    // we know we've hit the last entry we've reached our final pair
    const isLastEntry = i === segmentPath.length - 2
    const cacheKey = createRouterCacheKey(segment)

    const existingChildSegmentMap =
      existingCacheNode.parallelRoutes.get(parallelRouteKey)

    if (!existingChildSegmentMap) {
      // Bailout because the existing cache does not have the path to the leaf node
      // Will trigger lazy fetch in layout-router because of missing segment
      continue
    }

    let childSegmentMap = newCacheNode.parallelRoutes.get(parallelRouteKey)
    if (!childSegmentMap || childSegmentMap === existingChildSegmentMap) {
      childSegmentMap = new Map(existingChildSegmentMap)
      newCacheNode.parallelRoutes.set(parallelRouteKey, childSegmentMap)
    }

    const existingChildCacheNode = existingChildSegmentMap.get(cacheKey)
    let childCacheNode = childSegmentMap.get(cacheKey)

    if (isLastEntry) {
      if (
        cacheNodeSeedData &&
        (!childCacheNode ||
          !childCacheNode.lazyData ||
          childCacheNode === existingChildCacheNode)
      ) {
        const rsc = cacheNodeSeedData[0]
        const loading = cacheNodeSeedData[2]

        childCacheNode = {
          lazyData: null,
          // When `fillLazyItems` is false, we only want to fill the RSC data for the layout,
          // not the page segment.
          rsc: fillLazyItems || segment !== PAGE_SEGMENT_KEY ? rsc : null,
          prefetchRsc: null,
          head: null,
          prefetchHead: null,
          loading,
          parallelRoutes:
            fillLazyItems && existingChildCacheNode
              ? new Map(existingChildCacheNode.parallelRoutes)
              : new Map(),
          navigatedAt,
        }

        if (existingChildCacheNode && fillLazyItems) {
          invalidateCacheByRouterState(
            childCacheNode,
            existingChildCacheNode,
            treePatch
          )
        }
        if (fillLazyItems) {
          fillLazyItemsTillLeafWithHead(
            navigatedAt,
            childCacheNode,
            existingChildCacheNode,
            treePatch,
            cacheNodeSeedData,
            head
          )
        }

        childSegmentMap.set(cacheKey, childCacheNode)
      }
      continue
    }

    if (!childCacheNode || !existingChildCacheNode) {
      // Bailout because the existing cache does not have the path to the leaf node
      // Will trigger lazy fetch in layout-router because of missing segment
      continue
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

    // Move deeper into the cache nodes
    newCacheNode = childCacheNode
    existingCacheNode = existingChildCacheNode
  }
}

/**
 * Fill cache with rsc based on flightDataPath
 */
export function fillCacheWithNewSubTreeData(
  navigatedAt: number,
  newCache: CacheNode,
  existingCache: CacheNode,
  flightData: NormalizedFlightData
): void {
  fillCacheHelper(navigatedAt, newCache, existingCache, flightData, true)
}

export function fillCacheWithNewSubTreeDataButOnlyLoading(
  navigatedAt: number,
  newCache: CacheNode,
  existingCache: CacheNode,
  flightData: NormalizedFlightData
): void {
  fillCacheHelper(navigatedAt, newCache, existingCache, flightData, false)
}
