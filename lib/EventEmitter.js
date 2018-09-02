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
    return this
  }

  emit (event, ...data) {
    const listeners = this.listeners[event]
    const hasListeners = listeners && listeners.size
    if (!hasListeners) {
      return false
    }

    listeners.forEach(cb => cb(...data)) // eslint-disable-line standard/no-callback-literal
    return true
  }

  off (event, cb) {
    this.listeners[event].delete(cb)
    return this
  }
}
