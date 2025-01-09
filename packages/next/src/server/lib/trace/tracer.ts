import type { FetchEventResult } from '../../web/types'
import type { TextMapSetter } from '@opentelemetry/api'
import type { SpanTypes } from './constants'
import { LogSpanAllowList, NextVanillaSpanAllowlist } from './constants'

import type {
  ContextAPI,
  Span,
  SpanOptions,
  Tracer,
  AttributeValue,
  TextMapGetter,
} from 'next/dist/compiled/@opentelemetry/api'
import { isThenable } from '../../../shared/lib/is-thenable'

let api: typeof import('next/dist/compiled/@opentelemetry/api')

// we want to allow users to use their own version of @opentelemetry/api if they
// want to, so we try to require it first, and if it fails we fall back to the
// version that is bundled with Next.js
// this is because @opentelemetry/api has to be synced with the version of
// @opentelemetry/tracing that is used, and we don't want to force users to use
// the version that is bundled with Next.js.
// the API is ~stable, so this should be fine
if (process.env.NEXT_RUNTIME === 'edge') {
  api = require('@opentelemetry/api')
} else {
  try {
    api = require('@opentelemetry/api')
  } catch (err) {
    api = require('next/dist/compiled/@opentelemetry/api')
  }
}

const { context, propagation, trace, SpanStatusCode, SpanKind, ROOT_CONTEXT } =
  api

export class BubbledError extends Error {
  constructor(
    public readonly bubble?: boolean,
    public readonly result?: FetchEventResult
  ) {
    super()
  }
}

export function isBubbledError(error: unknown): error is BubbledError {
  if (typeof error !== 'object' || error === null) return false
  return error instanceof BubbledError
}

const closeSpanWithError = (span: Span, error?: Error) => {
  if (isBubbledError(error) && error.bubble) {
    span.setAttribute('next.bubble', true)
  } else {
    if (error) {
      span.recordException(error)
    }
    span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message })
  }
  span.end()
}

type TracerSpanOptions = Omit<SpanOptions, 'attributes'> & {
  parentSpan?: Span
  spanName?: string
  attributes?: Partial<Record<AttributeNames, AttributeValue | undefined>>
  hideSpan?: boolean
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
    type: SpanTypes,
    fn: (span?: Span, done?: (error?: Error) => any) => Promise<T>
  ): Promise<T>
  trace<T>(
    type: SpanTypes,
    fn: (span?: Span, done?: (error?: Error) => any) => T
  ): T
  trace<T>(
    type: SpanTypes,
    options: TracerSpanOptions,
    fn: (span?: Span, done?: (error?: Error) => any) => Promise<T>
  ): Promise<T>
  trace<T>(
    type: SpanTypes,
    options: TracerSpanOptions,
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
  wrap<T = (...args: Array<any>) => any>(type: SpanTypes, fn: T): T
  wrap<T = (...args: Array<any>) => any>(
    type: SpanTypes,
    options: TracerSpanOptions,
    fn: T
  ): T
  wrap<T = (...args: Array<any>) => any>(
    type: SpanTypes,
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
  startSpan(type: SpanTypes): Span
  startSpan(type: SpanTypes, options: TracerSpanOptions): Span

  /**
   * Returns currently activated span if current context is in the scope of the span.
   * Returns undefined otherwise.
   */
  getActiveScopeSpan(): Span | undefined

  /**
   * Returns trace propagation data for the currently active context. The format is equal to data provided
   * through the OpenTelemetry propagator API.
   */
  getTracePropagationData(): ClientTraceDataEntry[]
}

type NextAttributeNames =
  | 'next.route'
  | 'next.page'
  | 'next.rsc'
  | 'next.segment'
  | 'next.span_name'
  | 'next.span_type'
  | 'next.clientComponentLoadCount'
type OTELAttributeNames = `http.${string}` | `net.${string}`
type AttributeNames = NextAttributeNames | OTELAttributeNames

/** we use this map to propagate attributes from nested spans to the top span */
const rootSpanAttributesStore = new Map<
  number,
  Map<AttributeNames, AttributeValue | undefined>
>()
const rootSpanIdKey = api.createContextKey('next.rootSpanId')
let lastSpanId = 0
const getSpanId = () => lastSpanId++

export interface ClientTraceDataEntry {
  key: string
  value: string
}

const clientTraceDataSetter: TextMapSetter<ClientTraceDataEntry[]> = {
  set(carrier, key, value) {
    carrier.push({
      key,
      value,
    })
  },
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

  public getTracePropagationData(): ClientTraceDataEntry[] {
    const activeContext = context.active()
    const entries: ClientTraceDataEntry[] = []
    propagation.inject(activeContext, entries, clientTraceDataSetter)
    return entries
  }

  public getActiveScopeSpan(): Span | undefined {
    return trace.getSpan(context?.active())
  }

  public withPropagatedContext<T, C>(
    carrier: C,
    fn: () => T,
    getter?: TextMapGetter<C>
  ): T {
    const activeContext = context.active()
    if (trace.getSpanContext(activeContext)) {
      // Active span is already set, too late to propagate.
      return fn()
    }
    const remoteContext = propagation.extract(activeContext, carrier, getter)
    return context.with(remoteContext, fn)
  }

  // Trace, wrap implementation is inspired by datadog trace implementation
  // (https://datadoghq.dev/dd-trace-js/interfaces/tracer.html#trace).
  public trace<T>(
    type: SpanTypes,
    fn: (span?: Span, done?: (error?: Error) => any) => Promise<T>
  ): Promise<T>
  public trace<T>(
    type: SpanTypes,
    fn: (span?: Span, done?: (error?: Error) => any) => T
  ): T
  public trace<T>(
    type: SpanTypes,
    options: TracerSpanOptions,
    fn: (span?: Span, done?: (error?: Error) => any) => Promise<T>
  ): Promise<T>
  public trace<T>(
    type: SpanTypes,
    options: TracerSpanOptions,
    fn: (span?: Span, done?: (error?: Error) => any) => T
  ): T
  public trace<T>(...args: Array<any>) {
    const [type, fnOrOptions, fnOrEmpty] = args

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
            options: { ...fnOrOptions },
          }

    const spanName = options.spanName ?? type

    if (
      (!NextVanillaSpanAllowlist.includes(type) &&
        process.env.NEXT_OTEL_VERBOSE !== '1') ||
      options.hideSpan
    ) {
      return fn()
    }

    // Trying to get active scoped span to assign parent. If option specifies parent span manually, will try to use it.
    let spanContext = this.getSpanContext(
      options?.parentSpan ?? this.getActiveScopeSpan()
    )
    let isRootSpan = false

    if (!spanContext) {
      spanContext = context?.active() ?? ROOT_CONTEXT
      isRootSpan = true
    } else if (trace.getSpanContext(spanContext)?.isRemote) {
      isRootSpan = true
    }

    const spanId = getSpanId()

    options.attributes = {
      'next.span_name': spanName,
      'next.span_type': type,
      ...options.attributes,
    }

    return context.with(spanContext.setValue(rootSpanIdKey, spanId), () =>
      this.getTracerInstance().startActiveSpan(
        spanName,
        options,
        (span: Span) => {
          const startTime =
            'performance' in globalThis && 'measure' in performance
              ? globalThis.performance.now()
              : undefined

          const onCleanup = () => {
            rootSpanAttributesStore.delete(spanId)
            if (
              startTime &&
              process.env.NEXT_OTEL_PERFORMANCE_PREFIX &&
              LogSpanAllowList.includes(type || ('' as any))
            ) {
              performance.measure(
                `${process.env.NEXT_OTEL_PERFORMANCE_PREFIX}:next-${(
                  type.split('.').pop() || ''
                ).replace(
                  /[A-Z]/g,
                  (match: string) => '-' + match.toLowerCase()
                )}`,
                {
                  start: startTime,
                  end: performance.now(),
                }
              )
            }
          }

          if (isRootSpan) {
            rootSpanAttributesStore.set(
              spanId,
              new Map(
                Object.entries(options.attributes ?? {}) as [
                  AttributeNames,
                  AttributeValue | undefined,
                ][]
              )
            )
          }
          try {
            if (fn.length > 1) {
              return fn(span, (err) => closeSpanWithError(span, err))
            }

            const result = fn(span)
            if (isThenable(result)) {
              // If there's error make sure it throws
              return result
                .then((res) => {
                  span.end()
                  // Need to pass down the promise result,
                  // it could be react stream response with error { error, stream }
                  return res
                })
                .catch((err) => {
                  closeSpanWithError(span, err)
                  throw err
                })
                .finally(onCleanup)
            } else {
              span.end()
              onCleanup()
            }

            return result
          } catch (err: any) {
            closeSpanWithError(span, err)
            onCleanup()
            throw err
          }
        }
      )
    )
  }

  public wrap<T = (...args: Array<any>) => any>(type: SpanTypes, fn: T): T
  public wrap<T = (...args: Array<any>) => any>(
    type: SpanTypes,
    options: TracerSpanOptions,
    fn: T
  ): T
  public wrap<T = (...args: Array<any>) => any>(
    type: SpanTypes,
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

  public startSpan(type: SpanTypes): Span
  public startSpan(type: SpanTypes, options: TracerSpanOptions): Span
  public startSpan(...args: Array<any>): Span {
    const [type, options]: [string, TracerSpanOptions | undefined] = args as any

    const spanContext = this.getSpanContext(
      options?.parentSpan ?? this.getActiveScopeSpan()
    )
    return this.getTracerInstance().startSpan(type, options, spanContext)
  }

  private getSpanContext(parentSpan?: Span) {
    const spanContext = parentSpan
      ? trace.setSpan(context.active(), parentSpan)
      : undefined

    return spanContext
  }

  public getRootSpanAttributes() {
    const spanId = context.active().getValue(rootSpanIdKey) as number
    return rootSpanAttributesStore.get(spanId)
  }

  public setRootSpanAttribute(key: AttributeNames, value: AttributeValue) {
    const spanId = context.active().getValue(rootSpanIdKey) as number
    const attributes = rootSpanAttributesStore.get(spanId)
    if (attributes) {
      attributes.set(key, value)
    }
  }
}

const getTracer = (() => {
  const tracer = new NextTracerImpl()

  return () => tracer
})()

export { getTracer, SpanStatusCode, SpanKind }
export type { NextTracer, Span, SpanOptions, ContextAPI, TracerSpanOptions }
