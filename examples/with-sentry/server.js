const next = require('next')
const express = require('express')
const cookieParser = require('cookie-parser')
const uuidv4 = require('uuid/v4')
const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handler = app.getRequestHandler()

function sessionCookie (req, res, next) {
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
}

const sourcemapsForSentryOnly = token => (req, res, next) => {
  // In production we only want to serve source maps for sentry
  if (!dev && !!token && req.headers['x-sentry-token'] !== token) {
    res
      .status(401)
      .send('Authentication access token is required to access the source map.')
    return
  }
  next()
}

app.prepare().then(() => {
  // The app.buildId is only available after app.prepare(), hence why we setup
  // here.
  const { Sentry } = require('./utils/sentry')(app.buildId)

  express()
    // This attaches request information to sentry errors
    .use(Sentry.Handlers.requestHandler())
    .use(cookieParser())
    .use(sessionCookie)
    .get(/\.map$/, sourcemapsForSentryOnly(process.env.SENTRY_TOKEN))
    // Regular next.js request handler
    .use(handler)
    // This handles errors if they are thrown before raching the app
    .use(Sentry.Handlers.errorHandler())
    .listen(port, err => {
      if (err) {
        throw err
      }
      // eslint-disable-next-line no-console
      console.log(`> Ready on http://localhost:${port}`)
    })
})
