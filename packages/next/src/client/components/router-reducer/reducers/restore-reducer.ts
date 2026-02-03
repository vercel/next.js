import type {
  ReadonlyReducerState,
  ReducerState,
  RestoreAction,
} from '../router-reducer-types'
import { extractPathFromFlightRouterState } from '../compute-changed-path'
import {
  FreshnessPolicy,
  spawnDynamicRequests,
  startPPRNavigation,
  type NavigationRequestAccumulation,
} from '../ppr-navigations'
import type { FlightRouterState } from '../../../../shared/lib/app-router-types'
import {
  completeHardNavigation,
  completeTraverseNavigation,
  convertServerPatchToFullTree,
} from '../../segment-cache/navigation'

export function restoreReducer(
  state: ReadonlyReducerState,
  action: RestoreAction
): ReducerState {
  // This action is used to restore the router state from the history state.
  // However, it's possible that the history state no longer contains the `FlightRouterState`.
  // We will copy over the internal state on pushState/replaceState events, but if a history entry
  // occurred before hydration, or if the user navigated to a hash using a regular anchor link,
  // the history state will not contain the `FlightRouterState`.
  // In this case, we'll continue to use the existing tree so the router doesn't get into an invalid state.
  let treeToRestore: FlightRouterState | undefined
  let renderedSearch: string | undefined
  const historyState = action.historyState
  if (historyState) {
    treeToRestore = historyState.tree
    renderedSearch = historyState.renderedSearch
  } else {
    treeToRestore = state.tree
    renderedSearch = state.renderedSearch
  }

  const currentUrl = new URL(state.canonicalUrl, location.origin)
  const restoredUrl = action.url
  const restoredNextUrl =
    extractPathFromFlightRouterState(treeToRestore) ?? restoredUrl.pathname

  const now = Date.now()
  const accumulation: NavigationRequestAccumulation = {
    scrollableSegments: null,
    separateRefreshUrls: null,
  }
  const restoreSeed = convertServerPatchToFullTree(
    treeToRestore,
    null,
    renderedSearch
  )
  const task = startPPRNavigation(
    now,
    currentUrl,
    state.renderedSearch,
    state.cache,
    state.tree,
    restoreSeed.routeTree,
    restoreSeed.metadataVaryPath,
    FreshnessPolicy.HistoryTraversal,
    null,
    null,
    false,
    accumulation
  )

  if (task === null) {
    return completeHardNavigation(state, restoredUrl, 'replace')
  }
  spawnDynamicRequests(
    task,
    restoredUrl,
    restoredNextUrl,
    FreshnessPolicy.HistoryTraversal,
    accumulation,
    // History traversal doesn't use route prediction, so there's no route
    // cache entry to mark as having a dynamic rewrite on mismatch. If a
    // mismatch occurs, the retry handler will traverse the known route tree
    // to find and mark the entry.
    null
  )
  return completeTraverseNavigation(
    state,
    restoredUrl,
    renderedSearch,
    task.node,
    task.route,
    restoredNextUrl
  )
}
