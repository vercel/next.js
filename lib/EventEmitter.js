export default class EventEmitter {
  listeners = {}

  on (event, cb) {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set()
    }

    if (this.listeners[event].has(cb)) {
      throw new Error(`The listener already exising in event: ${event}`)
    }

    this.listeners[event].add(cb)
  }

  emit (event, ...data) {
    if (!this.listeners[event]) return
    this.listeners[event].forEach(cb => cb(...data))
  }

  off (event, cb) {
    this.listeners[event].delete(cb)
  }
}
