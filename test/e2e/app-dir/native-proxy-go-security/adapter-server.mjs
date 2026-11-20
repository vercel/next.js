import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
require('next/dist/server/node-environment')
const {
  getRouteRegex,
} = require('next/dist/shared/lib/router/utils/route-regex')
const {
  getRouteMatcher,
} = require('next/dist/shared/lib/router/utils/route-matcher')
const {
  getSortedRoutes,
} = require('next/dist/shared/lib/router/utils/sorted-routes')
const { run } = require('next/dist/server/web/sandbox')
const { getCloneableBody } = require('next/dist/server/body-streams')
const {
  signalFromNodeResponse,
} = require('next/dist/server/web/spec-extension/adapters/next-request')

// Go middleware hosting is not available in the released deployment builders.
// Invoke the emitted App Route entrypoints directly, as an adapter does, rather
// than passing through a second routing server or running middleware twice.
const { appRoutes, distDir } = JSON.parse(
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
      output: route,
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

    const { output } = route
    if (output.runtime === 'edge') {
      const result = await run({
        distDir,
        name: output.id,
        paths: Object.values(output.assets),
        edgeFunctionEntry: {
          assets: [],
          wasm: [],
          env: output.config.env || {},
        },
        request: {
          headers: req.headers,
          method: req.method,
          nextConfig: { basePath: '/docs', trailingSlash: false },
          url: new URL(req.url, 'http://localhost').toString(),
          body: getCloneableBody(req),
          signal: signalFromNodeResponse(res),
          waitUntil: () => {},
        },
        useCache: true,
        clientAssetToken: '',
      })

      res.statusCode = result.response.status
      res.statusMessage = result.response.statusText
      result.response.headers.forEach((value, key) => {
        res.setHeader(key, value)
      })
      res.end(Buffer.from(await result.response.arrayBuffer()))
      return
    }

    await require(output.filePath).handler(req, res, {})
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
