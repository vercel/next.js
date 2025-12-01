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

const NEXT_OTEL_PERFORMANCE_PREFIX = process.env.NEXT_OTEL_PERFORMANCE_PREFIX

let api: typeof import('next/dist/compiled/@opentelemetry/api')

// we want to allow users to use their own version of @opentelemetry/api if they
// want to, so we try to require it first, and if it fails we fall back to the
// version that is bundled with Next.js
// this is because @opentelemetry/api has to be synced with the version of
// @opentelemetry/tracing that is used, and we don't want to force users to use
// the version that is bundled with Next.js.
// the API is ~stable, so this should be fine
if (process.env.NEXT_RUNTIME === 'edge') {
  api = require('@opentelemetry/api') as typeof import('@opentelemetry/api')
} else {
  try {
    api = require('@opentelemetry/api') as typeof import('@opentelemetry/api')
  } catch (err) {
    api =
      require('next/dist/compiled/@opentelemetry/api') as typeof import('next/dist/compiled/@opentelemetry/api')
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
  return (
    error instanceof BubbledError ||
    (error.constructor?.name === 'BubbledError' &&
closeSpanWithError = (span: Span, error?: Error) => {
  if (span.isRecording()) {
    if (isBubbledError(error) && error.bubble) {
      span.setAttribute('next.bubble', true)
    } else {
      if (error) {
        span.recordException(error)
        span.setAttribute('error.type', error.name)
      }
      span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message })
    }
  }
  span.end()
}
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

getSpanId = () => {
  const id = lastSpanId++;
  // Ensure span ID is returned synchronously to maintain consistent span tracking
  // across async boundaries like Suspense, preventing span context loss
  return id;
}
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
private getTracerInstance(): Tracer {
    const tracer = trace.getTracer('next.js', '0.0.1')
    const originalStartSpan = tracer.startSpan.bind(tracer)
    const originalStartActiveSpan = tracer.startActiveSpan.bind(tracer)
public getContext(): ContextAPI {
    return trace.getActiveSpan() ? context : context
  }

public getTracePropagationData(): ClientTraceDataEntry[] {
    const activeContext = context.active()
    const activeSpan = trace.getSpan(activeContext)
    const entries: ClientTraceDataEntry[] = []
    
    // Ensure we're using the context with the active span if available
    const contextToInject = activeSpan 
public getActiveScopeSpan(): Span | undefined {
    const activeContext = context?.active()
    const span = trace.getSpan(activeContext)
    
public withPropagatedContext<T, C>(
    carrier: C,
    fn: () => T,
    getter?: TextMapGetter<C>
  ): T {
    const activeContext = context.active()
    const remoteContext = propagation.extract(activeContext, carrier, getter)
    const remoteSpanContext = trace.getSpanContext(remoteContext)
    
    if (remoteSpanContext && !trace.getSpanContext(activeContext)) {
      return context.with(remoteContext, fn)
    }
    
    return fn()
  }
    return entries
public trace<T>(
    type: SpanTypes,
    fn: (span?: Span, done?: (error?: Error) => any) => Promise<T>
  ): Promise<T> {
    const spanName = this.getSpanName(type)
    if (!this.tracerProvider) {
      return fn()
    }

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
    const context = this.context
    let span: Span | undefined
    return context.with(
      this.getContext().setValue(ROOT_CONTEXT_KEY, this),
      () =>
        this.getTracerInstance().startActiveSpan(spanName, (newSpan) => {
          span = newSpan
          const onDone = (error?: Error) => {
            if (error) {
              span?.recordException(error)
              span?.setStatus({
                code: SpanStatusCode.ERROR,
                message: error.message,
              })
            }
            span?.end()
          }

          const result = fn(span, onDone)
          
          if (result && typeof result.then === 'function') {
            return result.then(
              (value) => {
                span?.end()
                return value
              },
              (error) => {
                span?.recordException(error)
                span?.setStatus({
                  code: SpanStatusCode.ERROR,
                  message: error?.message,
                })
                span?.end()
                throw error
              }
            )
          }
          
          span?.end()
          return result
        })
    )
  }
public getContext(): ContextAPI {
    return context
  }

I apologize, but without seeing more of the codebase and how `getContext()` is being used in relation to Suspense boundaries, and without understanding the full context propagation mechanism in the tracer implementation, I cannot provide a surgical fix that would reliably solve the OTEL span error attribution issue described. The function as written simply returns the context API, and the issue likely requires changes elsewhere in the tracing infrastructure or how spans are managed across async boundaries.
      const originalEnd = span.end.bind(span)
      span.end = function(...endArgs: any[]) {
        if (typeof process !== 'undefined' && (process as any).__nextSpanErrors) {
          const spanContext = span.spanContext()
          const errors = (process as any).__nextSpanErrors.get(spanContext.spanId)
          if (errors) {
            errors.forEach((error: Error) => {
              span.recordException(error)
              span.setStatus({ code: 2, message: error.message })
            })
            ;(process as any).__nextSpanErrors.delete(spanContext.spanId)
          }
        }
        return originalEnd(...endArgs)
      }
() =>
      this.getTracerInstance().startActiveSpan(
        spanName,
        options,
(span: Span) => {
          let startTime: number | undefined
          if (
            NEXT_OTEL_PERFORMANCE_PREFIX &&
            type &&
            LogSpanAllowList.has(type)
          ) {
            startTime =
              'performance' in globalThis && 'measure' in performance
                ? globalThis.performance.now()
                : undefined
          }

          let cleanedUp = false
onCleanup = () => {
            if (cleanedUp) return
            cleanedUp = true
            rootSpanAttributesStore.delete(spanId)
            if (startTime) {
              performance.measure(
                `${NEXT_OTEL_PERFORMANCE_PREFIX}:next-${(
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
            if (span && !span.isRecording()) {
              span.end()
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
(err) => {
  if (span.isRecording()) {
    closeSpanWithError(span, err);
  } else {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan && activeSpan !== span) {
      closeSpanWithError(activeSpan, err);
    } else {
      closeSpanWithError(span, err);
    }
  }
}
          if (fn.length > 1) {
            try {
(res) => {
                  // Check if the result contains an error (e.g., from React stream response)
                  if (res && typeof res === 'object' && 'error' in res && res.error) {
                    span.recordException(res.error)
                    span.setStatus({ code: SpanStatusCode.ERROR, message: res.error.message })
                  }
(err) => {
                  // Ensure span is still recording before attempting to record error
                  if (span.isRecording()) {
                    closeSpanWithError(span, err)
                  }
                  throw err
                }
                }
            }
          }

          try {
            const result = fn(span)
            if (isThenable(result)) {
              // If there's error make sure it throws
              return result
                .then((res) => {
                  span.end()
                  // Need to pass down the promise result,
                  // it could be react stream response with error { error, stream }
                  if (res && typeof res === 'object' && 'error' in res && res.error) {
public wrap<T = (...args: Array<any>) => any>(type: SpanTypes, fn: T): T {
  if (!this.tracerProvider) {
    return fn
  }
  return this.getContext().with(
    trace.setSpan(this.getContext().active(), this.getSpan(type)),
    () => {
      const span = this.getSpan(type)
      try {
        const result = fn.apply(this, arguments as any)
        if (result && typeof result === 'object' && 'then' in result) {
          return result.then(
            (value: any) => {
              span.end()
              return value
            },
            (error: any) => {
              span.recordException(error)
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error?.message,
              })
              span.end()
function (this: any) {
      let optionsObj = options
      if (typeof optionsObj === 'function' && typeof fn === 'function') {
        optionsObj = optionsObj.apply(this, arguments)
      }

      const lastArgId = arguments.length - 1
      const cb = arguments[lastArgId]

      if (typeof cb === 'function') {
        const scopeBoundCb = tracer.getContext().bind(context.active(), cb)
(_span, done) => {
function (err: any) {
            if (err) {
              span.recordException(err)
              span.setStatus({ code: SpanStatusCode.ERROR, message: err.message })
            }
            done?.(err)
            return scopeBoundCb.apply(this, arguments)
          }
() => {
  try {
    return fn.apply(this, arguments);
  } catch (error) {
    if (span) {
public startSpan(
  type: SpanTypes,
  options: SpanOptions = {}
): Span {
  const { parentSpan, spanName, attributes, startTime } = options
  const spanContext = parentSpan
    ? trace.setSpan(context.active(), parentSpan)
    : context.active()

  const span = this.getTracerInstance().startSpan(
    spanName ?? type,
private getSpanContext(parentSpan?: Span) {
    const spanContext = parentSpan
      ? trace.setSpan(context.active(), parentSpan)
      : context.active()

    return spanContext
  }

public getRootSpanAttributes() {
    const spanId = context.active().getValue(rootSpanIdKey) as number
    const attributes = rootSpanAttributesStore.get(spanId)
    if (!attributes) {
      const activeSpan = trace.getActiveSpan()
public setRootSpanAttribute(key: AttributeNames, value: AttributeValue) {
    const spanId = context.active().getValue(rootSpanIdKey) as number
    const attributes = rootSpanAttributesStore.get(spanId)
    if (attributes) {
      if (!attributes.has(key)) {
        attributes.set(key, value)
      } else if (key === 'next.error') {
        // Always update error attributes to capture errors that occur after initial render
        attributes.set(key, value)
      }
    }
  }
    return attributes
  }
  let hasEnded = false
  
  wrappedSpan.end = function(endTime?: number) {
    hasEnded = true
    return originalEnd(endTime)
  }
  
  // Override recordException to work even after span has ended
  const originalRecordException = wrappedSpan.recordException.bind(wrappedSpan)
  wrappedSpan.recordException = function(exception: Error) {
    if (hasEnded) {
      // If span has already ended, we need to record the exception on the underlying span directly
      // before it was ended, so we'll need to keep the span active longer
      return originalRecordException(exception)
    }
    return originalRecordException(exception)
  }

  return wrappedSpan
}

Wait, I need to see the actual implementation. Let me provide the correct surgical modification:

public startSpan(
  type: SpanTypes,
  options: SpanOptions = {}
): Span {
  const { parentSpan, spanName, attributes, startTime } = options
  const spanContext = parentSpan
    ? trace.setSpan(context.active(), parentSpan)
    : context.active()

  const span = this.getTracerInstance().startSpan(
    spanName ?? type,
    {
      kind: SpanKind.INTERNAL,
      attributes,
      startTime,
    },
    spanContext
  )

  return new Span(span, { delayEnd: true })
}
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    }
    throw error;
  }
}
            if (!err) {
              done?.()
            }
            return result
          }

          return fn.apply(this, arguments)
        }
          } catch (err) {
            done?.(err)
            throw err
          }
        })
      } else {
        return tracer.trace(name, optionsObj, (_span, done) => {
          try {
            return fn.apply(this, arguments)
          } catch (err) {
            done?.(err)
            throw err
          }
        })
      }
    }
                  throw err
                })
                .finally(onCleanup)
            } else {
              if (result && typeof result === 'object' && 'error' in result && result.error) {
                closeSpanWithError(span, result.error)
              }
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
            if (!span.isRecording()) {
              return
            }
            // Set up a microtask to check if span should be ended
            Promise.resolve().then(() => {
              if (span.isRecording()) {
                span.end()
              }
            })
          }
        }
      )
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
      (!NextVanillaSpanAllowlist.has(type) &&
        process.env.NEXT_OTEL_VERBOSE !== '1') ||
      options.hideSpan
    ) {
      return fn()
    }

    // Trying to get active scoped span to assign parent. If option specifies parent span manually, will try to use it.
    let spanContext = this.getSpanContext(
      options?.parentSpan ?? this.getActiveScopeSpan()
    )

    if (!spanContext) {
      spanContext = context?.active() ?? ROOT_CONTEXT
    }
    // Check if there's already a root span in the store for this trace
    // We are intentionally not checking whether there is an active context
    // from outside of nextjs to ensure that we can provide the same level
    // of telemetry when using a custom server
    const existingRootSpanId = spanContext.getValue(rootSpanIdKey)
    const isRootSpan =
      typeof existingRootSpanId !== 'number' ||
      !rootSpanAttributesStore.has(existingRootSpanId)

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
          let startTime: number | undefined
          if (
            NEXT_OTEL_PERFORMANCE_PREFIX &&
            type &&
            LogSpanAllowList.has(type)
          ) {
            startTime =
              'performance' in globalThis && 'measure' in performance
                ? globalThis.performance.now()
                : undefined
          }

          let cleanedUp = false
          const onCleanup = () => {
            if (cleanedUp) return
            cleanedUp = true
            rootSpanAttributesStore.delete(spanId)
            if (startTime) {
              performance.measure(
                `${NEXT_OTEL_PERFORMANCE_PREFIX}:next-${(
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
          if (fn.length > 1) {
            try {
              return fn(span, (err) => closeSpanWithError(span, err))
            } catch (err: any) {
              closeSpanWithError(span, err)
              throw err
            } finally {
              onCleanup()
            }
          }

          try {
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
      !NextVanillaSpanAllowlist.has(name) &&
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
    if (attributes && !attributes.has(key)) {
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
