import { useMemo } from 'react'
import { types, applySnapshot } from 'mobx-state-tree'

let store

const Store = types
  .model({
    lastUpdate: types.Date,
    light: false,
  })
  .actions((self) => {
    let timer
    function start() {
      timer = setInterval(() => {
        // mobx-state-tree doesn't allow anonymous callbacks changing data
        // pass off to another action instead
        self.update()
      }, 1000)
    }

    function update() {
      self.lastUpdate = Date.now()
      self.light = true
    }

    function stop() {
      clearInterval(timer)
    }

    return { start, stop, update }
  })

export function initializeStore(snapshot = null) {
  const _store = store ?? Store.create({ lastUpdate: 0 })

  // If your page has Next.js data fetching methods that use a Mobx store, it will
  // get hydrated here, check `pages/ssg.js` and `pages/ssr.js` for more details
  if (snapshot) {
    applySnapshot(_store, snapshot)
  }
  // For SSG and SSR always create a new store
  if (typeof window === 'undefined') return _store
  // Create the store once in the client
  if (!store) store = _store

  return store
}

export function useStore(initialState) {
  const store = useMemo(() => initializeStore(initialState), [initialState])
  return store
}
