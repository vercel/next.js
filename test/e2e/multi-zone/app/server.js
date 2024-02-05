const next = require('next')
const path = require('path')
const { parse } = require('url')
const http = require('http')

;(async () => {
  const requestHandlers = new Map()
  const dev = process.env.NODE_ENV !== 'production'

  for (const appName of ['host', 'guest']) {
    const appDir = path.join(__dirname, 'apps', appName)
    const nextApp = next({
      dir: appDir,
      dev,
    })

    await nextApp.prepare()
    const handler = nextApp.getRequestHandler()
    requestHandlers.set(appName, handler)
  }

  const server = http.createServer(async (req, res) => {
    const appName = req.url.startsWith('/guest') ? 'guest' : 'host'
    const handler = requestHandlers.get(appName)

    if (!handler) {
      res.statusCode = 404
      return res.end('not found')
    }

    try {
      await handler(req, res, parse(req.url, true))
    } catch (err) {
      console.error(err)
      res.statusCode = 500
      res.end('internal error')
    }
  })
  const parsedPort = Number(process.env.PORT)
  const port = !isNaN(parsedPort) ? parsedPort : 3000

  server.listen(port, () => {
    const actualPort = server.address().port
    console.log(` ▲ Next.js\n - Local: http://localhost:${actualPort}`)
    console.log(`- Next mode: ${dev ? 'development' : process.env.NODE_ENV}`)
  })
})()
