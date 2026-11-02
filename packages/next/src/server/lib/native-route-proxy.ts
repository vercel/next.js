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

/** Forwards an admitted request to an authenticated worker's HTTP listener. */
export function proxyNativeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
  target: { port: number; agent: Agent; token: string }
): Promise<void> {
  // Public values cannot supply private metadata. Authentication is process scoped.
  // Use normalized headers so proxy.ts request-header mutations are respected.
  const rawValues: Record<string, string | string[]> = Object.create(null)
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const name = req.rawHeaders[i].toLowerCase()
    const value = req.rawHeaders[i + 1]
    const existingRawValue = rawValues[name]
    if (existingRawValue === undefined) rawValues[name] = value
    else if (typeof existingRawValue === 'string')
      rawValues[name] = [existingRawValue, value]
    else existingRawValue.push(value)
  }
  const connection = String(req.headers.connection || '').toLowerCase()
  const connectionHeaders = connection
    ? new Set(connection.split(',').map((name) => name.trim()))
    : undefined
  const headers: typeof req.headers = Object.create(null)
  for (const [name, value] of Object.entries(req.headers)) {
    if (
      HOP_BY_HOP_HEADERS.has(name) ||
      connectionHeaders?.has(name) ||
      name.startsWith('x-next-go-')
    ) {
      continue
    }
    const raw = rawValues[name]
    headers[name] =
      Array.isArray(raw) && value === raw.join(name === 'cookie' ? '; ' : ', ')
        ? raw
        : value
  }
  headers['x-next-go-token'] = target.token
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
    let finished = false
    const done = (error?: Error) => {
      if (finished) return
      finished = true
      req.off('aborted', cancel)
      res.off('close', cancel)
      if (error) reject(error)
      else resolve()
    }
    req.once('aborted', cancel)
    res.once('close', cancel)
    upstream.once('error', done)
    upstream.once('response', (response) => {
      res.statusCode = response.statusCode || 502
      // rawHeaders preserves repeated Set-Cookie and other response fields.
      const responseHeaders: Record<string, string[]> = Object.create(null)
      for (let i = 0; i < response.rawHeaders.length; i += 2) {
        const name = response.rawHeaders[i].toLowerCase()
        if (name === 'connection' || name === 'transfer-encoding') continue
        ;(responseHeaders[name] ||= []).push(response.rawHeaders[i + 1])
      }
      for (const [name, value] of Object.entries(responseHeaders)) {
        // Headers supplied by Next's routing/proxy phases remain on res.
        const existing = MERGED_RESPONSE_HEADERS.has(name)
          ? res.getHeader(name)
          : undefined
        const merged = existing
          ? [
              ...(Array.isArray(existing)
                ? existing.map(String)
                : [String(existing)]),
              ...value,
            ]
          : value
        res.setHeader(name, merged.length === 1 ? merged[0] : merged)
      }
      response.once('error', (error) => {
        res.destroy(error)
        done(error)
      })
      res.once('finish', () => done())
      response.pipe(res)
    })
    req.pipe(upstream)
  })
}
