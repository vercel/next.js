const express = require('express')
const next = require('next')
const vhost = require('vhost')

const port = process.env.PORT || 3000
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const mainServer = express()
  const adminServer = express()
  const memberServer = express()

  adminServer.get('/', (req, res) => {
    return app.render(req, res, '/admin', req.query)
  })

  adminServer.get('/*', (req, res) => {
    return app.render(req, res, `/admin${req.path}`, req.query)
  })

  adminServer.all('*', (req, res) => {
    return handle(req, res)
  })

  memberServer.get('/', (req, res) => {
    return app.render(req, res, '/member', req.query)
  })

  memberServer.get('/*', (req, res) => {
    return app.render(req, res, `/member${req.path}`, req.query)
  })

  memberServer.all('*', (req, res) => {
    return handle(req, res)
  })

  mainServer.use(vhost('admin.lvh.me', adminServer))
  mainServer.use(vhost('lvh.me', memberServer))
  mainServer.use(vhost('www.lvh.me', memberServer))
  mainServer.listen(port, (err) => {
    if (err) throw err

    console.log(`> Ready on http://lvh.me:${port}`)
  })
})
