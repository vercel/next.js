import type { Duplex } from 'stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { parseUrl } from '../../../lib/url'
import { warnOnce } from '../../../build/output/log'
import { isCsrfOriginAllowed } from '../../app-render/csrf-protection'

const allowedDevOriginsDocs =
  'https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins'

function getBlockedResourcePath(req: IncomingMessage): string {
  return parseUrl(req.url ?? '')?.pathname ?? req.url ?? '/_next/*'
}

function formatBlockedCrossSiteMessage(
  source: string | undefined,
  resourcePath: string
): string {
  const lines = [
    `Blocked cross-origin request to Next.js dev resource ${resourcePath}${getBlockedSourceDescription(source)}.`,
    'Cross-origin access to Next.js dev resources is blocked by default for safety.',
  ]

  // `source` has 3 meanings here:
  // - `'null'`: browser explicitly sent `Origin: null` for an opaque/sandboxed origin
  // - hostname string: we parsed an allowlistable host from Origin/Referer
  // - `undefined` (and effectively empty string): the request did not include a usable host
  if (source === 'null') {
    lines.push(
      '',
      'This request came from a privacy-sensitive or opaque origin, so Next.js cannot determine which host to allow.',
      'If you need it to succeed, load the dev server from a normal origin and add that host to "allowedDevOrigins".'
    )
  } else if (source) {
    lines.push(
      '',
      'To allow this host in development, add it to "allowedDevOrigins" in next.config.js and restart the dev server:',
      '',
      '// next.config.js',
      'module.exports = {',
      `  allowedDevOrigins: ['${source}'],`,
      '}'
    )
  } else {
    lines.push(
      '',
      'This request did not include an allowlistable source host.',
      'If you need it to succeed, make sure the browser sends an Origin or Referer from a host listed in "allowedDevOrigins".'
    )
  }

  lines.push('', `Read more: ${allowedDevOriginsDocs}`)
  return lines.join('\n')
}

function getBlockedSourceDescription(source: string | undefined): string {
  if (source === 'null') {
    return ' from a privacy-sensitive or opaque origin'
  }

  if (source) {
    return ` from "${source}"`
  }

  return ' from an unknown source'
}

function blockRequest(
  req: IncomingMessage,
  res: ServerResponse | Duplex,
  source: string | undefined
): boolean {
  warnOnce(formatBlockedCrossSiteMessage(source, getBlockedResourcePath(req)))

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

    return blockRequest(req, res, refererHostname)
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
    blockRequest(req, res, originLowerCase)
  )
}
