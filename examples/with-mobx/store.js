import { action, observable, computed, runInAction, makeObservable } from 'mobx'
import { enableStaticRendering, useLocalObservable } from 'mobx-react-lite'
import { createContext, useContext } from 'react'

// eslint-disable-next-line react-hooks/rules-of-hooks
enableStaticRendering(typeof window === 'undefined')

const StoreContext = createContext(null)

class Store {
  constructor() {
    makeObservable(this, {
      lastUpdate: observable,
      light: observable,
      start: action,
      timeString: computed,
      hydrate: action,
    })
  }

  lastUpdate = 0
  light = false

  start = () => {
    this.timer = setInterval(() => {
      runInAction(() => {
        this.lastUpdate = Date.now()
        this.light = true
      })
    }, 1000)
  }

  get timeString() {
    const pad = (n) => (n < 10 ? `0${n}` : n)
    const format = (t) =>
      `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(
        t.getUTCSeconds()
      )}`
    return format(new Date(this.lastUpdate))
  }

  stop = () => clearInterval(this.timer)

  hydrate = (data) => {
    if (!data) return

    this.lastUpdate = data.lastUpdate !== null ? data.lastUpdate : Date.now()
    this.light = !!data.light
  }
}

let store
function initializeStore(initialData = null) {
  const _store = store ?? new Store()

  // If your page has Next.js data fetching methods that use a Mobx store, it will
  // get hydrated here, check `pages/ssg.js` and `pages/ssr.js` for more details
  if (initialData) {
    _store.hydrate(initialData)
  }
  // For SSG and SSR always create a new store
  if (typeof window === 'undefined') return _store
  // Create the store once in the client
  if (!store) store = _store

  return _store
}

export function StoreProvider({ children, initialState }) {
  const store = useLocalObservable(() => initializeStore(initialState))
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function useStore() {
  return useContext(StoreContext)
}
