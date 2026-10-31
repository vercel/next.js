// A deliberately small reference host for this fixture, not another runner.
// Route tables and executable handlers both come from onBuildComplete.
const { createServer } = require('node:http')
const { readFileSync } = require('node:fs')
const { Readable } = require('node:stream')
const { resolveRoutes } = require(process.env.ROUTING_PACKAGE_PATH)
require('next/dist/server/node-environment')
const { outputs, routing, config } = JSON.parse(
  readFileSync('build-complete.json', 'utf8')
)
const buildId = readFileSync('.next/BUILD_ID', 'utf8').trim()
const executable = [
  ...outputs.pages,
  ...outputs.pagesApi,
  ...outputs.appPages,
  ...outputs.appRoutes,
].filter((output) => output.runtime === 'nodejs')
const server = createServer(async (req, res) => {
  try {
    const originalUrl = new URL(req.url, `http://${req.headers.host}`)
    const result = await resolveRoutes({
      url: originalUrl,
      buildId,
      basePath: config.basePath || '',
      i18n: config.i18n,
      headers: new Headers(
        Object.entries(req.headers).flatMap(([key, value]) =>
          Array.isArray(value)
            ? value.map((item) => [key, item])
            : value === undefined
              ? []
              : [[key, value]]
        )
      ),
      requestBody: Readable.toWeb(req),
      pathnames: executable.map((output) => output.pathname),
      routes: routing,
      // This fixture has no Proxy output.
      invokeMiddleware: async () => ({}),
    })
    res.setHeader('x-routing-host', 'routing-package-emitted-handler')
    if (result.resolvedHeaders)
      result.resolvedHeaders.forEach((value, key) => res.setHeader(key, value))
    if (result.redirect) {
      res
        .writeHead(result.redirect.status, {
          location: result.redirect.url.pathname + result.redirect.url.search,
        })
        .end()
      return
    }
    // Header-based redirects and other terminal routes return status +
    // resolvedHeaders instead of an executable invocation target.
    if (!result.resolvedPathname && result.status) {
      res.writeHead(result.status).end()
      return
    }
    const output = executable.find(
      (output) => output.pathname === result.resolvedPathname
    )
    if (!output) {
      res.writeHead(404).end('reference adapter not found')
      return
    }
    const target = result.invocationTarget
    if (target) {
      const query = new URLSearchParams()
      for (const [key, values] of Object.entries(target.query))
        for (const value of Array.isArray(values) ? values : [values])
          query.append(key, value)
      req.url = target.pathname + (query.size ? '?' + query : '')
    }
    const handler = require(output.filePath).handler
    if (typeof handler !== 'function')
      throw new Error(`No emitted handler for ${output.pathname}`)
    const pending = []
    await handler(req, res, { waitUntil: (work) => pending.push(work) })
    await Promise.all(pending)
  } catch (error) {
    console.error(error)
    if (!res.headersSent) res.statusCode = 500
    res.end('reference adapter failed')
  }
})
server.listen(0, '127.0.0.1', () =>
  process.send({ port: server.address().port })
)
process.on('message', (message) => {
  if (message === 'close') {
    server.closeAllConnections()
    server.close(() => process.disconnect())
  }
})
