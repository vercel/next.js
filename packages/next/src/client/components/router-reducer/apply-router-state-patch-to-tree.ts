import type {
  FlightRouterState,
  FlightSegmentPath,
} from '../../../server/app-render/types'
import { DEFAULT_SEGMENT_KEY } from '../../../shared/lib/segment'
import { matchSegment } from '../match-segments'

/**
 * Deep merge of the two router states. Parallel route keys are preserved if the patch doesn't have them.
 */
function applyPatch(
  initialTree: FlightRouterState,
  patchTree: FlightRouterState,
  applyPatchToDefaultSegment: boolean = false
): FlightRouterState {
  const [initialSegment, initialParallelRoutes] = initialTree
  const [patchSegment, patchParallelRoutes] = patchTree

  // if the applied patch segment is __DEFAULT__ then it can be ignored in favor of the initial tree
  // this is because the __DEFAULT__ segment is used as a placeholder on navigation
  // however, there are cases where we _do_ want to apply the patch to the default segment,
  // such as when revalidating the router cache with router.refresh/revalidatePath
  if (
    !applyPatchToDefaultSegment &&
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
          patchParallelRoutes[key],
          applyPatchToDefaultSegment
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

function applyRouterStatePatchToTreeImpl(
  flightSegmentPath: FlightSegmentPath,
  flightRouterState: FlightRouterState,
  treePatch: FlightRouterState,
  applyPatchDefaultSegment: boolean = false
): FlightRouterState | null {
  const [segment, parallelRoutes, , , isRootLayout] = flightRouterState

  // Root refresh
  if (flightSegmentPath.length === 1) {
    const tree: FlightRouterState = applyPatch(
      flightRouterState,
      treePatch,
      applyPatchDefaultSegment
    )

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
    parallelRoutePatch = applyPatch(
      parallelRoutes[parallelRouteKey],
      treePatch,
      applyPatchDefaultSegment
    )
  } else {
    parallelRoutePatch = applyRouterStatePatchToTreeImpl(
      flightSegmentPath.slice(2),
      parallelRoutes[parallelRouteKey],
      treePatch,
      applyPatchDefaultSegment
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

/**
 * Apply the router state from the Flight response to the tree, including default segments.
 * Useful for patching the router cache when we expect to revalidate the full tree, such as with router.refresh or revalidatePath.
 * Creates a new router state tree.
 */
export function applyRouterStatePatchToFullTree(
  flightSegmentPath: FlightSegmentPath,
  flightRouterState: FlightRouterState,
  treePatch: FlightRouterState
): FlightRouterState | null {
  return applyRouterStatePatchToTreeImpl(
    flightSegmentPath,
    flightRouterState,
    treePatch,
    true
  )
}

/**
 * Apply the router state from the Flight response, but skip patching default segments.
 * Useful for patching the router cache when navigating, where we persist the existing default segment if there isn't a new one.
 * Creates a new router state tree.
 */
export function applyRouterStatePatchToTreeSkipDefault(
  flightSegmentPath: FlightSegmentPath,
  flightRouterState: FlightRouterState,
  treePatch: FlightRouterState
): FlightRouterState | null {
  return applyRouterStatePatchToTreeImpl(
    flightSegmentPath,
    flightRouterState,
    treePatch,
    false
  )
}
