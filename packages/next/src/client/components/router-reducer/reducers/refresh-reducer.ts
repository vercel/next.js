import type {
  Mutable,
  ReadonlyReducerState,
  ReducerState,
  RefreshAction,
} from '../router-reducer-types'
import { handleNavigationResult } from './navigate-reducer'
import { refresh as refreshUsingSegmentCache } from '../../segment-cache/navigation'
import { revalidateEntireCache } from '../../segment-cache/cache'

export function refreshReducer(
  state: ReadonlyReducerState,
  action: RefreshAction
): ReducerState {
  // TODO: Currently, all refreshes purge the prefetch cache. In the future,
  // only client-side refreshes will have this behavior; the server-side
  // `refresh` should send new data without purging the prefetch cache.
  const currentNextUrl = state.nextUrl
  const currentRouterState = state.tree
  revalidateEntireCache(currentNextUrl, currentRouterState)

  const currentUrl = new URL(state.canonicalUrl, action.origin)
  const result = refreshUsingSegmentCache(
    currentUrl,
    state.cache,
    state.tree,
    state.nextUrl,
    state.renderedSearch,
    state.canonicalUrl
  )

  const mutable: Mutable = {}
  mutable.preserveCustomHistoryState = false

  return handleNavigationResult(currentUrl, state, mutable, false, result)
}
