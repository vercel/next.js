const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const getPort = require('get-port')
const { trace } = require('@opentelemetry/api')

// A custom server that wraps every request in an active host span, like an
// APM's HTTP instrumentation does. The tracer provider is the one
// `instrumentation.ts` registers (with the span recorder) during `prepare()`.
async function main() {
  const hostname = 'localhost'
  const port = await getPort()
  const app = next({
    dev: process.env.NODE_ENV === 'development',
    hostname,
    port,
    dir: __dirname,
  })
  const handle = app.getRequestHandler()
  await app.prepare()

  const tracer = trace.getTracer('custom-server')
  createServer((req, res) => {
    tracer.startActiveSpan('custom-server-request', async (span) => {
      try {
        await handle(req, res, parse(req.url ?? '/', true))
      } catch (err) {
        span.recordException(err)
        res.statusCode = 500
        res.end('Internal Server Error')
      } finally {
        span.end()
      }
    })
  }).listen(port, hostname, () => {
    console.log(`- Local: http://${hostname}:${port}`)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
