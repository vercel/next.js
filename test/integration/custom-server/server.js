const http = require('http')
const next = require('next')

const dev = process.env.NODE_ENV !== 'production'
const dir = __dirname
const port = process.env.PORT || 3000

const app = next({ dev, dir })
const handleNextRequests = app.getRequestHandler()

app.prepare().then(() => {
  const server = new http.Server((req, res) => {
    if (req.url === '/no-query') {
      return app.render(req, res, '/no-query')
    }

    if (/setAssetPrefix/.test(req.url)) {
      app.setAssetPrefix(`http://127.0.0.1:${port}`)
    } else if (/setEmptyAssetPrefix/.test(req.url)) {
      app.setAssetPrefix(null)
    } else {
      // This is to support multi-zones support in localhost
      // and may be in staging deployments
      app.setAssetPrefix('')
    }

    if (/test-index-hmr/.test(req.url)) {
      return app.render(req, res, '/index')
    }

    if (/dashboard/.test(req.url)) {
      return app.render(req, res, '/dashboard/index')
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
