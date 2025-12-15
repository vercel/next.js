import type { FlightDataPath } from '../../../shared/lib/app-router-types'

import { createHrefFromUrl } from './create-href-from-url'
import { extractPathFromFlightRouterState } from './compute-changed-path'

import type { AppRouterState } from './router-reducer-types'
import { getFlightDataPartsFromPath } from '../../flight-data-helpers'
import { createInitialCacheNodeForHydration } from './ppr-navigations'

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

  const initialState = {
    tree: initialTree,
    cache: createInitialCacheNodeForHydration(
      navigatedAt,
      initialTree,
      initialSeedData,
      initialHead
    ),
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
