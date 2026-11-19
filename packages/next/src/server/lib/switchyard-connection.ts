import type { IncomingMessage } from 'http'
import { timingSafeEqual } from 'crypto'
import { isIP } from 'net'

export const SWITCHYARD_CONNECTION_HEADER = 'x-nextjs-switchyard-connection'

// Room for the authenticated peer address added after the public header limit
// has been enforced. Keep it out of the application's header budget.
export const SWITCHYARD_HEADER_OVERHEAD = 256

/** Restore the TCP peer before routing or upgrading a proxied request. */
export function restoreSwitchyardConnection(
  req: IncomingMessage,
  token: Buffer
): boolean {
  const peer = req.headers[SWITCHYARD_CONNECTION_HEADER]
  // Node can also call its private listener directly (e.g. server actions).
  if (peer === undefined) return true

  delete req.headers[SWITCHYARD_CONNECTION_HEADER]
  for (let i = req.rawHeaders.length - 2; i >= 0; i -= 2) {
    if (req.rawHeaders[i].toLowerCase() === SWITCHYARD_CONNECTION_HEADER) {
      req.rawHeaders.splice(i, 2)
    }
  }
  if (typeof peer !== 'string') return false
  const metadata = Buffer.from(peer, 'latin1')
  if (
    metadata[token.length] !== 59 ||
    !timingSafeEqual(metadata.subarray(0, token.length), token)
  ) {
    return false
  }

  const address = peer.slice(token.length + 1)
  const colon = address.lastIndexOf(':')
  const remoteAddress = address.startsWith('[')
    ? address.slice(1, colon - 1)
    : address.slice(0, colon)
  const remotePort = Number(address.slice(colon + 1))
  const family = isIP(remoteAddress)
  if (
    !family ||
    !Number.isInteger(remotePort) ||
    remotePort < 1 ||
    remotePort > 65535
  ) {
    return false
  }

  const socket = req.socket
  if (Object.hasOwn(socket, 'remoteAddress')) {
    // Switchyard keeps each upstream connection exclusive to one TCP peer.
    return (
      socket.remoteAddress === remoteAddress && socket.remotePort === remotePort
    )
  }
  Object.defineProperties(socket, {
    remoteAddress: { value: remoteAddress },
    remotePort: { value: remotePort },
    remoteFamily: { value: family === 4 ? 'IPv4' : 'IPv6' },
  })
  return true
}
