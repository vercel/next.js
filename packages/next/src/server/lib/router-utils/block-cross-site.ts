import type { Duplex } from 'stream'
import type { IncomingMessage, ServerResponse } from 'webpack-dev-server'
import { parseUrl } from '../../../lib/url'
import net from 'net'

export const blockCrossSite = (
  req: IncomingMessage,
  res: ServerResponse | Duplex,
  allowedOrigins: string[],
  activePort: string
): boolean => {
  // only process _next URLs
  if (!req.url?.includes('/_next')) {
    return false
  }
  // block non-cors request from cross-site e.g. script tag on
  // different host
  if (
    req.headers['sec-fetch-mode'] === 'no-cors' &&
    req.headers['sec-fetch-site'] === 'cross-site'
  ) {
    if ('statusCode' in res) {
      res.statusCode = 403
    }
    res.end('Unauthorized')
    return true
  }

  // ensure websocket requests from allowed origin
  const rawOrigin = req.headers['origin']

  if (rawOrigin) {
    const parsedOrigin = parseUrl(rawOrigin)

    if (parsedOrigin) {
      const originLowerCase = parsedOrigin.hostname.toLowerCase()
      const isMatchingPort = parsedOrigin.port === activePort
      const isIpRequest =
        net.isIPv4(originLowerCase) || net.isIPv6(originLowerCase)

      if (
        // allow requests if direct IP and matching port and
        // allow if any of the allowed origins match
        !(isIpRequest && isMatchingPort) &&
        !allowedOrigins.some(
          (allowedOrigin) => allowedOrigin === originLowerCase
        )
      ) {
        if ('statusCode' in res) {
          res.statusCode = 403
        }
        res.end('Unauthorized')
        return true
      }
    }
  }

  return false
}
