import type { Dispatch } from 'react'
import React, { use, useCallback } from 'react'
import { isThenable } from '../../shared/lib/is-thenable'
import type { AppRouterActionQueue } from '../../shared/lib/router/action-queue'
import type {
  AppRouterState,
  ReducerActions,
  ReducerState,
} from './router-reducer/router-reducer-types'
import { useSyncDevRenderIndicator } from './react-dev-overlay/_experimental/internal/components/errors/dev-tools-indicator/use-sync-dev-render-indicator'

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
  const syncDevRenderIndicator = useSyncDevRenderIndicator()

  const dispatch = useCallback(
    (action: ReducerActions) => {
      syncDevRenderIndicator(() => {
        actionQueue.dispatch(action, setState)
      })
    },
    [actionQueue, syncDevRenderIndicator]
  )

  return [state, dispatch]
}
