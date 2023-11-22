import { CacheStates } from '../../../shared/lib/app-router-context.shared-runtime'
import type { CacheNode } from '../../../shared/lib/app-router-context.shared-runtime'
import type {
  FlightRouterState,
  CacheNodeSeedData,
} from '../../../server/app-render/types'
import { createRouterCacheKey } from './create-router-cache-key'

export function fillLazyItemsTillLeafWithHead(
  newCache: CacheNode,
  existingCache: CacheNode | undefined,
  routerState: FlightRouterState,
  cacheNodeSeedData: CacheNodeSeedData | null,
  head: React.ReactNode,
  wasPrefetched?: boolean
): void {
  const isLastSegment = Object.keys(routerState[1]).length === 0
  if (isLastSegment) {
    newCache.head = head
    return
  }
  // Remove segment that we got data for so that it is filled in during rendering of subTreeData.
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
      cacheNodeSeedData !== null &&
      cacheNodeSeedData[1] !== null &&
      cacheNodeSeedData[1][key] !== undefined
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
          const seedNode = parallelSeedData[2]
          newCacheNode = {
            status: CacheStates.READY,
            data: null,
            subTreeData: seedNode,
            parallelRoutes: new Map(existingCacheNode?.parallelRoutes),
          }
        } else if (wasPrefetched && existingCacheNode) {
          // No new data was sent from the server, but the existing cache node
          // was prefetched, so we should reuse that.
          newCacheNode = {
            status: existingCacheNode.status,
            data: existingCacheNode.data,
            subTreeData: existingCacheNode.subTreeData,
            parallelRoutes: new Map(existingCacheNode.parallelRoutes),
          } as CacheNode
        } else {
          // No data available for this node. This will trigger a lazy fetch
          // during render.
          newCacheNode = {
            status: CacheStates.LAZY_INITIALIZED,
            data: null,
            subTreeData: null,
            parallelRoutes: new Map(existingCacheNode?.parallelRoutes),
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
          wasPrefetched
        )

        newCache.parallelRoutes.set(key, parallelRouteCacheNode)
        continue
      }
    }

    let newCacheNode: CacheNode
    if (parallelSeedData !== null) {
      // New data was sent from the server.
      const seedNode = parallelSeedData[2]
      newCacheNode = {
        status: CacheStates.READY,
        data: null,
        subTreeData: seedNode,
        parallelRoutes: new Map(),
      }
    } else {
      // No data available for this node. This will trigger a lazy fetch
      // during render.
      newCacheNode = {
        status: CacheStates.LAZY_INITIALIZED,
        data: null,
        subTreeData: null,
        parallelRoutes: new Map(),
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
      wasPrefetched
    )
  }
}
