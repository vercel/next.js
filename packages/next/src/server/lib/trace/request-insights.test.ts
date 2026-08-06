/* eslint-disable jest/no-standalone-expect -- Assertions run inside the controller-scoped test wrapper. */

import {
  RequestInsights,
  getRequestInsightsSnapshot,
  recordRequestInsightFetch,
  recordRequestInsightRouterActivity,
  recordRequestInsightServerAction,
  recordRequestInsightSource,
  subscribeRequestInsights,
} from './request-insights'
import { runWithRequestInsights } from './request-insights-runtime'
import { recordSpan } from './span-store'
import { getRequestInsightRouterActivity } from './request-insights-router-activity'

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
  let requestInsights: RequestInsights

  beforeEach(() => {
    process.env.__NEXT_DEV_SERVER = '1'
    requestInsights = new RequestInsights()
  })

  afterEach(() => {
    restoreEnv('__NEXT_REQUEST_INSIGHTS', originalRequestInsights)
    restoreEnv('__NEXT_DEV_SERVER', originalDevServer)
    requestInsights.dispose()
  })

  function withRequestInsights<TArgs extends unknown[]>(
    fn: (...args: TArgs) => void
  ): (...args: TArgs) => void {
    return (...args) => {
      runWithRequestInsights(requestInsights, () => fn(...args))
    }
  }

  function test(name: string, fn: () => void): void {
    it(name, withRequestInsights(fn))
  }

  it('isolates retained data by active controller', () => {
    const first = new RequestInsights()
    const second = new RequestInsights()
    try {
      runWithRequestInsights(first, () => {
        recordRequestInsightFetch(
          { requestId: 'first' },
          { url: '/first', startTime: 1, durationMs: 1 }
        )
        runWithRequestInsights(second, () => {
          recordRequestInsightFetch(
            { requestId: 'second' },
            { url: '/second', startTime: 2, durationMs: 1 }
          )
        })
        runWithRequestInsights(undefined, () => {
          recordRequestInsightFetch(
            { requestId: 'disabled' },
            { url: '/disabled', startTime: 3, durationMs: 1 }
          )
        })
      })

      expect(
        first.getSnapshot().requests.map(({ requestId }) => requestId)
      ).toEqual(['first'])
      expect(
        second.getSnapshot().requests.map(({ requestId }) => requestId)
      ).toEqual(['second'])
    } finally {
      first.dispose()
      second.dispose()
    }
  })

  test('derives request history from local span records', () => {
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

  test('notifies subscribers when a request insight changes', () => {
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

  test('uses the HTTP request span as the end-to-end request timing', () => {
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

  test('classifies framework request sources without letting the root span erase a specific source', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'

    recordSpan({
      name: 'run app route',
      requestId: 'req_source',
      attributes: {
        'next.span_type': 'AppRouteRouteHandlers.runHandler',
      },
    })
    recordSpan({
      name: 'GET /api/items',
      requestId: 'req_source',
      attributes: {
        'next.span_type': 'BaseServer.handleRequest',
      },
    })

    expect(getRequestInsightsSnapshot().requests[0]).toEqual(
      expect.objectContaining({ source: 'app-route' })
    )
  })

  it.each([
    ['Node.runHandler', 'pages-api'],
    ['NextNodeServer.imageOptimizer', 'image'],
    ['Middleware.execute', 'proxy'],
  ] as const)(
    'classifies %s spans as %s requests',
    withRequestInsights((spanType, source) => {
      process.env.__NEXT_REQUEST_INSIGHTS = 'true'

      recordSpan({
        name: spanType,
        requestId: `req_${source}`,
        attributes: {
          'next.span_type': spanType,
        },
      })

      expect(getRequestInsightsSnapshot().requests[0]).toEqual(
        expect.objectContaining({ source })
      )
    })
  )

  test('records an authoritative static asset source after tracing starts', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    const identity: Parameters<typeof recordRequestInsightSource>[0] = {
      requestId: 'req_asset',
    }

    recordSpan({
      name: 'GET /asset.svg',
      requestId: identity.requestId,
      attributes: {
        'next.span_type': 'BaseServer.handleRequest',
      },
    })
    recordRequestInsightSource(identity, 'asset')

    expect(identity.source).toBe('asset')
    expect(getRequestInsightsSnapshot().requests[0]).toEqual(
      expect.objectContaining({ source: 'asset' })
    )
  })

  test('does not create a request only because a source was recorded', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'

    recordRequestInsightSource({ requestId: 'untraced-asset' }, 'asset')

    expect(getRequestInsightsSnapshot().requests).toEqual([])
  })

  test('does not classify the middleware pass as a page before an App Route runs', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    const identity = {
      requestId: 'middleware-app-route',
      source: 'proxy' as const,
    }

    recordSpan({
      name: 'proxy POST /api/stream',
      requestId: identity.requestId,
      requestInsightSource: identity.source,
      startTime: 1,
      attributes: {
        'next.span_type': 'Middleware.execute',
      },
    })
    recordSpan({
      name: 'POST /api/stream',
      requestId: identity.requestId,
      requestInsightSource: identity.source,
      startTime: 2,
      attributes: {
        'next.span_type': 'BaseServer.handleRequest',
      },
    })

    expect(getRequestInsightsSnapshot().requests).toEqual([
      expect.objectContaining({
        requestId: identity.requestId,
        source: 'proxy',
      }),
    ])

    recordRequestInsightSource(identity, 'app-route')
    recordSpan({
      name: 'execute route handler',
      requestId: identity.requestId,
      startTime: 3,
      attributes: {
        'next.span_type': 'AppRouteRouteHandlers.runHandler',
      },
    })

    const requests = getRequestInsightsSnapshot().requests
    expect(requests).toHaveLength(1)
    expect(requests[0]).toEqual(
      expect.objectContaining({
        requestId: identity.requestId,
        source: 'app-route',
      })
    )
    expect(
      requests[0].spans.map((span) => span.attributes?.['next.span_type'])
    ).toEqual([
      'Middleware.execute',
      'BaseServer.handleRequest',
      'AppRouteRouteHandlers.runHandler',
    ])
  })

  test('classifies the route pass as a page after middleware completes', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    const identity = {
      requestId: 'middleware-page',
      source: 'proxy' as 'proxy' | undefined,
    }

    recordSpan({
      name: 'proxy GET /products',
      requestId: identity.requestId,
      requestInsightSource: identity.source,
      startTime: 1,
      attributes: {
        'next.span_type': 'Middleware.execute',
      },
    })
    recordSpan({
      name: 'GET /products',
      requestId: identity.requestId,
      requestInsightSource: identity.source,
      startTime: 2,
      attributes: {
        'next.span_type': 'BaseServer.handleRequest',
      },
    })
    identity.source = undefined
    recordSpan({
      name: 'GET /products',
      requestId: identity.requestId,
      requestInsightSource: identity.source,
      startTime: 3,
      attributes: {
        'next.span_type': 'BaseServer.handleRequest',
      },
    })

    expect(getRequestInsightsSnapshot().requests).toEqual([
      expect.objectContaining({
        requestId: identity.requestId,
        source: 'page',
      }),
    ])
  })

  test('records normalized router activity and confirmed Server Actions', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    const identity = { requestId: 'req_activity' }

    recordSpan({
      name: 'render route (app) /dashboard',
      requestId: identity.requestId,
    })

    recordRequestInsightRouterActivity(identity, 'segment-prefetch')
    recordRequestInsightServerAction(identity)

    expect(getRequestInsightsSnapshot().requests[0]).toEqual(
      expect.objectContaining({
        source: 'unknown',
        routerActivity: 'segment-prefetch',
        serverAction: true,
      })
    )
  })

  test('derives router activity only from valid RSC protocol headers', () => {
    expect(
      getRequestInsightRouterActivity({
        rsc: '1',
        'next-router-prefetch': '1',
        'next-router-segment-prefetch': '/dashboard',
      })
    ).toBe('segment-prefetch')
    expect(
      getRequestInsightRouterActivity({
        'next-router-prefetch': '1',
      })
    ).toBeUndefined()
    expect(
      getRequestInsightRouterActivity({
        rsc: '1',
        'next-hmr-refresh': '1',
      })
    ).toBe('hmr-refresh')
  })

  test('keeps request and Instant Insights data separate for the same request ID', () => {
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

  test('does not treat aggregate client component loading as a trace span', () => {
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

  test('records request fetch metrics when the OTel fetch span does not complete locally', () => {
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

  test('redacts sensitive request insight payload fields', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'

    const secret = 'Q2_SECRET_SENTINEL'
    recordSpan({
      name: `fetch GET https://example.vercel.sh/api?token=${secret}`,
      startTime: 100,
      durationMs: 10,
      requestId: 'req_4',
      route: '/account',
      attributes: {
        'next.span_type': 'AppRender.fetch',
        'http.url': `https://user:pass@example.vercel.sh/api?access_token=${secret}&delay=1&signature=sig`,
        'http.method': 'GET',
        'next.span_name': `fetch GET https://user:pass@example.vercel.sh/api?access_token=${secret}`,
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
            name: 'fetch GET https://example.vercel.sh/api?query=redacted',
            attributes: {
              'next.span_type': 'AppRender.fetch',
              'http.url': 'https://example.vercel.sh/api?query=redacted',
              'http.method': 'GET',
              'next.span_name':
                'fetch GET https://example.vercel.sh/api?query=redacted',
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
            url: 'https://example.vercel.sh/api?query=redacted',
          }),
          expect.objectContaining({
            url: 'https://example.vercel.sh/api?query=redacted',
          }),
        ],
      })
    )
    expect(JSON.stringify(getRequestInsightsSnapshot())).not.toContain(secret)
  })

  test('only exposes bounded URLs without query payloads', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'

    const cases = [
      {
        requestId: 'relative',
        input: '/products/blue?sort=price#details',
        expected: '/products/blue?query=redacted',
      },
      {
        requestId: 'protocol-relative',
        input: '//example.com/items?cursor=secret',
        expected: '//example.com/items?query=redacted',
      },
      {
        requestId: 'absolute',
        input: 'https://user:password@example.com/items?visible=value#details',
        expected: 'https://example.com/items?query=redacted',
      },
      {
        requestId: 'opaque',
        input: 'data:text/plain,secret',
        expected: 'data:redacted',
      },
      {
        requestId: 'untrusted-relative',
        input: 'items?token=secret',
        expected: undefined,
      },
    ] as const

    for (const testCase of cases) {
      recordRequestInsightFetch(
        { requestId: testCase.requestId },
        { url: testCase.input, startTime: 100, durationMs: 1 }
      )
    }

    const requests = new Map(
      getRequestInsightsSnapshot().requests.map((request) => [
        request.requestId,
        request,
      ])
    )
    for (const testCase of cases) {
      expect(requests.get(testCase.requestId)?.fetches[0]?.url).toBe(
        testCase.expected
      )
    }

    recordRequestInsightFetch(
      { requestId: 'oversized' },
      {
        url: `https://example.com/${'x'.repeat(64 * 1024)}`,
        startTime: 100,
        durationMs: 1,
      }
    )
    expect(
      getRequestInsightsSnapshot().requests.find(
        (request) => request.requestId === 'oversized'
      )?.fetches[0]?.url
    ).toBeUndefined()

    recordRequestInsightFetch(
      { requestId: 'query-name' },
      {
        url: 'https://example.com/items?sk_live_SENTINEL',
        startTime: 100,
        durationMs: 1,
      }
    )
    expect(
      JSON.stringify(
        getRequestInsightsSnapshot().requests.find(
          (request) => request.requestId === 'query-name'
        )
      )
    ).not.toContain('sk_live_SENTINEL')
  })
})
