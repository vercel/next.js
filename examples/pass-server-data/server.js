const express = require('express')
const next = require('next')
const itemRoute = require('./routes/item')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = express()

  // Set up home page as a simple render of the page.
  server.get('/', (req, res) => {
    console.log('Render home page')
    return app.render(req, res, '/', req.query)
  })

  // We have more complex logic here so we've isolated this code into a route file.
  server.get('/item', itemRoute.getItemRenderer(app))

  // Fall-back on other next.js assets.
  server.get('*', (req, res) => {
    return handle(req, res)
  })

  server.listen(3000, (err) => {
    if (err) throw err
    console.log('> Ready on http://localhost:3000')
  })
})
