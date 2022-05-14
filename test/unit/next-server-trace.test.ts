import { Span } from '@opentelemetry/api'

/* eslint-env jest */
const {
  getTracer,
  configureTracer,
}: typeof import('next/server/lib/trace/tracer') = require('next/dist/server/lib/trace/tracer')

describe('Tracer', () => {
  const serviceName = 'tracer-unit-test-service'

  beforeAll(() => {
    const {
      NodeTracerProvider,
    }: typeof import('@opentelemetry/sdk-trace-node') = require('next/dist/compiled/@opentelemetry/sdk-trace-node')

    const {
      Resource,
    }: typeof import('@opentelemetry/resources') = require('next/dist/compiled/@opentelemetry/resources')

    const {
      SemanticResourceAttributes,
    }: typeof import('@opentelemetry/semantic-conventions') = require('next/dist/compiled/@opentelemetry/semantic-conventions')

    const provider = new NodeTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      }),
    })

    // in the tests, do not set any exporters
    provider.register()

    configureTracer({
      serviceName,
    })
  })

  describe('trace', () => {
    it('should run the callback with a new span', () => {
      const tracer = getTracer()
      const traceName = 'dummy_trace_name_test_1'

      return new Promise((res) =>
        tracer.trace(traceName, (span) => {
          expect(span).toEqual(expect.objectContaining({ name: traceName }))
          res(0)
        })
      )
    })

    it('should accept options', () => {
      const tracer = getTracer()
      const traceName = 'dummy_trace_name_test_2'
      const options = {
        kind: 0,
        attributes: {
          dummy: 3,
        },
      }

      return new Promise((res) =>
        tracer.trace(traceName, options, (span) => {
          expect(span).toEqual(
            expect.objectContaining({ name: traceName, ...options })
          )
          res(0)
        })
      )
    })

    it('should activate the span', () => {
      const tracer = getTracer()

      return new Promise((res) =>
        tracer.trace('name', (span) => {
          expect(span.isRecording()).toBe(true)
          res(0)
        })
      )
    })

    it('should start the span as a child of the active span', () => {
      const tracer = getTracer()

      const context = tracer.getContext()
      const parentContext = context.active()

      const parent = tracer.startSpan('parent')
      const contextWithSpanSet = (tracer as any).traceApi.setSpan(
        parentContext,
        parent
      )

      return new Promise((res) =>
        context.with(contextWithSpanSet, () => {
          tracer.trace('name', (span) => {
            expect(span).toEqual(
              expect.objectContaining({
                parentSpanId: parent.spanContext().spanId,
              })
            )
            res(0)
          })
        })
      )
    })

    it('should allow overriding the parent span', () => {
      const tracer = getTracer()
      const parent = tracer.startSpan('parent')

      return new Promise((res) =>
        tracer.trace('name', { parentSpan: parent }, (span) => {
          expect(span).toEqual(
            expect.objectContaining({
              parentSpanId: parent.spanContext().spanId,
            })
          )
          res(0)
        })
      )
    })

    it('should return the value from the callback', () => {
      const tracer = getTracer()
      const result = tracer.trace('name', {}, (span) => 'test')

      expect(result).toEqual('test')
    })

    it('should finish the span', () => {
      const tracer = getTracer()
      let span: Span

      tracer.trace('name', {}, (_span) => {
        span = _span
      })

      expect(span).toEqual(expect.objectContaining({ _ended: true }))
    })

    it('should handle exceptions', () => {
      expect.assertions(1)

      const tracer = getTracer()
      let span: Span

      try {
        tracer.trace('name', {}, (_span) => {
          span = _span
          throw new Error('boom')
        })
      } catch (e) {
        // eslint-disable-next-line jest/no-try-expect
        expect(span).toEqual(
          expect.objectContaining({
            _ended: true,
            status: { code: 2, message: e.message },
          })
        )
      }
    })

    describe('with a callback taking a callback', () => {
      it('should wait for the callback to be called before finishing the span', () => {
        const tracer = getTracer()
        let span: Span
        let done: Function

        tracer.trace('name', {}, (_span, _done) => {
          span = _span
          done = _done
        })

        expect(span.isRecording()).toBe(true)
        expect(span).toEqual(
          expect.objectContaining({
            _ended: false,
          })
        )

        done()

        expect(span.isRecording()).toBe(false)
        expect(span).toEqual(
          expect.objectContaining({
            _ended: true,
          })
        )
      })

      it('should handle errors', () => {
        const tracer = getTracer()

        const error = new Error('boom')
        let span: Span
        let done: Function

        tracer.trace('name', {}, (_span, _done) => {
          span = _span
          done = _done
        })

        done(error)

        expect(span.isRecording()).toBe(false)

        expect(span).toEqual(
          expect.objectContaining({
            _ended: true,
            status: { code: 2, message: error.message },
          })
        )
      })
    })

    describe('with a callback returning a promise', () => {
      it('should wait for the promise to resolve before finishing the span', async () => {
        expect.assertions(4)
        const tracer = getTracer()

        const deferred: any = {}
        const promise = new Promise((resolve) => {
          deferred.resolve = resolve
        })

        let span: Span

        let traceAwaiter = tracer
          .trace('name', {}, (_span) => {
            span = _span
            return promise
          })
          .then(() => {
            expect(span.isRecording()).toBe(false)

            expect(span).toEqual(
              expect.objectContaining({
                _ended: true,
              })
            )
          })

        expect(span.isRecording()).toBe(true)

        expect(span).toEqual(
          expect.objectContaining({
            _ended: false,
          })
        )

        deferred.resolve()
        return traceAwaiter
      })

      it('should handle rejected promises', async () => {
        const tracer = getTracer()
        let span: Span

        let tracerAwaiter = tracer
          .trace('name', {}, (_span) => {
            span = _span
            return Promise.reject(new Error('boom'))
          })
          .catch((error) => {
            expect(span.isRecording()).toBe(false)
            expect(span).toEqual(
              expect.objectContaining({
                _ended: true,
                status: { code: 2, message: error.message },
              })
            )
          })

        return tracerAwaiter
      })
    })
  })

  describe('wrap', () => {})
})
