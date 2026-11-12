import { getTimestamp, toHrTime } from '../server/lib/trace/utils'
import { reporter } from './report'
import {
  createRecordingSpan,
  type LocalRecordingSpan,
  type LocalSpanOptions,
  recordSpan as recordSpanCallback,
} from '../server/lib/trace/local-span-recorder'
import type { SpanId, TraceEvent, TraceState } from './types'
import type {
  AttributeValue,
  Span as OpenTelemetrySpan,
} from '@opentelemetry/api'

const NUM_OF_MICROSEC_IN_NANOSEC = BigInt('1000')
const NUM_OF_SEC_IN_NANOSEC = BigInt('1000000000')
const NUM_OF_MILLISEC_IN_NANOSEC = BigInt('1000000')

let count = 0
const getId = () => {
  count++
  return count
}
let defaultParentSpanId: SpanId | undefined
let shouldSaveTraceEvents: boolean | undefined
let savedTraceEvents: TraceEvent[] = []

const RECORD_SPAN_THRESHOLD_MS = parseInt(
  process.env.NEXT_TRACE_SPAN_THRESHOLD_MS ?? '-1'
)

interface Attributes {
  [key: string]: unknown
}

export enum SpanStatus {
  Started = 'started',
  Stopped = 'stopped',
}

type ReportingOptions = Pick<LocalSpanOptions, 'recordToInsights'> & {
  scope?: boolean
  parent?: LocalSpanOptions['parent'] | Span
}

export class Span {
  readonly recorder: LocalRecordingSpan

  private readonly scope: boolean
  constructor({
    name,
    parentId,
    parent,
    attrs,
    startTime,
    wallStartTimeMs,
    scope = false,
    ...reporting
  }: {
    name: string
    parentId?: SpanId
    attrs?: Attributes
    startTime?: bigint
    wallStartTimeMs?: number
  } & ReportingOptions) {
    this.recorder = createTraceSpan({
      ...reporting,
      scope,
      name,
      parent:
        parent instanceof Span
          ? parent.recorder
          : parent === undefined
            ? parentId
            : parent,
      attributes: attrs,
      monotonicStartTime: startTime,
      wallStartTimeMs,
    })
    this.scope = scope
  }

  get name(): string {
    return getTraceSpanSource(this.recorder)!.event?.name ?? this.recorder.name
  }

  stop(stopTime?: bigint): void {
    const source = getTraceSpanSource(this.recorder)!
    this.recorder.end(
      stopTime === undefined
        ? undefined
        : toHrTime(
            stopTime -
              source.startTime +
              epochMillisecondsToNanoseconds(source.wallStartTimeMs)
          )
    )
  }

  traceChild(
    name: string,
    attrs?: Attributes,
    options?: ReportingOptions
  ): Span {
    return new Span({ ...options, name, parent: this, attrs })
  }

  manualTraceChild(
    name: string,
    startTime?: bigint,
    stopTime?: bigint,
    attrs?: Attributes,
    options?: ReportingOptions
  ): void {
    recordSpan(
      { ...options, name, startTime, endTime: stopTime, attributes: attrs },
      this.recorder
    )
  }

  getId(): SpanId {
    return getTraceSpanSource(this.recorder)!.id
  }

  setAttribute(key: string, value: unknown): this {
    const attributes = normalizeTraceAttributes({ [key]: value })
    const event = getTraceSpanSource(this.recorder)?.event
    if (event) Object.assign((event.tags ??= {}), attributes)
    else this.recorder.setAttributes(attributes)
    return this
  }

  traceFn<T>(fn: (span: Span) => T): T {
    return recordSpanCallback(
      { span: this.recorder, scope: this.scope, synchronous: true },
      () => fn(this)
    )
  }

  traceAsyncFn<T>(fn: (span: Span) => T | Promise<T>): Promise<T> {
    return recordSpanCallback({ span: this.recorder, scope: this.scope }, () =>
      fn(this)
    )
  }
}

export const trace = (
  name: string,
  parentId?: SpanId,
  attrs?: Attributes,
  options?: ReportingOptions
) => new Span({ ...options, name, parentId, attrs })

export function normalizeTraceAttributes(
  attributes: Attributes | undefined
): Record<string, AttributeValue> {
  const entries: [string, AttributeValue][] = []
  for (const key of Object.keys(attributes ?? {})) {
    try {
      const value = attributes![key]
      if (value === null || value === undefined) continue
      if (isAttributeValue(value)) {
        entries.push([key, value])
      } else {
        const encoded = JSON.stringify(value)
        if (encoded !== undefined) entries.push([key, encoded])
      }
    } catch {
      // Diagnostics must not interrupt the work being measured. Cyclic values,
      // bigint payloads and throwing serializers cannot become OTel attributes.
    }
  }
  return Object.fromEntries(entries)
}

function isAttributeValue(value: unknown): value is AttributeValue {
  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'boolean') return true
  if (!Array.isArray(value)) return false
  const elementType = typeof value.find((element) => element != null)
  return value.every(
    (element) =>
      element == null ||
      ((elementType === 'string' ||
        elementType === 'number' ||
        elementType === 'boolean') &&
        typeof element === elementType)
  )
}

/** Completed observations use nanoseconds since Unix epoch. */
export function recordSpan(
  observation: {
    name: string
    startTime?: bigint
    endTime?: bigint
    attributes?: Record<string, unknown>
    recordToInsights?: boolean
  },
  parent?: OpenTelemetrySpan
): void {
  const correction =
    process.hrtime.bigint() - BigInt(Date.now()) * NUM_OF_MILLISEC_IN_NANOSEC
  const { startTime, endTime, attributes, ...options } = observation
  const span = new Span({
    ...options,
    parent,
    attrs: attributes,
    startTime: startTime === undefined ? undefined : startTime + correction,
    wallStartTimeMs:
      startTime === undefined
        ? undefined
        : Number(startTime / NUM_OF_MILLISEC_IN_NANOSEC),
  })
  span.stop(endTime === undefined ? undefined : endTime + correction)
}

export type LocalSpanTiming = {
  startTime?: import('@opentelemetry/api').SpanOptions['startTime']
  monotonicStartTime?: bigint
  wallStartTimeMs?: number
}

// Numeric file identity and legacy access after completion.
export type TraceSpanSource = {
  id: SpanId
  parentId?: SpanId
  startTime: bigint
  wallStartTimeMs: number
  event?: TraceEvent
}

const traceSources = new WeakMap<OpenTelemetrySpan, TraceSpanSource>()

export function getTraceSpanSource(
  span: OpenTelemetrySpan
): TraceSpanSource | undefined {
  return traceSources.get(span)
}

export function createTraceSpan(
  options: LocalSpanOptions & { scope?: boolean }
): LocalRecordingSpan {
  const parent = typeof options.parent === 'object' ? options.parent : undefined
  const ancestor = parent ? getTraceSpanSource(parent) : undefined
  const source = captureTraceSpanSource(
    {
      ...options,
      parent:
        typeof options.parent === 'number' || options.parent === null
          ? options.parent
          : undefined,
    },
    ancestor
  )
  const offset =
    epochMillisecondsToNanoseconds(source.wallStartTimeMs) - source.startTime

  const span = createRecordingSpan(
    {
      ...options,
      startTime: source.wallStartTimeMs,
      attributes: normalizeTraceAttributes(options.attributes),
      clock: {
        start: source.startTime + offset,
        end: (time) => getTraceSpanEndTime(time, offset),
      },
      onError: (recording, error) => {
        recording.setAttribute('failed', true)
        if (options.scope) {
          const { recordSpanError } =
            require('../server/lib/trace/tracer') as typeof import('../server/lib/trace/tracer')
          recordSpanError(recording, error as Error)
        } else {
          recording.recordException(error as Error)
          recording.setStatus({ code: 2 })
        }
      },
    },
    (records, end) => {
      for (const record of records) {
        source.event = completeTraceSpan(
          source,
          record.name,
          record.attributes ?? {},
          end! - offset
        )
      }
    }
  )
  traceSources.set(span, source)
  return span
}

export function captureTraceSpanSource(
  options: LocalSpanTiming & { parent?: SpanId | null },
  parent?: TraceSpanSource
): TraceSpanSource {
  const epochMs =
    options.startTime === undefined
      ? undefined
      : getTimestamp(options.startTime)
  const monotonicStartTime =
    options.monotonicStartTime ??
    (epochMs === undefined
      ? process.hrtime.bigint()
      : epochMillisecondsToNanoseconds(epochMs) +
        process.hrtime.bigint() -
        BigInt(Date.now()) * NUM_OF_MILLISEC_IN_NANOSEC)
  return {
    id: getId(),
    parentId:
      options.parent === null
        ? undefined
        : (options.parent ?? parent?.id ?? defaultParentSpanId),
    startTime: monotonicStartTime,
    wallStartTimeMs: options.wallStartTimeMs ?? epochMs ?? Date.now(),
  }
}

// Multiply integer milliseconds as bigint so epoch magnitudes cannot lose the
// low nanoseconds before the clock correction is applied.
function epochMillisecondsToNanoseconds(time: number): bigint {
  const whole = Math.trunc(time)
  return (
    BigInt(whole) * NUM_OF_MILLISEC_IN_NANOSEC +
    BigInt(Math.trunc((time - whole) * 1_000_000))
  )
}

function getTraceSpanEndTime(
  endTime: Parameters<OpenTelemetrySpan['end']>[0],
  offset: bigint
): bigint {
  if (Array.isArray(endTime)) {
    return BigInt(endTime[0]) * NUM_OF_SEC_IN_NANOSEC + BigInt(endTime[1])
  } else if (endTime === undefined) {
    return process.hrtime.bigint() + offset
  } else {
    return epochMillisecondsToNanoseconds(getTimestamp(endTime))
  }
}

export function completeTraceSpan(
  source: TraceSpanSource,
  name: string,
  attributes: Record<string, AttributeValue>,
  end: bigint
): TraceEvent {
  const duration = (end - source.startTime) / NUM_OF_MICROSEC_IN_NANOSEC
  if (duration > Number.MAX_SAFE_INTEGER) {
    throw new Error(`Duration is too long to express as float64: ${duration}`)
  }
  const event: TraceEvent = {
    name,
    id: source.id,
    parentId: source.parentId,
    timestamp: Number(source.startTime / NUM_OF_MICROSEC_IN_NANOSEC),
    duration: Number(duration),
    startTime: source.wallStartTimeMs,
    tags: attributes,
  }
  if (duration > RECORD_SPAN_THRESHOLD_MS * 1000) {
    reporter.report(event)
    if (shouldSaveTraceEvents) savedTraceEvents.push(event)
  }
  return event
}

export const flushAllTraces = () => reporter.flushAll()

/**
 * Flush and release the trace file handle. Intended for tests that need to
 * delete the directory holding the trace afterwards.
 */
export const closeAllTraces = () => reporter.close()

// This code supports workers by serializing the state of tracers when the
// worker is initialized, and serializing the trace events from the worker back
// to the main process to record when the worker is complete.
export const exportTraceState = (): TraceState => ({
  defaultParentSpanId,
  lastId: count,
  shouldSaveTraceEvents,
})
export const initializeTraceState = (state: TraceState) => {
  count = state.lastId
  defaultParentSpanId = state.defaultParentSpanId
  shouldSaveTraceEvents = state.shouldSaveTraceEvents
}

export function getTraceEvents(): TraceEvent[] {
  return savedTraceEvents
}

export function recordTraceEvents(events: TraceEvent[]) {
  for (const traceEvent of events) {
    traceEvent.tags = normalizeTraceAttributes(traceEvent.tags)
    reporter.report(traceEvent)
    if (traceEvent.id > count) {
      count = traceEvent.id + 1
    }
  }
  if (shouldSaveTraceEvents) {
    savedTraceEvents.push(...events)
  }
}

export const clearTraceEvents = () => {
  return (savedTraceEvents = [])
}

/**
 * Converts hrtime (process.hrtime.bigint()) to epoch-based nanoseconds.
 *
 * hrtime values are relative to an arbitrary point in the past, while
 * epoch-based times are nanoseconds since Unix epoch (Jan 1, 1970).
 *
 * This is useful when passing hrtime values to APIs that expect epoch-based times,
 * such as Span.manualTraceChild().
 */
export function hrtimeToEpochNanoseconds(hrtimeValue: bigint): bigint {
  const offset =
    BigInt(Date.now()) * NUM_OF_MILLISEC_IN_NANOSEC - process.hrtime.bigint()
  return hrtimeValue + offset
}
