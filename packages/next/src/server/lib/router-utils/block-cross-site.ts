import type { Duplex } from 'stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { parseUrl } from '../../../lib/url'
import { warnOnce } from '../../../build/output/log'
import { isCsrfOriginAllowed } from '../../app-render/csrf-protection'

function warnOrBlockRequest(
  res: ServerResponse | Duplex,
  origin: string | undefined,
  mode: 'warn' | 'block'
): boolean {
  const originString = origin ? `from ${origin}` : ''
  if (mode === 'warn') {
    warnOnce(
      `Cross origin request detected ${originString} to /_next/* resource. In a future major version of Next.js, you will need to explicitly configure "allowedDevOrigins" in next.config to allow this.\nRead more: https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins`
    )

    return false
  }

  warnOnce(
    `Blocked cross-origin request ${originString} to /_next/* resource. To allow this, configure "allowedDevOrigins" in next.config\nRead more: https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins`
  )

  if ('statusCode' in res) {
    res.statusCode = 403
  }

  res.end('Unauthorized')

  return true
}

function isInternalDevEndpoint(req: IncomingMessage): boolean {
  if (!req.url) return false

  try {
    // TODO: We should standardize on a single prefix for this
    const isMiddlewareRequest = req.url.includes('/__nextjs')
    const isInternalAsset = req.url.includes('/_next')
    // Static media requests are excluded, as they might be loaded via CSS and would fail
    // CORS checks.
    const isIgnoredRequest =
      req.url.includes('/_next/image') ||
      req.url.includes('/_next/static/media')

    return !isIgnoredRequest && (isInternalAsset || isMiddlewareRequest)
  } catch (err) {
    return false
  }
}

export const blockCrossSite = (
  req: IncomingMessage,
  res: ServerResponse | Duplex,
  allowedDevOrigins: string[] | undefined,
  hostname: string | undefined
): boolean => {
  // in the future, these will be blocked by default when allowed origins aren't configured.
  // for now, we warn when allowed origins aren't configured
  const mode = typeof allowedDevOrigins === 'undefined' ? 'warn' : 'block'

  const allowedOrigins = [
    '*.localhost',
    'localhost',
    ...(allowedDevOrigins || []),
  ]
  if (hostname) {
    allowedOrigins.push(hostname)
  }

  // only process internal URLs/middleware
  if (!isInternalDevEndpoint(req)) {
    return false
  }
  // block non-cors request from cross-site e.g. script tag on
  // different host
  if (
    req.headers['sec-fetch-mode'] === 'no-cors' &&
    req.headers['sec-fetch-site'] === 'cross-site'
  ) {
    return warnOrBlockRequest(res, undefined, mode)
  }

  // ensure websocket requests from allowed origin
  const rawOrigin = req.headers['origin']

  if (rawOrigin) {
    const parsedOrigin = parseUrl(rawOrigin)

    if (parsedOrigin) {
      const originLowerCase = parsedOrigin.hostname.toLowerCase()

      if (!isCsrfOriginAllowed(originLowerCase, allowedOrigins)) {
        return warnOrBlockRequest(res, originLowerCase, mode)
      }
    }
  }

  return false
}
