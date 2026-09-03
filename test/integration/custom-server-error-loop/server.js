const express = require('express')
const next = require('next')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev, dir: __dirname })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = express()

  // Route that renders the error page — triggers the reload loop
  server.get('/trigger-error', (req, res) => {
    return app.render(req, res, '/_error', { statusCode: 404 })
  })

  // Route that uses renderError — also triggers the loop
  server.get('/render-error', (req, res) => {
    return app.renderError(null, req, res, '/', {})
  })

  // All other routes handled normally
  server.all('*', (req, res) => {
    return handle(req, res)
  })

  server.listen(3000, () => {
    console.log('> Ready on http://localhost:3000')
    console.log('> Test: http://localhost:3000/trigger-error')
    console.log('> Test: http://localhost:3000/render-error')
  })
})
