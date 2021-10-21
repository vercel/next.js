let source: WebSocket
const eventCallbacks: ((event: any) => void)[] = []
let lastActivity = Date.now()

export function addMessageListener(cb: (event: any) => void) {
  eventCallbacks.push(cb)
}

export function sendMessage(data: any) {
  if (!source || source.readyState !== source.OPEN) return
  return source.send(data)
}

export function connectHMR(options: {
  path: string
  timeout: number
  log?: boolean
}) {
  if (!options.timeout) {
    options.timeout = 5 * 1000
  }

  init()

  let timer = setInterval(function () {
    if (Date.now() - lastActivity > options.timeout) {
      handleDisconnect()
    }
  }, options.timeout / 2)

  function init() {
    if (source) source.close()
    const { protocol, hostname, port } = location
    const url = `${protocol === 'http:' ? 'ws' : 'wss'}://${hostname}:${port}`
    source = new window.WebSocket(`${url}${options.path}`)
    source.onopen = handleOnline
    source.onerror = handleDisconnect
    source.onmessage = handleMessage
  }

  function handleOnline() {
    if (options.log) console.log('[HMR] connected')
    lastActivity = Date.now()
  }

  function handleMessage(event: any) {
    lastActivity = Date.now()

    eventCallbacks.forEach((cb) => {
      cb(event)
    })
  }

  function handleDisconnect() {
    clearInterval(timer)
    source.close()
    setTimeout(init, options.timeout)
  }
}
