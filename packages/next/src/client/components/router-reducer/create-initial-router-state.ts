import type { InitialRSCPayload } from '../../../shared/lib/app-router-types'

import { createHrefFromUrl } from './create-href-from-url'
import { extractPathFromFlightRouterState } from './compute-changed-path'

import type { AppRouterState } from './router-reducer-types'
import { transportNodeToFlightRouterState } from '../../../shared/lib/rsc-transport'
import { createInitialRenderTreeForHydration } from '../render-tree'
import {
  writeNavigationResponseIntoCache,
  segmentCacheMap,
  createRootRouteTree,
} from '../segment-cache/cache'
import { createNavigationSeed } from '../segment-cache/decode-server-response'
import { UnknownDynamicStaleTime } from '../segment-cache/bfcache'
import { discoverKnownRoute } from '../segment-cache/optimistic-routes'
import type { NormalizedSearch } from '../segment-cache/cache-key'

export interface InitialRouterStateParameters {
  navigatedAt: number
  initialRSCPayload: InitialRSCPayload
  location: Location | null
}

export function createInitialRouterState({
  navigatedAt,
  initialRSCPayload,
  location,
}: InitialRouterStateParameters): AppRouterState {
  const {
    c: initialCanonicalUrlParts,
    t: initialTransportData,
    q: initialRenderedSearch,
    i: initialCouldBeIntercepted,
    S: initialSupportsPerSegmentPrefetching,
    s: initialStaleTime,
    u: initialRuntimeDataAccessed,
    r: initialRootVaryParams,
    p: initialRuntimePrefetchStream,
    d: initialDynamicStaleTimeSeconds,
  } = initialRSCPayload

  // When initialized on the server, the canonical URL is provided as an array of parts.
  // This is to ensure that when the RSC payload streamed to the client, crawlers don't interpret it
  // as a URL that should be crawled.
  const initialCanonicalUrl = initialCanonicalUrlParts.join('/')

  // The initial router state tree, derived from the transport tree.
  const initialTree = transportNodeToFlightRouterState(
    initialTransportData.t,
    initialRenderedSearch
  )

  const canonicalUrl =
    // location.href is read as the initial value for canonicalUrl in the browser
    // This is safe to do as canonicalUrl can't be rendered, it's only used to control the history updates in the useEffect further down in this file.
    location
      ? // window.location does not have the same type as URL but has all the fields createHrefFromUrl needs.
        createHrefFromUrl(location)
      : initialCanonicalUrl

  // Decode the initial transport data into the RouteTree type, with the
  // payload's render output embedded on each node and the head as its own
  // one-node tree. (discoverKnownRoute below stores the route tree in the
  // route cache, which strips the data on write — see stripDataFromRouteTree.)
  //
  // For statically-generated-at-build-time HTML pages, the tree baked into
  // the initial RSC payload won't have the correct segment inlining hints
  // because those are computed after the pre-render. The server marks these
  // trees with InliningHintsStale, which causes the route cache entry to be
  // immediately expired. The next prefetch will re-fetch the tree with
  // correct hints from the /_tree response.
  const initialSeed = createNavigationSeed(
    navigatedAt,
    // There's no base tree to overlay onto; the initial payload is a full
    // render from the root.
    null,
    initialTransportData,
    // The initial payload may still be streaming in while we hydrate, so its
    // vary params can't be drained here; they decode as null. The
    // segment-cache write below re-decodes the transport data with the
    // payload's root params once the stale time has resolved.
    null,
    // Same for partiality: only segment-cache writes consume it, and the
    // write below re-decodes with the payload's actual response-level value.
    // Pass the conservative value here.
    true,
    // The initial payload always includes the param values in the tree
    // (fallback shells are patched with the parsed values before this runs —
    // see createInitialRSCPayloadFromFallbackPrerender), so there's no
    // pathname to parse them from.
    null,
    initialRenderedSearch,
    null,
    initialDynamicStaleTimeSeconds ?? UnknownDynamicStaleTime
  )
  const initialRoot = initialSeed.root
  const initialNavigation = createInitialRenderTreeForHydration(
    navigatedAt,
    initialRoot,
    initialSeed.dynamicStaleAt
  )

  // The following only applies in the browser (location !== null) since neither
  // route learning nor segment cache state persists from SSR to client.
  if (location !== null) {
    // Learn the route pattern so we can predict it for future navigations.
    discoverKnownRoute(
      Date.now(),
      location.pathname,
      location.search as NormalizedSearch,
      null, // nextUrl — initial render is never an interception
      null, // No pending entry
      initialRoot,
      initialCouldBeIntercepted,
      canonicalUrl,
      initialSeed.renderedSearch,
      initialSupportsPerSegmentPrefetching,
      false // hasDynamicRewrite
    )

    // TODO: Implement Shell extraction as part of Cached Navigations.
    // Intentionally holding off on doing this until we decide how the Cached
    // Navigations behavior should work in combination with App Shells.

    // Write the initial page into the segment cache, so navigating back to it
    // later doesn't need a request. We reuse the payload that hydration
    // already decoded instead of decoding it again. Only a complete prerender
    // includes `u`, so if it's missing we treat the payload as partial.
    // TODO: Temporary. Navigations check the marker byte to tell whether a
    // response is a complete prerender, and this checks `u`. Once the
    // response says so directly, neither caller needs to pass it.
    writeNavigationResponseIntoCache(
      Date.now(),
      // Only the fields the write reads. `u` is left out on purpose, so the
      // write treats the payload like a live render's.
      {
        t: initialTransportData,
        r: initialRootVaryParams,
        s: initialStaleTime,
        p: initialRuntimePrefetchStream,
      },
      initialStaleTime === undefined ||
        initialRuntimeDataAccessed === undefined,
      initialTree,
      initialRenderedSearch,
      segmentCacheMap // hydration writes are bound to the shared map
    ).catch(() => {
      // The cache write failed. Not fatal — the page rendered normally, we
      // just won't write into the cache.
    })
  }

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
    tree: initialNavigation.tree.route,
    root: createRootRouteTree(
      initialNavigation.tree.node,
      initialNavigation.head.node
    ),
    pushRef: {
      pendingPush: false,
      mpaNavigation: false,
      // First render needs to preserve the previous window.history.state
      // to avoid it being overwritten on navigation back/forward with MPA Navigation.
      preserveCustomHistoryState: true,
    },
    scrollRef: {
      scrollRef: null,
      forceScroll: false,
      onlyHashChange: false,
      hashFragment: null,
    },
    canonicalUrl,
    renderedSearch: initialRenderedSearch,
    // the || operator is intentional, the pathname can be an empty string
    nextUrl:
      (extractPathFromFlightRouterState(initialTree) || location?.pathname) ??
      null,
    previousNextUrl: null,
    debugInfo: null,
  }

  return initialState
}
