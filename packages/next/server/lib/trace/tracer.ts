import { warn } from '../../../build/output/log'

import type { ContextAPI, Span, SpanOptions } from '@opentelemetry/api'
import { TraceConfig } from './trace-config'

const isPromise = <T>(p: any): p is Promise<T> => {
  return p !== null && typeof p === 'object' && typeof p.then === 'function'
}

const closeSpanWithError = (span: Span, error?: Error) => {
  const {
    SpanStatusCode,
  }: typeof import('@opentelemetry/api') = require('next/dist/compiled/@opentelemetry/api')

  span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message })
  span.end()
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
    name: string,
    fn: (span?: Span, done?: (error?: Error) => any) => Promise<T>
  ): Promise<T>
  trace<T>(
    name: string,
    fn: (span?: Span, done?: (error?: Error) => any) => T
  ): T
  trace<T>(
    name: string,
    options: SpanOptions & { parentSpan?: Span },
    fn: (span?: Span, done?: (error?: Error) => any) => Promise<T>
  ): Promise<T>
  trace<T>(
    name: string,
    options: SpanOptions & { parentSpan?: Span },
    fn: (span?: Span, done?: (error?: Error) => any) => T
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
  wrap<T = (...args: Array<any>) => any>(name: string, fn: T): T
  wrap<T = (...args: Array<any>) => any>(
    name: string,
    options: unknown,
    fn: T
  ): T
  wrap<T = (...args: Array<any>) => any>(
    name: string,
    options: (...args: any[]) => unknown,
    fn: T
  ): T

  startSpan(name: string, options?: unknown): Span
}

class NextTracer implements Tracer {
  private readonly tracerInstance: import('@opentelemetry/api').Tracer
  private readonly traceApi: typeof import('@opentelemetry/api').trace
  /**
   * Singleton object which represents the entry point to the OpenTelemetry Context API
   */
  private readonly context: typeof import('@opentelemetry/api').context

  constructor(tracerName: string, _traceConfig: TraceConfig) {
    this.traceApi = require('next/dist/compiled/@opentelemetry/api').trace
    this.tracerInstance = this.traceApi.getTracer(tracerName)
    this.context = require('next/dist/compiled/@opentelemetry/api').context
  }

  public getContext(): ContextAPI {
    return this.context
  }

  public trace<T>(
    name: string,
    fn: (span?: Span, done?: (error?: Error) => any) => Promise<T>
  ): Promise<T>
  public trace<T>(
    name: string,
    fn: (span?: Span, done?: (error?: Error) => any) => T
  ): T
  public trace<T>(
    name: string,
    options: SpanOptions & { parentSpan?: Span },
    fn: (span?: Span, done?: (error?: Error) => any) => Promise<T>
  ): Promise<T>
  public trace<T>(
    name: string,
    options: SpanOptions & { parentSpan?: Span },
    fn: (span?: Span, done?: (error?: Error) => any) => T
  ): T
  public trace<T>(...args: Array<any>) {
    const [name, fnOrOptions, fnOrEmpty] = args

    // coerce options form overload
    const {
      fn,
      options,
    }: {
      fn: (span?: Span, done?: (error?: Error) => any) => T | Promise<T>
      options: SpanOptions & { parentSpan?: Span }
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

    const spanContext = this.getSpanContext(options?.parentSpan)

    const runWithContext = (actualFn: (span: Span) => T | Promise<T>) =>
      spanContext
        ? this.tracerInstance.startActiveSpan(
            name,
            options,
            spanContext,
            actualFn
          )
        : this.tracerInstance.startActiveSpan(name, options, actualFn)

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

  public wrap<T = (...args: Array<any>) => any>(name: string, fn: T): T
  public wrap<T = (...args: Array<any>) => any>(
    name: string,
    options: unknown,
    fn: T
  ): T
  public wrap<T = (...args: Array<any>) => any>(
    name: string,
    options: (...args: any[]) => unknown,
    fn: T
  ): T
  public wrap(..._args: Array<any>) {
    throw new Error('not implemented')
  }

  /**
   * Starts and returns a new Span representing a logical unit of work.
   */
  public startSpan(
    name: string,
    options?: SpanOptions,
    parentSpan?: Span
  ): Span {
    const spanContext = this.getSpanContext(parentSpan)
    return this.tracerInstance.startSpan(name, options, spanContext)
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
  const tracerMap: Record<string, Tracer> = {}
  let traceConfig: TraceConfig

  return {
    /**
     * Assign configuration options for the tracers from trace initialization subscriber.
     * Any new tracers will inherit this configuration options.
     */
    configureTracer: (options: TraceConfig) => {
      if (!traceConfig) {
        traceConfig = options
      } else {
        warn(
          `Cannot configure tracers multiple times, new configuration will be ignored`
        )
      }
    },
    getTracer: (name?: string): Tracer => {
      const tracerName =
        name ?? traceConfig?.defaultTracerName ?? traceConfig.serviceName
      if (tracerMap[tracerName]) {
        return tracerMap[tracerName]
      }

      return (tracerMap[tracerName] = new NextTracer(tracerName, traceConfig))
    },
  }
})()

export { Tracer, configureTracer, getTracer }
