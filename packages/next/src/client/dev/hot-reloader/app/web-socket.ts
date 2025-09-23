import { useContext, useEffect } from 'react'
import { GlobalLayoutRouterContext } from '../../../../shared/lib/app-router-context.shared-runtime'
import { getSocketUrl } from '../get-socket-url'
import {
  HMR_MESSAGE_SENT_TO_BROWSER,
  type HmrMessageSentToBrowser,
  type TurbopackMessageSentToBrowser,
} from '../../../../server/dev/hot-reloader-types'
import { reportInvalidHmrMessage } from '../shared'
import {
  performFullReload,
  processMessage,
  type StaticIndicatorState,
} from './hot-reloader-app'
import { logQueue } from '../../../../next-devtools/userspace/app/forward-logs'
import { InvariantError } from '../../../../shared/lib/invariant-error'
import { WEB_SOCKET_MAX_RECONNECTIONS } from '../../../../lib/constants'

let reconnections = 0
let reloading = false
let serverSessionId: number | null = null
let mostRecentCompilationHash: string | null = null

export function createWebSocket(
  assetPrefix: string,
  staticIndicatorState: StaticIndicatorState
) {
  if (!self.__next_r) {
    throw new InvariantError(
      `Expected a request ID to be defined for the document via self.__next_r.`
    )
  }

  let webSocket: WebSocket
  let timer: ReturnType<typeof setTimeout>

  const sendMessage = (data: string) => {
    if (webSocket && webSocket.readyState === webSocket.OPEN) {
      webSocket.send(data)
    }
  }

  const processTurbopackMessage = createProcessTurbopackMessage(sendMessage)

  function init() {
    if (webSocket) {
      webSocket.close()
    }

    const newWebSocket = new window.WebSocket(
      `${getSocketUrl(assetPrefix)}/_next/webpack-hmr?id=${self.__next_r}`
    )

    newWebSocket.binaryType = 'arraybuffer'

    function handleOnline() {
      logQueue.onSocketReady(newWebSocket)

      reconnections = 0
      window.console.log('[HMR] connected')
    }

    function handleMessage(event: MessageEvent) {
      // While the page is reloading, don't respond to any more messages.
      if (reloading) {
        return
      }

      try {
        const message: HmrMessageSentToBrowser =
          event.data instanceof ArrayBuffer
            ? parseBinaryMessage(event.data)
            : JSON.parse(event.data)

        // Check for server restart in Turbopack mode
        if (message.type === HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_CONNECTED) {
          if (
            serverSessionId !== null &&
            serverSessionId !== message.data.sessionId
          ) {
            // Either the server's session id has changed and it's a new server, or
            // it's been too long since we disconnected and we should reload the page.
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

        processMessage(
          message,
          sendMessage,
          processTurbopackMessage,
          staticIndicatorState
        )
      } catch (err: unknown) {
        reportInvalidHmrMessage(event, err)
      }
    }

    function handleDisconnect() {
      newWebSocket.onerror = null
      newWebSocket.onclose = null
      newWebSocket.close()
      reconnections++

      // After 25 reconnects we'll want to reload the page as it indicates the dev server is no longer running.
      if (reconnections > WEB_SOCKET_MAX_RECONNECTIONS) {
        reloading = true
        window.location.reload()
        return
      }

      clearTimeout(timer)
      // Try again after 5 seconds
      timer = setTimeout(init, reconnections > 5 ? 5000 : 1000)
    }

    newWebSocket.onopen = handleOnline
    newWebSocket.onerror = handleDisconnect
    newWebSocket.onclose = handleDisconnect
    newWebSocket.onmessage = handleMessage

    webSocket = newWebSocket
    return newWebSocket
  }

  return init()
}

export function createProcessTurbopackMessage(
  sendMessage: (data: string) => void
): (msg: TurbopackMessageSentToBrowser) => void {
  if (!process.env.TURBOPACK) {
    return () => {}
  }

  let queue: TurbopackMessageSentToBrowser[] = []
  let callback: ((msg: TurbopackMessageSentToBrowser) => void) | undefined

  const processTurbopackMessage = (msg: TurbopackMessageSentToBrowser) => {
    if (callback) {
      callback(msg)
    } else {
      queue.push(msg)
    }
  }

  import(
    // @ts-expect-error requires "moduleResolution": "node16" in tsconfig.json and not .ts extension
    '@vercel/turbopack-ecmascript-runtime/browser/dev/hmr-client/hmr-client.ts'
  ).then(({ connect }) => {
    connect({
      addMessageListener(cb: (msg: TurbopackMessageSentToBrowser) => void) {
        callback = cb

        // Replay all Turbopack messages before we were able to establish the HMR client.
        for (const msg of queue) {
          cb(msg)
        }
        queue.length = 0
      },
      sendMessage,
      onUpdateError: (err: unknown) => performFullReload(err, sendMessage),
    })
  })

  return processTurbopackMessage
}

export function useWebSocketPing(webSocket: WebSocket | undefined) {
  const { tree } = useContext(GlobalLayoutRouterContext)

  useEffect(() => {
    if (!webSocket) {
      throw new InvariantError('Expected webSocket to be defined in dev mode.')
    }

    // Never send pings when using Turbopack as it's not used.
    // Pings were originally used to keep track of active routes in on-demand-entries with webpack.
    if (process.env.TURBOPACK) {
      return
    }

    // Taken from on-demand-entries-client.js
    const interval = setInterval(() => {
      if (webSocket.readyState === webSocket.OPEN) {
        webSocket.send(
          JSON.stringify({
            event: 'ping',
            tree,
            appDirRoute: true,
          })
        )
      }
    }, 2500)
    return () => clearInterval(interval)
  }, [tree, webSocket])
}

const textDecoder = new TextDecoder()

function parseBinaryMessage(data: ArrayBuffer): HmrMessageSentToBrowser {
  assertByteLength(data, 1)
  const view = new DataView(data)
  const messageType = view.getUint8(0)

  switch (messageType) {
    case HMR_MESSAGE_SENT_TO_BROWSER.REACT_DEBUG_CHUNK: {
      assertByteLength(data, 2)
      const requestIdLength = view.getUint8(1)
      assertByteLength(data, 2 + requestIdLength)

      const requestId = textDecoder.decode(
        new Uint8Array(data, 2, requestIdLength)
      )

      const chunk =
        data.byteLength > 2 + requestIdLength
          ? new Uint8Array(data, 2 + requestIdLength)
          : null

      return {
        type: HMR_MESSAGE_SENT_TO_BROWSER.REACT_DEBUG_CHUNK,
        requestId,
        chunk,
      }
    }
    default: {
      throw new InvariantError(
        `Invalid binary HMR message of type ${messageType}`
      )
    }
  }
}

function assertByteLength(data: ArrayBuffer, expectedLength: number) {
  if (data.byteLength < expectedLength) {
    throw new InvariantError(
      `Invalid binary HMR message: insufficient data (expected ${expectedLength} bytes, got ${data.byteLength})`
    )
  }
}
