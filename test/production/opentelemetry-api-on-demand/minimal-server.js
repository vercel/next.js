// Serves the routes without `next start`: it loads the server entry of a route
// on the first request for it and calls its handler.
const http = require('node:http')
const path = require('node:path')

require('next/dist/build/adapter/setup-node-env.external')

const entries = {
  '/': 'pages/index.js',
  '/api/loaded-modules': 'pages/api/loaded-modules.js',
  '/api/tracing': 'pages/api/tracing.js',
  '/dynamic-page': 'app/dynamic-page/page.js',
  '/route-handler': 'app/route-handler/route.js',
}

const server = http.createServer((req, res) => {
  const entry = entries[req.url]
  if (!entry) {
    res.statusCode = 404
    res.end()
    return
  }

  const route = require(path.join(__dirname, '.next/server', entry))
  Promise.resolve(route.handler(req, res, { waitUntil() {} })).catch(
    (error) => {
      console.error(error)
      if (!res.writableEnded) {
        res.statusCode = 500
        res.end('Internal Server Error')
      }
    }
  )
})

server.listen(Number(process.env.PORT), () => {
  console.log(`- Local: http://localhost:${server.address().port}`)
  console.log('minimal server ready')
})
