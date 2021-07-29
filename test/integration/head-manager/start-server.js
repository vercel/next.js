const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')

const dev = process.env.NODE_ENV !== 'production'
const dir = __dirname
const app = next({ dev, dir })
const handle = app.getRequestHandler()

export const startServer = (port, includeCsp) =>
  app.prepare().then(() =>
    createServer((req, res) => {
      const parsedUrl = parse(req.url, true)

      if (includeCsp) {
        res.setHeader(
          'Content-Security-Policy',
          "script-src 'nonce-abc123' 'unsafe-eval'"
        )
      }

      handle(req, res, parsedUrl)
    }).listen(port, (err) => {
      if (err) throw err
      console.log(`> Ready on http://localhost:${port}`)
    })
  )
