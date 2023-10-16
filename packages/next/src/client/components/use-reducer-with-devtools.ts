import type { Dispatch } from 'react'
import React, { use, useContext } from 'react'
import { useRef, useEffect, useCallback } from 'react'
import type {
  AppRouterState,
  ReducerActions,
  ReducerState,
} from './router-reducer/router-reducer-types'
import { ActionQueueContext } from '../../shared/lib/router/action-queue'

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

export function useUnwrapState(state: ReducerState) {
  // reducer actions can be async, so sometimes we need to suspend until the state is resolved
  if (state instanceof Promise) {
    const result = use(state)
    return result
  }

  return state
}

function useReducerWithReduxDevtoolsNoop(
  initialState: AppRouterState
): [ReducerState, Dispatch<ReducerActions>, () => void] {
  return [initialState, () => {}, () => {}]
}

function useReducerWithReduxDevtoolsImpl(
  initialState: AppRouterState
): [ReducerState, Dispatch<ReducerActions>, () => void] {
  const [state, setState] = React.useState<ReducerState>(initialState)

  const actionQueue = useContext(ActionQueueContext)

  if (!actionQueue) {
    throw new Error('Invariant: Missing ActionQueueContext')
  }

  const devtoolsConnectionRef = useRef<ReduxDevToolsInstance>()
  const enabledRef = useRef<boolean>()

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
      devtoolsConnectionRef.current.init(normalizeRouterState(initialState))

      if (actionQueue) {
        actionQueue.devToolsInstance = devtoolsConnectionRef.current
      }
    }

    return () => {
      devtoolsConnectionRef.current = undefined
    }
  }, [initialState, actionQueue])

  const dispatch = useCallback(
    (action: ReducerActions) => {
      if (!actionQueue.state) {
        // we lazy initialize the mutable action queue state since the data needed
        // to generate the state is not available when the actionQueue context is created
        actionQueue.state = initialState
      }

      actionQueue.dispatch(action, setState)
    },
    [actionQueue, initialState]
  )

  const sync = useCallback(() => {
    if (devtoolsConnectionRef.current) {
      devtoolsConnectionRef.current.send(
        { type: 'RENDER_SYNC' },
        normalizeRouterState(state)
      )
    }
  }, [state])

  return [state, dispatch, sync]
}

export const useReducerWithReduxDevtools =
  typeof window !== 'undefined'
    ? useReducerWithReduxDevtoolsImpl
    : useReducerWithReduxDevtoolsNoop
