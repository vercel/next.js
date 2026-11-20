import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  getRouteRegex,
} = require('next/dist/shared/lib/router/utils/route-regex')
const {
  getRouteMatcher,
} = require('next/dist/shared/lib/router/utils/route-matcher')
const {
  getSortedRoutes,
} = require('next/dist/shared/lib/router/utils/sorted-routes')

// Go middleware hosting is not available in the released deployment builders.
// Invoke the emitted App Route entrypoints directly, as an adapter does, rather
// than passing through a second routing server or running middleware twice.
const { appRoutes } = JSON.parse(
  await readFile('security-outputs.json', 'utf8')
)
// Keep transport aliases with their entrypoint so a catch-all's .rsc alias
// cannot take precedence over a more specific application route.
const entrypoints = appRoutes.filter((route) => !route.id.endsWith('.rsc'))
const routes = getSortedRoutes(
  entrypoints.map((route) => route.pathname)
).flatMap((pathname) => {
  const { filePath } = entrypoints.find((route) => route.pathname === pathname)
  return appRoutes
    .filter((route) => route.filePath === filePath)
    .map((route) => ({
      match: getRouteMatcher(
        getRouteRegex(route.pathname, { includeSuffix: true })
      ),
      filePath,
    }))
})
const port = Number(process.env.PORT)
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname
    const route = routes.find((route) => route.match(pathname))
    if (!route) {
      res.statusCode = 404
      res.end('Not found')
      return
    }
    await require(route.filePath).handler(req, res, {})
  } catch (error) {
    console.error(error)
    res.statusCode = 500
    res.end('Handler failed')
  }
})
server.listen(port, '127.0.0.1', () => {
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Expected the adapter test server to listen on a TCP port')
  }
  console.log(`- Local: http://127.0.0.1:${address.port}`)
  console.log('Adapter server ready')
})
