// @ts-check

if (process.env.POLYFILL_FETCH) {
  // @ts-expect-error
  global.fetch = require('node-fetch').default
  // @ts-expect-error
  global.Request = require('node-fetch').Request
  // @ts-expect-error
  global.Headers = require('node-fetch').Headers
}

const { readFileSync } = require('fs')

/** @type {import('next').default} */
// @ts-ignore: missing interopDefault
const next = require('next')

const { join } = require('path')
const { parse } = require('url')

const dev = process.env.NODE_ENV !== 'production'
const dir = __dirname
const port =
  (process.env.PORT ? Number.parseInt(process.env.PORT) : undefined) || 3000
const { createServer } = require(
  process.env.USE_HTTPS === 'true' ? 'https' : 'http'
)

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
    // let next.js handle assets from /_next/
    if (/\/_next\//.test(req.url)) {
      return handleNextRequests(req, res)
    }

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
      app.setAssetPrefix('')
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

    if (/legacy-methods\/render-to-html/.test(req.url)) {
      try {
        const html = await app.renderToHTML(req, res, '/dynamic-dashboard', {
          q: '1',
        })
        res.end(html)
      } catch (err) {
        res.end(err.message)
      }
      return
    }

    if (/legacy-methods\/render404/.test(req.url)) {
      try {
        await app.render404(req, res, parse('/__non_existent__?q=1', true))
      } catch (err) {
        res.end(err.message)
      }
      return
    }

    if (/legacy-methods\/render-error/.test(req.url)) {
      try {
        res.statusCode = 500
        await app.renderError(new Error('kaboom'), req, res, '/dashboard', {
          q: '1',
        })
      } catch (err) {
        res.end(err.message)
      }
      return
    }

    if (/legacy-methods\/render-error-to-html/.test(req.url)) {
      try {
        res.statusCode = 500
        const html = await app.renderErrorToHTML(
          new Error('kaboom'),
          req,
          res,
          '/dashboard',
          { q: '1' }
        )
        res.end(html)
      } catch (err) {
        res.end(err.message)
      }
      return
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
