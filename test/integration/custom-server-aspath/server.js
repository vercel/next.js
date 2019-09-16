const http = require('http')
const next = require('next')

const dev = process.env.NODE_ENV !== 'production'
const port = process.env.PORT || 3000
const dir = __dirname

const app = next({ dev, dir })
const handleNextRequests = app.getRequestHandler()

app.prepare().then(() => {
  const server = new http.Server((req, res) => {
    switch (req.url) {
      case '/a':
        return app.render(req, res, '/b')
      case '/b':
        return app.render(req, res, '/a')
      case '/d':
        return app.render(req, res, '/c')
    }
    handleNextRequests(req, res)
  })

  server.listen(port, err => {
    if (err) {
      throw err
    }
    console.log(`> Ready on http://localhost:${port}`)
  })
})
