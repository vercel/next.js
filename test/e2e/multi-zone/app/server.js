const next = require('next')
const path = require('path')
const { parse } = require('url')
const http = require('http')

;(async () => {
  const requestHandlers = new Map()
  const upgradeHandlers = new Map()
  const nextApps = new Map()
  let upgradeDispatcherInstalled = false
  const dev = process.env.NODE_ENV !== 'production'

  for (const appName of ['host', 'guest']) {
    const appDir = path.join(__dirname, 'apps', appName)
    const nextApp = next({
      dir: appDir,
      dev,
    })

    await nextApp.prepare()
    const handler = nextApp.getRequestHandler()
    nextApps.set(appName, nextApp)
    requestHandlers.set(appName, handler)
  }

  const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/__enable-upgrade-dispatcher') {
      if (!upgradeDispatcherInstalled) {
        for (const [appName, nextApp] of nextApps) {
          upgradeHandlers.set(appName, nextApp.getUpgradeHandler())
        }
        server.on('upgrade', dispatchUpgrade)
        upgradeDispatcherInstalled = true
      }
      res.statusCode = 204
      return res.end()
    }

    const closeMatch = req.url.match(/^\/__close\/(host|guest)$/)
    if (req.method === 'POST' && closeMatch) {
      await nextApps.get(closeMatch[1]).close()
      res.statusCode = 204
      return res.end()
    }

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
  const dispatchUpgrade = (req, socket, head) => {
    const appName = req.url.startsWith('/guest') ? 'guest' : 'host'
    const handler = upgradeHandlers.get(appName)

    if (!handler) {
      return socket.destroy()
    }

    void handler(req, socket, head).catch((err) => {
      console.error(err)
      socket.destroy()
    })
  }
  const parsedPort = Number(process.env.PORT)
  const port = !isNaN(parsedPort) ? parsedPort : 3000

  server.listen(port, () => {
    const actualPort = server.address().port
    console.log(` ▲ Next.js\n - Local: http://localhost:${actualPort}`)
    console.log(`- Next mode: ${dev ? 'development' : process.env.NODE_ENV}`)
  })
})()
