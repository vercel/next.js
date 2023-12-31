import { createHrefFromUrl } from '../create-href-from-url'
import type {
  ReadonlyReducerState,
  ReducerState,
  RestoreAction,
} from '../router-reducer-types'
import { extractPathFromFlightRouterState } from '../compute-changed-path'

export function restoreReducer(
  state: ReadonlyReducerState,
  action: RestoreAction
): ReducerState {
  const { url, tree } = action
  const href = createHrefFromUrl(url)

  return {
    buildId: state.buildId,
    // Set canonical url
    canonicalUrl: href,
    pushRef: {
      pendingPush: false,
      mpaNavigation: false,
      // Ensures that the custom history state that was set is preserved when applying this update.
      preserveCustomHistoryState: true,
    },
    focusAndScrollRef: state.focusAndScrollRef,
    cache: state.cache,
    prefetchCache: state.prefetchCache,
    // Restore provided tree
    tree: tree,
    nextUrl: extractPathFromFlightRouterState(tree) ?? url.pathname,
  }
}
