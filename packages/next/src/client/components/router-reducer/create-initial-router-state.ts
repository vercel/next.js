import type { InitialRSCPayload } from '../../../shared/lib/app-router-types'

import { createHrefFromUrl } from './create-href-from-url'
import { extractPathFromFlightRouterState } from './compute-changed-path'

import type { AppRouterState } from './router-reducer-types'
import { getFlightDataPartsFromPath } from '../../flight-data-helpers'
import { createInitialCacheNodeForHydration } from './ppr-navigations'
import {
  convertRootFlightRouterStateToRouteTree,
  getStaleAt,
  processRuntimePrefetchStream,
  writeDynamicRenderResponseIntoCache,
  writeStaticStageResponseIntoCache,
} from '../segment-cache/cache'
import { FetchStrategy } from '../segment-cache/types'
import {
  UnknownDynamicStaleTime,
  computeDynamicStaleAt,
} from '../segment-cache/bfcache'
import { decodeStaticStage } from './fetch-server-response'
import { discoverKnownRoute } from '../segment-cache/optimistic-routes'
import type { NormalizedSearch } from '../segment-cache/cache-key'

export interface InitialRouterStateParameters {
  navigatedAt: number
  initialRSCPayload: InitialRSCPayload
  initialFlightStreamForCache?: ReadableStream<Uint8Array> | null
  location: Location | null
}

export function createInitialRouterState({
  navigatedAt,
  initialRSCPayload,
  initialFlightStreamForCache,
  location,
}: InitialRouterStateParameters): AppRouterState {
  const {
    c: initialCanonicalUrlParts,
    f: initialFlightData,
    q: initialRenderedSearch,
    i: initialCouldBeIntercepted,
    S: initialSupportsPerSegmentPrefetching,
    s: initialStaleTime,
    l: initialStaticStageByteLength,
    h: initialHeadVaryParams,
    p: initialRuntimePrefetchStream,
    d: initialDynamicStaleTimeSeconds,
  } = initialRSCPayload

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

  // Convert the initial FlightRouterState into the RouteTree type.
  // NOTE: The metadataVaryPath isn't used for anything currently because the
  // head is embedded into the CacheNode tree, but eventually we'll lift it out
  // and store it on the top-level state object.
  //
  // TODO: For statically-generated-at-build-time HTML pages, the
  // FlightRouterState baked into the initial RSC payload won't have the
  // correct segment inlining hints (ParentInlinedIntoSelf, InlinedIntoChild)
  // because those are computed after the pre-render. The client will need to
  // fetch the correct hints from the route tree prefetch (/_tree) response
  // before acting on inlining decisions.
  const acc = { metadataVaryPath: null }
  const initialRouteTree = convertRootFlightRouterStateToRouteTree(
    initialTree,
    initialRenderedSearch as NormalizedSearch,
    acc
  )
  const metadataVaryPath = acc.metadataVaryPath
  const initialTask = createInitialCacheNodeForHydration(
    navigatedAt,
    initialRouteTree,
    initialSeedData,
    initialHead,
    computeDynamicStaleAt(
      navigatedAt,
      initialDynamicStaleTimeSeconds ?? UnknownDynamicStaleTime
    )
  )

  // The following only applies in the browser (location !== null) since neither
  // route learning nor segment cache state persists from SSR to client.
  if (location !== null && metadataVaryPath !== null) {
    // Learn the route pattern so we can predict it for future navigations.
    discoverKnownRoute(
      Date.now(),
      location.pathname,
      null, // nextUrl — initial render is never an interception
      null, // No pending entry
      initialRouteTree,
      metadataVaryPath,
      initialCouldBeIntercepted,
      canonicalUrl,
      initialSupportsPerSegmentPrefetching,
      false // hasDynamicRewrite
    )

    // Write the initial seed data into the segment cache so subsequent
    // navigations to the initial page can serve cached segments instantly.
    if (initialSeedData !== null && initialStaleTime !== undefined) {
      if (
        initialStaticStageByteLength !== undefined &&
        initialFlightStreamForCache != null
      ) {
        // Partially static page — truncate the cloned Flight stream at the
        // static stage byte boundary, decode, and cache the static subset.
        decodeStaticStage<InitialRSCPayload>(
          initialFlightStreamForCache,
          initialStaticStageByteLength,
          undefined
        )
          .then(async (staticStageResponse) => {
            const now = Date.now()
            const staleAt = await getStaleAt(now, staticStageResponse.s)

            writeStaticStageResponseIntoCache(
              now,
              staticStageResponse.f,
              undefined, // no build ID mismatch check for initial HTML
              staticStageResponse.h,
              staleAt,
              initialTree,
              initialRenderedSearch,
              true // isResponsePartial
            )
          })
          .catch(() => {
            // The static stage processing failed. Not fatal — the page
            // rendered normally, we just won't write into the cache.
          })
      } else {
        // Fully static page — cache the entire decoded seed data as-is. We're
        // not using the initial response here (which would allow us to combine
        // the two branches) to avoid unnecessary decoding of the Flight data,
        // since we can just take the seed data that we already decoded during
        // hydration and write it into the cache directly.
        const now = Date.now()

        getStaleAt(now, initialStaleTime)
          .then((staleAt) => {
            writeStaticStageResponseIntoCache(
              now,
              initialFlightData,
              undefined, // buildId — not applicable for initial HTML
              initialHeadVaryParams,
              staleAt,
              initialTree,
              initialRenderedSearch,
              false // isResponsePartial
            )
          })
          .catch(() => {
            // The static stage processing failed. Not fatal — the page
            // rendered normally, we just won't write into the cache.
          })

        // Cancel the stream clone — fully static path doesn't need it.
        initialFlightStreamForCache?.cancel()
      }
    } else {
      // No caching — cancel the unused stream clone.
      initialFlightStreamForCache?.cancel()
    }

    // If the initial RSC payload includes an embedded runtime prefetch stream,
    // decode it and write the runtime data into the segment cache. This allows
    // subsequent navigations to serve runtime-prefetchable content from cache
    // without a separate prefetch request.
    if (initialRuntimePrefetchStream != null) {
      processRuntimePrefetchStream(
        Date.now(),
        initialRuntimePrefetchStream,
        initialTree,
        initialRenderedSearch
      )
        .then((processed) => {
          if (processed !== null) {
            writeDynamicRenderResponseIntoCache(
              Date.now(),
              FetchStrategy.PPRRuntime,
              processed.flightDatas,
              processed.buildId,
              processed.isResponsePartial,
              processed.headVaryParams,
              processed.staleAt,
              processed.navigationSeed,
              null
            )
          }
        })
        .catch(() => {
          // Runtime prefetch cache write failed. Not fatal — the page rendered
          // normally, we just won't cache runtime data.
        })
    }
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
