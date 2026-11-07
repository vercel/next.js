// Serves the built app from a `NextServer` in minimal mode, the way a
// deployment adapter does, without the router of `next start` in front of it.
process.env.NODE_ENV = 'production'

const http = require('http')
const NextServer = require('next/dist/server/next-server').default
const { config } = require('./.next/required-server-files.json')

const port = Number(process.env.PORT)
const nextServer = new NextServer({
  conf: config,
  dir: process.cwd(),
  minimalMode: true,
  customServer: false,
})
const handler = nextServer.getRequestHandler()
const appPathRoutes = nextServer.appPathRoutes

// The server lists the keys of `appPathRoutes` each time it builds its route
// definitions. Count how often it does.
let routeEnumerations = 0
function countEnumerations(routes) {
  return new Proxy(routes, {
    ownKeys(target) {
      routeEnumerations++
      return Reflect.ownKeys(target)
    },
  })
}
nextServer.appPathRoutes = countEnumerations(appPathRoutes)

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')

    // `next dev` assigns a new `appPathRoutes` to the server when app files
    // are added or removed. Do the same here, leaving out `without`.
    if (url.pathname === '/_test/app-path-routes') {
      const without = url.searchParams.get('without')
      nextServer.appPathRoutes = countEnumerations(
        Object.fromEntries(
          Object.entries(appPathRoutes).filter(
            ([pathname]) => pathname !== without
          )
        )
      )
      res.end('ok')
      return
    }

    if (url.pathname === '/_test/route-enumerations') {
      res.end(String(routeEnumerations))
      return
    }

    return handler(req, res)
  })
  .listen(port, () => {
    console.log('- Local: http://localhost:' + port)
    console.log('Minimal server ready')
  })
