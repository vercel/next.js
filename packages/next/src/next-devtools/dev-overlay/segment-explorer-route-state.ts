import { useSyncExternalStore } from 'react'

const routeState = {
  state: {
    page: '',
  },
  setState: (state: { page: string }) => {
    routeState.state = state
  },
}

function markUpdated() {
  for (const listener of listeners) {
    listener()
  }
}

export const updateRouteState = (state: { page: string }) => {
  routeState.setState(state)
  markUpdated()
}

const listeners = new Set<() => void>()
const createRouteStateStore = (): {
  subscribe: (callback: () => void) => () => void
  getSnapshot: () => any
  getServerSnapshot: () => any
} => {
  // return a store that can be used by useSyncExternalStore
  return {
    subscribe: (callback) => {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    getSnapshot: () => {
      return routeState.state
    },
    getServerSnapshot: () => {
      return routeState.state
    },
  }
}

const { subscribe, getSnapshot, getServerSnapshot } = createRouteStateStore()

export const useRouteState = () => {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return state
}
