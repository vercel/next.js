const http = require('http')
const next = require('next')
const getPort = require('get-port')

const dev = process.env.NODE_ENV !== 'production'
const dir = __dirname

const app = next({ dev, dir })
const handleNextRequests = app.getRequestHandler()

async function main() {
  await app.prepare()
  const port = await getPort()

  const server = new http.Server((req, res) => {
    if (/setAssetPrefix/.test(req.url)) {
      app.setAssetPrefix(`http://127.0.0.1:${port}`)
    } else if (/setEmptyAssetPrefix/.test(req.url)) {
      app.setAssetPrefix('')
    } else {
      app.setAssetPrefix('')
    }

    handleNextRequests(req, res)
  })

  server.listen(port, () => {
    console.log(`- Local: http://localhost:${port}`)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
