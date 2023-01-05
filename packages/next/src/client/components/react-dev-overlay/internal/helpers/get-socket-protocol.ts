export function getSocketProtocol(assetPrefix: string): string {
  let protocol = window.location.protocol

  try {
    // assetPrefix is a url
    protocol = new URL(assetPrefix).protocol
  } catch (_) {}

  return protocol === 'http:' ? 'ws' : 'wss'
}
