import { FileRef, isNextDeploy, nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'
import path from 'path'

const USER_TRACE_ID = '0af7651916cd43dd8448eb211c80319c'
const INCOMING_TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736'
const INCOMING_TRACEPARENT = `00-${INCOMING_TRACE_ID}-00f067aa0ba902b7-01`
const TRACE_ID = /^(?!0{32}$)[0-9a-f]{32}$/

// The app reports its active trace IDs itself (no local collector), so these
// assertions also hold when deployed. Every request that passes through
// middleware must stay in a single trace: the trace ID seen by the middleware
// has to be the one seen by the page / route handler that renders afterwards.
describe.each([
  { name: 'proxy (nodejs runtime)', file: 'proxy.ts', source: 'proxy.ts' },
  {
    name: 'middleware (edge runtime)',
    file: 'middleware.ts',
    source: 'middleware-edge.ts',
  },
])('otel-middleware-single-trace - $name', ({ file, source }) => {
  const { next } = nextTestSetup({
    files: __dirname,
    overrideFiles: {
      [file]: new FileRef(path.join(__dirname, 'variants', source)),
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

  function expectNoInternalHeaders(res: Response) {
    for (const key of res.headers.keys()) {
      expect(key).not.toMatch(/^x-middleware-(request-|override-headers)/)
    }
  }

  it('keeps a page rendered after NextResponse.next() in the middleware trace', async () => {
    const res = await next.fetch('/page')
    expect(res.status).toBe(200)
    const $ = cheerio.load(await res.text())
    expect($('#trace-id').text()).toBe(getMiddlewareTraceId(res))
    expectNoInternalHeaders(res)
  })

  it('keeps a route handler executed after NextResponse.next() in the middleware trace', async () => {
    const res = await next.fetch('/route-handler')
    expect(res.status).toBe(200)
    const { traceId } = await res.json()
    expect(traceId).toBe(getMiddlewareTraceId(res))
    expectNoInternalHeaders(res)
  })

  it('keeps a rewritten page in the middleware trace', async () => {
    const res = await next.fetch('/rewrite')
    expect(res.status).toBe(200)
    const $ = cheerio.load(await res.text())
    expect($('#trace-id').text()).toBe(getMiddlewareTraceId(res))
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
    'keeps %s in a single trace with an incoming traceparent',
    async (pathname) => {
      const res = await next.fetch(pathname, {
        headers: { traceparent: INCOMING_TRACEPARENT },
      })
      expect(res.status).toBe(200)
      const traceId =
        pathname === '/route-handler'
          ? (await res.json()).traceId
          : cheerio
              .load(await res.text())('#trace-id')
              .text()
      const middlewareTraceId = getMiddlewareTraceId(res)
      expect(traceId).toBe(middlewareTraceId)
      // Self-hosted Next.js continues the caller's trace. When deployed, the
      // platform decides whether a client-supplied traceparent is trusted, so
      // only the single-trace guarantee is asserted there.
      if (!isNextDeploy) {
        expect(traceId).toBe(INCOMING_TRACE_ID)
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
    expect($('#trace-id').text()).toBe(getMiddlewareTraceId(res))
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
