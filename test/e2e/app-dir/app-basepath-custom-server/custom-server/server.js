const http = require('http')
const { parse } = require('url')
const next = require('next')
const getPort = require('get-port')

async function main() {
  const dev = process.env.NEXT_TEST_MODE === 'dev'
  process.env.NODE_ENV = dev ? 'development' : 'production'

  const port = await getPort()

  const app = next({ dev, port })
  const handle = app.getRequestHandler()

  await app.prepare()

  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true)
      const { pathname } = parsedUrl
      res.setHeader(
        'set-cookie',
        'custom-server-test-cookie=custom-server-test-cookie-val'
      )
      if (pathname.startsWith('/base')) {
        await handle(req, res, parsedUrl)
      } else {
        res.end()
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
    console.log(`- Local: http://localhost:${port}`)
    console.log(`- Next mode: ${dev ? 'development' : process.env.NODE_ENV}`)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
