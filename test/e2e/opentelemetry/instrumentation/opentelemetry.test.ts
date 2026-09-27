import { FileRef, isNextDev, isNextStart, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { NEXT_RSC_UNION_QUERY } from 'next/dist/client/components/app-router-headers'
import { createServer, type ServerResponse } from 'node:http'
import path from 'path'

import { SavedSpan } from './constants'
import { type Collector, connectCollector } from './collector'

const EXTERNAL = {
  traceId: 'ee75cd9e534ff5e9ed78b4a0c706f0f2',
  spanId: '0f6a325411bdc432',
} as const

const COLLECTOR_PORT = 9001
const ROUTE_PREPARATION_COLLECTOR_PORT = 9002
const INSTRUMENTATION_STARTUP_COLLECTOR_PORT = 9003
const APP_ROUTE_MODULE_LOADING_COLLECTOR_PORT = 9004
const CLIENT_COMPONENT_GATE_PORT = 9005

type NextInstance = ReturnType<typeof nextTestSetup>['next']

function setupCollector(next: NextInstance, port: number) {
  let collector: Collector | undefined

  // The app's span exporter remains active for the entire suite. Keep its
  // endpoint available for the same lifetime and only reset collected state.
  beforeAll(async () => {
    collector = await connectCollector({ port })
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

function setup({ useDirectEntrypointHandler, useNodeMiddleware }) {
  const testSetup = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
    dependencies: require('./package.json').dependencies,
    ...(!useDirectEntrypointHandler
      ? {
          env: {
            TEST_OTEL_COLLECTOR_PORT: String(COLLECTOR_PORT),
            TEST_CLIENT_COMPONENT_GATE_PORT: String(CLIENT_COMPONENT_GATE_PORT),
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
            TEST_OTEL_COLLECTOR_PORT: String(COLLECTOR_PORT),
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
  return {
    next: testSetup,
    getCollector: testSetup.skipped
      ? () => {
          throw new Error('OpenTelemetry test setup was skipped')
        }
      : setupCollector(testSetup.next, COLLECTOR_PORT),
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
    const response = await fetch(`http://localhost:${COLLECTOR_PORT}`, {
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
      const pendingGates = new Map<string, ServerResponse>()
      const gateArrivals = new Map<string, () => void>()
      const gateServer = createServer((req, res) => {
        const id = new URL(req.url || '/', 'http://localhost').searchParams.get(
          'id'
        )
        if (!id) {
          res.writeHead(400).end()
          return
        }
        pendingGates.set(id, res)
        gateArrivals.get(id)?.()
      })
      let traceNumber = 0

      function newTraceId() {
        return (++traceNumber).toString(16).padStart(32, '0')
      }

      function traceparent(traceId: string) {
        return `00-${traceId}-${'1'.repeat(16)}-01`
      }

      beforeAll(async () => {
        await new Promise<void>((resolve, reject) => {
          gateServer.once('error', reject)
          gateServer.listen(CLIENT_COMPONENT_GATE_PORT, '127.0.0.1', () => {
            gateServer.off('error', reject)
            resolve()
          })
        })
      })

      afterEach(() => {
        for (const response of pendingGates.values()) {
          response.end('released')
        }
        pendingGates.clear()
        gateArrivals.clear()
      })

      afterAll(async () => {
        await new Promise<void>((resolve, reject) => {
          gateServer.close((error) => (error ? reject(error) : resolve()))
        })
      })

      function waitForGate(id: string): Promise<void> {
        if (pendingGates.has(id)) return Promise.resolve()
        return new Promise((resolve) => gateArrivals.set(id, resolve))
      }

      function releaseGate(id: string) {
        const response = pendingGates.get(id)
        expect(response).toBeDefined()
        pendingGates.delete(id)
        response!.setHeader('Connection', 'close')
        response!.end('released')
      }

      async function openStream(
        id: string,
        traceId: string,
        extra = false,
        unsampled = false,
        noLate = false
      ) {
        const response = await next.fetch(
          `/app/test/client-component-loading?id=${id}${extra ? '&variant=extra' : noLate ? '&variant=no-late' : ''}`,
          {
            headers: {
              traceparent: traceparent(traceId),
              ...(unsampled
                ? { 'x-custom': 'disable-client-component-trace' }
                : {}),
            },
          }
        )
        expect(response.status).toBe(200)
        expect(response.body).not.toBeNull()

        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let html = ''
        while (
          !html.includes('<span id="early-client">') ||
          (extra && !html.includes('<span id="extra-early-client">'))
        ) {
          const { done, value } = await reader.read()
          expect(done).toBe(false)
          html += decoder.decode(value, { stream: true })
        }
        return { reader, decoder, html, extra, noLate }
      }

      async function finishStream(
        stream: Awaited<ReturnType<typeof openStream>>
      ) {
        let { html } = stream
        while (true) {
          const { done, value } = await stream.reader.read()
          if (done) break
          html += stream.decoder.decode(value, { stream: true })
        }
        html += stream.decoder.decode()
        expect(html).toContain(
          stream.noLate
            ? '<span id="no-late-client">'
            : '<span id="late-client">'
        )
        if (stream.extra) {
          expect(html).toContain('<span id="extra-late-client">')
        }
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

      async function expectNoLoadingSpanWhileBlocked(...traceIds: string[]) {
        // The SDK's SimpleSpanProcessor does not await ordinary HTTP exports
        // in forceFlush. This control route also drains the test exporter's
        // in-flight requests before we inspect the collector.
        const response = await next.fetch(
          '/api/app/test/client-component-flush',
          { method: 'POST' }
        )
        expect(response.status).toBe(204)
        for (const traceId of traceIds) {
          expect(loadingSpans(traceId)).toEqual([])
        }
      }

      async function loadSpan(traceId: string): Promise<SavedSpan> {
        return retry(() => {
          const spans = loadingSpans(traceId)
          expect(spans).toHaveLength(1)
          const count = spans[0].attributes?.[
            'next.clientComponentLoadCount'
          ] as number
          expect(count).toBeGreaterThan(0)
          return spans[0]
        })
      }

      async function loadCount(traceId: string): Promise<number> {
        const span = await loadSpan(traceId)
        return span.attributes?.['next.clientComponentLoadCount'] as number
      }

      async function namedSpan(
        traceId: string,
        name: string
      ): Promise<SavedSpan> {
        return retry(() => {
          const spans = getCollector()
            .getSpans()
            .filter((span) => span.traceId === traceId && span.name === name)
          expect(spans).toHaveLength(1)
          return spans[0]
        })
      }

      async function sequentialRender(
        id: string,
        extra = false,
        noLate = false
      ) {
        const traceId = newTraceId()
        const streamPromise = openStream(id, traceId, extra, false, noLate)
        await waitForGate(id)
        const stream = await streamPromise
        await expectNoLoadingSpanWhileBlocked(traceId)
        releaseGate(id)
        await finishStream(stream)
        const loadingSpan = await loadSpan(traceId)
        await namedSpan(traceId, 'test.clientComponentGateReleased')
        return loadingSpan.attributes?.[
          'next.clientComponentLoadCount'
        ] as number
      }

      async function concurrentRenders({
        a,
        b,
        finishFirst,
      }: {
        a: { id: string; extra: boolean }
        b: { id: string; extra: boolean }
        finishFirst: 'a' | 'b'
      }) {
        const traceA = newTraceId()
        const traceB = newTraceId()
        const aPromise = openStream(a.id, traceA, a.extra)
        await waitForGate(a.id)
        const streamA = await aPromise

        const bPromise = openStream(b.id, traceB, b.extra)
        await waitForGate(b.id)
        const streamB = await bPromise

        await expectNoLoadingSpanWhileBlocked(traceA, traceB)

        // Both early Client Components have reached streamed HTML before
        // either suspended subtree is released.
        const first = finishFirst === 'a' ? a : b
        const second = finishFirst === 'a' ? b : a
        const firstStream = finishFirst === 'a' ? streamA : streamB
        const secondStream = finishFirst === 'a' ? streamB : streamA
        const firstTrace = finishFirst === 'a' ? traceA : traceB
        const secondTrace = finishFirst === 'a' ? traceB : traceA

        releaseGate(first.id)
        await finishStream(firstStream)
        const firstCount = await loadCount(firstTrace)
        const secondWasStillBlocked = pendingGates.has(second.id)

        releaseGate(second.id)
        await finishStream(secondStream)
        const secondCount = await loadCount(secondTrace)

        return {
          counts:
            finishFirst === 'a'
              ? [firstCount, secondCount]
              : [secondCount, firstCount],
          secondWasStillBlocked,
        }
      }

      it('isolates equal client component loads when A finishes first', async () => {
        await sequentialRender('equal-warmup')
        await sequentialRender('equal-warmup-no-late', false, true)
        getCollector().reset()

        const noLateCount = await sequentialRender(
          'equal-baseline-no-late',
          false,
          true
        )
        const baselineA = await sequentialRender('equal-baseline-a')
        const baselineB = await sequentialRender('equal-baseline-b')
        const result = await concurrentRenders({
          a: { id: 'equal-concurrent-a', extra: false },
          b: { id: 'equal-concurrent-b', extra: false },
          finishFirst: 'a',
        })

        expect(baselineA).toBeGreaterThan(noLateCount)
        expect(baselineA).toBe(baselineB)
        expect(result.secondWasStillBlocked).toBe(true)
        expect(result.counts).toEqual([baselineA, baselineB])
      })

      for (const finishFirst of ['a', 'b'] as const) {
        it(`isolates unequal client component loads when ${finishFirst.toUpperCase()} finishes first`, async () => {
          await sequentialRender(`unequal-${finishFirst}-warm-normal`)
          await sequentialRender(`unequal-${finishFirst}-warm-extra`, true)
          getCollector().reset()

          const baselineA = await sequentialRender(
            `unequal-${finishFirst}-baseline-a`
          )
          const baselineB = await sequentialRender(
            `unequal-${finishFirst}-baseline-b`,
            true
          )
          const result = await concurrentRenders({
            a: {
              id: `unequal-${finishFirst}-concurrent-a`,
              extra: false,
            },
            b: {
              id: `unequal-${finishFirst}-concurrent-b`,
              extra: true,
            },
            finishFirst,
          })

          expect(baselineB).toBeGreaterThan(baselineA)
          expect(result.secondWasStillBlocked).toBe(true)
          expect(result.counts).toEqual([baselineA, baselineB])
        })
      }

      it('keeps sampled client loads when an unsampled render finishes first', async () => {
        await sequentialRender('sampling-warmup')
        const baseline = await sequentialRender('sampling-baseline')

        const sampledTrace = newTraceId()
        const unsampledTrace = newTraceId()
        const sampledPromise = openStream('sampled-a', sampledTrace)
        await waitForGate('sampled-a')
        const sampledStream = await sampledPromise

        const unsampledPromise = openStream(
          'unsampled-b',
          unsampledTrace,
          true,
          true
        )
        await waitForGate('unsampled-b')
        const unsampledStream = await unsampledPromise

        await expectNoLoadingSpanWhileBlocked(sampledTrace, unsampledTrace)

        releaseGate('unsampled-b')
        await finishStream(unsampledStream)
        const sampledWasStillBlocked = pendingGates.has('sampled-a')

        releaseGate('sampled-a')
        await finishStream(sampledStream)
        await namedSpan(sampledTrace, 'test.clientComponentGateReleased')

        expect(sampledWasStillBlocked).toBe(true)
        expect(
          getCollector()
            .getSpans()
            .filter((span) => span.traceId === unsampledTrace)
        ).toEqual([])
        const loadingSpan = await loadSpan(sampledTrace)
        expect(loadingSpan.attributes?.['next.clientComponentLoadCount']).toBe(
          baseline
        )
      })

      const actionPath = '/app/test/client-component-action'

      async function getActionPage(traceId: string) {
        const $ = await next.render$(actionPath, undefined, {
          headers: { traceparent: traceparent(traceId) },
        })
        expect($('#action-result').text()).toBe('none')
        return { $, count: await loadCount(traceId) }
      }

      function formDataForAction(
        $: Awaited<ReturnType<typeof next.render$>>,
        marker: string
      ) {
        const form = $('form').first()
        expect(form.length).toBe(1)
        const formData = new FormData()
        const actionFields: string[] = []
        form.find('input[type="hidden"]').each((_, input) => {
          const name = $(input).attr('name')
          if (name) {
            formData.append(name, $(input).attr('value') ?? '')
            actionFields.push(name)
          }
        })
        expect(actionFields.some((name) => name.startsWith('$ACTION_'))).toBe(
          true
        )
        formData.set('marker', marker)
        return formData
      }

      async function postAction(
        $: Awaited<ReturnType<typeof next.render$>>,
        marker: string,
        traceId: string
      ) {
        const response = await next.fetch(actionPath, {
          method: 'POST',
          headers: {
            traceparent: traceparent(traceId),
            origin: new URL(next.url).origin,
          },
          body: formDataForAction($, marker),
        })
        expect(response.status).toBe(200)
        expect(await response.text()).toContain(
          `<p id="action-result">${marker}</p>`
        )
      }

      async function drainActionGet() {
        await getActionPage(newTraceId())
      }

      it('reports client component loading for a consumed Server Action POST rerender', async () => {
        const { $ } = await getActionPage(newTraceId())
        const actionTrace = newTraceId()
        try {
          await postAction($, 'post-span-marker', actionTrace)
          await namedSpan(actionTrace, 'test.serverActionCompleted')
          await loadSpan(actionTrace)
        } finally {
          await drainActionGet()
        }
      })

      it('does not carry consumed action loading into the next GET', async () => {
        await getActionPage(newTraceId())
        const { $, count: baseline } = await getActionPage(newTraceId())
        try {
          await postAction($, 'post-followup-marker', newTraceId())
          const { count: followupCount } = await getActionPage(newTraceId())
          expect(followupCount).toBe(baseline)
        } finally {
          await drainActionGet()
        }
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
                          'next.clientComponentLoadCount': isNextDev ? 8 : 7,
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
                        attributes: {
                          'next.clientComponentLoadCount': isNextDev ? 12 : 10,
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
                        attributes: {
                          'next.clientComponentLoadCount': isNextDev ? 9 : 8,
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
  describe('opentelemetry route module preparation with direct entrypoint handler', () => {
    let collector: Collector | undefined
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      dependencies: require('./package.json').dependencies,
      startCommand: 'pnpm start-entrypoint',
      packageJson: {
        scripts: {
          'start-entrypoint':
            'pnpm tsx custom-entrypoint-server.ts --without-parent-span',
        },
      },
      serverReadyPattern: /- Local:/,
      env: {
        TEST_OTEL_COLLECTOR_PORT: String(ROUTE_PREPARATION_COLLECTOR_PORT),
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

    it('should trace route module preparation', async () => {
      const connectedCollector = await connectCollector({
        port: ROUTE_PREPARATION_COLLECTOR_PORT,
      })
      collector = connectedCollector
      await next.start()

      await next.fetch('/app/param/rsc-fetch')
      await next.fetch('/api/app/param/data')

      await retry(async () => {
        const prepareSpans = connectedCollector
          .getSpans()
          .filter(
            (span) =>
              span.attributes?.['next.span_type'] === 'RouteModule.prepare'
          )

        expect(prepareSpans).toEqual([
          expect.objectContaining({
            runtime: 'nodejs',
            name: 'prepare route module',
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
  })
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
              TEST_OTEL_COLLECTOR_PORT: String(
                APP_ROUTE_MODULE_LOADING_COLLECTOR_PORT
              ),
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
              TEST_OTEL_COLLECTOR_PORT: String(
                APP_ROUTE_MODULE_LOADING_COLLECTOR_PORT
              ),
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
      collector = await connectCollector({
        port: APP_ROUTE_MODULE_LOADING_COLLECTOR_PORT,
      })
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
  ].filter(Boolean)
)('opentelemetry - middleware $name', ({ useDirectEntrypointHandler }) => {
  describe.each(['edge', 'nodejs'])('%s runtime', (runtime) => {
    const {
      next: { next, skipped },
      getCollector,
    } = setup({
      useDirectEntrypointHandler,
      useNodeMiddleware: runtime === 'nodejs',
    })

    if (skipped) {
      return
    }

    if (useDirectEntrypointHandler && runtime === 'edge') {
      it.skip('direct entrypoint handler is not implemented for edge runtime', () => {})
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
          it('should trace middleware', async () => {
            await next.fetch('/behind-middleware', env.fetchInit)
            let expected = [
              {
                runtime: runtime,
                traceId: env.span.traceId,
                parentId: env.span.rootParentId,
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
            ]
            if (runtime === 'nodejs') {
              // TODO unclear why this is reversed for Node.js runtime
              expected.reverse()
            }
            await expectTrace(getCollector(), expected)
          })
        }
      )
    }
  })
})

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
              TEST_OTEL_COLLECTOR_PORT: String(
                INSTRUMENTATION_STARTUP_COLLECTOR_PORT
              ),
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
              TEST_OTEL_COLLECTOR_PORT: String(
                INSTRUMENTATION_STARTUP_COLLECTOR_PORT
              ),
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
      collector = await connectCollector({
        port: INSTRUMENTATION_STARTUP_COLLECTOR_PORT,
      })
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
        TEST_OTEL_COLLECTOR_PORT: String(COLLECTOR_PORT),
        NEXT_TELEMETRY_DISABLED: '1',
        NEXT_OTEL_VERBOSE: '1',
      },
    })

    if (skipped) {
      return
    }

    const getCollector = setupCollector(next, COLLECTOR_PORT)

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
      TEST_OTEL_COLLECTOR_PORT: String(COLLECTOR_PORT),
    },
  })

  if (skipped) {
    return
  }

  const getCollector = setupCollector(next, COLLECTOR_PORT)
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

describe('opentelemetry with custom server', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
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
      TEST_OTEL_COLLECTOR_PORT: String(COLLECTOR_PORT),
      NEXT_TELEMETRY_DISABLED: '1',
      NODE_ENV: isNextDev ? 'development' : 'production',
    },
  })

  if (skipped) {
    return
  }

  const getCollector = setupCollector(next, COLLECTOR_PORT)

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
                    attributes: {
                      'next.clientComponentLoadCount': isNextDev ? 8 : 7,
                      'next.span_type': 'NextNodeServer.clientComponentLoading',
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
        TEST_OTEL_COLLECTOR_PORT: String(COLLECTOR_PORT),
        NEXT_TELEMETRY_DISABLED: '1',
        NODE_ENV: 'production',
      },
    })

    if (skipped) {
      return
    }

    const getCollector = setupCollector(next, COLLECTOR_PORT)

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
  edgeOnly?: boolean
) {
  // Extract expected http.target values from the match to filter out extra spans
  // that may be generated in production mode (e.g., RSC prefetch requests)
  const expectedTargets = new Set(
    match
      .map((m) => m.attributes?.['http.target'] as string | undefined)
      .filter(Boolean)
  )

  await retry(async () => {
    const traces = collector
      .getSpans()
      .filter(
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
    // This prevents flakiness from extra spans in prod mode (RSC prefetch, etc.)
    const filteredTree =
      expectedTargets.size > 0
        ? tree.filter((span) => {
            const target = span.attributes?.['http.target'] as
              | string
              | undefined
            return target && expectedTargets.has(target)
          })
        : tree

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
