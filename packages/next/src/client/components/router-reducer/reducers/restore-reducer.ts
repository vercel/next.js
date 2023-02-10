import { createHrefFromUrl } from '../create-href-from-url'
import {
  ReadonlyReducerState,
  ReducerState,
  RestoreAction,
} from '../router-reducer-types'

export function restoreReducer(
  state: ReadonlyReducerState,
  action: RestoreAction
): ReducerState {
  const { url, tree } = action
  const href = createHrefFromUrl(url)

  return {
    // Set canonical url
    canonicalUrl: href,
    pushRef: state.pushRef,
    focusAndScrollRef: state.focusAndScrollRef,
    cache: state.cache,
    prefetchCache: state.prefetchCache,
    // Restore provided tree
    tree: tree,
  }
}
