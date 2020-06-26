const polkadot = require('polkadot');
const next = require('next')

const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  polkadot(async (req, res) => {
    if (req.path === '/a') {
      return app.render(req, res, '/a', req.query)
    } else if (req.path === '/b') {
      return app.render(req, res, '/b', req.query)
    }
    return handle(req, res)
  }).listen(port, (err) => {
    if (err) throw err
    console.log(`> Ready on http://localhost:${port}`)
  })
})
