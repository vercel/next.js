import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import getPort from 'get-port'
import { trace } from '@opentelemetry/api'

import { register } from './instrumentation-custom-server'
register()

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

  const tracer = trace.getTracer('custom-server', '1.0.0')

  createServer((req, res) => {
    // Create a local parent span to simulate custom server behavior
    tracer.startActiveSpan('custom-server-request', async (span) => {
      try {
        const parsedUrl = parse(req.url!, true)
        await handle(req, res, parsedUrl)
        span.end()
      } catch (err) {
        span.recordException(err as Error)
        span.end()
        res.statusCode = 500
        res.end('Internal Server Error')
      }
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
