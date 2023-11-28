import { computeChangedPath } from './compute-changed-path'
import type {
  Mutable,
  ReadonlyReducerState,
  ReducerState,
} from './router-reducer-types'

function isNotUndefined<T>(value: T): value is Exclude<T, undefined> {
  return typeof value !== 'undefined'
}

export function handleMutable(
  state: ReadonlyReducerState,
  mutable: Mutable
): ReducerState {
  // shouldScroll is true by default, can override to false.
  const shouldScroll = mutable.shouldScroll ?? true

  return {
    buildId: state.buildId,
    // Set href.
    canonicalUrl: isNotUndefined(mutable.canonicalUrl)
      ? mutable.canonicalUrl === state.canonicalUrl
        ? state.canonicalUrl
        : mutable.canonicalUrl
      : state.canonicalUrl,
    pushRef: {
      pendingPush: isNotUndefined(mutable.pendingPush)
        ? mutable.pendingPush
        : state.pushRef.pendingPush,
      mpaNavigation: isNotUndefined(mutable.mpaNavigation)
        ? mutable.mpaNavigation
        : state.pushRef.mpaNavigation,
      preserveCustomHistoryState: isNotUndefined(
        mutable.preserveCustomHistoryState
      )
        ? mutable.preserveCustomHistoryState
        : state.pushRef.preserveCustomHistoryState,
    },
    // All navigation requires scroll and focus management to trigger.
    focusAndScrollRef: {
      apply: shouldScroll
        ? isNotUndefined(mutable?.scrollableSegments)
          ? true
          : state.focusAndScrollRef.apply
        : // If shouldScroll is false then we should not apply scroll and focus management.
          false,
      onlyHashChange:
        !!mutable.hashFragment &&
        state.canonicalUrl.split('#', 1)[0] ===
          mutable.canonicalUrl?.split('#', 1)[0],
      hashFragment: shouldScroll
        ? // Empty hash should trigger default behavior of scrolling layout into view.
          // #top is handled in layout-router.
          mutable.hashFragment && mutable.hashFragment !== ''
          ? // Remove leading # and decode hash to make non-latin hashes work.
            decodeURIComponent(mutable.hashFragment.slice(1))
          : state.focusAndScrollRef.hashFragment
        : // If shouldScroll is false then we should not apply scroll and focus management.
          null,
      segmentPaths: shouldScroll
        ? mutable?.scrollableSegments ?? state.focusAndScrollRef.segmentPaths
        : // If shouldScroll is false then we should not apply scroll and focus management.
          [],
    },
    // Apply cache.
    cache: mutable.cache ? mutable.cache : state.cache,
    prefetchCache: mutable.prefetchCache
      ? mutable.prefetchCache
      : state.prefetchCache,
    // Apply patched router state.
    tree: isNotUndefined(mutable.patchedTree)
      ? mutable.patchedTree
      : state.tree,
    nextUrl: isNotUndefined(mutable.patchedTree)
      ? computeChangedPath(state.tree, mutable.patchedTree) ??
        state.canonicalUrl
      : state.nextUrl,
  }
}
