import type { FlightRouterState } from '../../../../shared/lib/app-router-types'
import type {
  AppRouterState,
  GlobalNotFoundAction,
  ReadonlyReducerState,
  ReducerState,
} from '../router-reducer-types'
import { fetchServerResponse } from '../fetch-server-response'
import {
  FreshnessPolicy,
  startPPRNavigation,
  type NavigationRequestAccumulation,
} from '../ppr-navigations'
import { convertServerPatchToFullTree } from '../../segment-cache/navigation'

// Special tree that requests all data for a route (used when we don't know
// the target route's structure)
const DynamicRequestTreeForEntireRoute: FlightRouterState = [
  '',
  {},
  null,
  'refetch',
]

/**
 * Creates a new AppRouterState for global-not-found.
 * This replaces the content without changing the URL.
 */
function completeGlobalNotFound(
  oldState: AppRouterState,
  tree: FlightRouterState,
  cache: AppRouterState['cache'],
  renderedSearch: string
): AppRouterState {
  return {
    // Keep the current URL - don't change it
    canonicalUrl: oldState.canonicalUrl,
    renderedSearch,
    pushRef: {
      pendingPush: false,
      mpaNavigation: false,
      // Don't update history state
      preserveCustomHistoryState: true,
    },
    focusAndScrollRef: {
      apply: true,
      onlyHashChange: false,
      hashFragment: null,
      segmentPaths: [],
    },
    cache,
    tree,
    nextUrl: oldState.nextUrl,
    previousNextUrl: oldState.previousNextUrl,
    debugInfo: oldState.debugInfo,
  }
}

/**
 * Handles the ACTION_GLOBAL_NOT_FOUND action.
 * Fetches the global-not-found page and replaces the current content
 * WITHOUT changing the URL.
 *
 * This bypasses the normal navigation logic that would trigger MPA navigation
 * for global-not-found (because it has a different root layout). Instead, we
 * directly fetch the RSC payload and create a new cache node.
 */
export function globalNotFoundReducer(
  state: ReadonlyReducerState,
  action: GlobalNotFoundAction
): ReducerState {
  const { url } = action
  const notFoundUrl = new URL(url, location.origin)

  // Fetch the global-not-found RSC payload directly
  // Use the special "refetch entire route" tree since we don't know
  // the structure of /_not-found
  return fetchServerResponse(notFoundUrl, {
    flightRouterState: DynamicRequestTreeForEntireRoute,
    nextUrl: state.nextUrl,
  }).then(
    (result) => {
      if (typeof result === 'string') {
        // Server returned MPA navigation URL - this can happen if the server
        // returned HTML instead of RSC. Return current state - the
        // GlobalNotFoundBoundary will handle showing fallback UI.
        return state
      }

      const { flightData, renderedSearch } = result

      // Convert the server response to a full tree
      const navigationSeed = convertServerPatchToFullTree(
        DynamicRequestTreeForEntireRoute,
        flightData,
        renderedSearch
      )

      // Use startPPRNavigation to create the cache node
      const currentUrl = new URL(state.canonicalUrl, location.origin)
      const accumulation: NavigationRequestAccumulation = {
        scrollableSegments: null,
        separateRefreshUrls: null,
      }

      const task = startPPRNavigation(
        Date.now(),
        currentUrl,
        state.renderedSearch,
        state.cache,
        state.tree,
        navigationSeed.routeTree,
        navigationSeed.metadataVaryPath,
        FreshnessPolicy.Default,
        navigationSeed.data,
        navigationSeed.head,
        false,
        accumulation
      )

      if (task === null) {
        // Could not create navigation task - return current state
        return state
      }

      return completeGlobalNotFound(
        state,
        task.route,
        task.node,
        renderedSearch
      )
    },
    () => {
      // Fetch failed - return current state
      return state
    }
  )
}
