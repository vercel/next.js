import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import path from 'path'
import getPort from 'get-port'
import { trace } from '@opentelemetry/api'

import { register } from './instrumentation-custom-server'

register()

type EntrypointHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  ctx: {
    waitUntil?: (prom: Promise<void>) => void
  }
) => Promise<unknown>

async function main() {
  const port = await getPort()
  const hostname = 'localhost'

  require('next/dist/server/node-environment')

  const entrypointPath = path.join(
    __dirname,
    '.next',
    'server',
    'app',
    'app',
    '[param]',
    'rsc-fetch',
    'page.js'
  )
  const { handler } = require(entrypointPath) as { handler: EntrypointHandler }

  const tracer = trace.getTracer('custom-entrypoint-server', '1.0.0')

  createServer((req, res) => {
    // Simulate a custom parent span around direct entrypoint invocation.
    tracer.startActiveSpan('custom-entrypoint-request', async (span) => {
      try {
        await handler(req, res, {
          waitUntil: () => {},
        })
      } catch (err) {
        span.recordException(err as Error)
        res.statusCode = 500
        res.end('Internal Server Error')
      } finally {
        span.end()
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
