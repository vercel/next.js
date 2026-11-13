import { getTimestamp, toHrTime } from '../server/lib/trace/utils'
import { reporter } from './report'
import {
  createRecordingSpan,
  type LocalRecordingSpan,
  type LocalSpanOptions,
  recordSpan as recordSpanCallback,
} from '../server/lib/trace/local-span-recorder'
import type { SpanId, TraceEvent, TraceState } from './types'
import type { Span as OpenTelemetrySpan } from '@opentelemetry/api'
export { normalizeTraceAttributes } from '../server/lib/trace/span-attributes'

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

type RecordedTraceEvent = TraceEvent & { tags: Attributes }

export enum SpanStatus {
  Started = 'started',
  Stopped = 'stopped',
}

export class Span {
  readonly recorder: LocalRecordingSpan

  constructor({
    name,
    parentId,
    parent,
    attrs,
    startTime,
    wallStartTimeMs,
  }: {
    name: string
    parentId?: SpanId
    parent?: Span
    attrs?: Attributes
    startTime?: bigint
    wallStartTimeMs?: number
  }) {
    this.recorder = createTraceSpan({
      name,
      parent: parent?.recorder ?? parentId,
      attributes: attrs,
      monotonicStartTime: startTime,
      wallStartTimeMs,
    })
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

  traceChild(name: string, attrs?: Attributes): Span {
    return new Span({ name, parent: this, attrs })
  }

  manualTraceChild(
    name: string,
    startTime?: bigint,
    stopTime?: bigint,
    attrs?: Attributes
  ): void {
    const correction =
      process.hrtime.bigint() - BigInt(Date.now()) * NUM_OF_MILLISEC_IN_NANOSEC
    const span = new Span({
      name,
      parent: this,
      attrs,
      startTime: startTime === undefined ? undefined : startTime + correction,
      wallStartTimeMs:
        startTime === undefined
          ? undefined
          : Number(startTime / NUM_OF_MILLISEC_IN_NANOSEC),
    })
    span.stop(stopTime === undefined ? undefined : stopTime + correction)
  }

  getId(): SpanId {
    return getTraceSpanSource(this.recorder)!.id
  }

  setAttribute(key: string, value: unknown): this {
    const attributes =
      getTraceSpanSource(this.recorder)!.event?.tags ?? this.recorder.attributes
    attributes[key] = value
    return this
  }

  traceFn<T>(fn: (span: Span) => T): T {
    return recordSpanCallback({ span: this.recorder, synchronous: true }, () =>
      fn(this)
    )
  }

  traceAsyncFn<T>(fn: (span: Span) => T | Promise<T>): Promise<T> {
    return recordSpanCallback({ span: this.recorder }, () => fn(this))
  }
}

export const trace = (name: string, parentId?: SpanId, attrs?: Attributes) =>
  new Span({ name, parentId, attrs })

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
  event?: RecordedTraceEvent
}

const traceSources = new WeakMap<OpenTelemetrySpan, TraceSpanSource>()

export function getTraceSpanSource(
  span: OpenTelemetrySpan
): TraceSpanSource | undefined {
  return traceSources.get(span)
}

export function createTraceSpan(
  options: Omit<LocalSpanOptions, 'parent'> &
    LocalSpanTiming & {
      parent?: OpenTelemetrySpan | SpanId | null
    }
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
      parent,
      startTime: source.wallStartTimeMs,
      attributes: options.attributes,
      clock: {
        start: source.startTime + offset,
        end: (time) => getTraceSpanEndTime(time, offset),
      },
      onError: (recording, error) => {
        recording.setAttribute('failed', true)
        recording.recordException(error as Error)
        recording.setStatus({ code: 2 })
      },
    },
    (recording, end) => {
      source.event = completeTraceSpan(
        source,
        recording.name,
        recording.attributes,
        end - offset
      )
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
  attributes: Attributes,
  end: bigint
): RecordedTraceEvent {
  const duration = (end - source.startTime) / NUM_OF_MICROSEC_IN_NANOSEC
  if (duration > Number.MAX_SAFE_INTEGER) {
    throw new Error(`Duration is too long to express as float64: ${duration}`)
  }
  const event: RecordedTraceEvent = {
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
