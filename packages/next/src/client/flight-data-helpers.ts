import type {
  FlightRouterState,
  FlightSegmentPath,
  Segment,
  InitialRSCPayload,
} from '../shared/lib/app-router-types'
import type {
  FullTransportNode,
  TransportSegment,
} from '../shared/lib/rsc-transport'
import { PAGE_SEGMENT_KEY } from '../shared/lib/segment'
import type { NormalizedSearch } from './components/segment-cache/cache-key'
import {
  getCacheKeyForDynamicParam,
  parseDynamicParamFromURLPart,
  doesStaticSegmentAppearInURL,
  getRenderedPathname,
  getRenderedSearch,
} from './route-params'
import { createHrefFromUrl } from './components/router-reducer/create-href-from-url'

export function createInitialRSCPayloadFromFallbackPrerender(
  response: Response,
  fallbackInitialRSCPayload: InitialRSCPayload
): InitialRSCPayload {
  // This is a static fallback page. In order to hydrate the page, we need to
  // parse the client params from the URL, but to account for the possibility
  // that the page was rewritten, we need to check the response headers
  // for x-nextjs-rewritten-path or x-nextjs-rewritten-query headers. Since
  // we can't access the headers of the initial document response, the client
  // performs a fetch request to the current location. Since it's possible that
  // the fetch request will be dynamically rewritten to a different path than
  // the initial document, this fetch request delivers _all_ the hydration data
  // for the page; it was not inlined into the document, like it normally
  // would be.
  //
  // TODO: Consider treating the case where fetch is rewritten to a different
  // path from the document as a special deopt case. We should optimistically
  // assume this won't happen, inline the data into the document, and perform
  // a minimal request (like a HEAD or range request) to verify that the
  // response matches. Tricky to get right because we need to account for
  // all the different deployment environments we support, like output:
  // "export" mode, where we currently don't assume that custom response
  // headers are present.

  // Patch the transport tree sent by the server with the correct params
  // parsed from the URL + response object.
  const renderedPathname = getRenderedPathname(response)
  const renderedSearch = getRenderedSearch(response)
  const canonicalUrl = createHrefFromUrl(new URL(location.href))
  const fallbackTransportData = fallbackInitialRSCPayload.t
  const payload: InitialRSCPayload = {
    c: canonicalUrl.split('/'),
    q: renderedSearch,
    i: fallbackInitialRSCPayload.i,
    t: {
      t: fillInFallbackTransportTree(
        fallbackTransportData.t,
        renderedPathname.split('/').filter((part) => part !== ''),
        0,
        renderedSearch as NormalizedSearch
      ),
      h: fallbackTransportData.h,
    },
    m: fallbackInitialRSCPayload.m,
    G: fallbackInitialRSCPayload.G,
    S: fallbackInitialRSCPayload.S,
  }
  if (fallbackInitialRSCPayload.b) {
    payload.b = fallbackInitialRSCPayload.b
  }
  return payload
}

/**
 * A fallback prerender is rendered without concrete param values. Fill them
 * in by parsing the rendered pathname, so the hydrated tree has the same
 * identity a direct render of this URL would have.
 */
function fillInFallbackTransportTree(
  node: FullTransportNode,
  pathnameParts: Array<string>,
  pathnamePartsIndex: number,
  renderedSearch: NormalizedSearch
): FullTransportNode {
  const originalSegment = node.s
  let newSegment: TransportSegment
  let doesAppearInURL: boolean
  if (typeof originalSegment === 'string') {
    newSegment = originalSegment
    doesAppearInURL = doesStaticSegmentAppearInURL(originalSegment)
  } else {
    const paramValue = parseDynamicParamFromURLPart(
      originalSegment.t,
      pathnameParts,
      pathnamePartsIndex
    )
    newSegment = {
      n: originalSegment.n,
      t: originalSegment.t,
      k: getCacheKeyForDynamicParam(paramValue, renderedSearch),
      s: originalSegment.s,
    }
    doesAppearInURL = true
  }

  // Only increment the index if the segment appears in the URL. If it's a
  // "virtual" segment, like a route group, it remains the same.
  const childPathnamePartsIndex = doesAppearInURL
    ? pathnamePartsIndex + 1
    : pathnamePartsIndex

  const children = node.c
  let newChildren: Map<string, FullTransportNode> | undefined
  if (children !== undefined) {
    newChildren = new Map()
    for (const [parallelRouteKey, childNode] of children) {
      newChildren.set(
        parallelRouteKey,
        fillInFallbackTransportTree(
          childNode,
          pathnameParts,
          childPathnamePartsIndex,
          renderedSearch
        )
      )
    }
  }

  const newNode: FullTransportNode = {
    s: newSegment,
    d: node.d,
  }
  if (node.h !== undefined) {
    newNode.h = node.h
  }
  if (newChildren !== undefined) {
    newNode.c = newChildren
  }
  return newNode
}

export function getNextFlightSegmentPath(
  flightSegmentPath: FlightSegmentPath
): FlightSegmentPath {
  // Since `FlightSegmentPath` is a repeated tuple of `Segment` and `ParallelRouteKey`, we slice off two items
  // to get the next segment path.
  return flightSegmentPath.slice(2)
}

/**
 * This function is used to prepare the flight router state for the request.
 * It removes markers that are not needed by the server, and are purely used
 * for stashing state on the client.
 * @param flightRouterState - The flight router state to prepare.
 * @param isHmrRefresh - Whether this is an HMR refresh request.
 * @returns The prepared flight router state.
 */
export function prepareFlightRouterStateForRequest(
  flightRouterState: FlightRouterState,
  isHmrRefresh?: boolean
): string {
  // HMR requests need the complete, unmodified state for proper functionality
  if (isHmrRefresh) {
    return encodeURIComponent(JSON.stringify(flightRouterState))
  }

  return encodeURIComponent(
    JSON.stringify(stripClientOnlyDataFromFlightRouterState(flightRouterState))
  )
}

/**
 * Recursively strips client-only data from FlightRouterState while preserving
 * server-needed information for proper rendering decisions.
 */
function stripClientOnlyDataFromFlightRouterState(
  flightRouterState: FlightRouterState
): FlightRouterState {
  const [
    segment,
    parallelRoutes,
    _refreshState, // Intentionally unused - URLs are client-only
    refreshMarker,
    prefetchHints,
  ] = flightRouterState

  // Strip client-only data from the segment
  const cleanedSegment = stripClientOnlyDataFromSegment(segment)

  // Recursively process parallel routes
  const cleanedParallelRoutes: { [key: string]: FlightRouterState } = {}
  for (const [key, childState] of Object.entries(parallelRoutes)) {
    cleanedParallelRoutes[key] =
      stripClientOnlyDataFromFlightRouterState(childState)
  }

  const result: FlightRouterState = [cleanedSegment, cleanedParallelRoutes]
  if (refreshMarker) {
    result[2] = null // null slightly more compact than undefined
    result[3] = refreshMarker
  }

  // Append optional fields if present
  if (prefetchHints !== undefined) {
    result[4] = prefetchHints
  }

  // Everything else is used only by the client and is not needed for requests.
  return result
}

/**
 * Strips client-only data from segments:
 * - Search parameters from __PAGE__ segments
 * - staticSiblings from dynamic segment tuples (only needed for client-side
 *   prefetch reuse decisions)
 */
function stripClientOnlyDataFromSegment(segment: Segment): Segment {
  if (typeof segment === 'string') {
    // Strip search params from __PAGE__ segments
    if (segment.startsWith(PAGE_SEGMENT_KEY + '?')) {
      return PAGE_SEGMENT_KEY
    }
    return segment
  }
  // Dynamic segment tuple: [paramName, paramCacheKey, paramType, staticSiblings]
  // Strip staticSiblings (4th element) since server doesn't need it
  const [paramName, paramCacheKey, paramType] = segment
  return [paramName, paramCacheKey, paramType, null]
}
