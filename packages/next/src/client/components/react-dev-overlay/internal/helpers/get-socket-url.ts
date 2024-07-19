import { normalizedAssetPrefix } from '../../../../../shared/lib/normalized-asset-prefix'

function getSocketProtocol(assetPrefix: string): string {
  let protocol = window.location.protocol

  try {
    // assetPrefix is a url
    protocol = new URL(assetPrefix).protocol
  } catch {}

  return protocol === 'http:' ? 'ws' : 'wss'
}

export function getSocketUrl(assetPrefix: string): string {
  const { hostname, port } = window.location
  const protocol = getSocketProtocol(assetPrefix)
  const prefix = normalizedAssetPrefix(assetPrefix)

  let url = `${protocol}://${hostname}:${port}${prefix ? `/${prefix}` : ''}`

  if (prefix.startsWith('http')) {
    url = `${protocol}://${prefix.split('://', 2)[1]}`
  }

  return url
}
