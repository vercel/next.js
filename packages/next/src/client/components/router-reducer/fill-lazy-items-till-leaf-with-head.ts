import type { CacheNode } from '../../../shared/lib/app-router-types'
import type {
  FlightRouterState,
  CacheNodeSeedData,
} from '../../../shared/lib/app-router-types'
import { createRouterCacheKey } from './create-router-cache-key'

export function fillLazyItemsTillLeafWithHead(
  navigatedAt: number,
  newCache: CacheNode,
  existingCache: CacheNode | undefined,
  routerState: FlightRouterState,
  cacheNodeSeedData: CacheNodeSeedData | null,
  head: React.ReactNode
): void {
  const isLastSegment = Object.keys(routerState[1]).length === 0
  if (isLastSegment) {
    newCache.head = head
    return
  }
  // Remove segment that we got data for so that it is filled in during rendering of rsc.
  for (const key in routerState[1]) {
    const parallelRouteState = routerState[1][key]
    const segmentForParallelRoute = parallelRouteState[0]
    const cacheKey = createRouterCacheKey(segmentForParallelRoute)

    // TODO: We should traverse the cacheNodeSeedData tree instead of the router
    // state tree. Ideally, they would always be the same shape, but because of
    // the loading.js pattern, cacheNodeSeedData sometimes only represents a
    // partial tree. That's why this node is sometimes null. Once PPR lands,
    // loading.js will no longer have special behavior and we can traverse the
    // data tree instead.
    //
    // We should also consider merging the router state tree and the data tree
    // in the response format, so that we don't have to send the keys twice.
    // Then the client can convert them into separate representations.
    const parallelSeedData =
      cacheNodeSeedData !== null && cacheNodeSeedData[1][key] !== undefined
        ? cacheNodeSeedData[1][key]
        : null
    if (existingCache) {
      const existingParallelRoutesCacheNode =
        existingCache.parallelRoutes.get(key)
      if (existingParallelRoutesCacheNode) {
        let parallelRouteCacheNode = new Map(existingParallelRoutesCacheNode)
        const existingCacheNode = parallelRouteCacheNode.get(cacheKey)
        let newCacheNode: CacheNode
        if (parallelSeedData !== null) {
          // New data was sent from the server.
          const seedNode = parallelSeedData[0]
          const loading = parallelSeedData[2]
          newCacheNode = {
            lazyData: null,
            rsc: seedNode,
            // This is a PPR-only field. When PPR is enabled, we shouldn't hit
            // this path during a navigation, but until PPR is fully implemented
            // yet it's possible the existing node does have a non-null
            // `prefetchRsc`. As an incremental step, we'll just de-opt to the
            // old behavior — no PPR value.
            prefetchRsc: null,
            head: null,
            prefetchHead: null,
            loading,
            parallelRoutes: new Map(existingCacheNode?.parallelRoutes),
            navigatedAt,
          }
        } else {
          // No data available for this node. This will trigger a lazy fetch
          // during render.
          newCacheNode = {
            lazyData: null,
            rsc: null,
            prefetchRsc: null,
            head: null,
            prefetchHead: null,
            parallelRoutes: new Map(existingCacheNode?.parallelRoutes),
            loading: null,
            navigatedAt,
          }
        }

        // Overrides the cache key with the new cache node.
        parallelRouteCacheNode.set(cacheKey, newCacheNode)
        // Traverse deeper to apply the head / fill lazy items till the head.
        fillLazyItemsTillLeafWithHead(
          navigatedAt,
          newCacheNode,
          existingCacheNode,
          parallelRouteState,
          parallelSeedData ? parallelSeedData : null,
          head
        )

        newCache.parallelRoutes.set(key, parallelRouteCacheNode)
        continue
      }
    }

    let newCacheNode: CacheNode
    if (parallelSeedData !== null) {
      // New data was sent from the server.
      const seedNode = parallelSeedData[0]
      const loading = parallelSeedData[2]
      newCacheNode = {
        lazyData: null,
        rsc: seedNode,
        prefetchRsc: null,
        head: null,
        prefetchHead: null,
        parallelRoutes: new Map(),
        loading,
        navigatedAt,
      }
    } else {
      // No data available for this node. This will trigger a lazy fetch
      // during render.
      newCacheNode = {
        lazyData: null,
        rsc: null,
        prefetchRsc: null,
        head: null,
        prefetchHead: null,
        parallelRoutes: new Map(),
        loading: null,
        navigatedAt,
      }
    }

    const existingParallelRoutes = newCache.parallelRoutes.get(key)
    if (existingParallelRoutes) {
      existingParallelRoutes.set(cacheKey, newCacheNode)
    } else {
      newCache.parallelRoutes.set(key, new Map([[cacheKey, newCacheNode]]))
    }

    fillLazyItemsTillLeafWithHead(
      navigatedAt,
      newCacheNode,
      undefined,
      parallelRouteState,
      parallelSeedData,
      head
    )
  }
}
