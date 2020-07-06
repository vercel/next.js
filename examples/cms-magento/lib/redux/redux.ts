import { useMemo } from 'react'
import { createStore, applyMiddleware } from 'redux'
import { composeWithDevTools } from 'redux-devtools-extension'
import storage from 'redux-persist/lib/storage'
import { persistReducer } from 'redux-persist'
import thunkMiddleware from 'redux-thunk'

import reducer from './reducers'
import { IInitialState } from 'interfaces/state'

let store:
  | (import('redux').Store<
      {
        isAuthenticated?: boolean
        customerId?: string
        guestId?: string
        quantity?: string
        id?: string
        loading?: boolean
        error?: string
        address?: Object
      },
      import('redux').Action<any>
    > & { dispatch: unknown })
  | undefined

const persistConfig = {
  key: 'primary',
  storage,
  whitelist: ['isAuthenticated', 'quantity', 'customerId', 'guestId', 'cart'], // place to select which state you want to persist
  // blacklist: ['product'],
}

const persistedReducer: any = persistReducer(persistConfig, reducer)

function initStore(preloadedState: IInitialState) {
  return createStore(
    persistedReducer,
    preloadedState,
    composeWithDevTools(applyMiddleware(thunkMiddleware))
  )
}

export const initializeStore = (preloadedState?: IInitialState | any) => {
  let _store = store ?? initStore(preloadedState)

  // After navigating to a page with an initial Redux state, merge that state
  // with the current state in the store, and create a new store
  if (preloadedState && store) {
    _store = initStore({
      ...store.getState(),
      ...preloadedState,
    })
    // Reset the current store
    store = undefined
  }

  // For SSG and SSR always create a new store
  if (typeof window === 'undefined') return _store
  // Create the store once in the client
  if (!store) store = _store

  return _store
}

export function useStore(initialState: IInitialState) {
  const store = useMemo(() => initializeStore(initialState), [initialState])
  return store
}
