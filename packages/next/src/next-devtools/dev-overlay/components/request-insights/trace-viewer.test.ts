import {
  REQUEST_INSIGHT_REQUEST_SPAN_TYPE,
  type RequestInsight,
} from '../../../shared/request-insights'
import { getRequestInsightFilterResult } from './request-filters'
import {
  getActiveRequestKey,
  getRequestInsightRowType,
  getRequestListEntries,
  isPageLoadRequest,
} from './request-list'
import { getTraceItems, getTracePosition, getTraceRange } from './trace-viewer'

function createRequest(
  overrides: Partial<RequestInsight> = {}
): RequestInsight {
  return {
    requestId: 'request-1',
    source: 'unknown',
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

    expect(getActiveRequestKey([selectedRequest], null)).toBe(
      'request:selected'
    )
    expect(
      getActiveRequestKey([newerRequest, selectedRequest], 'request:selected')
    ).toBe('request:selected')
    expect(getActiveRequestKey([newerRequest], 'request:selected')).toBe(
      'request:newer'
    )
  })

  it('selects request and Instant Insights items independently', () => {
    const request = createRequest({ requestId: 'shared' })
    const instantInsights = createRequest({
      requestId: 'shared',
      kind: 'instant-insights',
    })

    expect(
      getActiveRequestKey([request, instantInsights], 'instant-insights:shared')
    ).toBe('instant-insights:shared')
  })

  it('hides internal records from the request list by default', () => {
    const request = createRequest({ requestId: 'shared' })
    const instantInsights = createRequest({
      requestId: 'shared',
      kind: 'instant-insights',
    })

    expect(getRequestListEntries([instantInsights, request], false)).toEqual([
      { request, nested: false },
    ])
  })

  it('nests internal records under their owning request', () => {
    const newerRequest = createRequest({ requestId: 'newer' })
    const olderRequest = createRequest({ requestId: 'older' })
    const newerInstantInsights = createRequest({
      requestId: 'newer',
      kind: 'instant-insights',
    })
    const olderInstantInsights = createRequest({
      requestId: 'older',
      kind: 'instant-insights',
    })

    expect(
      getRequestListEntries(
        [
          newerInstantInsights,
          newerRequest,
          olderInstantInsights,
          olderRequest,
        ],
        true
      )
    ).toEqual([
      { request: newerRequest, nested: false },
      { request: newerInstantInsights, nested: true },
      { request: olderRequest, nested: false },
      { request: olderInstantInsights, nested: true },
    ])
  })

  it('keeps internal records without a retained owner at the root', () => {
    const instantInsights = createRequest({
      requestId: 'orphan',
      kind: 'instant-insights',
    })

    expect(getRequestListEntries([instantInsights], true)).toEqual([
      { request: instantInsights, nested: false },
    ])
  })

  it('labels and filters normalized request activity', () => {
    const requestSpan = (rsc: boolean) => ({
      name: 'GET',
      startTime: 100,
      attributes: {
        'next.span_type': REQUEST_INSIGHT_REQUEST_SPAN_TYPE,
        'next.rsc': rsc,
      },
    })
    const page = createRequest({
      requestId: 'page',
      source: 'page',
      spans: [requestSpan(false)],
      fetches: [{ cacheStatus: 'miss' }],
    })
    const rsc = createRequest({
      requestId: 'rsc',
      source: 'page',
      spans: [requestSpan(true)],
    })
    const api = createRequest({ requestId: 'api', source: 'app-route' })
    const asset = createRequest({ requestId: 'asset', source: 'asset' })

    expect(getRequestInsightRowType(page, true).label).toBe('Page load')
    expect(getRequestInsightRowType(rsc).label).toBe('RSC')
    expect(getRequestInsightRowType(api).label).toBe('API')
    expect(getRequestInsightRowType(asset).label).toBe('Asset')
    expect(
      getRequestInsightFilterResult(
        [page, rsc, api],
        ['source:page', 'cache:miss']
      ).requests
    ).toEqual([page])
    expect(
      getRequestInsightFilterResult([page, rsc, api, asset], ['source:api'])
        .requests
    ).toEqual([api])
    expect(
      getRequestInsightFilterResult([page, rsc, api, asset], ['source:asset'])
        .requests
    ).toEqual([asset])
  })

  it('only marks the exact initial document request as the page load', () => {
    const initialRequestId = 'document-request'
    const htmlSpan = {
      name: 'GET',
      startTime: 100,
      attributes: {
        'next.span_type': REQUEST_INSIGHT_REQUEST_SPAN_TYPE,
        'next.rsc': false,
      },
    }
    const rscSpan = {
      ...htmlSpan,
      attributes: { ...htmlSpan.attributes, 'next.rsc': true },
    }

    expect(
      isPageLoadRequest(
        createRequest({
          requestId: 'server-owned-request',
          source: 'page',
          htmlRequestId: initialRequestId,
          spans: [htmlSpan],
        }),
        initialRequestId
      )
    ).toBe(true)
    expect(
      isPageLoadRequest(
        createRequest({
          requestId: 'related-rsc-request',
          source: 'page',
          htmlRequestId: initialRequestId,
          spans: [rscSpan],
        }),
        initialRequestId
      )
    ).toBe(false)
    expect(
      isPageLoadRequest(
        createRequest({
          requestId: initialRequestId,
          source: 'instant-insights',
          kind: 'instant-insights',
          spans: [htmlSpan],
        }),
        initialRequestId
      )
    ).toBe(false)
  })

  it('shows the Instant Insights pipeline in the default trace', () => {
    const request = createRequest({
      kind: 'instant-insights',
      spans: [
        {
          name: 'Instant Insights',
          spanId: 'root',
          startTime: 100,
          durationMs: 50,
          attributes: {
            'next.span_type': 'AppRender.instantInsights',
          },
        },
        {
          name: 'Prepare validation inputs',
          spanId: 'prepare',
          parentSpanId: 'root',
          startTime: 105,
          durationMs: 20,
          attributes: {
            'next.span_type': 'AppRender.instantInsights.prepareValidation',
          },
        },
        {
          name: 'Run validation',
          spanId: 'validate',
          parentSpanId: 'root',
          startTime: 125,
          durationMs: 20,
          attributes: {
            'next.span_type': 'AppRender.instantInsights.runValidation',
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
      { label: 'Instant Insights', depth: 0 },
      { label: 'Prepare validation inputs', depth: 1 },
      { label: 'Run validation', depth: 1 },
    ])
  })

  it('uses Proxy terminology without changing the recorded OTel span', () => {
    const middlewareSpan = {
      name: 'middleware POST',
      startTime: 100,
      durationMs: 10,
      attributes: {
        'http.method': 'POST',
        'next.span_name': 'middleware POST',
        'next.span_type': 'Middleware.execute',
      },
    }
    const request = createRequest({ spans: [middlewareSpan] })

    expect(getTraceItems(request, false)[0]?.label).toBe('proxy POST')
    expect(middlewareSpan).toEqual(
      expect.objectContaining({
        name: 'middleware POST',
        attributes: expect.objectContaining({
          'next.span_name': 'middleware POST',
          'next.span_type': 'Middleware.execute',
        }),
      })
    )
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

  it('filters collected spans for presentation without changing collection', () => {
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
          name: 'prepare route',
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
          name: 'reload route matchers',
          spanId: 'reload-matchers',
          parentSpanId: 'match',
          startTime: 109,
          durationMs: 1,
          attributes: {
            'next.span_type': 'DevRouteMatcherManager.reloadMatchers',
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
      { label: 'prepare route', depth: 2 },
      { label: 'compile route', depth: 3 },
      { label: 'reload route matchers', depth: 2 },
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
      'prepare route',
      'compile route',
      'reload route matchers',
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
            'next.span_category': 'nextjs',
            'next.span_type': 'BaseServer.render',
          },
        },
        {
          name: 'generateMetadata /',
          startTime: 110,
          durationMs: 10,
          attributes: {
            'next.span_category': 'application',
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
            'next.span_category': 'application',
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
            'next.span_category': 'nextjs',
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
