import type { Duplex } from 'stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { parseUrl } from '../../../lib/url'
import { warnOnce } from '../../../build/output/log'
import { isCsrfOriginAllowed } from '../../app-render/csrf-protection'

function blockRequest(
  res: ServerResponse | Duplex,
  origin: string | undefined
): boolean {
  const originString = origin ? `from ${origin}` : ''
  warnOnce(
    `Blocked cross-origin request ${originString} to /_next/* resource. To allow this, configure "allowedDevOrigins" in next.config\nRead more: https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins`
  )

  if ('statusCode' in res) {
    res.statusCode = 403
  }

  res.end('Unauthorized')

  return true
}

function parseHostnameFromHeader(
  header: string | string[] | undefined
): string | undefined {
  const headerValue = Array.isArray(header) ? header[0] : header

  if (!headerValue || headerValue === 'null') {
    return
  }

  const parsedHeader = parseUrl(headerValue)
  return parsedHeader?.hostname.toLowerCase()
}

function isInternalEndpoint(req: IncomingMessage): boolean {
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

export const blockCrossSiteDEV = (
  req: IncomingMessage,
  res: ServerResponse | Duplex,
  allowedDevOrigins: string[] | undefined,
  hostname: string | undefined
): boolean => {
  const allowedOrigins = [
    '*.localhost',
    'localhost',
    ...(allowedDevOrigins ?? []),
  ]
  if (hostname) {
    allowedOrigins.push(hostname)
  }

  // only process internal URLs/middleware
  if (!isInternalEndpoint(req)) {
    return false
  }

  // block non-cors request from cross-site e.g. script tag on
  // different host
  if (
    req.headers['sec-fetch-mode'] === 'no-cors' &&
    req.headers['sec-fetch-site'] === 'cross-site'
  ) {
    // no-cors requests do not send an Origin header, so fall back to Referer
    // when validating configured cross-site script loads.
    const refererHostname = parseHostnameFromHeader(req.headers['referer'])

    if (
      refererHostname &&
      isCsrfOriginAllowed(refererHostname, allowedOrigins)
    ) {
      return false
    }

    return blockRequest(res, refererHostname)
  }

  // ensure websocket requests are only fulfilled from allowed origin
  const rawOrigin = req.headers['origin']
  const originHeader = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin
  const parsedOrigin =
    originHeader && originHeader !== 'null'
      ? parseUrl(originHeader)
      : originHeader

  const originLowerCase =
    parsedOrigin === undefined || typeof parsedOrigin === 'string'
      ? parsedOrigin
      : parsedOrigin.hostname.toLowerCase()

  // Allow requests with no origin since those are just GET requests from same-site
  return (
    originLowerCase !== undefined &&
    !isCsrfOriginAllowed(originLowerCase, allowedOrigins) &&
    blockRequest(res, originLowerCase)
  )
}
