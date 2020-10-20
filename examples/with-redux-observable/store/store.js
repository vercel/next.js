import { useMemo } from 'react'
import { createStore, applyMiddleware } from 'redux'
import { createLogger } from 'redux-logger'
import { combineEpics, createEpicMiddleware } from 'redux-observable'
import { takeUntil, finalize } from 'rxjs/operators'
import { Subject } from 'rxjs'
import { userEpic } from './epics'
import * as types from './actionTypes'

let store

const INITIAL_STATE = {
  nextUserId: 1,
  character: {},
  isFetchedOnServer: false,
  error: null,
}

function reducer(state = INITIAL_STATE, { type, payload }) {
  switch (type) {
    case types.FETCH_USER_SUCCESS:
      return {
        ...state,
        character: payload.response,
        isFetchedOnServer: payload.isServer,
        nextUserId: state.nextUserId + 1,
      }
    case types.FETCH_USER_FAILURE:
      return {
        ...state,
        error: payload.error,
        isFetchedOnServer: payload.isServer,
      }
    default:
      return state
  }
}

const initStore = (initialState) => {
  const epicMiddleware = createEpicMiddleware()

  const shutdown$ = new Subject()

  const rootEpic = (action$, state$, deps) => {
    const epic = combineEpics(userEpic)
    const output$ = epic(
      action$.pipe(takeUntil(shutdown$)),
      state$.pipe(takeUntil(shutdown$)),
      deps
    )
    return output$.pipe(
      finalize(() => {
        shutdown$.complete()
      })
    )
  }
  const logger = createLogger({ collapsed: true }) // log every action to see what's happening behind the scenes.
  const reduxMiddleware = applyMiddleware(epicMiddleware, logger)

  const store = createStore(reducer, initialState, reduxMiddleware)
  epicMiddleware.run(rootEpic)

  return {
    store,
    shutdownEpics() {
      shutdown$.next()
      return shutdown$.toPromise()
    },
  }
}

export const initializeStore = (preloadedState) => {
  let _store
  if (store) {
    _store = store
  } else {
    const { store: newStore } = initStore(preloadedState)
    _store = newStore
  }

  // After navigating to a page with an initial Redux state, merge that state
  // with the current state in the store, and create a new store
  if (preloadedState && store) {
    const { store: newStore } = initStore({
      ...store.getState(),
      ...preloadedState,
    })
    _store = newStore
    // Reset the current store
    store = undefined
  }

  // For SSG and SSR always create a new store
  if (typeof window === 'undefined') return _store
  // Create the store once in the client
  if (!store) store = _store

  return _store
}

export function useStore(initialState) {
  const store = useMemo(() => initializeStore(initialState), [initialState])
  return store
}
