import type { IncomingMessage, ServerResponse } from 'http'

import { isResSent } from '../../shared/lib/utils'
import { generateETag } from '../lib/etag'
import fresh from 'next/dist/compiled/fresh'
import RenderResult from '../render-result'
import { setRevalidateHeaders } from './revalidate-headers'

export type PayloadOptions =
  | { private: true }
  | { private: boolean; stateful: true }
  | { private: boolean; stateful: false; revalidate: number | false }

export { setRevalidateHeaders }

export async function sendRenderResult({
  req,
  res,
  result,
  type,
  generateEtags,
  poweredByHeader,
  options,
}: {
  req: IncomingMessage
  res: ServerResponse
  result: RenderResult
  type: 'html' | 'json'
  generateEtags: boolean
  poweredByHeader: boolean
  options?: PayloadOptions
}): Promise<void> {
  if (isResSent(res)) {
    return
  }

  if (poweredByHeader && type === 'html') {
    res.setHeader('X-Powered-By', 'Next.js')
  }

  const payload = result.isDynamic() ? null : await result.toUnchunkedString()

  if (payload) {
    const etag = generateEtags ? generateETag(payload) : undefined
    if (sendEtagResponse(req, res, etag)) {
      return
    }
  }

  if (!res.getHeader('Content-Type')) {
    res.setHeader(
      'Content-Type',
      type === 'json' ? 'application/json' : 'text/html; charset=utf-8'
    )
  }

  if (payload) {
    res.setHeader('Content-Length', Buffer.byteLength(payload))
  }

  if (options != null) {
    setRevalidateHeaders(res, options)
  }

  if (req.method === 'HEAD') {
    res.end(null)
  } else if (payload) {
    res.end(payload)
  } else {
    await result.pipe(res)
  }
}

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
