import {IncomingMessage, ServerResponse} from 'http'
import generateETag from 'etag'
import fresh from 'fresh'
import { isResSent } from '../lib/utils'

export function sendHTML(req: IncomingMessage, res: ServerResponse, html: string, { generateEtags, poweredByHeader }: {generateEtags: boolean, poweredByHeader: boolean}) {
  if (isResSent(res)) return
  const etag = generateEtags ? generateETag(html) : undefined

  if (poweredByHeader) {
    res.setHeader('X-Powered-By', 'Next.js')
  }

  if (fresh(req.headers, { etag })) {
    res.statusCode = 304
    res.end()
    return
  }

  if (etag) {
    res.setHeader('ETag', etag)
  }

  if (!res.getHeader('Content-Type')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
  }
  res.setHeader('Content-Length', Buffer.byteLength(html))
  res.end(req.method === 'HEAD' ? null : html)
}
