/**
 * @jest-environment node
 */

import type {
  Context,
  ContextManager,
  TextMapGetter,
  TextMapPropagator,
  TextMapSetter,
} from '@opentelemetry/api'
import type { WorkStore } from '../../app-render/work-async-storage.external'
import type { WorkUnitStore } from '../../app-render/work-unit-async-storage.external'
import {
  ROOT_CONTEXT,
  context,
  createContextKey,
  propagation,
  trace,
} from '@opentelemetry/api'

import { setSpanRecorderForTest, type SpanStoreRecord } from './span-store'
import {
  registerLocalSpanRecorder,
  traceLocalSpan,
} from './local-span-recorder'
import {
  AppRouteRouteModuleSpan,
  AppRenderSpan,
  BaseServerSpan,
  InstrumentationSpan,
  LoadComponentsSpan,
  NextNodeServerSpan,
  NodeSpan,
  RouteModuleSpan,
} from './constants'
import {
  BubbledError,
  recordSpanError,
  SpanKind,
  SpanStatusCode,
  getTracer,
  type Span,
} from './tracer'
import {
  addTraceStateEntry,
  DEFERRED_REQUEST_SPAN_KEY,
  encodeDeferredRequestSpan,
} from './deferred-request-span'

const customContextKey = createContextKey('next.tracer.test.custom-context')
const originalRequestInsights = process.env.__NEXT_REQUEST_INSIGHTS
const originalDevServer = process.env.__NEXT_DEV_SERVER
const originalOtelVerbose = process.env.NEXT_OTEL_VERBOSE
const spanRecords: SpanStoreRecord[] = []

function getSpanRecords(filter: { name?: string } = {}): SpanStoreRecord[] {
  return spanRecords.filter(
    (span) => filter.name === undefined || span.name === filter.name
  )
}

const getter: TextMapGetter<Record<string, string | undefined>> = {
  keys: (carrier) => Object.keys(carrier),
  get: (carrier, key) => carrier[key],
}

class TestContextManager implements ContextManager {
  private currentContext: Context = ROOT_CONTEXT

  active(): Context {
    return this.currentContext
  }

  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    newContext: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    const previousContext = this.currentContext
    this.currentContext = newContext
    try {
      return fn.apply(thisArg, args)
    } finally {
      this.currentContext = previousContext
    }
  }

  bind<T>(bindContext: Context, target: T): T {
    if (typeof target !== 'function') {
      return target
    }

    return ((...args: unknown[]) => {
      return this.with(
        bindContext,
        target as (...args: unknown[]) => unknown,
        undefined,
        ...args
      )
    }) as T
  }

  enable(): this {
    return this
  }

  disable(): this {
    this.currentContext = ROOT_CONTEXT
    return this
  }
}

class CustomPropagator implements TextMapPropagator {
  fields(): string[] {
    return ['x-custom']
  }

  inject(): void {}

  extract(
    extractedContext: Context,
    carrier: Record<string, string | undefined>,
    mapGetter: TextMapGetter<Record<string, string | undefined>>
  ): Context {
    const value = mapGetter.get(carrier, 'x-custom')
    if (!value || Array.isArray(value)) {
      return extractedContext
    }

    return extractedContext.setValue(customContextKey, value)
  }
}

// A minimal W3C `traceparent` propagator (`@opentelemetry/core` isn't a
// dependency here).
class TraceparentPropagator implements TextMapPropagator {
  fields(): string[] {
    return ['traceparent']
  }

  inject(
    injectedContext: Context,
    carrier: unknown,
    setter: TextMapSetter<unknown>
  ): void {
    const spanContext = trace.getSpanContext(injectedContext)
    if (!spanContext) return
    const flags = spanContext.traceFlags.toString(16).padStart(2, '0')
    setter.set(
      carrier,
      'traceparent',
      `00-${spanContext.traceId}-${spanContext.spanId}-${flags}`
    )
  }

  extract(
    extractedContext: Context,
    carrier: Record<string, string | undefined>,
    mapGetter: TextMapGetter<Record<string, string | undefined>>
  ): Context {
    const value = mapGetter.get(carrier, 'traceparent')
    const [, traceId, spanId, flags] =
      (typeof value === 'string' && value.split('-')) || []
    if (!traceId || !spanId || !flags) {
      return extractedContext
    }
    return trace.setSpanContext(extractedContext, {
      traceId,
      spanId,
      traceFlags: parseInt(flags, 16),
      isRemote: true,
    })
  }
}

describe('withPropagatedContext', () => {
  beforeEach(() => {
    context.disable()
    propagation.disable()
    context.setGlobalContextManager(new TestContextManager())
    propagation.setGlobalPropagator(new CustomPropagator())
  })

  afterEach(() => {
    propagation.disable()
    context.disable()
  })

  it('merges extracted context in force mode when no remote span exists', () => {
    const activeSpan = trace.wrapSpanContext({
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
      traceFlags: 1,
      isRemote: false,
    })
    const activeContext = trace.setSpan(ROOT_CONTEXT, activeSpan)

    const result = context.with(activeContext, () =>
      getTracer().withPropagatedContext(
        { 'x-custom': 'custom1' },
        () => {
          const scopedContext = context.active()
          return {
            customValue: scopedContext.getValue(customContextKey),
            activeSpanId: trace.getSpanContext(scopedContext)?.spanId,
          }
        },
        getter,
        true
      )
    )

    expect(result).toEqual({
      customValue: 'custom1',
      activeSpanId: '0123456789abcdef',
    })
  })
})

describe('trace context with the W3C propagator', () => {
  const TRACE_ID = '0af7651916cd43dd8448eb211c80319c'
  const SPAN_ID = 'b7ad6b7169203331'

  beforeEach(() => {
    context.disable()
    propagation.disable()
    context.setGlobalContextManager(new TestContextManager())
    propagation.setGlobalPropagator(new TraceparentPropagator())
  })

  afterEach(() => {
    propagation.disable()
    context.disable()
  })

  const withSpanContext = <T>(
    spanContext: Parameters<typeof trace.wrapSpanContext>[0],
    fn: () => T
  ) =>
    context.with(
      trace.setSpan(ROOT_CONTEXT, trace.wrapSpanContext(spanContext)),
      fn
    )

  it('prefers the carrier traceparent over the active span in force mode', () => {
    const result = withSpanContext(
      {
        traceId: '0123456789abcdef0123456789abcdef',
        spanId: '0123456789abcdef',
        traceFlags: 1,
        isRemote: false,
      },
      () =>
        getTracer().withPropagatedContext(
          { traceparent: `00-${TRACE_ID}-${SPAN_ID}-01` },
          () => trace.getSpanContext(context.active()),
          getter,
          true
        )
    )

    expect(result).toMatchObject({ traceId: TRACE_ID, spanId: SPAN_ID })
  })

  it('always includes the tracestate key in the trace context headers', () => {
    const spanContext = {
      traceId: TRACE_ID,
      spanId: SPAN_ID,
      traceFlags: 1,
      isRemote: false,
    }
    // A recording span, so OpenTelemetry counts as enabled.
    const span = Object.assign(trace.wrapSpanContext(spanContext), {
      isRecording: () => true,
    })

    const result = context.with(trace.setSpan(ROOT_CONTEXT, span), () =>
      getTracer().getTraceContextHeaders()
    )

    expect(result).toStrictEqual({
      traceparent: `00-${TRACE_ID}-${SPAN_ID}-01`,
      tracestate: undefined,
    })
  })
})

// A minimal W3C `tracestate` (`@opentelemetry/core` isn't a dependency here).
class TestTraceState {
  constructor(private readonly entries: [string, string][] = []) {}
  static parse(value: string | undefined) {
    return new TestTraceState(
      (value ?? '')
        .split(',')
        .map((member) => member.trim().split('=') as [string, string])
        .filter(([key, entry]) => key && entry !== undefined)
    )
  }
  get(key: string) {
    return this.entries.find(([k]) => k === key)?.[1]
  }
  set(key: string, value: string) {
    return new TestTraceState([[key, value], ...this.unset(key).entries])
  }
  unset(key: string) {
    return new TestTraceState(this.entries.filter(([k]) => k !== key))
  }
  serialize() {
    return this.entries.map(([k, v]) => `${k}=${v}`).join(',')
  }
}

// A minimal W3C Trace Context propagator (`traceparent` and `tracestate`).
class TraceContextPropagator extends TraceparentPropagator {
  fields(): string[] {
    return ['traceparent', 'tracestate']
  }

  inject(
    injectedContext: Context,
    carrier: unknown,
    setter: TextMapSetter<unknown>
  ): void {
    super.inject(injectedContext, carrier, setter)
    const traceState = trace.getSpanContext(injectedContext)?.traceState
    if (traceState) {
      setter.set(carrier, 'tracestate', traceState.serialize())
    }
  }

  extract(
    extractedContext: Context,
    carrier: Record<string, string | undefined>,
    mapGetter: TextMapGetter<Record<string, string | undefined>>
  ): Context {
    const extracted = super.extract(extractedContext, carrier, mapGetter)
    const spanContext = trace.getSpanContext(extracted)
    const tracestate = mapGetter.get(carrier, 'tracestate')
    if (!spanContext || typeof tracestate !== 'string') {
      return extracted
    }
    return trace.setSpanContext(extracted, {
      ...spanContext,
      traceState: TestTraceState.parse(tracestate),
    })
  }
}

describe('deferred request span', () => {
  const INCOMING_TRACE_ID = '0af7651916cd43dd8448eb211c80319c'
  const NOW = Date.now()

  interface FakeSpan {
    name: string
    options: any
    traceId: string
    spanId: string
    status?: { code: number }
    endTime?: unknown
    ended: number
  }
  let started: FakeSpan[]
  let shouldSample: jest.Mock
  let failStart: boolean

  beforeEach(() => {
    started = []
    failStart = false
    let counter = 0
    shouldSample = jest.fn(() => ({ decision: 2 }))
    // Mirrors `Tracer` of `@opentelemetry/sdk-trace`: the IDs come from
    // `_idGenerator` (the trace ID only for root spans), `_sampler` decides.
    const sdkTracer: any = {
      _idGenerator: {
        generateTraceId: () => `${++counter}`.padStart(32, 'a'),
        generateSpanId: () => `${++counter}`.padStart(16, 'b'),
      },
      _sampler: { shouldSample },
      startSpan(name: string, options: any = {}, ctx = context.active()) {
        if (failStart) {
          throw new Error('startSpan failed')
        }
        const spanId = sdkTracer._idGenerator.generateSpanId()
        const parent = options.root ? undefined : trace.getSpanContext(ctx)
        const traceId =
          parent?.traceId ?? sdkTracer._idGenerator.generateTraceId()
        const record: FakeSpan = { name, options, traceId, spanId, ended: 0 }
        started.push(record)
        return {
          isRecording: () => true,
          spanContext: () => ({ traceId, spanId, traceFlags: 1 }),
          setStatus(status: { code: number }) {
            record.status = status
          },
          end(endTime?: unknown) {
            record.ended++
            record.endTime = endTime
          },
        }
      },
    }
    context.disable()
    propagation.disable()
    trace.disable()
    context.setGlobalContextManager(new TestContextManager())
    propagation.setGlobalPropagator(new TraceContextPropagator())
    trace.setGlobalTracerProvider({ getTracer: () => sdkTracer })
  })

  afterEach(() => {
    trace.disable()
    propagation.disable()
    context.disable()
  })

  const requestSpans = () =>
    started.filter((span) => span.options.attributes?.['next.span_type'])

  // The request headers of a render the middleware deferred its request span
  // to (as the adapter forwards them). Every deferred span has its own span
  // ID, since each is emitted at most once per process.
  let deferredSpans = 0
  function deferredHeaders(
    {
      startTime = NOW - 1_000,
      spanId = `${++deferredSpans}`.padStart(16, 'c'),
      bound = spanId,
    }: { startTime?: number; spanId?: string; bound?: string } = {},
    other = 'vendor=1'
  ): Record<string, string | undefined> {
    return {
      traceparent: `00-${INCOMING_TRACE_ID}-${spanId}-01`,
      tracestate: addTraceStateEntry(
        other,
        DEFERRED_REQUEST_SPAN_KEY,
        encodeDeferredRequestSpan({
          spanId: bound,
          startTime,
          name: 'GET',
          attributes: { 'http.method': 'GET', 'http.target': '/page' },
        })!
      ),
    }
  }

  describe('reserveRequestSpan', () => {
    it('reserves the IDs and runs children under them without starting a span', () => {
      const reserved = getTracer().reserveRequestSpan('GET', {
        startTime: NOW - 5,
        attributes: { 'http.method': 'GET', 'http.target': '/page' },
      })!
      expect(reserved).toBeDefined()
      expect(started).toEqual([])
      expect(shouldSample).toHaveBeenCalledTimes(1)

      const parent = reserved.run(() => {
        const span = trace.getSpan(context.active())
        return { context: span?.spanContext(), recording: span?.isRecording() }
      })
      expect(parent).toEqual({
        context: expect.objectContaining({
          traceId: reserved.traceId,
          spanId: reserved.spanId,
          traceFlags: 1,
        }),
        recording: false,
      })
      expect(started).toEqual([])
    })

    it('emits the span with the reserved IDs once', () => {
      const reserved = getTracer().reserveRequestSpan('GET', {
        startTime: NOW - 5,
        attributes: { 'http.method': 'GET', 'http.target': '/page' },
      })!
      reserved.emit({ failed: true, error: new Error('boom') })
      reserved.emit()
      expect(started).toEqual([
        expect.objectContaining({
          name: 'GET',
          traceId: reserved.traceId,
          spanId: reserved.spanId,
          status: { code: SpanStatusCode.ERROR },
          ended: 1,
          options: expect.objectContaining({
            root: true,
            kind: SpanKind.SERVER,
            startTime: NOW - 5,
            attributes: expect.objectContaining({
              'next.span_type': 'Next.request',
              'http.target': '/page',
            }),
          }),
        }),
      ])
    })

    it('keeps an unsampled reservation without starting or emitting a span', () => {
      shouldSample.mockReturnValue({ decision: 1 })
      const reserved = getTracer().reserveRequestSpan('GET', {
        attributes: {},
      })!
      expect(reserved).toBeDefined()
      expect(reserved.sampled).toBe(false)
      expect(shouldSample).toHaveBeenCalledTimes(1)
      expect(
        reserved.run(
          () => trace.getSpan(context.active())?.spanContext().traceFlags
        )
      ).toBe(0)
      reserved.emit()
      expect(started).toEqual([])
    })
  })

  describe('withPropagatedContext', () => {
    it('emits the request span after the render with the incoming IDs', async () => {
      const headers = deferredHeaders()
      let seen: unknown
      await getTracer().withPropagatedContext(
        headers,
        async () => {
          seen = {
            headers: { ...headers },
            traceState: trace
              .getSpanContext(context.active())
              ?.traceState?.serialize(),
          }
          expect(requestSpans()).toEqual([])
        },
        getter
      )
      expect(seen).toEqual({
        headers: expect.objectContaining({ tracestate: 'vendor=1' }),
        traceState: 'vendor=1',
      })
      expect(requestSpans()).toEqual([
        expect.objectContaining({
          traceId: INCOMING_TRACE_ID,
          spanId: headers.traceparent!.split('-')[2],
          ended: 1,
          options: expect.objectContaining({ startTime: NOW - 1_000 }),
        }),
      ])
      expect(requestSpans()[0].status).toBeUndefined()
    })

    it('uses an earlier start of the render request span', async () => {
      await getTracer().withPropagatedContext(
        deferredHeaders(),
        async () => {},
        getter,
        false,
        { requestStartTime: NOW - 2_000 }
      )
      expect(requestSpans()[0].options.startTime).toBe(NOW - 2_000)
    })

    it('marks the span as failed when the render rejects, even with undefined', async () => {
      await expect(
        getTracer().withPropagatedContext(
          deferredHeaders(),
          () => Promise.reject(undefined),
          getter
        )
      ).rejects.toBeUndefined()
      expect(requestSpans()[0].status).toEqual({
        code: SpanStatusCode.ERROR,
      })
      expect(() =>
        getTracer().withPropagatedContext(
          deferredHeaders(),
          () => {
            throw new Error('sync')
          },
          getter
        )
      ).toThrow('sync')
      expect(requestSpans()[1]).toMatchObject({
        status: { code: SpanStatusCode.ERROR },
        ended: 1,
      })
    })

    it('keeps the result and the error of the render when emitting fails', async () => {
      failStart = true
      await expect(
        getTracer().withPropagatedContext(
          deferredHeaders(),
          async () => 'result',
          getter
        )
      ).resolves.toBe('result')
      const error = new Error('render failed')
      await expect(
        getTracer().withPropagatedContext(
          deferredHeaders(),
          () => Promise.reject(error),
          getter
        )
      ).rejects.toBe(error)
    })

    it('emits once for nested renders, even with copied headers', async () => {
      const headers = deferredHeaders()
      const copy = { ...headers }
      await getTracer().withPropagatedContext(
        headers,
        () =>
          getTracer().withPropagatedContext(copy, async () => {}, getter, true),
        getter
      )
      expect(requestSpans()).toHaveLength(1)
    })

    it('emits once for nested renders, even after many other requests', async () => {
      const headers = deferredHeaders()
      const copy = { ...headers }
      await getTracer().withPropagatedContext(
        headers,
        async () => {
          // Other requests, e.g. concurrent ones, emitting their own spans
          // (synchronously: the test context manager isn't async-aware).
          for (let i = 0; i < 1_001; i++) {
            context.with(ROOT_CONTEXT, () =>
              getTracer().withPropagatedContext(
                deferredHeaders(),
                () => {},
                getter
              )
            )
          }
          await getTracer().withPropagatedContext(
            copy,
            async () => {},
            getter,
            true
          )
        },
        getter
      )
      const spanId = headers.traceparent!.split('-')[2]
      expect(
        requestSpans().filter((span) => span.spanId === spanId)
      ).toHaveLength(1)
    })

    it('ignores an entry bound to another span, removing it', async () => {
      const headers = deferredHeaders({ bound: 'eeeeeeeeeeeeeeee' })
      await getTracer().withPropagatedContext(headers, async () => {}, getter)
      expect(requestSpans()).toEqual([])
      expect(headers.tracestate).toBe('vendor=1')
    })

    it('removes the entry without emitting when a host span is active', async () => {
      const headers = deferredHeaders()
      const host = trace.wrapSpanContext({
        traceId: '1'.repeat(32),
        spanId: '1'.repeat(16),
        traceFlags: 1,
        traceState: TestTraceState.parse(headers.tracestate),
      })
      let activeState: string | undefined
      await context.with(trace.setSpan(ROOT_CONTEXT, host), () =>
        getTracer().withPropagatedContext(
          headers,
          async () => {
            activeState = trace
              .getSpanContext(context.active())
              ?.traceState?.serialize()
          },
          getter
        )
      )
      expect(requestSpans()).toEqual([])
      expect(headers.tracestate).toBe('vendor=1')
      expect(activeState).toBe('vendor=1')
    })

    it('removes the entry from a recording host span view, keeping updates to it', async () => {
      const headers = deferredHeaders()
      const setAttribute = jest.fn()
      const hostContext = {
        traceId: '1'.repeat(32),
        spanId: '1'.repeat(16),
        traceFlags: 1,
        traceState: TestTraceState.parse(headers.tracestate),
      }
      const host: any = Object.assign(trace.wrapSpanContext(hostContext), {
        isRecording: () => true,
        setAttribute(key: string, value: unknown) {
          setAttribute(key, value)
          return host
        },
      })
      let seen: { traceState?: string; recording?: boolean } = {}
      await context.with(trace.setSpan(ROOT_CONTEXT, host), () =>
        getTracer().withPropagatedContext(
          headers,
          async () => {
            const active = trace.getSpan(context.active())!
            active.setAttribute('key', 'value')
            seen = {
              traceState: active.spanContext().traceState?.serialize(),
              recording: active.isRecording(),
            }
          },
          getter
        )
      )
      expect(seen).toEqual({ traceState: 'vendor=1', recording: true })
      expect(setAttribute).toHaveBeenCalledWith('key', 'value')
      expect(host.spanContext().traceState.serialize()).toContain(
        'next-deferred'
      )
    })

    it('removes the entry from the active context in force mode without a remote span', async () => {
      const host = trace.wrapSpanContext({
        traceId: '1'.repeat(32),
        spanId: '1'.repeat(16),
        traceFlags: 1,
        traceState: TestTraceState.parse(deferredHeaders().tracestate),
      })
      let activeState: string | undefined
      await context.with(trace.setSpan(ROOT_CONTEXT, host), () =>
        getTracer().withPropagatedContext(
          {},
          async () => {
            activeState = trace
              .getSpanContext(context.active())
              ?.traceState?.serialize()
          },
          getter,
          true
        )
      )
      expect(activeState).toBe('vendor=1')
      expect(requestSpans()).toEqual([])
    })

    it('only removes the entry in middleware', async () => {
      const headers = deferredHeaders({}, '')
      await getTracer().withPropagatedContext(
        headers,
        async () => {},
        getter,
        false,
        { deferredRequestSpan: 'strip' }
      )
      expect(requestSpans()).toEqual([])
      expect(headers.tracestate).toBeUndefined()
    })
  })
})

describe('local span recording', () => {
  beforeEach(() => {
    process.env.__NEXT_DEV_SERVER = '1'
    delete process.env.__NEXT_REQUEST_INSIGHTS
    delete process.env.NEXT_OTEL_VERBOSE
    setSpanRecorderForTest((span) => spanRecords.push(span))
    registerLocalSpanRecorder()
  })

  afterEach(() => {
    if (originalRequestInsights === undefined) {
      delete process.env.__NEXT_REQUEST_INSIGHTS
    } else {
      process.env.__NEXT_REQUEST_INSIGHTS = originalRequestInsights
    }
    if (originalDevServer === undefined) {
      delete process.env.__NEXT_DEV_SERVER
    } else {
      process.env.__NEXT_DEV_SERVER = originalDevServer
    }
    if (originalOtelVerbose === undefined) {
      delete process.env.NEXT_OTEL_VERBOSE
    } else {
      process.env.NEXT_OTEL_VERBOSE = originalOtelVerbose
    }
    context.disable()
    trace.disable()
    setSpanRecorderForTest(undefined)
    spanRecords.length = 0
  })

  it('does not mirror spans by default', () => {
    setSpanRecorderForTest(undefined)

    const result = getTracer().trace(NodeSpan.runHandler, () => 'result')

    expect(result).toBe('result')
    expect(getSpanRecords()).toEqual([])
  })

  it('records non-vanilla trace and wrapped spans for request insights', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'

    getTracer().trace(BaseServerSpan.render, () => undefined)
    const wrappedLoadComponents = getTracer().wrap(
      LoadComponentsSpan.loadComponents,
      () => undefined
    )
    wrappedLoadComponents()

    expect(getSpanRecords()).toEqual([
      expect.objectContaining({
        name: BaseServerSpan.render,
        attributes: expect.objectContaining({
          'next.span_category': 'nextjs',
        }),
      }),
      expect.objectContaining({
        name: LoadComponentsSpan.loadComponents,
        attributes: expect.objectContaining({
          'next.span_category': 'nextjs',
        }),
      }),
    ])
  })

  it('only exports non-vanilla spans when verbose tracing is enabled', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    const exportedSpans: string[] = []
    const delegateSpan = trace.wrapSpanContext({
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
      traceFlags: 1,
    })
    trace.setGlobalTracerProvider({
      getTracer() {
        return {
          startSpan(name: string) {
            exportedSpans.push(name)
            return delegateSpan
          },
          startActiveSpan(...args: unknown[]) {
            exportedSpans.push(args[0] as string)
            const callback = args.at(-1) as (
              span: typeof delegateSpan
            ) => unknown
            return callback(delegateSpan)
          },
        }
      },
    })

    getTracer().trace(BaseServerSpan.render, () => undefined)
    expect(exportedSpans).toEqual([])

    getTracer().trace(NodeSpan.runHandler, () => undefined)
    expect(exportedSpans).toEqual([NodeSpan.runHandler])

    getTracer().trace(LoadComponentsSpan.loadRouteModule, () => undefined)
    expect(exportedSpans).toEqual([
      NodeSpan.runHandler,
      LoadComponentsSpan.loadRouteModule,
    ])

    getTracer().trace(RouteModuleSpan.prepare, () => undefined)
    getTracer().trace(AppRouteRouteModuleSpan.loadUserland, () => undefined)
    getTracer().trace(RouteModuleSpan.loadManifests, () => undefined)
    getTracer().trace(InstrumentationSpan.register, () => undefined)
    getTracer().trace(InstrumentationSpan.loadModule, () => undefined)
    expect(exportedSpans).toEqual([
      NodeSpan.runHandler,
      LoadComponentsSpan.loadRouteModule,
      RouteModuleSpan.prepare,
      AppRouteRouteModuleSpan.loadUserland,
      InstrumentationSpan.register,
      InstrumentationSpan.loadModule,
    ])

    process.env.NEXT_OTEL_VERBOSE = '1'
    getTracer().trace(BaseServerSpan.render, () => undefined)
    getTracer().trace(RouteModuleSpan.loadManifests, () => undefined)
    getTracer().trace(InstrumentationSpan.loadModule, () => undefined)
    expect(exportedSpans).toEqual([
      NodeSpan.runHandler,
      LoadComponentsSpan.loadRouteModule,
      RouteModuleSpan.prepare,
      AppRouteRouteModuleSpan.loadUserland,
      InstrumentationSpan.register,
      InstrumentationSpan.loadModule,
      BaseServerSpan.render,
      RouteModuleSpan.loadManifests,
      InstrumentationSpan.loadModule,
    ])
  })

  it('does not record or export hidden spans', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    let receivedSpan: unknown = 'not-called'
    const startSpan = jest.fn()
    const startActiveSpan = jest.fn()
    trace.setGlobalTracerProvider({
      getTracer() {
        return { startSpan, startActiveSpan }
      },
    })

    getTracer().trace(BaseServerSpan.render, { hideSpan: true }, (span) => {
      receivedSpan = span
    })

    expect(receivedSpan).toBeUndefined()
    expect(getSpanRecords()).toEqual([])
    expect(startSpan).not.toHaveBeenCalled()
    expect(startActiveSpan).not.toHaveBeenCalled()
  })

  it('bypasses local span handling outside the dev server', () => {
    delete process.env.__NEXT_DEV_SERVER
    let receivedSpan: unknown = 'not-called'

    const result = getTracer().trace(NodeSpan.runHandler, (span) => {
      receivedSpan = span
      return 'result'
    })

    expect(result).toBe('result')
    expect(receivedSpan).toBeUndefined()
    expect(getSpanRecords()).toEqual([])
  })

  it('records sync trace calls without an OTel provider', () => {
    const result = getTracer().trace(
      NodeSpan.runHandler,
      {
        spanName: 'test.sync',
        attributes: {
          'next.route': '/products/[id]',
        },
      },
      () => 'result'
    )

    expect(result).toBe('result')
    expect(getSpanRecords({ name: 'test.sync' })).toEqual([
      expect.objectContaining({
        name: 'test.sync',
        route: '/products/[id]',
        status: 'ok',
        traceId: expect.stringMatching(/^[0-9a-f]{32}$/),
        spanId: expect.stringMatching(/^[0-9a-f]{16}$/),
        durationMs: expect.any(Number),
        attributes: expect.objectContaining({
          'next.route': '/products/[id]',
          'next.span_category': 'nextjs',
          'next.span_name': 'test.sync',
          'next.span_type': NodeSpan.runHandler,
        }),
      }),
    ])
  })

  it('records an explicit end time', () => {
    const startTime = Date.now() - 10
    const endTime = startTime + 5

    getTracer().trace(
      InstrumentationSpan.register,
      { startTime, endTime },
      () => undefined
    )

    expect(getSpanRecords({ name: InstrumentationSpan.register })).toEqual([
      expect.objectContaining({ durationMs: 5 }),
    ])
  })

  it('records app render fetch spans without an OTel provider', async () => {
    const result = await getTracer().trace(
      AppRenderSpan.fetch,
      {
        kind: SpanKind.CLIENT,
        spanName: 'fetch GET https://example.vercel.sh/',
        attributes: {
          'next.span_category': 'application',
          'http.url': 'https://example.vercel.sh/',
          'http.method': 'GET',
          'net.peer.name': 'example.vercel.sh',
        },
      },
      async () => 'response'
    )

    expect(result).toBe('response')
    expect(
      getSpanRecords({ name: 'fetch GET https://example.vercel.sh/' })
    ).toEqual([
      expect.objectContaining({
        name: 'fetch GET https://example.vercel.sh/',
        status: 'ok',
        attributes: expect.objectContaining({
          'next.span_name': 'fetch GET https://example.vercel.sh/',
          'next.span_type': AppRenderSpan.fetch,
          'next.span_category': 'application',
          'http.url': 'https://example.vercel.sh/',
          'http.method': 'GET',
          'net.peer.name': 'example.vercel.sh',
        }),
      }),
    ])
  })

  it('keeps OTel-isolated spans out of the active OTel context', async () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    process.env.NEXT_OTEL_VERBOSE = '1'
    context.disable()
    context.setGlobalContextManager(new TestContextManager())

    const exportedSpans: string[] = []
    const foregroundSpan = trace.wrapSpanContext({
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
      traceFlags: 1,
    })
    trace.setGlobalTracerProvider({
      getTracer() {
        return {
          startSpan(name: string) {
            exportedSpans.push(name)
            return foregroundSpan
          },
          startActiveSpan(...args: unknown[]) {
            exportedSpans.push(args[0] as string)
            const callback = args.at(-1) as (
              span: typeof foregroundSpan
            ) => unknown
            return callback(foregroundSpan)
          },
        }
      },
    })

    const foregroundContext = trace.setSpan(ROOT_CONTEXT, foregroundSpan)
    let activeSpanDuringLocalWork
    let activeSpanDuringNestedLocalWork
    let activeSpanDuringNextTrace
    let activeSpanDuringDirectWithSpan

    await context.with(foregroundContext, () =>
      traceLocalSpan(
        { name: 'Instant Insights', parentSpan: null },
        async () => {
          activeSpanDuringLocalWork = trace.getSpan(context.active())
          await traceLocalSpan(
            { name: 'Prepare validation inputs' },
            async () => {
              activeSpanDuringNestedLocalWork = trace.getSpan(context.active())
              getTracer().trace(NextNodeServerSpan.createComponentTree, () => {
                activeSpanDuringNextTrace = trace.getSpan(context.active())
              })
              const directSpan = getTracer().startSpan(
                NextNodeServerSpan.getLayoutOrPageModule
              )
              getTracer().withSpan(directSpan, () => {
                activeSpanDuringDirectWithSpan = trace.getSpan(context.active())
              })
              directSpan.end()
            }
          )
        }
      )
    )

    expect(activeSpanDuringLocalWork).toBe(foregroundSpan)
    expect(activeSpanDuringNestedLocalWork).toBe(foregroundSpan)
    expect(activeSpanDuringNextTrace).toBe(foregroundSpan)
    expect(activeSpanDuringDirectWithSpan).toBe(foregroundSpan)
    expect(exportedSpans).toEqual([])

    const rootRecord = getSpanRecords({ name: 'Instant Insights' })[0]
    const childRecord = getSpanRecords({
      name: 'Prepare validation inputs',
    })[0]
    const nestedNextRecord = getSpanRecords({
      name: NextNodeServerSpan.createComponentTree,
    })[0]
    const directNextRecord = getSpanRecords({
      name: NextNodeServerSpan.getLayoutOrPageModule,
    })[0]

    expect(rootRecord.parentSpanId).toBeUndefined()
    expect(rootRecord.traceId).not.toBe(foregroundSpan.spanContext().traceId)
    expect(childRecord).toEqual(
      expect.objectContaining({
        traceId: rootRecord.traceId,
        parentSpanId: rootRecord.spanId,
      })
    )
    expect(nestedNextRecord).toEqual(
      expect.objectContaining({
        traceId: rootRecord.traceId,
        parentSpanId: childRecord.spanId,
      })
    )
    expect(directNextRecord).toEqual(
      expect.objectContaining({
        traceId: rootRecord.traceId,
        parentSpanId: childRecord.spanId,
      })
    )
  })

  it('mirrors span mutations made through the OTel span API', () => {
    const result = getTracer().trace(
      NodeSpan.runHandler,
      { spanName: 'test.mutated' },
      (span) => {
        span?.setAttribute('http.status_code', 200)
        span?.setAttributes({
          'next.route': '/mutated',
        })
        span?.addEvent('test.event', {
          'next.phase': 'render',
        })
        span?.updateName('test.mutated.updated')
        return 'result'
      }
    )

    expect(result).toBe('result')
    expect(getSpanRecords({ name: 'test.mutated.updated' })).toEqual([
      expect.objectContaining({
        name: 'test.mutated.updated',
        route: '/mutated',
        attributes: expect.objectContaining({
          'http.status_code': 200,
          'next.route': '/mutated',
        }),
        events: [
          expect.objectContaining({
            name: 'test.event',
            attributes: {
              'next.phase': 'render',
            },
          }),
        ],
      }),
    ])
  })

  it('mirrors span status without a thrown error', () => {
    const result = getTracer().trace(
      NodeSpan.runHandler,
      { spanName: 'test.status' },
      (span) => {
        span?.setStatus({
          code: SpanStatusCode.ERROR,
          message: 'status failed',
        })
        return 'result'
      }
    )

    expect(result).toBe('result')
    expect(getSpanRecords({ name: 'test.status' })).toEqual([
      expect.objectContaining({
        name: 'test.status',
        status: 'error',
        error: {
          message: 'status failed',
        },
      }),
    ])
  })

  it('records async trace calls when the returned promise settles', async () => {
    const result = await getTracer().trace(
      NodeSpan.runHandler,
      { spanName: 'test.async' },
      async () => {
        await Promise.resolve()
        return 'result'
      }
    )

    expect(result).toBe('result')
    expect(getSpanRecords({ name: 'test.async' })).toEqual([
      expect.objectContaining({
        name: 'test.async',
        status: 'ok',
        durationMs: expect.any(Number),
      }),
    ])
  })

  it('records callback trace calls when done is called', () => {
    const result = getTracer().trace(
      NodeSpan.runHandler,
      { spanName: 'test.callback' },
      (_span, done) => {
        done?.()
        return 'result'
      }
    )

    expect(result).toBe('result')
    expect(getSpanRecords({ name: 'test.callback' })).toEqual([
      expect.objectContaining({
        name: 'test.callback',
        status: 'ok',
        durationMs: expect.any(Number),
      }),
    ])
  })

  it('records callback trace calls consistently with an OTel provider', () => {
    const delegateSpan = trace.wrapSpanContext({
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
      traceFlags: 1,
    })
    trace.setGlobalTracerProvider({
      getTracer() {
        return {
          startSpan() {
            return delegateSpan
          },
          startActiveSpan(...args: unknown[]) {
            const callback = args.at(-1) as (
              span: typeof delegateSpan
            ) => unknown
            return callback(delegateSpan)
          },
        }
      },
    })

    const result = getTracer().trace(
      NodeSpan.runHandler,
      { spanName: 'test.callback.provider' },
      (_span, done) => {
        done?.()
        return 'result'
      }
    )

    expect(result).toBe('result')
    expect(getSpanRecords({ name: 'test.callback.provider' })).toEqual([
      expect.objectContaining({
        status: 'ok',
        traceId: '0123456789abcdef0123456789abcdef',
        spanId: '0123456789abcdef',
      }),
    ])
  })

  it('records direct spans with active local parent identity', () => {
    const parentSpan = getTracer().startSpan(NodeSpan.runHandler, {
      attributes: { 'next.page': 'parent' },
    })
    let childSpanId: string | undefined

    getTracer().withSpan(parentSpan, () => {
      expect(getTracer().getActiveScopeSpan()).toBe(parentSpan)

      const childSpan = getTracer().startSpan(AppRenderSpan.fetch, {
        attributes: {
          'next.page': 'child',
          'next.span_category': 'application',
        },
      })
      childSpanId = childSpan.spanContext().spanId
      childSpan.end()
    })
    parentSpan.end()

    const records = getSpanRecords()
    const parentRecord = records.find(
      (record) => record.attributes?.['next.page'] === 'parent'
    )
    const childRecord = records.find(
      (record) => record.attributes?.['next.page'] === 'child'
    )

    expect(parentRecord).toEqual(
      expect.objectContaining({
        name: NodeSpan.runHandler,
        parentSpanId: undefined,
        attributes: expect.objectContaining({
          'next.span_category': 'nextjs',
        }),
      })
    )
    expect(childRecord).toEqual(
      expect.objectContaining({
        name: AppRenderSpan.fetch,
        spanId: childSpanId,
        traceId: parentRecord?.traceId,
        parentSpanId: parentRecord?.spanId,
        attributes: expect.objectContaining({
          'next.span_category': 'application',
        }),
      })
    )
  })

  it('records thrown errors before rethrowing', () => {
    expect(() =>
      getTracer().trace(NodeSpan.runHandler, { spanName: 'test.error' }, () => {
        throw new Error('boom')
      })
    ).toThrow('boom')

    expect(getSpanRecords({ name: 'test.error' })).toEqual([
      expect.objectContaining({
        name: 'test.error',
        status: 'error',
        error: {
          type: 'Error',
          message: 'boom',
        },
      }),
    ])
  })

  it('groups local spans by existing async storage without adding extra attributes', () => {
    jest.isolateModules(() => {
      const previousAsyncLocalStorage = (globalThis as any).AsyncLocalStorage
      let setIsolatedSpanRecorderForTest:
        | typeof setSpanRecorderForTest
        | undefined
      try {
        const { AsyncLocalStorage } =
          require('node:async_hooks') as typeof import('node:async_hooks')
        ;(globalThis as any).AsyncLocalStorage = AsyncLocalStorage

        const { workAsyncStorage } =
          require('../../app-render/work-async-storage.external') as typeof import('../../app-render/work-async-storage.external')
        const { workUnitAsyncStorage } =
          require('../../app-render/work-unit-async-storage.external') as typeof import('../../app-render/work-unit-async-storage.external')
        ;({ setSpanRecorderForTest: setIsolatedSpanRecorderForTest } =
          require('./span-store') as typeof import('./span-store'))
        setIsolatedSpanRecorderForTest((span) => spanRecords.push(span))
        const { registerLocalSpanRecorder: registerIsolatedLocalSpanRecorder } =
          require('./local-span-recorder') as typeof import('./local-span-recorder')
        registerIsolatedLocalSpanRecorder()
        const { getTracer: getIsolatedTracer } =
          require('./tracer') as typeof import('./tracer')

        const workStore = {
          page: '/products/[id]/page',
          route: '/products/[id]',
          cacheComponentsEnabled: true,
        } as WorkStore
        const requestStore = {
          type: 'request',
          phase: 'render',
          isHmrRefresh: true,
        } as WorkUnitStore

        workAsyncStorage.run(workStore, () =>
          workUnitAsyncStorage.run(requestStore, () => {
            getIsolatedTracer().trace(
              NodeSpan.runHandler,
              { spanName: 'test.als.outer' },
              (outerSpan) => {
                expect(getIsolatedTracer().getActiveScopeSpan()).toBe(outerSpan)
                getIsolatedTracer().trace(
                  NodeSpan.runHandler,
                  { spanName: 'test.als.inner' },
                  (innerSpan) => {
                    expect(getIsolatedTracer().getActiveScopeSpan()).toBe(
                      innerSpan
                    )
                    return 'result'
                  }
                )
              }
            )
          })
        )

        const records = getSpanRecords()
        const traceIds = new Set(records.map((record) => record.traceId))
        const outerRecord = records.find(
          (record) => record.name === 'test.als.outer'
        )
        const innerRecord = records.find(
          (record) => record.name === 'test.als.inner'
        )

        expect(records).toHaveLength(2)
        expect(traceIds.size).toBe(1)
        expect(innerRecord?.parentSpanId).toBe(outerRecord?.spanId)
        expect(records).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'test.als.inner',
              attributes: expect.objectContaining({
                'next.span_name': 'test.als.inner',
                'next.span_type': NodeSpan.runHandler,
              }),
            }),
            expect.objectContaining({
              name: 'test.als.outer',
            }),
          ])
        )
        expect(
          records.some(
            (record) => record.attributes?.['next.work_unit.type'] !== undefined
          )
        ).toBe(false)
      } finally {
        setIsolatedSpanRecorderForTest?.(undefined)
        if (previousAsyncLocalStorage === undefined) {
          delete (globalThis as any).AsyncLocalStorage
        } else {
          ;(globalThis as any).AsyncLocalStorage = previousAsyncLocalStorage
        }
      }
    })
  })
})

describe('recordSpanError', () => {
  function createSpan() {
    return {
      recordException: jest.fn(),
      setAttribute: jest.fn(),
      setStatus: jest.fn(),
      end: jest.fn(),
    }
  }

  it('records the error on the span without ending it', () => {
    const span = createSpan()
    const error = new TypeError('boom')

    recordSpanError(span as unknown as Span, error)

    expect(span.recordException).toHaveBeenCalledWith(error)
    expect(span.setAttribute).toHaveBeenCalledWith('error.type', 'TypeError')
    expect(span.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'boom',
    })
    expect(span.end).not.toHaveBeenCalled()
  })

  it('only marks bubbled errors', () => {
    const span = createSpan()

    recordSpanError(span as unknown as Span, new BubbledError(true))

    expect(span.setAttribute).toHaveBeenCalledWith('next.bubble', true)
    expect(span.recordException).not.toHaveBeenCalled()
    expect(span.setStatus).not.toHaveBeenCalled()
    expect(span.end).not.toHaveBeenCalled()
  })
})
