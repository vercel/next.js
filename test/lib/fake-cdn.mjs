import { createServer } from 'node:http'
import { createGunzip } from 'node:zlib'
import httpProxy from 'http-proxy'

/**
 * What the fake CDN did with one request:
 * - `hit`: served from its cache, without asking the origin.
 * - `miss`: fetched from the origin, then stored.
 * - `uncacheable`: fetched from the origin for a cacheable request, but the
 *   response was `no-store`, so it wasn't stored.
 * - `bypass`: the request isn't cacheable (not a GET, or `no-store`), so it
 *   went straight to the origin.
 * - `redirect`: answered with one of the CDN's own redirects.
 *
 * @typedef {'hit' | 'miss' | 'uncacheable' | 'bypass' | 'redirect'} FakeCDNResult
 *
 * @typedef {object} FakeCDNRequest
 * @property {string} method
 * @property {string} url The path and query, which is also the cache key.
 * @property {import('node:http').IncomingHttpHeaders} headers
 * @property {FakeCDNResult} result
 *
 * @typedef {object} FakeCDN
 * @property {number} port
 * @property {FakeCDNRequest[]} requests Every request so far, in the order
 *   their result was known.
 * @property {() => Promise<void>} close
 */

/**
 * @param {import('node:http').IncomingMessage} req
 */
function isCacheableRequest(req) {
  return (
    req.method === 'GET' && !req.headers['cache-control']?.includes('no-store')
  )
}

/**
 * @param {import('node:http').IncomingMessage} res
 */
function isCacheableResponse(res) {
  return !res.headers['cache-control']?.includes('no-store')
}

/**
 * Starts a caching proxy in front of a Next.js server that behaves like a
 * plain HTTP CDN. Like certain real CDNs, it keys entries by URL only: it
 * ignores `Vary`, keeps entries forever, and stores any GET response that
 * isn't `no-store`. Next.js must not rely on any of those.
 *
 * @param {object} options
 * @param {number} options.destPort The port Next.js listens on.
 * @param {number} [options.port] The port to listen on. Defaults to a free one.
 * @param {Record<string, string>} [options.redirects] Pathnames the CDN
 *   answers itself with a 307 to the given location, without asking Next.js.
 * @returns {Promise<FakeCDN>}
 */
export async function startFakeCDN({ destPort, port = 0, redirects = {} }) {
  const target = `http://localhost:${destPort}`
  /** @type {Map<string, Promise<{ data: Buffer, statusCode: number, statusMessage: string, headers: import('node:http').IncomingHttpHeaders }>>} */
  const cache = new Map()
  /** @type {FakeCDNRequest[]} */
  const requests = []
  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {FakeCDNResult} result
   */
  const record = (req, result) => {
    requests.push({
      method: req.method ?? 'GET',
      url: req.url ?? '/',
      headers: { ...req.headers },
      result,
    })
  }

  const proxy = httpProxy.createProxyServer()
  const server = createServer(async (req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    const location = redirects[pathname]
    if (location) {
      record(req, 'redirect')
      res.writeHead(307, { Location: location })
      res.end()
      return
    }

    if (!isCacheableRequest(req)) {
      record(req, 'bypass')
      proxy.web(req, res, { target })
      return
    }

    const entry = await cache.get(req.url ?? '/')
    if (entry) {
      record(req, 'hit')
      res.writeHead(entry.statusCode, entry.statusMessage, entry.headers)
      res.end(entry.data)
      return
    }

    // Handle the response ourselves, so it can be stored.
    proxy.web(req, res, { target, selfHandleResponse: true })
  })

  proxy.on('proxyRes', (proxyRes, req, res) => {
    // http-proxy pipes bypassed responses itself.
    if (!isCacheableRequest(req)) return

    if (!isCacheableResponse(proxyRes)) {
      record(req, 'uncacheable')
      res.writeHead(
        proxyRes.statusCode ?? 200,
        proxyRes.statusMessage,
        proxyRes.headers
      )
      proxyRes.pipe(res)
      return
    }

    record(req, 'miss')
    /** @type {(entry: { data: Buffer, statusCode: number, statusMessage: string, headers: import('node:http').IncomingHttpHeaders }) => void} */
    let resolveEntry
    cache.set(
      req.url ?? '/',
      new Promise((resolve) => {
        resolveEntry = resolve
      })
    )

    // Store the decompressed body, and serve that from the cache.
    /** @type {NodeJS.ReadableStream} */
    let source = proxyRes
    if (proxyRes.headers['content-encoding'] === 'gzip') {
      source = proxyRes.pipe(createGunzip())
      delete proxyRes.headers['content-encoding']
    }

    /** @type {Buffer[]} */
    const chunks = []
    source.on('data', (chunk) => chunks.push(chunk))
    source.on('end', () => {
      const data = Buffer.concat(chunks)
      const stored = {
        data,
        statusCode: proxyRes.statusCode ?? 200,
        statusMessage: proxyRes.statusMessage ?? '',
        headers: proxyRes.headers,
      }
      res.writeHead(stored.statusCode, stored.statusMessage, stored.headers)
      res.end(data)
      resolveEntry(stored)
    })
  })

  proxy.on('error', (err, _req, res) => {
    console.error('[fake-cdn] proxy error', err)
    if ('writeHead' in res && !res.headersSent) {
      res.writeHead(502)
    }
    res.end()
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, () => resolve(undefined))
  })
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('The fake CDN is not listening on a port')
  }

  return {
    port: address.port,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections()
      }),
  }
}
