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
import {
  getCacheKeyForDynamicParam,
  parseDynamicParamFromURLPart,
  doesStaticSegmentAppearInURL,
  getRenderedPathname,
  getRenderedSearch,
} from './route-params'
import { createHrefFromUrl } from './components/router-reducer/create-href-from-url'
import { splitPathnameIntoParts } from './components/segment-cache/cache-key'

export function createInitialRSCPayloadFromFallbackPrerender(
  response: Response,
  fallbackInitialRSCPayload: InitialRSCPayload
): InitialRSCPayload {
  // The Instant Navigation Testing API fetches an aggregate prerendered
  // payload, including unresolved route params. The client resolves them from
  // the same response's rewritten URL to keep routing and data consistent.
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
        splitPathnameIntoParts(renderedPathname),
        0
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
export function fillInFallbackTransportTree(
  node: FullTransportNode,
  pathnameParts: Array<string>,
  pathnamePartsIndex: number
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
      k: getCacheKeyForDynamicParam(paramValue),
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
          childPathnamePartsIndex
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

  // Leave out the page's search params. They're only used by the client, and
  // request headers may be forwarded through redirects.
  return result
}

/**
 * Strips client-only data from segments:
 * - staticSiblings from dynamic segment tuples (only needed for client-side
 *   prefetch reuse decisions)
 */
function stripClientOnlyDataFromSegment(segment: Segment): Segment {
  if (typeof segment === 'string') {
    return segment
  }
  // Dynamic segment tuple: [paramName, paramCacheKey, paramType, staticSiblings]
  // Strip staticSiblings (4th element) since server doesn't need it
  const [paramName, paramCacheKey, paramType] = segment
  return [paramName, paramCacheKey, paramType, null]
}
