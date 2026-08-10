// Local proxy server used by preload-viewport.test.ts. The script lives inside
// the isolated test directory so `http-proxy` can be installed via the
// `dependencies` option of `nextTestSetup`. The test process communicates with
// this server via the `_test/data-requests` and `_test/stall` endpoints.
const http = require('http')
const httpProxy = require('http-proxy')

const target = process.argv[2]
const port = Number(process.argv[3] || 0)

if (!target) {
  console.error('usage: node server.js <target> [port]')
  process.exit(1)
}

let stallJs = false
const nextDataRequests = []
const proxy = httpProxy.createProxyServer({ target })

const server = http.createServer(async (req, res) => {
  if (req.url === '/_test/data-requests') {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ nextDataRequests }))
    return
  }
  if (req.url === '/_test/data-requests/reset') {
    nextDataRequests.length = 0
    res.end('ok')
    return
  }
  if (req.url === '/_test/stall/on') {
    stallJs = true
    res.end('ok')
    return
  }
  if (req.url === '/_test/stall/off') {
    stallJs = false
    res.end('ok')
    return
  }

  if (stallJs && req.url.includes('chunks/pages/another')) {
    await new Promise((resolve) => setTimeout(resolve, 5 * 1000))
  }
  if (req.url.startsWith('/_next/data')) {
    nextDataRequests.push(req.url)
  }
  proxy.web(req, res)
})

proxy.on('error', (err) => {
  console.warn('Failed to proxy', err)
})

server.listen(port, () => {
  const address = server.address()
  process.stdout.write(`__PORT__:${address.port}\n`)
})
