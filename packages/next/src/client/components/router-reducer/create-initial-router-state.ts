import type { CacheNode } from '../../../shared/lib/app-router-context.shared-runtime'
import type { FlightDataPath } from '../../../server/app-render/types'

import { createHrefFromUrl } from './create-href-from-url'
import { fillLazyItemsTillLeafWithHead } from './fill-lazy-items-till-leaf-with-head'
import { extractPathFromFlightRouterState } from './compute-changed-path'
import { createPrefetchCacheEntryForInitialLoad } from './prefetch-cache-utils'
import type { PrefetchCacheEntry } from './router-reducer-types'
import { addRefreshMarkerToActiveParallelSegments } from './refetch-inactive-parallel-segments'
import { getFlightDataPartsFromPath } from '../../flight-data-helpers'

export interface InitialRouterStateParameters {
  buildId: string
  initialCanonicalUrlParts: string[]
  initialParallelRoutes: CacheNode['parallelRoutes']
  initialFlightData: FlightDataPath[]
  location: Location | null
  couldBeIntercepted: boolean
  postponed: boolean
}

export function createInitialRouterState({
  buildId,
  initialFlightData,
  initialCanonicalUrlParts,
  initialParallelRoutes,
  location,
  couldBeIntercepted,
  postponed,
}: InitialRouterStateParameters) {
  // When initialized on the server, the canonical URL is provided as an array of parts.
  // This is to ensure that when the RSC payload streamed to the client, crawlers don't interpret it
  // as a URL that should be crawled.
  const initialCanonicalUrl = initialCanonicalUrlParts.join('/')
  const {
    tree: initialTree,
    seedData: initialSeedData,
    head: initialHead,
  } = getFlightDataPartsFromPath(initialFlightData[0])
  const isServer = !location
  // For the SSR render, seed data should always be available (we only send back a `null` response
  // in the case of a `loading` segment, pre-PPR.)
  const rsc = initialSeedData?.[1]
  const loading = initialSeedData?.[3] ?? null

  const cache: CacheNode = {
    lazyData: null,
    rsc,
    prefetchRsc: null,
    head: null,
    prefetchHead: null,
    // The cache gets seeded during the first render. `initialParallelRoutes` ensures the cache from the first render is there during the second render.
    parallelRoutes: isServer ? new Map() : initialParallelRoutes,
    loading,
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

    createPrefetchCacheEntryForInitialLoad({
      url,
      data: {
        flightData: initialFlightData,
        canonicalUrl: undefined,
        couldBeIntercepted: !!couldBeIntercepted,
        // TODO: the server should probably send a value for this. Default to false for now.
        isPrerender: false,
        postponed,
      },
      tree: initialState.tree,
      prefetchCache: initialState.prefetchCache,
      nextUrl: initialState.nextUrl,
    })
  }

  return initialState
}
