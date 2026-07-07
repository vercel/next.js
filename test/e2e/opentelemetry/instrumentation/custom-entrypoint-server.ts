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

type MiddlewareHandler = (
  req: Request,
  ctx: {
    waitUntil?: (prom: Promise<void>) => void
  }
) => Promise<Response>

function loadEntrypointHandler<T>(handler: string): T {
  const entrypointPath = path.join(__dirname, '.next', 'server', handler)
  const mod = require(entrypointPath) as { handler?: T }
  if (typeof mod.handler !== 'function') {
    throw new Error(`Entrypoint handler missing at ${entrypointPath}`)
  }
  return mod.handler
}

async function main() {
  const port = await getPort()
  const hostname = 'localhost'

  require('next/dist/server/node-environment')

  const handlers: [RegExp, string][] = [
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
    [/^\/behind-middleware$/, 'app/behind-middleware/page.js'],
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
  ]
  const middlewareHandlers: [RegExp, string][] = [
    [/^\/behind-middleware/, 'middleware.js'],
  ]

  const tracer = trace.getTracer('custom-entrypoint-server', '1.0.0')

  const resolveHandler = <T>(
    handlers: [RegExp, string][],
    pathname: string
  ): T | undefined => {
    for (const [pattern, handler] of handlers) {
      if (pattern.test(pathname)) return loadEntrypointHandler<T>(handler)
    }
    console.error("Couldn't find resolve handler for path:", pathname)
    return undefined
  }

  createServer((req, res) => {
    const method = req.method || 'GET'
    const pathname = parse(req.url || '/', false).pathname || '/'
    const handler = resolveHandler<EntrypointHandler>(handlers, pathname)
    const middlewareHandler = resolveHandler<MiddlewareHandler>(
      middlewareHandlers,
      pathname
    )

    if (!handler) {
      res.statusCode = 404
      res.end('Not Found')
      return
    }

    const waitUntil = () => {}
    const handle = async () => {
      if (middlewareHandler) {
        const url = `http://${req.headers.host}${req.url}`
        const request = new Request(url, {
          method: req.method,
          headers: req.headers as HeadersInit,
          ...(req.method !== 'GET' && req.method !== 'HEAD'
            ? { body: req as any, duplex: 'half' }
            : {}),
        } as RequestInit & { duplex?: 'half' })
        const mwResponse = await middlewareHandler(request, {
          waitUntil: () => {},
        })

        if (mwResponse.headers.get('x-middleware-next') !== '1') {
          res.statusCode = mwResponse.status
          mwResponse.headers.forEach((value, key) => {
            if (key !== 'content-encoding') res.setHeader(key, value)
          })
          res.end(mwResponse.body ? await mwResponse.text() : undefined)
          return
        }

        const overrideList = mwResponse.headers.get(
          'x-middleware-override-headers'
        )
        if (overrideList) {
          const overridden = new Set(
            overrideList.split(',').map((k) => k.trim())
          )
          for (const key of Object.keys(req.headers)) {
            if (!overridden.has(key)) delete req.headers[key]
          }
          for (const key of overridden) {
            const value = mwResponse.headers.get(`x-middleware-request-${key}`)
            req.headers[key] = value === null ? undefined : value
          }
        }
      }

      return await handler(req, res, { waitUntil })
    }

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
