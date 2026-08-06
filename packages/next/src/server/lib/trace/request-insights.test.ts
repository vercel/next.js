/* eslint-disable jest/no-standalone-expect -- Assertions run inside the controller-scoped test wrapper. */

import { EventEmitter } from 'node:events'
import type { ServerResponse } from 'node:http'

import { WebNextResponse } from '../../base-http/web'
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
import {
  trackRequestInsightNodeResponse,
  trackRequestInsightWebResponse,
  type RequestInsightResponseLifecycle,
} from './request-insights-response'

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

  test('keeps a response pending until delivery actually finishes', () => {
    const identity = { requestId: 'response-pending' }

    requestInsights.startResponse(identity, 100)
    recordSpan({
      name: 'GET /stream',
      requestId: identity.requestId,
      startTime: 110,
      durationMs: 20,
      status: 'ok',
      attributes: {
        'next.span_type': 'BaseServer.handleRequest',
      },
    })

    expect(requestInsights.getSnapshot().requests[0]).toEqual(
      expect.objectContaining({
        status: 'pending',
        response: {
          trackingStartTime: 100,
          outcome: 'pending',
        },
      })
    )

    requestInsights.completeResponse(identity, {
      trackingStartTime: 100,
      endTime: 175,
      statusCode: 202,
      outcome: 'finished',
    })

    expect(requestInsights.getSnapshot().requests[0]).toEqual(
      expect.objectContaining({
        startTime: 100,
        durationMs: 75,
        status: 'ok',
        response: {
          trackingStartTime: 100,
          endTime: 175,
          statusCode: 202,
          outcome: 'finished',
          error: undefined,
        },
      })
    )
  })

  test('keeps delivery timing when the request span arrives after completion', () => {
    const identity = { requestId: 'response-before-request-span' }

    requestInsights.startResponse(identity, 100)
    requestInsights.completeResponse(identity, {
      trackingStartTime: 100,
      endTime: 200,
      statusCode: 200,
      outcome: 'finished',
    })
    recordSpan({
      name: 'GET /stream',
      requestId: identity.requestId,
      startTime: 110,
      durationMs: 20,
      status: 'ok',
      attributes: {
        'next.span_type': 'BaseServer.handleRequest',
      },
    })

    expect(requestInsights.getSnapshot().requests[0]).toEqual(
      expect.objectContaining({
        startTime: 100,
        durationMs: 100,
        status: 'ok',
        response: expect.objectContaining({
          endTime: 200,
          outcome: 'finished',
        }),
      })
    )
  })

  test('keeps aborts and errors sticky after response completion', () => {
    const abortedIdentity = { requestId: 'response-aborted' }
    requestInsights.startResponse(abortedIdentity, 100)
    requestInsights.completeResponse(abortedIdentity, {
      trackingStartTime: 100,
      endTime: 125,
      statusCode: 200,
      outcome: 'aborted',
      error: { type: 'ResponseAborted' },
    })
    recordSpan({
      name: 'late abort cleanup',
      requestId: abortedIdentity.requestId,
      startTime: 120,
      durationMs: 10,
      status: 'error',
      error: { type: 'AbortError' },
    })
    requestInsights.completeResponse(abortedIdentity, {
      trackingStartTime: 100,
      endTime: 150,
      statusCode: 200,
      outcome: 'finished',
    })

    const erroredIdentity = { requestId: 'response-errored' }
    requestInsights.startResponse(erroredIdentity, 200)
    requestInsights.completeResponse(erroredIdentity, {
      trackingStartTime: 200,
      endTime: 225,
      statusCode: 200,
      outcome: 'errored',
      error: { type: 'private-error-name' },
    })
    recordSpan({
      name: 'late successful cleanup',
      requestId: erroredIdentity.requestId,
      startTime: 225,
      durationMs: 5,
      status: 'ok',
    })

    const routeErrorIdentity = { requestId: 'route-error-then-abort' }
    requestInsights.startResponse(routeErrorIdentity, 300)
    recordSpan({
      name: 'route failed',
      requestId: routeErrorIdentity.requestId,
      startTime: 310,
      durationMs: 5,
      status: 'error',
      error: { type: 'Error' },
    })
    requestInsights.completeResponse(routeErrorIdentity, {
      trackingStartTime: 300,
      endTime: 325,
      statusCode: 200,
      outcome: 'aborted',
      error: { type: 'ResponseAborted' },
    })

    expect(requestInsights.getSnapshot().requests).toEqual([
      expect.objectContaining({
        requestId: abortedIdentity.requestId,
        status: 'aborted',
        response: expect.objectContaining({ outcome: 'aborted' }),
      }),
      expect.objectContaining({
        requestId: erroredIdentity.requestId,
        status: 'error',
        response: expect.objectContaining({
          outcome: 'errored',
          error: { type: 'Error' },
        }),
      }),
      expect.objectContaining({
        requestId: routeErrorIdentity.requestId,
        status: 'error',
        response: expect.objectContaining({ outcome: 'aborted' }),
      }),
    ])
  })

  test('captures the committed Node status and completes only once', () => {
    const originalWriteHead = function (
      this: ServerResponse,
      statusCode: number
    ) {
      Object.assign(this, { headersSent: true, statusCode })
      return this
    } as ServerResponse['writeHead']
    const response = Object.assign(new EventEmitter(), {
      destroyed: false,
      errored: null,
      headersSent: false,
      statusCode: 200,
      writableFinished: false,
      writeHead: originalWriteHead,
    }) as unknown as ServerResponse
    const identity = { requestId: 'node-response' }
    const onComplete = jest.fn((lifecycle: RequestInsightResponseLifecycle) => {
      requestInsights.completeResponse(identity, lifecycle)
    })

    trackRequestInsightNodeResponse(response, {
      onAttach(trackingStartTime) {
        requestInsights.startResponse(identity, trackingStartTime)
      },
      onComplete,
    })
    response.writeHead(202)
    expect(response.writeHead).toBe(originalWriteHead)

    Object.assign(response, {
      statusCode: 500,
      writableFinished: true,
    })
    response.emit('finish')
    response.emit('close')

    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(requestInsights.getSnapshot().requests[0]).toEqual(
      expect.objectContaining({
        status: 'ok',
        response: expect.objectContaining({
          statusCode: 202,
          outcome: 'finished',
        }),
      })
    )
    expect(response.listenerCount('finish')).toBe(0)
    expect(response.listenerCount('close')).toBe(0)
  })

  test('does not let diagnostic callback failures affect a Node response', () => {
    const response = Object.assign(new EventEmitter(), {
      destroyed: false,
      errored: null,
      headersSent: true,
      statusCode: 200,
      writableFinished: false,
    }) as unknown as ServerResponse
    const consoleError = jest.spyOn(console, 'error').mockImplementation()

    try {
      expect(() =>
        trackRequestInsightNodeResponse(response, {
          onAttach() {
            throw new Error('attach failed')
          },
          onComplete() {
            throw new Error('complete failed')
          },
        })
      ).not.toThrow()

      Object.assign(response, { writableFinished: true })
      expect(() => response.emit('finish')).not.toThrow()
      expect(consoleError).toHaveBeenCalledTimes(2)
      expect(response.listenerCount('finish')).toBe(0)
      expect(response.listenerCount('close')).toBe(0)
    } finally {
      consoleError.mockRestore()
    }
  })

  it('completes the controller captured at attachment after ALS exits', () => {
    process.env.__NEXT_DEV_SERVER = '1'
    const first = new RequestInsights()
    const second = new RequestInsights()
    const response = Object.assign(new EventEmitter(), {
      destroyed: false,
      errored: null,
      headersSent: true,
      statusCode: 200,
      writableFinished: false,
    }) as unknown as ServerResponse
    const identity = { requestId: 'owned-response' }

    try {
      trackRequestInsightNodeResponse(response, {
        onAttach(trackingStartTime) {
          first.startResponse(identity, trackingStartTime)
        },
        onComplete(lifecycle) {
          first.completeResponse(identity, lifecycle)
        },
      })

      Object.assign(response, { writableFinished: true })
      runWithRequestInsights(second, () => response.emit('finish'))

      expect(first.getSnapshot().requests[0]).toEqual(
        expect.objectContaining({
          response: expect.objectContaining({ outcome: 'finished' }),
        })
      )
      expect(second.getSnapshot()).toEqual({ requests: [] })
    } finally {
      first.dispose()
      second.dispose()
    }
  })

  it('records Web completion on the controller captured before consumption', async () => {
    process.env.__NEXT_DEV_SERVER = '1'
    const first = new RequestInsights()
    const second = new RequestInsights()
    const response = new WebNextResponse(undefined).body('complete')
    response.statusCode = 202
    const identity = { requestId: 'owned-web-response' }

    try {
      trackRequestInsightWebResponse(response, {
        onAttach(trackingStartTime) {
          first.startResponse(identity, trackingStartTime)
        },
        onComplete(lifecycle) {
          first.completeResponse(identity, lifecycle)
        },
      })
      response.send()
      const webResponse = await response.toResponse()
      await runWithRequestInsights(second, () => webResponse.text())

      expect(first.getSnapshot().requests[0]).toEqual(
        expect.objectContaining({
          status: 'ok',
          response: expect.objectContaining({
            outcome: 'finished',
            statusCode: 202,
          }),
        })
      )
      expect(second.getSnapshot()).toEqual({ requests: [] })
    } finally {
      first.dispose()
      second.dispose()
    }
  })

  it('ignores late response callbacks after controller disposal', () => {
    process.env.__NEXT_DEV_SERVER = '1'
    const controller = new RequestInsights()
    const response = Object.assign(new EventEmitter(), {
      destroyed: false,
      errored: null,
      headersSent: true,
      statusCode: 200,
      writableFinished: false,
    }) as unknown as ServerResponse
    const identity = { requestId: 'disposed-response' }

    trackRequestInsightNodeResponse(response, {
      onAttach(trackingStartTime) {
        controller.startResponse(identity, trackingStartTime)
      },
      onComplete(lifecycle) {
        controller.completeResponse(identity, lifecycle)
      },
    })
    controller.dispose()
    Object.assign(response, { writableFinished: true })

    expect(() => response.emit('finish')).not.toThrow()
    expect(controller.getSnapshot()).toEqual({ requests: [] })
  })
})
