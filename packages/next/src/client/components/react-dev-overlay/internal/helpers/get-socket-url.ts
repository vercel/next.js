import { normalizedAssetPrefix } from '../../../../../shared/lib/normalized-asset-prefix'

function getSocketProtocol(assetPrefix: string): string {
  let protocol = window.location.protocol

  try {
    // assetPrefix is a url
    protocol = new URL(assetPrefix).protocol
  } catch {}

  return protocol === 'http:' ? 'ws' : 'wss'
}

export function getSocketUrl(assetPrefix: string | undefined): string {
  const { hostname, port } = window.location
  const protocol = getSocketProtocol(assetPrefix || '')
  // if original assetPrefix is a URL with protocol
  // the prefix should be normalized to pathname
  const prefix = normalizedAssetPrefix(assetPrefix)

  return `${protocol}://${hostname}:${port}${prefix}`
}
