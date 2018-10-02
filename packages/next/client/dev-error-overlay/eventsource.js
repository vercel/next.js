function EventSourceWrapper (options) {
  var source
  var lastActivity = new Date()
  var listeners = []

  if (!options.timeout) {
    options.timeout = 20 * 1000
  }

  init()
  var timer = setInterval(function () {
    if ((new Date() - lastActivity) > options.timeout) {
      handleDisconnect()
    }
  }, options.timeout / 2)

  function init () {
    source = new window.EventSource(options.path)
    source.onopen = handleOnline
    source.onerror = handleDisconnect
    source.onmessage = handleMessage
  }

  function handleOnline () {
    if (options.log) console.log('[HMR] connected')
    lastActivity = new Date()
  }

  function handleMessage (event) {
    lastActivity = new Date()
    for (var i = 0; i < listeners.length; i++) {
      listeners[i](event)
    }
  }

  function handleDisconnect () {
    clearInterval(timer)
    source.close()
    setTimeout(init, options.timeout)
  }

  return {
    addMessageListener: function (fn) {
      listeners.push(fn)
    }
  }
}

export function getEventSourceWrapper (options) {
  if (!window.__whmEventSourceWrapper) {
    window.__whmEventSourceWrapper = {}
  }
  if (!window.__whmEventSourceWrapper[options.path]) {
    // cache the wrapper for other entries loaded on
    // the same page with the same options.path
    window.__whmEventSourceWrapper[options.path] = EventSourceWrapper(options)
  }
  return window.__whmEventSourceWrapper[options.path]
}
