const express = require('express')
const next = require('next')
const accepts = require('accepts')

const app = next('.', { dev: true })
const handle = app.getRequestHandler()

app.prepare()
.then(() => {
  const server = express()

  server.use((req, res, next) => {
    const accept = accepts(req)
    const type = accept.type(['json', 'html'])
    if (type === 'json') {
      return handle(req, res)
    }
    next()
  })

  server.get('/a', (req, res) => {
    return app.render(req, res, '/b', req.query)
  })

  server.get('/b', (req, res) => {
    return app.render(req, res, '/a', req.query)
  })

  server.get('*', (req, res) => {
    return handle(req, res)
  })

  server.listen(3000, (err) => {
    if (err) throw err
    console.log('> Ready on http://localhost:3000')
  })
})
