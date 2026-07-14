import type { RequestInsight } from '../../../shared/request-insights'
import { getActiveRequestId, isPageLoadRequest } from './request-list'
import { getTraceItems, getTracePosition, getTraceRange } from './trace-viewer'

function createRequest(
  overrides: Partial<RequestInsight> = {}
): RequestInsight {
  return {
    requestId: 'request-1',
    htmlRequestId: 'html-1',
    startTime: 100,
    durationMs: 100,
    status: 'ok',
    spans: [],
    fetches: [],
    ...overrides,
  }
}

describe('request insights trace viewer', () => {
  it('keeps the active request selected when newer requests arrive', () => {
    const selectedRequest = createRequest({ requestId: 'selected' })
    const newerRequest = createRequest({ requestId: 'newer' })

    expect(getActiveRequestId([selectedRequest], null)).toBe('selected')
    expect(
      getActiveRequestId([newerRequest, selectedRequest], 'selected')
    ).toBe('selected')
    expect(getActiveRequestId([newerRequest], 'selected')).toBe('newer')
  })

  it('only marks the exact initial document request as the page load', () => {
    const initialRequestId = 'document-request'

    expect(
      isPageLoadRequest(
        createRequest({
          requestId: initialRequestId,
          htmlRequestId: initialRequestId,
        }),
        initialRequestId
      )
    ).toBe(true)
    expect(
      isPageLoadRequest(
        createRequest({
          requestId: 'related-rsc-request',
          htmlRequestId: initialRequestId,
        }),
        initialRequestId
      )
    ).toBe(false)
  })

  it('orders spans by their recorded parent-child hierarchy', () => {
    const request = createRequest({
      spans: [
        {
          name: 'second child',
          spanId: 'child-2',
          parentSpanId: 'root',
          startTime: 150,
          durationMs: 20,
        },
        {
          name: 'grandchild',
          spanId: 'grandchild',
          parentSpanId: 'child-1',
          startTime: 115,
          durationMs: 5,
        },
        {
          name: 'root',
          spanId: 'root',
          startTime: 100,
          durationMs: 100,
        },
        {
          name: 'first child',
          spanId: 'child-1',
          parentSpanId: 'root',
          startTime: 110,
          durationMs: 30,
        },
      ],
    })

    expect(
      getTraceItems(request, true).map(({ label, depth }) => ({
        label,
        depth,
      }))
    ).toEqual([
      { label: 'root', depth: 0 },
      { label: 'first child', depth: 1 },
      { label: 'grandchild', depth: 2 },
      { label: 'second child', depth: 1 },
    ])
  })

  it('shows high-level spans by default and reveals hidden spans in verbose mode', () => {
    const request = createRequest({
      spans: [
        {
          name: 'GET',
          spanId: 'root',
          startTime: 100,
          durationMs: 100,
          attributes: { 'next.span_type': 'BaseServer.handleRequest' },
        },
        {
          name: 'prepare request',
          spanId: 'prepare',
          parentSpanId: 'root',
          startTime: 101,
          durationMs: 5,
          attributes: { 'next.span_type': 'BaseServer.prepareRequest' },
        },
        {
          name: 'match route',
          spanId: 'match',
          parentSpanId: 'prepare',
          startTime: 106,
          durationMs: 5,
          attributes: { 'next.span_type': 'NextNodeServer.matchRoute' },
        },
        {
          name: 'compile and prepare route',
          spanId: 'ensure',
          parentSpanId: 'match',
          startTime: 107,
          durationMs: 2,
          attributes: {
            'next.span_type': 'DevRouteMatcherManager.ensureRoute',
          },
        },
        {
          name: 'compile route',
          spanId: 'compile-route',
          parentSpanId: 'ensure',
          startTime: 107.1,
          durationMs: 1.5,
          attributes: {
            'next.span_type': 'DevBundlerService.ensurePage',
          },
        },
        {
          name: 'render',
          spanId: 'base-render',
          parentSpanId: 'match',
          startTime: 110,
          durationMs: 85,
          attributes: { 'next.span_type': 'BaseServer.render' },
        },
        {
          name: 'resolve page components',
          spanId: 'resolve-page-components',
          parentSpanId: 'base-render',
          startTime: 110.1,
          durationMs: 2,
          attributes: {
            'next.span_type': 'NextNodeServer.findPageComponents',
          },
        },
        {
          name: 'LoadComponents.loadComponents',
          spanId: 'load-components',
          parentSpanId: 'resolve-page-components',
          startTime: 110.2,
          durationMs: 1,
          attributes: {
            'next.span_type': 'LoadComponents.loadComponents',
          },
        },
        {
          name: 'prepare app page response',
          spanId: 'prepare-app-page',
          parentSpanId: 'base-render',
          startTime: 111,
          durationMs: 1,
          attributes: {
            'next.span_type': 'AppRender.prepareAppPageResponse',
          },
        },
        {
          name: 'initialize app render',
          spanId: 'initialize-app-render',
          parentSpanId: 'base-render',
          startTime: 112,
          durationMs: 1,
          attributes: { 'next.span_type': 'AppRender.initializeRender' },
        },
        {
          name: 'render route (app) /',
          spanId: 'render',
          parentSpanId: 'base-render',
          startTime: 113,
          durationMs: 80,
          attributes: { 'next.span_type': 'AppRender.getBodyResult' },
        },
        {
          name: 'render RSC response',
          spanId: 'render-rsc',
          parentSpanId: 'render',
          startTime: 113.5,
          durationMs: 75,
          attributes: { 'next.span_type': 'AppRender.renderRSCResponse' },
        },
        {
          name: 'wait for RSC render task',
          spanId: 'wait-rsc',
          parentSpanId: 'render',
          startTime: 114,
          durationMs: 5,
          attributes: { 'next.span_type': 'AppRender.waitForRSC' },
        },
        {
          name: 'render HTML shell',
          spanId: 'render-html-shell',
          parentSpanId: 'render',
          startTime: 120,
          durationMs: 5,
          attributes: {
            'next.span_type': 'AppRender.renderToNodeFizzStream',
          },
        },
        {
          name: 'wait for HTML completion',
          spanId: 'wait-html-completion',
          parentSpanId: 'render',
          startTime: 125,
          durationMs: 65,
          attributes: {
            'next.span_type': 'AppRender.waitForHTMLCompletion',
          },
        },
      ],
    })

    expect(
      getTraceItems(request, false).map(({ label, depth }) => ({
        label,
        depth,
      }))
    ).toEqual([
      { label: 'GET', depth: 0 },
      { label: 'match route', depth: 1 },
      { label: 'compile and prepare route', depth: 2 },
      { label: 'render', depth: 2 },
      { label: 'load components', depth: 3 },
      { label: 'prepare app page response', depth: 3 },
      { label: 'initialize app render', depth: 3 },
      { label: 'render route (app) /', depth: 3 },
      { label: 'render RSC response', depth: 4 },
      { label: 'wait for RSC render task', depth: 4 },
      { label: 'render HTML shell', depth: 4 },
      { label: 'wait for HTML completion', depth: 4 },
    ])
    expect(getTraceItems(request, true).map((item) => item.label)).toEqual([
      'GET',
      'prepare request',
      'match route',
      'compile and prepare route',
      'compile route',
      'render',
      'resolve page components',
      'load components',
      'prepare app page response',
      'initialize app render',
      'render route (app) /',
      'render RSC response',
      'wait for RSC render task',
      'render HTML shell',
      'wait for HTML completion',
    ])
  })

  it('gives every displayed span a human readable name', () => {
    const request = createRequest({
      spans: [
        {
          name: 'AppRender.renderToNodeFizzStream',
          startTime: 100,
          durationMs: 10,
          attributes: {
            'next.span_name': 'AppRender.renderToNodeFizzStream',
            'next.span_type': 'AppRender.renderToNodeFizzStream',
          },
        },
        {
          name: 'AppRender.waitForFizzRenderTask',
          startTime: 110,
          durationMs: 10,
          attributes: {
            'next.span_name': 'wait for Fizz render task',
            'next.span_type': 'AppRender.waitForFizzRenderTask',
          },
        },
        {
          name: 'AppRender.renderToNodeFlightStream',
          startTime: 120,
          durationMs: 10,
          attributes: {
            'next.span_name': 'AppRender.renderToNodeFlightStream',
            'next.span_type': 'AppRender.renderToNodeFlightStream',
          },
        },
        {
          name: 'AppRender.renderToReadableStream',
          startTime: 130,
          durationMs: 10,
          attributes: {
            'next.span_name': 'render HTML stream',
          },
        },
      ],
    })
    const expectedLabels = [
      'render to HTML stream',
      'wait for HTML render task',
      'render to RSC stream',
      'render HTML stream',
    ]

    expect(getTraceItems(request, true).map((item) => item.label)).toEqual(
      expectedLabels
    )
  })

  it('uses exactly Next.js and Application categories', () => {
    const request = createRequest({
      spans: [
        {
          name: 'render',
          startTime: 100,
          durationMs: 10,
          attributes: {
            'next.span.category': 'nextjs',
            'next.span_type': 'BaseServer.render',
          },
        },
        {
          name: 'generateMetadata /',
          startTime: 110,
          durationMs: 10,
          attributes: {
            'next.span.category': 'application',
            'next.span_type': 'ResolveMetadata.generateMetadata',
          },
        },
        {
          name: 'custom database span',
          startTime: 120,
          durationMs: 10,
        },
      ],
    })

    expect(
      getTraceItems(request, true).map(({ label, category }) => ({
        label,
        category,
      }))
    ).toEqual([
      { label: 'render', category: 'nextjs' },
      { label: 'generate metadata /', category: 'application' },
      { label: 'custom database span', category: 'application' },
    ])
  })

  it('merges fetch metrics into the matching fetch span', () => {
    const request = createRequest({
      spans: [
        {
          name: 'root',
          spanId: 'root',
          startTime: 100,
          durationMs: 100,
        },
        {
          name: 'fetch GET https://example.com/api',
          spanId: 'fetch-span',
          parentSpanId: 'root',
          startTime: 120,
          durationMs: 30,
          attributes: {
            'next.span.category': 'application',
            'next.span_type': 'AppRender.fetch',
            'next.fetch.idx': 1,
          },
        },
        {
          name: 'internal fetch GET https://example.com/internal',
          spanId: 'internal-fetch-span',
          parentSpanId: 'root',
          startTime: 155,
          durationMs: 10,
          attributes: {
            'next.span.category': 'nextjs',
            'next.span_type': 'AppRender.fetch',
            'next.fetch.idx': 2,
          },
        },
      ],
      fetches: [
        {
          index: 1,
          method: 'GET',
          url: 'https://example.com/api',
          startTime: 120,
          durationMs: 25,
          cacheStatus: 'miss',
        },
        {
          index: 2,
          method: 'GET',
          url: 'https://example.com/internal',
          startTime: 155,
          durationMs: 10,
          cacheStatus: 'miss',
        },
      ],
    })

    expect(getTraceItems(request, false)).toEqual([
      expect.objectContaining({ label: 'root', depth: 0, kind: 'span' }),
      expect.objectContaining({
        label: 'GET /api',
        depth: 1,
        kind: 'fetch',
        spanId: 'fetch-span',
        durationMs: 25,
        category: 'application',
      }),
      expect.objectContaining({
        label: 'GET /internal',
        depth: 1,
        kind: 'fetch',
        spanId: 'internal-fetch-span',
        durationMs: 10,
        category: 'nextjs',
      }),
    ])
  })

  it('uses the request time range and clips outlier spans', () => {
    const request = createRequest({
      startTime: 100,
      durationMs: 50,
      spans: [
        {
          name: 'early span',
          startTime: 90,
          durationMs: 20,
        },
        {
          name: 'late span',
          startTime: 140,
          durationMs: 30,
        },
      ],
    })
    const items = getTraceItems(request, false)
    const range = getTraceRange(request)

    expect(range).toEqual({ startTime: 100, durationMs: 50 })
    expect(getTracePosition(items[0], range)).toEqual({
      left: 0,
      width: 20,
      offsetMs: 0,
    })
    expect(getTracePosition(items[1], range)).toEqual({
      left: 80,
      width: 20,
      offsetMs: 40,
    })
  })
})
