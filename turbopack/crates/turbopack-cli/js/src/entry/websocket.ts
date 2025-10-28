// Adapted from https://github.com/vercel/next.js/blob/canary/packages/next/src/client/dev/error-overlay/websocket.ts

import type { WebSocketMessage } from '@vercel/turbopack-ecmascript-runtime/browser/dev/hmr-client/hmr-client'

let source: WebSocket
const messageCallbacks: ((message: WebSocketMessage) => void)[] = []

// TODO: add timeout again
// let lastActivity = Date.now()

function getSocketProtocol(assetPrefix: string): string {
  let protocol = location.protocol

  try {
    // assetPrefix is a url
    protocol = new URL(assetPrefix).protocol
  } catch (_) {}

  return protocol === 'http:' ? 'ws' : 'wss'
}

export function addMessageListener(cb: (message: WebSocketMessage) => void) {
  messageCallbacks.push(cb)
}

export function sendMessage(data: any) {
  if (!source || source.readyState !== source.OPEN) return
  return source.send(data)
}

export type HMROptions = {
  path: string
  assetPrefix: string
  timeout?: number
  log?: boolean
}

// This is not used by Next.js, but it is used by the standalone turbopack-cli
export function connectHMR(options: HMROptions) {
  const { timeout = 5 * 1000 } = options

  function init() {
    if (source) source.close()

    console.log('[HMR] connecting...')

    function handleOnline() {
      const connected = { type: 'turbopack-connected' as const }
      messageCallbacks.forEach((cb) => {
        cb(connected)
      })

      if (options.log) console.log('[HMR] connected')
      // lastActivity = Date.now()
    }

    function handleMessage(event: MessageEvent) {
      // lastActivity = Date.now()

      const message = {
        type: 'turbopack-message' as const,
        data: JSON.parse(event.data),
      }
      messageCallbacks.forEach((cb) => {
        cb(message)
      })
    }

    // let timer: NodeJS.Timeout

    function handleDisconnect() {
      source.close()
      setTimeout(init, timeout)
    }

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
