// Local proxy server used by react-virtualized.test.ts to introduce
// per-request stalls and count cancelled image requests. The script is run
// inside the isolated test directory so `http-proxy` can be installed via the
// `dependencies` option of `nextTestSetup`. The test process communicates
// with this server via the `_test/cancel-count` and `_test/wait-ms` endpoints.
const http = require('http')
const httpProxy = require('http-proxy')

const target = process.argv[2]
const port = Number(process.argv[3] || 0)
const stallMs = Number(process.argv[4] || 3000)

if (!target) {
  console.error('usage: node server.js <target> [port] [stallMs]')
  process.exit(1)
}

let cancelCount = 0
const proxy = httpProxy.createProxyServer({ target })

const server = http.createServer(async (req, res) => {
  if (req.url === '/_test/cancel-count') {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ cancelCount }))
    return
  }

  if (req.url.startsWith('/_next/image')) {
    let isComplete = false
    req.on('close', () => {
      if (!isComplete) cancelCount++
    })
    await new Promise((resolve) => setTimeout(resolve, stallMs))
    isComplete = true
  }

  proxy.web(req, res)
})

proxy.on('error', (err) => {
  console.warn('Failed to proxy', err)
})

server.listen(port, () => {
  const address = server.address()
  // Print the actual bound port as the first line so the test process can
  // pick it up regardless of whether port 0 was passed in.
  process.stdout.write(`__PORT__:${address.port}\n`)
})
