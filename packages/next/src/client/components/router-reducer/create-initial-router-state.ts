import type { InitialRSCPayload } from '../../../shared/lib/app-router-types'

import { createHrefFromUrl } from './create-href-from-url'
import { extractPathFromFlightRouterState } from './compute-changed-path'

import type { AppRouterState } from './router-reducer-types'
import { transportNodeToFlightRouterState } from '../../../shared/lib/rsc-transport'
import { createInitialCacheNodeForHydration } from '../render-tree'
import {
  writeRuntimePrefetchStreamIntoCache,
  spawnStaticStageCacheWrite,
  segmentCacheMap,
} from '../segment-cache/cache'
import { decodeTransportTreeIntoRouteTree } from '../segment-cache/decode-server-response'
import {
  UnknownDynamicStaleTime,
  computeDynamicStaleAt,
} from '../segment-cache/bfcache'
import { decodeStageUntilBoundary } from './fetch-server-response'
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
    t: initialTransportData,
    q: initialRenderedSearch,
    i: initialCouldBeIntercepted,
    S: initialSupportsPerSegmentPrefetching,
    s: initialStaleTime,
    l: initialStaticStageByteLength,
    r: initialRootVaryParams,
    p: initialRuntimePrefetchStream,
    d: initialDynamicStaleTimeSeconds,
  } = initialRSCPayload

  // When initialized on the server, the canonical URL is provided as an array of parts.
  // This is to ensure that when the RSC payload streamed to the client, crawlers don't interpret it
  // as a URL that should be crawled.
  const initialCanonicalUrl = initialCanonicalUrlParts.join('/')

  const initialHead = initialTransportData.h.r

  // The initial router state tree, derived from the transport tree. Page
  // segments keep their search params, which travel inside the segment
  // string.
  const initialTree = transportNodeToFlightRouterState(initialTransportData.t)

  const canonicalUrl =
    // location.href is read as the initial value for canonicalUrl in the browser
    // This is safe to do as canonicalUrl can't be rendered, it's only used to control the history updates in the useEffect further down in this file.
    location
      ? // window.location does not have the same type as URL but has all the fields createHrefFromUrl needs.
        createHrefFromUrl(location)
      : initialCanonicalUrl

  // Decode the initial transport tree into the RouteTree type, with the
  // payload's render output embedded on each node. (discoverKnownRoute below
  // stores this tree in the route cache, which strips the data on write —
  // see stripDataFromRouteTree.)
  // NOTE: The metadataVaryPath isn't used for anything currently because the
  // head is embedded into the CacheNode tree, but eventually we'll lift it out
  // and store it on the top-level state object.
  //
  // For statically-generated-at-build-time HTML pages, the tree baked into
  // the initial RSC payload won't have the correct segment inlining hints
  // because those are computed after the pre-render. The server marks these
  // trees with InliningHintsStale, which causes the route cache entry to be
  // immediately expired. The next prefetch will re-fetch the tree with
  // correct hints from the /_tree response.
  const acc = { metadataVaryPath: null, treeDivergedFromBase: false }
  const initialRouteTree = decodeTransportTreeIntoRouteTree(
    initialTransportData.t,
    // There's no base tree to overlay onto; the initial payload is a full
    // render from the root.
    null,
    // The initial payload may still be streaming in while we hydrate, so its
    // vary params can't be drained here — and nothing consumes them from
    // this tree. The segment-cache write below re-decodes the transport data
    // with the payload's root params once the stale time has resolved.
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
    initialRenderedSearch as NormalizedSearch,
    acc
  )
  const metadataVaryPath = acc.metadataVaryPath
  const initialTask = createInitialCacheNodeForHydration(
    navigatedAt,
    initialRouteTree,
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
      location.search as NormalizedSearch,
      null, // nextUrl — initial render is never an interception
      null, // No pending entry
      initialRouteTree,
      metadataVaryPath,
      initialCouldBeIntercepted,
      canonicalUrl,
      initialSupportsPerSegmentPrefetching,
      false // hasDynamicRewrite
    )

    // TODO: Implement Shell extraction as part of Cached Navigations.
    // Intentionally holding off on doing this until we decide how the Cached
    // Navigations behavior should work in combination with App Shells.

    // Write the initial payload's segment data into the segment cache so
    // subsequent navigations to the initial page can serve cached
    // segments instantly.
    if (initialStaleTime !== undefined) {
      if (
        initialStaticStageByteLength !== undefined &&
        initialFlightStreamForCache != null
      ) {
        // Partially static page — truncate the cloned Flight stream at the
        // static stage byte boundary, decode, and cache the static subset.
        // Promise.resolve wraps the Flight-deserialized thenable into a
        // native Promise so we can chain `.then` on it safely.
        Promise.resolve(initialStaticStageByteLength)
          .then(async (byteLength) => {
            const staticStageResponse =
              await decodeStageUntilBoundary<InitialRSCPayload>(
                initialFlightStreamForCache,
                byteLength,
                undefined
              )
            spawnStaticStageCacheWrite(
              Date.now(),
              staticStageResponse,
              true, // isResponsePartial
              null, // responseHeaders — no build-id check for initial HTML
              initialTree,
              initialRenderedSearch,
              segmentCacheMap // hydration writes are bound to the shared map
            )
          })
          .catch(() => {
            // The static stage processing failed. Not fatal — the page
            // rendered normally, we just won't write into the cache.
          })
      } else {
        // Fully static page — cache the initial payload's segment data as-is.
        // We're not using the initial response here (which would allow us to
        // combine the two branches) to avoid unnecessary decoding of the
        // Flight data, since we can just take the segment data that we
        // already decoded during hydration and write it into the
        // cache directly.
        spawnStaticStageCacheWrite(
          Date.now(),
          // The transport subset of the initial payload, already decoded
          // during hydration. `u` (the runtime-data verdict) is deliberately
          // omitted from this synthesized subset — its writes record their
          // strategy unrefined — while the truncated branch above forwards
          // the decoded payload's own `u`.
          {
            t: initialTransportData,
            r: initialRootVaryParams,
            s: initialStaleTime,
          },
          false, // isResponsePartial
          null, // responseHeaders — no build-id check for initial HTML
          initialTree,
          initialRenderedSearch,
          segmentCacheMap // hydration writes are bound to the shared map
        )

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
      writeRuntimePrefetchStreamIntoCache(
        Date.now(),
        initialRuntimePrefetchStream,
        initialTree,
        initialRenderedSearch,
        segmentCacheMap // hydration writes are bound to the shared map
      ).catch(() => {
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
