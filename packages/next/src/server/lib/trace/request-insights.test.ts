import {
  clearRequestInsightsForTest,
  getRequestInsightsSnapshot,
  recordRequestInsightFetch,
  recordRequestInsightRscTimings,
  subscribeRequestInsights,
} from './request-insights'
import { collectRscDebugTimings } from './rsc-debug-timing'
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

function streamChunks(chunks: string[], onDrain?: () => void) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk
      }
      onDrain?.()
    },
  }
}

describe('request insights', () => {
  beforeEach(() => {
    process.env.__NEXT_DEV_SERVER = '1'
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
        'next.span.category': 'nextjs',
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
        'next.span.category': 'application',
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
                'next.span.category': 'application',
              }),
            }),
            expect.objectContaining({
              traceId: 'trace_1',
              spanId: 'span_1',
              attributes: expect.objectContaining({
                'next.span.category': 'nextjs',
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

  it('derives safe Server Action metadata from its execution span', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'

    recordSpan({
      name: 'run Server Action saveMessage',
      startTime: 100,
      durationMs: 250,
      status: 'ok',
      requestId: 'req_action',
      htmlRequestId: 'html_action',
      route: '/messages',
      attributes: {
        'next.span.category': 'application',
        'next.span_type': 'AppRender.executeServerAction',
        'next.server_action.name': 'saveMessage',
        'next.server_action.file': 'app/actions.ts',
        'next.server_action.args': 'secret value',
      },
    })

    expect(getRequestInsightsSnapshot().requests[0]).toEqual(
      expect.objectContaining({
        serverAction: {
          name: 'saveMessage',
          file: 'app/actions.ts',
          durationMs: 250,
          status: 'ok',
        },
        spans: [
          expect.objectContaining({
            attributes: {
              'next.span.category': 'application',
              'next.span_type': 'AppRender.executeServerAction',
              'next.server_action.name': 'saveMessage',
              'next.server_action.file': 'app/actions.ts',
            },
          }),
        ],
      })
    )
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

  it('reconstructs sanitized RSC component and await timing from split streams', async () => {
    const regular = streamChunks([
      '2:o4,abcd1:D"$a"\n1:D"$',
      'b"\n1:D"$c"\n1:D"$e"\n1:D"$f"\n',
      '1:D"$ffff"\n3:D{"name":"Incomplete',
    ])
    const debug = streamChunks([
      ':N1700000000',
      '000\na:{"time":10,"stack":["secret-time-stack"]}\n',
      'b:{"name":"DelayedPage","env":"Server","props":{"secret":"secret-prop"},"stack":["secret-component-stack"]}\n',
      'c:{"time":15}\nd:J{"name":"setTimeout","start":15,"end":215,"env":"Server","value":"secret-value","url":"https://secret.example"}\n',
      'e:{"awaited":"$d","env":"Server","stack":["secret-await-stack"]}\nf:{"time":215}\nmalformed\n',
    ])

    const timings = await collectRscDebugTimings(regular, debug)

    expect(timings).toEqual([
      {
        name: 'DelayedPage',
        environment: 'Server',
        startTime: 1700000000010,
        durationMs: 5,
        kind: 'component',
      },
      {
        name: 'setTimeout',
        environment: 'Server',
        startTime: 1700000000015,
        durationMs: 200,
        kind: 'await',
      },
    ])

    const serialized = JSON.stringify(timings)
    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('https://')
    expect(serialized).not.toContain('stack')
    expect(serialized).not.toContain('props')
    expect(serialized).not.toContain('value')
  })

  it('joins RSC references after out-of-order stream completion', async () => {
    let releaseRegular: (() => void) | undefined
    const regularReady = new Promise<void>((resolve) => {
      releaseRegular = resolve
    })
    let debugDrained = false

    const regular = {
      async *[Symbol.asyncIterator]() {
        await regularReady
        yield '1:D"$a"\n1:D"$b"\n1:D"$c"\n'
      },
    }
    const debug = streamChunks(
      [
        ':N1000\na:{"time":1}\nb:{"name":"Page","env":"Server"}\nc:{"time":3}\n',
      ],
      () => {
        debugDrained = true
        releaseRegular?.()
      }
    )

    await expect(collectRscDebugTimings(regular, debug)).resolves.toEqual([
      {
        name: 'Page',
        environment: 'Server',
        startTime: 1001,
        durationMs: 2,
        kind: 'component',
      },
    ])
    expect(debugDrained).toBe(true)
  })

  it('caps RSC timing entries while continuing to drain both streams', async () => {
    let regularRows = ''
    let debugRows = ':N1000\n'
    let nextId = 1

    for (let index = 0; index < 501; index++) {
      const startId = (nextId++).toString(16)
      const componentId = (nextId++).toString(16)
      const endId = (nextId++).toString(16)
      debugRows += `${startId}:{"time":${index * 3}}\n`
      debugRows += `${componentId}:{"name":"Component${index}"}\n`
      debugRows += `${endId}:{"time":${index * 3 + 1}}\n`
      regularRows += `1:D"$${startId}"\n1:D"$${componentId}"\n1:D"$${endId}"\n`
    }

    let regularDrained = false
    let debugDrained = false
    const timings = await collectRscDebugTimings(
      streamChunks([regularRows], () => {
        regularDrained = true
      }),
      streamChunks([debugRows], () => {
        debugDrained = true
      })
    )

    expect(timings).toHaveLength(500)
    expect(regularDrained).toBe(true)
    expect(debugDrained).toBe(true)
  })

  it('records RSC timings in one batch and attaches a late aggregate span', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    const listener = jest.fn()
    const unsubscribe = subscribeRequestInsights(listener)

    recordRequestInsightRscTimings(
      {
        requestId: 'req_rsc',
        htmlRequestId: 'html_rsc',
        route: '/delayed',
      },
      [
        {
          name: 'DelayedPage',
          environment: 'Server',
          startTime: 110,
          durationMs: 5,
          kind: 'component',
        },
        {
          name: 'setTimeout',
          environment: 'Server',
          startTime: 115,
          durationMs: 200,
          kind: 'await',
        },
      ]
    )

    expect(listener).toHaveBeenCalledTimes(1)
    expect(getRequestInsightsSnapshot().requests[0].spans).toEqual([
      expect.objectContaining({ parentSpanId: undefined }),
      expect.objectContaining({ parentSpanId: undefined }),
    ])

    recordSpan({
      name: 'AppRender.renderRSCResponse',
      requestId: 'req_rsc',
      htmlRequestId: 'html_rsc',
      route: '/delayed',
      startTime: 100,
      durationMs: 220,
      spanId: 'aggregate-rsc',
      attributes: {
        'next.span_type': 'AppRender.renderRSCResponse',
      },
    })

    const rscSpans = getRequestInsightsSnapshot().requests[0].spans.filter(
      (span) => span.attributes?.['next.rsc.kind'] !== undefined
    )
    expect(rscSpans).toEqual([
      expect.objectContaining({
        name: 'ReactServerComponents.component',
        parentSpanId: 'aggregate-rsc',
        attributes: {
          'next.span.category': 'application',
          'next.span_name': 'DelayedPage',
          'next.span_type': 'ReactServerComponents.component',
          'next.rsc.kind': 'component',
          'next.rsc.environment': 'Server',
        },
      }),
      expect.objectContaining({
        name: 'ReactServerComponents.await',
        parentSpanId: 'aggregate-rsc',
        attributes: {
          'next.span.category': 'application',
          'next.span_name': 'setTimeout',
          'next.span_type': 'ReactServerComponents.await',
          'next.rsc.kind': 'await',
          'next.rsc.environment': 'Server',
        },
      }),
    ])
    unsubscribe()
  })
})
