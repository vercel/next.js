import { isNextDeploy, isNextDev, nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'
import { isOneTimeSpan, printSpanTree, type TreeSpan } from 'otel-span-tree'

const INCOMING = {
  name: 'incoming',
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  spanId: '00f067aa0ba902b7',
}
// The traceparent `middleware-impl.ts` sets for `/user-traceparent`.
const SET_BY_MIDDLEWARE = {
  name: 'set by middleware',
  traceId: '0af7651916cd43dd8448eb211c80319c',
  spanId: 'b7ad6b7169203331',
}
const INCOMING_TRACEPARENT = `00-${INCOMING.traceId}-${INCOMING.spanId}-01`

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

// The span tree of a request, from the spans the middleware reported in its
// response headers and the render reported in the body. One-time spans (see
// `isOneTimeSpan`) are omitted unless `includeOneTimeSpans` is set.
async function getSpanTree(
  res: Response,
  body: Body,
  { includeOneTimeSpans = false } = {}
) {
  const spans = new Map<string, TreeSpan>()
  const add = (list: TreeSpan[]) => {
    for (const span of list) {
      spans.set(span.id, span)
    }
  }
  add(JSON.parse(res.headers.get('x-mw-spans') ?? '[]'))
  if (body === 'html') {
    add(
      JSON.parse(
        cheerio
          .load(await res.text())('#spans')
          .text()
      )
    )
  } else if (body === 'json') {
    add((await res.json()).spans)
  }
  return printSpanTree([...spans.values()], {
    known: [INCOMING, SET_BY_MIDDLEWARE],
    omit: includeOneTimeSpans ? undefined : isOneTimeSpan,
  })
}

function expectNoInternalHeaders(res: Response) {
  for (const key of res.headers.keys()) {
    expect(key).not.toMatch(/^x-middleware-(request-|override-headers)/)
  }
}

// Pages render differently with Cache Components (also between dev and
// start), so page span trees have a snapshot per render mode.
const renderMode = !process.env.__NEXT_CACHE_COMPONENTS
  ? 'default'
  : isNextDev
    ? 'cache components, dev'
    : 'cache components'

// The trace of every request is asserted as a span tree snapshot (see
// `printSpanTree`). There is no collector (so the suite also works when
// deployed): the app reports the spans itself (see `trace-recorder.ts`). The
// middleware reports its span, its ancestors, and the descendants of the
// topmost of them started so far; the render its request span, that span's
// ancestors, and the descendants started before the page or route handler
// reports. Spans started in another process (e.g. next-server's
// spans for Edge middleware, or the platform's when deployed) show up as
// `[remote]` parents. Deployed apps have their own snapshots: the platform
// invokes the middleware and the render separately, and the render's request
// span is named after its entrypoint (e.g. `GET /page/page`). With Cache
// Components, deployed pages are rendered in a `POST` resume request.
describe.each(VARIANTS)(
  'otel-middleware-trace - $name',
  ({ file, exportName }) => {
    const { next } = nextTestSetup({
      files: __dirname,
      overrideFiles: {
        [file]: middlewareEntry(exportName),
      },
      dependencies: DEPENDENCIES,
    })

    // The first request, so the tree includes the one-time spans (e.g.
    // `instrumentation.ts` registration) of the first request an instance serves.
    it('traces a page rendered after NextResponse.next()', async () => {
      const res = await next.fetch('/page')
      expect(res.status).toBe(200)
      expectNoInternalHeaders(res)
      const tree = await getSpanTree(res, 'html', { includeOneTimeSpans: true })
      if (isNextDeploy) {
        if (renderMode === 'default') {
          expect(tree).toMatchInlineSnapshot(`
           "[trace A] GET /page/page (BaseServer.handleRequest) {http.target=/page}
           ├─ prepare route module (RouteModule.prepare)
           └─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
              ├─ build component tree (NextNodeServer.createComponentTree)
              │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
              └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
           [trace B] middleware GET (Middleware.execute) {http.target=/page}"
          `)
        } else {
          expect(tree).toMatchInlineSnapshot(`
           "[trace A] middleware GET (Middleware.execute) {http.target=/page}
           [trace B] POST /page/page (BaseServer.handleRequest) {http.target=/page}
           ├─ prepare route module (RouteModule.prepare)
           └─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
              ├─ build component tree (NextNodeServer.createComponentTree)
              │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
              └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)"
          `)
        }
      } else if (renderMode === 'cache components, dev') {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET (BaseServer.handleRequest) {http.target=/page, http.status_code=200}
         ├─ prepare route module (RouteModule.prepare)
         ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
         │  ├─ build component tree (NextNodeServer.createComponentTree)
         │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
         │  ├─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
         │  └─ start response (NextNodeServer.startResponse)
         └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
            └─ load route module (LoadComponents.loadRouteModule)
         [trace B] middleware GET (Middleware.execute) {http.target=/page}"
        `)
      } else if (renderMode === 'cache components') {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET (BaseServer.handleRequest) {http.target=/page}
         ├─ prepare route module (RouteModule.prepare)
         ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
         │  ├─ build component tree (NextNodeServer.createComponentTree)
         │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
         │  └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
         ├─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
         │  └─ load route module (LoadComponents.loadRouteModule)
         └─ start response (NextNodeServer.startResponse)
         [trace B] middleware GET (Middleware.execute) {http.target=/page}"
        `)
      } else {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET (BaseServer.handleRequest) {http.target=/page}
         ├─ prepare route module (RouteModule.prepare)
         ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
         │  ├─ build component tree (NextNodeServer.createComponentTree)
         │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
         │  └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
         └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
            └─ load route module (LoadComponents.loadRouteModule)
         [trace B] middleware GET (Middleware.execute) {http.target=/page}"
        `)
      }
    })

    it('traces a route handler executed after NextResponse.next()', async () => {
      const res = await next.fetch('/route-handler')
      expect(res.status).toBe(200)
      expectNoInternalHeaders(res)
      const tree = await getSpanTree(res, 'json')
      if (isNextDeploy) {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET /route-handler/route (BaseServer.handleRequest) {http.target=/route-handler}
         ├─ executing api route (app) /route-handler (AppRouteRouteHandlers.runHandler) {next.route=/route-handler}
         └─ prepare route module (RouteModule.prepare)
         [trace B] middleware GET (Middleware.execute) {http.target=/route-handler}"
        `)
      } else {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET (BaseServer.handleRequest) {http.target=/route-handler}
         ├─ executing api route (app) /route-handler (AppRouteRouteHandlers.runHandler) {next.route=/route-handler}
         ├─ prepare route module (RouteModule.prepare)
         └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/route-handler}
            └─ load route module (LoadComponents.loadRouteModule)
         [trace B] middleware GET (Middleware.execute) {http.target=/route-handler}"
        `)
      }
    })

    it('traces a rewritten page', async () => {
      const res = await next.fetch('/rewrite')
      expect(res.status).toBe(200)
      expectNoInternalHeaders(res)
      const tree = await getSpanTree(res, 'html')
      if (isNextDeploy) {
        if (renderMode === 'default') {
          expect(tree).toMatchInlineSnapshot(`
           "[trace A] GET /page/page (BaseServer.handleRequest) {http.target=/rewrite}
           ├─ prepare route module (RouteModule.prepare)
           └─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
              ├─ build component tree (NextNodeServer.createComponentTree)
              │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
              └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
           [trace B] middleware GET (Middleware.execute) {http.target=/rewrite}"
          `)
        } else {
          expect(tree).toMatchInlineSnapshot(`
           "[trace A] middleware GET (Middleware.execute) {http.target=/rewrite}
           [trace B] POST /page/page (BaseServer.handleRequest) {http.target=/rewrite}
           ├─ prepare route module (RouteModule.prepare)
           └─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
              ├─ build component tree (NextNodeServer.createComponentTree)
              │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
              └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)"
          `)
        }
      } else if (renderMode === 'cache components, dev') {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET (BaseServer.handleRequest) {http.target=/rewrite, http.status_code=200}
         ├─ prepare route module (RouteModule.prepare)
         ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
         │  ├─ build component tree (NextNodeServer.createComponentTree)
         │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
         │  ├─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
         │  └─ start response (NextNodeServer.startResponse)
         └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
            └─ load route module (LoadComponents.loadRouteModule)
         [trace B] middleware GET (Middleware.execute) {http.target=/rewrite}"
        `)
      } else if (renderMode === 'cache components') {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET (BaseServer.handleRequest) {http.target=/rewrite}
         ├─ prepare route module (RouteModule.prepare)
         ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
         │  ├─ build component tree (NextNodeServer.createComponentTree)
         │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
         │  └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
         ├─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
         │  └─ load route module (LoadComponents.loadRouteModule)
         └─ start response (NextNodeServer.startResponse)
         [trace B] middleware GET (Middleware.execute) {http.target=/rewrite}"
        `)
      } else {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET (BaseServer.handleRequest) {http.target=/rewrite}
         ├─ prepare route module (RouteModule.prepare)
         ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
         │  ├─ build component tree (NextNodeServer.createComponentTree)
         │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
         │  └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
         └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
            └─ load route module (LoadComponents.loadRouteModule)
         [trace B] middleware GET (Middleware.execute) {http.target=/rewrite}"
        `)
      }
    })

    it('traces a middleware redirect', async () => {
      const res = await next.fetch('/redirect', { redirect: 'manual' })
      expect(res.status).toBe(307)
      expectNoInternalHeaders(res)
      const tree = await getSpanTree(res, 'none')
      if (isNextDeploy) {
        expect(tree).toMatchInlineSnapshot(
          `"[trace A] middleware GET (Middleware.execute) {http.target=/redirect}"`
        )
      } else {
        expect(tree).toMatchInlineSnapshot(
          `"[trace A] middleware GET (Middleware.execute) {http.target=/redirect}"`
        )
      }
    })

    it('traces a direct middleware response', async () => {
      const res = await next.fetch('/direct')
      expect(res.status).toBe(200)
      expect(await res.clone().text()).toBe('direct response from middleware')
      expectNoInternalHeaders(res)
      const tree = await getSpanTree(res, 'none')
      if (isNextDeploy) {
        expect(tree).toMatchInlineSnapshot(
          `"[trace A] middleware GET (Middleware.execute) {http.target=/direct}"`
        )
      } else {
        expect(tree).toMatchInlineSnapshot(
          `"[trace A] middleware GET (Middleware.execute) {http.target=/direct}"`
        )
      }
    })

    it('traces a request the middleware does not match', async () => {
      const res = await next.fetch('/unmatched')
      expect(res.status).toBe(200)
      expect(res.headers.get('x-mw-spans')).toBeNull()
      expectNoInternalHeaders(res)
      const tree = await getSpanTree(res, 'html')
      if (isNextDeploy) {
        if (renderMode === 'default') {
          expect(tree).toMatchInlineSnapshot(`
           "[trace A] GET /unmatched/page (BaseServer.handleRequest) {http.target=/unmatched}
           ├─ prepare route module (RouteModule.prepare)
           └─ render route (app) /unmatched (AppRender.getBodyResult) {next.route=/unmatched}
              ├─ build component tree (NextNodeServer.createComponentTree)
              │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
              └─ generateMetadata /unmatched/page (ResolveMetadata.generateMetadata)"
          `)
        } else {
          expect(tree).toMatchInlineSnapshot(`
           "[trace A] POST /unmatched/page (BaseServer.handleRequest) {http.target=/unmatched}
           ├─ prepare route module (RouteModule.prepare)
           └─ render route (app) /unmatched (AppRender.getBodyResult) {next.route=/unmatched}
              ├─ build component tree (NextNodeServer.createComponentTree)
              │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
              └─ generateMetadata /unmatched/page (ResolveMetadata.generateMetadata)"
          `)
        }
      } else if (renderMode === 'cache components, dev') {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET (BaseServer.handleRequest) {http.target=/unmatched, http.status_code=200}
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
      } else if (renderMode === 'cache components') {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET (BaseServer.handleRequest) {http.target=/unmatched}
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
      } else {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET (BaseServer.handleRequest) {http.target=/unmatched}
         ├─ prepare route module (RouteModule.prepare)
         ├─ render route (app) /unmatched (AppRender.getBodyResult) {next.route=/unmatched}
         │  ├─ build component tree (NextNodeServer.createComponentTree)
         │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
         │  └─ generateMetadata /unmatched/page (ResolveMetadata.generateMetadata)
         └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/unmatched}
            └─ load route module (LoadComponents.loadRouteModule)"
        `)
      }
    })

    it('traces /page with an incoming traceparent', async () => {
      const res = await next.fetch('/page', {
        headers: { traceparent: INCOMING_TRACEPARENT },
      })
      expect(res.status).toBe(200)
      expectNoInternalHeaders(res)
      const tree = await getSpanTree(res, 'html')
      if (isNextDeploy) {
        if (renderMode === 'default') {
          expect(tree).toMatchInlineSnapshot(`
           "[trace incoming] [incoming traceparent]
           ├─ GET /page/page (BaseServer.handleRequest) {http.target=/page}
           │  ├─ prepare route module (RouteModule.prepare)
           │  └─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
           │     ├─ build component tree (NextNodeServer.createComponentTree)
           │     │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
           │     │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
           │     ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
           │     └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
           └─ middleware GET (Middleware.execute) {http.target=/page}"
          `)
        } else {
          expect(tree).toMatchInlineSnapshot(`
           "[trace incoming] [incoming traceparent]
           ├─ middleware GET (Middleware.execute) {http.target=/page}
           └─ POST /page/page (BaseServer.handleRequest) {http.target=/page}
              ├─ prepare route module (RouteModule.prepare)
              └─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
                 ├─ build component tree (NextNodeServer.createComponentTree)
                 │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                 │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                 ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
                 └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)"
          `)
        }
      } else if (renderMode === 'cache components, dev') {
        expect(tree).toMatchInlineSnapshot(`
         "[trace incoming] [incoming traceparent]
         ├─ GET (BaseServer.handleRequest) {http.target=/page, http.status_code=200}
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
      } else if (renderMode === 'cache components') {
        expect(tree).toMatchInlineSnapshot(`
         "[trace incoming] [incoming traceparent]
         ├─ GET (BaseServer.handleRequest) {http.target=/page}
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
      } else {
        expect(tree).toMatchInlineSnapshot(`
         "[trace incoming] [incoming traceparent]
         ├─ GET (BaseServer.handleRequest) {http.target=/page}
         │  ├─ prepare route module (RouteModule.prepare)
         │  ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
         │  │  ├─ build component tree (NextNodeServer.createComponentTree)
         │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │  │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
         │  │  └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
         │  └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
         │     └─ load route module (LoadComponents.loadRouteModule)
         └─ middleware GET (Middleware.execute) {http.target=/page}"
        `)
      }
    })

    it('traces /route-handler with an incoming traceparent', async () => {
      const res = await next.fetch('/route-handler', {
        headers: { traceparent: INCOMING_TRACEPARENT },
      })
      expect(res.status).toBe(200)
      expectNoInternalHeaders(res)
      const tree = await getSpanTree(res, 'json')
      if (isNextDeploy) {
        expect(tree).toMatchInlineSnapshot(`
         "[trace incoming] [incoming traceparent]
         ├─ GET /route-handler/route (BaseServer.handleRequest) {http.target=/route-handler}
         │  ├─ executing api route (app) /route-handler (AppRouteRouteHandlers.runHandler) {next.route=/route-handler}
         │  └─ prepare route module (RouteModule.prepare)
         └─ middleware GET (Middleware.execute) {http.target=/route-handler}"
        `)
      } else {
        expect(tree).toMatchInlineSnapshot(`
         "[trace incoming] [incoming traceparent]
         ├─ GET (BaseServer.handleRequest) {http.target=/route-handler}
         │  ├─ executing api route (app) /route-handler (AppRouteRouteHandlers.runHandler) {next.route=/route-handler}
         │  ├─ prepare route module (RouteModule.prepare)
         │  └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/route-handler}
         │     └─ load route module (LoadComponents.loadRouteModule)
         └─ middleware GET (Middleware.execute) {http.target=/route-handler}"
        `)
      }
    })

    it('traces /rewrite with an incoming traceparent', async () => {
      const res = await next.fetch('/rewrite', {
        headers: { traceparent: INCOMING_TRACEPARENT },
      })
      expect(res.status).toBe(200)
      expectNoInternalHeaders(res)
      const tree = await getSpanTree(res, 'html')
      if (isNextDeploy) {
        if (renderMode === 'default') {
          expect(tree).toMatchInlineSnapshot(`
           "[trace incoming] [incoming traceparent]
           ├─ GET /page/page (BaseServer.handleRequest) {http.target=/rewrite}
           │  ├─ prepare route module (RouteModule.prepare)
           │  └─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
           │     ├─ build component tree (NextNodeServer.createComponentTree)
           │     │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
           │     │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
           │     ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
           │     └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
           └─ middleware GET (Middleware.execute) {http.target=/rewrite}"
          `)
        } else {
          expect(tree).toMatchInlineSnapshot(`
           "[trace incoming] [incoming traceparent]
           ├─ middleware GET (Middleware.execute) {http.target=/rewrite}
           └─ POST /page/page (BaseServer.handleRequest) {http.target=/rewrite}
              ├─ prepare route module (RouteModule.prepare)
              └─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
                 ├─ build component tree (NextNodeServer.createComponentTree)
                 │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                 │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                 ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
                 └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)"
          `)
        }
      } else if (renderMode === 'cache components, dev') {
        expect(tree).toMatchInlineSnapshot(`
         "[trace incoming] [incoming traceparent]
         ├─ GET (BaseServer.handleRequest) {http.target=/rewrite, http.status_code=200}
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
      } else if (renderMode === 'cache components') {
        expect(tree).toMatchInlineSnapshot(`
         "[trace incoming] [incoming traceparent]
         ├─ GET (BaseServer.handleRequest) {http.target=/rewrite}
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
      } else {
        expect(tree).toMatchInlineSnapshot(`
         "[trace incoming] [incoming traceparent]
         ├─ GET (BaseServer.handleRequest) {http.target=/rewrite}
         │  ├─ prepare route module (RouteModule.prepare)
         │  ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
         │  │  ├─ build component tree (NextNodeServer.createComponentTree)
         │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │  │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
         │  │  └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
         │  └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
         │     └─ load route module (LoadComponents.loadRouteModule)
         └─ middleware GET (Middleware.execute) {http.target=/rewrite}"
        `)
      }
    })

    it('still applies request header overrides set by middleware', async () => {
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
      const tree = await getSpanTree(res, 'html')
      if (isNextDeploy) {
        if (renderMode === 'default') {
          expect(tree).toMatchInlineSnapshot(`
           "[trace A] GET /headers-echo/page (BaseServer.handleRequest) {http.target=/user-overrides}
           ├─ prepare route module (RouteModule.prepare)
           └─ render route (app) /headers-echo (AppRender.getBodyResult) {next.route=/headers-echo}
              ├─ build component tree (NextNodeServer.createComponentTree)
              │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              ├─ generateMetadata /headers-echo/page (ResolveMetadata.generateMetadata)
              └─ generateMetadata /layout (ResolveMetadata.generateMetadata)
           [trace B] middleware GET (Middleware.execute) {http.target=/user-overrides}"
          `)
        } else {
          expect(tree).toMatchInlineSnapshot(`
           "[trace A] middleware GET (Middleware.execute) {http.target=/user-overrides}
           [trace B] POST /headers-echo/page (BaseServer.handleRequest) {http.target=/user-overrides}
           ├─ prepare route module (RouteModule.prepare)
           └─ render route (app) /headers-echo (AppRender.getBodyResult) {next.route=/headers-echo}
              ├─ build component tree (NextNodeServer.createComponentTree)
              │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
              ├─ generateMetadata /headers-echo/page (ResolveMetadata.generateMetadata)
              └─ generateMetadata /layout (ResolveMetadata.generateMetadata)"
          `)
        }
      } else if (renderMode === 'cache components, dev') {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET (BaseServer.handleRequest) {http.target=/user-overrides, http.status_code=200}
         ├─ prepare route module (RouteModule.prepare)
         ├─ render route (app) /headers-echo (AppRender.getBodyResult) {next.route=/headers-echo}
         │  ├─ build component tree (NextNodeServer.createComponentTree)
         │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │  ├─ generateMetadata /headers-echo/page (ResolveMetadata.generateMetadata)
         │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
         │  └─ start response (NextNodeServer.startResponse)
         └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/headers-echo}
            └─ load route module (LoadComponents.loadRouteModule)
         [trace B] middleware GET (Middleware.execute) {http.target=/user-overrides}"
        `)
      } else if (renderMode === 'cache components') {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET (BaseServer.handleRequest) {http.target=/user-overrides}
         ├─ prepare route module (RouteModule.prepare)
         ├─ render route (app) /headers-echo (AppRender.getBodyResult) {next.route=/headers-echo}
         │  ├─ build component tree (NextNodeServer.createComponentTree)
         │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │  ├─ generateMetadata /headers-echo/page (ResolveMetadata.generateMetadata)
         │  └─ generateMetadata /layout (ResolveMetadata.generateMetadata)
         ├─ resolve page components (NextNodeServer.findPageComponents) {next.route=/headers-echo}
         │  └─ load route module (LoadComponents.loadRouteModule)
         └─ start response (NextNodeServer.startResponse)
         [trace B] middleware GET (Middleware.execute) {http.target=/user-overrides}"
        `)
      } else {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET (BaseServer.handleRequest) {http.target=/user-overrides}
         ├─ prepare route module (RouteModule.prepare)
         ├─ render route (app) /headers-echo (AppRender.getBodyResult) {next.route=/headers-echo}
         │  ├─ build component tree (NextNodeServer.createComponentTree)
         │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │  ├─ generateMetadata /headers-echo/page (ResolveMetadata.generateMetadata)
         │  └─ generateMetadata /layout (ResolveMetadata.generateMetadata)
         └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/headers-echo}
            └─ load route module (LoadComponents.loadRouteModule)
         [trace B] middleware GET (Middleware.execute) {http.target=/user-overrides}"
        `)
      }
    })

    // A traceparent the middleware explicitly sets is respected: the render
    // continues it.
    it('respects a traceparent explicitly set by middleware', async () => {
      const res = await next.fetch('/user-traceparent')
      expect(res.status).toBe(200)
      expectNoInternalHeaders(res)
      const tree = await getSpanTree(res, 'html')
      if (isNextDeploy) {
        if (renderMode === 'default') {
          expect(tree).toMatchInlineSnapshot(`
           "[trace A] middleware GET (Middleware.execute) {http.target=/user-traceparent}
           [trace set by middleware] [set by middleware traceparent]
           └─ GET /headers-echo/page (BaseServer.handleRequest) {http.target=/user-traceparent}
              ├─ prepare route module (RouteModule.prepare)
              └─ render route (app) /headers-echo (AppRender.getBodyResult) {next.route=/headers-echo}
                 ├─ build component tree (NextNodeServer.createComponentTree)
                 │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                 │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                 ├─ generateMetadata /headers-echo/page (ResolveMetadata.generateMetadata)
                 └─ generateMetadata /layout (ResolveMetadata.generateMetadata)"
          `)
        } else {
          expect(tree).toMatchInlineSnapshot(`
           "[trace A] middleware GET (Middleware.execute) {http.target=/user-traceparent}
           [trace set by middleware] [set by middleware traceparent]
           └─ POST /headers-echo/page (BaseServer.handleRequest) {http.target=/user-traceparent}
              ├─ prepare route module (RouteModule.prepare)
              └─ render route (app) /headers-echo (AppRender.getBodyResult) {next.route=/headers-echo}
                 ├─ build component tree (NextNodeServer.createComponentTree)
                 │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                 │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                 ├─ generateMetadata /headers-echo/page (ResolveMetadata.generateMetadata)
                 └─ generateMetadata /layout (ResolveMetadata.generateMetadata)"
          `)
        }
      } else if (renderMode === 'cache components, dev') {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] middleware GET (Middleware.execute) {http.target=/user-traceparent}
         [trace set by middleware] [set by middleware traceparent]
         └─ GET (BaseServer.handleRequest) {http.target=/user-traceparent, http.status_code=200}
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
      } else if (renderMode === 'cache components') {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] middleware GET (Middleware.execute) {http.target=/user-traceparent}
         [trace set by middleware] [set by middleware traceparent]
         └─ GET (BaseServer.handleRequest) {http.target=/user-traceparent}
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
      } else {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] middleware GET (Middleware.execute) {http.target=/user-traceparent}
         [trace set by middleware] [set by middleware traceparent]
         └─ GET (BaseServer.handleRequest) {http.target=/user-traceparent}
            ├─ prepare route module (RouteModule.prepare)
            ├─ render route (app) /headers-echo (AppRender.getBodyResult) {next.route=/headers-echo}
            │  ├─ build component tree (NextNodeServer.createComponentTree)
            │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │  ├─ generateMetadata /headers-echo/page (ResolveMetadata.generateMetadata)
            │  └─ generateMetadata /layout (ResolveMetadata.generateMetadata)
            └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/headers-echo}
               └─ load route module (LoadComponents.loadRouteModule)"
        `)
      }
    })
  }
)

// Self-hosted behind a custom server whose HTTP server wraps every request in
// an active host span (like an APM's HTTP instrumentation, see
// `custom-server.js`). Custom servers can't be deployed, so this block is
// skipped when deployed. (Not with `skipDeployment`: its `it.only` would also
// skip the deployed tests above.)
;(isNextDeploy ? describe.skip : describe).each(VARIANTS)(
  'otel-middleware-trace - custom server with $name',
  ({ file, exportName }) => {
    const { next } = nextTestSetup({
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

    it('traces a page rendered after NextResponse.next() in the host span trace', async () => {
      const res = await next.fetch('/page')
      expect(res.status).toBe(200)
      expectNoInternalHeaders(res)
      const tree = await getSpanTree(res, 'html')
      if (renderMode === 'cache components, dev') {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] custom-server-request
         └─ GET (BaseServer.handleRequest) {http.target=/page, http.status_code=200}
            ├─ prepare route module (RouteModule.prepare)
            ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
            │  ├─ build component tree (NextNodeServer.createComponentTree)
            │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
            │  ├─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
            │  └─ start response (NextNodeServer.startResponse)
            └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
               └─ load route module (LoadComponents.loadRouteModule)
         [trace B] middleware GET (Middleware.execute) {http.target=/page}"
        `)
      } else if (renderMode === 'cache components') {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] custom-server-request
         └─ GET (BaseServer.handleRequest) {http.target=/page}
            ├─ prepare route module (RouteModule.prepare)
            ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
            │  ├─ build component tree (NextNodeServer.createComponentTree)
            │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
            │  └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
            ├─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
            │  └─ load route module (LoadComponents.loadRouteModule)
            └─ start response (NextNodeServer.startResponse)
         [trace B] middleware GET (Middleware.execute) {http.target=/page}"
        `)
      } else {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] custom-server-request
         └─ GET (BaseServer.handleRequest) {http.target=/page}
            ├─ prepare route module (RouteModule.prepare)
            ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
            │  ├─ build component tree (NextNodeServer.createComponentTree)
            │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
            │  └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
            └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
               └─ load route module (LoadComponents.loadRouteModule)
         [trace B] middleware GET (Middleware.execute) {http.target=/page}"
        `)
      }
    })

    it('forwards trace headers to the render with an incoming tracestate', async () => {
      const res = await next.fetch('/user-overrides', {
        headers: {
          traceparent: INCOMING_TRACEPARENT,
          tracestate: 'incoming=1',
        },
      })
      expect(res.status).toBe(200)
      const echoed = JSON.parse(
        cheerio
          .load(await res.text())('#headers')
          .text()
      )
      // The middleware doesn't forward its trace context: the render receives
      // the incoming trace headers unchanged.
      expect({
        traceparent: echoed.traceparent,
        tracestate: echoed.tracestate,
      }).toEqual({
        traceparent: INCOMING_TRACEPARENT,
        tracestate: 'incoming=1',
      })
    })

    it('respects a traceparent explicitly set by middleware over the host span', async () => {
      const res = await next.fetch('/user-traceparent')
      expect(res.status).toBe(200)
      expectNoInternalHeaders(res)
      const tree = await getSpanTree(res, 'html')
      if (renderMode === 'cache components, dev') {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] custom-server-request
         └─ GET (BaseServer.handleRequest) {http.target=/user-traceparent, http.status_code=200}
            ├─ prepare route module (RouteModule.prepare)
            ├─ render route (app) /headers-echo (AppRender.getBodyResult) {next.route=/headers-echo}
            │  ├─ build component tree (NextNodeServer.createComponentTree)
            │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │  ├─ generateMetadata /headers-echo/page (ResolveMetadata.generateMetadata)
            │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
            │  └─ start response (NextNodeServer.startResponse)
            └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/headers-echo}
               └─ load route module (LoadComponents.loadRouteModule)
         [trace B] middleware GET (Middleware.execute) {http.target=/user-traceparent}"
        `)
      } else if (renderMode === 'cache components') {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] custom-server-request
         └─ GET (BaseServer.handleRequest) {http.target=/user-traceparent}
            ├─ prepare route module (RouteModule.prepare)
            ├─ render route (app) /headers-echo (AppRender.getBodyResult) {next.route=/headers-echo}
            │  ├─ build component tree (NextNodeServer.createComponentTree)
            │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │  ├─ generateMetadata /headers-echo/page (ResolveMetadata.generateMetadata)
            │  └─ generateMetadata /layout (ResolveMetadata.generateMetadata)
            ├─ resolve page components (NextNodeServer.findPageComponents) {next.route=/headers-echo}
            │  └─ load route module (LoadComponents.loadRouteModule)
            └─ start response (NextNodeServer.startResponse)
         [trace B] middleware GET (Middleware.execute) {http.target=/user-traceparent}"
        `)
      } else {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] custom-server-request
         └─ GET (BaseServer.handleRequest) {http.target=/user-traceparent}
            ├─ prepare route module (RouteModule.prepare)
            ├─ render route (app) /headers-echo (AppRender.getBodyResult) {next.route=/headers-echo}
            │  ├─ build component tree (NextNodeServer.createComponentTree)
            │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │  ├─ generateMetadata /headers-echo/page (ResolveMetadata.generateMetadata)
            │  └─ generateMetadata /layout (ResolveMetadata.generateMetadata)
            └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/headers-echo}
               └─ load route module (LoadComponents.loadRouteModule)
         [trace B] middleware GET (Middleware.execute) {http.target=/user-traceparent}"
        `)
      }
    })
  }
)
