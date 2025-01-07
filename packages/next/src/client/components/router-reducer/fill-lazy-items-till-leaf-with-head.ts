import type { CacheNode } from '../../../shared/lib/app-router-context.shared-runtime'
import type {
  FlightRouterState,
  CacheNodeSeedData,
} from '../../../server/app-render/types'
import { createRouterCacheKey } from './create-router-cache-key'
import {
  PrefetchCacheEntryStatus,
  type PrefetchCacheEntry,
} from './router-reducer-types'

export function fillLazyItemsTillLeafWithHead(
  newCache: CacheNode,
  existingCache: CacheNode | undefined,
  routerState: FlightRouterState,
  cacheNodeSeedData: CacheNodeSeedData | null,
  head: React.ReactNode,
  prefetchEntry: PrefetchCacheEntry | undefined
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
      cacheNodeSeedData !== null && cacheNodeSeedData[2][key] !== undefined
        ? cacheNodeSeedData[2][key]
        : null
    if (existingCache) {
      const existingParallelRoutesCacheNode =
        existingCache.parallelRoutes.get(key)
      if (existingParallelRoutesCacheNode) {
        const hasReusablePrefetch =
          prefetchEntry?.kind === 'auto' &&
          prefetchEntry.status === PrefetchCacheEntryStatus.reusable

        let parallelRouteCacheNode = new Map(existingParallelRoutesCacheNode)
        const existingCacheNode = parallelRouteCacheNode.get(cacheKey)
        let newCacheNode: CacheNode
        if (parallelSeedData !== null) {
          // New data was sent from the server.
          const seedNode = parallelSeedData[1]
          const loading = parallelSeedData[3]
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
          }
        } else if (hasReusablePrefetch && existingCacheNode) {
          // No new data was sent from the server, but the existing cache node
          // was prefetched, so we should reuse that.
          newCacheNode = {
            lazyData: existingCacheNode.lazyData,
            rsc: existingCacheNode.rsc,
            // This is a PPR-only field. Unlike the previous branch, since we're
            // just cloning the existing cache node, we might as well keep the
            // PPR value, if it exists.
            prefetchRsc: existingCacheNode.prefetchRsc,
            head: existingCacheNode.head,
            prefetchHead: existingCacheNode.prefetchHead,
            parallelRoutes: new Map(existingCacheNode.parallelRoutes),
            loading: existingCacheNode.loading,
          } as CacheNode
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
          }
        }

        // Overrides the cache key with the new cache node.
        parallelRouteCacheNode.set(cacheKey, newCacheNode)
        // Traverse deeper to apply the head / fill lazy items till the head.
        fillLazyItemsTillLeafWithHead(
          newCacheNode,
          existingCacheNode,
          parallelRouteState,
          parallelSeedData ? parallelSeedData : null,
          head,
          prefetchEntry
        )

        newCache.parallelRoutes.set(key, parallelRouteCacheNode)
        continue
      }
    }

    let newCacheNode: CacheNode
    if (parallelSeedData !== null) {
      // New data was sent from the server.
      const seedNode = parallelSeedData[1]
      const loading = parallelSeedData[3]
      newCacheNode = {
        lazyData: null,
        rsc: seedNode,
        prefetchRsc: null,
        head: null,
        prefetchHead: null,
        parallelRoutes: new Map(),
        loading,
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
      }
    }

    const existingParallelRoutes = newCache.parallelRoutes.get(key)
    if (existingParallelRoutes) {
      existingParallelRoutes.set(cacheKey, newCacheNode)
    } else {
      newCache.parallelRoutes.set(key, new Map([[cacheKey, newCacheNode]]))
    }

    fillLazyItemsTillLeafWithHead(
      newCacheNode,
      undefined,
      parallelRouteState,
      parallelSeedData,
      head,
      prefetchEntry
    )
  }
}
