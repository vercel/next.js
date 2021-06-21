if (typeof window === 'undefined') {
  if (!('performance' in global))
    global.performance = require('perf_hooks').performance

  if (!('EventTarget' in global))
    global.EventTarget =
      require('events').EventTarget || require('event-target-shim').EventTarget

  if (!('Event' in global))
    global.Event = require('events').Event || require('event-target-shim').Event

  if (!('CustomEvent' in global))
    global.CustomEvent = class CustomEvent extends Event {
      constructor(eventName, { detail, ...eventOptions } = {}) {
        super(eventName, eventOptions)
        this.detail = detail
      }
    }

  require('abort-controller/polyfill')
}
