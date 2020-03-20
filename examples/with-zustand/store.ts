import { create, SetState, UseStore, StoreApi } from 'zustand'
import { Promisable } from 'type-fest'

interface State {
  lastUpdate: number
  light: boolean
}
interface Reducer {
  tick: ({ lastUpdate: number, light: boolean }) => Promisable<void>
}
type ZustandState = State & Reducer
type ReducerFn = (set: SetState<ZustandState>) => Reducer
export interface ZustandContext {
  zustandStore: StoreApi<ZustandState>
}

const initialState: State = {
  lastUpdate: 0,
  light: false,
}

const reducer: ReducerFn = set => ({
  tick: ({ lastUpdate, light }) => {
    set({ lastUpdate, light })
  },
})

export const initializeStore = (preloadedState = initialState) => {
  return create<ZustandState>(set => ({
    ...preloadedState,
    ...reducer(set),
  }))
}

let zustandStore: [UseStore<ZustandState>, StoreApi<ZustandState>]
export const getZustand = (initialState?: ZustandState) => {
  // Always make a new store if server, otherwise state is shared between requests
  if (typeof window === 'undefined') {
    return initializeStore(initialState)
  }

  // Create store if unavailable on the client and set it on the window object
  if (!zustandStore) {
    zustandStore = initializeStore(initialState)
  }

  return zustandStore
}

export const [useZustand] = getZustand()
