import { createHrefFromUrl } from '../create-href-from-url'
import type {
  ReadonlyReducerState,
  ReducerState,
  RestoreAction,
} from '../router-reducer-types'

export function restoreReducer(
  state: ReadonlyReducerState,
  action: RestoreAction
): ReducerState {
  const { url, tree, updateHistory } = action
  const href = createHrefFromUrl(url)

  return {
    buildId: state.buildId,
    // Set canonical url
    canonicalUrl: href,
    pushRef: {
      pendingPush: false,
      mpaNavigation: false,
      updateHistory,
    },
    focusAndScrollRef: state.focusAndScrollRef,
    cache: state.cache,
    prefetchCache: state.prefetchCache,
    // Restore provided tree
    tree: tree,
    nextUrl: url.pathname,
  }
}
