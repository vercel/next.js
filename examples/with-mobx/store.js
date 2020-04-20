import { action, observable, computed, runInAction } from 'mobx'
import { useStaticRendering } from 'mobx-react'
import { useMemo } from 'react'
// eslint-disable-next-line react-hooks/rules-of-hooks
useStaticRendering(typeof window === 'undefined')

class Store {
  @observable lastUpdate = 0
  @observable light = false

  @action start = () => {
    this.timer = setInterval(() => {
      runInAction(() => {
        this.lastUpdate = Date.now()
        this.light = true
      })
    }, 1000)
  }

  @computed get timeString() {
    const pad = n => (n < 10 ? `0${n}` : n)
    const format = t =>
      `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(
        t.getUTCSeconds()
      )}`
    let timeStr = format(new Date(this.lastUpdate))
    return timeStr
  }

  stop = () => clearInterval(this.timer)

  hydrate = serializedStore => {
    if (serializedStore === undefined || serializedStore === null) return
    this.lastUpdate =
      serializedStore.lastUpdate != null
        ? serializedStore.lastUpdate
        : Date.now()
    this.light = !!serializedStore.light
  }
}
const store = new Store()

export function initializeStore(snapshot = null) {
  const _store = store || new Store()
  _store.hydrate(JSON.parse(snapshot))
  return _store
}

export function useStore(initialState) {
  const store = useMemo(() => initializeStore(initialState), [initialState])
  return store
}
