import { isInternalHeader } from '../../lib/server-ipc/internal-headers'
import { getConnectionHeaderTokens } from './websocket-connection-headers'

const FALLBACK_REPLACED_HEADERS = new Set([
  'accept-ranges',
  'age',
  'cache-control',
  'connection',
  'content-digest',
  'content-disposition',
  'content-encoding',
  'content-language',
  'content-length',
  'content-location',
  'content-range',
  'content-type',
  'digest',
  'edge-control',
  'etag',
  'expires',
  'keep-alive',
  'last-modified',
  'proxy-connection',
  'repr-digest',
  'sec-websocket-accept',
  'sec-websocket-extensions',
  'sec-websocket-key',
  'sec-websocket-protocol',
  'sec-websocket-version',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'surrogate-control',
  'x-lighttpd-send-file',
  'x-sendfile',
])

const FALLBACK_CACHE_CONTROL =
  'private, no-cache, no-store, max-age=0, must-revalidate'
const FALLBACK_BODY = 'This route only accepts WebSocket upgrade requests.'

function isReplacedFallbackHeader(name: string): boolean {
  return (
    FALLBACK_REPLACED_HEADERS.has(name) ||
    name.endsWith('-cache-control') ||
    name.startsWith('x-accel-')
  )
}

/** @internal */
export function createWebSocketUpgradeFallbackResponse(
  response: Response,
  inheritedHeaders?: Headers
): Response {
  const sourceHeaders = new Headers(inheritedHeaders)
  for (const [name, value] of response.headers) {
    if (name.toLowerCase() !== 'set-cookie') sourceHeaders.set(name, value)
  }
  for (const cookie of response.headers.getSetCookie()) {
    sourceHeaders.append('set-cookie', cookie)
  }

  const headers = new Headers()
  const connectionHeaderTokens = getConnectionHeaderTokens(sourceHeaders)

  for (const [name, value] of sourceHeaders) {
    const lowerName = name.toLowerCase()
    if (
      lowerName === 'set-cookie' ||
      isReplacedFallbackHeader(lowerName) ||
      connectionHeaderTokens.has(lowerName) ||
      isInternalHeader(lowerName) ||
      lowerName.startsWith('x-middleware-') ||
      lowerName.startsWith('x-nextjs-')
    ) {
      continue
    }
    headers.append(name, value)
  }
  if (!connectionHeaderTokens.has('set-cookie')) {
    for (const cookie of sourceHeaders.getSetCookie()) {
      headers.append('set-cookie', cookie)
    }
  }

  headers.set('cache-control', FALLBACK_CACHE_CONTROL)
  headers.set('connection', 'close')
  headers.set('content-length', String(FALLBACK_BODY.length))
  headers.set('content-type', 'text/plain; charset=utf-8')
  headers.set('upgrade', 'websocket')
  headers.set('sec-websocket-version', '13')
  return new Response(FALLBACK_BODY, {
    status: 426,
    headers,
  })
}
