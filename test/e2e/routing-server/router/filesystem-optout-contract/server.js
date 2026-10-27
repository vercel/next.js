const { createServer } = require('node:http')
const { parse } = require('node:url')
const next = require('next')

async function main() {
  const app = next({
    dev: process.env.NODE_ENV !== 'production',
    dir: __dirname,
    webpack: process.env.ROUTING_TEST_WEBPACK === 'true',
  })
  await app.prepare()
  const handle = app.getRequestHandler()

  const server = createServer(async (request, response) => {
    const parsed = parse(request.url, true)
    try {
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
