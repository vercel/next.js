import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import {
  NEXT_RSC_UNION_QUERY,
  RSC_HEADER,
} from 'next/dist/client/components/app-router-headers'

describe('request-insights-route-preparation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  type RequestInsightSpan = {
    name: string
    startTime?: number
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
  const appPagePreparationSpanType = 'AppRender.prepareAppPageResponse'
  const renderInitializationSpanType = 'AppRender.initializeRender'

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

  function expectAppPageRenderPreparationSpans(
    request: RequestInsight,
    { expectBodyRender = true }: { expectBodyRender?: boolean } = {}
  ) {
    const rootSpan = request.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] === 'BaseServer.handleRequest'
    )
    const spanById = new Map(
      request.spans.flatMap((span) =>
        span.spanId ? [[span.spanId, span] as const] : []
      )
    )
    const renderSpans = request.spans.filter(
      (span) => span.attributes?.['next.span_type'] === 'BaseServer.render'
    )

    expect(renderSpans).toHaveLength(1)
    const renderSpan = renderSpans[0]
    const preparationSpans = request.spans.filter(
      (span) =>
        span.attributes?.['next.span_type'] === appPagePreparationSpanType
    )
    const initializationSpans = request.spans.filter(
      (span) =>
        span.attributes?.['next.span_type'] === renderInitializationSpanType
    )

    expect(preparationSpans).toHaveLength(1)
    expect(initializationSpans).toHaveLength(1)

    const preparationSpan = preparationSpans[0]
    const initializationSpan = initializationSpans[0]
    expect(preparationSpan.parentSpanId).toBe(initializationSpan.parentSpanId)
    const phaseParent = preparationSpan.parentSpanId
      ? spanById.get(preparationSpan.parentSpanId)
      : undefined
    expect(phaseParent?.attributes?.['next.span_type']).toBe(
      'BaseServer.renderToResponseWithComponents'
    )

    let phaseAncestor = phaseParent
    const visited = new Set<string>()
    while (
      phaseAncestor?.spanId !== renderSpan.spanId &&
      phaseAncestor?.parentSpanId &&
      !visited.has(phaseAncestor.parentSpanId)
    ) {
      visited.add(phaseAncestor.parentSpanId)
      phaseAncestor = spanById.get(phaseAncestor.parentSpanId)
    }
    expect(phaseAncestor?.spanId).toBe(renderSpan.spanId)
    expect(preparationSpan).toEqual(
      expect.objectContaining({
        name: 'prepare app page response',
        startTime: expect.any(Number),
        durationMs: expect.any(Number),
        status: 'ok',
        attributes: expect.objectContaining({
          'next.span_category': 'nextjs',
          'next.span_name': 'prepare app page response',
          'next.span_type': appPagePreparationSpanType,
        }),
      })
    )
    expect(initializationSpan).toEqual(
      expect.objectContaining({
        name: 'initialize app render',
        startTime: expect.any(Number),
        durationMs: expect.any(Number),
        status: 'ok',
        attributes: expect.objectContaining({
          'next.span_category': 'nextjs',
          'next.span_name': 'initialize app render',
          'next.span_type': renderInitializationSpanType,
        }),
      })
    )

    for (const span of [preparationSpan, initializationSpan]) {
      expect(Number.isFinite(span.startTime)).toBe(true)
      expect(Number.isFinite(span.durationMs)).toBe(true)
      expect(span.durationMs).toBeGreaterThanOrEqual(0)
      expect(span.traceId).toBe(rootSpan?.traceId)
    }

    expect(
      preparationSpan.startTime! + preparationSpan.durationMs!
    ).toBeLessThanOrEqual(initializationSpan.startTime!)

    const bodyRenderSpans = request.spans.filter(
      (span) =>
        span.attributes?.['next.span_type'] === 'AppRender.getBodyResult'
    )
    if (expectBodyRender) {
      expect(bodyRenderSpans).toHaveLength(1)
      const bodyRenderSpan = bodyRenderSpans[0]
      expect(bodyRenderSpan.parentSpanId).toBe(preparationSpan.parentSpanId)
      expect(
        initializationSpan.startTime! + initializationSpan.durationMs!
      ).toBeLessThanOrEqual(bodyRenderSpan.startTime!)
    } else {
      expect(bodyRenderSpans).toHaveLength(0)
    }
  }

  function expectNoAppPageRenderPreparationSpans(request: RequestInsight) {
    expect(
      request.spans.some((span) =>
        [appPagePreparationSpanType, renderInitializationSpanType].includes(
          String(span.attributes?.['next.span_type'])
        )
      )
    ).toBe(false)
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
    expectAppPageRenderPreparationSpans(coldRequest)
    expectAppPageRenderPreparationSpans(warmRequest)
  })

  it('records App Page preparation and initialization for RSC requests', async () => {
    const request = await captureRequest('/', async () => {
      const response = await next.fetch(`/?${NEXT_RSC_UNION_QUERY}`, {
        headers: {
          [RSC_HEADER]: '1',
        },
      })
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/x-component')
      await response.text()
    })

    expectRoutePreparationSpans(request)
    expectAppPageRenderPreparationSpans(request, { expectBodyRender: false })
    expect(
      request.spans.find(
        (span) =>
          span.attributes?.['next.span_type'] === 'BaseServer.handleRequest'
      )?.attributes?.['next.rsc']
    ).toBe(true)
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
    expectNoAppPageRenderPreparationSpans(coldRequest)
    expectNoAppPageRenderPreparationSpans(warmRequest)
  })
})
