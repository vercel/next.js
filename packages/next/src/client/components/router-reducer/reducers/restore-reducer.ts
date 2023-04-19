import { createHrefFromUrl } from '../create-href-from-url'
import {
  ReadonlyReducerState,
  ReducerState,
  RestoreAction,
} from '../router-reducer-types'
import { prunePrefetchCache } from './prune-prefetch-cache'

export function restoreReducer(
  state: ReadonlyReducerState,
  action: RestoreAction
): ReducerState {
  const { url, tree } = action
  const href = createHrefFromUrl(url)
  prunePrefetchCache(state.prefetchCache)

  return {
    // Set canonical url
    canonicalUrl: href,
    pushRef: state.pushRef,
    focusAndScrollRef: state.focusAndScrollRef,
    cache: state.cache,
    prefetchCache: state.prefetchCache,
    // Restore provided tree
    tree: tree,
    nextUrl: url.pathname,
  }
}
