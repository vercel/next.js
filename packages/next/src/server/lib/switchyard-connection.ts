import type { IncomingMessage } from 'http'
import { isIP } from 'net'
import { takeHeader, takePeerToken } from './peer-token'

/** The client's `ip:port`, which Switchyard sends with its token. */
export const CLIENT_ADDRESS_HEADER = 'x-next-internal-client-address'

// Room for the token and client address added after the public header limit
// has been enforced. Keep it out of the application's header budget.
export const SWITCHYARD_HEADER_OVERHEAD = 256

/** Check Switchyard's token and restore the TCP peer before routing or upgrading a proxied request. */
export function restoreSwitchyardConnection(
  req: IncomingMessage,
  token: Buffer
): boolean {
  const check = takePeerToken(req, token)
  const address = takeHeader(req, CLIENT_ADDRESS_HEADER)
  // Node can also call its private listener directly (e.g. server actions).
  if (check === 'missing') return address === undefined
  if (check === 'invalid' || typeof address !== 'string') return false

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
