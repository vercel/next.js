import {
  clearRequestInsightsHistoryProvider,
  clearRequestInsightsForTest,
  completeRequestInsight,
  configureRequestInsightsHistoryProvider,
  getRequestInsightsSnapshot,
  importRequestInsightSpans,
  recordRequestInsightFetch,
  registerRequestInsightsExporter,
  recordRequestInsightSource,
  startRequestInsight,
  subscribeRequestInsights,
} from './request-insights'
import {
  appendArchivedRequestInsightUpdateToJournal,
  appendRequestInsightToJournal,
  appendRequestInsightUpdateToJournal,
  closeRequestInsightsJournal,
  configureRequestInsightsJournal,
  getRequestInsightsHistory,
  initializeRequestInsightsJournal,
  readRequestInsightsJournal,
  resetRequestInsightsJournalForTest,
  StaleRequestInsightsHistoryCursorError,
} from './request-insights-journal'
import { recordSpan } from './span-store'
import {
  resolveRequestInsightsIdentity,
  runWithRequestInsightsIdentity,
} from './request-insights-identity'
import {
  appendFile,
  mkdtemp,
  mkdir,
  open,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
} from 'fs/promises'
import { gunzipSync, gzipSync } from 'zlib'
import { tmpdir } from 'os'
import path from 'path'
import {
  MAX_LIVE_COMPLETED_REQUEST_INSIGHTS,
  type RequestInsight,
} from '../../../shared/lib/request-insights'

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

  afterEach(async () => {
    restoreEnv('__NEXT_REQUEST_INSIGHTS', originalRequestInsights)
    restoreEnv('__NEXT_DEV_SERVER', originalDevServer)
    await resetRequestInsightsJournalForTest()
    clearRequestInsightsHistoryProvider()
    clearRequestInsightsForTest()
  })

  it('derives request history from local span records', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    startRequestInsight({ requestId: 'req_1' })

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
    startRequestInsight({ requestId: 'req_2' })
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
    startRequestInsight({ requestId: 'instant_1', kind: 'instant-insights' })
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
    startRequestInsight({ requestId: 'req_timing' })

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

  it.each([false, true])(
    'includes both Proxy and page passes in request timing (reverse delivery: %s)',
    (reverse) => {
      process.env.__NEXT_REQUEST_INSIGHTS = 'true'
      startRequestInsight({ requestId: 'req_proxy_timing' })

      const passes = [
        { startTime: 1000, durationMs: 50 },
        { startTime: 1050, durationMs: 10 },
      ]
      for (const timing of reverse ? passes.reverse() : passes) {
        recordSpan({
          name: 'GET /dashboard',
          requestId: 'req_proxy_timing',
          ...timing,
          attributes: { 'next.span_type': 'BaseServer.handleRequest' },
        })
      }

      expect(getRequestInsightsSnapshot().requests[0]).toEqual(
        expect.objectContaining({ startTime: 1000, durationMs: 60 })
      )
    }
  )

  it('waits for explicit outer completion after middleware and final routing', async () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    startRequestInsight({ requestId: 'middleware-route' })
    const distDir = await mkdtemp(path.join(tmpdir(), 'request-insights-'))
    await initializeRequestInsightsJournal(distDir)
    configureJournalProvider(distDir)

    recordSpan({
      name: 'middleware request',
      requestId: 'middleware-route',
      startTime: 1,
      durationMs: 2,
      attributes: {
        'next.span_type': 'BaseServer.handleRequest',
      },
    })
    expect(getRequestInsightsSnapshot().requests[0].completedAt).toBeUndefined()
    await expect(
      readRequestInsightsJournal(distDir, { requestId: 'middleware-route' })
    ).resolves.toEqual([])

    recordSpan({
      name: 'final route handler',
      requestId: 'middleware-route',
      startTime: 3,
      durationMs: 4,
    })
    completeRequestInsight({ requestId: 'middleware-route' })
    completeRequestInsight({ requestId: 'middleware-route' })

    await expect(
      readRequestInsightsJournal(distDir, { requestId: 'middleware-route' })
    ).resolves.toEqual([
      expect.objectContaining({
        completedAt: expect.any(Number),
        spans: [
          expect.objectContaining({ name: 'middleware request' }),
          expect.objectContaining({ name: 'final route handler' }),
        ],
      }),
    ])

    await resetRequestInsightsJournalForTest()
    await rm(distDir, { recursive: true, force: true })
  })

  it('keeps active requests until they finish before applying the completed request limit', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    startRequestInsight({ requestId: 'long-running' })

    recordSpan({
      name: 'long-running work',
      requestId: 'long-running',
      startTime: 1,
      durationMs: 1,
    })

    for (let index = 0; index < 101; index++) {
      startRequestInsight({ requestId: `completed-${index}` })
      recordSpan({
        name: `GET /completed/${index}`,
        requestId: `completed-${index}`,
        startTime: index + 10,
        durationMs: 1,
        attributes: {
          'next.span_type': 'BaseServer.handleRequest',
        },
      })
      completeRequestInsight({ requestId: `completed-${index}` })
    }

    expect(
      getRequestInsightsSnapshot()
        .requests.find((request) => request.requestId === 'long-running')
        ?.spans.map((span) => span.name)
    ).toEqual(['long-running work'])

    recordSpan({
      name: 'GET /long-running',
      requestId: 'long-running',
      startTime: 1,
      durationMs: 200,
      attributes: {
        'next.span_type': 'BaseServer.handleRequest',
      },
    })
    completeRequestInsight({ requestId: 'long-running' })

    const snapshot = getRequestInsightsSnapshot()
    expect(snapshot.requests).toHaveLength(100)
    expect(
      snapshot.requests
        .find((request) => request.requestId === 'long-running')
        ?.spans.map((span) => span.name)
    ).toEqual(['long-running work', 'GET /long-running'])
  })

  it('closes an untraced request without reopening it when its identity is reused', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    const identity = resolveRequestInsightsIdentity({
      previousIdentity: undefined,
      requestIdHeader: undefined,
      htmlRequestIdHeader: undefined,
      url: '/',
      createRequestId: () => 'untraced',
    })
    expect(getRequestInsightsSnapshot().requests).toEqual([])
    completeRequestInsight(identity)

    expect(
      resolveRequestInsightsIdentity({
        previousIdentity: identity,
        requestIdHeader: undefined,
        htmlRequestIdHeader: undefined,
        url: '/',
        createRequestId: () => 'unused',
      })
    ).toBe(identity)
    runWithRequestInsightsIdentity(identity, () => {
      recordSpan({ name: 'late span', requestId: identity.requestId })
      recordRequestInsightFetch(identity, { url: 'https://example.com/data' })
    })
    expect(getRequestInsightsSnapshot().requests).toEqual([])
  })

  it.each(['request', 'instant-insights'] as const)(
    'keeps an active %s eligible for its first span across completed request eviction',
    (kind) => {
      process.env.__NEXT_REQUEST_INSIGHTS = 'true'
      startRequestInsight({ requestId: 'waiting', kind })
      expect(getRequestInsightsSnapshot().requests).toEqual([])
      for (let i = 0; i < 101; i++) {
        const identity = { requestId: `completed-${i}` }
        startRequestInsight(identity)
        recordSpan({ name: 'GET /', requestId: identity.requestId })
        completeRequestInsight(identity)
      }

      recordSpan({
        name: 'first span',
        requestId: 'waiting',
        requestInsightKind: kind,
      })
      expect(getRequestInsightsSnapshot().requests).toHaveLength(101)
      expect(getRequestInsightsSnapshot().requests.at(-1)).toMatchObject({
        requestId: 'waiting',
        kind,
        spans: [{ name: 'first span' }],
      })
    }
  )

  it('does not restart a completed Instant Insights lifetime on a repeated start', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    const identity = { requestId: 'instant', kind: 'instant-insights' as const }
    const span = {
      name: 'Instant Insights',
      requestId: identity.requestId,
      requestInsightKind: identity.kind,
      durationMs: 1,
      attributes: { 'next.span_type': 'AppRender.instantInsights' },
    }
    startRequestInsight(identity)
    recordSpan(span)
    startRequestInsight(identity)
    recordSpan(span)

    for (let i = 0; i < 101; i++) {
      const completed = { requestId: `completed-${i}` }
      startRequestInsight(completed)
      recordSpan({ name: 'GET /', requestId: completed.requestId })
      completeRequestInsight(completed)
    }
    recordSpan({
      name: 'late Instant work',
      requestId: identity.requestId,
      requestInsightKind: identity.kind,
    })
    expect(
      getRequestInsightsSnapshot().requests.some(
        (request) => request.requestId === identity.requestId
      )
    ).toBe(false)
  })

  it.each(['disabled', 'production'])(
    'does not register new identities when recording is %s',
    (mode) => {
      process.env.__NEXT_REQUEST_INSIGHTS =
        mode === 'disabled' ? 'false' : 'true'
      if (mode === 'production') delete process.env.__NEXT_DEV_SERVER
      const identity = resolveRequestInsightsIdentity({
        previousIdentity: undefined,
        requestIdHeader: undefined,
        htmlRequestIdHeader: undefined,
        url: '/',
        createRequestId: () => 'not-recorded',
      })
      startRequestInsight({ ...identity, kind: 'instant-insights' })

      process.env.__NEXT_DEV_SERVER = '1'
      process.env.__NEXT_REQUEST_INSIGHTS = 'true'
      recordSpan({ name: 'request span', requestId: identity.requestId })
      recordSpan({
        name: 'Instant span',
        requestId: identity.requestId,
        requestInsightKind: 'instant-insights',
      })
      expect(getRequestInsightsSnapshot().requests).toEqual([])
    }
  )

  it('journals a completed request once with its full sanitized trace', async () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    startRequestInsight({ requestId: 'journaled' })
    const distDir = await mkdtemp(path.join(tmpdir(), 'request-insights-'))
    await initializeRequestInsightsJournal(distDir)
    configureJournalProvider(distDir)

    recordSpan({
      name: 'render route',
      requestId: 'journaled',
      htmlRequestId: 'document',
      startTime: 100,
      durationMs: 20,
    })
    expect(
      await readRequestInsightsJournal(distDir, { requestId: 'journaled' })
    ).toEqual([])

    recordSpan({
      name: 'GET /journaled',
      requestId: 'journaled',
      htmlRequestId: 'document',
      startTime: 90,
      durationMs: 40,
      status: 'ok',
      attributes: {
        'next.span_type': 'BaseServer.handleRequest',
      },
    })
    completeRequestInsight({
      requestId: 'journaled',
      htmlRequestId: 'document',
    })

    clearRequestInsightsForTest()
    expect(
      await readRequestInsightsJournal(distDir, { requestId: 'journaled' })
    ).toEqual([
      expect.objectContaining({
        requestId: 'journaled',
        htmlRequestId: 'document',
        completedAt: expect.any(Number),
        spans: [
          expect.objectContaining({ name: 'render route' }),
          expect.objectContaining({ name: 'GET /journaled' }),
        ],
      }),
    ])

    await resetRequestInsightsJournalForTest()
    await rm(distDir, { recursive: true, force: true })
  })

  it.each([false, true])(
    'retains late spans and fetches without reopening a completed request, archived: %s',
    async (archive) => {
      process.env.__NEXT_REQUEST_INSIGHTS = 'true'
      startRequestInsight({ requestId: 'late' })
      const distDir = await mkdtemp(path.join(tmpdir(), 'request-insights-'))
      await initializeRequestInsightsJournal(distDir)
      configureJournalProvider(distDir)
      recordSpan({
        name: 'render route',
        requestId: 'late',
        startTime: 100,
        durationMs: 20,
      })
      completeRequestInsight({ requestId: 'late' })
      if (archive) {
        for (let i = 0; i < 100; i++) {
          startRequestInsight({ requestId: `other-${i}` })
          recordSpan({ name: 'GET /', requestId: `other-${i}` })
          completeRequestInsight({ requestId: `other-${i}` })
        }
      }
      const fetch = {
        url: 'https://example.com/data?token=secret',
        index: 1,
        startTime: 90,
        durationMs: 100,
        cacheStatus: 'miss',
      }
      recordRequestInsightFetch({ requestId: 'late' }, fetch)
      recordSpan({
        name: 'fetch',
        requestId: 'late',
        startTime: fetch.startTime,
        durationMs: fetch.durationMs,
        status: 'error',
        attributes: {
          'next.span_type': 'AppRender.fetch',
          'http.url': fetch.url,
          'http.status_code': 500,
          'next.fetch.idx': fetch.index,
          'next.fetch.cache_status': 'miss',
        },
      })
      recordRequestInsightFetch({ requestId: 'late' }, fetch)
      recordSpan({
        name: 'GET /',
        requestId: 'late',
        startTime: 100,
        durationMs: 20,
        status: 'ok',
        attributes: {
          'next.span_type': 'BaseServer.handleRequest',
          'http.status_code': 200,
          'next.rsc': false,
        },
      })
      const [stored] = await readRequestInsightsJournal(distDir, {
        requestId: 'late',
      })
      expect(stored).toMatchObject({
        startTime: 100,
        durationMs: 20,
        status: 'error',
        spans: [
          expect.any(Object),
          expect.objectContaining({
            name: 'fetch https://example.com/data?query=redacted',
          }),
          expect.objectContaining({ name: 'GET /' }),
        ],
        fetches: [
          expect.objectContaining({
            url: 'https://example.com/data?query=redacted',
            index: 1,
          }),
        ],
      })
      const summary = (
        await getRequestInsightsHistory(distDir, { limit: 200 })
      ).requests.find((request) => request.requestId === 'late')
      expect(summary).toMatchObject({
        spanCount: 3,
        fetchCount: 1,
        statusCode: 200,
        isRsc: false,
        hasError: true,
        cacheStatuses: ['miss'],
        startTime: 100,
        durationMs: 20,
      })
      expect(
        getRequestInsightsSnapshot().requests.some(
          (request) => request.requestId === 'late'
        )
      ).toBe(!archive)
      await resetRequestInsightsJournalForTest()
      await rm(distDir, { recursive: true, force: true })
    }
  )

  it.each(['span', 'fetch'] as const)(
    'keeps discarded history readable without reopening a request on a late %s after rotation',
    async (update) => {
      process.env.__NEXT_REQUEST_INSIGHTS = 'true'
      const distDir = await mkdtemp(path.join(tmpdir(), 'request-insights-'))
      await initializeRequestInsightsJournal(distDir)
      configureJournalProvider(distDir)

      function complete(requestId: string) {
        const identity = resolveRequestInsightsIdentity({
          previousIdentity: undefined,
          requestIdHeader: undefined,
          htmlRequestIdHeader: undefined,
          url: '/',
          createRequestId: () => requestId,
        })
        recordSpan({ name: 'original', requestId })
        completeRequestInsight(identity)
      }

      try {
        complete('discarded')
        for (let i = 0; i < 101; i++) complete(`newer-${i}`)
        expect(
          getRequestInsightsSnapshot().requests.some(
            (request) => request.requestId === 'discarded'
          )
        ).toBe(false)
        expect(
          await readRequestInsightsJournal(distDir, {
            requestId: 'discarded',
          })
        ).toHaveLength(1)

        await padJournal(distDir, 10 * 1024 * 1024)
        await configureRequestInsightsJournal(distDir)
        complete('rotating')
        expect(
          await readRequestInsightsJournal(distDir, {
            requestId: 'discarded',
          })
        ).toHaveLength(1)
        expect(await readRequestInsightsJournal(distDir)).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ requestId: 'discarded' }),
          ])
        )

        if (update === 'span') {
          recordSpan({ name: 'late work', requestId: 'discarded' })
        } else {
          recordRequestInsightFetch(
            { requestId: 'discarded' },
            { url: 'https://example.com/data' }
          )
        }
        expect(
          getRequestInsightsSnapshot().requests.some(
            (request) => request.requestId === 'discarded'
          )
        ).toBe(false)
      } finally {
        await resetRequestInsightsJournalForTest()
        await rm(distDir, { recursive: true, force: true })
      }
    }
  )

  it('writes late spans without serializing previously stored spans again', async () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    startRequestInsight({ requestId: 'delta' })
    const distDir = await mkdtemp(path.join(tmpdir(), 'request-insights-'))
    await initializeRequestInsightsJournal(distDir)
    configureJournalProvider(distDir)
    recordSpan({ name: 'render', requestId: 'delta' })
    const request = getRequestInsightsSnapshot().requests[0]
    const original = { ...request.spans[0] }
    const serialize = jest.fn(() => original)
    Object.defineProperty(request.spans[0], 'toJSON', { value: serialize })
    completeRequestInsight({ requestId: 'delta' })
    await getRequestInsightsHistory(distDir)
    serialize.mockClear()
    for (let i = 0; i < 10; i++) {
      recordSpan({ name: 'late work', requestId: 'delta' })
    }
    expect(
      (await readRequestInsightsJournal(distDir, { requestId: 'delta' }))[0]
        .spans
    ).toHaveLength(11)
    expect(
      (await getRequestInsightsHistory(distDir)).requests[0].spanCount
    ).toBe(11)
    expect(serialize).not.toHaveBeenCalled()
    await resetRequestInsightsJournalForTest()
    await rm(distDir, { recursive: true, force: true })
  })

  it('preserves completed-request ordering across a late update', async () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    const distDir = await mkdtemp(
      path.join(tmpdir(), 'request-insights-batch-')
    )
    await initializeRequestInsightsJournal(distDir)
    configureJournalProvider(distDir)
    try {
      for (let i = 0; i < 8; i++) {
        const identity = { requestId: `batch-${i}` }
        startRequestInsight(identity)
        recordSpan({ name: 'render', requestId: identity.requestId })
        completeRequestInsight(identity)
      }
      recordSpan({ name: 'late work', requestId: 'batch-0' })
      startRequestInsight({ requestId: 'last' })
      recordSpan({ name: 'render', requestId: 'last' })
      completeRequestInsight({ requestId: 'last' })
      await closeRequestInsightsJournal()

      const records = (await readFile(journalFile(distDir), 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      expect(records.map((record) => record.request.requestId)).toEqual([
        ...Array.from({ length: 8 }, (_, i) => `batch-${i}`),
        'batch-0',
        'last',
      ])
      expect(
        (await readRequestInsightsJournal(distDir, { requestId: 'batch-0' }))[0]
          .spans
      ).toHaveLength(2)
    } finally {
      await resetRequestInsightsJournalForTest()
      await rm(distDir, { recursive: true, force: true })
    }
  })

  it('rotates between records inside a completed-request batch', async () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    startRequestInsight({ requestId: 'seed' })
    recordSpan({ name: 'render', requestId: 'seed' })
    const request = getRequestInsightsSnapshot().requests[0]
    const records = ['one', 'two', 'tri'].map((requestId) => ({
      ...request,
      requestId,
    }))
    const firstLineBytes = Buffer.byteLength(
      JSON.stringify({ version: 1, request: records[0] }) + '\n'
    )
    const distDir = await mkdtemp(
      path.join(tmpdir(), 'request-insights-batch-')
    )
    await initializeRequestInsightsJournal(distDir)
    await padJournal(distDir, 10 * 1024 * 1024 - firstLineBytes)
    try {
      await configureRequestInsightsJournal(distDir)
      for (const record of records) appendRequestInsightToJournal(record)

      const history = await getRequestInsightsHistory(distDir)
      expect(history.truncated).toBe(true)
      expect(history.requests.map((entry) => entry.requestId)).toEqual([
        'tri',
        'two',
      ])
      expect(
        (await readRequestInsightsJournal(distDir)).map(
          (entry) => entry.requestId
        )
      ).toEqual(['two', 'tri'])
    } finally {
      await resetRequestInsightsJournalForTest()
      await rm(distDir, { recursive: true, force: true })
    }
  })

  it.each([false, true])(
    'keeps a complete request when a late update rotates the journal, archived: %s',
    async (archive) => {
      process.env.__NEXT_REQUEST_INSIGHTS = 'true'
      startRequestInsight({ requestId: 'rotated' })
      const distDir = await mkdtemp(path.join(tmpdir(), 'request-insights-'))
      await initializeRequestInsightsJournal(distDir)
      configureJournalProvider(distDir)
      recordSpan({ name: 'original', requestId: 'rotated' })
      completeRequestInsight({ requestId: 'rotated' })
      await getRequestInsightsHistory(distDir)
      if (archive) clearRequestInsightsForTest()

      await padJournal(distDir, 10 * 1024 * 1024)
      await configureRequestInsightsJournal(distDir)
      recordSpan({ name: 'late one', requestId: 'rotated' })
      recordSpan({ name: 'late two', requestId: 'rotated' })
      const [stored] = await readRequestInsightsJournal(distDir, {
        requestId: 'rotated',
      })
      expect(stored.spans.map((span) => span.name)).toEqual([
        'original',
        'late one',
        'late two',
      ])
      const history = await getRequestInsightsHistory(distDir)
      expect(history.truncated).toBe(true)
      expect(history.requests).toHaveLength(1)
      expect(history.requests[0].spanCount).toBe(3)
      await resetRequestInsightsJournalForTest()
      await rm(distDir, { recursive: true, force: true })
    }
  )

  it('closes the journal idempotently and flushes pending appends', async () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    startRequestInsight({ requestId: 'flushed' })
    const distDir = await mkdtemp(path.join(tmpdir(), 'request-insights-'))
    await initializeRequestInsightsJournal(distDir)
    configureJournalProvider(distDir)

    recordSpan({
      name: 'GET /flushed',
      requestId: 'flushed',
      htmlRequestId: 'document',
      startTime: 1,
      durationMs: 2,
      attributes: {
        'next.span_type': 'BaseServer.handleRequest',
      },
    })
    completeRequestInsight({
      requestId: 'flushed',
      htmlRequestId: 'document',
    })
    await closeRequestInsightsJournal()

    await expect(
      readRequestInsightsJournal(distDir, { requestId: 'flushed' })
    ).resolves.toEqual([
      expect.objectContaining({
        requestId: 'flushed',
        completedAt: expect.any(Number),
      }),
    ])

    await expect(closeRequestInsightsJournal()).resolves.toBeUndefined()
    await rm(distDir, { recursive: true, force: true })
  })

  it('pages session summaries with a stable cursor and rejects an old session cursor', async () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    const distDir = await mkdtemp(path.join(tmpdir(), 'request-insights-'))
    await initializeRequestInsightsJournal(distDir)
    configureJournalProvider(distDir)

    for (let index = 0; index < 3; index++) {
      startRequestInsight({ requestId: `history-${index}` })
      recordSpan({
        name: `GET /history/${index}`,
        requestId: `history-${index}`,
        startTime: index,
        durationMs: 1,
      })
      completeRequestInsight({ requestId: `history-${index}` })
    }

    const firstPage = await getRequestInsightsHistory(distDir, { limit: 2 })
    expect(firstPage.requests.map((request) => request.requestId)).toEqual([
      'history-2',
      'history-1',
    ])
    expect(firstPage.nextCursor).toEqual(expect.any(String))

    const secondPage = await getRequestInsightsHistory(distDir, {
      cursor: firstPage.nextCursor,
      limit: 2,
    })
    expect(secondPage.requests.map((request) => request.requestId)).toEqual([
      'history-0',
    ])

    await expect(
      getRequestInsightsHistory(distDir, {
        filters: ['source:api'],
        liveRequestKeys: [
          'request:history-0',
          'request:history-0',
          'request:missing',
        ],
      })
    ).resolves.toMatchObject({
      requests: [],
      liveRequestOverlaps: [
        expect.objectContaining({ requestId: 'history-0' }),
      ],
    })
    await expect(
      getRequestInsightsHistory(distDir, {
        liveRequestKeys: Array(MAX_LIVE_COMPLETED_REQUEST_INSIGHTS + 1).fill(
          'request:history-0'
        ),
      })
    ).rejects.toThrow('Too many live Request Insights keys')

    await initializeRequestInsightsJournal(distDir)
    expect((await getRequestInsightsHistory(distDir)).requests).toEqual([])
    await expect(
      getRequestInsightsHistory(distDir, {
        cursor: firstPage.nextCursor,
      })
    ).rejects.toMatchObject({
      name: 'StaleRequestInsightsHistoryCursorError',
    })
    expect(new StaleRequestInsightsHistoryCursorError()).toBeInstanceOf(Error)

    await resetRequestInsightsJournalForTest()
    await rm(distDir, { recursive: true, force: true })
  })

  it('classifies framework request sources without letting the root span erase a specific source', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    startRequestInsight({ requestId: 'req_source' })

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
  ] as const)('classifies %s spans as %s requests', (spanType, source) => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    startRequestInsight({ requestId: `req_${source}` })

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

  it('records an authoritative static asset source after tracing starts', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    const identity: Parameters<typeof recordRequestInsightSource>[0] = {
      requestId: 'req_asset',
    }
    startRequestInsight(identity)

    recordSpan({
      name: 'GET /asset.svg',
      requestId: identity.requestId,
      attributes: {
        'next.span_type': 'BaseServer.handleRequest',
      },
    })
    recordRequestInsightSource(identity, 'asset')

    expect(identity.source).toBeUndefined()
    expect(getRequestInsightsSnapshot().requests[0]).toEqual(
      expect.objectContaining({ source: 'asset' })
    )
  })

  it('does not create a request only because a source was recorded', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'

    startRequestInsight({ requestId: 'untraced-asset' })
    recordRequestInsightSource({ requestId: 'untraced-asset' }, 'asset')

    expect(getRequestInsightsSnapshot().requests).toEqual([])
  })

  it('does not classify the middleware pass as a page before an App Route runs', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    const identity = {
      requestId: 'middleware-app-route',
      source: 'proxy' as const,
    }
    startRequestInsight(identity)

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

  it('classifies the route pass as a page after middleware completes', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    const identity = {
      requestId: 'middleware-page',
      source: 'proxy' as 'proxy' | undefined,
    }
    startRequestInsight(identity)

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
    const pageIdentity = { ...identity, source: undefined }
    recordSpan({
      name: 'GET /products',
      requestId: pageIdentity.requestId,
      requestInsightSource: pageIdentity.source,
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

  it('keeps request and Instant Insights data separate for the same request ID', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    startRequestInsight({ requestId: 'req_shared' })
    startRequestInsight({ requestId: 'req_shared', kind: 'instant-insights' })
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
    startRequestInsight({ requestId: 'req_client_loading' })

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
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    startRequestInsight({ requestId: 'req_3' })
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
    startRequestInsight({ requestId: 'req_4' })

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

  it('only exposes bounded URLs without query payloads', () => {
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
      startRequestInsight({ requestId: testCase.requestId })
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

    startRequestInsight({ requestId: 'oversized' })
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

    startRequestInsight({ requestId: 'query-name' })
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

  it('rotates concurrent appends at whole UTF-8 NDJSON records without truncating an open reader', async () => {
    await withJournal(async (distDir) => {
      const requests = Array.from({ length: 60 }, (_, i) => ({
        ...journalRequest(`concurrent-${i}`),
        url: 'é'.repeat(96 * 1024),
      }))
      const handle = await open(journalFile(distDir), 'r')
      try {
        await Promise.all(
          requests.map(async (request, index) => {
            appendRequestInsightToJournal(request)
            // Recover the existing UTF-8 byte size while more writes are queued.
            if (index === 30) await configureRequestInsightsJournal(distDir)
          })
        )
        await getRequestInsightsHistory(distDir)
        const names = await archiveNames(distDir)
        expect(names).toHaveLength(1)
        const archived = await readArchive(distDir, names[0])
        expect((await handle.readFile()).equals(archived)).toBe(true)
        const active = await readFile(journalFile(distDir))
        const ids: string[] = []
        for (const content of [archived, active]) {
          expect(content.length).toBeLessThanOrEqual(10 * 1024 * 1024)
          expect(content.toString().endsWith('\n')).toBe(true)
          for (const line of content.toString().trimEnd().split('\n')) {
            ids.push(JSON.parse(line).request.requestId)
          }
        }
        expect(ids).toEqual(requests.map((request) => request.requestId))
      } finally {
        await handle.close()
      }
    })
  })

  it('keeps one oversized record intact and rotates it before the next append', async () => {
    await withJournal(async (distDir) => {
      const request = {
        ...journalRequest('oversized-record'),
        url: 'x'.repeat(10 * 1024 * 1024),
      }
      appendRequestInsightToJournal(request)
      expect(await readRequestInsightsJournal(distDir)).toEqual([request])
      expect(await archiveNames(distDir)).toEqual([])
      appendRequestInsightToJournal(journalRequest('after-oversized'))
      expect(
        (await readRequestInsightsJournal(distDir)).map(
          (entry) => entry.requestId
        )
      ).toEqual(['after-oversized'])
      expect(await archiveNames(distDir)).toHaveLength(1)
      expect(
        await readRequestInsightsJournal(distDir, {
          requestId: request.requestId,
        })
      ).toEqual([request])
    })
  })

  it('names archives by UTC bounds, rounds outward and suffixes only collisions', async () => {
    await withJournal(async (distDir) => {
      const requests = [
        journalRequest('later', Date.parse('2026-11-17T10:15:00.100Z')),
        journalRequest('earlier', Date.parse('2026-11-17T09:00:00.200Z')),
      ]
      for (let i = 0; i < 3; i++) {
        requests.forEach(appendRequestInsightToJournal)
        await initializeRequestInsightsJournal(distDir)
      }
      expect(await archiveNames(distDir)).toEqual([
        '20261117T090000Z--20261117T101501Z-1.ndjson.gz',
        '20261117T090000Z--20261117T101501Z-2.ndjson.gz',
        '20261117T090000Z--20261117T101501Z.ndjson.gz',
      ])
      for (const name of await archiveNames(distDir)) {
        const content = (await readArchive(distDir, name)).toString()
        expect(content.split('\n').filter(Boolean)).toHaveLength(2)
      }
    })
  })

  it('scans startup timestamps and safely archives a malformed file with unknown bounds', async () => {
    await withJournal(async (distDir) => {
      await writeFile(journalFile(distDir), 'not JSON\n{"version":1,"request":')
      await initializeRequestInsightsJournal(distDir)
      expect(await archiveNames(distDir)).toEqual(['unknown.ndjson.gz'])
      await writeFile(
        journalFile(distDir),
        `${journalLine(journalRequest('from-disk'))}{broken\n`
      )
      await initializeRequestInsightsJournal(distDir)
      expect(await archiveNames(distDir)).toHaveLength(2)
      expect(
        (
          await readRequestInsightsJournal(distDir, { requestId: 'from-disk' })
        ).map((entry) => entry.requestId)
      ).toEqual(['from-disk'])
    })
  })

  it('keeps rotation order when overlapping ranges close in the same clock tick', async () => {
    await withJournal(async (distDir) => {
      const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now())
      try {
        const first = journalRequest('same-id')
        appendRequestInsightToJournal(first)
        appendRequestInsightToJournal(
          journalRequest('later-start', Date.parse('2026-11-17T11:00:00.000Z'))
        )
        await initializeRequestInsightsJournal(distDir)
        const second = { ...first, url: '/newer' }
        appendRequestInsightToJournal(second)
        await initializeRequestInsightsJournal(distDir)
        expect(
          await readRequestInsightsJournal(distDir, {
            requestId: first.requestId,
          })
        ).toEqual([second])
      } finally {
        clock.mockRestore()
      }
    })
  })

  it('replays gzip archives in rotation order with active snapshots, filters and limits', async () => {
    await withJournal(async (distDir) => {
      const first = journalRequest('first')
      const second = journalRequest('second')
      const span = { name: 'late work', startTime: first.startTime + 1 }
      const instant: RequestInsight = { ...first, kind: 'instant-insights' }
      const oldTime = Date.now() - 3000
      // Alphabetical range order differs from close order. Replay uses rotation mtime.
      await writeArchive(
        distDir,
        '20261117T110000Z--20261117T110000Z',
        journalLine(first) + journalLine(instant),
        oldTime
      )
      await writeArchive(
        distDir,
        '20261117T090000Z--20261117T090000Z',
        JSON.stringify({ version: 2, request: first, span }) +
          '\n' +
          journalLine(second),
        oldTime + 1000
      )
      const read = readRequestInsightsJournal.bind(null, distDir)
      expect(
        (await read({ requestId: 'first', kind: 'request' }))[0].spans
      ).toEqual([span])
      expect(await read()).toEqual([])
      expect((await getRequestInsightsHistory(distDir)).requests).toEqual([])
      expect(
        await read({ htmlRequestId: first.htmlRequestId, limit: 1 })
      ).toEqual([second])
      expect(
        await read({ requestId: 'first', kind: 'instant-insights' })
      ).toEqual([instant])
      const updated = { ...first, url: '/new-snapshot' }
      appendRequestInsightToJournal(updated)
      expect(await read({ requestId: 'first', kind: 'request' })).toEqual([
        updated,
      ])
      expect(await read({ requestId: 'first', limit: 0 })).toEqual([])
    })
  })

  it('isolates malformed archive records and a corrupt gzip from healthy history', async () => {
    await withJournal(async (distDir) => {
      const request = journalRequest('healthy')
      await writeArchive(
        distDir,
        'unknown',
        'broken JSON\nnull\n' +
          JSON.stringify({
            version: 1,
            request: { ...request, kind: { toString: null } },
          }) +
          '\n' +
          journalLine(request) +
          '{"version":1,"request":',
        Date.now() - 1000
      )
      await writeFile(journalFile(distDir, 'unknown-1.ndjson.gz'), 'not gzip')
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        expect(
          await readRequestInsightsJournal(distDir, { requestId: 'healthy' })
        ).toEqual([request])
        expect(warn).toHaveBeenCalled()
      } finally {
        warn.mockRestore()
      }
    })
  })

  it('recovers interrupted gzip output and prefers a published gzip over duplicate source', async () => {
    await withJournal(async (distDir) => {
      const directory = path.dirname(journalFile(distDir))
      const request = journalRequest('recoverable')
      const source = path.join(directory, 'unknown.ndjson')
      await writeFile(source, journalLine(request))
      await writeFile(`${source}.gz.tmp`, 'partial gzip')
      expect(
        await readRequestInsightsJournal(distDir, {
          requestId: request.requestId,
        })
      ).toEqual([request])
      await initializeRequestInsightsJournal(distDir)
      expect(await readdir(directory)).toEqual(
        expect.arrayContaining(['unknown.ndjson.gz', 'request-insights.ndjson'])
      )
      expect(await readdir(directory)).not.toEqual(
        expect.arrayContaining(['unknown.ndjson', 'unknown.ndjson.gz.tmp'])
      )
      await writeFile(source, journalLine({ ...request, url: '/unpublished' }))
      expect(
        await readRequestInsightsJournal(distDir, {
          requestId: request.requestId,
        })
      ).toEqual([request])
      await initializeRequestInsightsJournal(distDir)
      expect(await archiveNames(distDir)).toEqual(['unknown.ndjson.gz'])
      expect(await readdir(directory)).not.toContain('unknown.ndjson')
    })
  })

  it('keeps the closed source readable after compression fails and retries later', async () => {
    await withJournal(async (distDir) => {
      const source = journalFile(distDir, 'unknown.ndjson')
      const request = journalRequest('compression-retry')
      await writeFile(source, journalLine(request))
      // A real conflicting directory makes exclusive gzip output creation fail.
      await mkdir(`${source}.gz.tmp`)
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        await initializeRequestInsightsJournal(distDir)
        expect(warn).toHaveBeenCalled()
        appendRequestInsightToJournal(journalRequest('still-writing'))
        expect(
          (await readRequestInsightsJournal(distDir)).map(
            (entry) => entry.requestId
          )
        ).toEqual(['still-writing'])
        expect(
          await readRequestInsightsJournal(distDir, {
            requestId: request.requestId,
          })
        ).toEqual([request])
        expect(await readFile(source, 'utf8')).toBe(journalLine(request))
        await rm(`${source}.gz.tmp`, { recursive: true })
        await initializeRequestInsightsJournal(distDir)
        expect(await archiveNames(distDir)).toContain('unknown.ndjson.gz')
        expect(
          await readRequestInsightsJournal(distDir, {
            requestId: request.requestId,
          })
        ).toEqual([request])
      } finally {
        warn.mockRestore()
      }
    })
  })

  it('prunes archives older than seven days but protects newest, active and unrelated files', async () => {
    await withJournal(async (distDir) => {
      const now = Date.now()
      const day = 24 * 60 * 60 * 1000
      const data = journalLine(journalRequest('retained'))
      await writeArchive(distDir, 'unknown', data, now - 9 * day)
      await writeArchive(distDir, 'unknown-1', data, now - 8 * day)
      await writeArchive(distDir, 'unknown-2', data, now - day)
      const unrelated = journalFile(distDir, 'other.gz')
      await writeFile(unrelated, 'untouched')
      await initializeRequestInsightsJournal(distDir)
      expect(await archiveNames(distDir)).toEqual(['unknown-2.ndjson.gz'])
      const only = journalFile(distDir, 'unknown-2.ndjson.gz')
      await utimes(only, new Date(now - 20 * day), new Date(now - 20 * day))
      await initializeRequestInsightsJournal(distDir)
      expect(await archiveNames(distDir)).toEqual(['unknown-2.ndjson.gz'])
      expect(await readFile(journalFile(distDir), 'utf8')).toBe('')
      expect(await readFile(unrelated, 'utf8')).toBe('untouched')
    })
  })

  it('prunes oldest archives by actual compressed bytes, always preserving the newest', async () => {
    await withJournal(async (distDir) => {
      const directory = path.dirname(journalFile(distDir))
      for (let i = 0; i < 3; i++) {
        const file = await writeArchive(
          distDir,
          `unknown${i ? `-${i}` : ''}`,
          '',
          Date.now() - 3000 + i * 1000
        )
        const handle = await open(file, 'r+')
        try {
          // Sparse files exercise actual filesystem sizes without a 150-MiB allocation.
          await handle.truncate(40 * 1024 * 1024)
        } finally {
          await handle.close()
        }
        const time = new Date(Date.now() - 3000 + i * 1000)
        await utimes(file, time, time)
      }
      await initializeRequestInsightsJournal(distDir)
      expect(await archiveNames(distDir)).toEqual([
        'unknown-1.ndjson.gz',
        'unknown-2.ndjson.gz',
      ])
      const newest = path.join(directory, 'unknown-2.ndjson.gz')
      const handle = await open(newest, 'r+')
      try {
        await handle.truncate(101 * 1024 * 1024)
      } finally {
        await handle.close()
      }
      await initializeRequestInsightsJournal(distDir)
      expect(await archiveNames(distDir)).toEqual(['unknown-2.ndjson.gz'])
    })
  })

  it('enforces retention during an idle long-lived session and clears its timer on close', async () => {
    await withJournal(async (distDir) => {
      // Timers only are fake; filesystem reads, writes and compression remain real.
      await closeRequestInsightsJournal()
      jest.useFakeTimers({
        doNotFake: ['nextTick', 'setImmediate', 'hrtime', 'performance'],
      })
      try {
        await initializeRequestInsightsJournal(distDir)
        const now = Date.now()
        await writeArchive(
          distDir,
          'unknown',
          '',
          now - 8 * 24 * 60 * 60 * 1000
        )
        await writeArchive(distDir, 'unknown-1', '', now)
        jest.advanceTimersByTime(60 * 60 * 1000)
        await getRequestInsightsHistory(distDir)
        expect(await archiveNames(distDir)).toEqual(['unknown-1.ndjson.gz'])
        const initializing = initializeRequestInsightsJournal(distDir)
        await closeRequestInsightsJournal()
        await initializing
        expect(jest.getTimerCount()).toBe(0)
      } finally {
        jest.useRealTimers()
      }
    })
  })
})

function journalFile(
  distDir: string,
  name = 'request-insights.ndjson'
): string {
  return path.join(distDir, 'request-insights', name)
}

function journalRequest(
  requestId: string,
  startTime = Date.parse('2026-11-17T09:00:00.000Z')
): RequestInsight {
  return {
    requestId,
    htmlRequestId: 'page',
    startTime,
    source: 'page',
    status: 'ok',
    spans: [],
    fetches: [],
  }
}

function journalLine(request: RequestInsight): string {
  return JSON.stringify({ version: 1, request }) + '\n'
}

async function padJournal(distDir: string, size: number): Promise<void> {
  const current = (await stat(journalFile(distDir))).size
  const prefix = '{"padding":"'
  const suffix = '"}\n'
  await appendFile(
    journalFile(distDir),
    prefix + 'x'.repeat(size - current - prefix.length - suffix.length) + suffix
  )
}

async function archiveNames(distDir: string): Promise<string[]> {
  return (await readdir(path.dirname(journalFile(distDir))))
    .filter((name) => name.endsWith('.ndjson.gz'))
    .sort()
}

async function readArchive(distDir: string, name: string): Promise<Buffer> {
  return gunzipSync(await readFile(journalFile(distDir, name)))
}

async function writeArchive(
  distDir: string,
  basename: string,
  content: string,
  time: number
): Promise<string> {
  const file = journalFile(distDir, `${basename}.ndjson.gz`)
  await writeFile(file, gzipSync(content))
  await utimes(file, new Date(time), new Date(time))
  return file
}

async function withJournal(
  run: (distDir: string) => Promise<void>
): Promise<void> {
  const distDir = await mkdtemp(
    path.join(tmpdir(), 'request-insights-rotation-')
  )
  try {
    await initializeRequestInsightsJournal(distDir)
    await run(distDir)
  } finally {
    await closeRequestInsightsJournal()
    await rm(distDir, { recursive: true, force: true })
  }
}

function configureJournalProvider(distDir: string): void {
  configureRequestInsightsHistoryProvider({
    append: appendRequestInsightToJournal,
    appendUpdate: appendRequestInsightUpdateToJournal,
    appendArchivedUpdate: appendArchivedRequestInsightUpdateToJournal,
    getHistory: (query) => getRequestInsightsHistory(distDir, query),
    read: (query) => readRequestInsightsJournal(distDir, query),
  })
}
