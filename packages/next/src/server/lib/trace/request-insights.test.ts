import {
  clearRequestInsightsForTest,
  getRequestInsightsSnapshot,
  importRequestInsightSpans,
  recordRequestInsightFetch,
  registerRequestInsightsExporter,
  subscribeRequestInsights,
} from './request-insights'
import { recordSpan } from './span-store'

const originalRequestInsights = process.env.__NEXT_REQUEST_INSIGHTS
const originalDevServer = process.env.__NEXT_DEV_SERVER

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

describe('request insights', () => {
  beforeEach(() => {
    process.env.__NEXT_DEV_SERVER = '1'
    registerRequestInsightsExporter()
  })

  afterEach(() => {
    restoreEnv('__NEXT_REQUEST_INSIGHTS', originalRequestInsights)
    restoreEnv('__NEXT_DEV_SERVER', originalDevServer)
    clearRequestInsightsForTest()
  })

  it('derives request history from local span records', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'

    recordSpan({
      name: 'render route (app) /products/[id]',
      startTime: 100,
      durationMs: 50,
      status: 'ok',
      traceId: 'trace_1',
      spanId: 'span_1',
      requestId: 'req_1',
      htmlRequestId: 'html_1',
      route: '/products/[id]',
      attributes: {
        'next.span_category': 'nextjs',
        'next.span_type': 'AppRender.getBodyResult',
      },
      events: [
        {
          name: 'metadata ready',
          timestamp: 130,
        },
      ],
      links: [
        {
          traceId: 'linked_trace',
          spanId: 'linked_span',
        },
      ],
    })

    recordSpan({
      name: 'fetch GET https://example.vercel.sh/',
      startTime: 120,
      durationMs: 25,
      status: 'ok',
      requestId: 'req_1',
      htmlRequestId: 'html_1',
      route: '/products/[id]',
      attributes: {
        'next.span_category': 'application',
        'next.span_type': 'AppRender.fetch',
        'http.url': 'https://example.vercel.sh/',
        'http.method': 'GET',
        'http.status_code': 200,
        'next.fetch.idx': 1,
        'next.fetch.cache_status': 'skip',
        'next.fetch.cache_reason': 'cache: no-store',
      },
    })

    expect(getRequestInsightsSnapshot()).toEqual({
      requests: [
        expect.objectContaining({
          requestId: 'req_1',
          htmlRequestId: 'html_1',
          route: '/products/[id]',
          durationMs: 50,
          status: 'ok',
          spans: expect.arrayContaining([
            expect.objectContaining({
              name: 'fetch GET https://example.vercel.sh/',
              attributes: expect.objectContaining({
                'next.span_category': 'application',
              }),
            }),
            expect.objectContaining({
              traceId: 'trace_1',
              spanId: 'span_1',
              attributes: expect.objectContaining({
                'next.span_category': 'nextjs',
              }),
              events: [
                {
                  name: 'metadata ready',
                  timestamp: 130,
                },
              ],
              links: [
                {
                  traceId: 'linked_trace',
                  spanId: 'linked_span',
                },
              ],
            }),
          ]),
          fetches: [
            {
              url: 'https://example.vercel.sh/',
              method: 'GET',
              statusCode: 200,
              startTime: 120,
              durationMs: 25,
              cacheStatus: 'skip',
              cacheReason: 'cache: no-store',
              index: 1,
            },
          ],
        }),
      ],
    })
  })

  it('notifies subscribers when a request insight changes', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    const listener = jest.fn()
    const unsubscribe = subscribeRequestInsights(listener)

    recordSpan({
      name: 'render route (app) /dashboard',
      requestId: 'req_2',
      htmlRequestId: 'html_2',
      route: '/dashboard',
    })

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req_2',
        htmlRequestId: 'html_2',
        route: '/dashboard',
      })
    )

    unsubscribe()
  })

  it('imports a worker span batch with the main-thread identity', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    const listener = jest.fn()
    const unsubscribe = subscribeRequestInsights(listener)

    importRequestInsightSpans(
      {
        requestId: 'instant_1',
        kind: 'instant-insights',
        htmlRequestId: 'html_1',
        url: '/dashboard',
      },
      { traceId: 'main-trace', spanId: 'main-parent' },
      {
        spans: [
          {
            name: 'worker root',
            timestamp: 1,
            traceId: 'worker-trace',
            spanId: 'worker-root',
            url: '/worker-only-url',
          },
          {
            name: 'worker child',
            timestamp: 2,
            traceId: 'worker-trace',
            spanId: 'worker-child',
            parentSpanId: 'worker-root',
            links: [
              { traceId: 'worker-trace', spanId: 'worker-root' },
              { traceId: 'external-trace', spanId: 'external-span' },
            ],
          },
          {
            name: 'worker orphan',
            timestamp: 3,
            traceId: 'worker-trace',
            spanId: 'worker-orphan',
            parentSpanId: 'dropped-parent',
          },
        ],
        droppedSpanCount: 1,
      }
    )

    expect(listener).toHaveBeenCalledTimes(1)
    const [request] = getRequestInsightsSnapshot().requests
    const workerRoot = request.spans.find(
      (span) => span.name === 'worker root'
    )!
    const workerChild = request.spans.find(
      (span) => span.name === 'worker child'
    )!
    const workerOrphan = request.spans.find(
      (span) => span.name === 'worker orphan'
    )!

    expect(request).toEqual(
      expect.objectContaining({
        requestId: 'instant_1',
        kind: 'instant-insights',
        htmlRequestId: 'html_1',
        url: '/dashboard',
      })
    )
    expect(workerRoot).toEqual(
      expect.objectContaining({
        traceId: 'main-trace',
        parentSpanId: 'main-parent',
      })
    )
    expect(workerRoot.spanId).not.toBe('worker-root')
    expect(workerChild).toEqual(
      expect.objectContaining({
        traceId: 'main-trace',
        parentSpanId: workerRoot.spanId,
        links: [
          { traceId: 'main-trace', spanId: workerRoot.spanId },
          { traceId: 'external-trace', spanId: 'external-span' },
        ],
      })
    )
    expect(workerOrphan).toEqual(
      expect.objectContaining({
        traceId: 'main-trace',
        parentSpanId: 'main-parent',
      })
    )

    unsubscribe()
  })

  it('uses the HTTP request span as the end-to-end request timing', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'

    recordSpan({
      name: 'render route (app) /dashboard',
      requestId: 'req_timing',
      startTime: 100,
      durationMs: 60,
    })
    recordSpan({
      name: 'GET /dashboard',
      requestId: 'req_timing',
      startTime: 100,
      durationMs: 50,
      attributes: {
        'next.span_type': 'BaseServer.handleRequest',
      },
    })
    recordRequestInsightFetch(
      { requestId: 'req_timing' },
      { url: 'https://example.com/late', startTime: 145, durationMs: 20 }
    )

    expect(getRequestInsightsSnapshot().requests[0]).toEqual(
      expect.objectContaining({
        startTime: 100,
        durationMs: 50,
      })
    )
  })

  it('keeps request and Instant Insights data separate for the same request ID', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    const listener = jest.fn()
    const unsubscribe = subscribeRequestInsights(listener)

    recordSpan({
      name: 'GET /dashboard',
      requestId: 'req_shared',
      htmlRequestId: 'html_shared',
      route: '/dashboard',
      startTime: 100,
      durationMs: 40,
      status: 'ok',
      attributes: {
        'next.span_type': 'BaseServer.handleRequest',
      },
    })
    recordSpan({
      name: 'Instant Insights',
      requestId: 'req_shared',
      requestInsightKind: 'instant-insights',
      htmlRequestId: 'html_shared',
      route: '/dashboard',
      startTime: 150,
      durationMs: 75,
      status: 'ok',
      attributes: {
        'next.span_type': 'AppRender.instantInsights',
      },
    })
    recordRequestInsightFetch(
      {
        requestId: 'req_shared',
        kind: 'instant-insights',
        htmlRequestId: 'html_shared',
        route: '/dashboard',
      },
      {
        url: 'https://example.com/validation-data',
        startTime: 175,
        durationMs: 10,
      }
    )

    expect(getRequestInsightsSnapshot().requests).toEqual([
      expect.objectContaining({
        requestId: 'req_shared',
        kind: 'request',
        startTime: 100,
        durationMs: 40,
        fetches: [],
      }),
      expect.objectContaining({
        requestId: 'req_shared',
        kind: 'instant-insights',
        startTime: 150,
        durationMs: 75,
        fetches: [
          expect.objectContaining({
            url: 'https://example.com/validation-data',
          }),
        ],
      }),
    ])
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'request' })
    )
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'instant-insights' })
    )

    unsubscribe()
  })

  it('does not treat aggregate client component loading as a trace span', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'

    recordSpan({
      name: 'NextNodeServer.clientComponentLoading',
      requestId: 'req_client_loading',
      startTime: 100,
      durationMs: 50,
      attributes: {
        'next.span_type': 'NextNodeServer.clientComponentLoading',
      },
    })

    expect(getRequestInsightsSnapshot().requests).toEqual([])
  })

  it('records request fetch metrics when the OTel fetch span does not complete locally', () => {
    recordRequestInsightFetch(
      {
        requestId: 'req_3',
        htmlRequestId: 'html_3',
        route: '/reports',
      },
      {
        url: 'https://example.vercel.sh/api',
        method: 'GET',
        statusCode: 200,
        startTime: 200,
        durationMs: 75,
        cacheStatus: 'miss',
        index: 1,
      }
    )

    expect(getRequestInsightsSnapshot()).toEqual({
      requests: [
        expect.objectContaining({
          requestId: 'req_3',
          htmlRequestId: 'html_3',
          route: '/reports',
          durationMs: 75,
          fetches: [
            expect.objectContaining({
              url: 'https://example.vercel.sh/api',
              startTime: 200,
              durationMs: 75,
              cacheStatus: 'miss',
            }),
          ],
        }),
      ],
    })
  })

  it('redacts sensitive request insight payload fields', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'

    recordSpan({
      name: 'fetch GET https://example.vercel.sh/api',
      startTime: 100,
      durationMs: 10,
      requestId: 'req_4',
      route: '/account',
      attributes: {
        'next.span_type': 'AppRender.fetch',
        'http.url':
          'https://user:pass@example.vercel.sh/api?access_token=abc&delay=1&signature=sig',
        'http.method': 'GET',
        'custom.secret': 'should not be exposed',
      },
      events: [
        {
          name: 'fetch start',
          timestamp: 100,
          attributes: {
            'next.span_type': 'AppRender.fetch',
            'custom.secret': 'should not be exposed',
          },
        },
      ],
      links: [
        {
          traceId: 'linked_trace',
          spanId: 'linked_span',
          attributes: {
            'custom.secret': 'should not be exposed',
          },
        },
      ],
    })

    recordRequestInsightFetch(
      {
        requestId: 'req_4',
        route: '/account',
      },
      {
        url: 'https://example.vercel.sh/api?token=abc&keep=1',
        startTime: 120,
        durationMs: 5,
      }
    )

    expect(getRequestInsightsSnapshot().requests[0]).toEqual(
      expect.objectContaining({
        spans: [
          expect.objectContaining({
            attributes: {
              'next.span_type': 'AppRender.fetch',
              'http.url':
                'https://example.vercel.sh/api?access_token=redacted&delay=1&signature=redacted',
              'http.method': 'GET',
            },
            events: [
              {
                name: 'fetch start',
                timestamp: 100,
                attributes: {
                  'next.span_type': 'AppRender.fetch',
                },
              },
            ],
            links: [
              {
                traceId: 'linked_trace',
                spanId: 'linked_span',
                attributes: undefined,
              },
            ],
          }),
        ],
        fetches: [
          expect.objectContaining({
            url: 'https://example.vercel.sh/api?access_token=redacted&delay=1&signature=redacted',
          }),
          expect.objectContaining({
            url: 'https://example.vercel.sh/api?token=redacted&keep=1',
          }),
        ],
      })
    )
  })
})
