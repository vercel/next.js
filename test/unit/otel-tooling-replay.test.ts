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

  afterEach(async () => {
    await backend.flushReporting()
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
      : new tracing.Span({
          name: `operation-${id}`,
          parentId,
          reportingRoot: id === 1,
        })
  }

  function stopSpan(state: InstanceType<typeof tracing.Span>, end?: bigint) {
    state.stop(end)
  }

  it('preserves original local timing, arbitrary tags, errors and idempotent end', async () => {
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
    expect(exported).toHaveLength(0)
    await backend.flushReporting()
    expect(exported).toHaveLength(1)
    expect(exported[0].status.code).toBe(api.SpanStatusCode.ERROR)
    expect(exported[0].duration).toEqual([0, 543_000])
    expect(exported[0].attributes['next.tooling.id']).toBe(1)
  })

  it('joins early, live and later children to the same ended startup parent without changing active context', async () => {
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
    await backend.flushReporting()
    expect(exported).toHaveLength(4)
    const parent = exported.find((entry) => entry.name === 'operation-1')!
    for (const child of exported.filter((entry) => entry !== parent)) {
      expect(child.parentSpanContext?.spanId).toBe(parent.spanContext().spanId)
    }
  })

  it('preserves the original numeric parent while falling back to the known reporting root', async () => {
    const root = span(1)
    backend.configureState(1, false)
    stopSpan(span(2, 1, root))
    installApplicationProvider()
    backend.enableReporting()
    stopSpan(root)
    await new Promise<void>((resolve) => setImmediate(resolve))
    stopSpan(span(3, 2))
    await backend.flushReporting()
    const parent = exported.find((entry) => entry.name === 'operation-1')!
    const later = exported.find((entry) => entry.name === 'operation-3')!
    expect(later.parentSpanContext?.spanId).toBe(parent.spanContext().spanId)
    expect(later.attributes['next.tooling.parent_id']).toBe(2)
    expect(local.find((entry) => entry.id === 3)?.parentId).toBe(2)
  })

  it('retains local records when the application sampler drops every span', async () => {
    installApplicationProvider(false)
    backend.enableReporting()
    stopSpan(span(1))
    expect(local).toHaveLength(1)
    await backend.flushReporting()
    expect(exported).toHaveLength(0)
  })

  it('replays completion-ordered worker records once under the live coordinator root', async () => {
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
    expect(exported).toHaveLength(0)
    await backend.flushReporting()
    expect(exported).toHaveLength(3)
    const parent = exported.find((entry) => entry.name === 'worker-parent')!
    const leaf = exported.find((entry) => entry.name === 'worker-leaf')!
    const coordinator = exported.find((entry) => entry.name === 'operation-1')!
    expect(parent.parentSpanContext?.spanId).toBe(
      coordinator.spanContext().spanId
    )
    expect(leaf.parentSpanContext?.spanId).toBe(parent.spanContext().spanId)
  })

  it('bounds event-count replay, warns once, and never drops local diagnostics', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    for (let id = 1; id <= reporting.REPLAY_EVENT_LIMIT + 2; id++)
      stopSpan(span(id))
    installApplicationProvider()
    backend.enableReporting()
    expect(local).toHaveLength(reporting.REPLAY_EVENT_LIMIT + 2)
    await backend.flushReporting()
    expect(exported).toHaveLength(reporting.REPLAY_EVENT_LIMIT)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('bounds retained data size independently of event count', async () => {
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
    await backend.flushReporting()
    expect(exported).toHaveLength(2)
    expect(
      exported.find((entry) => entry.name === 'oversized')!.attributes.large
    ).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('does not export separately from compiler workers', async () => {
    backend.configureState(1, true)
    installApplicationProvider()
    stopSpan(span(2, 1))
    backend.enableReporting()
    expect(local).toHaveLength(1)
    await backend.flushReporting()
    expect(exported).toHaveLength(0)
  })

  it('does not let a root marker override compiler-worker suppression', async () => {
    backend.configureState(1, true)
    installApplicationProvider()
    const hook = jest.fn()
    const root = new tracing.Span({ name: 'worker root', reportingRoot: true })
    root.stop()
    backend.enableReporting(hook)
    await backend.flushReporting()
    expect(local).toHaveLength(1)
    expect(exported).toHaveLength(0)
    expect(hook).not.toHaveBeenCalled()
  })

  it('does no API or SDK work on producer, import or enable stacks and progresses before root completion', async () => {
    const starts = jest.fn()
    const ends = jest.fn()
    const samples = jest.fn(() => ({
      decision: sdk.SamplingDecision.RECORD_AND_SAMPLED,
    }))
    const provider = new sdk.TracerProvider({
      sampler: { shouldSample: samples, toString: () => 'application' },
      spanProcessors: [
        {
          onStart: starts,
          onEnd: ends,
          async forceFlush() {},
          async shutdown() {},
        },
      ],
    })
    api.trace.setGlobalTracerProvider(provider)
    const getTracer = jest.spyOn(api.trace, 'getTracer')
    const root = span(1)
    backend.configureState(1, false)
    backend.enableReporting()
    const child = root.traceChild('child', { initial: true })
    child.setAttribute('final', 'value')
    child.stop()
    backend.replayWorkerEvents([
      { id: 20, parentId: 1, name: 'worker', timestamp: 10, duration: 5 },
    ])
    expect(getTracer).not.toHaveBeenCalled()
    expect(starts).not.toHaveBeenCalled()
    expect(ends).not.toHaveBeenCalled()
    expect(samples).not.toHaveBeenCalled()
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(starts).toHaveBeenCalledTimes(3)
    expect(ends).toHaveBeenCalledTimes(2)
    // The real unfinished root is open, not artificially ended to make progress.
    expect(local.map((event) => event.name)).toEqual(['child'])
    root.stop()
    expect(ends).toHaveBeenCalledTimes(2)
    await backend.flushReporting()
    expect(ends).toHaveBeenCalledTimes(3)
  })

  it('samples completed records with final attributes but live ancestors with correlation only', async () => {
    const sampled = new Map<string, Record<string, unknown>>()
    const provider = new sdk.TracerProvider({
      sampler: {
        shouldSample(_context, _id, name, _kind, attrs) {
          sampled.set(name, { ...attrs })
          return { decision: sdk.SamplingDecision.RECORD_AND_SAMPLED }
        },
        toString: () => 'application',
      },
      spanProcessors: [
        {
          onStart() {},
          onEnd: (entry) => exported.push(entry),
          async forceFlush() {},
          async shutdown() {},
        },
      ],
    })
    api.trace.setGlobalTracerProvider(provider)
    const root = new tracing.Span({
      name: 'root',
      reportingRoot: true,
      attrs: { initial: 'root' },
    })
    const nested = { value: 'original' }
    const child = root.traceChild('completed', { nested })
    child.setAttribute('final', true)
    child.stop()
    nested.value = 'mutated after completion'
    backend.enableReporting()
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(sampled.get('root')).toEqual({ 'next.tooling.id': 1 })
    expect(sampled.get('completed')).toMatchObject({
      nested: '{"value":"original"}',
      final: true,
    })
    root.setAttribute('final', 'root')
    root.stop()
    await backend.flushReporting()
    expect(
      exported.find((entry) => entry.name === 'root')!.attributes
    ).toMatchObject({ initial: 'root', final: 'root' })
    expect(sampled.get('root')).not.toHaveProperty('final')
  })

  it.each(['oversized', 'cyclic'])(
    'keeps exact terminal metadata after %s payload loss on an already started span',
    async (kind) => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
      installApplicationProvider()
      const start = process.hrtime.bigint()
      const state = new tracing.Span({ name: 'loss', startTime: start })
      backend.enableReporting()
      await new Promise<void>((resolve) => setImmediate(resolve))
      const value: Record<string, unknown> = {}
      value.self = value
      state.setAttribute(
        'payload',
        kind === 'cyclic' ? value : '🌏'.repeat(reporting.REPLAY_BYTE_LIMIT / 4)
      )
      state.setAttribute('failed', true)
      state.stop(start + BigInt(777))
      expect(exported).toHaveLength(0)
      await backend.flushReporting()
      expect(exported).toHaveLength(1)
      expect(exported[0].duration).toEqual([0, 777])
      expect(exported[0].status.code).toBe(api.SpanStatusCode.ERROR)
      expect(exported[0].attributes.payload).toBeUndefined()
      expect(local[0].tags!.payload).toBeDefined()
      expect(warn).toHaveBeenCalledTimes(1)
    }
  )

  it('releases heavy descriptor references but preserves direct late-parent context', async () => {
    installApplicationProvider()
    const root = span(1)
    const parent = root.traceChild('parent')
    // Inspect the internal handle, not SDK private state or a public test hook.
    const handle = (
      parent as unknown as {
        reporting: import('../../packages/next/src/trace/otel-reporting').ReportingRecord
      }
    ).reporting
    parent.stop()
    backend.enableReporting()
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(handle).toMatchObject({ name: '', size: 0, retained: false })
    expect(handle.encoded).toBeUndefined()
    expect(handle.parent).toBeUndefined()
    expect(handle.span).toBeUndefined()
    expect(handle.context).toBeDefined()
    parent.traceChild('late').stop()
    root.stop()
    await backend.flushReporting()
    const late = exported.find((entry) => entry.name === 'late')!
    expect(late.parentSpanContext?.spanId).toBe(handle.context!.spanId)
  })

  it('reserves count and byte capacity for a root captured after ordinary starts', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const start = BigInt(1_700_000_000_000_000_000)
    const admitted = []
    for (let id = 1; id <= reporting.REPLAY_EVENT_LIMIT; id++) {
      const record = reporting.startReporting(id, undefined, 'ordinary', start)
      if (record) admitted.push(record)
    }
    expect(admitted).toHaveLength(reporting.REPLAY_EVENT_LIMIT - 1)
    const root = reporting.startReporting(
      20_000,
      undefined,
      'coordinator',
      start,
      undefined,
      true
    )!
    expect(root).toBeDefined()
    for (const record of admitted)
      reporting.endReporting(record, start + BigInt(1000), {})
    reporting.endReporting(root, start + BigInt(2000), {})
    installApplicationProvider()
    backend.enableReporting()
    await backend.flushReporting()
    expect(exported).toHaveLength(reporting.REPLAY_EVENT_LIMIT)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('accounts UTF-16 metadata bytes independently and keeps the reserved root', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    const start = BigInt(0)
    expect(
      reporting.startReporting(
        1,
        undefined,
        '界'.repeat(reporting.REPLAY_BYTE_LIMIT / 2),
        start
      )
    ).toBeUndefined()
    const root = reporting.startReporting(
      2,
      undefined,
      'root',
      start,
      undefined,
      true
    )
    expect(root).toBeDefined()
    reporting.endReporting(root, BigInt(1000), {})
    installApplicationProvider()
    backend.enableReporting()
    await backend.flushReporting()
    expect(exported).toHaveLength(1)
  })

  it('falls back to the real coordinator when a worker parent cannot be admitted', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    const root = span(1)
    backend.replayWorkerEvents([
      { id: 3, parentId: 2, name: 'leaf', timestamp: 100, duration: 11 },
      {
        id: 2,
        parentId: 1,
        name: '界'.repeat(reporting.REPLAY_BYTE_LIMIT / 2),
        timestamp: 90,
        duration: 30,
      },
    ])
    installApplicationProvider()
    backend.enableReporting()
    root.stop()
    await backend.flushReporting()
    const parent = exported.find((entry) => entry.name === 'operation-1')!
    const leaf = exported.find((entry) => entry.name === 'leaf')!
    expect(exported).toHaveLength(2)
    expect(leaf.parentSpanContext?.spanId).toBe(parent.spanContext().spanId)
    expect(leaf.attributes['next.tooling.parent_id']).toBe(2)
    expect(leaf.duration).toEqual([0, 11_000])
    expect(leaf.startTime).toEqual([
      Number(backend.epochTime(BigInt(100_000)) / BigInt(1_000_000_000)),
      Number(backend.epochTime(BigInt(100_000)) % BigInt(1_000_000_000)),
    ])
  })

  it('drops unknown worker roots rather than fabricating a coordinator', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    backend.replayWorkerEvents([
      { id: 3, parentId: 2, name: 'orphan', timestamp: 1, duration: 1 },
      {
        id: 2,
        parentId: 1,
        name: 'unknown coordinator child',
        timestamp: 1,
        duration: 2,
      },
    ])
    installApplicationProvider()
    backend.enableReporting()
    await backend.flushReporting()
    expect(exported).toHaveLength(0)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('iteratively resolves deep completion-ordered worker trees and breaks cycles nonfatally', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    const root = span(1)
    const records = Array.from({ length: 4000 }, (_, index) => ({
      id: index + 2,
      parentId: index + 1,
      name: `deep-${index}`,
      timestamp: 1,
      duration: 2,
    })).reverse()
    backend.replayWorkerEvents(records)
    backend.replayWorkerEvents([
      { id: 5000, parentId: 5001, name: 'cycle-a', timestamp: 1, duration: 2 },
      { id: 5001, parentId: 5000, name: 'cycle-b', timestamp: 1, duration: 2 },
    ])
    installApplicationProvider()
    backend.enableReporting()
    root.stop()
    await backend.flushReporting()
    expect(exported).toHaveLength(4003)
    const byId = new Map(
      exported.map((entry) => [entry.attributes['next.tooling.id'], entry])
    )
    for (let id = 2; id <= 4001; id++) {
      expect(byId.get(id)!.parentSpanContext?.spanId).toBe(
        byId.get(id - 1)!.spanContext().spanId
      )
    }
  })

  it('captures completion even if the existing local reporter throws', async () => {
    const reporter = require('../../packages/next/src/trace/report').reporter
    jest.spyOn(reporter, 'report').mockImplementationOnce(() => {
      throw new Error('local writer failure')
    })
    installApplicationProvider()
    backend.enableReporting()
    const state = span(1)
    expect(() => state.stop()).toThrow('local writer failure')
    await backend.flushReporting()
    expect(exported).toHaveLength(1)
  })

  it('has one yielding drain owner, prioritizes terminals and never spins on live spans', async () => {
    jest.useFakeTimers()
    installApplicationProvider()
    const root = span(1)
    for (let id = 2; id < 140; id++) span(id, 1, root)
    const terminal = root.traceChild('terminal')
    terminal.stop()
    backend.enableReporting()
    backend.enableReporting()
    expect(jest.getTimerCount()).toBe(1)
    await jest.runOnlyPendingTimersAsync()
    expect(exported.map((entry) => entry.name)).toEqual(['terminal'])
    expect(jest.getTimerCount()).toBe(1)
    await jest.runAllTimersAsync()
    expect(jest.getTimerCount()).toBe(0)
    expect(exported).toHaveLength(1)
    root.stop()
    const first = backend.flushReporting()
    expect(backend.flushReporting()).toBe(first)
    await jest.runAllTimersAsync()
    await first
    expect(exported).toHaveLength(2)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('closes before the hook and rejects stale callbacks and captures until a new root', async () => {
    jest.useFakeTimers()
    installApplicationProvider()
    const old = span(1)
    old.stop()
    const firstHook = jest.fn(() => {
      span(10).stop()
    })
    backend.enableReporting(firstHook)
    const first = backend.flushReporting()
    await jest.runAllTimersAsync()
    await first
    expect(firstHook).toHaveBeenCalledTimes(1)
    expect(exported.map((entry) => entry.name)).toEqual(['operation-1'])
    span(11).stop()
    const root = new tracing.Span({
      name: 'new generation',
      reportingRoot: true,
    })
    backend.enableReporting()
    root.stop()
    const second = backend.flushReporting()
    await jest.runAllTimersAsync()
    await second
    expect(exported.map((entry) => entry.name)).toEqual([
      'operation-1',
      'new generation',
    ])
    expect(firstHook).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('cancels old queued work when a new root starts before a scheduled turn', async () => {
    jest.useFakeTimers()
    installApplicationProvider()
    span(1).stop()
    const oldHook = jest.fn()
    backend.enableReporting(oldHook)
    const root = new tracing.Span({ name: 'replacement', reportingRoot: true })
    root.stop()
    backend.enableReporting()
    const flush = backend.flushReporting()
    await jest.runAllTimersAsync()
    await flush
    expect(oldHook).not.toHaveBeenCalled()
    expect(exported.map((entry) => entry.name)).toEqual(['replacement'])
  })

  it('uses separate cooperative drain and hook budgets and still calls the hook after drain loss', async () => {
    jest.useFakeTimers()
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const starts = jest.fn(() => {
      jest.advanceTimersByTime(reporting.FLUSH_TIMEOUT_MS + 1)
    })
    const provider = new sdk.TracerProvider({
      spanProcessors: [
        {
          onStart: starts,
          onEnd: (entry) => exported.push(entry),
          async forceFlush() {},
          async shutdown() {},
        },
      ],
    })
    api.trace.setGlobalTracerProvider(provider)
    const root = span(1)
    root.traceChild('waiting').stop()
    const hook = jest.fn(() => new Promise<void>(() => {}))
    backend.enableReporting(hook)
    const flush = backend.flushReporting()
    await jest.runOnlyPendingTimersAsync()
    expect(starts).toHaveBeenCalledTimes(1)
    expect(exported).toHaveLength(0)
    expect(hook).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(reporting.FLUSH_TIMEOUT_MS)
    await flush
    expect(warn).toHaveBeenCalledTimes(2)
    expect(jest.getTimerCount()).toBe(0)
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
