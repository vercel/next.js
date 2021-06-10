import { useLayoutEffect } from 'react'
import create from 'zustand'
import createContext from 'zustand/context'

let store

const initialState = {
  lastUpdate: 0,
  light: false,
  count: 0,
}

const zustandContext = createContext()
export const Provider = zustandContext.Provider
// An example of how to get types
/** @type {import('zustand/index').UseStore<typeof initialState>} */
export const useStore = zustandContext.useStore

export const initializeStore = (preloadedState = {}) => {
  return create((set, get) => ({
    ...initialState,
    ...preloadedState,
    tick: (lastUpdate, light) => {
      set({
        lastUpdate,
        light: !!light,
      })
    },
    increment: () => {
      set({
        count: get().count + 1,
      })
    },
    decrement: () => {
      set({
        count: get().count - 1,
      })
    },
    reset: () => {
      set({
        count: initialState.count,
      })
    },
  }))
}

export function useHydrate(initialState) {
  let _store = store ?? initializeStore(initialState)

  // For SSR & SSG, always use a new store.
  if (typeof window !== 'undefined') {
    // For CSR, always re-use same store.
    if (!store) {
      store = _store
    }

    // And if initialState changes, then merge states in the next render cycle.
    //
    // eslint complaining "React Hooks must be called in the exact same order in every component render"
    // is ignorable as this code runs in the same order in a given environment (CSR/SSR/SSG)
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useLayoutEffect(() => {
      if (initialState && store) {
        store.setState({
          ...store.getState(),
          ...initialState,
        })
      }
    }, [initialState])
  }

  return _store
}
