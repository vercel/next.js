import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('request-insights-route-preparation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  type RequestInsightSpan = {
    name: string
    durationMs?: number
    status?: 'ok' | 'error'
    traceId?: string
    spanId?: string
    parentSpanId?: string
    attributes?: Record<string, string | number | boolean>
  }

  type RequestInsight = {
    requestId: string
    route?: string
    status: 'ok' | 'error' | 'pending'
    spans: RequestInsightSpan[]
  }

  const routePreparationSpanType = 'DevRouteMatcherManager.ensureRoute'
  const matcherReloadSpanType = 'DevRouteMatcherManager.reloadMatchers'
  const routeCompilationSpanType = 'DevBundlerService.ensurePage'
  const routeModulePrepareSpanType = 'RouteModule.prepare'
  const routeManifestLoadSpanType = 'RouteModule.loadManifests'

  async function getRequestInsights() {
    return (await next
      .fetch('/_next/development/request-insights')
      .then((response) => response.json())) as {
      requests: RequestInsight[]
    }
  }

  async function captureRequest(
    route: string,
    request: () => Promise<unknown>
  ) {
    const existingRequestIds = new Set(
      (await getRequestInsights()).requests
        .filter((insight) => insight.route === route)
        .map((insight) => insight.requestId)
    )

    await request()

    let capturedRequest: RequestInsight | undefined
    await retry(async () => {
      capturedRequest = (await getRequestInsights()).requests.find(
        (insight) =>
          insight.route === route &&
          insight.status === 'ok' &&
          !existingRequestIds.has(insight.requestId) &&
          insight.spans.some(
            (span) =>
              span.attributes?.['next.span_type'] ===
                'BaseServer.handleRequest' &&
              span.status === 'ok' &&
              typeof span.durationMs === 'number'
          ) &&
          insight.spans.some(
            (span) =>
              span.attributes?.['next.span_type'] === routePreparationSpanType
          ) &&
          insight.spans.some(
            (span) =>
              span.attributes?.['next.span_type'] === matcherReloadSpanType
          ) &&
          insight.spans.some(
            (span) =>
              span.attributes?.['next.span_type'] === routeCompilationSpanType
          )
      )

      expect(capturedRequest).toBeDefined()
    }, 10_000)

    return capturedRequest!
  }

  function expectRoutePreparationSpans(request: RequestInsight) {
    const spanById = new Map(
      request.spans.flatMap((span) =>
        span.spanId ? [[span.spanId, span] as const] : []
      )
    )
    const rootSpan = request.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] === 'BaseServer.handleRequest'
    )
    const routePreparationSpans = request.spans.filter(
      (span) => span.attributes?.['next.span_type'] === routePreparationSpanType
    )
    const matcherReloadSpans = request.spans.filter(
      (span) => span.attributes?.['next.span_type'] === matcherReloadSpanType
    )

    expect(rootSpan?.spanId).toBeDefined()
    expect(rootSpan?.traceId).toBeDefined()
    expect(routePreparationSpans).toHaveLength(1)
    expect(matcherReloadSpans).toHaveLength(1)
    expect(routePreparationSpans[0].spanId).toBeDefined()
    expect(matcherReloadSpans[0].spanId).toBeDefined()
    expect(matcherReloadSpans[0].spanId).not.toBe(
      routePreparationSpans[0].spanId
    )
    expect(matcherReloadSpans[0].parentSpanId).toBe(
      routePreparationSpans[0].parentSpanId
    )

    for (const [span, name, type] of [
      [routePreparationSpans[0], 'prepare route', routePreparationSpanType],
      [matcherReloadSpans[0], 'reload route matchers', matcherReloadSpanType],
    ] as const) {
      expect(span).toEqual(
        expect.objectContaining({
          name,
          durationMs: expect.any(Number),
          status: 'ok',
          attributes: {
            'next.span_category': 'nextjs',
            'next.span_name': name,
            'next.span_type': type,
          },
        })
      )
      expect(Number.isFinite(span.durationMs)).toBe(true)
      expect(span.durationMs).toBeGreaterThanOrEqual(0)
      expect(span.traceId).toBe(rootSpan?.traceId)

      let ancestor = span.parentSpanId
        ? spanById.get(span.parentSpanId)
        : undefined
      const visited = new Set<string>()
      while (
        ancestor?.spanId !== rootSpan?.spanId &&
        ancestor?.parentSpanId &&
        !visited.has(ancestor.parentSpanId)
      ) {
        visited.add(ancestor.parentSpanId)
        ancestor = spanById.get(ancestor.parentSpanId)
      }
      expect(ancestor?.spanId).toBe(rootSpan?.spanId)
    }

    const routePreparationSpan = routePreparationSpans[0]
    const routeCompilationSpans = request.spans.filter(
      (span) =>
        span.attributes?.['next.span_type'] === routeCompilationSpanType &&
        span.parentSpanId === routePreparationSpan.spanId
    )
    expect(routeCompilationSpans).toHaveLength(1)

    const routeCompilationSpan = routeCompilationSpans[0]
    expect(routeCompilationSpan).toEqual(
      expect.objectContaining({
        name: 'compile route',
        durationMs: expect.any(Number),
        status: 'ok',
        parentSpanId: routePreparationSpan.spanId,
        attributes: {
          'next.span_category': 'nextjs',
          'next.span_name': 'compile route',
          'next.span_type': routeCompilationSpanType,
        },
      })
    )
    expect(Number.isFinite(routeCompilationSpan.durationMs)).toBe(true)
    expect(routeCompilationSpan.durationMs).toBeGreaterThanOrEqual(0)
    expect(routeCompilationSpan.traceId).toBe(rootSpan?.traceId)
  }

  function expectRouteModulePreparationSpans(request: RequestInsight) {
    const rootSpan = request.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] === 'BaseServer.handleRequest'
    )
    const prepareSpans = request.spans.filter(
      (span) =>
        span.attributes?.['next.span_type'] === routeModulePrepareSpanType
    )
    const manifestLoadSpans = request.spans.filter(
      (span) =>
        span.attributes?.['next.span_type'] === routeManifestLoadSpanType
    )

    expect(prepareSpans).toEqual([
      expect.objectContaining({
        name: 'prepare route module',
        status: 'ok',
        traceId: rootSpan?.traceId,
        attributes: {
          'next.span_category': 'nextjs',
          'next.span_name': 'prepare route module',
          'next.span_type': routeModulePrepareSpanType,
        },
      }),
    ])
    expect(manifestLoadSpans).toEqual([
      expect.objectContaining({
        name: 'load route manifests',
        status: 'ok',
        traceId: rootSpan?.traceId,
        parentSpanId: prepareSpans[0].spanId,
        attributes: {
          'next.span_category': 'nextjs',
          'next.span_name': 'load route manifests',
          'next.span_type': routeManifestLoadSpanType,
        },
      }),
    ])
  }

  it('records route preparation for first and subsequent App Page requests', async () => {
    const coldRequest = await captureRequest('/', async () => {
      const response = await next.fetch('/')
      expect(response.status).toBe(200)
      expect(await response.text()).toContain('route preparation page')
    })
    const warmRequest = await captureRequest('/', async () => {
      const response = await next.fetch('/')
      expect(response.status).toBe(200)
      await response.text()
    })

    expectRoutePreparationSpans(coldRequest)
    expectRoutePreparationSpans(warmRequest)
    expectRouteModulePreparationSpans(coldRequest)
    expectRouteModulePreparationSpans(warmRequest)
  })

  it('records route preparation for first and subsequent App Route requests', async () => {
    const route = '/api/route-preparation'
    const coldRequest = await captureRequest(route, async () => {
      const response = await next.fetch(route)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ route: 'prepared' })
    })
    const warmRequest = await captureRequest(route, async () => {
      const response = await next.fetch(route)
      expect(response.status).toBe(200)
      await response.text()
    })

    expectRoutePreparationSpans(coldRequest)
    expectRoutePreparationSpans(warmRequest)
    expectRouteModulePreparationSpans(coldRequest)
    expectRouteModulePreparationSpans(warmRequest)
  })
})
