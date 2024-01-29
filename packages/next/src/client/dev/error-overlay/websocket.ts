import type { HMR_ACTION_TYPES } from '../../../server/dev/hot-reloader-types'

let source: WebSocket

type ActionCallback = (action: HMR_ACTION_TYPES) => void

const eventCallbacks: Array<ActionCallback> = []

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

let reconnections = 0

export function connectHMR(options: { path: string; assetPrefix: string }) {
  function init() {
    if (source) source.close()

    function handleOnline() {
      reconnections = 0
      window.console.log('[HMR] connected')
    }

    function handleMessage(event: MessageEvent<string>) {
      // Coerce into HMR_ACTION_TYPES as that is the format.
      const msg: HMR_ACTION_TYPES = JSON.parse(event.data)
      for (const eventCallback of eventCallbacks) {
        eventCallback(msg)
      }
    }

    let timer: ReturnType<typeof setTimeout>
    function handleDisconnect() {
      source.onerror = null
      source.onclose = null
      source.close()
      reconnections++
      // After 25 reconnects we'll want to reload the page as it indicates the dev server is no longer running.
      if (reconnections > 25) {
        window.location.reload()
        return
      }

      clearTimeout(timer)
      // Try again after 5 seconds
      timer = setTimeout(init, reconnections > 5 ? 5000 : 1000)
    }

    const { hostname, port } = location
    const protocol = getSocketProtocol(options.assetPrefix || '')
    const assetPrefix = options.assetPrefix.replace(/^\/+/, '')

    let url = `${protocol}://${hostname}:${port}${
      assetPrefix ? `/${assetPrefix}` : ''
    }`

    if (assetPrefix.startsWith('http')) {
      url = `${protocol}://${assetPrefix.split('://', 2)[1]}`
    }

    source = new window.WebSocket(`${url}${options.path}`)
    source.onopen = handleOnline
    source.onerror = handleDisconnect
    source.onclose = handleDisconnect
    source.onmessage = handleMessage
  }

  init()
}
