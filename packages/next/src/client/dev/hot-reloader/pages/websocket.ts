import {
  isTerminalLoggingEnabled,
  logQueue,
} from '../../../../next-devtools/userspace/app/forward-logs'
import {
  HMR_MESSAGE_SENT_TO_BROWSER,
  type HmrMessageSentToBrowser,
} from '../../../../server/dev/hot-reloader-types'
import { getSocketUrl } from '../get-socket-url'

let source: WebSocket

type MessageCallback = (message: HmrMessageSentToBrowser) => void

const messageCallbacks: Array<MessageCallback> = []

export function addMessageListener(callback: MessageCallback) {
  messageCallbacks.push(callback)
}

export function sendMessage(data: string) {
  if (!source || source.readyState !== source.OPEN) return
  return source.send(data)
}

let reconnections = 0
let reloading = false
let serverSessionId: number | null = null
let mostRecentCompilationHash: string | null = null

export function connectHMR(options: { path: string; assetPrefix: string }) {
  function init() {
    if (source) source.close()

    const url = getSocketUrl(options.assetPrefix)
    const newSource = new window.WebSocket(`${url}${options.path}`)

    function handleOnline() {
      if (isTerminalLoggingEnabled) {
        logQueue.onSocketReady(newSource)
      }
      reconnections = 0
      window.console.log('[HMR] connected')
    }

    function handleMessage(event: MessageEvent<string>) {
      // While the page is reloading, don't respond to any more messages.
      // On reconnect, the server may send an empty list of changes if it was restarted.
      if (reloading) {
        return
      }

      const message: HmrMessageSentToBrowser = JSON.parse(event.data)

      if (message.type === HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_CONNECTED) {
        if (
          serverSessionId !== null &&
          serverSessionId !== message.data.sessionId
        ) {
          // Either the server's session id has changed and it's a new server, or
          // it's been too long since we disconnected and we should reload the page.
          // There could be 1) unhandled server errors and/or 2) stale content.
          // Perform a hard reload of the page.
          window.location.reload()

          reloading = true
          return
        }

        serverSessionId = message.data.sessionId
      }

      // Track webpack compilation hash for server restart detection
      if (
        message.type === HMR_MESSAGE_SENT_TO_BROWSER.SYNC &&
        'hash' in message
      ) {
        // If we had previously reconnected and the hash changed, the server may have restarted
        if (
          mostRecentCompilationHash !== null &&
          mostRecentCompilationHash !== message.hash
        ) {
          window.location.reload()
          reloading = true
          return
        }
        mostRecentCompilationHash = message.hash
      }

      for (const messageCallback of messageCallbacks) {
        messageCallback(message)
      }
    }

    let timer: ReturnType<typeof setTimeout>
    function handleDisconnect() {
      newSource.onerror = null
      newSource.onclose = null
      newSource.close()
      reconnections++
      // After 25 reconnects we'll want to reload the page as it indicates the dev server is no longer running.
      if (reconnections > 25) {
        reloading = true
        window.location.reload()
        return
      }

      clearTimeout(timer)
      // Try again after 5 seconds
      timer = setTimeout(init, reconnections > 5 ? 5000 : 1000)
    }

    newSource.onopen = handleOnline
    newSource.onerror = handleDisconnect
    newSource.onclose = handleDisconnect
    newSource.onmessage = handleMessage

    source = newSource
  }

  init()
}
