const http = require('node:http')
const next = require('next')

const useTurbopack = process.env.TEST_NATIVE_ROUTE_DISCOVERY_TURBOPACK === '1'
const app = next({
  dir: __dirname,
  dev: true,
  ...(useTurbopack
    ? { turbopack: true }
    : process.env.NEXT_RSPACK
      ? {}
      : { webpack: true }),
})

async function main() {
  await app.prepare()
  const handle = app.getRequestHandler()
  // Exercise the internal presence query used by custom server/error handling.
  // The wrapper intentionally exposes no public hasPage method.
  const renderer = await app.server.getServer()
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost')
      if (url.pathname === '/__test_has_page') {
        const exists = await renderer.hasPage(url.searchParams.get('pathname'))
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(exists))
        return
      }
      await handle(req, res)
    } catch (error) {
      console.error(error)
      res.statusCode = 500
      res.end('Custom server failed')
    }
  })
  server.listen(Number(process.env.PORT || 3000), () => {
    console.log(`- Local: http://localhost:${server.address().port}`)
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
