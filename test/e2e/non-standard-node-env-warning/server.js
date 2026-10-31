const http = require('http')
const next = require('next')
const getPort = require('get-port')

const dev = process.env.NODE_ENV !== 'production'
const dir = __dirname

async function main() {
  const port = await getPort()
  const app = next({ dev, dir })
  const handleNextRequests = app.getRequestHandler()

  await app.prepare()

  const server = new http.Server(async (req, res) => {
    handleNextRequests(req, res)
  })

  server.listen(port, (err) => {
    if (err) {
      throw err
    }

    console.log(`- Local: http://localhost:${port}`)
  })
}

main()
