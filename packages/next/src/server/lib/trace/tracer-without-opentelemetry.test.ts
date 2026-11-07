/**
 * @jest-environment node
 */

// The tracer must not load the OpenTelemetry API while nothing is registered
// with it. The copies it can load are replaced by themselves plus a record of
// the load.
const mockApiLoads: string[] = []

jest.mock('@opentelemetry/api', () => {
  mockApiLoads.push('@opentelemetry/api')
  return jest.requireActual('@opentelemetry/api')
})
jest.mock('next/dist/compiled/@opentelemetry/api', () => {
  mockApiLoads.push('next/dist/compiled/@opentelemetry/api')
  return jest.requireActual('next/dist/compiled/@opentelemetry/api')
})

import { AppRenderSpan, BaseServerSpan } from './constants'

// Not an `import`: it would be evaluated before the lines above.
const { getTracer, preloadOpenTelemetryApi, SpanKind, SpanStatusCode } =
  require('./tracer') as typeof import('./tracer')

// The API itself, without the record of the load.
const requireActualApi = () =>
  jest.requireActual(
    '@opentelemetry/api'
  ) as typeof import('@opentelemetry/api')

describe('tracer without OpenTelemetry', () => {
  const tracer = getTracer()

  // Every public method of the tracer has to be called here, except
  // `getContext`, which returns an object of the API.
  it('returns what the API returns without registrations and does not load it', () => {
    expect(tracer.isOpenTelemetryEnabled()).toBe(false)
    expect(tracer.hasActiveSpanContext()).toBe(false)
    expect(tracer.getActiveScopeSpan()).toBeUndefined()
    expect(tracer.getTracePropagationData()).toEqual([])
    expect(tracer.getTraceContextHeaders()).toBeUndefined()
    expect(tracer.getRootSpanAttributes()).toBeUndefined()
    expect(tracer.setRootSpanAttribute('next.route', '/')).toBeUndefined()
    expect(tracer.getRootSpanAttributes()).toBeUndefined()

    // A traced function runs without a span.
    const traced = (...args: unknown[]) => args
    expect(tracer.trace(BaseServerSpan.handleRequest, traced)).toEqual([])
    expect(
      tracer.trace(
        BaseServerSpan.handleRequest,
        { spanName: 'GET', kind: SpanKind.SERVER },
        traced
      )
    ).toEqual([])
    expect(
      tracer.withPropagatedContext(
        {
          traceparent:
            '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
        },
        () => 'propagated'
      )
    ).toBe('propagated')

    const wrapped = tracer.wrap(
      BaseServerSpan.handleRequest,
      function (this: unknown, a: number, b: number) {
        return [this, a + b]
      }
    )
    expect(wrapped.call('receiver', 1, 2)).toEqual(['receiver', 3])

    const callback = jest.fn()
    tracer.wrap(
      BaseServerSpan.handleRequest,
      (value: string, done: (error: null, value: string) => void) =>
        done(null, value)
    )('value', callback)
    expect(callback).toHaveBeenCalledWith(null, 'value')

    const span = tracer.startSpan(AppRenderSpan.getBodyResult)
    expect(span.isRecording()).toBe(false)
    expect(span.spanContext()).toEqual({
      traceId: '00000000000000000000000000000000',
      spanId: '0000000000000000',
      traceFlags: 0,
    })
    expect(
      span
        .setAttribute('next.route', '/')
        .setAttributes({ 'next.rsc': false })
        .addEvent('event')
        .setStatus({ code: SpanStatusCode.ERROR })
        .updateName('name')
    ).toBe(span)
    span.recordException(new Error('ignored'))
    span.end()
    expect(tracer.withSpan(span, () => 'in span')).toBe('in span')

    expect(mockApiLoads).toEqual([])
  })

  // The tracer restates these values of the API so that it doesn't have to
  // load it. Compared with the API here, so that they can't drift apart.
  it('returns the enum values and the no-op span of the API', () => {
    const api = requireActualApi()

    // A TypeScript enum also maps each value back to its name.
    const namedValues = (values: object) =>
      Object.fromEntries(
        Object.entries(values).filter(([key]) => isNaN(Number(key)))
      )
    expect(SpanKind).toEqual(namedValues(api.SpanKind))
    expect(SpanStatusCode).toEqual(namedValues(api.SpanStatusCode))

    // What the API starts while no tracer provider is registered.
    const apiSpan = api.trace.getTracer('next.js').startSpan('span')
    const span = tracer.startSpan(AppRenderSpan.getBodyResult)
    expect(span.spanContext()).toEqual(api.INVALID_SPAN_CONTEXT)
    expect(span.spanContext()).toEqual(apiSpan.spanContext())
    expect(span.isRecording()).toBe(apiSpan.isRecording())

    // The same methods, and the same ones return the span for chaining.
    const methodsOf = (object: object) =>
      Object.getOwnPropertyNames(object)
        .filter((name) => name !== 'constructor')
        .sort()
    const methods = methodsOf(Object.getPrototypeOf(apiSpan))
    expect(methodsOf(span)).toEqual(methods)
    const chainable = (object: any) =>
      methods.filter((method) => object[method]('name', 'value') === object)
    expect(chainable(span)).toEqual(chainable(apiSpan))
  })

  it('keeps its own results after the API was loaded ahead of time', () => {
    const span = tracer.startSpan(AppRenderSpan.getBodyResult)

    preloadOpenTelemetryApi()

    // The package of the app is loaded, as the tracer would load it.
    expect(mockApiLoads).toEqual(['@opentelemetry/api'])
    // Nothing is registered: the tracer still doesn't go through the API,
    // which would start a new span for every call.
    expect(tracer.isOpenTelemetryEnabled()).toBe(false)
    expect(tracer.startSpan(AppRenderSpan.getBodyResult)).toBe(span)
  })

  it('uses the API once a tracer provider is registered', () => {
    const api = requireActualApi()
    const started: string[] = []
    const span = api.trace.wrapSpanContext(api.INVALID_SPAN_CONTEXT)

    // The tracer looks for the registry that the API creates on `globalThis`
    // with its first registration, so a registration through the API has to
    // be what makes the tracer use it.
    expect(tracer.isOpenTelemetryEnabled()).toBe(false)
    api.trace.setGlobalTracerProvider({
      getTracer: () => ({
        startSpan(name: string) {
          started.push(name)
          return span
        },
        startActiveSpan(name: string, ...args: unknown[]) {
          started.push(name)
          return (args[args.length - 1] as (span: unknown) => unknown)(span)
        },
      }),
    })

    try {
      expect(tracer.isOpenTelemetryEnabled()).toBe(true)
      expect(
        tracer.trace(
          BaseServerSpan.handleRequest,
          { spanName: 'GET' },
          (tracedSpan) => tracedSpan
        )
      ).toBe(span)
      expect(tracer.startSpan(AppRenderSpan.getBodyResult)).toBe(span)
      expect(started).toEqual(['GET', AppRenderSpan.getBodyResult])
      expect(tracer.getContext()).toBe(api.context)
      expect(mockApiLoads).toEqual(['@opentelemetry/api'])
    } finally {
      api.trace.disable()
    }
  })
})
