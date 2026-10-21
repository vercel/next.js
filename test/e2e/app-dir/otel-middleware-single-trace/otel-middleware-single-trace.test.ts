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
// middleware reports its span and its ancestors, and the render its request
// span, that span's ancestors, and the descendants started before the page or
// route handler reports. Spans started in another process (e.g. next-server's
// spans for Edge middleware, or the platform's when deployed) show up as
// `[remote]` parents. Deployed apps have their own snapshots: the platform
// invokes the middleware and the render separately, and the render's request
// span is named after its entrypoint (e.g. `GET /page/page`). With Cache
// Components, deployed pages are rendered in a `POST` resume request.
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
  // in the same process. The Edge sandbox only sees that span's context.
  const isNodeMiddleware = exportName === 'proxy'
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

  // The span tree of a request, from the spans the middleware reported in its
  // response headers and the render reported in the body.
  async function getSpanTree(res: Response, body: Body) {
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
      omit: isOneTimeSpan,
    })
  }

  function expectNoInternalHeaders(res: Response) {
    for (const key of res.headers.keys()) {
      expect(key).not.toMatch(/^x-middleware-(request-|override-headers)/)
    }
  }

  it('traces a page rendered after NextResponse.next()', async () => {
    const res = await next.fetch('/page')
    expect(res.status).toBe(200)
    expectNoInternalHeaders(res)
    const tree = await getSpanTree(res, 'html')
    if (isNextDeploy) {
      if (process.env.__NEXT_CACHE_COMPONENTS) {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET /page (Next.request)
         ├─ middleware GET (Middleware.execute)
         └─ POST /page/page (BaseServer.handleRequest)
            ├─ prepare route module (RouteModule.prepare)
            └─ render route (app) /page (AppRender.getBodyResult)
               └─ build component tree (NextNodeServer.createComponentTree)
                  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)"
        `)
      } else {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET /page (Next.request)
         ├─ GET /page/page (BaseServer.handleRequest)
         │  ├─ prepare route module (RouteModule.prepare)
         │  └─ render route (app) /page (AppRender.getBodyResult)
         │     └─ build component tree (NextNodeServer.createComponentTree)
         │        ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │        └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         └─ middleware GET (Middleware.execute)"
        `)
      }
    } else if (renderMode === 'cache components, dev') {
      expect(tree).toMatchInlineSnapshot(`
       "[trace A] GET (BaseServer.handleRequest)
       ├─ GET (BaseServer.handleRequest)
       │  ├─ prepare route module (RouteModule.prepare)
       │  ├─ render route (app) /page (AppRender.getBodyResult)
       │  │  ├─ build component tree (NextNodeServer.createComponentTree)
       │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
       │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
       │  │  └─ start response (NextNodeServer.startResponse)
       │  └─ resolve page components (NextNodeServer.findPageComponents)
       │     └─ load route module (LoadComponents.loadRouteModule)
       └─ middleware GET (Middleware.execute)"
      `)
    } else if (renderMode === 'cache components') {
      expect(tree).toMatchInlineSnapshot(`
       "[trace A] GET (BaseServer.handleRequest)
       ├─ GET (BaseServer.handleRequest)
       │  ├─ prepare route module (RouteModule.prepare)
       │  ├─ render route (app) /page (AppRender.getBodyResult)
       │  │  └─ build component tree (NextNodeServer.createComponentTree)
       │  │     ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
       │  │     └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
       │  ├─ resolve page components (NextNodeServer.findPageComponents)
       │  │  └─ load route module (LoadComponents.loadRouteModule)
       │  └─ start response (NextNodeServer.startResponse)
       └─ middleware GET (Middleware.execute)"
      `)
    } else {
      expect(tree).toMatchInlineSnapshot(`
       "[trace A] GET (BaseServer.handleRequest)
       ├─ GET (BaseServer.handleRequest)
       │  ├─ prepare route module (RouteModule.prepare)
       │  ├─ render route (app) /page (AppRender.getBodyResult)
       │  │  └─ build component tree (NextNodeServer.createComponentTree)
       │  │     ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
       │  │     └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
       │  └─ resolve page components (NextNodeServer.findPageComponents)
       │     └─ load route module (LoadComponents.loadRouteModule)
       └─ middleware GET (Middleware.execute)"
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
       "[trace A] GET /route-handler (Next.request)
       ├─ GET /route-handler/route (BaseServer.handleRequest)
       │  ├─ executing api route (app) /route-handler (AppRouteRouteHandlers.runHandler)
       │  └─ prepare route module (RouteModule.prepare)
       └─ middleware GET (Middleware.execute)"
      `)
    } else {
      expect(tree).toMatchInlineSnapshot(`
       "[trace A] GET (BaseServer.handleRequest)
       ├─ GET (BaseServer.handleRequest)
       │  ├─ executing api route (app) /route-handler (AppRouteRouteHandlers.runHandler)
       │  ├─ prepare route module (RouteModule.prepare)
       │  └─ resolve page components (NextNodeServer.findPageComponents)
       │     └─ load route module (LoadComponents.loadRouteModule)
       └─ middleware GET (Middleware.execute)"
      `)
    }
  })

  it('traces a rewritten page', async () => {
    const res = await next.fetch('/rewrite')
    expect(res.status).toBe(200)
    expectNoInternalHeaders(res)
    const tree = await getSpanTree(res, 'html')
    if (isNextDeploy) {
      if (process.env.__NEXT_CACHE_COMPONENTS) {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET /rewrite (Next.request)
         ├─ middleware GET (Middleware.execute)
         └─ POST /page/page (BaseServer.handleRequest)
            ├─ prepare route module (RouteModule.prepare)
            └─ render route (app) /page (AppRender.getBodyResult)
               └─ build component tree (NextNodeServer.createComponentTree)
                  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)"
        `)
      } else {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET /rewrite (Next.request)
         ├─ GET /page/page (BaseServer.handleRequest)
         │  ├─ prepare route module (RouteModule.prepare)
         │  └─ render route (app) /page (AppRender.getBodyResult)
         │     └─ build component tree (NextNodeServer.createComponentTree)
         │        ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │        └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         └─ middleware GET (Middleware.execute)"
        `)
      }
    } else if (renderMode === 'cache components, dev') {
      expect(tree).toMatchInlineSnapshot(`
       "[trace A] GET (BaseServer.handleRequest)
       ├─ GET (BaseServer.handleRequest)
       │  ├─ prepare route module (RouteModule.prepare)
       │  ├─ render route (app) /page (AppRender.getBodyResult)
       │  │  ├─ build component tree (NextNodeServer.createComponentTree)
       │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
       │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
       │  │  └─ start response (NextNodeServer.startResponse)
       │  └─ resolve page components (NextNodeServer.findPageComponents)
       │     └─ load route module (LoadComponents.loadRouteModule)
       └─ middleware GET (Middleware.execute)"
      `)
    } else if (renderMode === 'cache components') {
      expect(tree).toMatchInlineSnapshot(`
       "[trace A] GET (BaseServer.handleRequest)
       ├─ GET (BaseServer.handleRequest)
       │  ├─ prepare route module (RouteModule.prepare)
       │  ├─ render route (app) /page (AppRender.getBodyResult)
       │  │  └─ build component tree (NextNodeServer.createComponentTree)
       │  │     ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
       │  │     └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
       │  ├─ resolve page components (NextNodeServer.findPageComponents)
       │  │  └─ load route module (LoadComponents.loadRouteModule)
       │  └─ start response (NextNodeServer.startResponse)
       └─ middleware GET (Middleware.execute)"
      `)
    } else {
      expect(tree).toMatchInlineSnapshot(`
       "[trace A] GET (BaseServer.handleRequest)
       ├─ GET (BaseServer.handleRequest)
       │  ├─ prepare route module (RouteModule.prepare)
       │  ├─ render route (app) /page (AppRender.getBodyResult)
       │  │  └─ build component tree (NextNodeServer.createComponentTree)
       │  │     ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
       │  │     └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
       │  └─ resolve page components (NextNodeServer.findPageComponents)
       │     └─ load route module (LoadComponents.loadRouteModule)
       └─ middleware GET (Middleware.execute)"
      `)
    }
  })

  it('traces a middleware redirect', async () => {
    const res = await next.fetch('/redirect', { redirect: 'manual' })
    expect(res.status).toBe(307)
    expectNoInternalHeaders(res)
    const tree = await getSpanTree(res, 'none')
    if (isNextDeploy) {
      expect(tree).toMatchInlineSnapshot(`
       "[trace A] GET /redirect (Next.request)
       └─ middleware GET (Middleware.execute)"
      `)
    } else if (isNodeMiddleware) {
      expect(tree).toMatchInlineSnapshot(`
       "[trace A] GET (BaseServer.handleRequest)
       └─ middleware GET (Middleware.execute)"
      `)
    } else {
      expect(tree).toMatchInlineSnapshot(`
       "[trace A] [remote]
       └─ middleware GET (Middleware.execute)"
      `)
    }
  })

  it('traces a direct middleware response', async () => {
    const res = await next.fetch('/direct')
    expect(res.status).toBe(200)
    expect(await res.clone().text()).toBe('direct response from middleware')
    expectNoInternalHeaders(res)
    const tree = await getSpanTree(res, 'none')
    if (isNextDeploy) {
      expect(tree).toMatchInlineSnapshot(`
       "[trace A] GET /direct (Next.request)
       └─ middleware GET (Middleware.execute)"
      `)
    } else if (isNodeMiddleware) {
      expect(tree).toMatchInlineSnapshot(`
       "[trace A] GET (BaseServer.handleRequest)
       └─ middleware GET (Middleware.execute)"
      `)
    } else {
      expect(tree).toMatchInlineSnapshot(`
       "[trace A] [remote]
       └─ middleware GET (Middleware.execute)"
      `)
    }
  })

  it('traces a request the middleware does not match', async () => {
    const res = await next.fetch('/unmatched')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-mw-spans')).toBeNull()
    expectNoInternalHeaders(res)
    const tree = await getSpanTree(res, 'html')
    if (isNextDeploy) {
      if (process.env.__NEXT_CACHE_COMPONENTS) {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] POST /unmatched/page (BaseServer.handleRequest)
         ├─ prepare route module (RouteModule.prepare)
         └─ render route (app) /unmatched (AppRender.getBodyResult)
            └─ build component tree (NextNodeServer.createComponentTree)
               ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)"
        `)
      } else {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET /unmatched/page (BaseServer.handleRequest)
         ├─ prepare route module (RouteModule.prepare)
         └─ render route (app) /unmatched (AppRender.getBodyResult)
            └─ build component tree (NextNodeServer.createComponentTree)
               ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)"
        `)
      }
    } else if (renderMode === 'cache components, dev') {
      expect(tree).toMatchInlineSnapshot(`
       "[trace A] GET (BaseServer.handleRequest)
       ├─ prepare route module (RouteModule.prepare)
       ├─ render route (app) /unmatched (AppRender.getBodyResult)
       │  ├─ build component tree (NextNodeServer.createComponentTree)
       │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
       │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
       │  └─ start response (NextNodeServer.startResponse)
       └─ resolve page components (NextNodeServer.findPageComponents)
          └─ load route module (LoadComponents.loadRouteModule)"
      `)
    } else if (renderMode === 'cache components') {
      expect(tree).toMatchInlineSnapshot(`
       "[trace A] GET (BaseServer.handleRequest)
       ├─ prepare route module (RouteModule.prepare)
       ├─ render route (app) /unmatched (AppRender.getBodyResult)
       │  └─ build component tree (NextNodeServer.createComponentTree)
       │     ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
       │     └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
       ├─ resolve page components (NextNodeServer.findPageComponents)
       │  └─ load route module (LoadComponents.loadRouteModule)
       └─ start response (NextNodeServer.startResponse)"
      `)
    } else {
      expect(tree).toMatchInlineSnapshot(`
       "[trace A] GET (BaseServer.handleRequest)
       ├─ prepare route module (RouteModule.prepare)
       ├─ render route (app) /unmatched (AppRender.getBodyResult)
       │  └─ build component tree (NextNodeServer.createComponentTree)
       │     ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
       │     └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
       └─ resolve page components (NextNodeServer.findPageComponents)
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
      if (process.env.__NEXT_CACHE_COMPONENTS) {
        expect(tree).toMatchInlineSnapshot(`
         "[trace incoming] [incoming traceparent]
         ├─ middleware GET (Middleware.execute)
         └─ POST /page/page (BaseServer.handleRequest)
            ├─ prepare route module (RouteModule.prepare)
            └─ render route (app) /page (AppRender.getBodyResult)
               └─ build component tree (NextNodeServer.createComponentTree)
                  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)"
        `)
      } else {
        expect(tree).toMatchInlineSnapshot(`
         "[trace incoming] [incoming traceparent]
         ├─ GET /page/page (BaseServer.handleRequest)
         │  ├─ prepare route module (RouteModule.prepare)
         │  └─ render route (app) /page (AppRender.getBodyResult)
         │     └─ build component tree (NextNodeServer.createComponentTree)
         │        ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │        └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         └─ middleware GET (Middleware.execute)"
        `)
      }
    } else if (renderMode === 'cache components, dev') {
      expect(tree).toMatchInlineSnapshot(`
       "[trace incoming] [incoming traceparent]
       └─ GET (BaseServer.handleRequest)
          ├─ GET (BaseServer.handleRequest)
          │  ├─ prepare route module (RouteModule.prepare)
          │  ├─ render route (app) /page (AppRender.getBodyResult)
          │  │  ├─ build component tree (NextNodeServer.createComponentTree)
          │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          │  │  └─ start response (NextNodeServer.startResponse)
          │  └─ resolve page components (NextNodeServer.findPageComponents)
          │     └─ load route module (LoadComponents.loadRouteModule)
          └─ middleware GET (Middleware.execute)"
      `)
    } else if (renderMode === 'cache components') {
      expect(tree).toMatchInlineSnapshot(`
       "[trace incoming] [incoming traceparent]
       └─ GET (BaseServer.handleRequest)
          ├─ GET (BaseServer.handleRequest)
          │  ├─ prepare route module (RouteModule.prepare)
          │  ├─ render route (app) /page (AppRender.getBodyResult)
          │  │  └─ build component tree (NextNodeServer.createComponentTree)
          │  │     ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          │  │     └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          │  ├─ resolve page components (NextNodeServer.findPageComponents)
          │  │  └─ load route module (LoadComponents.loadRouteModule)
          │  └─ start response (NextNodeServer.startResponse)
          └─ middleware GET (Middleware.execute)"
      `)
    } else {
      expect(tree).toMatchInlineSnapshot(`
       "[trace incoming] [incoming traceparent]
       └─ GET (BaseServer.handleRequest)
          ├─ GET (BaseServer.handleRequest)
          │  ├─ prepare route module (RouteModule.prepare)
          │  ├─ render route (app) /page (AppRender.getBodyResult)
          │  │  └─ build component tree (NextNodeServer.createComponentTree)
          │  │     ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          │  │     └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          │  └─ resolve page components (NextNodeServer.findPageComponents)
          │     └─ load route module (LoadComponents.loadRouteModule)
          └─ middleware GET (Middleware.execute)"
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
       ├─ GET /route-handler/route (BaseServer.handleRequest)
       │  ├─ executing api route (app) /route-handler (AppRouteRouteHandlers.runHandler)
       │  └─ prepare route module (RouteModule.prepare)
       └─ middleware GET (Middleware.execute)"
      `)
    } else {
      expect(tree).toMatchInlineSnapshot(`
       "[trace incoming] [incoming traceparent]
       └─ GET (BaseServer.handleRequest)
          ├─ GET (BaseServer.handleRequest)
          │  ├─ executing api route (app) /route-handler (AppRouteRouteHandlers.runHandler)
          │  ├─ prepare route module (RouteModule.prepare)
          │  └─ resolve page components (NextNodeServer.findPageComponents)
          │     └─ load route module (LoadComponents.loadRouteModule)
          └─ middleware GET (Middleware.execute)"
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
      if (process.env.__NEXT_CACHE_COMPONENTS) {
        expect(tree).toMatchInlineSnapshot(`
         "[trace incoming] [incoming traceparent]
         ├─ middleware GET (Middleware.execute)
         └─ POST /page/page (BaseServer.handleRequest)
            ├─ prepare route module (RouteModule.prepare)
            └─ render route (app) /page (AppRender.getBodyResult)
               └─ build component tree (NextNodeServer.createComponentTree)
                  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)"
        `)
      } else {
        expect(tree).toMatchInlineSnapshot(`
         "[trace incoming] [incoming traceparent]
         ├─ GET /page/page (BaseServer.handleRequest)
         │  ├─ prepare route module (RouteModule.prepare)
         │  └─ render route (app) /page (AppRender.getBodyResult)
         │     └─ build component tree (NextNodeServer.createComponentTree)
         │        ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │        └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         └─ middleware GET (Middleware.execute)"
        `)
      }
    } else if (renderMode === 'cache components, dev') {
      expect(tree).toMatchInlineSnapshot(`
       "[trace incoming] [incoming traceparent]
       └─ GET (BaseServer.handleRequest)
          ├─ GET (BaseServer.handleRequest)
          │  ├─ prepare route module (RouteModule.prepare)
          │  ├─ render route (app) /page (AppRender.getBodyResult)
          │  │  ├─ build component tree (NextNodeServer.createComponentTree)
          │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          │  │  └─ start response (NextNodeServer.startResponse)
          │  └─ resolve page components (NextNodeServer.findPageComponents)
          │     └─ load route module (LoadComponents.loadRouteModule)
          └─ middleware GET (Middleware.execute)"
      `)
    } else if (renderMode === 'cache components') {
      expect(tree).toMatchInlineSnapshot(`
       "[trace incoming] [incoming traceparent]
       └─ GET (BaseServer.handleRequest)
          ├─ GET (BaseServer.handleRequest)
          │  ├─ prepare route module (RouteModule.prepare)
          │  ├─ render route (app) /page (AppRender.getBodyResult)
          │  │  └─ build component tree (NextNodeServer.createComponentTree)
          │  │     ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          │  │     └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          │  ├─ resolve page components (NextNodeServer.findPageComponents)
          │  │  └─ load route module (LoadComponents.loadRouteModule)
          │  └─ start response (NextNodeServer.startResponse)
          └─ middleware GET (Middleware.execute)"
      `)
    } else {
      expect(tree).toMatchInlineSnapshot(`
       "[trace incoming] [incoming traceparent]
       └─ GET (BaseServer.handleRequest)
          ├─ GET (BaseServer.handleRequest)
          │  ├─ prepare route module (RouteModule.prepare)
          │  ├─ render route (app) /page (AppRender.getBodyResult)
          │  │  └─ build component tree (NextNodeServer.createComponentTree)
          │  │     ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          │  │     └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          │  └─ resolve page components (NextNodeServer.findPageComponents)
          │     └─ load route module (LoadComponents.loadRouteModule)
          └─ middleware GET (Middleware.execute)"
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
      if (process.env.__NEXT_CACHE_COMPONENTS) {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET /user-overrides (Next.request)
         ├─ middleware GET (Middleware.execute)
         └─ POST /headers-echo/page (BaseServer.handleRequest)
            ├─ prepare route module (RouteModule.prepare)
            └─ render route (app) /headers-echo (AppRender.getBodyResult)
               └─ build component tree (NextNodeServer.createComponentTree)
                  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)"
        `)
      } else {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET /user-overrides (Next.request)
         ├─ GET /headers-echo/page (BaseServer.handleRequest)
         │  ├─ prepare route module (RouteModule.prepare)
         │  └─ render route (app) /headers-echo (AppRender.getBodyResult)
         │     └─ build component tree (NextNodeServer.createComponentTree)
         │        ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         │        └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
         └─ middleware GET (Middleware.execute)"
        `)
      }
    } else if (renderMode === 'cache components, dev') {
      expect(tree).toMatchInlineSnapshot(`
       "[trace A] GET (BaseServer.handleRequest)
       ├─ GET (BaseServer.handleRequest)
       │  ├─ prepare route module (RouteModule.prepare)
       │  ├─ render route (app) /headers-echo (AppRender.getBodyResult)
       │  │  ├─ build component tree (NextNodeServer.createComponentTree)
       │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
       │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
       │  │  └─ start response (NextNodeServer.startResponse)
       │  └─ resolve page components (NextNodeServer.findPageComponents)
       │     └─ load route module (LoadComponents.loadRouteModule)
       └─ middleware GET (Middleware.execute)"
      `)
    } else if (renderMode === 'cache components') {
      expect(tree).toMatchInlineSnapshot(`
       "[trace A] GET (BaseServer.handleRequest)
       ├─ GET (BaseServer.handleRequest)
       │  ├─ prepare route module (RouteModule.prepare)
       │  ├─ render route (app) /headers-echo (AppRender.getBodyResult)
       │  │  └─ build component tree (NextNodeServer.createComponentTree)
       │  │     ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
       │  │     └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
       │  ├─ resolve page components (NextNodeServer.findPageComponents)
       │  │  └─ load route module (LoadComponents.loadRouteModule)
       │  └─ start response (NextNodeServer.startResponse)
       └─ middleware GET (Middleware.execute)"
      `)
    } else {
      expect(tree).toMatchInlineSnapshot(`
       "[trace A] GET (BaseServer.handleRequest)
       ├─ GET (BaseServer.handleRequest)
       │  ├─ prepare route module (RouteModule.prepare)
       │  ├─ render route (app) /headers-echo (AppRender.getBodyResult)
       │  │  └─ build component tree (NextNodeServer.createComponentTree)
       │  │     ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
       │  │     └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
       │  └─ resolve page components (NextNodeServer.findPageComponents)
       │     └─ load route module (LoadComponents.loadRouteModule)
       └─ middleware GET (Middleware.execute)"
      `)
    }
  })

  // A traceparent the middleware explicitly sets is respected: the render
  // continues it instead of being a sibling of the middleware span.
  it('respects a traceparent explicitly set by middleware', async () => {
    const res = await next.fetch('/user-traceparent')
    expect(res.status).toBe(200)
    expectNoInternalHeaders(res)
    const tree = await getSpanTree(res, 'html')
    if (isNextDeploy) {
      if (process.env.__NEXT_CACHE_COMPONENTS) {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET /user-traceparent (Next.request)
         └─ middleware GET (Middleware.execute)
         [trace set by middleware] [set by middleware traceparent]
         └─ POST /headers-echo/page (BaseServer.handleRequest)
            ├─ prepare route module (RouteModule.prepare)
            └─ render route (app) /headers-echo (AppRender.getBodyResult)
               └─ build component tree (NextNodeServer.createComponentTree)
                  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)"
        `)
      } else {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET /user-traceparent (Next.request)
         └─ middleware GET (Middleware.execute)
         [trace set by middleware] [set by middleware traceparent]
         └─ GET /headers-echo/page (BaseServer.handleRequest)
            ├─ prepare route module (RouteModule.prepare)
            └─ render route (app) /headers-echo (AppRender.getBodyResult)
               └─ build component tree (NextNodeServer.createComponentTree)
                  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)"
        `)
      }
    } else if (isNodeMiddleware) {
      if (renderMode === 'cache components, dev') {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET (BaseServer.handleRequest)
         └─ middleware GET (Middleware.execute)
         [trace set by middleware] [set by middleware traceparent]
         └─ GET (BaseServer.handleRequest)
            ├─ prepare route module (RouteModule.prepare)
            ├─ render route (app) /headers-echo (AppRender.getBodyResult)
            │  ├─ build component tree (NextNodeServer.createComponentTree)
            │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │  └─ start response (NextNodeServer.startResponse)
            └─ resolve page components (NextNodeServer.findPageComponents)
               └─ load route module (LoadComponents.loadRouteModule)"
        `)
      } else if (renderMode === 'cache components') {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET (BaseServer.handleRequest)
         └─ middleware GET (Middleware.execute)
         [trace set by middleware] [set by middleware traceparent]
         └─ GET (BaseServer.handleRequest)
            ├─ prepare route module (RouteModule.prepare)
            ├─ render route (app) /headers-echo (AppRender.getBodyResult)
            │  └─ build component tree (NextNodeServer.createComponentTree)
            │     ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │     └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            ├─ resolve page components (NextNodeServer.findPageComponents)
            │  └─ load route module (LoadComponents.loadRouteModule)
            └─ start response (NextNodeServer.startResponse)"
        `)
      } else {
        expect(tree).toMatchInlineSnapshot(`
         "[trace A] GET (BaseServer.handleRequest)
         └─ middleware GET (Middleware.execute)
         [trace set by middleware] [set by middleware traceparent]
         └─ GET (BaseServer.handleRequest)
            ├─ prepare route module (RouteModule.prepare)
            ├─ render route (app) /headers-echo (AppRender.getBodyResult)
            │  └─ build component tree (NextNodeServer.createComponentTree)
            │     ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │     └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            └─ resolve page components (NextNodeServer.findPageComponents)
               └─ load route module (LoadComponents.loadRouteModule)"
        `)
      }
    } else if (renderMode === 'cache components, dev') {
      expect(tree).toMatchInlineSnapshot(`
       "[trace A] [remote]
       └─ middleware GET (Middleware.execute)
       [trace set by middleware] [set by middleware traceparent]
       └─ GET (BaseServer.handleRequest)
          ├─ prepare route module (RouteModule.prepare)
          ├─ render route (app) /headers-echo (AppRender.getBodyResult)
          │  ├─ build component tree (NextNodeServer.createComponentTree)
          │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          │  └─ start response (NextNodeServer.startResponse)
          └─ resolve page components (NextNodeServer.findPageComponents)
             └─ load route module (LoadComponents.loadRouteModule)"
      `)
    } else if (renderMode === 'cache components') {
      expect(tree).toMatchInlineSnapshot(`
       "[trace A] [remote]
       └─ middleware GET (Middleware.execute)
       [trace set by middleware] [set by middleware traceparent]
       └─ GET (BaseServer.handleRequest)
          ├─ prepare route module (RouteModule.prepare)
          ├─ render route (app) /headers-echo (AppRender.getBodyResult)
          │  └─ build component tree (NextNodeServer.createComponentTree)
          │     ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          │     └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          ├─ resolve page components (NextNodeServer.findPageComponents)
          │  └─ load route module (LoadComponents.loadRouteModule)
          └─ start response (NextNodeServer.startResponse)"
      `)
    } else {
      expect(tree).toMatchInlineSnapshot(`
       "[trace A] [remote]
       └─ middleware GET (Middleware.execute)
       [trace set by middleware] [set by middleware traceparent]
       └─ GET (BaseServer.handleRequest)
          ├─ prepare route module (RouteModule.prepare)
          ├─ render route (app) /headers-echo (AppRender.getBodyResult)
          │  └─ build component tree (NextNodeServer.createComponentTree)
          │     ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          │     └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          └─ resolve page components (NextNodeServer.findPageComponents)
             └─ load route module (LoadComponents.loadRouteModule)"
      `)
    }
  })
})
