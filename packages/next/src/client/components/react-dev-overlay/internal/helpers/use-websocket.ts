import { useCallback, useContext, useEffect, useRef } from 'react'
import { GlobalLayoutRouterContext } from '../../../../../shared/lib/app-router-context.shared-runtime'
import { getSocketUrl } from './get-socket-url'
import type { TurbopackMsgToBrowser } from '../../../../../server/dev/hot-reloader-types'

export function useWebsocket(assetPrefix: string) {
  const webSocketRef = useRef<WebSocket>(undefined)

  useEffect(() => {
    if (webSocketRef.current) {
      return
    }

    const url = getSocketUrl(assetPrefix)

    webSocketRef.current = new window.WebSocket(`${url}/_next/webpack-hmr`)
  }, [assetPrefix])

  return webSocketRef
}

export function useSendMessage(webSocketRef: ReturnType<typeof useWebsocket>) {
  const sendMessage = useCallback(
    (data: string) => {
      const socket = webSocketRef.current
      if (!socket || socket.readyState !== socket.OPEN) {
        return
      }
      return socket.send(data)
    },
    [webSocketRef]
  )
  return sendMessage
}

export function useTurbopack(
  sendMessage: ReturnType<typeof useSendMessage>,
  onUpdateError: (err: unknown) => void
) {
  const turbopackState = useRef<{
    init: boolean
    queue: Array<TurbopackMsgToBrowser> | undefined
    callback: ((msg: TurbopackMsgToBrowser) => void) | undefined
  }>({
    init: false,
    // Until the dynamic import resolves, queue any turbopack messages which will be replayed.
    queue: [],
    callback: undefined,
  })

  const processTurbopackMessage = useCallback((msg: TurbopackMsgToBrowser) => {
    const { callback, queue } = turbopackState.current
    if (callback) {
      callback(msg)
    } else {
      queue!.push(msg)
    }
  }, [])

  useEffect(() => {
    const { current: initCurrent } = turbopackState
    // TODO(WEB-1589): only install if `process.turbopack` set.
    if (initCurrent.init) {
      return
    }
    initCurrent.init = true

    import(
      // @ts-expect-error requires "moduleResolution": "node16" in tsconfig.json and not .ts extension
      '@vercel/turbopack-ecmascript-runtime/browser/dev/hmr-client/hmr-client.ts'
    ).then(({ connect }) => {
      const { current } = turbopackState
      connect({
        addMessageListener(cb: (msg: TurbopackMsgToBrowser) => void) {
          current.callback = cb

          // Replay all Turbopack messages before we were able to establish the HMR client.
          for (const msg of current.queue!) {
            cb(msg)
          }
          current.queue = undefined
        },
        sendMessage,
        onUpdateError,
      })
    })
  }, [sendMessage, onUpdateError])

  return processTurbopackMessage
}

export function useWebsocketPing(
  websocketRef: ReturnType<typeof useWebsocket>
) {
  const sendMessage = useSendMessage(websocketRef)
  const { tree } = useContext(GlobalLayoutRouterContext)

  useEffect(() => {
    // Never send pings when using Turbopack as it's not used.
    // Pings were originally used to keep track of active routes in on-demand-entries with webpack.
    if (process.env.TURBOPACK) {
      return
    }

    // Taken from on-demand-entries-client.js
    const interval = setInterval(() => {
      sendMessage(
        JSON.stringify({
          event: 'ping',
          tree,
          appDirRoute: true,
        })
      )
    }, 2500)
    return () => clearInterval(interval)
  }, [tree, sendMessage])
}
