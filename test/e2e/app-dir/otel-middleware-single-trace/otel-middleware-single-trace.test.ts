import { isNextDeploy, nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'

const USER_TRACE_ID = '0af7651916cd43dd8448eb211c80319c'
const INCOMING_TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736'
const INCOMING_TRACEPARENT = `00-${INCOMING_TRACE_ID}-00f067aa0ba902b7-01`
const TRACE_ID = /^(?!0{32}$)[0-9a-f]{32}$/
const SPAN_ID = /^(?!0{16}$)[0-9a-f]{16}$/

const MATCHER = [
  '/page',
  '/route-handler',
  '/rewrite',
  '/redirect',
  '/direct',
  '/user-overrides',
  '/user-traceparent',
]

// The middleware entry file is generated per variant: `config` must be a
// static literal in the entry file itself, and the shared implementation is
// imported relative to the app root, where the entry file is written.
function middlewareEntry(exportName: 'proxy' | 'middleware') {
  return [
    `import type { NextRequest } from 'next/server'`,
    `import { handler } from './middleware-impl'`,
    ``,
    `export function ${exportName}(request: NextRequest) {`,
    `  return handler(request)`,
    `}`,
    ``,
    `export const config = { matcher: ${JSON.stringify(MATCHER)} }`,
    ``,
  ].join('\n')
}

// The app reports its active trace IDs itself (no local collector), so these
// assertions also hold when deployed. Every request that passes through
// middleware must stay in a single trace: the trace ID seen by the middleware
// has to be the one seen by the page / route handler that renders afterwards.
// The render must also be nested inside the middleware span: the trace context
// it was started from (the `traceparent` it received) is the middleware span.
describe.each([
  // `proxy.ts` always runs in the Node.js runtime.
  { name: 'proxy (nodejs runtime)', file: 'proxy.ts', exportName: 'proxy' },
  // `middleware.ts` defaults to the edge runtime.
  {
    name: 'middleware (edge runtime)',
    file: 'middleware.ts',
    exportName: 'middleware',
  },
] as const)('otel-middleware-single-trace - $name', ({ file, exportName }) => {
  const { next } = nextTestSetup({
    files: __dirname,
    overrideFiles: {
      [file]: middlewareEntry(exportName),
    },
    dependencies: {
      '@vercel/otel': '2.1.3',
      '@opentelemetry/api': '1.9.1',
      '@opentelemetry/api-logs': '0.223.0',
      '@opentelemetry/instrumentation': '0.223.0',
      '@opentelemetry/resources': '2.12.0',
      '@opentelemetry/sdk-logs': '0.223.0',
      '@opentelemetry/sdk-metrics': '2.12.0',
      '@opentelemetry/sdk-trace-base': '2.12.0',
    },
  })

  function getMiddlewareTraceId(res: Response) {
    const traceId = res.headers.get('x-mw-trace-id')
    expect(traceId).toMatch(TRACE_ID)
    return traceId
  }

  // Asserts the render is in the middleware's trace and a direct child of the
  // middleware span.
  function expectNestedInMiddleware(
    res: Response,
    render: { traceId: string; traceparent: string }
  ) {
    const traceId = getMiddlewareTraceId(res)
    const spanId = res.headers.get('x-mw-span-id')
    expect(spanId).toMatch(SPAN_ID)
    expect(render.traceId).toBe(traceId)
    const [, parentTraceId, parentSpanId] = render.traceparent.split('-')
    expect({ parentTraceId, parentSpanId }).toEqual({
      parentTraceId: traceId,
      parentSpanId: spanId,
    })
  }

  async function getPageTrace(res: Response) {
    const $ = cheerio.load(await res.text())
    return {
      traceId: $('#trace-id').text(),
      traceparent: $('#traceparent').text(),
    }
  }

  function expectNoInternalHeaders(res: Response) {
    for (const key of res.headers.keys()) {
      expect(key).not.toMatch(/^x-middleware-(request-|override-headers)/)
    }
  }

  it('nests a page rendered after NextResponse.next() in the middleware span', async () => {
    const res = await next.fetch('/page')
    expect(res.status).toBe(200)
    expectNestedInMiddleware(res, await getPageTrace(res))
    expectNoInternalHeaders(res)
  })

  it('nests a route handler executed after NextResponse.next() in the middleware span', async () => {
    const res = await next.fetch('/route-handler')
    expect(res.status).toBe(200)
    expectNestedInMiddleware(res, await res.json())
    expectNoInternalHeaders(res)
  })

  it('nests a rewritten page in the middleware span', async () => {
    const res = await next.fetch('/rewrite')
    expect(res.status).toBe(200)
    expectNestedInMiddleware(res, await getPageTrace(res))
    expectNoInternalHeaders(res)
  })

  it('traces a middleware redirect', async () => {
    const res = await next.fetch('/redirect', { redirect: 'manual' })
    expect(res.status).toBe(307)
    getMiddlewareTraceId(res)
    expectNoInternalHeaders(res)
  })

  it('traces a direct middleware response', async () => {
    const res = await next.fetch('/direct')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('direct response from middleware')
    getMiddlewareTraceId(res)
    expectNoInternalHeaders(res)
  })

  it('traces a request the middleware does not match', async () => {
    const res = await next.fetch('/unmatched')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-mw-trace-id')).toBeNull()
    const $ = cheerio.load(await res.text())
    expect($('#trace-id').text()).toMatch(TRACE_ID)
    expectNoInternalHeaders(res)
  })

  it.each(['/page', '/route-handler', '/rewrite'])(
    'nests %s in the middleware span with an incoming traceparent',
    async (pathname) => {
      const res = await next.fetch(pathname, {
        headers: { traceparent: INCOMING_TRACEPARENT },
      })
      expect(res.status).toBe(200)
      const render =
        pathname === '/route-handler'
          ? await res.json()
          : await getPageTrace(res)
      expectNestedInMiddleware(res, render)
      // Self-hosted Next.js continues the caller's trace. When deployed, the
      // platform decides whether a client-supplied traceparent is trusted, so
      // only the single-trace and nesting guarantees are asserted there.
      if (!isNextDeploy) {
        expect(render.traceId).toBe(INCOMING_TRACE_ID)
      }
      expectNoInternalHeaders(res)
    }
  )

  it('still applies request header overrides set by middleware', async () => {
    const res = await next.fetch('/user-overrides', {
      headers: { 'x-delete-me': 'please', 'x-keep-me': 'kept' },
    })
    expect(res.status).toBe(200)
    const $ = cheerio.load(await res.text())
    const headers = JSON.parse($('#headers').text())
    expect(headers['x-user-added']).toBe('added-by-middleware')
    expect(headers['x-keep-me']).toBe('kept')
    expect(headers['x-delete-me']).toBeUndefined()
    expectNestedInMiddleware(res, {
      traceId: $('#trace-id').text(),
      traceparent: headers['traceparent'],
    })
    expectNoInternalHeaders(res)
  })

  it('respects a traceparent explicitly set by middleware', async () => {
    const res = await next.fetch('/user-traceparent')
    expect(res.status).toBe(200)
    const $ = cheerio.load(await res.text())
    expect($('#trace-id').text()).toBe(USER_TRACE_ID)
    expectNoInternalHeaders(res)
  })
})
