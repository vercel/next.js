import type { Dispatch } from 'react'
import React, { use, useCallback } from 'react'
import { isThenable } from '../../shared/lib/is-thenable'
import type { AppRouterActionQueue } from '../../shared/lib/router/action-queue'
import type {
  AppRouterState,
  ReducerActions,
  ReducerState,
} from './router-reducer/router-reducer-types'

export function useUnwrapState(state: ReducerState): AppRouterState {
  // reducer actions can be async, so sometimes we need to suspend until the state is resolved
  if (isThenable(state)) {
    const result = use(state)
    return result
  }

  return state
}

export function useReducer(
  actionQueue: AppRouterActionQueue
): [ReducerState, Dispatch<ReducerActions>] {
  const [state, setState] = React.useState<ReducerState>(actionQueue.state)
  const actionDispatch = (action: ReducerActions) => {
    actionQueue.dispatch(action, setState)
  }

  let syncDevRenderIndicator
  if (process.env.NODE_ENV !== 'production') {
    const useSyncDevRenderIndicator =
      require('./react-dev-overlay/utils/dev-indicator/use-sync-dev-render-indicator')
        .useSyncDevRenderIndicator as typeof import('./react-dev-overlay/utils/dev-indicator/use-sync-dev-render-indicator').useSyncDevRenderIndicator
    // eslint-disable-next-line react-hooks/rules-of-hooks
    syncDevRenderIndicator = useSyncDevRenderIndicator()
  }

  const dispatchCallback =
    process.env.NODE_ENV !== 'production'
      ? (action: ReducerActions) => {
          syncDevRenderIndicator!(() => actionDispatch(action))
        }
      : actionDispatch

  const dispatch = useCallback(dispatchCallback, [
    actionQueue,
    dispatchCallback,
    syncDevRenderIndicator,
  ])

  return [state, dispatch]
}
