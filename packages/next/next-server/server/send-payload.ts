import { IncomingMessage, ServerResponse } from 'http'
import { isResSent } from '../lib/utils'
import generateETag from 'etag'
import fresh from 'next/dist/compiled/fresh'

type PayloadOptions =
  | { private: true }
  | { private: boolean; stateful: true }
  | { private: boolean; stateful: false; revalidate: number | false }

export function setRevalidateHeaders(
  res: ServerResponse,
  options: PayloadOptions
) {
  if (options.private || options.stateful) {
    if (options.private || !res.hasHeader('Cache-Control')) {
      res.setHeader(
        'Cache-Control',
        `private, no-cache, no-store, max-age=0, must-revalidate`
      )
    }
  } else if (typeof options.revalidate === 'number') {
    if (options.revalidate < 1) {
      throw new Error(
        `invariant: invalid Cache-Control duration provided: ${options.revalidate} < 1`
      )
    }

    res.setHeader(
      'Cache-Control',
      `s-maxage=${options.revalidate}, stale-while-revalidate`
    )
  } else if (options.revalidate === false) {
    res.setHeader('Cache-Control', `s-maxage=31536000, stale-while-revalidate`)
  }
}

export function sendPayload(
  req: IncomingMessage,
  res: ServerResponse,
  payload: any,
  type: 'html' | 'json',
  {
    generateEtags,
    poweredByHeader,
  }: { generateEtags: boolean; poweredByHeader: boolean },
  options?: PayloadOptions
): void {
  if (isResSent(res)) {
    return
  }

  if (poweredByHeader && type === 'html') {
    res.setHeader('X-Powered-By', 'Next.js')
  }

  const etag = generateEtags ? generateETag(payload) : undefined
  if (sendEtagResponse(req, res, etag)) {
    return
  }

  if (!res.getHeader('Content-Type')) {
    res.setHeader(
      'Content-Type',
      type === 'json' ? 'application/json' : 'text/html; charset=utf-8'
    )
  }
  res.setHeader('Content-Length', Buffer.byteLength(payload))
  if (options != null) {
    setRevalidateHeaders(res, options)
  }
  res.end(req.method === 'HEAD' ? null : payload)
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
