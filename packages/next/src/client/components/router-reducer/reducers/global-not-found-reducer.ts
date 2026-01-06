import type {
  Mutable,
  GlobalNotFoundAction,
  ReadonlyReducerState,
  ReducerState,
} from '../router-reducer-types'
import { handleMutable } from '../handle-mutable'
import { navigate as navigateUsingSegmentCache } from '../../segment-cache/navigation'
import { NavigationResultTag } from '../../segment-cache/types'
import { FreshnessPolicy } from '../ppr-navigations'

/**
 * Handles the ACTION_GLOBAL_NOT_FOUND action.
 * Fetches the global-not-found page and replaces the current content
 * WITHOUT changing the URL.
 */
export function globalNotFoundReducer(
  state: ReadonlyReducerState,
  action: GlobalNotFoundAction
): ReducerState {
  const { url } = action
  const notFoundUrl = new URL(url, location.origin)
  const currentUrl = new URL(state.canonicalUrl, location.origin)
  const mutable: Mutable = {}

  // Don't update history state - keep the current URL
  mutable.preserveCustomHistoryState = true
  mutable.pendingPush = false

  const result = navigateUsingSegmentCache(
    notFoundUrl,
    currentUrl,
    state.cache,
    state.tree,
    FreshnessPolicy.StaleIfCached,
    state.nextUrl,
    true // shouldScroll
  )

  switch (result.tag) {
    case NavigationResultTag.MPA: {
      // If we can't do a client-side navigation, fall back to MPA
      mutable.mpaNavigation = true
      mutable.canonicalUrl = notFoundUrl.toString()
      mutable.pendingPush = false
      return handleMutable(state, mutable)
    }
    case NavigationResultTag.Success: {
      // Apply the not-found content
      mutable.cache = result.data.cacheNode
      mutable.patchedTree = result.data.flightRouterState
      mutable.renderedSearch = result.data.renderedSearch
      // Intentionally NOT setting mutable.canonicalUrl to keep the URL unchanged
      mutable.scrollableSegments = result.data.scrollableSegments ?? undefined
      mutable.shouldScroll = result.data.shouldScroll
      mutable.hashFragment = result.data.hash
      return handleMutable(state, mutable)
    }
    case NavigationResultTag.Async: {
      return result.data.then(
        (asyncResult) => {
          if (asyncResult.tag === NavigationResultTag.Success) {
            mutable.cache = asyncResult.data.cacheNode
            mutable.patchedTree = asyncResult.data.flightRouterState
            mutable.renderedSearch = asyncResult.data.renderedSearch
            // Intentionally NOT setting mutable.canonicalUrl
            mutable.scrollableSegments =
              asyncResult.data.scrollableSegments ?? undefined
            mutable.shouldScroll = asyncResult.data.shouldScroll
            mutable.hashFragment = asyncResult.data.hash
            return handleMutable(state, mutable)
          } else if (asyncResult.tag === NavigationResultTag.MPA) {
            mutable.mpaNavigation = true
            mutable.canonicalUrl = notFoundUrl.toString()
            return handleMutable(state, mutable)
          }
          return state
        },
        () => state
      )
    }
    default: {
      return state
    }
  }
}
