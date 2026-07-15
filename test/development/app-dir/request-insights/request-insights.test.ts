import { nextTestSetup } from 'e2e-utils'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import { retry } from 'next-test-utils'

const isCacheComponentsEnabled = process.env.__NEXT_CACHE_COMPONENTS === 'true'

type RequestInsight = {
  requestId: string
  htmlRequestId: string
  route: string
  startTime: number
  status: 'ok' | 'error' | 'pending'
  durationMs?: number
  serverAction?: {
    name: string
    file?: string
    durationMs?: number
    status: 'ok' | 'error'
  }
  spans: Array<{
    name: string
    spanId?: string
    parentSpanId?: string
    startTime: number
    durationMs?: number
    status?: 'ok' | 'error'
    attributes?: Record<string, string | number | boolean>
  }>
  fetches: Array<{
    durationMs: number
    statusCode: number
    cacheStatus: string
    method: string
    url: string
  }>
}

describe('request insights', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  function createRequest(index: number, fetchCount = 0): RequestInsight {
    return {
      requestId: `request-${index}`,
      htmlRequestId: `page-${index}`,
      route: `/route-${index}`,
      startTime: index,
      status: 'ok',
      spans: [],
      fetches: Array.from({ length: fetchCount }, (_, fetchIndex) => ({
        durationMs: fetchIndex + 1,
        statusCode: 200,
        cacheStatus: 'miss',
        method: 'GET',
        url: `https://example.com/fetch-${fetchIndex}`,
      })),
    }
  }

  async function runWithResponse(body: unknown, args: string[] = []) {
    const requestedPaths: string[] = []
    const server = createServer((req, res) => {
      requestedPaths.push(req.url ?? '')
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(body))
    })

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve)
    })

    try {
      const address = server.address() as AddressInfo
      const result = await next.runCommand([
        'experimental-request-insights',
        '--url',
        `http://127.0.0.1:${address.port}`,
        ...args,
      ])
      return { result, requestedPaths }
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  }

  it('discovers the running dev server from the project lockfile', async () => {
    const result = await next.runCommand(['experimental-request-insights'])

    if (result.code !== 0) {
      throw new Error(result.cliOutput)
    }
    expect(result.cliOutput).toMatch(
      /No request insights captured yet|retained requests \(newest first\)/
    )
  })

  it('captures the full request through the response pipeline', async () => {
    const maxSpanBoundaryGapMs = 5
    await next.render('/')

    const snapshot = (await next
      .fetch('/_next/development/request-insights')
      .then((response) => response.json())) as {
      requests: RequestInsight[]
    }
    const request = snapshot.requests.findLast(
      (insight) =>
        insight.route === '/' &&
        insight.spans.some(
          (span) =>
            span.attributes?.['next.span_type'] === 'BaseServer.handleRequest'
        )
    )
    const requestSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] === 'BaseServer.handleRequest'
    )
    const baseRenderSpan = request?.spans.find(
      (span) => span.attributes?.['next.span_type'] === 'BaseServer.render'
    )
    const renderSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] === 'AppRender.getBodyResult'
    )
    const renderWithComponentsSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] ===
        'BaseServer.renderToResponseWithComponents'
    )
    const prepareResponseSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] ===
        'BaseServer.prepareResponseWithComponents'
    )
    const getIncrementalCacheSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] === 'BaseServer.getIncrementalCache'
    )
    const resolvePrerenderingSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] === 'BaseServer.resolvePrerendering'
    )
    const prepareRouteHandlerSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] === 'BaseServer.prepareRouteHandler'
    )
    const executeRouteHandlerSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] === 'BaseServer.executeRouteHandler'
    )
    const prepareAppPageResponseSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] ===
        'AppRender.prepareAppPageResponse'
    )
    const initializeAppRenderSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] === 'AppRender.initializeRender'
    )
    const buildComponentTreeSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] ===
        'NextNodeServer.createComponentTree'
    )
    const finalizeRSCPayloadSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] === 'AppRender.finalizeRSCPayload'
    )
    const startRSCStreamSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] === 'AppRender.startRSCStream'
    )
    const renderRSCResponseSpan = request?.spans.findLast(
      (span) =>
        span.attributes?.['next.span_type'] === 'AppRender.renderRSCResponse'
    )
    const waitForRSCSpan = request?.spans.find(
      (span) => span.attributes?.['next.span_type'] === 'AppRender.waitForRSC'
    )
    const prepareHTMLRenderSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] === 'AppRender.prepareHTMLRender'
    )
    const renderToNodeFizzStreamSpan = request?.spans.findLast(
      (span) =>
        span.attributes?.['next.span_type'] ===
        'AppRender.renderToNodeFizzStream'
    )
    const waitForHTMLCompletionSpan = request?.spans.findLast(
      (span) =>
        span.attributes?.['next.span_type'] ===
        'AppRender.waitForHTMLCompletion'
    )
    const renderToReadableStreamSpan = request?.spans.findLast(
      (span) =>
        span.attributes?.['next.span_type'] ===
        'AppRender.renderToReadableStream'
    )
    const waitShellReadySpan = request?.spans.findLast(
      (span) =>
        span.attributes?.['next.span_type'] === 'AppRender.waitShellReady'
    )
    const waitForFizzRenderTaskSpan = request?.spans.findLast(
      (span) =>
        span.attributes?.['next.span_type'] ===
        'AppRender.waitForFizzRenderTask'
    )
    const pipeFizzStreamSpan = request?.spans.findLast(
      (span) =>
        span.attributes?.['next.span_type'] === 'AppRender.pipeFizzStream'
    )
    const waitForFizzFlushSpan = request?.spans.findLast(
      (span) =>
        span.attributes?.['next.span_type'] === 'AppRender.waitForFizzFlush'
    )
    const createHTMLTransformsSpan = request?.spans.findLast(
      (span) =>
        span.attributes?.['next.span_type'] === 'AppRender.createHTMLTransforms'
    )
    const waitForFirstResponseChunkSpan = request?.spans.findLast(
      (span) =>
        span.attributes?.['next.span_type'] ===
        'NextNodeServer.waitForFirstResponseChunk'
    )
    const startResponseSpan = request?.spans.findLast(
      (span) =>
        span.attributes?.['next.span_type'] === 'NextNodeServer.startResponse'
    )
    const handlerSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] === 'BaseServer.handleRequestImpl'
    )
    const prepareSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] === 'BaseServer.prepareRequest'
    )
    const dispatchSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] === 'BaseServer.dispatchRequest'
    )
    const prepareRouteSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] === 'NextNodeServer.prepareRoute'
    )
    const matchRouteSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] === 'NextNodeServer.matchRoute'
    )
    const resolveRouteSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] === 'NextNodeServer.resolveRoute'
    )
    const matchDevelopmentRouteSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] ===
        'DevRouteMatcherManager.matchDevelopmentRoute'
    )
    const ensureRouteSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] ===
        'DevRouteMatcherManager.ensureRoute'
    )
    const compileRouteSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] ===
          'DevBundlerService.ensurePage' &&
        span.parentSpanId === ensureRouteSpan?.spanId
    )
    const reloadMatchersSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] ===
        'DevRouteMatcherManager.reloadMatchers'
    )
    const matchProductionRouteSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] ===
        'DevRouteMatcherManager.matchProductionRoute'
    )
    expect(request).toBeDefined()
    expect(requestSpan).toBeDefined()
    expect(handlerSpan).toBeDefined()
    expect(prepareSpan).toBeDefined()
    expect(dispatchSpan).toBeDefined()
    expect(prepareRouteSpan).toBeDefined()
    expect(matchRouteSpan).toBeDefined()
    expect(resolveRouteSpan).toBeDefined()
    expect(matchDevelopmentRouteSpan).toBeDefined()
    expect(ensureRouteSpan).toBeDefined()
    expect(compileRouteSpan).toBeDefined()
    expect(compileRouteSpan!.parentSpanId).toBe(ensureRouteSpan!.spanId)
    expect(reloadMatchersSpan).toBeDefined()
    expect(matchProductionRouteSpan).toBeDefined()
    expect(baseRenderSpan).toBeDefined()
    expect(renderSpan).toBeDefined()
    expect(renderWithComponentsSpan).toBeDefined()
    expect(prepareResponseSpan).toBeDefined()
    expect(getIncrementalCacheSpan).toBeDefined()
    expect(resolvePrerenderingSpan).toBeDefined()
    expect(prepareRouteHandlerSpan).toBeDefined()
    expect(executeRouteHandlerSpan).toBeDefined()
    expect(prepareAppPageResponseSpan).toBeDefined()
    expect(initializeAppRenderSpan).toBeDefined()
    expect(buildComponentTreeSpan).toBeDefined()
    expect(finalizeRSCPayloadSpan).toBeDefined()
    if (!isCacheComponentsEnabled) {
      expect(startRSCStreamSpan).toBeDefined()
    }
    expect(renderRSCResponseSpan).toBeDefined()
    expect(waitForRSCSpan).toBeDefined()
    expect(prepareHTMLRenderSpan).toBeDefined()
    expect(renderToNodeFizzStreamSpan).toBeDefined()
    expect(waitForHTMLCompletionSpan).toBeDefined()
    expect(renderToReadableStreamSpan).toBeDefined()
    expect(waitShellReadySpan).toBeDefined()
    expect(waitForFizzRenderTaskSpan).toBeDefined()
    expect(pipeFizzStreamSpan).toBeDefined()
    expect(waitForFizzFlushSpan).toBeDefined()
    expect(createHTMLTransformsSpan).toBeDefined()
    expect(waitForFirstResponseChunkSpan).toBeDefined()
    expect(startResponseSpan).toBeDefined()
    expect(
      request!.spans.every((span) => {
        const category = span.attributes?.['next.span.category']
        return category === 'nextjs' || category === 'application'
      })
    ).toBe(true)
    expect(requestSpan!.attributes?.['next.span.category']).toBe('nextjs')
    expect(renderRSCResponseSpan!.parentSpanId).toBe(renderSpan!.spanId)
    expect(waitForHTMLCompletionSpan!.parentSpanId).toBe(renderSpan!.spanId)
    expect(request!.startTime).toBe(requestSpan!.startTime)
    expect(request!.durationMs).toBeCloseTo(requestSpan!.durationMs!, 3)
    expect(requestSpan!.startTime).toBeLessThanOrEqual(renderSpan!.startTime)
    expect(handlerSpan!.startTime).toBeLessThanOrEqual(renderSpan!.startTime)
    expect(
      handlerSpan!.startTime + handlerSpan!.durationMs!
    ).toBeGreaterThanOrEqual(renderSpan!.startTime + renderSpan!.durationMs!)
    expect(prepareSpan!.startTime - handlerSpan!.startTime).toBeLessThan(
      maxSpanBoundaryGapMs
    )
    expect(prepareSpan!.startTime).toBeLessThanOrEqual(dispatchSpan!.startTime)
    expect(
      dispatchSpan!.startTime -
        (prepareSpan!.startTime + prepareSpan!.durationMs!)
    ).toBeLessThan(maxSpanBoundaryGapMs)
    expect(dispatchSpan!.startTime).toBeLessThanOrEqual(renderSpan!.startTime)
    expect(prepareRouteSpan!.startTime - dispatchSpan!.startTime).toBeLessThan(
      maxSpanBoundaryGapMs
    )
    expect(
      matchRouteSpan!.startTime -
        (prepareRouteSpan!.startTime + prepareRouteSpan!.durationMs!)
    ).toBeLessThan(maxSpanBoundaryGapMs)
    expect(
      resolveRouteSpan!.startTime -
        (matchRouteSpan!.startTime + matchRouteSpan!.durationMs!)
    ).toBeLessThan(maxSpanBoundaryGapMs)
    expect(
      matchDevelopmentRouteSpan!.startTime - matchRouteSpan!.startTime
    ).toBeLessThan(maxSpanBoundaryGapMs)
    expect(
      ensureRouteSpan!.startTime -
        (matchDevelopmentRouteSpan!.startTime +
          matchDevelopmentRouteSpan!.durationMs!)
    ).toBeLessThan(maxSpanBoundaryGapMs)
    expect(
      reloadMatchersSpan!.startTime -
        (ensureRouteSpan!.startTime + ensureRouteSpan!.durationMs!)
    ).toBeLessThan(maxSpanBoundaryGapMs)
    expect(
      matchProductionRouteSpan!.startTime -
        (reloadMatchersSpan!.startTime + reloadMatchersSpan!.durationMs!)
    ).toBeLessThan(maxSpanBoundaryGapMs)
    expect(
      baseRenderSpan!.startTime -
        (resolveRouteSpan!.startTime + resolveRouteSpan!.durationMs!)
    ).toBeLessThan(maxSpanBoundaryGapMs)
    expect(
      prepareResponseSpan!.startTime - renderWithComponentsSpan!.startTime
    ).toBeLessThan(maxSpanBoundaryGapMs)
    expect(
      getIncrementalCacheSpan!.startTime -
        (prepareResponseSpan!.startTime + prepareResponseSpan!.durationMs!)
    ).toBeLessThan(maxSpanBoundaryGapMs)
    expect(
      resolvePrerenderingSpan!.startTime -
        (getIncrementalCacheSpan!.startTime +
          getIncrementalCacheSpan!.durationMs!)
    ).toBeLessThan(maxSpanBoundaryGapMs)
    expect(
      prepareRouteHandlerSpan!.startTime -
        (resolvePrerenderingSpan!.startTime +
          resolvePrerenderingSpan!.durationMs!)
    ).toBeLessThan(maxSpanBoundaryGapMs)
    expect(
      executeRouteHandlerSpan!.startTime -
        (prepareRouteHandlerSpan!.startTime +
          prepareRouteHandlerSpan!.durationMs!)
    ).toBeLessThan(maxSpanBoundaryGapMs)
    expect(executeRouteHandlerSpan!.startTime).toBeLessThanOrEqual(
      renderSpan!.startTime
    )
    expect(
      prepareAppPageResponseSpan!.startTime - executeRouteHandlerSpan!.startTime
    ).toBeLessThan(maxSpanBoundaryGapMs)
    expect(
      initializeAppRenderSpan!.startTime -
        (prepareAppPageResponseSpan!.startTime +
          prepareAppPageResponseSpan!.durationMs!)
    ).toBeLessThan(maxSpanBoundaryGapMs)
    expect(
      renderSpan!.startTime -
        (initializeAppRenderSpan!.startTime +
          initializeAppRenderSpan!.durationMs!)
    ).toBeLessThan(maxSpanBoundaryGapMs)
    expect(
      finalizeRSCPayloadSpan!.startTime -
        (buildComponentTreeSpan!.startTime +
          buildComponentTreeSpan!.durationMs!)
    ).toBeLessThan(maxSpanBoundaryGapMs)
    if (startRSCStreamSpan) {
      expect(
        startRSCStreamSpan.startTime -
          (finalizeRSCPayloadSpan!.startTime +
            finalizeRSCPayloadSpan!.durationMs!)
      ).toBeLessThan(maxSpanBoundaryGapMs)
      expect(
        waitForRSCSpan!.startTime -
          (startRSCStreamSpan.startTime + startRSCStreamSpan.durationMs!)
      ).toBeLessThan(maxSpanBoundaryGapMs)
    }
    expect(
      prepareHTMLRenderSpan!.startTime -
        (waitForRSCSpan!.startTime + waitForRSCSpan!.durationMs!)
    ).toBeLessThan(maxSpanBoundaryGapMs)
    expect(
      renderToNodeFizzStreamSpan!.startTime -
        (prepareHTMLRenderSpan!.startTime + prepareHTMLRenderSpan!.durationMs!)
    ).toBeLessThan(maxSpanBoundaryGapMs)
    expect(
      waitForFizzRenderTaskSpan!.startTime -
        (waitShellReadySpan!.startTime + waitShellReadySpan!.durationMs!)
    ).toBeLessThan(maxSpanBoundaryGapMs)
    expect(
      pipeFizzStreamSpan!.startTime -
        (waitForFizzRenderTaskSpan!.startTime +
          waitForFizzRenderTaskSpan!.durationMs!)
    ).toBeLessThan(maxSpanBoundaryGapMs)
    expect(
      waitForFizzFlushSpan!.startTime -
        (pipeFizzStreamSpan!.startTime + pipeFizzStreamSpan!.durationMs!)
    ).toBeLessThan(maxSpanBoundaryGapMs)
    expect(
      createHTMLTransformsSpan!.startTime -
        (waitForFizzFlushSpan!.startTime + waitForFizzFlushSpan!.durationMs!)
    ).toBeLessThan(maxSpanBoundaryGapMs)
    expect(
      waitForFirstResponseChunkSpan!.startTime -
        (createHTMLTransformsSpan!.startTime +
          createHTMLTransformsSpan!.durationMs!)
    ).toBeLessThan(maxSpanBoundaryGapMs)
    expect(
      startResponseSpan!.startTime -
        (waitForFirstResponseChunkSpan!.startTime +
          waitForFirstResponseChunkSpan!.durationMs!)
    ).toBeLessThan(maxSpanBoundaryGapMs)
    expect(
      executeRouteHandlerSpan!.startTime + executeRouteHandlerSpan!.durationMs!
    ).toBeGreaterThanOrEqual(renderSpan!.startTime + renderSpan!.durationMs!)
    expect(
      dispatchSpan!.startTime + dispatchSpan!.durationMs!
    ).toBeGreaterThanOrEqual(renderSpan!.startTime + renderSpan!.durationMs!)
    expect(
      requestSpan!.startTime + requestSpan!.durationMs!
    ).toBeGreaterThanOrEqual(renderSpan!.startTime + renderSpan!.durationMs!)
    expect(
      request!.spans.map((span) => span.attributes?.['next.span_type'])
    ).toEqual(
      expect.arrayContaining([
        'BaseServer.handleRequestImpl',
        'BaseServer.prepareRequest',
        'BaseServer.dispatchRequest',
        'NextNodeServer.prepareRoute',
        'NextNodeServer.matchRoute',
        'NextNodeServer.resolveRoute',
        'DevRouteMatcherManager.matchDevelopmentRoute',
        'DevRouteMatcherManager.ensureRoute',
        'DevBundlerService.ensurePage',
        'DevRouteMatcherManager.reloadMatchers',
        'DevRouteMatcherManager.matchProductionRoute',
        'BaseServer.render',
        'BaseServer.pipe',
        'BaseServer.renderToResponse',
        'BaseServer.renderToResponseWithComponents',
        'BaseServer.prepareResponseWithComponents',
        'BaseServer.getIncrementalCache',
        'BaseServer.resolvePrerendering',
        'BaseServer.prepareRouteHandler',
        'BaseServer.executeRouteHandler',
        'AppRender.prepareAppPageResponse',
        'AppRender.initializeRender',
        'AppRender.finalizeRSCPayload',
        ...(isCacheComponentsEnabled ? [] : ['AppRender.startRSCStream']),
        'AppRender.renderRSCResponse',
        'AppRender.waitForRSC',
        'AppRender.prepareHTMLRender',
        'AppRender.renderToNodeFizzStream',
        'AppRender.waitForHTMLCompletion',
        'AppRender.waitShellReady',
        'AppRender.waitForFizzRenderTask',
        'AppRender.pipeFizzStream',
        'AppRender.waitForFizzFlush',
        'AppRender.createHTMLTransforms',
        'NextNodeServer.waitForFirstResponseChunk',
        'NextNodeServer.startResponse',
        'LoadComponents.loadComponents',
      ])
    )
    expect(
      request!.spans.some(
        (span) =>
          span.attributes?.['next.span_type'] ===
          'NextNodeServer.clientComponentLoading'
      )
    ).toBe(false)
  })

  it('tracks RSC rendering and HTML completion across Suspense', async () => {
    await next.render('/suspense')

    const snapshot = (await next
      .fetch('/_next/development/request-insights')
      .then((response) => response.json())) as {
      requests: RequestInsight[]
    }
    const request = snapshot.requests.findLast(
      (insight) => insight.route === '/suspense'
    )
    const renderSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] === 'AppRender.getBodyResult'
    )
    const renderRSCResponseSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] === 'AppRender.renderRSCResponse' &&
        span.parentSpanId === renderSpan?.spanId
    )
    const renderHTMLShellSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] ===
          'AppRender.renderToNodeFizzStream' &&
        span.parentSpanId === renderSpan?.spanId
    )
    const waitForHTMLCompletionSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] ===
          'AppRender.waitForHTMLCompletion' &&
        span.parentSpanId === renderSpan?.spanId
    )

    expect(renderSpan).toBeDefined()
    expect(renderRSCResponseSpan).toBeDefined()
    expect(renderHTMLShellSpan).toBeDefined()
    expect(waitForHTMLCompletionSpan).toBeDefined()
    expect(renderRSCResponseSpan!.durationMs).toBeGreaterThanOrEqual(150)
    expect(waitForHTMLCompletionSpan!.durationMs).toBeGreaterThanOrEqual(150)
    expect(renderHTMLShellSpan!.durationMs).toBeLessThan(
      renderRSCResponseSpan!.durationMs!
    )
    expect(
      Math.abs(
        waitForHTMLCompletionSpan!.startTime +
          waitForHTMLCompletionSpan!.durationMs! -
          (renderSpan!.startTime + renderSpan!.durationMs!)
      )
    ).toBeLessThan(5)
  })

  it('attributes delayed server component work to RSC rendering', async () => {
    await next.render('/delayed')

    const snapshot = (await next
      .fetch('/_next/development/request-insights')
      .then((response) => response.json())) as {
      requests: RequestInsight[]
    }
    const request = snapshot.requests.findLast(
      (insight) => insight.route === '/delayed'
    )
    const renderSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] === 'AppRender.getBodyResult'
    )
    const renderRSCResponseSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] === 'AppRender.renderRSCResponse' &&
        span.parentSpanId === renderSpan?.spanId
    )
    const renderHTMLShellSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] ===
          'AppRender.renderToNodeFizzStream' &&
        span.parentSpanId === renderSpan?.spanId
    )

    expect(renderRSCResponseSpan).toBeDefined()
    expect(renderHTMLShellSpan).toBeDefined()
    expect(renderRSCResponseSpan!.durationMs).toBeGreaterThanOrEqual(150)
    expect(renderHTMLShellSpan!.durationMs).toBeGreaterThanOrEqual(150)
  })

  it('identifies client-dispatched Server Actions without retaining arguments', async () => {
    const browser = await next.browser('/actions')

    await browser.elementById('delayed-action').click()
    await retry(async () => {
      expect(await browser.elementById('action-result').text()).toStartWith(
        'delayed:'
      )
    })
    await next.fetch('/actions', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'ordinary POST body',
    })

    const snapshot = (await next
      .fetch('/_next/development/request-insights')
      .then((response) => response.json())) as {
      requests: RequestInsight[]
    }
    const request = snapshot.requests.findLast(
      (insight) => insight.serverAction?.name === 'delayedAction'
    )
    const actionSpan = request?.spans.find(
      (span) =>
        span.attributes?.['next.span_type'] === 'AppRender.executeServerAction'
    )
    const ordinaryPostRequest = snapshot.requests.findLast(
      (insight) =>
        insight.route === '/actions' &&
        insight.serverAction === undefined &&
        insight.spans.some(
          (span) => span.attributes?.['http.method'] === 'POST'
        )
    )

    expect(request).toBeDefined()
    expect(ordinaryPostRequest).toBeDefined()
    expect(request!.route).toBe('/actions')
    expect(request!.serverAction).toEqual({
      name: 'delayedAction',
      file: 'app/actions/actions.ts',
      durationMs: expect.any(Number),
      status: 'ok',
    })
    expect(request!.serverAction!.durationMs).toBeGreaterThanOrEqual(180)
    expect(actionSpan).toEqual(
      expect.objectContaining({
        name: 'AppRender.executeServerAction',
        status: 'ok',
        attributes: expect.objectContaining({
          'next.span.category': 'application',
          'next.span_name': 'run Server Action delayedAction',
          'next.span_type': 'AppRender.executeServerAction',
          'next.server_action.name': 'delayedAction',
          'next.server_action.file': 'app/actions/actions.ts',
        }),
      })
    )
    expect(
      request!.spans.some((span) => span.spanId === actionSpan?.parentSpanId)
    ).toBe(true)

    const serializedRequest = JSON.stringify(request)
    expect(serializedRequest).not.toContain('super-secret-action-argument')
    expect(serializedRequest).not.toContain('actionId')
    expect(request!.serverAction).not.toHaveProperty('args')

    const command = await next.runCommand([
      'experimental-request-insights',
      '--limit',
      '100',
    ])
    expect(command.code).toBe(0)
    expect(command.stdout).toContain('server action delayedAction')
    expect(command.stdout).toContain('app/actions/actions.ts')
    expect(next.cliOutput).not.toContain('└─ ƒ delayedAction')
  })

  it('identifies default, inline, successful control-flow, and failed actions', async () => {
    const browser = await next.browser('/actions')

    await browser.elementById('default-action').click()
    await retry(async () => {
      expect(await browser.elementById('action-result').text()).toBe(
        'default action complete'
      )
    })

    await browser.elementById('inline-action').click()
    await retry(async () => {
      expect(await browser.elementById('action-result').text()).toBe(
        'inline action complete'
      )
    })

    await browser.elementById('error-action').click()
    await retry(async () => {
      expect(await browser.elementById('action-result').text()).toBe(
        'action failed'
      )
    })

    const progressiveBrowser = await next.browser('/actions', {
      disableJavaScript: true,
    })
    await progressiveBrowser.elementById('progressive-action').click()
    await retry(async () => {
      expect(await progressiveBrowser.url()).toBe(
        `${next.url}/actions?progressive=done`
      )
    })

    const snapshot = (await next
      .fetch('/_next/development/request-insights')
      .then((response) => response.json())) as {
      requests: RequestInsight[]
    }
    const defaultRequest = snapshot.requests.findLast(
      (insight) => insight.serverAction?.name === 'default'
    )
    const inlineRequest = snapshot.requests.findLast(
      (insight) => insight.serverAction?.name === '<inline action>'
    )
    const errorRequest = snapshot.requests.findLast(
      (insight) => insight.serverAction?.name === 'errorAction'
    )
    const progressiveRequest = snapshot.requests.findLast(
      (insight) => insight.serverAction?.name === 'progressiveAction'
    )

    expect(defaultRequest?.serverAction).toEqual(
      expect.objectContaining({
        name: 'default',
        file: 'app/actions/actions.ts',
        status: 'ok',
      })
    )
    expect(inlineRequest?.serverAction).toEqual(
      expect.objectContaining({
        name: '<inline action>',
        file: 'app/actions/page.tsx',
        status: 'ok',
      })
    )
    expect(errorRequest?.serverAction).toEqual(
      expect.objectContaining({
        name: 'errorAction',
        file: 'app/actions/actions.ts',
        status: 'error',
      })
    )
    expect(progressiveRequest?.serverAction).toEqual(
      expect.objectContaining({
        name: 'progressiveAction',
        file: 'app/actions/actions.ts',
        status: 'ok',
      })
    )
  })

  it('uses the development endpoint and reports truncated output', async () => {
    const { result, requestedPaths } = await runWithResponse(
      {
        requests: [createRequest(1), createRequest(2), createRequest(3, 7)],
      },
      ['--limit', '1']
    )

    expect(result.code).toBe(0)
    expect(requestedPaths).toEqual(['/_next/development/request-insights'])
    expect(result.stdout).toContain(
      'Showing 1 of 3 retained requests (newest first).'
    )
    expect(result.stdout).toContain('/route-3')
    expect(result.stdout).not.toContain('/route-2')
    expect(result.stdout).toContain('showing first 5 of 7 fetches')
    expect(result.stdout).toContain('https://example.com/fetch-4')
    expect(result.stdout).not.toContain('https://example.com/fetch-5')
  })

  it.each(['localhost:3000', 'https://[', 'ftp://localhost:3000'])(
    'rejects invalid dev server URL %s',
    async (url) => {
      const result = await next.runCommand([
        'experimental-request-insights',
        '--url',
        url,
      ])

      expect(result.code).toBe(1)
      expect(result.stderr).toContain(
        `Invalid dev server URL "${url}". Pass a valid HTTP or HTTPS URL.`
      )
    }
  )

  it.each([
    { body: { requests: null }, args: ['--json'] },
    { body: { requests: [{ fetches: null }] }, args: [] },
  ])('rejects malformed responses', async ({ body, args }) => {
    const { result } = await runWithResponse(body, args)

    expect(result.code).toBe(1)
    expect(result.stderr).toContain(
      'expected requests and fetches to be arrays'
    )
  })
})
