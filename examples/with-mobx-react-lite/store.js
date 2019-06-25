import { action } from 'mobx'
import { useObservable, useStaticRendering } from 'mobx-react-lite'
import { createContext, useCallback } from 'react'

const isServer = typeof window === 'undefined'
useStaticRendering(isServer)

let StoreContext = createContext()
let start
let stop
let store

function initializeData (initialData = store || {}) {
  const { lastUpdate = Date.now(), light } = initialData
  return {
    lastUpdate,
    light: Boolean(light)
  }
}

function InjectStoreContext ({ children, initialData }) {
  let timerInterval = null
  store = useObservable(initializeData(initialData))

  start = useCallback(
    action(() => {
      timerInterval = setInterval(() => {
        store.lastUpdate = Date.now()
        store.light = true
      }, 1000)
    })
  )

  stop = () => {
    if (timerInterval) {
      clearInterval(timerInterval)
    }
  }

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export { InjectStoreContext, StoreContext, initializeData, start, stop, store }
