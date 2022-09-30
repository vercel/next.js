import { useMemo } from 'react'
import {
  applySnapshot,
  Instance,
  SnapshotIn,
  SnapshotOut,
  types,
} from 'mobx-state-tree'

let store: IStore | undefined

const Store = types
  .model({
    lastUpdate: types.Date,
    light: false,
  })
  .actions((self) => {
    let timer: any
    const start = () => {
      timer = setInterval(() => {
        // mobx-state-tree doesn't allow anonymous callbacks changing data.
        // Pass off to another action instead (need to cast self as any
        // because TypeScript doesn't yet know about the actions we're
        // adding to self here)
        ;(self as any).update()
      }, 1000)
    }
    const update = () => {
      self.lastUpdate = new Date(Date.now())
      self.light = true
    }
    const stop = () => {
      clearInterval(timer)
    }
    return { start, stop, update }
  })

export type IStore = Instance<typeof Store>
export type IStoreSnapshotIn = SnapshotIn<typeof Store>
export type IStoreSnapshotOut = SnapshotOut<typeof Store>

export function initializeStore(snapshot = null) {
  const _store = store ?? Store.create({ lastUpdate: 0 })

  // If your page has Next.js data fetching methods that use a Mobx store, it will
  // get hydrated here, check `pages/ssg.tsx` and `pages/ssr.tsx` for more details
  if (snapshot) {
    applySnapshot(_store, snapshot)
  }
  // For SSG and SSR always create a new store
  if (typeof window === 'undefined') return _store
  // Create the store once in the client
  if (!store) store = _store

  return store
}

export function useStore(initialState: any) {
  const store = useMemo(() => initializeStore(initialState), [initialState])
  return store
}
