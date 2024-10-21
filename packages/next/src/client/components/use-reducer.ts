import type { Dispatch } from 'react'
import React, { use } from 'react'
import { useCallback } from 'react'
import type {
  AppRouterState,
  ReducerActions,
  ReducerState,
} from './router-reducer/router-reducer-types'
import type { AppRouterActionQueue } from '../../shared/lib/router/action-queue'
import { isThenable } from '../../shared/lib/is-thenable'

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

  const dispatch = useCallback(
    (action: ReducerActions) => {
      actionQueue.dispatch(action, setState)
    },
    [actionQueue]
  )

  return [state, dispatch]
}
