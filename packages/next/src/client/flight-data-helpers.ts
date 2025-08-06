import type {
  CacheNodeSeedData,
  DynamicParamTypesShort,
  FlightData,
  FlightDataPath,
  FlightRouterState,
  FlightSegmentPath,
  Segment,
} from '../server/app-render/types'
import type { HeadData } from '../shared/lib/app-router-context.shared-runtime'
import { PAGE_SEGMENT_KEY } from '../shared/lib/segment'
import {
  doesStaticSegmentAppearInURL,
  parseDynamicParamFromURLPart,
} from './route-params'

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
  flightDataPath: FlightDataPath,
  renderedPathname: string
): NormalizedFlightData {
  // Pick the last 4 items from the `FlightDataPath` to get the [tree, seedData, viewport, isHeadPartial].
  const flightDataPathLength = 4
  // tree, seedData, and head are *always* the last three items in the `FlightDataPath`.
  const [tree, seedData, head, isHeadPartial] =
    flightDataPath.slice(-flightDataPathLength)
  // The `FlightSegmentPath` is everything except the last three items. For a root render, it won't be present.
  const segmentPath = flightDataPath.slice(0, -flightDataPathLength)

  fillTreeWithParamValues(renderedPathname, segmentPath, tree)

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

export function getNextFlightSegmentPath(
  flightSegmentPath: FlightSegmentPath
): FlightSegmentPath {
  // Since `FlightSegmentPath` is a repeated tuple of `Segment` and `ParallelRouteKey`, we slice off two items
  // to get the next segment path.
  return flightSegmentPath.slice(2)
}

export function normalizeFlightData(
  flightData: FlightData,
  renderedPathname: string
): NormalizedFlightData[] | string {
  // FlightData can be a string when the server didn't respond with a proper flight response,
  // or when a redirect happens, to signal to the client that it needs to perform an MPA navigation.
  if (typeof flightData === 'string') {
    return flightData
  }

  return flightData.map((flightDataPath) =>
    getFlightDataPartsFromPath(flightDataPath, renderedPathname)
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

function fillTreeWithParamValues(
  renderedPathname: string,
  segmentPath: FlightSegmentPath,
  flightRouterState: FlightRouterState
): void {
  // Traverse the FlightRouterState and fill in the param values using the
  // rendered pathname.

  // Remove trailing and leading slashes, then split the pathname into parts.
  // These will be assigned as params as we traverse the tree.
  const pathnameParts = renderedPathname.split('/').filter((p) => p !== '')

  let pathnamePartsIndex = 0

  // segmentPath represents the parent path of subtree. It's a repeating pattern
  // of parallel route key and segment:
  //
  //   [string, Segment, string, Segment, string, Segment, ...]
  //
  // Iterate through the path and skip over the corresponding pathname parts.
  for (let i = 0; i < segmentPath.length; i += 2) {
    const segment: Segment = segmentPath[i + 1]
    if (Array.isArray(segment) || doesStaticSegmentAppearInURL(segment)) {
      // This segment appears in the URL, so we need to skip over this part
      // of the pathname
      pathnamePartsIndex++
    }
  }

  fillTreeWithParamValuesImpl(
    renderedPathname,
    flightRouterState,
    pathnameParts,
    pathnamePartsIndex
  )
}

function fillTreeWithParamValuesImpl(
  renderedPathname: string,
  flightRouterState: FlightRouterState,
  pathnameParts: Array<string>,
  pathnamePartsIndex: number
): void {
  const segment = flightRouterState[0]

  let doesAppearInURL: boolean
  if (Array.isArray(segment)) {
    doesAppearInURL = true

    // This segment is parameterized. Get the param from the pathname.
    const paramType = segment[2] as DynamicParamTypesShort
    const paramValue = parseDynamicParamFromURLPart(
      paramType,
      pathnameParts,
      pathnamePartsIndex
    )

    // Insert the param value into the segment.
    // TODO: Eventually this is the value that will be passed to client
    // components that render this param.
    segment[3] = paramValue

    // Assign a cache key to the segment, based on the param value. In the
    // pre-Segment Cache implementation, the server computes this and sends it
    // in the body of the response. In the Segment Cache implementation, the
    // server sends an empty string and we fill it in here.
    // TODO: This will land in a follow up PR.
    // const segmentCacheKey = getCacheKeyForDynamicParam(paramValue)
    // segment[1] = segmentCacheKey
  } else {
    doesAppearInURL = doesStaticSegmentAppearInURL(segment)
  }

  // Only increment the index if the segment appears in the URL. If it's a
  // "virtual" segment, like a route group, it remains the same.
  const childPathnamePartsIndex = doesAppearInURL
    ? pathnamePartsIndex + 1
    : pathnamePartsIndex

  const parallelRoutes = flightRouterState[1]
  for (const parallelRouteKey in parallelRoutes) {
    fillTreeWithParamValuesImpl(
      renderedPathname,
      parallelRoutes[parallelRouteKey],
      pathnameParts,
      childPathnamePartsIndex
    )
  }
}
