import { HMR_ACTION_TYPES } from '../../../server/dev/hot-reloader-types'

let source: WebSocket

type ActionCallback = (action: HMR_ACTION_TYPES) => void

const eventCallbacks: Array<ActionCallback> = []
let lastActivity = Date.now()

function getSocketProtocol(assetPrefix: string): string {
  let protocol = location.protocol

  try {
    // assetPrefix is a url
    protocol = new URL(assetPrefix).protocol
  } catch {}

  return protocol === 'http:' ? 'ws' : 'wss'
}

export function addMessageListener(callback: ActionCallback) {
  eventCallbacks.push(callback)
}

export function sendMessage(data: string) {
  if (!source || source.readyState !== source.OPEN) return
  return source.send(data)
}

export function connectHMR(options: {
  path: string
  assetPrefix: string
  timeout?: number
}) {
  if (!options.timeout) {
    options.timeout = 5 * 1000
  }

  function init() {
    if (source) source.close()

    function handleOnline() {
      window.console.log('[HMR] connected')
      lastActivity = Date.now()
    }

    function handleMessage(event: MessageEvent<string>) {
      lastActivity = Date.now()

      // Coerce into HMR_ACTION_TYPES as that is the format.
      const msg: HMR_ACTION_TYPES = JSON.parse(event.data)
      for (const eventCallback of eventCallbacks) {
        eventCallback(msg)
      }
    }

    let timer: NodeJS.Timeout
    function handleDisconnect() {
      clearInterval(timer)
      source.onerror = null
      source.close()
      setTimeout(init, options.timeout)
    }
    timer = setInterval(function () {
      if (Date.now() - lastActivity > (options.timeout as any)) {
        handleDisconnect()
      }
    }, (options.timeout as any) / 2)

    const { hostname, port } = location
    const protocol = getSocketProtocol(options.assetPrefix || '')
    const assetPrefix = options.assetPrefix.replace(/^\/+/, '')

    let url = `${protocol}://${hostname}:${port}${
      assetPrefix ? `/${assetPrefix}` : ''
    }`

    if (assetPrefix.startsWith('http')) {
      url = `${protocol}://${assetPrefix.split('://')[1]}`
    }

    source = new window.WebSocket(`${url}${options.path}`)
    source.onopen = handleOnline
    source.onerror = handleDisconnect
    source.onmessage = handleMessage
  }

  init()
}
