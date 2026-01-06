import type { FlightRouterState } from '../../../../shared/lib/app-router-types'
import type {
  Mutable,
  GlobalNotFoundAction,
  ReadonlyReducerState,
  ReducerState,
} from '../router-reducer-types'
import { handleMutable } from '../handle-mutable'
import { fetchServerResponse } from '../fetch-server-response'
import { createCacheNodeForGlobalNotFound } from '../ppr-navigations'
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
  const mutable: Mutable = {}

  // Don't update history state - keep the current URL
  mutable.preserveCustomHistoryState = true
  mutable.pendingPush = false

  // Fetch the global-not-found RSC payload directly
  // Use the special "refetch entire route" tree since we don't know
  // the structure of /_not-found
  return fetchServerResponse(notFoundUrl, {
    flightRouterState: DynamicRequestTreeForEntireRoute,
    nextUrl: state.nextUrl,
  }).then(
    (result) => {
      if (typeof result === 'string') {
        // Server returned MPA navigation URL - this shouldn't happen for
        // /_not-found but if it does, just return current state
        return state
      }

      const { flightData, renderedSearch } = result

      // Convert the server response to a full tree
      // Use the same tree we sent in the request
      const navigationSeed = convertServerPatchToFullTree(
        DynamicRequestTreeForEntireRoute,
        flightData,
        renderedSearch
      )

      // Create cache node directly, bypassing navigation compatibility checks
      const { cacheNode, flightRouterState } = createCacheNodeForGlobalNotFound(
        navigationSeed.tree,
        navigationSeed.data,
        navigationSeed.head
      )

      // Apply the new content without changing the URL
      mutable.cache = cacheNode
      mutable.patchedTree = flightRouterState
      mutable.renderedSearch = renderedSearch
      // Intentionally NOT setting mutable.canonicalUrl to keep the URL unchanged
      mutable.shouldScroll = true

      return handleMutable(state, mutable)
    },
    () => {
      // Fetch failed - return current state
      return state
    }
  )
}
