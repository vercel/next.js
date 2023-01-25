import { FlightRouterState, FlightData } from '../../../server/app-render'
import { matchSegment } from '../match-segments'

/**
 * Apply the router state from the Flight response. Creates a new router state tree.
 */
export function applyRouterStatePatchToTree(
  flightSegmentPath: FlightData[0],
  flightRouterState: FlightRouterState,
  treePatch: FlightRouterState
): FlightRouterState | null {
  const [segment, parallelRoutes, , , isRootLayout] = flightRouterState

  // Root refresh
  if (flightSegmentPath.length === 1) {
    const tree: FlightRouterState = [...treePatch]

    return tree
  }

  const [currentSegment, parallelRouteKey] = flightSegmentPath

  // Tree path returned from the server should always match up with the current tree in the browser
  if (!matchSegment(currentSegment, segment)) {
    return null
  }

  const lastSegment = flightSegmentPath.length === 2

  let parallelRoutePatch
  if (lastSegment) {
    parallelRoutePatch = treePatch
  } else {
    parallelRoutePatch = applyRouterStatePatchToTree(
      flightSegmentPath.slice(2),
      parallelRoutes[parallelRouteKey],
      treePatch
    )

    if (parallelRoutePatch === null) {
      return null
    }
  }

  const tree: FlightRouterState = [
    flightSegmentPath[0],
    {
      ...parallelRoutes,
      [parallelRouteKey]: parallelRoutePatch,
    },
  ]

  // Current segment is the root layout
  if (isRootLayout) {
    tree[4] = true
  }

  return tree
}
