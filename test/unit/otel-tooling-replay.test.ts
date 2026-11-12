import { toHrTime } from '../../packages/next/src/server/lib/trace/utils'
import type { Span } from '@opentelemetry/api'
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
    options: Partial<Parameters<typeof recorder.createRecordingSpan>[0]> = {}
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

  function invalidate(action: string) {
    if (action === 'close') backend.closeReporting()
    else {
      const replacement = buildRoot('replacement-root')
      backend.enableReporting()
      child('replacement-child', replacement).end()
      replacement.end()
    }
  }

  function buildRoot(name = 'next-build') {
    return new tracing.Span({
      name,
      reportToOtel: true,
      reportingRoot: true,
    }).recorder
  }

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

  it('detaches early span and completed observation data without custom serializers', () => {
    const serialize = jest.fn(() => {
      throw new Error('custom serializer called')
    })
    const attributeValues = Object.assign(['attribute-before'], {
      toJSON: serialize,
    })
    const linkValues = Object.assign(['link-before'], { toJSON: serialize })
    const eventValues = Object.assign(['event-before'], { toJSON: serialize })
    const workerValues = Object.assign(['worker-before'], { toJSON: serialize })
    const observationValues = Object.assign(['observation-before'], {
      toJSON: serialize,
    })
    const link = {
      context: { ...linkedContext },
      attributes: { values: linkValues },
    }
    const root = buildRoot()
    const operation = child('early-copy', root, { links: [link] })
    link.context.spanId = 'fedcba9876543210'
    linkValues[0] = 'link-after'
    operation.setAttribute('values', attributeValues)
    operation.addEvent('checkpoint', { values: eventValues })
    operation.end()
    attributeValues[0] = 'attribute-after'
    eventValues[0] = 'event-after'

    const rootId = (
      require('../../packages/next/src/trace/trace') as typeof import('../../packages/next/src/trace/trace')
    ).getTraceSpanSource(root)!.id
    replay({
      id: 100,
      parentId: rootId,
      name: 'worker-copy',
      timestamp: 1,
      duration: 1,
      tags: { values: workerValues },
    })
    workerValues[0] = 'worker-after'
    observe('observation-copy', { values: observationValues }, root)
    observationValues[0] = 'observation-after'
    installProvider()
    backend.enableReporting()
    root.end()

    expectExported(
      'early-copy',
      'worker-copy',
      'observation-copy',
      'next-build'
    )
    expect(exported[0].attributes.values).toBe('["attribute-before"]')
    expect(exported[0].links[0]).toMatchObject({
      context: { spanId: '0123456789abcdef' },
      attributes: { values: ['link-before'] },
    })
    expect(exported[0].events[0]).toMatchObject({
      name: 'checkpoint',
      attributes: { values: ['event-before'] },
    })
    expect(exported[1].attributes.values).toBe('["worker-before"]')
    expect(exported[2].attributes.values).toBe('["observation-before"]')
    expect(serialize).not.toHaveBeenCalled()
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

  it.each(['explicit', 'getter'])(
    'keeps explicit status and ignores late writes when copying triggers %s failure',
    (failure) => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
      const root = buildRoot()
      const operation = child('clone-error', root)
      if (failure === 'explicit') {
        operation.setStatus({ code: api.SpanStatusCode.ERROR })
      }
      operation.setAttribute(
        'payload',
        Object.defineProperty([''], '0', {
          get() {
            if (failure === 'getter') operation.setAttribute('failed', true)
            throw new Error('attribute getter failed')
          },
        })
      )
      operation.end()
      child('after-clone-error', root).end()
      installProvider()
      backend.enableReporting()
      root.end()

      expectExported('clone-error', 'after-clone-error', 'next-build')
      expect(exported[0].status.code).toBe(
        failure === 'explicit'
          ? api.SpanStatusCode.ERROR
          : api.SpanStatusCode.UNSET
      )
      expect(exported[0].attributes.payload).toBeUndefined()
      expect(
        local.find((event) => event.name === 'clone-error')?.tags?.payload
      ).toBeInstanceOf(Array)
      if (failure === 'getter') {
        expect(
          local.find((event) => event.name === 'clone-error')?.tags?.failed
        ).toBeUndefined()
      }
      expect(warn).toHaveBeenCalledTimes(1)
    }
  )

  it.each(['close', 'reset'])(
    'rejects stale work when an SDK callback triggers %s',
    (action) => {
      const root = buildRoot()
      const invalidateReporting = jest.fn(() => {
        invalidate(action)
      })
      installProvider((span) => {
        if (span.name === 'next-build') invalidateReporting()
      })
      backend.enableReporting()
      root.end()
      expect(invalidateReporting).toHaveBeenCalled()
      expect(exported.map((span) => span.name).sort()).toEqual(
        action === 'close' ? [] : ['replacement-child', 'replacement-root']
      )
      expect(local.map((event) => event.name)).toEqual(
        expect.arrayContaining(['next-build'])
      )
    }
  )

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
      replay({
        id,
        parentId: rootId,
        name: `worker-${id}`,
        timestamp: 1,
        duration: 1,
      })
    }
    expect(local.map((event) => event.name)).toEqual([
      'worker-100',
      `worker-${parentId}`,
    ])
    child('numeric-child', parentId).end()
    parent.end()
    root.end()
    expectExported(
      'worker-100',
      `worker-${parentId}`,
      'numeric-child',
      'live-coordinator',
      'next-build'
    )
    expect(exported[2].parentSpanContext?.spanId).toBe(
      exported[3].spanContext().spanId
    )
  })

  it('parents worker children to the root when their parent SDK callback fails', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const root = buildRoot()
    const rootId = (
      require('../../packages/next/src/trace/trace') as typeof import('../../packages/next/src/trace/trace')
    ).getTraceSpanSource(root)!.id
    const parentName = 'worker-parent'

    replay(
      {
        id: 101,
        parentId: 100,
        name: 'worker-child',
        timestamp: 2,
        duration: 1,
      },
      {
        id: 100,
        parentId: rootId,
        name: parentName,
        timestamp: 1,
        duration: 3,
      }
    )
    installProvider((span) => {
      if (span.name === parentName) throw new Error('parent processor failed')
    })
    backend.enableReporting()
    root.end()

    expectExported('worker-child', 'next-build')
    expect(exported[0].parentSpanContext?.spanId).toBe(
      exported[1].spanContext().spanId
    )
    expect(exported[0].attributes['next.tooling.parent_id']).toBe(100)
    expect(local).toHaveLength(3)
    expect(local.some((event) => event.name === parentName)).toBe(true)
    expect(local.some((event) => event.name === 'worker-child')).toBe(true)
    expect(warn).toHaveBeenCalledTimes(1)
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
