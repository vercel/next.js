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
import {
  workAsyncStorage,
  type WorkStore,
} from '../../app-render/work-async-storage.external'
import {
  workUnitAsyncStorage,
  type WorkUnitStore,
} from '../../app-render/work-unit-async-storage.external'
import {
  ROOT_CONTEXT,
  context,
  createContextKey,
  propagation,
  trace,
} from '@opentelemetry/api'

import {
  isLocalSpanRecordingEnabled,
  runWithLocalSpanSink,
  setSpanRecorderForTest,
  type SpanStoreRecord,
} from './span-store'
import {
  traceLocalSpan,
  registerLocalSpanRecorder,
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

function sdkSpan(spanId = '0123456789abcdef') {
  return trace.wrapSpanContext({
    traceId: '0123456789abcdef0123456789abcdef',
    spanId,
    traceFlags: 1,
  })
}

function installTracer(delegate: Span = sdkSpan(), started: string[] = []) {
  const startSpan = jest.fn((name: string) => {
    started.push(name)
    return delegate
  })
  const startActiveSpan = jest.fn((...args: unknown[]) => {
    started.push(args[0] as string)
    return (args.at(-1) as (span: Span) => unknown)(delegate)
  })
  trace.setGlobalTracerProvider({
    getTracer: () => ({ startSpan, startActiveSpan }),
  })
  return { startSpan, startActiveSpan }
}

function expectRecorded(name: string, expected: Partial<SpanStoreRecord>) {
  expect(getSpanRecords({ name })).toEqual([expect.objectContaining(expected)])
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

  it('records a local-only trace only while a worker sink is active', async () => {
    setSpanRecorderForTest(undefined)
    const workerRecords: SpanStoreRecord[] = []
    registerLocalSpanRecorder({ sinkOnly: true })

    getTracer().trace(NodeSpan.runHandler, () => undefined)
    expect(workerRecords).toEqual([])

    await runWithLocalSpanSink(
      (span) => workerRecords.push(span),
      () => {
        expect(isLocalSpanRecordingEnabled()).toBe(true)
        return getTracer().trace(
          LoadComponentsSpan.loadRouteModule,
          { spanName: 'load route module' },
          () => getTracer().trace(NodeSpan.runHandler, () => Promise.resolve())
        )
      }
    )

    const loadSpan = workerRecords.find(
      (span) => span.name === 'load route module'
    )!
    const handlerSpan = workerRecords.find(
      (span) => span.name === NodeSpan.runHandler
    )!
    expect(loadSpan.parentSpanId).toBeUndefined()
    expect(handlerSpan).toMatchObject({
      traceId: loadSpan.traceId,
      parentSpanId: loadSpan.spanId,
    })
    getTracer().trace(NodeSpan.runHandler, () => undefined)
    expect(workerRecords).toHaveLength(2)
    registerLocalSpanRecorder()
  })

  it('records unselected trace and wrapped spans for request insights', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'

    getTracer().trace(BaseServerSpan.render, () => undefined)
    const wrappedLoadComponents = getTracer().wrap(
      LoadComponentsSpan.loadComponents,
      () => undefined
    )
    wrappedLoadComponents()

    expect(getSpanRecords()).toMatchObject([
      {
        name: BaseServerSpan.render,
        attributes: expect.objectContaining({
          'next.span_category': 'nextjs',
        }),
      },
      {
        name: LoadComponentsSpan.loadComponents,
        attributes: expect.objectContaining({
          'next.span_category': 'nextjs',
        }),
      },
    ])
  })

  it('only exports selected spans unless verbose tracing is enabled', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    const exportedSpans: string[] = []
    const delegateSpan = sdkSpan()
    installTracer(delegateSpan, exportedSpans)

    const expected: string[] = []
    for (const [type, allowed] of [
      [BaseServerSpan.render, false],
      [NodeSpan.runHandler, true],
      [LoadComponentsSpan.loadRouteModule, true],
      [RouteModuleSpan.prepare, true],
      [AppRouteRouteModuleSpan.loadUserland, true],
      [RouteModuleSpan.loadManifests, false],
      [InstrumentationSpan.register, true],
      [InstrumentationSpan.loadModule, true],
    ] as const) {
      getTracer().trace(type, () => undefined)
      if (allowed) expected.push(type)
      expect(exportedSpans).toEqual(expected)
    }

    process.env.NEXT_OTEL_VERBOSE = '1'
    getTracer().trace(BaseServerSpan.render, () => undefined)
    getTracer().trace(RouteModuleSpan.loadManifests, () => undefined)
    getTracer().trace(InstrumentationSpan.loadModule, () => undefined)
    expect(exportedSpans).toEqual([
      ...expected,
      BaseServerSpan.render,
      RouteModuleSpan.loadManifests,
      InstrumentationSpan.loadModule,
    ])
  })

  it('does not record or export hidden spans', () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    let receivedSpan: unknown = 'not-called'
    const { startSpan, startActiveSpan } = installTracer()

    getTracer().trace(BaseServerSpan.render, { hideSpan: true }, (span) => {
      receivedSpan = span
    })

    expect(receivedSpan).toBeUndefined()
    expect(getSpanRecords()).toEqual([])
    expect(startSpan).not.toHaveBeenCalled()
    expect(startActiveSpan).not.toHaveBeenCalled()
  })

  it('starts direct spans without filtering through the vanilla allowlist', () => {
    const { startSpan } = installTracer()
    for (const dev of [false, true]) {
      if (dev) process.env.__NEXT_DEV_SERVER = '1'
      else delete process.env.__NEXT_DEV_SERVER
      getTracer().startSpan(BaseServerSpan.render).end()
    }
    expect(startSpan).toHaveBeenCalledTimes(2)
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
    expectRecorded('test.sync', {
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
    })
  })

  it('records an explicit end time', () => {
    const startTime = Date.now() - 10
    const endTime = startTime + 5

    getTracer().trace(
      InstrumentationSpan.register,
      { startTime, endTime },
      () => undefined
    )

    expectRecorded(InstrumentationSpan.register, { durationMs: 5 })
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
    ).toMatchObject([
      {
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
      },
    ])
  })

  it('keeps OTel-isolated spans out of the active OTel context', async () => {
    process.env.__NEXT_REQUEST_INSIGHTS = 'true'
    process.env.NEXT_OTEL_VERBOSE = '1'
    context.disable()
    context.setGlobalContextManager(new TestContextManager())

    const exportedSpans: string[] = []
    const foregroundSpan = sdkSpan()
    installTracer(foregroundSpan, exportedSpans)

    const foregroundContext = trace.setSpan(ROOT_CONTEXT, foregroundSpan)

    await context.with(foregroundContext, () =>
      traceLocalSpan(
        { name: 'Instant Insights', parentSpan: null },
        async () => {
          expect(trace.getSpan(context.active())).toBe(foregroundSpan)
          await traceLocalSpan(
            { name: 'Prepare validation inputs' },
            async () => {
              expect(trace.getSpan(context.active())).toBe(foregroundSpan)
              getTracer().trace(NextNodeServerSpan.createComponentTree, () => {
                expect(trace.getSpan(context.active())).toBe(foregroundSpan)
              })
              const directSpan = getTracer().startSpan(
                NextNodeServerSpan.getLayoutOrPageModule
              )
              getTracer().withSpan(directSpan, () => {
                expect(trace.getSpan(context.active())).toBe(foregroundSpan)
              })
              directSpan.end()
            }
          )
        }
      )
    )

    expect(exportedSpans).toEqual([])

    const rootRecord = getSpanRecords({ name: 'Instant Insights' })[0]
    const childRecord = getSpanRecords({
      name: 'Prepare validation inputs',
    })[0]

    expect(rootRecord.parentSpanId).toBeUndefined()
    expect(rootRecord.traceId).not.toBe(foregroundSpan.spanContext().traceId)
    expect(childRecord).toMatchObject({
      traceId: rootRecord.traceId,
      parentSpanId: rootRecord.spanId,
    })
    for (const name of [
      NextNodeServerSpan.createComponentTree,
      NextNodeServerSpan.getLayoutOrPageModule,
    ]) {
      expectRecorded(name, {
        traceId: rootRecord.traceId,
        parentSpanId: childRecord.spanId,
      })
    }
  })

  it.each(['implicit', 'explicit', 'newer public'])(
    'preserves public context and local parenting with an %s parent',
    (mode) => {
      context.setGlobalContextManager(new TestContextManager())
      const publicParent = sdkSpan()
      const publicChild = sdkSpan('1123456789abcdef')
      const activePublic = mode === 'newer public' ? publicChild : publicParent
      context.with(trace.setSpan(ROOT_CONTEXT, publicParent), () => {
        getTracer().trace(
          AppRenderSpan.renderToReadableStream,
          (localParent) => {
            expect(getTracer().getActiveScopeSpan()).toBe(localParent)
            expect(trace.getSpan(context.active())).toBe(publicParent)
            getTracer().withSpan(localParent!, () => {
              expect(trace.getSpan(context.active())).toBe(publicParent)
            })
            context.with(trace.setSpan(context.active(), activePublic), () => {
              expect(getTracer().getActiveScopeSpan()).toBe(
                mode === 'newer public' ? publicChild : localParent
              )
              getTracer().trace(
                AppRenderSpan.fetch,
                {
                  ...(mode === 'explicit' ? { parentSpan: localParent } : {}),
                },
                () => expect(trace.getSpan(context.active())).toBe(activePublic)
              )
            })
            expect(getTracer().getActiveScopeSpan()).toBe(localParent)
          }
        )
      })
      const parent = getSpanRecords({
        name: AppRenderSpan.renderToReadableStream,
      })[0]
      expect(parent.parentSpanId).toBe(publicParent.spanContext().spanId)
      expectRecorded(AppRenderSpan.fetch, {
        parentSpanId:
          mode === 'newer public'
            ? publicChild.spanContext().spanId
            : parent.spanId,
      })
    }
  )

  it('does not borrow an unrelated public span for an explicit local root', () => {
    context.setGlobalContextManager(new TestContextManager())
    const localRoot = getTracer().startSpan(
      AppRenderSpan.renderToReadableStream
    )
    const unrelated = sdkSpan()

    context.with(trace.setSpan(ROOT_CONTEXT, unrelated), () => {
      getTracer().withSpan(localRoot, () => {
        expect(trace.getSpan(context.active())).toBeUndefined()
        expect(getTracer().getActiveScopeSpan()).toBe(localRoot)
      })
      getTracer().trace(AppRenderSpan.fetch, { parentSpan: localRoot }, () => {
        expect(trace.getSpan(context.active())).toBeUndefined()
      })
      expect(trace.getSpan(context.active())).toBe(unrelated)
    })
    localRoot.end()
  })

  it('keeps a local helper under its local scope inside a newer public span', async () => {
    context.setGlobalContextManager(new TestContextManager())
    const publicChild = sdkSpan()

    await getTracer().trace(AppRenderSpan.renderToReadableStream, () =>
      context.with(trace.setSpan(context.active(), publicChild), () =>
        traceLocalSpan({ name: 'local helper' }, async () => undefined)
      )
    )

    const parent = getSpanRecords({
      name: AppRenderSpan.renderToReadableStream,
    })[0]
    expect(getSpanRecords({ name: 'local helper' })[0]).toMatchObject({
      traceId: parent.traceId,
      parentSpanId: parent.spanId,
    })
  })

  it('updates the local scope attributes inside a newer public span', () => {
    context.setGlobalContextManager(new TestContextManager())
    const publicChild = sdkSpan()

    getTracer().trace(AppRenderSpan.renderToReadableStream, () => {
      context.with(trace.setSpan(context.active(), publicChild), () => {
        getTracer().setRootSpanAttribute('next.route', '/dashboard')
      })
    })

    expect(
      getSpanRecords({ name: AppRenderSpan.renderToReadableStream })[0]
        .attributes
    ).toMatchObject({ 'next.route': '/dashboard' })
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
    expectRecorded('test.mutated.updated', {
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
    })
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
    expectRecorded('test.status', {
      status: 'error',
      error: {
        message: 'status failed',
      },
    })
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
    expectRecorded('test.async', {
      status: 'ok',
      durationMs: expect.any(Number),
    })
  })

  it.each([false, true])(
    'records callback completion with provider=%s',
    (provider) => {
      const delegate = sdkSpan()
      if (provider) installTracer(delegate)
      const result = getTracer().trace(
        NodeSpan.runHandler,
        { spanName: 'test.callback' },
        (_span, done) => {
          done?.()
          return 'result'
        }
      )

      expect(result).toBe('result')
      expectRecorded('test.callback', {
        status: 'ok',
        durationMs: expect.any(Number),
        ...(provider
          ? {
              traceId: delegate.spanContext().traceId,
              spanId: delegate.spanContext().spanId,
            }
          : {}),
      })
    }
  )

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

    expect(parentRecord).toMatchObject({
      name: NodeSpan.runHandler,
      parentSpanId: undefined,
      attributes: expect.objectContaining({
        'next.span_category': 'nextjs',
      }),
    })
    expect(childRecord).toMatchObject({
      name: AppRenderSpan.fetch,
      spanId: childSpanId,
      traceId: parentRecord?.traceId,
      parentSpanId: parentRecord?.spanId,
      attributes: expect.objectContaining({
        'next.span_category': 'application',
      }),
    })
  })

  it('records thrown errors before rethrowing', () => {
    expect(() =>
      getTracer().trace(NodeSpan.runHandler, { spanName: 'test.error' }, () => {
        throw new Error('boom')
      })
    ).toThrow('boom')

    expectRecorded('test.error', {
      status: 'error',
      error: {
        type: 'Error',
        message: 'boom',
      },
    })
  })

  it('groups local spans by existing async storage without adding extra attributes', () => {
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
        getTracer().trace(
          NodeSpan.runHandler,
          { spanName: 'test.als.outer' },
          (outerSpan) => {
            expect(getTracer().getActiveScopeSpan()).toBe(outerSpan)
            getTracer().trace(
              NodeSpan.runHandler,
              { spanName: 'test.als.inner' },
              (innerSpan) => {
                expect(getTracer().getActiveScopeSpan()).toBe(innerSpan)
                return 'result'
              }
            )
          }
        )
      })
    )

    const records = getSpanRecords()
    expect(records).toHaveLength(2)
    const outer = getSpanRecords({ name: 'test.als.outer' })[0]
    expect(outer).toBeDefined()
    expectRecorded('test.als.inner', {
      traceId: outer.traceId,
      parentSpanId: outer.spanId,
      attributes: expect.objectContaining({
        'next.span_name': 'test.als.inner',
        'next.span_type': NodeSpan.runHandler,
      }),
    })
    expect(
      records.some(
        (record) => record.attributes?.['next.work_unit.type'] !== undefined
      )
    ).toBe(false)
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
