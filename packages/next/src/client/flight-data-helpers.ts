import type {
  CacheNodeSeedData,
  FlightData,
  FlightDataPath,
  FlightRouterState,
  FlightSegmentPath,
  Segment,
  HeadData,
  InitialRSCPayload,
} from '../shared/lib/app-router-types'
import { PAGE_SEGMENT_KEY } from '../shared/lib/segment'
import type { NormalizedSearch } from './components/segment-cache'
import {
  getCacheKeyForDynamicParam,
  parseDynamicParamFromURLPart,
  doesStaticSegmentAppearInURL,
  getRenderedPathname,
  getRenderedSearch,
} from './route-params'
import { createHrefFromUrl } from './components/router-reducer/create-href-from-url'

export type NormalizedFlightData = {
  /**
   * The full `FlightSegmentPath` inclusive of the final `Segment`
   */
  segmentPath: FlightSegmentPath
  /**
   * The `FlightSegmentPath` exclusive of the final `Segment`
   */
  pathToSegment: FlightSegmentPath
  segment: Segment
  tree: FlightRouterState
  seedData: CacheNodeSeedData | null
  head: HeadData
  isHeadPartial: boolean
  isRootRender: boolean
}

// TODO: We should only have to export `normalizeFlightData`, however because the initial flight data
// that gets passed to `createInitialRouterState` doesn't conform to the `FlightDataPath` type (it's missing the root segment)
// we're currently exporting it so we can use it directly. This should be fixed as part of the unification of
// the different ways we express `FlightSegmentPath`.
export function getFlightDataPartsFromPath(
  flightDataPath: FlightDataPath
): NormalizedFlightData {
  // Pick the last 4 items from the `FlightDataPath` to get the [tree, seedData, viewport, isHeadPartial].
  const flightDataPathLength = 4
  // tree, seedData, and head are *always* the last three items in the `FlightDataPath`.
  const [tree, seedData, head, isHeadPartial] =
    flightDataPath.slice(-flightDataPathLength)
  // The `FlightSegmentPath` is everything except the last three items. For a root render, it won't be present.
  const segmentPath = flightDataPath.slice(0, -flightDataPathLength)

  return {
    // TODO: Unify these two segment path helpers. We are inconsistently pushing an empty segment ("")
    // to the start of the segment path in some places which makes it hard to use solely the segment path.
    // Look for "// TODO-APP: remove ''" in the codebase.
    pathToSegment: segmentPath.slice(0, -1),
    segmentPath,
    // if the `FlightDataPath` corresponds with the root, there'll be no segment path,
    // in which case we default to ''.
    segment: segmentPath[segmentPath.length - 1] ?? '',
    tree,
    seedData,
    head,
    isHeadPartial,
    isRootRender: flightDataPath.length === flightDataPathLength,
  }
}

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

  // Patch the Flight data sent by the server with the correct params parsed
  // from the URL + response object.
  const renderedPathname = getRenderedPathname(response)
  const renderedSearch = getRenderedSearch(response)
  const canonicalUrl = createHrefFromUrl(new URL(location.href))
  const originalFlightDataPath = fallbackInitialRSCPayload.f[0]
  const originalFlightRouterState = originalFlightDataPath[0]
  return {
    b: fallbackInitialRSCPayload.b,
    c: canonicalUrl.split('/'),
    q: renderedSearch,
    i: fallbackInitialRSCPayload.i,
    f: [
      [
        fillInFallbackFlightRouterState(
          originalFlightRouterState,
          renderedPathname,
          renderedSearch as NormalizedSearch
        ),
        originalFlightDataPath[1],
        originalFlightDataPath[2],
        originalFlightDataPath[2],
      ],
    ],
    m: fallbackInitialRSCPayload.m,
    G: fallbackInitialRSCPayload.G,
    s: fallbackInitialRSCPayload.s,
    S: fallbackInitialRSCPayload.S,
  }
}

function fillInFallbackFlightRouterState(
  flightRouterState: FlightRouterState,
  renderedPathname: string,
  renderedSearch: NormalizedSearch
): FlightRouterState {
  const pathnameParts = renderedPathname.split('/').filter((p) => p !== '')
  const index = 0
  return fillInFallbackFlightRouterStateImpl(
    flightRouterState,
    renderedSearch,
    pathnameParts,
    index
  )
}

function fillInFallbackFlightRouterStateImpl(
  flightRouterState: FlightRouterState,
  renderedSearch: NormalizedSearch,
  pathnameParts: Array<string>,
  pathnamePartsIndex: number
): FlightRouterState {
  const originalSegment = flightRouterState[0]
  let newSegment: Segment
  let doesAppearInURL: boolean
  if (typeof originalSegment === 'string') {
    newSegment = originalSegment
    doesAppearInURL = doesStaticSegmentAppearInURL(originalSegment)
  } else {
    const paramName = originalSegment[0]
    const paramType = originalSegment[2]
    const paramValue = parseDynamicParamFromURLPart(
      paramType,
      pathnameParts,
      pathnamePartsIndex
    )
    const cacheKey = getCacheKeyForDynamicParam(paramValue, renderedSearch)
    newSegment = [paramName, cacheKey, paramType]
    doesAppearInURL = true
  }

  // Only increment the index if the segment appears in the URL. If it's a
  // "virtual" segment, like a route group, it remains the same.
  const childPathnamePartsIndex = doesAppearInURL
    ? pathnamePartsIndex + 1
    : pathnamePartsIndex

  const children = flightRouterState[1]
  const newChildren: { [key: string]: FlightRouterState } = {}
  for (let key in children) {
    const childFlightRouterState = children[key]
    newChildren[key] = fillInFallbackFlightRouterStateImpl(
      childFlightRouterState,
      renderedSearch,
      pathnameParts,
      childPathnamePartsIndex
    )
  }

  const newState: FlightRouterState = [
    newSegment,
    newChildren,
    null,
    flightRouterState[3],
    flightRouterState[4],
  ]
  return newState
}

export function getNextFlightSegmentPath(
  flightSegmentPath: FlightSegmentPath
): FlightSegmentPath {
  // Since `FlightSegmentPath` is a repeated tuple of `Segment` and `ParallelRouteKey`, we slice off two items
  // to get the next segment path.
  return flightSegmentPath.slice(2)
}

export function normalizeFlightData(
  flightData: FlightData
): NormalizedFlightData[] | string {
  // FlightData can be a string when the server didn't respond with a proper flight response,
  // or when a redirect happens, to signal to the client that it needs to perform an MPA navigation.
  if (typeof flightData === 'string') {
    return flightData
  }

  return flightData.map((flightDataPath) =>
    getFlightDataPartsFromPath(flightDataPath)
  )
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
    _url, // Intentionally unused - URLs are client-only
    refreshMarker,
    isRootLayout,
    hasLoadingBoundary,
  ] = flightRouterState

  // __PAGE__ segments are always fetched from the server, so there's
  // no need to send them up
  const cleanedSegment = stripSearchParamsFromPageSegment(segment)

  // Recursively process parallel routes
  const cleanedParallelRoutes: { [key: string]: FlightRouterState } = {}
  for (const [key, childState] of Object.entries(parallelRoutes)) {
    cleanedParallelRoutes[key] =
      stripClientOnlyDataFromFlightRouterState(childState)
  }

  const result: FlightRouterState = [
    cleanedSegment,
    cleanedParallelRoutes,
    null, // URLs omitted - server reconstructs paths from segments
    shouldPreserveRefreshMarker(refreshMarker) ? refreshMarker : null,
  ]

  // Append optional fields if present
  if (isRootLayout !== undefined) {
    result[4] = isRootLayout
  }
  if (hasLoadingBoundary !== undefined) {
    result[5] = hasLoadingBoundary
  }

  return result
}

/**
 * Strips search parameters from __PAGE__ segments to prevent sensitive
 * client-side data from being sent to the server.
 */
function stripSearchParamsFromPageSegment(segment: Segment): Segment {
  if (
    typeof segment === 'string' &&
    segment.startsWith(PAGE_SEGMENT_KEY + '?')
  ) {
    return PAGE_SEGMENT_KEY
  }
  return segment
}

/**
 * Determines whether the refresh marker should be sent to the server
 * Client-only markers like 'refresh' are stripped, while server-needed markers
 * like 'refetch' and 'inside-shared-layout' are preserved.
 */
function shouldPreserveRefreshMarker(
  refreshMarker: FlightRouterState[3]
): boolean {
  return Boolean(refreshMarker && refreshMarker !== 'refresh')
}
