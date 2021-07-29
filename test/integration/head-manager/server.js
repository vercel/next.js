const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')

const dev = process.env.NODE_ENV !== 'production'
const dir = __dirname
const app = next({ dev, dir })
const handle = app.getRequestHandler()

const { PORT, INCLUDE_CSP } = process.env

app.prepare().then(() => {
  createServer((req, res) => {
    // Be sure to pass `true` as the second argument to `url.parse`.
    // This tells it to parse the query portion of the URL.
    const parsedUrl = parse(req.url, true)

    if (INCLUDE_CSP) {
      res.setHeader(
        'Content-Security-Policy',
        "script-src 'nonce-abc123' 'unsafe-eval'"
      )
    }

    handle(req, res, parsedUrl)
  }).listen(PORT, (err) => {
    if (err) throw err
    console.log(`> Ready on http://localhost:${PORT}`)
  })
})
