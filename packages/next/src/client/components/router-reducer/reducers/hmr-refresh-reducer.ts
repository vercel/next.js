import type {
  HmrRefreshAction,
  ReadonlyReducerState,
  ReducerState,
} from '../router-reducer-types'
import { refreshDynamicData } from './refresh-reducer'
import { FreshnessPolicy } from '../ppr-navigations'
import { invalidatePrefetchCacheEntries } from '../../segment-cache/cache'
import { invalidateBfCache } from '../../segment-cache/bfcache'

export function hmrRefreshReducer(
  state: ReadonlyReducerState,
  action: HmrRefreshAction
): ReducerState {
  // HMR actions may wait behind a Server Action in the router queue. If a
  // newer generation superseded this one before it started, do not install a
  // refresh tree whose request is already canceled.
  if (action.signal?.aborted) {
    return state
  }

  if (action.invalidateOnly) {
    invalidatePrefetchCacheEntries()
    invalidateBfCache()
    return state
  }

  return refreshDynamicData(state, FreshnessPolicy.HMRRefresh, action.signal)
}
