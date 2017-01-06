import { action, observable } from 'mobx'

class Store {
  @observable lastUpdate = 0
  @observable light = false

  constructor (isServer, lastUpdate) {
    this.lastUpdate = lastUpdate
  }

  @action start = () => {
    this.timer = setInterval(() => {
      this.lastUpdate = Date.now()
      this.light = true
    })
  }

  stop = () => clearInterval(this.timer)
}

export const initStore = (isServer, lastUpdate = Date.now()) => {
  if (isServer && typeof window === 'undefined') {
    return new Store(isServer, lastUpdate)
  } else {
    if (!window.store) {
      window.store = new Store(isServer, lastUpdate)
    }
    return window.store
  }
}
