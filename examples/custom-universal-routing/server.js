const { createServer } = require('http')
const { parse } = require('url')

const next = require('next')
const nextConfig = require('./next.config')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare()
  .then(() => {
    createServer((req, res) => {
      const { pathname, query } = parse(req.url, true)

      const match = nextConfig.customRoutes.find((definition) => {
        return pathname.match(definition.test)
      })

      if (match) {
        app.render(req, res, match.routeTo, query)
      } else {
        handle(req, res)
      }
    })
    .listen(3000, (err) => {
      if (err) throw err
      console.log('> Ready on http://localhost:3000')
    })
  })
