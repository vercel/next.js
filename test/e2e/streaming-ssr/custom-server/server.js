const next = require('next')
const http = require('http')

const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'

const app = next({ dev })

process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))

app.prepare().then(() => {
  const handler = app.getRequestHandler()
  const server = http.createServer(async (req, res) => {
    try {
      await handler(req, res)
    } catch (err) {
      console.error(err)
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  })

  server.listen(port, (err) => {
    if (err) {
      console.error('Failed to start server', err)
      process.exit(1)
    }
    console.log('Listening on port', port)
  })
})
