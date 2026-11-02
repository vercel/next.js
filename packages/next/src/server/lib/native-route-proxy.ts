import {
  request,
  type Agent,
  type IncomingMessage,
  type ServerResponse,
} from 'http'

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])
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

function distinctHeaders(message: IncomingMessage): Record<string, string[]> {
  // Node's headersDistinct getter throws for names inherited from Object.prototype.
  const headers: Record<string, string[]> = Object.create(null)
  for (let i = 0; i < message.rawHeaders.length; i += 2) {
    const name = message.rawHeaders[i].toLowerCase()
    ;(headers[name] ||= []).push(message.rawHeaders[i + 1])
  }
  return headers
}

/** Forwards an admitted request to an authenticated worker's HTTP listener. */
export function proxyNativeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
  target: { port: number; agent: Agent; token: string }
): Promise<void> {
  // Discard client-supplied internal Go headers.
  // Authenticate forwarded requests with this Go worker's token.
  // Use normalized headers so proxy.ts request-header mutations are respected.
  const rawValues = distinctHeaders(req)
  const connection = String(req.headers.connection || '').toLowerCase()
  const connectionHeaders = connection
    ? new Set(connection.split(',').map((name) => name.trim()))
    : undefined
  const headers: typeof req.headers = Object.create(null)
  for (const name in req.headers) {
    if (
      !Object.hasOwn(req.headers, name) ||
      HOP_BY_HOP_HEADERS.has(name) ||
      connectionHeaders?.has(name) ||
      name.startsWith('x-next-internal-go-')
    ) {
      continue
    }
    const value = req.headers[name]
    const raw = rawValues[name]
    headers[name] =
      raw &&
      raw.length > 1 &&
      value === raw.join(name === 'cookie' ? '; ' : ', ')
        ? raw
        : value
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
