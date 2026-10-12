const http = require('http')
const { once } = require('events')
const next = require('next')

const app = next({ dev: true, dir: __dirname })
const handle = app.getRequestHandler()
const port = Number(process.env.PORT || 3000)
let gateResponse

app.prepare().then(() => {
  const server = http.createServer(async (req, res) => {
    if (req.url?.startsWith('/__gate/')) {
      gateResponse = res
      return
    }
    if (req.url === '/__gate-arrived') {
      res.writeHead(gateResponse ? 200 : 425).end()
      return
    }
    if (req.url === '/__release-gate') {
      gateResponse?.end('released')
      gateResponse = undefined
      res.end('released')
      return
    }

    if (req.method === 'GET' && req.url?.startsWith('/app/static-indicator/')) {
      const consumed = once(req, 'end')
      req.resume()
      await consumed
    }

    await handle(req, res)
  })

  server.listen(port, () => {
    const address = server.address()
    process.env.DEV_INDICATOR_GATE_ORIGIN = `http://localhost:${address.port}`
    console.log(`- Local: http://localhost:${address.port}`)
  })
})
