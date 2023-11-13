import type { FetchServerResponseResult } from './fetch-server-response'
import type { FlightSegmentPath } from '../../../server/app-render/types'
import type { CacheNode } from '../../../shared/lib/app-router-context.shared-runtime'

import { CacheStates } from '../../../shared/lib/app-router-context.shared-runtime'
import {
  createRouterCacheKey,
  isDynamicCacheKey,
} from './create-router-cache-key'

/**
 * Kick off fetch based on the common layout between two routes. Fill cache with data property holding the in-progress fetch.
 */

export function fillCacheWithDataProperty({
  newCache,
  existingCache,
  flightSegmentPath,
  dataFetch,
  bailOnParallelRoutes = false,
}: {
  newCache: CacheNode
  existingCache: CacheNode
  flightSegmentPath: FlightSegmentPath
  bailOnParallelRoutes?: boolean
  dataFetch: () => Promise<FetchServerResponseResult>
}): { bailOptimistic: boolean } | undefined {
  const isLastEntry = flightSegmentPath.length <= 2

  const [parallelRouteKey, segment] = flightSegmentPath
  const cacheKey = createRouterCacheKey(segment)

  const existingChildSegmentMap =
    existingCache.parallelRoutes.get(parallelRouteKey)
  let hasDynamicSegment = false

  if (existingChildSegmentMap) {
    for (const key of existingChildSegmentMap.keys()) {
      // dynamic segments get inserted into the cache delimited by |
      // in this case, we need to bail because `cacheKey` (derived from the URL)
      // will never be found
      if (isDynamicCacheKey(key)) {
        hasDynamicSegment = true
        break
      }
    }
  }

  if (
    !existingChildSegmentMap ||
    hasDynamicSegment ||
    (bailOnParallelRoutes && existingCache.parallelRoutes.size > 1)
  ) {
    // Bailout because the existing cache does not have the path to the leaf node
    // or the existing cache has multiple parallel routes
    // Will trigger lazy fetch in layout-router because of missing segment
    return { bailOptimistic: true }
  }

  let childSegmentMap = newCache.parallelRoutes.get(parallelRouteKey)

  if (!childSegmentMap || childSegmentMap === existingChildSegmentMap) {
    childSegmentMap = new Map(existingChildSegmentMap)
    newCache.parallelRoutes.set(parallelRouteKey, childSegmentMap)
  }

  const existingChildCacheNode = existingChildSegmentMap.get(cacheKey)
  let childCacheNode = childSegmentMap.get(cacheKey)

  // In case of last segment start off the fetch at this level and don't copy further down.
  if (isLastEntry) {
    if (
      !childCacheNode ||
      !childCacheNode.data ||
      childCacheNode === existingChildCacheNode
    ) {
      childSegmentMap.set(cacheKey, {
        status: CacheStates.DATA_FETCH,
        data: dataFetch(),
        subTreeData: null,
        parallelRoutes: new Map(),
      })
    }
    return
  }

  if (!childCacheNode || !existingChildCacheNode) {
    // Start fetch in the place where the existing cache doesn't have the data yet.
    if (!childCacheNode) {
      childSegmentMap.set(cacheKey, {
        status: CacheStates.DATA_FETCH,
        data: dataFetch(),
        subTreeData: null,
        parallelRoutes: new Map(),
      })
    }
    return
  }

  if (childCacheNode === existingChildCacheNode) {
    childCacheNode = {
      status: childCacheNode.status,
      data: childCacheNode.data,
      subTreeData: childCacheNode.subTreeData,
      parallelRoutes: new Map(childCacheNode.parallelRoutes),
    } as CacheNode
    childSegmentMap.set(cacheKey, childCacheNode)
  }

  return fillCacheWithDataProperty({
    newCache: childCacheNode,
    existingCache: existingChildCacheNode,
    flightSegmentPath: flightSegmentPath.slice(2),
    dataFetch,
  })
}
