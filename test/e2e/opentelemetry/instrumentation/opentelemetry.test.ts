import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

import { SavedSpan } from './constants'
import { type Collector, connectCollector } from './collector'

const EXTERNAL = {
  traceId: 'ee75cd9e534ff5e9ed78b4a0c706f0f2',
  spanId: '0f6a325411bdc432',
} as const

const COLLECTOR_PORT = 9001

describe('opentelemetry', () => {
  const { next, skipped, isNextDev } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    dependencies: require('./package.json').dependencies,
    env: {
      TEST_OTEL_COLLECTOR_PORT: String(COLLECTOR_PORT),
      NEXT_TELEMETRY_DISABLED: '1',
    },
  })

  if (skipped) {
    return
  }

  let collector: Collector

  function getCollector(): Collector {
    return collector
  }

  beforeEach(async () => {
    collector = await connectCollector({ port: COLLECTOR_PORT })
  })

  afterEach(async () => {
    await collector.shutdown()
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
    ;(process.env.__NEXT_EXPERIMENTAL_PPR ? describe.skip : describe)(
      env.name,
      () => {
        describe('app router', () => {
          it('should handle RSC with fetch', async () => {
            await next.fetch('/app/param/rsc-fetch', env.fetchInit)

            await expectTrace(getCollector(), [
              {
                name: 'GET /app/[param]/rsc-fetch',
                attributes: {
                  'http.method': 'GET',
                  'http.route': '/app/[param]/rsc-fetch',
                  'http.status_code': 200,
                  'http.target': '/app/param/rsc-fetch',
                  'next.route': '/app/[param]/rsc-fetch',
                  'next.rsc': false,
                  'next.span_name': 'GET /app/[param]/rsc-fetch',
                  'next.span_type': 'BaseServer.handleRequest',
                },
                kind: 1,
                status: { code: 0 },
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
                spans: [
                  {
                    name: 'render route (app) /app/[param]/rsc-fetch',
                    attributes: {
                      'next.route': '/app/[param]/rsc-fetch',
                      'next.span_name':
                        'render route (app) /app/[param]/rsc-fetch',
                      'next.span_type': 'AppRender.getBodyResult',
                    },
                    kind: 0,
                    status: { code: 0 },
                    spans: [
                      {
                        name: 'build component tree',
                        attributes: {
                          'next.span_name': 'build component tree',
                          'next.span_type':
                            'NextNodeServer.createComponentTree',
                        },
                        kind: 0,
                        status: { code: 0 },
                        spans: [
                          {
                            name: 'resolve segment modules',
                            attributes: {
                              'next.segment': '__PAGE__',
                              'next.span_name': 'resolve segment modules',
                              'next.span_type':
                                'NextNodeServer.getLayoutOrPageModule',
                            },
                            kind: 0,
                            status: { code: 0 },
                          },
                          {
                            name: 'resolve segment modules',
                            attributes: {
                              'next.segment': '[param]',
                              'next.span_name': 'resolve segment modules',
                              'next.span_type':
                                'NextNodeServer.getLayoutOrPageModule',
                            },
                            kind: 0,
                            status: { code: 0 },
                          },
                        ],
                      },
                      {
                        name: 'fetch GET https://example.vercel.sh/',
                        attributes: {
                          'http.method': 'GET',
                          'http.url': 'https://example.vercel.sh/',
                          'net.peer.name': 'example.vercel.sh',
                          'next.span_name':
                            'fetch GET https://example.vercel.sh/',
                          'next.span_type': 'AppRender.fetch',
                        },
                        kind: 2,
                        status: { code: 0 },
                      },
                      {
                        name: 'generateMetadata /app/[param]/layout',
                        attributes: {
                          'next.page': '/app/[param]/layout',
                          'next.span_name':
                            'generateMetadata /app/[param]/layout',
                          'next.span_type': 'ResolveMetadata.generateMetadata',
                        },
                        kind: 0,
                        status: { code: 0 },
                      },
                      {
                        name: 'generateMetadata /app/[param]/rsc-fetch/page',
                        attributes: {
                          'next.page': '/app/[param]/rsc-fetch/page',
                          'next.span_name':
                            'generateMetadata /app/[param]/rsc-fetch/page',
                          'next.span_type': 'ResolveMetadata.generateMetadata',
                        },
                        kind: 0,
                        status: { code: 0 },
                      },
                      {
                        attributes: {
                          'next.clientComponentLoadCount': isNextDev
                            ? // In dev, additional client components are being loaded
                              // due to RSC props being deserialized.
                              9
                            : 6,
                          'next.span_type':
                            'NextNodeServer.clientComponentLoading',
                        },
                        kind: 0,
                        name: 'NextNodeServer.clientComponentLoading',
                        status: {
                          code: 0,
                        },
                      },
                      {
                        name: 'start response',
                        attributes: {
                          'next.span_name': 'start response',
                          'next.span_type': 'NextNodeServer.startResponse',
                        },
                        kind: 0,
                        status: { code: 0 },
                      },
                    ],
                  },
                  {
                    name: 'resolve page components',
                    attributes: {
                      'next.route': '/app/[param]/rsc-fetch',
                      'next.span_name': 'resolve page components',
                      'next.span_type': 'NextNodeServer.findPageComponents',
                    },
                    kind: 0,
                    status: { code: 0 },
                  },
                ],
              },
            ])
          })

          it('should propagate custom context without span', async () => {
            await next.fetch('/app/param/rsc-fetch', {
              ...env.fetchInit,
              headers: { ...env.fetchInit?.headers, 'x-custom': 'custom1' },
            })

            await expectTrace(getCollector(), [
              {
                name: 'GET /app/[param]/rsc-fetch',
                attributes: {
                  custom: 'custom1',
                },
              },
            ])
          })

          it('should handle RSC with fetch on edge', async () => {
            await next.fetch('/app/param/rsc-fetch/edge', env.fetchInit)

            await expectTrace(getCollector(), [
              {
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
                runtime: 'edge',
                name: 'GET /app/[param]/rsc-fetch/edge',
                kind: 1,
                attributes: {
                  'next.span_name': 'GET /app/[param]/rsc-fetch/edge',
                  'next.span_type': 'BaseServer.handleRequest',
                  'http.method': 'GET',
                  'http.target': '/app/param/rsc-fetch/edge?param=param',
                  'http.status_code': 200,
                  'next.route': '/app/[param]/rsc-fetch/edge',
                  'http.route': '/app/[param]/rsc-fetch/edge',
                },
                status: { code: 0 },
                spans: [
                  {
                    name: 'render route (app) /app/[param]/rsc-fetch/edge',
                    kind: 0,
                    attributes: {
                      'next.span_name':
                        'render route (app) /app/[param]/rsc-fetch/edge',
                      'next.span_type': 'AppRender.getBodyResult',
                      'next.route': '/app/[param]/rsc-fetch/edge',
                    },
                    status: { code: 0 },
                    spans: [
                      {
                        name: 'build component tree',
                        kind: 0,
                        attributes: {
                          'next.span_name': 'build component tree',
                          'next.span_type':
                            'NextNodeServer.createComponentTree',
                        },
                        status: { code: 0 },
                        spans: [
                          {
                            name: 'resolve segment modules',
                            kind: 0,
                            attributes: {
                              'next.span_name': 'resolve segment modules',
                              'next.span_type':
                                'NextNodeServer.getLayoutOrPageModule',
                              'next.segment': '__PAGE__',
                            },
                            status: { code: 0 },
                          },
                          {
                            name: 'resolve segment modules',
                            kind: 0,
                            attributes: {
                              'next.span_name': 'resolve segment modules',
                              'next.span_type':
                                'NextNodeServer.getLayoutOrPageModule',
                              'next.segment': '[param]',
                            },
                            status: { code: 0 },
                          },
                        ],
                      },
                      {
                        name: 'fetch GET https://example.vercel.sh/',
                        kind: 2,
                        attributes: {
                          'next.span_name':
                            'fetch GET https://example.vercel.sh/',
                          'next.span_type': 'AppRender.fetch',
                          'http.url': 'https://example.vercel.sh/',
                          'http.method': 'GET',
                          'net.peer.name': 'example.vercel.sh',
                        },
                        status: { code: 0 },
                      },
                      {
                        name: 'generateMetadata /app/[param]/layout',
                        kind: 0,
                        attributes: {
                          'next.span_name':
                            'generateMetadata /app/[param]/layout',
                          'next.span_type': 'ResolveMetadata.generateMetadata',
                          'next.page': '/app/[param]/layout',
                        },
                        status: { code: 0 },
                      },
                      {
                        name: 'generateMetadata /app/[param]/rsc-fetch/edge/page',
                        kind: 0,
                        attributes: {
                          'next.span_name':
                            'generateMetadata /app/[param]/rsc-fetch/edge/page',
                          'next.span_type': 'ResolveMetadata.generateMetadata',
                          'next.page': '/app/[param]/rsc-fetch/edge/page',
                        },
                        status: { code: 0 },
                      },
                    ],
                  },
                ],
              },

              // TODO: what is this trace? What's the value in it?
              {
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
                runtime: 'nodejs',
                name: 'GET /app/param/rsc-fetch/edge',
                kind: 1,
                attributes: {
                  'next.span_name': 'GET /app/param/rsc-fetch/edge',
                  'next.span_type': 'BaseServer.handleRequest',
                  'http.method': 'GET',
                  'http.target': '/app/param/rsc-fetch/edge',
                  'http.status_code': 200,
                },
                status: { code: 0 },
                spans: [
                  {
                    name: 'start response',
                    kind: 0,
                    attributes: {
                      'next.span_name': 'start response',
                      'next.span_type': 'NextNodeServer.startResponse',
                    },
                    status: { code: 0 },
                  },
                ],
              },
            ])
          })

          it('should handle RSC with fetch in RSC mode', async () => {
            await next.fetch('/app/param/rsc-fetch', {
              ...env.fetchInit,
              headers: {
                ...env.fetchInit?.headers,
                Rsc: '1',
              },
            })

            await expectTrace(getCollector(), [
              {
                runtime: 'nodejs',
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
                name: 'RSC GET /app/[param]/rsc-fetch',
                attributes: {
                  'http.method': 'GET',
                  'http.route': '/app/[param]/rsc-fetch',
                  'http.status_code': 200,
                  'http.target': '/app/param/rsc-fetch',
                  'next.route': '/app/[param]/rsc-fetch',
                  'next.rsc': true,
                  'next.span_name': 'RSC GET /app/[param]/rsc-fetch',
                  'next.span_type': 'BaseServer.handleRequest',
                },
                kind: 1,
                status: { code: 0 },
              },
            ])
          })

          it('should handle route handlers in app router', async () => {
            await next.fetch('/api/app/param/data', env.fetchInit)

            await expectTrace(getCollector(), [
              {
                name: 'GET /api/app/[param]/data/route',
                attributes: {
                  'http.method': 'GET',
                  'http.route': '/api/app/[param]/data/route',
                  'http.status_code': 200,
                  'http.target': '/api/app/param/data',
                  'next.route': '/api/app/[param]/data/route',
                  'next.span_name': 'GET /api/app/[param]/data/route',
                  'next.span_type': 'BaseServer.handleRequest',
                },
                kind: 1,
                status: { code: 0 },
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
                spans: [
                  {
                    name: 'executing api route (app) /api/app/[param]/data/route',
                    attributes: {
                      'next.route': '/api/app/[param]/data/route',
                      'next.span_name':
                        'executing api route (app) /api/app/[param]/data/route',
                      'next.span_type': 'AppRouteRouteHandlers.runHandler',
                    },
                    kind: 0,
                    status: { code: 0 },
                  },
                  {
                    name: 'resolve page components',
                    attributes: {
                      'next.route': '/api/app/[param]/data',
                      'next.span_name': 'resolve page components',
                      'next.span_type': 'NextNodeServer.findPageComponents',
                    },
                    kind: 0,
                    status: { code: 0 },
                  },
                  {
                    name: 'start response',
                    attributes: {
                      'next.span_name': 'start response',
                      'next.span_type': 'NextNodeServer.startResponse',
                    },
                    kind: 0,
                    status: { code: 0 },
                  },
                ],
              },
            ])
          })

          it('should handle route handlers in app router on edge', async () => {
            await next.fetch('/api/app/param/data/edge', env.fetchInit)

            await expectTrace(getCollector(), [
              {
                runtime: 'edge',
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
                name: 'executing api route (app) /api/app/[param]/data/edge/route',
                attributes: {
                  'next.route': '/api/app/[param]/data/edge/route',
                  'next.span_name':
                    'executing api route (app) /api/app/[param]/data/edge/route',
                  'next.span_type': 'AppRouteRouteHandlers.runHandler',
                },
                kind: 0,
                status: { code: 0 },
              },

              // TODO: what is this trace? What's the value in it?
              {
                runtime: 'nodejs',
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
                name: 'GET /api/app/param/data/edge',
                kind: 1,
                attributes: {
                  'next.span_name': 'GET /api/app/param/data/edge',
                  'next.span_type': 'BaseServer.handleRequest',
                  'http.method': 'GET',
                  'http.target': '/api/app/param/data/edge',
                  'http.status_code': 200,
                },
                status: { code: 0 },
                spans: [
                  {
                    name: 'start response',
                    kind: 0,
                    attributes: {
                      'next.span_name': 'start response',
                      'next.span_type': 'NextNodeServer.startResponse',
                    },
                    status: { code: 0 },
                  },
                ],
              },
            ])
          })

          it('should trace middleware', async () => {
            await next.fetch('/behind-middleware', env.fetchInit)

            await expectTrace(getCollector(), [
              {
                runtime: 'edge',
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
                name: 'middleware GET /behind-middleware',
                attributes: {
                  'http.method': 'GET',
                  'http.target': '/behind-middleware',
                  'next.span_name': 'middleware GET /behind-middleware',
                  'next.span_type': 'Middleware.execute',
                },
                status: { code: 0 },
                spans: [],
              },

              {
                runtime: 'nodejs',
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
                name: 'GET /behind-middleware',
                attributes: {
                  'http.method': 'GET',
                  'http.route': '/behind-middleware',
                  'http.status_code': 200,
                  'http.target': '/behind-middleware',
                  'next.route': '/behind-middleware',
                  'next.span_name': 'GET /behind-middleware',
                  'next.span_type': 'BaseServer.handleRequest',
                },
              },
            ])
          })
        })

        describe('pages', () => {
          it('should handle getServerSideProps', async () => {
            await next.fetch('/pages/param/getServerSideProps', env.fetchInit)

            await expectTrace(getCollector(), [
              {
                name: 'GET /pages/[param]/getServerSideProps',
                attributes: {
                  'http.method': 'GET',
                  'http.route': '/pages/[param]/getServerSideProps',
                  'http.status_code': 200,
                  'http.target': '/pages/param/getServerSideProps',
                  'next.route': '/pages/[param]/getServerSideProps',
                  'next.span_name': 'GET /pages/[param]/getServerSideProps',
                  'next.span_type': 'BaseServer.handleRequest',
                },
                kind: 1,
                status: { code: 0 },
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
                spans: [
                  {
                    name: 'getServerSideProps /pages/[param]/getServerSideProps',
                    attributes: {
                      'next.route': '/pages/[param]/getServerSideProps',
                      'next.span_name':
                        'getServerSideProps /pages/[param]/getServerSideProps',
                      'next.span_type': 'Render.getServerSideProps',
                    },
                    kind: 0,
                    status: { code: 0 },
                  },
                  {
                    name: 'render route (pages) /pages/[param]/getServerSideProps',
                    attributes: {
                      'next.route': '/pages/[param]/getServerSideProps',
                      'next.span_name':
                        'render route (pages) /pages/[param]/getServerSideProps',
                      'next.span_type': 'Render.renderDocument',
                    },
                    kind: 0,
                    status: { code: 0 },
                  },
                  {
                    name: 'resolve page components',
                    attributes: {
                      'next.route': '/pages/[param]/getServerSideProps',
                      'next.span_name': 'resolve page components',
                      'next.span_type': 'NextNodeServer.findPageComponents',
                    },
                    kind: 0,
                    status: { code: 0 },
                  },
                ],
              },
            ])
          })

          it("should handle getStaticProps when fallback: 'blocking'", async () => {
            const v = env.span.rootParentId ? '2' : ''
            await next.fetch(`/pages/param/getStaticProps${v}`, env.fetchInit)

            await expectTrace(getCollector(), [
              {
                name: `GET /pages/[param]/getStaticProps${v}`,
                attributes: {
                  'http.method': 'GET',
                  'http.route': `/pages/[param]/getStaticProps${v}`,
                  'http.status_code': 200,
                  'http.target': `/pages/param/getStaticProps${v}`,
                  'next.route': `/pages/[param]/getStaticProps${v}`,
                  'next.span_name': `GET /pages/[param]/getStaticProps${v}`,
                  'next.span_type': 'BaseServer.handleRequest',
                },
                kind: 1,
                status: { code: 0 },
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
                spans: [
                  {
                    name: `getStaticProps /pages/[param]/getStaticProps${v}`,
                    attributes: {
                      'next.route': `/pages/[param]/getStaticProps${v}`,
                      'next.span_name': `getStaticProps /pages/[param]/getStaticProps${v}`,
                      'next.span_type': 'Render.getStaticProps',
                    },
                    kind: 0,
                    status: { code: 0 },
                  },
                  {
                    name: `render route (pages) /pages/[param]/getStaticProps${v}`,
                    attributes: {
                      'next.route': `/pages/[param]/getStaticProps${v}`,
                      'next.span_name': `render route (pages) /pages/[param]/getStaticProps${v}`,
                      'next.span_type': 'Render.renderDocument',
                    },
                    kind: 0,
                    status: { code: 0 },
                  },
                  {
                    name: 'resolve page components',
                    attributes: {
                      'next.route': `/pages/[param]/getStaticProps${v}`,
                      'next.span_name': 'resolve page components',
                      'next.span_type': 'NextNodeServer.findPageComponents',
                    },
                    kind: 0,
                    status: { code: 0 },
                  },
                ],
              },
            ])
          })

          it('should handle getServerSideProps on edge', async () => {
            await next.fetch(
              '/pages/param/edge/getServerSideProps',
              env.fetchInit
            )

            await expectTrace(getCollector(), [
              {
                runtime: 'edge',
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
                name: 'GET /pages/[param]/edge/getServerSideProps',
                kind: 1,
                attributes: {
                  'next.span_name':
                    'GET /pages/[param]/edge/getServerSideProps',
                  'next.span_type': 'BaseServer.handleRequest',
                  'http.method': 'GET',
                  'http.target':
                    '/pages/param/edge/getServerSideProps?param=param',
                  'http.status_code': 200,
                  'next.route': '/pages/[param]/edge/getServerSideProps',
                  'http.route': '/pages/[param]/edge/getServerSideProps',
                },
                status: { code: 0 },
                spans: [
                  {
                    name: 'getServerSideProps /pages/[param]/edge/getServerSideProps',
                    kind: 0,
                    attributes: {
                      'next.span_name':
                        'getServerSideProps /pages/[param]/edge/getServerSideProps',
                      'next.span_type': 'Render.getServerSideProps',
                      'next.route': '/pages/[param]/edge/getServerSideProps',
                    },
                    status: { code: 0 },
                  },
                  {
                    name: 'render route (pages) /pages/[param]/edge/getServerSideProps',
                    kind: 0,
                    attributes: {
                      'next.span_name':
                        'render route (pages) /pages/[param]/edge/getServerSideProps',
                      'next.span_type': 'Render.renderDocument',
                      'next.route': '/pages/[param]/edge/getServerSideProps',
                    },
                    status: { code: 0 },
                  },
                ],
              },

              // TODO: what is this trace? What's the value in it?
              {
                runtime: 'nodejs',
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
                name: 'GET /pages/param/edge/getServerSideProps',
                kind: 1,
                attributes: {
                  'next.span_name': 'GET /pages/param/edge/getServerSideProps',
                  'next.span_type': 'BaseServer.handleRequest',
                  'http.method': 'GET',
                  'http.target': '/pages/param/edge/getServerSideProps',
                  'http.status_code': 200,
                },
                status: { code: 0 },
                spans: [
                  {
                    name: 'start response',
                    kind: 0,
                    attributes: {
                      'next.span_name': 'start response',
                      'next.span_type': 'NextNodeServer.startResponse',
                    },
                    status: { code: 0 },
                  },
                ],
              },
            ])
          })

          it('should handle api routes in pages', async () => {
            await next.fetch('/api/pages/param/basic', env.fetchInit)

            await expectTrace(getCollector(), [
              {
                name: 'GET /api/pages/[param]/basic',
                attributes: {
                  'http.method': 'GET',
                  'http.route': '/api/pages/[param]/basic',
                  'http.status_code': 200,
                  'http.target': '/api/pages/param/basic',
                  'next.route': '/api/pages/[param]/basic',
                  'next.span_name': 'GET /api/pages/[param]/basic',
                  'next.span_type': 'BaseServer.handleRequest',
                },
                kind: 1,
                status: { code: 0 },
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
                spans: [
                  {
                    name: 'executing api route (pages) /api/pages/[param]/basic',
                    attributes: {
                      'next.span_name':
                        'executing api route (pages) /api/pages/[param]/basic',
                      'next.span_type': 'Node.runHandler',
                    },
                    kind: 0,
                    status: { code: 0 },
                  },
                ],
              },
            ])
          })

          it('should handle api routes in pages on edge', async () => {
            await next.fetch('/api/pages/param/edge', env.fetchInit)

            await expectTrace(getCollector(), [
              {
                runtime: 'edge',
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
                name: 'executing api route (pages) /api/pages/[param]/edge',
                attributes: {
                  'next.span_name':
                    'executing api route (pages) /api/pages/[param]/edge',
                  'next.span_type': 'Node.runHandler',
                },
                kind: 0,
                status: { code: 0 },
              },

              // TODO: what is this trace? What's the value in it?
              {
                runtime: 'nodejs',
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
                name: 'GET /api/pages/param/edge',
                kind: 1,
                attributes: {
                  'next.span_name': 'GET /api/pages/param/edge',
                  'next.span_type': 'BaseServer.handleRequest',
                  'http.method': 'GET',
                  'http.target': '/api/pages/param/edge',
                  'http.status_code': 200,
                },
                status: { code: 0 },
                spans: [
                  {
                    name: 'start response',
                    kind: 0,
                    attributes: {
                      'next.span_name': 'start response',
                      'next.span_type': 'NextNodeServer.startResponse',
                    },
                    status: { code: 0 },
                  },
                ],
              },
            ])
          })
        })
      }
    )
  }
})

describe('opentelemetry with disabled fetch tracing', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    dependencies: require('./package.json').dependencies,
    env: {
      NEXT_OTEL_FETCH_DISABLED: '1',
      TEST_OTEL_COLLECTOR_PORT: String(COLLECTOR_PORT),
    },
  })

  if (skipped) {
    return
  }

  let collector: Collector

  function getCollector(): Collector {
    return collector
  }

  beforeEach(async () => {
    collector = await connectCollector({ port: COLLECTOR_PORT })
  })

  afterEach(async () => {
    await collector.shutdown()
  })
  ;(process.env.__NEXT_EXPERIMENTAL_PPR ? describe.skip : describe)(
    'root context',
    () => {
      describe('app router with disabled fetch', () => {
        it('should handle RSC with disabled fetch', async () => {
          await next.fetch('/app/param/rsc-fetch')

          await expectTrace(getCollector(), [
            {
              name: 'GET /app/[param]/rsc-fetch',
              traceId: '[trace-id]',
              parentId: undefined,
              spans: [
                {
                  name: 'render route (app) /app/[param]/rsc-fetch',
                  spans: [
                    {
                      name: 'build component tree',
                      spans: [
                        {
                          name: 'resolve segment modules',
                        },
                        {
                          name: 'resolve segment modules',
                        },
                      ],
                    },
                    {
                      name: 'generateMetadata /app/[param]/layout',
                    },
                    {
                      name: 'generateMetadata /app/[param]/rsc-fetch/page',
                    },
                    {
                      name: 'NextNodeServer.clientComponentLoading',
                    },
                    {
                      name: 'start response',
                    },
                  ],
                },
                {
                  name: 'resolve page components',
                },
              ],
            },
          ])
        })
      })
    }
  )
})

type HierSavedSpan = SavedSpan & { spans?: HierSavedSpan[] }
type SpanMatch = Omit<Partial<HierSavedSpan>, 'spans'> & { spans?: SpanMatch[] }

async function expectTrace(collector: Collector, match: SpanMatch[]) {
  await check(async () => {
    const traces = collector.getSpans()

    const tree: HierSavedSpan[] = []
    const spansForTree: HierSavedSpan[] = traces.map((span) => ({
      ...span,
      spans: [],
    }))
    for (const span of spansForTree) {
      const parent =
        !span.parentId || span.parentId === EXTERNAL.spanId
          ? null
          : spansForTree.find((s) => s.id === span.parentId)
      if (parent) {
        parent.spans.push(span)
      } else {
        tree.push(span)
      }
    }
    for (const span of spansForTree) {
      delete span.duration
      delete span.timestamp

      span.traceId =
        span.traceId === EXTERNAL.traceId ? span.traceId : '[trace-id]'
      span.parentId = span.parentId || undefined

      span.spans.sort((a, b) => {
        const nameDiff = a.name.localeCompare(b.name)
        if (nameDiff !== 0) {
          return nameDiff
        }
        return (
          (a.attributes?.['next.segment'] ?? '').localeCompare(
            b.attributes?.['next.segment'] ?? ''
          ) ?? 0
        )
      })
    }

    tree.sort((a, b) => {
      const runtimeDiff = (a.runtime ?? '').localeCompare(b.runtime ?? '')
      if (runtimeDiff !== 0) {
        return runtimeDiff
      }
      return a.name.localeCompare(b.name)
    })

    expect(tree).toMatchObject(match)
    return 'success'
  }, 'success')
}
