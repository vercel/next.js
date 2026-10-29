// A copy of createFakeCDN from test/e2e/app-dir/segment-cache/cdn-cache-busting/server.mjs,
// with one fix: an uncacheable response to a cacheable request keeps its
// status and headers (the original pipes the body only).
// usage: node test/e2e/app-dir/ppr-cdn-mode/spike-tools/fake-cdn.mjs <cdnPort> <nextPort>
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { createGunzip } from 'node:zlib'
const require = createRequire(import.meta.url)
const httpProxy = require('http-proxy')

const [cdnPort, nextPort] = process.argv.slice(2).map(Number)
const cache = new Map()
const isCacheableRequest = (req) =>
  req.method === 'GET' && !req.headers['cache-control']?.includes('no-store')
const isCacheableResponse = (res) =>
  !res.headers['cache-control']?.includes('no-store')

const proxy = httpProxy.createProxyServer()
createServer(async (req, res) => {
  if (!isCacheableRequest(req)) {
    proxy.web(req, res, { target: `http://localhost:${nextPort}` })
    return
  }
  const entry = await cache.get(req.url)
  if (entry) {
    console.log('HIT ', req.url)
    res.writeHead(entry.statusCode, entry.statusMessage, entry.headers)
    res.end(entry.data)
    return
  }
  console.log('MISS', req.url)
  proxy.web(req, res, {
    target: `http://localhost:${nextPort}`,
    selfHandleResponse: true,
  })
}).listen(cdnPort, () => console.log(`fake CDN on ${cdnPort} -> ${nextPort}`))

proxy.on('proxyRes', (proxyRes, req, res) => {
  if (!isCacheableResponse(proxyRes)) {
    // The fix: write the status and headers before piping the body.
    res.writeHead(
      proxyRes.statusCode || 200,
      proxyRes.statusMessage,
      proxyRes.headers
    )
    proxyRes.pipe(res)
    return
  }
  let resolveEntry
  cache.set(req.url, new Promise((r) => (resolveEntry = r)))
  let source = proxyRes
  if (proxyRes.headers['content-encoding'] === 'gzip') {
    source = proxyRes.pipe(createGunzip())
    delete proxyRes.headers['content-encoding']
  }
  const chunks = []
  source.on('data', (c) => chunks.push(c))
  source.on('end', () => {
    const data = Buffer.concat(chunks)
    res.writeHead(
      proxyRes.statusCode || 200,
      proxyRes.statusMessage,
      proxyRes.headers
    )
    res.end(data)
    resolveEntry({
      data,
      statusCode: proxyRes.statusCode,
      statusMessage: proxyRes.statusMessage,
      headers: proxyRes.headers,
    })
  })
})
