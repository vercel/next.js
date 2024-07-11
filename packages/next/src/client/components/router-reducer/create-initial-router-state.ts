import type { ReactNode } from 'react'
import type { CacheNode } from '../../../shared/lib/app-router-context.shared-runtime'
import type {
  FlightRouterState,
  CacheNodeSeedData,
  FlightData,
} from '../../../server/app-render/types'

import { createHrefFromUrl } from './create-href-from-url'
import { fillLazyItemsTillLeafWithHead } from './fill-lazy-items-till-leaf-with-head'
import { extractPathFromFlightRouterState } from './compute-changed-path'
import { createPrefetchCacheEntryForInitialLoad } from './prefetch-cache-utils'
import { PrefetchKind, type PrefetchCacheEntry } from './router-reducer-types'
import { addRefreshMarkerToActiveParallelSegments } from './refetch-inactive-parallel-segments'

export interface InitialRouterStateParameters {
  buildId: string
  initialTree: FlightRouterState
  initialCanonicalUrl: string
  initialSeedData: CacheNodeSeedData
  initialParallelRoutes: CacheNode['parallelRoutes']
  location: Location | null
  initialHead: ReactNode
  couldBeIntercepted?: boolean
}

export function createInitialRouterState({
  buildId,
  initialTree,
  initialSeedData,
  initialCanonicalUrl,
  initialParallelRoutes,
  location,
  initialHead,
  couldBeIntercepted,
}: InitialRouterStateParameters) {
  const isServer = !location
  const rsc = initialSeedData[2]

  const cache: CacheNode = {
    lazyData: null,
    rsc: rsc,
    prefetchRsc: null,
    head: null,
    prefetchHead: null,
    // The cache gets seeded during the first render. `initialParallelRoutes` ensures the cache from the first render is there during the second render.
    parallelRoutes: isServer ? new Map() : initialParallelRoutes,
    loading: initialSeedData[3],
  }

  const canonicalUrl =
    // location.href is read as the initial value for canonicalUrl in the browser
    // This is safe to do as canonicalUrl can't be rendered, it's only used to control the history updates in the useEffect further down in this file.
    location
      ? // window.location does not have the same type as URL but has all the fields createHrefFromUrl needs.
        createHrefFromUrl(location)
      : initialCanonicalUrl

  addRefreshMarkerToActiveParallelSegments(initialTree, canonicalUrl)

  const prefetchCache = new Map<string, PrefetchCacheEntry>()

  // When the cache hasn't been seeded yet we fill the cache with the head.
  if (initialParallelRoutes === null || initialParallelRoutes.size === 0) {
    fillLazyItemsTillLeafWithHead(
      cache,
      undefined,
      initialTree,
      initialSeedData,
      initialHead
    )
  }

  const initialState = {
    buildId,
    tree: initialTree,
    cache,
    prefetchCache,
    pushRef: {
      pendingPush: false,
      mpaNavigation: false,
      // First render needs to preserve the previous window.history.state
      // to avoid it being overwritten on navigation back/forward with MPA Navigation.
      preserveCustomHistoryState: true,
    },
    focusAndScrollRef: {
      apply: false,
      onlyHashChange: false,
      hashFragment: null,
      segmentPaths: [],
    },
    canonicalUrl,
    nextUrl:
      // the || operator is intentional, the pathname can be an empty string
      (extractPathFromFlightRouterState(initialTree) || location?.pathname) ??
      null,
  }

  if (location) {
    // Seed the prefetch cache with this page's data.
    // This is to prevent needlessly re-prefetching a page that is already reusable,
    // and will avoid triggering a loading state/data fetch stall when navigating back to the page.
    const url = new URL(
      `${location.pathname}${location.search}`,
      location.origin
    )

    const initialFlightData: FlightData = [
      [initialTree, initialSeedData, initialHead],
    ]
    createPrefetchCacheEntryForInitialLoad({
      url,
      kind: PrefetchKind.AUTO,
      data: [initialFlightData, undefined, false, couldBeIntercepted],
      tree: initialState.tree,
      prefetchCache: initialState.prefetchCache,
      nextUrl: initialState.nextUrl,
    })
  }

  return initialState
}
