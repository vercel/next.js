// Serves the routes without `next start`: it loads the server entry of a route
// on the first request for it and calls its handler.
const http = require('node:http')
const path = require('node:path')

// Counts how often this process evaluates the OpenTelemetry API, as a file or
// as a copy that is bundled into a chunk: every copy creates this context key
// when it is evaluated.
let apiEvaluations = 0
const symbolFor = Symbol.for
Symbol.for = function (key) {
  if (key === 'OpenTelemetry Context Key SPAN') {
    apiEvaluations++
  }
  return symbolFor.call(Symbol, key)
}

require('next/dist/build/adapter/setup-node-env.external')

const entries = {
  '/': 'pages/index.js',
  '/api/loaded-modules': 'pages/api/loaded-modules.js',
  '/api/tracing': 'pages/api/tracing.js',
  '/dynamic-page': 'app/dynamic-page/page.js',
  '/route-handler': 'app/route-handler/route.js',
}

const requireEntry = (entry) =>
  require(path.join(__dirname, '.next/server', entry))

if (process.env.REGISTER_TRACER_PROVIDER) {
  // What `next start` does for an app that sets up tracing in `register()` of
  // its instrumentation file: a tracer provider is registered, then the server
  // loads the entries of all routes, before the first request.
  const { trace, ProxyTracerProvider } = require('@opentelemetry/api')
  trace.setGlobalTracerProvider(new ProxyTracerProvider())
  Object.values(entries).forEach(requireEntry)
}

const server = http.createServer((req, res) => {
  if (req.url === '/api-evaluations') {
    res.setHeader('content-type', 'application/json')
    res.end(String(apiEvaluations))
    return
  }

  const entry = entries[req.url]
  if (!entry) {
    res.statusCode = 404
    res.end()
    return
  }

  const route = requireEntry(entry)
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
