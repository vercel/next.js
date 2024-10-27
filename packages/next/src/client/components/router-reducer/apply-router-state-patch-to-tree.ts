import type {
  FlightRouterState,
  FlightSegmentPath,
} from '../../../server/app-render/types'
import { DEFAULT_SEGMENT_KEY } from '../../../shared/lib/segment'
import { getNextFlightSegmentPath } from '../../flight-data-helpers'
import { matchSegment } from '../match-segments'
import { addRefreshMarkerToActiveParallelSegments } from './refetch-inactive-parallel-segments'

/**
 * Deep merge of the two router states. Parallel route keys are preserved if the patch doesn't have them.
 */
function applyPatch(
  initialTree: FlightRouterState,
  patchTree: FlightRouterState
): FlightRouterState {
  const [initialSegment, initialParallelRoutes] = initialTree
  const [patchSegment, patchParallelRoutes] = patchTree

  // if the applied patch segment is __DEFAULT__ then it can be ignored in favor of the initial tree
  // this is because the __DEFAULT__ segment is used as a placeholder on navigation
  if (
    patchSegment === DEFAULT_SEGMENT_KEY &&
    initialSegment !== DEFAULT_SEGMENT_KEY
  ) {
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

    // Copy over the existing tree
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
 * Apply the router state from the Flight response, but skip patching default segments.
 * Useful for patching the router cache when navigating, where we persist the existing default segment if there isn't a new one.
 * Creates a new router state tree.
 */
export function applyRouterStatePatchToTree(
  flightSegmentPath: FlightSegmentPath,
  flightRouterState: FlightRouterState,
  treePatch: FlightRouterState,
  path: string
): FlightRouterState | null {
  const [segment, parallelRoutes, url, refetch, isRootLayout] =
    flightRouterState

  // Root refresh
  if (flightSegmentPath.length === 1) {
    const tree: FlightRouterState = applyPatch(flightRouterState, treePatch)

    addRefreshMarkerToActiveParallelSegments(tree, path)

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
      getNextFlightSegmentPath(flightSegmentPath),
      parallelRoutes[parallelRouteKey],
      treePatch,
      path
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
    url,
    refetch,
  ]

  // Current segment is the root layout
  if (isRootLayout) {
    tree[4] = true
  }

  addRefreshMarkerToActiveParallelSegments(tree, path)

  return tree
}
