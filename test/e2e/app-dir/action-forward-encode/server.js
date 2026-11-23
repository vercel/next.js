const http = require('http')
const next = require('next')
const getPort = require('get-port')

// A strict front end such as an AWS Lambda function URL answers 400 to request
// paths that still contain literal brackets. Running Next.js behind this server
// puts the strict check on the same origin that forwarded Server Actions use.
async function main() {
  const dev = process.env.NEXT_TEST_MODE === 'dev'
  process.env.NODE_ENV = dev ? 'development' : 'production'

  const port = await getPort()
  const app = next({ dev, hostname: 'localhost', port })
  const handle = app.getRequestHandler()
  await app.prepare()

  const seenPostPaths = []

  const server = http.createServer((req, res) => {
    const url = req.url || ''

    if (url === '/__seen-posts') {
      if (req.method === 'DELETE') {
        seenPostPaths.length = 0
        res.end('ok')
        return
      }
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(seenPostPaths))
      return
    }

    if (/[\[\]]/.test(url)) {
      res.statusCode = 400
      res.end('bad path')
      return
    }

    if (req.method === 'POST') {
      seenPostPaths.push(url)
    }

    handle(req, res)
  })

  server.on('upgrade', app.getUpgradeHandler())

  server.listen(port, () => {
    console.log(`- Local: http://localhost:${port}`)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
