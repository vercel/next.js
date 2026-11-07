import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import getPort from 'get-port'
import { trace } from '@opentelemetry/api'

import { register } from './instrumentation-custom-server'
register()

// A server span that ends when the response closes, the way
// `@opentelemetry/instrumentation-http` ends its incoming-request span, rather
// than when Next's request handler resolves. Any attribute set on it after it
// ended is reported on stdout.
const SET_AFTER_END = '[response-span] attribute set on an ended span'

async function main() {
  const port = await getPort()
  const hostname = 'localhost'

  const app = next({
    dev: process.env.NODE_ENV === 'development',
    hostname,
    port,
    dir: __dirname,
  })
  const handle = app.getRequestHandler()

  await app.prepare()

  const tracer = trace.getTracer('custom-server-response-span', '1.0.0')

  createServer((req, res) => {
    tracer.startActiveSpan('response-span-request', (span) => {
      let ended = false
      const setAttribute = span.setAttribute.bind(span)
      span.setAttribute = (key, value) => {
        if (ended) console.log(`${SET_AFTER_END}: ${key}`)
        return setAttribute(key, value)
      }
      res.on('close', () => {
        ended = true
        span.end()
      })
      handle(req, res, parse(req.url!, true)).catch((err) => {
        span.recordException(err as Error)
        res.statusCode = 500
        res.end('Internal Server Error')
      })
    })
  }).listen(port, undefined, (err?: Error) => {
    if (err) throw err
    console.log(`- Local: http://${hostname}:${port}`)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
