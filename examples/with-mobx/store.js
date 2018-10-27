import { action, observable } from 'mobx'

let store = null

class Store {
  @observable lastUpdate = 0
  @observable light = false

  constructor (isServer, initialData = {}) {
    this.lastUpdate = initialData.lastUpdate != null ? initialData.lastUpdate : Date.now()
    this.light = !!initialData.light
  }

  @action start = () => {
    this.timer = setInterval(() => {
      this.lastUpdate = Date.now()
      this.light = true
    }, 1000)
  }

  stop = () => clearInterval(this.timer)
}

export function initializeStore (isServer, initialData) {
  if (isServer) {
    return new Store(isServer, initialData)
  } else {
    if (store === null) {
      store = new Store(isServer, initialData)
    }
    return store
  }
}
