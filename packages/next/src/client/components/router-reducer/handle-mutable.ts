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

  let previousNextUrl = state.previousNextUrl
  let nextUrl = state.nextUrl

  if (isNotUndefined(mutable.patchedTree)) {
    // If we received a patched tree, we need to compute the changed path.
    const changedPath = computeChangedPath(state.tree, mutable.patchedTree)
    if (changedPath) {
      // If the tree changed, we need to update the nextUrl
      previousNextUrl = nextUrl
      nextUrl = changedPath
    } else if (!nextUrl) {
      // if the tree ends up being the same (ie, no changed path), and we don't have a nextUrl, then we should use the canonicalUrl
      nextUrl = state.canonicalUrl
    }
    // otherwise this will be a no-op and continue to use the existing nextUrl
  }

  return {
    // Set href.
    canonicalUrl: mutable.canonicalUrl ?? state.canonicalUrl,
    renderedSearch: mutable.renderedSearch ?? state.renderedSearch,
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
      onlyHashChange: mutable.onlyHashChange || false,
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
        ? (mutable?.scrollableSegments ?? state.focusAndScrollRef.segmentPaths)
        : // If shouldScroll is false then we should not apply scroll and focus management.
          [],
    },
    // Apply cache.
    cache: mutable.cache ? mutable.cache : state.cache,
    // Apply patched router state.
    tree: isNotUndefined(mutable.patchedTree)
      ? mutable.patchedTree
      : state.tree,
    nextUrl,
    previousNextUrl: previousNextUrl,
    debugInfo: mutable.collectedDebugInfo ?? null,
  }
}
