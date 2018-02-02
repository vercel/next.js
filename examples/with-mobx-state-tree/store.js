import { types, applySnapshot } from 'mobx-state-tree'

let store = null

const Store = types
  .model({
    lastUpdate: types.Date,
    light: false
  })
  .actions((self) => {
    let timer
    function start () {
      timer = setInterval(() => {
        // mobx-state-tree doesn't allow anonymous callbacks changing data
        // pass off to another action instead
        self.update()
      })
    }

    function update () {
      self.lastUpdate = Date.now()
      self.light = true
    }

    function stop () {
      clearInterval(timer)
    }

    return { start, stop, update }
  })

export function initStore (isServer, snapshot = null) {
  if (isServer) {
    store = Store.create({ lastUpdate: Date.now() })
  }
  if (store === null) {
    store = Store.create({ lastUpdate: Date.now() })
  }
  if (snapshot) {
    applySnapshot(store, snapshot)
  }
  return store
}
