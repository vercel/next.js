import type {
  ReadonlyReducerState,
  ReducerState,
  RestoreAction,
} from '../router-reducer-types'
import { extractPathFromFlightRouterState } from '../compute-changed-path'
import {
  FreshnessPolicy,
  resetNavigationLockToPending,
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
import { UnknownDynamicStaleTime } from '../../segment-cache/bfcache'

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
  // TODO: Store the dynamic stale time on the top-level state so it's known
  // during restores and refreshes.
  const accumulation: NavigationRequestAccumulation = {
    separateRefreshUrls: null,
    scrollRef: null,
  }
  const restoreSeed = convertServerPatchToFullTree(
    now,
    treeToRestore,
    null,
    renderedSearch,
    UnknownDynamicStaleTime
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
    restoreSeed.dynamicStaleAt,
    false,
    accumulation,
    // A history-traversal restore never restricts to the shell.
    false
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
    null,
    // History traversal always uses 'replace'.
    'replace',
    // Instant Navigation Testing API: a traversal is not a capture. Spawn its
    // dynamic requests ungated (null lock) so they render from cache or fetch
    // normally rather than being withheld behind the lock.
    null,
    // Not an HMR refresh, so there's no request generation to cancel.
    undefined
  )
  // Instant Navigation Testing API: a traversal resets the lock to a fresh
  // pending scope — releasing any data withheld by prior forward navigations and
  // returning the panel to "awaiting" — without ending the testing session.
  // No-op when the testing API is disabled or no lock is held.
  resetNavigationLockToPending()
  return completeTraverseNavigation(
    state,
    restoredUrl,
    renderedSearch,
    task.node,
    task.route,
    restoredNextUrl
  )
}
