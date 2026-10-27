/* eslint jest/no-standalone-expect: ["error", { "additionalTestBlockFunctions": ["traceTest"] }] */
import { randomBytes } from 'crypto'
import { isNextDeploy, isNextDev, nextTestSetup } from 'e2e-utils'
import type { NextInstance } from 'e2e-utils'
import cheerio from 'cheerio'
import {
  isOneTimeSpan,
  printSpanTree,
  type KnownTraceContext,
  type TreeSpan,
} from 'otel-span-tree'
import {
  collectSpanGroups,
  collectSpans,
  type SpanGroup,
  type SpanGroupResult,
} from 'otel-span-capture'

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
  '/rewrite-external',
  '/rewrite-static',
  '/rewrite-isr',
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

// `app/isr/page.tsx` with Cache Components, where the `revalidate` segment
// config isn't allowed: the same page, cached with time-based revalidation.
const ISR_PAGE_CACHE_COMPONENTS = [
  `import { cacheLife } from 'next/cache'`,
  ``,
  `export default async function Page() {`,
  `  'use cache'`,
  `  cacheLife('hours')`,
  `  return <p id="marker">ISR page</p>`,
  `}`,
  ``,
].join('\n')

// The fixture files a variant overrides: its middleware entry, and the ISR page
// with Cache Components.
function overrideFiles(file: string, exportName: 'proxy' | 'middleware') {
  return {
    [file]: middlewareEntry(exportName),
    ...(process.env.__NEXT_CACHE_COMPONENTS
      ? { 'app/isr/page.tsx': ISR_PAGE_CACHE_COMPONENTS }
      : {}),
  }
}

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

// How far back to read the runtime logs when deployed (they are filtered by
// trace, so this only needs to cover the requests and clock differences).
const LOGS_WINDOW_MS = 10 * 60_000

// Deployed, how long sending every request and collecting all their spans
// may take (the collection itself gives up after 6 minutes).
const BATCH_TIMEOUT = 10 * 60_000

// A request whose spans are collected (see `useTraceTests`): its response, its
// body, and how to collect and print its span tree.
interface TracedRequest {
  res: Response
  text: string
  // The request's traces and the spans that must have ended (see
  // `collectSpanGroups`), or why they aren't known (e.g. the response has no
  // trace ID, because the request failed).
  group: SpanGroup | Error
  print: (spans: TreeSpan[]) => string
}

// What a test asserts on: the response, its body, and the request's span tree
// (collected once the expected spans have ended).
interface TracedResponse {
  res: Response
  text: string
  tree: () => Promise<string>
}

// The traced request of a response from the app (its body was not read yet):
// the middleware's trace (reported in a response header) and the render's
// trace (reported in the body, `html` or `json`), complete once the
// middleware span, the render's request span and (deployed, for middleware
// without an incoming `traceparent`) the inserted `Next.request` root have
// ended. Pass the incoming trace context and the one the middleware sets as
// `known`, and `incoming` when the request has a `traceparent`. One-time spans
// (see `isOneTimeSpan`) are omitted unless `includeOneTimeSpans` is set.
async function traceRequest(
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
): Promise<TracedRequest> {
  const text = await res.text()
  const print = (spans: TreeSpan[]) =>
    printSpanTree(spans, {
      known,
      omit: includeOneTimeSpans ? undefined : isOneTimeSpan,
    })
  const traceIds: string[] = []
  const expected: string[] = []
  const middlewareTraceId = res.headers.get('x-mw-trace-id')
  if (middlewareTraceId) {
    traceIds.push(middlewareTraceId)
    expected.push('Middleware.execute')
    if (isNextDeploy && !incoming) {
      expected.push('Next.request')
    }
  }
  if (body !== 'none') {
    let renderTraceId: unknown
    try {
      renderTraceId =
        body === 'html'
          ? cheerio.load(text)('#trace-id').text()
          : JSON.parse(text).traceId
    } catch {}
    if (
      typeof renderTraceId !== 'string' ||
      !/^[0-9a-f]{32}$/.test(renderTraceId)
    ) {
      return {
        res,
        text,
        group: new Error(
          `The response (status ${res.status}) has no render trace ID: ${text.slice(0, 500)}`
        ),
        print,
      }
    }
    traceIds.push(renderTraceId)
    expected.push('BaseServer.handleRequest')
  }
  return { res, text, group: { traceIds, expected }, print }
}

// Defines the tests of a `describe` block that collect the spans of a request.
// A test has two parts: `request` sends the request (without assertions, see
// `traceRequest`), and `check` asserts on the response and the span tree.
//
// Self-hosted, every test sends its request, collects its spans (from the
// server output) and asserts in turn. Deployed, the runtime logs take a while
// (sometimes minutes) to include a request's spans: every test's request is
// sent in a `beforeAll`, in the order the tests are defined, and the spans of
// all of them are collected at once (see `collectSpanGroups`), so the waits
// overlap instead of adding up. Each test then asserts on its own response and
// tree, so failures are still reported per test.
function useTraceTests(next: NextInstance) {
  const batch = isNextDeploy
  const requests: Array<() => Promise<TracedRequest>> = []
  const results: Array<
    | { traced: TracedRequest; spans?: SpanGroupResult }
    | { error: unknown }
    | undefined
  > = []

  if (batch) {
    beforeAll(async () => {
      const since = new Date(Date.now() - LOGS_WINDOW_MS)
      for (const request of requests) {
        try {
          results.push({ traced: await request() })
        } catch (error) {
          results.push({ error })
        }
      }
      const collected = results.flatMap((result) =>
        result && 'traced' in result && !(result.traced.group instanceof Error)
          ? [{ result, group: result.traced.group }]
          : []
      )
      const spans = await collectSpanGroups(next, {
        groups: collected.map(({ group }) => group),
        since,
      })
      collected.forEach(({ result }, i) => {
        result.spans = spans[i]
      })
    }, BATCH_TIMEOUT)
  }

  return function traceTest(
    name: string,
    request: () => Promise<TracedRequest>,
    check: (response: TracedResponse) => Promise<void>
  ) {
    const index = requests.push(request) - 1
    it(name, async () => {
      let traced: TracedRequest
      let tree: () => Promise<string>
      if (batch) {
        const result = results[index]
        if (!result) {
          throw new Error('The request was not sent (see `beforeAll`).')
        }
        if ('error' in result) {
          throw result.error
        }
        const current = result.traced
        traced = current
        tree = async () => {
          if (current.group instanceof Error) {
            throw current.group
          }
          if (!result.spans) {
            throw new Error('The spans were not collected (see `beforeAll`).')
          }
          if ('error' in result.spans) {
            throw result.spans.error
          }
          return current.print(result.spans.spans)
        }
      } else {
        const current = await request()
        traced = current
        tree = async () => {
          if (current.group instanceof Error) {
            throw current.group
          }
          return current.print(
            await collectSpans(next, {
              ...current.group,
              since: new Date(Date.now() - LOGS_WINDOW_MS),
            })
          )
        }
      }
      await check({ res: traced.res, text: traced.text, tree })
    })
  }
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
// deployed, the runtime logs, for all requests at once (see `useTraceTests`).
// Parents that weren't collected (e.g. the platform's spans when deployed)
// show up as `[remote]`.
// Spans that don't cover all spans below them are badged (see
// `printSpanTree`): self-hosted, next-server's middleware-invoke request span
// ends before the render it is the parent of.
describe.each(VARIANTS)(
  'otel-middleware-trace - $name',
  ({ file, exportName }) => {
    const { next, isTurbopack } = nextTestSetup({
      files: __dirname,
      overrideFiles: overrideFiles(file, exportName),
      dependencies: DEPENDENCIES,
    })
    const env = getTestEnv(isTurbopack, exportName)
    const traceTest = useTraceTests(next)

    // The first request, so the tree includes the one-time spans (e.g.
    // `instrumentation.ts` registration) of the first request an instance serves.
    traceTest(
      'traces a page rendered after NextResponse.next()',
      async () =>
        traceRequest(await next.fetch('/page'), 'html', {
          includeOneTimeSpans: true,
        }),
      async ({ res, tree: getTree }) => {
        expect(res.status).toBe(200)
        expectNoInternalHeaders(res)
        const tree = await getTree()
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
        } else if (['deploy, middleware'].includes(env)) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET (Next.request) {http.target=/page} [error: doesn't cover descendants]
            ├─ GET /page (BaseServer.handleRequest) {http.target=/page, http.route=/page, next.route=/page, http.status_code=200}
            │  ├─ load instrumentation module (Instrumentation.loadModule)
            │  ├─ NextNodeServer.clientComponentLoading
            │  ├─ prepare route module (RouteModule.prepare)
            │  ├─ register instrumentation (Instrumentation.register)
            │  └─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
            │     ├─ build component tree (NextNodeServer.createComponentTree)
            │     │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │     │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │     ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
            │     ├─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
            │     └─ start response (NextNodeServer.startResponse)
            └─ middleware GET (Middleware.execute) {http.target=/page}"
          `)
        } else if (['deploy, proxy'].includes(env)) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET (Next.request) {http.target=/page} [error: doesn't cover descendants]
            ├─ GET /page (BaseServer.handleRequest) {http.target=/page, http.route=/page, next.route=/page, http.status_code=200}
            │  ├─ load instrumentation module (Instrumentation.loadModule)
            │  ├─ NextNodeServer.clientComponentLoading
            │  ├─ prepare route module (RouteModule.prepare)
            │  ├─ register instrumentation (Instrumentation.register)
            │  └─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
            │     ├─ build component tree (NextNodeServer.createComponentTree)
            │     │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │     │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │     ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
            │     ├─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
            │     └─ start response (NextNodeServer.startResponse)
            └─ middleware GET (Middleware.execute) {http.target=/page}
               ├─ load instrumentation module (Instrumentation.loadModule)
               └─ register instrumentation (Instrumentation.register)"
          `)
        } else if (['deploy (no adapter), middleware'].includes(env)) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET (Next.request) {http.target=/page} [error: doesn't cover descendants]
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
        } else if (['deploy (no adapter), proxy'].includes(env)) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET (Next.request) {http.target=/page} [error: doesn't cover descendants]
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
            └─ middleware GET (Middleware.execute) {http.target=/page}
               ├─ load instrumentation module (Instrumentation.loadModule)
               └─ register instrumentation (Instrumentation.register)"
          `)
        } else if (['deploy, cache components, middleware'].includes(env)) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET (Next.request) {http.target=/page} [error: doesn't cover descendants]
            ├─ middleware GET (Middleware.execute) {http.target=/page}
            └─ POST /page (BaseServer.handleRequest) {http.target=/page, http.route=/page, next.route=/page, http.status_code=200}
               ├─ load instrumentation module (Instrumentation.loadModule)
               ├─ NextNodeServer.clientComponentLoading
               ├─ prepare route module (RouteModule.prepare)
               ├─ register instrumentation (Instrumentation.register)
               ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
               │  ├─ build component tree (NextNodeServer.createComponentTree)
               │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
               │  └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
               └─ start response (NextNodeServer.startResponse)"
          `)
        } else if (['deploy, cache components, proxy'].includes(env)) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET (Next.request) {http.target=/page} [error: doesn't cover descendants]
            ├─ middleware GET (Middleware.execute) {http.target=/page}
            │  ├─ load instrumentation module (Instrumentation.loadModule)
            │  └─ register instrumentation (Instrumentation.register)
            └─ POST /page (BaseServer.handleRequest) {http.target=/page, http.route=/page, next.route=/page, http.status_code=200}
               ├─ load instrumentation module (Instrumentation.loadModule)
               ├─ NextNodeServer.clientComponentLoading
               ├─ prepare route module (RouteModule.prepare)
               ├─ register instrumentation (Instrumentation.register)
               ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
               │  ├─ build component tree (NextNodeServer.createComponentTree)
               │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
               │  └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
               └─ start response (NextNodeServer.startResponse)"
          `)
        } else if (
          ['deploy (no adapter), cache components, middleware'].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET (Next.request) {http.target=/page} [error: doesn't cover descendants]
            ├─ middleware GET (Middleware.execute) {http.target=/page}
            └─ POST /page (BaseServer.handleRequest) {http.target=/page, http.route=/page, next.route=/page, http.status_code=200}
               ├─ NextNodeServer.clientComponentLoading
               ├─ prepare route module (RouteModule.prepare)
               ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
               │  ├─ build component tree (NextNodeServer.createComponentTree)
               │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
               │  └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
               ├─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
               │  └─ load route module (LoadComponents.loadRouteModule)
               └─ start response (NextNodeServer.startResponse)"
          `)
        } else if (
          ['deploy (no adapter), cache components, proxy'].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET (Next.request) {http.target=/page} [error: doesn't cover descendants]
            ├─ middleware GET (Middleware.execute) {http.target=/page}
            │  ├─ load instrumentation module (Instrumentation.loadModule)
            │  └─ register instrumentation (Instrumentation.register)
            └─ POST /page (BaseServer.handleRequest) {http.target=/page, http.route=/page, next.route=/page, http.status_code=200}
               ├─ NextNodeServer.clientComponentLoading
               ├─ prepare route module (RouteModule.prepare)
               ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
               │  ├─ build component tree (NextNodeServer.createComponentTree)
               │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
               │  └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
               ├─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
               │  └─ load route module (LoadComponents.loadRouteModule)
               └─ start response (NextNodeServer.startResponse)"
          `)
        } else {
          // Not observed yet (filled from CI).
          expect(tree).toMatchInlineSnapshot()
        }
      }
    )

    traceTest(
      'traces a route handler executed after NextResponse.next()',
      async () => traceRequest(await next.fetch('/route-handler'), 'json'),
      async ({ res, tree: getTree }) => {
        expect(res.status).toBe(200)
        expectNoInternalHeaders(res)
        const tree = await getTree()
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
        } else if (
          [
            'deploy, middleware',
            'deploy, proxy',
            'deploy, cache components, middleware',
            'deploy, cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET (Next.request) {http.target=/route-handler} [error: doesn't cover descendants]
            ├─ GET /route-handler (BaseServer.handleRequest) {http.target=/route-handler, http.route=/route-handler, next.route=/route-handler, http.status_code=200}
            │  ├─ executing api route (app) /route-handler (AppRouteRouteHandlers.runHandler) {next.route=/route-handler}
            │  ├─ prepare route module (RouteModule.prepare)
            │  └─ start response (NextNodeServer.startResponse)
            └─ middleware GET (Middleware.execute) {http.target=/route-handler}"
          `)
        } else if (
          [
            'deploy (no adapter), middleware',
            'deploy (no adapter), proxy',
            'deploy (no adapter), cache components, middleware',
            'deploy (no adapter), cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET (Next.request) {http.target=/route-handler} [error: doesn't cover descendants]
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

    traceTest(
      'traces a rewritten page',
      async () => traceRequest(await next.fetch('/rewrite'), 'html'),
      async ({ res, tree: getTree }) => {
        expect(res.status).toBe(200)
        expectNoInternalHeaders(res)
        const tree = await getTree()
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
        } else if (['deploy, middleware', 'deploy, proxy'].includes(env)) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET (Next.request) {http.target=/rewrite} [error: doesn't cover descendants]
            ├─ GET /page (BaseServer.handleRequest) {http.target=/rewrite, http.route=/page, next.route=/page, http.status_code=200}
            │  ├─ NextNodeServer.clientComponentLoading
            │  ├─ prepare route module (RouteModule.prepare)
            │  └─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
            │     ├─ build component tree (NextNodeServer.createComponentTree)
            │     │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │     │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │     ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
            │     ├─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
            │     └─ start response (NextNodeServer.startResponse)
            └─ middleware GET (Middleware.execute) {http.target=/rewrite}"
          `)
        } else if (
          [
            'deploy (no adapter), middleware',
            'deploy (no adapter), proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET (Next.request) {http.target=/rewrite} [error: doesn't cover descendants]
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
            'deploy, cache components, middleware',
            'deploy, cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET (Next.request) {http.target=/rewrite} [error: doesn't cover descendants]
            ├─ middleware GET (Middleware.execute) {http.target=/rewrite}
            └─ POST /page (BaseServer.handleRequest) {http.target=/rewrite, http.route=/page, next.route=/page, http.status_code=200}
               ├─ NextNodeServer.clientComponentLoading
               ├─ prepare route module (RouteModule.prepare)
               ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
               │  ├─ build component tree (NextNodeServer.createComponentTree)
               │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
               │  └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
               └─ start response (NextNodeServer.startResponse)"
          `)
        } else if (
          [
            'deploy (no adapter), cache components, middleware',
            'deploy (no adapter), cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET (Next.request) {http.target=/rewrite} [error: doesn't cover descendants]
            ├─ middleware GET (Middleware.execute) {http.target=/rewrite}
            └─ POST /page (BaseServer.handleRequest) {http.target=/rewrite, http.route=/page, next.route=/page, http.status_code=200}
               ├─ NextNodeServer.clientComponentLoading
               ├─ prepare route module (RouteModule.prepare)
               ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
               │  ├─ build component tree (NextNodeServer.createComponentTree)
               │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
               │  └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
               ├─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
               │  └─ load route module (LoadComponents.loadRouteModule)
               └─ start response (NextNodeServer.startResponse)"
          `)
        } else {
          // Not observed yet (filled from CI).
          expect(tree).toMatchInlineSnapshot()
        }
      }
    )

    traceTest(
      'traces a middleware redirect',
      async () =>
        traceRequest(
          await next.fetch('/redirect', { redirect: 'manual' }),
          'none'
        ),
      async ({ res, tree: getTree }) => {
        expect(res.status).toBe(307)
        expectNoInternalHeaders(res)
        const tree = await getTree()
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
        } else if (
          [
            'deploy, middleware',
            'deploy, proxy',
            'deploy (no adapter), middleware',
            'deploy (no adapter), proxy',
            'deploy, cache components, middleware',
            'deploy, cache components, proxy',
            'deploy (no adapter), cache components, middleware',
            'deploy (no adapter), cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET (Next.request) {http.target=/redirect}
            └─ middleware GET (Middleware.execute) {http.target=/redirect}"
          `)
        } else {
          // Not observed yet (filled from CI).
          expect(tree).toMatchInlineSnapshot()
        }
      }
    )

    traceTest(
      'traces a direct middleware response',
      async () => traceRequest(await next.fetch('/direct'), 'none'),
      async ({ res, text, tree: getTree }) => {
        expect(res.status).toBe(200)
        expect(text).toBe('direct response from middleware')
        expectNoInternalHeaders(res)
        const tree = await getTree()
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
        } else if (
          [
            'deploy, middleware',
            'deploy, proxy',
            'deploy (no adapter), middleware',
            'deploy (no adapter), proxy',
            'deploy, cache components, middleware',
            'deploy, cache components, proxy',
            'deploy (no adapter), cache components, middleware',
            'deploy (no adapter), cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET (Next.request) {http.target=/direct}
            └─ middleware GET (Middleware.execute) {http.target=/direct}"
          `)
        } else {
          // Not observed yet (filled from CI).
          expect(tree).toMatchInlineSnapshot()
        }
      }
    )

    // The rewritten request is proxied to another origin, so nothing of this
    // app renders it.
    traceTest(
      'traces a middleware rewrite to an external origin',
      async () => traceRequest(await next.fetch('/rewrite-external'), 'none'),
      async ({ res, tree: getTree }) => {
        expect(res.status).toBe(200)
        expectNoInternalHeaders(res)
        const tree = await getTree()
        if (
          [
            'start, middleware',
            'start, proxy',
            'dev, middleware',
            'dev, proxy',
            'start (webpack), middleware',
            'start (webpack), proxy',
            'dev (webpack), middleware',
            'dev (webpack), proxy',
            'start, cache components, middleware',
            'start, cache components, proxy',
            'dev, cache components, middleware',
            'dev, cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
          "[trace A] GET (BaseServer.handleRequest) {http.target=/rewrite-external, http.status_code=200}
          └─ middleware GET (Middleware.execute) {http.target=/rewrite-external}"
        `)
        } else {
          // Not observed yet (filled from CI).
          expect(tree).toMatchInlineSnapshot()
        }
      }
    )

    // The rewritten page is prerendered, so it is served from the cache
    // (deployed, without invoking a function).
    traceTest(
      'traces a middleware rewrite to a static page',
      async () => traceRequest(await next.fetch('/rewrite-static'), 'none'),
      async ({ res, text, tree: getTree }) => {
        expect(res.status).toBe(200)
        expect(cheerio.load(text)('#marker').text()).toBe('static page')
        expectNoInternalHeaders(res)
        const tree = await getTree()
        if (
          [
            'start, middleware',
            'start, proxy',
            'start (webpack), middleware',
            'start (webpack), proxy',
            'start, cache components, middleware',
            'start, cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
          "[trace A] GET (BaseServer.handleRequest) {http.target=/rewrite-static, http.status_code=200} [error: doesn't cover descendants]
          ├─ GET /static (BaseServer.handleRequest) {http.target=/rewrite-static, http.route=/static, next.route=/static, http.status_code=200}
          │  ├─ prepare route module (RouteModule.prepare)
          │  └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/static}
          │     └─ load route module (LoadComponents.loadRouteModule)
          └─ middleware GET (Middleware.execute) {http.target=/rewrite-static}"
        `)
        } else if (
          [
            'dev, middleware',
            'dev, proxy',
            'dev (webpack), middleware',
            'dev (webpack), proxy',
            'dev, cache components, middleware',
            'dev, cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
          "[trace A] GET (BaseServer.handleRequest) {http.target=/rewrite-static, http.status_code=200} [error: doesn't cover descendants]
          ├─ GET /static (BaseServer.handleRequest) {http.target=/rewrite-static, http.route=/static, next.route=/static, http.status_code=200}
          │  ├─ NextNodeServer.clientComponentLoading
          │  ├─ prepare route module (RouteModule.prepare)
          │  ├─ render route (app) /static (AppRender.getBodyResult) {next.route=/static}
          │  │  ├─ build component tree (NextNodeServer.createComponentTree)
          │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          │  │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
          │  │  └─ start response (NextNodeServer.startResponse)
          │  └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/static}
          │     └─ load route module (LoadComponents.loadRouteModule)
          └─ middleware GET (Middleware.execute) {http.target=/rewrite-static}"
        `)
        } else {
          // Not observed yet (filled from CI).
          expect(tree).toMatchInlineSnapshot()
        }
      }
    )

    // The rewritten page is prerendered with time-based revalidation, so it
    // is served from the ISR cache (it never becomes stale during the test).
    traceTest(
      'traces a middleware rewrite to an ISR page',
      async () => traceRequest(await next.fetch('/rewrite-isr'), 'none'),
      async ({ res, text, tree: getTree }) => {
        expect(res.status).toBe(200)
        expect(cheerio.load(text)('#marker').text()).toBe('ISR page')
        expectNoInternalHeaders(res)
        const tree = await getTree()
        if (
          [
            'start, middleware',
            'start, proxy',
            'start (webpack), middleware',
            'start (webpack), proxy',
            'start, cache components, middleware',
            'start, cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
          "[trace A] GET (BaseServer.handleRequest) {http.target=/rewrite-isr, http.status_code=200} [error: doesn't cover descendants]
          ├─ GET /isr (BaseServer.handleRequest) {http.target=/rewrite-isr, http.route=/isr, next.route=/isr, http.status_code=200}
          │  ├─ prepare route module (RouteModule.prepare)
          │  └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/isr}
          │     └─ load route module (LoadComponents.loadRouteModule)
          └─ middleware GET (Middleware.execute) {http.target=/rewrite-isr}"
        `)
        } else if (
          [
            'dev, middleware',
            'dev, proxy',
            'dev (webpack), middleware',
            'dev (webpack), proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
          "[trace A] GET (BaseServer.handleRequest) {http.target=/rewrite-isr, http.status_code=200} [error: doesn't cover descendants]
          ├─ GET /isr (BaseServer.handleRequest) {http.target=/rewrite-isr, http.route=/isr, next.route=/isr, http.status_code=200}
          │  ├─ NextNodeServer.clientComponentLoading
          │  ├─ prepare route module (RouteModule.prepare)
          │  ├─ render route (app) /isr (AppRender.getBodyResult) {next.route=/isr}
          │  │  ├─ build component tree (NextNodeServer.createComponentTree)
          │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          │  │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
          │  │  └─ start response (NextNodeServer.startResponse)
          │  └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/isr}
          │     └─ load route module (LoadComponents.loadRouteModule)
          └─ middleware GET (Middleware.execute) {http.target=/rewrite-isr}"
        `)
        } else if (
          [
            'dev, cache components, middleware',
            'dev, cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
          "[trace A] GET (BaseServer.handleRequest) {http.target=/rewrite-isr, http.status_code=200} [error: doesn't cover descendants]
          ├─ GET /isr (BaseServer.handleRequest) {http.target=/rewrite-isr, http.route=/isr, next.route=/isr, http.status_code=200} [error: doesn't cover descendants]
          │  ├─ NextNodeServer.clientComponentLoading
          │  ├─ prepare route module (RouteModule.prepare)
          │  ├─ render route (app) /isr (AppRender.getBodyResult) {next.route=/isr} [error: doesn't cover descendants]
          │  │  ├─ build component tree (NextNodeServer.createComponentTree)
          │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          │  │  ├─ build component tree (NextNodeServer.createComponentTree)
          │  │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          │  │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
          │  │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
          │  │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
          │  │  └─ start response (NextNodeServer.startResponse)
          │  └─ resolve page components (NextNodeServer.findPageComponents) {next.route=/isr}
          │     └─ load route module (LoadComponents.loadRouteModule)
          └─ middleware GET (Middleware.execute) {http.target=/rewrite-isr}"
        `)
        } else {
          // Not observed yet (filled from CI).
          expect(tree).toMatchInlineSnapshot()
        }
      }
    )

    traceTest(
      'traces a request the middleware does not match',
      async () => traceRequest(await next.fetch('/unmatched'), 'html'),
      async ({ res, tree: getTree }) => {
        expect(res.status).toBe(200)
        expect(res.headers.get('x-mw-trace-id')).toBeNull()
        expectNoInternalHeaders(res)
        const tree = await getTree()
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
        } else if (['deploy, middleware', 'deploy, proxy'].includes(env)) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET /unmatched (BaseServer.handleRequest) {http.target=/unmatched, http.route=/unmatched, next.route=/unmatched, http.status_code=200}
            ├─ NextNodeServer.clientComponentLoading
            ├─ prepare route module (RouteModule.prepare)
            └─ render route (app) /unmatched (AppRender.getBodyResult) {next.route=/unmatched}
               ├─ build component tree (NextNodeServer.createComponentTree)
               │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
               ├─ generateMetadata /unmatched/page (ResolveMetadata.generateMetadata)
               └─ start response (NextNodeServer.startResponse)"
          `)
        } else if (
          [
            'deploy (no adapter), middleware',
            'deploy (no adapter), proxy',
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
            'deploy, cache components, middleware',
            'deploy, cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] POST /unmatched (BaseServer.handleRequest) {http.target=/unmatched, http.route=/unmatched, next.route=/unmatched, http.status_code=200}
            ├─ NextNodeServer.clientComponentLoading
            ├─ prepare route module (RouteModule.prepare)
            ├─ render route (app) /unmatched (AppRender.getBodyResult) {next.route=/unmatched}
            │  ├─ build component tree (NextNodeServer.createComponentTree)
            │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
            │  └─ generateMetadata /unmatched/page (ResolveMetadata.generateMetadata)
            └─ start response (NextNodeServer.startResponse)"
          `)
        } else if (
          [
            'deploy (no adapter), cache components, middleware',
            'deploy (no adapter), cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] POST /unmatched (BaseServer.handleRequest) {http.target=/unmatched, http.route=/unmatched, next.route=/unmatched, http.status_code=200}
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
        } else {
          // Not observed yet (filled from CI).
          expect(tree).toMatchInlineSnapshot()
        }
      }
    )

    traceTest(
      'traces /page with an incoming traceparent',
      async () => {
        const incoming = newTraceContext('incoming')
        const res = await next.fetch('/page', {
          headers: { traceparent: toTraceparent(incoming) },
        })
        return traceRequest(res, 'html', { known: [incoming], incoming: true })
      },
      async ({ res, tree: getTree }) => {
        expect(res.status).toBe(200)
        expectNoInternalHeaders(res)
        const tree = await getTree()
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
        } else if (['deploy, middleware', 'deploy, proxy'].includes(env)) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace incoming] [incoming traceparent]
            ├─ GET /page (BaseServer.handleRequest) {http.target=/page, http.route=/page, next.route=/page, http.status_code=200}
            │  ├─ NextNodeServer.clientComponentLoading
            │  ├─ prepare route module (RouteModule.prepare)
            │  └─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
            │     ├─ build component tree (NextNodeServer.createComponentTree)
            │     │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │     │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │     ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
            │     ├─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
            │     └─ start response (NextNodeServer.startResponse)
            └─ middleware GET (Middleware.execute) {http.target=/page}"
          `)
        } else if (
          [
            'deploy (no adapter), middleware',
            'deploy (no adapter), proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace incoming] [incoming traceparent]
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
            'deploy, cache components, middleware',
            'deploy, cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace incoming] [incoming traceparent]
            ├─ middleware GET (Middleware.execute) {http.target=/page}
            └─ POST /page (BaseServer.handleRequest) {http.target=/page, http.route=/page, next.route=/page, http.status_code=200}
               ├─ NextNodeServer.clientComponentLoading
               ├─ prepare route module (RouteModule.prepare)
               ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
               │  ├─ build component tree (NextNodeServer.createComponentTree)
               │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
               │  └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
               └─ start response (NextNodeServer.startResponse)"
          `)
        } else if (
          [
            'deploy (no adapter), cache components, middleware',
            'deploy (no adapter), cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace incoming] [incoming traceparent]
            ├─ middleware GET (Middleware.execute) {http.target=/page}
            └─ POST /page (BaseServer.handleRequest) {http.target=/page, http.route=/page, next.route=/page, http.status_code=200}
               ├─ NextNodeServer.clientComponentLoading
               ├─ prepare route module (RouteModule.prepare)
               ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
               │  ├─ build component tree (NextNodeServer.createComponentTree)
               │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
               │  └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
               ├─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
               │  └─ load route module (LoadComponents.loadRouteModule)
               └─ start response (NextNodeServer.startResponse)"
          `)
        } else {
          // Not observed yet (filled from CI).
          expect(tree).toMatchInlineSnapshot()
        }
      }
    )

    traceTest(
      'traces /route-handler with an incoming traceparent',
      async () => {
        const incoming = newTraceContext('incoming')
        const res = await next.fetch('/route-handler', {
          headers: { traceparent: toTraceparent(incoming) },
        })
        return traceRequest(res, 'json', { known: [incoming], incoming: true })
      },
      async ({ res, tree: getTree }) => {
        expect(res.status).toBe(200)
        expectNoInternalHeaders(res)
        const tree = await getTree()
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
        } else if (
          [
            'deploy, middleware',
            'deploy, proxy',
            'deploy, cache components, middleware',
            'deploy, cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace incoming] [incoming traceparent]
            ├─ GET /route-handler (BaseServer.handleRequest) {http.target=/route-handler, http.route=/route-handler, next.route=/route-handler, http.status_code=200}
            │  ├─ executing api route (app) /route-handler (AppRouteRouteHandlers.runHandler) {next.route=/route-handler}
            │  ├─ prepare route module (RouteModule.prepare)
            │  └─ start response (NextNodeServer.startResponse)
            └─ middleware GET (Middleware.execute) {http.target=/route-handler}"
          `)
        } else if (
          [
            'deploy (no adapter), middleware',
            'deploy (no adapter), proxy',
            'deploy (no adapter), cache components, middleware',
            'deploy (no adapter), cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace incoming] [incoming traceparent]
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

    traceTest(
      'traces /rewrite with an incoming traceparent',
      async () => {
        const incoming = newTraceContext('incoming')
        const res = await next.fetch('/rewrite', {
          headers: { traceparent: toTraceparent(incoming) },
        })
        return traceRequest(res, 'html', { known: [incoming], incoming: true })
      },
      async ({ res, tree: getTree }) => {
        expect(res.status).toBe(200)
        expectNoInternalHeaders(res)
        const tree = await getTree()
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
        } else if (['deploy, middleware', 'deploy, proxy'].includes(env)) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace incoming] [incoming traceparent]
            ├─ GET /page (BaseServer.handleRequest) {http.target=/rewrite, http.route=/page, next.route=/page, http.status_code=200}
            │  ├─ NextNodeServer.clientComponentLoading
            │  ├─ prepare route module (RouteModule.prepare)
            │  └─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
            │     ├─ build component tree (NextNodeServer.createComponentTree)
            │     │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │     │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │     ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
            │     ├─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
            │     └─ start response (NextNodeServer.startResponse)
            └─ middleware GET (Middleware.execute) {http.target=/rewrite}"
          `)
        } else if (
          [
            'deploy (no adapter), middleware',
            'deploy (no adapter), proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace incoming] [incoming traceparent]
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
            'deploy, cache components, middleware',
            'deploy, cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace incoming] [incoming traceparent]
            ├─ middleware GET (Middleware.execute) {http.target=/rewrite}
            └─ POST /page (BaseServer.handleRequest) {http.target=/rewrite, http.route=/page, next.route=/page, http.status_code=200}
               ├─ NextNodeServer.clientComponentLoading
               ├─ prepare route module (RouteModule.prepare)
               ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
               │  ├─ build component tree (NextNodeServer.createComponentTree)
               │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
               │  └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
               └─ start response (NextNodeServer.startResponse)"
          `)
        } else if (
          [
            'deploy (no adapter), cache components, middleware',
            'deploy (no adapter), cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace incoming] [incoming traceparent]
            ├─ middleware GET (Middleware.execute) {http.target=/rewrite}
            └─ POST /page (BaseServer.handleRequest) {http.target=/rewrite, http.route=/page, next.route=/page, http.status_code=200}
               ├─ NextNodeServer.clientComponentLoading
               ├─ prepare route module (RouteModule.prepare)
               ├─ render route (app) /page (AppRender.getBodyResult) {next.route=/page}
               │  ├─ build component tree (NextNodeServer.createComponentTree)
               │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               │  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
               │  └─ generateMetadata /page/page (ResolveMetadata.generateMetadata)
               ├─ resolve page components (NextNodeServer.findPageComponents) {next.route=/page}
               │  └─ load route module (LoadComponents.loadRouteModule)
               └─ start response (NextNodeServer.startResponse)"
          `)
        } else {
          // Not observed yet (filled from CI).
          expect(tree).toMatchInlineSnapshot()
        }
      }
    )

    traceTest(
      'still applies request header overrides set by middleware',
      async () =>
        traceRequest(
          await next.fetch('/user-overrides', {
            headers: { 'x-delete-me': 'please', 'x-keep-me': 'kept' },
          }),
          'html'
        ),
      async ({ res, text, tree: getTree }) => {
        expect(res.status).toBe(200)
        const headers = JSON.parse(cheerio.load(text)('#headers').text())
        expect(headers['x-user-added']).toBe('added-by-middleware')
        expect(headers['x-keep-me']).toBe('kept')
        expect(headers['x-delete-me']).toBeUndefined()
        expectNoInternalHeaders(res)
        const tree = await getTree()
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
        } else if (['deploy, middleware', 'deploy, proxy'].includes(env)) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET (Next.request) {http.target=/user-overrides} [error: doesn't cover descendants]
            ├─ GET /headers-echo (BaseServer.handleRequest) {http.target=/user-overrides, http.route=/headers-echo, next.route=/headers-echo, http.status_code=200}
            │  ├─ NextNodeServer.clientComponentLoading
            │  ├─ prepare route module (RouteModule.prepare)
            │  └─ render route (app) /headers-echo (AppRender.getBodyResult) {next.route=/headers-echo}
            │     ├─ build component tree (NextNodeServer.createComponentTree)
            │     │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │     │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
            │     ├─ generateMetadata /headers-echo/page (ResolveMetadata.generateMetadata)
            │     ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
            │     └─ start response (NextNodeServer.startResponse)
            └─ middleware GET (Middleware.execute) {http.target=/user-overrides}"
          `)
        } else if (
          [
            'deploy (no adapter), middleware',
            'deploy (no adapter), proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET (Next.request) {http.target=/user-overrides} [error: doesn't cover descendants]
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
            'deploy, cache components, middleware',
            'deploy, cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET (Next.request) {http.target=/user-overrides} [error: doesn't cover descendants]
            ├─ middleware GET (Middleware.execute) {http.target=/user-overrides}
            └─ POST /headers-echo (BaseServer.handleRequest) {http.target=/user-overrides, http.route=/headers-echo, next.route=/headers-echo, http.status_code=200}
               ├─ NextNodeServer.clientComponentLoading
               ├─ prepare route module (RouteModule.prepare)
               ├─ render route (app) /headers-echo (AppRender.getBodyResult) {next.route=/headers-echo}
               │  ├─ build component tree (NextNodeServer.createComponentTree)
               │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               │  ├─ generateMetadata /headers-echo/page (ResolveMetadata.generateMetadata)
               │  └─ generateMetadata /layout (ResolveMetadata.generateMetadata)
               └─ start response (NextNodeServer.startResponse)"
          `)
        } else if (
          [
            'deploy (no adapter), cache components, middleware',
            'deploy (no adapter), cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET (Next.request) {http.target=/user-overrides} [error: doesn't cover descendants]
            ├─ middleware GET (Middleware.execute) {http.target=/user-overrides}
            └─ POST /headers-echo (BaseServer.handleRequest) {http.target=/user-overrides, http.route=/headers-echo, next.route=/headers-echo, http.status_code=200}
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
        return traceRequest(res, 'html', { known: [setByMiddleware] })
      },
      async ({ res, tree: getTree }) => {
        expect(res.status).toBe(200)
        expectNoInternalHeaders(res)
        const tree = await getTree()
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
        } else if (['deploy, middleware', 'deploy, proxy'].includes(env)) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET (Next.request) {http.target=/user-traceparent}
            └─ middleware GET (Middleware.execute) {http.target=/user-traceparent}
            [trace set by middleware] [set by middleware traceparent]
            └─ GET /headers-echo (BaseServer.handleRequest) {http.target=/user-traceparent, http.route=/headers-echo, next.route=/headers-echo, http.status_code=200}
               ├─ NextNodeServer.clientComponentLoading
               ├─ prepare route module (RouteModule.prepare)
               └─ render route (app) /headers-echo (AppRender.getBodyResult) {next.route=/headers-echo}
                  ├─ build component tree (NextNodeServer.createComponentTree)
                  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
                  ├─ generateMetadata /headers-echo/page (ResolveMetadata.generateMetadata)
                  ├─ generateMetadata /layout (ResolveMetadata.generateMetadata)
                  └─ start response (NextNodeServer.startResponse)"
          `)
        } else if (
          [
            'deploy (no adapter), middleware',
            'deploy (no adapter), proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET (Next.request) {http.target=/user-traceparent}
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
            'deploy, cache components, middleware',
            'deploy, cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET (Next.request) {http.target=/user-traceparent}
            └─ middleware GET (Middleware.execute) {http.target=/user-traceparent}
            [trace set by middleware] [set by middleware traceparent]
            └─ POST /headers-echo (BaseServer.handleRequest) {http.target=/user-traceparent, http.route=/headers-echo, next.route=/headers-echo, http.status_code=200}
               ├─ NextNodeServer.clientComponentLoading
               ├─ prepare route module (RouteModule.prepare)
               ├─ render route (app) /headers-echo (AppRender.getBodyResult) {next.route=/headers-echo}
               │  ├─ build component tree (NextNodeServer.createComponentTree)
               │  │  ├─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               │  │  └─ resolve segment modules (NextNodeServer.getLayoutOrPageModule)
               │  ├─ generateMetadata /headers-echo/page (ResolveMetadata.generateMetadata)
               │  └─ generateMetadata /layout (ResolveMetadata.generateMetadata)
               └─ start response (NextNodeServer.startResponse)"
          `)
        } else if (
          [
            'deploy (no adapter), cache components, middleware',
            'deploy (no adapter), cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET (Next.request) {http.target=/user-traceparent}
            └─ middleware GET (Middleware.execute) {http.target=/user-traceparent}
            [trace set by middleware] [set by middleware traceparent]
            └─ POST /headers-echo (BaseServer.handleRequest) {http.target=/user-traceparent, http.route=/headers-echo, next.route=/headers-echo, http.status_code=200}
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
        const text = await res.text()
        let traceIds: unknown
        try {
          traceIds = JSON.parse(text).traceIds
        } catch {}
        return {
          res,
          text,
          group:
            Array.isArray(traceIds) && traceIds.length > 0
              ? {
                  traceIds,
                  expected: [
                    'Instrumentation.loadModule',
                    'Instrumentation.register',
                  ],
                }
              : new Error(
                  `The response (status ${res.status}) has no instrumentation trace IDs: ${text.slice(0, 500)}`
                ),
          print: (spans) => printSpanTree(spans),
        }
      },
      async ({ res, text, tree: getTree }) => {
        expect(res.status).toBe(200)
        expect(JSON.parse(text).traceIds.length).toBeGreaterThan(0)
        const tree = await getTree()
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
        } else if (
          [
            'deploy, middleware',
            'deploy, proxy',
            'deploy, cache components, middleware',
            'deploy, cache components, proxy',
          ].includes(env)
        ) {
          expect(tree).toMatchInlineSnapshot(`
            "[trace A] GET (Next.request) {http.target=/route-handler} [error: doesn't cover descendants]
            ├─ GET /route-handler (BaseServer.handleRequest) {http.target=/route-handler, http.route=/route-handler, next.route=/route-handler, http.status_code=200}
            │  ├─ executing api route (app) /route-handler (AppRouteRouteHandlers.runHandler) {next.route=/route-handler}
            │  ├─ load app route module (AppRouteRouteModule.loadUserland) {next.route=/route-handler}
            │  ├─ load instrumentation module (Instrumentation.loadModule)
            │  ├─ prepare route module (RouteModule.prepare)
            │  ├─ register instrumentation (Instrumentation.register)
            │  └─ start response (NextNodeServer.startResponse)
            └─ middleware GET (Middleware.execute) {http.target=/route-handler}"
          `)
        } else if (
          [
            'deploy (no adapter), middleware',
            'deploy (no adapter), proxy',
            'deploy (no adapter), cache components, middleware',
            'deploy (no adapter), cache components, proxy',
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
      overrideFiles: overrideFiles(file, exportName),
      dependencies: { ...DEPENDENCIES, 'get-port': '5.1.1' },
      startCommand: 'node custom-server.js',
      serverReadyPattern: /- Local:/,
      env: {
        NEXT_TELEMETRY_DISABLED: '1',
        NODE_ENV: isNextDev ? 'development' : 'production',
      },
    })
    const env = getTestEnv(isTurbopack, exportName)
    const traceTest = useTraceTests(next)

    traceTest(
      'traces a page rendered after NextResponse.next() in the host span trace',
      async () => traceRequest(await next.fetch('/page'), 'html'),
      async ({ res, tree: getTree }) => {
        expect(res.status).toBe(200)
        expectNoInternalHeaders(res)
        const tree = await getTree()
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

    it('forwards trace headers to the render with an incoming tracestate', async () => {
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
      expect(echoed.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/)
      expect(echoed.traceparent).not.toContain(incoming.traceId)
      expect(echoed.tracestate).toBeUndefined()
    })

    traceTest(
      'respects a traceparent explicitly set by middleware over the host span',
      async () => {
        const setByMiddleware = newTraceContext('set by middleware')
        const res = await next.fetch('/user-traceparent', {
          headers: { 'x-test-traceparent': toTraceparent(setByMiddleware) },
        })
        return traceRequest(res, 'html', { known: [setByMiddleware] })
      },
      async ({ res, tree: getTree }) => {
        expect(res.status).toBe(200)
        expectNoInternalHeaders(res)
        const tree = await getTree()
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
