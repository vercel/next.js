import { useEffect, useRef } from 'react'
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
