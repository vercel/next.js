function EventSourceWrapper (options) {
  var source
  var curPath
  var origPath = options.path
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

  function init (page) {
    curPath = page ? origPath + `?page=${page}` : (curPath || origPath)
    source = new window.EventSource(curPath)
    source.onopen = handleOnline
    source.onerror = handleDisconnect
    source.onmessage = handleMessage
    window.__NEXT_RES_EVT_SOURCE = resetEvtSource
  }

  function resetEvtSource (page) {
    source.close()
    init(page)
  }

  function handleOnline () {
    if (options.log) console.log('[HMR] connected')
    lastActivity = new Date()
  }

  function handleMessage (event) {
    if (window.__NEXT_PING_HANDLE) {
      const handled = window.__NEXT_PING_HANDLE(event)
      if (handled) return
    }
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
