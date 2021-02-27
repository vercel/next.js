const http = require('http')
const next = require('next')

const dev = process.env.NODE_ENV !== 'production'
const dir = __dirname
const port = process.env.PORT || 3000

const app = next({
  dev,
  dir,
  logger: (err) => {
    console.error('custom logger:', err)
  },
})
const handleNextRequests = app.getRequestHandler()

app.prepare().then(() => {
  const server = new http.Server(async (req, res) => {
    if (/index/.test(req.url)) {
      return app.render(req, res, '/index')
    }

    handleNextRequests(req, res)
  })

  server.listen(port, (err) => {
    if (err) {
      throw err
    }

    console.log(`> Ready on http://localhost:${port}`)
  })
})
