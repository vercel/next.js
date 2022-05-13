import { warn } from '../../../build/output/log'

import type { Span, SpanOptions } from '@opentelemetry/api'
import { TraceConfig } from './trace-config'

interface Tracer {
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
    fn: (span?: Span, fnCb?: (error?: Error) => any) => T
  ): T
  trace<T>(
    name: string,
    options: unknown,
    fn: (span?: Span, done?: (error?: Error) => string) => T
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

  constructor(tracerName: string, _traceConfig: TraceConfig) {
    this.traceApi = require('next/dist/compiled/@opentelemetry/api').trace
    this.tracerInstance = this.traceApi.getTracer(tracerName)
  }

  public trace<T>(
    name: string,
    fn: (span?: Span, fnCb?: (error?: Error) => any) => T
  ): T
  public trace<T>(
    name: string,
    options: unknown,
    fn: (span?: Span, done?: (error?: Error) => string) => T
  ): T
  public trace(..._args: Array<any>) {
    throw new Error('not implemented')
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
    const {
      context,
    }: typeof import('@opentelemetry/api') = require('next/dist/compiled/@opentelemetry/api')
    const spanContext = parentSpan
      ? this.traceApi.setSpan(context.active(), parentSpan)
      : undefined

    return this.tracerInstance.startSpan(name, options, spanContext)
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
    getTracer: (name?: string) => {
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
