import { Model, model, prop, modelAction, timestampAsDate } from 'mobx-keystone'

@model('store/root')
class RootStore extends Model({
  foo: prop<number | null>(0),
  lastUpdate: prop<number | null>(new Date().getTime()),
  light: prop(false),
}) {
  timer!: ReturnType<typeof setInterval>

  @timestampAsDate('lastUpdate')
  lastUpdateDate!: Date

  @modelAction
  start() {
    this.timer = setInterval(() => {
      this.update()
    }, 1000)
  }
  @modelAction
  update() {
    this.lastUpdate = Date.now()
    this.light = true
  }

  @modelAction
  stop() {
    clearInterval(this.timer)
  }
}

export { RootStore }
