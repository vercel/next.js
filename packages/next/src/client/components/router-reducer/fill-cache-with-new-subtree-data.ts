import type { CacheNode } from '../../../shared/lib/app-router-context.shared-runtime'
import type { Segment } from '../../../server/app-render/types'
import { invalidateCacheByRouterState } from './invalidate-cache-by-router-state'
import { fillLazyItemsTillLeafWithHead } from './fill-lazy-items-till-leaf-with-head'
import { createRouterCacheKey } from './create-router-cache-key'
import type { PrefetchCacheEntry } from './router-reducer-types'
import { PAGE_SEGMENT_KEY } from '../../../shared/lib/segment'
import type { NormalizedFlightData } from '../../flight-data-helpers'

/**
 * Common logic for filling cache with new sub tree data.
 */
function fillCacheHelper(
  newCache: CacheNode,
  existingCache: CacheNode,
  flightData: NormalizedFlightData,
  prefetchEntry: PrefetchCacheEntry | undefined,
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
        const incomingSegment = cacheNodeSeedData[0]
        const rsc = cacheNodeSeedData[1]
        const loading = cacheNodeSeedData[3]

        childCacheNode = {
          lazyData: null,
          // When `fillLazyItems` is false, we only want to fill the RSC data for the layout,
          // not the page segment.
          rsc:
            fillLazyItems || incomingSegment !== PAGE_SEGMENT_KEY ? rsc : null,
          prefetchRsc: null,
          head: null,
          prefetchHead: null,
          loading,
          parallelRoutes:
            fillLazyItems && existingChildCacheNode
              ? new Map(existingChildCacheNode.parallelRoutes)
              : new Map(),
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
            childCacheNode,
            existingChildCacheNode,
            treePatch,
            cacheNodeSeedData,
            head,
            prefetchEntry
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
  newCache: CacheNode,
  existingCache: CacheNode,
  flightData: NormalizedFlightData,
  prefetchEntry?: PrefetchCacheEntry
): void {
  fillCacheHelper(newCache, existingCache, flightData, prefetchEntry, true)
}

export function fillCacheWithNewSubTreeDataButOnlyLoading(
  newCache: CacheNode,
  existingCache: CacheNode,
  flightData: NormalizedFlightData,
  prefetchEntry?: PrefetchCacheEntry
): void {
  fillCacheHelper(newCache, existingCache, flightData, prefetchEntry, false)
}
