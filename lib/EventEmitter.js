export default class EventEmitter {
  listeners = {}

  on (event, cb) {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set()
    }

    this.listeners[event].add(cb)
  }

  emit (event, ...data) {
    if (!this.listeners[event]) return
    this.listeners[event].forEach(cb => cb(...data))
  }

  off (event, cb) {
    if (!this.listeners[event]) return
    this.listeners[event].delete(cb)
  }
}
