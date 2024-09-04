import type { Dispatch } from 'react'
import React, { use } from 'react'
import { useRef, useEffect, useCallback } from 'react'
import {
  isThenable,
  type AppRouterState,
  type ReducerActions,
  type ReducerState,
} from './router-reducer/router-reducer-types'
import type { AppRouterActionQueue } from '../../shared/lib/router/action-queue'

export type ReduxDevtoolsSyncFn = (state: AppRouterState) => void

function normalizeRouterState(val: any): any {
  if (val instanceof Map) {
    const obj: { [key: string]: any } = {}
    for (const [key, value] of val.entries()) {
      if (typeof value === 'function') {
        obj[key] = 'fn()'
        continue
      }
      if (typeof value === 'object' && value !== null) {
        if (value.$$typeof) {
          obj[key] = value.$$typeof.toString()
          continue
        }
        if (value._bundlerConfig) {
          obj[key] = 'FlightData'
          continue
        }
      }
      obj[key] = normalizeRouterState(value)
    }
    return obj
  }

  if (typeof val === 'object' && val !== null) {
    const obj: { [key: string]: any } = {}
    for (const key in val) {
      const value = val[key]
      if (typeof value === 'function') {
        obj[key] = 'fn()'
        continue
      }
      if (typeof value === 'object' && value !== null) {
        if (value.$$typeof) {
          obj[key] = value.$$typeof.toString()
          continue
        }
        if (value.hasOwnProperty('_bundlerConfig')) {
          obj[key] = 'FlightData'
          continue
        }
      }

      obj[key] = normalizeRouterState(value)
    }
    return obj
  }

  if (Array.isArray(val)) {
    return val.map(normalizeRouterState)
  }

  return val
}

declare global {
  interface Window {
    __REDUX_DEVTOOLS_EXTENSION__: any
  }
}

export interface ReduxDevToolsInstance {
  send(action: any, state: any): void
  init(initialState: any): void
}

export function useUnwrapState(state: ReducerState): AppRouterState {
  // reducer actions can be async, so sometimes we need to suspend until the state is resolved
  if (isThenable(state)) {
    const result = use(state)
    return result
  }

  return state
}

export function useReducerWithReduxDevtools(
  actionQueue: AppRouterActionQueue
): [ReducerState, Dispatch<ReducerActions>, ReduxDevtoolsSyncFn] {
  const [state, setState] = React.useState<ReducerState>(actionQueue.state)
  const devtoolsConnectionRef = useRef<ReduxDevToolsInstance>(undefined)
  const enabledRef = useRef<boolean>(undefined)

  useEffect(() => {
    if (devtoolsConnectionRef.current || enabledRef.current === false) {
      return
    }

    if (
      enabledRef.current === undefined &&
      typeof window.__REDUX_DEVTOOLS_EXTENSION__ === 'undefined'
    ) {
      enabledRef.current = false
      return
    }

    devtoolsConnectionRef.current = window.__REDUX_DEVTOOLS_EXTENSION__.connect(
      {
        instanceId: 8000, // Random number that is high to avoid conflicts
        name: 'next-router',
      }
    )
    if (devtoolsConnectionRef.current) {
      devtoolsConnectionRef.current.init(
        normalizeRouterState(actionQueue.state)
      )

      if (actionQueue) {
        actionQueue.devToolsInstance = devtoolsConnectionRef.current
      }
    }

    return () => {
      devtoolsConnectionRef.current = undefined
    }
  }, [actionQueue])

  const dispatch = useCallback(
    (action: ReducerActions) => {
      actionQueue.dispatch(action, setState)
    },
    [actionQueue]
  )

  // Sync is called after a state update in the HistoryUpdater,
  // for debugging purposes. Since the reducer state may be a Promise,
  // we let the app router use() it and sync on the resolved value if
  // something changed.
  // Using the `state` here would be referentially unstable and cause
  // undesirable re-renders and history updates.
  const sync = useCallback<ReduxDevtoolsSyncFn>((resolvedState) => {
    if (devtoolsConnectionRef.current) {
      devtoolsConnectionRef.current.send(
        { type: 'RENDER_SYNC' },
        normalizeRouterState(resolvedState)
      )
    }
  }, [])

  return [state, dispatch, sync]
}
