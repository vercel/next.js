const { createServer } = require('node:http')
const { parse } = require('node:url')
const next = require('next')

async function main() {
  const dev = process.env.NODE_ENV !== 'production'
  const app = next({
    dev,
    dir: __dirname,
    webpack: process.env.ROUTING_TEST_WEBPACK === 'true',
  })
  await app.prepare()
  // The production inner server reads built manifests without an outer
  // fsChecker. Dev needs the compiler service owned by the normal router.
  const inner = dev
    ? undefined
    : next({ dev: false, dir: __dirname, customServer: false })
  await inner?.prepare()
  const handle = app.getRequestHandler()

  const server = createServer(async (request, response) => {
    const parsed = parse(request.url, true)
    try {
      if (parsed.pathname.startsWith('/direct/')) {
        response.setHeader(
          'x-routing-host',
          inner ? 'inner-render' : 'custom-render-forwarding'
        )
        return await (inner || app).render(
          request,
          response,
          inner
            ? parsed.pathname.slice('/direct'.length)
            : parsed.pathname.replace('/direct/catalog/', '/mapped-catalog/'),
          parsed.query
        )
      }
      response.setHeader('x-routing-host', 'outer-router')
      await handle(request, response, parsed)
    } catch (error) {
      console.error(error)
      response.statusCode = 500
      response.end('custom server failed')
    }
  })

  server.listen(Number(process.env.PORT || 0), () => {
    const { port } = server.address()
    console.log(`- Local: http://localhost:${port}`)
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
