import type { IncomingMessage } from 'http'
import { timingSafeEqual } from 'crypto'
import { isIP } from 'net'

export const SWITCHYARD_CONNECTION_HEADER = 'x-nextjs-switchyard-connection'

// Room for the authenticated peer address added after the public header limit
// has been enforced. Keep it out of the application's header budget.
export const SWITCHYARD_HEADER_OVERHEAD = 256

// How many header lines Node's server reads from a request when
// server.maxHeadersCount isn't set (MAX_HEADER_PAIRS in Node's
// lib/_http_common.js counts names and values, 2000 entries). Switchyard
// refuses requests with more, so Node never drops any of them.
export const NODE_MAX_HEADER_LINES = 1000

// The header-line limit of the Node server behind Switchyard: the public
// limit plus room for the headers Switchyard adds (the connection metadata,
// X-Forwarded-For and -Port, and a few Go writes itself), so those are never
// among the headers Node drops.
export const SWITCHYARD_PRIVATE_MAX_HEADER_LINES = NODE_MAX_HEADER_LINES + 16

/** Restore the TCP peer before routing or upgrading a proxied request. */
export function restoreSwitchyardConnection(
  req: IncomingMessage,
  token: Buffer
): boolean {
  const peer = req.headers[SWITCHYARD_CONNECTION_HEADER]
  // Node can also call its private listener directly (e.g. server actions).
  // A request that filled Node's header-line limit may have had the metadata
  // dropped along with the lines past it, so it isn't taken as one of those.
  if (peer === undefined) {
    return req.rawHeaders.length < 2 * SWITCHYARD_PRIVATE_MAX_HEADER_LINES
  }

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

  // `<address>:<port>`, then `;1.0` for an HTTP/1.0 client: Switchyard always
  // speaks HTTP/1.1 to this server.
  const [address, version, ...rest] = peer.slice(token.length + 1).split(';')
  if (rest.length > 0 || (version !== undefined && version !== '1.0')) {
    return false
  }
  if (version === '1.0') {
    req.httpVersion = '1.0'
    req.httpVersionMajor = 1
    req.httpVersionMinor = 0
  }
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
