import type {
  FlightRouterState,
  FlightSegmentPath,
} from '../../../server/app-render/types'
import { matchSegment } from '../match-segments'

/**
 * Deep merge of the two router states. Parallel route keys are preserved if the patch doesn't have them.
 */
function applyPatch(
  initialTree: FlightRouterState,
  patchTree: FlightRouterState
): FlightRouterState {
  const [initialSegment, initialParallelRoutes] = initialTree
  const [patchSegment, patchParallelRoutes] = patchTree

  // if the applied patch segment is __DEFAULT__ then we can ignore it and return the initial tree
  // this is because the __DEFAULT__ segment is used as a placeholder on navigation
  if (patchSegment === '__DEFAULT__' && initialSegment !== '__DEFAULT__') {
    return initialTree
  }

  if (matchSegment(initialSegment, patchSegment)) {
    const newParallelRoutes: FlightRouterState[1] = {}
    for (const key in initialParallelRoutes) {
      const isInPatchTreeParallelRoutes =
        typeof patchParallelRoutes[key] !== 'undefined'
      if (isInPatchTreeParallelRoutes) {
        newParallelRoutes[key] = applyPatch(
          initialParallelRoutes[key],
          patchParallelRoutes[key]
        )
      } else {
        newParallelRoutes[key] = initialParallelRoutes[key]
      }
    }

    for (const key in patchParallelRoutes) {
      if (newParallelRoutes[key]) {
        continue
      }

      newParallelRoutes[key] = patchParallelRoutes[key]
    }

    const tree: FlightRouterState = [initialSegment, newParallelRoutes]

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
    parallelRoutePatch = applyPatch(parallelRoutes[parallelRouteKey], treePatch)
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
