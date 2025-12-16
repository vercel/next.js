import { createHrefFromUrl } from '../create-href-from-url'
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
import { handleExternalUrl } from './navigate-reducer'
import type { Mutable } from '../router-reducer-types'
import { convertServerPatchToFullTree } from '../../segment-cache/navigation'

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
  const restoredCanonicalUrl = createHrefFromUrl(restoredUrl)
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
    FreshnessPolicy.HistoryTraversal,
    null,
    null,
    null,
    null,
    false,
    false,
    accumulation
  )

  if (task === null) {
    const mutable: Mutable = {
      preserveCustomHistoryState: true,
    }
    return handleExternalUrl(state, mutable, restoredCanonicalUrl, false)
  }

  spawnDynamicRequests(
    task,
    restoredUrl,
    restoredNextUrl,
    FreshnessPolicy.HistoryTraversal,
    accumulation
  )

  return {
    // Set canonical url
    canonicalUrl: restoredCanonicalUrl,
    renderedSearch,
    pushRef: {
      pendingPush: false,
      mpaNavigation: false,
      // Ensures that the custom history state that was set is preserved when applying this update.
      preserveCustomHistoryState: true,
    },
    focusAndScrollRef: state.focusAndScrollRef,
    cache: task.node,
    // Restore provided tree
    tree: task.route,

    nextUrl: restoredNextUrl,
    // TODO: We need to restore previousNextUrl, too, which represents the
    // Next-Url that was used to fetch the data. Anywhere we fetch using the
    // canonical URL, there should be a corresponding Next-Url.
    previousNextUrl: null,
    debugInfo: null,
  }
}
