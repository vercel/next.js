import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import path from 'path'
import { parse } from 'url'
import getPort from 'get-port'
import { trace } from '@opentelemetry/api'

import { register } from './instrumentation-custom-server'

const withoutParentSpan = process.argv.includes('--without-parent-span')

if (!withoutParentSpan) {
  register()
}

type EntrypointHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  ctx: {
    waitUntil?: (prom: Promise<void>) => void
  }
) => Promise<unknown>

function loadEntrypointHandler(handler: string): EntrypointHandler {
  const entrypointPath = path.join(__dirname, '.next', 'server', handler)
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

  const handlers = [
    [/^\/api\/app\/param\/data$/, 'app/api/app/[param]/data/route.js'],
    [/^\/api\/app\/param\/error$/, 'app/api/app/[param]/error/route.js'],
    [/^\/api\/app\/param\/status$/, 'app/api/app/[param]/status/route.js'],
    [/^\/app\/param\/loading\/error$/, 'app/app/[param]/loading/error/page.js'],
    [/^\/app\/param\/loading\/page1$/, 'app/app/[param]/loading/page1/page.js'],
    [/^\/app\/param\/loading\/page2$/, 'app/app/[param]/loading/page2/page.js'],
    [/^\/app\/param\/rsc-fetch$/, 'app/app/[param]/rsc-fetch/page.js'],
    [
      /^\/app\/param\/rsc-fetch\/error$/,
      'app/app/[param]/rsc-fetch/error/page.js',
    ],
    // ---
    [/^\/api\/pages\/param\/basic$/, 'pages/api/pages/[param]/basic.js'],
    [/^\/api\/pages\/param\/error$/, 'pages/api/pages/[param]/error.js'],
    [
      /^\/pages\/param\/getServerSideProps$/,
      'pages/pages/[param]/getServerSideProps.js',
    ],
    [
      /^\/pages\/param\/getServerSidePropsError$/,
      'pages/pages/[param]/getServerSidePropsError.js',
    ],
    [
      /^\/pages\/param\/getServerSidePropsNotFound$/,
      'pages/pages/[param]/getServerSidePropsNotFound.js',
    ],
    [
      /^\/pages\/param\/getStaticProps$/,
      'pages/pages/[param]/getStaticProps.js',
    ],
    [
      /^\/pages\/param\/getStaticProps2$/,
      'pages/pages/[param]/getStaticProps2.js',
    ],
  ] as const

  const tracer = trace.getTracer('custom-entrypoint-server', '1.0.0')

  const resolveHandler = (pathname: string): EntrypointHandler | undefined => {
    for (const [pattern, handler] of handlers) {
      if (pattern.test(pathname)) return loadEntrypointHandler(handler)
    }
    console.error("Couldn't find resolve handler for path:", pathname)
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

    const handle = () => handler(req, res, { waitUntil: () => {} })

    // Simulate a custom parent span around direct entrypoint invocation.
    if (withoutParentSpan) {
      ;(async () => {
        try {
          await handle()
        } catch (err) {
          res.statusCode = 500
          res.end('Internal Server Error')
        }
      })()
    } else {
      tracer.startActiveSpan(method, async (span) => {
        try {
          await handle()
        } catch (err) {
          span.recordException(err as Error)
          res.statusCode = 500
          res.end('Internal Server Error')
        } finally {
          span.end()
        }
      })
    }
  }).listen(port, undefined, (err?: Error) => {
    if (err) throw err
    console.log(`- Local: http://${hostname}:${port}`)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
