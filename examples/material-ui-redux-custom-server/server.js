const express = require('express')
const next = require('next')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })

const routes = require('./routes')
const handle = routes.getRequestHandler(app)

app.prepare().then(() => {
  const server = express()
  const router = express.Router()

  router.get('/:sortBy?/', (req, res) => {
    return app.render(req, res, '/index', req)
  })

  router.get('*', (req, res) => {
    return handle(req, res)
  })

  // use next routes
  server.use(handle)

  server.listen(3000, err => {
    if (err) {
      throw err
    }
    console.log(`> Ready on http://localhost:3000`)
  })
})
