import type { reducer } from './router-reducer/router-reducer'
import type {
  ReducerState,
  ReducerAction,
  MutableRefObject,
  Dispatch,
} from 'react'
import { useRef, useReducer, useEffect, useCallback } from 'react'

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

function devToolReducer(
  fn: typeof reducer,
  ref: MutableRefObject<ReduxDevToolsInstance | undefined>
) {
  return (
    state: ReducerState<typeof reducer>,
    action: ReducerAction<typeof reducer>
  ) => {
    const res = fn(state, action)
    if (ref.current) {
      ref.current.send(action, normalizeRouterState(res))
    }
    return res
  }
}

function useReducerWithReduxDevtoolsNoop(
  fn: typeof reducer,
  initialState: ReturnType<typeof reducer>
): [
  ReturnType<typeof reducer>,
  Dispatch<ReducerAction<typeof reducer>>,
  () => void
] {
  const [state, dispatch] = useReducer(fn, initialState)

  return [state, dispatch, () => {}]
}

function useReducerWithReduxDevtoolsImpl(
  fn: typeof reducer,
  initialState: ReturnType<typeof reducer>
): [
  ReturnType<typeof reducer>,
  Dispatch<ReducerAction<typeof reducer>>,
  () => void
] {
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

  const [state, dispatch] = useReducer(
    devToolReducer(/* logReducer( */ fn /*)*/, devtoolsConnectionRef),
    initialState
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
