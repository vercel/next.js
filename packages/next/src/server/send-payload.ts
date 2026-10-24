import type { IncomingMessage, ServerResponse } from 'http'
import type RenderResult from './render-result'
import type { CacheControl } from './lib/cache-control'

import { isResSent } from '../shared/lib/utils'
import { generateETag } from './lib/etag'
import fresh from 'next/dist/compiled/fresh'
import { getCacheControlHeader } from './lib/cache-control'
import { HTML_CONTENT_TYPE_HEADER } from '../lib/constants'

export function sendEtagResponse(
  req: IncomingMessage,
  res: ServerResponse,
  etag: string | undefined
): boolean {
  if (etag) {
    /**
     * The server generating a 304 response MUST generate any of the
     * following header fields that would have been sent in a 200 (OK)
     * response to the same request: Cache-Control, Content-Location, Date,
     * ETag, Expires, and Vary. https://tools.ietf.org/html/rfc7232#section-4.1
     */
    res.setHeader('ETag', etag)
  }

  if (fresh(req.headers, { etag })) {
    res.statusCode = 304
    res.end()
    return true
  }

  return false
}

export async function sendRenderResult({
  req,
  res,
  result,
  generateEtags,
  poweredByHeader,
  cacheControl,
}: {
  req: IncomingMessage
  res: ServerResponse
  result: RenderResult
  generateEtags: boolean
  poweredByHeader: boolean
  cacheControl: CacheControl | undefined
}): Promise<void> {
  if (isResSent(res)) {
    return
  }

  if (poweredByHeader && result.contentType === HTML_CONTENT_TYPE_HEADER) {
    res.setHeader('X-Powered-By', 'Next.js')
  }

  // When cacheControl is provided (ISR/ISG pages), always set the
  // Cache-Control header. This ensures ISR cache-control takes precedence
  // over any headers that may have been set during rendering (e.g., in
  // _app.getInitialProps). See: https://github.com/vercel/next.js/issues/14244
  if (cacheControl) {
    res.setHeader('Cache-Control', getCacheControlHeader(cacheControl))
  }

  const payload = result.isDynamic ? null : result.toUnchunkedString()

  if (generateEtags && payload !== null) {
    const etag = generateETag(payload)
    if (sendEtagResponse(req, res, etag)) {
      return
    }
  }

  if (!res.getHeader('Content-Type') && result.contentType) {
    res.setHeader('Content-Type', result.contentType)
  }

  if (payload) {
    res.setHeader('Content-Length', Buffer.byteLength(payload))
  }

  if (req.method === 'HEAD') {
    res.end(null)
    return
  }

  if (payload !== null) {
    res.end(payload)
    return
  }

  // Pipe the render result to the response after we get a writer for it.
  await result.pipeToNodeResponse(res)
}
