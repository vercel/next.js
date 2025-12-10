import {
  ACTION_NAVIGATE,
  type NavigateAction,
  type ReadonlyReducerState,
  type ReducerState,
} from '../router-reducer-types'
import { revalidateEntireCache } from '../../segment-cache/cache'
import { navigateReducer } from './navigate-reducer'

export function refreshReducer(state: ReadonlyReducerState): ReducerState {
  // Client-side refreshes via router.refresh() purge the prefetch cache.
  // This is unlike the server-side `refresh()`, which only refreshes the
  // dynamic data.
  //
  // This is mostly for backwards compatibility. We may add an option to
  // do a client-initiated refresh without purging the prefetch cache.
  const currentNextUrl = state.nextUrl
  const currentRouterState = state.tree
  revalidateEntireCache(currentNextUrl, currentRouterState)

  // The rest of the behavior of refreshes is expressed using the
  // navigateReducer. This ensure that the behavior stays consistent with other
  // features that trigger refreshes, like same-page navigations, or a
  // redirect to the current page triggered by a Server Action.
  // TODO: Eventually the router reducer will be refactored more like a state
  // machine, instead of doing everything through reducer "actions". The current
  // design is an artifact of the original implementation, which ran entirely
  // inside useReducer.
  return navigateReducer(state, navigateActionThatTriggersRefresh)
}

const navigateActionThatTriggersRefresh: NavigateAction = {
  type: ACTION_NAVIGATE,
  url: null,
  isExternalUrl: false,
  navigateType: 'replace',
  shouldScroll: true,
  shouldRefreshDynamicData: true,
  seed: null,
  continuationId: null,
}
