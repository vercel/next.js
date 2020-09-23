const eventCallbacks = []
const connectionCallbacks = []

function EventSourceWrapper(options) {
  var source
  var lastActivity = new Date()
  var listeners = []

  if (!options.timeout) {
    options.timeout = 20 * 1000
  }

  init()
  var timer = setInterval(function () {
    if (new Date() - lastActivity > options.timeout) {
      handleDisconnect()
    }
  }, options.timeout / 2)

  function init() {
    source = new window.EventSource(options.path)
    source.onopen = handleOnline
    source.onerror = handleDisconnect
    source.onmessage = handleMessage
  }

  function handleOnline() {
    if (options.log) console.log('[HMR] connected')
    lastActivity = new Date()
    connectionCallbacks.forEach((cb) => cb(true))
  }

  function handleMessage(event) {
    lastActivity = new Date()
    for (var i = 0; i < listeners.length; i++) {
      listeners[i](event)
    }

    eventCallbacks.forEach((cb) => {
      if (!cb.unfiltered && event.data.indexOf('action') === -1) return
      cb(event)
    })
  }

  function handleDisconnect() {
    clearInterval(timer)
    source.close()
    setTimeout(init, options.timeout)
    connectionCallbacks.forEach((cb) => cb(false))
  }

  return {
    close: () => {
      clearInterval(timer)
      source.close()
    },
    addMessageListener: function (fn) {
      listeners.push(fn)
    },
  }
}

export function getEventSourceWrapper(options) {
  if (!options.ondemand) {
    return {
      addMessageListener: (cb) => {
        eventCallbacks.push(cb)
      },
      addConnectionListener: (cb) => {
        connectionCallbacks.push(cb)
      },
    }
  }
  return EventSourceWrapper(options)
}
