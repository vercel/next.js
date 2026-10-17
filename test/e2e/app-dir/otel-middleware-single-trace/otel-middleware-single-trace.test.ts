import { isNextDeploy, nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'

const USER_TRACE_ID = '0af7651916cd43dd8448eb211c80319c'
const USER_SPAN_ID = 'b7ad6b7169203331'
const INCOMING_TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736'
const INCOMING_SPAN_ID = '00f067aa0ba902b7'
const INCOMING_TRACEPARENT = `00-${INCOMING_TRACE_ID}-${INCOMING_SPAN_ID}-01`
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

interface RenderTrace {
  traceId: string
  // The parent of the render's request span (`BaseServer.handleRequest`).
  requestParentSpanId: string
  // The `traceparent` request header the render received.
  traceparent: string
}

// The app reports its trace and parent span IDs itself (no local collector;
// see `trace-recorder.ts`), so these assertions also hold when deployed. Every
// request that passes through middleware must stay in a single trace, and the
// middleware span and the render's request span must be siblings: children of
// the same parent span. That parent is next-server's middleware-invoke
// `handleRequest` span when self-hosted, and the incoming / platform trace
// context or the root span inserted by the middleware adapter when deployed.
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
  // When self-hosted, Node.js middleware runs in the server process, so its
  // parent (next-server's middleware-invoke `handleRequest` span) was started
  // in the same process. The Edge sandbox only sees that span's context via
  // the request's `traceparent`.
  const isInProcessMiddleware = exportName === 'proxy'
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

  // Asserts the middleware span's trace and parent, and returns them.
  function getMiddlewareTrace(res: Response) {
    const traceId = res.headers.get('x-mw-trace-id')
    expect(traceId).toMatch(TRACE_ID)
    const parentSpanId = res.headers.get('x-mw-parent-span-id')
    expect(parentSpanId).toMatch(SPAN_ID)
    const parentType = res.headers.get('x-mw-parent-type')
    const receivedTraceparent = res.headers.get('x-mw-received-traceparent')
    if (isNextDeploy) {
      // The platform's trace context, or the root span inserted by the
      // middleware adapter when the request carries none.
      expect(['remote', 'Middleware.request']).toContain(parentType)
    } else {
      // next-server's middleware-invoke `handleRequest` span, whose context
      // that pass wrote onto the request.
      expect(parentType).toBe(
        isInProcessMiddleware ? 'BaseServer.handleRequest' : 'remote'
      )
      expect(receivedTraceparent?.split('-')[2]).toBe(parentSpanId)
    }
    return {
      traceId,
      parentSpanId,
      grandparentSpanId: res.headers.get('x-mw-grandparent-span-id'),
      receivedTraceparent,
    }
  }

  // Asserts the render is in the middleware's trace and a sibling of the
  // middleware span (same parent span).
  function expectSiblingOfMiddleware(res: Response, render: RenderTrace) {
    const middleware = getMiddlewareTrace(res)
    expect({
      traceId: render.traceId,
      requestParentSpanId: render.requestParentSpanId,
    }).toEqual({
      traceId: middleware.traceId,
      requestParentSpanId: middleware.parentSpanId,
    })
    // The middleware never changes a traceparent the request carries
    // (incoming, from the platform, or written by next-server), so the render
    // receives it unchanged. Without one, the middleware inserts a root span
    // and passes on its context instead.
    if (middleware.receivedTraceparent !== 'none') {
      expect(render.traceparent).toBe(middleware.receivedTraceparent)
    }
    return middleware
  }

  async function getPageTrace(res: Response): Promise<RenderTrace> {
    const $ = cheerio.load(await res.text())
    return {
      traceId: $('#trace-id').text(),
      requestParentSpanId: $('#request-parent-span-id').text(),
      traceparent: $('#traceparent').text(),
    }
  }

  function expectNoInternalHeaders(res: Response) {
    for (const key of res.headers.keys()) {
      expect(key).not.toMatch(/^x-middleware-(request-|override-headers)/)
    }
  }

  it('keeps a page rendered after NextResponse.next() a sibling of the middleware span', async () => {
    const res = await next.fetch('/page')
    expect(res.status).toBe(200)
    expectSiblingOfMiddleware(res, await getPageTrace(res))
    expectNoInternalHeaders(res)
  })

  it('keeps a route handler executed after NextResponse.next() a sibling of the middleware span', async () => {
    const res = await next.fetch('/route-handler')
    expect(res.status).toBe(200)
    expectSiblingOfMiddleware(res, await res.json())
    expectNoInternalHeaders(res)
  })

  it('keeps a rewritten page a sibling of the middleware span', async () => {
    const res = await next.fetch('/rewrite')
    expect(res.status).toBe(200)
    expectSiblingOfMiddleware(res, await getPageTrace(res))
    expectNoInternalHeaders(res)
  })

  it('traces a middleware redirect', async () => {
    const res = await next.fetch('/redirect', { redirect: 'manual' })
    expect(res.status).toBe(307)
    getMiddlewareTrace(res)
    expectNoInternalHeaders(res)
  })

  it('traces a direct middleware response', async () => {
    const res = await next.fetch('/direct')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('direct response from middleware')
    getMiddlewareTrace(res)
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
    'keeps %s a sibling of the middleware span with an incoming traceparent',
    async (pathname) => {
      const res = await next.fetch(pathname, {
        headers: { traceparent: INCOMING_TRACEPARENT },
      })
      expect(res.status).toBe(200)
      const render: RenderTrace =
        pathname === '/route-handler'
          ? await res.json()
          : await getPageTrace(res)
      const middleware = expectSiblingOfMiddleware(res, render)
      if (isNextDeploy) {
        // The platform decides whether a client-supplied traceparent is
        // trusted; whatever the middleware received is passed on unchanged
        // (asserted above).
        if (middleware.receivedTraceparent === INCOMING_TRACEPARENT) {
          expect(render.traceId).toBe(INCOMING_TRACE_ID)
        }
      } else {
        // Self-hosted Next.js continues the caller's trace: the incoming span
        // is the parent of next-server's middleware-invoke `handleRequest`.
        expect(render.traceId).toBe(INCOMING_TRACE_ID)
        if (isInProcessMiddleware) {
          expect(middleware.grandparentSpanId).toBe(INCOMING_SPAN_ID)
        }
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
    expectSiblingOfMiddleware(res, {
      traceId: $('#trace-id').text(),
      requestParentSpanId: $('#request-parent-span-id').text(),
      traceparent: headers['traceparent'],
    })
    expectNoInternalHeaders(res)
  })

  // The one intentional exception to the sibling invariant: a traceparent the
  // middleware explicitly sets is respected, so the render continues it.
  it('respects a traceparent explicitly set by middleware', async () => {
    const res = await next.fetch('/user-traceparent')
    expect(res.status).toBe(200)
    const $ = cheerio.load(await res.text())
    expect({
      traceId: $('#trace-id').text(),
      requestParentSpanId: $('#request-parent-span-id').text(),
    }).toEqual({
      traceId: USER_TRACE_ID,
      requestParentSpanId: USER_SPAN_ID,
    })
    expectNoInternalHeaders(res)
  })
})
