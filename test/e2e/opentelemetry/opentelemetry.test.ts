import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

import { SavedSpan, traceFile } from './constants'

const EXTERNAL = {
  traceId: 'ee75cd9e534ff5e9ed78b4a0c706f0f2',
  spanId: '0f6a325411bdc432',
} as const

createNextDescribe(
  'opentelemetry',
  {
    files: __dirname,
    skipDeployment: true,
    dependencies: require('./package.json').dependencies,
  },
  ({ next, isNextDev }) => {
    const getTraces = async (): Promise<SavedSpan[]> => {
      const traces = await next.readFile(traceFile)
      return traces
        .split('\n')
        .filter((val) => {
          if (val.includes('127.0.0.1')) {
            return false
          }
          return !!val
        })
        .map((line) => JSON.parse(line))
    }

    /**
     * Sanitize (modifies) span to make it ready for snapshot testing.
     */
    const sanitizeSpan = (span: SavedSpan) => {
      delete span.duration
      delete span.id
      delete span.links
      delete span.events
      delete span.timestamp
      span.traceId =
        span.traceId === EXTERNAL.traceId ? span.traceId : '[trace-id]'
      span.parentId =
        span.parentId === undefined || span.parentId === EXTERNAL.spanId
          ? span.parentId
          : '[parent-id]'
      return span
    }
    const sanitizeSpans = (spans: SavedSpan[]) => {
      return spans
        .sort((a, b) =>
          (a.attributes?.['next.span_name'] ?? '').localeCompare(
            b.attributes?.['next.span_name'] ?? ''
          )
        )
        .sort((a, b) =>
          (a.attributes?.['next.span_type'] ?? '').localeCompare(
            b.attributes?.['next.span_type'] ?? ''
          )
        )
        .map(sanitizeSpan)
    }

    const getSanitizedTraces = async (numberOfRootTraces: number) => {
      let traces
      await check(async () => {
        traces = sanitizeSpans(await getTraces())

        const rootSpans = traces.filter((span) => !span.parentId)
        return String(rootSpans.length)
      }, String(numberOfRootTraces))
      return traces
    }

    const cleanTraces = async () => {
      await next.patchFile(traceFile, '')
    }

    afterEach(async () => {
      await cleanTraces()
    })

    for (const env of [
      {
        name: 'root context',
        fetchInit: undefined,
        span: {
          traceId: '[trace-id]',
          rootParentId: undefined,
        },
      },
      {
        name: 'incoming context propagation',
        fetchInit: {
          headers: {
            traceparent: `00-${EXTERNAL.traceId}-${EXTERNAL.spanId}-01`,
          },
        },
        span: {
          traceId: EXTERNAL.traceId,
          rootParentId: EXTERNAL.spanId,
        },
      },
    ]) {
      // turbopack does not support experimental.instrumentationHook
      ;(process.env.TURBOPACK || process.env.__NEXT_EXPERIMENTAL_PPR
        ? describe.skip
        : describe)(env.name, () => {
        describe('app router', () => {
          it('should handle RSC with fetch', async () => {
            await next.fetch('/app/param/rsc-fetch', env.fetchInit)

            await check(async () => {
              const numberOfRootTraces =
                env.span.rootParentId === undefined ? 1 : 0
              const traces = await getSanitizedTraces(numberOfRootTraces)
              if (traces.length < 9) {
                return `not enough traces, expected 9, but got ${traces.length}`
              }
              expect(traces).toMatchInlineSnapshot(`
                [
                  {
                    "attributes": {
                      "http.method": "GET",
                      "http.url": "https://vercel.com/",
                      "net.peer.name": "vercel.com",
                      "next.span_name": "fetch GET https://vercel.com/",
                      "next.span_type": "AppRender.fetch",
                    },
                    "kind": 2,
                    "name": "fetch GET https://vercel.com/",
                    "parentId": "[parent-id]",
                    "status": {
                      "code": 0,
                    },
                    "traceId": "${env.span.traceId}",
                  },
                  {
                    "attributes": {
                      "next.route": "/app/[param]/rsc-fetch",
                      "next.span_name": "render route (app) /app/[param]/rsc-fetch",
                      "next.span_type": "AppRender.getBodyResult",
                    },
                    "kind": 0,
                    "name": "render route (app) /app/[param]/rsc-fetch",
                    "parentId": "[parent-id]",
                    "status": {
                      "code": 0,
                    },
                    "traceId": "${env.span.traceId}",
                  },
                  {
                    "attributes": {
                      "http.method": "GET",
                      "http.route": "/app/[param]/rsc-fetch",
                      "http.status_code": 200,
                      "http.target": "/app/param/rsc-fetch",
                      "next.route": "/app/[param]/rsc-fetch",
                      "next.span_name": "GET /app/[param]/rsc-fetch",
                      "next.span_type": "BaseServer.handleRequest",
                    },
                    "kind": 1,
                    "name": "GET /app/[param]/rsc-fetch",
                    "parentId": ${
                      env.span.rootParentId
                        ? `"${env.span.rootParentId}"`
                        : undefined
                    },
                    "status": {
                      "code": 0,
                    },
                    "traceId": "${env.span.traceId}",
                  },
                  {
                    "attributes": {
                      "next.span_name": "build component tree",
                      "next.span_type": "NextNodeServer.createComponentTree",
                    },
                    "kind": 0,
                    "name": "build component tree",
                    "parentId": "[parent-id]",
                    "status": {
                      "code": 0,
                    },
                    "traceId": "${env.span.traceId}",
                  },
                  {
                    "attributes": {
                      "next.route": "/app/[param]/rsc-fetch",
                      "next.span_name": "resolve page components",
                      "next.span_type": "NextNodeServer.findPageComponents",
                    },
                    "kind": 0,
                    "name": "resolve page components",
                    "parentId": "[parent-id]",
                    "status": {
                      "code": 0,
                    },
                    "traceId": "${env.span.traceId}",
                  },
                  {
                    "attributes": {
                      "next.segment": "[param]",
                      "next.span_name": "resolve segment modules",
                      "next.span_type": "NextNodeServer.getLayoutOrPageModule",
                    },
                    "kind": 0,
                    "name": "resolve segment modules",
                    "parentId": "[parent-id]",
                    "status": {
                      "code": 0,
                    },
                    "traceId": "${env.span.traceId}",
                  },
                  {
                    "attributes": {
                      "next.segment": "__PAGE__",
                      "next.span_name": "resolve segment modules",
                      "next.span_type": "NextNodeServer.getLayoutOrPageModule",
                    },
                    "kind": 0,
                    "name": "resolve segment modules",
                    "parentId": "[parent-id]",
                    "status": {
                      "code": 0,
                    },
                    "traceId": "${env.span.traceId}",
                  },
                  {
                    "attributes": {
                      "next.page": "/app/[param]/layout",
                      "next.span_name": "generateMetadata /app/[param]/layout",
                      "next.span_type": "ResolveMetadata.generateMetadata",
                    },
                    "kind": 0,
                    "name": "generateMetadata /app/[param]/layout",
                    "parentId": "[parent-id]",
                    "status": {
                      "code": 0,
                    },
                    "traceId": "${env.span.traceId}",
                  },
                  {
                    "attributes": {
                      "next.page": "/app/[param]/rsc-fetch/page",
                      "next.span_name": "generateMetadata /app/[param]/rsc-fetch/page",
                      "next.span_type": "ResolveMetadata.generateMetadata",
                    },
                    "kind": 0,
                    "name": "generateMetadata /app/[param]/rsc-fetch/page",
                    "parentId": "[parent-id]",
                    "status": {
                      "code": 0,
                    },
                    "traceId": "${env.span.traceId}",
                  },
                ]
              `)
              return 'success'
            }, 'success')
          })

          it('should handle route handlers in app router', async () => {
            await next.fetch('/api/app/param/data', env.fetchInit)

            await check(async () => {
              const numberOfRootTraces =
                env.span.rootParentId === undefined ? 1 : 0
              const traces = await getSanitizedTraces(numberOfRootTraces)
              if (traces.length < 3) {
                return `not enough traces, expected 3, but got ${traces.length}`
              }
              expect(traces).toMatchInlineSnapshot(`
                [
                  {
                    "attributes": {
                      "next.route": "/api/app/[param]/data/route",
                      "next.span_name": "executing api route (app) /api/app/[param]/data/route",
                      "next.span_type": "AppRouteRouteHandlers.runHandler",
                    },
                    "kind": 0,
                    "name": "executing api route (app) /api/app/[param]/data/route",
                    "parentId": "[parent-id]",
                    "status": {
                      "code": 0,
                    },
                    "traceId": "${env.span.traceId}",
                  },
                  {
                    "attributes": {
                      "http.method": "GET",
                      "http.route": "/api/app/[param]/data/route",
                      "http.status_code": 200,
                      "http.target": "/api/app/param/data",
                      "next.route": "/api/app/[param]/data/route",
                      "next.span_name": "GET /api/app/[param]/data/route",
                      "next.span_type": "BaseServer.handleRequest",
                    },
                    "kind": 1,
                    "name": "GET /api/app/[param]/data/route",
                    "parentId": ${
                      env.span.rootParentId
                        ? `"${env.span.rootParentId}"`
                        : undefined
                    },
                    "status": {
                      "code": 0,
                    },
                    "traceId": "${env.span.traceId}",
                  },
                  {
                    "attributes": {
                      "next.route": "/api/app/[param]/data",
                      "next.span_name": "resolve page components",
                      "next.span_type": "NextNodeServer.findPageComponents",
                    },
                    "kind": 0,
                    "name": "resolve page components",
                    "parentId": "[parent-id]",
                    "status": {
                      "code": 0,
                    },
                    "traceId": "${env.span.traceId}",
                  },
                ]
              `)
              return 'success'
            }, 'success')
          })
        })

        describe('pages', () => {
          it('should handle getServerSideProps', async () => {
            await next.fetch('/pages/param/getServerSideProps', env.fetchInit)

            await check(async () => {
              const numberOfRootTraces =
                env.span.rootParentId === undefined ? 1 : 0
              const traces = await getSanitizedTraces(numberOfRootTraces)
              if (traces.length < 4) {
                return `not enough traces, expected 4, but got ${traces.length}`
              }
              expect(traces).toMatchInlineSnapshot(`
                [
                  {
                    "attributes": {
                      "http.method": "GET",
                      "http.route": "/pages/[param]/getServerSideProps",
                      "http.status_code": 200,
                      "http.target": "/pages/param/getServerSideProps",
                      "next.route": "/pages/[param]/getServerSideProps",
                      "next.span_name": "GET /pages/[param]/getServerSideProps",
                      "next.span_type": "BaseServer.handleRequest",
                    },
                    "kind": 1,
                    "name": "GET /pages/[param]/getServerSideProps",
                    "parentId": ${
                      env.span.rootParentId
                        ? `"${env.span.rootParentId}"`
                        : undefined
                    },
                    "status": {
                      "code": 0,
                    },
                    "traceId": "${env.span.traceId}",
                  },
                  {
                    "attributes": {
                      "next.route": "/pages/[param]/getServerSideProps",
                      "next.span_name": "resolve page components",
                      "next.span_type": "NextNodeServer.findPageComponents",
                    },
                    "kind": 0,
                    "name": "resolve page components",
                    "parentId": "[parent-id]",
                    "status": {
                      "code": 0,
                    },
                    "traceId": "${env.span.traceId}",
                  },
                  {
                    "attributes": {
                      "next.route": "/pages/[param]/getServerSideProps",
                      "next.span_name": "getServerSideProps /pages/[param]/getServerSideProps",
                      "next.span_type": "Render.getServerSideProps",
                    },
                    "kind": 0,
                    "name": "getServerSideProps /pages/[param]/getServerSideProps",
                    "parentId": "[parent-id]",
                    "status": {
                      "code": 0,
                    },
                    "traceId": "${env.span.traceId}",
                  },
                  {
                    "attributes": {
                      "next.route": "/pages/[param]/getServerSideProps",
                      "next.span_name": "render route (pages) /pages/[param]/getServerSideProps",
                      "next.span_type": "Render.renderDocument",
                    },
                    "kind": 0,
                    "name": "render route (pages) /pages/[param]/getServerSideProps",
                    "parentId": "[parent-id]",
                    "status": {
                      "code": 0,
                    },
                    "traceId": "${env.span.traceId}",
                  },
                ]
              `)
              return 'success'
            }, 'success')
          })

          it("should handle getStaticProps when fallback: 'blocking'", async () => {
            const v = env.span.rootParentId ? '2' : ''
            await next.fetch(`/pages/param/getStaticProps${v}`, env.fetchInit)

            await check(async () => {
              const numberOfRootTraces =
                env.span.rootParentId === undefined ? 1 : 0
              const traces = await getSanitizedTraces(numberOfRootTraces)
              if (traces.length < 4) {
                return `not enough traces, expected 4, but got ${traces.length}`
              }
              expect(traces).toMatchInlineSnapshot(`
                [
                  {
                    "attributes": {
                      "http.method": "GET",
                      "http.route": "/pages/[param]/getStaticProps${v}",
                      "http.status_code": 200,
                      "http.target": "/pages/param/getStaticProps${v}",
                      "next.route": "/pages/[param]/getStaticProps${v}",
                      "next.span_name": "GET /pages/[param]/getStaticProps${v}",
                      "next.span_type": "BaseServer.handleRequest",
                    },
                    "kind": 1,
                    "name": "GET /pages/[param]/getStaticProps${v}",
                    "parentId": ${
                      env.span.rootParentId
                        ? `"${env.span.rootParentId}"`
                        : undefined
                    },
                    "status": {
                      "code": 0,
                    },
                    "traceId": "${env.span.traceId}",
                  },
                  {
                    "attributes": {
                      "next.route": "/pages/[param]/getStaticProps${v}",
                      "next.span_name": "resolve page components",
                      "next.span_type": "NextNodeServer.findPageComponents",
                    },
                    "kind": 0,
                    "name": "resolve page components",
                    "parentId": "[parent-id]",
                    "status": {
                      "code": 0,
                    },
                    "traceId": "${env.span.traceId}",
                  },
                  {
                    "attributes": {
                      "next.route": "/pages/[param]/getStaticProps${v}",
                      "next.span_name": "getStaticProps /pages/[param]/getStaticProps${v}",
                      "next.span_type": "Render.getStaticProps",
                    },
                    "kind": 0,
                    "name": "getStaticProps /pages/[param]/getStaticProps${v}",
                    "parentId": "[parent-id]",
                    "status": {
                      "code": 0,
                    },
                    "traceId": "${env.span.traceId}",
                  },
                  {
                    "attributes": {
                      "next.route": "/pages/[param]/getStaticProps${v}",
                      "next.span_name": "render route (pages) /pages/[param]/getStaticProps${v}",
                      "next.span_type": "Render.renderDocument",
                    },
                    "kind": 0,
                    "name": "render route (pages) /pages/[param]/getStaticProps${v}",
                    "parentId": "[parent-id]",
                    "status": {
                      "code": 0,
                    },
                    "traceId": "${env.span.traceId}",
                  },
                ]
              `)
              return 'success'
            }, 'success')
          })

          it('should handle api routes in pages', async () => {
            await next.fetch('/api/pages/param/basic', env.fetchInit)

            await check(async () => {
              const numberOfRootTraces =
                env.span.rootParentId === undefined ? 1 : 0
              const traces = await getSanitizedTraces(numberOfRootTraces)
              if (traces.length < 2) {
                return `not enough traces, expected 2, but got ${traces.length}`
              }
              expect(traces).toMatchInlineSnapshot(`
                [
                  {
                    "attributes": {
                      "http.method": "GET",
                      "http.route": "/api/pages/[param]/basic",
                      "http.status_code": 200,
                      "http.target": "/api/pages/param/basic",
                      "next.route": "/api/pages/[param]/basic",
                      "next.span_name": "GET /api/pages/[param]/basic",
                      "next.span_type": "BaseServer.handleRequest",
                    },
                    "kind": 1,
                    "name": "GET /api/pages/[param]/basic",
                    "parentId": ${
                      env.span.rootParentId
                        ? `"${env.span.rootParentId}"`
                        : undefined
                    },
                    "status": {
                      "code": 0,
                    },
                    "traceId": "${env.span.traceId}",
                  },
                  {
                    "attributes": {
                      "next.span_name": "executing api route (pages) /api/pages/[param]/basic",
                      "next.span_type": "Node.runHandler",
                    },
                    "kind": 0,
                    "name": "executing api route (pages) /api/pages/[param]/basic",
                    "parentId": "[parent-id]",
                    "status": {
                      "code": 0,
                    },
                    "traceId": "${env.span.traceId}",
                  },
                ]
              `)
              return 'success'
            }, 'success')
          })
        })
      })
    }
  }
)

createNextDescribe(
  'opentelemetry with disabled fetch tracing',
  {
    files: __dirname,
    skipDeployment: true,
    dependencies: require('./package.json').dependencies,
    env: {
      NEXT_OTEL_FETCH_DISABLED: '1',
    },
  },
  ({ next, isNextDev }) => {
    const getTraces = async (): Promise<SavedSpan[]> => {
      const traces = await next.readFile(traceFile)
      return traces
        .split('\n')
        .filter((val) => {
          if (val.includes('127.0.0.1')) {
            return false
          }
          return !!val
        })
        .map((line) => JSON.parse(line))
    }

    /**
     * Sanitize (modifies) span to make it ready for snapshot testing.
     */
    const sanitizeSpan = (span: SavedSpan) => {
      delete span.duration
      delete span.id
      delete span.links
      delete span.events
      delete span.timestamp
      span.traceId =
        span.traceId === EXTERNAL.traceId ? span.traceId : '[trace-id]'
      span.parentId =
        span.parentId === undefined || span.parentId === EXTERNAL.spanId
          ? span.parentId
          : '[parent-id]'
      return span
    }
    const sanitizeSpans = (spans: SavedSpan[]) => {
      return spans
        .sort((a, b) =>
          (a.attributes?.['next.span_name'] ?? '').localeCompare(
            b.attributes?.['next.span_name'] ?? ''
          )
        )
        .sort((a, b) =>
          (a.attributes?.['next.span_type'] ?? '').localeCompare(
            b.attributes?.['next.span_type'] ?? ''
          )
        )
        .map(sanitizeSpan)
    }

    const getSanitizedTraces = async (numberOfRootTraces: number) => {
      let traces
      await check(async () => {
        traces = sanitizeSpans(await getTraces())

        const rootSpans = traces.filter((span) => !span.parentId)
        return String(rootSpans.length)
      }, String(numberOfRootTraces))
      return traces
    }

    const cleanTraces = async () => {
      await next.patchFile(traceFile, '')
    }

    afterEach(async () => {
      await cleanTraces()
    })

    // turbopack does not support experimental.instrumentationHook
    ;(process.env.TURBOPACK || process.env.__NEXT_EXPERIMENTAL_PPR
      ? describe.skip
      : describe)('root context', () => {
      describe('app router with disabled fetch', () => {
        it('should handle RSC with disabled fetch', async () => {
          await next.fetch('/app/param/rsc-fetch')

          await check(async () => {
            const traces = await getSanitizedTraces(1)
            if (traces.length < 5) {
              return `not enough traces, expected 5, but got ${traces.length}`
            }
            expect(traces).toMatchInlineSnapshot(`
                [
                  {
                    "attributes": {
                      "next.route": "/app/[param]/rsc-fetch",
                      "next.span_name": "render route (app) /app/[param]/rsc-fetch",
                      "next.span_type": "AppRender.getBodyResult",
                    },
                    "kind": 0,
                    "name": "render route (app) /app/[param]/rsc-fetch",
                    "parentId": "[parent-id]",
                    "status": {
                      "code": 0,
                    },
                    "traceId": "[trace-id]",
                  },
                  {
                    "attributes": {
                      "http.method": "GET",
                      "http.route": "/app/[param]/rsc-fetch",
                      "http.status_code": 200,
                      "http.target": "/app/param/rsc-fetch",
                      "next.route": "/app/[param]/rsc-fetch",
                      "next.span_name": "GET /app/[param]/rsc-fetch",
                      "next.span_type": "BaseServer.handleRequest",
                    },
                    "kind": 1,
                    "name": "GET /app/[param]/rsc-fetch",
                    "parentId": undefined,
                    "status": {
                      "code": 0,
                    },
                    "traceId": "[trace-id]",
                  },
                  {
                    "attributes": {
                      "next.span_name": "build component tree",
                      "next.span_type": "NextNodeServer.createComponentTree",
                    },
                    "kind": 0,
                    "name": "build component tree",
                    "parentId": "[parent-id]",
                    "status": {
                      "code": 0,
                    },
                    "traceId": "[trace-id]",
                  },
                  {
                    "attributes": {
                      "next.route": "/app/[param]/rsc-fetch",
                      "next.span_name": "resolve page components",
                      "next.span_type": "NextNodeServer.findPageComponents",
                    },
                    "kind": 0,
                    "name": "resolve page components",
                    "parentId": "[parent-id]",
                    "status": {
                      "code": 0,
                    },
                    "traceId": "[trace-id]",
                  },
                  {
                    "attributes": {
                      "next.segment": "[param]",
                      "next.span_name": "resolve segment modules",
                      "next.span_type": "NextNodeServer.getLayoutOrPageModule",
                    },
                    "kind": 0,
                    "name": "resolve segment modules",
                    "parentId": "[parent-id]",
                    "status": {
                      "code": 0,
                    },
                    "traceId": "[trace-id]",
                  },
                  {
                    "attributes": {
                      "next.segment": "__PAGE__",
                      "next.span_name": "resolve segment modules",
                      "next.span_type": "NextNodeServer.getLayoutOrPageModule",
                    },
                    "kind": 0,
                    "name": "resolve segment modules",
                    "parentId": "[parent-id]",
                    "status": {
                      "code": 0,
                    },
                    "traceId": "[trace-id]",
                  },
                  {
                    "attributes": {
                      "next.page": "/app/[param]/layout",
                      "next.span_name": "generateMetadata /app/[param]/layout",
                      "next.span_type": "ResolveMetadata.generateMetadata",
                    },
                    "kind": 0,
                    "name": "generateMetadata /app/[param]/layout",
                    "parentId": "[parent-id]",
                    "status": {
                      "code": 0,
                    },
                    "traceId": "[trace-id]",
                  },
                  {
                    "attributes": {
                      "next.page": "/app/[param]/rsc-fetch/page",
                      "next.span_name": "generateMetadata /app/[param]/rsc-fetch/page",
                      "next.span_type": "ResolveMetadata.generateMetadata",
                    },
                    "kind": 0,
                    "name": "generateMetadata /app/[param]/rsc-fetch/page",
                    "parentId": "[parent-id]",
                    "status": {
                      "code": 0,
                    },
                    "traceId": "[trace-id]",
                  },
                ]
              `)
            return 'success'
          }, 'success')
        })
      })
    })
  }
)
