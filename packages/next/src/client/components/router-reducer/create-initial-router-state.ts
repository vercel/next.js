import type { FlightDataPath } from '../../../shared/lib/app-router-types'

import { createHrefFromUrl } from './create-href-from-url'
import { extractPathFromFlightRouterState } from './compute-changed-path'

import type { AppRouterState } from './router-reducer-types'
import { getFlightDataPartsFromPath } from '../../flight-data-helpers'
import { createInitialCacheNodeForHydration } from './ppr-navigations'
import { convertRootFlightRouterStateToRouteTree } from '../segment-cache/cache'
import type { NormalizedSearch } from '../segment-cache/cache-key'

export interface InitialRouterStateParameters {
  navigatedAt: number
  initialCanonicalUrlParts: string[]
  initialRenderedSearch: string
  initialFlightData: FlightDataPath[]
  location: Location | null
}

export function createInitialRouterState({
  navigatedAt,
  initialFlightData,
  initialCanonicalUrlParts,
  initialRenderedSearch,
  location,
}: InitialRouterStateParameters): AppRouterState {
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

  const canonicalUrl =
    // location.href is read as the initial value for canonicalUrl in the browser
    // This is safe to do as canonicalUrl can't be rendered, it's only used to control the history updates in the useEffect further down in this file.
    location
      ? // window.location does not have the same type as URL but has all the fields createHrefFromUrl needs.
        createHrefFromUrl(location)
      : initialCanonicalUrl

  // Conver the initial FlightRouterState into the RouteTree type.
  // NOTE: The metadataVaryPath isn't used for anything currently because the
  // head is embedded into the CacheNode tree, but eventually we'll lift it out
  // and store it on the top-level state object.
  const acc = { metadataVaryPath: null }
  const initialRouteTree = convertRootFlightRouterStateToRouteTree(
    initialTree,
    initialRenderedSearch as NormalizedSearch,
    acc
  )
  const initialTask = createInitialCacheNodeForHydration(
    navigatedAt,
    initialRouteTree,
    initialSeedData,
    initialHead
  )

  // NOTE: We intentionally don't check if any data needs to be fetched from the
  // server. We assume the initial hydration payload is sufficient to render
  // the page.
  //
  // The completeness of the initial data is an important property that we rely
  // on as a last-ditch mechanism for recovering the app; we must always be able
  // to reload a fresh HTML document to get to a consistent state.
  //
  // In the future, there may be cases where the server intentionally sends
  // partial data and expects the client to fill in the rest, in which case this
  // logic may change. (There already is a similar case where the server sends
  // _no_ hydration data in the HTML document at all, and the client fetches it
  // separately, but that's different because we still end up hydrating with a
  // complete tree.)

  const initialState = {
    tree: initialTask.route,
    cache: initialTask.node,
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
    renderedSearch: initialRenderedSearch,
    nextUrl:
      // the || operator is intentional, the pathname can be an empty string
      (extractPathFromFlightRouterState(initialTree) || location?.pathname) ??
      null,
    previousNextUrl: null,
    debugInfo: null,
  }

  return initialState
}
