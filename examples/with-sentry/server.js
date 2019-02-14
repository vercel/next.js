const next = require('next')
const express = require('express')
const cookieParser = require('cookie-parser')
const Sentry = require('@sentry/node')
const uuidv4 = require('uuid/v4')
const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

require('./utils/sentry')

app.prepare()
  .then(() => {
    const server = express()

    // This attaches request information to sentry errors
    server.use(Sentry.Handlers.requestHandler())

    server.use(cookieParser())

    server.use((req, res, next) => {
      const htmlPage =
        !req.path.match(/^\/(_next|static)/) &&
        !req.path.match(/\.(js|map)$/) &&
        req.accepts('text/html', 'text/css', 'image/png') === 'text/html'

      if (!htmlPage) {
        next()
        return
      }

      if (!req.cookies.sid || req.cookies.sid.length === 0) {
        req.cookies.sid = uuidv4()
        res.cookie('sid', req.cookies.sid)
      }

      next()
    })

    // In production we don't want to serve sourcemaps for anyone
    if (!dev) {
      const hasSentryToken = !!process.env.SENTRY_TOKEN
      server.get(/\.map$/, (req, res, next) => {
        if (hasSentryToken && req.headers['x-sentry-token'] !== process.env.SENTRY_TOKEN) {
          res
            .status(401)
            .send(
              'Authentication access token is required to access the source map.'
            )
          return
        }
        next()
      })
    }

    server.get('*', (req, res) => handle(req, res))

    // This handles errors if they are thrown before raching the app
    server.use(Sentry.Handlers.errorHandler())

    server.listen(port, err => {
      if (err) throw err
      console.log(`> Ready on http://localhost:${port}`)
    })
  })
