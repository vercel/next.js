import { useContext, useEffect, type RefObject } from 'react'
import { GlobalLayoutRouterContext } from '../../../../shared/lib/app-router-context.shared-runtime'
import { getSocketUrl } from '../get-socket-url'
import type { TurbopackMsgToBrowser } from '../../../../server/dev/hot-reloader-types'
import { reportInvalidHmrMessage } from '../shared'
import { performFullReload, processMessage } from './hot-reloader-app'
import {
  isTerminalLoggingEnabled,
  logQueue,
} from '../../../../next-devtools/userspace/app/forward-logs'

export function createWebSocket(assetPrefix: string) {
  const url = getSocketUrl(assetPrefix)
  const webSocket = new window.WebSocket(`${url}/_next/webpack-hmr`)

  if (isTerminalLoggingEnabled) {
    webSocket.addEventListener('open', () => {
      logQueue.onSocketReady(webSocket)
    })
  }

  const sendMessage = (data: string) => {
    if (webSocket.readyState === webSocket.OPEN) {
      webSocket.send(data)
    }
  }

  const processTurbopackMessage = createProcessTurbopackMessage(sendMessage)

  const appIsrManifestRef: RefObject<Record<string, boolean>> = { current: {} }
  const pathnameRef: RefObject<string> = { current: '' }

  webSocket.addEventListener('message', (event) => {
    try {
      const obj = JSON.parse(event.data)
      processMessage(
        obj,
        sendMessage,
        processTurbopackMessage,
        appIsrManifestRef,
        pathnameRef
      )
    } catch (err: unknown) {
      reportInvalidHmrMessage(event, err)
    }
  })

  return webSocket
}

export function createProcessTurbopackMessage(
  sendMessage: (data: string) => void
): (msg: TurbopackMsgToBrowser) => void {
  if (!process.env.TURBOPACK) {
    return () => {}
  }

  let queue: TurbopackMsgToBrowser[] = []
  let callback: ((msg: TurbopackMsgToBrowser) => void) | undefined

  const processTurbopackMessage = (msg: TurbopackMsgToBrowser) => {
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
      addMessageListener(cb: (msg: TurbopackMsgToBrowser) => void) {
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
    // Never send pings when using Turbopack as it's not used.
    // Pings were originally used to keep track of active routes in on-demand-entries with webpack.
    if (process.env.TURBOPACK) {
      return
    }

    if (!webSocket) {
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
