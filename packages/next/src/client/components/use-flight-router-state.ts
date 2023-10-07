import { reducer } from './router-reducer/router-reducer'
import type { MutableRefObject, Dispatch } from 'react'
import React, { use } from 'react'
import { useRef, useEffect, useCallback } from 'react'
import type {
  AppRouterState,
  ReducerActions,
  ReducerState,
} from './router-reducer/router-reducer-types'
import {
  flightRouterState,
  updateFlightRouterState,
} from '../../shared/lib/app-router-context.shared-runtime'

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

// Log router state when actions are triggered.
// function logReducer(fn: typeof reducer) {
//   return (
//     state: ReducerState<typeof reducer>,
//     action: ReducerAction<typeof reducer>
//   ) => {
//     console.groupCollapsed(action.type)
//     console.log('action', action)
//     console.log('old', state)
//     const res = fn(state, action)
//     console.log('new', res)
//     console.groupEnd()
//     return res
//   }
// }

declare global {
  interface Window {
    __REDUX_DEVTOOLS_EXTENSION__: any
  }
}

interface ReduxDevToolsInstance {
  send(action: any, state: any): void
  init(initialState: any): void
}

function useReducerWithReduxDevtoolsNoop(
  initialState: AppRouterState
): [AppRouterState, Dispatch<ReducerActions>, () => void] {
  return [initialState, () => {}, () => {}]
}

function dispatchWithDevtools(
  action: ReducerActions,
  ref: MutableRefObject<ReduxDevToolsInstance | undefined>
) {
  if (!flightRouterState) throw new Error('Missing state')
  const result = reducer(flightRouterState, action)

  if (ref.current) {
    ref.current.send(action, normalizeRouterState(result))
  }

  return result
}

function isThenable(value: any): value is Promise<any> {
  return (
    value &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof value.then === 'function'
  )
}

function unwrapStateIfNeeded(state: AppRouterState | Promise<AppRouterState>) {
  if (isThenable(state)) {
    const result = use(state)
    updateFlightRouterState(result)
    return result
  }

  updateFlightRouterState(state)
  return state
}

function useReducerWithReduxDevtoolsImpl(
  initialState: AppRouterState
): [AppRouterState, Dispatch<ReducerActions>, () => void] {
  const [state, setState] = React.useState<
    AppRouterState | Promise<AppRouterState>
  >(initialState)

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
    }

    return () => {
      devtoolsConnectionRef.current = undefined
    }
  }, [initialState])

  const lastPromiseRef = useRef<ReducerState>()

  const dispatchAction = useCallback((action: ReducerActions) => {
    const result = dispatchWithDevtools(action, devtoolsConnectionRef)
    setState(result)
    return result
  }, [])

  const dispatch = useCallback(
    (action: ReducerActions) => {
      if (
        isThenable(lastPromiseRef.current) &&
        (action.type === 'refresh' || action.type === 'fast-refresh')
      ) {
        // don't refresh if another action is in flight (is this a good idea?)
        return
      }

      const result = dispatchAction(action)
      lastPromiseRef.current = result
    },
    [dispatchAction]
  )

  const sync = useCallback(() => {
    if (devtoolsConnectionRef.current) {
      devtoolsConnectionRef.current.send(
        { type: 'RENDER_SYNC' },
        normalizeRouterState(state)
      )
    }
  }, [state])

  const applicationState = unwrapStateIfNeeded(state)
  lastPromiseRef.current = undefined

  return [applicationState, dispatch, sync]
}

export const useReducerWithReduxDevtools =
  typeof window !== 'undefined'
    ? useReducerWithReduxDevtoolsImpl
    : useReducerWithReduxDevtoolsNoop
