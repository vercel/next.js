const express = require('express')
const next = require('next')

const __PORT__ = process.env.PORT || 3000
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = express()

  server.get('/user/:id', (req, res) => {
    const { params } = req

    return app.render(req, res, '/user', { ...req.query, ...params })
  })

  server.get('*', (req, res) => handle(req, res))

  server.listen(__PORT__, err => {
    if (err) throw err
    console.error(`> Ready on http://localhost:${__PORT__}`)
  })
})
