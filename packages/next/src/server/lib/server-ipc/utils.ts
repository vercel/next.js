import type { Duplex } from 'stream'
import type { IncomingMessage, ServerResponse } from 'webpack-dev-server'
import { parseUrl } from '../../../lib/url'
import net from 'net'

export const ipcForbiddenHeaders = [
  'accept-encoding',
  'keepalive',
  'keep-alive',
  'content-encoding',
  'transfer-encoding',
  // https://github.com/nodejs/undici/issues/1470
  'connection',
  // marked as unsupported by undici: https://github.com/nodejs/undici/blob/c83b084879fa0bb8e0469d31ec61428ac68160d5/lib/core/request.js#L354
  'expect',
]

export const actionsForbiddenHeaders = [
  ...ipcForbiddenHeaders,
  'content-length',
  'set-cookie',
]

export const filterReqHeaders = (
  headers: Record<string, undefined | string | number | string[]>,
  forbiddenHeaders: string[]
) => {
  // Some browsers are not matching spec and sending Content-Length: 0. This causes issues in undici
  // https://github.com/nodejs/undici/issues/2046
  if (headers['content-length'] && headers['content-length'] === '0') {
    delete headers['content-length']
  }

  for (const [key, value] of Object.entries(headers)) {
    if (
      forbiddenHeaders.includes(key) ||
      !(Array.isArray(value) || typeof value === 'string')
    ) {
      delete headers[key]
    }
  }
  return headers as Record<string, undefined | string | string[]>
}

// These are headers that are only used internally and should
// not be honored from the external request
const INTERNAL_HEADERS = [
  'x-middleware-rewrite',
  'x-middleware-redirect',
  'x-middleware-set-cookie',
  'x-middleware-skip',
  'x-middleware-override-headers',
  'x-middleware-next',
  'x-now-route-matches',
  'x-matched-path',
]

export const filterInternalHeaders = (
  headers: Record<string, undefined | string | string[]>
) => {
  for (const header in headers) {
    if (INTERNAL_HEADERS.includes(header)) {
      delete headers[header]
    }
  }
}

export const blockCrossSite = (
  req: IncomingMessage,
  res: ServerResponse | Duplex,
  allowedOrigins: string[],
  activePort: string
): {
  finished?: boolean
} => {
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
    return {
      finished: true,
    }
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
        return {
          finished: true,
        }
      }
    }
  }

  return {}
}
