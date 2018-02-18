export default class EventEmitter {
  listeners = {}

  on (event, cb) {
    if (!this.listeners[event]) {
      this.listeners[event] = []
    }

    if (this.listeners[event].indexOf(cb) >= 0) {
      throw new Error(`The listener already exising in event: ${event}`)
    }

    this.listeners[event].push(cb)
  }

  emit (event, ...data) {
    if (!this.listeners[event]) return
    this.listeners[event].forEach(cb => cb(...data))
  }

  off (event, cb) {
    const index = this.listeners[event].indexOf(cb)
    if (index >= 0) {
      this.listeners[event].splice(index, 1)
    }
  }
}
