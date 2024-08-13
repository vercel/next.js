const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const getPort = require('get-port')
const quiet = process.env.USE_QUIET === 'true'

async function main() {
  const port = await getPort()
  const hostname = 'localhost'
  // when using middleware `hostname` and `port` must be provided below
  const app = next({ hostname, port, quiet })
  const handle = app.getRequestHandler()

  app.prepare().then(() => {
    createServer(async (req, res) => {
      try {
        // Be sure to pass `true` as the second argument to `url.parse`.
        // This tells it to parse the query portion of the URL.
        const parsedUrl = parse(req.url, true)
        const { pathname, query } = parsedUrl

        if (pathname === '/a') {
          await app.render(req, res, '/a', query)
        } else if (pathname === '/b') {
          await app.render(req, res, '/page-b', query)
        } else if (pathname === '/error') {
          await app.render(req, res, '/page-error')
        } else {
          await handle(req, res, parsedUrl)
        }
      } catch (err) {
        console.error('Error occurred handling', req.url, err)
        res.statusCode = 500
        res.end('Internal Server Error')
      }
    }).listen(port, undefined, (err) => {
      if (err) throw err
      // Start mode
      console.log(`- Local: http://${hostname}:${port}`)
    })
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
