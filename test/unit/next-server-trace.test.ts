const {
  NodeTracerProvider,
} = require('next/dist/compiled/@opentelemetry/sdk-trace-node')

const { Resource } = require('next/dist/compiled/@opentelemetry/resources')

const {
  SemanticResourceAttributes,
} = require('next/dist/compiled/@opentelemetry/semantic-conventions')

/* eslint-env jest */
const {
  getTracer,
  configureTracer,
}: typeof import('next/server/lib/trace/tracer') = require('next/dist/server/lib/trace/tracer')

describe('Tracer', () => {
  const serviceName = 'tracer-unit-test-service'

  beforeAll(() => {
    const provider = new NodeTracerProvider({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      }),
    })

    // in the tests, do not set any exporters
    provider.register()

    configureTracer({
      serviceName,
      provider,
    })
  })

  describe('trace', () => {
    it('should run the callback with a new span', () => {
      const tracer = getTracer()
      const traceName = 'dummy_trace_name_test_1' as any

      return new Promise((res) =>
        tracer.trace(traceName, (span) => {
          expect(span).toEqual(expect.objectContaining({ name: traceName }))
          res(0)
        })
      )
    })

    it('should accept options', () => {
      const tracer = getTracer()
      const traceName = 'dummy_trace_name_test_2' as any
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
        tracer.trace('name' as any, (span) => {
          expect(span.isRecording()).toBe(true)
          res(0)
        })
      )
    })

    it('should start the span as a child of the active span', () => {
      const tracer = getTracer()

      const context = tracer.getContext()
      const parentContext = context.active()

      const parent = tracer.startSpan('parent' as any)
      const contextWithSpanSet = (tracer as any).traceApi.setSpan(
        parentContext,
        parent
      )

      return new Promise((res) =>
        context.with(contextWithSpanSet, () => {
          tracer.trace('name' as any, (span) => {
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
      const parent = tracer.startSpan('parent' as any)

      return new Promise((res) =>
        tracer.trace('name' as any, { parentSpan: parent }, (span) => {
          expect(span).toEqual(
            expect.objectContaining({
              parentSpanId: parent.spanContext().spanId,
            })
          )
          res(0)
        })
      )
    })

    it('should automatically set current context span as parent', async () => {
      expect.assertions(2)

      const tracer = getTracer()

      await new Promise((res) =>
        tracer.trace('parentTraceDummy' as any, (parentSpan) => {
          tracer.trace('childTraceDummy' as any, (childSpan) => {
            expect(tracer.getContext().active()).toBeDefined()
            expect(childSpan).toEqual(
              expect.objectContaining({
                parentSpanId: parentSpan.spanContext().spanId,
              })
            )
            res(0)
          })
        })
      )
    })

    it('should return the value from the callback', () => {
      const tracer = getTracer()
      const result = tracer.trace('name' as any, {}, (span) => 'test')

      expect(result).toEqual('test')
    })

    it('should finish the span', () => {
      const tracer = getTracer()
      let span: any

      tracer.trace('name' as any, {}, (_span) => {
        span = _span
      })

      expect(span).toEqual(expect.objectContaining({ _ended: true }))
    })

    it('should handle exceptions', () => {
      expect.assertions(1)

      const tracer = getTracer()
      let span: any

      try {
        tracer.trace('name' as any, {}, (_span) => {
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
        let span: any
        let done: Function

        tracer.trace('name' as any, {}, (_span, _done) => {
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
        let span: any
        let done: Function

        tracer.trace('name' as any, {}, (_span, _done) => {
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

        let span: any

        let traceAwaiter = tracer
          .trace('name' as any, {}, (_span) => {
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
        let span: any

        let tracerAwaiter = tracer
          .trace('name' as any, {}, (_span) => {
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

  describe('wrap', () => {
    it('should return a new function that automatically calls tracer.trace()', () => {
      const tracer = getTracer()
      const it = {}

      const traceMock = jest.spyOn(tracer, 'trace')

      const callback = jest.fn(function (foo: any) {
        expect(tracer.getContext().active()).toBeDefined()
        expect(this).toEqual(it)
        expect(foo).toEqual('foo')
        return 'test'
      })

      const fn = tracer.wrap('name' as any, {}, callback)

      const result = fn.call(it, 'foo')

      expect(traceMock).toHaveBeenCalledWith('name', {}, expect.any(Function))
      expect(callback).toHaveBeenCalled()
      expect(result).toEqual('test')
    })

    // eslint-disable-next-line jest/no-done-callback
    it('should wait for the callback to be called before finishing the span', (done) => {
      expect.assertions(2)

      const tracer = getTracer()
      const fn = tracer.wrap(
        'name' as any,
        {},
        jest.fn(function (cb) {
          const span = tracer.getActiveScopeSpan()

          setImmediate(() => {
            expect(span.isRecording()).toEqual(true)
          })

          setImmediate(() => cb())

          setImmediate(() => {
            expect(span.isRecording()).toEqual(false)
            done()
          })
        })
      )

      fn(() => {})
    })

    it('should handle rejected promises', () => {
      expect.assertions(1)

      const tracer = getTracer()
      const fn = tracer.wrap('name' as any, {}, (cb: Function) => cb())

      return fn(() => Promise.reject(new Error('boom'))).catch((err: any) => {
        expect(err.message).toEqual('boom')
      })
    })

    it('should accept a function without option', () => {
      const tracer = getTracer()
      jest.spyOn(tracer, 'trace')

      const fn = tracer.wrap(
        'name' as any,
        function (arg1: string, arg2: string) {
          return `${arg1}-${arg2}`
        }
      )

      const result = fn('hello', 'goodbye')
      expect(result).toEqual('hello-goodbye')
    })

    it('should accept an options object', () => {
      const tracer = getTracer()
      jest.spyOn(tracer, 'trace')
      const options = { attributes: { sometag: 'somevalue' } }

      const fn = tracer.wrap(
        'name' as any,
        options,
        function (..._args: Array<any>) {}
      )

      fn('hello', 'goodbye')

      expect(tracer.trace).toHaveBeenCalledWith(
        'name',
        options,
        expect.any(Function)
      )
    })

    it('should accept an options function, invoked on every invocation of the wrapped function', () => {
      const tracer = getTracer()
      const it = {}

      jest.spyOn(tracer, 'trace')

      let invocations = 0

      function options(foo: any, bar: any) {
        invocations++
        expect(this).toEqual(it)
        expect(foo).toEqual('hello')
        expect(bar).toEqual('goodbye')
        return { attributes: { sometag: 'somevalue', invocations } }
      }

      const fn = tracer.wrap('name' as any, options, function () {})

      fn.call(it, 'hello', 'goodbye')

      expect(tracer.trace).toHaveBeenLastCalledWith(
        'name',
        {
          attributes: { sometag: 'somevalue', invocations: 1 },
        },
        expect.any(Function)
      )

      fn.call(it, 'hello', 'goodbye')

      expect(tracer.trace).toHaveBeenLastCalledWith(
        'name',
        {
          attributes: { sometag: 'somevalue', invocations: 2 },
        },
        expect.any(Function)
      )
    })

    it('should automatically set current context span as parent', async () => {
      expect.assertions(3)

      const tracer = getTracer()
      let parentSpan: any

      const callback = jest.fn(function (foo: any) {
        const currentSpan = tracer.getActiveScopeSpan()

        expect(currentSpan).toEqual(
          expect.objectContaining({
            parentSpanId: parentSpan.spanContext().spanId,
          })
        )

        expect(tracer.getContext().active()).toBeDefined()
        expect(foo).toEqual('foo')
        return 'test'
      })

      const fn = tracer.wrap('child' as any, {}, callback)

      await new Promise((res) =>
        tracer.trace('parentTraceDummy' as any, (span) => {
          parentSpan = span
          // call wrapped fn inside of trace context, without explicitly setting current span as active context
          res(fn('foo'))
        })
      )
    })

    describe('when the options object is a function returning a falsy value', () => {
      it('should trace', () => {
        const tracer = getTracer()
        const fn = tracer.wrap(
          'falsy' as any,
          (_args: any) => false as any,
          () => {}
        )

        jest.spyOn(tracer, 'trace')

        fn()

        expect(tracer.trace).toHaveBeenCalledWith(
          'falsy',
          false,
          expect.any(Function)
        )
      })
    })
  })
})
