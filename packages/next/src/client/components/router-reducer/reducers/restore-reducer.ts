import { createHrefFromUrl } from '../create-href-from-url'
import type {
  ReadonlyReducerState,
  ReducerState,
  RestoreAction,
} from '../router-reducer-types'
import { extractPathFromFlightRouterState } from '../compute-changed-path'
import { updateCacheNodeOnPopstateRestoration } from '../ppr-navigations'

export function restoreReducer(
  state: ReadonlyReducerState,
  action: RestoreAction
): ReducerState {
  const { url, tree } = action
  const href = createHrefFromUrl(url)

  const oldCache = state.cache
  const newCache = process.env.__NEXT_PPR
    ? // When PPR is enabled, we update the cache to drop the prefetch
      // data for any segment whose dynamic data was already received. This
      // prevents an unnecessary flash back to PPR state during a
      // back/forward navigation.
      updateCacheNodeOnPopstateRestoration(oldCache, tree)
    : oldCache

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
    cache: newCache,
    prefetchCache: state.prefetchCache,
    // Restore provided tree
    tree: tree,
    nextUrl: extractPathFromFlightRouterState(tree) ?? url.pathname,
  }
}
