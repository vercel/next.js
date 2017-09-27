const express = require('express')
const next = require('next')

const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

const config = require('./next.config')

app.prepare()
.then(() => {
  const server = express()

  server.get(config.assetPrefix, (req, res) => {
    return app.render(req, res, '/', req.query)
  })

  server.use(config.assetPrefix, (req, res) => {
    return handle(req, res)
  })

  server.listen(port, (err) => {
    if (err) throw err
    console.log(`> Ready on http://localhost:${port}`)
  })
})
