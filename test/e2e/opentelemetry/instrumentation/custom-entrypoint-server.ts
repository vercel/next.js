import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import path from 'path'
import { parse } from 'url'
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

function loadEntrypointHandler(pathParts: string[]): EntrypointHandler {
  const entrypointPath = path.join(__dirname, '.next', 'server', ...pathParts)
  const mod = require(entrypointPath) as { handler?: EntrypointHandler }
  if (typeof mod.handler !== 'function') {
    throw new Error(`Entrypoint handler missing at ${entrypointPath}`)
  }
  return mod.handler
}

async function main() {
  const port = await getPort()
  const hostname = 'localhost'

  require('next/dist/server/node-environment')

  const appPageHandler = loadEntrypointHandler([
    'app',
    'app',
    '[param]',
    'rsc-fetch',
    'page.js',
  ])

  const tracer = trace.getTracer('custom-entrypoint-server', '1.0.0')

  const resolveHandler = (pathname: string): EntrypointHandler | undefined => {
    if (pathname.startsWith('/app/')) return appPageHandler
    return undefined
  }

  createServer((req, res) => {
    const method = req.method || 'GET'
    const pathname = parse(req.url || '/', false).pathname || '/'
    const handler = resolveHandler(pathname)

    if (!handler) {
      res.statusCode = 404
      res.end('Not Found')
      return
    }

    // Simulate a custom parent span around direct entrypoint invocation.
    tracer.startActiveSpan(method, async (span) => {
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
