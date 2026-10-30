import {
  ACTION_NAVIGATE,
  type RedirectAction,
  type ReducerState,
  type ReadonlyReducerState,
  ScrollBehavior,
} from '../router-reducer-types'
import { navigateReducer } from './navigate-reducer'

export function redirectReducer(
  state: ReadonlyReducerState,
  action: RedirectAction
): ReducerState {
  if (action.previousTree !== state.tree) {
    // A newer navigation replaced the tree that threw the redirect, so the
    // redirect no longer applies. If the new tree throws it too, it'll be
    // dispatched again.
    return state
  }
  return navigateReducer(state, {
    type: ACTION_NAVIGATE,
    url: action.url,
    isExternalUrl: action.isExternalUrl,
    locationSearch: action.locationSearch,
    // If the navigation that rendered this tree hasn't committed yet, the
    // redirect takes over its push. Otherwise it would replace the history
    // entry of the page the user came from.
    navigateType: state.pushRef.pendingPush ? 'push' : action.redirectType,
    scrollBehavior: ScrollBehavior.Default,
  })
}
