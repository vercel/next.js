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

  const syncDevRenderIndicatorInDevelopment =
    useSyncDevRenderIndicatorInDevelopment()

  const dispatch = useCallback(
    (action: ReducerActions) => {
      syncDevRenderIndicatorInDevelopment(() =>
        actionQueue.dispatch(action, setState)
      )
    },
    [actionQueue, syncDevRenderIndicatorInDevelopment]
  )

  return [state, dispatch]
}

const PASS_THROUGH = (fn: () => void) => fn()

const useSyncDevRenderIndicatorInDevelopment = () => {
  if (process.env.NODE_ENV !== 'production') {
    const useSyncDevRenderIndicator =
      require('./react-dev-overlay/utils/dev-indicator/use-sync-dev-render-indicator')
        .useSyncDevRenderIndicator as typeof import('./react-dev-overlay/utils/dev-indicator/use-sync-dev-render-indicator').useSyncDevRenderIndicator

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const syncDevRenderIndicator = useSyncDevRenderIndicator()
    return syncDevRenderIndicator
  } else {
    return PASS_THROUGH
  }
}
