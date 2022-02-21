const http = require('http')
const url = require('url')
const next = require('next')

const hostname = 'localhost'
const port = 3000
// when using middleware `hostname` and `port` must be provided below
const app = next({ dir: __dirname, dev: false, hostname, port })

const handle = app.getRequestHandler()

const server = http.createServer(async (req, res) => {
  let { pathname } = url.parse(req.url)
  pathname = pathname.replace(/\/$/, '')

  // Add artificial delay to simulate slow css loading
  if (pathname.startsWith('/_next/static/')) {
    let prom = Promise.resolve()
    if (pathname.endsWith('.css')) {
      prom = new Promise((resolve) => setTimeout(resolve, 20000))
    }
    return prom.then(() => handle(req, res))
  }

  await handle(req, res)
})

server.listen(process.env.PORT, () => {
  console.log('ready on', process.env.PORT)
})
