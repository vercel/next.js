const polkadot = require('polkadot')
const next = require('next')

const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  polkadot(async (req, res) => {
    if (req.path.startsWith('/api/')) {
      if (!dev) {
        const buildId = require('fs').readFileSync('./.next/BUILD_ID')
        const callback = require('./.next/server/static/' +
          buildId +
          '/pages' +
          req.path).default
        return callback(req, res)
      } else {
        let callback
        try {
          callback = require('./.next/server/static/development/pages' +
            req.path).default
        } catch (err) {
          await handle(req, res)
          callback = require('./.next/server/static/development/pages' +
            req.path).default
        }
        return callback(req, res)
      }
    }
    if (req.path === '/a') {
      return app.render(req, res, '/a', req.query)
    }
    if (req.path === '/b') {
      return app.render(req, res, '/b', req.query)
    }
    return handle(req, res)
  }).listen(port, (err) => {
    if (err) throw err
    console.log(`> Ready on http://localhost:${port}`)
  })
})
