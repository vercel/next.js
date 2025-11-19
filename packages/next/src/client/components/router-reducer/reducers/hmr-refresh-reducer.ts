import type {
  Mutable,
  ReadonlyReducerState,
  ReducerState,
  HmrRefreshAction,
} from '../router-reducer-types'
import { handleNavigationResult } from './navigate-reducer'
import { refresh as refreshUsingSegmentCache } from '../../segment-cache/navigation'
import { revalidateEntireCache } from '../../segment-cache/cache'

export function hmrRefreshReducerImpl(
  state: ReadonlyReducerState,
  action: HmrRefreshAction
): ReducerState {
  // There was a code change. Purge the entire prefetch cache. This is the main
  // difference between an HMR refresh and a normal refresh.
  revalidateEntireCache(state.nextUrl, state.tree)

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

function hmrRefreshReducerNoop(
  state: ReadonlyReducerState,
  _action: HmrRefreshAction
): ReducerState {
  return state
}

export const hmrRefreshReducer =
  process.env.NODE_ENV === 'production'
    ? hmrRefreshReducerNoop
    : hmrRefreshReducerImpl
