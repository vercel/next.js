import {
  clearRequestInsightsForTest,
  getRequestInsightsSnapshot,
  registerRequestInsightsExporter,
  startRequestInsight,
} from './request-insights'
import {
  isLocalSpanRecordingEnabled,
  captureLocalSpanRecorder,
  isRequestInsightsEnabled,
  recordSpan,
  recordSpans,
  setLocalSpanExporter,
  runWithLocalSpanSink,
  setSpanRecorderForTest,
  type SpanStoreRecord,
} from './span-store'

const originalDevServer = process.env.__NEXT_DEV_SERVER

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }
}

describe('span recording', () => {
  beforeEach(() => {
    process.env.__NEXT_DEV_SERVER = '1'
  })

  afterEach(() => {
    restoreEnv('__NEXT_DEV_SERVER', originalDevServer)
    setSpanRecorderForTest(undefined)
    setLocalSpanExporter(undefined)
    clearRequestInsightsForTest()
  })

  it('records completed spans only when there is a consumer', () => {
    const records: SpanStoreRecord[] = []

    expect(isLocalSpanRecordingEnabled()).toBe(false)
    recordSpan({ name: 'test.unconsumed' })
    expect(records).toEqual([])

    setSpanRecorderForTest((span) => records.push(span))
    expect(isLocalSpanRecordingEnabled()).toBe(true)
    recordSpan({
      name: 'test.consumed',
      attributes: {
        'next.phase': 'render',
      },
    })

    expect(records).toEqual([
      expect.objectContaining({
        name: 'test.consumed',
        timestamp: expect.any(Number),
        attributes: {
          'next.phase': 'render',
        },
      }),
    ])
  })

  it('forwards request spans directly to request insights', () => {
    process.env.__NEXT_DEV_SERVER = 'true'
    registerRequestInsightsExporter()
    startRequestInsight({ requestId: 'req_1' })

    recordSpan({
      name: 'render route (app) /dashboard',
      startTime: 100,
      durationMs: 25,
      status: 'ok',
      requestId: 'req_1',
      route: '/dashboard',
    })

    expect(getRequestInsightsSnapshot()).toEqual({
      requests: [
        expect.objectContaining({
          requestId: 'req_1',
          route: '/dashboard',
          spans: [
            expect.objectContaining({
              name: 'render route (app) /dashboard',
              startTime: 100,
              durationMs: 25,
            }),
          ],
        }),
      ],
    })
  })

  it('scopes forwarded span recording without retaining it locally', () => {
    process.env.__NEXT_DEV_SERVER = 'true'
    const records: SpanStoreRecord[] = []

    runWithLocalSpanSink(
      (span) => records.push(span),
      () => {
        recordSpan({ name: 'worker span', requestId: 'req_worker' })
      }
    )

    expect(records).toEqual([
      expect.objectContaining({
        name: 'worker span',
        requestId: 'req_worker',
      }),
    ])
    expect(getRequestInsightsSnapshot()).toEqual({ requests: [] })
  })

  it('does not let a failing scoped sink interrupt span completion or the batch', () => {
    const records: SpanStoreRecord[] = []
    setSpanRecorderForTest((span) => records.push(span))
    const sink = jest.fn(() => {
      throw new Error('failed scoped sink')
    })
    const spans = [
      { name: 'first', timestamp: 1 },
      { name: 'second', timestamp: 2 },
    ]

    const record = runWithLocalSpanSink(sink, captureLocalSpanRecorder)
    expect(() => record(spans)).not.toThrow()
    expect(sink).toHaveBeenCalledTimes(2)
    expect(records).toEqual(spans)
    expect(() =>
      runWithLocalSpanSink(sink, () => recordSpan({ name: 'completed' }))
    ).not.toThrow()
    expect(records.map((span) => span.name)).toEqual([
      'first',
      'second',
      'completed',
    ])
  })

  it('keeps concurrent local span sinks isolated', async () => {
    const firstRecords: SpanStoreRecord[] = []
    const secondRecords: SpanStoreRecord[] = []
    let resumeFirst!: () => void
    let firstStarted!: () => void
    const firstPaused = new Promise<void>((resolve) => {
      resumeFirst = resolve
    })
    const firstReady = new Promise<void>((resolve) => {
      firstStarted = resolve
    })

    const first = runWithLocalSpanSink(
      (span) => firstRecords.push(span),
      async () => {
        recordSpan({ name: 'first before pause' })
        firstStarted()
        await firstPaused
        recordSpan({ name: 'first after pause' })
      }
    )

    await firstReady
    const second = runWithLocalSpanSink(
      (span) => secondRecords.push(span),
      async () => recordSpan({ name: 'second' })
    )
    resumeFirst()
    await Promise.all([first, second])

    expect(firstRecords.map((span) => span.name)).toEqual([
      'first before pause',
      'first after pause',
    ])
    expect(secondRecords.map((span) => span.name)).toEqual(['second'])
  })

  it('does not record spans outside the dev server', () => {
    const recorder = jest.fn()
    delete process.env.__NEXT_DEV_SERVER
    setSpanRecorderForTest(recorder)

    expect(isRequestInsightsEnabled()).toBe(false)
    expect(isLocalSpanRecordingEnabled()).toBe(false)

    recordSpan({ name: 'test.production', requestId: 'req_2' })
    expect(recorder).not.toHaveBeenCalled()
    expect(getRequestInsightsSnapshot()).toEqual({ requests: [] })
  })

  it('honors the experimental.requestInsights opt-out', () => {
    const original = process.env.__NEXT_REQUEST_INSIGHTS
    try {
      process.env.__NEXT_DEV_SERVER = 'true'
      delete process.env.__NEXT_REQUEST_INSIGHTS
      expect(isRequestInsightsEnabled()).toBe(true)
      process.env.__NEXT_REQUEST_INSIGHTS = 'false'
      expect(isRequestInsightsEnabled()).toBe(false)
    } finally {
      if (original === undefined) delete process.env.__NEXT_REQUEST_INSIGHTS
      else process.env.__NEXT_REQUEST_INSIGHTS = original
    }
  })

  it('captures the destination before a stream resumes in another context', () => {
    const first: SpanStoreRecord[] = []
    const second: SpanStoreRecord[] = []
    const record = runWithLocalSpanSink(
      (span) => first.push(span),
      captureLocalSpanRecorder
    )
    const span = { name: 'React render interval', timestamp: 1 }
    runWithLocalSpanSink(
      (recorded) => second.push(recorded),
      () => record([span])
    )

    expect(first).toEqual([span])
    expect(second).toEqual([])
    delete process.env.__NEXT_DEV_SERVER
    record([span])
    expect(first).toHaveLength(1)
  })

  it('exports a completed batch once without requiring Request Insights', () => {
    const exportSpans = jest.fn()
    setLocalSpanExporter({ isEnabled: () => true, export: exportSpans })
    const spans = [
      { name: 'first', timestamp: 1 },
      { name: 'second', timestamp: 2 },
    ]

    recordSpans(spans)

    expect(exportSpans).toHaveBeenCalledTimes(1)
    expect(exportSpans).toHaveBeenCalledWith(spans)
    expect(getRequestInsightsSnapshot()).toEqual({ requests: [] })
  })

  it('does not let a failing exporter interrupt application work', () => {
    setLocalSpanExporter({
      isEnabled: () => true,
      export() {
        throw new Error('failed exporter')
      },
    })

    expect(() => recordSpan({ name: 'render' })).not.toThrow()
  })
})
