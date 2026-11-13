import { toHrTime } from '../../packages/next/src/server/lib/trace/utils'
import type { Span } from '../../packages/next/src/server/lib/trace/tracer'
import type { ReadableSpan, Sampler } from '@opentelemetry/sdk-trace'
import type { TraceEvent } from '../../packages/next/src/trace/types'

// Real dev/build behavior is covered by test/e2e/app-dir/otel-tooling.
// Keep only safety conditions that cannot be reliably induced in that fixture.
describe('tooling OTel safety', () => {
  let api: typeof import('@opentelemetry/api')
  let sdk: typeof import('@opentelemetry/sdk-trace')
  let backend: typeof import('../../packages/next/src/server/lib/trace/local-span-replay.node')
  let recorder: typeof import('../../packages/next/src/server/lib/trace/local-span-recorder')
  const linkedContext = {
    traceId: '0123456789abcdef0123456789abcdef',
    spanId: '0123456789abcdef',
    traceFlags: 1,
  }
  let meterProvider:
    | import('@opentelemetry/sdk-metrics').MeterProvider
    | undefined
  let tracing: typeof import('../../packages/next/src/trace/trace')
  let local: TraceEvent[]
  let exported: ReadableSpan[]

  beforeEach(() => {
    jest.resetModules()
    api = require('next/dist/compiled/@opentelemetry/api')
    api.trace.disable()
    api.metrics.disable()
    local = []
    exported = []
    jest.doMock('../../packages/next/src/trace/report', () => ({
      reporter: { report: (event: TraceEvent) => local.push(event) },
    }))
    tracing = require('../../packages/next/src/trace/trace')
    tracing.initializeTraceState({ lastId: 0 })
    sdk = require('@opentelemetry/sdk-trace')
    backend = require('../../packages/next/src/server/lib/trace/local-span-replay.node')
    recorder = require('../../packages/next/src/server/lib/trace/local-span-recorder')
  })

  afterEach(async () => {
    backend.closeReporting()
    await meterProvider?.shutdown()
    meterProvider = undefined
    jest.dontMock('../../packages/next/src/trace/report')
    jest.dontMock('../../packages/next/src/server/lib/trace/otel-api')
    api.trace.disable()
    api.metrics.disable()
    api.context.disable()
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  function installProvider(
    onStart: (span: ReadableSpan) => void = () => {},
    sampler?: Sampler
  ) {
    expect(
      api.trace.setGlobalTracerProvider(
        new sdk.TracerProvider({
          sampler,
          spanProcessors: [
            {
              onStart,
              onEnd: (span) => exported.push(span),
              async forceFlush() {},
              async shutdown() {},
            },
          ],
        })
      )
    ).toBe(true)
  }

  function installMeterProvider() {
    const {
      MeterProvider,
      InMemoryMetricExporter,
      PeriodicExportingMetricReader,
      AggregationTemporality,
    } =
      require('@opentelemetry/sdk-metrics') as typeof import('@opentelemetry/sdk-metrics')
    const exporter = new InMemoryMetricExporter(
      AggregationTemporality.CUMULATIVE
    )
    meterProvider = new MeterProvider({
      readers: [
        new PeriodicExportingMetricReader({
          exporter,
          exportIntervalMillis: 60000,
        }),
      ],
    })
    expect(api.metrics.setGlobalMeterProvider(meterProvider)).toBe(true)
    return async () => {
      await meterProvider!.forceFlush()
      return exporter
        .getMetrics()
        .flatMap(({ scopeMetrics }) =>
          scopeMetrics.flatMap(({ metrics }) => metrics)
        )
    }
  }

  function histogram(
    name: string,
    operation: string,
    count: number,
    sum: number
  ) {
    return expect.objectContaining({
      descriptor: expect.objectContaining({ name: `next.tooling.${name}` }),
      dataPoints: [
        expect.objectContaining({
          attributes: { operation },
          value: expect.objectContaining({ count, sum }),
        }),
      ],
    })
  }

  function child(
    name: string,
    parent?: Span | number | null,
    options: Partial<Parameters<typeof tracing.createTraceSpan>[0]> = {}
  ) {
    return tracing.createTraceSpan({
      name,
      parent,
      reportToOtel: true,
      ...options,
    })
  }

  it('replays spans with a caller-owned delivery and inherits their reporting parent', () => {
    const deliver = jest.fn()
    const root = recorder.createRecordingSpan(
      { name: 'root', reportToOtel: true, reportingRoot: true },
      deliver
    )
    const middle = recorder.createRecordingSpan(
      { name: 'middle', parent: root },
      deliver
    )
    const child = recorder.createRecordingSpan(
      { name: 'child', parent: middle, reportToOtel: true },
      deliver
    )
    child.end()
    middle.end()
    installProvider()
    backend.enableReporting()
    root.end()
    expectExported('child', 'root')
    expect(exported[0].parentSpanContext?.spanId).toBe(
      exported[1].spanContext().spanId
    )
    expect(deliver).toHaveBeenCalledTimes(3)
    expect(local).toEqual([])
  })

  function expectExported(...names: string[]) {
    expect(exported.map((span) => span.name)).toEqual(names)
  }

  it.each(['early', 'live'])(
    'preserves completed parents for %s object and numeric children',
    (mode) => {
      installProvider()
      const root = buildRoot()
      if (mode === 'live') backend.enableReporting()
      const parent = child('parent', root)
      const parentId = tracing.getTraceSpanSource(parent)!.id
      parent.end()
      child('object-child', parent).end()
      child('numeric-child', parentId).end()
      const middle = child('local-only', parent, { reportToOtel: false })
      middle.end()
      child('descendant', middle).end()
      if (mode === 'early') backend.enableReporting()
      root.end()

      expectExported(
        'parent',
        'object-child',
        'numeric-child',
        'descendant',
        'next-build'
      )
      for (const span of exported.slice(1, 4)) {
        expect(span.parentSpanContext?.spanId).toBe(
          exported[0].spanContext().spanId
        )
      }
    }
  )

  it.each(['early', 'live'])(
    'samples %s spans using their initial attributes',
    (mode) => {
      installProvider(undefined, {
        shouldSample: (_context, _traceId, _name, _kind, attributes) => ({
          decision:
            attributes.sample === true
              ? sdk.SamplingDecision.RECORD_AND_SAMPLED
              : sdk.SamplingDecision.NOT_RECORD,
        }),
        toString: () => 'AttributeSampler',
      })
      const root = buildRoot()
      if (mode === 'live') backend.enableReporting()
      const selected = child('selected', root, { attributes: { sample: true } })
      const rejected = child('rejected', root, {
        attributes: { sample: false },
      })
      selected.setAttribute('sample', false)
      rejected.setAttribute('sample', true)
      if (mode === 'early') backend.enableReporting()
      selected.end()
      rejected.end()
      root.end()

      expectExported('selected')
      expect(exported[0].attributes.sample).toBe(false)
    }
  )

  it.each(['close', 'restart', 'worker'])(
    'releases retained contexts on session %s',
    (mode) => {
      installProvider()
      const root = backend.startSpan(
        { id: 1, name: 'root', start: BigInt(0) },
        true
      )!
      backend.enableReporting()
      const record = backend.startSpan({
        id: 2,
        parentId: 1,
        name: 'child',
        start: BigInt(0),
      })!
      backend.completeSpan(record, { end: BigInt(1) })
      expect(root.session.records.has(record.id)).toBe(false)
      expect(root.session.contexts.size).toBe(2)

      if (mode === 'close') backend.closeReporting()
      else if (mode === 'worker') backend.configureState(undefined, true)
      else
        backend.startSpan({ id: 1, name: 'next-root', start: BigInt(0) }, true)

      expect(root.session.contexts.size).toBe(0)
      expect(root.session.records.size).toBe(0)
    }
  )

  function replay(
    ...events: (Partial<TraceEvent> & Pick<TraceEvent, 'id' | 'name'>)[]
  ) {
    const records = events.map((event) => ({
      timestamp: 1,
      duration: 1,
      ...event,
    }))
    tracing.recordTraceEvents(
      records,
      records.map(({ id, parentId }) => ({ id, parentId }))
    )
  }

  function observe(
    name: string,
    attributes: Record<string, unknown>,
    parent?: Span
  ) {
    tracing.recordSpan({ name, attributes, reportToOtel: true }, parent)
  }

  function buildRoot(name = 'next-build') {
    return new tracing.Span({
      name,
      reportToOtel: true,
      reportingRoot: true,
    }).recorder
  }

  it('keeps legacy trace tags while normalizing OTel attributes', () => {
    const root = new tracing.Span({
      name: 'next-build',
      attrs: { metadata: { nested: true } },
      reportToOtel: true,
      reportingRoot: true,
    })
    installProvider()
    backend.enableReporting()
    root.stop()

    expect(local[0].tags?.metadata).toEqual({ nested: true })
    expect(exported[0].attributes.metadata).toBe('{"nested":true}')
  })

  it.each(['live', 'early'])(
    'preserves processor names for untouched %s local spans',
    (mode) => {
      const root = buildRoot()
      installProvider((span) => {
        if (span.name === 'local-operation') {
          ;(span as ReadableSpan & Span).updateName('processor-operation')
        }
      })
      if (mode === 'live') backend.enableReporting()
      child('local-operation', root).end()
      if (mode === 'early') backend.enableReporting()
      root.end()

      expectExported('processor-operation', 'next-build')
      expect(local.map((event) => event.name)).toEqual([
        'local-operation',
        'next-build',
      ])
    }
  )

  it.each(['renamed-operation', 'local-operation'])(
    'preserves explicit local name %s when SDK start completes the span',
    (name) => {
      const root = buildRoot()
      const operation = child('local-operation', root)
      installProvider((span) => {
        if (span.name === 'local-operation') {
          ;(span as ReadableSpan & Span).updateName('processor-operation')
          operation.updateName(name)
          operation.end()
        }
      })
      backend.enableReporting()
      operation.end()
      root.end()

      expectExported(name, 'next-build')
      expect(local.map((event) => event.name)).toEqual([name, 'next-build'])
    }
  )

  it('forwards live request mutations through the shared recorder exactly once', () => {
    const started: ReadableSpan[] = []
    installProvider((span) => started.push(span))
    const root = buildRoot()
    backend.enableReporting()
    const delivery = jest.fn()
    const operation = recorder.createRecordingSpan(
      {
        name: 'operation',
        openTelemetry: { options: {}, context: api.ROOT_CONTEXT },
      },
      delivery
    )
    const delegate = started.find((span) => span.name === 'operation')!
    expect(recorder.getOpenTelemetrySpan(operation)).toBe(delegate)
    operation.setAttribute('phase', 'running')
    operation.setAttributes({ operation: 'request' })
    operation.addEvent('checkpoint', { phase: 'running' })
    operation.recordException(new TypeError('operation failed'))
    operation.setStatus({ code: api.SpanStatusCode.ERROR, message: 'failed' })
    operation.updateName('finished')
    expect(delegate.attributes).toMatchObject({
      phase: 'running',
      operation: 'request',
    })
    expect(delegate.name).toBe('finished')
    expect(delegate.status).toEqual({
      code: api.SpanStatusCode.ERROR,
      message: 'failed',
    })
    expect(delegate.events.map((event) => event.name)).toEqual([
      'checkpoint',
      'exception',
    ])
    expect(delegate.events[1].attributes?.['exception.stacktrace']).toEqual(
      expect.any(String)
    )
    operation.end()
    operation.end()
    root.end()
    expectExported('finished', 'next-build')
    expect(delegate.events).toHaveLength(2)
    expect(delivery).toHaveBeenCalledTimes(1)
  })

  it('replays early local span mutations with their original timestamps', () => {
    const root = buildRoot()
    const early = child('early-operation', root, {
      attributes: { initial: 'captured' },
      links: [
        {
          context: linkedContext,
          attributes: { source: 'linked-work' },
        },
      ],
    })
    const start = (
      require('../../packages/next/src/trace/trace') as typeof import('../../packages/next/src/trace/trace')
    ).getTraceSpanSource(early)!.startTime
    const end = start + BigInt(123_456_789)
    early.setAttribute('phase', 'completed')
    early.addEvent(
      'checkpoint',
      { phase: 'completed' },
      [1_700_000_000, 123_000_000]
    )
    early.recordException(
      new TypeError('early failure'),
      [1_700_000_000, 456_000_000]
    )
    early.setStatus({
      code: api.SpanStatusCode.ERROR,
      message: 'early failure',
    })
    early.updateName('early-operation-finished')
    early.end(toHrTime(backend.epochTime(end)))
    early.end()

    const sampler = new sdk.AlwaysOnSampler()
    const shouldSample = jest.spyOn(sampler, 'shouldSample')
    installProvider(undefined, sampler)
    backend.enableReporting()
    root.end()

    expectExported('early-operation-finished', 'next-build')
    const [span, exportedRoot] = exported
    expect(span.parentSpanContext?.spanId).toBe(
      exportedRoot.spanContext().spanId
    )
    expect(span.startTime).toEqual(toHrTime(backend.epochTime(start)))
    expect(span.endTime).toEqual(toHrTime(backend.epochTime(end)))
    expect(span.attributes).toMatchObject({
      initial: 'captured',
      phase: 'completed',
    })
    expect(span.status).toEqual({
      code: api.SpanStatusCode.ERROR,
      message: 'early failure',
    })
    expect(span.events).toEqual([
      expect.objectContaining({
        name: 'checkpoint',
        time: [1_700_000_000, 123_000_000],
        attributes: { phase: 'completed' },
      }),
      expect.objectContaining({
        name: 'exception',
        time: [1_700_000_000, 456_000_000],
        attributes: expect.objectContaining({
          'exception.type': 'TypeError',
          'exception.message': 'early failure',
        }),
      }),
    ])
    expect(span.links).toHaveLength(1)
    expect(span.links[0].context.traceId).toBe(linkedContext.traceId)
    expect(span.links[0].context.spanId).toBe(linkedContext.spanId)
    expect(span.links[0].attributes).toEqual({ source: 'linked-work' })
    expect(shouldSample).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      'early-operation-finished',
      expect.any(Number),
      expect.objectContaining({ initial: 'captured', phase: 'completed' }),
      expect.any(Array)
    )
  })

  it('preserves mixed span events across SDK registration and the final name', () => {
    const root = buildRoot()
    const operation = child('mixed-operation', root)
    operation.addEvent('before-registration', { order: 1 })
    operation.recordException(new TypeError('before failure'))
    installProvider()
    backend.enableReporting()
    operation.addEvent('after-registration', { order: 3 })
    operation.recordException(new RangeError('after failure'))
    operation.addEvent('after-error', { order: 5 })
    operation.updateName('mixed-operation-finished')
    operation.end()
    root.end()

    expectExported('mixed-operation-finished', 'next-build')
    expect(exported[0].events).toMatchObject([
      { name: 'before-registration', attributes: { order: 1 } },
      {
        name: 'exception',
        attributes: {
          'exception.type': 'TypeError',
          'exception.message': 'before failure',
        },
      },
      { name: 'after-registration', attributes: { order: 3 } },
      {
        name: 'exception',
        attributes: {
          'exception.type': 'RangeError',
          'exception.message': 'after failure',
        },
      },
      { name: 'after-error', attributes: { order: 5 } },
    ])
    expect(
      local.find((event) => event.name === 'mixed-operation-finished')
    ).toBeDefined()
  })

  it('bounds replay by event count while accepting large early and live payloads', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const serialize = jest.fn(() => ['linked-value'])
    const values = Object.assign(['linked-value'], { toJSON: serialize })
    const payload = 'x'.repeat(8 * 1024 * 1024)
    const large = (name: string) => {
      const span = child(name, undefined, {
        links: [{ context: linkedContext, attributes: { values } }],
      })
      span.setAttribute('payload', payload)
      span.end()
    }
    large('early-large')
    expect(warn).not.toHaveBeenCalled()
    for (let i = 0; i < 999; i++) child('ordinary').end()
    const root = buildRoot()
    root.setAttribute('payload', 'x'.repeat(1024))
    root.end()
    expect(local).toHaveLength(1001)
    installProvider()
    backend.enableReporting()
    expect(exported).toHaveLength(1000)
    expect(
      exported.find((span) => span.name === 'next-build')?.attributes.payload
    ).toHaveLength(1024)
    large('live-large')
    expect(exported).toHaveLength(1001)
    for (const name of ['early-large', 'live-large']) {
      const span = exported.find((span) => span.name === name)!
      expect(span.attributes.payload).toBe(payload)
      expect(span.links[0].attributes?.values).toEqual(['linked-value'])
      expect(
        local.find((event) => event.name === name)?.tags?.payload
      ).toHaveLength(payload.length)
    }
    expect(serialize).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('bounds worker batches queued before registration', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const root = buildRoot()
    replay(
      ...Array.from({ length: 1_000 }, (_, index) => ({
        id: 10_000 + index,
        name: `worker-${index}`,
      }))
    )
    installProvider()
    backend.enableReporting()
    root.end()

    expect(exported).toHaveLength(1_000)
    expect(exported.some((span) => span.name === 'worker-998')).toBe(true)
    expect(exported.some((span) => span.name === 'worker-999')).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('keeps local diagnostics when application SDK callbacks throw', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    installProvider(() => {
      throw new Error('application processor failure')
    })
    const root = buildRoot()
    backend.enableReporting()
    expect(() => child('child', root).end()).not.toThrow()
    expect(() => root.end()).not.toThrow()
    backend.closeReporting()
    expect(local.map((span) => span.name)).toEqual(['child', 'next-build'])
    expect(exported).toHaveLength(0)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it.each(['memory-usage', 'failed-start', 'failed-end'])(
    'releases completed %s replay records',
    (name) => {
      jest.spyOn(console, 'warn').mockImplementation(() => {})
      installProvider((span) => {
        if (span.name === 'failed-start') throw new Error('start failed')
        if (span.name === 'failed-end') {
          jest
            .spyOn(span as ReadableSpan & Span, 'end')
            .mockImplementation(() => {
              throw new Error('end failed')
            })
        }
      })
      const root = buildRoot()
      backend.enableReporting()
      const record = backend.startSpan({ id: 100, name, start: BigInt(0) })!
      backend.completeSpan(record, { end: BigInt(1) })

      expect(record.session.records.has(record.id)).toBe(false)
      expect(record.session.records.size).toBe(1)
      root.end()
    }
  )

  it('finishes reentrant SDK work without recursive entry or duplicate completion', () => {
    const root = buildRoot()
    let inside = false
    let recursive = false
    const starts = jest.fn(() => {
      recursive ||= inside
      inside = true
      if (starts.mock.calls.length === 1) {
        root.end()
        child('child', root).end()
      }
      inside = false
    })
    installProvider(starts)
    backend.enableReporting()
    expect(recursive).toBe(false)
    expect(starts).toHaveBeenCalledTimes(2)
    expect(local.map((span) => span.name)).toEqual(['next-build', 'child'])
    expectExported('next-build', 'child')
    expect(exported[1].parentSpanContext?.spanId).toBe(
      exported[0].spanContext().spanId
    )
  })

  it('retains out-of-order worker results without replacing a live coordinator parent', () => {
    const root = buildRoot()
    const parent = child('live-coordinator', root)
    const parentId = (
      require('../../packages/next/src/trace/trace') as typeof import('../../packages/next/src/trace/trace')
    ).getTraceSpanSource(parent)!.id
    const rootId = (
      require('../../packages/next/src/trace/trace') as typeof import('../../packages/next/src/trace/trace')
    ).getTraceSpanSource(root)!.id
    installProvider()
    backend.enableReporting()
    // Parallel workers inherit snapshots of the coordinator counter. Their
    // completion order and overlapping IDs must not filter distinct results.
    for (const id of [100, parentId]) {
      replay(
        { id: id + 1000, parentId: id, name: `worker-child-${id}` },
        { id, parentId: rootId, name: `worker-${id}` }
      )
    }
    expect(local.map((event) => event.name)).toEqual([
      'worker-child-100',
      'worker-100',
      `worker-child-${parentId}`,
      `worker-${parentId}`,
    ])
    child('numeric-child', parentId).end()
    parent.end()
    child('late-numeric-child', parentId).end()
    root.end()
    expectExported(
      'worker-100',
      'worker-child-100',
      `worker-${parentId}`,
      `worker-child-${parentId}`,
      'numeric-child',
      'live-coordinator',
      'late-numeric-child',
      'next-build'
    )
    for (const [childIndex, parentIndex] of [
      [1, 0],
      [3, 2],
      [4, 5],
      [6, 5],
    ]) {
      expect(exported[childIndex].parentSpanContext?.spanId).toBe(
        exported[parentIndex].spanContext().spanId
      )
    }
  })

  it.each(['on', 'off'])(
    'leaves recorded metrics available after close with trace sampling %s',
    async (sampling) => {
      const readMetrics = installMeterProvider()
      buildRoot()
      const native = child('turbopack-persistence', undefined, {
        attributes: { bytes_written: 1 },
      })
      const sampler =
        sampling === 'on'
          ? new sdk.AlwaysOnSampler()
          : new sdk.AlwaysOffSampler()
      const shouldSample = jest.spyOn(sampler, 'shouldSample')
      installProvider((span) => {
        if (span.name === 'turbopack-persistence') native.end()
      }, sampler)
      backend.enableReporting()
      native.end()
      child('turbopack-persistence', undefined, {
        attributes: { bytes_written: 2 },
      }).end()
      observe('turbopack-persistence', { bytes_written: 4 })
      child('server-restart-close-to-memory-threshold', undefined, {
        attributes: { 'memory.heapUsed': 100, 'memory.heapSizeLimit': 200 },
      }).end()
      backend.closeReporting()
      const metrics = await readMetrics()
      expect(metrics).toEqual(
        expect.arrayContaining([
          histogram('turbopack.bytes_written', 'turbopack-persistence', 3, 7),
          histogram(
            'memory.heap_used',
            'server-restart-close-to-memory-threshold',
            1,
            100
          ),
          histogram(
            'memory.heap_limit',
            'server-restart-close-to-memory-threshold',
            1,
            200
          ),
          expect.objectContaining({
            descriptor: expect.objectContaining({
              name: 'next.tooling.server.restarts',
            }),
            dataPoints: [
              expect.objectContaining({
                attributes: { reason: 'memory-threshold' },
                value: 1,
              }),
            ],
          }),
        ])
      )
      expect(shouldSample).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(String),
        'turbopack-persistence',
        expect.any(Number),
        expect.objectContaining({ bytes_written: 4 }),
        expect.any(Array)
      )
      if (sampling === 'off') expect(exported).toEqual([])
    }
  )

  it('keeps tooling traces when the application API has no metrics', () => {
    jest.doMock('../../packages/next/src/server/lib/trace/otel-api', () => {
      const actual = jest.requireActual(
        '../../packages/next/src/server/lib/trace/otel-api'
      )
      return { ...actual, api: { ...actual.api, metrics: undefined } }
    })
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    installProvider()
    const root = buildRoot()
    backend.enableReporting()
    observe('turbopack-persistence', { bytes_written: 1 }, root)
    observe('memory-usage', { 'memory.rss': 100 }, root)
    root.end()

    expectExported('turbopack-persistence', 'next-build')
    expect(local.map((event) => event.name)).toEqual([
      'turbopack-persistence',
      'memory-usage',
      'next-build',
    ])
    expect(warn).not.toHaveBeenCalled()
  })

  it('keeps root metric context for parentless operations', () => {
    const record = jest.fn()
    const add = jest.fn()
    expect(
      api.metrics.setGlobalMeterProvider({
        getMeter: () => ({
          createHistogram: () => ({ record }),
          createCounter: () => ({ add }),
        }),
      } as unknown as import('@opentelemetry/api').MeterProvider)
    ).toBe(true)
    const started: ReadableSpan[] = []
    installProvider((span) => started.push(span))
    const root = buildRoot()
    backend.enableReporting()

    child('memory-usage', null, { attributes: { 'memory.rss': 100 } }).end()
    child('server-restart-close-to-memory-threshold', null, {
      attributes: { 'memory.heapUsed': 50 },
    }).end()
    child('parentless-operation', null, {}).end()
    root.end()

    expect(record).toHaveBeenCalledTimes(2)
    expect(add).toHaveBeenCalledTimes(1)
    const rootContext = started[0].spanContext()
    for (const [, , context] of [...record.mock.calls, ...add.mock.calls]) {
      expect(api.trace.getSpanContext(context)).toEqual(rootContext)
    }
    expectExported('parentless-operation', 'next-build')
    expect(exported[0].parentSpanContext).toBeUndefined()
    expect(exported[0].spanContext().traceId).not.toBe(rootContext.traceId)
  })

  it('records metrics with a late meter provider and no trace provider', async () => {
    backend.enableReporting()
    child('turbopack-persistence', undefined, {
      attributes: { bytes_written: 1 },
    }).end()

    const readMetrics = installMeterProvider()
    child('turbopack-persistence', undefined, {
      attributes: { bytes_written: 2 },
    }).end()
    backend.closeReporting()
    expect(await readMetrics()).toEqual([
      histogram('turbopack.bytes_written', 'turbopack-persistence', 1, 2),
    ])
    expect(exported).toEqual([])
    expect(local.map((event) => event.name)).toEqual([
      'turbopack-persistence',
      'turbopack-persistence',
    ])
  })

  it('closes reporting without ending unfinished operations or accepting new ones', () => {
    installProvider()
    const root = buildRoot()
    backend.enableReporting()
    child('completed', root).end()
    backend.closeReporting()
    backend.closeReporting()
    child('after-close', root).end()
    root.end()
    expectExported('completed')
    expect(local.map((event) => event.name)).toEqual([
      'completed',
      'after-close',
      'next-build',
    ])
  })
})
