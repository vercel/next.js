const http = require('http')
const next = require('next')
const getPort = require('get-port')

const { assetPrefix } = require('./next.config')

const dev = process.env.NODE_ENV !== 'production'
const dir = __dirname

function rewriteAssetPrefix(req) {
  if (assetPrefix) {
    req.url = req.url.replace(`${assetPrefix}/`, '')
  }
}

const app = next({ dev, dir })
const nextReqHandler = app.getRequestHandler()

async function main() {
  await app.prepare()
  const port = await getPort()

  const server = new http.Server((req, res) => {
    rewriteAssetPrefix(req)
    return nextReqHandler(req, res)
  })

  server.listen(port, () => {
    console.log(`- Local: http://localhost:${port}`)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
