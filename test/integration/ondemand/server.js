const http = require('http')
const next = require('next')

const { assetPrefix } = require('./next.config')

const dev = process.env.NODE_ENV !== 'production'
const dir = __dirname
const port = process.env.PORT || 3000

function rewriteAssetPrefix(req) {
  if (assetPrefix) {
    req.url = req.url.replace(`${assetPrefix}/`, '')
  }
}

const app = next({ dev, dir })
const nextReqHandler = app.getRequestHandler()

app.prepare().then(() => {
  const server = new http.Server((req, res) => {
    rewriteAssetPrefix(req)

    return nextReqHandler(req, res)
  })

  server.listen(port, (err) => {
    if (err) {
      throw err
    }

    console.log(`> Ready on http://localhost:${port}`)
  })
})
