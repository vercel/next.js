import {
  FlightRouterState,
  FlightSegmentPath,
} from '../../../server/app-render'
import { matchSegment } from '../match-segments'

/**
 * Deep merge of the two router states. Parallel route keys are preserved if the patch doesn't have them.
 */
function applyPatch(
  initialTree: FlightRouterState,
  patchTree: FlightRouterState
): FlightRouterState {
  const [segment, parallelRoutes] = initialTree

  if (matchSegment(segment, patchTree[0])) {
    const newParallelRoutes: FlightRouterState[1] = {}
    for (const key in parallelRoutes) {
      const isInPatchTreeParallelRoutes =
        typeof patchTree[1][key] !== 'undefined'
      if (isInPatchTreeParallelRoutes) {
        newParallelRoutes[key] = applyPatch(
          parallelRoutes[key],
          patchTree[1][key]
        )
      } else {
        newParallelRoutes[key] = parallelRoutes[key]
      }
    }

    for (const key in patchTree[1]) {
      if (newParallelRoutes[key]) {
        continue
      }

      newParallelRoutes[key] = patchTree[1][key]
    }

    const tree: FlightRouterState = [segment, newParallelRoutes]

    if (initialTree[2]) {
      tree[2] = initialTree[2]
    }

    if (initialTree[3]) {
      tree[3] = initialTree[3]
    }

    if (initialTree[4]) {
      tree[4] = initialTree[4]
    }

    return tree
  }

  return patchTree
}
/**
 * Apply the router state from the Flight response. Creates a new router state tree.
 */
export function applyRouterStatePatchToTree(
  flightSegmentPath: FlightSegmentPath,
  flightRouterState: FlightRouterState,
  treePatch: FlightRouterState
): FlightRouterState | null {
  const [segment, parallelRoutes, , , isRootLayout] = flightRouterState

  // Root refresh
  if (flightSegmentPath.length === 1) {
    const tree: FlightRouterState = applyPatch(flightRouterState, treePatch)

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
