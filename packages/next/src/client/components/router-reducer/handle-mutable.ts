import {
  Mutable,
  ReadonlyReducerState,
  ReducerState,
} from './router-reducer-types'

export function handleMutable(
  state: ReadonlyReducerState,
  mutable: Mutable
): ReducerState {
  return {
    // Set href.
    canonicalUrl:
      typeof mutable.canonicalUrl !== 'undefined'
        ? mutable.canonicalUrl === state.canonicalUrl
          ? state.canonicalUrl
          : mutable.canonicalUrl
        : state.canonicalUrl,
    pushRef: {
      pendingPush:
        typeof mutable.pendingPush !== 'undefined'
          ? mutable.pendingPush
          : state.pushRef.pendingPush,
      mpaNavigation:
        typeof mutable.mpaNavigation !== 'undefined'
          ? mutable.mpaNavigation
          : state.pushRef.mpaNavigation,
    },
    // All navigation requires scroll and focus management to trigger.
    focusAndScrollRef: {
      apply:
        typeof mutable.applyFocusAndScroll !== 'undefined'
          ? mutable.applyFocusAndScroll
          : state.focusAndScrollRef.apply,
    },
    // Apply cache.
    cache: mutable.cache ? mutable.cache : state.cache,
    prefetchCache: mutable.prefetchCache
      ? mutable.prefetchCache
      : state.prefetchCache,
    // Apply patched router state.
    tree:
      typeof mutable.patchedTree !== 'undefined'
        ? mutable.patchedTree
        : state.tree,
  }
}
