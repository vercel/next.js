const http = require('http')
const { parse } = require('url')
const next = require('next')

async function main() {
  const dev = process.env.NEXT_TEST_MODE === 'dev'
  process.env.NODE_ENV = dev ? 'development' : 'production'

  const port = await new Promise((resolve) => {
    const server = http.createServer(() => {})
    server
      .on('listening', () => {
        const freePort = server.address().port
        server.close()
        process.nextTick(() => {
          resolve(freePort)
        })
      })
      .listen(0)
  })

  const app = next({ dev, port })
  const handle = app.getRequestHandler()

  await app.prepare()

  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true)
      const { pathname, query } = parsedUrl

      if (pathname.startsWith('/render')) {
        await app.render(req, res, pathname, query)
      } else {
        await handle(req, res, parsedUrl)
      }
    } catch (err) {
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  })

  server.once('error', (err) => {
    console.error(err)
    process.exit(1)
  })

  server.listen(port, () => {
    console.log(
      `> started server on url: http://localhost:${port} as ${
        dev ? 'development' : process.env.NODE_ENV
      }`
    )
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
