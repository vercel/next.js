import {
  Model,
  model,
  prop,
  modelAction,
  prop_dateTimestamp,
} from 'mobx-keystone'

@model('store/root')
class RootStore extends Model({
  foo: prop<number | null>(0),
  lastUpdate: prop_dateTimestamp(() => new Date()),
  light: prop(false),
}) {
  timer!: ReturnType<typeof setInterval>

  @modelAction
  start() {
    this.timer = setInterval(() => {
      this.update()
    }, 1000)
  }
  @modelAction
  update() {
    this.lastUpdate = new Date()
    this.light = true
  }

  @modelAction
  stop() {
    clearInterval(this.timer)
  }
}

export { RootStore }
