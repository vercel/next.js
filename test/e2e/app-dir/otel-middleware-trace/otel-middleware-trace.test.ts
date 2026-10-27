/* eslint jest/no-standalone-expect: ["error", { "additionalTestBlockFunctions": ["traceTest"] }] */
import { randomBytes } from 'crypto'
import { isNextDeploy, isNextDev, nextTestSetup } from 'e2e-utils'
import type { NextInstance } from 'e2e-utils'
import cheerio from 'cheerio'
import {
  isOneTimeSpan,
  printSpanTree,
  type KnownTraceContext,
} from 'otel-span-tree'
import { collectSpans } from 'otel-span-capture'

// A new trace context for a request, so the spans collected for its trace
// are only that request's (also when a test is retried).
function newTraceContext(name: string): KnownTraceContext {
  return {
    name,
    traceId: randomBytes(16).toString('hex'),
    spanId: randomBytes(8).toString('hex'),
  }
}

function toTraceparent({ traceId, spanId }: KnownTraceContext) {
  return `00-${traceId}-${spanId}-01`
}

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

type Body = 'html' | 'json' | 'none'

const VARIANTS = [
  // `proxy.ts` always runs in the Node.js runtime.
  { name: 'proxy (nodejs runtime)', file: 'proxy.ts', exportName: 'proxy' },
  // `middleware.ts` defaults to the edge runtime.
  {
    name: 'middleware (edge runtime)',
    file: 'middleware.ts',
    exportName: 'middleware',
  },
] as const

const DEPENDENCIES = {
  '@vercel/otel': '2.1.3',
  '@opentelemetry/api': '1.9.1',
  '@opentelemetry/api-logs': '0.223.0',
  '@opentelemetry/instrumentation': '0.223.0',
  '@opentelemetry/resources': '2.12.0',
  '@opentelemetry/sdk-logs': '0.223.0',
  '@opentelemetry/sdk-metrics': '2.12.0',
  '@opentelemetry/sdk-trace-base': '2.12.0',
}

// Collecting the spans from the runtime logs takes a while when deployed.
const TEST_TIMEOUT = isNextDeploy ? 240_000 : undefined

// A test that collects the spans of a request.
function traceTest(name: string, fn: () => Promise<void>) {
  it(name, fn, TEST_TIMEOUT)
}

// How far back to read the runtime logs when deployed (they are filtered by
// trace, so this only needs to cover the request and clock differences).
const LOGS_WINDOW_MS = 10 * 60_000

// The span tree of a request, from the spans collected after the response
// (see `collectSpans`): the spans of the middleware's trace (reported in a
// response header) and the render's trace (reported in the body), once the
// middleware span, the render's request span and (deployed, for middleware
// without an incoming `traceparent`) the inserted `Next.request` root have
// ended. Pass the incoming trace context and the one the middleware sets as
// `known`, and `incoming` when the request has a `traceparent`. One-time spans
// (see `isOneTimeSpan`) are omitted unless `includeOneTimeSpans` is set.
async function getSpanTree(
  next: NextInstance,
  res: Response,
  body: Body,
  {
    includeOneTimeSpans = false,
    known = [],
    incoming = false,
  }: {
    includeOneTimeSpans?: boolean
    known?: KnownTraceContext[]
    incoming?: boolean
  } = {}
) {
  const traceIds = new Set<string>()
  const expected: string[] = []
  const middlewareTraceId = res.headers.get('x-mw-trace-id')
  if (middlewareTraceId) {
    traceIds.add(middlewareTraceId)
    expected.push('Middleware.execute')
    if (isNextDeploy && !incoming) {
      expected.push('Next.request')
    }
  }
  if (body !== 'none') {
    const renderTraceId =
      body === 'html'
        ? cheerio
            .load(await res.text())('#trace-id')
            .text()
        : (await res.json()).traceId
    expect(renderTraceId).toMatch(/^[0-9a-f]{32}$/)
    traceIds.add(renderTraceId)
    expected.push('BaseServer.handleRequest')
  }
  const spans = await collectSpans(next, {
    traceIds: [...traceIds],
    expected,
    since: new Date(Date.now() - LOGS_WINDOW_MS),
  })
  return printSpanTree(spans, {
    known,
    omit: includeOneTimeSpans ? undefined : isOneTimeSpan,
  })
}

function expectNoInternalHeaders(res: Response) {
  for (const key of res.headers.keys()) {
    expect(key).not.toMatch(/^x-middleware-(request-|override-headers)/)
  }
}

// The environment a test runs in, which selects its span tree snapshot: how
// the app runs (`start`, `dev`, or `deploy`, deployed with the adapter or
// without it, `(no adapter)`), the bundler (Turbopack, or ` (webpack)`),
// whether Cache Components are enabled, and the middleware entry (`proxy` for
// Node.js middleware, `middleware` for Edge middleware). The span trees differ
// between them: e.g. pages render differently with Cache Components (also
// between dev and start); deployed, the platform invokes the middleware and
// the render separately, with the adapter the render's request span is named
// after its entrypoint (e.g. `GET /page/page`), without it the render's spans
// have the self-hosted shape, and with Cache Components pages are rendered in
// a `POST` resume request. Environments without a snapshot fall through to an
// empty one, which fails and prints the tree (e.g. in CI).
function getTestEnv(isTurbopack: boolean, middlewareExport: string) {
  const mode = isNextDeploy
    ? process.env.NEXT_ENABLE_ADAPTER === '1'
      ? 'deploy'
      : 'deploy (no adapter)'
    : `${isNextDev ? 'dev' : 'start'}${isTurbopack ? '' : ' (webpack)'}`
  const cacheComponents = process.env.__NEXT_CACHE_COMPONENTS
    ? ', cache components'
    : ''
  return `${mode}${cacheComponents}, ${middlewareExport}`
}

// The trace of every request is asserted as a span tree snapshot (see
// `printSpanTree`). There is no collector (so the suite also works when
// deployed): the app writes span lifecycle events to the console (see
// `trace-recorder.ts`), and the test collects the finished spans of the
// request's traces after the response, from the server output or, when
// deployed, the runtime logs (see `collectSpans`). Parents that weren't
// collected (e.g. the platform's spans when deployed) show up as `[remote]`.
// Spans that don't cover all spans below them are badged (see
// `printSpanTree`): self-hosted, next-server's middleware-invoke request span
// ends before the render it is the parent of.
describe.each(VARIANTS)(
  'otel-middleware-trace - $name',
  ({ file, exportName }) => {
    const { next, isTurbopack } = nextTestSetup({
      files: __dirname,
      overrideFiles: {
        [file]: middlewareEntry(exportName),
      },
      dependencies: DEPENDENCIES,
    })
    const env = getTestEnv(isTurbopack, exportName)

    // The first request, so the tree includes the one-time spans (e.g.
    // `instrumentation.ts` registration) of the first request an instance serves.
    traceTest('traces a page rendered after NextResponse.next()', async () => {
      const res = await next.fetch('/page')
      expect(res.status).toBe(200)
      expectNoInternalHeaders(res)
      const tree = await getSpanTree(next, res, 'html', {
        includeOneTimeSpans: true,
      })
      if (
        [
          'start, middleware',
          'start, proxy',
          'start (webpack), middleware',
          'start (webpack), proxy',
          'dev, middleware',
          'dev, proxy',
          'dev (webpack), middleware',
          'dev (webpack), proxy',
        ].includes(env)
      ) {
        expect(tree).toMatchInlineSnapshot(`
           "[trace A] GET (BaseServer.handleRequest) {http.target=/page, http.status_code=200} [error: doesn't cover descendants]
           ├─ GET /page (BaseServer.handleRequest) {http.target=/page, http.route=/page, next.route=/page, http.status_code=200}
           │  ├─ NextNodeServer.clientComponentLoading
           │  ├─ prepare route module (RouteModule.prepare)
           │  ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
           │  │  ├─ build component tree (NextNodeServer.createComponentTree)
           │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
           │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
           │  │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
           │  │  ├─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
           │  │  └─ start response (NextNodeServer.startResponse)
           │  └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
           │     └─ load route module (LoadComponents.loadRouteModule)
           └─ middleware GET (Middleware.execute) {http.target=/page}"
        `)
      } else if (
        [
          'start, cache components, middleware',
          'start, cache components, proxy',
        ].includes(env)
      ) {
        expect(tree).toMatchInlineSnapshot(`
           "[trace A] GET (BaseServer.handleRequest) {http.target=/page, http.status_code=200} [error: doesn't cover descendants]
           ├─ GET /page (BaseServer.handleRequest) {http.target=/page, http.route=/page, next.route=/page, http.status_code=200}
           │  ├─ NextNodeServer.clientComponentLoading
           │  ├─ prepare route module (RouteModule.prepare)
           │  ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
           │  │  ├─ build component tree (NextNodeServer.createComponentTree)
           │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
           │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
           │  │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
           │  │  └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
           │  ├─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
           │  │  └─ load route module (LoadComponents.loadRouteModule)
           │  └─ start response (NextNodeServer.startResponse)
           └─ middleware GET (Middleware.execute) {http.target=/page}"
        `)
      } else if (
        [
          'dev, cache components, middleware',
          'dev, cache components, proxy',
        ].includes(env)
      ) {
        expect(tree).toMatchInlineSnapshot(`
           "[trace A] GET (BaseServer.handleRequest) {http.target=/page, http.status_code=200} [error: doesn't cover descendants]
           ├─ GET /page (BaseServer.handleRequest) {http.target=/page, http.route=/page, next.route=/page, http.status_code=200}
           │  ├─ NextNodeServer.clientComponentLoading
           │  ├─ prepare route module (RouteModule.prepare)
           │  ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
           │  │  ├─ build component tree (NextNodeServer.createComponentTree)
           │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
           │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
           │  │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
           │  │  ├─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
           │  │  └─ start response (NextNodeServer.startResponse)
           │  └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
           │     └─ load route module (LoadComponents.loadRouteModule)
           └─ middleware GET (Middleware.execute) {http.target=/page}"
        `)
      } else {
        // Not observed yet (filled from CI).
        expect(tree).toMatchInlineSnapshot()
      }
    })

    traceTest(
      'traces a route handler executed after NextResponse.next()',
      async () => {
        const res = await next.fetch('/route-handler')
        expect(res.status).toBe(200)
        expectNoInternalHeaders(res)
        const tree = await getSpanTree(next, res, 'json')
        if (
          [
            'start, middleware',
            'start, proxy',
            'start (webpack), middleware',
            'start (webpack), proxy',
            'dev, middleware',
            'dev, proxy',
            'dev (webpack), middleware',
            'dev (webpack), proxy',
            'start, cache components, middleware',
            'start, cache components, proxy',
            'dev, cache components, middleware',
            'dev, cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
             "[trace A] GET (BaseServer.handleRequest) {http.target=/route-handler, http.status_code=200} [error: doesn't cover descendants]
             ├─ GET /route-handler (BaseServer.handleRequest) {http.target=/route-handler, http.route=/route-handler, next.route=/route-handler, http.status_code=200}
             │  ├─ executing api route (app) /route-handler (AppRouteRouteHandlers.runHandler) {next.route=/route-handler}
             │  ├─ prepare route module (RouteModule.prepare)
             │  ├─ resolve page components (NextNodeServer.findPageComponents) {next.route=/route-handler}
             │  │  └─ load route module (LoadComponents.loadRouteModule)
             │  └─ start response (NextNodeServer.startResponse)
             └─ middleware GET (Middleware.execute) {http.target=/route-handler}"
          `)
        } else {
          // Not observed yet (filled from CI).
          expect(tree).toMatchInlineSnapshot()
        }
      }
    )

    traceTest('traces a rewritten page', async () => {
      const res = await next.fetch('/rewrite')
      expect(res.status).toBe(200)
      expectNoInternalHeaders(res)
      const tree = await getSpanTree(next, res, 'html')
      if (
        [
          'start, middleware',
          'start, proxy',
          'start (webpack), middleware',
          'start (webpack), proxy',
          'dev, middleware',
          'dev, proxy',
          'dev (webpack), middleware',
          'dev (webpack), proxy',
        ].includes(env)
      ) {
        expect(tree).toMatchInlineSnapshot(`
           "[trace A] GET (BaseServer.handleRequest) {http.target=/rewrite, http.status_code=200} [error: doesn't cover descendants]
           ├─ GET /page (BaseServer.handleRequest) {http.target=/rewrite, http.route=/page, next.route=/page, http.status_code=200}
           │  ├─ NextNodeServer.clientComponentLoading
           │  ├─ prepare route module (RouteModule.prepare)
           │  ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
           │  │  ├─ build component tree (NextNodeServer.createComponentTree)
           │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
           │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
           │  │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
           │  │  ├─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
           │  │  └─ start response (NextNodeServer.startResponse)
           │  └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
           │     └─ load route module (LoadComponents.loadRouteModule)
           └─ middleware GET (Middleware.execute) {http.target=/rewrite}"
        `)
      } else if (
        [
          'start, cache components, middleware',
          'start, cache components, proxy',
        ].includes(env)
      ) {
        expect(tree).toMatchInlineSnapshot(`
           "[trace A] GET (BaseServer.handleRequest) {http.target=/rewrite, http.status_code=200} [error: doesn't cover descendants]
           ├─ GET /page (BaseServer.handleRequest) {http.target=/rewrite, http.route=/page, next.route=/page, http.status_code=200}
           │  ├─ NextNodeServer.clientComponentLoading
           │  ├─ prepare route module (RouteModule.prepare)
           │  ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
           │  │  ├─ build component tree (NextNodeServer.createComponentTree)
           │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
           │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
           │  │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
           │  │  └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
           │  ├─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
           │  │  └─ load route module (LoadComponents.loadRouteModule)
           │  └─ start response (NextNodeServer.startResponse)
           └─ middleware GET (Middleware.execute) {http.target=/rewrite}"
        `)
      } else if (
        [
          'dev, cache components, middleware',
          'dev, cache components, proxy',
        ].includes(env)
      ) {
        expect(tree).toMatchInlineSnapshot(`
           "[trace A] GET (BaseServer.handleRequest) {http.target=/rewrite, http.status_code=200} [error: doesn't cover descendants]
           ├─ GET /page (BaseServer.handleRequest) {http.target=/rewrite, http.route=/page, next.route=/page, http.status_code=200}
           │  ├─ NextNodeServer.clientComponentLoading
           │  ├─ prepare route module (RouteModule.prepare)
           │  ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
           │  │  ├─ build component tree (NextNodeServer.createComponentTree)
           │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
           │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
           │  │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
           │  │  ├─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
           │  │  └─ start response (NextNodeServer.startResponse)
           │  └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
           │     └─ load route module (LoadComponents.loadRouteModule)
           └─ middleware GET (Middleware.execute) {http.target=/rewrite}"
        `)
      } else {
        // Not observed yet (filled from CI).
        expect(tree).toMatchInlineSnapshot()
      }
    })

    traceTest('traces a middleware redirect', async () => {
      const res = await next.fetch('/redirect', { redirect: 'manual' })
      expect(res.status).toBe(307)
      expectNoInternalHeaders(res)
      const tree = await getSpanTree(next, res, 'none')
      if (
        [
          'start, middleware',
          'start, proxy',
          'start (webpack), middleware',
          'start (webpack), proxy',
          'dev, middleware',
          'dev, proxy',
          'dev (webpack), middleware',
          'dev (webpack), proxy',
          'start, cache components, middleware',
          'start, cache components, proxy',
          'dev, cache components, middleware',
          'dev, cache components, proxy',
        ].includes(env)
      ) {
        expect(tree).toMatchInlineSnapshot(`
           "[trace A] GET (BaseServer.handleRequest) {http.target=/redirect, http.status_code=200}
           └─ middleware GET (Middleware.execute) {http.target=/redirect}"
        `)
      } else {
        // Not observed yet (filled from CI).
        expect(tree).toMatchInlineSnapshot()
      }
    })

    traceTest('traces a direct middleware response', async () => {
      const res = await next.fetch('/direct')
      expect(res.status).toBe(200)
      expect(await res.clone().text()).toBe('direct response from middleware')
      expectNoInternalHeaders(res)
      const tree = await getSpanTree(next, res, 'none')
      if (
        [
          'start, middleware',
          'start, proxy',
          'start (webpack), middleware',
          'start (webpack), proxy',
          'dev, middleware',
          'dev, proxy',
          'dev (webpack), middleware',
          'dev (webpack), proxy',
          'start, cache components, middleware',
          'start, cache components, proxy',
          'dev, cache components, middleware',
          'dev, cache components, proxy',
        ].includes(env)
      ) {
        expect(tree).toMatchInlineSnapshot(`
           "[trace A] GET (BaseServer.handleRequest) {http.target=/direct, http.status_code=200}
           └─ middleware GET (Middleware.execute) {http.target=/direct}"
        `)
      } else {
        // Not observed yet (filled from CI).
        expect(tree).toMatchInlineSnapshot()
      }
    })

    traceTest('traces a request the middleware does not match', async () => {
      const res = await next.fetch('/unmatched')
      expect(res.status).toBe(200)
      expect(res.headers.get('x-mw-trace-id')).toBeNull()
      expectNoInternalHeaders(res)
      const tree = await getSpanTree(next, res, 'html')
      if (
        [
          'start, middleware',
          'start, proxy',
          'start (webpack), middleware',
          'start (webpack), proxy',
          'dev, middleware',
          'dev, proxy',
          'dev (webpack), middleware',
          'dev (webpack), proxy',
        ].includes(env)
      ) {
        expect(tree).toMatchInlineSnapshot(`
           "[trace A] GET /unmatched (BaseServer.handleRequest) {http.target=/unmatched, http.route=/unmatched, next.route=/unmatched, http.status_code=200}
           ├─ NextNodeServer.clientComponentLoading
           ├─ prepare route module (RouteModule.prepare)
           ├─ render route (app) /unmatched (AppRender.getBodyResult) {next.route=/unmatched}
           │  ├─ build component tree (NextNodeServer.createComponentTree)
           │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
           │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
           │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
           │  ├─ generateMetadata /unmatched/page (ResolveMetadata.generateMetadata)
           │  └─ start response (NextNodeServer.startResponse)
           └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/unmatched}
              └─ load route module (LoadComponents.loadRouteModule)"
        `)
      } else if (
        [
          'start, cache components, middleware',
          'start, cache components, proxy',
        ].includes(env)
      ) {
        expect(tree).toMatchInlineSnapshot(`
           "[trace A] GET /unmatched (BaseServer.handleRequest) {http.target=/unmatched, http.route=/unmatched, next.route=/unmatched, http.status_code=200}
           ├─ NextNodeServer.clientComponentLoading
           ├─ prepare route module (RouteModule.prepare)
           ├─ render route (app) /unmatched (AppRender.getBodyResult) {next.route=/unmatched}
           │  ├─ build component tree (NextNodeServer.createComponentTree)
           │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
           │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
           │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
           │  └─ generateMetadata /unmatched/page (ResolveMetadata.generateMetadata)
           ├─ resolve page components (NextNodeServer.findPageComponents) {next.route=/unmatched}
           │  └─ load route module (LoadComponents.loadRouteModule)
           └─ start response (NextNodeServer.startResponse)"
        `)
      } else if (
        [
          'dev, cache components, middleware',
          'dev, cache components, proxy',
        ].includes(env)
      ) {
        expect(tree).toMatchInlineSnapshot(`
           "[trace A] GET /unmatched (BaseServer.handleRequest) {http.target=/unmatched, http.route=/unmatched, next.route=/unmatched, http.status_code=200}
           ├─ NextNodeServer.clientComponentLoading
           ├─ prepare route module (RouteModule.prepare)
           ├─ render route (app) /unmatched (AppRender.getBodyResult) {next.route=/unmatched}
           │  ├─ build component tree (NextNodeServer.createComponentTree)
           │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
           │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
           │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
           │  ├─ generateMetadata /unmatched/page (ResolveMetadata.generateMetadata)
           │  └─ start response (NextNodeServer.startResponse)
           └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/unmatched}
              └─ load route module (LoadComponents.loadRouteModule)"
        `)
      } else {
        // Not observed yet (filled from CI).
        expect(tree).toMatchInlineSnapshot()
      }
    })

    traceTest('traces /page with an incoming traceparent', async () => {
      const incoming = newTraceContext('incoming')
      const res = await next.fetch('/page', {
        headers: { traceparent: toTraceparent(incoming) },
      })
      expect(res.status).toBe(200)
      expectNoInternalHeaders(res)
      const tree = await getSpanTree(next, res, 'html', {
        known: [incoming],
        incoming: true,
      })
      if (
        [
          'start, middleware',
          'start, proxy',
          'start (webpack), middleware',
          'start (webpack), proxy',
          'dev, middleware',
          'dev, proxy',
          'dev (webpack), middleware',
          'dev (webpack), proxy',
        ].includes(env)
      ) {
        expect(tree).toMatchInlineSnapshot(`
           "[trace incoming] [incoming traceparent]
           └─ GET (BaseServer.handleRequest) {http.target=/page, http.status_code=200} [error: doesn't cover descendants]
              ├─ GET /page (BaseServer.handleRequest) {http.target=/page, http.route=/page, next.route=/page, http.status_code=200}
              │  ├─ NextNodeServer.clientComponentLoading
              │  ├─ prepare route module (RouteModule.prepare)
              │  ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
              │  │  ├─ build component tree (NextNodeServer.createComponentTree)
              │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              │  │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
              │  │  ├─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
              │  │  └─ start response (NextNodeServer.startResponse)
              │  └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
              │     └─ load route module (LoadComponents.loadRouteModule)
              └─ middleware GET (Middleware.execute) {http.target=/page}"
        `)
      } else if (
        [
          'start, cache components, middleware',
          'start, cache components, proxy',
        ].includes(env)
      ) {
        expect(tree).toMatchInlineSnapshot(`
           "[trace incoming] [incoming traceparent]
           └─ GET (BaseServer.handleRequest) {http.target=/page, http.status_code=200} [error: doesn't cover descendants]
              ├─ GET /page (BaseServer.handleRequest) {http.target=/page, http.route=/page, next.route=/page, http.status_code=200}
              │  ├─ NextNodeServer.clientComponentLoading
              │  ├─ prepare route module (RouteModule.prepare)
              │  ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
              │  │  ├─ build component tree (NextNodeServer.createComponentTree)
              │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              │  │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
              │  │  └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
              │  ├─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
              │  │  └─ load route module (LoadComponents.loadRouteModule)
              │  └─ start response (NextNodeServer.startResponse)
              └─ middleware GET (Middleware.execute) {http.target=/page}"
        `)
      } else if (
        [
          'dev, cache components, middleware',
          'dev, cache components, proxy',
        ].includes(env)
      ) {
        expect(tree).toMatchInlineSnapshot(`
           "[trace incoming] [incoming traceparent]
           └─ GET (BaseServer.handleRequest) {http.target=/page, http.status_code=200} [error: doesn't cover descendants]
              ├─ GET /page (BaseServer.handleRequest) {http.target=/page, http.route=/page, next.route=/page, http.status_code=200}
              │  ├─ NextNodeServer.clientComponentLoading
              │  ├─ prepare route module (RouteModule.prepare)
              │  ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
              │  │  ├─ build component tree (NextNodeServer.createComponentTree)
              │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              │  │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
              │  │  ├─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
              │  │  └─ start response (NextNodeServer.startResponse)
              │  └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
              │     └─ load route module (LoadComponents.loadRouteModule)
              └─ middleware GET (Middleware.execute) {http.target=/page}"
        `)
      } else {
        // Not observed yet (filled from CI).
        expect(tree).toMatchInlineSnapshot()
      }
    })

    traceTest(
      'traces /route-handler with an incoming traceparent',
      async () => {
        const incoming = newTraceContext('incoming')
        const res = await next.fetch('/route-handler', {
          headers: { traceparent: toTraceparent(incoming) },
        })
        expect(res.status).toBe(200)
        expectNoInternalHeaders(res)
        const tree = await getSpanTree(next, res, 'json', {
          known: [incoming],
          incoming: true,
        })
        if (
          [
            'start, middleware',
            'start, proxy',
            'start (webpack), middleware',
            'start (webpack), proxy',
            'dev, middleware',
            'dev, proxy',
            'dev (webpack), middleware',
            'dev (webpack), proxy',
            'start, cache components, middleware',
            'start, cache components, proxy',
            'dev, cache components, middleware',
            'dev, cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
             "[trace incoming] [incoming traceparent]
             └─ GET (BaseServer.handleRequest) {http.target=/route-handler, http.status_code=200} [error: doesn't cover descendants]
                ├─ GET /route-handler (BaseServer.handleRequest) {http.target=/route-handler, http.route=/route-handler, next.route=/route-handler, http.status_code=200}
                │  ├─ executing api route (app) /route-handler (AppRouteRouteHandlers.runHandler) {next.route=/route-handler}
                │  ├─ prepare route module (RouteModule.prepare)
                │  ├─ resolve page components (NextNodeServer.findPageComponents) {next.route=/route-handler}
                │  │  └─ load route module (LoadComponents.loadRouteModule)
                │  └─ start response (NextNodeServer.startResponse)
                └─ middleware GET (Middleware.execute) {http.target=/route-handler}"
          `)
        } else {
          // Not observed yet (filled from CI).
          expect(tree).toMatchInlineSnapshot()
        }
      }
    )

    traceTest('traces /rewrite with an incoming traceparent', async () => {
      const incoming = newTraceContext('incoming')
      const res = await next.fetch('/rewrite', {
        headers: { traceparent: toTraceparent(incoming) },
      })
      expect(res.status).toBe(200)
      expectNoInternalHeaders(res)
      const tree = await getSpanTree(next, res, 'html', {
        known: [incoming],
        incoming: true,
      })
      if (
        [
          'start, middleware',
          'start, proxy',
          'start (webpack), middleware',
          'start (webpack), proxy',
          'dev, middleware',
          'dev, proxy',
          'dev (webpack), middleware',
          'dev (webpack), proxy',
        ].includes(env)
      ) {
        expect(tree).toMatchInlineSnapshot(`
           "[trace incoming] [incoming traceparent]
           └─ GET (BaseServer.handleRequest) {http.target=/rewrite, http.status_code=200} [error: doesn't cover descendants]
              ├─ GET /page (BaseServer.handleRequest) {http.target=/rewrite, http.route=/page, next.route=/page, http.status_code=200}
              │  ├─ NextNodeServer.clientComponentLoading
              │  ├─ prepare route module (RouteModule.prepare)
              │  ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
              │  │  ├─ build component tree (NextNodeServer.createComponentTree)
              │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              │  │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
              │  │  ├─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
              │  │  └─ start response (NextNodeServer.startResponse)
              │  └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
              │     └─ load route module (LoadComponents.loadRouteModule)
              └─ middleware GET (Middleware.execute) {http.target=/rewrite}"
        `)
      } else if (
        [
          'start, cache components, middleware',
          'start, cache components, proxy',
        ].includes(env)
      ) {
        expect(tree).toMatchInlineSnapshot(`
           "[trace incoming] [incoming traceparent]
           └─ GET (BaseServer.handleRequest) {http.target=/rewrite, http.status_code=200} [error: doesn't cover descendants]
              ├─ GET /page (BaseServer.handleRequest) {http.target=/rewrite, http.route=/page, next.route=/page, http.status_code=200}
              │  ├─ NextNodeServer.clientComponentLoading
              │  ├─ prepare route module (RouteModule.prepare)
              │  ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
              │  │  ├─ build component tree (NextNodeServer.createComponentTree)
              │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              │  │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
              │  │  └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
              │  ├─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
              │  │  └─ load route module (LoadComponents.loadRouteModule)
              │  └─ start response (NextNodeServer.startResponse)
              └─ middleware GET (Middleware.execute) {http.target=/rewrite}"
        `)
      } else if (
        [
          'dev, cache components, middleware',
          'dev, cache components, proxy',
        ].includes(env)
      ) {
        expect(tree).toMatchInlineSnapshot(`
           "[trace incoming] [incoming traceparent]
           └─ GET (BaseServer.handleRequest) {http.target=/rewrite, http.status_code=200} [error: doesn't cover descendants]
              ├─ GET /page (BaseServer.handleRequest) {http.target=/rewrite, http.route=/page, next.route=/page, http.status_code=200}
              │  ├─ NextNodeServer.clientComponentLoading
              │  ├─ prepare route module (RouteModule.prepare)
              │  ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
              │  │  ├─ build component tree (NextNodeServer.createComponentTree)
              │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              │  │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
              │  │  ├─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
              │  │  └─ start response (NextNodeServer.startResponse)
              │  └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
              │     └─ load route module (LoadComponents.loadRouteModule)
              └─ middleware GET (Middleware.execute) {http.target=/rewrite}"
        `)
      } else {
        // Not observed yet (filled from CI).
        expect(tree).toMatchInlineSnapshot()
      }
    })

    traceTest(
      'still applies request header overrides set by middleware',
      async () => {
        const res = await next.fetch('/user-overrides', {
          headers: { 'x-delete-me': 'please', 'x-keep-me': 'kept' },
        })
        expect(res.status).toBe(200)
        const html = await res.clone().text()
        const headers = JSON.parse(cheerio.load(html)('#headers').text())
        expect(headers['x-user-added']).toBe('added-by-middleware')
        expect(headers['x-keep-me']).toBe('kept')
        expect(headers['x-delete-me']).toBeUndefined()
        expectNoInternalHeaders(res)
        const tree = await getSpanTree(next, res, 'html')
        if (
          [
            'start, middleware',
            'start, proxy',
            'start (webpack), middleware',
            'start (webpack), proxy',
            'dev, middleware',
            'dev, proxy',
            'dev (webpack), middleware',
            'dev (webpack), proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
             "[trace A] GET (BaseServer.handleRequest) {http.target=/user-overrides, http.status_code=200} [error: doesn't cover descendants]
             ├─ GET /headers-echo (BaseServer.handleRequest) {http.target=/user-overrides, http.route=/headers-echo, next.route=/headers-echo, http.status_code=200}
             │  ├─ NextNodeServer.clientComponentLoading
             │  ├─ prepare route module (RouteModule.prepare)
             │  ├─ render route (app) /headers-echo (AppRender.getBodyResult) {next.route=/headers-echo}
             │  │  ├─ build component tree (NextNodeServer.createComponentTree)
             │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
             │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
             │  │  ├─ generateMetadata /headers-echo/page (ResolveMetadata.generateMetadata)
             │  │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
             │  │  └─ start response (NextNodeServer.startResponse)
             │  └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/headers-echo}
             │     └─ load route module (LoadComponents.loadRouteModule)
             └─ middleware GET (Middleware.execute) {http.target=/user-overrides}"
          `)
        } else if (
          [
            'start, cache components, middleware',
            'start, cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
             "[trace A] GET (BaseServer.handleRequest) {http.target=/user-overrides, http.status_code=200} [error: doesn't cover descendants]
             ├─ GET /headers-echo (BaseServer.handleRequest) {http.target=/user-overrides, http.route=/headers-echo, next.route=/headers-echo, http.status_code=200}
             │  ├─ NextNodeServer.clientComponentLoading
             │  ├─ prepare route module (RouteModule.prepare)
             │  ├─ render route (app) /headers-echo (AppRender.getBodyResult) {next.route=/headers-echo}
             │  │  ├─ build component tree (NextNodeServer.createComponentTree)
             │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
             │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
             │  │  ├─ generateMetadata /headers-echo/page (ResolveMetadata.generateMetadata)
             │  │  └─ generateMetadata /layout (ResolveMetadata.generateMetadata)
             │  ├─ resolve page components (NextNodeServer.findPageComponents) {next.route=/headers-echo}
             │  │  └─ load route module (LoadComponents.loadRouteModule)
             │  └─ start response (NextNodeServer.startResponse)
             └─ middleware GET (Middleware.execute) {http.target=/user-overrides}"
          `)
        } else if (
          [
            'dev, cache components, middleware',
            'dev, cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
             "[trace A] GET (BaseServer.handleRequest) {http.target=/user-overrides, http.status_code=200} [error: doesn't cover descendants]
             ├─ GET /headers-echo (BaseServer.handleRequest) {http.target=/user-overrides, http.route=/headers-echo, next.route=/headers-echo, http.status_code=200}
             │  ├─ NextNodeServer.clientComponentLoading
             │  ├─ prepare route module (RouteModule.prepare)
             │  ├─ render route (app) /headers-echo (AppRender.getBodyResult) {next.route=/headers-echo}
             │  │  ├─ build component tree (NextNodeServer.createComponentTree)
             │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
             │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
             │  │  ├─ generateMetadata /headers-echo/page (ResolveMetadata.generateMetadata)
             │  │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
             │  │  └─ start response (NextNodeServer.startResponse)
             │  └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/headers-echo}
             │     └─ load route module (LoadComponents.loadRouteModule)
             └─ middleware GET (Middleware.execute) {http.target=/user-overrides}"
          `)
        } else {
          // Not observed yet (filled from CI).
          expect(tree).toMatchInlineSnapshot()
        }
      }
    )

    // A traceparent the middleware explicitly sets is respected: the render
    // continues it instead of being a sibling of the middleware span.
    traceTest(
      'respects a traceparent explicitly set by middleware',
      async () => {
        const setByMiddleware = newTraceContext('set by middleware')
        const res = await next.fetch('/user-traceparent', {
          headers: { 'x-test-traceparent': toTraceparent(setByMiddleware) },
        })
        expect(res.status).toBe(200)
        expectNoInternalHeaders(res)
        const tree = await getSpanTree(next, res, 'html', {
          known: [setByMiddleware],
        })
        if (
          [
            'start, middleware',
            'start, proxy',
            'start (webpack), middleware',
            'start (webpack), proxy',
            'dev, middleware',
            'dev, proxy',
            'dev (webpack), middleware',
            'dev (webpack), proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
             "[trace A] GET (BaseServer.handleRequest) {http.target=/user-traceparent, http.status_code=200}
             └─ middleware GET (Middleware.execute) {http.target=/user-traceparent}
             [trace set by middleware] [set by middleware traceparent]
             └─ GET /headers-echo (BaseServer.handleRequest) {http.target=/user-traceparent, http.route=/headers-echo, next.route=/headers-echo, http.status_code=200}
                ├─ NextNodeServer.clientComponentLoading
                ├─ prepare route module (RouteModule.prepare)
                ├─ render route (app) /headers-echo (AppRender.getBodyResult) {next.route=/headers-echo}
                │  ├─ build component tree (NextNodeServer.createComponentTree)
                │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                │  ├─ generateMetadata /headers-echo/page (ResolveMetadata.generateMetadata)
                │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
                │  └─ start response (NextNodeServer.startResponse)
                └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/headers-echo}
                   └─ load route module (LoadComponents.loadRouteModule)"
          `)
        } else if (
          [
            'start, cache components, middleware',
            'start, cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
             "[trace A] GET (BaseServer.handleRequest) {http.target=/user-traceparent, http.status_code=200}
             └─ middleware GET (Middleware.execute) {http.target=/user-traceparent}
             [trace set by middleware] [set by middleware traceparent]
             └─ GET /headers-echo (BaseServer.handleRequest) {http.target=/user-traceparent, http.route=/headers-echo, next.route=/headers-echo, http.status_code=200}
                ├─ NextNodeServer.clientComponentLoading
                ├─ prepare route module (RouteModule.prepare)
                ├─ render route (app) /headers-echo (AppRender.getBodyResult) {next.route=/headers-echo}
                │  ├─ build component tree (NextNodeServer.createComponentTree)
                │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                │  ├─ generateMetadata /headers-echo/page (ResolveMetadata.generateMetadata)
                │  └─ generateMetadata /layout (ResolveMetadata.generateMetadata)
                ├─ resolve page components (NextNodeServer.findPageComponents) {next.route=/headers-echo}
                │  └─ load route module (LoadComponents.loadRouteModule)
                └─ start response (NextNodeServer.startResponse)"
          `)
        } else if (
          [
            'dev, cache components, middleware',
            'dev, cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
             "[trace A] GET (BaseServer.handleRequest) {http.target=/user-traceparent, http.status_code=200}
             └─ middleware GET (Middleware.execute) {http.target=/user-traceparent}
             [trace set by middleware] [set by middleware traceparent]
             └─ GET /headers-echo (BaseServer.handleRequest) {http.target=/user-traceparent, http.route=/headers-echo, next.route=/headers-echo, http.status_code=200}
                ├─ NextNodeServer.clientComponentLoading
                ├─ prepare route module (RouteModule.prepare)
                ├─ render route (app) /headers-echo (AppRender.getBodyResult) {next.route=/headers-echo}
                │  ├─ build component tree (NextNodeServer.createComponentTree)
                │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                │  ├─ generateMetadata /headers-echo/page (ResolveMetadata.generateMetadata)
                │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
                │  └─ start response (NextNodeServer.startResponse)
                └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/headers-echo}
                   └─ load route module (LoadComponents.loadRouteModule)"
          `)
        } else {
          // Not observed yet (filled from CI).
          expect(tree).toMatchInlineSnapshot()
        }
      }
    )

    // The `instrumentation.ts` lifecycle spans (`load instrumentation module`,
    // `register instrumentation`) of the instance serving the request, with
    // the rest of their traces.
    traceTest(
      'traces instrumentation registration in the triggering request',
      async () => {
        const res = await next.fetch('/instrumentation-spans')
        expect(res.status).toBe(200)
        const { traceIds } = await res.json()
        expect(traceIds.length).toBeGreaterThan(0)
        const spans = await collectSpans(next, {
          traceIds,
          expected: ['Instrumentation.loadModule', 'Instrumentation.register'],
          since: new Date(Date.now() - LOGS_WINDOW_MS),
        })
        const tree = printSpanTree(spans)
        if (
          [
            'start, middleware',
            'start, proxy',
            'start (webpack), middleware',
            'start (webpack), proxy',
            'dev, middleware',
            'dev, proxy',
            'dev (webpack), middleware',
            'dev (webpack), proxy',
            'start, cache components, middleware',
            'start, cache components, proxy',
            'dev, cache components, middleware',
            'dev, cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
             "[trace A] load instrumentation module (Instrumentation.loadModule)
             [trace B] register instrumentation (Instrumentation.register)"
          `)
        } else {
          // Not observed yet (filled from CI).
          expect(tree).toMatchInlineSnapshot()
        }
      }
    )
  }
)

// Self-hosted behind a custom server whose HTTP server wraps every request in
// an active host span (like an APM's HTTP instrumentation, see
// `custom-server.js`): the middleware and the render join the host span's
// trace. Custom servers can't be deployed, so this block is skipped when
// deployed. (Not with `skipDeployment`: its `it.only` would also skip the
// deployed tests above.)
;(isNextDeploy ? describe.skip : describe).each(VARIANTS)(
  'otel-middleware-trace - custom server with $name',
  ({ file, exportName }) => {
    const { next, isTurbopack } = nextTestSetup({
      files: __dirname,
      overrideFiles: {
        [file]: middlewareEntry(exportName),
      },
      dependencies: { ...DEPENDENCIES, 'get-port': '5.1.1' },
      startCommand: 'node custom-server.js',
      serverReadyPattern: /- Local:/,
      env: {
        NEXT_TELEMETRY_DISABLED: '1',
        NODE_ENV: isNextDev ? 'development' : 'production',
      },
    })
    const env = getTestEnv(isTurbopack, exportName)

    traceTest(
      'traces a page rendered after NextResponse.next() in the host span trace',
      async () => {
        const res = await next.fetch('/page')
        expect(res.status).toBe(200)
        expectNoInternalHeaders(res)
        const tree = await getSpanTree(next, res, 'html')
        if (
          [
            'start, middleware',
            'start, proxy',
            'start (webpack), middleware',
            'start (webpack), proxy',
            'dev, middleware',
            'dev, proxy',
            'dev (webpack), middleware',
            'dev (webpack), proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
             "[trace A] custom-server-request {http.route=/page}
             └─ GET (BaseServer.handleRequest) {http.target=/page, http.status_code=200} [error: doesn't cover descendants]
                ├─ GET /page (BaseServer.handleRequest) {http.target=/page, http.route=/page, next.route=/page, http.status_code=200}
                │  ├─ NextNodeServer.clientComponentLoading
                │  ├─ prepare route module (RouteModule.prepare)
                │  ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
                │  │  ├─ build component tree (NextNodeServer.createComponentTree)
                │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                │  │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
                │  │  ├─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
                │  │  └─ start response (NextNodeServer.startResponse)
                │  └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
                │     └─ load route module (LoadComponents.loadRouteModule)
                └─ middleware GET (Middleware.execute) {http.target=/page}"
          `)
        } else if (
          [
            'start, cache components, middleware',
            'start, cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
             "[trace A] custom-server-request {http.route=/page}
             └─ GET (BaseServer.handleRequest) {http.target=/page, http.status_code=200} [error: doesn't cover descendants]
                ├─ GET /page (BaseServer.handleRequest) {http.target=/page, http.route=/page, next.route=/page, http.status_code=200}
                │  ├─ NextNodeServer.clientComponentLoading
                │  ├─ prepare route module (RouteModule.prepare)
                │  ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
                │  │  ├─ build component tree (NextNodeServer.createComponentTree)
                │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                │  │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
                │  │  └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
                │  ├─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
                │  │  └─ load route module (LoadComponents.loadRouteModule)
                │  └─ start response (NextNodeServer.startResponse)
                └─ middleware GET (Middleware.execute) {http.target=/page}"
          `)
        } else if (
          [
            'dev, cache components, middleware',
            'dev, cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
             "[trace A] custom-server-request {http.route=/page}
             └─ GET (BaseServer.handleRequest) {http.target=/page, http.status_code=200} [error: doesn't cover descendants]
                ├─ GET /page (BaseServer.handleRequest) {http.target=/page, http.route=/page, next.route=/page, http.status_code=200}
                │  ├─ NextNodeServer.clientComponentLoading
                │  ├─ prepare route module (RouteModule.prepare)
                │  ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
                │  │  ├─ build component tree (NextNodeServer.createComponentTree)
                │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                │  │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
                │  │  ├─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
                │  │  └─ start response (NextNodeServer.startResponse)
                │  └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
                │     └─ load route module (LoadComponents.loadRouteModule)
                └─ middleware GET (Middleware.execute) {http.target=/page}"
          `)
        } else {
          // Not observed yet (filled from CI).
          expect(tree).toMatchInlineSnapshot()
        }
      }
    )

    traceTest(
      'forwards trace headers to the render with an incoming tracestate',
      async () => {
        const incoming = newTraceContext('incoming')
        const res = await next.fetch('/user-overrides', {
          headers: {
            traceparent: toTraceparent(incoming),
            tracestate: 'incoming=1',
          },
        })
        expect(res.status).toBe(200)
        const echoed = JSON.parse(
          cheerio
            .load(await res.text())('#headers')
            .text()
        )
        // The active host span wins over the incoming `traceparent`, so the
        // render continues the host span's trace, whose context has no
        // `tracestate`: the incoming one must not be paired with it.
        expect(echoed.traceparent).toMatch(
          /^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/
        )
        expect(echoed.traceparent).not.toContain(incoming.traceId)
        expect(echoed.tracestate).toBeUndefined()
      }
    )

    traceTest(
      'respects a traceparent explicitly set by middleware over the host span',
      async () => {
        const setByMiddleware = newTraceContext('set by middleware')
        const res = await next.fetch('/user-traceparent', {
          headers: { 'x-test-traceparent': toTraceparent(setByMiddleware) },
        })
        expect(res.status).toBe(200)
        expectNoInternalHeaders(res)
        const tree = await getSpanTree(next, res, 'html', {
          known: [setByMiddleware],
        })
        if (
          [
            'start, middleware',
            'start, proxy',
            'start (webpack), middleware',
            'start (webpack), proxy',
            'dev, middleware',
            'dev, proxy',
            'dev (webpack), middleware',
            'dev (webpack), proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
             "[trace A] custom-server-request {http.route=/headers-echo}
             └─ GET (BaseServer.handleRequest) {http.target=/user-traceparent, http.status_code=200}
                └─ middleware GET (Middleware.execute) {http.target=/user-traceparent}
             [trace set by middleware] [set by middleware traceparent]
             └─ GET /headers-echo (BaseServer.handleRequest) {http.target=/user-traceparent, http.route=/headers-echo, next.route=/headers-echo, http.status_code=200}
                ├─ NextNodeServer.clientComponentLoading
                ├─ prepare route module (RouteModule.prepare)
                ├─ render route (app) /headers-echo (AppRender.getBodyResult) {next.route=/headers-echo}
                │  ├─ build component tree (NextNodeServer.createComponentTree)
                │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                │  ├─ generateMetadata /headers-echo/page (ResolveMetadata.generateMetadata)
                │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
                │  └─ start response (NextNodeServer.startResponse)
                └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/headers-echo}
                   └─ load route module (LoadComponents.loadRouteModule)"
          `)
        } else if (
          [
            'start, cache components, middleware',
            'start, cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
             "[trace A] custom-server-request {http.route=/headers-echo}
             └─ GET (BaseServer.handleRequest) {http.target=/user-traceparent, http.status_code=200}
                └─ middleware GET (Middleware.execute) {http.target=/user-traceparent}
             [trace set by middleware] [set by middleware traceparent]
             └─ GET /headers-echo (BaseServer.handleRequest) {http.target=/user-traceparent, http.route=/headers-echo, next.route=/headers-echo, http.status_code=200}
                ├─ NextNodeServer.clientComponentLoading
                ├─ prepare route module (RouteModule.prepare)
                ├─ render route (app) /headers-echo (AppRender.getBodyResult) {next.route=/headers-echo}
                │  ├─ build component tree (NextNodeServer.createComponentTree)
                │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                │  ├─ generateMetadata /headers-echo/page (ResolveMetadata.generateMetadata)
                │  └─ generateMetadata /layout (ResolveMetadata.generateMetadata)
                ├─ resolve page components (NextNodeServer.findPageComponents) {next.route=/headers-echo}
                │  └─ load route module (LoadComponents.loadRouteModule)
                └─ start response (NextNodeServer.startResponse)"
          `)
        } else if (
          [
            'dev, cache components, middleware',
            'dev, cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
             "[trace A] custom-server-request {http.route=/headers-echo}
             └─ GET (BaseServer.handleRequest) {http.target=/user-traceparent, http.status_code=200}
                └─ middleware GET (Middleware.execute) {http.target=/user-traceparent}
             [trace set by middleware] [set by middleware traceparent]
             └─ GET /headers-echo (BaseServer.handleRequest) {http.target=/user-traceparent, http.route=/headers-echo, next.route=/headers-echo, http.status_code=200}
                ├─ NextNodeServer.clientComponentLoading
                ├─ prepare route module (RouteModule.prepare)
                ├─ render route (app) /headers-echo (AppRender.getBodyResult) {next.route=/headers-echo}
                │  ├─ build component tree (NextNodeServer.createComponentTree)
                │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                │  ├─ generateMetadata /headers-echo/page (ResolveMetadata.generateMetadata)
                │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
                │  └─ start response (NextNodeServer.startResponse)
                └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/headers-echo}
                   └─ load route module (LoadComponents.loadRouteModule)"
          `)
        } else {
          // Not observed yet (filled from CI).
          expect(tree).toMatchInlineSnapshot()
        }
      }
    )
  }
)
