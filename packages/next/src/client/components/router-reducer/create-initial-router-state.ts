import type { CacheNode } from '../../../shared/lib/app-router-context.shared-runtime'
import type { FlightDataPath } from '../../../server/app-render/types'

import { createHrefFromUrl } from './create-href-from-url'
import { fillLazyItemsTillLeafWithHead } from './fill-lazy-items-till-leaf-with-head'
import { extractPathFromFlightRouterState } from './compute-changed-path'
import { createSeededPrefetchCacheEntry } from './prefetch-cache-utils'
import { PrefetchKind, type PrefetchCacheEntry } from './router-reducer-types'
import { addRefreshMarkerToActiveParallelSegments } from './refetch-inactive-parallel-segments'
import { getFlightDataPartsFromPath } from '../../flight-data-helpers'

export interface InitialRouterStateParameters {
  initialCanonicalUrlParts: string[]
  initialParallelRoutes: CacheNode['parallelRoutes']
  initialFlightData: FlightDataPath[]
  location: Location | null
  couldBeIntercepted: boolean
  postponed: boolean
  prerendered: boolean
}

export function createInitialRouterState({
  initialFlightData,
  initialCanonicalUrlParts,
  initialParallelRoutes,
  location,
  couldBeIntercepted,
  postponed,
  prerendered,
}: InitialRouterStateParameters) {
  // When initialized on the server, the canonical URL is provided as an array of parts.
  // This is to ensure that when the RSC payload streamed to the client, crawlers don't interpret it
  // as a URL that should be crawled.
  const initialCanonicalUrl = initialCanonicalUrlParts.join('/')
  const normalizedFlightData = getFlightDataPartsFromPath(initialFlightData[0])
  const {
    tree: initialTree,
    seedData: initialSeedData,
    head: initialHead,
  } = normalizedFlightData
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
    parallelRoutes: initialParallelRoutes,
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
      initialHead,
      undefined
    )
  }

  const initialState = {
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

  if (process.env.NODE_ENV !== 'development' && location) {
    // Seed the prefetch cache with this page's data.
    // This is to prevent needlessly re-prefetching a page that is already reusable,
    // and will avoid triggering a loading state/data fetch stall when navigating back to the page.
    // We don't currently do this in development because links aren't prefetched in development
    // so having a mismatch between prefetch/no prefetch provides inconsistent behavior based on which page
    // was loaded first.
    const url = new URL(
      `${location.pathname}${location.search}`,
      location.origin
    )

    createSeededPrefetchCacheEntry({
      url,
      data: {
        flightData: [normalizedFlightData],
        canonicalUrl: undefined,
        couldBeIntercepted: !!couldBeIntercepted,
        prerendered,
        postponed,
        // TODO: The initial RSC payload includes both static and dynamic data
        // in the same response, even if PPR is enabled. So if there's any
        // dynamic data at all, we can't set a stale time. In the future we may
        // add a way to split a single Flight stream into static and dynamic
        // parts. But in the meantime we should at least make this work for
        // fully static pages.
        staleTime: -1,
      },
      tree: initialState.tree,
      prefetchCache: initialState.prefetchCache,
      nextUrl: initialState.nextUrl,
      kind: prerendered ? PrefetchKind.FULL : PrefetchKind.AUTO,
    })
  }

  return initialState
}
