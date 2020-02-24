import { IncomingMessage } from 'http'
import generateETag from 'etag'
import fresh from 'fresh'
import { ResponseLike } from './utils'

export function sendHTML(
  req: IncomingMessage,
  res: ResponseLike,
  html: string,
  {
    generateEtags,
    poweredByHeader,
  }: { generateEtags: boolean; poweredByHeader: boolean }
) {
  if (res.hasSent()) return
  const etag = generateEtags ? generateETag(html) : undefined

  if (poweredByHeader) {
    res.set('X-Powered-By', 'Next.js')
  }

  if (fresh(req.headers, { etag })) {
    res.status(304).end()
    return
  }

  if (etag) {
    res.set('ETag', etag)
  }

  if (!res.getHeader('Content-Type')) {
    res.set('Content-Type', 'text/html; charset=utf-8')
  }
  res.set('Content-Length', Buffer.byteLength(html))
  res.end(req.method === 'HEAD' ? null : html)
}
