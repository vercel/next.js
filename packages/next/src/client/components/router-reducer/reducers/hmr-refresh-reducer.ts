import type {
  ReadonlyReducerState,
  ReducerState,
} from '../router-reducer-types'
import { refreshDynamicData } from './refresh-reducer'
import { FreshnessPolicy } from '../ppr-navigations'

export function hmrRefreshReducer(state: ReadonlyReducerState): ReducerState {
  return refreshDynamicData(state, FreshnessPolicy.HMRRefresh)
}
