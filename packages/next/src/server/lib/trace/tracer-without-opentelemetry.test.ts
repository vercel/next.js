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
const { getTracer, SpanKind, SpanStatusCode } =
  require('./tracer') as typeof import('./tracer')

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

  it('uses the API once a tracer provider is registered', () => {
    const api = jest.requireActual(
      '@opentelemetry/api'
    ) as typeof import('@opentelemetry/api')
    const started: string[] = []
    const span = api.trace.wrapSpanContext(api.INVALID_SPAN_CONTEXT)

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
