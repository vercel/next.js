import {
  createReactDebugPerformanceId,
  setReactTimingSender,
} from '../../../client/dev/react-render-timing'
import { createBrowserReactTimingReceiver } from './browser-react-timings'
import {
  clearRequestInsightsForTest,
  completeRequestInsight,
  getRequestInsightForDebugRequest,
  registerRequestInsightsExporter,
  setRequestInsightRootParent,
  startRequestInsight,
} from './request-insights'
import {
  recordSpan,
  setSpanRecorderForTest,
  type SpanStoreRecord,
} from './span-store'
import { HMR_MESSAGE_SENT_TO_SERVER } from '../../dev/hot-reloader-types'
import { MAX_LIVE_COMPLETED_REQUEST_INSIGHTS } from '../../../shared/lib/request-insights'

const originalDevServer = process.env.__NEXT_DEV_SERVER
const originalRequestInsights = process.env.__NEXT_REQUEST_INSIGHTS

function start(requestId = 'server-owned', debugRequestId = 'abc') {
  startRequestInsight({
    requestId,
    debugRequestId,
    htmlRequestId: 'document',
  })
}

function finish(requestId = 'server-owned') {
  setRequestInsightRootParent(
    { requestId },
    { traceId: 'server-trace', spanId: 'server-parent' }
  )
  recordSpan({
    name: 'request',
    requestId,
    htmlRequestId: 'document',
    traceId: 'server-trace',
    spanId: 'server-parent',
    startTime: Date.now() - 20,
    durationMs: 20,
    attributes: { 'next.span_type': 'BaseServer.handleRequest' },
  })
  completeRequestInsight({ requestId })
}

function message(overrides = {}) {
  return {
    event: HMR_MESSAGE_SENT_TO_SERVER.REACT_DEBUG_TIMINGS,
    requestId: 'abc',
    decoderId: '0',
    records: [
      {
        id: 'decoded:0',
        kind: 'component',
        name: 'Page',
        environment: 'Server',
        startTime: Date.now() - 10,
        durationMs: 5,
        ...overrides,
      },
    ],
  }
}

let deliverMeasures: (entries: PerformanceMeasure[]) => void

function measure(
  debugPerformanceId: ReturnType<typeof createReactDebugPerformanceId>,
  name = 'Page',
  metadata: Record<string, unknown> = {}
): PerformanceMeasure {
  return {
    entryType: 'measure',
    name,
    startTime: 1,
    duration: 2,
    detail: {
      react: {
        version: 1,
        debugPerformanceId,
        kind: 'component',
        outcome: 'completed',
        environment: 'Server',
        ...metadata,
      },
      devtools: { properties: [['private', 'value']] },
    },
  } as PerformanceMeasure
}

describe('browser React timing transport', () => {
  const spans: SpanStoreRecord[] = []
  const receivers: ReturnType<typeof createBrowserReactTimingReceiver>[] = []

  function receiver(documentId = 'document', enabled = true) {
    const instance = createBrowserReactTimingReceiver(documentId, enabled)
    receivers.push(instance)
    return instance
  }

  const observerDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'PerformanceObserver'
  )
  beforeAll(() => {
    Object.defineProperty(globalThis, 'PerformanceObserver', {
      configurable: true,
      value: jest.fn((callback: PerformanceObserverCallback) => {
        deliverMeasures = (entries) =>
          callback(
            {
              getEntries: () => entries,
            } as unknown as PerformanceObserverEntryList,
            {} as PerformanceObserver
          )
        return { observe: jest.fn(), disconnect: jest.fn() }
      }),
    })
  })
  afterAll(() => {
    if (observerDescriptor)
      Object.defineProperty(
        globalThis,
        'PerformanceObserver',
        observerDescriptor
      )
    else Reflect.deleteProperty(globalThis, 'PerformanceObserver')
  })

  beforeEach(() => {
    process.env.__NEXT_DEV_SERVER = '1'
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    registerRequestInsightsExporter()
    setSpanRecorderForTest((span) => spans.push(span))
  })

  afterEach(() => {
    receivers.splice(0).forEach((instance) => instance.dispose())
    clearRequestInsightsForTest()
    setSpanRecorderForTest(undefined)
    spans.length = 0
    if (originalDevServer === undefined) delete process.env.__NEXT_DEV_SERVER
    else process.env.__NEXT_DEV_SERVER = originalDevServer
    if (originalRequestInsights === undefined) {
      delete process.env.__NEXT_REQUEST_INSIGHTS
    } else process.env.__NEXT_REQUEST_INSIGHTS = originalRequestInsights
    setReactTimingSender(undefined)
    jest.useRealTimers()
  })

  it('rejects unregistered parents and strips browser-supplied context', () => {
    start()
    const ingest = receiver()
    const payload = message({
      traceId: 'forged',
      parentSpanId: 'forged',
      requestId: 'forged',
      props: { secret: 'must not leave browser' },
    })
    ingest.receive(payload, JSON.stringify(payload).length)
    expect(spans).toEqual([])
    finish()
    expect(
      spans.filter((span) => span.name === 'ReactServerComponents.component')
    ).toEqual([])
    ingest.receive(payload, JSON.stringify(payload).length)
    const timing = spans.find(
      (span) => span.name === 'ReactServerComponents.component'
    )!
    expect(timing).toMatchObject({
      requestId: 'server-owned',
      traceId: 'server-trace',
      parentSpanId: 'server-parent',
      htmlRequestId: 'document',
    })
    expect(JSON.stringify(timing)).not.toMatch(/forged|secret|props/)
    ingest.receive(payload, JSON.stringify(payload).length)
    expect(spans.filter((span) => span.name === timing.name)).toHaveLength(1)
  })

  it('accepts later batches from the same decoder', () => {
    start()
    finish()
    spans.length = 0
    const ingest = receiver()
    ingest.receive(message(), 1000)
    ingest.receive(message({ id: 'decoded:1', name: 'Later' }), 1000)
    expect(spans.map((span) => span.attributes?.['next.span_name'])).toEqual([
      'render Page',
      'render Later',
    ])
  })

  it('does not replay records after reconnecting', () => {
    start()
    setRequestInsightRootParent(
      { requestId: 'server-owned' },
      { traceId: 'server-trace', spanId: 'server-parent' }
    )
    const first = receiver()
    first.receive(message(), 1000)
    completeRequestInsight({ requestId: 'server-owned' })
    first.dispose()
    receiver().receive(message(), 1000)
    expect(spans).toHaveLength(1)
    receiver().receive(message({ id: 'decoded:1' }), 1000)
    expect(spans).toHaveLength(2)
  })

  it('limits browser records for the whole request, across reconnects and time windows', () => {
    jest.useFakeTimers({ doNotFake: ['performance'] })
    start()
    finish()
    spans.length = 0
    const first = receiver()
    for (let batch = 0; batch < 257; batch++) {
      const records = Array.from(
        { length: 32 },
        (_, i) => message({ id: `decoded:${batch * 32 + i}` }).records[0]
      )
      first.receive({ ...message(), records }, 32_000)
    }
    expect(
      spans.filter((span) => span.name === 'ReactServerComponents.component')
    ).toHaveLength(8192)
    expect(
      spans.filter((span) => span.name === 'ReactServerComponents.incomplete')
    ).toHaveLength(1)
    first.dispose()
    jest.advanceTimersByTime(60_001)
    const second = receiver()
    const count = spans.length
    second.receive({ ...message(), decoderId: '1' }, 1000)
    second.receive(message({ id: 'decoded:9000' }), 1000)
    expect(spans).toHaveLength(count)
  })

  it('bounds retained UTF-8 bytes as well as the number of records', () => {
    start()
    finish()
    spans.length = 0
    const ingest = receiver()
    for (let i = 0; i < 1000; i++) {
      ingest.receive(
        message({
          id: `decoded:${i}`,
          name: '界'.repeat(256),
          componentPath: '界'.repeat(2048),
          source: {
            file: '界'.repeat(2048),
            line: 1,
            column: 1,
            methodName: 'Page',
          },
        }),
        32_000
      )
    }
    const timings = spans.filter(
      (span) => span.name === 'ReactServerComponents.component'
    )
    expect(timings.length).toBeGreaterThan(0)
    expect(timings.length).toBeLessThan(1000)
    expect(
      timings.reduce(
        (bytes, span) => bytes + Buffer.byteLength(JSON.stringify(span)),
        0
      )
    ).toBeLessThanOrEqual(8 * 1024 * 1024)
    expect(
      spans.filter((span) => span.name === 'ReactServerComponents.incomplete')
    ).toHaveLength(1)
    const count = spans.length
    receiver().receive({ ...message(), decoderId: '1' }, 1000)
    expect(spans).toHaveLength(count)
  })

  it('accepts initial HTML timings only from that document connection', () => {
    startRequestInsight({
      requestId: 'html-owned',
      htmlRequestId: 'html-owned',
    })
    startRequestInsight({
      requestId: 'html-owned',
      htmlRequestId: 'html-owned',
      kind: 'instant-insights',
    })
    setRequestInsightRootParent(
      { requestId: 'html-owned' },
      { traceId: 'trace', spanId: 'parent' }
    )
    const payload = { ...message(), requestId: 'html-owned' }
    receiver('other-document').receive(payload, 100)
    expect(spans).toHaveLength(0)
    receiver('html-owned').receive(payload, 100)
    expect(spans).toHaveLength(1)
    expect(spans[0]).toMatchObject({
      requestId: 'html-owned',
      traceId: 'trace',
      parentSpanId: 'parent',
    })
  })

  it('uses the registered server parent while the request is still streaming', () => {
    start()
    const identity = { requestId: 'server-owned' }
    setRequestInsightRootParent(identity, undefined)
    expect(
      getRequestInsightForDebugRequest('abc', 'document')?.parent
    ).toBeUndefined()
    setRequestInsightRootParent(identity, {
      traceId: 'live-trace',
      spanId: 'live-parent',
    })
    receiver().receive(message(), 1000)
    expect(spans).toHaveLength(1)
    expect(spans[0]).toMatchObject({
      requestId: 'server-owned',
      traceId: 'live-trace',
      parentSpanId: 'live-parent',
    })
  })

  it('does not register the proxy invocation as the page response parent', () => {
    start()
    setRequestInsightRootParent(
      { requestId: 'server-owned', source: 'proxy' },
      { traceId: 'proxy-trace', spanId: 'proxy-parent' }
    )
    expect(
      getRequestInsightForDebugRequest('abc', 'document')?.parent
    ).toBeUndefined()
    setRequestInsightRootParent(
      { requestId: 'server-owned' },
      { traceId: 'page-trace', spanId: 'page-parent' }
    )
    receiver().receive(message(), 1000)
    expect(spans).toHaveLength(1)
    expect(spans[0]).toMatchObject({
      traceId: 'page-trace',
      parentSpanId: 'page-parent',
    })
  })

  it('bounds decoder state without evicting replay protection', () => {
    start()
    finish()
    spans.length = 0
    const ingest = receiver()
    for (let i = 0; i < 130; i++) {
      ingest.receive({ ...message(), decoderId: String(i) }, 1000)
    }
    expect(
      spans.filter((span) => span.name === 'ReactServerComponents.component')
    ).toHaveLength(128)
    expect(
      spans.filter((span) => span.name === 'ReactServerComponents.incomplete')
    ).toHaveLength(1)
    receiver().receive(message(), 1000)
    expect(spans).toHaveLength(129)
  })

  it('marks bounded client transport loss as partial observation', () => {
    jest.useFakeTimers({ doNotFake: ['performance'] })
    start()
    finish()
    spans.length = 0
    const ingest = receiver()
    setReactTimingSender((payload) => {
      expect(payload.length).toBeLessThanOrEqual(64 * 1024)
      ingest.receive(JSON.parse(payload), payload.length)
    })
    const timing = createReactDebugPerformanceId('abc')
    deliverMeasures(
      Array.from({ length: 257 }, (_, index) => measure(timing, `Page${index}`))
    )
    jest.runOnlyPendingTimers()
    expect(
      spans.filter((span) => span.name === 'ReactServerComponents.component')
    ).toHaveLength(256)
    expect(
      spans.find((span) => span.name === 'ReactServerComponents.incomplete')
    ).toMatchObject({
      parentSpanId: 'server-parent',
      attributes: {
        'next.rsc.observation_partial': true,
        'next.rsc.incomplete_reason': 'transport',
      },
    })
  })

  it('rejects unknown requests, wrong documents and ambiguous reused IDs', () => {
    const ingest = receiver()
    ingest.receive(message(), 1000)
    start()
    finish()
    spans.length = 0
    receiver('another-document').receive(message(), 1000)
    start('other-server-request')
    ingest.receive(message(), 1000)
    expect(getRequestInsightForDebugRequest('abc', 'document')).toBeUndefined()
    expect(spans).toEqual([])
  })

  it('reports transport loss only once per request, including across reconnects', () => {
    start()
    finish()
    spans.length = 0
    const ingest = receiver()
    const payload = message()
    ingest.receive(payload, 1000)
    ingest.receive(
      { ...payload, decoderId: '1', partial: true, records: [] },
      1000
    )
    expect(spans).toHaveLength(2)
    expect(spans[1].name).toBe('ReactServerComponents.incomplete')
    receiver().receive(
      { ...payload, decoderId: '2', partial: true, records: [] },
      1000
    )
    expect(spans).toHaveLength(2)
  })

  it('releases request mappings with normal history eviction and reset', () => {
    start()
    finish()
    for (let i = 0; i < MAX_LIVE_COMPLETED_REQUEST_INSIGHTS; i++) {
      start(`request-${i}`, `f${i.toString(16)}`)
      finish(`request-${i}`)
    }
    expect(getRequestInsightForDebugRequest('abc', 'document')).toBeUndefined()
    expect(getRequestInsightForDebugRequest('f0', 'document')).toBeDefined()
    clearRequestInsightsForTest()
    expect(getRequestInsightForDebugRequest('f0', 'document')).toBeUndefined()
  })

  it.each([
    { durationMs: -1 },
    { durationMs: Infinity },
    { startTime: NaN },
    { name: 'x'.repeat(257) },
    { environment: {} },
    { kind: 'request' },
    { source: { file: 'app.tsx', methodName: 'Page', line: -1, column: 1 } },
  ])('rejects malformed timing records %p', (record) => {
    start()
    finish()
    spans.length = 0
    receiver().receive(message(record), 1000)
    expect(spans).toEqual([])
  })

  it('rejects oversized messages and batches and disabled recording', () => {
    start()
    finish()
    spans.length = 0
    const payload = message()
    const ingest = receiver()
    ingest.receive(payload, 64 * 1024 + 1)
    ingest.receive(
      { ...payload, records: Array(33).fill(payload.records[0]) },
      1000
    )
    receiver('document', false).receive(payload, 1000)
    process.env.__NEXT_REQUEST_INSIGHTS = 'false'
    ingest.receive(payload, 1000)
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    delete process.env.__NEXT_DEV_SERVER
    ingest.receive(payload, 1000)
    expect(spans).toEqual([])
  })

  it('queues observed timings before HMR connects and accepts delayed entries', () => {
    const timing = createReactDebugPerformanceId('abc')
    const send = jest.fn()
    deliverMeasures([measure(timing)])
    expect(send).not.toHaveBeenCalled()
    setReactTimingSender(send)
    expect(JSON.parse(send.mock.calls[0][0])).toMatchObject({
      requestId: 'abc',
      records: [{ name: 'Page', durationMs: 2 }],
    })
    deliverMeasures([measure(timing, 'Late')])
    expect(JSON.parse(send.mock.calls[1][0]).records[0].name).toBe('Late')
    expect(JSON.parse(send.mock.calls[1][0]).records[0].id).not.toBe(
      JSON.parse(send.mock.calls[0][0]).records[0].id
    )
  })

  it('attributes interleaved entries to their decoders and requests', () => {
    const first = createReactDebugPerformanceId('a')
    const second = createReactDebugPerformanceId('b')
    const send = jest.fn()
    setReactTimingSender(send)
    deliverMeasures([
      measure(second, 'Shared'),
      measure(first, 'Shared'),
      measure(second, 'Late'),
    ])
    expect(
      send.mock.calls.map(([payload]) => {
        const parsed = JSON.parse(payload)
        return [
          parsed.requestId,
          parsed.records.map((record: { name: string }) => record.name),
        ]
      })
    ).toEqual([
      ['b', ['Shared', 'Late']],
      ['a', ['Shared']],
    ])
  })

  it('flushes bounded groups without dropping concurrent decoders', () => {
    const send = jest.fn()
    setReactTimingSender(send)
    const timings = Array.from({ length: 40 }, (_, index) =>
      createReactDebugPerformanceId(`request-${index}`)
    )
    deliverMeasures(timings.map((timing) => measure(timing)))
    expect(send).toHaveBeenCalledTimes(40)
    expect(
      new Set(send.mock.calls.map(([payload]) => JSON.parse(payload).requestId))
        .size
    ).toBe(40)
  })

  it('does not opt in when PerformanceObserver is unavailable', () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      'PerformanceObserver'
    )!
    Object.defineProperty(globalThis, 'PerformanceObserver', {
      configurable: true,
      value: undefined,
    })
    try {
      expect(createReactDebugPerformanceId('abc')).toBeUndefined()
    } finally {
      Object.defineProperty(globalThis, 'PerformanceObserver', descriptor)
    }
  })

  it('retains an unsent batch across a closing socket and reconnect', () => {
    const timing = createReactDebugPerformanceId('abc')
    const disconnected = jest.fn(() => false)
    setReactTimingSender(disconnected)
    deliverMeasures([measure(timing)])
    expect(disconnected).toHaveBeenCalledTimes(1)
    const reconnected = jest.fn()
    setReactTimingSender(reconnected)
    expect(reconnected).toHaveBeenCalledTimes(1)
    expect(JSON.parse(reconnected.mock.calls[0][0])).toMatchObject({
      requestId: 'abc',
      records: [{ name: 'Page' }],
    })
  })

  it('ignores unrelated and malformed entries without losing subsequent timings', () => {
    const timing = createReactDebugPerformanceId('a')
    const send = jest.fn()
    setReactTimingSender(send)
    deliverMeasures([
      measure(timing, 'Unrelated', { version: 2 }),
      measure(timing, 'Unattributed', { debugPerformanceId: 'other-consumer' }),
      measure(timing, 'Malformed', {
        debugPerformanceId: 'next-request-insights:{',
      }),
      measure(timing, 'Invalid', { outcome: 'unknown' }),
      measure(timing, 'Valid'),
    ])
    expect(send).toHaveBeenCalledTimes(1)
    expect(
      JSON.parse(send.mock.calls[0][0]).records.map(
        (record: { name: string }) => record.name
      )
    ).toEqual(['Valid'])
  })

  it('uses explicit outcomes and environment without forwarding private details', () => {
    start()
    finish()
    spans.length = 0
    const ingest = receiver()
    const sent: string[] = []
    setReactTimingSender((payload) => {
      sent.push(payload)
      ingest.receive(JSON.parse(payload), payload.length)
    })
    const timing = createReactDebugPerformanceId('abc')
    deliverMeasures([
      measure(timing, '\u200bSlow'),
      measure(timing, '\u200bFailed', { outcome: 'errored' }),
      measure(timing, '\u200bStopped', { outcome: 'aborted' }),
      measure(timing, 'await fetch (private URL)', {
        kind: 'await',
        outcome: 'errored',
      }),
      measure(timing, 'CachedChild [deduped]', { environment: 'Cache' }),
    ])
    expect(
      spans.map((span) => [
        span.attributes?.['next.span_name'],
        span.status,
        span.attributes?.['next.rsc.outcome'],
      ])
    ).toEqual([
      ['render Slow', 'ok', 'completed'],
      ['render Failed', 'error', 'errored'],
      ['render Stopped', undefined, 'aborted'],
      ['await async work', 'error', 'errored'],
      ['render CachedChild [deduped]', 'ok', 'completed'],
    ])
    expect(spans[4].attributes?.['next.rsc.environment']).toBe('Cache')
    expect(sent.join('')).not.toContain('private')
  })
})
