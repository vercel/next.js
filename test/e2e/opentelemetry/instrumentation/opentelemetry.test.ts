import { FileRef, isNextDev, isNextStart, nextTestSetup } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'
import { createTestDataServer } from 'test-data-service/writer'
import { createTestLog } from 'test-log'
import { NEXT_RSC_UNION_QUERY } from 'next/dist/client/components/app-router-headers'
import path from 'path'

import { SavedSpan } from './constants'
import { type Collector, connectCollector } from './collector'

const EXTERNAL = {
  traceId: 'ee75cd9e534ff5e9ed78b4a0c706f0f2',
  spanId: '0f6a325411bdc432',
} as const

type NextInstance = ReturnType<typeof nextTestSetup>['next']

function setupCollector(next: NextInstance) {
  let collector: Collector | undefined

  // The app's span exporter remains active for the entire suite. Keep its
  // endpoint available for the same lifetime and only reset collected state.
  beforeAll(async () => {
    collector = await connectCollector()
    next.env.TEST_OTEL_COLLECTOR_PORT = String(collector.port)
    await next.start()
  })

  beforeEach(() => {
    collector?.reset()
  })

  afterAll(async () => {
    await collector?.shutdown()
  })

  return function getCollector(): Collector {
    if (!collector) {
      throw new Error('OpenTelemetry collector is not connected')
    }
    return collector
  }
}

function setup({
  useDirectEntrypointHandler,
  useNodeMiddleware,
  withParentSpan = false,
}: {
  useDirectEntrypointHandler?: boolean
  useNodeMiddleware?: boolean
  withParentSpan?: boolean
}) {
  const testSetup = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
    dependencies: require('./package.json').dependencies,
    ...(!useDirectEntrypointHandler
      ? {
          env: {
            NEXT_OTEL_PERFORMANCE_PREFIX: 'client-component-loading-test',
            NEXT_TELEMETRY_DISABLED: '1',
          },
        }
      : {
          startCommand: 'pnpm start-entrypoint',
          packageJson: {
            scripts: {
              'start-entrypoint': withParentSpan
                ? 'pnpm tsx custom-entrypoint-server.ts'
                : 'pnpm tsx custom-entrypoint-server.ts --without-parent-span',
            },
          },
          serverReadyPattern: /- Local:/,
          env: {
            NEXT_TELEMETRY_DISABLED: '1',
            NODE_ENV: 'production',
          },
        }),
    overrideFiles: useNodeMiddleware
      ? {
          'middleware.ts': new FileRef(
            path.join(__dirname, 'middleware-node.ts')
          ),
        }
      : undefined,
  })
  if (!testSetup.skipped && !useDirectEntrypointHandler) {
    beforeAll(async () => {
      testSetup.next.env.TEST_CLIENT_COMPONENT_GATE_PORT = String(
        await findPort()
      )
    })
  }

  return {
    next: testSetup,
    getCollector: testSetup.skipped
      ? () => {
          throw new Error('OpenTelemetry test setup was skipped')
        }
      : setupCollector(testSetup.next),
  }
}

describe.each(
  [
    { name: 'default' },
    isNextStart && {
      name: 'direct entrypoints',
      useDirectEntrypointHandler: true,
    },
  ].filter(Boolean)
)('opentelemetry - $name', ({ useDirectEntrypointHandler }) => {
  const {
    next: { next, skipped, isNextDev },
    getCollector,
  } = setup({
    useDirectEntrypointHandler,
    useNodeMiddleware: false,
  })

  if (skipped) {
    return
  }

  let connectedCollector: Collector

  async function expectAppRouteTrace(pathname: string) {
    expect((await next.fetch(pathname)).status).toBe(200)
    await expectTrace(getCollector(), [
      {
        name: 'GET /api/app/[param]/data',
        attributes: {
          'http.target': pathname,
          'next.span_type': 'BaseServer.handleRequest',
        },
      },
    ])
  }

  it('collects a trace before the per-test reset', async () => {
    connectedCollector = getCollector()
    await expectAppRouteTrace('/api/app/param/data')
  })

  it('keeps the collector connected across per-test resets', async () => {
    expect(getCollector()).toBe(connectedCollector)
    expect(getCollector().getSpans()).toEqual([])
    await expectAppRouteTrace('/api/app/param/data')
  })

  it('closes collector connections after each export', async () => {
    const response = await fetch(`http://localhost:${getCollector().port}`, {
      method: 'POST',
      body: '[]',
    })

    expect(response.status).toBe(202)
    expect(response.headers.get('connection')).toBe('close')
  })

  // The custom entrypoint server has an explicit route table and does not
  // include this streamed page.
  if (!useDirectEntrypointHandler) {
    describe('client component loading across streamed renders', () => {
      const pendingGates = new Map<string, () => void>()
      const gateServer = createTestDataServer((id, response) => {
        pendingGates.set(id, () => response.resolve())
        gateArrivals.log(id)
      })
      let gateArrivals = createTestLog()
      let traceNumber = 0

      function newTraceId() {
        return (++traceNumber).toString(16).padStart(32, '0')
      }

      function traceparent(traceId: string) {
        return `00-${traceId}-${'1'.repeat(16)}-01`
      }

      beforeAll(() => {
        gateServer.listen(Number(next.env.TEST_CLIENT_COMPONENT_GATE_PORT))
      })
      beforeEach(() => {
        gateArrivals = createTestLog()
      })
      afterEach(() => {
        for (const release of pendingGates.values()) release()
        pendingGates.clear()
      })
      afterAll(() => gateServer.close())

      function releaseGate(id: string) {
        const gate = pendingGates.get(id)
        expect(gate).toBeDefined()
        pendingGates.delete(id)
        gate!()
      }

      async function openPage({
        id,
        traceId,
        extra = false,
      }: {
        id: string
        traceId: string
        extra?: boolean
      }) {
        // The gate timeout starts after response headers arrive so it excludes
        // dev compilation.
        const response = await next.fetch(
          `/app/test/client-component-loading?id=${id}${extra ? '&variant=extra' : ''}`,
          { headers: { traceparent: traceparent(traceId) } }
        )
        expect(response.status).toBe(200)
        await gateArrivals.waitFor([id])
        return response
      }

      async function finishPage(response: Response, extra = false) {
        const html = await response.text()
        expect(html).toContain('<span id="early-client">')
        expect(html).toContain('<span id="late-client">')
        if (extra) expect(html).toContain('<span id="extra-late-client">')
      }

      function loadingSpans(traceId: string): SavedSpan[] {
        return getCollector()
          .getSpans()
          .filter(
            (span) =>
              span.traceId === traceId &&
              span.attributes?.['next.span_type'] ===
                'NextNodeServer.clientComponentLoading'
          )
      }

      async function expectNoLoadingSpanWhileBlocked(traceId: string) {
        // Flush in-flight exports before making a negative assertion.
        const response = await next.fetch(
          '/api/app/test/client-component-flush',
          { method: 'POST' }
        )
        expect(response.status).toBe(204)
        expect(loadingSpans(traceId)).toEqual([])
      }

      async function loadCount(traceId: string): Promise<number> {
        return retry(() => {
          const spans = loadingSpans(traceId)
          expect(spans).toHaveLength(1)
          const requestSpans = getCollector()
            .getSpans()
            .filter(
              (span) =>
                span.traceId === traceId &&
                span.attributes?.['next.span_type'] ===
                  'BaseServer.handleRequest'
            )
          expect(requestSpans).toHaveLength(1)
          expect(spans[0].parentId).toBe(requestSpans[0].id)
          const count = spans[0].attributes?.[
            'next.clientComponentLoadCount'
          ] as number
          expect(count).toBeGreaterThan(0)
          return count
        })
      }

      async function renderBaseline(extra: boolean): Promise<number> {
        const traceId = newTraceId()
        const id = `baseline-${traceId}`
        const response = await openPage({ id, traceId, extra })
        releaseGate(id)
        await finishPage(response, extra)
        return loadCount(traceId)
      }

      it.each(['a', 'b'] as const)(
        'keeps overlapping render metrics when %s finishes first',
        async (finishFirst) => {
          // Warm both module sets before measuring the sequential baselines.
          await renderBaseline(false)
          await renderBaseline(true)
          const normalCount = await renderBaseline(false)
          const extraCount = await renderBaseline(true)
          expect(extraCount).toBeGreaterThan(normalCount)

          const traceA = newTraceId()
          const traceB = newTraceId()
          const responseA = await openPage({ id: 'a', traceId: traceA })
          const responseB = await openPage({
            id: 'b',
            traceId: traceB,
            extra: true,
          })
          await expectNoLoadingSpanWhileBlocked(traceA)
          await expectNoLoadingSpanWhileBlocked(traceB)

          const requests = {
            a: {
              id: 'a',
              response: responseA,
              traceId: traceA,
              count: normalCount,
              extra: false,
            },
            b: {
              id: 'b',
              response: responseB,
              traceId: traceB,
              count: extraCount,
              extra: true,
            },
          }
          const first = requests[finishFirst]
          const second = requests[finishFirst === 'a' ? 'b' : 'a']

          releaseGate(first.id)
          await finishPage(first.response, first.extra)
          expect(await loadCount(first.traceId)).toBe(first.count)

          expect(pendingGates.has(second.id)).toBe(true)
          await expectNoLoadingSpanWhileBlocked(second.traceId)
          releaseGate(second.id)
          await finishPage(second.response, second.extra)
          expect(await loadCount(second.traceId)).toBe(second.count)
        }
      )

      const actionPath = '/app/test/client-component-action'

      async function getActionPage(traceId: string) {
        const $ = await next.render$(actionPath, undefined, {
          headers: { traceparent: traceparent(traceId) },
        })
        expect($('#action-result').text()).toBe('none')
        return { $, count: await loadCount(traceId) }
      }

      it('reports HTML loading after a form POST and leaves the next GET unchanged', async () => {
        await getActionPage(newTraceId())
        const { $, count: baseline } = await getActionPage(newTraceId())
        const form = $('form').first()
        expect(form.length).toBe(1)
        const formData = new FormData()
        form.find('input[type="hidden"]').each((_, input) => {
          const name = $(input).attr('name')
          if (name) formData.append(name, $(input).attr('value') ?? '')
        })
        formData.set('marker', 'action-completed')

        const actionTrace = newTraceId()
        const response = await next.fetch(actionPath, {
          method: 'POST',
          headers: {
            traceparent: traceparent(actionTrace),
            origin: new URL(next.url).origin,
          },
          body: formData,
        })
        expect(response.status).toBe(200)
        expect(await response.text()).toContain(
          '<p id="action-result">action-completed</p>'
        )
        await retry(() => {
          expect(
            getCollector()
              .getSpans()
              .filter(
                (span) =>
                  span.traceId === actionTrace &&
                  span.name === 'test.serverActionCompleted'
              )
          ).toHaveLength(1)
        })
        await loadCount(actionTrace)

        const { count: nextGetCount } = await getActionPage(newTraceId())
        expect(nextGetCount).toBe(baseline)
      })

      it('does not report HTML loading metrics for an enhanced Server Action', async () => {
        const browser = await next.browser(actionPath)
        expect(await browser.elementByCss('#action-result').text()).toBe('none')

        // Flush the initial document's metrics before measuring the action.
        const flush = async () => {
          const response = await next.fetch(
            '/api/app/test/client-component-flush',
            { method: 'POST' }
          )
          expect(response.status).toBe(204)
        }
        await flush()
        getCollector().reset()

        await browser.elementByCss('button[type="submit"]').click()
        await retry(async () => {
          expect(await browser.elementByCss('#action-result').text()).toBe(
            'action-completed'
          )
        })
        await flush()
        const actionRequest = await retry(() => {
          const requests = getCollector()
            .getSpans()
            .filter(
              (span) =>
                span.attributes?.['http.method'] === 'POST' &&
                span.attributes?.['http.target'] === actionPath &&
                span.attributes?.['next.span_type'] ===
                  'BaseServer.handleRequest'
            )
          expect(requests).toHaveLength(1)
          return requests[0]
        })
        await retry(() => {
          expect(
            getCollector()
              .getSpans()
              .filter(
                (span) =>
                  span.traceId === actionRequest.traceId &&
                  span.name === 'test.serverActionCompleted'
              )
          ).toHaveLength(1)
        })
        expect(loadingSpans(actionRequest.traceId)).toEqual([])
      })

      it('reports HTML loading before unused delayed Flight content finishes', async () => {
        const traceId = newTraceId()
        const id = `html-boundary-${traceId}`
        const responsePromise = next.fetch(
          `/app/test/client-component-html-boundary?id=${id}`,
          { headers: { traceparent: traceparent(traceId) } }
        )
        await gateArrivals.waitFor([id])
        const response = await responsePromise
        expect(response.status).toBe(200)

        const flush = async () => {
          const result = await next.fetch(
            '/api/app/test/client-component-flush',
            { method: 'POST' }
          )
          expect(result.status).toBe(204)
        }
        await flush()

        let html: string
        let earlySpan: SavedSpan | undefined
        try {
          // The closed panel lets HTML finish even though its unused Flight
          // child remains behind the gate.
          await retry(() => {
            const renderSpans = getCollector()
              .getSpans()
              .filter(
                (span) =>
                  span.traceId === traceId &&
                  span.attributes?.['next.span_type'] ===
                    'AppRender.getBodyResult'
              )
            expect(renderSpans).toHaveLength(1)
            const spans = loadingSpans(traceId)
            expect(spans).toHaveLength(1)
            earlySpan = spans[0]
          })
          expect(pendingGates.has(id)).toBe(true)
        } finally {
          releaseGate(id)
          html = await response.text()
        }

        expect(html).toContain('id="closed-panel"')
        expect(html).toContain('closed')
        expect(html).not.toContain('id="unused-client"')
        expect(earlySpan).toBeDefined()
        await flush()
        expect(loadingSpans(traceId)).toEqual([earlySpan])
      })

      it('includes async client module evaluation in HTML loading duration', async () => {
        const measurePath = '/api/app/test/client-component-measure'
        const reset = await next.fetch(measurePath, { method: 'DELETE' })
        expect(reset.status).toBe(204)

        const response = await next.fetch('/app/test/slow-async-client', {
          headers: { traceparent: traceparent(newTraceId()) },
        })
        expect(response.status).toBe(200)
        expect(await response.text()).toContain(
          '<span id="slow-async-client">async client component</span>'
        )

        const measurements = await next.fetch(measurePath)
        expect(measurements.status).toBe(200)
        const durations = (await measurements.json()) as number[]
        expect(durations).toHaveLength(1)
        expect(durations[0]).toBeGreaterThan(1_000)
      })
    })
  }

  // Edge runtime is currently not implemented in custom-entrypoint-server.ts
  const itEdge = useDirectEntrypointHandler ? it.skip : it

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
    ;(process.env.__NEXT_CACHE_COMPONENTS ? describe.skip : describe)(
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
                    attributes: {
                      'next.clientComponentLoadCount': isNextDev ? 8 : 7,
                      'next.span_type': 'NextNodeServer.clientComponentLoading',
                    },
                    kind: 0,
                    name: 'NextNodeServer.clientComponentLoading',
                    status: { code: 0 },
                  },
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
                  ...(useDirectEntrypointHandler
                    ? []
                    : [
                        {
                          name: 'resolve page components',
                          attributes: {
                            'next.route': '/app/[param]/rsc-fetch',
                            'next.span_name': 'resolve page components',
                            'next.span_type':
                              'NextNodeServer.findPageComponents',
                          },
                          kind: 0,
                          status: { code: 0 },
                        },
                      ]),
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

          itEdge('should handle RSC with fetch on edge', async () => {
            await next.fetch('/app/param/rsc-fetch/edge', env.fetchInit)

            await expectTrace(
              getCollector(),
              [
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
                            'next.span_type':
                              'ResolveMetadata.generateMetadata',
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
                            'next.span_type':
                              'ResolveMetadata.generateMetadata',
                            'next.page': '/app/[param]/rsc-fetch/edge/page',
                          },
                          status: { code: 0 },
                        },
                      ],
                    },
                  ],
                },
              ],
              true
            )
          })

          it('should handle RSC with fetch in RSC mode', async () => {
            await next.fetch(`/app/param/rsc-fetch?${NEXT_RSC_UNION_QUERY}`, {
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
                  'http.target': `/app/param/rsc-fetch?${NEXT_RSC_UNION_QUERY}`,
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

          if (env.name === 'root context' && !useDirectEntrypointHandler) {
            it.each(['/api/app/param/data', '/pages/param/getServerSideProps'])(
              'should trace route module loading for %s',
              async (pathname) => {
                await next.fetch(pathname)

                await retry(async () => {
                  const spans = getCollector().getSpans()
                  const rootSpan = spans.find(
                    (span) =>
                      span.attributes?.['next.span_type'] ===
                        'BaseServer.handleRequest' &&
                      span.attributes?.['http.target'] === pathname
                  )
                  const loadSpans = spans.filter(
                    (span) =>
                      span.attributes?.['next.span_type'] ===
                        'LoadComponents.loadRouteModule' &&
                      span.traceId === rootSpan?.traceId
                  )

                  expect(rootSpan).toBeDefined()
                  expect(loadSpans).toEqual([
                    expect.objectContaining({
                      runtime: 'nodejs',
                      name: 'load route module',
                      traceId: rootSpan?.traceId,
                      attributes: {
                        'next.span_category': 'nextjs',
                        'next.span_name': 'load route module',
                        'next.span_type': 'LoadComponents.loadRouteModule',
                      },
                      status: { code: 0 },
                    }),
                  ])
                })
              }
            )

            it('should trace route module preparation', async () => {
              const pathname = '/api/app/param/data'
              await next.fetch(pathname)

              await retry(async () => {
                const spans = getCollector().getSpans()
                const rootSpan = spans.find(
                  (span) =>
                    span.attributes?.['next.span_type'] ===
                      'BaseServer.handleRequest' &&
                    span.attributes?.['http.target'] === pathname
                )
                const prepareSpans = spans.filter(
                  (span) =>
                    span.attributes?.['next.span_type'] ===
                      'RouteModule.prepare' &&
                    span.traceId === rootSpan?.traceId
                )

                expect(rootSpan).toBeDefined()
                expect(prepareSpans).toEqual([
                  expect.objectContaining({
                    runtime: 'nodejs',
                    name: 'prepare route module',
                    traceId: rootSpan?.traceId,
                    attributes: {
                      'next.span_category': 'nextjs',
                      'next.span_name': 'prepare route module',
                      'next.span_type': 'RouteModule.prepare',
                    },
                    status: { code: 0 },
                  }),
                ])
              })
            })
          }
          it('should handle route handlers in app router', async () => {
            await next.fetch('/api/app/param/data', env.fetchInit)

            await expectTrace(getCollector(), [
              {
                name: 'GET /api/app/[param]/data',
                attributes: {
                  'http.method': 'GET',
                  'http.route': '/api/app/[param]/data',
                  'http.status_code': 200,
                  'http.target': '/api/app/param/data',
                  'next.route': '/api/app/[param]/data',
                  'next.span_name': 'GET /api/app/[param]/data',
                  'next.span_type': 'BaseServer.handleRequest',
                },
                kind: 1,
                status: { code: 0 },
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
                spans: [
                  {
                    name: 'executing api route (app) /api/app/[param]/data',
                    attributes: {
                      'next.route': '/api/app/[param]/data',
                      'next.span_name':
                        'executing api route (app) /api/app/[param]/data',
                      'next.span_type': 'AppRouteRouteHandlers.runHandler',
                    },
                    kind: 0,
                    status: { code: 0 },
                  },
                  ...(useDirectEntrypointHandler
                    ? []
                    : [
                        {
                          name: 'resolve page components',
                          attributes: {
                            'next.route': '/api/app/[param]/data',
                            'next.span_name': 'resolve page components',
                            'next.span_type':
                              'NextNodeServer.findPageComponents',
                          },
                          kind: 0,
                          status: { code: 0 },
                        },
                      ]),
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

          it('should preserve the committed status when a route response stream errors', async () => {
            const response = await next.fetch(
              '/api/app/param/stream-error',
              env.fetchInit
            )

            expect(response.status).toBe(200)
            await expect(response.text()).rejects.toThrow()

            await retry(() => {
              expect(next.cliOutput).toContain(
                '[instrumentation] observed app route stream error'
              )
            })

            await expectTrace(getCollector(), [
              {
                name: 'GET /api/app/[param]/stream-error',
                attributes: {
                  'http.method': 'GET',
                  'http.route': '/api/app/[param]/stream-error',
                  'http.status_code': 200,
                  'http.target': '/api/app/param/stream-error',
                  'next.route': '/api/app/[param]/stream-error',
                  'next.span_name': 'GET /api/app/[param]/stream-error',
                  'next.span_type': 'BaseServer.handleRequest',
                  'error.type': 'Error',
                },
                kind: 1,
                status: { code: 2, message: 'failed to pipe response' },
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
                spans: [
                  {
                    name: 'executing api route (app) /api/app/[param]/stream-error',
                    attributes: {
                      'next.route': '/api/app/[param]/stream-error',
                      'next.span_name':
                        'executing api route (app) /api/app/[param]/stream-error',
                      'next.span_type': 'AppRouteRouteHandlers.runHandler',
                    },
                    kind: 0,
                    status: { code: 0 },
                  },
                  ...(useDirectEntrypointHandler
                    ? []
                    : [
                        {
                          name: 'resolve page components',
                          attributes: {
                            'next.route': '/api/app/[param]/stream-error',
                            'next.span_name': 'resolve page components',
                            'next.span_type':
                              'NextNodeServer.findPageComponents',
                          },
                          kind: 0,
                          status: { code: 0 },
                        },
                      ]),
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

          if (useDirectEntrypointHandler && env.name === 'root context') {
            it('should end a committed response when pending revalidation fails', async () => {
              const response = await next.fetch(
                '/api/app/param/revalidation-error'
              )

              expect(response.status).toBe(200)

              const rejectResponse = await next.fetch(
                '/api/app/param/revalidation-error/reject'
              )
              expect(rejectResponse.status).toBe(204)
              await expect(response.text()).resolves.toBe('committed')
            })
          }

          it('should record accurate status code for non-200 route handler responses', async () => {
            await next.fetch('/api/app/param/status', env.fetchInit)

            await expectTrace(getCollector(), [
              {
                name: 'GET /api/app/[param]/status',
                attributes: {
                  'http.method': 'GET',
                  'http.route': '/api/app/[param]/status',
                  'http.status_code': 418,
                  'http.target': '/api/app/param/status',
                  'next.route': '/api/app/[param]/status',
                  'next.span_name': 'GET /api/app/[param]/status',
                  'next.span_type': 'BaseServer.handleRequest',
                },
                kind: 1,
                status: { code: 0 },
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
                spans: [
                  {
                    name: 'executing api route (app) /api/app/[param]/status',
                    attributes: {
                      'next.route': '/api/app/[param]/status',
                      'next.span_name':
                        'executing api route (app) /api/app/[param]/status',
                      'next.span_type': 'AppRouteRouteHandlers.runHandler',
                    },
                    kind: 0,
                    status: { code: 0 },
                  },
                  ...(useDirectEntrypointHandler
                    ? []
                    : [
                        {
                          name: 'resolve page components',
                          attributes: {
                            'next.route': '/api/app/[param]/status',
                            'next.span_name': 'resolve page components',
                            'next.span_type':
                              'NextNodeServer.findPageComponents',
                          },
                          kind: 0,
                          status: { code: 0 },
                        },
                      ]),
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

          it('should record status code for failing handler', async () => {
            await next.fetch('/api/app/param/error', env.fetchInit)

            await expectTrace(getCollector(), [
              {
                name: 'GET /api/app/[param]/error',
                attributes: {
                  'http.method': 'GET',
                  'http.route': '/api/app/[param]/error',
                  'http.status_code': 500,
                  'http.target': '/api/app/param/error',
                  'next.route': '/api/app/[param]/error',
                  'next.span_name': 'GET /api/app/[param]/error',
                  'next.span_type': 'BaseServer.handleRequest',
                },
                kind: 1,
                status: { code: 2 },
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
                spans: [
                  {
                    name: 'executing api route (app) /api/app/[param]/error',
                    attributes: {
                      'next.route': '/api/app/[param]/error',
                      'next.span_name':
                        'executing api route (app) /api/app/[param]/error',
                      'next.span_type': 'AppRouteRouteHandlers.runHandler',
                    },
                    kind: 0,
                    status: { code: 2, message: 'foobar' },
                  },
                  ...(useDirectEntrypointHandler
                    ? []
                    : [
                        {
                          name: 'resolve page components',
                          attributes: {
                            'next.route': '/api/app/[param]/error',
                            'next.span_name': 'resolve page components',
                            'next.span_type':
                              'NextNodeServer.findPageComponents',
                          },
                          kind: 0,
                          status: { code: 0 },
                        },
                      ]),
                ],
              },
            ])
          })

          itEdge(
            'should handle route handlers in app router on edge',
            async () => {
              await next.fetch('/api/app/param/data/edge', env.fetchInit)

              await expectTrace(
                getCollector(),
                [
                  {
                    runtime: 'edge',
                    traceId: env.span.traceId,
                    parentId: env.span.rootParentId,
                    name: 'executing api route (app) /api/app/[param]/data/edge',
                    attributes: {
                      'next.route': '/api/app/[param]/data/edge',
                      'next.span_name':
                        'executing api route (app) /api/app/[param]/data/edge',
                      'next.span_type': 'AppRouteRouteHandlers.runHandler',
                    },
                    kind: 0,
                    status: { code: 0 },
                  },
                ],
                true
              )
            }
          )

          itEdge('should handle failing handler on edge', async () => {
            await next.fetch('/api/app/param/error/edge', env.fetchInit)

            await expectTrace(
              getCollector(),
              [
                {
                  runtime: 'edge',
                  traceId: env.span.traceId,
                  parentId: env.span.rootParentId,
                  name: 'executing api route (app) /api/app/[param]/error/edge',
                  attributes: {
                    'next.route': '/api/app/[param]/error/edge',
                    'next.span_name':
                      'executing api route (app) /api/app/[param]/error/edge',
                    'next.span_type': 'AppRouteRouteHandlers.runHandler',
                  },
                  kind: 0,
                  status: { code: 2 },
                },
              ],
              true
            )
          })

          it('should handle error in RSC', async () => {
            await next.fetch(
              '/app/param/rsc-fetch/error?status=error',
              env.fetchInit
            )

            await expectTrace(getCollector(), [
              {
                name: 'GET /app/[param]/rsc-fetch/error',
                attributes: {
                  'http.method': 'GET',
                  'http.route': '/app/[param]/rsc-fetch/error',
                  'http.status_code': 500,
                  'http.target': '/app/param/rsc-fetch/error?status=error',
                  'next.route': '/app/[param]/rsc-fetch/error',
                  'next.rsc': false,
                  'next.span_name': 'GET /app/[param]/rsc-fetch/error',
                  'next.span_type': 'BaseServer.handleRequest',
                  'error.type': '500',
                },
                kind: 1,
                status: { code: 2 },
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
                spans: [
                  {
                    attributes: {
                      'next.clientComponentLoadCount': isNextDev ? 12 : 10,
                      'next.span_type': 'NextNodeServer.clientComponentLoading',
                    },
                    kind: 0,
                    name: 'NextNodeServer.clientComponentLoading',
                    status: { code: 0 },
                  },
                  {
                    name: 'render route (app) /app/[param]/rsc-fetch/error',
                    attributes: {
                      'next.route': '/app/[param]/rsc-fetch/error',
                      'next.span_name':
                        'render route (app) /app/[param]/rsc-fetch/error',
                      'next.span_type': 'AppRender.getBodyResult',
                    },
                    kind: 0,
                    status: { code: 2 },
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
                  ...(useDirectEntrypointHandler
                    ? []
                    : [
                        {
                          name: 'resolve page components',
                          attributes: {
                            'next.route': '/app/[param]/rsc-fetch/error',
                            'next.span_name': 'resolve page components',
                            'next.span_type':
                              'NextNodeServer.findPageComponents',
                          },
                          kind: 0,
                          status: { code: 0 },
                        },
                      ]),
                ],
              },
            ])
          })

          it('should handle error inside Suspense boundary', async () => {
            await next.fetch('/app/param/loading/error', env.fetchInit)

            await expectTrace(getCollector(), [
              {
                name: 'GET /app/[param]/loading/error',
                attributes: {
                  'http.method': 'GET',
                  'http.route': '/app/[param]/loading/error',
                  // The response starts streaming before the error,
                  // so HTTP status is 200 (unlike synchronous errors which get 500)
                  'http.status_code': 200,
                  'http.target': '/app/param/loading/error',
                  'next.route': '/app/[param]/loading/error',
                  'next.rsc': false,
                  'next.span_name': 'GET /app/[param]/loading/error',
                  'next.span_type': 'BaseServer.handleRequest',
                },
                kind: 1,
                status: { code: 0 },
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
                spans: [
                  {
                    attributes: {
                      'next.clientComponentLoadCount': isNextDev ? 9 : 8,
                      'next.span_type': 'NextNodeServer.clientComponentLoading',
                    },
                    kind: 0,
                    name: 'NextNodeServer.clientComponentLoading',
                    status: { code: 0 },
                  },
                  {
                    name: 'render route (app) /app/[param]/loading/error',
                    attributes: {
                      'next.route': '/app/[param]/loading/error',
                      'next.span_name':
                        'render route (app) /app/[param]/loading/error',
                      'next.span_type': 'AppRender.getBodyResult',
                      'error.type': 'Error',
                    },
                    kind: 0,
                    // The render span should have error status because an error
                    // was thrown inside a Suspense boundary during streaming
                    status: {
                      code: 2,
                      message: 'Error inside Suspense boundary',
                    },
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
                  ...(useDirectEntrypointHandler
                    ? []
                    : [
                        {
                          name: 'resolve page components',
                          attributes: {
                            'next.route': '/app/[param]/loading/error',
                            'next.span_name': 'resolve page components',
                            'next.span_type':
                              'NextNodeServer.findPageComponents',
                          },
                          kind: 0,
                          status: { code: 0 },
                        },
                      ]),
                ],
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
                  ...(useDirectEntrypointHandler
                    ? []
                    : [
                        {
                          name: 'resolve page components',
                          attributes: {
                            'next.route': '/pages/[param]/getServerSideProps',
                            'next.span_name': 'resolve page components',
                            'next.span_type':
                              'NextNodeServer.findPageComponents',
                          },
                          kind: 0,
                          status: { code: 0 },
                        },
                      ]),
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
                  ...(useDirectEntrypointHandler
                    ? []
                    : [
                        {
                          name: 'resolve page components',
                          attributes: {
                            'next.route': `/pages/[param]/getStaticProps${v}`,
                            'next.span_name': 'resolve page components',
                            'next.span_type':
                              'NextNodeServer.findPageComponents',
                          },
                          kind: 0,
                          status: { code: 0 },
                        },
                      ]),
                ],
              },
            ])
          })

          itEdge('should handle getServerSideProps on edge', async () => {
            await next.fetch(
              '/pages/param/edge/getServerSideProps',
              env.fetchInit
            )

            await expectTrace(
              getCollector(),
              [
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
              ],
              true
            )
          })

          it('should handle getServerSideProps exceptions', async () => {
            await next.fetch(
              '/pages/param/getServerSidePropsError',
              env.fetchInit
            )

            await expectTrace(getCollector(), [
              {
                name: 'GET /pages/[param]/getServerSidePropsError',
                attributes: {
                  'http.method': 'GET',
                  'http.route': '/pages/[param]/getServerSidePropsError',
                  'http.target': '/pages/param/getServerSidePropsError',
                  'next.route': '/pages/[param]/getServerSidePropsError',
                  'next.span_name':
                    'GET /pages/[param]/getServerSidePropsError',
                  'next.span_type': 'BaseServer.handleRequest',
                  ...(useDirectEntrypointHandler
                    ? {
                        // With direct entrypoints, this 500 error has to be handled by whatever is
                        // invoking the handler. And that same invoker is then also responsible for
                        // setting OTEL correctly.
                        'error.type': 'Error',
                        'http.status_code': 200,
                      }
                    : {
                        'error.type': '500',
                        'http.status_code': 500,
                      }),
                },
                kind: 1,
                status: { code: 2 },
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
                spans: [
                  {
                    name: 'getServerSideProps /pages/[param]/getServerSidePropsError',
                    attributes: {
                      'next.route': '/pages/[param]/getServerSidePropsError',
                      'next.span_name':
                        'getServerSideProps /pages/[param]/getServerSidePropsError',
                      'next.span_type': 'Render.getServerSideProps',
                      'error.type': 'Error',
                    },
                    kind: 0,
                    status: {
                      code: 2,
                      message: 'ServerSideProps error',
                    },
                    events: [
                      {
                        name: 'exception',
                        attributes: {
                          'exception.type': 'Error',
                          'exception.message': 'ServerSideProps error',
                        },
                      },
                    ],
                  },
                  ...(useDirectEntrypointHandler
                    ? []
                    : [
                        {
                          name: 'render route (pages) /_error',
                          attributes: {
                            'next.route': '/_error',
                            'next.span_name': 'render route (pages) /_error',
                            'next.span_type': 'Render.renderDocument',
                          },
                          kind: 0,
                          status: { code: 0 },
                        },

                        {
                          name: 'resolve page components',
                          attributes: {
                            'next.route': '/_error',
                            'next.span_name': 'resolve page components',
                            'next.span_type':
                              'NextNodeServer.findPageComponents',
                          },
                          kind: 0,
                          status: { code: 0 },
                        },
                      ]),
                  ...(isNextDev || useDirectEntrypointHandler
                    ? []
                    : [
                        {
                          name: 'resolve page components',
                          attributes: {
                            'next.route': '/500',
                            'next.span_name': 'resolve page components',
                            'next.span_type':
                              'NextNodeServer.findPageComponents',
                          },
                          kind: 0,
                          status: { code: 0 },
                        },
                        {
                          name: 'resolve page components',
                          attributes: {
                            'next.route': '/500',
                            'next.span_name': 'resolve page components',
                            'next.span_type':
                              'NextNodeServer.findPageComponents',
                          },
                          kind: 0,
                          status: { code: 0 },
                        },
                      ]),
                  ...(useDirectEntrypointHandler
                    ? []
                    : [
                        {
                          name: 'resolve page components',
                          attributes: {
                            'next.route':
                              '/pages/[param]/getServerSidePropsError',
                            'next.span_name': 'resolve page components',
                            'next.span_type':
                              'NextNodeServer.findPageComponents',
                          },
                          kind: 0,
                          status: { code: 0 },
                        },
                      ]),
                ],
              },
            ])
          })

          it('should handle getServerSideProps returning notFound', async () => {
            await next.fetch(
              '/pages/param/getServerSidePropsNotFound',
              env.fetchInit
            )

            await expectTrace(getCollector(), [
              {
                name: 'GET /pages/[param]/getServerSidePropsNotFound',
                attributes: {
                  'http.method': 'GET',
                  'http.route': '/pages/[param]/getServerSidePropsNotFound',
                  'http.status_code': 404,
                  'http.target': '/pages/param/getServerSidePropsNotFound',
                  'next.route': '/pages/[param]/getServerSidePropsNotFound',
                  'next.span_name':
                    'GET /pages/[param]/getServerSidePropsNotFound',
                  'next.span_type': 'BaseServer.handleRequest',
                },
                kind: 1,
                status: { code: 0 },
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
                spans: [
                  {
                    name: 'getServerSideProps /pages/[param]/getServerSidePropsNotFound',
                    attributes: {
                      'next.route': '/pages/[param]/getServerSidePropsNotFound',
                      'next.span_name':
                        'getServerSideProps /pages/[param]/getServerSidePropsNotFound',
                      'next.span_type': 'Render.getServerSideProps',
                    },
                    kind: 0,
                    status: {
                      code: 0,
                    },
                  },
                  ...(isNextDev
                    ? [
                        {
                          name: 'NextNodeServer.clientComponentLoading',
                          attributes: {
                            'next.clientComponentLoadCount': expect.any(Number),
                            'next.span_type':
                              'NextNodeServer.clientComponentLoading',
                          },
                          kind: 0,
                          status: { code: 0 },
                        },
                        {
                          name: 'render route (app) /_not-found',
                          attributes: {
                            'next.route': '/_not-found',
                            'next.span_name': 'render route (app) /_not-found',
                            'next.span_type': 'AppRender.getBodyResult',
                          },
                          kind: 0,
                          status: { code: 0 },
                        },
                      ]
                    : []),
                  ...(useDirectEntrypointHandler
                    ? []
                    : [
                        {
                          name: 'resolve page components',
                          attributes: {
                            'next.route': '/_not-found',
                            'next.span_name': 'resolve page components',
                            'next.span_type':
                              'NextNodeServer.findPageComponents',
                          },
                          kind: 0,
                          status: { code: 0 },
                        },
                        {
                          name: 'resolve page components',
                          attributes: {
                            'next.route':
                              '/pages/[param]/getServerSidePropsNotFound',
                            'next.span_name': 'resolve page components',
                            'next.span_type':
                              'NextNodeServer.findPageComponents',
                          },
                          kind: 0,
                          status: { code: 0 },
                        },
                      ]),
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

          itEdge('should handle api routes in pages on edge', async () => {
            await next.fetch('/api/pages/param/edge', env.fetchInit)

            await expectTrace(
              getCollector(),
              [
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
              ],
              true
            )
          })

          it('should handle failing api routes in pages', async () => {
            await next.fetch('/api/pages/param/error', env.fetchInit)

            await expectTrace(getCollector(), [
              {
                name: 'GET /api/pages/[param]/error',
                attributes: {
                  'http.method': 'GET',
                  'http.route': '/api/pages/[param]/error',
                  'http.status_code': 500,
                  'http.target': '/api/pages/param/error',
                  'next.route': '/api/pages/[param]/error',
                  'next.span_name': 'GET /api/pages/[param]/error',
                  'next.span_type': 'BaseServer.handleRequest',
                },
                kind: 1,
                status: { code: 2 },
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
                spans: [
                  {
                    name: 'executing api route (pages) /api/pages/[param]/error',
                    attributes: {
                      'next.span_name':
                        'executing api route (pages) /api/pages/[param]/error',
                      'next.span_type': 'Node.runHandler',
                    },
                    kind: 0,
                    // TODO this difference is odd
                    status: { code: isNextDev ? 2 : 0 },
                  },
                  ...(isNextDev
                    ? [
                        {
                          name: 'render route (pages) /_error',
                          attributes: {
                            'next.route': '/_error',
                            'next.span_name': 'render route (pages) /_error',
                            'next.span_type': 'Render.renderDocument',
                          },
                          kind: 0,
                          status: { code: 0 },
                        },

                        {
                          name: 'resolve page components',
                          attributes: {
                            'next.route': '/_error',
                            'next.span_name': 'resolve page components',
                            'next.span_type':
                              'NextNodeServer.findPageComponents',
                          },
                          kind: 0,
                          status: { code: 0 },
                        },
                      ]
                    : []),
                ],
              },
            ])
          })

          itEdge(
            'should handle failing api routes in pages on edge',
            async () => {
              await next.fetch('/api/pages/param/error-edge', env.fetchInit)

              await expectTrace(
                getCollector(),
                [
                  {
                    runtime: 'edge',
                    traceId: env.span.traceId,
                    parentId: env.span.rootParentId,
                    name: 'executing api route (pages) /api/pages/[param]/error-edge',
                    attributes: {
                      'next.span_name':
                        'executing api route (pages) /api/pages/[param]/error-edge',
                      'next.span_type': 'Node.runHandler',
                    },
                    kind: 0,
                    status: { code: 2 },
                  },
                ],
                true
              )
            }
          )
        })
      }
    )
  }
})

if (isNextStart) {
  describe.each([
    {
      name: 'without parent span',
      withParentSpan: false,
      coldTraceparent: false,
    },
    {
      name: 'without parent span, cold request with traceparent',
      withParentSpan: false,
      coldTraceparent: true,
    },
    { name: 'with parent span', withParentSpan: true, coldTraceparent: false },
  ])(
    'opentelemetry route module preparation with direct entrypoint handler $name',
    ({ withParentSpan, coldTraceparent }) => {
      let collector: Collector | undefined
      const { next, skipped } = nextTestSetup({
        files: __dirname,
        skipStart: true,
        dependencies: require('./package.json').dependencies,
        startCommand: 'pnpm start-entrypoint',
        packageJson: {
          scripts: {
            'start-entrypoint': withParentSpan
              ? 'pnpm tsx custom-entrypoint-server.ts'
              : 'pnpm tsx custom-entrypoint-server.ts --without-parent-span',
          },
        },
        serverReadyPattern: /- Local:/,
        env: {
          NEXT_TELEMETRY_DISABLED: '1',
          NODE_ENV: 'production',
        },
      })

      if (skipped) {
        return
      }

      afterAll(async () => {
        await collector?.shutdown()
      })

      const pathnames = [
        '/app/param/rsc-fetch',
        '/api/app/param/data',
        '/pages/param/getServerSideProps',
        '/api/pages/param/basic',
      ]

      it('should trace route module preparation inside the request span', async () => {
        const connectedCollector = await connectCollector()
        collector = connectedCollector
        next.env.TEST_OTEL_COLLECTOR_PORT = String(connectedCollector.port)
        await next.start()

        // The first request starts the process (cold: instrumentation is
        // registered and route modules are loaded), the later ones are warm.
        // The parent-span harness starts its own root span without extracting
        // incoming headers, so incoming propagation only applies without it.
        const requests: { id: string; cold: boolean; traceparent: boolean }[] =
          []
        for (const [index, pathname] of pathnames.entries()) {
          for (const variant of [
            { traceparent: index === 0 && coldTraceparent },
            { traceparent: false },
            ...(withParentSpan ? [] : [{ traceparent: true }]),
          ]) {
            const id = Math.random().toString(36).slice(2)
            const res = await next.fetch(`${pathname}?id=${id}`, {
              headers: variant.traceparent
                ? {
                    traceparent: `00-${EXTERNAL.traceId}-${EXTERNAL.spanId}-01`,
                  }
                : {},
            })
            expect(res.status).toBe(200)
            requests.push({
              id,
              cold: index === 0 && requests.length === 0,
              traceparent: variant.traceparent,
            })
          }
        }

        await retry(async () => {
          const spans = connectedCollector.getAllSpans()
          const byId = new Map(spans.map((span) => [span.id, span]))
          const prepareSpans = spans.filter(
            (span) =>
              span.attributes?.['next.span_type'] === 'RouteModule.prepare'
          )

          // Every route module preparation belongs to a request: none starts
          // a trace of its own.
          for (const span of prepareSpans) {
            expect(span).toEqual(
              expect.objectContaining({
                // The parent-span harness exports through its own provider,
                // which doesn't record the runtime.
                ...(withParentSpan ? {} : { runtime: 'nodejs' }),
                name: 'prepare route module',
                attributes: {
                  'next.span_category': 'nextjs',
                  'next.span_name': 'prepare route module',
                  'next.span_type': 'RouteModule.prepare',
                },
                status: { code: 0 },
              })
            )
            const parent = byId.get(span.parentId!)
            expect(parent?.attributes?.['next.span_type']).toBe(
              'BaseServer.handleRequest'
            )
            expect(span.traceId).toMatch(/^[0-9a-f]{32}$/)
            expect(span.traceId).toBe(parent!.traceId)
          }

          for (const { id, cold, traceparent } of requests) {
            const requestSpans = spans.filter(
              (span) =>
                span.attributes?.['next.span_type'] ===
                  'BaseServer.handleRequest' &&
                String(span.attributes?.['http.target'] ?? '').includes(
                  `id=${id}`
                )
            )
            expect({ id, cold, requestSpans: requestSpans.length }).toEqual({
              id,
              cold,
              requestSpans: 1,
            })
            const [requestSpan] = requestSpans
            expect(requestSpan.traceId).toMatch(/^[0-9a-f]{32}$/)

            // The request's route module preparation is nested in its span.
            const requestPrepareSpans = prepareSpans.filter(
              (span) => span.parentId === requestSpan.id
            )
            expect(requestPrepareSpans).toHaveLength(1)
            expect(requestPrepareSpans[0].traceId).toBe(requestSpan.traceId)

            // ...and the request span continues the request's context.
            if (withParentSpan) {
              const parent = byId.get(requestSpan.parentId!)
              expect(parent).toBeDefined()
              expect(parent!.attributes?.['next.span_type']).toBeUndefined()
              expect(parent!.traceId).toBe(requestSpan.traceId)
            } else if (traceparent) {
              expect(requestSpan.traceId).toBe(EXTERNAL.traceId)
              expect(requestSpan.parentId).toBe(EXTERNAL.spanId)
            } else {
              expect(requestSpan.parentId).toBeUndefined()
            }
          }

          // The cold request registered instrumentation, so the lifecycle
          // spans of `instrumentation.ts` are children of its request span
          // instead of separate traces.
          const coldRequest = requests.find((request) => request.cold)!
          const coldRequestSpan = spans.find(
            (span) =>
              span.attributes?.['next.span_type'] ===
                'BaseServer.handleRequest' &&
              String(span.attributes?.['http.target'] ?? '').includes(
                `id=${coldRequest.id}`
              )
          )!
          expect(coldRequest.traceparent).toBe(coldTraceparent)
          for (const [type, name] of [
            ['Instrumentation.loadModule', 'load instrumentation module'],
            ['Instrumentation.register', 'register instrumentation'],
          ]) {
            const lifecycleSpans = spans.filter(
              (span) => span.attributes?.['next.span_type'] === type
            )
            expect(lifecycleSpans).toEqual([
              expect.objectContaining({
                ...(withParentSpan ? {} : { runtime: 'nodejs' }),
                name,
                parentId: coldRequestSpan.id,
                traceId: coldRequestSpan.traceId,
                attributes: {
                  'next.span_category': 'nextjs',
                  'next.span_name': name,
                  'next.span_type': type,
                },
                status: { code: 0 },
              }),
            ])
            // The request span is backdated to cover registration.
            expect(coldRequestSpan.timestamp!).toBeLessThanOrEqual(
              lifecycleSpans[0].timestamp!
            )
          }
        })
      })
    }
  )
}

describe.each(
  [
    { name: 'default', useDirectEntrypointHandler: false },
    isNextStart && {
      name: 'direct entrypoints',
      useDirectEntrypointHandler: true,
    },
  ].filter(Boolean)
)(
  'opentelemetry App Route module loading - $name',
  ({ useDirectEntrypointHandler }) => {
    let collector: Collector | undefined
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
      skipStart: true,
      dependencies: require('./package.json').dependencies,
      ...(!useDirectEntrypointHandler
        ? {
            env: {
              NEXT_TELEMETRY_DISABLED: '1',
            },
          }
        : {
            startCommand: 'pnpm start-entrypoint',
            packageJson: {
              scripts: {
                'start-entrypoint':
                  'pnpm tsx custom-entrypoint-server.ts --without-parent-span',
              },
            },
            serverReadyPattern: /- Local:/,
            env: {
              NEXT_TELEMETRY_DISABLED: '1',
              NODE_ENV: 'production',
            },
          }),
    })

    if (skipped) {
      return
    }

    afterAll(async () => {
      await collector?.shutdown()
    })

    it('should trace cold App Route module loading once', async () => {
      collector = await connectCollector()
      next.env.TEST_OTEL_COLLECTOR_PORT = String(collector.port)
      await next.start()

      const pathname = '/api/app/param/data'
      const route = '/api/app/[param]/data'
      expect((await next.fetch(pathname)).status).toBe(200)

      let coldSpanId: string | undefined
      await retry(async () => {
        const spans = collector?.getSpans() ?? []
        const rootSpan = spans.find(
          (span) =>
            span.attributes?.['next.span_type'] ===
              'BaseServer.handleRequest' &&
            span.attributes?.['http.target'] === pathname
        )
        const moduleLoadSpans = spans.filter(
          (span) =>
            span.attributes?.['next.span_type'] ===
              'AppRouteRouteModule.loadUserland' &&
            span.attributes?.['next.route'] === route
        )

        expect(rootSpan).toBeDefined()
        expect(moduleLoadSpans).toEqual([
          expect.objectContaining({
            runtime: 'nodejs',
            name: 'load app route module',
            traceId: rootSpan?.traceId,
            attributes: {
              'next.route': route,
              'next.span_category': 'nextjs',
              'next.span_name': 'load app route module',
              'next.span_type': 'AppRouteRouteModule.loadUserland',
            },
            status: { code: 0 },
          }),
        ])

        const moduleLoadSpan = moduleLoadSpans[0]
        const ancestorIds = new Set<string>()
        const parentBySpanId = new Map(
          spans.map((span) => [span.id, span.parentId])
        )
        let parentId = moduleLoadSpan.parentId
        while (parentId) {
          ancestorIds.add(parentId)
          parentId = parentBySpanId.get(parentId)
        }
        expect(ancestorIds).toContain(rootSpan?.id)
        coldSpanId = moduleLoadSpan.id
      })

      expect((await next.fetch(pathname)).status).toBe(200)
      await retry(async () => {
        const spans = collector?.getSpans() ?? []
        expect(
          spans.filter(
            (span) =>
              span.attributes?.['next.span_type'] ===
                'AppRouteRouteModule.loadUserland' &&
              span.attributes?.['next.route'] === route
          )
        ).toEqual([expect.objectContaining({ id: coldSpanId })])
        expect(
          spans.filter(
            (span) =>
              span.attributes?.['next.span_type'] ===
                'BaseServer.handleRequest' &&
              span.attributes?.['http.target'] === pathname
          )
        ).toHaveLength(2)
      })
    })
  }
)

describe.each(
  [
    { name: 'default', useDirectEntrypointHandler: false },
    isNextStart && {
      name: 'direct entrypoints',
      useDirectEntrypointHandler: true,
    },
    isNextStart && {
      name: 'direct entrypoints with parent span',
      useDirectEntrypointHandler: true,
      withParentSpan: true,
    },
    // Only the first request, with an incoming `traceparent`, in a fresh
    // process.
    isNextStart && {
      name: 'direct entrypoints, cold request with traceparent',
      useDirectEntrypointHandler: true,
      coldTraceparent: true,
    },
  ].filter(Boolean) as {
    name: string
    useDirectEntrypointHandler: boolean
    withParentSpan?: boolean
    coldTraceparent?: boolean
  }[]
)(
  'opentelemetry - middleware $name',
  ({
    useDirectEntrypointHandler,
    withParentSpan = false,
    coldTraceparent = false,
  }) => {
    describe.each(['edge', 'nodejs'])('%s runtime', (runtime) => {
      const {
        next: { next, skipped },
        getCollector,
      } = setup({
        useDirectEntrypointHandler,
        useNodeMiddleware: runtime === 'nodejs',
        withParentSpan,
      })

      if (skipped) {
        return
      }

      if (useDirectEntrypointHandler && runtime === 'edge') {
        it.skip('direct entrypoint handler is not implemented for edge runtime', () => {})
        return
      }

      if (useDirectEntrypointHandler) {
        // Runs first, in a fresh process: the first request reaches the
        // Node.js middleware, which registers `instrumentation.ts`.
        it('should trace instrumentation registration in the first middleware request', async () => {
          const res = await next.fetch(
            `/behind-middleware?id=${Math.random().toString(36).slice(2)}`,
            {
              headers: coldTraceparent
                ? {
                    traceparent: `00-${EXTERNAL.traceId}-${EXTERNAL.spanId}-01`,
                  }
                : {},
            }
          )
          expect(res.status).toBe(200)

          await retry(async () => {
            const spans = getCollector().getAllSpans()
            const byId = new Map(spans.map((span) => [span.id, span]))
            const [middlewareSpan] = spans.filter(
              (span) =>
                span.attributes?.['next.span_type'] === 'Middleware.execute'
            )
            expect(middlewareSpan).toBeDefined()
            // The shared parent of the middleware span: the incoming
            // `traceparent` (not exported here), the host span, or, without
            // either, the root inserted by the middleware adapter, backdated
            // to cover registration. The middleware triggered registration, so
            // the lifecycle spans are its children.
            const parent = byId.get(middlewareSpan.parentId!)
            if (coldTraceparent) {
              expect(parent).toBeUndefined()
              expect(middlewareSpan).toMatchObject({
                parentId: EXTERNAL.spanId,
                traceId: EXTERNAL.traceId,
              })
            } else {
              expect(parent).toBeDefined()
              expect(parent!.attributes?.['next.span_type']).toBe(
                withParentSpan ? undefined : 'Next.request'
              )
            }

            for (const [type, name] of [
              ['Instrumentation.loadModule', 'load instrumentation module'],
              ['Instrumentation.register', 'register instrumentation'],
            ]) {
              const lifecycleSpans = spans.filter(
                (span) => span.attributes?.['next.span_type'] === type
              )
              expect(lifecycleSpans).toEqual([
                expect.objectContaining({
                  name,
                  parentId: middlewareSpan.id,
                  traceId: middlewareSpan.traceId,
                  status: { code: 0 },
                }),
              ])
              // The middleware span is backdated to cover registration.
              expect(middlewareSpan.timestamp!).toBeLessThanOrEqual(
                lifecycleSpans[0].timestamp!
              )
              if (parent) {
                expect(parent.timestamp!).toBeLessThanOrEqual(
                  middlewareSpan.timestamp!
                )
              }
            }
          })
        })
      }

      if (coldTraceparent) {
        return
      }

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
        ;(process.env.__NEXT_CACHE_COMPONENTS ? describe.skip : describe)(
          env.name,
          () => {
            // The middleware and the render are siblings in a single trace,
            // under their shared parent.
            it('should trace middleware', async () => {
              await next.fetch('/behind-middleware', env.fetchInit)
              // Behind the host span, the direct entrypoints' spans are
              // exported without a runtime.
              const runtimeOf = (name: string) =>
                withParentSpan ? {} : { runtime: name }
              const siblings = [
                {
                  ...runtimeOf('nodejs'),
                  traceId: env.span.traceId,
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
                {
                  ...runtimeOf(runtime),
                  traceId: env.span.traceId,
                  name: 'middleware GET',
                  attributes: {
                    'http.method': 'GET',
                    'http.target': '/behind-middleware',
                    'next.span_name': 'middleware GET',
                    'next.span_type': 'Middleware.execute',
                  },
                  status: { code: 0 },
                  spans: [],
                },
              ]

              if (!useDirectEntrypointHandler) {
                // next-server's middleware-invoke `handleRequest` span (marked
                // `next.bubble`) is the shared parent.
                await expectTrace(
                  getCollector(),
                  [
                    {
                      runtime: 'nodejs',
                      traceId: env.span.traceId,
                      parentId: env.span.rootParentId,
                      name: 'GET',
                      attributes: {
                        'http.method': 'GET',
                        'http.target': '/behind-middleware',
                        'next.bubble': true,
                        'next.span_name': 'GET',
                        'next.span_type': 'BaseServer.handleRequest',
                      },
                      spans: siblings,
                    },
                  ],
                  false,
                  { includeBubbleSpans: true }
                )
              } else if (withParentSpan) {
                // The middleware and the render are invoked separately: the
                // active host span around the invocations is their shared
                // parent, also over an incoming traceparent.
                await expectTrace(getCollector(), [
                  {
                    traceId: '[trace-id]',
                    parentId: undefined,
                    name: 'GET /behind-middleware',
                    spans: siblings.map((span) => ({
                      ...span,
                      traceId: '[trace-id]',
                    })),
                  },
                ])
              } else if (env.span.rootParentId) {
                // Without a host span, an incoming traceparent is the shared
                // parent.
                await expectTrace(
                  getCollector(),
                  siblings.map((span) => ({
                    ...span,
                    parentId: env.span.rootParentId,
                  }))
                )
              } else {
                // Without any trace context, the middleware adapter inserts a
                // root span for the request, the shared parent.
                await expectTrace(getCollector(), [
                  {
                    runtime: 'nodejs',
                    traceId: env.span.traceId,
                    parentId: undefined,
                    name: 'GET',
                    attributes: {
                      'http.method': 'GET',
                      'http.target': '/behind-middleware',
                      'next.span_name': 'GET',
                      'next.span_type': 'Next.request',
                    },
                    status: { code: 0 },
                    spans: siblings,
                  },
                ])

                // The inserted root span covers the middleware and the render
                // (the render emits it), and no span carries its
                // `next-deferred` tracestate entry.
                await retry(async () => {
                  const spans = getCollector().getAllSpans()
                  const roots = spans.filter(
                    (span) =>
                      span.attributes?.['next.span_type'] === 'Next.request'
                  )
                  expect(roots).toHaveLength(1)
                  const [root] = roots
                  const descendants: SavedSpan[] = []
                  const parents = new Set([root.id])
                  for (let added = true; added; ) {
                    added = false
                    for (const span of spans) {
                      if (
                        parents.has(span.parentId!) &&
                        !parents.has(span.id!)
                      ) {
                        parents.add(span.id!)
                        descendants.push(span)
                        added = true
                      }
                    }
                  }
                  expect(descendants.map((span) => span.name)).toEqual(
                    expect.arrayContaining([
                      'GET /behind-middleware',
                      'middleware GET',
                    ])
                  )
                  // Times in microseconds. The SDK records them with
                  // millisecond precision, so the same millisecond counts as
                  // covered.
                  for (const span of descendants) {
                    expect(span.timestamp!).toBeGreaterThan(
                      root.timestamp! - 1000
                    )
                    expect(span.timestamp! + span.duration!).toBeLessThan(
                      root.timestamp! + root.duration! + 1000
                    )
                  }
                  for (const span of spans) {
                    expect(JSON.stringify(span.traceState ?? '')).not.toContain(
                      'next-deferred'
                    )
                  }
                })
              }
            })
          }
        )
      }
    })
  }
)

// The first request, in a fresh process, reaches the Node.js middleware
// entrypoint, which registers `instrumentation.ts`, but the adapter fails while
// setting up the request, before running the middleware.
;(isNextStart ? describe : describe.skip)(
  'opentelemetry - middleware direct entrypoint rejecting the first request',
  () => {
    const {
      next: { next, skipped },
      getCollector,
    } = setup({ useDirectEntrypointHandler: true, useNodeMiddleware: true })

    if (skipped) {
      return
    }

    function getLifecycleSpans() {
      return getCollector()
        .getAllSpans()
        .filter((span) =>
          ['Instrumentation.loadModule', 'Instrumentation.register'].includes(
            span.attributes?.['next.span_type'] as string
          )
        )
        .map((span) => ({
          type: span.attributes?.['next.span_type'] as string,
          status: span.status,
        }))
        .sort((a, b) => a.type.localeCompare(b.type))
    }

    it('should still trace instrumentation registration, once', async () => {
      // The cache handler throws while the adapter sets up the request.
      const res = await next.fetch('/behind-middleware', {
        headers: { 'x-test-fail-cache-handler': '1' },
      })
      expect(res.status).toBe(500)
      // The original error propagates.
      expect(next.cliOutput).toContain('cache handler failed for this request')

      const expected = [
        { type: 'Instrumentation.loadModule', status: { code: 0 } },
        { type: 'Instrumentation.register', status: { code: 0 } },
      ]
      await retry(async () => {
        expect(getLifecycleSpans()).toEqual(expected)
      })
      // The adapter rejected the request before running the middleware.
      expect(
        getCollector()
          .getAllSpans()
          .some(
            (span) =>
              span.attributes?.['next.span_type'] === 'Middleware.execute'
          )
      ).toBe(false)

      // Later requests don't emit them again.
      expect((await next.fetch('/behind-middleware')).status).toBe(200)
      await retry(async () => {
        expect(
          getCollector()
            .getAllSpans()
            .some(
              (span) =>
                span.attributes?.['next.span_type'] === 'Middleware.execute'
            )
        ).toBe(true)
      })
      expect(getLifecycleSpans()).toEqual(expected)
    })
  }
)

describe.each(
  [
    { name: 'default' },
    isNextStart && {
      name: 'direct entrypoints',
      useDirectEntrypointHandler: true,
    },
  ].filter(Boolean)
)(
  'opentelemetry instrumentation startup - $name',
  ({ useDirectEntrypointHandler }) => {
    let collector: Collector | undefined
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
      skipStart: true,
      dependencies: require('./package.json').dependencies,
      ...(!useDirectEntrypointHandler
        ? {
            env: {
              NEXT_TELEMETRY_DISABLED: '1',
            },
          }
        : {
            startCommand: 'pnpm start-entrypoint',
            packageJson: {
              scripts: {
                'start-entrypoint':
                  'pnpm tsx custom-entrypoint-server.ts --without-parent-span',
              },
            },
            serverReadyPattern: /- Local:/,
            env: {
              NEXT_TELEMETRY_DISABLED: '1',
              NODE_ENV: 'production',
            },
          }),
    })

    if (skipped) {
      return
    }

    afterAll(async () => {
      await collector?.shutdown()
    })

    it('should trace instrumentation startup', async () => {
      collector = await connectCollector()
      next.env.TEST_OTEL_COLLECTOR_PORT = String(collector.port)
      await next.start()
      await next.fetch('/app/param/rsc-fetch')

      await retry(async () => {
        const spans = collector?.getSpans() ?? []
        const loadModuleSpan = spans.find(
          (span) =>
            span.attributes?.['next.span_type'] === 'Instrumentation.loadModule'
        )
        const registerSpan = spans.find(
          (span) =>
            span.attributes?.['next.span_type'] === 'Instrumentation.register'
        )

        expect(
          spans.filter((span) =>
            ['Instrumentation.loadModule', 'Instrumentation.register'].includes(
              span.attributes?.['next.span_type'] as string
            )
          )
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              runtime: 'nodejs',
              name: 'load instrumentation module',
              attributes: {
                'next.span_category': 'nextjs',
                'next.span_name': 'load instrumentation module',
                'next.span_type': 'Instrumentation.loadModule',
              },
              status: { code: 0 },
            }),
            expect.objectContaining({
              runtime: 'nodejs',
              name: 'register instrumentation',
              attributes: {
                'next.span_category': 'nextjs',
                'next.span_name': 'register instrumentation',
                'next.span_type': 'Instrumentation.register',
              },
              status: { code: 0 },
            }),
          ])
        )
        expect(loadModuleSpan?.timestamp).toBeLessThanOrEqual(
          registerSpan!.timestamp!
        )
        if (useDirectEntrypointHandler) {
          // Direct entrypoints register instrumentation in the first request,
          // so the lifecycle spans are children of its request span.
          for (const span of [loadModuleSpan, registerSpan]) {
            const parent = spans.find(({ id }) => id === span?.parentId)
            expect(parent?.attributes?.['next.span_type']).toBe(
              'BaseServer.handleRequest'
            )
            expect(span?.traceId).toBe(parent!.traceId)
          }
        } else {
          // `next start` registers instrumentation at startup, outside of any
          // request, so the lifecycle spans are roots.
          expect(loadModuleSpan?.parentId).toBeUndefined()
          expect(registerSpan?.parentId).toBeUndefined()
        }
      })
    })
  }
)
;(process.env.__NEXT_CACHE_COMPONENTS ? describe.skip : describe)(
  'opentelemetry NEXT_OTEL_VERBOSE=1',
  () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
      skipStart: true,
      dependencies: require('./package.json').dependencies,
      env: {
        NEXT_TELEMETRY_DISABLED: '1',
        NEXT_OTEL_VERBOSE: '1',
      },
    })

    if (skipped) {
      return
    }

    const getCollector = setupCollector(next)

    // Regression for https://github.com/vercel/otel/issues/107.
    it('all spans (including verbose) inherit traceId from incoming traceparent header', async () => {
      const pathname = '/app/param/rsc-fetch'
      await next.fetch(pathname, {
        headers: {
          traceparent: `00-${EXTERNAL.traceId}-${EXTERNAL.spanId}-01`,
        },
      })

      let spans: SavedSpan[] = []
      await retry(async () => {
        const all = getCollector().getSpans()
        const root = all.find(
          (s) =>
            s.attributes?.['next.span_type'] === 'BaseServer.handleRequest' &&
            s.attributes?.['http.target'] === pathname
        )
        expect(root).toBeDefined()
        expect(root!.traceId).toBe(EXTERNAL.traceId)

        spans = all.filter((s) => s.traceId === root!.traceId)
        expect(spans.length).toBeGreaterThan(1)

        const verbose = spans.find(
          (s) =>
            s.attributes?.['next.span_type'] === 'NextServer.getRequestHandler'
        )
        expect(verbose).toBeDefined()
        expect(verbose!.traceId).toBe(EXTERNAL.traceId)
        const parentSpanId = verbose!.parentId
        expect(parentSpanId).toBe(EXTERNAL.spanId)
      })

      for (const span of spans) {
        expect(span.traceId).toBe(EXTERNAL.traceId)
      }
    })
  }
)

describe('opentelemetry with disabled fetch tracing', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
    dependencies: require('./package.json').dependencies,
    env: {
      NEXT_OTEL_FETCH_DISABLED: '1',
    },
  })

  if (skipped) {
    return
  }

  const getCollector = setupCollector(next)
  ;(process.env.__NEXT_CACHE_COMPONENTS ? describe.skip : describe)(
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
                  name: 'NextNodeServer.clientComponentLoading',
                },
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

// These tests start a custom Next.js server (custom-server.ts),
// which is not supported in deploy mode.
// @force-gate !deploy
describe('opentelemetry with custom server', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    dependencies: require('./package.json').dependencies,
    startCommand: 'pnpm start',
    packageJson: {
      scripts: {
        start: 'pnpm tsx custom-server.ts',
      },
    },
    serverReadyPattern: /- Local:/,
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
      NODE_ENV: isNextDev ? 'development' : 'production',
    },
  })

  const getCollector = setupCollector(next)

  it('should set attributes correctly on handleRequest span', async () => {
    await next.fetch('/app/param/rsc-fetch')

    await expectTrace(getCollector(), [
      {
        name: 'custom-server-request',
        traceId: '[trace-id]',
        parentId: undefined,
        spans: [
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
            spans: [
              {
                attributes: {
                  'next.clientComponentLoadCount': isNextDev ? 8 : 7,
                  'next.span_type': 'NextNodeServer.clientComponentLoading',
                },
                kind: 0,
                name: 'NextNodeServer.clientComponentLoading',
                status: { code: 0 },
              },
              {
                name: 'render route (app) /app/[param]/rsc-fetch',
                attributes: {
                  'next.route': '/app/[param]/rsc-fetch',
                  'next.span_name': 'render route (app) /app/[param]/rsc-fetch',
                  'next.span_type': 'AppRender.getBodyResult',
                },
                kind: 0,
                status: { code: 0 },
                spans: [
                  {
                    name: 'build component tree',
                    attributes: {
                      'next.span_name': 'build component tree',
                      'next.span_type': 'NextNodeServer.createComponentTree',
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
                      'next.span_name': 'fetch GET https://example.vercel.sh/',
                      'next.span_type': 'AppRender.fetch',
                    },
                    kind: 2,
                    status: { code: 0 },
                  },
                  {
                    name: 'generateMetadata /app/[param]/layout',
                    attributes: {
                      'next.page': '/app/[param]/layout',
                      'next.span_name': 'generateMetadata /app/[param]/layout',
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
        ],
      },
    ])
  })
})

if (isNextStart) {
  describe('opentelemetry with direct entrypoint handler', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      dependencies: require('./package.json').dependencies,
      startCommand: 'pnpm start-entrypoint',
      packageJson: {
        scripts: {
          'start-entrypoint': 'pnpm tsx custom-entrypoint-server.ts',
        },
      },
      serverReadyPattern: /- Local:/,
      env: {
        NEXT_TELEMETRY_DISABLED: '1',
        NODE_ENV: 'production',
      },
    })

    if (skipped) {
      return
    }

    const getCollector = setupCollector(next)

    const directEntrypointCases = [
      { pathname: '/app/param/rsc-fetch', route: '/app/[param]/rsc-fetch' },
      { pathname: '/api/app/param/data', route: '/api/app/[param]/data' },
      {
        pathname: '/pages/param/getServerSideProps',
        route: '/pages/[param]/getServerSideProps',
      },
      {
        pathname: '/api/pages/param/basic',
        route: '/api/pages/[param]/basic',
      },
    ] as const

    describe.each(directEntrypointCases)(
      'direct entrypoint $pathname',
      ({ pathname, route }) => {
        it(`should add route names to handleRequest and parent spans for direct entrypoint ${pathname}`, async () => {
          const response = await next.fetch(pathname)
          expect(response.status).toBe(200)

          await retry(
            async () => {
              const spans = getCollector().getSpans()
              const handleRequestSpan = spans.find((span) => {
                if (
                  span.attributes?.['next.span_type'] !==
                  'BaseServer.handleRequest'
                ) {
                  return false
                }
                const target = span.attributes?.['http.target'] as
                  | string
                  | undefined
                return Boolean(target && target.includes(pathname))
              })

              expect(handleRequestSpan).toBeDefined()
              expect(handleRequestSpan!.name).toBe(`GET ${route}`)
              expect(handleRequestSpan!.attributes?.['http.target']).toContain(
                pathname
              )
              expect(handleRequestSpan!.attributes?.['next.route']).toBe(route)
              expect(handleRequestSpan!.attributes?.['http.route']).toBe(route)
              expect(handleRequestSpan!.attributes?.['next.span_name']).toBe(
                `GET ${route}`
              )

              const parentSpan = spans.find(
                (span) =>
                  span.traceId === handleRequestSpan!.traceId &&
                  !span.parentId &&
                  !span.attributes?.['next.span_type'] &&
                  span.name === handleRequestSpan!.name
              )
              expect(parentSpan).toBeDefined()
              expect(parentSpan!.name).toBe(`GET ${route}`)
            },
            30_000,
            1_000,
            `direct entrypoint span route naming ${pathname}`
          )
        })

        it(`should propagate incoming context without next-server wrapper for direct entrypoint ${pathname}`, async () => {
          const response = await next.fetch(pathname, {
            headers: {
              traceparent: `00-${EXTERNAL.traceId}-${EXTERNAL.spanId}-01`,
            },
          })
          expect(response.status).toBe(200)

          await expectTrace(getCollector(), [
            {
              name: `GET ${route}`,
              traceId: EXTERNAL.traceId,
              parentId: EXTERNAL.spanId,
              attributes: {
                'http.target': pathname,
                'next.span_type': 'BaseServer.handleRequest',
                'http.route': route,
                'next.route': route,
              },
            },
          ])
        })
      }
    )
  })
}

type HierSavedSpan = SavedSpan & { spans?: HierSavedSpan[] }
type SpanMatch = Omit<Partial<HierSavedSpan>, 'spans'> & { spans?: SpanMatch[] }

async function expectTrace(
  collector: Collector,
  match: SpanMatch[],
  edgeOnly?: boolean,
  {
    includeBubbleSpans = false,
  }: {
    /**
     * Include spans marked `next.bubble` (e.g. next-server's
     * middleware-invoke `handleRequest` span), to match a hierarchy below them.
     */
    includeBubbleSpans?: boolean
  } = {}
) {
  // Extract expected http.target values from the match (including nested
  // spans) to filter out extra spans that may be generated in production mode
  // (e.g., RSC prefetch requests)
  const expectedTargets = new Set<string>()
  const collectTargets = (matches: SpanMatch[]) => {
    for (const m of matches) {
      const target = m.attributes?.['http.target'] as string | undefined
      if (target) {
        expectedTargets.add(target)
      }
      collectTargets(m.spans ?? [])
    }
  }
  collectTargets(match)

  await retry(async () => {
    const traces = (
      includeBubbleSpans ? collector.getAllSpans() : collector.getSpans()
    ).filter(
      (span) =>
        ![
          'LoadComponents.loadRouteModule',
          'AppRouteRouteModule.loadUserland',
          'RouteModule.prepare',
          'Instrumentation.loadModule',
          'Instrumentation.register',
        ].includes(span.attributes?.['next.span_type'] as string)
    )

    const tree: HierSavedSpan[] = []
    const spansForTree: HierSavedSpan[] = traces.map((span) => ({
      ...span,
      spans: [],
    }))
    for (const span of spansForTree) {
      // for edge runtime with `next start` the nodejs runtime spans
      // will not be updated as the sandbox can't update spans across
      // node -> edge boundary, these spans also are not present when
      // deployed as next-server is not invoking edge functions there
      if (span.runtime === 'nodejs' && edgeOnly) {
        continue
      }

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
        const segmentDiff =
          (a.attributes?.['next.segment'] ?? '').localeCompare(
            b.attributes?.['next.segment'] ?? ''
          ) ?? 0
        if (segmentDiff !== 0) {
          return segmentDiff
        }
        return (
          (a.attributes?.['next.route'] ?? '').localeCompare(
            b.attributes?.['next.route'] ?? ''
          ) ?? 0
        )
      })
    }

    // Filter root spans to only those matching expected http.target values
    // (themselves or in their subtree, e.g. below a host span without one).
    // This prevents flakiness from extra spans in prod mode (RSC prefetch, etc.)
    const hasExpectedTarget = (span: HierSavedSpan): boolean => {
      const target = span.attributes?.['http.target'] as string | undefined
      return (
        Boolean(target && expectedTargets.has(target)) ||
        (span.spans ?? []).some(hasExpectedTarget)
      )
    }
    const filteredTree =
      expectedTargets.size > 0 ? tree.filter(hasExpectedTarget) : tree

    filteredTree.sort((a, b) => {
      const runtimeDiff = (a.runtime ?? '').localeCompare(b.runtime ?? '')
      if (runtimeDiff !== 0) {
        return runtimeDiff
      }
      return a.name.localeCompare(b.name)
    })

    expect(filteredTree).toMatchObject(match)
  })
}
