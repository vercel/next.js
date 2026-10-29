// A proxy in front of next start that passes documents and assets through but
// breaks RSC requests (rsc: 1) in one of several ways, and counts requests.
// usage: node test/e2e/app-dir/ppr-cdn-mode/spike-tools/break-refresh.mjs <proxyPort> <nextPort> [mode]
// modes for RSC requests: none | strip | 500 | html | drop | skew
// modes for /partial* documents (today's PPR, spike off): cut-end | cut-drop
// Switch modes at runtime with GET /__spike?mode=<mode>; it returns counts per mode.
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
const require = createRequire(import.meta.url)
const httpProxy = require('http-proxy')

const [proxyPort, nextPort] = process.argv.slice(2, 4).map(Number)
let mode = process.argv[4] ?? 'none'
const SHELL_BYTES = Number(process.env.SHELL_BYTES ?? 1121)
const counts = {}
const count = (k) => {
  counts[mode] ??= { doc: 0, rsc: 0 }
  counts[mode][k]++
}
const target = `http://localhost:${nextPort}`
const proxy = httpProxy.createProxyServer()

createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname
  // Control endpoint: GET /__spike?mode=<m> switches mode. Counts are kept per mode.
  if (path === '/__spike') {
    const next = new URL(req.url, 'http://x').searchParams.get('mode')
    if (next) mode = next
    res.writeHead(200, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    })
    res.end(JSON.stringify({ mode, counts }))
    return
  }
  const isRsc = req.headers['rsc'] === '1'
  if (
    !isRsc &&
    (mode === 'cut-end' || mode === 'cut-drop') &&
    path.startsWith('/partial')
  ) {
    // Today's PPR: send the headers and the shell, then fail the resume.
    count('doc')
    req.__cut = true
    delete req.headers['accept-encoding']
    proxy.web(req, res, { target, selfHandleResponse: true })
    return
  }
  if (!isRsc) {
    if (
      req.headers['sec-fetch-dest'] === 'document' ||
      req.headers.accept?.includes('text/html')
    )
      count('doc')
    proxy.web(req, res, { target })
    return
  }
  count('rsc')
  switch (mode) {
    case '500':
      res.writeHead(500, { 'content-type': 'text/plain' })
      res.end('boom')
      return
    case 'html':
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<!DOCTYPE html><p>Please sign in</p>')
      return
    case 'drop':
      req.socket.destroy()
      return
    default:
      proxy.web(req, res, {
        target,
        selfHandleResponse: mode === 'strip' || mode === 'skew',
      })
  }
}).listen(proxyPort, () =>
  console.log(`break-refresh on ${proxyPort} -> ${nextPort}, mode ${mode}`)
)

proxy.on('proxyRes', (proxyRes, req, res) => {
  if (req.__cut) {
    const headers = { ...proxyRes.headers }
    delete headers['content-length']
    res.writeHead(proxyRes.statusCode, headers)
    let sent = 0
    proxyRes.on('data', (chunk) => {
      if (sent >= SHELL_BYTES) return
      const part = chunk.subarray(0, SHELL_BYTES - sent)
      sent += part.length
      res.write(part)
      if (sent >= SHELL_BYTES) {
        proxyRes.destroy()
        if (mode === 'cut-end') res.end()
        else res.socket.destroy()
      }
    })
    return
  }
  if (req.headers['rsc'] !== '1') return
  if (mode === 'strip') {
    // The unfixed fake CDN: the body arrives, the status line and headers don't.
    proxyRes.pipe(res)
  } else if (mode === 'skew') {
    // Claim the response came from another deployment.
    res.writeHead(proxyRes.statusCode, {
      ...proxyRes.headers,
      'x-nextjs-deployment-id': 'other-deployment',
    })
    proxyRes.pipe(res)
  }
})
