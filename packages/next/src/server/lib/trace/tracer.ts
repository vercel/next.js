import type { FetchEventResult } from '../../web/types'
import type { TextMapSetter } from '@opentelemetry/api'
import type { SpanTypes } from './constants'
import type { LocalSpanRecorder } from './local-span-recorder'
import {
  LogSpanAllowList,
  NextVanillaSpanAllowlist,
  NextSpan,
} from './constants'
import {
  DEFERRED_REQUEST_SPAN_KEY,
  parseDeferredRequestSpan,
  removeTraceStateEntry,
  reserveRootSpanIds,
  startSpanWithIds,
  type DeferredRequestSpan,
} from './deferred-request-span'

import type {
  Attributes,
  Context,
  ContextAPI,
  Span,
  SpanContext,
  SpanOptions,
  TraceState,
  Tracer,
  AttributeValue,
  TextMapGetter,
} from 'next/dist/compiled/@opentelemetry/api'
import { isThenable } from '../../../shared/lib/is-thenable'

const NEXT_OTEL_PERFORMANCE_PREFIX = process.env.NEXT_OTEL_PERFORMANCE_PREFIX
const LOCAL_SPAN_RECORDER_KEY = Symbol.for('@next/local-span-recorder')

type GlobalWithLocalSpanRecorder = typeof globalThis & {
  [LOCAL_SPAN_RECORDER_KEY]?: LocalSpanRecorder
}

let api: typeof import('next/dist/compiled/@opentelemetry/api')

function getLocalSpanRecorder() {
  if (process.env.__NEXT_DEV_SERVER) {
    return (globalThis as GlobalWithLocalSpanRecorder)[LOCAL_SPAN_RECORDER_KEY]
  } else {
    return undefined
  }
}

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

const {
  context,
  propagation,
  trace,
  SpanStatusCode,
  SpanKind,
  ROOT_CONTEXT,
  defaultTextMapGetter,
} = api

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

/**
 * Records `error` on `span` the way a span traced with `NextTracer.trace` that
 * throws it does, without ending the span.
 */
export const recordSpanError = (span: Span, error?: Error) => {
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

const closeSpanWithError = (
  span: Span,
  error?: Error,
  endTime?: Parameters<Span['end']>[0]
) => {
  recordSpanError(span, error)
  span.end(endTime)
}

type TracerSpanOptions = Omit<SpanOptions, 'attributes'> & {
  endTime?: Parameters<Span['end']>[0]
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

  /**
   * Returns the W3C trace context (`traceparent` / `tracestate`) of the
   * currently active context, as produced by the configured propagator.
   * Returns `undefined` when OpenTelemetry is not enabled, no span context is
   * active, or the propagator doesn't produce a `traceparent`.
   */
  getTraceContextHeaders(): TraceContextHeaders | undefined

  /**
   * Whether OpenTelemetry is enabled: a tracer provider is registered, or a
   * recording span is active.
   */
  isOpenTelemetryEnabled(): boolean

  /**
   * Whether the currently active context has a valid span context: an active
   * span, or a remote parent extracted from incoming trace headers.
   */
  hasActiveSpanContext(): boolean

  /**
   * Executes a function with the given span set as the active span in the context.
   * This allows child spans created within the function to automatically parent to this span.
   */
  withSpan<T>(span: Span, fn: () => T): T
}

type NextAttributeNames =
  | 'next.route'
  | 'next.page'
  | 'next.rsc'
  | 'next.segment'
  | 'next.span_category'
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

export interface TraceContextHeaders {
  traceparent: string
  tracestate?: string
}

/**
 * A request span (`Next.request`) whose IDs are reserved, but that isn't
 * started yet (see `NextTracer.reserveRequestSpan`).
 */
export interface ReservedRequestSpan {
  traceId: string
  spanId: string
  /** Whether the span is sampled (only sampled spans are emitted). */
  sampled: boolean
  /** Runs `fn` with the reserved span as the active (non-recording) parent. */
  run<T>(fn: () => T): T
  /**
   * Emits the span, ending now. At most once, only when sampled; never
   * throws.
   */
  emit(result?: { failed: boolean; error?: unknown }): void
}

// How `withPropagatedContext` handles a deferred request span (see
// `deferred-request-span.ts`).
export interface PropagatedContextOptions {
  /**
   * `'emit'` (render entries): emit it once the function has settled, so it
   * covers the render. `'strip'` (middleware): only remove it.
   */
  deferredRequestSpan?: 'emit' | 'strip'
  /**
   * When the render's request span starts, if known and possibly earlier
   * than the deferred span's start (in milliseconds since the epoch).
   */
  requestStartTime?: number
}

// The deferred request spans (by `<trace ID>-<span ID>`) taken for emission
// in the current request handling, a context value, so nested render entries
// (which may extract a copy of the request headers) emit them only once.
const TAKEN_DEFERRED_SPANS_KEY = api.createContextKey(
  'next.takenDeferredRequestSpans'
)

function getTakenDeferredSpans(ctx: Context): ReadonlySet<string> {
  const taken = ctx.getValue(TAKEN_DEFERRED_SPANS_KEY)
  return taken instanceof Set ? taken : new Set()
}

const clientTraceDataSetter: TextMapSetter<ClientTraceDataEntry[]> = {
  set(carrier, key, value) {
    carrier.push({
      key,
      value,
    })
  },
}

// The attributes of a request span (`Next.request`), as `trace` sets them.
function getRequestSpanAttributes(
  name: string,
  attributes: Attributes
): Attributes {
  return {
    'next.span_category': 'nextjs',
    'next.span_name': name,
    'next.span_type': NextSpan.request,
    ...attributes,
  }
}

// `ctx` without a deferred request span in its active span context's
// `tracestate` (see `deferred-request-span.ts`), keeping its span identity.
// A recording span (e.g. a host span) stays the active span, so it's still
// updated through the active context: only its span context is replaced.
function withoutDeferredRequestSpan(ctx: Context): Context {
  try {
    const span = trace.getSpan(ctx)
    const spanContext = span?.spanContext()
    if (
      !span ||
      spanContext?.traceState?.get(DEFERRED_REQUEST_SPAN_KEY) === undefined
    ) {
      return ctx
    }
    const cleanContext = {
      ...spanContext,
      traceState: spanContext.traceState.unset(DEFERRED_REQUEST_SPAN_KEY),
    }
    if (!span.isRecording()) {
      return trace.setSpanContext(ctx, cleanContext)
    }
    return trace.setSpan(
      ctx,
      new Proxy(span, {
        get(target, key) {
          if (key === 'spanContext') {
            return () => cleanContext
          }
          const value = Reflect.get(target, key, target)
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
    )
  } catch {
    // Tracing must never affect the request.
    return ctx
  }
}

// Reads a header of a `withPropagatedContext` carrier.
function readHeader<C>(
  carrier: C,
  getter: TextMapGetter<C> | undefined,
  key: string
): string | undefined {
  const value = (getter ?? (defaultTextMapGetter as TextMapGetter<C>)).get(
    carrier,
    key
  )
  return Array.isArray(value) ? value.join(',') : value
}

// Replaces (or, with `undefined`, removes) a header of a
// `withPropagatedContext` carrier: a `Headers` object or a plain object (e.g.
// Node.js request headers).
function writeHeader(carrier: unknown, key: string, value: string | undefined) {
  if (!carrier || typeof carrier !== 'object') {
    return
  }
  const headers = carrier as {
    set?: (key: string, value: string) => void
    delete?: (key: string) => void
  }
  if (
    typeof headers.set === 'function' &&
    typeof headers.delete === 'function'
  ) {
    if (value === undefined) {
      headers.delete(key)
    } else {
      headers.set(key, value)
    }
    return
  }
  const record = carrier as Record<string, unknown>
  if (value === undefined) {
    delete record[key]
  } else {
    record[key] = value
  }
}

class NextTracerImpl implements NextTracer {
  /**
   * Returns an instance to the trace with configured name.
   * Since wrap / trace can be defined in any place prior to actual trace subscriber initialization,
   * This should be lazily evaluated.
   */
  private getTracerInstance(): Tracer {
    return trace.getTracer('next.js', process.env.__NEXT_VERSION)
  }

  public isOpenTelemetryEnabled(): boolean {
    const activeSpan = trace.getSpan(context.active())
    if (activeSpan?.isRecording()) {
      return true
    }

    const tracerProvider = trace.getTracerProvider() as {
      getDelegate?: () => { constructor?: { name?: string } } | undefined
    }

    if (!('getDelegate' in tracerProvider)) {
      return true
    }

    return (
      tracerProvider.getDelegate?.()?.constructor?.name !== 'NoopTracerProvider'
    )
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

  public getTraceContextHeaders(): TraceContextHeaders | undefined {
    const activeContext = context.active()
    if (
      !trace.getSpanContext(activeContext) ||
      !this.isOpenTelemetryEnabled()
    ) {
      return undefined
    }

    const carrier: Record<string, string> = {}
    propagation.inject(activeContext, carrier)

    const { traceparent, tracestate } = carrier
    if (!traceparent) {
      return undefined
    }
    return { traceparent, tracestate }
  }

  public hasActiveSpanContext(): boolean {
    const spanContext = trace.getSpanContext(context.active())
    return Boolean(spanContext && trace.isSpanContextValid(spanContext))
  }

  public getActiveScopeSpan(): Span | undefined {
    const localSpanRecorder = getLocalSpanRecorder()
    const activeLocalSpan = localSpanRecorder?.getActiveLocalSpan()
    if (
      activeLocalSpan &&
      localSpanRecorder?.isOpenTelemetryIsolatedSpan(activeLocalSpan)
    ) {
      return activeLocalSpan
    }

    const activeSpan = trace.getSpan(context.active())
    if (activeSpan || !process.env.__NEXT_DEV_SERVER) {
      return activeSpan
    }
    return activeLocalSpan
  }

  /**
   * Runs `fn` in the trace context propagated by `carrier` (the request
   * headers), unless a span is already active (or with `force`, always).
   *
   * When the carrier has a deferred request span (a `next-deferred`
   * `tracestate` entry, see `deferred-request-span.ts`), the entry is removed
   * from the carrier and the context, so nothing downstream carries it. Render
   * entries emit the span once `fn` has settled, so it covers the render (see
   * `PropagatedContextOptions`), if it is valid and bound to the propagated
   * context `fn` runs in, and wasn't taken by an outer entry already.
   */
  public withPropagatedContext<T, C>(
    carrier: C,
    fn: () => T,
    getter?: TextMapGetter<C>,
    force = false,
    options: PropagatedContextOptions = {}
  ): T {
    const activeContext = context.active()

    if (
      !NEXT_OTEL_PERFORMANCE_PREFIX &&
      !this.isOpenTelemetryEnabled() &&
      !trace.getSpanContext(activeContext)
    ) {
      return fn()
    }

    if (force) {
      const remoteContext = propagation.extract(ROOT_CONTEXT, carrier, getter)

      if (trace.getSpanContext(remoteContext)) {
        return this.runWithRemoteContext(
          carrier,
          getter,
          remoteContext,
          fn,
          options
        )
      }

      // Preserve the current active span while still merging any extracted
      // baggage/context values from the carrier.
      const mergedContext = withoutDeferredRequestSpan(
        propagation.extract(activeContext, carrier, getter)
      )
      this.takeDeferredRequestSpan(carrier, getter, undefined, options)
      return context.with(mergedContext, fn)
    }

    if (trace.getSpanContext(activeContext)) {
      // Active span is already set, too late to propagate.
      this.takeDeferredRequestSpan(carrier, getter, undefined, options)
      const cleanContext = withoutDeferredRequestSpan(activeContext)
      return cleanContext === activeContext
        ? fn()
        : context.with(cleanContext, fn)
    }

    const remoteContext = propagation.extract(activeContext, carrier, getter)
    return this.runWithRemoteContext(
      carrier,
      getter,
      remoteContext,
      fn,
      options
    )
  }

  // Removes a deferred request span from `carrier`, and returns it when it is
  // to be emitted: valid, bound to `spanContext` (the propagated context the
  // render runs in), and not taken already in the current request handling
  // (see `TAKEN_DEFERRED_SPANS_KEY`). Never throws.
  private takeDeferredRequestSpan<C>(
    carrier: C,
    getter: TextMapGetter<C> | undefined,
    spanContext: SpanContext | undefined,
    { deferredRequestSpan = 'emit' }: PropagatedContextOptions
  ): (DeferredRequestSpan & { traceId: string }) | undefined {
    try {
      const tracestate = readHeader(carrier, getter, 'tracestate')
      if (!tracestate?.includes(`${DEFERRED_REQUEST_SPAN_KEY}=`)) {
        return undefined
      }
      // Remove the entry (valid or not): nothing downstream (e.g. a nested
      // entry extracting the same headers, or an outgoing request) carries it.
      writeHeader(
        carrier,
        'tracestate',
        removeTraceStateEntry(tracestate, DEFERRED_REQUEST_SPAN_KEY)
      )
      if (deferredRequestSpan !== 'emit' || !spanContext) {
        return undefined
      }
      const deferred = parseDeferredRequestSpan(
        tracestate,
        readHeader(carrier, getter, 'traceparent'),
        Date.now()
      )
      if (
        !deferred ||
        deferred.traceId !== spanContext.traceId ||
        deferred.spanId !== spanContext.spanId ||
        (spanContext.traceFlags & 1) !== 1 ||
        getTakenDeferredSpans(context.active()).has(
          `${deferred.traceId}-${deferred.spanId}`
        )
      ) {
        return undefined
      }
      return deferred
    } catch {
      // Tracing must never affect the request.
      return undefined
    }
  }

  // Runs `fn` in `remoteContext` (extracted from `carrier`), handling a
  // deferred request span (see `withPropagatedContext`).
  private runWithRemoteContext<T, C>(
    carrier: C,
    getter: TextMapGetter<C> | undefined,
    remoteContext: Context,
    fn: () => T,
    options: PropagatedContextOptions
  ): T {
    const spanContext = trace.getSpanContext(remoteContext)
    const deferred = this.takeDeferredRequestSpan(
      carrier,
      getter,
      spanContext,
      options
    )
    try {
      remoteContext = withoutDeferredRequestSpan(remoteContext)
      // Nested entries see the deferred spans taken by outer ones (also in
      // force mode, which extracts from the root context).
      const taken = getTakenDeferredSpans(context.active())
      if (deferred) {
        remoteContext = remoteContext.setValue(
          TAKEN_DEFERRED_SPANS_KEY,
          new Set([...taken, `${deferred.traceId}-${deferred.spanId}`])
        )
      } else if (taken.size > 0) {
        remoteContext = remoteContext.setValue(TAKEN_DEFERRED_SPANS_KEY, taken)
      }
    } catch {
      // Tracing must never affect the request.
    }

    if (!deferred) {
      return context.with(remoteContext, fn)
    }
    const span = {
      ...deferred,
      startTime: Math.min(
        deferred.startTime,
        options.requestStartTime ?? Infinity
      ),
    }
    const emit = (failed: boolean, error?: unknown) =>
      this.emitRequestSpan(span, { failed, error })
    let result: T
    try {
      result = context.with(remoteContext, fn)
    } catch (error) {
      emit(true, error)
      throw error
    }
    if (isThenable(result)) {
      return result.then(
        (value) => {
          emit(false)
          return value
        },
        (error) => {
          emit(true, error)
          throw error
        }
      ) as T
    }
    emit(false)
    return result
  }

  /**
   * Reserves the IDs of a request span (`Next.request`, a root span of kind
   * server) without starting it (see `reserveRootSpanIds`), to emit it later
   * here (`emit`) or in another process (see `deferred-request-span.ts`).
   * Returns `undefined` when OpenTelemetry isn't enabled, or the OpenTelemetry
   * SDK doesn't have the internals used. An unsampled span is reserved too,
   * so its children stay unsampled.
   */
  public reserveRequestSpan(
    name: string,
    { startTime, attributes }: { startTime?: number; attributes: Attributes }
  ): ReservedRequestSpan | undefined {
    if (!this.isOpenTelemetryEnabled()) {
      return undefined
    }
    const ids = reserveRootSpanIds(this.getTracerInstance(), {
      context: ROOT_CONTEXT,
      name,
      kind: SpanKind.SERVER,
      attributes: getRequestSpanAttributes(name, attributes),
    })
    if (!ids) {
      return undefined
    }
    const parentContext = trace.setSpanContext(context.active(), {
      traceId: ids.traceId,
      spanId: ids.spanId,
      traceFlags: ids.sampled ? api.TraceFlags.SAMPLED : api.TraceFlags.NONE,
      isRemote: false,
      traceState: ids.traceState as TraceState | undefined,
    })
    const span = {
      traceId: ids.traceId,
      spanId: ids.spanId,
      name,
      startTime: startTime ?? Date.now(),
      attributes,
    }
    let emitted = false
    return {
      traceId: ids.traceId,
      spanId: ids.spanId,
      sampled: ids.sampled,
      run: (fn) => context.with(parentContext, fn),
      emit: (result) => {
        if (ids.sampled && !emitted) {
          emitted = true
          this.emitRequestSpan(span, result)
        }
      },
    }
  }

  // Emits a request span (`Next.request`) with the given IDs (see
  // `startSpanWithIds`), ending now. Never throws.
  private emitRequestSpan(
    span: {
      traceId: string
      spanId: string
      name: string
      startTime: number
      attributes: Attributes
    },
    result?: { failed: boolean; error?: unknown }
  ) {
    try {
      const started = startSpanWithIds(
        this.getTracerInstance(),
        span.traceId,
        span.spanId,
        (tracer: Tracer) =>
          tracer.startSpan(
            span.name,
            {
              root: true,
              kind: SpanKind.SERVER,
              startTime: span.startTime,
              attributes: getRequestSpanAttributes(span.name, span.attributes),
            },
            ROOT_CONTEXT
          )
      )
      if (!started) {
        return
      }
      if (
        result?.failed &&
        !(isBubbledError(result.error) && result.error.bubble)
      ) {
        started.setStatus({ code: SpanStatusCode.ERROR })
      }
      started.end()
    } catch {
      // Tracing must never affect the request.
    }
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
    const tracingEnabled =
      Boolean(NEXT_OTEL_PERFORMANCE_PREFIX) || this.isOpenTelemetryEnabled()
    const localSpanRecorder = getLocalSpanRecorder()
    const localSpanRecordingEnabled =
      localSpanRecorder?.isLocalSpanRecordingEnabled() ?? false

    if (!tracingEnabled && !localSpanRecordingEnabled) {
      return typeof fnOrOptions === 'function' ? fnOrOptions() : fnOrEmpty()
    }

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

    const parentSpan = options.parentSpan ?? this.getActiveScopeSpan()
    const isolatedParentSpan =
      parentSpan && localSpanRecorder?.isOpenTelemetryIsolatedSpan(parentSpan)
        ? parentSpan
        : undefined
    const shouldDelegateSpan =
      !isolatedParentSpan &&
      (NextVanillaSpanAllowlist.has(type) ||
        process.env.NEXT_OTEL_VERBOSE === '1')
    const shouldTraceSpan =
      shouldDelegateSpan ||
      (localSpanRecorder?.isRequestInsightsEnabled() ?? false)

    if (!shouldTraceSpan || options.hideSpan) {
      return fn()
    }

    // Trying to get active scoped span to assign parent. If option specifies parent span manually, will try to use it.
    let spanContext = isolatedParentSpan
      ? context.active()
      : this.getSpanContext(parentSpan)

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
      'next.span_category': 'nextjs',
      'next.span_name': spanName,
      'next.span_type': type,
      ...options.attributes,
    }

    return context.with(spanContext.setValue(rootSpanIdKey, spanId), () =>
      this.runWithActiveSpan(
        spanName,
        options,
        spanContext,
        tracingEnabled && shouldDelegateSpan,
        localSpanRecordingEnabled,
        isolatedParentSpan,
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
              return fn(span, (err) => {
                if (err) {
                  closeSpanWithError(span, err, options.endTime)
                } else {
                  span.end(options.endTime)
                }
              })
            } catch (err: any) {
              closeSpanWithError(span, err, options.endTime)
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
                  span.end(options.endTime)
                  // Need to pass down the promise result,
                  // it could be react stream response with error { error, stream }
                  return res
                })
                .catch((err) => {
                  closeSpanWithError(span, err, options.endTime)
                  throw err
                })
                .finally(onCleanup)
            } else {
              span.end(options.endTime)
              onCleanup()
            }

            return result
          } catch (err: any) {
            closeSpanWithError(span, err, options.endTime)
            onCleanup()
            throw err
          }
        }
      )
    )
  }

  private runWithActiveSpan<T>(
    spanName: string,
    options: TracerSpanOptions,
    parentContext: Context,
    tracingEnabled: boolean,
    localSpanRecordingEnabled: boolean,
    isolatedParentSpan: Span | undefined,
    fn: (span: Span) => T
  ): T {
    if (tracingEnabled) {
      return this.getTracerInstance().startActiveSpan(
        spanName,
        options,
        (span: Span) =>
          fn(
            localSpanRecordingEnabled
              ? this.createLocalRecordingSpan(
                  spanName,
                  options,
                  parentContext,
                  span,
                  isolatedParentSpan
                )
              : span
          )
      )
    }

    const span = this.createLocalRecordingSpan(
      spanName,
      options,
      parentContext,
      undefined,
      isolatedParentSpan
    )
    const localSpanRecorder = getLocalSpanRecorder()!
    return localSpanRecorder.withLocalSpan(span, () =>
      localSpanRecorder.isOpenTelemetryIsolatedSpan(span)
        ? fn(span)
        : context.with(
            trace.setSpan(context.active(), span),
            fn,
            undefined,
            span
          )
    )
  }

  private createLocalRecordingSpan(
    name: string,
    options: TracerSpanOptions,
    parentContext: Context,
    delegateSpan?: Span,
    isolatedParentSpan?: Span
  ): Span {
    const parentSpanContext =
      isolatedParentSpan?.spanContext() ?? trace.getSpanContext(parentContext)
    const delegateSpanContext = delegateSpan?.spanContext()

    return getLocalSpanRecorder()!.createLocalSpan({
      name,
      attributes: options.attributes,
      links: options.links,
      startTime: options.startTime,
      delegateSpan,
      traceId: delegateSpanContext?.traceId ?? parentSpanContext?.traceId,
      spanId: delegateSpanContext?.spanId,
      parentSpanId: parentSpanContext?.spanId,
      isolateOpenTelemetry: isolatedParentSpan !== undefined,
    })
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
      process.env.NEXT_OTEL_VERBOSE !== '1' &&
      !process.env.__NEXT_DEV_SERVER
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
    const [type, passedOptions]: [string, TracerSpanOptions | undefined] =
      args as any
    const options: TracerSpanOptions = passedOptions
      ? {
          ...passedOptions,
          attributes: {
            'next.span_category': 'nextjs',
            ...passedOptions.attributes,
          },
        }
      : { attributes: { 'next.span_category': 'nextjs' } }

    const localSpanRecorder = getLocalSpanRecorder()
    const parentSpan = options.parentSpan ?? this.getActiveScopeSpan()
    const isolatedParentSpan =
      parentSpan && localSpanRecorder?.isOpenTelemetryIsolatedSpan(parentSpan)
        ? parentSpan
        : undefined
    const parentContext =
      (isolatedParentSpan ? undefined : this.getSpanContext(parentSpan)) ??
      context.active()
    const localSpanRecordingEnabled =
      localSpanRecorder?.isLocalSpanRecordingEnabled() ?? false

    if (!localSpanRecordingEnabled) {
      return this.getTracerInstance().startSpan(type, options, parentContext)
    }

    const delegateSpan =
      !isolatedParentSpan && this.isOpenTelemetryEnabled()
        ? this.getTracerInstance().startSpan(type, options, parentContext)
        : undefined

    return this.createLocalRecordingSpan(
      type,
      options,
      parentContext,
      delegateSpan,
      isolatedParentSpan
    )
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

    if (process.env.__NEXT_DEV_SERVER) {
      const localSpan = getLocalSpanRecorder()?.getActiveLocalSpan()
      if (localSpan) {
        localSpan.setAttribute(key, value)
      }
    }
  }

  public withSpan<T>(span: Span, fn: () => T): T {
    const recorder = getLocalSpanRecorder()
    if (recorder?.isLocalRecordingSpan(span)) {
      return recorder.withLocalSpan(span, () =>
        recorder.isOpenTelemetryIsolatedSpan(span)
          ? fn()
          : context.with(trace.setSpan(context.active(), span), fn)
      )
    }
    return context.with(trace.setSpan(context.active(), span), fn)
  }
}

const getTracer = (() => {
  const tracer = new NextTracerImpl()

  return () => tracer
})()

export { getTracer, SpanStatusCode, SpanKind }
export type { NextTracer, Span, SpanOptions, ContextAPI, TracerSpanOptions }
