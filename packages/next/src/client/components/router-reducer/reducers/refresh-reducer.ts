import type {
  Mutable,
  ReadonlyReducerState,
  ReducerState,
  RefreshAction,
} from '../router-reducer-types'
import { handleNavigationResult } from './navigate-reducer'
import { refresh as refreshUsingSegmentCache } from '../../segment-cache/navigation'

export function refreshReducer(
  state: ReadonlyReducerState,
  action: RefreshAction
): ReducerState {
  const currentUrl = new URL(state.canonicalUrl, action.origin)
  const result = refreshUsingSegmentCache(
    currentUrl,
    state.tree,
    state.nextUrl,
    state.renderedSearch,
    state.canonicalUrl
  )

  const mutable: Mutable = {}
  mutable.preserveCustomHistoryState = false

  return handleNavigationResult(currentUrl, state, mutable, false, result)
}
