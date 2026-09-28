const http = require('http')
const { once } = require('events')
const next = require('next')

const app = next({ dev: true, dir: __dirname })
const handle = app.getRequestHandler()
const port = Number(process.env.PORT || 3000)

app.prepare().then(() => {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url?.startsWith('/app/static-indicator/')) {
      const consumed = once(req, 'end')
      req.resume()
      await consumed
    }

    await handle(req, res)
  })

  server.listen(port, () => {
    const address = server.address()
    console.log(`- Local: http://localhost:${address.port}`)
  })
})
