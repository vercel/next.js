import {
  DecoderPromise,
  decoderConsole,
  decoderPerformance,
  decoderSetTimeout,
} from '../../../../packages/next/src/client/dev/react-decoder-host'
import {
  createBrowserReactTiming,
  setReactTimingSender,
} from '../../../../packages/next/src/client/dev/react-render-timing'
import { createBrowserReactTimingReceiver } from '../../../../packages/next/src/server/lib/trace/browser-react-timings'
import {
  clearRequestInsightsForTest,
  completeRequestInsight,
  getRequestInsightForDebugRequest,
  registerRequestInsightsExporter,
  setRequestInsightRootParent,
  startRequestInsight,
} from '../../../../packages/next/src/server/lib/trace/request-insights'
import {
  recordSpan,
  setSpanRecorderForTest,
  type SpanStoreRecord,
} from '../../../../packages/next/src/server/lib/trace/span-store'
import { NEXT_REQUEST_ID_HEADER } from '../../../../packages/next/src/client/components/app-router-headers'
import { HMR_MESSAGE_SENT_TO_SERVER } from '../../../../packages/next/src/server/dev/hot-reloader-types'
import { MAX_LIVE_COMPLETED_REQUEST_INSIGHTS } from '../../../../packages/next/src/shared/lib/request-insights'

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

describe('browser React timing transport', () => {
  const spans: SpanStoreRecord[] = []
  const receivers: ReturnType<typeof createBrowserReactTimingReceiver>[] = []

  function receiver(documentId = 'document', enabled = true) {
    const instance = createBrowserReactTimingReceiver(documentId, enabled)
    receivers.push(instance)
    return instance
  }

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

  it('continues accepting decoders beyond the recent decoder window', () => {
    start()
    finish()
    spans.length = 0
    const ingest = receiver()
    for (let i = 0; i < 130; i++) {
      ingest.receive({ ...message(), decoderId: String(i) }, 1000)
    }
    expect(spans).toHaveLength(130)
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
    const timing = createBrowserReactTiming({ [NEXT_REQUEST_ID_HEADER]: 'abc' })
    timing.run(() => {
      for (let index = 0; index < 257; index++) {
        decoderPerformance.measure(`Page${index}`, {
          start: index,
          end: index + 1,
          detail: { devtools: { trackGroup: 'Server Components ⚛' } },
        })
      }
    })
    jest.runOnlyPendingTimers()
    expect(
      spans.filter((span) => span.name === 'ReactServerComponents.component')
    ).toHaveLength(256)
    expect(
      spans.find((span) => span.name === 'ReactServerComponents.incomplete')
    ).toMatchObject({
      parentSpanId: 'server-parent',
      attributes: { 'next.rsc.observation_partial': true },
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

  it('bounds empty partial messages after the transport rate limit', () => {
    start()
    finish()
    spans.length = 0
    const ingest = receiver()
    const payload = message()
    for (let i = 0; i < 256; i++) {
      ingest.receive(
        { ...payload, records: Array(32).fill(payload.records[0]) },
        10_000
      )
    }
    ingest.receive(
      { ...payload, decoderId: '1', partial: true, records: [] },
      1000
    )
    expect(spans).toHaveLength(1)
    ingest.receive(payload, 1000)
    expect(spans).toHaveLength(2)
    expect(spans[1].name).toBe('ReactServerComponents.incomplete')
    ingest.receive(
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

  it('does not prefetch or drain the source and forwards cancellation', async () => {
    const pull = jest.fn((controller) =>
      controller.enqueue(new Uint8Array([1]))
    )
    const cancel = jest.fn()
    const source = new ReadableStream({ pull, cancel }, { highWaterMark: 0 })
    const timing = createBrowserReactTiming({ [NEXT_REQUEST_ID_HEADER]: 'abc' })
    const stream = timing.wrapStream(source)
    await Promise.resolve()
    expect(pull).not.toHaveBeenCalled()
    const reader = stream.getReader()
    expect((await reader.read()).value).toEqual(new Uint8Array([1]))
    expect(pull).toHaveBeenCalledTimes(1)
    await reader.cancel('stop')
    expect(cancel).toHaveBeenCalledWith('stop')
  })

  it('preserves stream error identity', async () => {
    const error = new Error('source failed')
    const timing = createBrowserReactTiming({ [NEXT_REQUEST_ID_HEADER]: 'abc' })
    const stream = timing.wrapStream(
      new ReadableStream({ pull: (controller) => controller.error(error) })
    )
    await expect(stream.getReader().read()).rejects.toBe(error)
  })

  it('queues native timings before HMR connects and sends late callbacks after EOF', async () => {
    jest.useFakeTimers({ doNotFake: ['performance'] })
    setReactTimingSender(undefined)
    const send = jest.fn()
    const timing = createBrowserReactTiming({ [NEXT_REQUEST_ID_HEADER]: 'abc' })
    const reader = timing
      .wrapStream(
        new ReadableStream({
          start(controller) {
            controller.close()
          },
        })
      )
      .getReader()
    await reader.read()
    timing.run(() => {
      decoderSetTimeout(() => {
        decoderPerformance.measure('Page', {
          start: 1,
          end: 2,
          detail: { devtools: { trackGroup: 'Server Components ⚛' } },
        })
      }, 0)
    })
    jest.runAllTimers()
    expect(send).not.toHaveBeenCalled()
    setReactTimingSender(send)
    expect(send).toHaveBeenCalledTimes(1)
    expect(JSON.parse(send.mock.calls[0][0])).toMatchObject({
      requestId: 'abc',
      records: [{ name: 'Page', durationMs: 1 }],
    })
    expect(jest.getTimerCount()).toBe(0)
  })

  it('keeps overlapping Promise.all continuations in their original requests', async () => {
    const send = jest.fn()
    setReactTimingSender(send)
    const globalPromise = Promise
    let release!: () => void
    const sharedChunk = new Promise<void>((resolve) => {
      release = resolve
    })
    const first = createBrowserReactTiming({ [NEXT_REQUEST_ID_HEADER]: 'a' })
    const second = createBrowserReactTiming({ [NEXT_REQUEST_ID_HEADER]: 'b' })
    function render(timing: typeof first, name: string) {
      return timing.run(() =>
        DecoderPromise.all([sharedChunk]).then(() => {
          decoderPerformance.measure(name, {
            start: 1,
            end: 3,
            detail: { devtools: { trackGroup: 'Server Components ⚛' } },
          })
        })
      )
    }
    const a = render(first, 'First')
    const b = render(second, 'Second')
    release()
    await Promise.all([a, b])
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(
      send.mock.calls.map(([message]) => {
        const parsed = JSON.parse(message)
        return [parsed.requestId, parsed.records[0].name]
      })
    ).toEqual([
      ['a', 'First'],
      ['b', 'Second'],
    ])
    expect(Promise).toBe(globalPromise)
  })

  it('retains an unsent batch across a closing socket and reconnect', () => {
    jest.useFakeTimers({ doNotFake: ['performance'] })
    const disconnected = jest.fn(() => false)
    setReactTimingSender(disconnected)
    const timing = createBrowserReactTiming({ [NEXT_REQUEST_ID_HEADER]: 'abc' })
    timing.run(() =>
      decoderPerformance.measure('Page', {
        start: 1,
        end: 2,
        detail: { devtools: { trackGroup: 'Server Components ⚛' } },
      })
    )
    jest.runAllTimers()
    expect(disconnected).toHaveBeenCalledTimes(1)
    const reconnected = jest.fn()
    setReactTimingSender(reconnected)
    expect(reconnected).toHaveBeenCalledTimes(1)
    expect(JSON.parse(reconnected.mock.calls[0][0])).toMatchObject({
      requestId: 'abc',
      records: [{ id: 'decoded:0', name: 'Page' }],
    })
    expect(jest.getTimerCount()).toBe(0)
  })

  it('forwards timestamp-only events without forwarding IO descriptions or props', async () => {
    jest.useFakeTimers({ doNotFake: ['performance'] })
    const send = jest.fn()
    setReactTimingSender(send)
    const timing = createBrowserReactTiming({ [NEXT_REQUEST_ID_HEADER]: 'a' })
    const timeStamp = console.timeStamp
    console.timeStamp = jest.fn()
    timing.run(() => {
      Reflect.apply(decoderConsole.timeStamp, decoderConsole, [
        'Component',
        1,
        2,
        'Primary',
        'Server Components ⚛',
      ])
      decoderPerformance.measure(
        'await fetch (https://example.test/?secret=1)',
        {
          start: 2,
          end: 3,
          detail: {
            devtools: {
              trackGroup: 'Server Components ⚛',
              properties: [['password', 'secret']],
            },
          },
        }
      )
    })
    jest.runAllTimers()
    const message = send.mock.calls[0][0]
    expect(
      JSON.parse(message).records.map((record: { name: string }) => record.name)
    ).toEqual(['Component', 'async work'])
    expect(message).not.toContain('secret')
    expect(message).not.toContain('password')
    console.timeStamp = timeStamp
  })

  it('preserves fetch response metadata and consumes its body once', async () => {
    const timing = createBrowserReactTiming({ [NEXT_REQUEST_ID_HEADER]: 'abc' })
    const source = new Response('flight', {
      status: 201,
      statusText: 'Created',
      headers: { 'x-test': 'value' },
    })
    Object.defineProperty(source, 'url', {
      value: 'http://localhost/navigation',
    })
    Object.defineProperty(source, 'redirected', { value: true })
    const response = await timing.wrapResponse(Promise.resolve(source))
    expect(response.url).toBe(source.url)
    expect(response.redirected).toBe(true)
    expect(response.status).toBe(201)
    expect(response.statusText).toBe('Created')
    expect(response.headers.get('x-test')).toBe('value')
    expect(source.bodyUsed).toBe(false)
    expect(await response.text()).toBe('flight')
    expect(source.bodyUsed).toBe(true)
  })

  it('does not invent unsupported browser timing APIs', () => {
    const descriptor = Object.getOwnPropertyDescriptor(performance, 'measure')
    Object.defineProperty(performance, 'measure', {
      value: undefined,
      configurable: true,
    })
    try {
      expect(decoderPerformance.measure).toBeUndefined()
      expect(decoderConsole.createTask).toBe(Reflect.get(console, 'createTask'))
    } finally {
      if (descriptor) Object.defineProperty(performance, 'measure', descriptor)
      else Reflect.deleteProperty(performance, 'measure')
    }
  })

  it('keeps native deduplication labels instead of treating them as environments', () => {
    jest.useFakeTimers({ doNotFake: ['performance'] })
    const send = jest.fn()
    setReactTimingSender(send)
    const timing = createBrowserReactTiming({ [NEXT_REQUEST_ID_HEADER]: 'a' })
    timing.run(() => {
      decoderPerformance.measure('CachedChild [deduped]', {
        start: 1,
        end: 3,
        detail: { devtools: { trackGroup: 'Server Components ⚛' } },
      })
    })
    jest.runAllTimers()
    expect(JSON.parse(send.mock.calls[0][0]).records[0]).toMatchObject({
      name: 'CachedChild [deduped]',
      environment: 'Unknown',
    })
  })

  it('does not include await task labels in owner paths', () => {
    jest.useFakeTimers({ doNotFake: ['performance'] })
    const descriptor = Object.getOwnPropertyDescriptor(console, 'createTask')
    Object.defineProperty(console, 'createTask', {
      configurable: true,
      value: () => ({ run: (callback: () => void) => callback() }),
    })
    const send = jest.fn()
    setReactTimingSender(send)
    try {
      const timing = createBrowserReactTiming({ [NEXT_REQUEST_ID_HEADER]: 'a' })
      timing.run(() => {
        decoderConsole.createTask!('await fetch (private URL)').run(() => {
          decoderPerformance.measure('await fetch (private URL)', {
            start: 1,
            end: 3,
            detail: { devtools: { trackGroup: 'Server Components ⚛' } },
          })
          decoderConsole.createTask!('<Child>').run(() => {
            decoderPerformance.measure('Child', {
              start: 3,
              end: 4,
              detail: { devtools: { trackGroup: 'Server Components ⚛' } },
            })
          })
        })
      })
      jest.runAllTimers()
      const records = JSON.parse(send.mock.calls[0][0]).records
      expect(records[0]).toMatchObject({
        name: 'async work',
        componentPath: '… › async work',
      })
      expect(records[1]).toMatchObject({
        name: 'Child',
        componentPath: '… › async work › Child',
        ownerName: 'async work',
      })
      expect(send.mock.calls[0][0]).not.toContain('private')
    } finally {
      if (descriptor) Object.defineProperty(console, 'createTask', descriptor)
      else Reflect.deleteProperty(console, 'createTask')
    }
  })

  it('preserves native outcomes without treating slow renders as errors or copying values', () => {
    jest.useFakeTimers({ doNotFake: ['performance'] })
    start()
    finish()
    spans.length = 0
    const ingest = receiver()
    const sent: string[] = []
    setReactTimingSender((payload) => {
      sent.push(payload)
      ingest.receive(JSON.parse(payload), payload.length)
    })
    const timing = createBrowserReactTiming({ [NEXT_REQUEST_ID_HEADER]: 'abc' })
    timing.run(() => {
      for (const [name, properties, tooltipText, color] of [
        ['Slow', [], undefined, 'error'],
        ['Failed', [['Error', 'private error']], 'Failed Errored', 'error'],
        [
          'Stopped',
          [['Aborted', 'private value']],
          'Stopped Aborted',
          'warning',
        ],
        [
          'await fetch (private url)',
          [['Rejected', 'private error']],
          'fetch Rejected',
          'error',
        ],
      ] as const) {
        decoderPerformance.measure(name, {
          start: 1,
          end: 601,
          detail: {
            devtools: {
              trackGroup: 'Server Components ⚛',
              color,
              properties,
              tooltipText,
            },
          },
        })
      }
    })
    jest.runAllTimers()
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
    ])
    expect(sent.join('')).not.toContain('private')
  })
})
