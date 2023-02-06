import { warn } from '../../../build/output/log'

import type { ContextAPI, Span, SpanOptions } from '@opentelemetry/api'
import { TraceConfig } from './trace-config'
import type { BasicTracerProvider } from '@opentelemetry/sdk-trace-base'
import type { SpanNames } from './constants'

const {
  SpanStatusCode,
}: typeof import('@opentelemetry/api') = require('next/dist/compiled/@opentelemetry/api')
const {
  SemanticAttributes,
}: typeof import('@opentelemetry/semantic-conventions') = require('next/dist/compiled/@opentelemetry/semantic-conventions')

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

interface Tracer {
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

  /**
   * Configure tracer with specified options. Any new tracers will inherit this configuration options.
   * This'll be allowed once only, returns false if there's subsequent attempt without changing existing values.
   *
   * Tracer can call any traces without configuration, tries to use default value as possible.
   * In result, most cases trace prior to initializing collector will be silently ignored. This allows
   * to ensure eager calls to trace / wrap does not cause accidental, unexpected errors.
   */
  setTraceConfig(
    options: TraceConfig & { provider: BasicTracerProvider }
  ): boolean
}

const NOOP_TRACER = 'noop_tracer'

class NextTracer implements Tracer {
  private readonly traceApi: typeof import('@opentelemetry/api').trace
  /**
   * Singleton object which represents the entry point to the OpenTelemetry Context API
   */
  private readonly context: typeof import('@opentelemetry/api').context

  private traceConfig:
    | (TraceConfig & { provider: BasicTracerProvider })
    | undefined

  constructor() {
    this.traceApi = require('next/dist/compiled/@opentelemetry/api').trace
    this.context = require('next/dist/compiled/@opentelemetry/api').context
  }

  /**
   * Returns an instance to the trace with configured name.
   * Since wrap / trace can be defined in any place prior to actual trace subscriber initialization,
   * This should be lazily evaluated.
   */
  private getTracerInstance(
    overriddenName?: string
  ): import('@opentelemetry/api').Tracer {
    const tracerName =
      overriddenName ??
      this.traceConfig?.defaultTracerName ??
      this.traceConfig?.serviceName ??
      NOOP_TRACER

    return this.traceApi.getTracer(tracerName)
  }

  public setTraceConfig(
    options: TraceConfig & { provider: BasicTracerProvider }
  ): boolean {
    if (!!this.traceConfig) {
      warn(
        `Cannot configure tracers multiple times, new configuration will be ignored`
      )
      return false
    }

    this.traceConfig = options
    return true
  }

  public getContext(): ContextAPI {
    return this.context
  }

  public getActiveScopeSpan(): Span | undefined {
    return this.traceApi.getSpan(this.context?.active())
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

    // Trying to get active scoped span to assign parent. If option specifies parent span manually, will try to use it.
    const spanContext = this.getSpanContext(
      options?.parentSpan ?? this.getActiveScopeSpan()
    )

    const runWithContext = (actualFn: (span: Span) => T | Promise<T>) =>
      spanContext
        ? this.getTracerInstance(options?.tracerName).startActiveSpan(
            name,
            options,
            spanContext,
            actualFn
          )
        : this.getTracerInstance(options?.tracerName).startActiveSpan(
            name,
            options,
            actualFn
          )

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

    return function (this: any) {
      // pass through wrapped fn if provider is not set.
      // in case of `trace()`, we still passes noop span to the callback.
      // Note: this is a workaround to check contextmanager, as there isn't
      // clean public interface to determine if contextmanager is initialized or noop.
      if (!tracer.traceConfig?.provider) {
        return fn.apply(this, arguments)
      }

      let optionsObj = options
      if (typeof optionsObj === 'function' && typeof fn === 'function') {
        optionsObj = optionsObj.apply(this, arguments)
      }

      const lastArgId = arguments.length - 1
      const cb = arguments[lastArgId]

      if (typeof cb === 'function') {
        const scopeBoundCb = tracer
          .getContext()
          .bind(tracer.context.active(), cb)
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
    const {
      context,
    }: typeof import('@opentelemetry/api') = require('next/dist/compiled/@opentelemetry/api')

    const spanContext = parentSpan
      ? this.traceApi.setSpan(context.active(), parentSpan)
      : undefined

    return spanContext
  }
}

const { configureTracer, getTracer } = (() => {
  const tracer = new NextTracer()

  return {
    /**
     * Assign configuration options for the tracers from trace initialization subscriber.
     * Any new tracers will inherit this configuration options.
     */
    configureTracer: (
      options: TraceConfig & { provider: BasicTracerProvider }
    ) => tracer.setTraceConfig(options),
    getTracer: () => tracer,
  }
})()

export {
  Tracer,
  configureTracer,
  getTracer,
  Span,
  SpanOptions,
  ContextAPI,
  SpanStatusCode,
  TracerSpanOptions,
  SemanticAttributes,
}
