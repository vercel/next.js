import {
  request,
  type Agent,
  type IncomingMessage,
  type ServerResponse,
} from 'http'
import { distinctHeaders, prepareNativeRequestHeaders } from './native-headers'

// These fields use list syntax (Set-Cookie instead preserves separate field lines).
const MERGED_RESPONSE_HEADERS = new Set([
  'set-cookie',
  'link',
  'vary',
  'warning',
  'www-authenticate',
  'proxy-authenticate',
  'server-timing',
  'cache-control',
])

/** Forwards an admitted request to an authenticated worker's HTTP listener. */
export function proxyNativeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
  target: { port: number; agent: Agent; token: string }
): Promise<void> {
  const { headers, hasBody } = prepareNativeRequestHeaders(req)
  // Header overrides can remove Content-Length. Transfer-Encoding is hop-by-hop,
  // so regenerate framing for the admitted body instead of relying on Node's
  // method-specific defaults (DELETE and OPTIONS do not default to chunking).
  if (headers['content-length'] === undefined && hasBody) {
    headers['transfer-encoding'] = 'chunked'
  }
  headers['x-next-internal-go-token'] = target.token
  return new Promise<void>((resolve, reject) => {
    const upstream = request({
      hostname: '127.0.0.1',
      port: target.port,
      agent: target.agent,
      method: req.method,
      path: url,
      headers,
    })
    const cancel = () => {
      upstream.destroy()
      done()
    }
    const finish = () => done()
    let finished = false
    const done = (error?: Error) => {
      if (finished) return
      finished = true
      req.off('aborted', cancel)
      res.off('close', cancel)
      res.off('finish', finish)
      if (error) reject(error)
      else resolve()
    }
    req.once('aborted', cancel)
    res.once('close', cancel)
    upstream.once('error', done)
    upstream.once('response', (response) => {
      res.statusCode = response.statusCode || 502
      // Preserve repeated Set-Cookie and other response fields.
      const responseHeaders = distinctHeaders(response)
      for (const name in responseHeaders) {
        if (!Object.hasOwn(responseHeaders, name)) continue
        const value = responseHeaders[name]
        if (value === undefined) continue
        if (name === 'connection' || name === 'transfer-encoding') continue
        // Headers supplied by Next's routing/proxy phases remain on res.
        if (MERGED_RESPONSE_HEADERS.has(name)) {
          res.appendHeader(name, value)
        } else {
          res.setHeader(name, value.length === 1 ? value[0] : value)
        }
      }
      response.once('error', (error) => {
        res.destroy(error)
        done(error)
      })
      res.once('finish', finish)
      response.pipe(res)
    })
    req.pipe(upstream)
  })
}
