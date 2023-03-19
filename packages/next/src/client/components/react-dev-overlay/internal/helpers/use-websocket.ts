import { useCallback, useContext, useEffect, useRef } from 'react'
import { GlobalLayoutRouterContext } from '../../../../../shared/lib/app-router-context'
import { getSocketProtocol } from './get-socket-protocol'

export function useWebsocket(assetPrefix: string) {
  const webSocketRef = useRef<WebSocket>()

  useEffect(() => {
    if (webSocketRef.current) {
      return
    }

    const { hostname, port } = window.location
    const protocol = getSocketProtocol(assetPrefix)
    const normalizedAssetPrefix = assetPrefix.replace(/^\/+/, '')

    let url = `${protocol}://${hostname}:${port}${
      normalizedAssetPrefix ? `/${normalizedAssetPrefix}` : ''
    }`

    if (normalizedAssetPrefix.startsWith('http')) {
      url = `${protocol}://${normalizedAssetPrefix.split('://')[1]}`
    }

    webSocketRef.current = new window.WebSocket(`${url}/_next/webpack-hmr`)
  }, [assetPrefix])

  return webSocketRef
}

export function useSendMessage(webSocketRef: ReturnType<typeof useWebsocket>) {
  const sendMessage = useCallback(
    (data) => {
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

export function useWebsocketPing(
  websocketRef: ReturnType<typeof useWebsocket>
) {
  const sendMessage = useSendMessage(websocketRef)
  const { tree } = useContext(GlobalLayoutRouterContext)

  useEffect(() => {
    // Taken from on-demand-entries-client.js
    // TODO-APP: check 404 case
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
