import { NextVanillaSpanAllowlist, SpanNames } from './constants'

import type { ContextAPI, Span, SpanOptions, Tracer } from '@opentelemetry/api'

let api: typeof import('@opentelemetry/api')

// we want to allow users to use their own version of @opentelemetry/api if they
// want to, so we try to require it first, and if it fails we fall back to the
// version that is bundled with Next.js
// this is because @opentelemetry/api has to be synced with the version of
// @opentelemetry/tracing that is used, and we don't want to force users to use
// the version that is bundled with Next.js.
// the API is ~stable, so this should be fine
try {
  api = require('@opentelemetry/api')
} catch (err) {
  api = require('next/dist/compiled/@opentelemetry/api')
}

const { context, trace, SpanStatusCode, SpanKind } = api

const isPromise = <T>(p: any): p is Promise<T> => {
  return p !== null && typeof p === 'object' && typeof p.then === 'function'
}

const closeSpanWithError = (span: Span, error?: Error) => {
  span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message })
  span.end()
}

type TracerSpanOptions = SpanOptions & {
  parentSpan?: Span
  tracerName?: string
}

interface NextTracer {
  getContext(): ContextAPI

  /**
   * Instruments a function by automatically creating a span activated on its
   * scope.
   *
   * The span will automatically be finished when one of these conditions is
   * met:
   *
   * * The function returns a promise, in which case the span will finish when
   * the promise is resolved or rejected.
   * * The function takes a callback as its second parameter, in which case the
   * span will finish when that callback is called.
   * * The function doesn't accept a callback and doesn't return a promise, in
   * which case the span will finish at the end of the function execution.
   *
   */
  trace<T>(
    name: SpanNames,
    fn: (span: Span, done?: (error?: Error) => any) => Promise<T>
  ): Promise<T>
  trace<T>(
    name: SpanNames,
    fn: (span: Span, done?: (error?: Error) => any) => T
  ): T
  trace<T>(
    name: SpanNames,
    options: TracerSpanOptions,
    fn: (span: Span, done?: (error?: Error) => any) => Promise<T>
  ): Promise<T>
  trace<T>(
    name: SpanNames,
    options: TracerSpanOptions,
    fn: (span: Span, done?: (error?: Error) => any) => T
  ): T

  /**
   * Wrap a function to automatically create a span activated on its
   * scope when it's called.
   *
   * The span will automatically be finished when one of these conditions is
   * met:
   *
   * * The function returns a promise, in which case the span will finish when
   * the promise is resolved or rejected.
   * * The function takes a callback as its last parameter, in which case the
   * span will finish when that callback is called.
   * * The function doesn't accept a callback and doesn't return a promise, in
   * which case the span will finish at the end of the function execution.
   */
  wrap<T = (...args: Array<any>) => any>(name: SpanNames, fn: T): T
  wrap<T = (...args: Array<any>) => any>(
    name: SpanNames,
    options: TracerSpanOptions,
    fn: T
  ): T
  wrap<T = (...args: Array<any>) => any>(
    name: SpanNames,
    options: (...args: any[]) => TracerSpanOptions,
    fn: T
  ): T

  /**
   * Starts and returns a new Span representing a logical unit of work.
   *
   * This method do NOT modify the current Context by default. In result, any inner span will not
   * automatically set its parent context to the span created by this method unless manually activate
   * context via `tracer.getContext().with`. `trace`, or `wrap` is generally recommended as it gracefully
   * handles context activation. (ref: https://github.com/open-telemetry/opentelemetry-js/issues/1923)
   */
  startSpan(name: SpanNames): Span
  startSpan(name: SpanNames, options: TracerSpanOptions): Span

  /**
   * Returns currently activated span if current context is in the scope of the span.
   * Returns undefined otherwise.
   */
  getActiveScopeSpan(): Span | undefined
}

class NextTracerImpl implements NextTracer {
  /**
   * Returns an instance to the trace with configured name.
   * Since wrap / trace can be defined in any place prior to actual trace subscriber initialization,
   * This should be lazily evaluated.
   */
  private getTracerInstance(): Tracer {
    return trace.getTracer('next.js', '0.0.1')
  }

  public getContext(): ContextAPI {
    return context
  }

  public getActiveScopeSpan(): Span | undefined {
    return trace.getSpan(context?.active())
  }

  // Trace, wrap implementation is inspired by datadog trace implementation
  // (https://datadoghq.dev/dd-trace-js/interfaces/tracer.html#trace).
  public trace<T>(
    name: SpanNames,
    fn: (span: Span, done?: (error?: Error) => any) => Promise<T>
  ): Promise<T>
  public trace<T>(
    name: SpanNames,
    fn: (span: Span, done?: (error?: Error) => any) => T
  ): T
  public trace<T>(
    name: SpanNames,
    options: TracerSpanOptions,
    fn: (span: Span, done?: (error?: Error) => any) => Promise<T>
  ): Promise<T>
  public trace<T>(
    name: SpanNames,
    options: TracerSpanOptions,
    fn: (span: Span, done?: (error?: Error) => any) => T
  ): T
  public trace<T>(...args: Array<any>) {
    const [name, fnOrOptions, fnOrEmpty] = args

    // coerce options form overload
    const {
      fn,
      options,
    }: {
      fn: (span?: Span, done?: (error?: Error) => any) => T | Promise<T>
      options: TracerSpanOptions
    } =
      typeof fnOrOptions === 'function'
        ? {
            fn: fnOrOptions,
            options: {},
          }
        : {
            fn: fnOrEmpty,
            options: fnOrOptions,
          }

    if (
      !NextVanillaSpanAllowlist.includes(name) &&
      process.env.NEXT_OTEL_VERBOSE !== '1'
    ) {
      return fn()
    }

    // Trying to get active scoped span to assign parent. If option specifies parent span manually, will try to use it.
    const spanContext = this.getSpanContext(
      options?.parentSpan ?? this.getActiveScopeSpan()
    )

    const runWithContext = (actualFn: (span: Span) => T | Promise<T>) =>
      spanContext
        ? this.getTracerInstance().startActiveSpan(
            name,
            options,
            spanContext,
            actualFn
          )
        : this.getTracerInstance().startActiveSpan(name, options, actualFn)

    return runWithContext((span: Span) => {
      try {
        if (fn.length > 1) {
          return fn(span, (err?: Error) => closeSpanWithError(span, err))
        }

        const result = fn(span)

        if (isPromise(result)) {
          result.then(
            () => span.end(),
            (err) => closeSpanWithError(span, err)
          )
        } else {
          span.end()
        }

        return result
      } catch (err: any) {
        closeSpanWithError(span, err)
        throw err
      }
    })
  }

  public wrap<T = (...args: Array<any>) => any>(name: SpanNames, fn: T): T
  public wrap<T = (...args: Array<any>) => any>(
    name: SpanNames,
    options: TracerSpanOptions,
    fn: T
  ): T
  public wrap<T = (...args: Array<any>) => any>(
    name: SpanNames,
    options: (...args: any[]) => TracerSpanOptions,
    fn: T
  ): T
  public wrap(...args: Array<any>) {
    const tracer = this
    const [name, options, fn] =
      args.length === 3 ? args : [args[0], {}, args[1]]

    if (
      !NextVanillaSpanAllowlist.includes(name) &&
      process.env.NEXT_OTEL_VERBOSE !== '1'
    ) {
      return fn
    }

    return function (this: any) {
      let optionsObj = options
      if (typeof optionsObj === 'function' && typeof fn === 'function') {
        optionsObj = optionsObj.apply(this, arguments)
      }

      const lastArgId = arguments.length - 1
      const cb = arguments[lastArgId]

      if (typeof cb === 'function') {
        const scopeBoundCb = tracer.getContext().bind(context.active(), cb)
        return tracer.trace(name, optionsObj, (_span, done) => {
          arguments[lastArgId] = function (err: any) {
            done?.(err)
            return scopeBoundCb.apply(this, arguments)
          }

          return fn.apply(this, arguments)
        })
      } else {
        return tracer.trace(name, optionsObj, () => fn.apply(this, arguments))
      }
    }
  }

  public startSpan(name: SpanNames): Span
  public startSpan(name: SpanNames, options: TracerSpanOptions): Span
  public startSpan(...args: Array<any>): Span {
    const [name, options]: [string, TracerSpanOptions | undefined] = args as any

    const spanContext = this.getSpanContext(
      options?.parentSpan ?? this.getActiveScopeSpan()
    )
    return this.getTracerInstance().startSpan(name, options, spanContext)
  }

  private getSpanContext(parentSpan?: Span) {
    const spanContext = parentSpan
      ? trace.setSpan(context.active(), parentSpan)
      : undefined

    return spanContext
  }
}

const getTracer = (() => {
  const tracer = new NextTracerImpl()

  return () => tracer
})()

export {
  NextTracer,
  getTracer,
  Span,
  SpanOptions,
  ContextAPI,
  SpanStatusCode,
  TracerSpanOptions,
  SpanKind,
}
