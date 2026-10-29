import type { ReadableSpan } from '@opentelemetry/sdk-trace'
import type { TraceEvent } from '../../packages/next/src/trace/types'

// Replay is an ordering/bounded-storage algorithm. Keep its edge cases here;
// file compatibility and actual process lifecycle are covered by the e2e suites.
describe('tooling OTel replay', () => {
  const previousGate = process.env.NEXT_EXPERIMENTAL_OTEL_TOOLING
  // Use emitted package types; the root test TS project does not load the
  // framework's internal ambient declarations for the reporter's dependencies.
  let tracing: typeof import('next/dist/trace/trace')
  let api: typeof import('@opentelemetry/api')
  let sdk: typeof import('@opentelemetry/sdk-trace')
  let backend: typeof import('../../packages/next/src/trace/otel')
  let reporting: typeof import('../../packages/next/src/trace/otel-reporting')
  let local: TraceEvent[]
  let exported: ReadableSpan[]

  beforeEach(() => {
    jest.resetModules()
    api = require('next/dist/compiled/@opentelemetry/api')
    api.trace.disable()
    local = []
    exported = []
    process.env.NEXT_EXPERIMENTAL_OTEL_TOOLING = '1'
    jest.doMock('../../packages/next/src/trace/report', () => ({
      reporter: { report: (event: TraceEvent) => local.push(event) },
    }))
    sdk = require('@opentelemetry/sdk-trace')
    backend = require('../../packages/next/src/trace/otel')
    reporting = require('../../packages/next/src/trace/otel-reporting')
    tracing = require('../../packages/next/src/trace/trace')
  })

  afterEach(() => {
    if (previousGate === undefined)
      delete process.env.NEXT_EXPERIMENTAL_OTEL_TOOLING
    else process.env.NEXT_EXPERIMENTAL_OTEL_TOOLING = previousGate
    jest.dontMock('../../packages/next/src/trace/report')
    api.trace.disable()
    api.context.disable()
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  function installApplicationProvider(sample = true) {
    const provider = new sdk.TracerProvider({
      sampler: sample ? new sdk.AlwaysOnSampler() : new sdk.AlwaysOffSampler(),
      spanProcessors: [
        {
          onStart() {},
          onEnd(span) {
            exported.push(span)
          },
          async forceFlush() {},
          async shutdown() {},
        },
      ],
    })
    // Local recording must not register any provider of its own.
    expect(api.trace.setGlobalTracerProvider(provider)).toBe(true)
    return api.trace.getTracerProvider()
  }

  function span(
    id: number,
    parentId?: number,
    reportingParent?: InstanceType<typeof tracing.Span>
  ) {
    return reportingParent
      ? reportingParent.traceChild(`operation-${id}`)
      : new tracing.Span({ name: `operation-${id}`, parentId })
  }

  function stopSpan(state: InstanceType<typeof tracing.Span>, end?: bigint) {
    state.stop(end)
  }

  it('preserves original local timing, arbitrary tags, errors and idempotent end', () => {
    installApplicationProvider()
    const start = process.hrtime.bigint()
    const tags = Object.fromEntries(
      Array.from({ length: 200 }, (_, i) => [`tag-${i}`, i])
    )
    const state = new tracing.Span({
      name: 'backdated',
      startTime: start,
      wallStartTimeMs: 1_700_000_000_000,
      attrs: tags,
    })
    state.setAttribute('structured', {
      unicode: '世界',
      values: [1, 2],
    })
    state.setAttribute('failed', true)
    stopSpan(state, start + BigInt(543_000))
    stopSpan(state)
    backend.enableReporting()
    expect(local).toHaveLength(1)
    expect(local[0]).toMatchObject({
      id: 1,
      timestamp: Number(start / BigInt(1000)),
      duration: 543,
      startTime: 1_700_000_000_000,
    })
    expect(local[0].tags).toMatchObject({
      ...tags,
      failed: true,
      structured: { unicode: '世界', values: [1, 2] },
    })
    expect(exported).toHaveLength(1)
    expect(exported[0].status.code).toBe(api.SpanStatusCode.ERROR)
    expect(exported[0].duration).toEqual([0, 543_000])
    expect(exported[0].attributes['next.tooling.id']).toBe(1)
  })

  it('joins early, live and later children to the same ended startup parent without changing active context', () => {
    const root = span(1)
    backend.configureState(1, false)
    const early = span(2, 1, root)
    stopSpan(early)
    const provider = installApplicationProvider()
    const contextManager = new sdk.StackContextManager()
    api.context.setGlobalContextManager(contextManager)
    const key = api.createContextKey('tooling-replay-test')
    const context = api.ROOT_CONTEXT.setValue(key, 'application')
    api.context.with(context, () => {
      backend.enableReporting()
      backend.enableReporting()
      stopSpan(root)
      stopSpan(span(3, 1, root))
      stopSpan(span(4, 1))
      expect(api.context.active().getValue(key)).toBe('application')
      expect(api.trace.getTracerProvider()).toBe(provider)
    })
    expect(exported).toHaveLength(4)
    const parent = exported.find((entry) => entry.name === 'operation-1')!
    for (const child of exported.filter((entry) => entry !== parent)) {
      expect(child.parentSpanContext?.spanId).toBe(parent.spanContext().spanId)
    }
  })

  it('preserves the original numeric parent while falling back to the known reporting root', () => {
    const root = span(1)
    backend.configureState(1, false)
    stopSpan(span(2, 1, root))
    installApplicationProvider()
    backend.enableReporting()
    stopSpan(root)
    stopSpan(span(3, 2))
    const parent = exported.find((entry) => entry.name === 'operation-1')!
    const later = exported.find((entry) => entry.name === 'operation-3')!
    expect(later.parentSpanContext?.spanId).toBe(parent.spanContext().spanId)
    expect(later.attributes['next.tooling.parent_id']).toBe(2)
    expect(local.find((entry) => entry.id === 3)?.parentId).toBe(2)
  })

  it('retains local records when the application sampler drops every span', () => {
    installApplicationProvider(false)
    backend.enableReporting()
    stopSpan(span(1))
    expect(local).toHaveLength(1)
    expect(exported).toHaveLength(0)
  })

  it('replays completion-ordered worker records once under the live coordinator root', () => {
    const root = span(1)
    const timestamp = Number(process.hrtime.bigint() / BigInt(1000))
    const records: TraceEvent[] = [
      { id: 3, parentId: 2, name: 'worker-leaf', timestamp, duration: 10 },
      { id: 2, parentId: 1, name: 'worker-parent', timestamp, duration: 20 },
    ]
    backend.replayWorkerEvents(backend.freshWorkerEvents(records))
    expect(backend.freshWorkerEvents(records)).toEqual([])
    installApplicationProvider()
    backend.enableReporting()
    stopSpan(root)
    expect(exported).toHaveLength(3)
    const parent = exported.find((entry) => entry.name === 'worker-parent')!
    const leaf = exported.find((entry) => entry.name === 'worker-leaf')!
    const coordinator = exported.find((entry) => entry.name === 'operation-1')!
    expect(parent.parentSpanContext?.spanId).toBe(
      coordinator.spanContext().spanId
    )
    expect(leaf.parentSpanContext?.spanId).toBe(parent.spanContext().spanId)
  })

  it('bounds event-count replay, warns once, and never drops local diagnostics', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    for (let id = 1; id <= reporting.REPLAY_EVENT_LIMIT + 2; id++)
      stopSpan(span(id))
    installApplicationProvider()
    backend.enableReporting()
    expect(local).toHaveLength(reporting.REPLAY_EVENT_LIMIT + 2)
    expect(exported).toHaveLength(reporting.REPLAY_EVENT_LIMIT)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('bounds retained data size independently of event count', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    stopSpan(span(1))
    const state = new tracing.Span({
      name: 'oversized',
      attrs: { large: 'x'.repeat(reporting.REPLAY_BYTE_LIMIT) },
    })
    stopSpan(state)
    installApplicationProvider()
    backend.enableReporting()
    expect(local).toHaveLength(2)
    expect(local[1].tags!.large).toHaveLength(reporting.REPLAY_BYTE_LIMIT)
    expect(exported).toHaveLength(1)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('does not export separately from compiler workers', () => {
    backend.configureState(1, true)
    installApplicationProvider()
    stopSpan(span(2, 1))
    backend.enableReporting()
    expect(local).toHaveLength(1)
    expect(exported).toHaveLength(0)
  })

  it.each(['missing', 'synchronous'])(
    'supports a %s cooperative hook',
    async (kind) => {
      const hook = jest.fn()
      backend.enableReporting(kind === 'missing' ? undefined : hook)
      await backend.flushReporting()
      expect(hook).toHaveBeenCalledTimes(kind === 'missing' ? 0 : 1)
    }
  )

  it('treats a rejecting flush hook as a nonfatal diagnostic', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    backend.enableReporting(async () => {
      throw new Error('export failed')
    })
    await expect(backend.flushReporting()).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('bounds a hanging flush hook and clears its timeout', async () => {
    jest.useFakeTimers()
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    backend.enableReporting(() => new Promise(() => {}))
    const flush = backend.flushReporting()
    await jest.advanceTimersByTimeAsync(reporting.FLUSH_TIMEOUT_MS)
    await expect(flush).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })
})
