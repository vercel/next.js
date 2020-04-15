import { action, observable, computed, runInAction } from 'mobx'
import { useStaticRendering } from 'mobx-react'

// eslint-disable-next-line react-hooks/rules-of-hooks
useStaticRendering(typeof window === 'undefined')

export class Store {
  @observable lastUpdate = 0
  @observable light = false

  hydrate(serializedStore) {
    this.lastUpdate =
      serializedStore.lastUpdate != null
        ? serializedStore.lastUpdate
        : Date.now()
    this.light = !!serializedStore.light
  }

  @action start = () => {
    this.timer = setInterval(() => {
      runInAction(() => {
        this.lastUpdate = Date.now()
        this.light = true
        console.log(this.lastUpdate)
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
    console.log(timeStr)
    return timeStr
  }

  stop = () => clearInterval(this.timer)
}
