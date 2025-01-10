import type {
  CacheNodeSeedData,
  FlightData,
  FlightDataPath,
  FlightRouterState,
  FlightSegmentPath,
  Segment,
} from '../server/app-render/types'
import type { HeadData } from '../shared/lib/app-router-context.shared-runtime'

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

  return flightData.map(getFlightDataPartsFromPath)
}
