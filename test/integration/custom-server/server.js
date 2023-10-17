if (process.env.POLYFILL_FETCH) {
  global.fetch = require('node-fetch').default
  global.Request = require('node-fetch').Request
  global.Headers = require('node-fetch').Headers
}

const { readFileSync } = require('fs')
const next = require('next')
const { join } = require('path')
const { parse } = require('url')

const dev = process.env.NODE_ENV !== 'production'
const dir = __dirname
const port = process.env.PORT || 3000
const { createServer } = require(process.env.USE_HTTPS === 'true'
  ? 'https'
  : 'http')

const app = next({ dev, hostname: 'localhost', port, dir })
const handleNextRequests = app.getRequestHandler()

const httpOptions = {
  key: readFileSync(join(__dirname, 'ssh/localhost-key.pem')),
  cert: readFileSync(join(__dirname, 'ssh/localhost.pem')),
}

process.on('unhandledRejection', (err) => {
  console.error('unhandledRejection:', err)
})

app.prepare().then(() => {
  const server = createServer(httpOptions, async (req, res) => {
    if (req.url === '/no-query') {
      return app.render(req, res, '/no-query')
    }

    if (req.url === '/unhandled-rejection') {
      Promise.reject(new Error('unhandled rejection'))
      return res.end('ok')
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
      return app.render(req, res, '/dashboard')
    }

    if (/static\/hello\.text/.test(req.url)) {
      return app.render(req, res, '/static/hello.text')
    }

    if (/no-slash/.test(req.url)) {
      try {
        await app.render(req, res, 'dashboard')
      } catch (err) {
        res.end(err.message)
      }
    }

    if (/custom-url-with-request-handler/.test(req.url)) {
      return handleNextRequests(req, res, parse('/dashboard', true))
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
